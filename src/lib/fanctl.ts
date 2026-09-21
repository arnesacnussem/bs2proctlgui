import {
  connect,
  disconnect as bleDisconnect,
  subscribe,
  unsubscribe,
} from "@mnlphlp/plugin-blec";
import { parseNotify } from "./ble";
import { useFanStore } from "../store";
import { invoke } from "@tauri-apps/api/core";

const NOTIFY_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";

let connectedAddress: string | null = null;
let connecting = false;

function log(msg: string) {
  useFanStore.getState().log(msg);
}

function onNotify(data: number[]) {
  const bytes = new Uint8Array(data);
  const parsed = parseNotify(bytes);
  if (parsed.rpm !== null) {
    useFanStore.getState().setCurrentRPM(Math.round(parsed.rpm));
  }
  if (parsed.chargeMode !== null) {
    useFanStore.getState().setChargeMode(parsed.chargeMode);
    invoke("set_charge_mode", { mode: parsed.chargeMode }).catch(() => {});
  }
}

async function trySubscribe() {
  let notifyCount = 0;
  let lastLoggedRPM = -1;
  log("subscribe start");
  try {
    await subscribe(NOTIFY_UUID, (data: number[]) => {
      onNotify(data);
      notifyCount++;
      const parsed = parseNotify(new Uint8Array(data));
      if (Math.abs((parsed.rpm ?? 0) - lastLoggedRPM) >= 50) {
        const hex = [...new Uint8Array(data)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' ');
        log(`notify type=0x${parsed.type?.toString(16) ?? '??'} rpm=${parsed.rpm} | ${hex}`);
        lastLoggedRPM = parsed.rpm ?? 0;
      }
    });
    log("subscribe OK");
  } catch (e) {
    log(`subscribe ERR: ${e}`);
  }
}

export async function setSpeed(rpm: number, light: number) {
  log(`setSpeed rpm=${rpm} light=${light}`);
  try {
    await invoke("ble_write_test", { rpm, light });
    log(`OK`);
  } catch (e) {
    log(`ERR: ${e}`);
  }
  useFanStore.getState().setTargetRPM(rpm);
}

function onDisconnected() {
  log("onDisconnected fired");
  connecting = false;
  connectedAddress = null;
  useFanStore.getState().setConnected(false);
}

export async function connectDevice(address: string): Promise<boolean> {
  const store = useFanStore.getState();
  log(`connectDevice(${address}) connecting=${connecting} connected=${store.connected}`);

  if (connecting || connectedAddress === address) {
    log("connect skipped (already)");
    return true;
  }

  connecting = true;

  log("calling bleConnect...");
  try {
    await connect(address, onDisconnected);
    log("bleConnect OK, setting connected=true");
    connectedAddress = address;
    useFanStore.getState().setConnected(true);
  } catch (e) {
    log(`bleConnect ERR: ${e}`);
    connecting = false;
    connectedAddress = null;
    return false;
  }

  connecting = false;
  await trySubscribe();
  return true;
}

export async function disconnectDevice(): Promise<void> {
  log("disconnectDevice");
  connectedAddress = null;
  connecting = false;

  try { await unsubscribe(NOTIFY_UUID); log("unsubscribe OK"); } catch (e) { log(`unsubscribe ERR: ${e}`); }
  try { await bleDisconnect(); log("bleDisconnect OK"); } catch (e) { log(`bleDisconnect ERR: ${e}`); }

  useFanStore.getState().reset();
}
