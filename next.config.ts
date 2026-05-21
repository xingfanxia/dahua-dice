import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./lib/i18n.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // r3f / three needs CommonJS interop in some envs
  transpilePackages: ['three', '@react-three/fiber', '@react-three/rapier', '@react-three/drei'],
};

export default withNextIntl(nextConfig);
