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
            if (!frame || (typeof frame !== 'object' && typeof frame !== 'function')) return '';
            let id = longBodySourceFrameIds.get(frame);
            if (!id) {
                id = nextLongBodySourceFrameId++;
                longBodySourceFrameIds.set(frame, id);
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
            const bodyFrame = (bodyFrames && bodyFrames[0]) || (bodyResolved && bodyResolved.img) || null;
            const tailFrame = (tailFrames && tailFrames[0]) || (tailResolved && tailResolved.img) || null;
            return {
                baseFrames: bodyFrame && !bodyFrame._isBlankPlaceholder ? [bodyFrame] : [],
                bodySourceName: bodyResolved ? bodyResolved.name : '',
                tailFrame: tailFrame && !tailFrame._isBlankPlaceholder ? tailFrame : null,
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
                tailFrame: compositeSource.tailFrame || null,
                tailSourceName: compositeSource.tailSourceName || ''
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
            const info = session ? null : getLongBodyTailInfo();
            if (!session && info && !info.eligible) {
                showToast('无法开启', '当前轨道需要先配置一张不透明的长条尾部贴图。');
                updateLongBodyComposerUI();
                return false;
            }
            const composer = state.longBodyComposer;
            composer.active = true;
            composer.sessionKey = getLongBodySessionKey();
            composer.baseFrames = (session ? session.baseFrames : state.workingFrames).map(cloneFrame);
            composer.tailFrame = session && session.tailFrame
                ? cloneFrame(session.tailFrame)
                : (info && info.frame ? cloneFrame(info.frame) : null);
            composer.bodySourceName = session
                ? (session.bodySourceName || '')
                : ((state.selected.resolved && state.selected.resolved.name) || state.selected.base || '');
            composer.tailSourceName = session
                ? (session.tailSourceName || '')
                : ((info && info.name) || '');
            composer.tailScaledHeight = composer.tailFrame
                ? Math.max(1, Math.round(composer.tailFrame.height * composer.baseFrames[0].width / Math.max(1, composer.tailFrame.width)))
                : 0;
            composer.targetHeight = session ? session.targetHeight : LONG_BODY_DEFAULT_HEIGHT;
            composer.coverage = session
                ? session.coverage
                : (composer.tailScaledHeight || Math.min(120, composer.baseFrames[0].height));
            composer.fade = session ? session.fade : 0;
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
            const baseFrames = composer.baseFrames.length > 0
                ? composer.baseFrames.map(cloneFrame)
                : state.originalFrames.map(cloneFrame);
            composer.active = false;
            state.savedLongBodyComposer = null;
            state.workingFrames = baseFrames;
            state.previewFrames = baseFrames.map(cloneFrame);
            restoreNoteBodyStyle();
            resetTransformInputs();
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
                    fade: settings.fade
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
                            fade: settings.fade
                        };
                        const generated = await buildLongBodyCompositeForSourceAsync(
                            source,
                            settings.targetHeight
                        );
                        if (!generated) return false;
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
