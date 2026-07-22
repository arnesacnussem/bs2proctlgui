"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wind, Gauge } from "lucide-react";
import { BleDevice } from "@mnlphlp/plugin-blec";
import { connectDevice, disconnectDevice, setSpeed } from "@/lib/fanctl";
import { useFanStore } from "@/store";

interface FanControllerProps {
  device: BleDevice;
  onDisconnect: () => void;
}

export default function FanController({ device, onDisconnect }: FanControllerProps) {
  const connected = useFanStore((s) => s.connected);
  const currentRPM = useFanStore((s) => s.currentRPM);
  const debugLog = useFanStore((s) => s.debugLog);
  const [targetSpeed, setTargetSpeed] = useState(1300);
  const [speedLight, setSpeedLight] = useState(0);

  useEffect(() => {
    connectDevice(device.address);
  }, [device.address]);

  useEffect(() => {
    if (currentRPM < 2000) setSpeedLight(0);
    else if (currentRPM < 3000) setSpeedLight(1);
    else if (currentRPM < 3500) setSpeedLight(2);
    else setSpeedLight(3);
  }, [currentRPM]);

  const handleSpeedChange = (value: number[]) => {
    const rpm = value[0];
    setTargetSpeed(rpm);
    setSpeed(rpm);
  };

  const handleDisconnect = async () => {
    await disconnectDevice();
    onDisconnect();
  };

  const displayRPM = currentRPM || targetSpeed;

  return (
    <div className="w-full max-w-md p-6 pt-0 space-y-6 shadow-xl overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wind className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-card-foreground">{device.name}</h1>
            <p className="text-xs text-muted-foreground font-mono">{device.address}</p>
          </div>
        </div>
        <Badge variant={connected ? "default" : "secondary"} className="gap-1.5">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
          {connected ? "Connected" : "Reconnecting"}
        </Badge>
      </div>

      <div className="space-y-4 p-4 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Current Speed</span>
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            <span className="text-2xl font-bold font-mono text-card-foreground">{displayRPM}</span>
            <span className="text-sm text-muted-foreground">RPM</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Speed Level</span>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((level) => (
              <div
                key={level}
                className={`w-3 h-8 rounded-sm transition-colors ${level <= speedLight ? "bg-accent" : "bg-border"}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-card-foreground">Set Speed</Label>
          <span className="text-sm font-mono text-muted-foreground">{targetSpeed} RPM</span>
        </div>
        <Slider value={[targetSpeed]} onValueChange={handleSpeedChange} min={1300} max={4000} step={100} className="w-full" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1300</span>
          <span>4000</span>
        </div>
      </div>

      <div className="p-2 rounded bg-muted/50 border border-border">
        <div className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{debugLog || "waiting..."}</div>
      </div>

      <Button onClick={handleDisconnect} variant="outline" className="w-full bg-transparent">
        Disconnect
      </Button>
    </div>
  );
}
