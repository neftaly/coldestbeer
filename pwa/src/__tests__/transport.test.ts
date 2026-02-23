import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connect } from "../transport";

// --- Mock EventSource ---

type Listener = (event: { data?: string }) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(data !== undefined ? { data } : {});
    }
  }
}

// ---

describe("transport", () => {
  let savedEventSource: typeof globalThis.EventSource;
  let savedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    savedEventSource = globalThis.EventSource;
    savedFetch = globalThis.fetch;
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    MockEventSource.instances = [];
  });

  afterEach(() => {
    globalThis.EventSource = savedEventSource;
    globalThis.fetch = savedFetch;
    vi.useRealTimers();
  });

  it("forwards state events via onState", () => {
    const onState = vi.fn();
    const handle = connect(onState, vi.fn(), vi.fn());

    const payload = { id: "sensor-battery_soc", state: "85", value: 85 };
    MockEventSource.instances[0]!.emit("state", JSON.stringify(payload));

    expect(onState).toHaveBeenCalledWith("sensor-battery_soc", payload);
    handle.disconnect();
  });

  it("calls onConnect on ping", () => {
    const onConnect = vi.fn();
    const handle = connect(vi.fn(), onConnect, vi.fn());

    MockEventSource.instances[0]!.emit("ping");
    expect(onConnect).toHaveBeenCalledOnce();

    handle.disconnect();
  });

  it("calls onDisconnect on error", () => {
    const onDisconnect = vi.fn();
    vi.useFakeTimers();
    const handle = connect(vi.fn(), vi.fn(), onDisconnect);

    MockEventSource.instances[0]!.emit("error");
    expect(onDisconnect).toHaveBeenCalledOnce();

    handle.disconnect();
  });

  it("POSTs on write", async () => {
    const handle = connect(vi.fn(), vi.fn(), vi.fn());

    await handle.write("/climate/fridge/Fridge/set?target_temperature=5");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/climate/fridge/Fridge/set?target_temperature=5",
      { method: "POST" },
    );
    handle.disconnect();
  });

  it("closes EventSource on disconnect", () => {
    const handle = connect(vi.fn(), vi.fn(), vi.fn());
    const es = MockEventSource.instances[0]!;

    handle.disconnect();
    expect(es.closed).toBe(true);
  });

  it("reconnects with exponential backoff after error", () => {
    vi.useFakeTimers();
    const handle = connect(vi.fn(), vi.fn(), vi.fn());

    // First error → schedule retry at 1s
    MockEventSource.instances[0]!.emit("error");
    expect(MockEventSource.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(MockEventSource.instances).toHaveLength(2);

    // Second error → schedule retry at 2s
    MockEventSource.instances[1]!.emit("error");
    vi.advanceTimersByTime(1999);
    expect(MockEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(3);

    handle.disconnect();
  });

  it("disconnect cancels pending retry", () => {
    vi.useFakeTimers();
    const handle = connect(vi.fn(), vi.fn(), vi.fn());

    MockEventSource.instances[0]!.emit("error");
    handle.disconnect();

    vi.advanceTimersByTime(60_000);
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("resets backoff after successful ping", () => {
    vi.useFakeTimers();
    const handle = connect(vi.fn(), vi.fn(), vi.fn());

    // Error → retry at 1s → connect → ping (resets delay)
    MockEventSource.instances[0]!.emit("error");
    vi.advanceTimersByTime(1000);
    MockEventSource.instances[1]!.emit("ping");

    // Next error should retry at 1s again (not 2s)
    MockEventSource.instances[1]!.emit("error");
    vi.advanceTimersByTime(1000);
    expect(MockEventSource.instances).toHaveLength(3);

    handle.disconnect();
  });
});
