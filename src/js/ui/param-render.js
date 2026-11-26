// ============================================================================
// param-render.js - 皮肤编辑器参数面板渲染入口
// 依赖：ui/param-core.js、ui/texture-controls.js、ui/param-render-controls.js
// ============================================================================

        function renderFontsTabGlyphBlocks(container, fontGlyphParams, keys, q) {
            const scoreTargetIds = {
                '0': 'hud_score_digit_0',
                '1': 'hud_score_digit_1',
                '2': 'hud_score_digit_2',
                '3': 'hud_score_digit_3',
                '4': 'hud_score_digit_4',
                '5': 'hud_score_digit_5',
                '6': 'hud_score_digit_6',
                '7': 'hud_score_digit_7',
                '8': 'hud_acc_glyph_1',
                '9': 'hud_acc_glyph_0',
                '.': 'hud_acc_glyph_2',
                '%': 'hud_acc_glyph_5'
            };
            const makeGlyphView = (p) => {
                const char = p._fontGlyph.char;
                return {
                    char,
                    label: p.zhName,
                    tex: p.default,
                    param: p,
                    targetId: p._fontGlyph.group === 'combo'
                        ? 'combo'
                        : scoreTargetIds[char]
                };
            };
            const scoreGlyphs = fontGlyphParams
                .filter((p) => p._fontGlyph.group === 'score')
                .map(makeGlyphView);
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

            const comboGlyphs = fontGlyphParams
                .filter((p) => p._fontGlyph.group === 'combo')
                .map(makeGlyphView);
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

        function buildParamCategoryBlock(container, catName, items, cfg, keys, q) {
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
                grid.appendChild(buildSkinParamCard(unit.p, cfg, keys));
            }

            contentParent.appendChild(grid);
            if (isFontsAdvanced) {
                block.appendChild(contentParent);
            }
            container.appendChild(block);
        }

        function renderSkinEditorParams() {
            const container = document.getElementById('paramListContainer');
            if (!container) return;
            container.innerHTML = '';
            if (typeof isSkinEditingWorkspaceReady === 'function' && !isSkinEditingWorkspaceReady()) {
                if (typeof syncSkinEditingAvailabilityUI === 'function') syncSkinEditingAvailabilityUI();
                return;
            }
            if (activeEditorTab === 'hitsounds' && typeof renderHitsoundEditor === 'function') {
                renderHitsoundEditor(container);
                return;
            }

            const keys = activeEditorKeyCount;
            const cfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4) || {};
            const q = paramSearchQuery.trim().toLowerCase();

            // 若在 Mania 标签页但未读取到任何 Mania 键位配置
            if (activeEditorTab === 'mania' && maniaSkinConfigurations.size === 0) {
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
            const fontGlyphParams = isFontsTab && typeof buildFontGlyphTextureParams === 'function'
                ? buildFontGlyphTextureParams(keys)
                : [];
            const hudGlyphMatchesQuery = isFontsTab && (!q ||
                fontGlyphParams.some((p) =>
                    p.zhName.toLowerCase().includes(q) ||
                    p.default.toLowerCase().includes(q) ||
                    p._fontGlyph.char.includes(q)
                ) ||
                '右上角数字贴图0123456789. %scoredotpercentfonts'.includes(q));

            if (filtered.length === 0 && !hudGlyphMatchesQuery) {
                container.innerHTML = `<div style="text-align:center; padding: 40px; color: rgba(255,255,255,0.45); font-size: 0.9rem;">未找到与 "${q}" 匹配的参数</div>`;
                return;
            }

            // 若在 Fonts 标签页，在参数列表顶部追加渲染 "数字贴图"(分数) 与 "连击数字贴图"
            if (isFontsTab && hudGlyphMatchesQuery) {
                renderFontsTabGlyphBlocks(container, fontGlyphParams, keys, q);
            }

            // 逐轨道贴图参数展开为「每轨一张卡片」(NoteImage0..N / KeyImage0..N 等)
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
                buildParamCategoryBlock(container, catName, items, cfg, keys, q);
            }
        }
