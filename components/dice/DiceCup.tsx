'use client';

import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useTheme } from '@/components/theme/ThemeProvider';

/**
 * The dice "cup" — a static cylindrical container for the dice. Until reveal phase,
 * sits over the dice covering them. On reveal, animates Y+ upward (handled by parent).
 *
 * For physics, we use 4 box walls + 1 floor (no real cylinder collider — Rapier doesn't
 * have one built-in, but the visual is a cylinder).
 */
export function DiceCup({
  visible = true,
  yOffset = 0,
}: {
  visible?: boolean;
  yOffset?: number;
}) {
  const { tokens } = useTheme();
  const radius = 1.6;
  const height = 2.5;
  const wallThickness = 0.1;

  return (
    <group position={[0, yOffset, 0]}>
      {/* Visual cylinder (open top, invisible top) */}
      {visible && (
        <mesh position={[0, height / 2, 0]}>
          <cylinderGeometry args={[radius, radius, height, 32, 1, true]} />
          <meshStandardMaterial
            color={tokens.colors.surface}
            roughness={0.5}
            metalness={tokens.dice.cupMaterial === 'metal' ? 0.7 : 0.1}
            side={2}
          />
        </mesh>
      )}

      {/* 4 wall colliders (box approximation of cylinder) */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle) => (
        <RigidBody key={angle} type="fixed" position={[Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius]}>
          <CuboidCollider
            args={[wallThickness, height / 2, radius]}
            rotation={[0, angle + Math.PI / 2, 0]}
          />
        </RigidBody>
      ))}
    </group>
  );
}
