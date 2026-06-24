const sharp = require('sharp');
const path = require('path');

const src = path.resolve('public/coway-logo-new.png');
const BG = '#38bdf8'; // Coway sky blue background

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

async function go() {
  for (const s of sizes) {
    const outPath = 'public/icon-' + s + 'x' + s + '.png';
    await sharp(src)
      .resize(s, s, { fit: 'contain', background: BG })
      .png()
      .toFile(outPath);
    console.log('✅ created ' + outPath);
  }

  // apple-touch-icon (180x180)
  await sharp(src)
    .resize(180, 180, { fit: 'contain', background: BG })
    .png()
    .toFile('public/apple-touch-icon.png');
  console.log('✅ created public/apple-touch-icon.png');

  // favicon 32x32
  await sharp(src)
    .resize(32, 32, { fit: 'contain', background: BG })
    .png()
    .toFile('public/favicon-32x32.png');
  console.log('✅ created public/favicon-32x32.png');

  console.log('All icons generated!');
}

go().catch(console.error);
