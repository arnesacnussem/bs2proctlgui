import asyncio
from bleak import BleakClient, BleakScanner

DEVICE_NAME = "FlyDigi BS2PRO"

# -------------------------------
# 协议部分：帧组装与解析
# -------------------------------
def build_set_speed_cmd(rpm: int) -> bytes:
    """
    Build a 24-byte set speed command packet.

    Args:
        rpm: Target RPM value (0-65535)

    Returns:
        24-byte packet as bytes
    """
    # Start with the basic packet structure
    packet = bytearray(24)

    # Header
    packet[0] = 0x5A
    packet[1] = 0xA5

    # Type
    packet[2] = 0x26

    # Length
    packet[3] = 0x05

    # Flag (you might need to adjust this based on your specific use case)
    # From your examples: 00, 01, 02, 03 - you may want to parameterize this
    packet[4] = 0x00  # Default to 0x00, adjust as needed

    # RPM in little-endian (bytes 5-6)
    packet[5] = rpm & 0xFF  # Low byte
    packet[6] = (rpm >> 8) & 0xFF  # High byte

    # Checksum (byte 7)
    packet[7] = (packet[2] + packet[3] + packet[4] + packet[5] + packet[6]) & 0xFF

    # Remaining bytes 8-23 stay as 0x00 (already initialized)

    return bytes(packet)


def build_ramp_cmd(step: int) -> bytes:
    # 5A A5 47 <step>
    return bytes([0x5A, 0xA5, 0x47, step & 0xFF])


def read_pkt(_pkt):
    pkt = _pkt.split(":")
    print(":".join(pkt))
    values = [int(x, 16) for x in pkt]
    rpm = values[8] * 256 + values[7]
    target = values[10] * 256 + values[9]
    diff = (target - rpm) / 10
    return target - diff


def parse_notify(data: bytes):
    if len(data) < 10 or data[0] != 0x5A or data[1] != 0xA5:
        return {"type": None, "rpm": None, "raw": data.hex(" ")}
    msg_type = data[2]
    current = int.from_bytes(data[7:9], "little")
    target = int.from_bytes(data[9:11], "little")
    diff = (target - current) / 10
    rpm = target - diff
    return {"type": msg_type, "rpm": rpm, "raw": data.hex(" ")}


# -------------------------------
# 主逻辑
# -------------------------------
async def main():
    # 1. 扫描设备
    # print("🔍 Scanning for device...")
    # devices = await BleakScanner.discover()
    # target = next((d for d in devices if DEVICE_NAME in (d.name or "")), None)
    # if not target:
    #     print("Device not found.")
    #     return
    # print(f"✅ Found {target.name} [{target.address}]")

    async with BleakClient("E4:66:E5:10:B7:BF") as client:
        print("🔗 Connected.")
        services = client.services

        # 寻找 notify 和 write 特征
        UUID_NOTIFY = "0000fff1-0000-1000-8000-00805f9b34fb"
        UUID_WRITE = "0000fff2-0000-1000-8000-00805f9b34fb"

        # 2. 订阅通知
        def on_notify(handle, data):
            parsed = parse_notify(bytes(data))
            # if parsed and parsed["rpm"] is not None:
            #     print(f"📈 Notify: rpm={parsed['rpm']} type={parsed['type']:02X}")
            # else:
            print(f"🔹 Raw: {data.hex(' ')}, RPM: {parsed['rpm']}")

        await client.start_notify(UUID_NOTIFY, on_notify)
        await asyncio.sleep(1.0)

        # # -------------------------------
        # # 3. 目标值模式：直接设定转速
        # # -------------------------------
        # for rpm in [1700, 1900]:
        #     cmd = build_set_speed_cmd(rpm)
        #     print(f"⚙️  Set target rpm={rpm} → {cmd.hex(' ')}")
        #     await client.write_gatt_char(UUID_WRITE, cmd, response=True)
        #     await asyncio.sleep(10.0)

        # # -------------------------------
        # # 4. Ramp 模式：逐步递增
        # # -------------------------------
        # print("🚀 Ramp mode start")
        # for step in range(0, 31):
        #     cmd = build_ramp_cmd(step)
        #     await client.write_gatt_char(UUID_WRITE, cmd, response=False)
        #     await asyncio.sleep(0.05)  # 20Hz ramp
        # print("🏁 Ramp mode done")

        # 5. 保持接收通知
        while True:
            await asyncio.sleep(10.0)
            # await client.stop_notify(UUID_WRITE)
            # print("✅ Done.")


asyncio.run(main())
