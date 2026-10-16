// ============================================================================
// canvas-element-index.js - 画布元素命中矩形索引构建
// 从 canvas-editor.js 按职责拆分。
// ============================================================================

        function updateCanvasInteractiveElements(layout) {
            if (!canvasEditMode) {
                canvasInteractiveElements = [];
                const card = document.getElementById('canvasSelectedCard');
                if (card) card.style.display = 'none';
                return;
            }

            const { keys, startX, totalTrackWidth, trailingSpacing, colWidths, colSpacings = [], colXCache, hitPos, scorePosFromSkin, comboPosX, comboPosY, scale48, scale768, stageLightLpRes, hpRes, activeNoteElements, hudInteractiveElements, isUpsideDown, activeStageLightBoxes = [] } = layout;
            canvasInteractiveElements = [];

            // 1.0 音符元素 (最高优先级，包含普通单键音符、长条头、长条身、长条尾)
            if (activeNoteElements && activeNoteElements.length > 0) {
                for (const elem of activeNoteElements) {
                    canvasInteractiveElements.push(elem);
                }
            }

            // 1.1 各列按键 (KeyImage0..N) - 优先于轨道与判定线被选中
            // UpsideDown 时整个演奏区沿画布垂直中线镜像，但按键可占用的高度（判定线到画布边缘）两种模式一致
            const keyAreaHeight = canvas.height - hitPos;
            for (let col = 0; col < keys; col++) {
                const kw = colWidths[col] || colWidths[0];
                const kx = colXCache[col];

                const keyImg = getManiaSkinImage(keys, LML.KeyImage, col) || getManiaSkinImage(keys, LML.KeyImageDown, col);
                let keyX = kx;
                let keyW = kw;
                let keyY, keyH;
                let keyImageResizeEdgeY = null;
                let keyImageStableRefWidth = null;
                let keyImageIs2x = false;

                if (keyImg && keyImg.width > 0 && keyImg.height > 0) {
                    const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, col);
                    const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;
                    const is2x = !!keyImg._is2x;
                    const scaleFactor = is2x ? 3.2 : 1.6;
                    const stableRefW = rawColW * scaleFactor;
                    keyImageStableRefWidth = stableRefW;
                    keyImageIs2x = is2x;

                    let drawHeight;
                    if (Math.abs(keyImg.width - stableRefW) < 1) {
                        drawHeight = kw * keyImg.height / keyImg.width;
                    } else {
                        drawHeight = kw * keyImg.height / stableRefW;
                    }
                    keyImageResizeEdgeY = isUpsideDown ? 0 : Math.max(0, Math.min(canvas.height, canvas.height - drawHeight));
                    if (isUpsideDown) {
                        // 镜像后按键位于判定线上方：真实屏幕 y 覆盖 [0, hitLineY]
                        keyY = 0;
                        keyH = Math.max(drawHeight, (canvas.height - hitPos) + 12);
                    } else {
                        const drawY = canvas.height - drawHeight;
                        // 按键贴图真实顶部可能高于 hitPos，确保从贴图真实绘制顶端覆盖到画布底部
                        keyY = Math.max(0, Math.min(drawY, hitPos - 12));
                        keyH = canvas.height - keyY;
                    }
                } else {
                    const pad = 8;
                    const dia = Math.max(16, Math.min(kw, keyAreaHeight) - pad * 2);
                    if (isUpsideDown) {
                        keyY = 0;
                        keyH = Math.max(dia + pad * 2, (canvas.height - hitPos) + 12);
                    } else {
                        keyY = Math.min(canvas.height - dia - pad * 2, hitPos - 12);
                        keyH = canvas.height - keyY;
                    }
                }

                // 精准获取对应列的贴图文件名 (用于状态显示和贴图上传替换)
                const fc = computeFallbackColumnIndex(keys, col);
                let currentTexName = null;
                const mCfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4);
                if (mCfg && mCfg.ImageLookups) {
                    currentTexName = mCfg.ImageLookups.get(`KeyImage${col}`) ||
                                     mCfg.ImageLookups.get(`keyimage${col}`) ||
                                     mCfg.ImageLookups.get('KeyImage') ||
                                     mCfg.ImageLookups.get('keyimage');
                }
                if (!currentTexName) {
                    currentTexName = defaultFilenameForLookup(LML.KeyImage, fc) || `mania-key${fc}`;
                }

                canvasInteractiveElements.push({
                    id: `key_${col}`,
                    name: `第 ${col + 1} 轨按键`,
                    paramKey: `KeyImage${col}`,
                    fallbackParamKey: 'KeyImage',
                    category: 'Mania',
                    x: keyX,
                    y: keyY,
                    w: keyW,
                    h: keyH,
                    isTexture: true,
                    textureName: currentTexName,
                    textureKey: LML.KeyImage,
                    colIndex: col,
                    dragAxis: null,
                    keyImageHeightAdjustable: keyImageResizeEdgeY != null,
                    keyImageResizeEdgeY: keyImageResizeEdgeY,
                    keyImageStableRefWidth: keyImageStableRefWidth,
                    keyImageIs2x: keyImageIs2x,
                    valFormatter: () => currentTexName
                });
            }

            // 1.2 判定线 (HitPosition / StageHint)
            // UpsideDown 时判定线位于镜像位置 (canvas.height - hitPos)
            const hitLineY = isUpsideDown ? (canvas.height - hitPos) : hitPos;
            canvasInteractiveElements.push({
                id: 'hitPosition',
                name: '判定线',
                paramKey: 'HitPosition',
                category: 'Mania',
                x: startX,
                y: hitLineY - 16,
                w: totalTrackWidth,
                h: 32,
                // 判定线的真实中心线 Y：与发光位置经常几乎重合，命中检测需要用它按「就近」归属
                lineY: hitLineY,
                // 判定线只负责位置 (HitPosition)：不提供「替换贴图」按钮。
                // 判定提示贴图 StageHint 请在详细设置的贴图分类里替换，避免与白色判定线混淆。
                isTexture: false,
                dragAxis: 'y',
                valFormatter: () => {
                    const cfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4);
                    return `${cfg && cfg.HitPosition != null ? Math.round(cfg.HitPosition) : 402}`;
                }
            });

            // 1.3 连击数显示 (ComboPosition)
            canvasInteractiveElements.push({
                id: 'combo',
                name: '连击数',
                paramKey: 'ComboPosition',
                category: 'Mania',
                x: comboPosX - 80,
                y: comboPosY - 35,
                w: 160,
                h: 70,
                isTexture: false,
                textureName: null,
                textureKey: null,
                dragAxis: 'y',
                valFormatter: () => {
                    const cfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4);
                    return `${cfg && cfg.ComboPosition != null ? Math.round(cfg.ComboPosition) : 111}`;
                }
            });

            // 1.4 判定评价文字显示 (ScorePosition)
            const defaultScorePosRaw = isUpsideDown ? (480 - DEFAULT_SCORE_POSITION) : DEFAULT_SCORE_POSITION;
            const currentJudgementY = (scorePosFromSkin !== null) ? scorePosFromSkin : defaultScorePosRaw * scale48;
            canvasInteractiveElements.push({
                id: 'judgement',
                name: '判定结果评价',
                paramKey: 'ScorePosition',
                category: 'Mania',
                x: startX + totalTrackWidth / 2 - 80,
                y: currentJudgementY - 35,
                w: 160,
                h: 70,
                isTexture: true,
                // 判定提示由 6 张贴图共同决定，此处的 textureParamKey 仅作记录；
                // 「替换贴图」按钮会被特判为定位全部判定贴图，不会走单张上传。
                textureParamKey: 'Hit300g',
                textureName: 'Hit300g',
                textureKey: LML.Hit300g,
                dragAxis: 'y',
                valFormatter: () => {
                    const cfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4);
                    return `${cfg && cfg.ScorePosition != null ? Math.round(cfg.ScorePosition) : 300}`;
                }
            });

            // 1.5 按键发光位置 (LightPosition) —— 同时承载「按键发光贴图 StageLight / mania-stage-light」
            // 语义：只要按下按键，轨道上就会常驻播放这段发光动画；LightPosition 决定它的渲染位置。
            //       它不是打击特效（打到 note 才有的 LightingN / LightingL 是另外两套贴图）。
            const lightPosRaw = (stageLightLpRes && stageLightLpRes.value != null) ? stageLightLpRes.value : ((hpRes && hpRes.value) ? hpRes.value : 413);
            const effectiveLightPosRaw = isUpsideDown ? (480 - lightPosRaw) : lightPosRaw;
            const lightLineY = effectiveLightPosRaw * scale48;

            // 「位置手柄」：当前没有按下按键（光柱不可见）时用来选中并拖动 LightPosition 的兜底区域。
            // 只覆盖发光位置线上下各 20px；一旦光柱真的绘制出来，选中框会直接框住贴图本体。
            const lightHandleH = 40;
            const lightHandleY = lightLineY - lightHandleH / 2;

            // 本帧真实绘制出来的光柱区域（按键按下 / 预览发光时才存在），合并所有轨道的包围盒。
            // 选中框 = 贴图本体（与打击特效一致），这样才能直接框住实际画出来的 StageLight。
            let lightVisibleLeft = Infinity;
            let lightVisibleTop = Infinity;
            let lightVisibleRight = -Infinity;
            let lightVisibleBottom = -Infinity;
            for (const b of activeStageLightBoxes) {
                if (!b || !(b.w > 0) || !(b.h > 0)) continue;
                lightVisibleLeft = Math.min(lightVisibleLeft, b.x);
                lightVisibleTop = Math.min(lightVisibleTop, b.y);
                lightVisibleRight = Math.max(lightVisibleRight, b.x + b.w);
                lightVisibleBottom = Math.max(lightVisibleBottom, b.y + b.h);
            }
            const hasVisibleStageLight = lightVisibleRight > lightVisibleLeft && lightVisibleBottom > lightVisibleTop;

            canvasInteractiveElements.push({
                id: 'lightPosition',
                name: '按键发光位置',
                paramKey: 'LightPosition',
                category: 'Mania',
                // 有可见光柱时选中框直接框住贴图本体；没有光柱时退回细手柄，保证 LightPosition 始终可选中可拖拽
                x: hasVisibleStageLight ? lightVisibleLeft : startX,
                y: hasVisibleStageLight ? lightVisibleTop : lightHandleY,
                w: hasVisibleStageLight ? (lightVisibleRight - lightVisibleLeft) : totalTrackWidth,
                h: hasVisibleStageLight ? (lightVisibleBottom - lightVisibleTop) : lightHandleH,
                // 真实中心线 Y：判定线与发光位置重合时，命中检测用它按「就近」归属
                lineY: lightLineY,
                // 常驻手柄 band（无可见光柱时可点，用于调整 LightPosition）
                handleY: lightHandleY,
                handleH: lightHandleH,
                // 可见光柱 band（仅当本帧真的画出光柱时有效；命中优先级高于 KeyImage / 轨道，低于其余元素）
                visibleY: hasVisibleStageLight ? lightVisibleTop : null,
                visibleH: hasVisibleStageLight ? (lightVisibleBottom - lightVisibleTop) : 0,
                isTexture: true,
                // 画布上点选「替换贴图」时，要写入的 ini 贴图参数键是 StageLight（而不是数值参数 LightPosition），
                // 贴图名沿用 osu! 默认文件名 mania-stage-light，保证导出的 skin.ini 干净可读。
                textureParamKey: 'StageLight',
                textureName: 'mania-stage-light',
                textureKey: LML.LightImage,
                // 按键发光和打击特效一样是「逐帧动画序列」(mania-stage-light-0 / -1 / …，
                // 帧率由 LightFramePerSecond 决定) → 点「替换贴图」直接打开动态贴图序列管理器，
                // 与 LightingN / LightingL 行为保持一致（单帧也能导入）。
                openAnimOnReplace: true,
                dragAxis: 'y',
                valFormatter: () => {
                    const cfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4);
                    return `${cfg && cfg.LightPosition != null ? Math.round(cfg.LightPosition) : 413}`;
                }
            });

            // 1.55 打击特效宽度元素 (LightingNWidth / LightingLWidth) —— 逐轨、以判定线上下半分色区分
            // 几何规则（对齐 osu!lazer LegacyHitExplosion / LegacyBodyPiece）：
            //   水平中心 = 对应轨道中心；垂直中心 = 判定线 HitPosition。
            // 选中规则（本次调整）：
            //   画布上不再绘制任何「常驻虚线占位框」。只有在播放/预览时该轨的打击特效**真的渲染出来了**
            //   （单键爆发 LightingN / 长条按住光效 LightingL），对应元素才登记进可点选列表——
            //   与音符等元素完全一致：出现才能选中。已被选中的元素会持续保留，保证选中卡片与宽度拖拽可用。
            // 位置绑定 HitPosition + 轨道中心 → 不参与位置拖动，只允许左右拖拽调整宽度。
            const lightingCfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4) || {};
            const activeLightingSet = new Set();
            for (const b of (layout.activeLightingBoxes || [])) {
                if (b) activeLightingSet.add(b.kind + '#' + b.col);
            }
            // 已选中的打击特效元素即使本帧特效未出现也保留登记（否则选中卡片会瞬间消失、宽度拖不动）
            if (selectedCanvasElement && selectedCanvasElement.dragType === 'lighting_width' && selectedCanvasElement.colIndex != null) {
                const selKind = (selectedCanvasElement.textureParamKey === 'LightingL') ? 'LightingL' : 'LightingN';
                activeLightingSet.add(selKind + '#' + selectedCanvasElement.colIndex);
            }

            for (const lk of LIGHTING_WIDTH_KINDS) {
                const widthArr = Array.isArray(lightingCfg[lk.widthKey]) ? lightingCfg[lk.widthKey] : [];
                for (let col = 0; col < keys; col++) {
                    // 关键：该轨该特效本帧没出现、且不是当前选中项 → 不登记，也就不可点选
                    if (!activeLightingSet.has(lk.textureParamKey + '#' + col)) continue;

                    const colW = colWidths[col] || colWidths[0];
                    const cx = colXCache[col] + colW / 2;
                    const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, col);
                    const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;
                    const explicit = (widthArr[col] != null && widthArr[col] > 0);
                    // 未显式配置 (=0) 时实际生效宽度 = 当前列宽（与 config.js ExplosionScale / HoldNoteLightScale 一致）
                    const curVal = explicit ? widthArr[col] : rawColW;

                    const lightImg = getManiaSkinImage(keys, lk.lookup, col);
                    let baseW, baseH;
                    if (lightImg && lightImg.width > 0 && lightImg.height > 0) {
                        const is2x = !!lightImg._is2x;
                        baseW = (is2x ? lightImg.width / 2 : lightImg.width) * scale768;
                        baseH = (is2x ? lightImg.height / 2 : lightImg.height) * scale768;
                    } else {
                        // 皮肤里没有这张贴图时，按 30px (DEFAULT_COLUMN_SIZE) 的等效尺寸兜底
                        baseW = 30 * scale48;
                        baseH = 30 * scale48;
                    }
                    const boxW = Math.max(8, baseW * curVal / 30);
                    const boxH = Math.max(8, baseH * curVal / 30);
                    // 框宽取「特效实际宽度」与「列宽」的较大者：保证特效比轨道窄时依然好点中
                    const bandW = Math.max(boxW, colW);
                    // 可点选高度 —— 关键：打击特效贴图是**以判定线为中心上下对称**绘制的，
                    // 而判定线元素 (hitPosition) 的可点选带正好横跨判定线 ±16px。
                    // 因此这里必须让打击特效的可点选区域覆盖「整张贴图高度」，
                    // 才能保证点在可见特效的任意位置都选中特效、而不是被判定线抢走。
                    //   只有一种特效出现 → 整贴图高度（判定线居中）
                    //   单键与长条同时在（长条头命中后的极短窗口）→ 退化为判定线上下各半，
                    //     保证两者仍能被分别选中
                    const otherKindKey = (lk.textureParamKey === 'LightingN' ? 'LightingL' : 'LightingN') + '#' + col;
                    const onlyKindActive = !activeLightingSet.has(otherKindKey);
                    let pickY, pickH;
                    if (onlyKindActive) {
                        pickH = Math.max(26, Math.min(140, boxH));
                        pickY = hitLineY - pickH / 2;
                    } else {
                        pickH = Math.max(26, Math.min(70, boxH / 2));
                        pickY = lk.belowLine ? hitLineY : (hitLineY - pickH);
                    }
                    const elemId = `${lk.elementPrefix}${col}`;

                    const lightElem = {
                        id: elemId,
                        name: `第 ${col + 1} 轨 ${lk.zhLabel}`,
                        paramKey: lk.widthKey,
                        colIndex: col,
                        category: 'Mania',
                        x: cx - bandW / 2,
                        y: pickY,
                        w: bandW,
                        h: pickH,
                        isTexture: true,
                        // 「替换贴图」必须写入贴图参数键 (LightingN / LightingL)，绝不能写入宽度数组参数
                        textureParamKey: lk.textureParamKey,
                        textureName: (resolveTextureParam(keys, { key: lk.textureParamKey, default: lk.defaultName }) || {}).name || lk.defaultName,
                        textureKey: lk.lookup,
                        // 位置绑定 HitPosition + 轨道中心 → 不允许拖位置；dragType 走独立的宽度分支
                        dragAxis: 'x',
                        dragType: 'lighting_width',
                        // 打击特效是动态贴图 → 点「替换贴图」直接打开动态贴图序列管理器
                        openAnimOnReplace: true,
                        lightWidthValue: curVal,
                        lightWidthExplicit: explicit,
                        pxPerUnit: baseW / 30,
                        valFormatter: () => `${Math.round(curVal)}px`
                    };
                    canvasInteractiveElements.push(lightElem);
                }
            }

            // 1.6 状态血条
            const healthBarX = startX + totalTrackWidth + (trailingSpacing || 0);
            canvasInteractiveElements.push({
                id: 'healthDisplay',
                name: '状态血条',
                paramKey: 'scorebar-colour',
                category: 'Mania',
                x: healthBarX,
                y: canvas.height - 400 * scale768,
                w: Math.max(30, 42 * scale768),
                h: 400 * scale768,
                isTexture: true,
                textureName: 'scorebar-colour',
                dragAxis: null,
                valFormatter: () => '满血常驻'
            });

            // 1.7 右上角 HUD 独立数字与符号 (每个数字 0-9、小数点 dot、百分号 percent 均可独立选中与替换贴图)
            if (hudInteractiveElements && hudInteractiveElements.length > 0) {
                for (const hElem of hudInteractiveElements) {
                    canvasInteractiveElements.push(hElem);
                }
            }

            // 1.8 各列独立轨道 (ColumnWidth[0..N]) - 每个轨道单独选中，可直接左右拖拽调整宽度或间距 (两轨间最小间距为0)
            for (let col = 0; col < keys; col++) {
                const cw = colWidths[col] || colWidths[0];
                const cx = colXCache[col];
                canvasInteractiveElements.push({
                    id: `track_col_${col}`,
                    name: `第 ${col + 1} 轨`,
                    paramKey: 'ColumnWidth',
                    category: 'Mania',
                    x: cx,
                    y: 0,
                    w: cw,
                    h: canvas.height,
                    colIndex: col,
                    isTexture: false,
                    dragAxis: 'x',
                    dragType: 'track_column',
                    valFormatter: () => {
                        const cfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4) || {};
                        const w = (cfg.ColumnWidth && cfg.ColumnWidth[col] != null) ? Math.round(cfg.ColumnWidth[col]) : 30;
                        if (col > 0) {
                            const s = (cfg.ColumnSpacing && cfg.ColumnSpacing[col - 1] != null) ? Math.round(cfg.ColumnSpacing[col - 1]) : 0;
                            return `宽: ${w}px | 前距: ${s}px`;
                        }
                        return `宽: ${w}px`;
                    }
                });
            }

            // 1.9 舞台两侧边界底图 (StageLeft / StageRight)
            const stageLeftImg = getManiaSkinImage(keys, LML.LeftStageImage);
            let slW = 0;
            if (stageLeftImg && stageLeftImg.width > 0 && stageLeftImg.height > 0) {
                const is2x = !!stageLeftImg._is2x;
                const nativeW = is2x ? stageLeftImg.width / 2 : stageLeftImg.width;
                slW = nativeW * scale768;
            }
            if (slW <= 0) slW = Math.max(16, 24 * scale768);

            const stageRightImg = getManiaSkinImage(keys, LML.RightStageImage);
            let srW = 0;
            if (stageRightImg && stageRightImg.width > 0 && stageRightImg.height > 0) {
                const is2x = !!stageRightImg._is2x;
                const nativeW = is2x ? stageRightImg.width / 2 : stageRightImg.width;
                srW = nativeW * scale768;
            }
            if (srW <= 0) srW = Math.max(16, 24 * scale768);

            const stageCfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4) || {};
            const stageSplitAfter = isManiaSplitStagesEnabled(stageCfg, keys) ? getManiaStageSplitAfter(keys) : -1;
            const stageSegments = [];
            if (stageSplitAfter >= 0) {
                const firstStageEndX = colXCache[stageSplitAfter] + (colWidths[stageSplitAfter] || colWidths[0]);
                const secondStageStartX = colXCache[stageSplitAfter + 1];
                stageSegments.push({ x: startX, width: firstStageEndX - startX });
                stageSegments.push({ x: secondStageStartX, width: startX + totalTrackWidth - secondStageStartX });
            } else {
                stageSegments.push({ x: startX, width: totalTrackWidth });
            }

            for (let i = 0; i < stageSegments.length; i++) {
                const segment = stageSegments[i];
                const suffix = stageSegments.length > 1 ? `_${i}` : '';
                canvasInteractiveElements.push({
                    id: `stageLeft${suffix}`,
                    name: stageSegments.length > 1 ? `舞台 ${i + 1} 左侧边界` : '舞台左侧边界',
                    paramKey: 'StageLeft',
                    category: 'Mania',
                    x: segment.x - slW,
                    y: 0,
                    w: slW,
                    h: canvas.height,
                    isTexture: true,
                    textureName: 'StageLeft',
                    textureKey: LML.LeftStageImage,
                    dragAxis: null,
                    valFormatter: () => 'StageLeft'
                });
                canvasInteractiveElements.push({
                    id: `stageRight${suffix}`,
                    name: stageSegments.length > 1 ? `舞台 ${i + 1} 右侧边界` : '舞台右侧边界',
                    paramKey: 'StageRight',
                    category: 'Mania',
                    x: segment.x + segment.width,
                    y: 0,
                    w: srW,
                    h: canvas.height,
                    isTexture: true,
                    textureName: 'StageRight',
                    textureKey: LML.RightStageImage,
                    dragAxis: null,
                    valFormatter: () => 'StageRight'
                });
            }

            // 若当前有选中元素，在画布上渲染透明圆角高亮外框与吸附操作栏
            if (selectedCanvasElement) {
                const liveElem = canvasInteractiveElements.find(e => {
                    if (selectedCanvasElement.noteInstanceKey && e.noteInstanceKey) {
                        return e.noteInstanceKey === selectedCanvasElement.noteInstanceKey;
                    }
                    return e.id === selectedCanvasElement.id;
                }) || selectedCanvasElement;
                if (liveElem.id.startsWith('key_') && selectedCanvasElement.id === liveElem.id) {
                    selectedCanvasElement = liveElem;
                }
                drawCanvasSelectionHighlight(ctx, liveElem, scale48);
                syncCanvasSelectedCard(liveElem);
            }
        }

        // 2. 绘制画布元素的圆角高亮外框与中心展开动画
