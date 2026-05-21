'use client';

import { Canvas } from '@react-three/fiber';
import { Physics, RigidBody, type RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { detectTopFace, Dice } from './Dice';
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
      <color attach="background" args={[tokens.colors.bg]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={0.7} />
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
