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

pub fn assess_action(text: &str, root: &Path) -> Verdict {
    let t = text.to_lowercase();
    if t.trim().is_empty() {
        return ask("no action provided");
    }
    if has_any(&t, &["rm -rf", "delete", "erase", "nuke", "wipe", "trash"]) {
        return block("destructive file operation violates rule zero");
    }
    if has_any(
        &t,
        &[
            "overwrite",
            "replace whole",
            "truncate",
            "drop table",
            "reset --hard",
        ],
    ) {
        return block("overwrite/data-loss operation needs explicit separate approval");
    }
    if has_any(
        &t,
        &["blackmail", "exfiltrate", "steal", "leak token", "api key"],
    ) {
        return block("coercion, exfiltration, or secret handling is forbidden");
    }
    if mentions_outside_home(&t) || mentions_outside_scope(&t, root) {
        return ask("action may touch outside the approved Nexarion Agent folder");
    }
    if has_any(
        &t,
        &[
            "install",
            "sudo",
            "launchctl",
            "system",
            "profile",
            "credential",
            "token",
        ],
    ) {
        return ask("machine/config/credential change requires explicit approval");
    }
    Verdict {
        risk: Risk::Allow,
        reason: "safe inside trusted-operator MVP boundary".into(),
        needs_human: false,
    }
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
        PathBuf::from("/Users/jasonpoindexter/Documents/GitHub/Argo")
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
        let v = assess_action("add local action assessor inside Argo", &root());
        assert_eq!(v.risk, Risk::Allow);
    }
}
