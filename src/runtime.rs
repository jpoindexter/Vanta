use crate::{app, safety};
use std::path::Path;

#[derive(Debug, PartialEq, Clone)]
pub enum RuntimeDecision {
    Executed,
    NeedsApproval,
    Blocked,
    Unsupported,
}

pub struct RuntimeResult {
    pub decision: RuntimeDecision,
    pub executed: bool,
    pub tool: String,
    pub output: String,
    pub fallback_used: bool,
}

impl RuntimeResult {
    pub fn to_json(&self) -> String {
        format!(
            "{{\"decision\":\"{}\",\"executed\":{},\"tool\":\"{}\",\"output\":\"{}\",\"fallback_used\":{}}}",
            decision_name(&self.decision),
            self.executed,
            app::esc(&self.tool),
            app::esc(&self.output),
            self.fallback_used
        )
    }
}

pub fn run_native(root: &Path, instruction: &str) -> RuntimeResult {
    let verdict = safety::assess_action(instruction, root);
    match verdict.risk {
        safety::Risk::Block => RuntimeResult {
            decision: RuntimeDecision::Blocked,
            executed: false,
            tool: "none".into(),
            output: verdict.reason,
            fallback_used: false,
        },
        safety::Risk::Ask => RuntimeResult {
            decision: RuntimeDecision::NeedsApproval,
            executed: false,
            tool: "native.approval_gate".into(),
            output: format!("approval required: {}", verdict.reason),
            fallback_used: false,
        },
        safety::Risk::Allow => run_allowed_native(root, instruction),
    }
}

fn run_allowed_native(root: &Path, instruction: &str) -> RuntimeResult {
    let normalized = instruction.trim().to_lowercase();
    if normalized == "status" || normalized == "runtime status" {
        return executed(
            "native.status",
            &format!(
                "Vanta native runtime ready; root={}; no external fallback used",
                root.display()
            ),
        );
    }
    if normalized.contains("list goals") || normalized == "goals" {
        return executed("native.goals", "use `goals list` for project-local goals");
    }
    if normalized.contains("list approvals") || normalized == "approvals" {
        return executed(
            "native.approvals",
            "use `approvals list` for project-local approvals",
        );
    }
    RuntimeResult {
        decision: RuntimeDecision::Unsupported,
        executed: false,
        tool: "none".into(),
        output:
            "no native tool can satisfy this request yet; no external fallback used"
                .into(),
        fallback_used: false,
    }
}

fn executed(tool: &str, output: &str) -> RuntimeResult {
    RuntimeResult {
        decision: RuntimeDecision::Executed,
        executed: true,
        tool: tool.into(),
        output: output.into(),
        fallback_used: false,
    }
}

fn decision_name(decision: &RuntimeDecision) -> &'static str {
    match decision {
        RuntimeDecision::Executed => "executed",
        RuntimeDecision::NeedsApproval => "needs_approval",
        RuntimeDecision::Blocked => "blocked",
        RuntimeDecision::Unsupported => "unsupported",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn root() -> PathBuf {
        PathBuf::from("/repo/projects/vanta")
    }

    #[test]
    fn blocks_destructive_runtime_requests_without_tool_execution() {
        let result = run_native(&root(), "delete ~/Documents");
        assert_eq!(result.decision, RuntimeDecision::Blocked);
        assert!(!result.executed);
        assert!(result.output.contains("destructive"));
    }

    #[test]
    fn routes_install_requests_to_approval_without_execution() {
        let result = run_native(&root(), "install launch agent");
        assert_eq!(result.decision, RuntimeDecision::NeedsApproval);
        assert!(!result.executed);
        assert!(result.output.contains("approval"));
    }

    #[test]
    fn executes_native_status_directly() {
        let result = run_native(&root(), "status");
        assert_eq!(result.decision, RuntimeDecision::Executed);
        assert!(result.executed);
        assert_eq!(result.tool, "native.status");
        assert!(result.output.contains("Vanta native runtime ready"));
    }

    #[test]
    fn rejects_unknown_safe_requests_with_unsupported() {
        let result = run_native(&root(), "write a poem about agents");
        assert_eq!(result.decision, RuntimeDecision::Unsupported);
        assert!(!result.executed);
        assert!(result.output.contains("no native tool"));
        assert!(result.to_json().contains("\"fallback_used\":false"));
    }
}
