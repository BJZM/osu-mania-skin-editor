// ============================================================================
// beatmap-load.js - 难度切换、音频/背景加载与 activeNotes 构建
// 依赖：parser/zip-timing.js、core/state.js、renderer/UI 公共函数
// ============================================================================

        async function loadBeatmapDifficulty(diffIdx) {
            if (!beatmaps || !beatmaps[diffIdx]) return;

            // 如果当前正在播放，先暂停播放
            if (isPlaying) {
                pauseAudioAndBeatmap();
            }
            disposeStoryboardPlayback();

            const bmInfo = beatmaps[diffIdx];
            currentBeatmap = bmInfo.data;
            currentTimingPoints = (bmInfo && bmInfo.timingPoints) ? bmInfo.timingPoints : [];
            const keys = bmInfo.stats.keys;
            ui.diff.value = diffIdx;
            updateStatsDisplay();
            renderDiffDropdownMenu();
            if (keys && maniaSkinConfigurations.has(keys)) {
                activeEditorKeyCount = keys;
                updateSkinEditorKeyPills();
            }

            // 1. 加载音频文件
            if (currentOszZip && currentBeatmap && currentBeatmap.general && currentBeatmap.general.audioFilename) {
                const audioFileName = currentBeatmap.general.audioFilename;
                const audioKey = findZipEntry(currentOszZip, audioFileName);
                const audioFile = audioKey ? currentOszZip.file(audioKey) : currentOszZip.file(audioFileName);
                if (audioFile) {
                    try {
                        const audioBlob = await audioFile.async("blob");
                        if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
                        audioBlobUrl = URL.createObjectURL(audioBlob);
                        audio.src = audioBlobUrl;
                    } catch (e) {
                        console.warn("加载音频异常:", e);
                    }
                }
            }

            // 2. 加载当前难度背景图 (仅在画布内部渲染，页面整体背景保持统一深灰)
            const bgFileKey = currentOszZip ? getBeatmapBackgroundKey(currentOszZip, bmInfo) : null;
            if (bgFileKey) {
                try {
                    const bgBlob = await currentOszZip.file(bgFileKey).async("blob");
                    const bgUrl = URL.createObjectURL(bgBlob);
                    // 页面外层背景保持纯净深灰，不展示曲绘
                    if (pageBgUrl) {
                        try { URL.revokeObjectURL(pageBgUrl); } catch (_) { }
                        pageBgUrl = null;
                    }
                    if (ui.bg) {
                        ui.bg.src = '';
                        ui.bg.classList.remove('visible');
                    }
                    const nextImg = new Image();
                    await new Promise((resolve) => {
                        nextImg.onload = () => {
                            if (canvasBgImage && canvasBgImage.complete && canvasBgImage.src && hasCanvasBg) {
                                prevCanvasBgImage = canvasBgImage;
                            } else {
                                prevCanvasBgImage = null;
                            }
                            canvasBgImage = nextImg;
                            hasCanvasBg = true;
                            bgFadeStartTime = performance.now();
                            drawFrame();
                            resolve();
                        };
                        nextImg.onerror = () => {
                            hasCanvasBg = false;
                            drawFrame();
                            resolve();
                        };
                        nextImg.src = bgUrl;
                    });
                } catch (e) {
                    console.warn("加载难度背景图异常:", e);
                    hasCanvasBg = false;
                }
            } else {
                hasCanvasBg = false;
                prevCanvasBgImage = null;
                canvasBgImage = null;
            }

            // 3. 初始化当前难度的视频与故事板播放状态。资源按需解码，不阻塞音符构建。
            await loadStoryboardPlayback(currentOszZip, bmInfo.storyboard);

            // 4. 构建当前难度的 activeNotes (对齐 std 模式 Slider 的 Tick 连击逻辑：长按过程中持续增加连击数)
            const timingPoints = (bmInfo && bmInfo.timingPoints) ? bmInfo.timingPoints : [];
            const sliderTickRate = (currentBeatmap && currentBeatmap.difficulty && currentBeatmap.difficulty.sliderTickRate > 0)
                ? currentBeatmap.difficulty.sliderTickRate
                : 1;
            const lastObjectTime = (currentBeatmap.hitObjects || []).reduce((maxTime, obj) => {
                const startTime = parseFloat(obj.startTime);
                const endTime = obj.endTime !== undefined && obj.endTime !== null ? parseFloat(obj.endTime) : NaN;
                const objectEndTime = isFinite(endTime) ? endTime : startTime;
                return Math.max(maxTime, isFinite(objectEndTime) ? objectEndTime : 0);
            }, 0);
            currentManiaScrollState = createManiaScrollState(timingPoints, lastObjectTime);

            activeNotes = (currentBeatmap.hitObjects || []).map(obj => {
                const safeKeys = Math.max(1, isFinite(keys) ? (keys | 0) : 4);
                let sx = parseFloat(obj.startX !== undefined ? obj.startX : obj.x);
                if (!isFinite(sx)) sx = 256;
                sx = Math.max(0, Math.min(511.999, sx));

                const column = Math.max(0, Math.min(Math.floor(sx * safeKeys / 512), safeKeys - 1));

                const s = parseFloat(obj.startTime);
                const startTime = isFinite(s) ? s : 0;

                let e = obj.endTime !== undefined && obj.endTime !== null ? parseFloat(obj.endTime) : NaN;
                if (!isFinite(e) || e <= startTime) e = startTime;
                const isHold = (e > startTime);

                // 对齐 std 模式 Slider 的 Tick 连击生成逻辑：
                // 在 std 中 SliderTick 间隔 = beatLength / sliderTickRate。
                // 为确保长按过程中即使是1拍长条也能稳步有节奏地增加连击，至少每半拍细分一个 Tick (Math.max(2, sliderTickRate))
                let ticks = [];
                if (isHold) {
                    const beatLength = getBeatLengthAt(timingPoints, startTime);
                    const effectiveTickRate = Math.max(2, sliderTickRate);
                    const tickInterval = (isFinite(beatLength) && beatLength > 0) ? (beatLength / effectiveTickRate) : 250;
                    if (tickInterval > 10) {
                        let t = startTime + tickInterval;
                        let maxTicks = 200;
                        while (t < e - 10 && maxTicks-- > 0) {
                            ticks.push(t);
                            t += tickInterval;
                        }
                    }
                }

                return {
                    startTime: startTime,
                    endTime: e,
                    scrollPositionStart: getManiaScrollPositionAt(startTime, currentManiaScrollState),
                    scrollPositionEnd: getManiaScrollPositionAt(e, currentManiaScrollState),
                    column: column,
                    isHold: isHold,
                    ticks: ticks,
                    hit: false,
                    holdHeadFrozen: false
                };
            }).sort((a, b) => a.startTime - b.startTime);

            audio.currentTime = 0;
            judgements = [];
            activeExplosions = [];
            cancelAnimationFrame(animationId);

            // 5. 初始化进度条与时间显示
            const totalDurationSec = (audio.duration && isFinite(audio.duration) && audio.duration > 0)
                ? audio.duration
                : (bmInfo.stats.lengthMs / 1000);
            ui.progressRange.max = totalDurationSec > 0 ? totalDurationSec : 100;
            ui.progressRange.value = 0;
            updateTimeLabels(0, totalDurationSec);
            updateProgressFill(0, totalDurationSec);

            // 6. 解锁播放控制器并更新 UI 状态
            ui.playerControls.classList.remove('disabled');
            ui.progressRange.disabled = false;
            ui.playPauseBtn.disabled = false;
            setPlayPauseUi(false);

            // 7. 绘制初始静止预览帧
            drawFrame();
        }
