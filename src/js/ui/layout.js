// ============================================================================
// layout.js - 侧边栏宽度、谱面统计与难度下拉布局
// 依赖：core/state.js、parser/beatmap-load.js
// ============================================================================

        function updateTimeLabels(curSec, totalSec) {
            const current = (curSec && isFinite(curSec) && curSec >= 0) ? curSec : 0;
            const total = (totalSec && isFinite(totalSec) && totalSec >= 0) ? totalSec : 0;
            if (ui.currentTimeText) {
                ui.currentTimeText.innerText = formatPlayerTime(current);
            }
            if (ui.remainTimeText) {
                const remain = Math.max(0, total - current);
                ui.remainTimeText.innerText = `-${formatPlayerTime(remain)}`;
            }
        }

        function updateProgressFill(current, total) {
            if (!ui.progressRange) return;
            const max = (total && isFinite(total) && total > 0) ? total : (parseFloat(ui.progressRange.max) || 100);
            const val = (current && isFinite(current)) ? current : (parseFloat(ui.progressRange.value) || 0);
            const percent = max > 0 ? Math.min(100, Math.max(0, (val / max) * 100)) : 0;
            const grad = `linear-gradient(to right, #ff66aa 0%, #ff66aa ${percent}%, rgba(255, 255, 255, 0.2) ${percent}%, rgba(255, 255, 255, 0.2) 100%)`;
            ui.progressRange.style.setProperty('--slider-pct', `${percent}%`);
            ui.progressRange.style.setProperty('background', grad, 'important');
        }

        function updateVolumeFill(vol, targetRange = ui.volumeRange) {
            if (!targetRange) return;
            const percent = Math.min(100, Math.max(0, (vol || 0) * 100));
            const grad = `linear-gradient(to right, #ff66aa 0%, #ff66aa ${percent}%, rgba(255, 255, 255, 0.2) ${percent}%, rgba(255, 255, 255, 0.2) 100%)`;
            targetRange.style.setProperty('--slider-pct', `${percent}%`);
            targetRange.style.setProperty('background', grad, 'important');
        }

        function updateSpeedFill(val) {
            if (!ui.speedRange) return;
            const min = parseFloat(ui.speedRange.min) || 1;
            const max = parseFloat(ui.speedRange.max) || 40;
            const percent = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
            const grad = `linear-gradient(to right, #ff66aa 0%, #ff66aa ${percent}%, rgba(255, 255, 255, 0.2) ${percent}%, rgba(255, 255, 255, 0.2) 100%)`;
            ui.speedRange.style.setProperty('--slider-pct', `${percent}%`);
            ui.speedRange.style.setProperty('background', grad, 'important');
            ui.speedRange.style.background = grad;
        }

        function updateDimFill(val) {
            if (!ui.dimRange) return;
            const min = parseFloat(ui.dimRange.min) || 0;
            const max = parseFloat(ui.dimRange.max) || 100;
            const percent = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
            const grad = `linear-gradient(to right, #ff66aa 0%, #ff66aa ${percent}%, rgba(255, 255, 255, 0.2) ${percent}%, rgba(255, 255, 255, 0.2) 100%)`;
            ui.dimRange.style.setProperty('--slider-pct', `${percent}%`);
            ui.dimRange.style.setProperty('background', grad, 'important');
            ui.dimRange.style.background = grad;
        }

        updateProgressFill(0, 100);
        updateVolumeFill(musicVolume);
        updateVolumeFill(effectVolume, ui.effectsVolumeRange);

        if (ui.speedRange) {
            ui.speedRange.addEventListener('input', (e) => {
                scrollSpeed = Math.max(1, Math.min(40, Math.round(parseFloat(e.target.value)) || 1));
                if (ui.speedText) ui.speedText.innerText = String(scrollSpeed);
                updateSpeedFill(scrollSpeed);
                drawFrame();
            });
            if (ui.speedRange.value !== String(scrollSpeed)) {
                ui.speedRange.value = scrollSpeed;
            }
            if (ui.speedText) ui.speedText.innerText = String(scrollSpeed);
            updateSpeedFill(scrollSpeed);
        }

        if (ui.dimRange) {
            ui.dimRange.addEventListener('input', (e) => {
                bgDim = parseInt(e.target.value, 10) || 0;
                if (ui.dimText) ui.dimText.innerText = `${bgDim}%`;
                if (ui.bg) {
                    const pageDimAlpha = Math.max(0.02, 1 - (bgDim / 100) * 0.95).toFixed(2);
                    ui.bg.style.filter = `blur(5px) brightness(${pageDimAlpha})`;
                }
                updateDimFill(bgDim);
                drawFrame();
            });
            updateDimFill(bgDim);
            if (ui.bg) {
                const pageDimAlpha = Math.max(0.02, 1 - (bgDim / 100) * 0.95).toFixed(2);
                ui.bg.style.filter = `blur(5px) brightness(${pageDimAlpha})`;
            }
        }

        // =========================================================================
        // 侧边栏宽度可拖动调节与谱面信息自适应逻辑 (Resizable & Auto-fitting Sidebar)
        // 1. 默认宽度 350px，进入网页即为该宽度；
        // 2. 最小宽度由谱面信息那一栏决定，是保证所有信息不发生换行的最小值；
        // 3. 切换谱面时与默认宽度 (350px) 对比：若默认宽度不换行则保持 350px，若换行则自动扩展到不换行的最小宽度；
        // 4. 所有变换通过 CSS 过渡动画呈现；手动拖拽时禁用过渡以保证即时响应。
        // =========================================================================
        const sidebarEl = document.querySelector('.sidebar');
        const resizerEl = ui.sidebarResizer || document.getElementById('sidebarResizer');
        const DEFAULT_SIDEBAR_WIDTH = 350;
        const BASE_MIN_SIDEBAR_WIDTH = 260;

        function calculateStatsMinSidebarWidth() {
            const panel = document.getElementById('statsPanel');
            const sidebar = sidebarEl || document.querySelector('.sidebar');
            if (!panel || !sidebar) return DEFAULT_SIDEBAR_WIDTH;

            const rows = panel.querySelectorAll('p');
            let maxContentWidth = 0;

            rows.forEach((p) => {
                const label = p.querySelector('.stat-label');
                const val = p.querySelector('.stats-value');
                if (label && val) {
                    const rowW = label.scrollWidth + val.scrollWidth + 18; // 18px 留白间距
                    if (rowW > maxContentWidth) maxContentWidth = rowW;
                } else {
                    if (p.scrollWidth > maxContentWidth) maxContentWidth = p.scrollWidth;
                }
            });

            const panelStyle = window.getComputedStyle(panel);
            const sidebarStyle = window.getComputedStyle(sidebar);

            const panelHSpace = (parseFloat(panelStyle.paddingLeft) || 15) + (parseFloat(panelStyle.paddingRight) || 15)
                + (parseFloat(panelStyle.borderLeftWidth) || 0) + (parseFloat(panelStyle.borderRightWidth) || 0);

            const sidebarHSpace = (parseFloat(sidebarStyle.paddingLeft) || 25) + (parseFloat(sidebarStyle.paddingRight) || 25)
                + (parseFloat(sidebarStyle.borderLeftWidth) || 0) + (parseFloat(sidebarStyle.borderRightWidth) || 1);

            // 预留垂直滚动条宽度 (7px) 及防抖容差 (13px)
            const scrollbarBuffer = 20;

            const totalMinNeeded = Math.ceil(maxContentWidth + panelHSpace + sidebarHSpace + scrollbarBuffer);
            return Math.max(BASE_MIN_SIDEBAR_WIDTH, totalMinNeeded);
        }

        function adjustSidebarWidthForStats() {
            if (!sidebarEl) return;
            const minNeeded = calculateStatsMinSidebarWidth();

            // 设定最小宽度：由谱面信息决定，是保证所有信息不发生换行的最小值
            sidebarEl.style.minWidth = `${minNeeded}px`;

            // 规则：
            // 如果默认宽度的情况下不用换行就采用默认宽度；如果还需要换行那么就按切换后的信息不发生换行的最小宽度调整宽度
            const targetWidth = Math.max(DEFAULT_SIDEBAR_WIDTH, minNeeded);
            sidebarEl.style.width = `${targetWidth}px`;
        }

        if (sidebarEl && resizerEl) {
            // 进入网页时立即设为默认 350px 宽度
            sidebarEl.style.width = `${DEFAULT_SIDEBAR_WIDTH}px`;
            sidebarEl.style.minWidth = `${BASE_MIN_SIDEBAR_WIDTH}px`;

            let isResizing = false;
            let startMouseX = 0;
            let startSidebarW = 0;

            const onStartResize = (clientX) => {
                isResizing = true;
                startMouseX = clientX;
                startSidebarW = sidebarEl.getBoundingClientRect().width;
                sidebarEl.classList.add('resizing');
                resizerEl.classList.add('active');
                document.body.classList.add('resizing-sidebar');
            };

            const onMoveResize = (clientX) => {
                if (!isResizing) return;
                const deltaX = clientX - startMouseX;
                const minAllowed = parseFloat(sidebarEl.style.minWidth) || BASE_MIN_SIDEBAR_WIDTH;
                const maxW = Math.min(850, Math.floor(window.innerWidth * 0.65));
                const newWidth = Math.max(minAllowed, Math.min(maxW, Math.round(startSidebarW + deltaX)));
                sidebarEl.style.width = `${newWidth}px`;
            };

            const onEndResize = () => {
                if (!isResizing) return;
                isResizing = false;
                sidebarEl.classList.remove('resizing');
                resizerEl.classList.remove('active');
                document.body.classList.remove('resizing-sidebar');
            };

            resizerEl.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                onStartResize(e.clientX);
                e.preventDefault();
            });

            window.addEventListener('mousemove', (e) => {
                onMoveResize(e.clientX);
            });

            window.addEventListener('mouseup', () => {
                onEndResize();
            });

            // 触屏滑动适配
            resizerEl.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                onStartResize(e.touches[0].clientX);
            }, { passive: true });

            window.addEventListener('touchmove', (e) => {
                if (!isResizing || e.touches.length !== 1) return;
                onMoveResize(e.touches[0].clientX);
            }, { passive: true });

            window.addEventListener('touchend', () => {
                onEndResize();
            });

            // 双击拖拽手柄条：重置为当前状态下不换行的理想自适应宽度
            resizerEl.addEventListener('dblclick', () => {
                adjustSidebarWidthForStats();
            });
        }
        function updateStatsDisplay() {
            if (beatmaps.length === 0 || ui.diff.value === '') return;
            const bm = beatmaps[ui.diff.value];
            if (!bm) return;
            ui.stats.diff.innerText = bm.data.metadata.version;
            ui.stats.diff.title = bm.data.metadata.version;
            if (ui.stats.diff.parentElement) {
                ui.stats.diff.parentElement.title = window.I18n.t(
                    '难度版本: {version}',
                    { version: bm.data.metadata.version }
                );
            }
            ui.stats.keys.innerText = bm.stats.keys + 'K';
            ui.stats.notes.innerText = bm.stats.notes;
            ui.stats.holds.innerText = bm.stats.holds;
            const secs = Math.floor(bm.stats.lengthMs / 1000);
            ui.stats.time.innerText = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

            // 左侧资源信息吸附面板联动更新谱面与难度信息
            const meta = (bm.data && bm.data.metadata) ? bm.data.metadata : {};
            const titleEl = document.getElementById('infoBeatmapTitle');
            const artistEl = document.getElementById('infoBeatmapArtist');
            const mapperEl = document.getElementById('infoBeatmapMapper');

            const title = meta.titleUnicode || meta.title || '未知曲目';
            const artist = meta.artistUnicode || meta.artist || '未知艺术家';
            const creator = meta.creator || '';

            if (titleEl) {
                titleEl.setAttribute('data-i18n-ignore', '');
                titleEl.textContent = title;
                titleEl.title = title;
            }
            if (artistEl) {
                artistEl.setAttribute('data-i18n-ignore', '');
                artistEl.textContent = artist;
                artistEl.title = artist;
            }
            if (mapperEl) {
                const mapperText = creator
                    ? window.I18n.t('谱师: {creator}', { creator })
                    : '';
                mapperEl.textContent = mapperText;
                mapperEl.title = mapperText;
            }

            // 根据谱面信息自动平滑调整菜单栏宽度，确保每一项都不发生换行
            requestAnimationFrame(() => {
                adjustSidebarWidthForStats();
            });
        }

        function syncDifficultySelectorAvailability() {
            const enabled = Array.isArray(beatmaps) && beatmaps.length > 0;
            if (ui.diff) {
                ui.diff.disabled = !enabled;
            }
            if (ui.diffBtn) {
                ui.diffBtn.disabled = !enabled;
                ui.diffBtn.setAttribute('aria-disabled', String(!enabled));
            }
        }

        // 渲染与导出皮肤相同样式的顶部谱面难度下拉列表
        function renderDiffDropdownMenu() {
            syncDifficultySelectorAvailability();
            if (!ui.diffMenu) return;
            ui.diffMenu.innerHTML = '';

            if (!beatmaps || beatmaps.length === 0) {
                if (ui.diffLabel) ui.diffLabel.textContent = '选择难度 ▾';
                const emptyItem = document.createElement('div');
                emptyItem.className = 'dropdown-item empty';
                emptyItem.style.cssText = 'color: rgba(255, 255, 255, 0.45); cursor: default; justify-content: center; padding: 10px; font-size: 0.78rem;';
                emptyItem.textContent = '等待导入谱面 (.osz)...';
                ui.diffMenu.appendChild(emptyItem);
                return;
            }

            const currentIdx = parseInt(ui.diff.value, 10) || 0;
            const currentBm = beatmaps[currentIdx] || beatmaps[0];
            if (ui.diffLabel && currentBm && currentBm.data && currentBm.data.metadata) {
                ui.diffLabel.textContent = `[${currentBm.data.metadata.version}] (${currentBm.stats.keys}K) ▾`;
            }

            beatmaps.forEach((bm, idx) => {
                const itemBtn = document.createElement('button');
                itemBtn.type = 'button';
                itemBtn.className = `dropdown-item${idx === currentIdx ? ' active' : ''}`;

                const iconSpan = document.createElement('span');
                iconSpan.className = 'icon';
                const badge = document.createElement('span');
                badge.className = 'diff-badge-icon';
                badge.textContent = `${bm.stats.keys}K`;
                iconSpan.appendChild(badge);

                const itemText = document.createElement('div');
                itemText.className = 'item-text';

                const title = document.createElement('span');
                title.className = 'title';
                title.setAttribute('data-i18n-ignore', '');
                title.textContent = (bm.data && bm.data.metadata && bm.data.metadata.version) ? bm.data.metadata.version : `难度 ${idx + 1}`;

                const desc = document.createElement('span');
                desc.className = 'desc';
                const durationSec = Math.round((bm.stats.lengthMs || 0) / 1000);
                const m = Math.floor(durationSec / 60);
                const s = durationSec % 60;
                const durStr = `${m}:${s < 10 ? '0' : ''}${s}`;
                desc.textContent = `${bm.stats.keys} 键 | 音符: ${bm.stats.notes || 0} | 长条: ${bm.stats.holds || 0} | 时长: ${durStr}`;

                itemText.appendChild(title);
                itemText.appendChild(desc);

                itemBtn.appendChild(iconSpan);
                itemBtn.appendChild(itemText);

                itemBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (ui.diffDropdown) ui.diffDropdown.classList.remove('open');
                    if (ui.diff.value != idx) {
                        ui.diff.value = idx;
                        await loadBeatmapDifficulty(idx);
                        renderDiffDropdownMenu();
                    }
                };

                ui.diffMenu.appendChild(itemBtn);
            });
        }
