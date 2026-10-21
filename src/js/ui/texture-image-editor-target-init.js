// ============================================================================
// texture-image-editor-target-init.js - 贴图编辑目标初始化与输出尺寸校验
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function captureKeyImagePairOriginalSources(target) {
            const sources = {};
            const effParam = (typeof getEffectiveParamForTarget === 'function')
                ? getEffectiveParamForTarget(target)
                : (target && target.p);
            if (!target || !effParam || !isEditingKeyImageParam(effParam)) return sources;
            const column = getParamTrackIndex(effParam);
            if (column == null) return sources;
            const params = getTextureTabParams();
            for (const kind of ['normal', 'down']) {
                const pairParam = params.find((p) =>
                    getParamTrackIndex(p) === column &&
                    getKeyImageParamKind(p) === kind
                );
                if (!pairParam || pairParam.key === effParam.key) continue;
                const pairTarget = buildEditorTarget(pairParam);
                if (!pairTarget || pairTarget.frames.length === 0) continue;
                let frames = pairTarget.frames;
                if (typeof hasCreatedTextureParams === 'function' &&
                    hasCreatedTextureParams(pairTarget.base) &&
                    typeof createSolidShapeTexture === 'function') {
                    const cParams = getCreatedTextureParams(pairTarget.base);
                    if (cParams) {
                        const generated = createSolidShapeTexture(cParams);
                        generated._is2x = cParams.spec === '2x';
                        generated._isRootLevel = !pairTarget.base.includes('/');
                        frames = [generated];
                    }
                }
                sources[pairParam.key] = {
                    frames: frames.map(cloneFrame),
                    reference: normalizeSkinKey(
                        (pairTarget.resolved && pairTarget.resolved.name) ||
                        pairTarget.base ||
                        pairParam.key
                    )
                };
            }
            return sources;
        }

        function initializeTextureTab(tab) {
            const target = tab.target;
            state = tab.state;
            state.selected = target;
            const session = longBodyComposerSessions.get(getLongBodySessionKey(target));
            const sessionPreComposerState = cloneLongBodyPreComposerState(
                session && session.preComposerState
            );
            const savedRecipe = session ? null : getStoredTextureEditRecipe(target);
            const isCreated = typeof hasCreatedTextureParams === 'function' &&
                hasCreatedTextureParams(target.base);
            const createdGeneral = isCreated && typeof getCreatedTextureGeneralEditParams === 'function'
                ? getCreatedTextureGeneralEditParams(target.base)
                : null;
            const targetRecipe = (target.kind === 'library' && target.generalEditParams)
                ? {
                    params: JSON.parse(JSON.stringify(target.generalEditParams))
                }
                : (createdGeneral ? { params: JSON.parse(JSON.stringify(createdGeneral)) } : null);
            const effectiveRecipe = targetRecipe || savedRecipe;
            let sourceFrames;
            if (session && session.baseFrames) {
                sourceFrames = sessionPreComposerState &&
                    sessionPreComposerState.workingFrames.length > 0
                    ? sessionPreComposerState.workingFrames
                    : session.baseFrames;
            } else if (isCreated && typeof createSolidShapeTexture === 'function') {
                const cParams = getCreatedTextureParams(target.base);
                if (cParams) {
                    const generated = createSolidShapeTexture(cParams);
                    generated._is2x = cParams.spec === '2x';
                    generated._isRootLevel = !target.base.includes('/');
                    sourceFrames = [generated];
                } else {
                    sourceFrames = target.kind === 'library'
                        ? target.frames
                        : (savedRecipe ? savedRecipe.sourceFrames : target.frames);
                }
            } else if (target.kind === 'library') {
                sourceFrames = target.frames;
            } else {
                sourceFrames = savedRecipe ? savedRecipe.sourceFrames : target.frames;
            }
            state.originalFrames = sourceFrames.map(cloneFrame);
            state.originalReference = normalizeSkinKey(
                (effectiveRecipe && effectiveRecipe.originalReference) ||
                (target.resolved && target.resolved.name) ||
                target.base ||
                target.p.key
            );
            state.workingFrames = state.originalFrames.map(cloneFrame);
            state.previewFrames = state.workingFrames.map(cloneFrame);
            state.previewZoom = 1;
            state.previewBaseViewport = null;
            state.previewViewport = null;
            state.snapGuides = null;
            state.contentBoundsCache = null;
            state.longBodyComposer.active = false;
            state.previewSnapshot = target.kind === 'library'
                ? createSkinSnapshot('贴图编辑基线')
                : (editorBaseSnapshot || createSkinSnapshot('贴图编辑基线'));
            const pairOriginalSources = captureKeyImagePairOriginalSources(target);
            state.keyImageOriginalSources = savedRecipe
                ? {
                    ...pairOriginalSources,
                    ...cloneKeyImageEditSources(savedRecipe.keyImageOriginalSources)
                }
                : pairOriginalSources;
            let restored = false;
            if (sessionPreComposerState) {
                state.cropRect = sessionPreComposerState.cropRect
                    ? { ...sessionPreComposerState.cropRect }
                    : {
                        x: 0,
                        y: 0,
                        width: state.workingFrames[0].width,
                        height: state.workingFrames[0].height
                    };
                state.imageTransform = cloneImageTransform(
                    sessionPreComposerState.imageTransform
                );
                state.rgbAdjustment = cloneRgbAdjustment(
                    sessionPreComposerState.rgbAdjustment
                );
                state.previewFrames = buildPreviewFrames().map((frame) =>
                    applyRgbAdjustmentToCanvas(cloneFrame(frame), state.rgbAdjustment)
                );
                updateCropInputs(state.cropRect);
                updateImageTransformInputs();
                updateRgbAdjustmentInputs();
                restored = true;
            } else {
                restored = !!(effectiveRecipe &&
                    applyStoredTextureEditRecipe(state, effectiveRecipe));
            }
            if (!restored) {
                if (savedRecipe) removeTextureEditRecipe(target);
                resetTransformInputs();
                resetRgbAdjustmentInputs();
            }
            const effParam = (typeof getEffectiveParamForTarget === 'function')
                ? getEffectiveParamForTarget(target)
                : (target && target.p);
            state.keyImageEditRecipe = restored && isEditingKeyImageParam(effParam)
                ? captureTextureEditRecipe(state, target)
                : null;
            resetEditorHistory();
            if (session) {
                enableLongBodyComposer(session);
            } else {
                updateLongBodyComposerUI();
            }
        }

        function selectTarget(target) {
            const existing = tabs.find((tab) => tab.kind === 'texture' &&
                tab.target && tab.target.p && tab.target.p.key === target.p.key);
            if (existing) {
                activateTab(existing.id);
                return existing;
            }

            const tab = {
                id: `texture-${nextTextureTabId++}`,
                kind: 'texture',
                title: target.p.zhName,
                target,
                state: createEditorState()
            };
            tabs.push(tab);
            activeTabId = '';
            initializeTextureTab(tab);
            activeTabId = tab.id;
            syncActiveTabView();
            return tab;
        }

        function parseIntegerInput(id, label, min) {
            const input = byId(id);
            const value = input ? Number(input.value) : NaN;
            if (!Number.isFinite(value) || !Number.isInteger(value) || (min != null && value < min)) {
                throw new Error(min != null
                    ? `${label}必须是大于等于 ${min} 的整数`
                    : `${label}必须是整数`);
            }
            return value;
        }

        function validateOutputSize(width, height) {
            if (width > MAX_TEXTURE_DIMENSION || height > MAX_TEXTURE_DIMENSION ||
                width * height > MAX_TEXTURE_PIXELS) {
                throw new Error(`输出尺寸过大，单边不能超过 ${MAX_TEXTURE_DIMENSION}px`);
            }
        }
