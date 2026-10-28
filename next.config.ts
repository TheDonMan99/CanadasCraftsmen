import type { NextConfig } from 'next';

const fonts = ['./public/fonts/*.ttf', './public/fonts/*.otf'];

const nextConfig: NextConfig = {
  // resvg ships a native binary; keep it out of the server bundle.
  serverExternalPackages: ['@resvg/resvg-js'],
  // the engine reads font files from disk on the server; make sure Vercel ships them with every function
  outputFileTracingIncludes: { '/': fonts, '/**/*': fonts },
};

export default nextConfig;
