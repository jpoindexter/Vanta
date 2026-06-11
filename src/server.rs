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

const INDEX: &str = r##"<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vanta Kernel</title>
<style>
:root{--bg:#050505;--panel:#101010;--line:#262626;--ink:#f4f4f0;--dim:#9a9a92;--mint:#9cffc7;--amber:#ffd479;--red:#ff7a7a;--mono:ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,Inter,sans-serif}
main{max-width:960px;margin:0 auto;padding:36px 24px 60px}
header{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}
h1{font-size:20px;margin:0;letter-spacing:.04em}h1 span{color:var(--mint)}
.status{font:13px var(--mono);color:var(--dim)}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red);margin-right:6px;vertical-align:1px}.dot.on{background:var(--mint)}
.lede{color:var(--dim);margin:10px 0 28px;max-width:640px}.lede b{color:var(--ink);font-weight:600}
section{border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:20px;margin-bottom:16px}
h2{font-size:15px;margin:0 0 2px}.sub{color:var(--dim);font-size:13px;margin:0 0 14px}
label{display:block;font-size:12px;color:var(--dim);margin-bottom:6px}
textarea,input[type=text]{width:100%;border-radius:10px;border:1px solid #333;background:var(--bg);color:var(--ink);padding:11px 12px;font:13px var(--mono)}
textarea{min-height:54px;resize:vertical}
button{border:0;border-radius:8px;background:var(--mint);color:#000;padding:9px 16px;font:600 13px -apple-system,BlinkMacSystemFont,Inter,sans-serif;cursor:pointer}
button.ghost{background:transparent;color:var(--dim);border:1px solid #333}
button:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
.bar{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center}
.examples{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.examples button{background:transparent;border:1px solid #333;color:var(--dim);font-weight:400;font-family:var(--mono);font-size:12px;padding:6px 10px}
.verdict{display:none;margin-top:14px;border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--bg)}
.chip{display:inline-block;font:700 13px var(--mono);letter-spacing:.08em;border-radius:6px;padding:4px 10px;color:#000}
.chip.allow{background:var(--mint)}.chip.ask{background:var(--amber)}.chip.block{background:var(--red)}
.meaning{margin:8px 0 2px;font-weight:600}.reason{color:var(--dim);font-size:13px;font-family:var(--mono)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:760px){.cols{grid-template-columns:1fr}}
ul.rows{list-style:none;margin:0;padding:0}ul.rows li{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
ul.rows li:first-child{border-top:0}.rowtext{flex:1;min-width:0}.rowtext .t{font-family:var(--mono);font-size:13px;word-break:break-word}.rowtext .m{color:var(--dim);font-size:12px}
.badge{font:600 11px var(--mono);border-radius:5px;padding:2px 7px;color:#000;white-space:nowrap}
.badge.ask{background:var(--amber)}.badge.allow{background:var(--mint)}.badge.block{background:var(--red)}.badge.done,.badge.approved{background:#333;color:var(--dim)}.badge.denied{background:#333;color:var(--red)}.badge.active{background:var(--mint)}
.empty{color:var(--dim);font-size:13px;padding:8px 0}
.act{display:flex;gap:6px}.act button{padding:6px 12px;font-size:12px}.act .no{background:transparent;color:var(--red);border:1px solid var(--red)}
footer{color:var(--dim);font-size:13px;margin-top:24px}footer code{font-family:var(--mono);font-size:12px;color:#bdbdb4}
.note{font-size:12px;color:var(--dim);margin-top:8px}
</style></head><body><main>
<header><h1><span>VANTA</span> KERNEL</h1><p class="status"><span class="dot" id="dot"></span><span id="statusline">connecting…</span></p></header>
<p class="lede">This is the security boundary between the agent and your machine. Every action Vanta wants to take is judged here first and gets one of three verdicts: <b>allow</b> (runs), <b>ask</b> (waits for you), or <b>block</b> (refused).</p>

<section>
<h2>Test the boundary</h2>
<p class="sub">Type an action the agent might take and see the verdict it would get. Nothing runs — this only judges.</p>
<label for="action">Action to judge</label>
<textarea id="action" placeholder="e.g. read README.md and summarize it"></textarea>
<div class="bar">
<button onclick="judge()">Judge it</button>
<button class="ghost" onclick="queueApproval()" title="Push this action into the approval queue below (only ask-risk actions queue)">Queue as approval</button>
<button class="ghost" onclick="runNative()" title="Judge, then actually execute via the kernel's own dispatcher if the action maps to a supported native tool">Judge + run native</button>
</div>
<div class="examples" aria-label="examples">
<button onclick="tryExample(this)">read README.md and summarize it</button>
<button onclick="tryExample(this)">edit ~/.ssh/config</button>
<button onclick="tryExample(this)">rm -rf node_modules</button>
</div>
<div class="verdict" id="verdict" aria-live="polite"></div>
</section>

<div class="cols">
<section>
<h2>Approvals — waiting on you</h2>
<p class="sub">Ask-risk actions pause here until you decide. The agent cannot proceed on them without you.</p>
<ul class="rows" id="approvals" aria-live="polite"></ul>
</section>
<section>
<h2>Goal ledger</h2>
<p class="sub">What the agent is currently scoped to work toward. Scope checks judge actions against these.</p>
<ul class="rows" id="goals" aria-live="polite"></ul>
<div class="bar"><input type="text" id="goaltext" placeholder="add a goal…" aria-label="New goal"><button onclick="addGoal()">Add</button></div>
</section>
</div>

<footer>
<p><b>Rule zero.</b> Deletes, overwrites, secret handling, and out-of-scope writes are blocked or queued for approval — enforced here, not promised in a prompt.</p>
<p>Ledgers live in <code id="datadir">.vanta/</code> — <code>events.jsonl</code> · <code>approvals.tsv</code> · <code>goals.tsv</code>. API: <code>/api/status</code> <code>/api/assess</code> <code>/api/approvals</code> <code>/api/goals</code> <code>/api/run</code> <code>/api/log</code></p>
<p id="bridge">bridge: checking…</p>
</footer>
</main><script>
const $=id=>document.getElementById(id);
const MEANING={allow:"Would run without asking.",ask:"Would pause — queued for your approval.",block:"Refused outright — never runs."};
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function showVerdict(risk,reason,extra){const v=$("verdict");v.replaceChildren(el("span","chip "+risk,risk.toUpperCase()),el("p","meaning",MEANING[risk]||""),el("p","reason",reason||""));if(extra)v.append(el("p","note",extra));v.style.display="block"}
async function judge(){const r=await fetch("/api/assess",{method:"POST",body:$("action").value});const j=await r.json();showVerdict(j.risk,j.reason)}
function tryExample(btn){$("action").value=btn.textContent;judge()}
async function runNative(){const r=await fetch("/api/run",{method:"POST",body:$("action").value});const j=await r.json();const risk=j.decision==="allow"?"allow":j.decision;showVerdict(risk,j.output,j.executed?"Executed natively via tool: "+j.tool:"Not executed"+(j.tool?" (tool: "+j.tool+")":""))}
async function queueApproval(){const r=await fetch("/api/approvals/propose",{method:"POST",body:$("action").value});const j=await r.json();if(j.error){showVerdict("block",j.error,"Not queued — only ask-risk actions enter the approval queue.")}else{showVerdict(j.risk,j.reason,"Queued as approval #"+j.id+" — decide below.")}loadApprovals()}
function approvalRow(a){const li=el("li");const txt=el("div","rowtext");txt.append(el("div","t",a.text),el("div","m",a.reason));li.append(el("span","badge "+(a.status==="pending"?a.risk:a.status),a.status==="pending"?a.risk:a.status),txt);if(a.status==="pending"){const act=el("div","act");const ok=el("button",null,"Approve");ok.onclick=()=>decide(a.id,true);const no=el("button","no","Deny");no.onclick=()=>decide(a.id,false);act.append(ok,no);li.append(act)}return li}
async function decide(id,yes){await fetch("/api/approvals/"+(yes?"approve/":"deny/")+id,{method:"POST"});loadApprovals()}
async function loadApprovals(){const r=await fetch("/api/approvals");const items=await r.json();const ul=$("approvals");ul.replaceChildren();const pending=items.filter(a=>a.status==="pending").reverse();const decided=items.filter(a=>a.status!=="pending").reverse();if(!pending.length)ul.append(el("li","empty","Nothing waiting. When the agent hits an ask-risk action, it appears here."));pending.forEach(a=>ul.append(approvalRow(a)));if(decided.length){ul.append(el("li","empty","Recently decided ("+decided.length+" total):"));decided.slice(0,5).forEach(a=>{const li=approvalRow(a);li.style.opacity=".55";ul.append(li)})}}
function goalRow(g){const li=el("li");const txt=el("div","rowtext");txt.append(el("div","t",g.text));li.append(el("span","badge "+g.status,g.status),txt);if(g.status==="active"){const act=el("div","act");const done=el("button",null,"Done");done.onclick=async()=>{await fetch("/api/goals/complete/"+g.id,{method:"POST"});loadGoals()};act.append(done);li.append(act)}return li}
async function loadGoals(){const r=await fetch("/api/goals");const items=await r.json();const ul=$("goals");ul.replaceChildren();if(!items.length){ul.append(el("li","empty","No goals yet. Add one — actions are scope-checked against these."));return}items.slice().reverse().forEach(g=>ul.append(goalRow(g)))}
async function addGoal(){const t=$("goaltext").value.trim();if(!t)return;await fetch("/api/goals/add",{method:"POST",body:t});$("goaltext").value="";loadGoals()}
$("goaltext").addEventListener("keydown",e=>{if(e.key==="Enter")addGoal()});
$("action").addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();judge()}});
async function refreshStatus(){try{const r=await fetch("/api/status");const j=await r.json();$("dot").className="dot on";$("statusline").textContent="live · "+j.root;$("datadir").textContent=j.root+"/.vanta/";$("bridge").textContent="bridge: "+(j.bridge&&j.bridge.available?j.bridge.version+" (legacy external-agent bridge, gated)":"not installed (legacy external-agent bridge — optional)")}catch(e){$("dot").className="dot";$("statusline").textContent="kernel unreachable"}}
refreshStatus();setInterval(refreshStatus,5000);loadApprovals();loadGoals();
</script></body></html>"##;
