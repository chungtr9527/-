// Renders www/tools/icon.html in headless Chromium (Playwright) and writes the @capacitor/assets inputs:
//   resources/icon-only.png, icon-foreground.png, icon-background.png (1024x1024), splash.png, splash-dark.png (2732x2732)
// Usage:
//   node scripts/export-icons.js            -> resources/*.png   (then: npx @capacitor/assets generate --android ...)
//   node scripts/export-icons.js --android  -> additionally re-renders the adaptive-icon layers straight into
//                                              android/app/src/main/res/mipmap-*/ic_launcher_{foreground,background}.png
//                                              at the real 108 dp sizes (@capacitor/assets 4.0.0 writes them at 48 dp, which
//                                              Android would upscale and blur) and rewrites mipmap-anydpi-v26/ic_launcher*.xml
//                                              without the tool's 16.7% inset. Run it after @capacitor/assets.
// Every PNG is verified by reading its IHDR chunk (no ImageMagick needed).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'tools', 'icon.html');
const OUT = path.join(ROOT, 'resources');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const KINDS = {
  'icon-only': [1024, 1024],
  'icon-foreground': [1024, 1024],
  'icon-background': [1024, 1024],
  'splash': [2732, 2732],
  'splash-dark': [2732, 2732]
};
// Adaptive-icon layers are 108 dp squares.
const DENSITIES = { ldpi: 81, mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const LAYERS = { 'icon-foreground': 'ic_launcher_foreground.png', 'icon-background': 'ic_launcher_background.png' };
const ADAPTIVE_ICON_XML = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<!-- Written by "node scripts/export-icons.js  - android" after "npx @capacitor/assets generate": that tool wraps both layers',
  '     in a 16.7% inset, which leaves the bleed zone transparent and shrinks a foreground that already respects the safe zone. -->',
  '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
  '    <background android:drawable="@mipmap/ic_launcher_background" />',
  '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />',
  '</adaptive-icon>',
  ''
].join('\n');
const PNG_SIGNATURE = '89504e470d0a1a0a';

// Width/height from a PNG buffer: 8-byte signature, then the IHDR chunk (length, 'IHDR', width, height, ...).
function pngSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) throw new Error('not a PNG: too short');
  if (buf.slice(0, 8).toString('hex') !== PNG_SIGNATURE) throw new Error('not a PNG: bad signature');
  if (buf.slice(12, 16).toString('latin1') !== 'IHDR') throw new Error('not a PNG: first chunk is not IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function decodeDataUrl(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new Error('exportIcon did not return a PNG data URL');
  return Buffer.from(m[1], 'base64');
}

async function renderPng(page, kind, width, height, size) {
  const buf = decodeDataUrl(await page.evaluate(([k, s]) => window.exportIcon(k, s), [kind, size === undefined ? null : size]));
  const got = pngSize(buf);
  if (got.width !== width || got.height !== height) throw new Error(`${kind}: rendered ${got.width}x${got.height}, expected ${width}x${height}`);
  return buf;
}

function write(file, buf, note) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`${path.relative(ROOT, file)}  ${note}`);
}

async function exportResources(page) {
  for (const kind of Object.keys(KINDS)) {
    const [w, h] = KINDS[kind];
    const buf = await renderPng(page, kind, w, h);
    write(path.join(OUT, kind + '.png'), buf, `${w}x${h}  ${buf.length} bytes`);
  }
}

async function exportAndroidLayers(page) {
  if (!fs.existsSync(RES)) throw new Error(`${path.relative(ROOT, RES)} not found: run "npx cap add android" first`);
  for (const density of Object.keys(DENSITIES)) {
    const px = DENSITIES[density];
    for (const kind of Object.keys(LAYERS)) {
      const buf = await renderPng(page, kind, px, px, px);
      write(path.join(RES, 'mipmap-' + density, LAYERS[kind]), buf, `${px}x${px}  ${buf.length} bytes`);
    }
  }
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) write(path.join(RES, 'mipmap-anydpi-v26', f), ADAPTIVE_ICON_XML, '(no inset)');
}

async function main(argv) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(PAGE, { waitUntil: 'load' });
    await exportResources(page);
    if (argv.includes('--android')) await exportAndroidLayers(page);
    if (errors.length) throw new Error('page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
}

module.exports = { KINDS, DENSITIES, LAYERS, OUT, RES, ADAPTIVE_ICON_XML, pngSize, decodeDataUrl };
if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
