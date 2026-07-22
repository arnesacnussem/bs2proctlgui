use serde::Serialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use uuid::{uuid, Uuid};

const FFF2: Uuid = uuid!("0000fff2-0000-1000-8000-00805f9b34fb");
const FFF0: Uuid = uuid!("0000fff0-0000-1000-8000-00805f9b34fb");

#[tauri::command]
async fn ble_write_test(rpm: u16, app: tauri::AppHandle) -> Result<String, String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;

    if !handler.is_connected() {
        return Err("no device connected".into());
    }

    // 8-byte packet (matching demo.ipynb)
    let mut pkt = vec![0x5Au8, 0xA5, 0x26, 0x05, 0x01, (rpm & 0xFF) as u8, ((rpm >> 8) & 0xFF) as u8];
    let ck = pkt[2..].iter().fold(0u8, |a, b| a.wrapping_add(*b));
    pkt.push(ck);

    let msg = format!("write rpm={rpm} pkt={pkt:02x?} connected={}", handler.is_connected());
    println!("{msg}");

    match handler.send_data(
        FFF2,
        Some(FFF0),
        &pkt,
        tauri_plugin_blec::models::WriteType::WithResponse,
    ).await {
        Ok(_) => Ok(msg),
        Err(e) => Err(format!("{msg} | err={e}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--remote-debugging-port=9222");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_blec::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![ble_write_test])
        .setup(|app| {
            let handle = app.handle();

            let _ = handle.plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--hidden"]),
            ));

            let quit_item = MenuItemBuilder::with_id("quit", "Exit").build(app)?;
            let tray_menu = MenuBuilder::new(app).item(&quit_item).build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let window = tray.app_handle().get_webview_window("main").unwrap();
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let window = app.get_webview_window("main").unwrap();
            let window_clone = window.clone();

            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window_clone.hide();
                    api.prevent_close();
                }
            });

            if std::env::args().any(|arg| arg == "--hidden") {
                let _ = window.hide();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
