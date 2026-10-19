// ============================================================================
// beatmap-import.js - .osz / .osu 导入流程与难度列表绑定
// 依赖：parser/beatmap-format.js、parser/zip-timing.js、parser/beatmap-load.js、UI 提示层
// ============================================================================

        // 导入谱面流程
        ui.osz.addEventListener('change', async (e) => {
            if (isSkinLoading) {
                alert(window.I18n ? window.I18n.t('正在读取皮肤，请等待皮肤加载完毕！') : '正在读取皮肤，请等待皮肤加载完毕！');
                e.target.value = '';
                return;
            }
            const file = e.target.files[0];
            if (!file) return;
            if (!/\.(osz|zip|osu)$/i.test(file.name)) {
                showToast('文件类型不支持', '请选择 .osz、.zip 或 .osu 文件。');
                e.target.value = '';
                return;
            }

            ui.oszFileName.textContent = file.name;
            ui.oszFileName.setAttribute('data-i18n-ignore', '');
            ui.oszFileName.classList.add('loaded');
            ui.diff.innerHTML = '<option>正在解析...</option>';
            showProgress('正在解压与解析谱面...');

            try {
                disposeStoryboardPlayback();
                beatmaps = [];
                ui.diff.innerHTML = '';
                loadedOszForBg = false;
                if (pageBgUrl) { URL.revokeObjectURL(pageBgUrl); pageBgUrl = null; }

                const isSingleOsu = file.name.toLowerCase().endsWith('.osu');

                if (isSingleOsu) {
                    currentOszZip = null;
                    const osuText = await file.text();
                    let parsedMap = parseOsuBeatmap(osuText);
                    const timingPoints = parseTimingPointsFromOsuText(osuText);

                    if (parsedMap) {
                        const storyboard = parseStoryboardEvents(osuText, parsedMap.formatVersion);
                        parsedMap.storyboard = storyboard;
                        if (!parsedMap.bgPath && storyboard.backgroundPath) {
                            parsedMap.bgPath = storyboard.backgroundPath;
                        }

                        let noteCnt = 0, holdCnt = 0, lastTime = 0;
                        parsedMap.hitObjects.forEach(obj => {
                            const s = parseFloat(obj.startTime);
                            const e = (obj.endTime != null) ? parseFloat(obj.endTime) : NaN;
                            const isHold = isFinite(e) && e > (isFinite(s) ? s : Number.MAX_SAFE_INTEGER);
                            if (isHold) holdCnt++; else noteCnt++;
                            const curMax = Math.max(isFinite(s) ? s : 0, isFinite(e) ? e : 0);
                            if (curMax > lastTime) lastTime = curMax;
                        });

                        beatmaps.push({
                            path: file.name,
                            data: parsedMap,
                            bgPath: parsedMap.bgPath,
                            storyboard: storyboard,
                            timingPoints: timingPoints,
                            stats: {
                                keys: Math.round(parsedMap.difficulty.circleSize) || 4,
                                notes: noteCnt,
                                holds: holdCnt,
                                lengthMs: lastTime
                            }
                        });
                    }
                } else {
                    currentOszZip = await JSZip.loadAsync(file);
                    let decoder = null;
                    try {
                        const DecoderClass = window.BeatmapDecoder || (await getBeatmapDecoder());
                        if (DecoderClass) decoder = new DecoderClass();
                    } catch (_) {}

                    const fileEntries = Object.keys(currentOszZip.files);
                    const totalFiles = fileEntries.length;
                    let processed = 0;
                    const osbEntries = [];

                    for (const relativePath of fileEntries) {
                        if (!relativePath.toLowerCase().endsWith('.osb')) continue;
                        try {
                            const osbText = await currentOszZip.files[relativePath].async('string');
                            osbEntries.push({
                                path: relativePath,
                                text: osbText
                            });
                        } catch (osbError) {
                            console.warn(`解析故事板文件 [${relativePath}] 异常，已跳过:`, osbError);
                        }
                    }

                    for (const relativePath of fileEntries) {
                        processed++;
                        updateProgress(processed, totalFiles, relativePath);

                        if (relativePath.toLowerCase().endsWith('.osu')) {
                            try {
                                const osuText = await currentOszZip.files[relativePath].async("string");
                                let parsedMap = parseOsuBeatmap(osuText);
                                if (!parsedMap && decoder) {
                                    try { parsedMap = decoder.decodeFromString(osuText); } catch (_) {}
                                }
                                if (!parsedMap) continue;

                                const timingPoints = parseTimingPointsFromOsuText(osuText);

                                if (parsedMap.mode === 3) {
                                    const osuStoryboard = parseStoryboardEvents(
                                        osuText,
                                        parsedMap.formatVersion || 14
                                    );
                                    const osbEntry = findStoryboardEntryForBeatmap(relativePath, osbEntries);
                                    if (osbEntry && !osbEntry.parsed) {
                                        osbEntry.parsed = parseStoryboardEvents(osbEntry.text, parsedMap.formatVersion || 14);
                                    }
                                    const storyboard = mergeStoryboardData(
                                        osuStoryboard,
                                        osbEntry ? osbEntry.parsed : null
                                    );
                                    parsedMap.storyboard = storyboard;

                                    let noteCnt = 0, holdCnt = 0, lastTime = 0;
                                    (parsedMap.hitObjects || []).forEach(obj => {
                                        const s = parseFloat(obj.startTime);
                                        const e = (obj.endTime != null) ? parseFloat(obj.endTime) : NaN;
                                        const isHold = isFinite(e) && e > (isFinite(s) ? s : Number.MAX_SAFE_INTEGER);
                                        if (isHold) holdCnt++; else noteCnt++;
                                        const curMax = Math.max(isFinite(s) ? s : 0, isFinite(e) ? e : 0);
                                        if (curMax > lastTime) lastTime = curMax;
                                    });

                                    let bgPath = parsedMap.bgPath || storyboard.backgroundPath || null;
                                    if (!bgPath) {
                                        const bgMatch = osuText.match(/^\s*(?:0|Background)\s*,\s*0\s*,\s*"?([^",\r\n]+?)"?\s*(?:,.*)?$/im);
                                        if (bgMatch && bgMatch[1]) {
                                            bgPath = bgMatch[1].trim();
                                        }
                                    }
                                    if (bgPath) {
                                        bgPath = normalizeStoryboardPath(bgPath);
                                    }
                                    parsedMap.bgPath = bgPath;

                                    beatmaps.push({
                                        path: relativePath, data: parsedMap, bgPath: bgPath,
                                        storyboard: storyboard,
                                        timingPoints: timingPoints,
                                        stats: {
                                            keys: Math.round(parsedMap.difficulty.circleSize) || 4,
                                            notes: noteCnt, holds: holdCnt, lengthMs: lastTime
                                        }
                                    });
                                }
                            } catch (itemErr) {
                                console.warn(`解析难度文件 [${relativePath}] 异常，已跳过:`, itemErr);
                            }
                        }
                    }
                }

                if (beatmaps.length > 0) {
                    beatmaps.sort((a, b) => a.stats.keys - b.stats.keys);
                    beatmaps.forEach((bm, idx) => {
                        const opt = document.createElement('option');
                        opt.value = idx;
                        const ver = (bm.data && bm.data.metadata && bm.data.metadata.version) ? bm.data.metadata.version : `难度 ${idx + 1}`;
                        opt.text = `[${ver}] (${bm.stats.keys}K)`;
                        ui.diff.appendChild(opt);
                    });
                    ui.diff.value = 0;
                    renderDiffDropdownMenu();
                    updateStatsDisplay();
                    hideProgress();

                    // 自动直接在右侧画布中加载第 1 个难度与其对应的背景图
                    await loadBeatmapDifficulty(0);
                    if (typeof markStartupBeatmapReady === 'function') {
                        markStartupBeatmapReady(file.name);
                    }
                    showToast('谱面导入成功', `已自动加载第 1 难度背景与谱面 (共 ${beatmaps.length} 个难度)`);
                } else {
                    ui.diff.innerHTML = '<option>未找到 Mania 谱面</option>';
                    renderDiffDropdownMenu();
                    showToast('提示', '压缩包内未找到有效 Mania 模式谱面');
                    setTimeout(hideProgress, 300);
                }
            } catch (err) {
                console.error("谱面文件解析异常:", err);
                showToast('错误', '谱面文件解析失败: ' + (err.message || '未知错误'));
                setTimeout(hideProgress, 300);
            }
        });

        ui.diff.addEventListener('change', async () => {
            if (beatmaps.length > 0 && ui.diff.value !== '') {
                const diffIdx = parseInt(ui.diff.value, 10);
                await loadBeatmapDifficulty(diffIdx);
            }
        });
