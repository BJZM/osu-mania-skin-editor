// ============================================================================
// frame-notes.js - 帧内 Note 与长条头绘制
// 从 render/frame.js 按帧内职责拆分；共享数据通过 context 显式传入。
// ============================================================================

        function createNoteRenderer(context) {
            const {
                notesList, colWidths, colXCache, hitPos, currentScrollPosition,
                speedFactor, canvas, canvasEditMode, activeNoteElements, currentTime,
                resolveAnimatedNoteImage, keys, scale48, rectTop
            } = context;

            return () => {
                for (let i = 0; i < notesList.length; i++) {
                    let note = notesList[i];
                    let w = colWidths[note.column];
                    let colX = colXCache[note.column];

                    if (!note.isHold) {
                        if (note.hit) continue;
                        let bottomY = hitPos - (note.scrollPositionStart - currentScrollPosition) * speedFactor;
                        if (bottomY > canvas.height + 80 || bottomY < -80) continue;

                        let noteImg = resolveAnimatedNoteImage(LML.NoteImage, note.column, note.startTime);
                        const drawHeight = noteImg ? getManiaNoteDrawHeight(keys, note.column, noteImg, w, scale48) : Math.round(20 * scale48);

                        if (canvasEditMode && bottomY <= hitPos + 25) {
                            activeNoteElements.push({
                                id: `note_${note.column}`,
                                noteInstanceKey: `note_${note.column}_${note.startTime}`,
                                name: `第 ${note.column + 1} 轨单键`,
                                paramKey: `NoteImage${note.column}`,
                                fallbackParamKey: 'NoteImage',
                                category: 'Mania',
                                x: colX,
                                y: rectTop(bottomY - drawHeight, drawHeight),
                                w: w,
                                h: drawHeight,
                                isTexture: true,
                                textureName: getManiaNoteTextureName(keys, LML.NoteImage, note.column),
                                textureKey: LML.NoteImage,
                                colIndex: note.column,
                                dragAxis: null,
                                valFormatter: () => `第 ${note.column + 1} 轨音符`
                            });
                        }

                        if (noteImg) {
                            ctx.drawImage(noteImg, colX, bottomY - drawHeight, w, drawHeight);
                        } else {
                            const r = 4;
                            const nh = Math.round(20 * scale48 / 1.5);
                            ctx.fillStyle = note.column % 2 === 0 ? '#00e5ff' : '#ffffff';
                            roundRect(ctx, colX + 2, bottomY - nh, w - 4, nh, r);
                            ctx.fill();
                        }
                    } else {
                        if (currentTime >= note.endTime) continue;

                        const holdHeadImg = resolveAnimatedNoteImage(LML.HoldNoteHeadImage, note.column, note.startTime);
                        const headDrawHeight = holdHeadImg ? getManiaNoteDrawHeight(keys, note.column, holdHeadImg, w, scale48) : Math.round(22 * scale48 / 1.5);

                        const headAnchorY = getStableHoldHeadAnchorY(
                            note, currentScrollPosition, currentTime, hitPos, speedFactor
                        );
                        const headTopY = headAnchorY - headDrawHeight;

                        if (headAnchorY > canvas.height + 80 || headTopY < -80) continue;

                        if (canvasEditMode && headAnchorY <= hitPos + 25) {
                            activeNoteElements.push({
                                id: `hold_head_${note.column}`,
                                noteInstanceKey: `hold_head_${note.column}_${note.startTime}`,
                                name: `第 ${note.column + 1} 轨长条头`,
                                paramKey: `NoteImage${note.column}H`,
                                fallbackParamKey: 'HoldNoteHeadImage',
                                category: 'Mania',
                                x: colX,
                                y: rectTop(headTopY, headDrawHeight),
                                w: w,
                                h: headDrawHeight,
                                isTexture: true,
                                textureName: getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, note.column),
                                textureKey: LML.HoldNoteHeadImage,
                                colIndex: note.column,
                                dragAxis: null,
                                valFormatter: () => `第 ${note.column + 1} 轨长条头`
                            });
                        }

                        if (holdHeadImg) {
                            ctx.drawImage(holdHeadImg, colX, headTopY, w, headDrawHeight);
                        } else {
                            const r = 4;
                            ctx.fillStyle = '#ffffff';
                            roundRect(ctx, colX + 2, headTopY, w - 4, headDrawHeight, r);
                            ctx.fill();
                            if (note.holdHeadFrozen) {
                                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                                ctx.fillRect(colX + 2, headAnchorY - 3, w - 4, 3);
                            }
                        }
                    }
                }
            };
        }
