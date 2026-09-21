"use client";

import { useEffect, useRef, useState } from "react";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bluetooth,
  ChevronDown,
  ChevronUp,
  Loader2,
  Radio,
} from "lucide-react";
import { BleDevice, startScan, stopScan } from "@mnlphlp/plugin-blec";

const SCAN_TIMEOUT = 30000;

interface DeviceSelectorProps {
  onDeviceSelect: (device: BleDevice) => void;
  preferredDevice?: { address: string; name: string } | null;
}

// Scans for SCAN_TIMEOUT ms. The plugin reports newly discovered devices every
// ~200ms, so the full list is accumulated until the scan ends and streamed to
// onUpdate as it grows.
async function scan(
  onUpdate: (devices: BleDevice[]) => void
): Promise<BleDevice[]> {
  return new Promise((resolve, reject) => {
    const found = new Map<string, BleDevice>();
    startScan((devices) => {
      for (const device of devices) {
        found.set(device.address, device);
      }
      onUpdate([...found.values()]);
    }, SCAN_TIMEOUT).catch((error) => reject(error));

    setTimeout(async () => {
      try {
        await stopScan();
      } catch (_) {}
      resolve([...found.values()]);
    }, SCAN_TIMEOUT);
  });
}

export default function DeviceSelector({
  onDeviceSelect,
  preferredDevice,
}: DeviceSelectorProps) {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showUnnamed, setShowUnnamed] = useState(false);
  const [autoPicked, setAutoPicked] = useState(false);
  const autoPickedRef = useRef(false);

  const handleScan = async () => {
    setScanning(true);
    setDevices([]);
    try {
      const foundDevices = await scan((partial) => setDevices(partial));
      setDevices(foundDevices);
    } catch (error) {
      console.error("Scan failed:", error);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    handleScan();
  }, []);

  // Reconnect behaves like the new-connect flow: scan first, then connect. If a
  // previously used device is declared via preferredDevice, connect to it as
  // soon as it shows up in the scan results instead of connecting blindly.
  useEffect(() => {
    if (!preferredDevice || autoPickedRef.current) return;
    const match = devices.find(
      (device) => device.address === preferredDevice.address
    );
    if (match) {
      autoPickedRef.current = true;
      setAutoPicked(true);
      onDeviceSelect(match);
    }
  }, [devices, preferredDevice, onDeviceSelect]);

  const namedDevices = devices.filter(
    (device) => device.name !== device.address
  );
  const unnamedDevices = devices.filter(
    (device) => device.name === device.address
  );

  return (
    <div className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bluetooth className="h-5 w-5" />
          Bluetooth Devices
        </CardTitle>
        <CardDescription>
          Scan and connect to your fan controller
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleScan}
          disabled={scanning}
          className="w-full"
          size="lg"
        >
          {scanning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Radio className="mr-2 h-4 w-4" />
              Scan for Devices
            </>
          )}
        </Button>

        {scanning &&
          preferredDevice &&
          !autoPicked &&
          !devices.some((d) => d.address === preferredDevice.address) && (
            <p className="text-sm text-muted-foreground text-center">
              Looking for saved device &quot;{preferredDevice.name}&quot;...
            </p>
          )}

        {devices.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Found {devices.length} device(s)
            </p>
            <div className="space-y-2">
              {namedDevices.map((device) => (
                <button
                  key={device.address}
                  onClick={() => onDeviceSelect(device)}
                      className="w-full p-4 text-left border rounded-lg hover:bg-muted hover:border-primary/50 transition-colors"
                >
                  <div className="font-medium">{device.name}</div>
                  <div className="text-sm text-muted-foreground font-mono">
                    {device.address}
                  </div>
                </button>
              ))}

              {unnamedDevices.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowUnnamed(!showUnnamed)}
                    className="w-full p-3 text-left border rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
                  >
                    <span className="text-sm text-muted-foreground">
                      {unnamedDevices.length} unnamed device(s)
                    </span>
                    {showUnnamed ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {showUnnamed && (
                    <div className="space-y-2 pl-2">
                      {unnamedDevices.map((device) => (
                        <button
                          key={device.address}
                          onClick={() => onDeviceSelect(device)}
                          className="w-full p-3 text-left border rounded-lg hover:bg-muted hover:border-primary/50 transition-colors"
                        >
                          <div className="text-sm font-mono text-muted-foreground">
                            {device.address}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </div>
  );
}
