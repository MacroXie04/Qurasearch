// Generate the toolbar/extension PNG icons from an inline SVG so the build has
// no image-toolchain dependency. Run once; the PNGs in src/assets are committed.
//   node scripts/gen-icons.mjs
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'assets')

// Purple (#6750A4) rounded square with a white double quotation-mark glyph.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#6750A4"/>
  <g fill="#ffffff">
    <path d="M38 46 h18 v16 q0 16 -16 21 l-5 -9 q9 -3 9 -11 h-7 z"/>
    <path d="M72 46 h18 v16 q0 16 -16 21 l-5 -9 q9 -3 9 -11 h-7 z"/>
  </g>
</svg>`

const sizes = [16, 32, 48, 128]

await mkdir(outDir, { recursive: true })
for (const size of sizes) {
  const file = join(outDir, `icon-${size}.png`)
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(file)
  console.log('wrote', file)
}
console.log('done')
