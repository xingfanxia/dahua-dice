'use client';

import { Environment, Lightformer } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { CuboidCollider, Physics, type RapierRigidBody, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { oklchToHex } from '@/lib/theme/oklch-to-hex';
import { Dice, detectTopFace } from './Dice';
import { DiceCup } from './DiceCup';

export type DicePhase = 'idle' | 'rolling' | 'settled' | 'revealed';

export function DiceCanvas({
  diceCount,
  phase,
  shakeIntensity = 1,
  onAllSettled,
  onCollision,
}: {
  diceCount: number;
  phase: DicePhase;
  shakeIntensity?: number;
  onAllSettled?: (faces: number[]) => void;
  onCollision?: (force: number) => void;
}) {
  const { tokens } = useTheme();
  const bodyRefs = useRef<Array<RapierRigidBody | null>>([]);
  const [settled, setSettled] = useState<Record<number, number>>({});
  // Three.js can't parse oklch; convert via browser canvas roundtrip.
  const bgHex = useMemo(() => oklchToHex(tokens.colors.bg, '#0a0a0a'), [tokens.colors.bg]);

  // Track when all dice are settled
  useEffect(() => {
    if (phase === 'rolling') {
      setSettled({});
      // Apply random impulse on entering rolling phase
      bodyRefs.current.forEach((body) => {
        if (!body) return;
        const intensity = Math.max(0.3, shakeIntensity);
        body.applyImpulse(
          {
            x: (Math.random() - 0.5) * intensity * 4,
            y: intensity * 4 + Math.random() * 2,
            z: (Math.random() - 0.5) * intensity * 4,
          },
          true,
        );
        body.applyTorqueImpulse(
          {
            x: (Math.random() - 0.5) * intensity * 6,
            y: (Math.random() - 0.5) * intensity * 6,
            z: (Math.random() - 0.5) * intensity * 6,
          },
          true,
        );
      });
    }
  }, [phase, shakeIntensity]);

  useEffect(() => {
    const settledCount = Object.keys(settled).length;
    if (settledCount === diceCount && onAllSettled) {
      const faces = Array.from({ length: diceCount }, (_, i) => settled[i] ?? 1);
      onAllSettled(faces);
    }
  }, [settled, diceCount, onAllSettled]);

  function handleSettle(idx: number, face: number) {
    setSettled((prev) => ({ ...prev, [idx]: face }));
  }

  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      camera={{ position: [0, 5, 4], fov: 35 }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[bgHex]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={0.7} />
      <pointLight position={[-4, 3, -2]} intensity={0.4} />
      {/* Local env map built from in-scene lightformers — gives glass/enamel
          dice real reflections without fetching an external HDR. */}
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={1.2} position={[0, 5, 0]} scale={[6, 6, 1]} />
        <Lightformer intensity={0.6} position={[4, 2, 2]} scale={[3, 3, 1]} />
        <Lightformer intensity={0.6} position={[-4, 2, -2]} scale={[3, 3, 1]} />
      </Environment>
      <Physics gravity={[0, -9.8, 0]} timeStep="vary">
        {/* Floor */}
        <RigidBody type="fixed" position={[0, -0.1, 0]}>
          <CuboidCollider args={[4, 0.1, 4]} />
        </RigidBody>

        {/* Cup (hidden when revealed) */}
        <DiceCup visible={phase !== 'revealed'} yOffset={phase === 'revealed' ? 4 : 0} />

        {/* Dice */}
        {Array.from({ length: diceCount }).map((_, i) => (
          <Dice
            /* biome-ignore lint/suspicious/noArrayIndexKey: index is the dice identity */
            key={i}
            diceIndex={i}
            initialPosition={[(i - diceCount / 2) * 0.4, 1.5 + i * 0.4, 0]}
            onSettle={handleSettle}
            onContactForce={onCollision}
            forwardRef={(ref) => {
              bodyRefs.current[i] = ref;
            }}
          />
        ))}
      </Physics>
    </Canvas>
  );
}

// Re-export for use elsewhere
export { detectTopFace };
