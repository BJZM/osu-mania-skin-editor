// ============================================================================
// frame-key-images.js - 帧内 KeyImage 与按下态绘制
// 从 render/frame.js 按帧内职责拆分；共享数据通过 context 显式传入。
// ============================================================================

        function createKeyImageRenderer(context) {
            const { keys, colWidths, colXCache, columnPressed, hitPos, canvas } = context;

            return () => {
                const keyAreaHeight = canvas.height - hitPos;

                for (let i = 0; i < keys; i++) {
                    const colW = colWidths[i] || colWidths[0];
                    const colX = colXCache[i];
                    const isPressed = columnPressed[i];

                    const keyImg = isPressed
                        ? getManiaSkinImage(keys, LML.KeyImageDown, i)
                        : getManiaSkinImage(keys, LML.KeyImage, i);

                    if (keyImg && keyImg.width > 0 && keyImg.height > 0) {
                        const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, i);
                        const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;

                        const is2x = !!keyImg._is2x;
                        const scaleFactor = is2x ? 3.2 : 1.6;
                        const stableRefW = rawColW * scaleFactor;

                        const drawWidth = colW;
                        let drawHeight;
                        if (Math.abs(keyImg.width - stableRefW) < 1) {
                            drawHeight = drawWidth * keyImg.height / keyImg.width;
                        } else {
                            drawHeight = drawWidth * keyImg.height / stableRefW;
                        }
                        const drawX = colX;
                        const drawY = canvas.height - drawHeight;

                        ctx.drawImage(keyImg, drawX, drawY, drawWidth, drawHeight);
                    } else {
                        const pad = 8;
                        const dia = Math.max(16, Math.min(colW, keyAreaHeight) - pad * 2);
                        const drawX = colX + (colW - dia) / 2;
                        const drawY = canvas.height - dia - pad;
                        const cx = drawX + dia / 2;
                        const cy = drawY + dia / 2;
                        const r = dia / 2;

                        ctx.save();
                        if (isPressed) {
                            const gradFill = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
                            gradFill.addColorStop(0, 'rgba(235, 235, 235, 1)');
                            gradFill.addColorStop(1, 'rgba(180, 180, 180, 1)');
                            ctx.fillStyle = gradFill;
                            ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.fill();
                            ctx.strokeStyle = '#ffffff';
                            ctx.lineWidth = 3;
                            ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke();
                        } else {
                            ctx.strokeStyle = '#ffffff';
                            ctx.lineWidth = 3;
                            ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke();
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                            ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.fill();
                        }
                        ctx.restore();
                    }
                }
            };
        }
