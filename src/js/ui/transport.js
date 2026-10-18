// ============================================================================
// transport.js - 播放、暂停、进度拖动、音量与倍速控制
// 依赖：core/state.js、render/diagnostics.js
// ============================================================================

        // Chromium 在暂停后恢复播放时，会按音频输出管线延迟把 audio.currentTime
        // 向前对齐一小段。记录暂停时的位置，并在 play 事件中抵消这一次前跳。
        let resumePlaybackPosition = null;

        function rememberResumePlaybackPosition() {
            const position = audio.currentTime;
            resumePlaybackPosition = Number.isFinite(position) && position >= 0 ? position : null;
        }

        function clearResumePlaybackPosition() {
            resumePlaybackPosition = null;
        }

        function getPlaybackTimeSeconds() {
            if (isPlaying && resumePlaybackPosition !== null) {
                return resumePlaybackPosition;
            }
            return audio.currentTime;
        }

        audio.addEventListener('play', () => {
            if (resumePlaybackPosition === null || !Number.isFinite(audio.currentTime)) return;

            const position = resumePlaybackPosition;
            resumePlaybackPosition = null;
            if (audio.currentTime > position + 0.005) {
                try {
                    audio.currentTime = position;
                } catch (_) {}
            }
        });

        function playAudioAndBeatmap() {
            if (!currentBeatmap) return;
            if (typeof canPlayWithStartupSelection === 'function' && !canPlayWithStartupSelection()) {
                return;
            }
            cancelAnimationFrame(animationId);
            animationId = null;

            // 状态立即更新为播放中，画面循环立即启动，确保拖拽后无论 Promise 状态如何均能立刻开始播放
            isPlaying = true;

            // 播放开始时：若当前选中了 note/长条相关元素，自动取消选中
            if (selectedCanvasElement && (selectedCanvasElement.id.startsWith('note_') || selectedCanvasElement.id.startsWith('hold_'))) {
                selectedCanvasElement = null;
                const card = document.getElementById('canvasSelectedCard');
                if (card) card.style.display = 'none';
            }

            setPlayPauseUi(true);
            animationId = requestAnimationFrame(drawFrame);
            resumeStoryboardPlayback();

            try {
                const p = audio.play();
                if (p && typeof p.then === 'function') {
                    p.catch(err => {
                        console.warn("音频播放反馈:", err.name, err.message);
                        if (err.name === 'NotAllowedError') {
                            isPlaying = false;
                            pauseStoryboardPlayback();
                            setPlayPauseUi(false);
                            cancelAnimationFrame(animationId);
                            animationId = null;
                            drawFrame();
                        }
                    });
                }
            } catch (e) {
                console.warn("音频播放异常:", e);
            }
        }

        function pauseAudioAndBeatmap() {
            try { audio.pause(); } catch (_) {}
            rememberResumePlaybackPosition();
            isPlaying = false;
            pauseStoryboardPlayback();
            playbackBreakResumeTime = 0;
            setPlayPauseUi(false);
            cancelAnimationFrame(animationId);
            animationId = null;
            drawFrame();
        }

        function togglePlayPause() {
            if (isPlaying) {
                pauseAudioAndBeatmap();
            } else {
                playAudioAndBeatmap();
            }
        }

        function setPlayPauseUi(playing) {
            if (!ui.playPauseBtn) return;
            if (playing) {
                ui.playPauseBtn.classList.add('playing');
                ui.playPauseBtn.title = "暂停 (空格键)";
            } else {
                ui.playPauseBtn.classList.remove('playing');
                ui.playPauseBtn.title = "播放 (空格键)";
            }
        }

        // 播放/暂停按钮
        if (ui.playPauseBtn) {
            ui.playPauseBtn.addEventListener('click', togglePlayPause);
        }

        // 进度条拖动与 Seek
        let isSeeking = false;
        let seekRafId = null;

        function startSeeking() {
            if (!currentBeatmap) return;
            if (typeof canPlayWithStartupSelection === 'function' && !canPlayWithStartupSelection()) return;
            clearResumePlaybackPosition();
            isSeeking = true;
        }

        function stopSeeking() {
            if (!isSeeking) return;
            clearResumePlaybackPosition();
            isSeeking = false;
            if (seekRafId) {
                cancelAnimationFrame(seekRafId);
                seekRafId = null;
            }
            if (!currentBeatmap) return;

            const targetTime = parseFloat(ui.progressRange.value);
            try {
                audio.currentTime = targetTime;
            } catch (_) {}
            syncNotesStateWithTime(targetTime * 1000);

            // 拖动到哪里就直接在哪个位置开始播放
            playAudioAndBeatmap();
        }

        if (ui.progressRange) {
            ui.progressRange.addEventListener('pointerdown', startSeeking);
            ui.progressRange.addEventListener('mousedown', startSeeking);
            ui.progressRange.addEventListener('touchstart', startSeeking, { passive: true });

            ui.progressRange.addEventListener('input', () => {
                if (!currentBeatmap) return;
                clearResumePlaybackPosition();
                isSeeking = true;
                const targetTime = parseFloat(ui.progressRange.value);
                const targetTimeMs = targetTime * 1000;

                const totalDuration = (audio.duration && isFinite(audio.duration) && audio.duration > 0)
                    ? audio.duration
                    : parseFloat(ui.progressRange.max) || 0;
                updateTimeLabels(targetTime, totalDuration);
                updateProgressFill(targetTime, totalDuration);
                syncNotesStateWithTime(targetTimeMs);

                // 使用 requestAnimationFrame 保证拖拽画面 60fps 实时流畅同步，避免密集设置 audio.currentTime 导致解码器卡顿
                if (seekRafId) cancelAnimationFrame(seekRafId);
                seekRafId = requestAnimationFrame(() => {
                    try {
                        audio.currentTime = targetTime;
                    } catch (_) {}
                    drawFrame();
                    seekRafId = null;
                });
            });

            ui.progressRange.addEventListener('change', stopSeeking);
            window.addEventListener('pointerup', stopSeeking);
            window.addEventListener('mouseup', stopSeeking);
            window.addEventListener('touchend', stopSeeking);
        }

        // 音量调节
        audio.volume = 0.8;
        updateVolumeFill(0.8);
        if (ui.volumeRange) {
            ui.volumeRange.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value);
                audio.volume = vol;
                audio.muted = (vol === 0);
                updateVolumeUi(vol, audio.muted);
            });
        }

        let lastNonZeroVolume = 0.8;
        if (ui.volumeMuteBtn) {
            ui.volumeMuteBtn.addEventListener('click', () => {
                if (audio.muted || audio.volume === 0) {
                    audio.muted = false;
                    audio.volume = lastNonZeroVolume > 0 ? lastNonZeroVolume : 0.8;
                    if (ui.volumeRange) ui.volumeRange.value = audio.volume;
                } else {
                    lastNonZeroVolume = audio.volume;
                    audio.muted = true;
                    audio.volume = 0;
                    if (ui.volumeRange) ui.volumeRange.value = 0;
                }
                updateVolumeUi(audio.volume, audio.muted);
            });
        }

        function updateVolumeUi(vol, isMuted) {
            if (ui.volumeText) {
                const pct = Math.round(vol * 100);
                ui.volumeText.innerText = `${pct}%`;
            }
            if (ui.volumeMuteBtn) {
                if (isMuted || vol === 0) {
                    ui.volumeMuteBtn.classList.add('muted');
                } else {
                    ui.volumeMuteBtn.classList.remove('muted');
                }
            }
            updateVolumeFill(isMuted ? 0 : vol);
        }

        // 音频元数据就绪与播放结束
        audio.onloadedmetadata = () => {
            if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
                if (ui.progressRange) ui.progressRange.max = audio.duration;
                updateTimeLabels(audio.currentTime, audio.duration);
            }
        };

        audio.onended = () => {
            clearResumePlaybackPosition();
            isPlaying = false;
            resetStoryboardPlayback();
            setPlayPauseUi(false);
            audio.currentTime = 0;
            if (ui.progressRange) ui.progressRange.value = 0;
            const totalSec = (audio.duration && isFinite(audio.duration) && audio.duration > 0)
                ? audio.duration
                : parseFloat(ui.progressRange.max) || 0;
            updateTimeLabels(0, totalSec);
            updateProgressFill(0, totalSec);
            syncNotesStateWithTime(0);
            drawFrame();
        };
