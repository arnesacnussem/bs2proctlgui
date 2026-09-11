use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use uuid::{uuid, Uuid};

#[cfg(target_os = "windows")]
mod pipe;

const FFF2: Uuid = uuid!("0000fff2-0000-1000-8000-00805f9b34fb");
const FFF0: Uuid = uuid!("0000fff0-0000-1000-8000-00805f9b34fb");

/// Current charge mode (0 = not charging, 1 = 5V, 2 = QC, 3 = PD).
/// Updated from the frontend as notify data is parsed; used by the pipe to
/// clamp the maximum RPM.
static CHARGE_MODE: AtomicU8 = AtomicU8::new(0);

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn current_charge_mode() -> u8 {
    CHARGE_MODE.load(Ordering::Relaxed)
}

/// Max RPM allowed for a given charge mode (mirrors CHARGE_MAX_RPM in the UI).
/// Mode 0/1 -> 2700, 2 (QC) -> 3300, 3 (PD) -> 4000.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn charge_max_rpm(charge_mode: u8) -> u32 {
    match charge_mode {
        2 => 3300,
        3 => 4000,
        _ => 2700,
    }
}

#[tauri::command]
fn set_charge_mode(mode: u8) {
    CHARGE_MODE.store(mode, Ordering::Relaxed);
}

pub(crate) async fn write_speed(rpm: u16, light: u8) -> Result<String, String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;

    if !handler.is_connected() {
        return Err("no device connected".into());
    }

    let mut pkt = vec![0x5Au8, 0xA5, 0x26, 0x05, light, (rpm & 0xFF) as u8, ((rpm >> 8) & 0xFF) as u8];
    let ck = pkt[2..].iter().fold(0u8, |a, b| a.wrapping_add(*b));
    pkt.push(ck);

    let msg = format!("write rpm={rpm} light={light} pkt={pkt:02x?} connected={}", handler.is_connected());
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

#[tauri::command]
async fn ble_write_test(rpm: u16, light: u8) -> Result<String, String> {
    write_speed(rpm, light).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--remote-debugging-port=9222");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_blec::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![ble_write_test, set_charge_mode])
        .setup(|app| {
            let handle = app.handle();

            let _ = handle.plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--hidden"]),
            ));

            let quit_item = MenuItemBuilder::with_id("quit", "Exit").build(app)?;
            let tray_menu = MenuBuilder::new(app).item(&quit_item).build()?;

            let mut rgba = Vec::with_capacity(32 * 32 * 4);
            for i in 0..(32 * 32) {
                let x = i % 32;
                let y = i / 32;
                let d = (x as f32 - 16.0).powi(2) + (y as f32 - 16.0).powi(2);
                if d < 13.0 * 13.0 {
                    rgba.extend_from_slice(&[0x4A, 0x9E, 0xFF, 0xFF]);
                } else {
                    rgba.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]);
                }
            }
            let icon = tauri::image::Image::new(&rgba, 32, 32);

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("BS2 Pro")
                .menu(&tray_menu)
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

            #[cfg(target_os = "windows")]
            pipe::start(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
