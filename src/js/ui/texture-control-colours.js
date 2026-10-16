// ============================================================================
// texture-control-colours.js - 逐轨颜色管理器
// 从 texture-controls.js 按职责拆分。
// ============================================================================

        function buildPerTrackColourManager(cfg, keys, opts) {
            const arrKey = opts.arrKey;
            const defaultColour = opts.defaultColour || { r: 0, g: 0, b: 0, a: 255 };
            const what = opts.what || '颜色';

            const wrapper = document.createElement('div');
            wrapper.className = 'column-colour-manager-wrapper';

            if (!Array.isArray(cfg[arrKey])) cfg[arrKey] = new Array(keys);
            while (cfg[arrKey].length < keys) cfg[arrKey].push({ ...defaultColour });

            const toHex = (c) => `#${((1 << 24) + (c.r << 16) + (c.g << 8) + c.b).toString(16).slice(1)}`;
            const readHex = (picker) => {
                const hex = picker.value;
                return {
                    r: parseInt(hex.slice(1, 3), 16),
                    g: parseInt(hex.slice(3, 5), 16),
                    b: parseInt(hex.slice(5, 7), 16)
                };
            };
            const pctOf = (a) => Math.max(0, Math.min(100, Math.round(a / 255 * 100)));

            // ---- 1. 全轨统一快速设置条 ----
            const unifiedBar = document.createElement('div');
            unifiedBar.className = 'col-colour-unified-bar';
            unifiedBar.innerHTML = `
                <div class="col-colour-unified-label">
                    <span class="unified-title">${opts.unifiedTitle}</span>
                </div>
            `;

            const unifiedControls = document.createElement('div');
            unifiedControls.className = 'col-colour-unified-controls';

            const refCol = cfg[arrKey][0] || defaultColour;

            const uPicker = document.createElement('input');
            uPicker.type = 'color';
            uPicker.className = 'col-colour-picker';
            uPicker.value = toHex(refCol);

            const uAlpha = document.createElement('input');
            uAlpha.type = 'range';
            uAlpha.min = 0;
            uAlpha.max = 255;
            uAlpha.step = 1;
            uAlpha.value = (refCol.a != null) ? refCol.a : 255;
            uAlpha.className = 'col-colour-slider';
            uAlpha.style.setProperty('--slider-pct', pctOf(parseInt(uAlpha.value, 10)) + '%');

            const uVal = document.createElement('span');
            uVal.className = 'col-colour-val';
            // alpha = 0 是否会被游戏强制改成「不透明」（仅 ColourLight 如此，见 renderer.js 的
            // effectiveLightA 与 lazer 的 LegacyColourCompatibility.DisallowZeroAlpha）。
            // 轨道底色 / 小节线等其它颜色的 alpha=0 就是「透明」，不受此规则影响。
            const a0hint = !!opts.alphaZeroForcedOpaque;

            const updateUVal = (a) => {
                uVal.textContent = (a0hint && a === 0)
                    ? '透明度: 0 —— 游戏内会被强制为不透明'
                    : `透明度: ${a} (${pctOf(a)}%)`;
                uAlpha.style.setProperty('--slider-pct', pctOf(a) + '%');
            };
            updateUVal(parseInt(uAlpha.value, 10));

            const applyAllBtn = document.createElement('button');
            applyAllBtn.type = 'button';
            applyAllBtn.className = 'col-colour-apply-btn';
            applyAllBtn.textContent = '应用到全轨';

            const writeAll = (r, g, b, a) => {
                for (let i = 0; i < keys; i++) cfg[arrKey][i] = { r, g, b, a };
            };

            applyAllBtn.onclick = () => {
                recordSkinUndoBeforeChange(`统一全轨${what}`);
                const c = readHex(uPicker);
                const a = parseInt(uAlpha.value, 10);
                writeAll(c.r, c.g, c.b, a);
                continuousActionActive = false;
                drawFrame();
                renderSkinEditorParams();
                showToast(`已更新全轨${what}`, `RGBA(${c.r}, ${c.g}, ${c.b}, ${a})`);
            };

            uAlpha.oninput = () => {
                recordSkinUndoBeforeChange(`调整全轨${what}透明度`);
                const a = parseInt(uAlpha.value, 10);
                updateUVal(a);
                const c = readHex(uPicker);
                writeAll(c.r, c.g, c.b, a);
                drawFrame();
            };

            uPicker.oninput = () => {
                recordSkinUndoBeforeChange(`调整全轨${what}`);
                const c = readHex(uPicker);
                writeAll(c.r, c.g, c.b, parseInt(uAlpha.value, 10));
                drawFrame();
            };

            unifiedControls.appendChild(uPicker);
            unifiedControls.appendChild(uAlpha);
            unifiedControls.appendChild(uVal);
            unifiedControls.appendChild(applyAllBtn);

            if (opts.withPreview) {
                const previewBtn = document.createElement('button');
                previewBtn.type = 'button';
                previewBtn.className = 'col-colour-preview-btn';
                previewBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <span>预览发光</span>
                `;
                // 按键发光只在「按住」期间可见，没有这个开关就无法在编辑器里直接看到改色效果。
                // 点击后由 renderer 的 stageLightPreviewActive 强制所有轨道视为按下。
                previewBtn.onclick = () => {
                    testLightUntil = performance.now() + 2500;
                    drawFrame();
                };
                unifiedControls.appendChild(previewBtn);
            }

            unifiedBar.appendChild(unifiedControls);
            wrapper.appendChild(unifiedBar);

            // ---- 2. 各轨道独立调节卡片网格 ----
            const tracksGrid = document.createElement('div');
            tracksGrid.className = 'col-colour-tracks-grid';

            for (let col = 0; col < keys; col++) {
                const cItem = cfg[arrKey][col] || defaultColour;
                const colCard = document.createElement('div');
                colCard.className = 'col-colour-track-card';
                colCard.innerHTML = `
                    <div class="col-colour-card-header">
                        <span class="col-track-badge">第 ${col + 1} 轨</span>
                        <span class="col-ini-key">${opts.iniPrefix}${col + 1}</span>
                    </div>
                `;

                const body = document.createElement('div');
                body.className = 'col-colour-card-body';

                const itemPicker = document.createElement('input');
                itemPicker.type = 'color';
                itemPicker.className = 'col-colour-picker mini';
                itemPicker.value = toHex(cItem);

                const itemSlider = document.createElement('input');
                itemSlider.type = 'range';
                itemSlider.min = 0;
                itemSlider.max = 255;
                itemSlider.step = 1;
                const initA = (cItem.a != null) ? cItem.a : 255;
                itemSlider.value = initA;
                itemSlider.className = 'col-colour-slider mini';
                itemSlider.style.setProperty('--slider-pct', pctOf(initA) + '%');

                const itemVal = document.createElement('span');
                itemVal.className = 'col-colour-val mini';
                itemVal.textContent = `${initA}`;

                const updateSingle = () => {
                    recordSkinUndoBeforeChange(`调整第 ${col + 1} 轨${what}`);
                    const c = readHex(itemPicker);
                    const a = parseInt(itemSlider.value, 10);
                    if (a0hint && a === 0) {
                        itemVal.textContent = '0 · 强制不透明';
                        itemVal.title = 'alpha = 0 会被 osu! 强制为不透明，发光不会消失（想隐藏发光请把 StageLight 贴图设为 blank）';
                    } else {
                        itemVal.textContent = `${a}`;
                        itemVal.title = '';
                    }
                    itemSlider.style.setProperty('--slider-pct', pctOf(a) + '%');
                    cfg[arrKey][col] = { r: c.r, g: c.g, b: c.b, a: a };
                    drawFrame();
                };

                itemPicker.oninput = updateSingle;
                itemSlider.oninput = updateSingle;

                body.appendChild(itemPicker);
                body.appendChild(itemSlider);
                body.appendChild(itemVal);
                colCard.appendChild(body);
                tracksGrid.appendChild(colCard);
            }

            wrapper.appendChild(tracksGrid);
            return wrapper;
        }

        // 展开某个元素所在的分类块（focusParameter 定位参数时用：目标若在折叠分类里会看不见）
