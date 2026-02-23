import { create } from "zustand";
import {
  connect as transportConnect,
  type StateEvent,
  type TransportHandle,
} from "./transport";

export type { StateEvent };

interface Store {
  entities: Map<string, StateEvent>;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => void;
  setFridgeTarget: (value: number) => void;
  setFridgeMode: (value: string) => void;
  setFridgeCutoff: (value: string) => void;
  setFridgePower: (on: boolean) => void;
}

let transport: TransportHandle | null = null;

function putEntity(
  entities: Map<string, StateEvent>,
  id: string,
  patch: Partial<StateEvent>,
): Map<string, StateEvent> {
  const next = new Map(entities);
  next.set(id, { id, state: "", value: 0, ...next.get(id), ...patch });
  return next;
}

export const useStore = create<Store>((set) => ({
  entities: new Map(),
  connected: false,
  connecting: false,
  error: null,

  connect: () => {
    transport?.disconnect();
    set({ connecting: true, error: null });

    transport = transportConnect(
      (id, event) => {
        set((prev) => ({
          entities: putEntity(prev.entities, id, event),
        }));
      },
      () => set({ connected: true, connecting: false, error: null }),
      () => set({ connected: false, connecting: false, error: "Connection lost" }),
    );
  },

  setFridgeTarget: (value) => {
    set((prev) => ({
      entities: putEntity(prev.entities, "sensor-fridge_target", {
        state: String(value),
        value,
      }),
    }));
    transport?.write(`/climate/fridge/Fridge/set?target_temperature=${value}`);
  },

  setFridgeMode: (value) => {
    set((prev) => ({
      entities: putEntity(prev.entities, "select-fridge_run_mode", {
        state: value,
      }),
    }));
    transport?.write(
      `/select/fridge/Fridge%20Run%20Mode/set?option=${value}`,
    );
  },

  setFridgeCutoff: (value) => {
    set((prev) => ({
      entities: putEntity(prev.entities, "select-fridge_battery_protection", {
        state: value,
      }),
    }));
    transport?.write(
      `/select/fridge/Fridge%20Battery%20Protection/set?option=${value}`,
    );
  },

  setFridgePower: (on) => {
    set((prev) => ({
      entities: putEntity(prev.entities, "switch-fridge_power", {
        state: on ? "ON" : "OFF",
      }),
    }));
    transport?.write(
      `/switch/fridge/Fridge%20Power/${on ? "turn_on" : "turn_off"}`,
    );
  },
}));
