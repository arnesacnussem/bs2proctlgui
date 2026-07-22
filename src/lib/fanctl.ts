import {
  connect,
  disconnect as bleDisconnect,
  subscribe,
  unsubscribe,
} from "@mnlphlp/plugin-blec";
import { parseNotify, buildSetSpeedCmd } from "./ble";
import { useFanStore } from "../store";
import { invoke } from "@tauri-apps/api/core";

const NOTIFY_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";
const RECONNECT_INTERVAL = 3000;

let reconnectTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAddress: string | null = null;
let shouldReconnect = false;
let connecting = false;

function log(msg: string) {
  useFanStore.getState().log(msg);
}

async function trySubscribe() {
  log("subscribe start");
  try {
    await subscribe(NOTIFY_UUID, (data: number[]) => {
      const bytes = new Uint8Array(data);
      const hex = [...bytes].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const parsed = parseNotify(bytes);
      if (parsed.rpm !== null) {
        useFanStore.getState().setCurrentRPM(Math.round(parsed.rpm));
      }
      log(`notify type=0x${parsed.type?.toString(16) ?? '??'} rpm=${parsed.rpm} | ${hex}`);
    });
    log("subscribe OK");
  } catch (e) {
    log(`subscribe ERR: ${e}`);
  }
}

export async function setSpeed(rpm: number) {
  const packet = buildSetSpeedCmd(rpm);
  const hex = [...packet].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ');
  log(`setSpeed ${rpm} | ${hex}`);
  try {
    const result: string = await invoke("ble_write_test", { rpm });
    log(`setSpeed OK: ${result}`);
  } catch (e) {
    log(`setSpeed ERR: ${e}`);
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

function startReconnect() {
  if (reconnectTimer) { log("reconnect already running"); return; }
  if (!reconnectAddress) { log("reconnect: no address"); return; }
  log("startReconnect loop");

  reconnectTimer = setInterval(async () => {
    if (!shouldReconnect || !reconnectAddress) {
      log("reconnect: stop (shouldReconnect changed)");
      stopReconnect();
      return;
    }
    log(`reconnect attempt to ${reconnectAddress}...`);
    try {
      await connect(reconnectAddress!, onDisconnected);
      log("reconnect OK");
      useFanStore.getState().setConnected(true);
      stopReconnect();
      await trySubscribe();
    } catch (e) {
      log(`reconnect ERR: ${e}`);
    }
  }, RECONNECT_INTERVAL);
}

function stopReconnect() {
  if (reconnectTimer) {
    log("stopReconnect");
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
}
