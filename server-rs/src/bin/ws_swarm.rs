use server_rs::ws_swarm::{run_swarm, SwarmConfig};
use std::time::Duration;

#[tokio::main]
async fn main() {
    let mut addr = "127.0.0.1:2567".to_string();
    let mut clients = 50usize;
    let mut secs = 5u64;
    let mut hz = 20u32;

    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--addr" if i + 1 < args.len() => {
                addr = args[i + 1].clone();
                i += 2;
            }
            arg if arg.starts_with("--addr=") => {
                addr = arg.strip_prefix("--addr=").unwrap().to_string();
                i += 1;
            }
            "--clients" if i + 1 < args.len() => {
                if let Ok(c) = args[i + 1].parse() {
                    clients = c;
                }
                i += 2;
            }
            arg if arg.starts_with("--clients=") => {
                if let Ok(c) = arg.strip_prefix("--clients=").unwrap().parse() {
                    clients = c;
                }
                i += 1;
            }
            "--secs" if i + 1 < args.len() => {
                if let Ok(s) = args[i + 1].parse() {
                    secs = s;
                }
                i += 2;
            }
            arg if arg.starts_with("--secs=") => {
                if let Ok(s) = arg.strip_prefix("--secs=").unwrap().parse() {
                    secs = s;
                }
                i += 1;
            }
            "--hz" if i + 1 < args.len() => {
                if let Ok(h) = args[i + 1].parse() {
                    hz = h;
                }
                i += 2;
            }
            arg if arg.starts_with("--hz=") => {
                if let Ok(h) = arg.strip_prefix("--hz=").unwrap().parse() {
                    hz = h;
                }
                i += 1;
            }
            "-h" | "--help" => {
                println!("Usage: ws_swarm [--addr <ADDR>] [--clients <N>] [--secs <SECS>] [--hz <HZ>]");
                return;
            }
            _ => {
                i += 1;
            }
        }
    }

    let config = SwarmConfig {
        addr,
        clients,
        duration: Duration::from_secs(secs),
        input_hz: hz,
    };

    let report = run_swarm(config).await;
    println!("{}", report.to_markdown_table());
}
