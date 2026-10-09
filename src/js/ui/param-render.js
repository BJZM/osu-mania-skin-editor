// ============================================================================
// param-render.js - 皮肤编辑器参数面板渲染入口
// 依赖：ui/param-core.js、ui/texture-controls.js
// ============================================================================

        function renderSkinEditorParams() {
            const container = document.getElementById('paramListContainer');
            if (!container) return;
            container.innerHTML = '';

            const keys = activeEditorKeyCount;
            const cfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4) || {};
            const q = paramSearchQuery.trim().toLowerCase();

            // 若在 Mania / 贴图 标签页但未读取到任何 Mania 键位配置
            if ((activeEditorTab === 'mania' || activeEditorTab === 'textures') && maniaSkinConfigurations.size === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding: 48px 20px; color: rgba(255,255,255,0.65); font-size: 0.88rem;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="36" height="36" style="margin-bottom: 12px; opacity: 0.45;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <div style="font-weight: 600; color: #ffffff; margin-bottom: 6px;">未读取到任何 [Mania] 键位配置</div>
                        <div style="font-size: 0.78rem; color: rgba(255,255,255,0.45); max-width: 320px; margin: 0 auto; line-height: 1.5;">
                            当前导入的皮肤 skin.ini 中不包含 [Mania] 键位区块。请导入包含 Mania 键位配置的皮肤以进行可视化调整。
                        </div>
                    </div>
                `;
                return;
            }

            // 过滤参数
            const filtered = SKIN_INI_PARAM_SCHEMA.filter(p => {
                if (p.tab !== activeEditorTab) return false;
                if (!q) return true;
                return p.key.toLowerCase().includes(q) ||
                    p.zhName.toLowerCase().includes(q) ||
                    p.enName.toLowerCase().includes(q) ||
                    p.desc.toLowerCase().includes(q) ||
                    p.comment.toLowerCase().includes(q);
            });

            const isFontsTab = (activeEditorTab === 'fonts');
            const hudGlyphMatchesQuery = isFontsTab && (!q || '右上角数字贴图0123456789. %scoredotpercentfonts'.includes(q));

            if (filtered.length === 0 && !hudGlyphMatchesQuery) {
                container.innerHTML = `<div style="text-align:center; padding: 40px; color: rgba(255,255,255,0.45); font-size: 0.9rem;">未找到与 "${q}" 匹配的参数</div>`;
                return;
            }

            // 若在 Fonts 标签页，在参数列表顶部追加渲染 "数字贴图"(分数) 与 "连击数字贴图"
            if (isFontsTab && hudGlyphMatchesQuery) {
                const scorePrefix = skinFontsConfig.scorePrefix || 'score';
                const scoreGlyphs = [
                    { char: '0', label: '数字 0', tex: `${scorePrefix}-0`, targetId: 'hud_score_digit_0' },
                    { char: '1', label: '数字 1', tex: `${scorePrefix}-1`, targetId: 'hud_score_digit_1' },
                    { char: '2', label: '数字 2', tex: `${scorePrefix}-2`, targetId: 'hud_score_digit_2' },
                    { char: '3', label: '数字 3', tex: `${scorePrefix}-3`, targetId: 'hud_score_digit_3' },
                    { char: '4', label: '数字 4', tex: `${scorePrefix}-4`, targetId: 'hud_score_digit_4' },
                    { char: '5', label: '数字 5', tex: `${scorePrefix}-5`, targetId: 'hud_score_digit_5' },
                    { char: '6', label: '数字 6', tex: `${scorePrefix}-6`, targetId: 'hud_score_digit_6' },
                    { char: '7', label: '数字 7', tex: `${scorePrefix}-7`, targetId: 'hud_score_digit_7' },
                    { char: '8', label: '数字 8', tex: `${scorePrefix}-8`, targetId: 'hud_acc_glyph_1' },
                    { char: '9', label: '数字 9', tex: `${scorePrefix}-9`, targetId: 'hud_acc_glyph_0' },
                    { char: '.', label: '小数点 (.)', tex: `${scorePrefix}-dot`, targetId: 'hud_acc_glyph_2' },
                    { char: '%', label: '百分号 (%)', tex: `${scorePrefix}-percent`, targetId: 'hud_acc_glyph_5' }
                ];
                container.appendChild(buildFontGlyphBlock({
                    title: '数字贴图',
                    glyphs: scoreGlyphs,
                    fontType: 'score',
                    uploadParamKey: 'ScorePrefix',
                    cardIdPrefix: 'glyph-card',
                    keys, q,
                    locate: (g) => canvasInteractiveElements.find(i => i.id === g.targetId) ||
                                   canvasInteractiveElements.find(i => i.textureName === g.tex)
                }));

                // 连击字体贴图：仅当 ini 显式指定了连击字体 ([Mania] FontCombo / [Fonts] Combo) 时才显示。
                // 未指定时连击数字与分数共用同一套贴图，再展示一份完全相同的贴图没有意义。
                const comboFontPrefix = getExplicitComboFontPrefix(keys);
                if (comboFontPrefix) {
                    const comboGlyphPrefix = formatFontPrefix(comboFontPrefix);
                    const comboGlyphs = [];
                    for (let d = 0; d <= 9; d++) {
                        comboGlyphs.push({
                            char: String(d),
                            label: `连击数字 ${d}`,
                            tex: `${comboGlyphPrefix}${d}`,
                            targetId: 'combo'
                        });
                    }
                    container.appendChild(buildFontGlyphBlock({
                        title: '连击数字贴图',
                        glyphs: comboGlyphs,
                        fontType: 'combo',
                        uploadParamKey: 'ComboPrefix',
                        cardIdPrefix: 'combo-glyph-card',
                        blockClass: 'combo-font-glyphs-block',
                        keys, q,
                        locate: () => canvasInteractiveElements.find(i => i.id === 'combo')
                    }));
                }
            }

            // 逐轨道贴图参数展开为「每轨一张卡片」(NoteImage0..N / KeyImage0..N 等)，
            // 使每一项都拥有与其他贴图参数完全一致的上传按钮，而不是「一个总体 + 若干简化行」
            const expandedItems = [];
            for (const item of filtered) {
                const perTrack = expandPerTrackTextureParams(item, keys);
                if (perTrack && perTrack.length > 0) expandedItems.push(...perTrack);
                else expandedItems.push(item);
            }

            // 按 Category 分组
            const groups = new Map();
            for (const item of expandedItems) {
                if (!groups.has(item.category)) groups.set(item.category, []);
                groups.get(item.category).push(item);
            }

            for (const [catName, items] of groups.entries()) {
                const isFontsAdvanced = (activeEditorTab === 'fonts' && catName === '字体排版');

                const block = document.createElement('div');
                block.className = 'param-category-block';

                // 每个分类都可折叠：折叠状态按「标签页::分类名」记忆；
                // 搜索时强制展开，保证搜到的参数不会被折叠挡住。
                const collapseKey = activeEditorTab + '::' + catName;
                const isCollapsed = !isFontsAdvanced && !q && collapsedParamCategories.has(collapseKey);
                block.dataset.categoryKey = collapseKey;
                if (isCollapsed) block.classList.add('collapsed');

                if (isFontsAdvanced) {
                    block.classList.add('fonts-advanced-category-block');
                    const isSearching = !!q;
                    const isExpanded = isSearching || isFontsAdvancedExpanded;
                    if (isExpanded) {
                        block.classList.add('expanded');
                    }

                    const toggleBar = document.createElement('div');
                    toggleBar.className = 'advanced-settings-toggle-bar';

                    const toggleBtn = document.createElement('button');
                    toggleBtn.type = 'button';
                    toggleBtn.className = `advanced-toggle-btn ${isExpanded ? 'active' : ''}`;
                    toggleBtn.innerHTML = `
                        <div class="advanced-toggle-left">
                            <svg class="advanced-toggle-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                            <span class="advanced-toggle-label">${isExpanded ? '收起高级设置 (字体排版与前缀)' : '展开高级设置 (字体排版与前缀)'}</span>
                            <span class="count-badge">${items.length}</span>
                        </div>
                        <span class="advanced-toggle-hint">${isExpanded ? '点击收起' : '点击展开高级参数'}</span>
                    `;

                    toggleBtn.onclick = () => {
                        isFontsAdvancedExpanded = !isFontsAdvancedExpanded;
                        const nowExpanded = isFontsAdvancedExpanded;
                        block.classList.toggle('expanded', nowExpanded);
                        toggleBtn.classList.toggle('active', nowExpanded);
                        toggleBtn.querySelector('.advanced-toggle-label').textContent = nowExpanded ? '收起高级设置 (字体排版与前缀)' : '展开高级设置 (字体排版与前缀)';
                        toggleBtn.querySelector('.advanced-toggle-hint').textContent = nowExpanded ? '点击收起' : '点击展开高级参数';
                    };

                    toggleBar.appendChild(toggleBtn);
                    container.appendChild(toggleBar);
                }

                const contentParent = isFontsAdvanced ? document.createElement('div') : block;
                if (isFontsAdvanced) {
                    contentParent.className = 'fonts-advanced-inner';
                }

                if (!isFontsAdvanced) {
                    // 分类标题本身即折叠按钮（保留 .param-category-title 类与内部 span 结构，
                    // 外观沿用原分类标题样式，只额外加一个箭头指示器）
                    const title = document.createElement('button');
                    title.type = 'button';
                    title.className = 'param-category-title param-category-toggle';
                    title.title = '点击折叠 / 展开该分类';
                    title.innerHTML = `
                        <svg class="cat-toggle-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        <span>${catName}</span><span class="count-badge">${items.length}</span>
                    `;
                    title.onclick = () => {
                        const nowCollapsed = !block.classList.contains('collapsed');
                        block.classList.toggle('collapsed', nowCollapsed);
                        if (nowCollapsed) collapsedParamCategories.add(collapseKey);
                        else collapsedParamCategories.delete(collapseKey);
                    };
                    block.appendChild(title);
                }

                const grid = document.createElement('div');
                grid.className = 'param-cards-grid';

                // 同一贴图类型 (NoteImage / 长条头身尾 / KeyImage / KeyImageD) 的所有轨道
                // 合并为同一个分组框渲染单元；其余参数仍保持各自独立卡片。
                const renderUnits = [];
                for (const item of items) {
                    if (item._trackGroupKey) {
                        const last = renderUnits[renderUnits.length - 1];
                        if (last && last.kind === 'trackGroup' && last.groupKey === item._trackGroupKey) {
                            last.items.push(item);
                        } else {
                            renderUnits.push({
                                kind: 'trackGroup',
                                groupKey: item._trackGroupKey,
                                groupName: item._trackGroupZhName || item._trackGroupName || item._trackGroupKey,
                                groupEnName: item._trackGroupEnName,
                                desc: item._trackGroupDesc,
                                items: [item],
                            });
                        }
                    } else {
                        renderUnits.push({ kind: 'card', p: item });
                    }
                }

                for (const unit of renderUnits) {
                    if (unit.kind === 'trackGroup') {
                        grid.appendChild(buildPerTrackTextureGroup(unit, keys));
                        continue;
                    }
                    const p = unit.p;
                    const card = document.createElement('div');
                    card.className = 'param-card';
                    card.id = `param-card-${p.key}`;

                    // 当前数值获取
                    let val = p.default;
                    if (p.key === 'ScorePercentWidth') {
                        val = getScorePercentPaddingWidth(keys);
                    } else if (p.key === 'ScorePercentVisible') {
                        val = getScorePercentVisibility(keys);
                    } else if (p.tab === 'mania' || p.tab === 'textures') {
                        if (cfg[p.key] !== undefined && cfg[p.key] !== null) val = cfg[p.key];
                    } else if (p.tab === 'fonts') {
                        if (p.key === 'ScorePrefix') val = skinFontsConfig.scorePrefix || 'score';
                        else if (p.key === 'ScoreOverlap') val = skinFontsConfig.scoreOverlap || 0;
                        else if (p.key === 'ComboPrefix') {
                            // 显示「实际生效」的连击字体前缀：ini 显式指定了 [Mania] FontCombo / [Fonts] Combo 才有值，
                            // 都没有时留空 (占位符会说明实际沿用 score 字体贴图)，避免面板与画布不一致
                            val = getExplicitComboFontPrefix(keys) || '';
                        }
                        else if (p.key === 'ComboOverlap') val = skinFontsConfig.comboOverlap || 0;
                        else if (p.key === 'HitCirclePrefix') val = skinFontsConfig.hitCirclePrefix || 'default';
                        else if (p.key === 'HitCircleOverlap') val = skinFontsConfig.hitCircleOverlap || -2;
                    } else if (p.tab === 'general') {
                        if (currentSkinMetadata.general && currentSkinMetadata.general[p.key] !== undefined) {
                            val = currentSkinMetadata.general[p.key];
                        }
                    } else if (p.tab === 'colours') {
                        if (currentSkinMetadata.colours && currentSkinMetadata.colours[p.key] !== undefined) {
                            val = currentSkinMetadata.colours[p.key];
                        }
                    }

                    // Card 头部
                    const header = document.createElement('div');
                    header.className = 'param-card-header';
                    header.innerHTML = `
                        <div class="param-names">
                            <span class="param-zh-name">${p.zhName}</span>
                            ${p.desc ? `
                                <span class="param-info-trigger" tabindex="0">
                                    <span class="param-info-icon">ⓘ</span>
                                    <div class="param-desc-tooltip">${p.desc}</div>
                                </span>
                            ` : ''}
                            <span class="param-en-name">${p.enName}</span>
                        </div>
                    `;

                    // 右侧快捷定位与重置操作按钮
                    const actionsArea = document.createElement('div');
                    actionsArea.style.display = 'flex';
                    actionsArea.style.gap = '4px';

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
                            }
                        };
                        actionsArea.appendChild(locateBtn);
                    }

                    if (actionsArea.children.length > 0) {
                        header.appendChild(actionsArea);
                    }
                    card.appendChild(header);

                    // 输入控制行
                    const controlRow = document.createElement('div');
                    controlRow.className = 'param-control-row';

                    if (p.type === 'number') {
                        const numVal = (typeof val === 'number') ? val : (parseFloat(val) || p.default);
                        const combo = document.createElement('div');
                        combo.className = 'slider-input-combo';

                        const range = document.createElement('input');
                        range.type = 'range';
                        range.min = p.min;
                        range.max = p.max;
                        range.step = p.step;
                        range.value = numVal;

                        const updateRangeFill = (v) => {
                            const min = (p.min != null) ? p.min : 0;
                            const max = (p.max != null) ? p.max : 100;
                            const vf = (v != null && !isNaN(parseFloat(v))) ? parseFloat(v) : min;
                            const pct = max > min ? Math.min(100, Math.max(0, ((vf - min) / (max - min)) * 100)) : 0;
                            range.style.setProperty('--slider-pct', `${pct}%`);
                        };
                        updateRangeFill(numVal);

                        const num = document.createElement('input');
                        num.type = 'number';
                        num.min = p.min;
                        num.max = p.max;
                        num.step = p.step;
                        num.value = numVal;

                        range.oninput = (e) => {
                            updateRangeFill(e.target.value);
                            num.value = e.target.value;
                            onParamChange(p.key, parseFloat(e.target.value));
                        };
                        num.onchange = (e) => {
                            range.value = e.target.value;
                            updateRangeFill(e.target.value);
                            onParamChange(p.key, parseFloat(e.target.value));
                        };

                        combo.appendChild(range);
                        combo.appendChild(num);
                        controlRow.appendChild(combo);
                    } else if (p.type === 'boolean') {
                        const isChecked = !!(val === true || val === 1 || val === '1' || val === 'true');
                        const toggleBox = document.createElement('div');
                        toggleBox.style.display = 'flex';
                        toggleBox.style.alignItems = 'center';
                        toggleBox.style.gap = '8px';

                        const toggleLabel = document.createElement('label');
                        toggleLabel.className = 'ios-switch';
                        toggleLabel.innerHTML = `
                            <input type="checkbox" ${isChecked ? 'checked' : ''}>
                            <span class="slider"></span>
                        `;
                        const statusSpan = document.createElement('span');
                        statusSpan.style.fontSize = '0.8rem';
                        statusSpan.style.color = isChecked ? '#ffffff' : 'rgba(255,255,255,0.45)';
                        statusSpan.textContent = isChecked ? '开启' : '关闭';

                        const chk = toggleLabel.querySelector('input');
                        chk.onchange = (e) => {
                            statusSpan.textContent = e.target.checked ? '开启' : '关闭';
                            statusSpan.style.color = e.target.checked ? '#ffffff' : 'rgba(255,255,255,0.45)';
                            onParamChange(p.key, e.target.checked);
                        };

                        toggleBox.appendChild(toggleLabel);
                        toggleBox.appendChild(statusSpan);
                        controlRow.appendChild(toggleBox);
                    } else if (p.type === 'select') {
                        const select = document.createElement('select');
                        select.className = 'param-select';
                        for (const opt of p.options) {
                            const option = document.createElement('option');
                            option.value = opt.value;
                            option.textContent = opt.label;
                            if (String(opt.value) === String(val)) option.selected = true;
                            select.appendChild(option);
                        }
                        select.onchange = (e) => onParamChange(p.key, e.target.value);
                        controlRow.appendChild(select);
                    } else if (p.type === 'color') {
                        const combo = document.createElement('div');
                        combo.className = 'color-picker-combo';

                        let rgbStr = (typeof val === 'object' && val) ? `${val.r || 255},${val.g || 0},${val.b || 0}` : String(val);
                        const parts = rgbStr.split(',').map(s => parseInt(s.trim(), 10) || 0);
                        const hex = `#${((1 << 24) + (parts[0] << 16) + (parts[1] << 8) + parts[2]).toString(16).slice(1)}`;

                        const picker = document.createElement('input');
                        picker.type = 'color';
                        picker.value = hex;

                        const text = document.createElement('input');
                        text.type = 'text';
                        text.className = 'color-text';
                        text.value = rgbStr;

                        picker.oninput = (e) => {
                            const h = e.target.value;
                            const r = parseInt(h.slice(1, 3), 16);
                            const g = parseInt(h.slice(3, 5), 16);
                            const b = parseInt(h.slice(5, 7), 16);
                            text.value = `${r},${g},${b}`;
                            onParamChange(p.key, text.value);
                            if (p.key === 'ComboBreakColour') {
                                triggerComboBreakPreview();
                            }
                        };
                        text.onchange = (e) => {
                            onParamChange(p.key, e.target.value);
                            if (p.key === 'ComboBreakColour') {
                                triggerComboBreakPreview();
                            }
                        };

                        combo.appendChild(picker);
                        combo.appendChild(text);

                        if (p.key === 'ComboBreakColour') {
                            const previewBreakBtn = document.createElement('button');
                            previewBreakBtn.type = 'button';
                            previewBreakBtn.className = 'col-colour-preview-btn';
                            previewBreakBtn.innerHTML = `
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                                <span>预览断连</span>
                            `;
                            previewBreakBtn.onclick = () => {
                                triggerComboBreakPreview();
                            };
                            combo.appendChild(previewBreakBtn);
                        }

                        controlRow.appendChild(combo);
                    } else if (p.type === 'column_colour') {
                        // 轨道底色 (Colour1..N)：与按键动画颜色 ColourLight1..N 同构，共用同一个管理器
                        controlRow.appendChild(buildPerTrackColourManager(cfg, keys, {
                            arrKey: 'ColumnColour',
                            iniPrefix: 'Colour',
                            defaultColour: { r: 0, g: 0, b: 0, a: 255 },
                            unifiedTitle: '全轨统一底色与透明度',
                            what: '底色'
                        }));
                    } else if (p.type === 'light_colour') {
                        // 按键动画颜色 (ColourLight1..N)：对应 lazer LegacyColumnBackground 的
                        // ColumnLightColour lookup，未指定时引擎回退纯白。
                        controlRow.appendChild(buildPerTrackColourManager(cfg, keys, {
                            arrKey: 'ColourLight',
                            iniPrefix: 'ColourLight',
                            defaultColour: { r: 255, g: 255, b: 255, a: 255 },
                            unifiedTitle: '全轨统一按键动画颜色与透明度',
                            what: '动画颜色',
                            withPreview: true,
                            alphaZeroForcedOpaque: true
                        }));
                    } else if (p.type === 'colour_hold') {
                        const curHold = cfg.ColourHold || { r: 255, g: 191, b: 51, a: 255 };
                        const curHex = `#${((1 << 24) + (curHold.r << 16) + (curHold.g << 8) + curHold.b).toString(16).slice(1)}`;

                        const mainControls = document.createElement('div');
                        mainControls.className = 'colour-hold-controls';

                        const picker = document.createElement('input');
                        picker.type = 'color';
                        picker.className = 'col-colour-picker';
                        picker.value = curHex;

                        const alphaSlider = document.createElement('input');
                        alphaSlider.type = 'range';
                        alphaSlider.min = 0;
                        alphaSlider.max = 255;
                        alphaSlider.step = 1;
                        alphaSlider.value = (curHold.a != null) ? curHold.a : 255;
                        alphaSlider.className = 'col-colour-slider';
                        const holdInitPct = Math.max(0, Math.min(100, Math.round(alphaSlider.value / 255 * 100))) + '%';
                        alphaSlider.style.setProperty('--slider-pct', holdInitPct);

                        const alphaLabel = document.createElement('span');
                        alphaLabel.className = 'col-colour-val';
                        const updateHoldLabel = (a) => {
                            const pct = Math.max(0, Math.min(100, Math.round(a / 255 * 100)));
                            alphaLabel.textContent = `A: ${a} (${pct}%)`;
                            alphaSlider.style.setProperty('--slider-pct', `${pct}%`);
                        };
                        updateHoldLabel(parseInt(alphaSlider.value, 10));

                        const previewHoldBtn = document.createElement('button');
                        previewHoldBtn.type = 'button';
                        previewHoldBtn.className = 'col-colour-preview-btn';
                        previewHoldBtn.innerHTML = `
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            <span>预览变色</span>
                        `;

                        const updateColourHold = () => {
                            recordSkinUndoBeforeChange('调整按住hold时连击字体颜色');
                            const hex = picker.value;
                            const r = parseInt(hex.slice(1, 3), 16);
                            const g = parseInt(hex.slice(3, 5), 16);
                            const b = parseInt(hex.slice(5, 7), 16);
                            const a = parseInt(alphaSlider.value, 10);
                            updateHoldLabel(a);
                            cfg.ColourHold = { r, g, b, a };
                            testHoldingUntil = performance.now() + 2500;
                            drawFrame();
                        };

                        previewHoldBtn.onclick = () => {
                            testHoldingUntil = performance.now() + 2500;
                            drawFrame();
                        };

                        picker.oninput = updateColourHold;
                        alphaSlider.oninput = updateColourHold;

                        mainControls.appendChild(picker);
                        mainControls.appendChild(alphaSlider);
                        mainControls.appendChild(alphaLabel);
                        mainControls.appendChild(previewHoldBtn);

                        controlRow.appendChild(mainControls);
                    } else if (p.type === 'colour_barline') {
                        const curBarline = cfg.ColourBarline || { r: 255, g: 255, b: 255, a: 255 };
                        const curHex = `#${((1 << 24) + (curBarline.r << 16) + (curBarline.g << 8) + curBarline.b).toString(16).slice(1)}`;

                        const mainControls = document.createElement('div');
                        mainControls.className = 'colour-barline-controls';

                        const picker = document.createElement('input');
                        picker.type = 'color';
                        picker.className = 'col-colour-picker';
                        picker.value = curHex;
                        picker.title = '选择小节线颜色';

                        const alphaSlider = document.createElement('input');
                        alphaSlider.type = 'range';
                        alphaSlider.min = 0;
                        alphaSlider.max = 255;
                        alphaSlider.step = 1;
                        alphaSlider.value = (curBarline.a != null) ? curBarline.a : 255;
                        alphaSlider.className = 'col-colour-slider';
                        alphaSlider.title = '调整小节线透明度';
                        const pctInit = ((alphaSlider.value / 255) * 100).toFixed(1) + '%';
                        alphaSlider.style.setProperty('--slider-pct', pctInit);

                        const alphaLabel = document.createElement('span');
                        alphaLabel.className = 'col-colour-val';
                        const updateBarlineLabel = (a) => {
                            const pct = Math.round(a / 255 * 100);
                            alphaLabel.textContent = `A: ${a} (${pct}%)`;
                        };
                        updateBarlineLabel(parseInt(alphaSlider.value, 10));

                        const textInput = document.createElement('input');
                        textInput.type = 'text';
                        textInput.className = 'color-text';
                        textInput.value = `${curBarline.r},${curBarline.g},${curBarline.b},${curBarline.a != null ? curBarline.a : 255}`;
                        textInput.title = '直接输入 RGBA 格式数值 (r,g,b,a)';

                        const updateColourBarline = (recordUndo = true) => {
                            if (recordUndo) recordSkinUndoBeforeChange('调整小节线颜色');
                            const hex = picker.value;
                            const r = parseInt(hex.slice(1, 3), 16);
                            const g = parseInt(hex.slice(3, 5), 16);
                            const b = parseInt(hex.slice(5, 7), 16);
                            const a = parseInt(alphaSlider.value, 10);
                            const pct = ((a / 255) * 100).toFixed(1) + '%';
                            alphaSlider.style.setProperty('--slider-pct', pct);
                            updateBarlineLabel(a);
                            textInput.value = `${r},${g},${b},${a}`;
                            cfg.ColourBarline = { r, g, b, a };
                            drawFrame();
                        };

                        picker.oninput = () => updateColourBarline(false);
                        picker.onchange = () => updateColourBarline(true);
                        alphaSlider.oninput = () => updateColourBarline(false);
                        alphaSlider.onchange = () => updateColourBarline(true);

                        textInput.onchange = (e) => {
                            const parts = e.target.value.split(',').map(s => parseInt(s.trim(), 10));
                            if (parts.length >= 3 && !parts.slice(0, 3).some(isNaN)) {
                                recordSkinUndoBeforeChange('调整小节线颜色');
                                const r = Math.max(0, Math.min(255, parts[0]));
                                const g = Math.max(0, Math.min(255, parts[1]));
                                const b = Math.max(0, Math.min(255, parts[2]));
                                const a = (parts.length >= 4 && !isNaN(parts[3])) ? Math.max(0, Math.min(255, parts[3])) : 255;
                                cfg.ColourBarline = { r, g, b, a };
                                picker.value = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
                                alphaSlider.value = a;
                                const pct = ((a / 255) * 100).toFixed(1) + '%';
                                alphaSlider.style.setProperty('--slider-pct', pct);
                                updateBarlineLabel(a);
                                textInput.value = `${r},${g},${b},${a}`;
                                drawFrame();
                            }
                        };

                        mainControls.appendChild(picker);
                        mainControls.appendChild(alphaSlider);
                        mainControls.appendChild(alphaLabel);
                        mainControls.appendChild(textInput);

                        controlRow.appendChild(mainControls);
                    } else if (p.type === 'array_number') {
                        let arrVal = Array.isArray(val) ? [...val] : String(val).split(',').map(s => parseFloat(s.trim()) || 0);
                        let arrStr = arrVal.map(Math.round).join(',');
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'param-text-input';
                        input.value = arrStr;
                        input.placeholder = (p.key === 'ColumnLineWidth')
                            ? '以逗号隔开的数组 (如 2,2,2,2,2)'
                            : '以逗号隔开的数组 (如 30,30,30,30)';
                        controlRow.appendChild(input);

                        // 渲染各轨独立快速微调输入框 chips (支持各轨道宽度与间距直接修改)
                        const chipsGrid = document.createElement('div');
                        chipsGrid.className = 'array-chips-grid';

                        const numChips = (p.key === 'ColumnSpacing')
                            ? Math.max(0, keys - 1)
                            : ((p.key === 'ColumnLineWidth') ? keys + 1 : keys);
                        for (let c = 0; c < numChips; c++) {
                            const chip = document.createElement('div');
                            chip.className = 'array-chip';
                            const label = document.createElement('span');
                            label.className = 'chip-label';
                            if (p.key === 'ColumnSpacing') {
                                label.textContent = `轨${c + 1}-${c + 2}距`;
                            } else if (p.key === 'ColumnLineWidth') {
                                if (c === 0) label.textContent = '左边界';
                                else if (c === keys) label.textContent = '右边界';
                                else label.textContent = `轨${c}-${c + 1}线`;
                            } else {
                                label.textContent = `第${c + 1}轨宽`;
                            }

                            const chipInput = document.createElement('input');
                            chipInput.type = 'number';
                            chipInput.className = 'array-chip-input';
                            chipInput.min = p.min != null ? p.min : 0;
                            chipInput.max = p.max != null ? p.max : 300;
                            chipInput.value = (arrVal[c] != null) ? Math.round(arrVal[c]) : (p.default || 0);

                            chipInput.oninput = () => {
                                const num = parseFloat(chipInput.value) || 0;
                                arrVal[c] = num;
                                input.value = arrVal.map(Math.round).join(',');
                                // 传入改动下标：超限时只收敛当前这一项，并即时回写实际生效值
                                const applied = onParamChange(p.key, arrVal, c);
                                if (Array.isArray(applied)) {
                                    arrVal = applied.slice();
                                    input.value = applied.map(Math.round).join(',');
                                    if (Math.round(applied[c]) !== Math.round(num)) {
                                        chipInput.value = Math.round(applied[c]);
                                    }
                                }
                            };

                            chip.appendChild(label);
                            chip.appendChild(chipInput);
                            chipsGrid.appendChild(chip);
                        }
                        controlRow.appendChild(chipsGrid);

                        input.onchange = (e) => {
                            const typed = String(e.target.value).split(',').map(s => parseFloat(s.trim()) || 0);
                            // 整组替换：若轨道区总宽度超限则本次修改不予采纳，并回写实际生效值
                            const applied = onParamChange(p.key, e.target.value);
                            const parts = Array.isArray(applied) ? applied : typed;
                            arrVal = parts.slice();
                            const allInputs = chipsGrid.querySelectorAll('.array-chip-input');
                            allInputs.forEach((ci, idx) => {
                                if (parts[idx] !== undefined) ci.value = Math.round(parts[idx]);
                            });
                            const changed = parts.length !== typed.length
                                || parts.some((v, i) => Math.round(v) !== Math.round(typed[i]));
                            if (changed) input.value = parts.map(v => Math.round(v)).join(',');
                        };
                    } else if (p.type === 'texture') {
                        // 贴图参数控件 (缩略图 + 路径输入 + 上传下拉) 统一由 buildTextureParamControl 构建，
                        // 与「逐轨道贴图分组框」内的每一行共用同一实现，保证样式与行为完全一致。
                        controlRow.appendChild(buildTextureParamControl(p, keys, card));
                    } else {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'param-text-input';
                        input.value = (val !== undefined && val !== null) ? val : '';
                        // 连击数字前缀：留空时提示「实际沿用 score 字体贴图」，避免与画布渲染结果不一致
                        if (p.key === 'ComboPrefix') {
                            const effComboFont = getExplicitComboFontPrefix(keys);
                            input.placeholder = effComboFont
                                ? `如 ${effComboFont}-0.png`
                                : 'ini 未指定 (实际使用: score 字体贴图)';
                        }
                        input.onchange = (e) => onParamChange(p.key, e.target.value);
                        controlRow.appendChild(input);
                    }

                    card.appendChild(controlRow);
                    grid.appendChild(card);
                }

                contentParent.appendChild(grid);
                if (isFontsAdvanced) {
                    block.appendChild(contentParent);
                }
                container.appendChild(block);
            }
        }
