const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');

const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'assets', 'favicon.svg');
const pngPath = path.join(root, 'assets', 'app-icon.png');
const icoPath = path.join(root, 'assets', 'app-icon.ico');
const iconSizes = [16, 24, 32, 48, 64, 128, 256];

function createIco(images) {
  const directorySize = 6 + images.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = directorySize;
  images.forEach(({ size, data }, index) => {
    const entryOffset = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(data.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += data.length;
  });

  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

async function renderSvg(svg) {
  const window = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true
    }
  });

  try {
    await window.loadURL('about:blank');
    const dataUrl = await window.webContents.executeJavaScript(`
      (async () => {
        const svgText = ${JSON.stringify(svg)};
        const blob = new Blob([svgText], { type: 'image/svg+xml' });
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = URL.createObjectURL(blob);
        });

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, 256, 256);
        context.drawImage(image, 0, 0, 256, 256);
        URL.revokeObjectURL(image.src);
        return canvas.toDataURL('image/png');
      })()
    `);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  } finally {
    window.destroy();
  }
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(svgPath);
  const renderedPng = await renderSvg(svg.toString('utf8'));
  const source = nativeImage.createFromBuffer(renderedPng);
  if (source.isEmpty()) {
    throw new Error('Chromium rendered an empty icon.');
  }

  const png = source.toPNG();
  const icoImages = iconSizes.map((size) => ({
    size,
    data: source.resize({ width: size, height: size, quality: 'best' }).toPNG()
  }));

  fs.writeFileSync(pngPath, png);
  fs.writeFileSync(icoPath, createIco(icoImages));
  console.log(`Built ${path.relative(root, pngPath)} and ${path.relative(root, icoPath)}.`);
  app.quit();
}).catch((error) => {
  console.error(`Icon build failed: ${error.message}`);
  app.exit(1);
});
