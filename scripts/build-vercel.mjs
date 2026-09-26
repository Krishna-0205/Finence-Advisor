import { build } from 'esbuild';
import { mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

console.log('Building Vercel Build Output API v3 artifacts...');

// 1. Clean previous .vercel/output
await rm('.vercel/output', { recursive: true, force: true });

// 2. Ensure target directories exist
await mkdir('.vercel/output/static', { recursive: true });
await mkdir('.vercel/output/functions/index.func', { recursive: true });

// 3. Copy static client assets
if (existsSync('dist/client')) {
  await cp('dist/client', '.vercel/output/static', { recursive: true });
  console.log('Copied static assets from dist/client to .vercel/output/static');
} else {
  console.warn('Warning: dist/client directory was not found. Run vite build first.');
}

// 4. Bundle Vercel Serverless Function entry point
await build({
  entryPoints: ['scripts/vercel-entry.ts'],
  outfile: '.vercel/output/functions/index.func/index.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['node:*'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logOverride: {
    'ignored-bare-import': 'silent',
  },
  sourcemap: false,
});
console.log('Bundled Vercel function to .vercel/output/functions/index.func/index.mjs');

// 5. If static dataset files exist (e.g. evals), copy them into function directory as well
if (existsSync('evals')) {
  await cp('evals', '.vercel/output/functions/index.func/evals', { recursive: true });
}

// 6. Write .vercel/output/functions/index.func/.vc-config.json
const vcConfig = {
  runtime: 'nodejs20.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: true,
  maxDuration: 15,
};
await writeFile(
  '.vercel/output/functions/index.func/.vc-config.json',
  JSON.stringify(vcConfig, null, 2),
);

// 7. Write .vercel/output/config.json
const config = {
  version: 3,
  routes: [
    {
      handle: 'filesystem',
    },
    {
      src: '/(.*)',
      dest: '/index',
    },
  ],
};
await writeFile(
  '.vercel/output/config.json',
  JSON.stringify(config, null, 2),
);

console.log('Vercel Output API v3 build complete! Ready for deployment.');
