"""Modal local entrypoint used by Vanta's remote execution adapter."""

from __future__ import annotations

import base64
import json
import os
import sys
import threading
from pathlib import Path

import modal


app = modal.App(os.environ.get("VANTA_SERVERLESS_APP", "vanta-remote-exec"))

SECRET_AND_BUILD_PATHS = [
    ".git",
    ".git/**",
    "**/.git",
    "**/.git/**",
    ".vanta",
    ".vanta/**",
    "**/.vanta",
    "**/.vanta/**",
    "node_modules",
    "node_modules/**",
    "**/node_modules",
    "**/node_modules/**",
    "target",
    "target/**",
    "**/target",
    "**/target/**",
    "build",
    "build/**",
    "**/build",
    "**/build/**",
    "dist",
    "dist/**",
    "**/dist",
    "**/dist/**",
    ".next",
    ".next/**",
    "**/.next",
    "**/.next/**",
    ".docusaurus",
    ".docusaurus/**",
    "**/.docusaurus",
    "**/.docusaurus/**",
    ".cache",
    ".cache/**",
    "**/.cache",
    "**/.cache/**",
    "coverage",
    "coverage/**",
    "**/coverage",
    "**/coverage/**",
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    ".npmrc",
    "**/.npmrc",
    ".pypirc",
    "**/.pypirc",
    ".netrc",
    "**/.netrc",
    ".ssh",
    ".ssh/**",
    ".aws",
    ".aws/**",
    "**/*.pem",
    "**/*.key",
    "**/__pycache__/**",
]


def _copy_stream(source, target) -> None:
    for chunk in source:
        target.write(chunk)
        target.flush()


def _ignore_patterns(workspace: Path) -> list[str]:
    patterns: list[str] = []
    for name in (".gitignore", ".dockerignore"):
        path = workspace / name
        if path.is_file():
            patterns.extend(
                line.strip()
                for line in path.read_text(encoding="utf-8").splitlines()
                if line.strip()
                and not line.lstrip().startswith("#")
                and not line.lstrip().startswith("!")
            )
    # Hard exclusions come last and stay recursive across nested project roots.
    # Negations are intentionally dropped above: any negation disables Modal's
    # directory pruning, forcing a walk through excluded multi-GB trees. Hard
    # secret patterns already override .gitignore re-inclusions such as !.env.example.
    return list(dict.fromkeys([*patterns, *SECRET_AND_BUILD_PATHS]))


@app.local_entrypoint()
def main(payload: str) -> None:
    padding = "=" * (-len(payload) % 4)
    config = json.loads(base64.urlsafe_b64decode(payload + padding))
    root = config.get("root")
    command = config.get("command")
    idle_timeout_sec = config.get("idleTimeoutSec")
    image = config.get("image")
    network = config.get("network")
    if not isinstance(root, str) or not isinstance(command, list):
        raise SystemExit("Vanta Modal payload requires root and command")
    if not command or not all(isinstance(token, str) for token in command):
        raise SystemExit("Vanta Modal command must be a non-empty string array")
    if not isinstance(idle_timeout_sec, int) or idle_timeout_sec <= 0:
        raise SystemExit("Vanta Modal idle timeout must be a positive integer")
    if not isinstance(image, str) or not image:
        raise SystemExit("Vanta Modal image must be a non-empty string")
    if not isinstance(network, bool):
        raise SystemExit("Vanta Modal network policy must be boolean")

    workspace = Path(root).expanduser().resolve()
    if not workspace.is_dir():
        raise SystemExit(f"Vanta Modal workspace does not exist: {workspace}")
    if workspace == Path.home().resolve() or workspace == Path(workspace.anchor):
        raise SystemExit("Vanta Modal refuses to upload the home or filesystem root; run inside a project directory")
    sandbox_image = modal.Image.from_registry(image).add_local_dir(
        workspace,
        remote_path="/workspace",
        copy=True,
        ignore=_ignore_patterns(workspace),
    )
    sandbox = modal.Sandbox.create(
        app=app,
        image=sandbox_image,
        workdir="/workspace",
        timeout=idle_timeout_sec,
        idle_timeout=idle_timeout_sec,
        block_network=not network,
    )
    try:
        process = sandbox.exec(*command, timeout=idle_timeout_sec, workdir="/workspace")
        pumps = [
            threading.Thread(target=_copy_stream, args=(process.stdout, sys.stdout), daemon=True),
            threading.Thread(target=_copy_stream, args=(process.stderr, sys.stderr), daemon=True),
        ]
        for pump in pumps:
            pump.start()
        return_code = process.wait()
        for pump in pumps:
            pump.join()
    finally:
        sandbox.terminate(wait=True)

    if return_code != 0:
        raise SystemExit(return_code)
