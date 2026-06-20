use crate::{app, approvals, goals, loops, runtime, safety, spawn};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    time::Duration,
};

/// Cap on a request body — the kernel API only ever receives short JSON/text, so an
/// attacker-declared huge Content-Length must not drive an unbounded allocation.
const MAX_BODY: usize = 1 << 20; // 1 MiB
/// Slow-loris bound: a client that stops sending mid-request can't pin the (serial) loop.
const READ_TIMEOUT: Duration = Duration::from_secs(15);

pub fn serve(state: app::State, port: u16) -> Result<(), String> {
    let addr = format!("127.0.0.1:{port}");
    let listener = TcpListener::bind(&addr).map_err(|e| e.to_string())?;
    // Per-install API token (0600). Non-browser callers (the TS client) must present it
    // so a different LOCAL user — who can't read the 0600 file — can't drive the API.
    app::ensure_private_dir(&state.data_dir).map_err(|e| e.to_string())?; // token write needs .vanta/ (0700)
    let token = crate::audit::load_or_create_token(&state.data_dir, "api-token")?;
    println!("Vanta cockpit: http://{addr}");
    for stream in listener.incoming() {
        match stream {
            Ok(mut s) => {
                let _ = s.set_read_timeout(Some(READ_TIMEOUT));
                // One bad/slow request must never take the whole kernel down.
                if let Err(err) = handle(&mut s, &state, &token) {
                    eprintln!("request error: {err}");
                }
            }
            Err(err) => eprintln!("connection error: {err}"),
        }
    }
    Ok(())
}

fn handle(stream: &mut TcpStream, state: &app::State, token: &str) -> Result<(), String> {
    let mut buf = [0_u8; 8192];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let mut parts = req.splitn(2, "\r\n\r\n");
    let head = parts.next().unwrap_or_default();
    let first_body = parts.next().unwrap_or_default();
    let body = read_body(stream, head, first_body)?;

    // Authenticate /api/*: foreign browser origin → 403 (CSRF); same-origin cockpit
    // (loopback Origin) → ok; non-browser callers must present the per-install token.
    if request_path(head).starts_with("/api/") {
        match api_auth(head, token) {
            ApiAuth::Forbidden => return forbidden(stream),
            ApiAuth::Unauthorized => return unauthorized(stream),
            ApiAuth::Ok => {}
        }
    }

    if head.starts_with("GET /api/status") {
        json(
            stream,
            &format!(
                "{{\"status\":\"ready\",\"root\":\"{}\"}}",
                app::esc(&state.root.display().to_string())
            ),
        )
    } else if head.starts_with("GET /api/approvals") {
        json(stream, &approvals::list_file_json(state)?)
    } else if head.starts_with("POST /api/approvals/propose") {
        match approvals::propose_file(state, body.trim()) {
            Ok(item) => json(stream, &item.to_json()),
            Err(err) => json(stream, &format!("{{\"error\":\"{}\"}}", app::esc(&err))),
        }
    } else if head.starts_with("POST /api/approvals/approve/") {
        let id = path_id(head, "/api/approvals/approve/");
        match approvals::decide_file(state, id, true) {
            Ok(item) => json(stream, &item.to_json()),
            Err(err) => json(stream, &format!("{{\"error\":\"{}\"}}", app::esc(&err))),
        }
    } else if head.starts_with("POST /api/approvals/deny/") {
        let id = path_id(head, "/api/approvals/deny/");
        match approvals::decide_file(state, id, false) {
            Ok(item) => json(stream, &item.to_json()),
            Err(err) => json(stream, &format!("{{\"error\":\"{}\"}}", app::esc(&err))),
        }
    } else if head.starts_with("GET /api/goals") {
        json(stream, &goals::list_file_json(state)?)
    } else if head.starts_with("POST /api/goals/add") {
        match goals::add_file(state, body.trim()) {
            Ok(item) => json(stream, &item.to_json()),
            Err(err) => json(stream, &format!("{{\"error\":\"{}\"}}", app::esc(&err))),
        }
    } else if head.starts_with("POST /api/goals/complete/") {
        let id = path_id(head, "/api/goals/complete/");
        match goals::complete_file(state, id) {
            Ok(item) => json(stream, &item.to_json()),
            Err(err) => json(stream, &format!("{{\"error\":\"{}\"}}", app::esc(&err))),
        }
    } else if head.starts_with("GET /api/loops") {
        json(stream, &loops::list_json(state))
    } else if head.starts_with("POST /api/loops/clear/") {
        let rest = path_tail(head, "/api/loops/clear/");
        let (id, esc) = rest.split_once('/').unwrap_or((rest, ""));
        respond_result(stream, loops::clear_escalation(state, id, esc))
    } else if head.starts_with("POST /api/loops/pause/") {
        respond_result(stream, loops::set_status(state, path_tail(head, "/api/loops/pause/"), "paused"))
    } else if head.starts_with("POST /api/loops/resume/") {
        respond_result(stream, loops::set_status(state, path_tail(head, "/api/loops/resume/"), "active"))
    } else if head.starts_with("POST /api/loops/kill/") {
        respond_result(stream, loops::set_status(state, path_tail(head, "/api/loops/kill/"), "killed"))
    } else if head.starts_with("POST /api/run") {
        json(
            stream,
            &runtime::run_native(&state.root, body.trim()).to_json(),
        )
    } else if head.starts_with("POST /api/assess") {
        let verdict = safety::assess_action(body.trim(), &state.root);
        json(stream, &verdict.to_json())
    } else if head.starts_with("POST /api/spawn") {
        let (parent, child, depth) = spawn::parse_request(body.trim());
        let verdict = spawn::check_and_record(state, &parent, &child, depth);
        json(stream, &verdict.to_json())
    } else if head.starts_with("POST /api/log") {
        match app::append_event(state, body.trim()) {
            Ok(()) => json(stream, "{\"logged\":true}"),
            Err(err) => json(stream, &format!("{{\"error\":\"{}\"}}", app::esc(&err))),
        }
    } else {
        html(stream, INDEX)
    }
}

fn path_id(head: &str, prefix: &str) -> usize {
    head.split_whitespace()
        .nth(1)
        .and_then(|path| path.strip_prefix(prefix))
        .and_then(|id| id.parse().ok())
        .unwrap_or(0)
}

/// The raw path remainder after a prefix — for string ids (loop slugs).
fn path_tail<'a>(head: &'a str, prefix: &str) -> &'a str {
    head.split_whitespace()
        .nth(1)
        .and_then(|path| path.strip_prefix(prefix))
        .unwrap_or("")
}

/// The request path (2nd token of the request line).
fn request_path(head: &str) -> &str {
    head.split_whitespace().nth(1).unwrap_or("/")
}

/// True if a browser marked this request cross-origin (Origin/Referer present and not
/// loopback). Browsers always send Origin on a cross-site fetch, so this is a reliable
/// CSRF signal; non-browser clients (curl, the TS safety-client) send none → allowed.
/// A `null` / non-loopback Origin (sandboxed iframe, file://, evil.com) is refused.
fn cross_origin(head: &str) -> bool {
    head.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        let val = lower
            .strip_prefix("origin:")
            .or_else(|| lower.strip_prefix("referer:"));
        match val.map(str::trim) {
            Some(host) => {
                !(host.contains("//127.0.0.1") || host.contains("//localhost") || host.contains("//[::1]"))
            }
            None => false,
        }
    })
}

/// True if any Origin/Referer header names a loopback host (a same-origin cockpit call).
fn has_loopback_origin(head: &str) -> bool {
    head.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower
            .strip_prefix("origin:")
            .or_else(|| lower.strip_prefix("referer:"))
            .map(str::trim)
            .map(|h| h.contains("//127.0.0.1") || h.contains("//localhost") || h.contains("//[::1]"))
            .unwrap_or(false)
    })
}

/// Extract a bearer/X-Vanta-Token header value (case-insensitive name, value preserved).
fn header_token(head: &str) -> Option<String> {
    head.lines().find_map(|line| {
        let (name, val) = line.split_once(':')?;
        let val = val.trim();
        match name.trim().to_ascii_lowercase().as_str() {
            "authorization" => val.strip_prefix("Bearer ").or_else(|| val.strip_prefix("bearer ")).map(|t| t.trim().to_string()),
            "x-vanta-token" => Some(val.to_string()),
            _ => None,
        }
    })
}

enum ApiAuth {
    Ok,
    Forbidden,
    Unauthorized,
}

/// Authorize an /api/* request. `/api/status` is open (launcher readiness poll); a
/// foreign browser origin is CSRF (Forbidden); a same-origin cockpit call is trusted;
/// everything else (curl, the TS client, another local process) must present the token.
fn api_auth(head: &str, token: &str) -> ApiAuth {
    if request_path(head).starts_with("/api/status") {
        return ApiAuth::Ok;
    }
    if cross_origin(head) {
        return ApiAuth::Forbidden;
    }
    if has_loopback_origin(head) {
        return ApiAuth::Ok;
    }
    if header_token(head).as_deref() == Some(token) {
        ApiAuth::Ok
    } else {
        ApiAuth::Unauthorized
    }
}

fn forbidden(stream: &mut TcpStream) -> Result<(), String> {
    write_status(stream, "403 Forbidden", "{\"error\":\"cross-origin request refused\"}")
}

fn unauthorized(stream: &mut TcpStream) -> Result<(), String> {
    write_status(stream, "401 Unauthorized", "{\"error\":\"missing or invalid API token\"}")
}

fn write_status(stream: &mut TcpStream, status: &str, body: &str) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream.write_all(response.as_bytes()).map_err(|e| e.to_string())
}

/// Module results → JSON over the wire: Ok payloads pass through, Err becomes
/// an {"error": …} object the cockpit can render.
fn respond_result(stream: &mut TcpStream, result: Result<String, String>) -> Result<(), String> {
    match result {
        Ok(body) => json(stream, &body),
        Err(err) => json(stream, &format!("{{\"error\":\"{}\"}}", app::esc(&err))),
    }
}

fn read_body(stream: &mut TcpStream, head: &str, first_body: &str) -> Result<String, String> {
    let wanted = head
        .lines()
        .find_map(|line| line.strip_prefix("Content-Length: "))
        .and_then(|n| n.trim().parse::<usize>().ok())
        .unwrap_or(first_body.len())
        .min(MAX_BODY); // clamp (don't error → don't kill the loop) so a huge declared length can't OOM us
    let mut body = first_body.as_bytes().to_vec();
    body.truncate(MAX_BODY);
    while body.len() < wanted {
        let mut more = vec![0_u8; wanted - body.len()];
        let n = stream.read(&mut more).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&more[..n]);
    }
    String::from_utf8(body).map_err(|e| e.to_string())
}

fn html(stream: &mut TcpStream, body: &str) -> Result<(), String> {
    write_response(stream, "text/html; charset=utf-8", body)
}

fn json(stream: &mut TcpStream, body: &str) -> Result<(), String> {
    write_response(stream, "application/json", body)
}

fn write_response(stream: &mut TcpStream, mime: &str, body: &str) -> Result<(), String> {
    // No `Access-Control-Allow-Origin: *` — the cockpit is same-origin, and advertising
    // wildcard CORS would let any web page READ kernel API responses. Same-origin XHR
    // needs no CORS header; cross-origin reads are now refused by omission + cross_origin().
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nX-Content-Type-Options: nosniff\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{api_auth, cross_origin, request_path, ApiAuth};

    #[test]
    fn api_auth_enforces_token_and_origin() {
        let tok = "deadbeefcafe";
        let ck = |h: &str| matches!(api_auth(h, tok), ApiAuth::Ok);
        // health is open so the launcher can poll readiness without the token
        assert!(ck("GET /api/status HTTP/1.1\r\n"));
        // same-origin cockpit (loopback Origin) → ok, no token needed
        assert!(ck("POST /api/goals/add HTTP/1.1\r\nOrigin: http://127.0.0.1:7788\r\n"));
        // non-browser caller WITH the valid token → ok (the TS client path)
        assert!(ck("POST /api/run HTTP/1.1\r\nAuthorization: Bearer deadbeefcafe\r\n"));
        assert!(ck("POST /api/run HTTP/1.1\r\nX-Vanta-Token: deadbeefcafe\r\n"));
        // foreign origin → forbidden (CSRF)
        assert!(matches!(api_auth("POST /api/run HTTP/1.1\r\nOrigin: https://evil.com\r\n", tok), ApiAuth::Forbidden));
        // no origin + no/wrong token → unauthorized (rogue local process)
        assert!(matches!(api_auth("POST /api/run HTTP/1.1\r\nContent-Length: 1\r\n", tok), ApiAuth::Unauthorized));
        assert!(matches!(api_auth("POST /api/run HTTP/1.1\r\nAuthorization: Bearer wrong\r\n", tok), ApiAuth::Unauthorized));
    }

    #[test]
    fn cross_origin_blocks_foreign_and_allows_loopback() {
        assert!(cross_origin("POST /api/goals/add HTTP/1.1\r\nOrigin: https://evil.com\r\n"));
        assert!(cross_origin("POST /api/run HTTP/1.1\r\nOrigin: null\r\n"));
        assert!(cross_origin("GET /api/goals HTTP/1.1\r\nReferer: http://attacker.test/x\r\n"));
        assert!(!cross_origin("POST /api/goals/add HTTP/1.1\r\nOrigin: http://127.0.0.1:7788\r\n"));
        assert!(!cross_origin("GET /api/status HTTP/1.1\r\nReferer: http://localhost:7788/\r\n"));
        assert!(!cross_origin("POST /api/run HTTP/1.1\r\nContent-Length: 3\r\n")); // no Origin = curl/TS client
    }

    #[test]
    fn request_path_reads_the_second_token() {
        assert_eq!(request_path("POST /api/run HTTP/1.1"), "/api/run");
        assert_eq!(request_path("garbage"), "/");
    }
}

const INDEX: &str = include_str!("cockpit.html");
