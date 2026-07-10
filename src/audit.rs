use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

// KERNEL-AUDIT-CHAIN — tamper-evident audit log. Each events.jsonl line carries
// `h = sha256(secret_key + prev_h + payload)`, chaining every event to the last.
// Any edit/insert/delete/reorder breaks the chain on verify. The per-install
// secret key (.vanta/audit.key, 0600, outside the log) means an attacker can't
// recompute a forged chain. The kernel takes no crates, so SHA-256 is vendored
// below and checked against the standard NIST vectors in tests.

const GENESIS: &str = "0000000000000000000000000000000000000000000000000000000000000000";
const SEP: &str = ",\"h\":\"";

// ---- vendored SHA-256 (zero-dep) ----

const H0: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

#[rustfmt::skip]
const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

pub fn sha256_hex(data: &[u8]) -> String {
    let mut h = H0;
    let bitlen = (data.len() as u64).wrapping_mul(8);
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bitlen.to_be_bytes());
    for chunk in msg.chunks(64) {
        let mut w = [0u32; 64];
        for (i, word) in w.iter_mut().enumerate().take(16) {
            *word = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) =
            (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g; g = f; f = e; e = d.wrapping_add(t1); d = c; c = b; b = a; a = t1.wrapping_add(t2);
        }
        h[0] = h[0].wrapping_add(a); h[1] = h[1].wrapping_add(b); h[2] = h[2].wrapping_add(c); h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e); h[5] = h[5].wrapping_add(f); h[6] = h[6].wrapping_add(g); h[7] = h[7].wrapping_add(hh);
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}

// ---- chain ----

/// h = sha256(key + prev_h + payload). The key (kept outside the log) is what makes
/// the chain tamper-EVIDENT rather than merely tamper-detectable.
pub fn chain_hash(key: &str, prev: &str, payload: &str) -> String {
    sha256_hex(format!("{key}{prev}{payload}").as_bytes())
}

/// The `h` value of a written line, or None if absent/malformed.
fn line_hash(line: &str) -> Option<&str> {
    line.rsplit_once(SEP).map(|(_, tail)| tail.trim_end_matches("\"}"))
}

/// The payload a line was hashed over: the line minus its `,"h":"..."` suffix.
fn line_payload(line: &str) -> Option<String> {
    line.rsplit_once(SEP).map(|(head, _)| format!("{head}}}"))
}

/// The chain head to extend: the last line's hash, or GENESIS for an empty log.
pub fn last_hash(data_dir: &Path) -> String {
    let path = data_dir.join("events.jsonl");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return GENESIS.to_string(),
    };
    content
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .and_then(line_hash)
        .map(|h| h.to_string())
        .unwrap_or_else(|| GENESIS.to_string())
}

/// Force 0600 on a sensitive file (best-effort; unix only).
fn enforce_0600(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    #[cfg(not(unix))]
    let _ = path;
}

/// Load (or create, 0600) a per-install random secret file by name. Re-asserts 0600
/// on EVERY load so a pre-existing file relaxed to 0644 gets locked back down.
pub fn load_or_create_token(data_dir: &Path, name: &str) -> Result<String, String> {
    let path = data_dir.join(name);
    if let Ok(k) = fs::read_to_string(&path) {
        let k = k.trim().to_string();
        if !k.is_empty() {
            enforce_0600(&path);
            return Ok(k);
        }
    }
    let key = random_key();
    fs::write(&path, &key).map_err(|e| e.to_string())?;
    enforce_0600(&path);
    Ok(key)
}

/// The audit chain key (tamper-evidence). See [`load_or_create_token`].
pub fn load_or_create_key(data_dir: &Path) -> Result<String, String> {
    load_or_create_token(data_dir, "audit.key")
}

// ---- truncation anchor ----
// The chain catches edit/insert/delete-in-the-middle, but TAIL TRUNCATION (dropping
// the last N lines) leaves a still-valid shorter chain — undetectable from the log
// alone. The anchor pins (count, head_hash) keyed with the secret, in a separate
// file, so a shortened chain no longer matches. Written on each append; checked on verify.

fn anchor_value(key: &str, count: usize, last_h: &str) -> String {
    sha256_hex(format!("{key}|{count}|{last_h}").as_bytes())
}

/// (count of non-empty lines, last line's hash) for the current log.
fn chain_stats(data_dir: &Path) -> (usize, String) {
    let content = fs::read_to_string(data_dir.join("events.jsonl")).unwrap_or_default();
    let mut n = 0usize;
    let mut last = GENESIS.to_string();
    for line in content.lines().filter(|l| !l.trim().is_empty()) {
        if let Some(h) = line_hash(line) {
            last = h.to_string();
        }
        n += 1;
    }
    (n, last)
}

/// Update the truncation anchor to the current chain head. Call after each append.
pub fn update_head_anchor(data_dir: &Path, key: &str) -> Result<(), String> {
    let (n, last) = chain_stats(data_dir);
    let path = data_dir.join("audit.head");
    fs::write(&path, anchor_value(key, n, &last)).map_err(|e| e.to_string())?;
    enforce_0600(&path);
    Ok(())
}

/// Verify the chain head matches the anchor (detects tail truncation). An absent
/// anchor = legacy log → vacuously ok (the anchor is written from the next append on).
fn verify_head_anchor(data_dir: &Path, key: &str, count: usize, last_h: &str) -> Result<(), String> {
    let stored = match fs::read_to_string(data_dir.join("audit.head")) {
        Ok(s) => s.trim().to_string(),
        Err(_) => return Ok(()),
    };
    if stored.is_empty() || stored == anchor_value(key, count, last_h) {
        return Ok(());
    }
    Err(format!(
        "audit head anchor mismatch — {count} events present but the anchor pins a different chain length/head (tail truncation or tamper)"
    ))
}

fn random_key() -> String {
    let mut buf = [0u8; 32];
    if let Ok(mut f) = fs::File::open("/dev/urandom") {
        if f.read_exact(&mut buf).is_ok() {
            return buf.iter().map(|b| format!("{b:02x}")).collect();
        }
    }
    // Fallback: time + address entropy hashed (no /dev/urandom available).
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    sha256_hex(format!("vanta-audit-{nanos}-{:p}", &buf).as_bytes())
}

/// Verify the whole chain. Ok(n) = n events, intact; Err = the first broken line.
pub fn verify_chain(data_dir: &Path) -> Result<usize, String> {
    let path = data_dir.join("events.jsonl");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Ok(0), // no log yet = vacuously intact
    };
    let key = load_or_create_key(data_dir)?;
    let mut prev = GENESIS.to_string();
    let mut n = 0usize;
    for (i, line) in content.lines().enumerate().filter(|(_, l)| !l.trim().is_empty()) {
        let payload = line_payload(line).ok_or_else(|| format!("line {} has no chain hash (pre-chain or tampered)", i + 1))?;
        let stored = line_hash(line).ok_or_else(|| format!("line {} hash unreadable", i + 1))?;
        let expect = chain_hash(&key, &prev, &payload);
        if expect != stored {
            return Err(format!("line {} broke the audit chain (tampered, reordered, or inserted)", i + 1));
        }
        prev = stored.to_string();
        n += 1;
    }
    verify_head_anchor(data_dir, &key, n, &prev)?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp() -> PathBuf {
        // Unique per CALL: the nanosecond clock alone can collide when two tests
        // run in parallel and read the same instant — an atomic seq + pid make the
        // dir unique so concurrent audit tests never share key/head/events state.
        use std::sync::atomic::{AtomicU64, Ordering};
        static SEQ: AtomicU64 = AtomicU64::new(0);
        let d = std::env::temp_dir().join(format!(
            "vanta-audit-{}-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn sha256_matches_nist_vectors() {
        assert_eq!(sha256_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    fn append(data_dir: &Path, key: &str, payload: &str) {
        // Mirror app.rs: insert ,"h":"..." BEFORE the payload's closing brace.
        let prev = last_hash(data_dir);
        let h = chain_hash(key, &prev, payload);
        let core = payload.strip_suffix('}').unwrap();
        let line = format!("{core}{SEP}{h}\"}}\n");
        use std::io::Write;
        fs::OpenOptions::new().create(true).append(true).open(data_dir.join("events.jsonl")).unwrap()
            .write_all(line.as_bytes()).unwrap();
    }

    #[test]
    fn intact_chain_verifies() {
        let d = tmp();
        let key = load_or_create_key(&d).unwrap();
        append(&d, &key, "{\"ts\":1,\"event\":\"a\"}");
        append(&d, &key, "{\"ts\":2,\"event\":\"b\"}");
        append(&d, &key, "{\"ts\":3,\"event\":\"c\"}");
        assert_eq!(verify_chain(&d).unwrap(), 3);
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn tampered_line_breaks_chain() {
        let d = tmp();
        let key = load_or_create_key(&d).unwrap();
        append(&d, &key, "{\"ts\":1,\"event\":\"a\"}");
        append(&d, &key, "{\"ts\":2,\"event\":\"b\"}");
        // Edit the first event's payload but keep its (now-wrong) hash.
        let p = d.join("events.jsonl");
        let content = fs::read_to_string(&p).unwrap().replace("\"event\":\"a\"", "\"event\":\"HACKED\"");
        fs::write(&p, content).unwrap();
        assert!(verify_chain(&d).is_err());
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn deleted_line_breaks_chain() {
        let d = tmp();
        let key = load_or_create_key(&d).unwrap();
        append(&d, &key, "{\"ts\":1,\"event\":\"a\"}");
        append(&d, &key, "{\"ts\":2,\"event\":\"b\"}");
        append(&d, &key, "{\"ts\":3,\"event\":\"c\"}");
        // Drop the middle line — the chain must no longer verify.
        let p = d.join("events.jsonl");
        let content = fs::read_to_string(&p).unwrap();
        let kept: Vec<&str> = content.lines().enumerate().filter(|(i, _)| *i != 1).map(|(_, l)| l).collect();
        fs::write(&p, kept.join("\n") + "\n").unwrap();
        assert!(verify_chain(&d).is_err());
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn tail_truncation_breaks_anchor() {
        let d = tmp();
        let key = load_or_create_key(&d).unwrap();
        append(&d, &key, "{\"ts\":1,\"event\":\"a\"}");
        append(&d, &key, "{\"ts\":2,\"event\":\"b\"}");
        append(&d, &key, "{\"ts\":3,\"event\":\"c\"}");
        update_head_anchor(&d, &key).unwrap(); // anchor pins count=3 + head
        assert_eq!(verify_chain(&d).unwrap(), 3);
        // Drop the last line: the remaining 2-line chain is still INTERNALLY valid
        // (the bug), but the anchor expects 3 events → mismatch catches the truncation.
        let p = d.join("events.jsonl");
        let content = fs::read_to_string(&p).unwrap();
        let kept: Vec<&str> = content.lines().take(2).collect();
        fs::write(&p, kept.join("\n") + "\n").unwrap();
        assert!(verify_chain(&d).is_err());
        fs::remove_dir_all(&d).ok();
    }
}
