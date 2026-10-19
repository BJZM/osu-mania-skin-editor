// ============================================================================
// texture-image-editor-create.js - 纯色贴图创建与二次编辑控制器
// 直接生成贴图到全部贴图区域，保留参数以供二次编辑
// ============================================================================

        let nextTextureCreatorTabId = 1;

        function createTextureCreatorState(options = {}) {
            const editPath = options.editPath || null;
            if (editPath) {
                const saved = typeof getCreatedTextureParams === 'function'
                    ? getCreatedTextureParams(editPath)
                    : null;
                const savedStrokeWidth = (saved && Number.isFinite(saved.strokeWidth)) ? saved.strokeWidth : 0;
                return {
                    editPath,
                    targetKey: '',
                    targetPickerOpen: false,
                    targetCollapsedGroups: new Set(),
                    previewSnapshot: null,
                    name: (saved && saved.name) || editPath,
                    width: (saved && saved.width) || 256,
                    height: (saved && saved.height) || 256,
                    spec: (saved && saved.spec) || '1x',
                    color: (saved && saved.color) || '#ffffff',
                    alpha: (saved && Number.isFinite(saved.alpha)) ? saved.alpha : 100,
                    strokeEnabled: savedStrokeWidth > 0 && !!(saved && saved.strokeEnabled),
                    strokeColor: (saved && saved.strokeColor) || '#000000',
                    strokeAlpha: (saved && Number.isFinite(saved.strokeAlpha)) ? saved.strokeAlpha : 100,
                    strokeWidth: savedStrokeWidth,
                    shape: (saved && saved.shape) || 'rectangle',
                    cornerRadius: (saved && Number.isFinite(saved.cornerRadius)) ? saved.cornerRadius : 24,
                    arrowThickness: (saved && Number.isFinite(saved.arrowThickness)) ? saved.arrowThickness : 20,
                    arrowRoundness: (saved && Number.isFinite(saved.arrowRoundness)) ? saved.arrowRoundness : 50,
                    fillTransparentEnabled: !!(saved && (saved.fillTransparentEnabled || saved.transparentFillEnabled)),
                    fillTransparentColor: (saved && (saved.fillTransparentColor || saved.transparentFillColor)) || '#000000',
                    fillTransparentAlpha: (saved && Number.isFinite(saved.fillTransparentAlpha !== undefined ? saved.fillTransparentAlpha : saved.transparentFillAlpha))
                        ? (saved.fillTransparentAlpha !== undefined ? saved.fillTransparentAlpha : saved.transparentFillAlpha)
                        : 100
                };
            }
            return {
                editPath: null,
                targetKey: '',
                targetPickerOpen: false,
                targetCollapsedGroups: new Set(),
                previewSnapshot: null,
                name: options.assignDefaultName === false ? '' : generateDefaultTextureName(),
                width: 256,
                height: 256,
                spec: '1x',
                color: '#ffffff',
                alpha: 100,
                strokeEnabled: false,
                strokeColor: '#000000',
                strokeAlpha: 100,
                strokeWidth: 0,
                shape: 'rectangle',
                cornerRadius: 24,
                arrowThickness: 20,
                arrowRoundness: 50,
                fillTransparentEnabled: false,
                fillTransparentColor: '#000000',
                fillTransparentAlpha: 100
            };
        }

        let textureCreatorState = createTextureCreatorState({ assignDefaultName: false });

        function generateDefaultTextureName(prefix = 'texture') {
            const sources = typeof collectExistingTextureSources === 'function'
                ? collectExistingTextureSources()
                : [];
            const existing = new Set(sources.map((item) => normalizeSkinKey(item.path)));
            if (typeof tabs !== 'undefined') {
                for (const tab of tabs) {
                    if (tab.kind !== 'creator' || !tab.creatorState || !tab.creatorState.name) continue;
                    existing.add(normalizeSkinKey(tab.creatorState.name));
                }
            }
            let index = 1;
            while (
                existing.has(normalizeSkinKey(`${prefix}-${index}`)) ||
                (typeof hasCreatedTextureParams === 'function' && hasCreatedTextureParams(`${prefix}-${index}`))
            ) {
                index++;
            }
            return `${prefix}-${index}`;
        }

        function resetTextureCreatorState(options = {}) {
            nextTextureCreatorTabId = 1;
            textureCreatorState = createTextureCreatorState(options);
            return textureCreatorState;
        }

        function textureCreatorShapeUsesCornerRadius(shape) {
            return shape === 'rounded-rectangle' || shape === 'rotated-square';
        }

        function getTextureCreatorCornerRadiusMax(
            shape = textureCreatorState.shape,
            width = textureCreatorState.width,
            height = textureCreatorState.height
        ) {
            const shortSide = Math.max(
                0,
                Math.min(Number(width) || 0, Number(height) || 0)
            );
            if (shape === 'rotated-square') {
                return Math.max(0, Math.floor(shortSide * Math.SQRT2 / 4));
            }
            return Math.max(0, Math.floor(shortSide / 2));
        }

        function normalizeTextureCreatorCornerRadius(
            value,
            shape = textureCreatorState.shape,
            width = textureCreatorState.width,
            height = textureCreatorState.height
        ) {
            const numeric = Number(value);
            const requested = Number.isFinite(numeric)
                ? numeric
                : textureCreatorState.cornerRadius;
            return Math.max(0, Math.min(
                getTextureCreatorCornerRadiusMax(shape, width, height),
                Math.round(requested)
            ));
        }

        function updateTextureCreatorShapeSelection() {
            const grid = byId('textureImageCreateShapeGrid');
            if (!grid) return;
            grid.querySelectorAll('.texture-image-shape-btn').forEach((button) => {
                const active = button.dataset.shape === textureCreatorState.shape;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            const cornerRow = byId('textureImageCreateCornerRow');
            const usesRadius = textureCreatorShapeUsesCornerRadius(
                textureCreatorState.shape
            );
            const usesArrow = textureCreatorState.shape.startsWith('arrow-');
            if (cornerRow) cornerRow.style.display = usesRadius ? 'grid' : 'none';
            const thicknessRow = byId('textureImageCreateArrowThicknessRow');
            const roundnessRow = byId('textureImageCreateArrowRoundnessRow');
            if (thicknessRow) thicknessRow.style.display = usesArrow ? 'grid' : 'none';
            if (roundnessRow) roundnessRow.style.display = usesArrow ? 'grid' : 'none';
        }

        function renderTextureCreatorShapePreviews() {
            const grid = byId('textureImageCreateShapeGrid');
            if (!grid) return;
            grid.querySelectorAll('.texture-image-shape-btn').forEach((button) => {
                const canvas = button.querySelector('canvas');
                if (!canvas) return;
                const shape = normalizeTextureShape(button.dataset.shape);
                const previewScale = Math.min(
                    canvas.width / textureCreatorState.width,
                    canvas.height / textureCreatorState.height
                );
                const preview = createSolidShapeTexture({
                    width: canvas.width,
                    height: canvas.height,
                    color: textureCreatorState.color,
                    alpha: Math.max(0.12, textureCreatorState.alpha / 100),
                    strokeEnabled: textureCreatorState.strokeEnabled,
                    strokeColor: textureCreatorState.strokeColor,
                    strokeAlpha: textureCreatorState.strokeAlpha / 100,
                    strokeWidth: textureCreatorState.strokeWidth > 0
                        ? Math.max(1, Math.round(
                            textureCreatorState.strokeWidth * previewScale
                        ))
                        : 0,
                    shape,
                    cornerRadius: textureCreatorShapeUsesCornerRadius(shape)
                        ? Math.max(0, Math.round(
                            textureCreatorState.cornerRadius * previewScale
                        ))
                        : 0,
                    arrowThickness: textureCreatorState.arrowThickness,
                    arrowRoundness: textureCreatorState.arrowRoundness,
                    fillTransparentEnabled: textureCreatorState.fillTransparentEnabled,
                    fillTransparentColor: textureCreatorState.fillTransparentColor,
                    fillTransparentAlpha: textureCreatorState.fillTransparentAlpha / 100
                });
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(preview, 0, 0);
            });
        }

        function refreshTextureCreatorPreview() {
            const canvas = byId('textureImageCreatePreviewCanvas');
            const sizeLabel = byId('textureImageCreatePreviewSize');
            const specLabel = byId('textureImageCreateSpecLabel');
            if (sizeLabel) {
                sizeLabel.textContent = `${textureCreatorState.width} × ${textureCreatorState.height}px`;
            }
            if (specLabel) {
                specLabel.textContent = textureCreatorState.spec === '2x' ? '@2x' : '1x';
            }
            renderTextureCreatorShapePreviews();
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            try {
                const scale = Math.min(
                    (canvas.width - 42) / textureCreatorState.width,
                    (canvas.height - 42) / textureCreatorState.height,
                    4
                );
                const previewWidth = Math.max(1, Math.round(textureCreatorState.width * scale));
                const previewHeight = Math.max(1, Math.round(textureCreatorState.height * scale));
                const previewFrame = createSolidShapeTexture({
                    width: previewWidth,
                    height: previewHeight,
                    color: textureCreatorState.color,
                    alpha: textureCreatorState.alpha / 100,
                    strokeEnabled: textureCreatorState.strokeEnabled,
                    strokeColor: textureCreatorState.strokeColor,
                    strokeAlpha: textureCreatorState.strokeAlpha / 100,
                    strokeWidth: textureCreatorState.strokeWidth * scale,
                    shape: textureCreatorState.shape,
                    cornerRadius: textureCreatorState.cornerRadius * scale,
                    arrowThickness: textureCreatorState.arrowThickness,
                    arrowRoundness: textureCreatorState.arrowRoundness,
                    fillTransparentEnabled: textureCreatorState.fillTransparentEnabled,
                    fillTransparentColor: textureCreatorState.fillTransparentColor,
                    fillTransparentAlpha: textureCreatorState.fillTransparentAlpha / 100
                });
                const left = (canvas.width - previewWidth) / 2;
                const top = (canvas.height - previewHeight) / 2;
                drawPreviewTransparencyBackground(
                    ctx,
                    left,
                    top,
                    previewWidth,
                    previewHeight
                );
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(previewFrame, left, top, previewWidth, previewHeight);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.lineWidth = 1;
                ctx.strokeRect(left + 0.5, top + 0.5, previewWidth - 1, previewHeight - 1);
            } catch (err) {
                const label = byId('textureImageCreatePreviewSize');
                if (label) label.textContent = err.message || '尺寸无效';
            }
            refreshTextureCreatorCanvasPreview();
        }

        function buildTextureCreatorCanvasPreviewFrame() {
            let frame = createSolidShapeTexture(textureCreatorState);
            frame._is2x = textureCreatorState.spec === '2x';
            const generalEditParams = textureCreatorState.editPath &&
                typeof getCreatedTextureGeneralEditParams === 'function'
                ? getCreatedTextureGeneralEditParams(textureCreatorState.editPath)
                : null;
            if (generalEditParams &&
                typeof buildEditedFrames === 'function' &&
                typeof applyRgbAdjustmentToCanvas === 'function') {
                const edited = buildEditedFrames([frame], generalEditParams);
                if (edited && edited.frames.length > 0) {
                    frame = edited.frames[0];
                    frame._is2x = textureCreatorState.spec === '2x';
                    const rgb = generalEditParams.rgbAdjustment ||
                        createDefaultRgbAdjustment();
                    frame = applyRgbAdjustmentToCanvas(frame, rgb);
                }
            }
            return frame;
        }

        function refreshTextureCreatorCanvasPreview() {
            if (!textureCreatorState.editPath ||
                typeof installTextureFramesAtPath !== 'function' ||
                typeof drawFrame !== 'function') {
                return false;
            }
            try {
                const frame = buildTextureCreatorCanvasPreviewFrame();
                installTextureFramesAtPath(
                    [frame],
                    textureCreatorState.editPath,
                    { draw: false }
                );
                drawFrame();
                return true;
            } catch (err) {
                console.warn('生成设置画布实时预览失败:', err);
                return false;
            }
        }

        function updateTextureCreatorCornerInputs() {
            const usesRadius = textureCreatorShapeUsesCornerRadius(
                textureCreatorState.shape
            );
            const max = getTextureCreatorCornerRadiusMax();
            const effectiveRadius = Math.min(
                max,
                Math.max(0, Math.round(textureCreatorState.cornerRadius))
            );
            const range = byId('textureImageCreateCornerRadiusRange');
            const number = byId('textureImageCreateCornerRadius');
            if (range) {
                range.min = '0';
                range.max = String(max);
                range.disabled = !usesRadius;
                range.value = String(effectiveRadius);
                updateTextureRangeFill(range);
            }
            if (number) {
                number.min = '0';
                number.max = String(max);
                number.disabled = !usesRadius;
                number.value = String(effectiveRadius);
            }
        }

        function updateTextureCreatorAlphaInputs() {
            const range = byId('textureImageCreateAlpha');
            const number = byId('textureImageCreateAlphaValue');
            const value = String(Math.round(textureCreatorState.alpha));
            if (range) {
                range.value = value;
                updateTextureRangeFill(range);
            }
            if (number) number.value = value;
        }

        function updateTextureCreatorStrokeInputs() {
            const enabledInput = byId('textureImageCreateStrokeEnabled');
            const controls = byId('textureImageCreateStrokeControls');
            const colorInput = byId('textureImageCreateStrokeColor');
            const colorHexInput = byId('textureImageCreateStrokeColorHex');
            const widthRange = byId('textureImageCreateStrokeWidth');
            const widthNumber = byId('textureImageCreateStrokeWidthValue');
            const alphaRange = byId('textureImageCreateStrokeAlpha');
            const alphaNumber = byId('textureImageCreateStrokeAlphaValue');

            textureCreatorState.strokeEnabled = textureCreatorState.strokeWidth > 0;
            if (enabledInput) enabledInput.checked = textureCreatorState.strokeEnabled;
            if (controls) {
                controls.style.display = 'block';
            }
            if (colorInput) colorInput.value = textureCreatorState.strokeColor;
            if (colorHexInput) colorHexInput.value = textureCreatorState.strokeColor;
            if (widthRange) {
                widthRange.value = String(textureCreatorState.strokeWidth);
                updateTextureRangeFill(widthRange);
            }
            if (widthNumber) {
                widthNumber.value = String(textureCreatorState.strokeWidth);
            }
            if (alphaRange) {
                alphaRange.value = String(textureCreatorState.strokeAlpha);
                updateTextureRangeFill(alphaRange);
            }
            if (alphaNumber) {
                alphaNumber.value = String(textureCreatorState.strokeAlpha);
            }
        }

        function updateTextureCreatorFillTransparentInputs() {
            const enabledInput = byId('textureImageCreateFillTransparentEnabled');
            const controls = byId('textureImageCreateFillTransparentControls');
            const colorInput = byId('textureImageCreateFillTransparentColor');
            const colorHexInput = byId('textureImageCreateFillTransparentColorHex');
            const alphaRange = byId('textureImageCreateFillTransparentAlpha');
            const alphaNumber = byId('textureImageCreateFillTransparentAlphaValue');

            if (enabledInput) {
                enabledInput.checked = !!textureCreatorState.fillTransparentEnabled;
            }
            if (controls) {
                controls.style.display = textureCreatorState.fillTransparentEnabled ? 'block' : 'none';
            }
            const color = normalizeTextureHexColor(textureCreatorState.fillTransparentColor || '#000000');
            if (colorInput) colorInput.value = color;
            if (colorHexInput) colorHexInput.value = color;
            const alpha = Number.isFinite(textureCreatorState.fillTransparentAlpha)
                ? textureCreatorState.fillTransparentAlpha
                : 100;
            if (alphaRange) {
                alphaRange.value = String(alpha);
                updateTextureRangeFill(alphaRange);
            }
            if (alphaNumber) {
                alphaNumber.value = String(alpha);
            }
        }

        function updateTextureCreatorArrowInputs() {
            for (const [rangeId, numberId, value] of [
                [
                    'textureImageCreateArrowThickness',
                    'textureImageCreateArrowThicknessValue',
                    textureCreatorState.arrowThickness
                ],
                [
                    'textureImageCreateArrowRoundness',
                    'textureImageCreateArrowRoundnessValue',
                    textureCreatorState.arrowRoundness
                ]
            ]) {
                const range = byId(rangeId);
                const number = byId(numberId);
                if (range) {
                    range.value = String(value);
                    updateTextureRangeFill(range);
                }
                if (number) number.value = String(value);
            }
        }

        function renderTextureCreatorForm() {
            const nameInput = byId('textureImageCreateName');
            const widthInput = byId('textureImageCreateWidth');
            const heightInput = byId('textureImageCreateHeight');
            const colorInput = byId('textureImageCreateColor');
            const colorHexInput = byId('textureImageCreateColorHex');
            const confirmBtn = byId('textureImageCreateConfirmBtn');
            const errorEl = byId('textureImageCreateNameError');

            if (nameInput) nameInput.value = textureCreatorState.name || '';
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.style.display = 'none';
            }
            if (confirmBtn) {
                confirmBtn.textContent = textureCreatorState.editPath ? '保存修改' : '确认创建';
            }
            if (widthInput) widthInput.value = String(textureCreatorState.width);
            if (heightInput) heightInput.value = String(textureCreatorState.height);
            if (colorInput) colorInput.value = textureCreatorState.color;
            if (colorHexInput) colorHexInput.value = textureCreatorState.color;
            document.querySelectorAll('input[name="textureImageCreateSpec"]').forEach((input) => {
                input.checked = input.value === textureCreatorState.spec;
            });
            updateTextureCreatorAlphaInputs();
            updateTextureCreatorStrokeInputs();
            updateTextureCreatorFillTransparentInputs();
            updateTextureCreatorCornerInputs();
            updateTextureCreatorArrowInputs();
            updateTextureCreatorShapeSelection();
            refreshTextureCreatorPreview();
        }

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
            const tab = getActiveTab();
            if (!tab || tab.kind !== 'creator') return false;
            return closeTab(tab.id);
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

            const alphaValue = Number((byId('textureImageCreateAlphaValue') || {}).value);
            const alpha = Number.isFinite(alphaValue)
                ? Math.max(0, Math.min(100, Math.round(alphaValue)))
                : textureCreatorState.alpha;
            const strokeAlphaValue = Number(
                (byId('textureImageCreateStrokeAlphaValue') || {}).value
            );
            const strokeAlpha = Number.isFinite(strokeAlphaValue)
                ? Math.max(0, Math.min(100, Math.round(strokeAlphaValue)))
                : textureCreatorState.strokeAlpha;
            const strokeWidthValue = Number(
                (byId('textureImageCreateStrokeWidthValue') || {}).value
            );
            const strokeWidth = Number.isFinite(strokeWidthValue)
                ? Math.max(0, Math.min(64, Math.round(strokeWidthValue)))
                : textureCreatorState.strokeWidth;
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

            const fillTransparentEnabledInput = byId('textureImageCreateFillTransparentEnabled');
            const fillTransparentEnabled = fillTransparentEnabledInput
                ? fillTransparentEnabledInput.checked
                : !!textureCreatorState.fillTransparentEnabled;
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
                : (Number.isFinite(textureCreatorState.fillTransparentAlpha) ? textureCreatorState.fillTransparentAlpha : 100);

            textureCreatorState.name = rawName;
            textureCreatorState.width = width;
            textureCreatorState.height = height;
            textureCreatorState.alpha = alpha;
            textureCreatorState.strokeWidth = strokeWidth;
            textureCreatorState.strokeEnabled = strokeWidth > 0;
            textureCreatorState.strokeAlpha = strokeAlpha;
            textureCreatorState.cornerRadius = cornerRadius;
            textureCreatorState.arrowThickness = arrowThickness;
            textureCreatorState.arrowRoundness = arrowRoundness;
            textureCreatorState.fillTransparentEnabled = fillTransparentEnabled;
            textureCreatorState.fillTransparentColor = fillTransparentColor;
            textureCreatorState.fillTransparentAlpha = fillTransparentAlpha;
            return {
                name: rawName,
                width,
                height,
                spec: textureCreatorState.spec,
                is2x: textureCreatorState.spec === '2x',
                color: textureCreatorState.color,
                alpha,
                strokeEnabled: textureCreatorState.strokeEnabled,
                strokeColor: textureCreatorState.strokeColor,
                strokeAlpha,
                strokeWidth,
                shape: textureCreatorState.shape,
                cornerRadius,
                arrowThickness,
                arrowRoundness,
                fillTransparentEnabled,
                fillTransparentColor,
                fillTransparentAlpha,
                transparentFillEnabled: fillTransparentEnabled,
                transparentFillColor: fillTransparentColor,
                transparentFillAlpha: fillTransparentAlpha
            };
        }

        async function createTextureFromCreator() {
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
                const currentParam = paramKey
                    ? (typeof getTextureTabParams === 'function' ? getTextureTabParams() : []).find((p) => p.key === paramKey)
                    : null;
                const currentTrack = currentParam && typeof getParamTrackIndex === 'function'
                    ? getParamTrackIndex(currentParam)
                    : null;
                const references = (isEdit && typeof collectTexturePathReferences === 'function')
                    ? collectTexturePathReferences(sourcePath)
                    : [];
                const otherReferences = currentTrack == null
                    ? []
                    : references.filter((p) => {
                        if (p.key === paramKey) return false;
                        const track = typeof getParamTrackIndex === 'function' ? getParamTrackIndex(p) : null;
                        return track != null && track !== currentTrack;
                    });

                let decision = 'all';
                if (otherReferences.length > 0 && typeof requestLongBodyApplyScope === 'function') {
                    decision = await requestLongBodyApplyScope({
                        title: '贴图被多处引用',
                        text: `“${sourcePath}”还被其他 ${otherReferences.length} 个轨道引用。是否同步替换所有引用？选择“同步替换”将直接覆盖原图；选择“独立创建”将为当前轨道独立创建贴图。`,
                        currentLabel: '独立创建',
                        allLabel: '同步替换'
                    });
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

        function applyTextureCreatorAlpha(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.alpha = Math.max(0, Math.min(100, Math.round(value)));
            updateTextureCreatorAlphaInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorStrokeEnabled(enabled) {
            textureCreatorState.strokeEnabled = !!enabled;
            if (enabled && textureCreatorState.strokeWidth === 0) {
                textureCreatorState.strokeWidth = 2;
            } else if (!enabled) {
                textureCreatorState.strokeWidth = 0;
            }
            updateTextureCreatorStrokeInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorStrokeColor(rawValue) {
            textureCreatorState.strokeColor = normalizeTextureHexColor(rawValue);
            updateTextureCreatorStrokeInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorStrokeWidth(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.strokeWidth = Math.max(
                0,
                Math.min(64, Math.round(value))
            );
            textureCreatorState.strokeEnabled = textureCreatorState.strokeWidth > 0;
            updateTextureCreatorStrokeInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorStrokeAlpha(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.strokeAlpha = Math.max(
                0,
                Math.min(100, Math.round(value))
            );
            updateTextureCreatorStrokeInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorFillTransparentEnabled(enabled) {
            textureCreatorState.fillTransparentEnabled = !!enabled;
            updateTextureCreatorFillTransparentInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorFillTransparentColor(rawValue) {
            textureCreatorState.fillTransparentColor = normalizeTextureHexColor(rawValue);
            updateTextureCreatorFillTransparentInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorFillTransparentAlpha(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.fillTransparentAlpha = Math.max(
                0,
                Math.min(100, Math.round(value))
            );
            updateTextureCreatorFillTransparentInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorCornerRadius(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.cornerRadius = normalizeTextureCreatorCornerRadius(value);
            updateTextureCreatorCornerInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorArrowThickness(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.arrowThickness = Math.max(8, Math.min(50, Math.round(value)));
            updateTextureCreatorArrowInputs();
            refreshTextureCreatorPreview();
        }

        function applyTextureCreatorArrowRoundness(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.arrowRoundness = Math.max(0, Math.min(100, Math.round(value)));
            updateTextureCreatorArrowInputs();
            refreshTextureCreatorPreview();
        }

        function initTextureCreatorUI() {
            const openBtn = byId('textureImageCreateOpenBtn');
            const cancelBtn = byId('textureImageCreateCancelBtn');
            const confirmBtn = byId('textureImageCreateConfirmBtn');
            const nameInput = byId('textureImageCreateName');
            const widthInput = byId('textureImageCreateWidth');
            const heightInput = byId('textureImageCreateHeight');
            const colorInput = byId('textureImageCreateColor');
            const colorHexInput = byId('textureImageCreateColorHex');
            const alphaRange = byId('textureImageCreateAlpha');
            const alphaNumber = byId('textureImageCreateAlphaValue');
            const strokeEnabledInput = byId('textureImageCreateStrokeEnabled');
            const strokeColorInput = byId('textureImageCreateStrokeColor');
            const strokeColorHexInput = byId('textureImageCreateStrokeColorHex');
            const strokeWidthRange = byId('textureImageCreateStrokeWidth');
            const strokeWidthNumber = byId('textureImageCreateStrokeWidthValue');
            const strokeAlphaRange = byId('textureImageCreateStrokeAlpha');
            const strokeAlphaNumber = byId('textureImageCreateStrokeAlphaValue');
            const fillTransparentEnabledInput = byId('textureImageCreateFillTransparentEnabled');
            const fillTransparentColorInput = byId('textureImageCreateFillTransparentColor');
            const fillTransparentColorHexInput = byId('textureImageCreateFillTransparentColorHex');
            const fillTransparentAlphaRange = byId('textureImageCreateFillTransparentAlpha');
            const fillTransparentAlphaNumber = byId('textureImageCreateFillTransparentAlphaValue');
            const radiusRange = byId('textureImageCreateCornerRadiusRange');
            const radiusNumber = byId('textureImageCreateCornerRadius');
            const arrowThicknessRange = byId('textureImageCreateArrowThickness');
            const arrowThicknessNumber = byId('textureImageCreateArrowThicknessValue');
            const arrowRoundnessRange = byId('textureImageCreateArrowRoundness');
            const arrowRoundnessNumber = byId('textureImageCreateArrowRoundnessValue');
            const shapeGrid = byId('textureImageCreateShapeGrid');

            if (openBtn) openBtn.onclick = () => openTextureCreator();
            if (cancelBtn) cancelBtn.onclick = closeTextureCreator;
            if (confirmBtn) confirmBtn.onclick = createTextureFromCreator;

            if (nameInput) {
                nameInput.addEventListener('input', () => {
                    textureCreatorState.name = nameInput.value;
                    updateActiveTextureCreatorTabTitle();
                    const errorEl = byId('textureImageCreateNameError');
                    if (errorEl) {
                        errorEl.textContent = '';
                        errorEl.style.display = 'none';
                    }
                });
                nameInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        createTextureFromCreator();
                    }
                });
            }
            if (widthInput) {
                widthInput.addEventListener('input', () => {
                    const value = Number(widthInput.value);
                    if (!Number.isInteger(value) || value < 1) return;
                    textureCreatorState.width = value;
                    updateTextureCreatorCornerInputs();
                    refreshTextureCreatorPreview();
                });
            }
            if (heightInput) {
                heightInput.addEventListener('input', () => {
                    const value = Number(heightInput.value);
                    if (!Number.isInteger(value) || value < 1) return;
                    textureCreatorState.height = value;
                    updateTextureCreatorCornerInputs();
                    refreshTextureCreatorPreview();
                });
            }
            if (colorInput) {
                colorInput.addEventListener('input', () => {
                    textureCreatorState.color = normalizeTextureHexColor(colorInput.value);
                    if (colorHexInput) colorHexInput.value = textureCreatorState.color;
                    refreshTextureCreatorPreview();
                });
            }
            if (colorHexInput) {
                colorHexInput.addEventListener('input', () => {
                    const raw = colorHexInput.value.trim();
                    if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return;
                    textureCreatorState.color = normalizeTextureHexColor(raw);
                    if (colorInput) colorInput.value = textureCreatorState.color;
                    refreshTextureCreatorPreview();
                });
                colorHexInput.addEventListener('blur', () => {
                    textureCreatorState.color = normalizeTextureHexColor(colorHexInput.value);
                    colorHexInput.value = textureCreatorState.color;
                    if (colorInput) colorInput.value = textureCreatorState.color;
                    refreshTextureCreatorPreview();
                });
            }
            if (alphaRange) {
                alphaRange.addEventListener('input', () => applyTextureCreatorAlpha(alphaRange.value));
            }
            if (alphaNumber) {
                alphaNumber.addEventListener('input', () => applyTextureCreatorAlpha(alphaNumber.value));
            }
            if (strokeEnabledInput) {
                strokeEnabledInput.addEventListener('change', () => {
                    applyTextureCreatorStrokeEnabled(strokeEnabledInput.checked);
                });
            }
            if (strokeColorInput) {
                strokeColorInput.addEventListener('input', () => {
                    applyTextureCreatorStrokeColor(strokeColorInput.value);
                });
            }
            if (strokeColorHexInput) {
                strokeColorHexInput.addEventListener('input', () => {
                    const raw = strokeColorHexInput.value.trim();
                    if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return;
                    applyTextureCreatorStrokeColor(raw);
                });
                strokeColorHexInput.addEventListener('blur', () => {
                    applyTextureCreatorStrokeColor(strokeColorHexInput.value);
                });
            }
            if (strokeWidthRange) {
                strokeWidthRange.addEventListener('input', () => {
                    applyTextureCreatorStrokeWidth(strokeWidthRange.value);
                });
            }
            if (strokeWidthNumber) {
                strokeWidthNumber.addEventListener('input', () => {
                    applyTextureCreatorStrokeWidth(strokeWidthNumber.value);
                });
            }
            if (strokeAlphaRange) {
                strokeAlphaRange.addEventListener('input', () => {
                    applyTextureCreatorStrokeAlpha(strokeAlphaRange.value);
                });
            }
            if (strokeAlphaNumber) {
                strokeAlphaNumber.addEventListener('input', () => {
                    applyTextureCreatorStrokeAlpha(strokeAlphaNumber.value);
                });
            }
            if (fillTransparentEnabledInput) {
                fillTransparentEnabledInput.addEventListener('change', () => {
                    applyTextureCreatorFillTransparentEnabled(fillTransparentEnabledInput.checked);
                });
            }
            if (fillTransparentColorInput) {
                fillTransparentColorInput.addEventListener('input', () => {
                    applyTextureCreatorFillTransparentColor(fillTransparentColorInput.value);
                });
            }
            if (fillTransparentColorHexInput) {
                fillTransparentColorHexInput.addEventListener('input', () => {
                    const raw = fillTransparentColorHexInput.value.trim();
                    if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return;
                    applyTextureCreatorFillTransparentColor(raw);
                });
                fillTransparentColorHexInput.addEventListener('blur', () => {
                    applyTextureCreatorFillTransparentColor(fillTransparentColorHexInput.value);
                });
            }
            if (fillTransparentAlphaRange) {
                fillTransparentAlphaRange.addEventListener('input', () => {
                    applyTextureCreatorFillTransparentAlpha(fillTransparentAlphaRange.value);
                });
            }
            if (fillTransparentAlphaNumber) {
                fillTransparentAlphaNumber.addEventListener('input', () => {
                    applyTextureCreatorFillTransparentAlpha(fillTransparentAlphaNumber.value);
                });
            }
            document.querySelectorAll('input[name="textureImageCreateSpec"]').forEach((input) => {
                input.addEventListener('change', () => {
                    if (!input.checked) return;
                    textureCreatorState.spec = input.value === '2x' ? '2x' : '1x';
                    refreshTextureCreatorPreview();
                });
            });
            if (shapeGrid) {
                shapeGrid.querySelectorAll('.texture-image-shape-btn').forEach((button) => {
                    button.addEventListener('click', () => {
                        textureCreatorState.shape = normalizeTextureShape(button.dataset.shape);
                        updateTextureCreatorShapeSelection();
                        updateTextureCreatorCornerInputs();
                        refreshTextureCreatorPreview();
                    });
                });
            }
            if (radiusRange) {
                radiusRange.addEventListener('input', () => {
                    applyTextureCreatorCornerRadius(radiusRange.value);
                });
            }
            if (radiusNumber) {
                radiusNumber.addEventListener('input', () => {
                    applyTextureCreatorCornerRadius(radiusNumber.value);
                });
            }
            if (arrowThicknessRange) {
                arrowThicknessRange.addEventListener('input', () => {
                    applyTextureCreatorArrowThickness(arrowThicknessRange.value);
                });
            }
            if (arrowThicknessNumber) {
                arrowThicknessNumber.addEventListener('input', () => {
                    applyTextureCreatorArrowThickness(arrowThicknessNumber.value);
                });
            }
            if (arrowRoundnessRange) {
                arrowRoundnessRange.addEventListener('input', () => {
                    applyTextureCreatorArrowRoundness(arrowRoundnessRange.value);
                });
            }
            if (arrowRoundnessNumber) {
                arrowRoundnessNumber.addEventListener('input', () => {
                    applyTextureCreatorArrowRoundness(arrowRoundnessNumber.value);
                });
            }
        }

        window.openTextureCreator = openTextureCreator;
