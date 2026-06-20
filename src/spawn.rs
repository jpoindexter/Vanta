use crate::app;
use crate::jsonv::{self, Value};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

// LIVENESS-WATCHDOG Part 2 — the kernel halts runaway spawn recursion. Every
// agent that spawns a sub-agent (delegate/team/swarm/self-correct/fleet/hook
// workers all funnel through the TS `spawnSubagent`) asks the kernel to gate the
// spawn first. A chain deeper than `max_depth` is refused — the backstop that
// stops a self-spawning loop from fanning out without bound. Decisions are
// recorded to `.vanta/spawns.jsonl` (the spawn audit trail). Block floor: the
// kernel never allows past the depth ceiling.

/// Default maximum spawn depth. Override with `VANTA_MAX_SPAWN_DEPTH` (>0).
pub const DEFAULT_MAX_DEPTH: u32 = 6;

pub struct SpawnVerdict {
    pub allowed: bool,
    pub reason: String,
    pub depth: u32,
    pub max_depth: u32,
}

impl SpawnVerdict {
    pub fn to_json(&self) -> String {
        format!(
            "{{\"allowed\":{},\"reason\":\"{}\",\"depth\":{},\"max_depth\":{}}}",
            self.allowed,
            app::esc(&self.reason),
            self.depth,
            self.max_depth
        )
    }
}

/// The depth ceiling, read live from the environment so a launcher can tune it.
pub fn max_depth_from_env() -> u32 {
    std::env::var("VANTA_MAX_SPAWN_DEPTH")
        .ok()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(DEFAULT_MAX_DEPTH)
}

/// Pure decision: a spawn whose resulting depth exceeds `max_depth` is runaway
/// recursion and is refused. This is the rule the rest of the module records.
pub fn evaluate_spawn(depth: u32, max_depth: u32) -> SpawnVerdict {
    if depth > max_depth {
        SpawnVerdict {
            allowed: false,
            reason: format!("spawn depth {depth} exceeds max {max_depth}: runaway recursion halted"),
            depth,
            max_depth,
        }
    } else {
        SpawnVerdict {
            allowed: true,
            reason: format!("spawn depth {depth} within max {max_depth}"),
            depth,
            max_depth,
        }
    }
}

/// Evaluate a spawn request and append it to the spawn ledger, recording the
/// decision. Ledger write failures never change the verdict (the rule stands
/// even if the audit line can't be persisted).
pub fn check_and_record(state: &app::State, parent: &str, child: &str, depth: u32) -> SpawnVerdict {
    let verdict = evaluate_spawn(depth, max_depth_from_env());
    let _ = record(state, parent, child, &verdict);
    verdict
}

fn record(state: &app::State, parent: &str, child: &str, verdict: &SpawnVerdict) -> Result<(), String> {
    fs::create_dir_all(&state.data_dir).map_err(|e| e.to_string())?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let line = format!(
        "{{\"ts\":{},\"parent\":\"{}\",\"child\":\"{}\",\"depth\":{},\"allowed\":{}}}\n",
        ts,
        app::esc(parent),
        app::esc(child),
        verdict.depth,
        verdict.allowed
    );
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(state.data_dir.join("spawns.jsonl"))
        .and_then(|mut f| {
            use std::io::Write;
            f.write_all(line.as_bytes())
        })
        .map_err(|e| e.to_string())
}

/// Parse a spawn request body: `{"parent":"..","child":"..","depth":N}`. A
/// malformed body or missing field defaults to empty ids / depth 0 — fail-open
/// only on the request *shape*, never on the depth rule (depth 0 is a root spawn,
/// which is always within any positive ceiling).
pub fn parse_request(body: &str) -> (String, String, u32) {
    let Ok(v) = jsonv::parse(body) else {
        return (String::new(), String::new(), 0);
    };
    let s = |key: &str| v.get(key).and_then(Value::as_str).unwrap_or("").to_string();
    let depth = v.get("depth").and_then(Value::as_f64).unwrap_or(0.0);
    let depth = if depth.is_finite() && depth >= 0.0 { depth as u32 } else { 0 };
    (s("parent"), s("child"), depth)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_state(tag: &str) -> app::State {
        let root = std::env::temp_dir().join(format!("vanta-spawn-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".vanta")).unwrap();
        app::State::new(root)
    }

    #[test]
    fn allows_depth_within_ceiling_and_blocks_beyond() {
        let max = 6;
        assert!(evaluate_spawn(1, max).allowed);
        assert!(evaluate_spawn(max, max).allowed, "exactly at the ceiling is allowed");
        let over = evaluate_spawn(max + 1, max);
        assert!(!over.allowed);
        assert!(over.reason.contains("runaway recursion halted"));
    }

    #[test]
    fn check_and_record_blocks_runaway_and_writes_ledger() {
        let state = temp_state("record");
        let v = check_and_record(&state, "root", "deep", 99);
        assert!(!v.allowed);
        let ledger = fs::read_to_string(state.data_dir.join("spawns.jsonl")).unwrap();
        assert!(ledger.contains("\"child\":\"deep\""));
        assert!(ledger.contains("\"depth\":99"));
        assert!(ledger.contains("\"allowed\":false"));
        let _ = fs::remove_dir_all(&state.root);
    }

    #[test]
    fn check_and_record_allows_shallow_and_appends() {
        let state = temp_state("allow");
        assert!(check_and_record(&state, "a", "b", 1).allowed);
        assert!(check_and_record(&state, "b", "c", 2).allowed);
        let ledger = fs::read_to_string(state.data_dir.join("spawns.jsonl")).unwrap();
        assert_eq!(ledger.lines().count(), 2, "one ledger line per spawn");
        let _ = fs::remove_dir_all(&state.root);
    }

    #[test]
    fn parse_request_reads_fields_and_tolerates_garbage() {
        let (p, c, d) = parse_request(r#"{"parent":"p1","child":"c1","depth":4}"#);
        assert_eq!(p, "p1");
        assert_eq!(c, "c1");
        assert_eq!(d, 4);
        let (_, _, d0) = parse_request("not json");
        assert_eq!(d0, 0);
        let (_, _, d1) = parse_request(r#"{"depth":-3}"#);
        assert_eq!(d1, 0, "negative depth clamps to 0");
    }

    #[test]
    fn verdict_json_is_well_formed() {
        let j = evaluate_spawn(9, 6).to_json();
        assert!(j.contains("\"allowed\":false"));
        assert!(j.contains("\"depth\":9"));
        assert!(j.contains("\"max_depth\":6"));
    }
}
