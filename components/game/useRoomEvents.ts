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
        try {
          const parsed = JSON.parse(msg.data) as RoomEvent;
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
