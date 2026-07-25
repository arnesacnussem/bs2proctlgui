import {
  connect,
  disconnect as bleDisconnect,
  subscribe,
  unsubscribe,
  startScan,
  stopScan,
} from "@mnlphlp/plugin-blec";
import { parseNotify } from "./ble";
import { useFanStore } from "../store";
import { invoke } from "@tauri-apps/api/core";

const NOTIFY_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";
const RECONNECT_INTERVAL = 3000;

let reconnectAddress: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;
let connecting = false;

function log(msg: string) {
  useFanStore.getState().log(msg);
}

async function trySubscribe() {
  let notifyCount = 0;
  let lastLoggedRPM = -1;
  log("subscribe start");
  try {
    await subscribe(NOTIFY_UUID, (data: number[]) => {
      const bytes = new Uint8Array(data);
      const parsed = parseNotify(bytes);
      if (parsed.rpm !== null) {
        useFanStore.getState().setCurrentRPM(Math.round(parsed.rpm));
      }
      if (parsed.chargeMode !== null) {
        useFanStore.getState().setChargeMode(parsed.chargeMode);
      }
      notifyCount++;
      if (Math.abs((parsed.rpm ?? 0) - lastLoggedRPM) >= 50) {
        const hex = [...bytes].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' ');
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
  if (!shouldReconnect) {
    log("onDisconnected: shouldReconnect=false, ignoring");
    return;
  }
  useFanStore.getState().setConnected(false);
  startReconnect();
}

export async function connectDevice(address: string): Promise<void> {
  const store = useFanStore.getState();
  log(`connectDevice(${address}) connecting=${connecting} connected=${store.connected}`);

  if (connecting || (store.connected && reconnectAddress === address)) {
    log("connect skipped (already)");
    return;
  }

  shouldReconnect = true;
  reconnectAddress = address;
  connecting = true;

  log("calling bleConnect...");
  try {
    await connect(address, onDisconnected);
    log("bleConnect OK, setting connected=true");
    useFanStore.getState().setConnected(true);
  } catch (e) {
    log(`bleConnect ERR: ${e}`);
    useFanStore.getState().setConnected(false);
    connecting = false;
    startReconnect();
    return;
  }

  connecting = false;
  stopReconnect();
  await trySubscribe();
}

export async function disconnectDevice(): Promise<void> {
  log("disconnectDevice");
  stopReconnect();
  shouldReconnect = false;
  reconnectAddress = null;
  connecting = false;

  try { await unsubscribe(NOTIFY_UUID); log("unsubscribe OK"); } catch (e) { log(`unsubscribe ERR: ${e}`); }
  try { await bleDisconnect(); log("bleDisconnect OK"); } catch (e) { log(`bleDisconnect ERR: ${e}`); }

  useFanStore.getState().reset();
}

async function doReconnect() {
  if (!shouldReconnect || !reconnectAddress) return;
  const addr = reconnectAddress;
  log(`reconnect scan+connect ${addr}...`);

  try {
    try { await unsubscribe(NOTIFY_UUID); } catch (_) {}
    try { await bleDisconnect(); } catch (_) {}
    useFanStore.getState().reset();

    let found = false;
    try {
      const devices: { address: string }[] = [];
      void devices;
      await startScan((d: { address: string }[]) => {
        if (!found && d.some((x) => x.address === addr)) {
          found = true;
        }
      }, 5000);
      await new Promise((r) => setTimeout(r, 5000));
      await stopScan();
    } catch (_) {}

    if (!found) {
      log("reconnect: device not found, retry in 3s");
      reconnectTimer = setTimeout(doReconnect, RECONNECT_INTERVAL);
      return;
    }

    await connect(addr, onDisconnected);
    log("reconnect connected, subscribing...");
    useFanStore.getState().setConnected(true);

    await subscribe(NOTIFY_UUID, (data: number[]) => {
      const bytes = new Uint8Array(data);
      const parsed = parseNotify(bytes);
      if (parsed.rpm !== null) {
        useFanStore.getState().setCurrentRPM(Math.round(parsed.rpm));
      }
      if (parsed.chargeMode !== null) {
        useFanStore.getState().setChargeMode(parsed.chargeMode);
      }
    });
    log("reconnect subscribe OK");
  } catch (e) {
    log(`reconnect ERR: ${e}`);
    reconnectTimer = setTimeout(doReconnect, RECONNECT_INTERVAL);
  }
}

function startReconnect() {
  if (reconnectTimer) { log("reconnect already running"); return; }
  if (!reconnectAddress) { log("reconnect: no address"); return; }
  log("startReconnect");
  doReconnect();
}

function stopReconnect() {
  if (reconnectTimer) {
    log("stopReconnect");
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}
