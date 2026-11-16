import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

async function generateAssets() {
  const publicDir = path.resolve(process.cwd(), 'public');
  const faviconSvgPath = path.join(publicDir, 'favicon.svg');
  const faviconSvg = fs.readFileSync(faviconSvgPath, 'utf-8');

  // 1. Standard PWA icons & Apple Touch Icon from public/favicon.svg
  await sharp(Buffer.from(faviconSvg))
    .resize(192, 192)
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  await sharp(Buffer.from(faviconSvg))
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  await sharp(Buffer.from(faviconSvg))
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // 2. Maskable 512x512 icon derived from public/favicon.svg with full-bleed background and 20% safe-zone margin
  const innerPathsMatch = faviconSvg
    .replace(/<svg[^>]*>/i, '')
    .replace(/<\/svg>/i, '')
    .replace(/<rect[^>]*\/?>/i, '');

  const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="darnaBgMask" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1E3D34" />
        <stop offset="100%" stop-color="#142923" />
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#darnaBgMask)" />
    <g transform="translate(102.4, 102.4) scale(2.4)">
      ${innerPathsMatch}
    </g>
  </svg>`;

  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, 'pwa-512x512-maskable.png'));

  // 3. Default OpenGraph social preview image (/og-default.png, 1200x630, Darna logo + slogan)
  const ogDefaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
    <defs>
      <linearGradient id="ogBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1E3D34" />
        <stop offset="60%" stop-color="#162E27" />
        <stop offset="100%" stop-color="#0F201B" />
      </linearGradient>
      <linearGradient id="accentLine" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#C15C3D" />
        <stop offset="50%" stop-color="#FBBF24" />
        <stop offset="100%" stop-color="#C15C3D" />
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="1200" height="630" fill="url(#ogBg)" />

    <!-- Subtle Moroccan Architectural Frame -->
    <rect x="36" y="36" width="1128" height="558" rx="28" fill="none" stroke="#FAF7F2" stroke-opacity="0.14" stroke-width="2" />
    <rect x="52" y="52" width="1096" height="526" rx="20" fill="none" stroke="#C15C3D" stroke-opacity="0.3" stroke-width="1.5" />

    <!-- Embedded Darna Logo Icon (centered at top) -->
    <g transform="translate(520, 95) scale(1.25)">
      <rect width="128" height="128" rx="28" fill="#FAF7F2" fill-opacity="0.08" stroke="#FAF7F2" stroke-opacity="0.2" stroke-width="2" />
      <path
        d="M64 22 C42 22 30 39 30 58 C30 67 34 74 39 78 L39 102 L89 102 L89 78 C94 74 98 67 98 58 C98 39 86 22 64 22 Z"
        fill="#FAF7F2"
      />
      <path
        d="M64 34 C49 34 41 46 41 59 C41 66 44 71 48 74 L48 94 L80 94 L80 74 C84 71 87 66 87 59 C87 46 79 34 64 34 Z"
        fill="#C15C3D"
      />
      <polygon
        points="64,46 67.5,54.5 76.5,55.2 69.5,61.2 71.8,70 64,65.2 56.2,70 58.5,61.2 51.5,55.2 60.5,54.5"
        fill="#FBBF24"
      />
    </g>

    <!-- Brand Name -->
    <text x="600" y="340" text-anchor="middle" fill="#FAF7F2" font-family="Georgia, serif" font-size="76" font-weight="bold" letter-spacing="2">
      DARNA
    </text>

    <!-- Accent Divider -->
    <rect x="460" y="368" width="280" height="4" rx="2" fill="url(#accentLine)" />

    <!-- Primary Slogan -->
    <text x="600" y="428" text-anchor="middle" fill="#FAF7F2" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold">
      L&apos;immobilier locatif réinventé au Maroc
    </text>

    <!-- Subtitle / Categories -->
    <text x="600" y="482" text-anchor="middle" fill="#D6D3D1" font-family="Arial, Helvetica, sans-serif" font-size="24">
      Appartements • Villas • Studios • Bureaux &amp; Commerces
    </text>

    <!-- Bottom Pill Badge -->
    <rect x="450" y="514" width="300" height="42" rx="21" fill="#C15C3D" />
    <text x="600" y="542" text-anchor="middle" fill="#FAF7F2" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" letter-spacing="1">
      DARNA.MA
    </text>
  </svg>`;

  await sharp(Buffer.from(ogDefaultSvg))
    .resize(1200, 630)
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, 'og-default.png'));
}

generateAssets().catch((err) => {
  console.error('Failed to generate PNG assets:', err);
  process.exit(1);
});
