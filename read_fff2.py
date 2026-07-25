import asyncio
from bleak import BleakClient, BleakScanner

ADDR = "E4:66:E5:10:B7:BF"

async def main():
    device = None
    devices = await BleakScanner.discover(timeout=5)
    for d in devices:
        if d.address.strip().upper() == ADDR:
            device = d
            break
    if not device:
        print("not found")
        return

    async with BleakClient(device, timeout=15) as client:
        print(f"connected: {client.is_connected}")
        for svc in client.services:
            print(f"\nService {svc.uuid} ({svc.description}):")
            for ch in svc.characteristics:
                props = ",".join(ch.properties)
                desc = ch.description or ""
                print(f"  {ch.uuid} [{props}] {desc}")
                if "read" in ch.properties:
                    try:
                        data = await client.read_gatt_char(ch.uuid)
                        if len(data) > 0:
                            print(f"    -> read {len(data)}b: {data.hex(' ')}")
                            try:
                                s = data.decode('ascii', errors='replace')
                                if s.isprintable():
                                    print(f"       ascii: {s}")
                            except: pass
                        else:
                            print(f"    -> read 0b (empty)")
                    except Exception as e:
                        print(f"    -> read err: {type(e).__name__}: {e}")

asyncio.run(main())
