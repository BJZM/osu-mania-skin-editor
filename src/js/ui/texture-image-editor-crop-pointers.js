// ============================================================================
// texture-image-editor-crop-pointers.js - 裁剪画布指针状态与光标反馈
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function getCropPointerState(event) {
            const canvas = byId('textureImagePreviewCanvas');
            const cropRect = state.cropRect;
            const viewport = state.previewViewport;
            const outputRect = getTransformedOutputRect(cropRect);
            if (!canvas || !cropRect || !viewport || !outputRect) return null;

            const rect = canvas.getBoundingClientRect();
            const px = (event.clientX - rect.left) * canvas.width / rect.width;
            const py = (event.clientY - rect.top) * canvas.height / rect.height;
            const left = viewport.offsetX + outputRect.x * viewport.scale;
            const top = viewport.offsetY + outputRect.y * viewport.scale;
            const right = left + outputRect.width * viewport.scale;
            const bottom = top + outputRect.height * viewport.scale;
            const handles = getCropHandlePoints(left, top, right, bottom);
            const hitRadius = 9;

            for (const [mode, point] of Object.entries(handles)) {
                if (Math.abs(px - point.x) <= hitRadius && Math.abs(py - point.y) <= hitRadius) {
                    return {
                        mode,
                        px,
                        py,
                        worldX: (px - viewport.offsetX) / viewport.scale,
                        worldY: (py - viewport.offsetY) / viewport.scale
                    };
                }
            }
            return null;
        }

        function getTransformPointerState(event) {
            const canvas = byId('textureImagePreviewCanvas');
            const cropRect = state.cropRect;
            const viewport = state.previewViewport;
            const outputRect = getTransformedOutputRect(cropRect);
            if (!canvas || !cropRect || !viewport || !outputRect) return null;

            const rect = canvas.getBoundingClientRect();
            const px = (event.clientX - rect.left) * canvas.width / rect.width;
            const py = (event.clientY - rect.top) * canvas.height / rect.height;
            const left = viewport.offsetX + outputRect.x * viewport.scale;
            const top = viewport.offsetY + outputRect.y * viewport.scale;
            const right = left + outputRect.width * viewport.scale;
            const bottom = top + outputRect.height * viewport.scale;
            const handles = getCropHandlePoints(left, top, right, bottom);
            const hitRadius = 10;

            for (const [mode, point] of Object.entries(handles)) {
                if (Math.abs(px - point.x) <= hitRadius && Math.abs(py - point.y) <= hitRadius) {
                    return {
                        mode,
                        px,
                        py,
                        worldX: (px - viewport.offsetX) / viewport.scale,
                        worldY: (py - viewport.offsetY) / viewport.scale
                    };
                }
            }
            return null;
        }

        function updateCropCursor(mode) {
            const canvas = byId('textureImagePreviewCanvas');
            if (!canvas) return;
            const cursor = mode === 'nw' || mode === 'se' ? 'nwse-resize'
                : mode === 'ne' || mode === 'sw' ? 'nesw-resize'
                : mode === 'n' || mode === 's' ? 'ns-resize'
                : mode === 'e' || mode === 'w' ? 'ew-resize'
                : 'default';
            canvas.style.cursor = cursor;
        }

        function getLongBodyTailPointerState(event) {
            const canvas = byId('textureImagePreviewCanvas');
            const composer = state.longBodyComposer;
            const viewport = state.previewViewport;
            const frame = state.previewFrames[0];
            if (!canvas || !viewport || !frame || !composer.active || !composer.tailFrame) return null;
            const rect = canvas.getBoundingClientRect();
            const px = (event.clientX - rect.left) * canvas.width / rect.width;
            const py = (event.clientY - rect.top) * canvas.height / rect.height;
            const left = viewport.offsetX;
            const right = left + frame.width * viewport.scale;
            const top = viewport.offsetY + composer.coverage * viewport.scale;
            const tailDisplayHeight = getLongBodyTailDisplayHeight(
                composer.tailFrame,
                frame.width,
                composer.fade / LONG_BODY_FADE_MAX
            );
            const bottom = top + tailDisplayHeight * viewport.scale;
            if (px < left || px > right || py < top - 8 || py > bottom + 8) return null;
            return { px, py };
        }
