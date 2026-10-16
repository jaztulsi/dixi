import type { Metadata, Viewport } from 'next';
import { Cinzel, Inter } from 'next/font/google';
import './globals.css';

// SF Pro comes from the system stack; these are the fallback and the Roman labels (self-hosted at build).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const cinzel = Cinzel({ subsets: ['latin'], weight: '400', variable: '--font-cinzel', display: 'swap' });

export const metadata: Metadata = {
  title: 'Runic: the web, hands-free',
  description: 'Runic is a voice-powered browser that acts before you finish your sentence.',
  openGraph: {
    title: 'Runic: the web, hands-free',
    description: 'Say what you want. Runic reads the page and does it, before you finish your sentence.',
    type: 'website',
  },
};

export const viewport: Viewport = { colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${cinzel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
