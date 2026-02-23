// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStore, type StateEvent } from "../store";
import { useSensor, useBinarySensor, useBattery, useFridge } from "../panels";

function setEntities(entries: [string, Partial<StateEvent>][]) {
  useStore.setState({
    entities: new Map(
      entries.map(([id, patch]) => [
        id,
        { id, state: "", value: 0, ...patch } as StateEvent,
      ]),
    ),
  });
}

describe("useSensor", () => {
  beforeEach(() => useStore.setState({ entities: new Map() }));

  it("returns null when entity is missing", () => {
    const { result } = renderHook(() => useSensor("sensor-battery_soc"));
    expect(result.current).toBeNull();
  });

  it("returns numeric value when entity exists", () => {
    setEntities([["sensor-battery_soc", { state: "85", value: 85 }]]);
    const { result } = renderHook(() => useSensor("sensor-battery_soc"));
    expect(result.current).toBe(85);
  });
});

describe("useBinarySensor", () => {
  beforeEach(() => useStore.setState({ entities: new Map() }));

  it("returns null when entity is missing", () => {
    const { result } = renderHook(() =>
      useBinarySensor("binary_sensor-battery_charging"),
    );
    expect(result.current).toBeNull();
  });

  it("returns true when state is ON", () => {
    setEntities([
      ["binary_sensor-battery_charging", { state: "ON", value: 1 }],
    ]);
    const { result } = renderHook(() =>
      useBinarySensor("binary_sensor-battery_charging"),
    );
    expect(result.current).toBe(true);
  });

  it("returns false when state is OFF", () => {
    setEntities([
      ["binary_sensor-battery_charging", { state: "OFF", value: 0 }],
    ]);
    const { result } = renderHook(() =>
      useBinarySensor("binary_sensor-battery_charging"),
    );
    expect(result.current).toBe(false);
  });
});

describe("useBattery", () => {
  beforeEach(() => useStore.setState({ entities: new Map() }));

  it("returns all nulls when no entities exist", () => {
    const { result } = renderHook(() => useBattery());
    expect(result.current).toEqual({
      soc: null,
      voltage: null,
      current: null,
      charging: null,
    });
  });

  it("returns raw values from entities", () => {
    setEntities([
      ["sensor-battery_soc", { state: "85", value: 85 }],
      ["sensor-battery_voltage", { state: "13.2", value: 13.2 }],
      ["sensor-battery_current", { state: "3.2", value: 3.2 }],
      ["binary_sensor-battery_charging", { state: "ON", value: 1 }],
    ]);
    const { result } = renderHook(() => useBattery());
    expect(result.current).toEqual({
      soc: 85,
      voltage: 13.2,
      current: 3.2,
      charging: true,
    });
  });
});

describe("useFridge", () => {
  beforeEach(() => useStore.setState({ entities: new Map() }));

  it("returns nulls when no entities exist", () => {
    const { result } = renderHook(() => useFridge());
    expect(result.current.temperature).toBeNull();
    expect(result.current.target).toBeNull();
    expect(result.current.mode).toBeNull();
    expect(result.current.cutoff).toBeNull();
  });

  it("returns raw values from entities", () => {
    setEntities([
      ["sensor-fridge_temperature", { state: "5", value: 5 }],
      ["sensor-fridge_target", { state: "-5", value: -5 }],
      ["select-fridge_run_mode", { state: "Eco" }],
      ["select-fridge_battery_protection", { state: "Hi" }],
    ]);
    const { result } = renderHook(() => useFridge());
    expect(result.current.temperature).toBe(5);
    expect(result.current.target).toBe(-5);
    expect(result.current.mode).toBe("Eco");
    expect(result.current.cutoff).toBe("Hi");
  });

  it("exposes setTarget, setMode, setCutoff functions", () => {
    const { result } = renderHook(() => useFridge());
    expect(typeof result.current.setTarget).toBe("function");
    expect(typeof result.current.setMode).toBe("function");
    expect(typeof result.current.setCutoff).toBe("function");
  });
});
