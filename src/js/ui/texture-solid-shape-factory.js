// ============================================================================
// texture-solid-shape-factory.js - 像素描边光栅化器与纯色图层合成工厂
// 依赖：ui/texture-solid-shape-geometry.js
// ============================================================================

        function createTexturePixelBoundaryStrokeCanvas(fillCanvas, options = {}) {
            const width = Number(fillCanvas && fillCanvas.width);
            const height = Number(fillCanvas && fillCanvas.height);
            const radius = normalizeTextureSolidStrokeWidth(options.width);
            const alpha = normalizeTextureSolidAlpha(options.alpha);
            const strokeCanvas = document.createElement('canvas');
            if (!Number.isInteger(width) || !Number.isInteger(height) ||
                width < 1 || height < 1 || radius <= 0 || alpha <= 0) {
                return strokeCanvas;
            }

            const fillCtx = fillCanvas.getContext('2d', { willReadFrequently: true }) ||
                fillCanvas.getContext('2d');
            if (!fillCtx) return strokeCanvas;
            const fillData = fillCtx.getImageData(0, 0, width, height);
            const pixels = fillData.data;
            let minX = width;
            let minY = height;
            let maxX = -1;
            let maxY = -1;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (pixels[(y * width + x) * 4 + 3] === 0) continue;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
            if (maxX < minX || maxY < minY) return strokeCanvas;

            const left = Math.max(0, minX - 1);
            const top = Math.max(0, minY - 1);
            const right = Math.min(width, maxX + 2);
            const bottom = Math.min(height, maxY + 2);
            const regionWidth = right - left;
            const regionHeight = bottom - top;
            const regionLength = regionWidth * regionHeight;
            // 8-SEDT (Sequential Euclidean Distance Transform)
            // vx[i], vy[i] 记录该像素到达最近外部/透明像素的二维相对位移向量。
            // 使用真欧几里得距离 Math.hypot(vx, vy) 计算描边，避免切比雪夫距离 (L_inf)
            // 在对角线方向上膨胀 1.414 倍导致大描边宽度时圆形内凹成菱形/星形、箭头边缘畸变的问题。
            const INF = 0xffffffff;
            const vx = new Int32Array(regionLength);
            const vy = new Int32Array(regionLength);
            const distSq = new Uint32Array(regionLength);

            for (let y = 0; y < regionHeight; y++) {
                const sourceY = top + y;
                for (let x = 0; x < regionWidth; x++) {
                    const sourceX = left + x;
                    const idx = y * regionWidth + x;
                    const sourceAlpha = pixels[(sourceY * width + sourceX) * 4 + 3];
                    if (sourceAlpha === 0) {
                        vx[idx] = 0;
                        vy[idx] = 0;
                        distSq[idx] = 0;
                    } else {
                        let edgeD = INF;
                        let evx = 100000;
                        let evy = 100000;
                        if (sourceX === 0) {
                            edgeD = 1; evx = 1; evy = 0;
                        }
                        if (sourceY === 0 && 1 < edgeD) {
                            edgeD = 1; evx = 0; evy = 1;
                        }
                        if (sourceX === width - 1 && 1 < edgeD) {
                            edgeD = 1; evx = -1; evy = 0;
                        }
                        if (sourceY === height - 1 && 1 < edgeD) {
                            edgeD = 1; evx = 0; evy = -1;
                        }
                        vx[idx] = evx;
                        vy[idx] = evy;
                        distSq[idx] = edgeD;
                    }
                }
            }

            // 正向扫描：左上到右下
            for (let y = 0; y < regionHeight; y++) {
                for (let x = 0; x < regionWidth; x++) {
                    const idx = y * regionWidth + x;
                    if (distSq[idx] === 0) continue;
                    let bestD = distSq[idx];
                    let bestVx = vx[idx];
                    let bestVy = vy[idx];

                    // 左
                    if (x > 0) {
                        const n = idx - 1;
                        const cx = vx[n] + 1;
                        const cy = vy[n];
                        const d = cx * cx + cy * cy;
                        if (d < bestD) { bestD = d; bestVx = cx; bestVy = cy; }
                    }
                    // 上
                    if (y > 0) {
                        const n = idx - regionWidth;
                        const cx = vx[n];
                        const cy = vy[n] + 1;
                        const d = cx * cx + cy * cy;
                        if (d < bestD) { bestD = d; bestVx = cx; bestVy = cy; }
                    }
                    // 左上
                    if (x > 0 && y > 0) {
                        const n = idx - regionWidth - 1;
                        const cx = vx[n] + 1;
                        const cy = vy[n] + 1;
                        const d = cx * cx + cy * cy;
                        if (d < bestD) { bestD = d; bestVx = cx; bestVy = cy; }
                    }
                    // 右上
                    if (x + 1 < regionWidth && y > 0) {
                        const n = idx - regionWidth + 1;
                        const cx = vx[n] - 1;
                        const cy = vy[n] + 1;
                        const d = cx * cx + cy * cy;
                        if (d < bestD) { bestD = d; bestVx = cx; bestVy = cy; }
                    }

                    vx[idx] = bestVx;
                    vy[idx] = bestVy;
                    distSq[idx] = bestD;
                }
            }

            // 反向扫描：右下到左上
            for (let y = regionHeight - 1; y >= 0; y--) {
                for (let x = regionWidth - 1; x >= 0; x--) {
                    const idx = y * regionWidth + x;
                    if (distSq[idx] === 0) continue;
                    let bestD = distSq[idx];
                    let bestVx = vx[idx];
                    let bestVy = vy[idx];

                    // 右
                    if (x + 1 < regionWidth) {
                        const n = idx + 1;
                        const cx = vx[n] - 1;
                        const cy = vy[n];
                        const d = cx * cx + cy * cy;
                        if (d < bestD) { bestD = d; bestVx = cx; bestVy = cy; }
                    }
                    // 下
                    if (y + 1 < regionHeight) {
                        const n = idx + regionWidth;
                        const cx = vx[n];
                        const cy = vy[n] - 1;
                        const d = cx * cx + cy * cy;
                        if (d < bestD) { bestD = d; bestVx = cx; bestVy = cy; }
                    }
                    // 右下
                    if (x + 1 < regionWidth && y + 1 < regionHeight) {
                        const n = idx + regionWidth + 1;
                        const cx = vx[n] - 1;
                        const cy = vy[n] - 1;
                        const d = cx * cx + cy * cy;
                        if (d < bestD) { bestD = d; bestVx = cx; bestVy = cy; }
                    }
                    // 左下
                    if (x > 0 && y + 1 < regionHeight) {
                        const n = idx + regionWidth - 1;
                        const cx = vx[n] + 1;
                        const cy = vy[n] - 1;
                        const d = cx * cx + cy * cy;
                        if (d < bestD) { bestD = d; bestVx = cx; bestVy = cy; }
                    }

                    vx[idx] = bestVx;
                    vy[idx] = bestVy;
                    distSq[idx] = bestD;
                }
            }

            const rgba = textureHexToRgba(options.color, 1);
            const outerAlphaMap = new Uint8Array(regionLength);
            for (let y = 0; y < regionHeight; y++) {
                const sourceY = top + y;
                for (let x = 0; x < regionWidth; x++) {
                    outerAlphaMap[y * regionWidth + x] = pixels[(sourceY * width + left + x) * 4 + 3];
                }
            }

            pixels.fill(0);
            const maxRadius = radius + 0.5;
            const maxRadiusSq = maxRadius * maxRadius;
            for (let y = 0; y < regionHeight; y++) {
                const sourceY = top + y;
                for (let x = 0; x < regionWidth; x++) {
                    const idx = y * regionWidth + x;
                    const dSq = distSq[idx];
                    if (dSq <= 0 || dSq > maxRadiusSq) continue;
                    const dist = Math.sqrt(dSq);
                    const innerEdgeAlpha = dist <= radius - 0.5
                        ? 1
                        : Math.max(0, Math.min(1, radius + 0.5 - dist));
                    if (innerEdgeAlpha <= 0) continue;

                    const sourceAlpha = outerAlphaMap[idx];
                    if (sourceAlpha === 0) continue;

                    const finalAlpha = Math.round(sourceAlpha * innerEdgeAlpha);
                    if (finalAlpha <= 0) continue;

                    const offset = (sourceY * width + left + x) * 4;
                    pixels[offset] = rgba.r;
                    pixels[offset + 1] = rgba.g;
                    pixels[offset + 2] = rgba.b;
                    pixels[offset + 3] = finalAlpha;
                }
            }

            strokeCanvas.width = width;
            strokeCanvas.height = height;
            const strokeCtx = strokeCanvas.getContext('2d');
            if (!strokeCtx) return strokeCanvas;
            strokeCtx.putImageData(fillData, 0, 0);
            return strokeCanvas;
        }

        function createSolidShapeTexture(options = {}) {
            const width = Number(options.width);
            const height = Number(options.height);
            if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
                throw new Error('画布宽度和高度必须是大于等于 1 的整数');
            }
            if (width > TEXTURE_SOLID_SHAPE_MAX_DIMENSION ||
                height > TEXTURE_SOLID_SHAPE_MAX_DIMENSION ||
                width * height > TEXTURE_SOLID_SHAPE_MAX_PIXELS) {
                throw new Error(`画布尺寸过大，单边不能超过 ${TEXTURE_SOLID_SHAPE_MAX_DIMENSION}px`);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas._is2x = !!options.is2x;
            canvas._isRootLevel = true;

            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建纯色图层画布');
            ctx.clearRect(0, 0, width, height);
            const rgba = textureHexToRgba(options.color, options.alpha);
            const shape = normalizeTextureShape(options.shape);
            const strokeEnabled = !!options.strokeEnabled;
            const strokeWidth = normalizeTextureSolidStrokeWidth(options.strokeWidth);
            const strokeAlpha = normalizeTextureSolidAlpha(options.strokeAlpha);
            if (!strokeEnabled || strokeWidth <= 0 || strokeAlpha <= 0) {
                drawTextureSolidShape(ctx, width, height, shape, rgba, options);
            } else {
                const fillMask = document.createElement('canvas');
                fillMask.width = width;
                fillMask.height = height;
                const fillCtx = fillMask.getContext('2d');
                if (!fillCtx) throw new Error('无法创建纯色图层蒙版');
                drawTextureSolidShape(fillCtx, width, height, shape, {
                    ...rgba,
                    a: 1
                }, options);

                const strokeMask = createTexturePixelBoundaryStrokeCanvas(fillMask, {
                    width: strokeWidth,
                    color: options.strokeColor || '#000000',
                    alpha: strokeAlpha
                });
                ctx.save();
                ctx.globalAlpha = rgba.a;
                ctx.drawImage(fillMask, 0, 0);
                ctx.globalCompositeOperation = 'destination-out';
                ctx.globalAlpha = 1;
                ctx.drawImage(strokeMask, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = strokeAlpha;
                ctx.drawImage(strokeMask, 0, 0);
                ctx.restore();
            }

            const fillTransparentAlpha = normalizeTextureSolidAlpha(
                options.fillTransparentAlpha !== undefined
                    ? options.fillTransparentAlpha
                    : (options.transparentFillAlpha !== undefined ? options.transparentFillAlpha : 0)
            );
            const fillTransparentColor = normalizeTextureHexColor(
                options.fillTransparentColor || options.transparentFillColor || '#000000'
            );
            if (fillTransparentAlpha > 0) {
                const transRgba = textureHexToRgba(fillTransparentColor, fillTransparentAlpha);
                ctx.save();
                ctx.globalCompositeOperation = 'destination-over';
                ctx.fillStyle = `rgba(${transRgba.r}, ${transRgba.g}, ${transRgba.b}, ${transRgba.a})`;
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
            }

            return canvas;
        }
