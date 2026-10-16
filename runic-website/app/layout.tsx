import type { Metadata, Viewport } from 'next';
import { Cinzel, Inter } from 'next/font/google';
import './globals.css';

// SF Pro comes from the system stack; these are the fallback and the Roman labels (self-hosted at build).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const cinzel = Cinzel({ subsets: ['latin'], weight: '400', variable: '--font-cinzel', display: 'swap' });

export const metadata: Metadata = {
  title: 'Dixi: the web, hands-free',
  description: 'Dixi is a voice-powered browser that acts before you finish your sentence.',
  openGraph: {
    title: 'Dixi: the web, hands-free',
    description: 'Say what you want. Dixi reads the page and does it, before you finish your sentence.',
    type: 'website',
  },
};

export const viewport: Viewport = { colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${cinzel.variable}`}>
      <head>
        {/* The hero's stripe mass is the LCP element and a CSS background, so the browser would find it late. */}
        <link rel="preload" as="image" href="/img/marble-stripes.avif" type="image/avif" fetchPriority="high" media="(min-width: 640px)" />
      </head>
      <body>{children}</body>
    </html>
  );
}
