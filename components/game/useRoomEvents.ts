'use client';

import { useEffect, useRef, useState } from 'react';

export type RoomEvent = {
  type: string;
  payload: unknown;
  version: number;
};

export type ConnStatus = 'connecting' | 'open' | 'error';

/**
 * Subscribe to a room's SSE channel. Re-establishes the EventSource on disconnect
 * and exposes a connection `status` so the UI can surface a reconnect banner.
 *
 * NB: EventSource auto-reconnects, but we also explicitly close + reopen on
 * visibility change to recover quickly when a phone wakes up.
 */
export function useRoomEvents(
  code: string,
  onEvent: (event: RoomEvent) => void,
): { status: ConnStatus } {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [status, setStatus] = useState<ConnStatus>('connecting');

  useEffect(() => {
    let es: EventSource | null = null;

    function open() {
      es?.close();
      setStatus('connecting');
      es = new EventSource(`/api/stream/${code}`);
      es.onopen = () => {
        setStatus('open');
        // Refetch on (re)connect to catch any events missed before the stream was
        // live — e.g. a player who joined in the window before our SSE attached.
        onEventRef.current({ type: 'sync', payload: null, version: 0 });
      };
      es.onmessage = (msg) => {
        // Upstash REST /subscribe SSE format is:
        //   "subscribe,<channel>,<refcount>"   — initial ack, ignore
        //   "message,<channel>,<json-payload>" — actual event
        // Older subscribe pipes may also emit raw JSON. Handle all 3.
        const raw = msg.data as string;
        let json: string | null = null;
        if (raw.startsWith('message,')) {
          // Strip "message,<channel>," prefix; channel name can contain colons,
          // so split on the FIRST two commas.
          const firstComma = raw.indexOf(',');
          const secondComma = raw.indexOf(',', firstComma + 1);
          if (secondComma > 0) json = raw.slice(secondComma + 1);
        } else if (raw.startsWith('subscribe,') || raw.startsWith('unsubscribe,')) {
          return; // control frame
        } else {
          json = raw; // assume raw JSON for compatibility
        }
        if (!json) return;
        try {
          const parsed = JSON.parse(json) as RoomEvent;
          onEventRef.current(parsed);
        } catch {
          // ignore malformed
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects; surface the dropped state so the UI can
        // show a reconnect banner until onopen fires again.
        setStatus('error');
      };
    }

    function handleVisible() {
      if (document.visibilityState === 'visible') open();
    }

    open();
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      es?.close();
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [code]);

  return { status };
}
