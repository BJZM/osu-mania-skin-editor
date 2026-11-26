// ============================================================================
// texture-image-editor-create-state.js - 纯色贴图创建器状态与预览渲染
// 从 texture-image-editor-create.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        let nextTextureCreatorTabId = 1;
        let textureCreatorPreviewTimer = null;
        let textureCreatorPreviewRaf = 0;

        function cancelScheduledTextureCreatorPreview() {
            if (textureCreatorPreviewTimer) {
                clearTimeout(textureCreatorPreviewTimer);
                textureCreatorPreviewTimer = null;
            }
            if (textureCreatorPreviewRaf) {
                cancelAnimationFrame(textureCreatorPreviewRaf);
                textureCreatorPreviewRaf = 0;
            }
        }

        function updateTextureCreatorPreviewLabels() {
            const sizeLabel = byId('textureImageCreatePreviewSize');
            const specLabel = byId('textureImageCreateSpecLabel');
            if (sizeLabel) {
                sizeLabel.textContent = `${textureCreatorState.width} × ${textureCreatorState.height}px`;
            }
            if (specLabel) {
                specLabel.textContent = textureCreatorState.spec === '2x' ? '@2x' : '1x';
            }
        }

        function scheduleTextureCreatorPreview() {
            updateTextureCreatorPreviewLabels();
            syncActiveCreatorTabDirtyDot();
            cancelScheduledTextureCreatorPreview();
            textureCreatorPreviewTimer = setTimeout(() => {
                textureCreatorPreviewTimer = null;
                textureCreatorPreviewRaf = requestAnimationFrame(() => {
                    textureCreatorPreviewRaf = 0;
                    refreshTextureCreatorPreview();
                });
            }, 80);
        }

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
                    fillTransparentColor: (saved && (saved.fillTransparentColor || saved.transparentFillColor)) || '#000000',
                    fillTransparentAlpha: (saved && Number.isFinite(saved.fillTransparentAlpha !== undefined ? saved.fillTransparentAlpha : saved.transparentFillAlpha))
                        ? (saved.fillTransparentAlpha !== undefined ? saved.fillTransparentAlpha : saved.transparentFillAlpha)
                        : 0
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
                fillTransparentColor: '#000000',
                fillTransparentAlpha: 0
            };
        }

        let textureCreatorState = createTextureCreatorState({ assignDefaultName: false });

        function captureTextureCreatorBaseline(cs) {
            if (!cs) return null;
            return {
                name: String(cs.name || ''),
                width: Number(cs.width) || 0,
                height: Number(cs.height) || 0,
                spec: cs.spec === '2x' ? '2x' : '1x',
                color: String(cs.color || '').toLowerCase(),
                alpha: Number(cs.alpha),
                strokeEnabled: !!cs.strokeEnabled,
                strokeColor: String(cs.strokeColor || '').toLowerCase(),
                strokeAlpha: Number(cs.strokeAlpha),
                strokeWidth: Number(cs.strokeWidth) || 0,
                shape: String(cs.shape || ''),
                cornerRadius: Number(cs.cornerRadius) || 0,
                arrowThickness: Number(cs.arrowThickness) || 0,
                arrowRoundness: Number(cs.arrowRoundness) || 0,
                fillTransparentColor: String(cs.fillTransparentColor || '').toLowerCase(),
                fillTransparentAlpha: Number(cs.fillTransparentAlpha) || 0
            };
        }

        function isTextureCreatorStateDirty(cs) {
            if (!cs || !cs.editPath || !cs.previewSnapshot) return false;
            const base = cs.baseline;
            if (!base) return true;
            const cur = captureTextureCreatorBaseline(cs);
            return Object.keys(base).some((key) => base[key] !== cur[key]);
        }

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
                    fillTransparentColor: textureCreatorState.fillTransparentColor,
                    fillTransparentAlpha: textureCreatorState.fillTransparentAlpha / 100
                });
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(preview, 0, 0);
            });
        }

        function refreshTextureCreatorPreview() {
            cancelScheduledTextureCreatorPreview();
            const canvas = byId('textureImageCreatePreviewCanvas');
            updateTextureCreatorPreviewLabels();
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

        function syncActiveCreatorTabDirtyDot(tab = (typeof getActiveTab === 'function' ? getActiveTab() : null)) {
            if (!tab || tab.kind !== 'creator' ||
                typeof isTabDirty !== 'function' || typeof renderTabs !== 'function') {
                return;
            }
            const tabEl = document.querySelector(`.texture-image-tab[data-tab-id="${tab.id}"]`);
            const hasDirtyDot = !!(tabEl && tabEl.querySelector('.texture-image-tab-dirty'));
            if (hasDirtyDot !== isTabDirty(tab)) {
                renderTabs();
            }
        }

        function refreshTextureCreatorCanvasPreview() {
            const modal = byId('textureImageEditorModal');
            const activeTab = typeof getActiveTab === 'function' ? getActiveTab() : null;
            if (!modal || !modal.classList.contains('active') || modal.classList.contains('is-closing') ||
                !activeTab || activeTab.kind !== 'creator' || activeTab.creatorState !== textureCreatorState) {
                return false;
            }
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
                syncActiveCreatorTabDirtyDot();
                return true;
            } catch (err) {
                console.warn('生成生成设置画布实时预览失败:', err);
                return false;
            }
        }
