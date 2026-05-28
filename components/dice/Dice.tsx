'use client';

import { type RapierRigidBody, RigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { useTheme } from '@/components/theme/ThemeProvider';
import { oklchToHex } from '@/lib/theme/oklch-to-hex';
import { type DicePipMaterial, diceBodyMaterial, dicePipMaterial } from './dice-materials';

const DICE_SIZE = 0.7;

const FACE_NORMALS = [
  { face: 5, n: new Vector3(0, 1, 0) },
  { face: 2, n: new Vector3(0, -1, 0) },
  { face: 1, n: new Vector3(1, 0, 0) },
  { face: 6, n: new Vector3(-1, 0, 0) },
  { face: 3, n: new Vector3(0, 0, 1) },
  { face: 4, n: new Vector3(0, 0, -1) },
] as const;

export function detectTopFace(body: RapierRigidBody): number {
  const rot = body.rotation();
  const q = new Quaternion(rot.x, rot.y, rot.z, rot.w);
  let bestFace = 1;
  let bestDot = -2;
  for (const { face, n } of FACE_NORMALS) {
    const rotated = n.clone().applyQuaternion(q);
    if (rotated.y > bestDot) {
      bestDot = rotated.y;
      bestFace = face;
    }
  }
  return bestFace;
}

export type DiceRef = RapierRigidBody;

export function Dice({
  diceIndex,
  initialPosition,
  onSettle,
  onContactForce,
  forwardRef,
}: {
  diceIndex: number;
  initialPosition: [number, number, number];
  onSettle?: (idx: number, face: number) => void;
  onContactForce?: (force: number) => void;
  forwardRef?: (ref: RapierRigidBody | null) => void;
}) {
  const { tokens } = useTheme();
  const faceHex = useMemo(
    () => oklchToHex(tokens.colors.diceFace, '#e8e8e8'),
    [tokens.colors.diceFace],
  );
  const dotHex = useMemo(
    () => oklchToHex(tokens.colors.diceDot, '#1a1a1a'),
    [tokens.colors.diceDot],
  );
  const bodyMat = useMemo(() => diceBodyMaterial(tokens.dice.material), [tokens.dice.material]);
  const pipMat = useMemo(() => dicePipMaterial(tokens.dice.material), [tokens.dice.material]);
  const ref = useRef<RapierRigidBody>(null);

  return (
    <RigidBody
      ref={(node) => {
        ref.current = node;
        forwardRef?.(node);
      }}
      position={initialPosition}
      rotation={[Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI]}
      type="dynamic"
      colliders="cuboid"
      restitution={0.3}
      friction={0.5}
      angularDamping={0.4}
      linearDamping={0.2}
      onSleep={() => {
        if (ref.current && onSettle) onSettle(diceIndex, detectTopFace(ref.current));
      }}
      onContactForce={(payload) => {
        if (onContactForce) onContactForce(payload.totalForceMagnitude);
      }}
    >
      <mesh castShadow={false}>
        <boxGeometry args={[DICE_SIZE, DICE_SIZE, DICE_SIZE]} />
        <meshPhysicalMaterial
          color={faceHex}
          roughness={bodyMat.roughness}
          metalness={bodyMat.metalness}
          clearcoat={bodyMat.clearcoat}
          clearcoatRoughness={bodyMat.clearcoatRoughness}
          transmission={bodyMat.transmission}
          thickness={bodyMat.thickness}
          ior={bodyMat.ior}
          reflectivity={bodyMat.reflectivity}
          sheen={bodyMat.sheen}
          sheenColor={faceHex}
          envMapIntensity={bodyMat.envMapIntensity}
        />
      </mesh>
      {/* Pips: render as small spheres per face, positioned by face number */}
      {[1, 2, 3, 4, 5, 6].map((face) => (
        <DicePips key={face} face={face} color={dotHex} mat={pipMat} />
      ))}
    </RigidBody>
  );
}

function DicePips({ face, color, mat }: { face: number; color: string; mat: DicePipMaterial }) {
  // Pip positions per face — face index → offset on which axis the pips sit
  const offset = DICE_SIZE / 2 + 0.001;
  const pipRadius = 0.06;
  const pipSpacing = 0.18;

  // Local positions of the pips for face values 1-6, on the +X face
  const pipsForCount: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [
      [-pipSpacing, -pipSpacing],
      [pipSpacing, pipSpacing],
    ],
    3: [
      [-pipSpacing, -pipSpacing],
      [0, 0],
      [pipSpacing, pipSpacing],
    ],
    4: [
      [-pipSpacing, -pipSpacing],
      [-pipSpacing, pipSpacing],
      [pipSpacing, -pipSpacing],
      [pipSpacing, pipSpacing],
    ],
    5: [
      [-pipSpacing, -pipSpacing],
      [-pipSpacing, pipSpacing],
      [0, 0],
      [pipSpacing, -pipSpacing],
      [pipSpacing, pipSpacing],
    ],
    6: [
      [-pipSpacing, -pipSpacing],
      [-pipSpacing, 0],
      [-pipSpacing, pipSpacing],
      [pipSpacing, -pipSpacing],
      [pipSpacing, 0],
      [pipSpacing, pipSpacing],
    ],
  };

  // Map face number → (rotation, position-of-face-on-cube)
  // Standard die: 1↔6, 2↔5, 3↔4 are opposite faces
  // We map to FACE_NORMALS above: face 5 = +Y, face 2 = -Y, face 1 = +X, face 6 = -X, face 3 = +Z, face 4 = -Z
  const faceToTransform: Record<
    number,
    { pos: [number, number, number]; rot: [number, number, number] }
  > = {
    1: { pos: [offset, 0, 0], rot: [0, Math.PI / 2, 0] },
    6: { pos: [-offset, 0, 0], rot: [0, -Math.PI / 2, 0] },
    5: { pos: [0, offset, 0], rot: [-Math.PI / 2, 0, 0] },
    2: { pos: [0, -offset, 0], rot: [Math.PI / 2, 0, 0] },
    3: { pos: [0, 0, offset], rot: [0, 0, 0] },
    4: { pos: [0, 0, -offset], rot: [0, Math.PI, 0] },
  };

  const transform = faceToTransform[face];
  const pips = pipsForCount[face] ?? [];

  return (
    <group position={transform.pos} rotation={transform.rot}>
      {pips.map((p, i) => (
        <mesh
          /* biome-ignore lint/suspicious/noArrayIndexKey: positional pip */
          key={i}
          position={[p[0], p[1], 0]}
        >
          <sphereGeometry args={[pipRadius, 12, 12]} />
          <meshPhysicalMaterial
            color={color}
            roughness={mat.roughness}
            metalness={mat.metalness}
            clearcoat={mat.clearcoat}
          />
        </mesh>
      ))}
    </group>
  );
}
