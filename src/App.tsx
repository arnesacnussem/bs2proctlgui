import { useEffect, useState } from "react";
import "./App.css";
import FanController from "./fan-controller";
import DeviceSelector from "./device-selector";
import { BleDevice } from "@mnlphlp/plugin-blec";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Fan } from "lucide-react";
import { connectDevice } from "./lib/fanctl";

let storePromise: Promise<import("@tauri-apps/plugin-store").Store> | null = null;
async function getStore() {
  if (!storePromise) {
    const { Store } = await import("@tauri-apps/plugin-store");
    storePromise = Store.load("config.json");
  }
  return storePromise!;
}

async function saveLastDevice(address: string, name: string) {
  const store = await getStore();
  await store.set("lastDevice", { address, name });
  await store.save();
}

async function getLastDevice(): Promise<{ address: string; name: string } | null> {
  const store = await getStore();
  return (await store.get<{ address: string; name: string }>("lastDevice")) || null;
}

const CustomTitleBar = () => {
  const appWindow = getCurrentWindow();
  const handleClose = () => appWindow.close();

  return (
    <div
      data-tauri-drag-region
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#1a1a2e",
        color: "#e0e0e0",
        height: "24px",
        userSelect: "none",
      }}
    >
      <div data-tauri-drag-region className="flex justify-center gap-2 text-gray-200">
        <Fan />
        <span className="inline-flex">BS2 Pro</span>
      </div>
      <div className="flex">
        <button
          onClick={handleClose}
          className="h-[24px] w-[24px] hover:bg-red-600 hover:text-white transition duration-300"
        >
          <X />
        </button>
      </div>
    </div>
  );
};

function App() {
  const [selectedDevice, setSelectedDevice] = useState<BleDevice | null>(null);
  const [autoConnected, setAutoConnected] = useState(false);

  useEffect(() => {
    if (autoConnected) return;
    getLastDevice().then((last) => {
      if (last) {
        connectDevice(last.address).then(() => {
          setSelectedDevice({ address: last.address, name: last.name } as BleDevice);
        }).catch(() => {});
      }
    });
    setAutoConnected(true);
  }, []);

  const handleDeviceSelect = (device: BleDevice) => {
    saveLastDevice(device.address, device.name);
    setSelectedDevice(device);
  };

  const handleDisconnect = () => {
    setSelectedDevice(null);
  };

  return (
    <>
      <CustomTitleBar />
      <div className="pt-4 overflow-auto max-h-[680px]">
        {!selectedDevice ? (
          <DeviceSelector onDeviceSelect={handleDeviceSelect} />
        ) : (
          <FanController device={selectedDevice} onDisconnect={handleDisconnect} />
        )}
      </div>
    </>
  );
}

export default App;
