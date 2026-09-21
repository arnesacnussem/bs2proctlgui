"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wind, Gauge, Loader2 } from "lucide-react";
import { BleDevice } from "@mnlphlp/plugin-blec";
import { connectDevice, disconnectDevice, setSpeed } from "@/lib/fanctl";
import { SPEED_MODES, SpeedMode, CHARGE_NAMES, CHARGE_MAX_RPM } from "@/lib/ble";
import { useFanStore } from "@/store";
import { listen } from "@tauri-apps/api/event";

let storePromise: Promise<import("@tauri-apps/plugin-store").Store> | null = null;
async function getStore() {
  if (!storePromise) {
    const { Store } = await import("@tauri-apps/plugin-store");
    storePromise = Store.load("config.json");
  }
  return storePromise!;
}

async function saveSpeedConfig(mode: number, speed: number) {
  try {
    const s = await getStore();
    const cfg = await s.get<{ speeds: number[]; activeMode: number }>("speedConfig");
    const speeds = cfg?.speeds || [SPEED_MODES[0].presets[1], SPEED_MODES[1].presets[1], SPEED_MODES[2].presets[1], SPEED_MODES[3].presets[1]];
    speeds[mode] = speed;
    await s.set("speedConfig", { speeds, activeMode: mode });
    await s.save();
  } catch (_) {}
}

async function loadSpeedConfig(): Promise<{ speeds: number[]; activeMode: number } | null> {
  try {
    const s = await getStore();
    return (await s.get<{ speeds: number[]; activeMode: number }>("speedConfig")) ?? null;
  } catch (_) {
    return null;
  }
}

interface FanControllerProps {
  device: BleDevice;
  onDisconnect: () => void;
  onConnectionLost: () => void;
}

export default function FanController({ device, onDisconnect, onConnectionLost }: FanControllerProps) {
  const connected = useFanStore((s) => s.connected);
  const currentRPM = useFanStore((s) => s.currentRPM);
  const chargeMode = useFanStore((s) => s.chargeMode);
  const debugLog = useFanStore((s) => s.debugLog);
  const [mode, setMode] = useState<SpeedMode>(SPEED_MODES[1]);
  const [targetSpeed, setTargetSpeed] = useState(2400);
  const [speedLight, setSpeedLight] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [savedSpeeds, setSavedSpeeds] = useState<number[]>([1700, 2400, 3000, 4000]);

  // Keep the latest callbacks in refs so effects can use them without
  // re-running on every render.
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;
  const onConnectionLostRef = useRef(onConnectionLost);
  onConnectionLostRef.current = onConnectionLost;

  useEffect(() => {
    // Scan-then-connect happens in the device selector; here we only connect to
    // the device the user picked. If that fails, fall back to the scan flow
    // instead of retrying blindly.
    connectDevice(device.address).then((ok) => {
      if (!ok) onConnectionLostRef.current();
    });
    loadSpeedConfig().then((cfg) => {
      if (cfg) {
        const m = cfg.activeMode ?? 1;
        setMode(SPEED_MODES[m]);
        setTargetSpeed(cfg.speeds[m] ?? SPEED_MODES[m].min);
        setSavedSpeeds(cfg.speeds);
      }
      setInitialized(true);
    });
  }, [device.address]);

  // Connection dropped while we were connected: return to the scan flow (same
  // as a new connect) instead of showing a perpetual "Reconnecting" spinner.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (connected && !wasConnected.current) {
      wasConnected.current = true;
    } else if (!connected && wasConnected.current) {
      wasConnected.current = false;
      onConnectionLostRef.current();
    }
  }, [connected]);

  useEffect(() => {
    const rpm = currentRPM || targetSpeed;
    if (rpm < 2000) setSpeedLight(0);
    else if (rpm < 3000) setSpeedLight(1);
    else if (rpm < 3500) setSpeedLight(2);
    else setSpeedLight(3);
  }, [currentRPM, targetSpeed]);

  useEffect(() => {
    const unlisten = listen<{ rpm: number; light: number }>("fan-speed-set", (e) => {
      const { rpm, light } = e.payload;
      setTargetSpeed(rpm);
      setMode((prev) => {
        const m = SPEED_MODES.find((m) => m.light === light);
        if (m) {
          setSavedSpeeds((prevSpeeds) => {
            const next = [...prevSpeeds];
            next[light] = rpm;
            return next;
          });
          return m;
        }
        return prev;
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleModeChange = (m: SpeedMode) => {
    loadSpeedConfig().then((cfg) => {
      const saved = cfg?.speeds?.[m.light];
      const rpm = saved ?? m.presets[1];
      setMode(m);
      setTargetSpeed(rpm);
      setSpeed(rpm, m.light);
      saveSpeedConfig(m.light, rpm);
    });
  };

  const handleSpeedChange = (value: number[]) => {
    const rpm = value[0];
    setTargetSpeed(rpm);
    setSpeed(rpm, mode.light);
    saveSpeedConfig(mode.light, rpm);
    setSavedSpeeds((prev) => {
      const next = [...prev];
      next[mode.light] = rpm;
      return next;
    });
  };

  const handleDisconnectClick = async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      setTimeout(() => setConfirmDisconnect(false), 3000);
      return;
    }
    await disconnectDevice();
    onDisconnect();
  };

  const displayRPM = currentRPM || targetSpeed;

  const powerMax = chargeMode > 0 ? (CHARGE_MAX_RPM[chargeMode] ?? 2700) : 2700;

  const canUseMode = (m: SpeedMode) => m.max <= powerMax;

  return (
    <div className="w-full max-w-md p-6 pt-0 space-y-6 shadow-xl overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wind className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{device.name}</h1>
            <p className="text-xs text-muted-foreground font-mono">{device.address}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chargeMode >= 1 && (
            <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">
              {CHARGE_NAMES[chargeMode]} {CHARGE_MAX_RPM[chargeMode] ?? "2700"}rpm
            </span>
          )}
          <Badge
            variant={connected ? "secondary" : "outline"}
            className="gap-1.5 border-border text-muted-foreground cursor-pointer hover:bg-muted select-none"
            onClick={handleDisconnectClick}
          >
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
            {connected ? (confirmDisconnect ? "Confirm?" : "Connected") : "Connecting"}
          </Badge>
        </div>
      </div>

      {!connected && initialized && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4 text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin" />
          <p className="text-sm">Connecting to {device.name}...</p>
          <p className="text-xs font-mono">{device.address}</p>
          <Button variant="outline" size="sm" onClick={handleDisconnectClick}>
            Cancel
          </Button>
        </div>
      )}

      {connected && (
        <>
          <div className="space-y-4 p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Current Speed</span>
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                <span className="text-2xl font-bold font-mono">{displayRPM}</span>
                <span className="text-sm text-muted-foreground">RPM</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Speed Level</span>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3].map((level) => (
                  <div
                    key={level}
                    className={`w-3 h-8 rounded-sm transition-colors ${level <= speedLight ? "bg-secondary" : "bg-border"}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-sm font-medium">Mode</span>
            <div className="grid grid-cols-4 gap-2">
              {SPEED_MODES.map((m) => {
                const locked = !canUseMode(m);
                return (
                  <button
                    key={m.light}
                    onClick={() => !locked && handleModeChange(m)}
                    disabled={locked}
                    className={`py-3 px-2 rounded-lg text-sm font-medium border-2 transition-all
                      ${locked
                        ? "border-transparent bg-muted/30 text-muted-foreground/30 cursor-not-allowed"
                        : mode.light === m.light
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-transparent bg-muted hover:bg-muted/70 hover:border-border"
                      }`}
                  >
                    <div>{locked ? `${m.name} 🔒` : m.name}</div>
                    <div className="text-xs opacity-60">{savedSpeeds[m.light] ?? m.min} rpm</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            {mode.presets.map((preset) => {
              const disabled = preset > powerMax;
              return (
                <button
                  key={preset}
                  onClick={() => !disabled && handleSpeedChange([preset])}
                  disabled={disabled}
                  className={`flex-1 py-2 rounded-lg text-sm font-mono border transition-all
                    ${disabled
                      ? "border-border/30 bg-muted/20 text-muted-foreground/30 cursor-not-allowed"
                      : targetSpeed === preset
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>

        </>
      )}

      <div
        className="p-2 rounded bg-muted/50 border border-border cursor-pointer"
        onClick={() => setShowLog(!showLog)}
      >
        <div className="text-xs text-muted-foreground font-mono">
          {showLog ? (debugLog || "no data") : "Show debug log"}
        </div>
      </div>
    </div>
  );
}
