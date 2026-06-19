import postcss from '/Users/brianjeong/Desktop/Projects/central/node_modules/postcss/lib/postcss.js';
import tailwindPlugin from '/Users/brianjeong/Desktop/Projects/central/node_modules/@tailwindcss/postcss/dist/index.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = '/Users/brianjeong/Desktop/Projects/central';
const inputCSS = readFileSync(join(root, 'app/globals.css'), 'utf8');

const result = await postcss([tailwindPlugin()])
  .process(inputCSS, {
    from: join(root, 'app/globals.css'),
    to: join(root, '.design-sync/tailwind-compiled.css')
  });

writeFileSync(join(root, '.design-sync/tailwind-compiled.css'), result.css);
const size = Math.round(Buffer.byteLength(result.css, 'utf8') / 1024);
console.log(`CSS compiled OK, ${size}KB`);
