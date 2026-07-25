"use client";

import { useEffect, useState } from "react";
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
import { BleDevice, startScan } from "@mnlphlp/plugin-blec";

interface DeviceSelectorProps {
  onDeviceSelect: (device: BleDevice) => void;
}

// Stub function that simulates Bluetooth device scanning
async function scan(): Promise<BleDevice[]> {
  return new Promise((resolve) => {
    startScan((devices) => resolve(devices), 30000);
  });
}

export default function DeviceSelector({
  onDeviceSelect,
}: DeviceSelectorProps) {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showUnnamed, setShowUnnamed] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const foundDevices = await scan();
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
