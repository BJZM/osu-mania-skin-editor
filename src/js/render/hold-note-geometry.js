// ============================================================================
// hold-note-geometry.js - osu!stable 长条几何与身体贴图绘制
// 从 render/frame.js 按帧内职责拆分；共享数据通过 context 显式传入。
// ============================================================================

        function getStableHoldHeadAnchorY(note, currentScrollPosition, currentTime, hitPos, speedFactor) {
            if (currentTime < note.startTime) {
                return hitPos - (note.scrollPositionStart - currentScrollPosition) * speedFactor;
            }
            return hitPos;
        }

        function getStableHoldTailAnchorY(note, currentScrollPosition, hitPos, speedFactor) {
            return hitPos - (note.scrollPositionEnd - currentScrollPosition) * speedFactor;
        }

        // 身体长度只等于头尾两个下端锚点之间的距离，不包含头部半高，也不受尾巴顶端影响。
        // 身体近端位于头部贴图中心，因此远端自然为“尾端锚点 - 头部半高”。
        function getStableHoldNoteGeometry(note, currentScrollPosition, currentTime, hitPos, speedFactor, headHeight, tailHeight) {
            const headAnchorY = getStableHoldHeadAnchorY(
                note, currentScrollPosition, currentTime, hitPos, speedFactor
            );
            const tailAnchorY = getStableHoldTailAnchorY(
                note, currentScrollPosition, hitPos, speedFactor
            );
            const headTopY = headAnchorY - headHeight;
            const headCenterY = headAnchorY - headHeight / 2;
            const tailTopY = tailAnchorY - tailHeight;
            const bodyBottomY = headCenterY;
            const bodyLength = Math.max(0, headAnchorY - tailAnchorY);
            const bodyTopY = bodyBottomY - bodyLength;

            return {
                headAnchorY,
                headTopY,
                headCenterY,
                tailAnchorY,
                tailTopY,
                bodyTopY,
                bodyBottomY,
                bodyLength,
                bodyHeight: Math.max(0, bodyBottomY - bodyTopY),
                headFrozen: currentTime >= note.startTime
            };
        }

        // NoteBodyStyle 只负责身体矩形内部的贴图取样方式，不改变身体矩形本身。
        function drawStableHoldBodyTexture(targetCtx, image, style, x, width, bodyTopY, bodyHeight) {
            if (!image || width <= 0 || bodyHeight <= 0.5) return;

            const nativeW = image.width || 1;
            const nativeH = image.height || 1;
            const scaledNativeH = Math.max(1, nativeH * (width / nativeW));
            const bodyBottomY = bodyTopY + bodyHeight;

            targetCtx.save();
            targetCtx.beginPath();
            targetCtx.rect(x, bodyTopY, width, bodyHeight);
            targetCtx.clip();

            if (style === NOTE_BODY_STYLE.Stretch) {
                targetCtx.drawImage(image, x, bodyTopY, width, bodyHeight);
            } else if (style === NOTE_BODY_STYLE.RepeatTopAndBottom) {
                for (let y = bodyTopY; y < bodyBottomY; y += scaledNativeH) {
                    targetCtx.drawImage(image, x, y, width, scaledNativeH);
                }
                for (let y = bodyBottomY; y > bodyTopY; y -= scaledNativeH) {
                    targetCtx.drawImage(image, x, y - scaledNativeH, width, scaledNativeH);
                }
            } else if (style === NOTE_BODY_STYLE.RepeatFromHead) {
                for (let y = bodyBottomY; y > bodyTopY; y -= scaledNativeH) {
                    targetCtx.drawImage(image, x, y - scaledNativeH, width, scaledNativeH);
                }
            } else {
                for (let y = bodyTopY; y < bodyBottomY; y += scaledNativeH) {
                    targetCtx.drawImage(image, x, y, width, scaledNativeH);
                }
            }

            targetCtx.restore();
        }
