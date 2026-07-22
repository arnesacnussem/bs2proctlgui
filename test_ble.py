#!/usr/bin/env python3
"""BS2PRO BLE protocol test script. Connects, sends speed commands, reads notifications."""

import asyncio
import struct
import sys
import time

try:
    from bleak import BleakClient, BleakScanner
except ImportError:
    sys.exit("pip install bleak")

DEVICE_TARGET = "FlyDigi BS2PRO"
DEVICE_ADDR = "E4:E6:E5:10:B7:BF"

NOTIFY_UUID = "0000fff1-0000-1000-8000-00805f9b34fb"
WRITE_UUID = "0000fff2-0000-1000-8000-00805f9b34fb"


def build_set_speed(rpm: int) -> bytes:
    pkt = bytearray(24)
    pkt[0] = 0x5A
    pkt[1] = 0xA5
    pkt[2] = 0x26
    pkt[3] = 0x05
    pkt[4] = 0x00
    pkt[5] = rpm & 0xFF
    pkt[6] = (rpm >> 8) & 0xFF
    pkt[7] = (pkt[2] + pkt[3] + pkt[4] + pkt[5] + pkt[6]) & 0xFF
    return bytes(pkt)


def parse_notify(data: bytes):
    if len(data) < 10 or data[0] != 0x5A or data[1] != 0xA5:
        return None
    msg_type = data[2]
    current = data[7] | (data[8] << 8)
    target = data[9] | (data[10] << 8)
    rpm = target - (target - current) / 10
    return msg_type, current, target, round(rpm)


class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.messages = []

    def ok(self, msg):
        self.passed += 1
        self.messages.append(f"  PASS  {msg}")
        print(f"  PASS  {msg}")

    def fail(self, msg):
        self.failed += 1
        self.messages.append(f"  FAIL  {msg}")
        print(f"  FAIL  {msg}")

    def info(self, msg):
        self.messages.append(f"  INFO  {msg}")
        print(f"  INFO  {msg}")

    def summary(self):
        print(f"\n{'='*50}")
        print(f"Results: {self.passed} passed, {self.failed} failed")
        ok = self.failed == 0
        print(f"Overall: {'PASS' if ok else 'FAIL'}")
        return ok


async def main():
    result = TestResult()
    print("=" * 50)
    print("BS2PRO BLE Protocol Test")
    print("=" * 50)

    # --- Scan ---
    print("\n[1] Scanning...")
    device = None
    try:
        devices = await BleakScanner.discover(timeout=10)
        for d in devices:
            if d.address.upper() == DEVICE_ADDR.upper() or d.name == DEVICE_TARGET:
                device = d
                break
            print(f"  found: {d.name} [{d.address}]")
    except Exception as e:
        result.fail(f"Scan error: {e}")
        return result.summary()

    if device is None:
        result.fail(f"Device not found: {DEVICE_ADDR}")
        return result.summary()

    result.ok(f"Found device: {device.name} [{device.address}]")

    # --- Connect ---
    print("\n[2] Connecting...")
    notify_queue: asyncio.Queue = asyncio.Queue()

    def notify_handler(_sender, data):
        parsed = parse_notify(data)
        if parsed:
            notify_queue.put_nowait(parsed)

    try:
        async with BleakClient(device.address, timeout=15) as client:
            if not client.is_connected:
                result.fail("Not connected after client init")
                return result.summary()
            result.ok("Connected")

            await client.start_notify(NOTIFY_UUID, notify_handler)
            result.ok(f"Subscribed to {NOTIFY_UUID[-4:]}")

            # --- Wait for initial notification ---
            print("\n[3] Waiting for first notification...")
            try:
                note = await asyncio.wait_for(notify_queue.get(), timeout=5)
                result.ok(f"Notification received: type=0x{note[0]:02X} cur={note[1]} target={note[2]} rpm={note[3]}")
            except asyncio.TimeoutError:
                result.fail("No notification received (timeout)")

            # --- Test speed commands ---
            print("\n[4] Testing speed commands...")
            speeds = [1500, 2000, 1300]

            for rpm in speeds:
                pkt = build_set_speed(rpm)
                await client.write_gatt_char(WRITE_UUID, pkt, response=False)
                result.info(f"Sent setSpeed({rpm}) -> {pkt[:8].hex()}")

                await asyncio.sleep(2)

                try:
                    note = await asyncio.wait_for(notify_queue.get(), timeout=3)
                    result.ok(f"After setSpeed({rpm}): cur={note[1]} target={note[2]} rpm={note[3]}")
                except asyncio.TimeoutError:
                    result.fail(f"No notification after setSpeed({rpm})")

                # Drain queue
                while not notify_queue.empty():
                    notify_queue.get_nowait()

            # --- Stop notify ---
            await client.stop_notify(NOTIFY_UUID)
            result.ok("Unsubscribed")

    except asyncio.TimeoutError:
        result.fail("Connection timeout")
    except Exception as e:
        result.fail(f"Error: {type(e).__name__}: {e}")

    return result.summary()


if __name__ == "__main__":
    ok = asyncio.run(main())
    sys.exit(0 if ok else 1)
