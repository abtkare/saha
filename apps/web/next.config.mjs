import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(dir, '../../'),
  transpilePackages: ['@saha/ui', '@saha/shared'],
  poweredByHeader: false,
  async headers() {
    // منع الفهرسة قبل الإطلاق
    return process.env.NOINDEX === 'false' ? [] : [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};
export default nextConfig;
