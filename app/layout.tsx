import type { Metadata, Viewport } from 'next';
import {
  Newsreader,
  Noto_Serif_TC,
  Outfit,
  Plus_Jakarta_Sans,
  Space_Grotesk,
} from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'swap',
});
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' });
const notoSerifTc = Noto_Serif_TC({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-noto-serif-tc',
  display: 'swap',
});
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '大话骰',
  description:
    "2-8 player Liar's Dice with 3D physics, gyroscope shake-to-roll, and 4 switchable themes",
  applicationName: '大话骰',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: '大话骰' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#080d1f',
};

const fontClassNames = [
  spaceGrotesk.variable,
  newsreader.variable,
  outfit.variable,
  notoSerifTc.variable,
  plusJakarta.variable,
].join(' ');

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={fontClassNames} suppressHydrationWarning>
      <body className="min-h-[100dvh] antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
