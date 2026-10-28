import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // resvg ships a native binary; keep it out of the server bundle.
  serverExternalPackages: ['@resvg/resvg-js'],
};

export default nextConfig;
