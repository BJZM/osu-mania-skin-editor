// ============================================================================
// feedback.js - 加载遮罩、通知 Toast、时间与滑条状态反馈
// 依赖：core/state.js、render/frame.js
// ============================================================================

        function setPreviewJudgementActive(active) {
            isPreviewJudgementActive = active;
            judgementPreviewIndex = 0;
            previewBreakResumeTime = 0;
            playbackBreakResumeTime = 0;
            lastPreviewTickTime = 0;
            const toggle = document.getElementById('previewJudgementToggle');
            if (toggle) toggle.checked = active;
            const cardBtn = document.getElementById('cardPreviewJudgementBtn');
            if (cardBtn) {
                cardBtn.classList.toggle('active', active);
                const span = cardBtn.querySelector('span');
                if (span) span.textContent = active ? '停止演示' : '演示判定';
            }
            if (active) {
                if (!currentBeatmap) {
                    previewSimCombo = 100;
                }
                showToast('已开启判定演示', '大部分为 300MAX 与 300，穿插 200/100/50，并在 Miss 时展示断连动画后恢复');
            } else {
                judgements = [];
                showToast('已关闭判定演示', '恢复常规判定显示');
            }
            drawFrame();
        }

        // 统一控制加载遮罩
        function showProgress(title) {
            // 加载谱面或皮肤时，直接暂停播放并禁用进度条与控制器
            if (isPlaying) {
                pauseAudioAndBeatmap();
            }
            if (ui.playerControls) {
                ui.playerControls.classList.add('disabled');
            }
            if (ui.progressRange) {
                ui.progressRange.disabled = true;
            }
            if (ui.playPauseBtn) {
                ui.playPauseBtn.disabled = true;
            }

            ui.loadingTitle.innerText = title;
            ui.loadingPercent.innerText = '0%';
            ui.progressBarFill.style.width = '0%';
            ui.loadingFileText.innerText = '正在初始化...';
            canvas.classList.add('blurred');
            ui.loadingOverlay.classList.add('active');
        }

        function updateProgress(current, total, filename) {
            const percent = Math.min(100, Math.round((current / total) * 100));
            ui.loadingPercent.innerText = `${percent}%`;
            ui.progressBarFill.style.width = `${percent}%`;
            ui.loadingFileText.innerText = filename || '';
        }

        function hideProgress() {
            canvas.classList.remove('blurred');
            ui.loadingOverlay.classList.remove('active');
            if (currentBeatmap && ui.playerControls) {
                ui.playerControls.classList.remove('disabled');
                if (ui.progressRange) ui.progressRange.disabled = false;
                if (ui.playPauseBtn) ui.playPauseBtn.disabled = false;
            }
            // 遮罩关闭后立即刷新画布，展示最新贴图
            drawFrame();
        }

        // 现代化紧凑 osu! 风格通知弹窗
        function showToast(title, message, duration = 3800, manualClose = false) {
            const toast = document.createElement('div');
            toast.className = 'toast';

            // 根据提示类型定制图标和边框色彩 (如错误/警告/成功)
            let iconSvg = '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>';
            if (title.includes('错误') || title.includes('失败')) {
                toast.classList.add('error');
                iconSvg = '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>';
            } else if (title.includes('成功')) {
                toast.classList.add('success');
                iconSvg = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
            }

            const closeBtnHtml = manualClose
                ? `<button class="toast-close-btn" title="关闭" aria-label="关闭">&times;</button>`
                : '';

            toast.innerHTML = `
                <div class="toast-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
                    <span>${title}</span>
                    ${closeBtnHtml}
                </div>
                <div class="toast-msg">${message}</div>
            `;
            if (ui.toastContainer) {
                ui.toastContainer.appendChild(toast);
            }

            const dismiss = () => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            };

            if (manualClose) {
                const btn = toast.querySelector('.toast-close-btn');
                if (btn) btn.addEventListener('click', dismiss);
            } else if (duration > 0) {
                setTimeout(dismiss, duration);
            }

            requestAnimationFrame(() => toast.classList.add('show'));
            return toast;
        }

        // 轨道区超宽提示（节流，避免画布拖拽 / 连续微调时刷屏）
        let lastTrackLimitToastAt = 0;
        // blocked = true：本次调整已被阻止（钳制 / 不采纳）；false：仅提醒，调整已生效
        function notifyTrackWidthLimit(scopeLabel, detail, blocked = true) {
            const now = Date.now();
            if (now - lastTrackLimitToastAt < 1500) return;
            lastTrackLimitToastAt = now;
            showToast(
                '已达轨道总宽度上限',
                (scopeLabel || '轨道区') + ' 的总宽度不能超过「画布可用宽度 − ColumnStart」' +
                '（画布可用宽度 = 480 × 屏宽 / 屏高，480p 虚拟像素；16:9 约 853.3、4:3 为 640）。' +
                (detail ? detail + '。' : '') +
                (blocked
                    ? '继续增大将超过该限制，会导致轨道宽度发生渲染问题，因此本次调整已被阻止。'
                    : '这会导致轨道宽度发生渲染问题，请调小列宽 / 列间距，或把 ColumnStart 往左移。'),
                5600
            );
        }

