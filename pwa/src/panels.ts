import { useStore } from "./store";

// --- Selectors ---

export function useSensor(id: string): number | null {
  return useStore((s) => s.entities.get(id)?.value ?? null);
}

export function useBinarySensor(id: string): boolean | null {
  return useStore((s) => {
    const entity = s.entities.get(id);
    if (!entity) return null;
    return entity.state === "ON";
  });
}

function useSelect(id: string): string | null {
  return useStore((s) => s.entities.get(id)?.state ?? null);
}

// --- Battery ---

export function useBattery() {
  const soc = useSensor("sensor-battery_soc");
  const voltage = useSensor("sensor-battery_voltage");
  const current = useSensor("sensor-battery_current");
  const charging = useBinarySensor("binary_sensor-battery_charging");
  return { soc, voltage, current, charging };
}

// --- Fridge ---

export const TEMP_MIN = -20;
export const TEMP_MAX = 20;
export const RUN_MODES = ["Max", "Eco"];
export const CUTOFF_LEVELS = ["High", "Mid", "Low"];

export function useFridge() {
  const temperature = useSensor("sensor-fridge_temperature");
  const target = useSensor("sensor-fridge_target");
  const mode = useSelect("select-fridge_run_mode");
  const cutoff = useSelect("select-fridge_battery_protection");
  const power = useBinarySensor("switch-fridge_power");
  const setTarget = useStore((s) => s.setFridgeTarget);
  const setMode = useStore((s) => s.setFridgeMode);
  const setCutoff = useStore((s) => s.setFridgeCutoff);
  const setPower = useStore((s) => s.setFridgePower);

  return { temperature, target, mode, cutoff, power, setTarget, setMode, setCutoff, setPower };
}
