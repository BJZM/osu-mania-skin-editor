// ============================================================================
// texture-image-editor-create-inputs.js - 纯色贴图创建器表单同步与 DOM 事件绑定
// 从 texture-image-editor-create.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

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
            const colorInput = byId('textureImageCreateFillTransparentColor');
            const colorHexInput = byId('textureImageCreateFillTransparentColorHex');
            const alphaRange = byId('textureImageCreateFillTransparentAlpha');
            const alphaNumber = byId('textureImageCreateFillTransparentAlphaValue');

            const color = normalizeTextureHexColor(textureCreatorState.fillTransparentColor || '#000000');
            if (colorInput) colorInput.value = color;
            if (colorHexInput) colorHexInput.value = color;
            const alpha = Number.isFinite(textureCreatorState.fillTransparentAlpha)
                ? textureCreatorState.fillTransparentAlpha
                : 0;
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

        function applyTextureCreatorAlpha(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.alpha = Math.max(0, Math.min(100, Math.round(value)));
            updateTextureCreatorAlphaInputs();
            scheduleTextureCreatorPreview();
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

        function applyTextureCreatorStrokeColor(rawValue, immediate = false) {
            textureCreatorState.strokeColor = normalizeTextureHexColor(rawValue);
            updateTextureCreatorStrokeInputs();
            if (immediate) refreshTextureCreatorPreview();
            else scheduleTextureCreatorPreview();
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
            scheduleTextureCreatorPreview();
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
            scheduleTextureCreatorPreview();
        }

        function applyTextureCreatorFillTransparentColor(rawValue, immediate = false) {
            textureCreatorState.fillTransparentColor = normalizeTextureHexColor(rawValue);
            updateTextureCreatorFillTransparentInputs();
            if (immediate) refreshTextureCreatorPreview();
            else scheduleTextureCreatorPreview();
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
            scheduleTextureCreatorPreview();
        }

        function applyTextureCreatorCornerRadius(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.cornerRadius = normalizeTextureCreatorCornerRadius(value);
            updateTextureCreatorCornerInputs();
            scheduleTextureCreatorPreview();
        }

        function applyTextureCreatorArrowThickness(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.arrowThickness = Math.max(8, Math.min(50, Math.round(value)));
            updateTextureCreatorArrowInputs();
            scheduleTextureCreatorPreview();
        }

        function applyTextureCreatorArrowRoundness(rawValue) {
            if (rawValue === '') return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            textureCreatorState.arrowRoundness = Math.max(0, Math.min(100, Math.round(value)));
            updateTextureCreatorArrowInputs();
            scheduleTextureCreatorPreview();
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
                    scheduleTextureCreatorPreview();
                });
            }
            if (heightInput) {
                heightInput.addEventListener('input', () => {
                    const value = Number(heightInput.value);
                    if (!Number.isInteger(value) || value < 1) return;
                    textureCreatorState.height = value;
                    updateTextureCreatorCornerInputs();
                    scheduleTextureCreatorPreview();
                });
            }
            if (colorInput) {
                colorInput.addEventListener('input', () => {
                    textureCreatorState.color = normalizeTextureHexColor(colorInput.value);
                    if (colorHexInput) colorHexInput.value = textureCreatorState.color;
                    scheduleTextureCreatorPreview();
                });
            }
            if (colorHexInput) {
                colorHexInput.addEventListener('input', () => {
                    const raw = colorHexInput.value.trim();
                    if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return;
                    textureCreatorState.color = normalizeTextureHexColor(raw);
                    if (colorInput) colorInput.value = textureCreatorState.color;
                    scheduleTextureCreatorPreview();
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
                    applyTextureCreatorStrokeColor(strokeColorHexInput.value, true);
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
                    applyTextureCreatorFillTransparentColor(fillTransparentColorHexInput.value, true);
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
