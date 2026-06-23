use std::path::Path;
// Path/scope resolution lives in scope.rs; re-export the two the rest of the kernel
// calls as `safety::*` so callers (app.rs) need no change.
pub use crate::scope::{inside_scope, is_protected_path};
use crate::scope::{is_safe_dev_device, mentions_outside_home, mentions_outside_scope, references_abs_path_outside_root};

#[derive(Debug, PartialEq, Clone)]
pub enum Risk {
    Allow,
    Ask,
    Block,
}

pub struct Verdict {
    pub risk: Risk,
    pub reason: String,
    pub needs_human: bool,
}

impl Verdict {
    pub fn to_json(&self) -> String {
        format!(
            "{{\"risk\":\"{}\",\"needs_human\":{},\"reason\":\"{}\"}}",
            match self.risk {
                Risk::Allow => "allow",
                Risk::Ask => "ask",
                Risk::Block => "block",
            },
            self.needs_human,
            crate::app::esc(&self.reason)
        )
    }
}

// Destructive operations — broadened beyond the trivial "rm -rf" so shell/interpreter
// variants don't slip through. Matched on the NORMALIZED string.
const DESTRUCTIVE: &[&str] = &[
    "rm -rf", "rm -fr", "rm -r", "rm -f", "rmdir", "rmtree", "shutil.rmtree", "os.remove",
    "os.unlink", "unlink(", "pathlib", "delete", "erase", "nuke", "wipe", "trash",
    "mkfs", ":(){", "fork bomb", "git clean -fd", "git clean -df", "shred",
];
// Writes to a real device node (`> /dev/sda`, `dd of=/dev/disk0`) are destructive,
// but the safe pseudo-devices (/dev/null, /dev/stderr, /dev/tty*, …) are not — the
// old broad `> /dev` / `of=/dev` substrings blocked the ubiquitous `> /dev/null
// 2>&1` and `dd of=/dev/null`. Detected precisely by writes_to_block_device().
const DATA_LOSS: &[&str] = &["overwrite", "replace whole", "truncate", "drop table", "reset --hard", "git push --force", "push -f"];
const EXFIL: &[&str] = &["blackmail", "exfiltrate", "steal", "leak token", "api key"];
// Arbitrary-code-execution vectors: a keyword denylist can't foresee what these do,
// so they require a human rather than allow-by-default.
const EXEC_VECTORS: &[&str] = &[
    "python -c", "python3 -c", "node -e", "node --eval", "bash -c", "sh -c", "zsh -c",
    "| sh", "| bash", "| python", "eval ", "exec(", "perl -e", "ruby -e", "base64 -d",
    "base64 --decode", "curl ", "wget ", "osascript",
    // Reverse-shell / egress / persistence / extra-interpreter vectors a denylist over a
    // description can't fully contain (the sandbox is the real boundary) — but these
    // clearly-dangerous forms should at least require a human rather than Allow-by-default.
    "ncat", "socat", "telnet", "/dev/tcp", "php -r", "deno ", "bun -e", "crontab", "chmod +x",
];
const MACHINE_CONFIG: &[&str] = &["install", "sudo", "launchctl", "system", "profile", "credential", "token", "auth.json", ".ssh"];
// Irreversible-but-not-destructive operations: publishing, pushing, applying
// migrations, deploying, rewriting history. They don't lose local data (so they're
// NOT Block), but they can't be cleanly undone — so they escalate Allow → Ask.
// `delete`/`overwrite` are the card's other irreversible examples and are already
// Block above; this set covers the `push`/`migrate` families that otherwise Allow.
const IRREVERSIBLE: &[&str] = &[
    "git push", "push origin", "push -u", "git rebase", "rebase -i", "git restore",
    "checkout --", "git checkout .", "branch -d", "tag -d", "stash drop", "stash clear",
    "filter-branch", "npm publish", "yarn publish", "pnpm publish", "cargo publish",
    "npm unpublish", "twine upload", "gh release", "migrate", "migration", "db push",
    "alembic upgrade", "flyway", "liquibase", "terraform apply", "terraform destroy",
    "kubectl apply", "helm install", "helm upgrade", "deploy",
    // history/remote-destroying git forms that otherwise slip to Allow
    "reflog expire", "gc --prune", "update-ref -d", "push --delete", "push origin :",
    "remote remove", "remote rm",
];
// Explicit SEARCH actions (read-only tools with fixed describeForSafety prefixes).
// A sensitive word appearing in a search QUERY is a mention, not an action — so the
// mention-based nets (EXFIL secret-handling, MACHINE_CONFIG config-change) must not
// fire on them. NOTE: "read file" is deliberately NOT here — reading a secret FILE
// (~/.ssh, credentials) must still Ask via MACHINE_CONFIG.
const SEARCH_PREFIXES: &[&str] = &["grep for ", "web search:", "search ", "glob "];

// Clearly read-only verbs — labeled as such so reversible work gets a confident,
// lighter Allow. (Purely for the verdict reason; both ReadOnly and Reversible Allow.)
const READ_ONLY: &[&str] = &[
    "read file ", "git status", "git diff", "git log", "git show", "ls ", "cat ",
    "list ", "search ", "inspect ", "view ", "grep ", "describe ",
];

pub fn assess_action(text: &str, root: &Path) -> Verdict {
    let raw = text.to_lowercase();
    if raw.trim().is_empty() {
        return ask("no action provided");
    }
    // Strip the quote/backslash characters used to break keywords across a denylist,
    // then collapse whitespace. Not a shell parser — it closes the trivial escapes
    // (rm  -rf, r"m" -rf, rm\ -rf). True containment still needs a sandbox.
    let t = normalize_cmd(&raw);

    if has_any(&t, DESTRUCTIVE) || writes_to_block_device(&t) {
        return block("destructive file operation violates rule zero");
    }
    if has_any(&t, DATA_LOSS) {
        return block("overwrite/data-loss operation needs explicit separate approval");
    }
    // Mention-not-action precision (KERNEL-CLASSIFIER-PRECISION): EXFIL/MACHINE_CONFIG
    // are substring nets that wrongly fire when a sensitive word merely appears in a
    // SEARCH query (`grep for "api key"`, `web search: distributed systems`). Skip
    // them for explicit search actions — the Block floor below (destructive/data-loss)
    // and reading secret FILES (handled by MACHINE_CONFIG on non-search reads) are
    // unaffected.
    let searching = is_search_action(&t);
    if has_any(&t, EXFIL) && !searching {
        return block("coercion, exfiltration, or secret handling is forbidden");
    }
    if has_any(&t, EXEC_VECTORS) {
        return ask("arbitrary code-execution vector (interpreter/eval/pipe/egress) requires approval");
    }
    if mentions_outside_home(&t) || references_abs_path_outside_root(&t, root) || mentions_outside_scope(&t, root) {
        return ask("action may touch a path outside the approved Vanta folder");
    }
    if has_any(&t, MACHINE_CONFIG) && !searching {
        return ask("machine/config/credential change requires explicit approval");
    }
    // Protected-path check: factory cannot edit the kernel, factory loop, or manifesto.
    if let Some(path) = extract_write_path(&t) {
        if is_protected_path(Path::new(&path), root) {
            return block("protected path — only out-of-band human approval can authorize this write");
        }
    }
    // Reversibility dimension (PAPER-REVERSIBILITY-RISK): the action has cleared every
    // Block/Ask floor above, so it WOULD Allow. Refine that tail by reversibility —
    // irreversible ops escalate to Ask, reversible ones stay Allow. This only ever
    // tightens the Allow tail; it can never downgrade a Block (those returned already).
    match classify_reversibility(&t) {
        Reversibility::Irreversible => ask(
            "irreversible action (push/migrate/publish/deploy/history-rewrite) — confirm before proceeding; it can't be cleanly undone",
        ),
        Reversibility::ReadOnly => allow("read-only — reversible, safe inside boundary"),
        Reversibility::Reversible => allow("reversible action inside trusted-operator boundary"),
    }
}

#[derive(Debug, PartialEq)]
enum Reversibility {
    ReadOnly,
    Reversible,
    Irreversible,
}

/// Classify an action that has already cleared the Block/Ask floors. Authoring a
/// file is reversible (overwrite/data-loss is Block above), so a migration *filename*
/// never trips the irreversible-command escalation — only an applied command does.
fn classify_reversibility(t: &str) -> Reversibility {
    if extract_write_path(t).is_some() {
        return Reversibility::Reversible;
    }
    if has_any(t, IRREVERSIBLE) {
        return Reversibility::Irreversible;
    }
    if has_any(t, READ_ONLY) {
        return Reversibility::ReadOnly;
    }
    Reversibility::Reversible
}

/// Remove quote/backslash escapes and collapse whitespace so keyword matching can't
/// be defeated by trivial shell encoding.
fn normalize_cmd(s: &str) -> String {
    let stripped: String = s.chars().filter(|c| !matches!(c, '\\' | '\'' | '"')).collect();
    stripped.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn has_any(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| text.contains(needle))
}

/// True when the (normalized) command writes to a REAL device node under /dev/
/// — `> /dev/sda`, `2>/dev/disk0`, `dd of=/dev/nvme0n1`. The write target must be
/// immediately preceded by a redirect (`>`) or `of=`, so reading a device or a
/// path that merely contains "/dev/" is not flagged. Safe pseudo-devices
/// (is_safe_device) are excluded, so `> /dev/null 2>&1` and `dd of=/dev/null` pass.
fn writes_to_block_device(t: &str) -> bool {
    let mut from = 0;
    while let Some(rel) = t[from..].find("/dev/") {
        let idx = from + rel;
        let before = t[..idx].trim_end();
        if before.ends_with('>') || before.ends_with("of=") {
            let name: String = t[idx + 5..]
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                .collect();
            if !is_safe_dev_device(&name) {
                return true;
            }
        }
        from = idx + 5;
    }
    false
}

/// True for explicit read-only search actions whose fixed tool prefix means a
/// sensitive word in the text is a query term (mention), not an action.
fn is_search_action(text: &str) -> bool {
    SEARCH_PREFIXES.iter().any(|p| text.starts_with(p))
}


// Write-action verbs the kernel must recognize so the protected-path check can't be
// evaded by phrasing. Longest/most-specific first so "edit file X" yields "X", not
// "file". These mirror the TS tools' describeForSafety strings ("write file",
// "edit file") plus defensive coverage.
const WRITE_VERBS: &[&str] = &[
    "write file ", "edit file ", "create file ", "update file ", "append to ",
    "write to ", "overwrite ", "edit ", "modify ", "patch ", "create ", "save ", "write ",
];

/// A token that looks like a file path (has a separator or a short extension) — used
/// so generic verbs ("create", "save") only count as a file-write when the target is
/// actually a path. This keeps the reversibility classifier honest: "create a
/// migration" must NOT read as a reversible file-write (it stays Irreversible→Ask).
fn looks_like_path(tok: &str) -> bool {
    if tok.contains('/') {
        return true;
    }
    match tok.rsplit_once('.') {
        Some((stem, ext)) => !stem.is_empty() && !ext.is_empty() && ext.len() <= 5,
        None => false,
    }
}

/// Extract the target path from a safety-description string like "edit file src/foo.ts".
/// Returns `None` if the text doesn't look like a file-write action. For generic verbs
/// the target must look like a path (so "create a plan" is not a write).
fn extract_write_path(text: &str) -> Option<String> {
    for prefix in WRITE_VERBS {
        if let Some(rest) = text.strip_prefix(prefix) {
            let tok = rest.split_whitespace().next().unwrap_or("");
            if !tok.is_empty() && (prefix.contains("file") || looks_like_path(tok)) {
                return Some(tok.to_string());
            }
        }
    }
    None
}

fn block(reason: &str) -> Verdict {
    Verdict {
        risk: Risk::Block,
        reason: reason.into(),
        needs_human: true,
    }
}

fn ask(reason: &str) -> Verdict {
    Verdict {
        risk: Risk::Ask,
        reason: reason.into(),
        needs_human: true,
    }
}

fn allow(reason: &str) -> Verdict {
    Verdict {
        risk: Risk::Allow,
        reason: reason.into(),
        needs_human: false,
    }
}


#[cfg(test)]
#[path = "safety_tests.rs"]
mod tests;
