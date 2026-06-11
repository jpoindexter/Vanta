use crate::app;
use crate::jsonv::{self, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// Kernel-side view of the loop ledger the TS layer keeps under .vanta/loops/
// (<id>.json = operator-authored def, <id>.state.json = runner progress). The
// cockpit reads summaries and performs the two human-only actions: flipping a
// loop's status and clearing an escalation. Writes go through the jsonv tree so
// arbitrary text in goals/prompts/reasons survives untouched; the TS loaders
// (Zod safeParse on JSON.parse) are whitespace-agnostic, so compact output is
// compatible. Malformed files are skipped on read, never deleted.

/// Loop ids and escalation ids are CLI-derived slugs. Reject anything else so a
/// URL path segment can never traverse outside the loops dir.
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn loops_dir(state: &app::State) -> PathBuf {
    state.data_dir.join("loops")
}

fn def_path(state: &app::State, id: &str) -> PathBuf {
    loops_dir(state).join(format!("{id}.json"))
}

fn state_path(state: &app::State, id: &str) -> PathBuf {
    loops_dir(state).join(format!("{id}.state.json"))
}

fn read_value(path: &PathBuf) -> Option<Value> {
    jsonv::parse(&fs::read_to_string(path).ok()?).ok()
}

/// All loops as a JSON array of summaries: def fields (id/goal/status/trigger)
/// plus runner progress (iterations/lastScore/bestScore/lastRunAt/inProgress)
/// and the full escalations list. Missing state file ⇒ zeroed progress.
pub fn list_json(state: &app::State) -> String {
    let Ok(entries) = fs::read_dir(loops_dir(state)) else {
        return "[]".to_string();
    };
    let mut ids: Vec<String> = entries
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n.ends_with(".json") && !n.ends_with(".state.json"))
        .map(|n| n.trim_end_matches(".json").to_string())
        .collect();
    ids.sort();
    let items: Vec<Value> = ids.iter().filter_map(|id| summary(state, id)).collect();
    jsonv::serialize(&Value::Arr(items))
}

fn summary(state: &app::State, id: &str) -> Option<Value> {
    let def = read_value(&def_path(state, id))?;
    let st = read_value(&state_path(state, id)).unwrap_or(Value::Obj(Vec::new()));
    let field = |v: &Value, key: &str| v.get(key).cloned().unwrap_or(Value::Null);
    let mut out = Value::Obj(Vec::new());
    out.set("id", Value::Str(id.to_string()));
    out.set("goal", field(&def, "goal"));
    out.set("status", field(&def, "status"));
    out.set("trigger", field(&def, "trigger"));
    out.set("iterations", st.get("iterations").cloned().unwrap_or(Value::Num(0.0)));
    out.set("lastScore", field(&st, "lastScore"));
    out.set("bestScore", field(&st, "bestScore"));
    out.set("lastRunAt", field(&st, "lastRunAt"));
    out.set("inProgress", st.get("inProgress").cloned().unwrap_or(Value::Bool(false)));
    out.set("escalations", st.get("escalations").cloned().unwrap_or(Value::Arr(Vec::new())));
    Some(out)
}

/// Flip a loop's lifecycle status (pause/resume/kill from the cockpit).
pub fn set_status(state: &app::State, id: &str, new_status: &str) -> Result<String, String> {
    if !valid_id(id) {
        return Err("invalid loop id".to_string());
    }
    if !matches!(new_status, "active" | "paused" | "killed") {
        return Err(format!("invalid status '{new_status}'"));
    }
    let path = def_path(state, id);
    let mut def = read_value(&path).ok_or(format!("unknown loop: {id}"))?;
    def.set("status", Value::Str(new_status.to_string()));
    fs::write(&path, jsonv::serialize(&def)).map_err(|e| e.to_string())?;
    Ok(format!("{{\"id\":\"{}\",\"status\":\"{new_status}\"}}", app::esc(id)))
}

/// Clear one open escalation — the human-only unblock. Mirrors the CLI: when
/// the last open escalation drops and the loop is paused, it auto-resumes.
pub fn clear_escalation(state: &app::State, id: &str, esc_id: &str) -> Result<String, String> {
    if !valid_id(id) || !valid_id(esc_id) {
        return Err("invalid id".to_string());
    }
    let spath = state_path(state, id);
    let mut st = read_value(&spath).ok_or(format!("unknown loop: {id}"))?;
    let now = iso_now();
    let cleared = clear_in_state(&mut st, esc_id, &now)?;
    if !cleared {
        return Err(format!("no open escalation '{esc_id}' on {id}"));
    }
    fs::write(&spath, jsonv::serialize(&st)).map_err(|e| e.to_string())?;

    let resumed = resume_if_unblocked(state, id, &st)?;
    Ok(format!(
        "{{\"cleared\":\"{}\",\"resumed\":{resumed}}}",
        app::esc(esc_id)
    ))
}

fn clear_in_state(st: &mut Value, esc_id: &str, now: &str) -> Result<bool, String> {
    let escalations = st.get_mut("escalations").ok_or("state has no escalations")?;
    let Value::Arr(items) = escalations else {
        return Err("escalations is not a list".to_string());
    };
    for item in items.iter_mut() {
        let is_target = item.get("id").and_then(Value::as_str) == Some(esc_id)
            && item.get("status").and_then(Value::as_str) == Some("open");
        if is_target {
            item.set("status", Value::Str("cleared".to_string()));
            item.set("clearedAt", Value::Str(now.to_string()));
            return Ok(true);
        }
    }
    Ok(false)
}

fn resume_if_unblocked(state: &app::State, id: &str, st: &Value) -> Result<bool, String> {
    let any_open = st
        .get("escalations")
        .and_then(Value::as_arr)
        .map(|items| {
            items
                .iter()
                .any(|e| e.get("status").and_then(Value::as_str) == Some("open"))
        })
        .unwrap_or(false);
    if any_open {
        return Ok(false);
    }
    let dpath = def_path(state, id);
    let Some(mut def) = read_value(&dpath) else {
        return Ok(false);
    };
    if def.get("status").and_then(Value::as_str) != Some("paused") {
        return Ok(false);
    }
    def.set("status", Value::Str("active".to_string()));
    fs::write(&dpath, jsonv::serialize(&def)).map_err(|e| e.to_string())?;
    Ok(true)
}

/// UTC ISO-8601 from the system clock, no chrono dep (civil-from-days algorithm).
fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (days, rem) = (secs / 86_400, secs % 86_400);
    let (h, m, s) = (rem / 3_600, (rem % 3_600) / 60, rem % 60);
    let (y, mo, d) = civil_from_days(days as i64);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.000Z")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_state(tag: &str) -> app::State {
        let root = std::env::temp_dir().join(format!("vanta-loops-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".vanta").join("loops")).unwrap();
        app::State::new(root)
    }

    fn seed(state: &app::State, id: &str, def: &str, st: Option<&str>) {
        fs::write(def_path(state, id), def).unwrap();
        if let Some(s) = st {
            fs::write(state_path(state, id), s).unwrap();
        }
    }

    const DEF: &str = r#"{"id":"demo","goal":"ship it","trigger":{"kind":"manual"},"stages":[{"name":"execute","prompt":"go"}],"status":"paused","createdAt":"2026-06-11T00:00:00.000Z"}"#;
    const STATE: &str = r#"{"id":"demo","iterations":2,"lastScore":0.4,"bestScore":0.4,"lastRunAt":null,"ticksSinceRun":0,"noProgressStreak":1,"lessons":[],"history":[],"escalations":[{"id":"esc-1","raisedAt":"2026-06-11T01:00:00.000Z","reason":"needs an API key","status":"open","clearedAt":null}],"inProgress":false}"#;

    #[test]
    fn lists_loops_with_progress_and_escalations() {
        let state = temp_state("list");
        seed(&state, "demo", DEF, Some(STATE));
        let listed = jsonv::parse(&list_json(&state)).unwrap();
        let items = listed.as_arr().unwrap();
        assert_eq!(items.len(), 1);
        let l = &items[0];
        assert_eq!(l.get("id").unwrap().as_str(), Some("demo"));
        assert_eq!(l.get("status").unwrap().as_str(), Some("paused"));
        assert_eq!(l.get("iterations").unwrap().as_f64(), Some(2.0));
        assert_eq!(l.get("escalations").unwrap().as_arr().unwrap().len(), 1);
        let _ = fs::remove_dir_all(&state.root);
    }

    #[test]
    fn list_skips_malformed_defs_and_missing_state_zeroes() {
        let state = temp_state("tolerant");
        seed(&state, "good", DEF, None);
        fs::write(def_path(&state, "broken"), "{ nope").unwrap();
        let listed = jsonv::parse(&list_json(&state)).unwrap();
        let items = listed.as_arr().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].get("iterations").unwrap().as_f64(), Some(0.0));
        assert_eq!(items[0].get("inProgress").unwrap().as_bool(), Some(false));
        let _ = fs::remove_dir_all(&state.root);
    }

    #[test]
    fn set_status_flips_and_validates() {
        let state = temp_state("status");
        seed(&state, "demo", DEF, None);
        set_status(&state, "demo", "active").unwrap();
        let def = read_value(&def_path(&state, "demo")).unwrap();
        assert_eq!(def.get("status").unwrap().as_str(), Some("active"));
        assert!(set_status(&state, "demo", "exploded").is_err());
        assert!(set_status(&state, "../escape", "paused").is_err());
        assert!(set_status(&state, "ghost", "paused").is_err());
        let _ = fs::remove_dir_all(&state.root);
    }

    #[test]
    fn clear_escalation_clears_and_auto_resumes_paused_loop() {
        let state = temp_state("clear");
        seed(&state, "demo", DEF, Some(STATE));
        let out = clear_escalation(&state, "demo", "esc-1").unwrap();
        assert!(out.contains("\"resumed\":true"));
        let st = read_value(&state_path(&state, "demo")).unwrap();
        let esc = &st.get("escalations").unwrap().as_arr().unwrap()[0];
        assert_eq!(esc.get("status").unwrap().as_str(), Some("cleared"));
        assert!(esc.get("clearedAt").unwrap().as_str().unwrap().ends_with("Z"));
        let def = read_value(&def_path(&state, "demo")).unwrap();
        assert_eq!(def.get("status").unwrap().as_str(), Some("active"));
        // Second clear of the same id: no longer open → error.
        assert!(clear_escalation(&state, "demo", "esc-1").is_err());
        let _ = fs::remove_dir_all(&state.root);
    }

    #[test]
    fn iso_now_shape_is_sane() {
        let iso = iso_now();
        assert_eq!(iso.len(), 24);
        assert!(iso.starts_with("20"));
        assert!(iso.ends_with(".000Z"));
    }
}
