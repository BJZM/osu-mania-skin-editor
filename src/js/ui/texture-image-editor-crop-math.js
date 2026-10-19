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

        function getCropInputValues(rect, frame = state.workingFrames[0]) {
            if (!rect || !frame) return null;
            const scale = getImageCropOutputScale();
            return {
                left: Math.round(-rect.x * scale),
                right: Math.round((rect.x + rect.width - frame.width) * scale),
                top: Math.round(-rect.y * scale),
                bottom: Math.round((rect.y + rect.height - frame.height) * scale),
                width: Math.round((rect.width - frame.width) * scale),
                height: Math.round((rect.height - frame.height) * scale)
            };
        }

        function cropRectsEqual(a, b) {
            if (!a || !b) return false;
            return Math.abs(a.x - b.x) < 0.0001 &&
                Math.abs(a.y - b.y) < 0.0001 &&
                Math.abs(a.width - b.width) < 0.0001 &&
                Math.abs(a.height - b.height) < 0.0001;
        }

        function getCropRectFromInputValues(values, frame = state.workingFrames[0]) {
            if (!frame || !values) return null;
            const scale = getImageCropOutputScale();
            const snapshot = state.cropInputSnapshot;
            const canUseSnapshot = snapshot &&
                cropRectsEqual(snapshot.rect, state.cropRect) &&
                imageTransformsEqual(snapshot.transform, state.imageTransform);

            if (canUseSnapshot) {
                const delta = (current, previous) => {
                    if (current == null || previous == null) return 0;
                    return (current - previous) / scale;
                };
                const leftDelta = delta(values.left, snapshot.values.left);
                const rightDelta = delta(values.right, snapshot.values.right);
                const topDelta = delta(values.top, snapshot.values.top);
                const bottomDelta = delta(values.bottom, snapshot.values.bottom);
                const widthDelta = delta(values.width, snapshot.values.width);
                const heightDelta = delta(values.height, snapshot.values.height);
                const hasNewCropInputs = values.left != null ||
                    values.right != null ||
                    values.top != null ||
                    values.bottom != null;
                return {
                    x: snapshot.rect.x - leftDelta,
                    y: snapshot.rect.y - topDelta,
                    width: hasNewCropInputs
                        ? snapshot.rect.width + leftDelta + rightDelta
                        : snapshot.rect.width + widthDelta,
                    height: hasNewCropInputs
                        ? snapshot.rect.height + topDelta + bottomDelta
                        : snapshot.rect.height + heightDelta
                };
            }

            const left = (values.left ?? 0) / scale;
            const right = (values.right ?? 0) / scale;
            const top = (values.top ?? 0) / scale;
            const bottom = (values.bottom ?? 0) / scale;
            return {
                x: -left,
                y: -top,
                width: frame.width + left + right + (values.width ?? 0) / scale,
                height: frame.height + top + bottom + (values.height ?? 0) / scale
            };
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

            const values = getCropInputValues(rect, baseFrame);
            const scale = getImageCropOutputScale();

            if (cropLeft) cropLeft.value = String(values.left);
            if (cropRight) cropRight.value = String(values.right);
            if (cropTop) cropTop.value = String(values.top);
            if (cropBottom) cropBottom.value = String(values.bottom);
            if (cropW) {
                cropW.min = String(Math.ceil((1 - baseFrame.width) * scale));
                cropW.value = String(values.width);
            }
            if (cropH) {
                cropH.min = String(Math.ceil((1 - baseFrame.height) * scale));
                cropH.value = String(values.height);
            }
            state.cropInputSnapshot = {
                rect: { ...rect },
                transform: cloneImageTransform(state.imageTransform),
                values: { ...values }
            };
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
                Math.min(5000, Math.round(next.scalePercent * 10) / 10)
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
                : Math.ceil(1 - baseCrop.width * uniformScale);
            const minimumStretchY = next.scaleAfterStretch
                ? Math.ceil(1 / uniformScale - baseCrop.height)
                : Math.ceil(1 - baseCrop.height * uniformScale);
            next.stretchX = Math.max(
                minimumStretchX,
                Math.round(next.stretchX)
            );
            next.stretchY = Math.max(
                minimumStretchY,
                Math.round(next.stretchY)
            );
            // Retain reference dimensions for stored-recipe compatibility.
            // Stretch is calculated against the current crop in output pixels.
            next.referenceWidth = baseCrop.width;
            next.referenceHeight = baseCrop.height;

            const outputRect = getTransformedOutputRect(baseCrop, next);
            validateOutputSize(outputRect.width, outputRect.height);
            state.imageTransform = next;
            updateImageTransformInputs();
            updateCropInputs(baseCrop);
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
            const uniformScale = Math.max(0.01, value.scalePercent / 100);
            const stretchOutputX = value.scaleAfterStretch
                ? value.stretchX * uniformScale
                : value.stretchX;
            const stretchOutputY = value.scaleAfterStretch
                ? value.stretchY * uniformScale
                : value.stretchY;
            const width = Math.max(
                1,
                Math.round((Number(outputRect.width) - stretchOutputX) / uniformScale)
            );
            const height = Math.max(
                1,
                Math.round((Number(outputRect.height) - stretchOutputY) / uniformScale)
            );
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
