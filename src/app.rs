use crate::safety;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// Create a directory (recursively) and lock it to 0700 — the .vanta store holds
/// the audit key, tokens, and the event log, so it must not be world-readable on a
/// shared host. Re-asserts the mode each call (cheap, fixes a pre-existing 0755 dir).
pub fn ensure_private_dir(path: &Path) -> std::io::Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    Ok(())
}

pub struct State {
    pub root: PathBuf,
    pub data_dir: PathBuf,
}

impl State {
    pub fn new(root: PathBuf) -> Self {
        let data_dir = root.join(".vanta");
        Self { root, data_dir }
    }
}

pub fn doctor(state: &State) -> Result<(), String> {
    ensure_private_dir(&state.data_dir).map_err(|e| e.to_string())?;
    migrate_legacy_data(state);
    println!("{{");
    println!("  \"name\": \"Vanta\",");
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
    // Migrate legacy data dirs into .vanta on first run; old dirs are preserved (copy, not move).
    for legacy_name in [".nexarion", ".vanta"] {
        let legacy = state.root.join(legacy_name);
        if !legacy.exists() || legacy == state.data_dir {
            continue;
        }
        let mut migrated = false;
        for entry in ["approvals.tsv", "goals.tsv", "events.jsonl"] {
            let src = legacy.join(entry);
            let dst = state.data_dir.join(entry);
            if src.exists() && !dst.exists() {
                let _ = fs::copy(&src, &dst);
                migrated = true;
            }
        }
        if migrated {
            eprintln!("note: migrated {legacy_name}/ data to .vanta/ (old dir preserved)");
        }
    }
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
    ensure_private_dir(&state.data_dir).map_err(|e| e.to_string())?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    // KERNEL-AUDIT-CHAIN: hash each event over (key + prev_hash + payload) so the
    // log is tamper-evident. Payload is the line WITHOUT the trailing `,"h":"..."`,
    // which is exactly what audit::verify_chain reconstructs.
    let payload = format!("{{\"ts\":{},\"event\":\"{}\"}}", ts, esc(text));
    let prev = crate::audit::last_hash(&state.data_dir);
    let key = crate::audit::load_or_create_key(&state.data_dir)?;
    let h = crate::audit::chain_hash(&key, &prev, &payload);
    let line = format!("{{\"ts\":{},\"event\":\"{}\",\"h\":\"{}\"}}\n", ts, esc(text), h);
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(state.data_dir.join("events.jsonl"))
        .and_then(|mut f| {
            use std::io::Write;
            f.write_all(line.as_bytes())
        })
        .map_err(|e| e.to_string())?;
    // Move the truncation anchor forward so a later tail-truncation is detectable.
    crate::audit::update_head_anchor(&state.data_dir, &key)
}

pub fn log_event(state: &State, text: &str) -> Result<(), String> {
    append_event(state, text)?;
    println!("{{\"logged\":true,\"event\":\"{}\"}}", esc(text));
    Ok(())
}

/// JSON-escape a string's CONTENT (no surrounding quotes). Escapes the full JSON
/// control set — `\r`/`\t`/`\b`/`\f` and `\u00xx` for any other char < 0x20 — so a
/// control byte in event text can't produce spec-invalid JSON in events.jsonl or an
/// API response (the old version only handled `\\ " \n`).
pub fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}
