#!/usr/bin/env node
/**
 * 生成 Android TV 必需的 320x180 banner 图标（xhdpi）。
 * TV 端无 PIL，用 PNG 手工编码（IHDR/IDAT/IEND + zlib）生成纯色图，避免依赖本机图形库。
 * 生成结果：apps/tv/assets/banner.png（供 app.json android.banner 使用，prebuild 时写入 res/drawable-xhdpi/banner.png）
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const W = 320;
const H = 180;
const RGB = [15, 15, 15]; // 与 app.json splash backgroundColor #0f0f0f 一致

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// 每行前置 filter byte 0（None）
const raw = Buffer.alloc(H * (1 + W * 3));
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0;
  for (let x = 0; x < W; x++) {
    raw[p++] = RGB[0];
    raw[p++] = RGB[1];
    raw[p++] = RGB[2];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = resolve(__dirname, '../assets/banner.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`✓ banner 已生成: ${out} (${W}x${H}, ${png.length} bytes)`);