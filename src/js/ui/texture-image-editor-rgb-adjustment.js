// ============================================================================
// texture-image-editor-rgb-adjustment.js - 贴图 RGB 通道增益处理
// 由 texture-image-editor-frame-edit.js 与长条输出流程复用。
// ============================================================================

        const RGB_ADJUSTMENT_MIN = 0;
        const RGB_ADJUSTMENT_MAX = 200;
        const RGB_ADJUSTMENT_DEFAULT = 100;

        function normalizeRgbAdjustmentChannel(value, fallback = RGB_ADJUSTMENT_DEFAULT) {
            const number = Number(value);
            if (!Number.isFinite(number)) return fallback;
            return Math.max(
                RGB_ADJUSTMENT_MIN,
                Math.min(RGB_ADJUSTMENT_MAX, Math.round(number * 10) / 10)
            );
        }

        function createDefaultRgbAdjustment() {
            return {
                r: RGB_ADJUSTMENT_DEFAULT,
                g: RGB_ADJUSTMENT_DEFAULT,
                b: RGB_ADJUSTMENT_DEFAULT
            };
        }

        function normalizeRgbAdjustment(value) {
            const source = value || {};
            return {
                r: normalizeRgbAdjustmentChannel(source.r),
                g: normalizeRgbAdjustmentChannel(source.g),
                b: normalizeRgbAdjustmentChannel(source.b)
            };
        }

        function cloneRgbAdjustment(value) {
            return normalizeRgbAdjustment(value);
        }

        function rgbAdjustmentsEqual(a, b) {
            const left = normalizeRgbAdjustment(a);
            const right = normalizeRgbAdjustment(b);
            return left.r === right.r && left.g === right.g && left.b === right.b;
        }

        function hasRgbAdjustment(value) {
            const adjustment = normalizeRgbAdjustment(value);
            return adjustment.r !== RGB_ADJUSTMENT_DEFAULT ||
                adjustment.g !== RGB_ADJUSTMENT_DEFAULT ||
                adjustment.b !== RGB_ADJUSTMENT_DEFAULT;
        }

        function createRgbChannelLookup(percent) {
            const lookup = new Uint8Array(256);
            const gain = percent / 100;
            for (let value = 0; value < lookup.length; value++) {
                lookup[value] = Math.min(255, Math.round(value * gain));
            }
            return lookup;
        }

        function applyRgbAdjustmentToCanvas(canvas, value) {
            if (!canvas || canvas.width < 1 || canvas.height < 1) return canvas;
            const adjustment = normalizeRgbAdjustment(value);
            if (!hasRgbAdjustment(adjustment)) return canvas;

            const ctx = canvas.getContext('2d');
            if (!ctx) return canvas;
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const redLookup = createRgbChannelLookup(adjustment.r);
            const greenLookup = createRgbChannelLookup(adjustment.g);
            const blueLookup = createRgbChannelLookup(adjustment.b);

            for (let index = 0; index < data.length; index += 4) {
                data[index] = redLookup[data[index]];
                data[index + 1] = greenLookup[data[index + 1]];
                data[index + 2] = blueLookup[data[index + 2]];
            }
            ctx.putImageData(imageData, 0, 0);
            return canvas;
        }
