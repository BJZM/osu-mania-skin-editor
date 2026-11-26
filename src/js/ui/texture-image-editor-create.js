// ============================================================================
// texture-image-editor-create.js - 纯色贴图创建与二次编辑保存控制器
// 依赖：ui/texture-image-editor-create-state.js、ui/texture-image-editor-create-inputs.js
// ============================================================================

        function getTextureCreatorTabs() {
            return tabs.filter((tab) => tab.kind === 'creator' && tab.creatorState);
        }

        function getTextureCreatorTabForEditPath(editPath) {
            if (!editPath) return null;
            return getTextureCreatorTabs().find((tab) => tab.creatorState.editPath === editPath) || null;
        }

        function getNextTextureCreatorTabId() {
            const id = nextTextureCreatorTabId === 1
                ? 'texture-creator'
                : `texture-creator-${nextTextureCreatorTabId}`;
            nextTextureCreatorTabId++;
            return id;
        }

        function getTextureCreatorTabTitle(creatorState) {
            if (!creatorState) return '创建贴图';
            if (creatorState.editPath) {
                const filename = creatorState.editPath.split('/').pop();
                return `编辑 · ${filename}`;
            }
            const name = String(creatorState.name || '').trim();
            return name ? `创建 · ${name}` : '创建贴图';
        }

        function updateActiveTextureCreatorTabTitle() {
            const tab = getActiveTab();
            if (!tab || tab.kind !== 'creator') return;
            tab.title = getTextureCreatorTabTitle(tab.creatorState);
            const list = byId('textureImageTabList');
            if (!list) return;
            for (const tabEl of list.querySelectorAll('.texture-image-tab')) {
                if (tabEl.dataset.tabId !== tab.id) continue;
                const label = tabEl.querySelector('.texture-image-tab-label');
                if (label) {
                    label.textContent = tab.title;
                    label.title = tab.title;
                }
                break;
            }
            syncActiveCreatorTabDirtyDot(tab);
        }

        function openTextureCreator(options = {}) {
            if (!isSkinEditingWorkspaceReady()) {
                open();
                return false;
            }
            const isEdit = !!(options && options.editPath);
            let tab = isEdit ? getTextureCreatorTabForEditPath(options.editPath) : null;
            if (!tab) {
                const creatorState = createTextureCreatorState({
                    editPath: isEdit ? options.editPath : null
                });
                creatorState.paramKey = (options && options.paramKey) || null;
                if (isEdit && typeof createSkinSnapshot === 'function') {
                    creatorState.previewSnapshot = createSkinSnapshot(
                        '生成设置实时预览基线'
                    );
                    creatorState.baseline = captureTextureCreatorBaseline(creatorState);
                }
                tab = {
                    id: getNextTextureCreatorTabId(),
                    kind: 'creator',
                    title: getTextureCreatorTabTitle(creatorState),
                    creatorState,
                    previousTabId: activeTabId || 'menu'
                };
                tabs.push(tab);
            } else if (options && options.paramKey) {
                tab.creatorState.paramKey = options.paramKey;
            }
            textureCreatorState = tab.creatorState;

            if (activeTabId === tab.id) {
                renderTabs();
                renderTextureCreatorForm();
                setViews('creator');
            } else {
                activateTab(tab.id);
            }
            const nameInput = byId('textureImageCreateName');
            if (nameInput) {
                nameInput.focus({ preventScroll: true });
                if (!isEdit) nameInput.select();
            }
            updateActiveTextureCreatorTabTitle();
            return true;
        }

        function closeTextureCreator() {
            cancelScheduledTextureCreatorPreview();
            const tab = getActiveTab();
            if (!tab || tab.kind !== 'creator') return false;
            return removeTab(tab.id, { restorePreview: true });
        }

        function readTextureCreatorPayload() {
            const nameInput = byId('textureImageCreateName');
            const rawName = nameInput ? nameInput.value.trim() : (textureCreatorState.name || '');
            if (!rawName) throw new Error('请输入贴图名称');

            const width = Number((byId('textureImageCreateWidth') || {}).value);
            const height = Number((byId('textureImageCreateHeight') || {}).value);
            if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
                throw new Error('宽度和高度必须是大于等于 1 的整数');
            }
            if (width > TEXTURE_SOLID_SHAPE_MAX_DIMENSION ||
                height > TEXTURE_SOLID_SHAPE_MAX_DIMENSION ||
                width * height > TEXTURE_SOLID_SHAPE_MAX_PIXELS) {
                throw new Error(`画布尺寸过大，单边不能超过 ${TEXTURE_SOLID_SHAPE_MAX_DIMENSION}px`);
            }

            const checkedSpec = document.querySelector('input[name="textureImageCreateSpec"]:checked');
            const spec = checkedSpec ? (checkedSpec.value === '2x' ? '2x' : '1x') : textureCreatorState.spec;
            const colorHexInput = byId('textureImageCreateColorHex');
            const colorInput = byId('textureImageCreateColor');
            const rawColor = (colorHexInput && /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorHexInput.value.trim()))
                ? colorHexInput.value
                : ((colorInput && colorInput.value) || textureCreatorState.color);
            const color = normalizeTextureHexColor(rawColor);

            const alphaValue = Number((byId('textureImageCreateAlphaValue') || {}).value);
            const alpha = Number.isFinite(alphaValue)
                ? Math.max(0, Math.min(100, Math.round(alphaValue)))
                : textureCreatorState.alpha;
            const strokeColorHexInput = byId('textureImageCreateStrokeColorHex');
            const strokeColorInput = byId('textureImageCreateStrokeColor');
            const rawStrokeColor = (strokeColorHexInput && /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(strokeColorHexInput.value.trim()))
                ? strokeColorHexInput.value
                : ((strokeColorInput && strokeColorInput.value) || textureCreatorState.strokeColor);
            const strokeColor = normalizeTextureHexColor(rawStrokeColor);
            const strokeAlphaValue = Number(
                (byId('textureImageCreateStrokeAlphaValue') || {}).value
            );
            const strokeAlpha = Number.isFinite(strokeAlphaValue)
                ? Math.max(0, Math.min(100, Math.round(strokeAlphaValue)))
                : textureCreatorState.strokeAlpha;
            const strokeEnabledInput = byId('textureImageCreateStrokeEnabled');
            const strokeWidthValue = Number(
                (byId('textureImageCreateStrokeWidthValue') || {}).value
            );
            const parsedStrokeWidth = Number.isFinite(strokeWidthValue)
                ? Math.max(0, Math.min(64, Math.round(strokeWidthValue)))
                : textureCreatorState.strokeWidth;
            const strokeWidth = (strokeEnabledInput && !strokeEnabledInput.checked) ? 0 : parsedStrokeWidth;
            const radiusValue = Number((byId('textureImageCreateCornerRadius') || {}).value);
            const cornerRadius = normalizeTextureCreatorCornerRadius(
                radiusValue,
                textureCreatorState.shape,
                width,
                height
            );
            const thicknessValue = Number((byId('textureImageCreateArrowThicknessValue') || {}).value);
            const arrowThickness = Number.isFinite(thicknessValue)
                ? Math.max(8, Math.min(50, Math.round(thicknessValue)))
                : textureCreatorState.arrowThickness;
            const roundnessValue = Number((byId('textureImageCreateArrowRoundnessValue') || {}).value);
            const arrowRoundness = Number.isFinite(roundnessValue)
                ? Math.max(0, Math.min(100, Math.round(roundnessValue)))
                : textureCreatorState.arrowRoundness;

            const fillTransparentColorInput = byId('textureImageCreateFillTransparentColor');
            const fillTransparentColorHexInput = byId('textureImageCreateFillTransparentColorHex');
            const rawFillTransparentColor = (fillTransparentColorHexInput && fillTransparentColorHexInput.value) ||
                (fillTransparentColorInput && fillTransparentColorInput.value) ||
                textureCreatorState.fillTransparentColor ||
                '#000000';
            const fillTransparentColor = normalizeTextureHexColor(rawFillTransparentColor);
            const fillTransparentAlphaValue = Number(
                (byId('textureImageCreateFillTransparentAlphaValue') || {}).value
            );
            const fillTransparentAlpha = Number.isFinite(fillTransparentAlphaValue)
                ? Math.max(0, Math.min(100, Math.round(fillTransparentAlphaValue)))
                : (Number.isFinite(textureCreatorState.fillTransparentAlpha) ? textureCreatorState.fillTransparentAlpha : 0);

            textureCreatorState.name = rawName;
            textureCreatorState.width = width;
            textureCreatorState.height = height;
            textureCreatorState.spec = spec;
            textureCreatorState.color = color;
            textureCreatorState.alpha = alpha;
            textureCreatorState.strokeColor = strokeColor;
            textureCreatorState.strokeWidth = strokeWidth;
            textureCreatorState.strokeEnabled = strokeWidth > 0;
            textureCreatorState.strokeAlpha = strokeAlpha;
            textureCreatorState.cornerRadius = cornerRadius;
            textureCreatorState.arrowThickness = arrowThickness;
            textureCreatorState.arrowRoundness = arrowRoundness;
            textureCreatorState.fillTransparentColor = fillTransparentColor;
            textureCreatorState.fillTransparentAlpha = fillTransparentAlpha;
            return {
                name: rawName,
                width,
                height,
                spec,
                is2x: spec === '2x',
                color,
                alpha,
                strokeEnabled: textureCreatorState.strokeEnabled,
                strokeColor,
                strokeAlpha,
                strokeWidth,
                shape: textureCreatorState.shape,
                cornerRadius,
                arrowThickness,
                arrowRoundness,
                fillTransparentColor,
                fillTransparentAlpha
            };
        }

        async function createTextureFromCreator() {
            cancelScheduledTextureCreatorPreview();
            const errorEl = byId('textureImageCreateNameError');
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.style.display = 'none';
            }
            try {
                const creatorTab = getActiveTab();
                if (!creatorTab || creatorTab.kind !== 'creator') return false;
                const creatorState = creatorTab.creatorState;
                textureCreatorState = creatorState;
                const payload = readTextureCreatorPayload();
                const isEdit = !!creatorState.editPath;
                const sourcePath = isEdit ? normalizeTextureLookupPath(creatorState.editPath) : '';
                const paramKey = creatorState.paramKey;
                const otherReferences = (isEdit && typeof collectOtherTrackTextureReferences === 'function')
                    ? collectOtherTrackTextureReferences(sourcePath, paramKey)
                    : [];

                let decision = 'all';
                if (otherReferences.length > 0 && typeof requestSharedTextureReferenceDecision === 'function') {
                    decision = await requestSharedTextureReferenceDecision(sourcePath, otherReferences);
                    if (!decision) return false;
                }

                if (creatorState.editPath && creatorState.previewSnapshot) {
                    applySkinSnapshot(creatorState.previewSnapshot, { preserveNonTextureSettings: true });
                    drawFrame();
                }

                let result;
                if (decision === 'current' && isEdit && paramKey) {
                    const independentPath = createIndependentTexturePath(sourcePath, paramKey);
                    const independentPayload = {
                        ...payload,
                        name: independentPath
                    };
                    result = await saveSolidTextureToLibrary(independentPayload, {
                        oldPath: null
                    });
                    const previousParams = typeof getCreatedTextureParams === 'function'
                        ? getCreatedTextureParams(sourcePath)
                        : null;
                    if (previousParams && previousParams.generalEditParams &&
                        typeof saveCreatedTextureGeneralEditParams === 'function') {
                        saveCreatedTextureGeneralEditParams(
                            result.path,
                            previousParams.generalEditParams
                        );
                    }
                    if (typeof pointTextureEditParamToPath === 'function') {
                        pointTextureEditParamToPath(paramKey, result.path);
                    }
                } else {
                    result = await saveSolidTextureToLibrary(payload, {
                        oldPath: creatorState.editPath
                    });
                    if (paramKey && typeof pointTextureEditParamToPath === 'function') {
                        pointTextureEditParamToPath(paramKey, result.path);
                    }
                }
                creatorState.previewSnapshot = null;
                if (typeof updateEditorBaseAfterSave === 'function') {
                    updateEditorBaseAfterSave();
                }
                if (typeof renderTextureLibrary === 'function') {
                    renderTextureLibrary();
                } else if (typeof textureLibraryUi !== 'undefined' && textureLibraryUi.refresh) {
                    textureLibraryUi.refresh();
                }
                renderPicker();
                drawFrame();
                renderSkinEditorParams();
                if (selectedCanvasElement) syncCanvasSelectedCard(selectedCanvasElement);

                const creatorTabsBefore = getTextureCreatorTabs();
                const creatorIndex = creatorTabsBefore.findIndex((tab) => tab.id === creatorTab.id);
                const nextCreatorTab = creatorTabsBefore[creatorIndex + 1] ||
                    creatorTabsBefore[creatorIndex - 1] ||
                    null;
                removeTab(creatorTab.id, { restorePreview: false });
                activateTab(nextCreatorTab ? nextCreatorTab.id : 'texture-library', { force: true });

                if (typeof textureLibraryUi !== 'undefined' && textureLibraryUi) {
                    textureLibraryUi.refresh();
                    if (typeof textureLibraryUi.selectPath === 'function') {
                        textureLibraryUi.selectPath(result.path);
                    }
                }
                const createdCard = document.querySelector(
                    `#textureImageLibraryGrid [data-texture-path="${result.path}"]`
                );
                if (createdCard && !nextCreatorTab) {
                    createdCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }

                showToast(
                    result.isEdit ? '贴图已更新' : '已创建纯色贴图',
                    decision === 'current'
                        ? `${result.path}.png 已作为独立贴图分配给当前轨道。`
                        : `${result.path}.png 已生成到全部贴图。`
                );
                return true;
            } catch (err) {
                if (getActiveTab() && getActiveTab().kind === 'creator') {
                    refreshTextureCreatorCanvasPreview();
                }
                if (errorEl) {
                    errorEl.textContent = err.message || '操作失败';
                    errorEl.style.display = 'block';
                }
                showToast('无法保存贴图', err.message || '请检查贴图名称与各项参数');
                return false;
            }
        }

        window.openTextureCreator = openTextureCreator;
