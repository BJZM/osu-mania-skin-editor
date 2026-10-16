// ============================================================================
// texture-image-editor-target-init.js - 贴图编辑目标初始化与输出尺寸校验
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function captureKeyImagePairOriginalSources(target) {
            const sources = {};
            if (!target || !target.p || !isEditingKeyImageParam(target.p)) return sources;
            const column = getParamTrackIndex(target.p);
            if (column == null) return sources;
            const params = getTextureTabParams();
            for (const kind of ['normal', 'down']) {
                const pairParam = params.find((p) =>
                    getParamTrackIndex(p) === column &&
                    getKeyImageParamKind(p) === kind
                );
                if (!pairParam || pairParam.key === target.p.key) continue;
                const pairTarget = buildEditorTarget(pairParam);
                if (!pairTarget || pairTarget.frames.length === 0) continue;
                sources[pairParam.key] = {
                    frames: pairTarget.frames.map(cloneFrame),
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
            const savedRecipe = session ? null : getStoredTextureEditRecipe(target);
            const sourceFrames = session && session.baseFrames
                ? session.baseFrames
                : (savedRecipe ? savedRecipe.sourceFrames : target.frames);
            state.originalFrames = sourceFrames.map(cloneFrame);
            state.originalReference = normalizeSkinKey(
                (savedRecipe && savedRecipe.originalReference) ||
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
            state.previewSnapshot = editorBaseSnapshot || createSkinSnapshot('贴图编辑基线');
            const pairOriginalSources = captureKeyImagePairOriginalSources(target);
            state.keyImageOriginalSources = savedRecipe
                ? {
                    ...pairOriginalSources,
                    ...cloneKeyImageEditSources(savedRecipe.keyImageOriginalSources)
                }
                : pairOriginalSources;
            const restored = savedRecipe &&
                applyStoredTextureEditRecipe(state, savedRecipe);
            if (!restored) {
                if (savedRecipe) removeTextureEditRecipe(target);
                resetTransformInputs();
            }
            state.keyImageEditRecipe = restored && isEditingKeyImageParam(target.p)
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
