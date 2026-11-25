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
