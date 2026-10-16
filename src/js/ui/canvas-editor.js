// ============================================================================
// canvas-editor.js - 画布可交互元素索引与选中元素卡片
// 依赖：core/state.js、render/frame.js
// ============================================================================

        // =========================================================================
        // osu!mania 可视化皮肤编辑器 & skin.ini 参数修改系统 (Visual Skin Editor Engine)
        // =========================================================================

        // 打击特效宽度 (LightingNWidth / LightingLWidth) 的两种特效定义。
        // 二者是**相互独立**的两套贴图与宽度参数，画布上必须能分别点选：
        //   - LightingN (单键打击特效)：打到单键音符时的爆炸光效
        //   - LightingL (长条打击特效)：长条按住期间持续播放的光效
        // 两者的几何中心完全重合（水平 = 对应轨道中心，垂直 = 判定线 HitPosition），
        // 所以画布上用「以判定线为界、上下半分色」的方式把二者区分开，
        // 并且都不参与位置拖动，只支持左右拖拽调整宽度。
        const LIGHTING_WIDTH_KINDS = [
            {
                widthKey: 'ExplosionWidth',        // cfg 字段 (ini 键 = LightingNWidth)
                paramKey: 'LightingNWidth',        // 参数面板卡片键
                lookup: LML.ExplosionImage,
                textureParamKey: 'LightingN',
                defaultName: 'lightingN',
                zhLabel: '单键打击特效',
                elementPrefix: 'lighting_n_col_',
                belowLine: false,                  // 判定线上半部分
                color: 'rgba(120, 220, 255, 0.62)'
            },
            {
                widthKey: 'HoldNoteLightWidth',    // cfg 字段 (ini 键 = LightingLWidth)
                paramKey: 'LightingLWidth',
                lookup: LML.HoldNoteLightImage,
                textureParamKey: 'LightingL',
                defaultName: 'lightingL',
                zhLabel: '长条打击特效',
                elementPrefix: 'lighting_l_col_',
                belowLine: true,                   // 判定线下半部分
                color: 'rgba(255, 200, 90, 0.62)'
            }
        ];

        // 1. 更新当前帧的可交互画布元素外接矩形与选中框渲染
        function syncCanvasSelectedCard(elem) {
            const card = document.getElementById('canvasSelectedCard');
            if (!card || !canvas || !elem) return;

            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;

            const pad = 6;
            const domX = (elem.x - pad) * scaleX;
            const domY = (elem.y - pad) * scaleY;
            const domW = (elem.w + pad * 2) * scaleX;
            const domH = (elem.h + pad * 2) * scaleY;

            card.style.display = 'flex';
            const cardW = card.offsetWidth || 230;
            const cardH = card.offsetHeight || 34;

            // 紧贴矩形框上方吸附展示；若为高通顶的轨道元素则吸附在顶部
            let cardTop = domY - cardH - 6;
            if (elem.h >= canvas.height * 0.7) {
                cardTop = 16;
            } else if (cardTop < 6) {
                cardTop = domY + domH + 6;
                if (cardTop + cardH > rect.height - 6) {
                    cardTop = Math.max(6, rect.height - cardH - 6);
                }
            }

            // 水平位置：居中对齐选中元素或靠边防止溢出
            let cardLeft = domX + (domW - cardW) / 2;
            if (cardLeft < 6) cardLeft = 6;
            if (cardLeft + cardW > rect.width - 6) {
                cardLeft = rect.width - cardW - 6;
            }

            card.style.left = `${cardLeft}px`;
            card.style.top = `${cardTop}px`;

            // 更新工具栏文字与显示
            const titleEl = document.getElementById('cardTitle');
            const replaceBtn = document.getElementById('cardReplaceTextureBtn');
            const replaceScorebarBgBtn = document.getElementById('cardReplaceScorebarBgBtn');
            const replaceScorebarColourBtn = document.getElementById('cardReplaceScorebarColourBtn');

            if (titleEl) {
                titleEl.textContent = (elem.name || '').replace(/\s*\([^)]*\)/g, '').trim();
            }

            if (elem.id === 'healthDisplay') {
                if (replaceBtn) replaceBtn.style.display = 'none';
                if (replaceScorebarBgBtn) replaceScorebarBgBtn.style.display = 'inline-flex';
                if (replaceScorebarColourBtn) replaceScorebarColourBtn.style.display = 'inline-flex';
            } else {
                if (replaceScorebarBgBtn) replaceScorebarBgBtn.style.display = 'none';
                if (replaceScorebarColourBtn) replaceScorebarColourBtn.style.display = 'none';
                if (replaceBtn) {
                    replaceBtn.style.display = (elem.isTexture && elem.id !== 'combo') ? 'inline-flex' : 'none';
                    // 判定提示没有单张对应贴图：按钮仍显示「替换贴图」，
                    // 点击后跳转参数面板并高亮全部判定贴图，而不是直接弹选取文件窗口。
                    const isJudgementElem = (elem.id === 'judgement');
                    const isKeyImageElem = elem.id.startsWith('key_') && elem.colIndex != null;
                    if (isJudgementElem) {
                        replaceBtn.title = '定位到 skin.ini 贴图区域并高亮全部判定贴图 (彩300g / 黄300 / 绿200 / 蓝100 / 灰50 / Miss)';
                    } else if (isKeyImageElem) {
                        replaceBtn.title = `定位到详细设置并高亮第 ${elem.colIndex + 1} 轨的 KeyImage 与 KeyImageD`;
                    } else if (elem.openAnimOnReplace) {
                        replaceBtn.title = '导入动态贴图序列 (多帧动画)：按键发光 StageLight / 打击特效 LightingN / LightingL 都是逐帧播放的动态贴图';
                    } else {
                        replaceBtn.title = '替换本地贴图图片';
                    }
                    const replaceBtnSpan = replaceBtn.querySelector('span');
                    if (replaceBtnSpan) {
                        replaceBtnSpan.textContent = isJudgementElem
                            ? '替换贴图'
                            : (isKeyImageElem ? '定位按键贴图' : '替换贴图');
                    }
                }
            }

            // 轨道拖拽模式切换与快捷步进调节器展示控制
            const dragModeToggle = document.getElementById('trackDragModeToggle');
            const trackModeWidthBtn = document.getElementById('trackModeWidthBtn');
            const trackModeSpacingBtn = document.getElementById('trackModeSpacingBtn');
            const quickStepper = document.getElementById('cardQuickStepper');
            const widthStepper = document.getElementById('cardWidthStepper');
            const spacingStepper = document.getElementById('cardSpacingStepper');
            const posStepper = document.getElementById('cardPosStepper');
            const widthValEl = document.getElementById('cardWidthVal');
            const spacingValEl = document.getElementById('cardSpacingVal');
            const posValEl = document.getElementById('cardPosVal');
            const cardSpacingLabel = document.getElementById('cardSpacingLabel');

            const keys = getActiveKeyCount();
            const cfg = maniaSkinConfigurations.get(keys) || getManiaConfigForKeys(keys) || {};

            const isPositionalParam = (
                elem.paramKey === 'HitPosition' ||
                elem.paramKey === 'ScorePosition' ||
                elem.paramKey === 'ComboPosition' ||
                elem.paramKey === 'LightPosition' ||
                (elem.dragAxis === 'y' && elem.paramKey)
            );

            if (elem.dragType === 'score_percent_width') {
                if (dragModeToggle) dragModeToggle.style.display = 'none';
                if (spacingStepper) spacingStepper.style.display = 'none';
                if (posStepper) posStepper.style.display = 'none';
                if (quickStepper) quickStepper.style.display = 'flex';
                if (widthStepper) widthStepper.style.display = 'flex';
                const width = getScorePercentPaddingWidth(keys);
                if (widthValEl) {
                    widthValEl.textContent = width;
                    widthValEl.title = '百分号透明垫片的 1x 逻辑宽度；点击可直接输入';
                }
            } else if (elem.dragType === 'lighting_width') {
                // 打击特效宽度：位置被判定线 + 轨道中心锁死，卡片上只给「宽度」步进器
                if (dragModeToggle) dragModeToggle.style.display = 'none';
                if (spacingStepper) spacingStepper.style.display = 'none';
                if (posStepper) posStepper.style.display = 'none';
                if (quickStepper) quickStepper.style.display = 'flex';
                if (widthStepper) widthStepper.style.display = 'flex';
                const lightCfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4) || {};
                const lightArr = Array.isArray(lightCfg[elem.paramKey]) ? lightCfg[elem.paramKey] : [];
                const rawCwRes = getManiaSkinConfig(keys, LML.ColumnWidth, elem.colIndex);
                const rawCw = (rawCwRes && rawCwRes.value > 0) ? rawCwRes.value : 30;
                const shown = (lightArr[elem.colIndex] != null && lightArr[elem.colIndex] > 0) ? lightArr[elem.colIndex] : rawCw;
                if (widthValEl) {
                    widthValEl.textContent = Math.round(shown);
                    widthValEl.title = (lightArr[elem.colIndex] > 0)
                        ? '已单独指定该轨宽度，点击可直接输入'
                        : `未单独指定，当前跟随列宽 ${Math.round(rawCw)}px，点击可直接输入`;
                }
            } else if (elem.id.startsWith('track_col_')) {
                if (dragModeToggle) dragModeToggle.style.display = 'inline-flex';
                if (trackModeWidthBtn) {
                    if (currentTrackDragMode === 'width') trackModeWidthBtn.classList.add('active');
                    else trackModeWidthBtn.classList.remove('active');
                }
                if (trackModeSpacingBtn) {
                    if (currentTrackDragMode === 'spacing') trackModeSpacingBtn.classList.add('active');
                    else trackModeSpacingBtn.classList.remove('active');
                }

                if (quickStepper) quickStepper.style.display = 'flex';
                if (widthStepper) widthStepper.style.display = 'flex';
                const curW = (cfg.ColumnWidth && cfg.ColumnWidth[elem.colIndex] != null) ? Math.round(cfg.ColumnWidth[elem.colIndex]) : 30;
                if (widthValEl) widthValEl.textContent = curW;

                if (spacingStepper) {
                    if (elem.colIndex > 0) {
                        spacingStepper.style.display = 'flex';
                        const spacingIdx = elem.colIndex - 1;
                        const curS = (cfg.ColumnSpacing && cfg.ColumnSpacing[spacingIdx] != null) ? Math.round(cfg.ColumnSpacing[spacingIdx]) : 0;
                        if (spacingValEl) spacingValEl.textContent = curS;
                        if (cardSpacingLabel) cardSpacingLabel.textContent = '前距';
                    } else {
                        // 第一轨没有前距，隐藏调节选项
                        spacingStepper.style.display = 'none';
                    }
                }
                if (posStepper) posStepper.style.display = 'none';
            } else if (isPositionalParam) {
                if (dragModeToggle) dragModeToggle.style.display = 'none';
                if (widthStepper) widthStepper.style.display = 'none';
                if (spacingStepper) spacingStepper.style.display = 'none';
                if (quickStepper) quickStepper.style.display = 'flex';
                if (posStepper) posStepper.style.display = 'flex';

                let curVal = 0;
                if (elem.paramKey === 'ComboPosition') {
                    curVal = (cfg.ComboPosition != null) ? cfg.ComboPosition : 111;
                } else if (elem.paramKey === 'ScorePosition') {
                    curVal = (cfg.ScorePosition != null) ? cfg.ScorePosition : 300;
                } else if (elem.paramKey === 'HitPosition') {
                    curVal = (cfg.HitPosition != null) ? cfg.HitPosition : 402;
                } else if (elem.paramKey === 'LightPosition') {
                    curVal = (cfg.LightPosition != null) ? cfg.LightPosition : 413;
                } else if (typeof cfg[elem.paramKey] === 'number') {
                    curVal = cfg[elem.paramKey];
                }
                if (posValEl) posValEl.textContent = Math.round(curVal);
            } else {
                if (dragModeToggle) dragModeToggle.style.display = 'none';
                if (quickStepper) quickStepper.style.display = 'none';
                if (widthStepper) widthStepper.style.display = 'none';
                if (spacingStepper) spacingStepper.style.display = 'none';
                if (posStepper) posStepper.style.display = 'none';
            }

            const applyAllTracksBtn = document.getElementById('cardApplyAllTracksBtn');
            const locateComboTextureBtn = document.getElementById('cardLocateComboTextureBtn');
            if (applyAllTracksBtn) {
                applyAllTracksBtn.style.display = elem.id.startsWith('track_col_') ? 'inline-flex' : 'none';
            }
            if (locateComboTextureBtn) {
                locateComboTextureBtn.style.display = (elem.id === 'combo') ? 'inline-flex' : 'none';
            }
            const previewJudgementBtn = document.getElementById('cardPreviewJudgementBtn');
            if (previewJudgementBtn) {
                previewJudgementBtn.style.display = (elem.id === 'judgement') ? 'inline-flex' : 'none';
                previewJudgementBtn.classList.toggle('active', isPreviewJudgementActive);
                const span = previewJudgementBtn.querySelector('span');
                if (span) span.textContent = isPreviewJudgementActive ? '停止演示' : '演示判定';
            }

            // 同步第 2 行轨道底色与透明度控制项
            const trackColourRow = document.getElementById('cardTrackColourRow');
            if (trackColourRow) {
                if (elem.id.startsWith('track_col_')) {
                    trackColourRow.style.display = 'flex';
                    const col = elem.colIndex;
                    const cItem = (cfg.ColumnColour && cfg.ColumnColour[col]) ? cfg.ColumnColour[col] : { r: 0, g: 0, b: 0, a: 255 };
                    const hex = `#${((1 << 24) + (cItem.r << 16) + (cItem.g << 8) + cItem.b).toString(16).slice(1)}`;
                    const a = (cItem.a != null) ? cItem.a : 255;
                    const picker = document.getElementById('cardColPicker');
                    const slider = document.getElementById('cardColOpacitySlider');
                    if (picker) picker.value = hex;
                    if (slider) {
                        slider.value = a;
                        const pct = ((a / 255) * 100).toFixed(1) + '%';
                        slider.style.setProperty('--slider-pct', pct);
                    }
                    const opacityValEl = document.getElementById('cardColOpacityVal');
                    if (opacityValEl) opacityValEl.textContent = `${a}`;
                } else {
                    trackColourRow.style.display = 'none';
                }
            }

            // 同步连击专用的 Hold 变色与断连遮罩两行。
            const comboHoldRow = document.getElementById('cardComboHoldRow');
            const comboBreakRow = document.getElementById('cardComboBreakRow');
            if (comboHoldRow && comboBreakRow) {
                const isCombo = elem.id === 'combo';
                comboHoldRow.style.display = isCombo ? 'flex' : 'none';
                comboBreakRow.style.display = isCombo ? 'flex' : 'none';

                if (isCombo) {
                    const holdColour = cfg.ColourHold || { r: 255, g: 191, b: 51, a: 255 };
                    const holdAlpha = (holdColour.a != null) ? holdColour.a : 255;
                    const holdHex = `#${((1 << 24) + (holdColour.r << 16) + (holdColour.g << 8) + holdColour.b).toString(16).slice(1)}`;
                    const holdPicker = document.getElementById('cardComboHoldPicker');
                    const holdAlphaSlider = document.getElementById('cardComboHoldAlpha');
                    const holdAlphaVal = document.getElementById('cardComboHoldAlphaVal');
                    if (holdPicker) holdPicker.value = holdHex;
                    if (holdAlphaSlider) {
                        holdAlphaSlider.value = holdAlpha;
                        holdAlphaSlider.style.setProperty('--slider-pct', `${((holdAlpha / 255) * 100).toFixed(1)}%`);
                    }
                    if (holdAlphaVal) holdAlphaVal.textContent = `${holdAlpha}`;

                    const breakColour = cfg.ComboBreakColour || { r: 255, g: 0, b: 0 };
                    const breakHex = `#${((1 << 24) + (breakColour.r << 16) + (breakColour.g << 8) + breakColour.b).toString(16).slice(1)}`;
                    const breakPicker = document.getElementById('cardComboBreakPicker');
                    if (breakPicker) breakPicker.value = breakHex;
                }
            }
        }
