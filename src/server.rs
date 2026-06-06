use crate::{app, approvals, bridge, goals, runtime, safety};
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
                bridge::detect_hermes().to_json()
            ),
        )
    } else if head.starts_with("GET /api/bridge/status") {
        json(stream, &bridge::detect_hermes().to_json())
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

const INDEX: &str = r#"<!doctype html>
<html><head><meta charset="utf-8"><title>Vanta</title>
<style>
body{margin:0;background:#050505;color:#f4f4f0;font:16px -apple-system,BlinkMacSystemFont,Inter,sans-serif}
main{max-width:980px;margin:0 auto;padding:42px 24px}.tag{color:#9cffc7}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{border:1px solid #2a2a2a;background:#101010;border-radius:18px;padding:20px}textarea{width:100%;min-height:130px;border-radius:14px;border:1px solid #333;background:#050505;color:#fff;padding:14px;font:inherit;box-sizing:border-box}
button{margin-top:12px;border:0;border-radius:999px;background:#9cffc7;color:#000;padding:12px 18px;font-weight:800;cursor:pointer}pre{white-space:pre-wrap;background:#050505;border-radius:14px;padding:14px;border:1px solid #222}.pill{display:inline-block;border:1px solid #333;border-radius:999px;padding:6px 10px;margin:4px;color:#bbb}@media(max-width:760px){.grid{grid-template-columns:1fr}}
</style></head><body><main>
<p class="tag">Vanta // trusted operator agent</p><h1>Know the goal. Know the boundary. Act verified.</h1>
<div class="grid"><section class="card"><h2>Ask Vanta before action</h2><textarea id="action">edit README inside Nexarion Agent</textarea><button onclick="assess()">Assess action</button><button onclick="runNative()">Run native</button><button onclick="planBridge()">Plan Hermes bridge</button><pre id="out">waiting</pre></section>
<section class="card"><h2>Hermes bridge</h2><p id="bridge">checking...</p><p>For now Nexarion gates prompts before Hermes. The long-term target is an independent operator runtime past Hermes code.</p><span class="pill">guard first</span><span class="pill">no auto-exec</span><span class="pill">replace Hermes later</span></section>
<section class="card"><h2>Native approvals</h2><p>Ask-risk actions now queue inside Nexarion before any tool or Hermes handoff.</p><button onclick="proposeApproval()">Queue approval</button><button onclick="loadApprovals()">Refresh queue</button><pre id="approvals">[]</pre></section>
<section class="card"><h2>Goal ledger</h2><p>Nexarion now keeps project-local goals, so action checks have a native operating target.</p><button onclick="addGoal()">Add goal from text</button><button onclick="loadGoals()">Refresh goals</button><pre id="goals">[]</pre></section>
<section class="card"><h2>Rule zero</h2><p>Do no harm. Deletes, overwrites, secret leaks, blackmail, and outside-scope edits are blocked or require Jason.</p><span class="pill">scope-aware</span><span class="pill">no deletes</span><span class="pill">visible decisions</span><span class="pill">Hermes bridge now</span></section></div>
</main><script>
async function assess(){const r=await fetch('/api/assess',{method:'POST',body:document.getElementById('action').value});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}
async function runNative(){const r=await fetch('/api/run',{method:'POST',body:document.getElementById('action').value});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}
async function planBridge(){const r=await fetch('/api/bridge/plan',{method:'POST',body:document.getElementById('action').value});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}
async function proposeApproval(){const r=await fetch('/api/approvals/propose',{method:'POST',body:document.getElementById('action').value});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2);loadApprovals()}
async function loadApprovals(){const r=await fetch('/api/approvals');document.getElementById('approvals').textContent=JSON.stringify(await r.json(),null,2)}
async function addGoal(){const r=await fetch('/api/goals/add',{method:'POST',body:document.getElementById('action').value});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2);loadGoals()}
async function loadGoals(){const r=await fetch('/api/goals');document.getElementById('goals').textContent=JSON.stringify(await r.json(),null,2)}
async function bridgeStatus(){const r=await fetch('/api/bridge/status');const j=await r.json();document.getElementById('bridge').textContent=j.available?j.version:'Hermes not found: '+j.note}bridgeStatus();loadApprovals();loadGoals();
</script></body></html>"#;
