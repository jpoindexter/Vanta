use crate::app;
use std::{cell::RefCell, fs};

#[derive(Debug, PartialEq, Clone)]
pub enum GoalStatus {
    Active,
    Done,
}

#[derive(Debug, Clone)]
pub struct GoalItem {
    pub id: usize,
    pub text: String,
    pub status: GoalStatus,
}

pub struct GoalLedger {
    items: RefCell<Vec<GoalItem>>,
}

impl GoalLedger {
    pub fn empty() -> Self {
        Self {
            items: RefCell::new(vec![]),
        }
    }

    pub fn from_items(items: Vec<GoalItem>) -> Self {
        Self {
            items: RefCell::new(items),
        }
    }

    pub fn add(&self, text: &str) -> Result<GoalItem, String> {
        let cleaned = text.trim();
        if cleaned.is_empty() {
            return Err("goal text is required".into());
        }
        let item = GoalItem {
            id: self.items.borrow().len() + 1,
            text: cleaned.into(),
            status: GoalStatus::Active,
        };
        self.items.borrow_mut().push(item.clone());
        Ok(item)
    }

    pub fn complete(&self, id: usize) -> Result<GoalItem, String> {
        let mut items = self.items.borrow_mut();
        let item = items
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| format!("goal not found: {id}"))?;
        item.status = GoalStatus::Done;
        Ok(item.clone())
    }

    pub fn list(&self) -> Vec<GoalItem> {
        self.items.borrow().clone()
    }

    pub fn to_json(&self) -> String {
        let items = self
            .items
            .borrow()
            .iter()
            .map(GoalItem::to_json)
            .collect::<Vec<_>>()
            .join(",");
        format!("[{}]", items)
    }
}

impl GoalItem {
    pub fn to_json(&self) -> String {
        format!(
            "{{\"id\":{},\"text\":\"{}\",\"status\":\"{}\"}}",
            self.id,
            app::esc(&self.text),
            status_name(&self.status)
        )
    }
}

pub fn add_file(state: &app::State, text: &str) -> Result<GoalItem, String> {
    let ledger = load_file(state)?;
    let item = ledger.add(text)?;
    save_file(state, &ledger)?;
    Ok(item)
}

pub fn complete_file(state: &app::State, id: usize) -> Result<GoalItem, String> {
    let ledger = load_file(state)?;
    let item = ledger.complete(id)?;
    save_file(state, &ledger)?;
    Ok(item)
}

pub fn list_file_json(state: &app::State) -> Result<String, String> {
    Ok(load_file(state)?.to_json())
}

fn load_file(state: &app::State) -> Result<GoalLedger, String> {
    let path = state.data_dir.join("goals.tsv");
    let Ok(text) = fs::read_to_string(path) else {
        return Ok(GoalLedger::empty());
    };
    let mut items = Vec::new();
    for line in text.lines() {
        let parts = line.split('\t').collect::<Vec<_>>();
        if parts.len() != 3 {
            continue;
        }
        if let (Ok(id), Some(status)) = (parts[0].parse::<usize>(), parse_status(parts[2])) {
            items.push(GoalItem {
                id,
                text: parts[1].into(),
                status,
            });
        }
    }
    Ok(GoalLedger::from_items(items))
}

fn save_file(state: &app::State, ledger: &GoalLedger) -> Result<(), String> {
    fs::create_dir_all(&state.data_dir).map_err(|e| e.to_string())?;
    let lines = ledger
        .list()
        .iter()
        .map(|item| {
            format!(
                "{}\t{}\t{}",
                item.id,
                flat(&item.text),
                status_name(&item.status)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(state.data_dir.join("goals.tsv"), format!("{}\n", lines)).map_err(|e| e.to_string())
}

fn status_name(status: &GoalStatus) -> &'static str {
    match status {
        GoalStatus::Active => "active",
        GoalStatus::Done => "done",
    }
}

fn parse_status(value: &str) -> Option<GoalStatus> {
    match value {
        "active" => Some(GoalStatus::Active),
        "done" => Some(GoalStatus::Done),
        _ => None,
    }
}

fn flat(value: &str) -> String {
    value.replace(['\t', '\n'], " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_project_goal_as_active() {
        let ledger = GoalLedger::empty();
        let goal = ledger.add("Ship a safer Argo cockpit").unwrap();
        assert_eq!(goal.id, 1);
        assert_eq!(goal.text, "Ship a safer Argo cockpit");
        assert_eq!(goal.status, GoalStatus::Active);
    }

    #[test]
    fn rejects_empty_goals() {
        let ledger = GoalLedger::empty();
        let err = ledger.add("   ").unwrap_err();
        assert!(err.contains("goal text is required"));
        assert!(ledger.list().is_empty());
    }

    #[test]
    fn completes_goals_in_json() {
        let ledger = GoalLedger::empty();
        let goal = ledger.add("Define the next native runtime slice").unwrap();
        let done = ledger.complete(goal.id).unwrap();
        assert_eq!(done.status, GoalStatus::Done);
        let json = ledger.to_json();
        assert!(json.contains("\"status\":\"done\""));
        assert!(json.contains("Define the next native runtime slice"));
    }
}
