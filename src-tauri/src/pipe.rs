use std::io;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

const PIPE_NAME: &str = r"\\.\pipe\bs2proctl";

pub fn start(app: AppHandle) {
    tauri::async_runtime::handle().spawn(async move {
        // First instance owns the pipe; prevents a second running app from
        // also claiming it.
        let mut server = match ServerOptions::new()
            .first_pipe_instance(true)
            .create(PIPE_NAME)
        {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[pipe] create err: {e}");
                return;
            }
        };

        loop {
            if let Err(e) = server.connect().await {
                eprintln!("[pipe] connect err: {e}");
                continue;
            }

            let connected = server;
            // Create the next instance before handling this one so that a
            // waiting client never sees ERROR_PIPE_BUSY / NotFound.
            server = match ServerOptions::new().create(PIPE_NAME) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[pipe] create err: {e}");
                    return;
                }
            };

            let conn_app = app.clone();
            tauri::async_runtime::handle().spawn(async move {
                handle_client(connected, conn_app).await;
            });
        }
    });
}

fn light_for_rpm(rpm: u32) -> u8 {
    if rpm < 2000 {
        0
    } else if rpm < 3000 {
        1
    } else if rpm < 3500 {
        2
    } else {
        3
    }
}

async fn read_line(pipe: &mut NamedPipeServer) -> io::Result<String> {
    let mut buf: Vec<u8> = Vec::with_capacity(64);
    let mut byte = [0u8; 1];
    loop {
        let n = pipe.read(&mut byte).await?;
        if n == 0 {
            break;
        }
        if byte[0] == b'\n' {
            break;
        }
        if byte[0] != b'\r' {
            buf.push(byte[0]);
        }
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

async fn handle_command(line: &str, app: &AppHandle) -> String {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.is_empty() {
        return "ERR empty command".into();
    }

    match parts[0].to_ascii_uppercase().as_str() {
        "PING" | "ECHO" => "OK pong".into(),
        "GET" => {
            let connected = tauri_plugin_blec::get_handler()
                .map(|h| h.is_connected())
                .unwrap_or(false);
            format!("OK connected={connected}")
        }
        "SETGEAR" => {
            let Some(arg) = parts.get(1).map(|s| s.to_ascii_lowercase()) else {
                return "ERR usage: SETGEAR <gear|max>".into();
            };
            let max = crate::charge_max_rpm(crate::current_charge_mode());
            let rpm = match arg.as_str() {
                "max" => max,
                s => match s.parse::<u32>() {
                    Ok(g) => (g * 100).clamp(1300, max),
                    Err(_) => return "ERR usage: SETGEAR <gear|max>".into(),
                },
            };
            let light = light_for_rpm(rpm);
            let result = write_with_timeout(rpm as u16, light, app).await;
            format!("OK rpm={rpm} max={max} light={light} {result}")
        }
        "MAX" => {
            let rpm = crate::charge_max_rpm(crate::current_charge_mode());
            let light = light_for_rpm(rpm);
            let result = write_with_timeout(rpm as u16, light, app).await;
            format!("OK max rpm={rpm} light={light} {result}")
        }
        "SET" => {
            let Some(rpm) = parts.get(1).and_then(|s| s.parse::<u16>().ok()) else {
                return "ERR usage: SET <rpm> [light]".into();
            };
            let max = crate::charge_max_rpm(crate::current_charge_mode());
            let rpm = (rpm as u32).clamp(1300, max) as u16;
            let light = parts
                .get(2)
                .and_then(|s| s.parse::<u8>().ok())
                .unwrap_or_else(|| light_for_rpm(rpm as u32));
            let result = write_with_timeout(rpm, light, app).await;
            format!("OK rpm={rpm} max={max} light={light} {result}")
        }
        other => format!("ERR unknown command: {other}"),
    }
}

async fn write_with_timeout(rpm: u16, light: u8, app: &AppHandle) -> String {
    match tokio::time::timeout(Duration::from_secs(5), crate::write_speed(rpm, light)).await {
        Ok(Ok(m)) => {
            let _ = app.emit("fan-speed-set", serde_json::json!({ "rpm": rpm, "light": light }));
            m
        }
        Ok(Err(e)) => format!("write failed: {e}"),
        Err(_) => "write timed out (device not responding)".into(),
    }
}

async fn handle_client(mut pipe: NamedPipeServer, app: AppHandle) {
    loop {
        let line = match read_line(&mut pipe).await {
            Ok(l) if l.is_empty() => break,
            Ok(l) => l,
            Err(_) => break,
        };

        let resp = handle_command(&line, &app).await;
        let mut out = resp.into_bytes();
        out.push(b'\n');
        if pipe.write_all(&out).await.is_err() || pipe.flush().await.is_err() {
            break;
        }
    }
    let _ = pipe.disconnect();
}