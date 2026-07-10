// Run once: node download-fonts.mjs
// Downloads NotoSansHebrew TTF fonts and saves them as base64 for embedding in edge function

import { writeFileSync } from "fs";

const CDN = "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-hebrew@0.4.1";

console.log("Downloading NotoSansHebrew fonts...");

const [regBuf, boldBuf] = await Promise.all([
  fetch(`${CDN}/400Regular/NotoSansHebrew_400Regular.ttf`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }),
  fetch(`${CDN}/700Bold/NotoSansHebrew_700Bold.ttf`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }),
]);

const regB64  = Buffer.from(regBuf).toString("base64");
const boldB64 = Buffer.from(boldBuf).toString("base64");

writeFileSync("fonts-base64.json", JSON.stringify({ regular: regB64, bold: boldB64 }, null, 0));

console.log(`✓ Regular: ${Math.round(regBuf.byteLength / 1024)}KB`);
console.log(`✓ Bold:    ${Math.round(boldBuf.byteLength / 1024)}KB`);
console.log("✓ Saved to fonts-base64.json");
