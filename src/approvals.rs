use crate::{app, safety};
use std::{cell::RefCell, fs, path::Path};

#[derive(Debug, PartialEq, Clone)]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied,
}

#[derive(Debug, Clone)]
pub struct ApprovalItem {
    pub id: usize,
    pub text: String,
    pub risk: safety::Risk,
    pub reason: String,
    pub needs_human: bool,
    pub status: ApprovalStatus,
}

pub struct ApprovalQueue {
    items: RefCell<Vec<ApprovalItem>>,
}

impl ApprovalQueue {
    pub fn empty() -> Self {
        Self {
            items: RefCell::new(vec![]),
        }
    }

    pub fn from_items(items: Vec<ApprovalItem>) -> Self {
        Self {
            items: RefCell::new(items),
        }
    }

    pub fn propose(&self, root: &Path, text: &str) -> Result<ApprovalItem, String> {
        let verdict = safety::assess_action(text, root);
        if matches!(verdict.risk, safety::Risk::Block) {
            return Err(format!("blocked: {}", verdict.reason));
        }
        if matches!(verdict.risk, safety::Risk::Allow) {
            return Err("approval is not required for this in-scope action".into());
        }
        let item = ApprovalItem {
            id: self.items.borrow().len() + 1,
            text: text.trim().into(),
            risk: verdict.risk,
            reason: verdict.reason,
            needs_human: verdict.needs_human,
            status: ApprovalStatus::Pending,
        };
        self.items.borrow_mut().push(item.clone());
        Ok(item)
    }

    pub fn decide(&self, id: usize, approve: bool) -> Result<ApprovalItem, String> {
        let mut items = self.items.borrow_mut();
        let item = items
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| format!("approval not found: {id}"))?;
        item.status = if approve {
            ApprovalStatus::Approved
        } else {
            ApprovalStatus::Denied
        };
        Ok(item.clone())
    }

    pub fn list(&self) -> Vec<ApprovalItem> {
        self.items.borrow().clone()
    }

    pub fn to_json(&self) -> String {
        let items = self
            .items
            .borrow()
            .iter()
            .map(ApprovalItem::to_json)
            .collect::<Vec<_>>()
            .join(",");
        format!("[{}]", items)
    }
}

impl ApprovalItem {
    pub fn to_json(&self) -> String {
        format!(
            "{{\"id\":{},\"text\":\"{}\",\"risk\":\"{}\",\"needs_human\":{},\"status\":\"{}\",\"reason\":\"{}\"}}",
            self.id,
            app::esc(&self.text),
            risk_name(&self.risk),
            self.needs_human,
            status_name(&self.status),
            app::esc(&self.reason)
        )
    }
}

pub fn propose_file(state: &app::State, text: &str) -> Result<ApprovalItem, String> {
    let q = load_file(state)?;
    let item = q.propose(&state.root, text)?;
    save_file(state, &q)?;
    Ok(item)
}

pub fn decide_file(state: &app::State, id: usize, approve: bool) -> Result<ApprovalItem, String> {
    let q = load_file(state)?;
    let item = q.decide(id, approve)?;
    save_file(state, &q)?;
    Ok(item)
}

pub fn list_file_json(state: &app::State) -> Result<String, String> {
    Ok(load_file(state)?.to_json())
}

fn load_file(state: &app::State) -> Result<ApprovalQueue, String> {
    let path = state.data_dir.join("approvals.tsv");
    let Ok(text) = fs::read_to_string(path) else {
        return Ok(ApprovalQueue::empty());
    };
    let mut items = Vec::new();
    for line in text.lines() {
        let parts = line.split('\t').collect::<Vec<_>>();
        if parts.len() != 6 {
            continue;
        }
        if let (Ok(id), Some(risk), Some(status)) = (
            parts[0].parse::<usize>(),
            parse_risk(parts[2]),
            parse_status(parts[4]),
        ) {
            items.push(ApprovalItem {
                id,
                text: parts[1].into(),
                risk,
                reason: parts[5].into(),
                needs_human: parts[3] == "true",
                status,
            });
        }
    }
    Ok(ApprovalQueue::from_items(items))
}

fn save_file(state: &app::State, q: &ApprovalQueue) -> Result<(), String> {
    fs::create_dir_all(&state.data_dir).map_err(|e| e.to_string())?;
    let lines = q
        .list()
        .iter()
        .map(|item| {
            format!(
                "{}\t{}\t{}\t{}\t{}\t{}",
                item.id,
                flat(&item.text),
                risk_name(&item.risk),
                item.needs_human,
                status_name(&item.status),
                flat(&item.reason)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(state.data_dir.join("approvals.tsv"), format!("{}\n", lines))
        .map_err(|e| e.to_string())
}

fn risk_name(risk: &safety::Risk) -> &'static str {
    match risk {
        safety::Risk::Allow => "allow",
        safety::Risk::Ask => "ask",
        safety::Risk::Block => "block",
    }
}

fn status_name(status: &ApprovalStatus) -> &'static str {
    match status {
        ApprovalStatus::Pending => "pending",
        ApprovalStatus::Approved => "approved",
        ApprovalStatus::Denied => "denied",
    }
}

fn parse_risk(value: &str) -> Option<safety::Risk> {
    match value {
        "allow" => Some(safety::Risk::Allow),
        "ask" => Some(safety::Risk::Ask),
        "block" => Some(safety::Risk::Block),
        _ => None,
    }
}

fn parse_status(value: &str) -> Option<ApprovalStatus> {
    match value {
        "pending" => Some(ApprovalStatus::Pending),
        "approved" => Some(ApprovalStatus::Approved),
        "denied" => Some(ApprovalStatus::Denied),
        _ => None,
    }
}

fn flat(value: &str) -> String {
    value.replace(['\t', '\n'], " ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::safety::Risk;
    use std::path::PathBuf;

    fn root() -> PathBuf {
        PathBuf::from("/Users/jasonpoindexter/Documents/GitHub/Argo")
    }

    #[test]
    fn queues_ask_actions_for_human_approval() {
        let q = ApprovalQueue::empty();
        let item = q.propose(&root(), "install global daemon").unwrap();
        assert_eq!(item.id, 1);
        assert_eq!(item.risk, Risk::Ask);
        assert_eq!(item.status, ApprovalStatus::Pending);
        assert!(item.needs_human);
    }

    #[test]
    fn never_queues_blocked_actions() {
        let q = ApprovalQueue::empty();
        let err = q.propose(&root(), "delete ~/Documents").unwrap_err();
        assert!(err.contains("blocked"));
        assert_eq!(q.list().len(), 0);
    }

    #[test]
    fn approval_status_transitions_are_visible() {
        let q = ApprovalQueue::empty();
        let item = q.propose(&root(), "install global daemon").unwrap();
        let approved = q.decide(item.id, true).unwrap();
        assert_eq!(approved.status, ApprovalStatus::Approved);
        assert!(q.to_json().contains("approved"));
    }
}
