// ============================================================================
// tiff.js - TIFF / 伪装 PNG 图片兼容解码
// 依赖：vendor/utif.min.js
// ============================================================================

        // ===== 兼容方案：解析 TIFF 格式图片（兼容伪装成 .png 的 TIFF 图像） =====
        async function decodeTiffToImageOrCanvas(arrayBuffer) {
            if (typeof UTIF === 'undefined') return null;
            try {
                const ifds = UTIF.decode(arrayBuffer);
                if (!ifds || ifds.length === 0) return null;
                const firstIfd = ifds[0];
                UTIF.decodeImage(arrayBuffer, firstIfd);
                const rgba = UTIF.toRGBA8(firstIfd);
                const w = firstIfd.width;
                const h = firstIfd.height;
                if (!w || !h || !rgba) return null;

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                const tCtx = tempCanvas.getContext('2d');
                const imgData = tCtx.createImageData(w, h);
                imgData.data.set(rgba);
                tCtx.putImageData(imgData, 0, 0);

                // 尝试转为 Image 对象，若超长尺寸无法转为 blob 则直接返回 Canvas
                try {
                    const blob = await new Promise(res => tempCanvas.toBlob(res, 'image/png'));
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        const img = await new Promise((res, rej) => {
                            const i = new Image();
                            i.onload = () => { URL.revokeObjectURL(url); res(i); };
                            i.onerror = () => { URL.revokeObjectURL(url); rej(); };
                            i.src = url;
                        });
                        return img;
                    }
                } catch (_) { }

                return tempCanvas;
            } catch (err) {
                console.warn('[decodeTiffToImageOrCanvas] TIFF 解码异常:', err);
                return null;
            }
        }