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
            const tailNameInfo = {};
            getManiaNoteTextureName(keys, LML.HoldNoteTailImage, column, tailNameInfo);
            const effectiveTailSource = getEffectiveTextureSourceName(
                keys,
                LML.HoldNoteTailImage,
                column
            );
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
                tailSourceName: effectiveTailSource || (tailResolved ? tailResolved.name : ''),
                tailSourceExplicit: !!tailNameInfo.explicit,
                tailState: tailResolved ? tailResolved.state : 'unset'
            };
        }

        function getLongBodyComposerSource() {
            const composer = state.longBodyComposer;
            return {
                baseFrames: composer.baseFrames,
                bodySourceName: composer.bodySourceName,
                tailFrame: composer.tailFrame,
                tailSourceName: composer.tailSourceName,
                tailSourceExplicit: !!composer.tailSourceExplicit
            };
        }

        function createLongBodyPreComposerStateFromRecipe(recipe) {
            if (!recipe || !recipe.params || !Array.isArray(recipe.sourceFrames) ||
                recipe.sourceFrames.length === 0) {
                return null;
            }
            const workingFrames = recipe.sourceFrames.map(cloneFrame);
            let cropRect = {
                x: 0,
                y: 0,
                width: workingFrames[0].width,
                height: workingFrames[0].height
            };
            try {
                const edited = buildEditedFrames(workingFrames, recipe.params);
                if (edited && edited.cropRect) cropRect = { ...edited.cropRect };
            } catch (_) {}
            return {
                workingFrames,
                cropRect,
                imageTransform: cloneImageTransform(recipe.params.imageTransform),
                rgbAdjustment: cloneRgbAdjustment(recipe.params.rgbAdjustment)
            };
        }

        function getLongBodyPreComposerStateForColumn(column, selectedColumn) {
            if (column === selectedColumn && state.longBodyComposer.preComposerState) {
                return cloneLongBodyPreComposerState(state.longBodyComposer.preComposerState);
            }
            const bodyParam = getLongBodyParamForTrack(LML.HoldNoteBodyImage, column);
            const target = bodyParam ? buildEditorTarget(bodyParam) : null;
            const recipe = target ? getStoredTextureEditRecipe(target) : null;
            if (recipe) return createLongBodyPreComposerStateFromRecipe(recipe);
            const resolved = target && target.resolved;
            const sourcePath = resolved ? normalizeTextureLookupPath(resolved.name) : '';
            const createdParams = sourcePath && typeof getCreatedTextureParams === 'function'
                ? getCreatedTextureParams(sourcePath)
                : null;
            if (!createdParams || !createdParams.generalEditParams ||
                typeof createSolidShapeTexture !== 'function') {
                return null;
            }
            const generated = createSolidShapeTexture(createdParams);
            generated._is2x = createdParams.spec === '2x';
            generated._isRootLevel = !sourcePath.includes('/');
            return createLongBodyPreComposerStateFromRecipe({
                sourceFrames: [generated],
                params: createdParams.generalEditParams
            });
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
                        tailSourceName: session.tailSourceName || '',
                        tailSourceExplicit: getLongBodySessionTailRestoreExplicit(session)
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
            const trackSource = readLongBodyTrackSource(column);
            return {
                column,
                sourceKey,
                reusesSelectedOutput,
                preComposerState: getLongBodyPreComposerStateForColumn(column, selectedColumn),
                baseFrames: compositeSource.baseFrames || [],
                bodySourceName: compositeSource.bodySourceName || '',
                tailRestoreSourceName: session && session.tailRestoreSourceName
                    ? session.tailRestoreSourceName
                    : (trackSource.tailSourceName || ''),
                tailRestoreState: session && session.tailRestoreState
                    ? session.tailRestoreState
                    : (trackSource.tailState || 'unset'),
                tailRestoreExplicit: session
                    ? getLongBodySessionTailRestoreExplicit(session)
                    : !!trackSource.tailSourceExplicit,
                // “应用到全部轨道”复用当前轨道的投皮配方；各轨只保留自己的身体底图来源。
                tailFrame: selectedSource.tailFrame || null,
                tailSourceName: selectedSource.tailSourceName || '',
                tailSourceExplicit: !!selectedSource.tailSourceExplicit
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
            return `longbody-body_col${Number(column) + 1}l`;
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

        function setLongBodyEditorSourceReference(sourceName) {
            const sourcePath = normalizeTextureLookupPath(sourceName);
            if (!sourcePath || !state.selected) return false;
            state.originalReference = normalizeSkinKey(sourcePath);
            state.selected.base = sourcePath;
            state.selected.resolved = state.selected.resolved || {};
            state.selected.resolved.name = sourcePath;
            state.selected.resolved.state = 'set';
            return true;
        }

        function createLongBodyRestoreItems(scope) {
            const keys = getActiveKeyCount();
            const selectedColumn = getSelectedTrackIndex();
            const columns = scope === 'all'
                ? Array.from({ length: keys }, (_, column) => column)
                : [selectedColumn].filter((column) => column != null);
            const items = [];
            for (const column of columns) {
                const session = longBodyComposerSessions.get(`${keys}|NoteImage${column}L`);
                if (!session) continue;
                const bodyParam = getTextureTabParams().find(
                    (item) => item.key === `NoteImage${column}L`
                );
                const resolved = bodyParam
                    ? resolveTextureParam(keys, bodyParam)
                    : null;
                items.push({
                    column,
                    bodySourceName: session.bodySourceName || '',
                    generatedBodySourceName: resolved ? resolved.name || '' : '',
                    tailRestoreSourceName:
                        session.tailRestoreSourceName || session.tailSourceName || '',
                    tailRestoreState: session.tailRestoreState || 'unset',
                    tailRestoreExplicit: getLongBodySessionTailRestoreExplicit(session)
                });
            }
            return items;
        }

        function getLongBodySessionTailRestoreExplicit(session) {
            if (!session) return false;
            if (typeof session.tailRestoreExplicit === 'boolean') {
                return session.tailRestoreExplicit;
            }
            const sourceName = normalizeTextureLookupPath(
                session.tailRestoreSourceName || session.tailSourceName || ''
            );
            if (!sourceName) return false;
            // 兼容旧工程：旧会话没有记录回退语义，只在来源仍真实存在时按显式引用恢复。
            return !!lookupTextureByName(sourceName);
        }

        function hasAllTrackLongBodySessions(session) {
            const keys = getActiveKeyCount();
            if (keys <= 1) return false;
            if (session && session.appliedScope === 'all') return true;
            if (session && session.appliedScope === 'current') return false;
            for (let column = 0; column < keys; column++) {
                if (!longBodyComposerSessions.has(`${keys}|NoteImage${column}L`)) {
                    return false;
                }
            }
            return true;
        }

        function setLongBodyTrackParamSource(column, suffix, sourceName) {
            const keys = getActiveKeyCount();
            const paramKey = `NoteImage${column}${suffix}`;
            const param = getTextureTabParams().find((item) => item.key === paramKey);
            if (!param) return false;
            const sourcePath = normalizeTextureLookupPath(sourceName);
            if (sourcePath) {
                assignTextureParamLookup(keys, param, sourcePath);
                syncParamInputValue(paramKey, sourcePath);
            } else {
                clearTextureParamLookup(keys, param);
                syncParamInputValue(paramKey, '');
            }
            return true;
        }

        function deleteLongBodyGeneratedTexture(baseName) {
            const base = normalizeTextureLookupPath(baseName);
            if (!base || !/^longbody-body(?:$|[_-])/i.test(base.split('/').pop() || '')) {
                return false;
            }
            const fallbackBase = base.split('/').pop();
            clearTextureLibraryFrameKeys(skinImageStore, base);
            clearTextureLibraryFrameKeys(skinFallbackImageStore, fallbackBase);
            removeTextureLibraryFrameReplacementVariants(base);
            removeTextureLibraryFrameReplacementVariants(fallbackBase);
            if (currentSkinZip) {
                const candidates = new Set();
                for (let index = 0; index < 64; index++) {
                    const frameBase = index === 0 ? base : `${base}-${index}`;
                    const fallbackFrameBase = index === 0
                        ? fallbackBase
                        : `${fallbackBase}-${index}`;
                    for (const name of [frameBase, fallbackFrameBase]) {
                        candidates.add(`${name}.png`);
                        candidates.add(`${name}@2x.png`);
                        candidates.add(`${name}.jpg`);
                        candidates.add(`${name}@2x.jpg`);
                    }
                }
                for (const name of Object.keys(currentSkinZip.files || {})) {
                    if (candidates.has(name) || candidates.has(name.toLowerCase())) {
                        currentSkinZip.remove(name);
                    }
                }
            }
            return true;
        }

        function deleteLongBodyTransparentTailBase(baseName) {
            const base = normalizeTextureLookupPath(baseName);
            if (!base || !/^longbody-tail-transparent(?:$|[_-])/i.test(base.split('/').pop() || '')) {
                return false;
            }
            const bases = [base];
            for (const base of bases) {
                clearTextureLibraryFrameKeys(skinImageStore, base);
                clearTextureLibraryFrameKeys(skinFallbackImageStore, base);
                removeTextureLibraryFrameReplacementVariants(base);
            }
            if (currentSkinZip) {
                for (const name of Object.keys(currentSkinZip.files || {})) {
                    const normalized = normalizeSkinKey(name);
                    if (bases.some((base) =>
                        normalized === normalizeSkinKey(`${base}.png`) ||
                        normalized === normalizeSkinKey(`${base}@2x.png`)
                    )) {
                        currentSkinZip.remove(name);
                    }
                }
            }
            return true;
        }

        function deleteLongBodyTransparentTail(column) {
            const columnSuffix = `longbody-tail-transparent_col${Number(column) + 1}`;
            deleteLongBodyTransparentTailBase(columnSuffix);
            deleteLongBodyTransparentTailBase(`${columnSuffix}T`);
        }

        function collectLongBodyArtifactBases() {
            const bases = new Set();
            const add = (value) => {
                let name = normalizeTextureLookupPath(value);
                if (!name) return;
                name = name.split('/').pop().replace(/-\d+$/, '');
                if (/^longbody-body(?:$|[_-])/i.test(name) ||
                    /^longbody-tail-transparent(?:$|[_-])/i.test(name)) {
                    bases.add(name);
                }
            };
            for (const name of userReplacedTextures.keys()) add(name);
            for (const name of skinImageStore.keys()) add(name);
            for (const name of skinFallbackImageStore.keys()) add(name);
            if (currentSkinZip) {
                for (const name of Object.keys(currentSkinZip.files || {})) add(name);
            }
            return bases;
        }

        function collectLongBodyReferencedBases() {
            const keys = getActiveKeyCount();
            const references = new Set();
            for (let column = 0; column < keys; column++) {
                for (const suffix of ['L', 'T']) {
                    const param = getTextureTabParams().find(
                        (item) => item.key === `NoteImage${column}${suffix}`
                    );
                    const resolved = param ? resolveTextureParam(keys, param) : null;
                    const name = resolved ? normalizeTextureLookupPath(resolved.name) : '';
                    if (name) references.add(name);
                }
            }
            return references;
        }

        function cleanupUnreferencedLongBodyArtifacts() {
            const references = collectLongBodyReferencedBases();
            for (const base of collectLongBodyArtifactBases()) {
                if (references.has(base)) continue;
                if (/^longbody-body(?:$|[_-])/i.test(base)) {
                    deleteLongBodyGeneratedTexture(base);
                } else {
                    deleteLongBodyTransparentTailBase(base);
                }
            }
        }

        function applyLongBodyRestoreItems(items) {
            if (!Array.isArray(items) || items.length === 0) return false;
            for (const item of items) {
                setLongBodyTrackParamSource(item.column, 'L', item.bodySourceName);
                setLongBodyTrackParamSource(
                    item.column,
                    'T',
                    item.tailRestoreExplicit === false
                        ? ''
                        : item.tailRestoreSourceName
                );
            }
            return true;
        }

        function finalizeLongBodyRestore(items) {
            if (!Array.isArray(items) || items.length === 0) {
                return false;
            }
            const keys = getActiveKeyCount();
            applyLongBodyRestoreItems(items);
            const generatedBases = new Set();
            for (const item of items) {
                longBodyComposerSessions.delete(`${keys}|NoteImage${item.column}L`);
                deleteLongBodyTransparentTail(item.column);
                if (item.generatedBodySourceName) {
                    generatedBases.add(normalizeTextureLookupPath(item.generatedBodySourceName));
                }
                generatedBases.add(getLongBodyGeneratedBaseName(item.column));
            }
            for (const base of generatedBases) {
                if (base && collectTexturePathReferences(base).length === 0) {
                    deleteLongBodyGeneratedTexture(base);
                }
            }
            cleanupUnreferencedLongBodyArtifacts();
            return true;
        }

        async function requestDisableLongBodyComposer() {
            const composer = state.longBodyComposer;
            if (!composer.active) return false;
            const currentSession = longBodyComposerSessions.get(getLongBodySessionKey());
            let scope = 'current';
            if (currentSession && hasAllTrackLongBodySessions(currentSession)) {
                const decision = await requestLongBodyApplyScope({
                    title: '关闭一键投皮',
                    text: '当前长条身体属于全轨投皮。是否同时关闭所有轨道的一键投皮，并恢复各轨原来的长条尾部？',
                    currentLabel: '仅关闭当前轨道',
                    allLabel: '关闭全部轨道'
                });
                if (!decision) {
                    updateLongBodyComposerUI();
                    return false;
                }
                scope = decision;
            }
            recordSkinUndoBeforeChange(
                scope === 'all'
                    ? '关闭一键投皮（全部轨道）'
                    : '关闭一键投皮（当前轨道）',
                { force: true }
            );
            const restoreItems = disableLongBodyComposer({ scope });
            finalizeLongBodyRestore(restoreItems);
            updateEditorBaseAfterSave();
            resetEditorHistory();
            renderPicker();
            renderSkinEditorParams();
            if (typeof renderTextureLibrary === 'function') renderTextureLibrary();
            drawFrame();
            showToast(
                '已关闭一键投皮',
                scope === 'all'
                    ? '已恢复全部轨道的原始身体和长条尾部，并删除生成的长条贴图。'
                    : '已恢复当前轨道的原始身体和长条尾部，并删除生成的长条贴图。'
            );
            return true;
        }

        function enableLongBodyComposer(session = null) {
            if (!isHoldBodySelected()) return false;
            const composer = state.longBodyComposer;
            const nextSessionKey = getLongBodySessionKey();
            const reuseDraft = !session &&
                composer.hasOpened &&
                composer.sessionKey === nextSessionKey;
            const draft = reuseDraft ? {
                targetHeight: composer.targetHeight,
                coverage: composer.coverage,
                fade: composer.fade,
                tailPreset: composer.tailPreset || 'none',
                presetHeight: composer.presetHeight || 0
            } : null;
            const info = session ? null : getLongBodySourceInfo();
            if (!session && info && !info.eligible) {
                showToast(
                    '无法开启',
                    `当前长条身体高度为 ${info.bodyHeight}px，需小于 ${LONG_BODY_OPEN_HEIGHT_LIMIT}px 才能开启一键投皮。`
                );
                updateLongBodyComposerUI();
                return false;
            }
            if (!session) {
                composer.preComposerState = cloneLongBodyPreComposerState({
                    workingFrames: state.workingFrames.map(cloneFrame),
                    cropRect: state.cropRect ? { ...state.cropRect } : null,
                    imageTransform: cloneImageTransform(state.imageTransform),
                    rgbAdjustment: cloneRgbAdjustment(state.rgbAdjustment)
                });
            } else {
                composer.preComposerState = cloneLongBodyPreComposerState(
                    session.preComposerState
                );
            }
            composer.active = true;
            composer.sessionKey = nextSessionKey;
            composer.hasOpened = true;
            const currentEffectiveFrame = state.previewFrames[0] || (buildPreviewFrames()[0] || state.workingFrames[0]);
            composer.baseFrames = (session ? session.baseFrames : [currentEffectiveFrame]).map(cloneFrame);
            if (composer.baseFrames[0] && state.originalFrames[0]) {
                composer.baseFrames[0]._sourceOriginalFrame = state.originalFrames[0];
            }
            const sessionTailSourceName = session
                ? (session.tailRestoreSourceName || session.tailSourceName || '')
                : '';
            const sessionTailExplicit = session
                ? getLongBodySessionTailRestoreExplicit(session)
                : !!(info && info.explicit);
            const tailFrame = session
                ? (session.tailFrame || null)
                : (info && info.frame);
            composer.tailFrame = tailFrame ? cloneFrame(tailFrame) : null;
            composer.bodySourceName = normalizeTextureLookupPath(
                session
                    ? (session.bodySourceName || '')
                    : ((state.selected.resolved && state.selected.resolved.name) || state.selected.base || '')
            );
            composer.tailSourceName = normalizeTextureLookupPath(
                session
                    ? sessionTailSourceName
                    : ((info && info.name) || '')
            );
            composer.tailSourceExplicit = sessionTailExplicit;
            composer.tailScaledHeight = composer.tailFrame
                ? Math.max(1, Math.round(composer.tailFrame.height * composer.baseFrames[0].width / Math.max(1, composer.tailFrame.width)))
                : 0;
            composer.targetHeight = session
                ? session.targetHeight
                : (draft ? draft.targetHeight : LONG_BODY_DEFAULT_HEIGHT);
            composer.coverage = session
                ? session.coverage
                : (draft
                    ? draft.coverage
                    : (composer.tailScaledHeight || Math.min(120, composer.baseFrames[0].height)));
            composer.fade = session ? session.fade : (draft ? draft.fade : 0);
            composer.tailPreset = session
                ? (session.tailPreset || 'none')
                : (draft ? draft.tailPreset : 'none');
            composer.presetHeight = session
                ? (session.presetHeight || 0)
                : (draft ? draft.presetHeight : 0);
            composer.preserveImportedOutput = !!(session && session.preserveImportedOutput);
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

        function disableLongBodyComposer(options = {}) {
            const composer = state.longBodyComposer;
            if (!composer.active) return;
            const saved = composer.preComposerState;
            const currentSession = longBodyComposerSessions.get(getLongBodySessionKey());
            const restoreScope = options.scope === 'all' ? 'all' : 'current';
            const restoreItems = createLongBodyRestoreItems(restoreScope);
            const restoreSourceName = (currentSession && currentSession.bodySourceName) ||
                composer.bodySourceName ||
                '';
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
            setLongBodyEditorSourceReference(restoreSourceName);
            restoreNoteBodyStyle();
            state.previewFrames = buildPreviewFrames().map((frame) =>
                applyRgbAdjustmentToCanvas(cloneFrame(frame), state.rgbAdjustment)
            );
            installFramesToStores(state.previewFrames, state.selected, { persist: false });
            updateMeta();
            updateLongBodyComposerUI();
            renderTabs();
            return restoreItems;
        }

        function persistLongBodyComposerSessions(plans, settings, appliedScope = 'current') {
            if (!plans || plans.length === 0 || !settings) return;
            const keys = getActiveKeyCount();
            for (const plan of plans) {
                if (!plan || !plan.baseFrames || plan.baseFrames.length === 0) continue;
                longBodyComposerSessions.set(`${keys}|NoteImage${plan.column}L`, {
                    baseFrames: plan.baseFrames.map(cloneFrame),
                    preComposerState: cloneLongBodyPreComposerState(plan.preComposerState),
                    tailFrame: plan.tailFrame ? cloneFrame(plan.tailFrame) : null,
                    bodySourceName: plan.bodySourceName || '',
                    tailSourceName: plan.tailSourceName || '',
                    tailRestoreSourceName: plan.tailRestoreSourceName || '',
                    tailRestoreState: plan.tailRestoreState || 'unset',
                    tailRestoreExplicit: !!plan.tailRestoreExplicit,
                    tailSourceExplicit: !!plan.tailSourceExplicit,
                    appliedScope: appliedScope === 'all' ? 'all' : 'current',
                    targetHeight: settings.targetHeight,
                    coverage: settings.coverage,
                    fade: settings.fade,
                    tailPreset: settings.tailPreset || 'none',
                    presetHeight: settings.presetHeight || 0
                });
            }
        }

        function persistLongBodyGeneratedBody(serialized, base, column) {
            if (!serialized || !serialized.img || !base || column == null) return false;
            const keys = getActiveKeyCount();
            const paramKey = `NoteImage${column}L`;
            const param = getTextureTabParams().find((item) => item.key === paramKey);
            if (!param) return false;

            installTextureLibraryFramesToStores([serialized.img], {
                kind: 'library',
                base,
                libraryPath: base
            }, {
                draw: false
            });
            removeTextureLibraryFrameReplacementVariants(base);

            const is2x = !!serialized.img._is2x;
            const fileName = `${base}${is2x ? '@2x.png' : '.png'}`;
            const oppositeFileName = `${base}${is2x ? '.png' : '@2x.png'}`;
            userReplacedTextures.set(fileName, serialized.arrayBuffer);
            userReplacedTextures.delete(oppositeFileName);
            deletedSkinTexturePaths.delete(fileName.toLowerCase());

            assignTextureParamLookup(keys, param, base);
            syncParamInputValue(paramKey, base);
            return true;
        }

        async function applyLongBodyToTracks(bodyFrame, plans, settings, onProgress) {
            if (!bodyFrame) return false;
            const targetPlans = plans && plans.length > 0
                ? plans
                : createLongBodyApplyPlans([]);
            cleanupUnreferencedLongBodyArtifacts();
            const generatedAssets = new Map();
            for (let index = 0; index < targetPlans.length; index++) {
                const plan = targetPlans[index];
                const column = plan.column;
                const generatedBase = getLongBodyGeneratedBaseName(column);
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
                    const applied = persistLongBodyGeneratedBody(
                        serialized,
                        generatedBase,
                        column
                    );
                    if (!applied) return false;
                    generatedAssets.set(plan.sourceKey, {
                        serialized,
                        base: generatedBase
                    });
                }
                if (onProgress) onProgress(82 + ((index + 1) / targetPlans.length) * 8);
                await waitForUiPaint();
            }
            return true;
        }

        async function applyTransparentTailsToTracks(columns, onProgress) {
            const transparent = document.createElement('canvas');
            transparent.width = 1;
            transparent.height = 1;
            const blob = await canvasToBlob(transparent);
            const arrayBuffer = await blob.arrayBuffer();
            const img = await loadImageFromBlob(blob);
            img._is2x = false;
            img._isRootLevel = true;
            const base = 'longbody-tail-transparent';
            clearTextureLibraryFrameKeys(skinImageStore, base);
            clearTextureLibraryFrameKeys(skinFallbackImageStore, base);
            removeTextureLibraryFrameReplacementVariants(base);
            installTextureLibraryFramesToStores([img], {
                kind: 'library',
                base,
                libraryPath: base
            }, {
                draw: false
            });
            userReplacedTextures.set(`${base}.png`, arrayBuffer);
            userReplacedTextures.delete(`${base}@2x.png`);
            deletedSkinTexturePaths.delete(`${base}.png`);

            const keys = getActiveKeyCount();
            const targetColumns = columns.length > 0 ? columns : [getSelectedTrackIndex()].filter((v) => v != null);
            for (let index = 0; index < targetColumns.length; index++) {
                const column = targetColumns[index];
                const pKey = `NoteImage${column}T`;
                const param = getTextureTabParams().find((item) => item.key === pKey);
                if (!param) return false;
                assignTextureParamLookup(keys, param, base);
                syncParamInputValue(pKey, base);
                if (onProgress) onProgress(92 + ((index + 1) / targetColumns.length) * 6);
                await waitForUiPaint();
            }
            return true;
        }
