// ============================================================================
// texture-image-editor-crop-math.js - 裁剪矩形、吸附、缩放输入与输出映射
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function getCropHandlePoints(left, top, right, bottom) {
            const centerX = (left + right) / 2;
            const centerY = (top + bottom) / 2;
            return {
                nw: { x: left, y: top },
                n: { x: centerX, y: top },
                ne: { x: right, y: top },
                e: { x: right, y: centerY },
                se: { x: right, y: bottom },
                s: { x: centerX, y: bottom },
                sw: { x: left, y: bottom },
                w: { x: left, y: centerY }
            };
        }

        function getNonTransparentContentBounds() {
            const frames = state.workingFrames;
            if (!frames || frames.length === 0) return null;
            const cached = state.contentBoundsCache;
            if (cached &&
                cached.frames.length === frames.length &&
                cached.frames.every((frame, index) => frame === frames[index])) {
                return cached.bounds;
            }

            let minX = Infinity;
            let minY = Infinity;
            let maxX = -1;
            let maxY = -1;
            try {
                for (const frame of frames) {
                    const width = frame.width;
                    const height = frame.height;
                    if (!(width > 0) || !(height > 0)) continue;
                    const data = frame.getContext('2d').getImageData(0, 0, width, height).data;
                    for (let y = 0; y < height; y++) {
                        const row = y * width * 4;
                        for (let x = 0; x < width; x++) {
                            if (data[row + x * 4 + 3] === 0) continue;
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
            } catch (err) {
                console.warn('读取贴图透明边缘失败:', err);
            }

            const bounds = maxX >= 0 && maxY >= 0
                ? { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 }
                : null;
            state.contentBoundsCache = {
                frames: frames.slice(),
                bounds
            };
            return bounds;
        }

        function getSnapTargets(axis, frame, bounds) {
            const targets = new Set([0, axis === 'x' ? frame.width : frame.height]);
            if (bounds) {
                targets.add(axis === 'x' ? bounds.left : bounds.top);
                targets.add(axis === 'x' ? bounds.right : bounds.bottom);
            }
            return Array.from(targets).sort((a, b) => a - b);
        }

        function findSnap(value, targets, threshold) {
            let best = null;
            for (const target of targets) {
                const distance = Math.abs(target - value);
                if (distance > threshold) continue;
                if (!best || distance < best.distance) {
                    best = { value: target, distance };
                }
            }
            return best;
        }

        function updateCropInputs(rect) {
            const baseFrame = state.workingFrames[0];
            const cropLeft = byId('textureImageCropLeft') || byId('textureImageCropX');
            const cropRight = byId('textureImageCropRight');
            const cropTop = byId('textureImageCropTop') || byId('textureImageCropY');
            const cropBottom = byId('textureImageCropBottom');
            const cropW = byId('textureImageCropWidth');
            const cropH = byId('textureImageCropHeight');
            if (!rect || !baseFrame) return;

            const left = -rect.x;
            const top = -rect.y;
            const right = rect.x + rect.width - baseFrame.width;
            const bottom = rect.y + rect.height - baseFrame.height;

            if (cropLeft) cropLeft.value = String(left);
            if (cropRight) cropRight.value = String(right);
            if (cropTop) cropTop.value = String(top);
            if (cropBottom) cropBottom.value = String(bottom);
            if (cropW) {
                cropW.min = String(1 - baseFrame.width);
                cropW.value = String(rect.width - baseFrame.width);
            }
            if (cropH) {
                cropH.min = String(1 - baseFrame.height);
                cropH.value = String(rect.height - baseFrame.height);
            }
        }

        function setCropRect(rect, options = {}) {
            const next = {
                x: Math.round(Number(rect.x) || 0),
                y: Math.round(Number(rect.y) || 0),
                width: Math.max(1, Math.round(Number(rect.width) || 1)),
                height: Math.max(1, Math.round(Number(rect.height) || 1))
            };
            validateOutputSize(next.width, next.height);
            state.cropRect = next;
            updateCropInputs(next);
            if (options.refresh !== false) refreshLivePreview();
        }

        function setImageTransform(transform, options = {}) {
            const baseCrop = state.cropRect;
            if (!baseCrop) return false;
            const previous = cloneImageTransform(state.imageTransform);
            const next = cloneImageTransform(transform);
            next.scalePercent = Math.max(
                1,
                Math.min(1000, Math.round(next.scalePercent * 10) / 10)
            );
            const scaleChanged = Math.abs(next.scalePercent - previous.scalePercent) > 0.0001;
            const stretchXChanged = Math.abs(next.stretchX - previous.stretchX) > 0.0001;
            const stretchYChanged = Math.abs(next.stretchY - previous.stretchY) > 0.0001;
            if (scaleChanged && !stretchXChanged && !stretchYChanged) {
                next.scaleAfterStretch =
                    Math.abs(next.stretchX) > 0.0001 || Math.abs(next.stretchY) > 0.0001;
            } else if (stretchXChanged || stretchYChanged) {
                next.scaleAfterStretch = false;
            }
            if (options.centerAnchor) {
                next.anchorX = 0.5;
                next.anchorY = 0.5;
            } else {
                next.anchorX = Math.max(0, Math.min(1, next.anchorX));
                next.anchorY = Math.max(0, Math.min(1, next.anchorY));
            }
            const uniformScale = Math.max(0.01, next.scalePercent / 100);
            const minimumStretchX = next.scaleAfterStretch
                ? Math.ceil(1 / uniformScale - baseCrop.width)
                : Math.round(1 - baseCrop.width * uniformScale);
            const minimumStretchY = next.scaleAfterStretch
                ? Math.ceil(1 / uniformScale - baseCrop.height)
                : Math.round(1 - baseCrop.height * uniformScale);
            next.stretchX = Math.max(
                minimumStretchX,
                Math.round(next.stretchX)
            );
            next.stretchY = Math.max(
                minimumStretchY,
                Math.round(next.stretchY)
            );
            // Keep stretch values relative to the crop they were applied to.
            // Later crop changes only expose less or more of that transformed image.
            next.referenceWidth = baseCrop.width;
            next.referenceHeight = baseCrop.height;

            const outputRect = getTransformedOutputRect(baseCrop, next);
            validateOutputSize(outputRect.width, outputRect.height);
            state.imageTransform = next;
            updateImageTransformInputs();
            if (options.refresh !== false) refreshLivePreview();
            return true;
        }

        function getCropRectForOutputRect(
            outputRect,
            transform = state.imageTransform,
            sourceFrame = state.workingFrames[0]
        ) {
            if (!outputRect) return null;
            const value = cloneImageTransform(transform);
            const transformScales = getImageTransformScales(value, {
                width: sourceFrame && sourceFrame.width,
                height: sourceFrame && sourceFrame.height
            });
            const width = Math.max(
                1,
                Math.round(Number(outputRect.width) / transformScales.x)
            );
            const height = Math.max(
                1,
                Math.round(Number(outputRect.height) / transformScales.y)
            );
            const uniformScale = Math.max(0.01, value.scalePercent / 100);
            const scaleX = Number(outputRect.width) / width;
            const scaleY = Number(outputRect.height) / height;
            const stretchScaleX = scaleX / uniformScale;
            const stretchScaleY = scaleY / uniformScale;
            const sourceWidth = Math.max(1, Number(sourceFrame && sourceFrame.width) || width);
            const sourceHeight = Math.max(1, Number(sourceFrame && sourceFrame.height) || height);
            const sourceCenterX = sourceWidth / 2;
            const sourceCenterY = sourceHeight / 2;
            if (value.scaleAfterStretch) {
                const stretchedWidth = width * stretchScaleX;
                const stretchedHeight = height * stretchScaleY;
                const scaleAnchorX = Number(outputRect.x) +
                    Number(outputRect.width) * value.anchorX;
                const scaleAnchorY = Number(outputRect.y) +
                    Number(outputRect.height) * value.anchorY;
                const stretchedX = scaleAnchorX - stretchedWidth * value.anchorX;
                const stretchedY = scaleAnchorY - stretchedHeight * value.anchorY;
                return {
                    x: Math.round(sourceCenterX -
                        (sourceCenterX - stretchedX) / stretchScaleX) || 0,
                    y: Math.round(sourceCenterY -
                        (sourceCenterY - stretchedY) / stretchScaleY) || 0,
                    width,
                    height
                };
            }
            const uniformlyScaledX = sourceCenterX -
                (sourceCenterX - Number(outputRect.x)) / stretchScaleX;
            const uniformlyScaledY = sourceCenterY -
                (sourceCenterY - Number(outputRect.y)) / stretchScaleY;
            const uniformWidth = width * uniformScale;
            const uniformHeight = height * uniformScale;
            return {
                x: Math.round(uniformlyScaledX - (width - uniformWidth) * value.anchorX) || 0,
                y: Math.round(uniformlyScaledY - (height - uniformHeight) * value.anchorY) || 0,
                width,
                height
            };
        }
