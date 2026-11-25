// يطبع آخر سطور سجلات بناء EAS (الملفات قد تكون مضغوطة gzip/brotli/zstd أو نصاً عادياً).
import fs from 'node:fs';
import zlib from 'node:zlib';
const raw = fs.readFileSync(process.argv[2]);
let text = null;
for (const f of [(b) => zlib.gunzipSync(b), (b) => zlib.inflateSync(b), (b) => zlib.brotliDecompressSync(b), (b) => zlib.zstdDecompressSync?.(b), (b) => b]) {
  try { const r = f(raw); if (r) { const t = r.toString('utf8'); if (!t.includes('�')) { text = t; break; } } } catch {}
}
if (text === null) { console.log('تعذّر فك السجل، أول البايتات:', raw.subarray(0, 8).toString('hex')); process.exit(0); }
const lines = [];
for (const l of text.split('\n')) {
  try { const j = JSON.parse(l); if (j.msg) lines.push(`${j.phase ?? ''} | ${String(j.msg).trimEnd()}`); } catch { if (l.trim()) lines.push(l); }
}
console.log(lines.slice(-200).join('\n'));
