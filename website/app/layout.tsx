import type { Metadata, Viewport } from 'next';
import { Cinzel, Inter } from 'next/font/google';
import './globals.css';

// SF Pro comes from the system stack; these are the fallback and the Roman labels (self-hosted at build).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const cinzel = Cinzel({ subsets: ['latin'], weight: '400', variable: '--font-cinzel', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://dixiai.vercel.app'), // link previews need an absolute image URL
  title: 'Dixi: the web, hands-free',
  description: 'Dixi is a voice-powered browser that acts before you finish your sentence.',
  authors: [{ name: 'Jasraj Tulsi' }],
  openGraph: {
    title: 'Dixi: the web, hands-free',
    description: 'Say what you want. Dixi reads the page and does it, before you finish your sentence.',
    type: 'website',
    url: '/',
    siteName: 'Dixi',
    // Set here, not via app/opengraph-image: that writes og:image:width before og:image, and LinkedIn then
    // falls back to an image from the page (the eyeless face.webp). Built by scripts/og.py.
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Dixi, the marble mascot, waving' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.jpg'] },
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
