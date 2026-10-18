// ============================================================================
// texture-solid-shape-factory.js - 任意尺寸纯色图层与形状蒙版画布工厂
// 依赖：无；只使用浏览器 Canvas 2D API。
// ============================================================================

        const TEXTURE_SOLID_SHAPE_MAX_DIMENSION = 50000;
        const TEXTURE_SOLID_SHAPE_MAX_PIXELS = 64 * 1024 * 1024;
        const TEXTURE_SOLID_SHAPE_IDS = Object.freeze([
            'rectangle',
            'circle',
            'rounded-rectangle',
            'rotated-square',
            'arrow-up',
            'arrow-down',
            'arrow-left',
            'arrow-right'
        ]);

        function normalizeTextureShape(value) {
            const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
            const aliases = {
                rect: 'rectangle',
                square: 'rectangle',
                ellipse: 'circle',
                oval: 'circle',
                rounded: 'rounded-rectangle',
                'rounded-rect': 'rounded-rectangle',
                diamond: 'rotated-square',
                rhombus: 'rotated-square',
                'rotated-square-90': 'rotated-square',
                arrowup: 'arrow-up',
                up: 'arrow-up',
                arrowdown: 'arrow-down',
                down: 'arrow-down',
                arrowleft: 'arrow-left',
                left: 'arrow-left',
                arrowright: 'arrow-right',
                right: 'arrow-right'
            };
            const shape = aliases[normalized] || normalized;
            return TEXTURE_SOLID_SHAPE_IDS.includes(shape) ? shape : 'rectangle';
        }

        function normalizeTextureHexColor(value) {
            let hex = String(value || '').trim().replace(/^#/, '');
            if (/^[0-9a-f]{3}$/i.test(hex)) {
                hex = hex.split('').map((part) => part + part).join('');
            }
            return /^[0-9a-f]{6}$/i.test(hex)
                ? `#${hex.toLowerCase()}`
                : '#ffffff';
        }

        function normalizeTextureSolidAlpha(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return 1;
            const alpha = numeric > 1 ? numeric / 100 : numeric;
            return Math.max(0, Math.min(1, alpha));
        }

        function normalizeTextureSolidRatio(value, fallback, min, max) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return fallback;
            const ratio = numeric > 1 ? numeric / 100 : numeric;
            return Math.max(min, Math.min(max, ratio));
        }

        function normalizeTextureSolidPercent(value, fallback, min, max) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return fallback;
            const ratio = numeric / 100;
            return Math.max(min, Math.min(max, ratio));
        }

        function normalizeTextureSolidStrokeWidth(value, fallback = 0) {
            const numeric = Number(value);
            const resolved = Number.isFinite(numeric) ? numeric : Number(fallback);
            if (!Number.isFinite(resolved)) return 0;
            return Math.max(0, Math.min(65535, Math.round(resolved)));
        }

        function textureHexToRgba(hex, alpha) {
            const color = normalizeTextureHexColor(hex);
            return {
                r: Number.parseInt(color.slice(1, 3), 16),
                g: Number.parseInt(color.slice(3, 5), 16),
                b: Number.parseInt(color.slice(5, 7), 16),
                a: normalizeTextureSolidAlpha(alpha)
            };
        }

        function appendTextureRoundedRectPath(ctx, width, height, radius) {
            const maxRadius = Math.max(0, Math.min(width, height) / 2);
            const r = Math.max(0, Math.min(Number(radius) || 0, maxRadius));
            ctx.moveTo(r, 0);
            ctx.lineTo(width - r, 0);
            ctx.arcTo(width, 0, width, r, r);
            ctx.lineTo(width, height - r);
            ctx.arcTo(width, height, width - r, height, r);
            ctx.lineTo(r, height);
            ctx.arcTo(0, height, 0, height - r, r);
            ctx.lineTo(0, r);
            ctx.arcTo(0, 0, r, 0, r);
            ctx.closePath();
        }

        function appendTextureRoundedPolygonPath(ctx, points, radius) {
            const count = Array.isArray(points) ? points.length : 0;
            if (count < 3) return false;

            const requestedRadius = Math.max(0, Number(radius) || 0);
            if (requestedRadius <= 0.001) {
                ctx.moveTo(points[0][0], points[0][1]);
                for (let index = 1; index < count; index++) {
                    ctx.lineTo(points[index][0], points[index][1]);
                }
                ctx.closePath();
                return true;
            }

            const corners = [];
            for (let index = 0; index < count; index++) {
                const point = points[index];
                const previous = points[(index + count - 1) % count];
                const next = points[(index + 1) % count];
                const previousX = previous[0] - point[0];
                const previousY = previous[1] - point[1];
                const nextX = next[0] - point[0];
                const nextY = next[1] - point[1];
                const previousLength = Math.hypot(previousX, previousY);
                const nextLength = Math.hypot(nextX, nextY);
                if (previousLength <= 0.001 || nextLength <= 0.001) return false;

                const previousUnit = [
                    previousX / previousLength,
                    previousY / previousLength
                ];
                const nextUnit = [
                    nextX / nextLength,
                    nextY / nextLength
                ];
                const dot = Math.max(-1, Math.min(
                    1,
                    previousUnit[0] * nextUnit[0] +
                    previousUnit[1] * nextUnit[1]
                ));
                const halfAngle = Math.acos(dot) / 2;
                const tangentScale = 1 / Math.max(0.001, Math.tan(halfAngle));
                corners.push({
                    point,
                    previousUnit,
                    nextUnit,
                    tangentDistance: requestedRadius * tangentScale,
                    radiusScale: Math.tan(halfAngle)
                });
            }

            let scale = 1;
            for (let index = 0; index < count; index++) {
                const nextIndex = (index + 1) % count;
                const edgeLength = Math.hypot(
                    points[nextIndex][0] - points[index][0],
                    points[nextIndex][1] - points[index][1]
                );
                const tangentSum =
                    corners[index].tangentDistance +
                    corners[nextIndex].tangentDistance;
                if (tangentSum > edgeLength && tangentSum > 0) {
                    scale = Math.min(scale, edgeLength / tangentSum);
                }
            }

            const first = corners[0];
            const firstDistance = first.tangentDistance * scale;
            ctx.moveTo(
                first.point[0] + first.previousUnit[0] * firstDistance,
                first.point[1] + first.previousUnit[1] * firstDistance
            );
            for (const corner of corners) {
                const tangentDistance = corner.tangentDistance * scale;
                const cornerRadius = tangentDistance * corner.radiusScale;
                const start = [
                    corner.point[0] + corner.previousUnit[0] * tangentDistance,
                    corner.point[1] + corner.previousUnit[1] * tangentDistance
                ];
                const end = [
                    corner.point[0] + corner.nextUnit[0] * tangentDistance,
                    corner.point[1] + corner.nextUnit[1] * tangentDistance
                ];
                if (corner !== first) ctx.lineTo(start[0], start[1]);
                if (cornerRadius > 0.001) {
                    ctx.arcTo(
                        corner.point[0],
                        corner.point[1],
                        end[0],
                        end[1],
                        cornerRadius
                    );
                } else {
                    ctx.lineTo(corner.point[0], corner.point[1]);
                }
            }
            ctx.closePath();
            return true;
        }

        function appendTextureRoundedSegmentPath(
            ctx,
            fromX,
            fromY,
            toX,
            toY,
            width,
            startRadius,
            endRadius
        ) {
            const dx = toX - fromX;
            const dy = toY - fromY;
            const length = Math.hypot(dx, dy);
            const lineWidth = Number(width);
            if (!Number.isFinite(length) || length <= 0.001 ||
                !Number.isFinite(lineWidth) || lineWidth <= 0) {
                return false;
            }

            const unitX = dx / length;
            const unitY = dy / length;
            const normalX = -unitY;
            const normalY = unitX;
            const halfWidth = lineWidth / 2;
            let startR = Math.max(0, Math.min(Number(startRadius) || 0, halfWidth));
            let endR = Math.max(0, Math.min(Number(endRadius) || 0, halfWidth));
            if (startR + endR > length && startR + endR > 0) {
                const scale = length / (startR + endR);
                startR *= scale;
                endR *= scale;
            }
            const point = (along, across) => [
                fromX + unitX * along + normalX * across,
                fromY + unitY * along + normalY * across
            ];

            let current = point(startR, -halfWidth);
            ctx.moveTo(current[0], current[1]);
            current = point(length - endR, -halfWidth);
            ctx.lineTo(current[0], current[1]);

            if (endR > 0.001) {
                let corner = point(length, -halfWidth);
                let tangent = point(length, -halfWidth + endR);
                ctx.arcTo(corner[0], corner[1], tangent[0], tangent[1], endR);
                current = point(length, halfWidth - endR);
                ctx.lineTo(current[0], current[1]);
                corner = point(length, halfWidth);
                tangent = point(length - endR, halfWidth);
                ctx.arcTo(corner[0], corner[1], tangent[0], tangent[1], endR);
            } else {
                current = point(length, -halfWidth);
                ctx.lineTo(current[0], current[1]);
                current = point(length, halfWidth);
                ctx.lineTo(current[0], current[1]);
            }

            current = point(startR, halfWidth);
            ctx.lineTo(current[0], current[1]);
            if (startR > 0.001) {
                let corner = point(0, halfWidth);
                let tangent = point(0, halfWidth - startR);
                ctx.arcTo(corner[0], corner[1], tangent[0], tangent[1], startR);
                current = point(0, -halfWidth + startR);
                ctx.lineTo(current[0], current[1]);
                corner = point(0, -halfWidth);
                tangent = point(startR, -halfWidth);
                ctx.arcTo(corner[0], corner[1], tangent[0], tangent[1], startR);
            } else {
                current = point(0, halfWidth);
                ctx.lineTo(current[0], current[1]);
                current = point(0, -halfWidth);
                ctx.lineTo(current[0], current[1]);
            }
            ctx.closePath();
            return true;
        }

        function getTextureArrowHeadMetrics(left, tip, right, width, radius) {
            const halfWidth = width / 2;
            const r = Math.max(0, Math.min(Number(radius) || 0, halfWidth));
            const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
            const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
            const scale = (point, amount) => [point[0] * amount, point[1] * amount];
            const normalize = (point) => {
                const length = Math.hypot(point[0], point[1]);
                return length > 0.001
                    ? [point[0] / length, point[1] / length]
                    : [0, 0];
            };
            const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
            const leftDirection = normalize(subtract(tip, left));
            const rightDirection = normalize(subtract(right, tip));
            const leftNormal = [-leftDirection[1], leftDirection[0]];
            const rightNormal = [-rightDirection[1], rightDirection[0]];
            const innerBisector = normalize(add(leftNormal, rightNormal));
            const outerBisector = scale(innerBisector, -1);
            const angleScale = Math.max(0.001, dot(innerBisector, leftNormal));
            const innerMiter = add(
                tip,
                scale(innerBisector, halfWidth / angleScale)
            );
            const outerMiter = add(
                tip,
                scale(outerBisector, halfWidth / angleScale)
            );
            const joinCenter = add(
                tip,
                scale(outerBisector, (halfWidth - r) / angleScale)
            );
            const outerLeftTangent = subtract(joinCenter, scale(leftNormal, r));
            const outerRightTangent = subtract(joinCenter, scale(rightNormal, r));
            const outerApex = add(joinCenter, scale(outerBisector, r));
            return {
                halfWidth,
                radius: r,
                leftDirection,
                rightDirection,
                leftNormal,
                rightNormal,
                innerMiter,
                outerMiter,
                outerLeftTangent,
                outerRightTangent,
                outerExtent: Math.hypot(
                    outerApex[0] - tip[0],
                    outerApex[1] - tip[1]
                )
            };
        }

        function appendTextureArrowHeadPath(ctx, left, tip, right, width, radius) {
            const metrics = getTextureArrowHeadMetrics(
                left,
                tip,
                right,
                width,
                radius
            );
            const {
                halfWidth,
                radius: r,
                leftDirection,
                rightDirection,
                leftNormal,
                rightNormal,
                innerMiter,
                outerMiter,
                outerLeftTangent,
                outerRightTangent
            } = metrics;
            const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
            const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
            const scale = (point, amount) => [point[0] * amount, point[1] * amount];
            const leftStart = add(subtract(left, scale(leftNormal, halfWidth)), scale(leftDirection, r));
            const rightEnd = subtract(
                subtract(right, scale(rightNormal, halfWidth)),
                scale(rightDirection, r)
            );

            ctx.beginPath();
            ctx.moveTo(leftStart[0], leftStart[1]);
            ctx.lineTo(outerLeftTangent[0], outerLeftTangent[1]);
            if (r > 0.001) {
                ctx.arcTo(
                    outerMiter[0],
                    outerMiter[1],
                    outerRightTangent[0],
                    outerRightTangent[1],
                    r
                );
            } else {
                ctx.lineTo(outerMiter[0], outerMiter[1]);
            }
            ctx.lineTo(outerRightTangent[0], outerRightTangent[1]);
            ctx.lineTo(rightEnd[0], rightEnd[1]);

            if (r > 0.001) {
                let corner = subtract(right, scale(rightNormal, halfWidth));
                let tangent = subtract(right, scale(rightNormal, halfWidth - r));
                ctx.arcTo(corner[0], corner[1], tangent[0], tangent[1], r);
                tangent = add(right, scale(rightNormal, halfWidth - r));
                ctx.lineTo(tangent[0], tangent[1]);
                corner = add(right, scale(rightNormal, halfWidth));
                tangent = add(subtract(right, scale(rightDirection, r)), scale(rightNormal, halfWidth));
                ctx.arcTo(corner[0], corner[1], tangent[0], tangent[1], r);
            } else {
                let point = subtract(right, scale(rightNormal, halfWidth));
                ctx.lineTo(point[0], point[1]);
                point = add(right, scale(rightNormal, halfWidth));
                ctx.lineTo(point[0], point[1]);
            }

            ctx.lineTo(innerMiter[0], innerMiter[1]);
            const leftInnerEnd = add(add(left, scale(leftNormal, halfWidth)), scale(leftDirection, r));
            ctx.lineTo(leftInnerEnd[0], leftInnerEnd[1]);

            if (r > 0.001) {
                let corner = add(left, scale(leftNormal, halfWidth));
                let tangent = add(left, scale(leftNormal, halfWidth - r));
                ctx.arcTo(corner[0], corner[1], tangent[0], tangent[1], r);
                tangent = subtract(left, scale(leftNormal, halfWidth - r));
                ctx.lineTo(tangent[0], tangent[1]);
                corner = subtract(left, scale(leftNormal, halfWidth));
                tangent = add(subtract(left, scale(leftNormal, halfWidth)), scale(leftDirection, r));
                ctx.arcTo(corner[0], corner[1], tangent[0], tangent[1], r);
            } else {
                let point = add(left, scale(leftNormal, halfWidth));
                ctx.lineTo(point[0], point[1]);
                point = subtract(left, scale(leftNormal, halfWidth));
                ctx.lineTo(point[0], point[1]);
            }
            ctx.closePath();
        }

        function drawTextureArrow(ctx, width, height, direction, rgba, options = {}) {
            const size = Math.min(width, height);
            const offsetX = (width - size) / 2;
            const offsetY = (height - size) / 2;
            const thickness = normalizeTextureSolidPercent(
                options.arrowThickness,
                0.20,
                0.08,
                0.5
            );
            const requestedRoundness = normalizeTextureSolidPercent(
                options.arrowRoundness,
                0.50,
                0,
                1
            );
            const lineWidth = size * thickness;
            const halfWidth = lineWidth / 2;
            const radius = halfWidth * requestedRoundness;
            const centerX = size / 2;
            const sideMargin = Math.max(
                size * 0.12,
                halfWidth * 0.8 + size * 0.02
            );
            const targetTipMargin = size * 0.14;
            let wingY = size * 0.55;
            let tipY = targetTipMargin + halfWidth;
            // 先固定外轮廓尖端，再反推中心线位置，避免粗线把尖头向外推出画布。
            for (let iteration = 0; iteration < 3; iteration++) {
                const metrics = getTextureArrowHeadMetrics(
                    [sideMargin, wingY],
                    [centerX, tipY],
                    [size - sideMargin, wingY],
                    lineWidth,
                    radius
                );
                tipY = targetTipMargin + metrics.outerExtent;
                wingY = Math.max(size * 0.55, tipY + size * 0.12);
            }
            const canonical = {
                tip: [centerX, tipY],
                leftWing: [sideMargin, wingY],
                rightWing: [size - sideMargin, wingY],
                stemBottom: [centerX, size * 0.86]
            };
            const mapPoint = ([x, y]) => {
                let sourceX = x;
                let sourceY = y;
                if (direction === 'arrow-right') {
                    sourceX = size - y;
                    sourceY = x;
                } else if (direction === 'arrow-down') {
                    sourceX = size - x;
                    sourceY = size - y;
                } else if (direction === 'arrow-left') {
                    sourceX = y;
                    sourceY = size - x;
                }
                return [offsetX + sourceX, offsetY + sourceY];
            };
            const points = {
                tip: mapPoint(canonical.tip),
                leftWing: mapPoint(canonical.leftWing),
                rightWing: mapPoint(canonical.rightWing),
                stemBottom: mapPoint(canonical.stemBottom)
            };
            const opaqueColor = `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`;
            ctx.fillStyle = opaqueColor;

            ctx.beginPath();
            appendTextureArrowHeadPath(
                ctx,
                points.leftWing,
                points.tip,
                points.rightWing,
                lineWidth,
                radius
            );
            ctx.fill();

            // 箭杆向交汇处回插一小段，中心端保持直角并与 V 形头部直接连成一体。
            const stemX = points.stemBottom[0] - points.tip[0];
            const stemY = points.stemBottom[1] - points.tip[1];
            const stemLength = Math.hypot(stemX, stemY);
            const stemOverlap = Math.max(1, halfWidth * 0.35);
            const stemStart = [
                points.tip[0] - stemX / stemLength * stemOverlap,
                points.tip[1] - stemY / stemLength * stemOverlap
            ];
            ctx.beginPath();
            if (appendTextureRoundedSegmentPath(
                ctx,
                stemStart[0],
                stemStart[1],
                points.stemBottom[0],
                points.stemBottom[1],
                lineWidth,
                0,
                radius
            )) {
                ctx.fill();
            }

            // 填充与圆角描边需要先按不透明轮廓合成，再统一施加 alpha，
            // 否则半透明箭头会在重叠区域出现明显色带。
            if (rgba.a < 1) {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-in';
                ctx.fillStyle = `rgba(0, 0, 0, ${rgba.a})`;
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
            }
        }

        function appendTextureSolidShapePath(ctx, width, height, shape, cornerRadius) {
            if (shape === 'circle') {
                const radius = Math.min(width, height) / 2;
                ctx.ellipse(width / 2, height / 2, radius, radius, 0, 0, Math.PI * 2);
                ctx.closePath();
                return;
            }
            if (shape === 'rounded-rectangle') {
                appendTextureRoundedRectPath(ctx, width, height, cornerRadius);
                return;
            }
            if (shape === 'rotated-square') {
                const radius = Math.min(width, height) / 2;
                appendTextureRoundedPolygonPath(ctx, [
                    [width / 2, height / 2 - radius],
                    [width / 2 + radius, height / 2],
                    [width / 2, height / 2 + radius],
                    [width / 2 - radius, height / 2]
                ], cornerRadius);
                return;
            }
            ctx.rect(0, 0, width, height);
        }

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
            const INF = 1e9;
            const vx = new Int16Array(regionLength);
            const vy = new Int16Array(regionLength);
            const distSq = new Float64Array(regionLength);

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
                        let evx = 9999;
                        let evy = 9999;
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

        function drawTextureSolidShape(ctx, width, height, shape, rgba, options = {}) {
            if (shape.startsWith('arrow-')) {
                drawTextureArrow(ctx, width, height, shape, rgba, options);
                return;
            }
            ctx.fillStyle = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
            ctx.beginPath();
            appendTextureSolidShapePath(
                ctx,
                width,
                height,
                shape,
                options.cornerRadius
            );
            ctx.fill();
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
                return canvas;
            }

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
            return canvas;
        }
