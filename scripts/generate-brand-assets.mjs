import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// 1. Write crisp Vector SVG Icon (public/icon.svg & src/app/icon.svg)
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="512" x2="512" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e40af" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="fiberCyan" x1="120" y1="400" x2="380" y2="120" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>
    <linearGradient id="boltGrad" x1="330" y1="180" x2="410" y2="390" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Squircle Background -->
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bgGrad)" />
  <rect x="24" y="24" width="464" height="464" rx="104" stroke="#38bdf8" stroke-opacity="0.28" stroke-width="4" />

  <!-- Subtle Tech Grid Arcs -->
  <circle cx="400" cy="112" r="190" stroke="#38bdf8" stroke-opacity="0.12" stroke-width="3" stroke-dasharray="10 10" />
  <circle cx="112" cy="400" r="160" stroke="#34d399" stroke-opacity="0.12" stroke-width="3" />

  <!-- Secondary Parallel Fiber Optic Circuit Strand -->
  <path d="M208 392V312H300" stroke="#38bdf8" stroke-opacity="0.75" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />

  <!-- Optical Fiber Strands Forming Stylized 'F' -->
  <path d="M140 392V128H356" stroke="url(#fiberCyan)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" />
  <path d="M140 248H284" stroke="url(#fiberCyan)" stroke-width="34" stroke-linecap="round" />

  <!-- High-Speed Pulse Bolt Accent (Right Side, cleanly separated) -->
  <path d="M388 184L332 276H380L342 384L430 260H378L388 184Z" fill="url(#boltGrad)" />

  <!-- Glowing Optical Nodes (FTTH OLT / FDT / FAT Terminals) -->
  <circle cx="356" cy="128" r="25" fill="#34d399" />
  <circle cx="356" cy="128" r="11" fill="#ffffff" />

  <circle cx="284" cy="248" r="21" fill="#38bdf8" />
  <circle cx="284" cy="248" r="9.5" fill="#ffffff" />

  <circle cx="140" cy="392" r="23" fill="#38bdf8" />
  <circle cx="140" cy="392" r="10" fill="#ffffff" />

  <circle cx="300" cy="312" r="15" fill="#34d399" />
  <circle cx="300" cy="312" r="6.5" fill="#ffffff" />
</svg>
`;

const logoHorizontalSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 160" fill="none">
  <defs>
    <linearGradient id="bgGradH" x1="0" y1="160" x2="160" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e40af" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="fiberCyanH" x1="24" y1="136" x2="136" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>
    <linearGradient id="boltGradH" x1="95" y1="55" x2="135" y2="130" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
  </defs>

  <!-- Icon Badge -->
  <rect x="10" y="10" width="140" height="140" rx="34" fill="url(#bgGradH)" />
  <path d="M64 122V98H92" stroke="#38bdf8" stroke-opacity="0.75" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M45 122V44H108" stroke="url(#fiberCyanH)" stroke-width="11.5" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M45 80H88" stroke="url(#fiberCyanH)" stroke-width="10.5" stroke-linecap="round" />
  <path d="M118 60L101 88H116L104 120L131 83H115L118 60Z" fill="url(#boltGradH)" />
  <circle cx="108" cy="44" r="7.5" fill="#34d399" />
  <circle cx="108" cy="44" r="3.5" fill="#ffffff" />
  <circle cx="88" cy="80" r="6.5" fill="#38bdf8" />
  <circle cx="88" cy="80" r="3" fill="#ffffff" />
  <circle cx="45" cy="122" r="7" fill="#38bdf8" />
  <circle cx="45" cy="122" r="3" fill="#ffffff" />
  <circle cx="92" cy="98" r="4.5" fill="#34d399" />
  <circle cx="92" cy="98" r="2" fill="#ffffff" />

  <!-- Brand Text -->
  <text x="174" y="88" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="900" font-size="64" fill="#0f172a" letter-spacing="-1.5">Fiber<tspan fill="#2563eb">OS</tspan></text>
  <rect x="430" y="46" width="76" height="32" rx="8" fill="#dbeafe" />
  <text x="468" y="68" text-anchor="middle" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="800" font-size="18" fill="#1d4ed8">FTTH</text>
  <text x="176" y="122" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="600" font-size="22" fill="#64748b" letter-spacing="0.5">GCI-MTI BLORA ROLLOUT MONITORING</text>
</svg>
`;

fs.writeFileSync(path.resolve('public/icon.svg'), iconSvg);
fs.writeFileSync(path.resolve('src/app/icon.svg'), iconSvg);
fs.writeFileSync(path.resolve('public/logo.svg'), logoHorizontalSvg);
console.log('Generated public/icon.svg, src/app/icon.svg, and public/logo.svg');

function clamp(v, min = 0, max = 255) {
  return v < min ? min : v > max ? max : Math.round(v);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-10) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function roundedRectSDF(nx, ny, halfW, halfH, radius) {
  const qx = Math.abs(nx - 0.5) - (halfW - radius);
  const qy = Math.abs(ny - 0.5) - (halfH - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

const boltPoly = [
  [388 / 512, 184 / 512],
  [332 / 512, 276 / 512],
  [380 / 512, 276 / 512],
  [342 / 512, 384 / 512],
  [430 / 512, 260 / 512],
  [378 / 512, 260 / 512],
];

function sampleIconPixel(nx, ny, maskable = false) {
  const diag = Math.max(0, Math.min(1, (nx + (1 - ny)) * 0.5));
  let bgR, bgG, bgB;
  if (diag < 0.5) {
    const t = diag * 2;
    bgR = lerp(15, 30, t);
    bgG = lerp(23, 64, t);
    bgB = lerp(42, 175, t);
  } else {
    const t = (diag - 0.5) * 2;
    bgR = lerp(30, 2, t);
    bgG = lerp(64, 132, t);
    bgB = lerp(175, 199, t);
  }

  let alpha = 1.0;
  if (!maskable) {
    const sdf = roundedRectSDF(nx, ny, 240 / 512, 240 / 512, 112 / 512);
    if (sdf > 0.004) return [0, 0, 0, 0];
    if (sdf > -0.004) {
      alpha = 1 - (sdf + 0.004) / 0.008;
    }
    if (Math.abs(sdf + 0.012) < 0.004) {
      bgR = lerp(bgR, 56, 0.35);
      bgG = lerp(bgG, 189, 0.35);
      bgB = lerp(bgB, 248, 0.35);
    }
  }

  let r = bgR, g = bgG, b = bgB;

  // Secondary parallel fiber strand: (208,392) -> (208,312) -> (300,312)
  const dSec1 = distToSegment(nx, ny, 208 / 512, 392 / 512, 208 / 512, 312 / 512);
  const dSec2 = distToSegment(nx, ny, 208 / 512, 312 / 512, 300 / 512, 312 / 512);
  const dSec = Math.min(dSec1, dSec2);
  if (dSec < 9 / 512) {
    r = lerp(r, 56, 0.72);
    g = lerp(g, 189, 0.72);
    b = lerp(b, 248, 0.72);
  }

  // Main 'F' Fiber Trunk: (140,392) -> (140,128) -> (356,128) and Mid bar (140,248) -> (284,248)
  const dTrunk = distToSegment(nx, ny, 140 / 512, 392 / 512, 140 / 512, 128 / 512);
  const dTop = distToSegment(nx, ny, 140 / 512, 128 / 512, 356 / 512, 128 / 512);
  const dMid = distToSegment(nx, ny, 140 / 512, 248 / 512, 284 / 512, 248 / 512);
  const dMain = Math.min(dTrunk, dTop, dMid);

  const fiberR = lerp(56, 52, diag);
  const fiberG = lerp(189, 211, diag);
  const fiberB = lerp(248, 153, diag);

  if (dMain < 28 / 512) {
    const glowT = Math.max(0, 1 - dMain / (28 / 512)) * 0.35;
    r = lerp(r, fiberR, glowT);
    g = lerp(g, fiberG, glowT);
    b = lerp(b, fiberB, glowT);
  }

  if (dMain < 18.5 / 512) {
    const edgeT = dMain > 15.5 / 512 ? 1 - (dMain - 15.5 / 512) / (3 / 512) : 1;
    r = lerp(r, fiberR, edgeT);
    g = lerp(g, fiberG, edgeT);
    b = lerp(b, fiberB, edgeT);
  }

  // Lightning pulse bolt
  if (pointInPolygon(nx, ny, boltPoly)) {
    const bt = Math.max(0, Math.min(1, (ny - 0.35) / 0.4));
    r = lerp(253, 245, bt);
    g = lerp(224, 158, bt);
    b = lerp(71, 11, bt);
  }

  // Optical Nodes
  const nodes = [
    { x: 356 / 512, y: 128 / 512, ro: 25 / 512, ri: 11 / 512, cr: [52, 211, 153] },
    { x: 284 / 512, y: 248 / 512, ro: 21 / 512, ri: 9.5 / 512, cr: [56, 189, 248] },
    { x: 140 / 512, y: 392 / 512, ro: 23 / 512, ri: 10 / 512, cr: [56, 189, 248] },
    { x: 300 / 512, y: 312 / 512, ro: 15 / 512, ri: 6.5 / 512, cr: [52, 211, 153] },
  ];

  for (const nd of nodes) {
    const d = Math.hypot(nx - nd.x, ny - nd.y);
    if (d < nd.ro) {
      r = nd.cr[0];
      g = nd.cr[1];
      b = nd.cr[2];
    }
    if (d < nd.ri) {
      r = 255;
      g = 255;
      b = 255;
    }
  }

  return [clamp(r), clamp(g), clamp(b), clamp(alpha * 255)];
}

function renderSupersampledRGBA(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const nx = (x + (sx + 0.5) / ss) / size;
          const ny = (y + (sy + 0.5) / ss) / size;
          const [r, g, b, a] = sampleIconPixel(nx, ny, maskable);
          rSum += r;
          gSum += g;
          bSum += b;
          aSum += a;
        }
      }
      const idx = (y * size + x) * 4;
      buf[idx] = clamp(rSum / (ss * ss));
      buf[idx + 1] = clamp(gSum / (ss * ss));
      buf[idx + 2] = clamp(bSum / (ss * ss));
      buf[idx + 3] = clamp(aSum / (ss * ss));
    }
  }
  return buf;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0;
    rgba.copy(rawData, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeICO(pngBuffersWithSizes) {
  const count = pngBuffersWithSizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;

  for (const { size, png } of pngBuffersWithSizes) {
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size;
    entry[1] = size === 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffersWithSizes.map((x) => x.png)]);
}

const png16 = encodePNG(16, 16, renderSupersampledRGBA(16, false));
const png32 = encodePNG(32, 32, renderSupersampledRGBA(32, false));
const png48 = encodePNG(48, 48, renderSupersampledRGBA(48, false));
const png180 = encodePNG(180, 180, renderSupersampledRGBA(180, true));
const png192 = encodePNG(192, 192, renderSupersampledRGBA(192, false));
const png192Mask = encodePNG(192, 192, renderSupersampledRGBA(192, true));
const png512 = encodePNG(512, 512, renderSupersampledRGBA(512, false));
const png512Mask = encodePNG(512, 512, renderSupersampledRGBA(512, true));

const icoBuf = encodeICO([
  { size: 16, png: png16 },
  { size: 32, png: png32 },
  { size: 48, png: png48 },
]);

fs.writeFileSync(path.resolve('public/favicon.ico'), icoBuf);
fs.writeFileSync(path.resolve('src/app/favicon.ico'), icoBuf);
fs.writeFileSync(path.resolve('public/favicon-16x16.png'), png16);
fs.writeFileSync(path.resolve('public/favicon-32x32.png'), png32);
fs.writeFileSync(path.resolve('public/apple-touch-icon.png'), png180);
fs.writeFileSync(path.resolve('public/icons/apple-touch-icon.png'), png180);
fs.writeFileSync(path.resolve('public/icons/icon-192x192.png'), png192);
fs.writeFileSync(path.resolve('public/icons/icon-192x192-maskable.png'), png192Mask);
fs.writeFileSync(path.resolve('public/icons/icon-512x512.png'), png512);
fs.writeFileSync(path.resolve('public/icons/icon-512x512-maskable.png'), png512Mask);

console.log('Successfully generated refined PNG icons and multi-size favicon.ico!');
