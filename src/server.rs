use crate::{app, approvals, bridge, goals, loops, runtime, safety};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
};

pub fn serve(state: app::State, port: u16) -> Result<(), String> {
    let addr = format!("127.0.0.1:{port}");
    let listener = TcpListener::bind(&addr).map_err(|e| e.to_string())?;
    println!("Vanta cockpit: http://{addr}");
    for stream in listener.incoming() {
        match stream {
            Ok(mut s) => handle(&mut s, &state)?,
            Err(err) => eprintln!("connection error: {err}"),
        }
    }
    Ok(())
}

fn handle(stream: &mut TcpStream, state: &app::State) -> Result<(), String> {
    let mut buf = [0_u8; 8192];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let mut parts = req.splitn(2, "\r\n\r\n");
    let head = parts.next().unwrap_or_default();
    let first_body = parts.next().unwrap_or_default();
    let body = read_body(stream, head, first_body)?;

    if head.starts_with("GET /api/status") {
        json(
            stream,
            &format!(
                "{{\"status\":\"ready\",\"root\":\"{}\",\"bridge\":{}}}",
                app::esc(&state.root.display().to_string()),
                bridge::detect_agent_bridge().to_json()
            ),
        )
    } else if head.starts_with("GET /api/bridge/status") {
        json(stream, &bridge::detect_agent_bridge().to_json())
    } else if head.starts_with("POST /api/bridge/plan") {
        json(
            stream,
            &bridge::plan_prompt(&state.root, body.trim()).to_json(),
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
        .unwrap_or(first_body.len());
    let mut body = first_body.as_bytes().to_vec();
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
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|e| e.to_string())
}

const INDEX: &str = include_str!("cockpit.html");
