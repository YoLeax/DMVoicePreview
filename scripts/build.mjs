import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Invalid build target');
const catalog = JSON.parse(await readFile(path.join(root, 'public/data/voices.json'), 'utf8'));
if (!catalog.voices.length || catalog.voices.some(voice => !voice.audio)) throw new Error('Incomplete voice catalog');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'web'), output, { recursive: true });
await cp(path.join(root, 'public'), output, { recursive: true });
await writeFile(path.join(output, '.nojekyll'), '');
async function sizeOf(directory) {
  let bytes = 0, files = 0;
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) { const child = await sizeOf(file); bytes += child.bytes; files += child.files; }
    else { bytes += (await stat(file)).size; files++; }
  }
  return { bytes, files };
}
const size = await sizeOf(output);
if (size.bytes >= 950_000_000) throw new Error('Site is too close to the GitHub Pages size limit');
console.log(`Built ${catalog.voices.length} previews · ${size.files} files · ${(size.bytes / 1e6).toFixed(2)} MB`);
