// ============================================================================
// hold-note-geometry.js - osu!stable 长条几何、身体贴图与长条批绘制
// 从 render/frame.js 按帧内职责拆分；共享数据通过 context 显式传入。
// ============================================================================

        // 后台节流或页面卡顿恢复后，不能把已经错过的整段时间集中补播。
        const PLAYBACK_EVENT_MAX_LATENESS_MS = 100;

        function isPlaybackEventFresh(eventTime, currentTime) {
            const lateness = Number(currentTime) - Number(eventTime);
            return Number.isFinite(lateness) &&
                lateness >= 0 &&
                lateness <= PLAYBACK_EVENT_MAX_LATENESS_MS;
        }

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

        function createHoldNotesRenderer(context) {
            const {
                notesList, earlyVisibleHolds, visStartIdx, visEndIdx,
                useIndexedNotes, isPreviewMode, colWidths, colXCache,
                hitPos, currentScrollPosition, speedFactor, canvas,
                canvasEditMode, activeNoteElements, currentTime,
                resolveAnimatedNoteImage, keys, scale48, rectTop,
                widthForNoteHeightScalePx, colNoteBodyStyles,
                holdBodyTextureNames, holdTailTextureNames,
                triggerPlaybackNoteJudgement
            } = context;

            const startIdx = (visStartIdx != null) ? visStartIdx : 0;
            const endIdx = (visEndIdx != null) ? visEndIdx : notesList.length;
            const holdPreCullPad = Math.max(400, 400 * scale48);

            const renderHoldNoteItem = (note) => {
                if (!note.isHold) return;
                if (currentTime >= note.endTime) {
                    if (!useIndexedNotes && !note.tailHit) {
                        note.tailHit = true;
                        if (!isPlaybackEventFresh(note.endTime, currentTime)) return;
                        const now = performance.now();
                        activeExplosions.push({ column: note.column, hitTime: effectAnimClockMs, duration: 200 });
                        if (!isPreviewMode) {
                            triggerPlaybackNoteJudgement(now);
                        }
                    }
                    return;
                }

                const headAnchorYPre = getStableHoldHeadAnchorY(
                    note, currentScrollPosition, currentTime, hitPos, speedFactor
                );
                const tailAnchorYPre = getStableHoldTailAnchorY(
                    note, currentScrollPosition, hitPos, speedFactor
                );
                note.holdHeadFrozen = currentTime >= note.startTime;
                if (headAnchorYPre < -100 || tailAnchorYPre > canvas.height + holdPreCullPad) return;

                const col = note.column;
                const w = colWidths[col];
                const colX = colXCache[col];

                const holdHeadImg = resolveAnimatedNoteImage(LML.HoldNoteHeadImage, col, note.startTime);
                const holdTailImg = resolveAnimatedNoteImage(LML.HoldNoteTailImage, col, note.endTime);

                const headDrawHeight = holdHeadImg
                    ? getManiaNoteDrawHeight(keys, col, holdHeadImg, w, scale48, widthForNoteHeightScalePx)
                    : Math.round(20 * scale48);
                const tailDrawHeight = holdTailImg
                    ? getManiaNoteDrawHeight(keys, col, holdTailImg, w, scale48, widthForNoteHeightScalePx)
                    : Math.round(20 * scale48);

                const holdGeometry = getStableHoldNoteGeometry(
                    note, currentScrollPosition, currentTime, hitPos, speedFactor,
                    headDrawHeight, tailDrawHeight
                );
                note.holdHeadFrozen = holdGeometry.headFrozen;

                const {
                    headAnchorY,
                    headTopY,
                    headCenterY,
                    tailAnchorY: tailBottomY,
                    tailTopY,
                    bodyTopY: bodyTop,
                    bodyBottomY: bodyBottom,
                    bodyHeight
                } = holdGeometry;

                const wholeTop = Math.min(headTopY, tailTopY, bodyTop);
                const wholeBottom = Math.max(headAnchorY, tailBottomY, bodyBottom);
                if (wholeBottom < -100 || wholeTop > canvas.height + 100) return;

                // 5a. 身体 (近端位于头部中心，长度只由头尾下端锚点决定)
                if (bodyHeight > 0.5) {
                    const holdBodyImg = resolveAnimatedNoteImage(LML.HoldNoteBodyImage, col);
                    if (canvasEditMode && bodyHeight > 4 && bodyTop < canvas.height && bodyBottom > 0 && bodyTop <= hitPos + 25) {
                        activeNoteElements.push({
                            id: `hold_body_${col}`,
                            noteInstanceKey: `hold_body_${col}_${note.startTime}`,
                            name: `第 ${col + 1} 轨长条身`,
                            paramKey: `NoteImage${col}L`,
                            fallbackParamKey: 'HoldNoteBodyImage',
                            category: 'Mania',
                            x: colX,
                            y: rectTop(bodyTop, bodyHeight),
                            w: w,
                            h: bodyHeight,
                            isTexture: true,
                            textureName: holdBodyTextureNames ? holdBodyTextureNames[col] : getManiaNoteTextureName(keys, LML.HoldNoteBodyImage, col),
                            textureKey: LML.HoldNoteBodyImage,
                            colIndex: col,
                            dragAxis: null,
                            valFormatter: () => `第 ${col + 1} 轨长条身`
                        });
                    }

                    if (holdBodyImg) {
                        let style = colNoteBodyStyles[col];
                        if (style === undefined) {
                            const nbsRes = getManiaSkinConfig(keys, LML.NoteBodyStyle, col);
                            style = (nbsRes && nbsRes.value != null) ? nbsRes.value : NOTE_BODY_STYLE.RepeatFromTail;
                            colNoteBodyStyles[col] = style;
                        }
                        drawStableHoldBodyTexture(ctx, holdBodyImg, style, colX, w, bodyTop, bodyHeight);
                    } else {
                        const inset = 5;
                        const bx = colX + inset;
                        const bw = w - inset * 2;
                        const grad = ctx.createLinearGradient(bx, bodyTop, bx, bodyBottom);
                        const baseColor = col % 2 === 0 ? '0, 229, 255' : '255, 255, 255';
                        grad.addColorStop(0, `rgba(${baseColor}, 0.55)`);
                        grad.addColorStop(1, `rgba(${baseColor}, 0.75)`);
                        ctx.fillStyle = grad;
                        roundRect(ctx, bx, bodyTop, bw, bodyHeight, 4);
                        ctx.fill();

                        ctx.save();
                        ctx.globalAlpha = 0.35;
                        ctx.fillStyle = `rgba(255,255,255,0.85)`;
                        ctx.fillRect(bx + bw * 0.35, bodyTop + 2, bw * 0.3, bodyHeight);
                        ctx.restore();
                    }
                }

                // 5b. 尾巴 (到达头部中点即停止渲染)
                if (tailBottomY > -tailDrawHeight * 2 && tailTopY < canvas.height + tailDrawHeight * 2) {
                    if (canvasEditMode && tailBottomY <= hitPos + 25) {
                        activeNoteElements.push({
                            id: `hold_tail_${col}`,
                            noteInstanceKey: `hold_tail_${col}_${note.startTime}`,
                            name: `第 ${col + 1} 轨长条尾`,
                            paramKey: `NoteImage${col}T`,
                            fallbackParamKey: 'HoldNoteTailImage',
                            category: 'Mania',
                            x: colX,
                            y: rectTop(tailTopY, tailDrawHeight),
                            w: w,
                            h: tailDrawHeight,
                            isTexture: true,
                            textureName: holdTailTextureNames ? holdTailTextureNames[col] : getManiaNoteTextureName(keys, LML.HoldNoteTailImage, col),
                            textureKey: LML.HoldNoteTailImage,
                            colIndex: col,
                            dragAxis: null,
                            valFormatter: () => `第 ${col + 1} 轨长条尾`
                        });
                    }

                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, canvas.width, Math.max(0, headCenterY));
                    ctx.clip();

                    if (holdTailImg) {
                        ctx.save();
                        ctx.translate(colX, tailBottomY);
                        ctx.scale(1, -1);
                        ctx.drawImage(holdTailImg, 0, 0, w, tailDrawHeight);
                        ctx.restore();
                    } else {
                        ctx.fillStyle = col % 2 === 0 ? '#00b8d4' : '#cccccc';
                        const rh = tailDrawHeight;
                        roundRect(ctx, colX + 4, tailTopY, w - 8, rh, 4);
                        ctx.fill();
                    }
                    ctx.restore();
                }
            };

            return () => {
                if (earlyVisibleHolds && earlyVisibleHolds.length > 0) {
                    for (let i = 0; i < earlyVisibleHolds.length; i++) {
                        renderHoldNoteItem(earlyVisibleHolds[i]);
                    }
                }
                for (let i = startIdx; i < endIdx; i++) {
                    renderHoldNoteItem(notesList[i]);
                }
            };
        }
