// ============================================================================
// texture-control-font-glyph.js - 字体字形贴图预览
// 从 texture-controls.js 按职责拆分。
// ============================================================================

        function buildFontGlyphBlock(opts) {
            const { title, glyphs, fontType, uploadParamKey, cardIdPrefix, blockClass, keys, q, locate } = opts;

            const block = document.createElement('div');
            block.className = 'param-category-block hud-font-glyphs-block';
            if (blockClass) block.classList.add(blockClass);

            const header = document.createElement('div');
            header.className = 'param-category-title';
            header.innerHTML = `<span>${title}</span><span class="count-badge">${glyphs.length}</span>`;
            block.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'hud-glyphs-grid';

            for (const g of glyphs) {
                if (q && !g.label.toLowerCase().includes(q) && !g.tex.toLowerCase().includes(q) && !g.char.includes(q)) {
                    continue;
                }

                const itemCard = document.createElement('div');
                itemCard.className = 'hud-glyph-card';
                itemCard.id = `${cardIdPrefix}-${g.char === '.' ? 'dot' : (g.char === '%' ? 'percent' : g.char)}`;

                // 获取当前贴图图像
                const img = getSkinFontImage(fontType, g.char, keys);

                // 数字字形卡保持原样：规格角标贴在缩略图内角（用户明确要求「数字那一栏还放到里面」）
                const previewBox = document.createElement('div');
                previewBox.className = 'hud-glyph-preview-box';
                renderTextureThumbnail(previewBox, img, g.char, 44, 44);

                const metaGroup = document.createElement('div');
                metaGroup.className = 'hud-glyph-meta';
                metaGroup.innerHTML = `
                    <div class="hud-glyph-title">${g.label}</div>
                    <div class="hud-glyph-filename">${g.tex}.png</div>
                `;

                const btnGroup = document.createElement('div');
                btnGroup.className = 'hud-glyph-actions';

                const uploadDropdown = buildTextureUploadDropdown({
                    uploadTargetName: g.tex,
                    targetKey: null,
                    paramKey: uploadParamKey,
                    keys,
                    existingParam: g.param,
                    hoverHost: itemCard,
                    mainLabel: '导入',
                    dropdownClass: 'hud-glyph-upload-dropdown'
                });

                const locateBtn = document.createElement('button');
                locateBtn.type = 'button';
                locateBtn.className = 'hud-glyph-btn locate';
                locateBtn.title = `在画布上框选此字符`;
                locateBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span>定位</span>
                `;
                locateBtn.onclick = () => {
                    const modal = document.getElementById('skinEditorModal');
                    if (modal) modal.classList.remove('active');
                    const target = locate ? locate(g) : null;
                    if (target) {
                        selectedCanvasElement = target;
                        selectionAnimStartTime = performance.now();
                        syncCanvasSelectedCard(target);
                        drawFrame();
                    }
                };

                btnGroup.appendChild(uploadDropdown);
                btnGroup.appendChild(locateBtn);

                itemCard.appendChild(previewBox);
                itemCard.appendChild(metaGroup);
                itemCard.appendChild(btnGroup);
                grid.appendChild(itemCard);
            }

            block.appendChild(grid);
            return block;
        }

        // ===== 逐轨颜色管理器（轨道底色 ColumnColour 与按键动画颜色 ColourLight 共用）=====
        // 两者数据结构完全同构：cfg 上一个长度 = keys 的 {r,g,b,a} 数组，skin.ini 里逐轨写成
        //   Colour1..N（轨道底色） / ColourLight1..N（按键发光）。
        // 因此统一由本函数渲染「全轨统一条 + 逐轨卡片网格」，避免两份几乎一样的实现各自漂移。
        //
        // opts:
        //   arrKey        cfg 上的数组字段名（'ColumnColour' | 'ColourLight'）
        //   iniPrefix     卡片右上角展示的 ini 键前缀（'Colour' | 'ColourLight'）
        //   defaultColour 缺省颜色（底色 {0,0,0,255} / 发光 {255,255,255,255}）
        //   unifiedTitle  「全轨统一…」标题
        //   what          撤销 / toast 文案里的名词（'底色' | '发光颜色'）
        //   withPreview   是否附带「预览发光」按钮（仅 ColourLight 需要，见 testLightUntil）
        //   alphaZeroForcedOpaque  alpha=0 是否会被游戏强制为不透明（仅 ColourLight；底色/小节线的 0 就是透明）
