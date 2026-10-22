// Original vector illustrations. No photographs, downloaded assets, fonts or AI artwork.
// Run with the pinned workspace Sharp dependency: node fixtures/inspections/generate.mjs
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sharp = createRequire(new URL('../../apps/api/package.json', import.meta.url))('sharp');
const definitions = `<defs>
  <linearGradient id="metal" x2="1" y2="1"><stop stop-color="#e1e8eb"/><stop offset=".45" stop-color="#9eafb9"/><stop offset="1" stop-color="#d5dfe4"/></linearGradient>
  <pattern id="brush" width="1200" height="8" patternUnits="userSpaceOnUse"><path d="M0 1H1200 M0 5H1200" stroke="#f4f8fb" stroke-opacity=".22"/></pattern>
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#344553" stroke-width="1"/></pattern>
</defs>`;
const bolt = (x, y) => `<circle cx="${x}" cy="${y}" r="23" fill="#71818c" stroke="#e6edf0" stroke-width="3"/>
  <circle cx="${x}" cy="${y}" r="12" fill="#354550"/><path d="M${x - 8} ${y}h16" stroke="#b4c1c9" stroke-width="3"/>`;
function document(width, height, title, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<title>${title} — original synthetic illustration, not manufacturing evidence</title>${definitions}
<rect width="${width}" height="${height}" fill="#1d2d39"/><rect width="${width}" height="${height}" fill="url(#grid)"/>${content}</svg>\n`;
}
function panel(marked) {
  return document(1200, 800, marked ? 'Illustrative marked machined panel' : 'Illustrative clean machined panel', `
    <rect x="150" y="116" width="920" height="600" rx="32" fill="#0c1822" opacity=".5"/>
    <rect x="140" y="100" width="920" height="600" rx="32" fill="url(#metal)" stroke="#edf3f5" stroke-width="3"/>
    <rect x="140" y="100" width="920" height="600" rx="32" fill="url(#brush)"/>
    <rect x="275" y="215" width="650" height="370" rx="18" fill="none" stroke="#718794" stroke-width="3"/>
    <path d="M295 235H905 M295 565H905" stroke="#edf3f5" stroke-width="2"/>
    ${[[220, 180], [980, 180], [220, 620], [980, 620]].map(([x, y]) => bolt(x, y)).join('')}
    <rect x="490" y="625" width="220" height="26" rx="13" fill="#526773" stroke="#d4dfe4" stroke-width="3"/>
    ${marked ? `<path d="M468 360l70-28 58 22 82-37 M490 373l70-28 42 21 52-22" fill="none" stroke="#5c4634" stroke-width="6" stroke-linecap="round"/>
      <path d="M468 356l70-28 58 22 82-37" fill="none" stroke="#f2c17c" stroke-width="2"/>
      <path d="M1062 410l-34 15 14 25-26 20 46 30z" fill="#1d2d39" stroke="#6d4e33" stroke-width="3"/>
      <path d="M794 535l45 16 M800 546l34 12" stroke="#67503d" stroke-width="5" stroke-linecap="round"/>` : ''}`);
}
const portrait = document(800, 1100, 'Illustrative component with edge irregularity', `
  <path d="M180 100H620V450l-38 22 20 28-27 26 45 30v444H180z" fill="url(#metal)" stroke="#edf3f5" stroke-width="3"/>
  <path d="M180 100H620V450l-38 22 20 28-27 26 45 30v444H180z" fill="url(#brush)"/>
  <rect x="255" y="245" width="290" height="610" rx="24" fill="#718794" stroke="#cdd9df" stroke-width="4"/>
  <rect x="280" y="275" width="240" height="550" rx="18" fill="#aebdc6"/>
  ${[[235, 165], [565, 165], [235, 935], [565, 935]].map(([x, y]) => bolt(x, y)).join('')}
  <path d="M618 450l-36 22 20 28-27 26 45 30" fill="none" stroke="#9a6031" stroke-width="5"/>`);

for (const [name, svg] of [['machined-panel', panel(true)], ['clean-panel', panel(false)], ['edge-component', portrait]]) {
  await writeFile(new URL(`${name}.svg`, import.meta.url), svg);
  // Encode once from SVG, then apply the same PNG canonicalization as ingestion.
  const pixels = await sharp(Buffer.from(svg)).png().toBuffer();
  const bytes = await sharp(pixels).autoOrient().toColourspace('srgb')
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, progressive: false }).toBuffer();
  await writeFile(new URL(`${name}.png`, import.meta.url), bytes);
  console.log(`${name}.png ${bytes.length} bytes sha256=${createHash('sha256').update(bytes).digest('hex')}`);
}
