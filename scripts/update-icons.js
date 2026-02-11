/**
 * Regenera los iconos de la PWA con el logo a tamaño completo.
 * fit: 'cover' hace que el logo llene todo el icono (recortando bordes si hace falta)
 * y se elimina el marco negro que se veía en iOS.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const PUBLIC = path.join(__dirname, '..', 'public');
const LOGO_SOURCE = path.join(PUBLIC, 'logo-source.png');

const SIZES = [
  { size: 512, out: 'icon-512x512.png' },
  { size: 192, out: 'icon-192x192.png' },
  { size: 180, out: 'apple-touch-icon-180.png' },
];

async function run() {
  if (!fs.existsSync(LOGO_SOURCE)) {
    console.error('No se encuentra logo-source.png en public/');
    process.exit(1);
  }

  for (const { size, out } of SIZES) {
    const outPath = path.join(PUBLIC, out);

    await sharp(LOGO_SOURCE)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png()
      .toFile(outPath);

    console.log('Generado:', out);
  }

  console.log('Iconos actualizados. El logo ahora llena el icono (menos marco negro en iOS).');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
