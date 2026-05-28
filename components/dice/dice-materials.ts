import type { ThemeTokens } from '@/components/theme/tokens';

export type DiceMaterialKind = ThemeTokens['dice']['material']; // 'glass' | 'ivory' | 'painted' | 'soft'

/**
 * Per-theme physical-material parameters for the dice body. Each theme's dice
 * reads as a distinct substance under the scene's direct light + local env map:
 * - glass   → frosted translucent (modern-minimal)
 * - ivory   → warm matte bone with soft sheen (classic-bar)
 * - painted → glossy lacquered enamel (hk-neon)
 * - soft    → matte glazed ceramic (cartoon)
 *
 * Values are tuned for meshPhysicalMaterial. Reflections come from the local
 * Lightformer environment in DiceCanvas (no external HDR fetch).
 */
export type DiceBodyMaterial = {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  reflectivity: number;
  sheen: number;
  envMapIntensity: number;
};

export type DicePipMaterial = {
  roughness: number;
  metalness: number;
  clearcoat: number;
};

const BODY: Record<DiceMaterialKind, DiceBodyMaterial> = {
  glass: {
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
    transmission: 0.5,
    thickness: 0.7,
    ior: 1.45,
    reflectivity: 0.45,
    sheen: 0,
    envMapIntensity: 1.1,
  },
  ivory: {
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.45,
    transmission: 0,
    thickness: 0,
    ior: 1.4,
    reflectivity: 0.3,
    sheen: 0.35,
    envMapIntensity: 0.6,
  },
  painted: {
    roughness: 0.16,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    transmission: 0,
    thickness: 0,
    ior: 1.5,
    reflectivity: 0.6,
    sheen: 0,
    envMapIntensity: 1.3,
  },
  soft: {
    roughness: 0.64,
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.6,
    transmission: 0,
    thickness: 0,
    ior: 1.4,
    reflectivity: 0.2,
    sheen: 0.25,
    envMapIntensity: 0.4,
  },
};

const PIP: Record<DiceMaterialKind, DicePipMaterial> = {
  glass: { roughness: 0.5, metalness: 0, clearcoat: 0.3 },
  ivory: { roughness: 0.65, metalness: 0, clearcoat: 0 },
  painted: { roughness: 0.2, metalness: 0.1, clearcoat: 0.8 },
  soft: { roughness: 0.7, metalness: 0, clearcoat: 0 },
};

export function diceBodyMaterial(kind: DiceMaterialKind): DiceBodyMaterial {
  return BODY[kind];
}

export function dicePipMaterial(kind: DiceMaterialKind): DicePipMaterial {
  return PIP[kind];
}
