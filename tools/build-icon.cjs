const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');

const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'assets', 'favicon.svg');
const pngPath = path.join(root, 'assets', 'app-icon.png');
const icoPath = path.join(root, 'assets', 'app-icon.ico');
const splashPath = path.join(root, 'assets', 'splash.bmp');
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

function createBmp(width, height, rgbaBuffer) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buf = Buffer.alloc(fileSize);

  // Bitmap File Header (14 bytes)
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt16LE(0, 6);
  buf.writeUInt16LE(0, 8);
  buf.writeUInt32LE(54, 10);

  // DIB Header - BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelArraySize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // Write BGR pixels (bottom to top)
  for (let y = height - 1; y >= 0; y--) {
    const rowOffset = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 4;
      const r = rgbaBuffer[srcOffset];
      const g = rgbaBuffer[srcOffset + 1];
      const b = rgbaBuffer[srcOffset + 2];
      const destOffset = rowOffset + x * 3;
      buf[destOffset] = b;
      buf[destOffset + 1] = g;
      buf[destOffset + 2] = r;
    }
  }
  return buf;
}

async function renderAssets(svg) {
  const window = new BrowserWindow({
    width: 500,
    height: 300,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await window.loadURL('data:text/html,<!DOCTYPE html><html><body></body></html>');
    const result = await window.webContents.executeJavaScript(`
      (async () => {
        const svgText = ${JSON.stringify(svg)};
        const blob = new Blob([svgText], { type: 'image/svg+xml' });
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = URL.createObjectURL(blob);
        });

        // 1. Render App Icon (256x256)
        const iconCanvas = document.createElement('canvas');
        iconCanvas.width = 256;
        iconCanvas.height = 256;
        const iconCtx = iconCanvas.getContext('2d');
        iconCtx.clearRect(0, 0, 256, 256);
        iconCtx.drawImage(image, 0, 0, 256, 256);
        const iconPngData = iconCanvas.toDataURL('image/png');

        // 2. Render Splash BMP (460x230)
        const splashWidth = 460;
        const splashHeight = 230;
        const splashCanvas = document.createElement('canvas');
        splashCanvas.width = splashWidth;
        splashCanvas.height = splashHeight;
        const ctx = splashCanvas.getContext('2d');

        // Background
        ctx.fillStyle = '#1b1622';
        ctx.fillRect(0, 0, splashWidth, splashHeight);

        // Subtle gradient highlight
        const grad = ctx.createLinearGradient(0, 0, 0, splashHeight);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, splashWidth, splashHeight);

        // Inset border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, splashWidth - 1, splashHeight - 1);

        // Center Icon
        const iconSize = 64;
        const iconX = Math.round((splashWidth - iconSize) / 2);
        const iconY = 28;
        ctx.drawImage(image, iconX, iconY, iconSize, iconSize);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Microsoft YaHei", "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('osu!mania 可视化皮肤编辑器', splashWidth / 2, 122);

        // Extraction hint
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '13px "Microsoft YaHei", "Segoe UI", sans-serif';
        ctx.fillText('便携版正在解压并准备启动，请稍候...', splashWidth / 2, 154);

        // Indicator bar
        const barW = splashWidth - 80;
        const barX = 40;
        const barY = 180;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(barX, barY, barW, 4);
        ctx.fillStyle = '#ea68a2'; // osu! pink
        ctx.fillRect(barX, barY, Math.round(barW * 0.45), 4);

        // Tip text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '11px "Microsoft YaHei", "Segoe UI", sans-serif';
        ctx.fillText('提示：使用绿色解压版无需每次解压，可实现秒开', splashWidth / 2, 206);

        const imgData = ctx.getImageData(0, 0, splashWidth, splashHeight);
        URL.revokeObjectURL(image.src);

        let binary = '';
        const bytes = imgData.data;
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }

        return {
          iconPngBase64: iconPngData.split(',')[1],
          splashWidth,
          splashHeight,
          splashPixelBase64: btoa(binary)
        };
      })()
    `);

    const iconPng = Buffer.from(result.iconPngBase64, 'base64');
    const splashRgba = Buffer.from(result.splashPixelBase64, 'base64');
    const splashBmp = createBmp(result.splashWidth, result.splashHeight, splashRgba);

    return { iconPng, splashBmp };
  } finally {
    window.destroy();
  }
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(svgPath);
  const { iconPng, splashBmp } = await renderAssets(svg.toString('utf8'));
  const source = nativeImage.createFromBuffer(iconPng);
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
  fs.writeFileSync(splashPath, splashBmp);
  console.log(`Built ${path.relative(root, pngPath)}, ${path.relative(root, icoPath)}, and ${path.relative(root, splashPath)}.`);
  app.quit();
}).catch((error) => {
  console.error(`Icon build failed: ${error.message}`);
  app.exit(1);
});
