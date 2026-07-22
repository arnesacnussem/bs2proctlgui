# BS2 Pro Controller

A Tauri-based desktop application for controlling the FlyDigi BS2 Pro BLE cooling fan dock. Reverse-engineers the proprietary BLE protocol to provide manual fan speed control and real-time RPM monitoring.

## Language

**BS2 Pro**:
The FlyDigi BS2 Pro cooling fan dock — a physical device that connects via BLE and provides adjustable fan speed for laptop/handheld cooling.
_Avoid_: BS2PRO, bs2pro, device, fan dock

**RPM**:
Rotations per minute. The measure of fan speed. The BS2 Pro supports speeds from 1300 to 4000 RPM.
_Avoid_: speed (use RPM when referring to the numeric value)

**Speed Level**:
A preset fan speed tier (0–11), each mapping to a specific RPM value. Used internally by the fan curve editor.
_Avoid_: gear, step, notch

**Command**:
A BLE write packet sent from the host to the device to change its state (e.g. set fan speed).
_Avoid_: message, request, signal

**Notification**:
A BLE notification packet emitted by the device periodically (~2 Hz), reporting current RPM and other telemetry.
_Avoid_: event, update, push

**Connect / Disconnect**:
The BLE link state between the application and the BS2 Pro. Connection must be maintained to keep the device powered on — disconnecting triggers the device's auto-shutdown.
_Avoid_: pair, bond, link up/down

**Auto-start**:
The application's ability to launch at system boot, then silently reconnect to the last-used device.
_Avoid_: boot-start, startup

**System Tray**:
The application's minimized state in the Windows notification area. Left-click toggles window visibility; right-click provides the exit menu. Closing the window hides it to tray rather than exiting.
_Avoid_: taskbar, menubar, status area
