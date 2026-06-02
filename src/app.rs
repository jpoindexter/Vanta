use crate::safety;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

pub struct State {
    pub root: PathBuf,
    pub data_dir: PathBuf,
}

impl State {
    pub fn new(root: PathBuf) -> Self {
        let data_dir = root.join(".argo");
        Self { root, data_dir }
    }
}

pub fn doctor(state: &State) -> Result<(), String> {
    fs::create_dir_all(&state.data_dir).map_err(|e| e.to_string())?;
    migrate_legacy_data(state);
    println!("{{");
    println!("  \"name\": \"Argo\",");
    println!("  \"status\": \"ready\",");
    println!(
        "  \"root\": \"{}\",",
        esc(&state.root.display().to_string())
    );
    println!(
        "  \"state_dir\": \"{}\",",
        esc(&state.data_dir.display().to_string())
    );
    println!("  \"rule_zero\": \"do no harm\"");
    println!("}}");
    Ok(())
}

fn migrate_legacy_data(state: &State) {
    let legacy = state.root.join(".nexarion");
    if !legacy.exists() {
        return;
    }
    for entry in ["approvals.tsv", "goals.tsv", "events.jsonl"] {
        let src = legacy.join(entry);
        let dst = state.data_dir.join(entry);
        if src.exists() && !dst.exists() {
            let _ = fs::copy(&src, &dst);
        }
    }
    eprintln!("note: migrated .nexarion/ data to .argo/ (old dir preserved)");
}

pub fn assess(state: &State, text: &str) -> Result<(), String> {
    let verdict = safety::assess_action(text, &state.root);
    println!("{}", verdict.to_json());
    Ok(())
}

pub fn scope(state: &State, path: &str) -> Result<(), String> {
    let target = if path.trim().is_empty() {
        state.root.clone()
    } else {
        PathBuf::from(path)
    };
    let allowed = safety::inside_scope(&target, &state.root);
    println!(
        "{{\"path\":\"{}\",\"inside_scope\":{}}}",
        esc(&target.display().to_string()),
        allowed
    );
    Ok(())
}

pub fn append_event(state: &State, text: &str) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("log text is required".to_string());
    }
    fs::create_dir_all(&state.data_dir).map_err(|e| e.to_string())?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let line = format!("{{\"ts\":{},\"event\":\"{}\"}}\n", ts, esc(text));
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(state.data_dir.join("events.jsonl"))
        .and_then(|mut f| {
            use std::io::Write;
            f.write_all(line.as_bytes())
        })
        .map_err(|e| e.to_string())
}

pub fn log_event(state: &State, text: &str) -> Result<(), String> {
    append_event(state, text)?;
    println!("{{\"logged\":true,\"event\":\"{}\"}}", esc(text));
    Ok(())
}

pub fn esc(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}
