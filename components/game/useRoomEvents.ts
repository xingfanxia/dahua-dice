'use client';

import { useEffect, useRef } from 'react';

export type RoomEvent = {
  type: string;
  payload: unknown;
  version: number;
};

/**
 * Subscribe to a room's SSE channel. Re-establishes the EventSource on disconnect.
 *
 * NB: EventSource in browsers handles auto-reconnect, but we explicitly close + reopen
 * on visibility change to recover quickly when a phone wakes up.
 */
export function useRoomEvents(code: string, onEvent: (event: RoomEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let es: EventSource | null = null;

    function open() {
      es?.close();
      es = new EventSource(`/api/stream/${code}`);
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
        // Browser will auto-reconnect; we don't need to handle here
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
}
