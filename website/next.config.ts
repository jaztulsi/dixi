import type { NextConfig } from 'next';

// Static export: the site is plain files, hostable anywhere. Images are pre-built by scripts/images.py.
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  outputFileTracingRoot: __dirname, // this folder is its own package, not part of a parent workspace
};
export default config;
