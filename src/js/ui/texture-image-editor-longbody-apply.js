// ============================================================================
// texture-image-editor-longbody-apply.js - 长条身体来源解析与全轨应用
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function normalizeLongBodyTextureSourceName(value) {
            return String(value || '')
                .trim()
                .replace(/\.(png|jpg|jpeg)$/i, '')
                .replace(/@2x$/i, '')
                .replace(/\\/g, '/')
                .toLowerCase();
        }

        function getLongBodySourceFrameKey(frame) {
            const target = (frame && frame._sourceOriginalFrame) ? frame._sourceOriginalFrame : frame;
            if (!target || (typeof target !== 'object' && typeof target !== 'function')) return '';
            let id = longBodySourceFrameIds.get(target);
            if (!id) {
                id = nextLongBodySourceFrameId++;
                longBodySourceFrameIds.set(target, id);
            }
            return `frame:${id}`;
        }

        function getLongBodyTextureSourceKey(sourceName, frame) {
            const normalized = normalizeLongBodyTextureSourceName(sourceName);
            return normalized ? `name:${normalized}` : getLongBodySourceFrameKey(frame);
        }

        function getLongBodyParamForTrack(lookup, column) {
            return getTextureTabParams().find((p) =>
                p._trackLookup === lookup && Number(p._trackCol) === Number(column)
            ) || null;
        }

        function readLongBodyTrackSource(column) {
            const keys = getActiveKeyCount();
            const bodyParam = getLongBodyParamForTrack(LML.HoldNoteBodyImage, column);
            const tailParam = getLongBodyParamForTrack(LML.HoldNoteTailImage, column);
            const bodyResolved = bodyParam ? resolveTextureParam(keys, bodyParam) : null;
            const tailResolved = tailParam ? resolveTextureParam(keys, tailParam) : null;
            const bodyFrames = bodyParam ? resolveTextureParamFrames(keys, bodyParam) : null;
            const tailFrames = tailParam ? resolveTextureParamFrames(keys, tailParam) : null;
            let bodyFrame = (bodyFrames && bodyFrames[0]) || (bodyResolved && bodyResolved.img) || null;
            const tailFrame = (tailFrames && tailFrames[0]) || (tailResolved && tailResolved.img) || null;
            if (bodyFrame && bodyResolved && bodyResolved.name) {
                const normPath = normalizeTextureLookupPath(bodyResolved.name);
                const cParams = typeof getCreatedTextureParams === 'function' ? getCreatedTextureParams(normPath) : null;
                if (cParams && cParams.generalEditParams && typeof buildEditedFrames === 'function') {
                    const baseFrame = (typeof createSolidShapeTexture === 'function') ? createSolidShapeTexture(cParams) : bodyFrame;
                    baseFrame._is2x = cParams.spec === '2x';
                    baseFrame._isRootLevel = !normPath.includes('/');
                    const edited = buildEditedFrames([baseFrame], cParams.generalEditParams);
                    if (edited && edited.frames && edited.frames[0]) {
                        bodyFrame = edited.frames[0];
                        if (cParams.generalEditParams.rgbAdjustment && typeof applyRgbAdjustmentToCanvas === 'function') {
                            bodyFrame = applyRgbAdjustmentToCanvas(bodyFrame, cParams.generalEditParams.rgbAdjustment);
                        }
                    }
                }
            }
            const transparentTail = !!tailFrame && (
                !!tailFrame._isBlankPlaceholder ||
                isFullyTransparentImage(tailFrame, 48, 36)
            );
            return {
                baseFrames: bodyFrame && !bodyFrame._isBlankPlaceholder ? [bodyFrame] : [],
                bodySourceName: bodyResolved ? bodyResolved.name : '',
                tailFrame: tailFrame && !transparentTail ? tailFrame : null,
                tailSourceName: tailResolved ? tailResolved.name : ''
            };
        }

        function getLongBodyComposerSource() {
            const composer = state.longBodyComposer;
            return {
                baseFrames: composer.baseFrames,
                bodySourceName: composer.bodySourceName,
                tailFrame: composer.tailFrame,
                tailSourceName: composer.tailSourceName
            };
        }

        function getLongBodyApplyPlan(column, selectedColumn, selectedSource) {
            const session = column === selectedColumn
                ? null
                : longBodyComposerSessions.get(`${getActiveKeyCount()}|NoteImage${column}L`);
            const source = column === selectedColumn
                ? getLongBodyComposerSource()
                : (session && session.baseFrames && session.baseFrames.length > 0
                    ? {
                        baseFrames: session.baseFrames,
                        bodySourceName: session.bodySourceName || '',
                        tailFrame: session.tailFrame || null,
                        tailSourceName: session.tailSourceName || ''
                    }
                    : readLongBodyTrackSource(column));
            const sourceKey = getLongBodyTextureSourceKey(
                source.bodySourceName,
                source.baseFrames && source.baseFrames[0]
            ) || `track:${column}`;
            const selectedSourceKey = getLongBodyTextureSourceKey(
                selectedSource.bodySourceName,
                selectedSource.baseFrames && selectedSource.baseFrames[0]
            ) || `track:${selectedColumn}`;
            const reusesSelectedOutput = sourceKey === selectedSourceKey;
            const compositeSource = reusesSelectedOutput ? selectedSource : source;
            return {
                column,
                sourceKey,
                reusesSelectedOutput,
                baseFrames: compositeSource.baseFrames || [],
                bodySourceName: compositeSource.bodySourceName || '',
                // “应用到全部轨道”复用当前轨道的投皮配方；各轨只保留自己的身体底图来源。
                tailFrame: selectedSource.tailFrame || null,
                tailSourceName: selectedSource.tailSourceName || ''
            };
        }

        function createLongBodyApplyPlans(columns) {
            const selectedColumn = getSelectedTrackIndex();
            const selectedSource = getLongBodyComposerSource();
            const targetColumns = columns.length > 0
                ? columns
                : [selectedColumn].filter((column) => column != null);
            return targetColumns.map((column) =>
                getLongBodyApplyPlan(column, selectedColumn, selectedSource)
            );
        }

        function getLongBodyGeneratedBaseName(column) {
            return `longbody-body_col${Number(column) + 1}L`;
        }

        function setLongBodyTrackReference(column, base) {
            if (!base) return false;
            const keys = getActiveKeyCount();
            let cfg = maniaSkinConfigurations.get(keys);
            if (!cfg) {
                cfg = ensureManiaConfigForKeys(keys);
                maniaSkinConfigurations.set(keys, cfg);
            }
            if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
            for (const alias of getTextureParamAliases(`NoteImage${column}L`, keys)) {
                cfg[alias] = base;
                cfg.ImageLookups.set(alias, base);
                cfg.ImageLookups.set(alias.toLowerCase(), base);
            }
            if (typeof syncParamInputValue === 'function') {
                syncParamInputValue(`NoteImage${column}L`, base);
            }
            return true;
        }

        function enableLongBodyComposer(session = null) {
            if (!isHoldBodySelected()) return false;
            const info = session ? null : getLongBodySourceInfo();
            if (!session && info && !info.eligible) {
                showToast(
                    '无法开启',
                    `当前长条身体高度为 ${info.bodyHeight}px，需小于 ${LONG_BODY_OPEN_HEIGHT_LIMIT}px 才能开启一键投皮。`
                );
                updateLongBodyComposerUI();
                return false;
            }
            const composer = state.longBodyComposer;
            const selectedColumn = getSelectedTrackIndex();
            const currentTrackSource = session && selectedColumn != null
                ? readLongBodyTrackSource(selectedColumn)
                : null;
            if (!session) {
                composer.preComposerState = {
                    workingFrames: state.workingFrames.map(cloneFrame),
                    cropRect: state.cropRect ? { ...state.cropRect } : null,
                    imageTransform: cloneImageTransform(state.imageTransform),
                    rgbAdjustment: cloneRgbAdjustment(state.rgbAdjustment)
                };
            }
            composer.active = true;
            composer.sessionKey = getLongBodySessionKey();
            const currentEffectiveFrame = state.previewFrames[0] || (buildPreviewFrames()[0] || state.workingFrames[0]);
            composer.baseFrames = (session ? session.baseFrames : [currentEffectiveFrame]).map(cloneFrame);
            if (composer.baseFrames[0] && state.originalFrames[0]) {
                composer.baseFrames[0]._sourceOriginalFrame = state.originalFrames[0];
            }
            const tailFrame = session
                ? (currentTrackSource && currentTrackSource.tailFrame)
                : (info && info.frame);
            composer.tailFrame = tailFrame ? cloneFrame(tailFrame) : null;
            composer.bodySourceName = session
                ? (session.bodySourceName || '')
                : ((state.selected.resolved && state.selected.resolved.name) || state.selected.base || '');
            composer.tailSourceName = session
                ? ((currentTrackSource && currentTrackSource.tailSourceName) || '')
                : ((info && info.name) || '');
            composer.tailScaledHeight = composer.tailFrame
                ? Math.max(1, Math.round(composer.tailFrame.height * composer.baseFrames[0].width / Math.max(1, composer.tailFrame.width)))
                : 0;
            composer.targetHeight = session ? session.targetHeight : LONG_BODY_DEFAULT_HEIGHT;
            composer.coverage = session
                ? session.coverage
                : (composer.tailScaledHeight || Math.min(120, composer.baseFrames[0].height));
            composer.fade = session ? session.fade : 0;
            composer.tailPreset = session ? (session.tailPreset || 'none') : 'none';
            composer.presetHeight = session ? (session.presetHeight || 0) : 0;
            composer.previousNoteBodyStyle = null;
            state.savedLongBodyComposer = session
                ? captureLongBodyComposerState(composer)
                : null;
            state.previewBaseViewport = null;
            state.previewViewport = null;
            setNoteBodyStyleOne(false, false);
            regenerateLongBodyComposite();
            updateLongBodyComposerUI();
            renderTabs();
            return true;
        }

        function disableLongBodyComposer() {
            const composer = state.longBodyComposer;
            if (!composer.active) return;
            const saved = composer.preComposerState;
            composer.active = false;
            state.savedLongBodyComposer = null;
            if (saved) {
                state.workingFrames = saved.workingFrames.map(cloneFrame);
                state.cropRect = saved.cropRect ? { ...saved.cropRect } : null;
                state.imageTransform = cloneImageTransform(saved.imageTransform);
                state.rgbAdjustment = cloneRgbAdjustment(saved.rgbAdjustment);
                composer.preComposerState = null;
                updateCropInputs(state.cropRect);
                updateImageTransformInputs();
                updateRgbAdjustmentInputs();
            } else {
                state.workingFrames = composer.baseFrames.length > 0
                    ? composer.baseFrames.map(cloneFrame)
                    : state.originalFrames.map(cloneFrame);
                resetTransformInputs();
            }
            restoreNoteBodyStyle();
            state.previewFrames = buildPreviewFrames().map((frame) =>
                applyRgbAdjustmentToCanvas(cloneFrame(frame), state.rgbAdjustment)
            );
            installFramesToStores(state.previewFrames, state.selected, { persist: false });
            updateMeta();
            updateLongBodyComposerUI();
            renderTabs();
        }

        function persistLongBodyComposerSessions(plans, settings) {
            if (!plans || plans.length === 0 || !settings) return;
            const keys = getActiveKeyCount();
            for (const plan of plans) {
                if (!plan || !plan.baseFrames || plan.baseFrames.length === 0) continue;
                longBodyComposerSessions.set(`${keys}|NoteImage${plan.column}L`, {
                    baseFrames: plan.baseFrames.map(cloneFrame),
                    tailFrame: plan.tailFrame ? cloneFrame(plan.tailFrame) : null,
                    bodySourceName: plan.bodySourceName || '',
                    tailSourceName: plan.tailSourceName || '',
                    targetHeight: settings.targetHeight,
                    coverage: settings.coverage,
                    fade: settings.fade,
                    tailPreset: settings.tailPreset || 'none',
                    presetHeight: settings.presetHeight || 0
                });
            }
        }

        async function applyLongBodyToTracks(bodyFrame, plans, settings, onProgress) {
            if (!bodyFrame || !textureUploadUi || typeof textureUploadUi.applyEditedTexture !== 'function') return false;
            const targetPlans = plans && plans.length > 0
                ? plans
                : createLongBodyApplyPlans([]);
            const generatedAssets = new Map();
            for (let index = 0; index < targetPlans.length; index++) {
                const plan = targetPlans[index];
                const column = plan.column;
                const pKey = `NoteImage${column}L`;
                // 同一来源只保留一份生成资产，后续同源轨道直接复用该引用。
                const existingAsset = generatedAssets.get(plan.sourceKey);
                if (existingAsset) {
                    if (!setLongBodyTrackReference(column, existingAsset.base)) return false;
                } else {
                    let serialized = plan.reusesSelectedOutput ? bodyFrame : null;
                    if (!serialized) {
                        const source = {
                            baseFrames: plan.baseFrames,
                            tailFrame: plan.tailFrame,
                            targetHeight: settings.targetHeight,
                            coverage: settings.coverage,
                            fade: settings.fade,
                            tailPreset: settings.tailPreset || 'none',
                            presetHeight: settings.presetHeight || 0
                        };
                        const generated = await buildLongBodyCompositeForSourceAsync(
                            source,
                            settings.targetHeight
                        );
                        if (!generated) return false;
                        applyRgbAdjustmentToCanvas(generated, settings.rgbAdjustment);
                        serialized = await serializeLongBodyFrame(generated);
                    }
                    const applied = await textureUploadUi.applyEditedTexture(
                        new File([serialized.blob], 'longbody-body.png', { type: 'image/png' }),
                        serialized.arrayBuffer,
                        serialized.img,
                        !!serialized.img._is2x,
                        'longbody-body',
                        pKey,
                        pKey,
                        column,
                        { recordUndo: false, notify: false, refresh: false }
                    );
                    if (!applied) return false;
                    generatedAssets.set(plan.sourceKey, {
                        serialized,
                        base: getLongBodyGeneratedBaseName(column)
                    });
                }
                if (onProgress) onProgress(82 + ((index + 1) / targetPlans.length) * 8);
                await waitForUiPaint();
            }
            return true;
        }

        async function applyTransparentTailsToTracks(columns, onProgress) {
            if (!textureUploadUi || typeof textureUploadUi.applyEditedTexture !== 'function') return false;
            const transparent = document.createElement('canvas');
            transparent.width = 1;
            transparent.height = 1;
            const blob = await canvasToBlob(transparent);
            const arrayBuffer = await blob.arrayBuffer();
            const img = await loadImageFromBlob(blob);
            img._is2x = false;
            const targetColumns = columns.length > 0 ? columns : [getSelectedTrackIndex()].filter((v) => v != null);
            for (let index = 0; index < targetColumns.length; index++) {
                const column = targetColumns[index];
                const pKey = `NoteImage${column}T`;
                const applied = await textureUploadUi.applyEditedTexture(
                    new File([blob], 'longbody-tail-transparent.png', { type: 'image/png' }),
                    arrayBuffer,
                    img,
                    false,
                    'longbody-tail-transparent',
                    pKey,
                    pKey,
                    column,
                    { recordUndo: false, notify: false, refresh: false }
                );
                if (!applied) return false;
                if (onProgress) onProgress(92 + ((index + 1) / targetColumns.length) * 6);
                await waitForUiPaint();
            }
            return true;
        }
