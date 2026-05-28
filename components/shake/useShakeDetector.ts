'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'dahua-shake-granted';
const NOISE_FLOOR = 12; // m/s² above gravity (idle ~0)
const PEAK_CAP = 37; // strong shake
const HOLD_MS = 150; // peak must persist >= this long to commit

export type Permission = 'unknown' | 'granted' | 'denied' | 'unsupported';

export function useShakeDetector(onShake: (intensity: number) => void) {
  const [permission, setPermission] = useState<Permission>('unknown');
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  // Resolve initial permission. iOS gates DeviceMotion behind requestPermission();
  // Android / desktop have no gate, so motion is available immediately — auto-grant
  // there so shake feedback works without a redundant prompt (iOS stays 'unknown'
  // until the user grants via requestPermission()).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      setPermission('granted');
      return;
    }
    if (!('DeviceMotionEvent' in window)) {
      setPermission('unsupported');
      return;
    }
    // biome-ignore lint/suspicious/noExplicitAny: iOS-only requestPermission probe
    const DM = (window as any).DeviceMotionEvent;
    if (typeof DM?.requestPermission !== 'function') setPermission('granted');
  }, []);

  // Subscribe to DeviceMotion when granted
  useEffect(() => {
    if (permission !== 'granted') return;
    const peak = { mag: 0, start: 0 };

    function handler(e: DeviceMotionEvent) {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const x = a.x ?? 0;
      const y = a.y ?? 0;
      const z = a.z ?? 0;
      const m = Math.sqrt(x * x + y * y + z * z) - 9.8;
      const intensity = Math.max(0, Math.min(1, (m - NOISE_FLOOR) / (PEAK_CAP - NOISE_FLOOR)));
      if (intensity > 0.4) {
        if (peak.mag === 0) peak.start = Date.now();
        peak.mag = Math.max(peak.mag, intensity);
        if (Date.now() - peak.start > HOLD_MS) {
          onShakeRef.current(peak.mag);
          peak.mag = 0;
        }
      } else {
        peak.mag = 0;
      }
    }

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [permission]);

  const requestPermission = async (): Promise<Permission> => {
    if (typeof window === 'undefined') return 'unsupported';
    // biome-ignore lint/suspicious/noExplicitAny: iOS-specific API
    const DM = (window as any).DeviceMotionEvent;
    if (typeof DM?.requestPermission === 'function') {
      try {
        const resp: 'granted' | 'denied' = await DM.requestPermission();
        const next: Permission = resp === 'granted' ? 'granted' : 'denied';
        setPermission(next);
        if (next === 'granted') localStorage.setItem(STORAGE_KEY, '1');
        return next;
      } catch {
        setPermission('denied');
        return 'denied';
      }
    }
    // Android Chrome and others — no explicit permission needed
    setPermission('granted');
    localStorage.setItem(STORAGE_KEY, '1');
    return 'granted';
  };

  return { permission, requestPermission };
}
