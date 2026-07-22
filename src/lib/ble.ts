// BLE protocol helpers for FlyDigi BS2PRO

/**
 * Builds a 24-byte set speed command packet.
 *
 * @param rpm - Target RPM value (0-65535)
 * @returns 24-byte packet as Uint8Array
 */
export function buildSetSpeedCmd(rpm: number): Uint8Array {
  rpm = Math.min(4000, Math.max(1300, rpm));
  const packet = new Uint8Array(24);
  packet[0] = 0x5A;
  packet[1] = 0xA5;
  packet[2] = 0x26;
  packet[3] = 0x05;
  packet[4] = 0x00;
  packet[5] = rpm & 0xFF;
  packet[6] = (rpm >> 8) & 0xFF;
  packet[7] = (packet[2] + packet[3] + packet[4] + packet[5] + packet[6]) & 0xFF;
  return packet;
}

/**
 * Builds a ramp command with the given step value.
 *
 * @param step - Step value (typically 0-30 for ramp mode)
 * @returns 4-byte packet as Uint8Array
 */
export function buildRampCmd(step: number): Uint8Array {
  return new Uint8Array([0x5A, 0xA5, 0x47, step & 0xFF]);
}

/**
 * Parses notification data from the device.
 *
 * @param data - Raw bytes received via notify callback
 * @returns Parsed result with type, rpm, and raw hex string
 */
export function parseNotify(data: Uint8Array): {
  type: number | null;
  rpm: number | null;
  raw: string;
} {
  const raw = data.reduce((acc, byte) => acc + (acc ? " " : "") + byte.toString(16), "");

  if (data.length < 10 || data[0] !== 0x5A || data[1] !== 0xA5) {
    return { type: null, rpm: null, raw };
  }

  const msgType = data[2];
  const current = data[7] | (data[8] << 8);
  const target = data[9] | (data[10] << 8);

  const diff = (target - current) / 10;
  const rpm = target - diff;

  return { type: msgType, rpm, raw };
}
