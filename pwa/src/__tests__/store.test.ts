import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../transport", () => ({
  connect: vi.fn(),
}));

import { useStore } from "../store";
import { connect as transportConnect } from "../transport";

const mockedConnect = vi.mocked(transportConnect);

describe("store", () => {
  let onState: Parameters<typeof transportConnect>[0];
  let onConnect: Parameters<typeof transportConnect>[1];
  let onDisconnect: Parameters<typeof transportConnect>[2];
  let mockWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockWrite = vi.fn();

    mockedConnect.mockImplementation((s, c, d) => {
      onState = s;
      onConnect = c;
      onDisconnect = d;
      return {
        write: mockWrite,
        disconnect: vi.fn(),
      } as ReturnType<typeof transportConnect>;
    });

    useStore.setState({
      entities: new Map(),
      connected: false,
      connecting: false,
      error: null,
    });
  });

  it("connect() sets connecting and opens transport", () => {
    useStore.getState().connect();

    expect(useStore.getState().connecting).toBe(true);
    expect(useStore.getState().error).toBeNull();
    expect(mockedConnect).toHaveBeenCalledOnce();
  });

  it("onState stores entity in map", () => {
    useStore.getState().connect();
    onState("sensor-battery_soc", {
      id: "sensor-battery_soc",
      state: "85",
      value: 85,
    });

    expect(useStore.getState().entities.get("sensor-battery_soc")).toEqual({
      id: "sensor-battery_soc",
      state: "85",
      value: 85,
    });
  });

  it("onConnect transitions to connected", () => {
    useStore.getState().connect();
    onConnect();

    const state = useStore.getState();
    expect(state.connected).toBe(true);
    expect(state.connecting).toBe(false);
    expect(state.error).toBeNull();
  });

  it("onDisconnect sets error", () => {
    useStore.getState().connect();
    onConnect();
    onDisconnect();

    const state = useStore.getState();
    expect(state.connected).toBe(false);
    expect(state.connecting).toBe(false);
    expect(state.error).toBe("Connection lost");
  });

  it("setFridgeTarget optimistically updates and writes", () => {
    useStore.getState().connect();
    useStore.getState().setFridgeTarget(5);

    expect(
      useStore.getState().entities.get("sensor-fridge_target")?.value,
    ).toBe(5);
    expect(mockWrite).toHaveBeenCalledWith(
      "/climate/fridge/Fridge/set?target_temperature=5",
    );
  });

  it("setFridgeMode optimistically updates and writes", () => {
    useStore.getState().connect();
    useStore.getState().setFridgeMode("Max");

    expect(
      useStore.getState().entities.get("select-fridge_run_mode")?.state,
    ).toBe("Max");
    expect(mockWrite).toHaveBeenCalledWith(
      "/select/fridge/Fridge%20Run%20Mode/set?option=Max",
    );
  });

  it("setFridgeCutoff optimistically updates and writes", () => {
    useStore.getState().connect();
    useStore.getState().setFridgeCutoff("Low");

    expect(
      useStore.getState().entities.get("select-fridge_battery_protection")
        ?.state,
    ).toBe("Low");
    expect(mockWrite).toHaveBeenCalledWith(
      "/select/fridge/Fridge%20Battery%20Protection/set?option=Low",
    );
  });
});
