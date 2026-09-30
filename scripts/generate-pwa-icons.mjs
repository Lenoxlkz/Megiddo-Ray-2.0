import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Create SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#022c22" />
      <stop offset="50%" stop-color="#064e3b" />
      <stop offset="100%" stop-color="#047857" />
    </linearGradient>
    <linearGradient id="liquidGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#10b981" flood-opacity="0.4" />
    </filter>
  </defs>
  
  <!-- Rounded Background Container -->
  <rect width="512" height="512" rx="115" fill="url(#bgGrad)" />
  <rect width="500" height="500" x="6" y="6" rx="109" fill="none" stroke="#34d399" stroke-opacity="0.3" stroke-width="4" />
  
  <!-- Liquid Drop / Fast Download Dynamic Symbol -->
  <g filter="url(#glow)">
    <!-- Liquid drop contour -->
    <path d="M256 90 C256 90, 150 230, 150 315 C150 375, 197 422, 256 422 C315 422, 362 375, 362 315 C362 230, 256 90, 256 90 Z" fill="url(#liquidGrad)" />
    
    <!-- Inner Download Arrow & Speed Rays -->
    <path d="M256 185 L256 310 M210 270 L256 316 L302 270" fill="none" stroke="#022c22" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Bottom Speed Tray -->
    <line x1="200" y1="360" x2="312" y2="360" stroke="#022c22" stroke-width="24" stroke-linecap="round" />
    
    <!-- Accent Highlight -->
    <ellipse cx="225" cy="210" rx="16" ry="32" transform="rotate(-30 225 210)" fill="#ffffff" fill-opacity="0.45" />
  </g>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf8');

// Function to generate raw PNG file without external dependencies
function createPng(width, height, isMaskable = false) {
  // Simple CRC32 implementation
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[i] = c;
  }
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    const checkBuf = Buffer.concat([Buffer.from(type), data]);
    const crc = crc32(checkBuf);
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  // 1. Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // 2. IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // 3. Generate Image Pixel Data
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = width / 2;
  const safeMargin = isMaskable ? 0.25 : 0.08;

  let pos = 0;
  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0; // Filter byte for scanline: None (0)
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background emerald dark gradient
      const tY = y / height;
      let r = Math.round(2 + tY * 6);
      let g = Math.round(44 + tY * 76);
      let b = Math.round(34 + tY * 53);
      let a = 255;

      // Outer rounded bounds if not maskable
      if (!isMaskable) {
        const cornerRadius = 0.25;
        const qx = Math.max(0, Math.abs(dx) - (1 - cornerRadius));
        const qy = Math.max(0, Math.abs(dy) - (1 - cornerRadius));
        const cornerDist = Math.sqrt(qx * qx + qy * qy);
        if (cornerDist > cornerRadius) {
          a = 0;
        }
      }

      // Draw stylized liquid droplet / arrow inside
      const scaleFactor = 1 - safeMargin;
      const nx = (x - cx) / (maxR * scaleFactor);
      const ny = (y - cy) / (maxR * scaleFactor);

      // Drop shape: y in [-0.7, 0.7]
      const dropY = ny + 0.1;
      const rDrop = 0.55;
      const dropCenterDist = Math.sqrt(nx * nx + (dropY - 0.2) * (dropY - 0.2));
      const inTaper = dropY < 0.2 && Math.abs(nx) < (0.2 - dropY) * 0.7 && dropY > -0.7;

      if (a > 0 && (dropCenterDist < rDrop || inTaper)) {
        // Bright emerald green drop
        r = 16;
        g = 185;
        b = 129;

        // Inner arrow cutout in dark emerald
        const isArrowShaft = Math.abs(nx) < 0.09 && dropY > -0.25 && dropY < 0.22;
        const isArrowHead = dropY >= 0.1 && dropY <= 0.35 && Math.abs(nx) < (0.35 - dropY) * 1.3 && Math.abs(nx) > (0.35 - dropY) * 0.8 - 0.08;
        const isArrowTray = Math.abs(nx) < 0.28 && dropY >= 0.42 && dropY <= 0.52;

        if (isArrowShaft || isArrowHead || isArrowTray) {
          r = 2;
          g = 44;
          b = 34;
        }
      }

      rawData[pos++] = r;
      rawData[pos++] = g;
      rawData[pos++] = b;
      rawData[pos++] = a;
    }
  }

  // 4. Compress IDAT
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);

  // 5. IEND Chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Write PWA PNG icons
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, false));

console.log('Successfully generated all PWA icons in /public: icon.svg, pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png, apple-touch-icon.png');
