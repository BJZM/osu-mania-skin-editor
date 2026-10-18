// ============================================================================
// param-core.js - 参数变更、输入同步、键位胶囊、标签页与刷新
// 依赖：skin/mania-config.js、ui/ini-export.js
// ============================================================================

        function computeLayoutOccupiedWidth(cfg, keys) {
            let sum = 0;
            for (let i = 0; i < keys; i++) {
                const w = (cfg.ColumnWidth && cfg.ColumnWidth[i] > 0) ? cfg.ColumnWidth[i] : 30;
                sum += w;
                if (i < keys - 1) {
                    const s = (cfg.ColumnSpacing && cfg.ColumnSpacing[i] != null) ? cfg.ColumnSpacing[i] : 0;
                    sum += s;
                    if (isManiaSplitStagesEnabled(cfg, keys) && i === getManiaStageSplitAfter(keys)) {
                        const sep = (cfg.StageSeparation != null) ? cfg.StageSeparation : 40;
                        sum += sep;
                    }
                }
            }
            return sum;
        }

        // 轨道总宽 / 起始位置变化后同步 ColumnRight：
        //   ColumnRight = 画布可用宽度 − ColumnStart − 轨道占用宽度（不小于 0）
        // 与「修改 ColumnStart 时反推 ColumnRight」共用同一套模型，
        // 否则调宽 / 调间距后 ColumnRight 会停留在旧值，右侧留白与画布不一致。
        function syncColumnRightFromLayout(cfg, keys) {
            if (!cfg || !keys) return null;
            const scale48 = (canvas && canvas.height) ? (canvas.height / 480) : 1;
            const virtualW = canvas ? (canvas.width / scale48) : 853;
            const start = (cfg.ColumnStart != null) ? cfg.ColumnStart : 136;
            const newRight = Math.max(0, Math.round(virtualW - start - computeLayoutOccupiedWidth(cfg, keys)));
            cfg.ColumnRight = newRight;
            syncParamInputValue('ColumnRight', newRight);
            return newRight;
        }

        // 5. 参数修改响应回调
        function onParamChange(key, value, changedIndex = null) {
            recordSkinUndoBeforeChange(`修改参数 ${key}`);
            const schema = SKIN_INI_PARAM_SCHEMA.find(p => p.key === key);
            if (!schema) return;
            // 本次实际写入 cfg 的值（数组类参数可能因超限被收敛或拒绝），供调用方回写界面控件
            let appliedValue;

            // ScorePercentWidth 是编辑器虚拟参数：它不写入 skin.ini，而是直接生成/替换
            // score-percent.png。stable 仍通过贴图宽度决定准度与进度饼图的位置。
            if (schema.virtual && key === 'ScorePercentWidth') {
                appliedValue = setScorePercentPaddingWidth(value, activeEditorKeyCount);
                syncParamInputValue(key, appliedValue);
                // 调整宽度即进入透明垫片模式，自动关闭“显示百分号”。
                syncParamInputValue('ScorePercentVisible', false);
                drawFrame();
                if (selectedCanvasElement && selectedCanvasElement.paramKey === key) {
                    syncCanvasSelectedCard(selectedCanvasElement);
                }
                return appliedValue;
            }

            if (schema.virtual && key === 'ScorePercentVisible') {
                appliedValue = !!value;
                if (appliedValue) {
                    restoreOriginalScorePercentTexture(activeEditorKeyCount);
                } else {
                    const currentWidth = getScorePercentPaddingWidth(activeEditorKeyCount);
                    setScorePercentPaddingWidth(currentWidth, activeEditorKeyCount);
                }
                syncParamInputValue(key, appliedValue);
                syncParamInputValue('ScorePercentWidth', getScorePercentPaddingWidth(activeEditorKeyCount));
                drawFrame();
                if (selectedCanvasElement && selectedCanvasElement.paramKey === key) {
                    syncCanvasSelectedCard(selectedCanvasElement);
                }
                return appliedValue;
            }

            if (schema.tab === 'mania') {
                const keys = activeEditorKeyCount;
                // 必须用 ensureManiaConfigForKeys 兜底：手写一份「不完整」的默认配置写回
                // maniaSkinConfigurations 后，getManiaSkinConfig 读 cfg.ColumnWidth.length 会直接抛
                // TypeError，整个 drawFrame 崩掉（详见 config.js createDefaultManiaSkinConfiguration 注释）。
                const cfg = ensureManiaConfigForKeys(keys);

                if (schema.type === 'number') {
                    const num = parseFloat(value);
                    cfg[key] = isNaN(num) ? schema.default : num;
                } else if (schema.type === 'boolean') {
                    cfg[key] = !!value;
                } else if (schema.type === 'select') {
                    cfg[key] = parseInt(value, 10);
                } else if (schema.type === 'color' || schema.type === 'colour_hold' || schema.type === 'colour_barline') {
                    if (typeof value === 'object' && value !== null) {
                        cfg[key] = { r: value.r, g: value.g, b: value.b, a: value.a !== undefined ? value.a : 255 };
                    } else {
                        const parts = String(value).split(',').map(s => parseInt(s.trim(), 10));
                        if (parts.length >= 3 && !parts.slice(0, 3).some(isNaN)) {
                            cfg[key] = { r: parts[0], g: parts[1], b: parts[2], a: parts[3] !== undefined ? parts[3] : 255 };
                        }
                    }
                } else if (schema.type === 'column_colour' || schema.type === 'light_colour') {
                    // 逐轨颜色数组：支持 { col, color } 单轨写入与 { all: true, color } 全轨写入
                    const isLight = (schema.type === 'light_colour');
                    const arrKey = isLight ? 'ColourLight' : 'ColumnColour';
                    const fallback = isLight ? { r: 255, g: 255, b: 255, a: 255 } : { r: 0, g: 0, b: 0, a: 255 };
                    if (typeof value === 'object' && value !== null && value.col != null) {
                        if (!Array.isArray(cfg[arrKey])) cfg[arrKey] = new Array(keys).fill(null).map(() => ({ ...fallback }));
                        while (cfg[arrKey].length < keys) cfg[arrKey].push({ ...fallback });
                        cfg[arrKey][value.col] = { ...value.color };
                    } else if (typeof value === 'object' && value !== null && value.all) {
                        if (!Array.isArray(cfg[arrKey])) cfg[arrKey] = new Array(keys);
                        for (let i = 0; i < keys; i++) cfg[arrKey][i] = { ...value.color };
                    }
                } else if (schema.type === 'array_number') {
                    const incoming = Array.isArray(value)
                        ? value
                        : String(value).split(',').map(s => parseFloat(s.trim()) || 0);
                    if (key === 'ColumnWidth' || key === 'ColumnSpacing') {
                        // 轨道布局参数受「轨道区最大总宽度」约束（详见 config.js 中的说明）
                        const limitRes = clampTrackLayoutArray(cfg, keys, key, incoming, changedIndex);
                        if (limitRes.values) {
                            cfg[key] = limitRes.values;
                        }
                        appliedValue = cfg[key];
                        if (limitRes.overflow) {
                            notifyTrackWidthLimit(
                                key === 'ColumnWidth' ? '轨道列宽' : '轨道间距',
                                '本次修改后轨道区总宽度为 ' + Math.round(limitRes.total) + '，已超过上限 ' + limitRes.limit
                            );
                        }
                        // 轨道总宽变了 → ColumnRight 必须跟着重算（否则右侧留白停留在旧值）
                        if (limitRes.values) syncColumnRightFromLayout(cfg, keys);
                    } else if (key === 'ColumnLineWidth') {
                        // lazer 中 ColumnLineWidth 固定为 keys + 1 项；ini 未写到的项沿用默认值 2。
                        const normalized = new Array(keys + 1).fill(2);
                        for (let i = 0; i < Math.min(normalized.length, incoming.length); i++) {
                            normalized[i] = incoming[i];
                        }
                        cfg[key] = normalized;
                        appliedValue = normalized;
                    } else {
                        cfg[key] = incoming;
                        appliedValue = incoming;
                    }
                } else {
                    cfg[key] = value;
                }

                // 联动处理全局与运行时标志
                if (key === 'ShowJudgementLine') {
                    cfg.ShowJudgementLine = !!value;
                } else if (key === 'ColumnRight') {
                    const scale48 = (canvas && canvas.height) ? (canvas.height / 480) : 1;
                    const v = parseFloat(value);
                    const cr = !isNaN(v) ? v : 0;
                    cfg.ColumnRight = cr;
                    const virtualW = canvas ? (canvas.width / scale48) : 853;
                    const newStart = Math.max(-200, Math.round(virtualW - cr - computeLayoutOccupiedWidth(cfg, keys)));
                    cfg.ColumnStart = newStart;
                    syncParamInputValue('ColumnStart', newStart);
                } else if (key === 'ColumnStart') {
                    const v = parseFloat(value);
                    const cs = !isNaN(v) ? v : 136;
                    cfg.ColumnStart = cs;
                    syncColumnRightFromLayout(cfg, keys);
                    // 起始位置右移会压缩轨道区可用宽度：此时若现有总宽放不下，给出提示
                    const maxBlockNow = getTrackMaxWidth480(cfg, keys);
                    const blockNow = computeTrackBlockWidth480(cfg, keys);
                    if (blockNow > maxBlockNow) {
                        notifyTrackWidthLimit(
                            '轨道起始位置 ColumnStart',
                            '当前轨道总宽 ' + Math.round(blockNow) + ' 已超过可用上限 ' + Math.round(maxBlockNow),
                            false
                        );
                    }
                } else if (key === 'SplitStages') {
                    cfg.SplitStages = !!value;
                    syncColumnRightFromLayout(cfg, keys);
                } else if (key === 'StageSeparation') {
                    const v = parseFloat(value);
                    cfg.StageSeparation = !isNaN(v) ? v : 40;
                    syncColumnRightFromLayout(cfg, keys);
                } else if (key === 'UpsideDown') {
                    cfg.UpsideDown = !!value;
                }
            } else if (schema.tab === 'fonts') {
                if (key === 'ScorePrefix') skinFontsConfig.scorePrefix = value;
                else if (key === 'ScoreOverlap') skinFontsConfig.scoreOverlap = parseInt(value, 10) || 0;
                else if (key === 'ComboPrefix') {
                    const v = value ? String(value).trim() : '';
                    skinFontsConfig.comboPrefix = v || 'combo';
                    // 手动填写前缀 = ini 显式指定连击字体；清空则回到「沿用 score 字体贴图」
                    skinFontsConfig.hasExplicitComboPrefix = !!v;
                    // 若某些键位区块已用 [Mania] FontCombo 覆盖，则同步更新覆盖值，
                    // 保证「面板改什么，画布就用什么」（FontCombo 优先级高于 [Fonts] Combo）
                    for (const [, cfgItem] of maniaSkinConfigurations) {
                        if (cfgItem && cfgItem.FontCombo != null) cfgItem.FontCombo = v || null;
                    }
                }
                else if (key === 'ComboOverlap') skinFontsConfig.comboOverlap = parseInt(value, 10) || 0;
                else if (key === 'HitCirclePrefix') skinFontsConfig.hitCirclePrefix = value;
                else if (key === 'HitCircleOverlap') skinFontsConfig.hitCircleOverlap = parseInt(value, 10) || 0;
            } else if (schema.tab === 'general') {
                if (!currentSkinMetadata.general) currentSkinMetadata.general = {};
                currentSkinMetadata.general[key] = value;
                if (typeof refreshSkinCursor === 'function') refreshSkinCursor();
            } else if (schema.tab === 'colours') {
                if (!currentSkinMetadata.colours) currentSkinMetadata.colours = {};
                currentSkinMetadata.colours[key] = value;
            }

            // 触发画布重新渲染与卡片数值刷新
            drawFrame();

            // 连击字体前缀决定了「连击数字贴图」块是否存在，必须重建面板才能保持
            // 「面板显示的贴图」与「画布实际使用的贴图」一致
            if (key === 'ComboPrefix') {
                renderSkinEditorParams();
            }

            if (selectedCanvasElement && selectedCanvasElement.paramKey === key) {
                syncCanvasSelectedCard(selectedCanvasElement);
            }

            const rawTextarea = document.getElementById('rawIniTextarea');
            if (rawTextarea && rawTextarea.offsetParent !== null) {
                rawTextarea.value = generateSkinIniText();
            }

            return appliedValue;
        }

        // 6. 实时同步弹窗中的输入控件值
        function syncParamInputValue(paramKey, value) {
            const card = document.getElementById(`param-card-${paramKey}`);
            if (!card) return;
            const rangeInput = card.querySelector('input[type="range"]');
            const numInput = card.querySelector('input[type="number"]:not(.array-chip-input)');
            const textInput = card.querySelector('.param-text-input');
            const checkboxInput = card.querySelector('input[type="checkbox"]');
            if (checkboxInput) {
                checkboxInput.checked = !!value;
                const statusSpan = card.querySelector('.ios-switch + span') || card.querySelector('span[style*="font-size: 0.8rem"]');
                if (statusSpan) {
                    statusSpan.textContent = checkboxInput.checked ? '开启' : '关闭';
                    statusSpan.style.color = checkboxInput.checked ? '#ffffff' : 'rgba(255,255,255,0.45)';
                }
            }
            if (rangeInput) {
                rangeInput.value = value;
                const min = parseFloat(rangeInput.min) || 0;
                const max = parseFloat(rangeInput.max) || 100;
                const vf = (value != null && !isNaN(parseFloat(value))) ? parseFloat(value) : min;
                const pct = max > min ? Math.min(100, Math.max(0, ((vf - min) / (max - min)) * 100)) : 0;
                rangeInput.style.setProperty('--slider-pct', `${pct}%`);
            }
            if (numInput) numInput.value = value;
            if (textInput) {
                textInput.value = Array.isArray(value) ? value.map(Math.round).join(',') : value;
            }
            const chipInputs = card.querySelectorAll('.array-chip-input');
            if (chipInputs.length > 0 && Array.isArray(value)) {
                chipInputs.forEach((ci, idx) => {
                    if (value[idx] !== undefined) ci.value = Math.round(value[idx]);
                });
            }

            // 同步小节线颜色控件 (ColourBarline)
            if (paramKey === 'ColourBarline') {
                const picker = card.querySelector('.col-colour-picker');
                const alphaSlider = card.querySelector('.col-colour-slider');
                const colTextInput = card.querySelector('.color-text');
                const alphaLabel = card.querySelector('.col-colour-val');
                let r = 255, g = 255, b = 255, a = 255;
                if (value && typeof value === 'object') {
                    r = value.r != null ? value.r : 255;
                    g = value.g != null ? value.g : 255;
                    b = value.b != null ? value.b : 255;
                    a = value.a != null ? value.a : 255;
                } else if (typeof value === 'string') {
                    const parts = value.split(',').map(s => parseInt(s.trim(), 10));
                    if (parts.length >= 3 && !parts.slice(0, 3).some(isNaN)) {
                        r = parts[0]; g = parts[1]; b = parts[2];
                        a = (parts.length >= 4 && !isNaN(parts[3])) ? parts[3] : 255;
                    }
                }
                if (picker) picker.value = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
                if (alphaSlider) {
                    alphaSlider.value = a;
                    const pct = ((a / 255) * 100).toFixed(1) + '%';
                    alphaSlider.style.setProperty('--slider-pct', pct);
                }
                if (colTextInput) colTextInput.value = `${r},${g},${b},${a}`;
                if (alphaLabel) {
                    const pct = Math.round(a / 255 * 100);
                    alphaLabel.textContent = `A: ${a} (${pct}%)`;
                }
            }

            const previewBox = card.querySelector('.texture-preview-box');
            if (previewBox && typeof SKIN_INI_PARAM_SCHEMA !== 'undefined') {
                const schemaItem = SKIN_INI_PARAM_SCHEMA.find(it => it.key === paramKey);
                if (schemaItem) {
                    const keys = getActiveKeyCount();
                    const resolved = resolveTextureParam(keys, schemaItem);
                    renderTextureThumbnail(previewBox, resolved.img, resolved.state === 'missing' ? '未找到' : '未配置', 44, 32);
                }
            }
        }

        // 动态刷新 Mania 键位切换胶囊按钮 (仅展示实际从 skin.ini 中读取到的键位配置)
        function updateSkinEditorKeyPills() {
            const keyPillsContainer = document.getElementById('keyPillsContainer');
            if (!keyPillsContainer) return;

            // 获取从 skin.ini 中实际读取到的所有 Mania 键位配置
            const readKeys = [...maniaSkinConfigurations.keys()]
                .map(k => parseInt(k, 10))
                .filter(k => !isNaN(k) && k > 0)
                .sort((a, b) => a - b);

            // 若已有读取到的键位：如果当前选中的键位未在读取列表中，优先校准至有效键位
            if (readKeys.length > 0) {
                if (!readKeys.includes(activeEditorKeyCount)) {
                    if (currentBeatmap && readKeys.includes(currentBeatmap.keys)) {
                        activeEditorKeyCount = currentBeatmap.keys;
                    } else {
                        activeEditorKeyCount = readKeys[0];
                    }
                }
            }

            keyPillsContainer.innerHTML = '';

            if (readKeys.length === 0) {
                const emptyHint = document.createElement('span');
                emptyHint.className = 'key-pills-empty';
                emptyHint.textContent = '(未读取到配置)';
                keyPillsContainer.appendChild(emptyHint);
            } else {
                for (const k of readKeys) {
                    const pill = document.createElement('button');
                    pill.type = 'button';
                    pill.className = `key-pill ${k === activeEditorKeyCount ? 'active' : ''}`;
                    pill.textContent = `${k}K`;
                    pill.onclick = () => {
                        activeEditorKeyCount = k;
                        const allPills = keyPillsContainer.querySelectorAll('.key-pill');
                        allPills.forEach(p => p.classList.remove('active'));
                        pill.classList.add('active');
                        const tabLabel = document.getElementById('activeKeyCountTabLabel');
                        if (tabLabel) tabLabel.textContent = `${k}K`;
                        renderSkinEditorParams();
                        drawFrame();
                    };
                    keyPillsContainer.appendChild(pill);
                }
            }

            const tabLabel = document.getElementById('activeKeyCountTabLabel');
            if (tabLabel) {
                tabLabel.textContent = (readKeys.length > 0) ? `${activeEditorKeyCount}K` : '未读取';
            }
        }

        // 8. 切换编辑器 Tab 标签
        function switchEditorTab(tabName) {
            if (tabName === 'colours') tabName = 'mania';
            activeEditorTab = tabName;
            const tabs = document.querySelectorAll('#skinEditorTabs .tab-btn');
            tabs.forEach(btn => {
                if (btn.dataset.tab === tabName) btn.classList.add('active');
                else btn.classList.remove('active');
            });

            const keySelectorGroup = document.getElementById('keySelectorGroup');
            if (keySelectorGroup) {
                keySelectorGroup.style.display = (tabName === 'mania') ? 'flex' : 'none';
            }

            if (!isSkinEditingWorkspaceReady()) {
                syncSkinEditingAvailabilityUI();
                return;
            }

            const paramContainer = document.getElementById('paramListContainer');
            const rawContainer = document.getElementById('rawIniContainer');
            if (tabName === 'raw') {
                if (paramContainer) paramContainer.style.display = 'none';
                if (rawContainer) {
                    rawContainer.style.display = 'flex';
                    const textarea = document.getElementById('rawIniTextarea');
                    if (textarea) textarea.value = generateSkinIniText();
                }
            } else {
                if (paramContainer) paramContainer.style.display = 'block';
                if (rawContainer) rawContainer.style.display = 'none';
                renderSkinEditorParams();
            }
        }

        // 导入新皮肤后，如果编辑器正处于打开状态，立即用新皮肤数据重建面板内容。
        // 保留当前标签页、搜索词和键位选择，避免刷新时打断用户正在查看的位置。
        function refreshSkinEditorAfterSkinImport() {
            syncSkinEditingAvailabilityUI();
            if (!isSkinEditingWorkspaceReady()) return;

            const modal = document.getElementById('skinEditorModal');
            if (modal && modal.classList.contains('active')) {
                updateSkinEditorKeyPills();
                renderSkinEditorParams();

                const rawIniContainer = document.getElementById('rawIniContainer');
                const rawIniTextarea = document.getElementById('rawIniTextarea');
                if (rawIniContainer && rawIniTextarea && rawIniContainer.style.display !== 'none') {
                    rawIniTextarea.value = generateSkinIniText();
                }
            }

            const textureModal = document.getElementById('textureImageEditorModal');
            if (textureModal && textureModal.classList.contains('active') &&
                typeof renderPicker === 'function') {
                if (typeof textureImageEditorUi !== 'undefined' && textureImageEditorUi &&
                    typeof textureImageEditorUi.refreshAfterSkinImport === 'function') {
                    textureImageEditorUi.refreshAfterSkinImport();
                    return;
                }
                renderPicker();
                renderTabs();
                setViews(true);
            }
        }
