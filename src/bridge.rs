use crate::{app, safety};
use std::{path::Path, process::Command};

#[derive(Debug, Clone)]
pub struct BridgeStatus {
    pub available: bool,
    pub version: String,
    pub note: String,
}

pub struct PromptPlan {
    pub allowed: bool,
    pub reason: String,
    pub command: Vec<String>,
}

impl BridgeStatus {
    pub fn to_json(&self) -> String {
        format!(
            "{{\"available\":{},\"version\":\"{}\",\"note\":\"{}\"}}",
            self.available,
            app::esc(&scrub(&self.version)),
            app::esc(&scrub(&self.note))
        )
    }
}

impl PromptPlan {
    pub fn to_json(&self) -> String {
        let command = self
            .command
            .iter()
            .map(|part| format!("\"{}\"", app::esc(part)))
            .collect::<Vec<_>>()
            .join(",");
        format!(
            "{{\"allowed\":{},\"reason\":\"{}\",\"command\":[{}]}}",
            self.allowed,
            app::esc(&self.reason),
            command
        )
    }
}

pub fn detect_agent_bridge() -> BridgeStatus {
    // Legacy bridge: probes the external CLI binary by name.
    match Command::new("hermes").arg("--version").output() {
        Ok(out) if out.status.success() => BridgeStatus {
            available: true,
            version: String::from_utf8_lossy(&out.stdout).trim().to_string(),
            note: "external agent bridge is available".into(),
        },
        Ok(out) => BridgeStatus {
            available: false,
            version: String::new(),
            note: String::from_utf8_lossy(&out.stderr).trim().to_string(),
        },
        Err(err) => BridgeStatus {
            available: false,
            version: String::new(),
            note: err.to_string(),
        },
    }
}

pub fn plan_prompt(root: &Path, prompt: &str) -> PromptPlan {
    let verdict = safety::assess_action(prompt, root);
    if verdict.needs_human || !matches!(verdict.risk, safety::Risk::Allow) {
        return PromptPlan {
            allowed: false,
            reason: verdict.reason,
            command: vec![],
        };
    }
    PromptPlan {
        allowed: true,
        reason: "safe to route through external agent bridge".into(),
        // Legacy bridge command — "hermes" is the external binary name; do not rename.
        command: vec!["hermes".into(), "chat".into(), "-q".into(), prompt.into()],
    }
}

fn scrub(value: &str) -> String {
    value
        .split_whitespace()
        .filter(|part| {
            let p = part.to_lowercase();
            !(p.contains("token=") || p.contains("key=") || p.contains("secret="))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn root() -> PathBuf {
        PathBuf::from("/Users/jasonpoindexter/Documents/GitHub/Vanta")
    }

    #[test]
    fn blocks_destructive_prompts_before_bridge() {
        let plan = plan_prompt(&root(), "delete ~/Documents");
        assert!(!plan.allowed);
        assert!(plan.command.is_empty());
        assert!(plan.reason.contains("destructive"));
    }

    #[test]
    fn builds_safe_agent_bridge_command() {
        let plan = plan_prompt(&root(), "summarize the project README");
        assert!(plan.allowed);
        // Legacy: command[0] is the external binary name; kept as a contract test.
        assert_eq!(plan.command[0], "hermes");
        assert!(plan.command.contains(&"chat".to_string()));
        assert!(plan.command.contains(&"-q".to_string()));
    }

    #[test]
    fn status_json_does_not_leak_secrets() {
        let s = BridgeStatus {
            available: true,
            version: "agent v0.15.1 TOKEN=secret".into(),
            note: "ok".into(),
        };
        let json = s.to_json();
        assert!(!json.contains("TOKEN=secret"));
        assert!(json.contains("agent v0.15.1"));
    }
}
