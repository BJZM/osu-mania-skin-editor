// ============================================================================
// frame-notes.js - 帧内 Note 与长条头绘制及有序音符索引
// 从 render/frame.js 按帧内职责拆分；共享数据通过 context 显式传入。
// ============================================================================

        const notesRenderIndexCache = new WeakMap();

        function upperBoundByStartTime(arr, time) {
            let lo = 0;
            let hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (arr[mid].startTime <= time) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        function lowerBoundByStartTime(arr, time) {
            let lo = 0;
            let hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (arr[mid].startTime < time) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        function upperBoundByEndTime(arr, time) {
            let lo = 0;
            let hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (arr[mid].endTime <= time) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        function lowerBoundByEndTime(arr, time) {
            let lo = 0;
            let hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (arr[mid].endTime < time) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        function lowerBoundByScrollStart(arr, scrollPos) {
            let lo = 0;
            let hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (arr[mid].scrollPositionStart < scrollPos) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        function upperBoundByScrollStart(arr, scrollPos) {
            let lo = 0;
            let hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (arr[mid].scrollPositionStart <= scrollPos) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        function upperBoundInt32(arr, value) {
            let lo = 0;
            let hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (arr[mid] <= value) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        function upperBoundFloat64(arr, value) {
            let lo = 0;
            let hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (arr[mid] <= value) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        function buildNotesRenderIndex(notes) {
            const len = notes.length;
            const holds = [];
            const holdIndicesList = [];
            const comboList = [];
            let sorted = true;
            let prevStart = -Infinity;
            let prevScroll = -Infinity;

            for (let i = 0; i < len; i++) {
                const n = notes[i];
                const st = Number(n.startTime);
                const ss = Number(n.scrollPositionStart);
                if (!Number.isFinite(st) || !Number.isFinite(ss) || st < prevStart || ss < prevScroll) {
                    sorted = false;
                    break;
                }
                prevStart = st;
                prevScroll = ss;

                comboList.push(st);
                if (n.isHold) {
                    holds.push(n);
                    holdIndicesList.push(i);
                    if (n.ticks && n.ticks.length > 0) {
                        for (let k = 0; k < n.ticks.length; k++) {
                            comboList.push(n.ticks[k]);
                        }
                    }
                    comboList.push(n.endTime);
                }
            }

            if (!sorted) {
                return { sorted: false, length: len };
            }

            const holdCount = holds.length;
            const holdNoteIndices = Int32Array.from(holdIndicesList);
            const holdPrefixMaxEnd = new Float64Array(holdCount);
            const holdPrefixMaxScrollEnd = new Float64Array(holdCount);
            let maxEnd = -Infinity;
            let maxScrollEnd = -Infinity;
            for (let j = 0; j < holdCount; j++) {
                const h = holds[j];
                if (h.endTime > maxEnd) maxEnd = h.endTime;
                if (h.scrollPositionEnd > maxScrollEnd) maxScrollEnd = h.scrollPositionEnd;
                holdPrefixMaxEnd[j] = maxEnd;
                holdPrefixMaxScrollEnd[j] = maxScrollEnd;
            }

            const holdsByEnd = holds.slice().sort((a, b) => a.endTime - b.endTime);
            const comboEventTimes = Float64Array.from(comboList);
            comboEventTimes.sort();

            return {
                sorted: true,
                length: len,
                notes,
                holds,
                holdNoteIndices,
                holdPrefixMaxEnd,
                holdPrefixMaxScrollEnd,
                holdsByEnd,
                comboEventTimes,
                hitCursor: 0,
                tailHitCursor: 0,
                lastHitScanTime: -Infinity
            };
        }

        function getOrBuildNotesRenderIndex(notes) {
            if (!Array.isArray(notes) || notes.length === 0) return null;
            let cached = notesRenderIndexCache.get(notes);
            if (!cached || cached.length !== notes.length) {
                cached = buildNotesRenderIndex(notes);
                notesRenderIndexCache.set(notes, cached);
            }
            return cached;
        }

        function syncNotesRenderIndexCursors(notes, currentTimeMs) {
            if (!Array.isArray(notes)) return;
            const cached = notesRenderIndexCache.get(notes);
            if (!cached || !cached.sorted || cached.length !== notes.length) return;
            cached.hitCursor = upperBoundByStartTime(cached.notes, currentTimeMs);
            cached.tailHitCursor = upperBoundByEndTime(cached.holdsByEnd, currentTimeMs);
            cached.lastHitScanTime = currentTimeMs;
        }

        function createNoteRenderer(context) {
            const {
                notesList, earlyVisibleHolds, visStartIdx, visEndIdx,
                colWidths, colXCache, hitPos, currentScrollPosition,
                speedFactor, canvas, canvasEditMode, activeNoteElements, currentTime,
                resolveAnimatedNoteImage, keys, scale48, rectTop,
                widthForNoteHeightScalePx, noteTextureNames, holdHeadTextureNames
            } = context;

            const startIdx = (visStartIdx != null) ? visStartIdx : 0;
            const endIdx = (visEndIdx != null) ? visEndIdx : notesList.length;
            const headPreCullPad = Math.max(400, 400 * scale48);

            const drawNoteItem = (note) => {
                const col = note.column;
                const w = colWidths[col];
                const colX = colXCache[col];

                if (!note.isHold) {
                    if (note.hit) return;
                    const bottomY = hitPos - (note.scrollPositionStart - currentScrollPosition) * speedFactor;
                    if (bottomY > canvas.height + 80 || bottomY < -80) return;

                    const noteImg = resolveAnimatedNoteImage(LML.NoteImage, col, note.startTime);
                    const drawHeight = noteImg
                        ? getManiaNoteDrawHeight(keys, col, noteImg, w, scale48, widthForNoteHeightScalePx)
                        : Math.round(20 * scale48);

                    if (canvasEditMode && bottomY <= hitPos + 25) {
                        activeNoteElements.push({
                            id: `note_${col}`,
                            noteInstanceKey: `note_${col}_${note.startTime}`,
                            name: `第 ${col + 1} 轨单键`,
                            paramKey: `NoteImage${col}`,
                            fallbackParamKey: 'NoteImage',
                            category: 'Mania',
                            x: colX,
                            y: rectTop(bottomY - drawHeight, drawHeight),
                            w: w,
                            h: drawHeight,
                            isTexture: true,
                            textureName: noteTextureNames ? noteTextureNames[col] : getManiaNoteTextureName(keys, LML.NoteImage, col),
                            textureKey: LML.NoteImage,
                            colIndex: col,
                            dragAxis: null,
                            valFormatter: () => `第 ${col + 1} 轨音符`
                        });
                    }

                    if (noteImg) {
                        ctx.drawImage(noteImg, colX, bottomY - drawHeight, w, drawHeight);
                    } else {
                        const r = 4;
                        const nh = Math.round(20 * scale48 / 1.5);
                        ctx.fillStyle = col % 2 === 0 ? '#00e5ff' : '#ffffff';
                        roundRect(ctx, colX + 2, bottomY - nh, w - 4, nh, r);
                        ctx.fill();
                    }
                } else {
                    if (currentTime >= note.endTime) return;

                    const headAnchorY = getStableHoldHeadAnchorY(
                        note, currentScrollPosition, currentTime, hitPos, speedFactor
                    );
                    // 先用宽松边界裁剪视口外的长条头，再解析序列帧贴图
                    if (headAnchorY < -80 || headAnchorY > canvas.height + headPreCullPad) return;

                    const holdHeadImg = resolveAnimatedNoteImage(LML.HoldNoteHeadImage, col, note.startTime);
                    const headDrawHeight = holdHeadImg
                        ? getManiaNoteDrawHeight(keys, col, holdHeadImg, w, scale48, widthForNoteHeightScalePx)
                        : Math.round(22 * scale48 / 1.5);
                    const headTopY = headAnchorY - headDrawHeight;

                    if (headAnchorY > canvas.height + 80 || headTopY < -80) return;

                    if (canvasEditMode && headAnchorY <= hitPos + 25) {
                        activeNoteElements.push({
                            id: `hold_head_${col}`,
                            noteInstanceKey: `hold_head_${col}_${note.startTime}`,
                            name: `第 ${col + 1} 轨长条头`,
                            paramKey: `NoteImage${col}H`,
                            fallbackParamKey: 'HoldNoteHeadImage',
                            category: 'Mania',
                            x: colX,
                            y: rectTop(headTopY, headDrawHeight),
                            w: w,
                            h: headDrawHeight,
                            isTexture: true,
                            textureName: holdHeadTextureNames ? holdHeadTextureNames[col] : getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, col),
                            textureKey: LML.HoldNoteHeadImage,
                            colIndex: col,
                            dragAxis: null,
                            valFormatter: () => `第 ${col + 1} 轨长条头`
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
            };

            return () => {
                if (earlyVisibleHolds && earlyVisibleHolds.length > 0) {
                    for (let i = 0; i < earlyVisibleHolds.length; i++) {
                        drawNoteItem(earlyVisibleHolds[i]);
                    }
                }
                for (let i = startIdx; i < endIdx; i++) {
                    drawNoteItem(notesList[i]);
                }
            };
        }

        function buildPreviewDummyNotes(keys, scale48, speedFactor) {
            const previewNotes = [];
            for (let c = 0; c < keys; c++) {
                const isHoldCol = (c === 1 || (keys > 4 && c === keys - 2));
                // 预览音符间距同样基于 480 虚拟网格，需乘 scale48 才能在不同画布尺寸下保持
                // 与真实演奏一致的相对布局（否则全屏时音符会全部挤在命中线附近）。
                const noteDist = (120 + (c % 4) * 80) * scale48;
                const startTime = noteDist / speedFactor;
                if (isHoldCol) {
                    const endTime = (noteDist + 160 * scale48) / speedFactor;
                    previewNotes.push({
                        column: c,
                        isHold: true,
                        startTime: startTime,
                        endTime: endTime,
                        scrollPositionStart: startTime,
                        scrollPositionEnd: endTime,
                        hit: false,
                        holdHeadFrozen: false
                    });
                } else {
                    previewNotes.push({
                        column: c,
                        isHold: false,
                        startTime: startTime,
                        endTime: startTime,
                        scrollPositionStart: startTime,
                        scrollPositionEnd: startTime,
                        hit: false
                    });
                }
            }
            return previewNotes;
        }

        function computeFrameNotePressAndComboState({
            notesList, keys, currentTime, isPreviewMode,
            useIndexedNotes, notesIndex, keyPressDuration
        }) {
            const columnPressed = Array(keys).fill(false);
            const columnLastReleaseTime = Array(keys).fill(-Infinity);
            const activeHoldNotes = [];
            let currentCombo = 0;
            let isHoldingLN = false;

            if (useIndexedNotes) {
                const startUpper = upperBoundByStartTime(notesList, currentTime);
                const tapLookbackStart = lowerBoundByStartTime(
                    notesList,
                    currentTime - keyPressDuration - STAGE_LIGHT_FADE_DURATION_MS - 1
                );
                for (let i = tapLookbackStart; i < startUpper; i++) {
                    const note = notesList[i];
                    if (note.isHold) continue;
                    const col = note.column;
                    if (col < 0 || col >= keys) continue;
                    const noteEndTime = note.startTime + keyPressDuration;
                    if (currentTime >= note.startTime && currentTime <= noteEndTime) {
                        columnPressed[col] = true;
                    } else if (currentTime > noteEndTime && noteEndTime > columnLastReleaseTime[col]) {
                        columnLastReleaseTime[col] = noteEndTime;
                    }
                }

                const holdUpper = upperBoundByStartTime(notesIndex.holds, currentTime);
                const minHoldEndForLight = currentTime - STAGE_LIGHT_FADE_DURATION_MS - 1;
                for (let j = holdUpper - 1; j >= 0; j--) {
                    if (notesIndex.holdPrefixMaxEnd[j] < minHoldEndForLight) break;
                    const note = notesIndex.holds[j];
                    const col = note.column;
                    if (currentTime <= note.endTime) {
                        if (col >= 0 && col < keys) columnPressed[col] = true;
                        activeHoldNotes.push(note);
                        if (currentTime < note.endTime) isHoldingLN = true;
                    } else if (col >= 0 && col < keys && note.endTime > columnLastReleaseTime[col]) {
                        columnLastReleaseTime[col] = note.endTime;
                    }
                }
                if (activeHoldNotes.length > 1) activeHoldNotes.reverse();
                currentCombo = upperBoundFloat64(notesIndex.comboEventTimes, currentTime);
            } else {
                for (let i = 0; i < notesList.length; i++) {
                    const note = notesList[i];
                    const col = note.column;
                    if (col < 0 || col >= keys) continue;
                    const noteEndTime = note.isHold ? note.endTime : (note.startTime + keyPressDuration);
                    if (currentTime >= note.startTime && currentTime <= noteEndTime) {
                        columnPressed[col] = true;
                    } else if (currentTime > noteEndTime && noteEndTime > columnLastReleaseTime[col]) {
                        columnLastReleaseTime[col] = noteEndTime;
                    }
                }
                if (!isPreviewMode) {
                    for (let i = 0; i < notesList.length; i++) {
                        const n = notesList[i];
                        if (n.isHold) {
                            if (currentTime >= n.startTime) {
                                currentCombo++;
                                if (currentTime < n.endTime) isHoldingLN = true;
                            }
                            if (n.ticks && n.ticks.length > 0) {
                                for (let k = 0; k < n.ticks.length; k++) {
                                    if (currentTime >= n.ticks[k]) {
                                        currentCombo++;
                                    } else {
                                        break;
                                    }
                                }
                            }
                            if (currentTime >= n.endTime) {
                                currentCombo++;
                            }
                        } else if (currentTime >= n.startTime) {
                            currentCombo++;
                        }
                    }
                } else {
                    currentCombo = 100;
                    isHoldingLN = false;
                    for (let i = 0; i < notesList.length; i++) {
                        const n = notesList[i];
                        if (n.isHold && currentTime >= n.startTime && currentTime < n.endTime) {
                            isHoldingLN = true;
                        }
                    }
                }
            }

            return {
                columnPressed,
                columnLastReleaseTime,
                activeHoldNotes,
                currentCombo,
                isHoldingLN
            };
        }

        function advanceFrameNoteHitCursors({
            notesList, currentTime, useIndexedNotes, notesIndex,
            triggerPlaybackNoteJudgement
        }) {
            if (typeof scheduleManiaHitsounds === 'function') {
                scheduleManiaHitsounds(currentTime);
            }
            const now = performance.now();
            if (useIndexedNotes) {
                if (currentTime < notesIndex.lastHitScanTime) {
                    notesIndex.hitCursor = lowerBoundByStartTime(notesList, currentTime);
                    notesIndex.tailHitCursor = lowerBoundByEndTime(notesIndex.holdsByEnd, currentTime);
                }
                const hitLimit = upperBoundByStartTime(notesList, currentTime);
                for (let i = notesIndex.hitCursor; i < hitLimit; i++) {
                    const note = notesList[i];
                    if (!note.hit && currentTime >= note.startTime) {
                        note.hit = true;
                        // 隐藏期间错过的 note 仍保持已处理状态，但不补播瞬时反馈。
                        if (!isPlaybackEventFresh(note.startTime, currentTime)) continue;
                        // 单键音符触碰判定线时显示判定；长条音符按下时仅触发打击特效，松开(endTime)时才触发判定提示
                        if (!note.isHold) {
                            triggerPlaybackNoteJudgement(now);
                        }
                        activeExplosions.push({ column: note.column, hitTime: effectAnimClockMs, duration: 200 });
                    }
                }
                notesIndex.hitCursor = hitLimit;

                const tailLimit = upperBoundByEndTime(notesIndex.holdsByEnd, currentTime);
                for (let j = notesIndex.tailHitCursor; j < tailLimit; j++) {
                    const note = notesIndex.holdsByEnd[j];
                    if (!note.tailHit && currentTime >= note.endTime) {
                        note.tailHit = true;
                        if (!isPlaybackEventFresh(note.endTime, currentTime)) continue;
                        activeExplosions.push({ column: note.column, hitTime: effectAnimClockMs, duration: 200 });
                        triggerPlaybackNoteJudgement(now);
                    }
                }
                notesIndex.tailHitCursor = tailLimit;
                notesIndex.lastHitScanTime = currentTime;
            } else {
                for (let i = 0; i < notesList.length; i++) {
                    const note = notesList[i];
                    if (!note.hit && currentTime >= note.startTime) {
                        note.hit = true;
                        if (!isPlaybackEventFresh(note.startTime, currentTime)) continue;
                        if (!note.isHold) {
                            triggerPlaybackNoteJudgement(now);
                        }
                        activeExplosions.push({ column: note.column, hitTime: effectAnimClockMs, duration: 200 });
                    }
                }
            }
        }
