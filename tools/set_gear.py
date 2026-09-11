#!/usr/bin/env python3
"""Control the BS2 Pro fan via the app's named pipe.

Usage (uv):
    uv run --with pywin32 python set_gear.py 13        # set gear 13 (1300 rpm)
    uv run --with pywin32 python set_gear.py 27 --raw  # send raw SETGEAR, reply verbatim
    uv run --with pywin32 python set_gear.py max       # set to max rpm for current charge mode

Usage (pip):
    pip install pywin32
    python set_gear.py 13

Gear is a two-digit number that maps to RPM x100, e.g. 13->1300, 17->1700,
19->1900, 21->2100, 24->2400, 27->2700 ...
Known gears (presets): 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26,
27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40.

"max" sets the maximum RPM allowed by the current charge mode
(not charging/5V: 2700, QC: 3300, PD: 4000).
"""

import sys

import win32file
import win32pipe
import pywintypes

PIPE_NAME = r"\\.\pipe\bs2proctl"

# two-digit gear -> (rpm, light) mapping used by the app (light = speed level)
def gear_to_rpm_light(gear: int) -> tuple[int, int]:
    rpm = max(1300, min(4000, gear * 100))
    if rpm < 2000:
        light = 0
    elif rpm < 3000:
        light = 1
    elif rpm < 3500:
        light = 2
    else:
        light = 3
    return rpm, light


def send_command(cmd: str) -> str:
    try:
        handle = win32file.CreateFile(
            PIPE_NAME,
            win32file.GENERIC_READ | win32file.GENERIC_WRITE,
            0,
            None,
            win32file.OPEN_EXISTING,
            0,
            None,
        )
    except pywintypes.error as e:
        sys.exit(f"error: cannot connect to pipe ({e.winerror}). Is the app running?")

    try:
        win32pipe.SetNamedPipeHandleState(
            handle, win32pipe.PIPE_READMODE_BYTE, None, None  # type: ignore[arg-type]
        )
    except pywintypes.error:
        pass

    try:
        win32file.WriteFile(handle, (cmd + "\r\n").encode("ascii"))  # type: ignore[arg-type]
        buf = b""
        while b"\n" not in buf:
            _, data = win32file.ReadFile(handle, 4096)  # type: ignore[arg-type]
            if not data:
                break
            buf += data  # type: ignore[operator]
        return buf.decode("utf-8", "replace").strip()
    finally:
        win32file.CloseHandle(handle)  # type: ignore[arg-type]


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    gear_arg = sys.argv[1]
    raw = "--raw" in sys.argv[2:]
    is_max = gear_arg.strip().lower() == "max"

    if is_max:
        reply = send_command("MAX")
        print(f"reply: {reply}")
        if reply.startswith("ERR"):
            sys.exit(1)
        return

    try:
        gear = int(gear_arg)
    except ValueError:
        sys.exit(f"error: '{gear_arg}' is not a number (use a gear or 'max')")

    if not (13 <= gear <= 40):
        sys.exit(f"error: gear must be between 13 and 40 (got {gear})")

    if raw:
        print(send_command(f"SETGEAR {gear}"))
        return

    rpm, light = gear_to_rpm_light(gear)
    reply = send_command(f"SETGEAR {gear}")
    print(f"gear={gear} -> rpm={rpm} light={light}")
    print(f"reply: {reply}")
    if reply.startswith("ERR"):
        sys.exit(1)


if __name__ == "__main__":
    main()