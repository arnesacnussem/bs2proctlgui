export interface SpeedMode {
  name: string;
  light: number;
  min: number;
  max: number;
  presets: number[];
}

export interface NotifyData {
  type: number | null;
  rpm: number | null;
  current: number | null;
  target: number | null;
  chargeMode: number | null;
  raw: string;
}

export const SPEED_MODES: SpeedMode[] = [
  { name: "静音",     light: 0, min: 1300, max: 1900, presets: [1300, 1700, 1900] },
  { name: "标准",     light: 1, min: 2100, max: 2700, presets: [2100, 2400, 2700] },
  { name: "性能",     light: 2, min: 2800, max: 3300, presets: [2800, 3000, 3300] },
  { name: "Turbo",    light: 3, min: 3500, max: 4000, presets: [3500, 3700, 4000] },
];

export const CHARGE_NAMES: Record<number, string> = {
  1: "5V",
  2: "QC",
  3: "PD",
};

export const CHARGE_MAX_RPM: Record<number, number> = {
  1: 2700,
  2: 3300,
  3: 4000,
};

export function buildSetSpeedCmd(rpm: number, light: number): Uint8Array {
  rpm = Math.min(4000, Math.max(1300, rpm));
  const packet = new Uint8Array(8);
  packet[0] = 0x5A;
  packet[1] = 0xA5;
  packet[2] = 0x26;
  packet[3] = 0x05;
  packet[4] = light & 0xFF;
  packet[5] = rpm & 0xFF;
  packet[6] = (rpm >> 8) & 0xFF;
  packet[7] = (packet[2] + packet[3] + packet[4] + packet[5] + packet[6]) & 0xFF;
  return packet;
}

export function buildRampCmd(step: number): Uint8Array {
  return new Uint8Array([0x5A, 0xA5, 0x47, step & 0xFF]);
}

export function parseNotify(data: Uint8Array): NotifyData {
  const raw = data.reduce((acc, byte) => acc + (acc ? " " : "") + byte.toString(16).padStart(2, '0'), "");

  if (data.length < 11 || data[0] !== 0x5A || data[1] !== 0xA5) {
    return { type: null, rpm: null, current: null, target: null, chargeMode: null, raw };
  }

  const msgType = data[2];
  const current = data[7] | (data[8] << 8);
  const target = data[9] | (data[10] << 8);

  const diff = (target - current) / 10;
  const rpm = target - diff;

  const chargeMode = (data[4] >> 5) & 0x03;

  return { type: msgType, rpm, current, target, chargeMode, raw };
}
