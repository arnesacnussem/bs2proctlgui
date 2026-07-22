import { create } from "zustand";

export interface FanStatus {
  connected: boolean;
  currentRPM: number;
  targetRPM: number;
  debugLog: string;
}

interface FanStore extends FanStatus {
  setConnected: (v: boolean) => void;
  setCurrentRPM: (v: number) => void;
  setTargetRPM: (v: number) => void;
  log: (msg: string) => void;
  reset: () => void;
}

export const useFanStore = create<FanStore>((set) => ({
  connected: false,
  currentRPM: 0,
  targetRPM: 0,
  debugLog: "",

  setConnected: (connected: boolean) => set({ connected }),
  setCurrentRPM: (currentRPM: number) => set({ currentRPM }),
  setTargetRPM: (targetRPM: number) => set({ targetRPM }),
  log: (msg: string) =>
    set((s: FanStore) => {
      const line = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
      console.log(line);
      const logs = [line, ...s.debugLog.split("\n")].slice(0, 10);
      return { debugLog: logs.join("\n") };
    }),
  reset: () =>
    set({ connected: false, currentRPM: 0, targetRPM: 0, debugLog: "" }),
}));
