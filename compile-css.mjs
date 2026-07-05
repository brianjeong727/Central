import postcss from 'postcss';
import tailwindPlugin from '@tailwindcss/postcss';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const inputCSS = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');

const result = await postcss([tailwindPlugin()])
  .process(inputCSS, {
    from: join(ROOT, 'app/globals.css'),
    to: join(ROOT, '.design-sync/tailwind-compiled.css')
  });

writeFileSync(join(ROOT, '.design-sync/tailwind-compiled.css'), result.css);
const size = Math.round(Buffer.byteLength(result.css, 'utf8') / 1024);
console.log(`CSS compiled OK, ${size}KB`);
