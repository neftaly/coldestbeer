export interface StateEvent {
  id: string;
  state: string;
  value: number;
  current_temperature?: number;
  target_temperature?: number;
  mode?: string;
}

export interface TransportHandle {
  write: (endpoint: string) => Promise<void>;
  disconnect: () => void;
}

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export function connect(
  onState: (id: string, event: StateEvent) => void,
  onConnect: () => void,
  onDisconnect: () => void,
): TransportHandle {
  let eventSource: EventSource | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = INITIAL_RETRY_MS;
  let stopped = false;

  function open() {
    if (stopped) return;

    eventSource = new EventSource("/events");

    eventSource.addEventListener("state", (event) => {
      const data = JSON.parse(
        (event as MessageEvent<string>).data,
      ) as StateEvent;
      onState(data.id, data);
    });

    eventSource.addEventListener("ping", () => {
      retryDelay = INITIAL_RETRY_MS;
      onConnect();
    });

    eventSource.addEventListener("error", () => {
      eventSource?.close();
      eventSource = null;
      onDisconnect();

      if (!stopped) {
        retryTimeout = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
          open();
        }, retryDelay);
      }
    });
  }

  open();

  return {
    write: (endpoint) => fetch(endpoint, { method: "POST" }).then(() => {}),
    disconnect: () => {
      stopped = true;
      if (retryTimeout !== null) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
      eventSource?.close();
      eventSource = null;
    },
  };
}
