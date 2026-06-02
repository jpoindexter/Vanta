mod app;
mod approvals;
mod bridge;
mod goals;
mod runtime;
mod safety;
mod server;

use std::{env, process};

fn main() {
    // ARGO_ROOT lets the kernel operate on an explicit project dir instead of
    // cwd — needed for multi-project use and for launchers that cannot control cwd.
    let root = match env::var("ARGO_ROOT") {
        Ok(path) if !path.trim().is_empty() => std::path::PathBuf::from(path),
        _ => env::current_dir().unwrap_or_else(|err| {
            eprintln!("failed to read cwd: {err}");
            process::exit(2);
        }),
    };
    let state = app::State::new(root);
    let mut args = env::args().skip(1);
    let command = args.next().unwrap_or_else(|| "doctor".to_string());

    let result = match command.as_str() {
        "doctor" => app::doctor(&state),
        "assess" => {
            let text = args.collect::<Vec<_>>().join(" ");
            app::assess(&state, &text)
        }
        "scope" => {
            let path = args.collect::<Vec<_>>().join(" ");
            app::scope(&state, &path)
        }
        "log" => {
            let text = args.collect::<Vec<_>>().join(" ");
            app::log_event(&state, &text)
        }
        "bridge" => match args.next().as_deref() {
            Some("status") => {
                println!("{}", bridge::detect_hermes().to_json());
                Ok(())
            }
            Some("plan") => {
                let prompt = args.collect::<Vec<_>>().join(" ");
                println!("{}", bridge::plan_prompt(&state.root, &prompt).to_json());
                Ok(())
            }
            _ => Err("try: bridge status | bridge plan <prompt>".to_string()),
        },
        "approvals" => match args.next().as_deref() {
            Some("propose") => {
                let text = args.collect::<Vec<_>>().join(" ");
                approvals::propose_file(&state, &text).map(|item| println!("{}", item.to_json()))
            }
            Some("list") => approvals::list_file_json(&state).map(|json| println!("{}", json)),
            Some("approve") => {
                let id = args.next().and_then(|v| v.parse().ok()).unwrap_or(0);
                approvals::decide_file(&state, id, true).map(|item| println!("{}", item.to_json()))
            }
            Some("deny") => {
                let id = args.next().and_then(|v| v.parse().ok()).unwrap_or(0);
                approvals::decide_file(&state, id, false).map(|item| println!("{}", item.to_json()))
            }
            _ => Err("try: approvals propose <action> | list | approve <id> | deny <id>".to_string()),
        },
        "goals" => match args.next().as_deref() {
            Some("add") => {
                let text = args.collect::<Vec<_>>().join(" ");
                goals::add_file(&state, &text).map(|item| println!("{}", item.to_json()))
            }
            Some("list") => goals::list_file_json(&state).map(|json| println!("{}", json)),
            Some("complete") => {
                let id = args.next().and_then(|v| v.parse().ok()).unwrap_or(0);
                goals::complete_file(&state, id).map(|item| println!("{}", item.to_json()))
            }
            _ => Err("try: goals add <goal> | list | complete <id>".to_string()),
        },
        "run" => {
            let instruction = args.collect::<Vec<_>>().join(" ");
            println!("{}", runtime::run_native(&state.root, &instruction).to_json());
            Ok(())
        }
        "serve" => {
            let port = args.next().and_then(|p| p.parse().ok()).unwrap_or(7788);
            server::serve(state, port)
        }
        _ => Err(format!(
            "unknown command: {command}\ntry: doctor | assess | scope | log | bridge | approvals | goals | run | serve"
        )),
    };

    if let Err(err) = result {
        eprintln!("{err}");
        process::exit(1);
    }
}
