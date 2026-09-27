// Build: bundle the ES modules and inline everything into ONE self-contained dist/index.html.
// The page gets a strict Content-Security-Policy that forbids every network request.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const out = path.join(root, 'dist');

export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'media-src mediastream: blob:',
  "connect-src 'none'",
  "font-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const result = await build({
  entryPoints: [path.join(src, 'js/main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  minify: true,
  legalComments: 'none',
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(path.join(src, 'styles.css'), 'utf8');
let html = await readFile(path.join(src, 'index.html'), 'utf8');

const replaceOnce = (s, needle, value) => {
  if (!s.includes(needle)) throw new Error(`build: marker not found: ${needle}`);
  return s.replace(needle, () => value);
};
html = replaceOnce(html, '<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
html = replaceOnce(html, '<link rel="stylesheet" href="styles.css">', `<style>\n${css}</style>`);
html = replaceOnce(html, '<script type="module" src="js/main.js"></script>', `<script>\n${js}</script>`);

await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'index.html'), html);
console.log(`dist/index.html  ${(html.length / 1024).toFixed(1)} KB, single file, CSP: no network`);
