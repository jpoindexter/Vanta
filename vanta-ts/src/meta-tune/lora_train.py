#!/usr/bin/env python3
"""VANTA PERSONAL-MODEL-TUNE — real local LoRA fine-tune from preference data.

Reads a JSONL dataset of {prompt, chosen, rejected} rows (exported by
meta-tune/lora-train.ts from ~/.vanta/preferences.jsonl), trains a LoRA adapter
on the PREFERRED (prompt + chosen) completions so the model learns the operator's
preferred style, and saves the adapter. Runs on MPS (Apple Silicon) / CUDA / CPU.

`--base-model tiny-test` builds a tiny from-config GPT-2 (no network download) so
the full pipeline is provable in CI without a multi-GB model; a real run passes a
Hugging Face model id (the operator's choice + a one-time download).

Errors-as-values: prints a single JSON line; exits non-zero only on a hard crash.
"""
import argparse
import json
import os
import sys


def _load_texts(dataset_path):
    rows = [json.loads(line) for line in open(dataset_path, encoding="utf-8") if line.strip()]
    return [
        (str(r.get("prompt", "")) + "\n" + str(r.get("chosen", ""))).strip()
        for r in rows
        if r.get("chosen")
    ]


def _tiny_model(dev):
    import torch
    from transformers import GPT2Config, GPT2LMHeadModel

    cfg = GPT2Config(n_layer=2, n_head=2, n_embd=64, vocab_size=256, n_positions=128)
    model = GPT2LMHeadModel(cfg).to(dev)

    def encode(text):
        ids = list(text.encode("utf-8")[:128]) or [0]
        return torch.tensor([ids]).to(dev)

    return model, ["c_attn"], encode


def _real_model(name, dev):
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(name)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(name).to(dev)

    def encode(text):
        return tok(text, return_tensors="pt", truncation=True, max_length=256).input_ids.to(dev)

    return model, ["q_proj", "v_proj"], encode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--base-model", default="tiny-test")
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--lora-r", type=int, default=8)
    a = ap.parse_args()

    import torch
    from peft import LoraConfig, get_peft_model

    dev = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    texts = _load_texts(a.dataset)
    if not texts:
        print(json.dumps({"ok": False, "error": "no usable chosen examples in dataset"}))
        return

    if a.base_model == "tiny-test":
        model, target, encode = _tiny_model(dev)
    else:
        model, target, encode = _real_model(a.base_model, dev)

    lora = LoraConfig(r=a.lora_r, lora_alpha=a.lora_r * 2, target_modules=target, task_type="CAUSAL_LM")
    model = get_peft_model(model, lora)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)

    batches = [encode(t) for t in texts]
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-3)
    model.train()
    losses = []
    for step in range(max(1, a.steps)):
        b = batches[step % len(batches)]
        out = model(input_ids=b, labels=b)
        out.loss.backward()
        opt.step()
        opt.zero_grad()
        losses.append(float(out.loss))

    os.makedirs(a.output, exist_ok=True)
    model.save_pretrained(a.output)
    saved = any(
        os.path.exists(os.path.join(a.output, f))
        for f in ("adapter_model.safetensors", "adapter_model.bin")
    )
    print(json.dumps({
        "ok": True,
        "device": dev,
        "examples": len(texts),
        "trainable_lora_params": trainable,
        "loss_first": round(losses[0], 3),
        "loss_last": round(losses[-1], 3),
        "loss_decreased": losses[-1] <= losses[0],
        "adapter_saved": saved,
        "adapter_dir": a.output,
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # errors-as-values to the TS caller
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
