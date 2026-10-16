// ============================================================================
// texture-control-track-group.js - 逐轨贴图参数分组
// 从 texture-controls.js 按职责拆分。
// ============================================================================

        function buildPerTrackTextureGroup(unit, keys) {
            const first = unit.items[0];

            const group = document.createElement('div');
            // 复用 .param-card 的外观 (无边框轻拟物悬浮卡片)，仅额外独占整行宽度，保证与其他选项框风格一致
            group.className = 'param-card per-track-texture-group';
            // 分组框本身沿用通用键 id (如 param-card-NoteImage)，供 focusParameter 的兜底高亮使用
            group.id = `param-card-${unit.groupKey}`;

            const header = document.createElement('div');
            header.className = 'param-card-header';
            header.innerHTML = `
                <div class="param-names">
                    <span class="param-zh-name">${unit.groupName}</span>
                    ${unit.desc ? `
                        <span class="param-info-trigger" tabindex="0">
                            <span class="param-info-icon">ⓘ</span>
                            <div class="param-desc-tooltip">${unit.desc}</div>
                        </span>
                    ` : ''}
                    <span class="param-en-name">${unit.groupEnName || unit.groupKey}</span>
                </div>
                <span class="per-track-count-badge">${unit.items.length} 轨</span>
            `;
            group.appendChild(header);

            const rows = document.createElement('div');
            rows.className = 'per-track-texture-rows';

            for (const p of unit.items) {
                const row = document.createElement('div');
                row.className = 'per-track-texture-row';
                // 每轨一行同样以真实 ini 键作为 id，画布定位高亮可直接命中单轨
                row.id = `param-card-${p.key}`;

                const label = document.createElement('span');
                label.className = 'per-track-label';
                label.textContent = `第 ${(p._trackCol != null ? p._trackCol : 0) + 1} 轨`;
                row.appendChild(label);

                row.appendChild(buildTextureParamControl(p, keys, group));

                if (p.elementId) {
                    const locateBtn = document.createElement('button');
                    locateBtn.type = 'button';
                    locateBtn.className = 'param-action-btn locate';
                    locateBtn.title = '在画布上框选此元素';
                    locateBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
                    locateBtn.onclick = () => {
                        const target = canvasInteractiveElements.find(i => i.id === p.elementId) ||
                            canvasInteractiveElements.find(i => i.paramKey === p.key);
                        if (target) {
                            selectedCanvasElement = target;
                            selectionAnimStartTime = performance.now();
                            syncCanvasSelectedCard(target);
                            drawFrame();
                            return;
                        }
                        // 打击特效元素只在「特效真的出现在画布上」时才登记为可点选，
                        // 当前没出现时给出明确说明，而不是让按钮静默失效。
                        if (p._trackLookup === LML.ExplosionImage || p._trackLookup === LML.HoldNoteLightImage) {
                            showToast('该打击特效此刻未出现',
                                '单键 / 长条打击特效只有在播放到命中那一刻才会出现在画布上，请先播放谱面再点定位。');
                        }
                    };
                    row.appendChild(locateBtn);
                }

                rows.appendChild(row);
            }

            group.appendChild(rows);
            return group;
        }

        // 9. 渲染参数配置列表
        // 构建「数字贴图」字形网格块 —— 分数 (score) 与连击 (combo) 共用同一套实现，
        // 保证两块贴图面板的外观、上传与定位交互完全一致。
        // opts: { title, glyphs, fontType, uploadParamKey, cardIdPrefix, blockClass, keys, q, locate }
        //   glyphs: [{ char, label, tex, targetId }]
        //   locate: (glyph) => 画布可交互元素 | null
