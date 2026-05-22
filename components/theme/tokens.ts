export type ThemeKey = 'modern-minimal' | 'classic-bar' | 'hk-neon' | 'cartoon';

export type ThemeColors = {
  bg: string;
  surface: string;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  success: string;
  danger: string;
  diceFace: string;
  diceDot: string;
};

export type ThemeTokens = {
  key: ThemeKey;
  label: { 'zh-CN': string; en: string };
  colors: ThemeColors;
  fonts: { display: string; ui: string };
  dice: {
    textureSetUrl: string;
    material: 'glass' | 'ivory' | 'painted' | 'soft';
    cupMaterial: 'metal' | 'leather' | 'enamel' | 'ceramic';
  };
  audioPackPath: string;
  motion: { duration: string; easing: string };
};

export const THEMES: Record<ThemeKey, ThemeTokens> = {
  'modern-minimal': {
    key: 'modern-minimal',
    label: { 'zh-CN': '现代极简', en: 'Modern Minimal' },
    colors: {
      bg: 'oklch(0.12 0.02 250)',
      surface: 'oklch(0.18 0.03 250)',
      primary: 'oklch(0.7 0.15 230)',
      accent: 'oklch(0.75 0.18 50)',
      text: 'oklch(0.96 0.02 250)',
      textMuted: 'oklch(0.7 0.02 250)',
      success: 'oklch(0.7 0.18 145)',
      danger: 'oklch(0.65 0.22 25)',
      diceFace: 'oklch(0.92 0.02 250)',
      diceDot: 'oklch(0.2 0.02 250)',
    },
    fonts: { display: 'var(--font-space-grotesk)', ui: 'var(--font-outfit)' },
    dice: { textureSetUrl: '/dice-textures/modern/', material: 'glass', cupMaterial: 'metal' },
    audioPackPath: '/audio/modern.json',
    motion: { duration: '200ms', easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  },
  'classic-bar': {
    key: 'classic-bar',
    label: { 'zh-CN': '经典酒桌', en: 'Classic Bar' },
    colors: {
      bg: 'oklch(0.25 0.04 60)',
      surface: 'oklch(0.32 0.05 60)',
      primary: 'oklch(0.55 0.15 50)',
      accent: 'oklch(0.85 0.12 80)',
      text: 'oklch(0.92 0.04 80)',
      textMuted: 'oklch(0.65 0.04 60)',
      success: 'oklch(0.65 0.14 130)',
      danger: 'oklch(0.55 0.2 25)',
      diceFace: 'oklch(0.92 0.02 80)',
      diceDot: 'oklch(0.15 0.02 60)',
    },
    fonts: { display: 'var(--font-newsreader)', ui: 'var(--font-outfit)' },
    dice: { textureSetUrl: '/dice-textures/ivory/', material: 'ivory', cupMaterial: 'leather' },
    audioPackPath: '/audio/classic.json',
    motion: { duration: '300ms', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  },
  'hk-neon': {
    key: 'hk-neon',
    label: { 'zh-CN': '港风霓虹', en: 'HK Neon' },
    colors: {
      bg: 'oklch(0.15 0.04 320)',
      surface: 'oklch(0.22 0.06 320)',
      primary: 'oklch(0.7 0.25 340)',
      accent: 'oklch(0.85 0.18 200)',
      text: 'oklch(0.96 0.04 320)',
      textMuted: 'oklch(0.7 0.05 320)',
      success: 'oklch(0.7 0.2 145)',
      danger: 'oklch(0.65 0.25 15)',
      diceFace: 'oklch(0.94 0.04 340)',
      diceDot: 'oklch(0.25 0.04 320)',
    },
    fonts: { display: 'var(--font-noto-serif-tc)', ui: 'var(--font-outfit)' },
    dice: { textureSetUrl: '/dice-textures/hk/', material: 'painted', cupMaterial: 'enamel' },
    audioPackPath: '/audio/hk.json',
    motion: { duration: '250ms', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  },
  cartoon: {
    key: 'cartoon',
    label: { 'zh-CN': '卡通可爱', en: 'Cartoon' },
    colors: {
      bg: 'oklch(0.95 0.03 70)',
      surface: 'oklch(1 0.02 70)',
      primary: 'oklch(0.75 0.15 30)',
      accent: 'oklch(0.7 0.18 150)',
      text: 'oklch(0.22 0.04 30)',
      textMuted: 'oklch(0.55 0.04 30)',
      success: 'oklch(0.7 0.18 150)',
      danger: 'oklch(0.65 0.22 25)',
      diceFace: 'oklch(0.96 0.05 30)',
      diceDot: 'oklch(0.35 0.05 30)',
    },
    fonts: { display: 'var(--font-plus-jakarta)', ui: 'var(--font-plus-jakarta)' },
    dice: { textureSetUrl: '/dice-textures/cartoon/', material: 'soft', cupMaterial: 'ceramic' },
    audioPackPath: '/audio/cartoon.json',
    motion: { duration: '350ms', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  },
};

export const DEFAULT_THEME: ThemeKey = 'modern-minimal';

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

const camelToKebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function applyThemeToRoot(theme: ThemeKey) {
  if (typeof document === 'undefined') return;
  const t = THEMES[theme];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.colors)) {
    root.style.setProperty(`--theme-${camelToKebab(k)}`, v);
  }
  root.style.setProperty('--theme-font-display', t.fonts.display);
  root.style.setProperty('--theme-font-ui', t.fonts.ui);
  root.style.setProperty('--theme-motion-duration', t.motion.duration);
  root.style.setProperty('--theme-motion-easing', t.motion.easing);
  root.dataset.theme = t.key;
}
