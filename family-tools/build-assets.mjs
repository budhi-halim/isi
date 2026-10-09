import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const icons = new URL('../family/assets/icons/', import.meta.url);
await mkdir(icons, { recursive: true });
for (const kind of ['family', 'revenue', 'feedback']) {
  const master = await readFile(new URL(`${kind}.svg`, icons), 'utf8');
  for (const size of [16, 32, 48, 128, 180]) {
    await sharp(Buffer.from(master)).resize(size, size).png().toFile(fileURLToPath(new URL(`${kind}-${size}.png`, icons)));
  }
}
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(size => readFile(new URL(`family-${size}.png`, icons))));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
pngs.forEach((png, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(new URL('favicon.ico', icons), Buffer.concat([header, ...pngs]));
console.log('Rendered three Design A SVG masters to PNG size sets and a multi-resolution favicon.');
