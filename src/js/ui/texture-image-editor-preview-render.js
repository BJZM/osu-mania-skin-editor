// ============================================================================
// texture-image-editor-preview-render.js - 贴图预览画布与贴图选择器渲染
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function setViews(mode) {
            const picker = byId('textureImagePickerView');
            const editor = byId('textureImageEditorView');
            const creator = byId('textureImageCreatorView');
            const library = byId('textureImageLibraryView');
            const footer = byId('textureImageFooter') || byId('textureImageEditorDialog')?.querySelector('.texture-image-footer');

            const isPicker = mode === true || mode === 'picker';
            const isCreator = mode === 'creator';
            const isLibrary = mode === 'library';
            const isEditor = mode === false || mode === 'editor';
            if (typeof closeActiveTextureEditModeMenu === 'function') {
                closeActiveTextureEditModeMenu();
            }
            if (typeof closeTextureImageSaveMenu === 'function') {
                closeTextureImageSaveMenu();
            }

            if (picker) picker.style.display = isPicker ? 'flex' : 'none';
            if (editor) editor.style.display = isEditor ? 'flex' : 'none';
            if (creator) creator.style.display = isCreator ? 'flex' : 'none';
            if (library) library.style.display = isLibrary ? 'flex' : 'none';
            if (footer) footer.style.display = isEditor ? 'flex' : 'none';
        }

        function isKeyImageSaveMenuAvailable() {
            if (!state.selected || state.longBodyComposer.active) return false;
            const effParam = (typeof getEffectiveParamForTarget === 'function')
                ? getEffectiveParamForTarget(state.selected)
                : (state.selected && state.selected.p);
            return !!(effParam && isEditingKeyImageParam(effParam));
        }

        function closeTextureImageSaveMenu() {
            const menu = byId('textureImageApplyMenu');
            const menuBtn = byId('textureImageApplyMenuBtn');
            if (menu) menu.style.display = 'none';
            if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
        }

        function toggleTextureImageSaveMenu(forceOpen) {
            const menu = byId('textureImageApplyMenu');
            const menuBtn = byId('textureImageApplyMenuBtn');
            if (!menu || !menuBtn || menuBtn.disabled || !isKeyImageSaveMenuAvailable()) {
                closeTextureImageSaveMenu();
                return false;
            }
            const shouldOpen = forceOpen == null
                ? menu.style.display === 'none'
                : !!forceOpen;
            menu.style.display = shouldOpen ? 'block' : 'none';
            menuBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
            return shouldOpen;
        }

        function updateSelectionSummary() {
            const applyBtn = byId('textureImageApplyBtn');
            const applyMenuBtn = byId('textureImageApplyMenuBtn');
            const saveActions = applyBtn ? applyBtn.closest('.texture-image-save-actions') : null;
            const resetBtn = byId('textureImageResetBtn');
            const blankBtn = byId('textureImageBlankBtn');
            const cancelBtn = byId('textureImageCancelBtn');
            if (!state.selected) {
                if (applyBtn) applyBtn.disabled = true;
                if (applyMenuBtn) {
                    applyMenuBtn.disabled = true;
                    applyMenuBtn.style.display = 'none';
                }
                if (resetBtn) resetBtn.disabled = true;
                if (blankBtn) blankBtn.disabled = true;
                if (cancelBtn) cancelBtn.disabled = true;
                if (saveActions) saveActions.classList.remove('has-menu');
                closeTextureImageSaveMenu();
                return;
            }

            const baseEditingLocked = state.longBodyComposer.active;
            if (applyBtn) applyBtn.disabled = false;
            if (resetBtn) resetBtn.disabled = baseEditingLocked;
            if (blankBtn) blankBtn.disabled = baseEditingLocked;
            if (cancelBtn) cancelBtn.disabled = false;

            const keyImageMenuAvailable = isKeyImageSaveMenuAvailable();
            if (applyBtn) {
                applyBtn.textContent = keyImageMenuAvailable
                    ? '保存当前轨道'
                    : '保存到皮肤';
            }
            if (applyMenuBtn) {
                applyMenuBtn.disabled = !keyImageMenuAvailable;
                applyMenuBtn.style.display = keyImageMenuAvailable ? 'inline-flex' : 'none';
            }
            if (saveActions) {
                saveActions.classList.toggle('has-menu', keyImageMenuAvailable);
            }
            if (!keyImageMenuAvailable) {
                closeTextureImageSaveMenu();
                return;
            }

            const effParam = (typeof getEffectiveParamForTarget === 'function')
                ? getEffectiveParamForTarget(state.selected)
                : (state.selected && state.selected.p);
            const kind = getKeyImageParamKind(effParam);
            const stateLabel = kind === 'down' ? 'KeyImageD' : 'KeyImage';
            const currentOnlyBtn = byId('textureImageApplyCurrentOnlyBtn');
            const allOnlyBtn = byId('textureImageApplyAllOnlyBtn');
            if (currentOnlyBtn) currentOnlyBtn.textContent = `仅更新当前 ${stateLabel}`;
            if (allOnlyBtn) allOnlyBtn.textContent = `全部轨道仅更新 ${stateLabel}`;
        }

        function resetTransformInputs() {
            const frame = state.workingFrames[0];
            if (!frame) return;
            state.cropRect = {
                x: 0,
                y: 0,
                width: frame.width,
                height: frame.height
            };
            state.imageTransform = createDefaultImageTransform();
            updateCropInputs(state.cropRect);
            updateImageTransformInputs();
            state.previewBaseViewport = null;
            state.previewViewport = null;
            state.snapGuides = null;
        }

        function calculatePreviewViewport(frame) {
            const canvas = byId('textureImagePreviewCanvas');
            if (!canvas || !frame) return null;
            if (state.longBodyComposer.active) {
                const scale = Math.min((canvas.width - 40) / frame.width, 2.5);
                return {
                    scale,
                    offsetX: (canvas.width - frame.width * scale) / 2,
                    offsetY: getLongBodyCenteredOffsetY(canvas, frame, scale)
                };
            }
            const margin = Math.max(12, Math.round(Math.max(frame.width, frame.height) * 0.08));
            const workspace = {
                x: -margin,
                y: -margin,
                width: frame.width + margin * 2,
                height: frame.height + margin * 2
            };
            const scale = Math.min(
                (canvas.width - 20) / workspace.width,
                (canvas.height - 20) / workspace.height,
                4
            );
            return {
                scale,
                offsetX: (canvas.width - workspace.width * scale) / 2 - workspace.x * scale,
                offsetY: (canvas.height - workspace.height * scale) / 2 - workspace.y * scale
            };
        }

        function drawPreviewTransparencyBackground(ctx, left, top, width, height) {
            const right = left + width;
            const bottom = top + height;
            const visibleLeft = Math.max(0, Math.floor(left));
            const visibleTop = Math.max(0, Math.floor(top));
            const visibleRight = Math.min(ctx.canvas.width, Math.ceil(right));
            const visibleBottom = Math.min(ctx.canvas.height, Math.ceil(bottom));
            if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return;

            const tileSize = 9;
            const originX = Math.floor(left / tileSize) * tileSize;
            const originY = Math.floor(top / tileSize) * tileSize;
            const startColumn = Math.floor((visibleLeft - originX) / tileSize);
            const endColumn = Math.ceil((visibleRight - originX) / tileSize);
            const startRow = Math.floor((visibleTop - originY) / tileSize);
            const endRow = Math.ceil((visibleBottom - originY) / tileSize);

            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, width, height);
            ctx.clip();
            for (let row = startRow; row < endRow; row++) {
                const tileTop = originY + row * tileSize;
                const fillTop = Math.max(visibleTop, tileTop);
                const fillBottom = Math.min(visibleBottom, tileTop + tileSize);
                if (fillBottom <= fillTop) continue;
                for (let column = startColumn; column < endColumn; column++) {
                    const tileLeft = originX + column * tileSize;
                    const fillLeft = Math.max(visibleLeft, tileLeft);
                    const fillRight = Math.min(visibleRight, tileLeft + tileSize);
                    if (fillRight <= fillLeft) continue;
                    ctx.fillStyle = (row + column) % 2 === 0 ? '#1c1a20' : '#0e0d13';
                    ctx.fillRect(fillLeft, fillTop, fillRight - fillLeft, fillBottom - fillTop);
                }
            }
            ctx.restore();
        }

        function fillPreviewOutsideBounds(ctx, left, top, right, bottom) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, ctx.canvas.width, Math.max(0, top));
            ctx.fillRect(0, bottom, ctx.canvas.width, Math.max(0, ctx.canvas.height - bottom));
            ctx.fillRect(0, Math.max(0, top), Math.max(0, left), Math.max(0, bottom - top));
            ctx.fillRect(right, Math.max(0, top), Math.max(0, ctx.canvas.width - right), Math.max(0, bottom - top));
        }

        function renderPreview() {
            const canvas = byId('textureImagePreviewCanvas');
            const frame = state.workingFrames[0];
            const cropRect = state.cropRect;
            if (!canvas || !frame || !cropRect) return;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (!state.previewBaseViewport) {
                state.previewBaseViewport = calculatePreviewViewport(frame);
            }
            if (!state.previewViewport) {
                state.previewViewport = calculateZoomedPreviewViewport(
                    frame,
                    state.previewBaseViewport,
                    state.previewZoom
                );
            }
            if (!state.previewViewport) return;
            const { scale, offsetX, offsetY } = state.previewViewport;
            const renderedFrame = state.previewFrames[0] || frame;

            if (state.longBodyComposer.active) {
                const previewLeft = offsetX;
                const previewTop = offsetY;
                const previewWidth = Math.max(1, renderedFrame.width * scale);
                const previewHeight = Math.max(1, renderedFrame.height * scale);
                drawPreviewTransparencyBackground(
                    ctx,
                    previewLeft,
                    previewTop,
                    previewWidth,
                    previewHeight
                );
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(renderedFrame, previewLeft, previewTop, previewWidth, previewHeight);
                fillPreviewOutsideBounds(
                    ctx,
                    previewLeft,
                    previewTop,
                    previewLeft + previewWidth,
                    previewTop + previewHeight
                );

                const cutoffY = previewTop + state.longBodyComposer.coverage * scale;
                if (cutoffY >= 0 && cutoffY <= canvas.height) {
                    ctx.save();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = 'rgba(120, 220, 255, 0.95)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(0, cutoffY);
                    ctx.lineTo(canvas.width, cutoffY);
                    ctx.stroke();
                    ctx.restore();
                }
                return;
            }

            const outputRect = getTransformedOutputRect(cropRect);
            const outputLeft = offsetX + outputRect.x * scale;
            const outputTop = offsetY + outputRect.y * scale;
            const outputWidth = Math.max(1, outputRect.width * scale);
            const outputHeight = Math.max(1, outputRect.height * scale);
            const outputRight = outputLeft + outputWidth;
            const outputBottom = outputTop + outputHeight;

            drawPreviewTransparencyBackground(
                ctx,
                outputLeft,
                outputTop,
                outputWidth,
                outputHeight
            );
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
                renderedFrame,
                outputLeft,
                outputTop,
                outputWidth,
                outputHeight
            );

            ctx.save();
            fillPreviewOutsideBounds(
                ctx,
                outputLeft,
                outputTop,
                outputRight,
                outputBottom
            );

            ctx.strokeStyle = 'rgba(255, 102, 170, 0.95)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(outputLeft, outputTop, outputWidth, outputHeight);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 1;
            for (let i = 1; i <= 2; i++) {
                const gx = outputLeft + outputWidth * i / 3;
                const gy = outputTop + outputHeight * i / 3;
                ctx.beginPath();
                ctx.moveTo(gx, outputTop);
                ctx.lineTo(gx, outputBottom);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(outputLeft, gy);
                ctx.lineTo(outputRight, gy);
                ctx.stroke();
            }

            const handles = getCropHandlePoints(
                outputLeft,
                outputTop,
                outputRight,
                outputBottom
            );
            ctx.fillStyle = '#f4f4f5';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 1;
            for (const point of Object.values(handles)) {
                const size = 7;
                ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
                ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
            }

            if (state.snapGuides) {
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = 'rgba(120, 220, 255, 0.95)';
                ctx.lineWidth = 1.25;
                if (Number.isFinite(state.snapGuides.x)) {
                    const guideX = outputLeft +
                        (state.snapGuides.x - cropRect.x) *
                        (outputRect.width / Math.max(1, cropRect.width)) * scale;
                    ctx.beginPath();
                    ctx.moveTo(guideX, 0);
                    ctx.lineTo(guideX, canvas.height);
                    ctx.stroke();
                }
                if (Number.isFinite(state.snapGuides.y)) {
                    const guideY = outputTop +
                        (state.snapGuides.y - cropRect.y) *
                        (outputRect.height / Math.max(1, cropRect.height)) * scale;
                    ctx.beginPath();
                    ctx.moveTo(0, guideY);
                    ctx.lineTo(canvas.width, guideY);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
            }
            ctx.restore();
        }

        function updateMeta() {
            const frame = state.previewFrames[0] || state.workingFrames[0];
            const original = state.originalFrames[0];
            if (!frame || !original) return;
            const sourceSize = byId('textureImageSourceSize');
            const workingSize = byId('textureImageWorkingSize');
            if (sourceSize) sourceSize.textContent = `原始: ${original.width} × ${original.height}px`;
            if (workingSize) workingSize.textContent = `当前: ${frame.width} × ${frame.height}px`;
            renderPreview();
            updateStretchFixUI();
        }

        function renderPicker() {
            const grid = byId('textureImagePickerGrid');
            const count = byId('textureImagePickerCount');
            if (!grid) return;
            grid.innerHTML = '';
            const keys = getActiveKeyCount();
            const items = getTextureTabParams();
            if (count) count.textContent = `${items.length} 项`;

            const groups = new Map();
            for (const item of items) {
                if (!groups.has(item.category)) groups.set(item.category, []);
                groups.get(item.category).push(item);
            }

            for (const [catName, catItems] of groups.entries()) {
                const block = document.createElement('div');
                block.className = 'param-category-block';

                const collapseKey = 'textures::' + catName;
                const isCollapsed = collapsedParamCategories.has(collapseKey);
                block.dataset.categoryKey = collapseKey;
                if (isCollapsed) block.classList.add('collapsed');

                const title = document.createElement('button');
                title.type = 'button';
                title.className = 'param-category-title param-category-toggle';
                title.title = '点击折叠 / 展开该分类';
                title.innerHTML = `
                    <svg class="cat-toggle-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    <span>${catName}</span><span class="count-badge">${catItems.length}</span>
                `;
                title.onclick = () => {
                    const nowCollapsed = !block.classList.contains('collapsed');
                    block.classList.toggle('collapsed', nowCollapsed);
                    if (nowCollapsed) collapsedParamCategories.add(collapseKey);
                    else collapsedParamCategories.delete(collapseKey);
                };
                block.appendChild(title);

                const cardsGrid = document.createElement('div');
                cardsGrid.className = 'param-cards-grid';

                const renderUnits = [];
                for (const item of catItems) {
                    if (item._trackGroupKey) {
                        const last = renderUnits[renderUnits.length - 1];
                        if (last && last.kind === 'trackGroup' && last.groupKey === item._trackGroupKey) {
                            last.items.push(item);
                        } else {
                            renderUnits.push({
                                kind: 'trackGroup',
                                groupKey: item._trackGroupKey,
                                groupName: item._trackGroupZhName || item._trackGroupName || item._trackGroupKey,
                                groupEnName: item._trackGroupEnName,
                                desc: item._trackGroupDesc,
                                items: [item],
                            });
                        }
                    } else {
                        renderUnits.push({ kind: 'card', p: item });
                    }
                }

                for (const unit of renderUnits) {
                    if (unit.kind === 'trackGroup') {
                        cardsGrid.appendChild(buildPerTrackTextureGroup(unit, keys, { pickerMode: true }));
                        continue;
                    }
                    const p = unit.p;
                    const target = buildEditorTarget(p);
                    const canEdit = !!(target && target.selectable);

                    const card = document.createElement('div');
                    card.className = 'param-card texture-image-picker-item';
                    card.id = `param-card-${p.key}`;
                    card.dataset.paramKey = p.key;

                    if (state.selected && state.selected.p.key === p.key) {
                        card.classList.add('selected');
                    }

                    const header = document.createElement('div');
                    header.className = 'param-card-header';

                    const names = document.createElement('div');
                    names.className = 'param-names';

                    const zhName = document.createElement('span');
                    zhName.className = 'param-zh-name';
                    zhName.textContent = p.zhName;
                    names.appendChild(zhName);

                    if (p.desc) {
                        const info = document.createElement('span');
                        info.className = 'param-info-trigger';
                        info.tabIndex = 0;
                        info.innerHTML = `<span class="param-info-icon">ⓘ</span><div class="param-desc-tooltip">${p.desc}</div>`;
                        names.appendChild(info);
                    }

                    const enName = document.createElement('span');
                    enName.className = 'param-en-name';
                    enName.textContent = p.key;
                    names.appendChild(enName);

                    header.appendChild(names);
                    card.appendChild(header);

                    const controlRow = document.createElement('div');
                    controlRow.className = 'param-control-row';
                    controlRow.appendChild(buildTextureParamControl(p, keys, card, {
                        onEdit: () => {
                            if (canEdit) selectTarget(target);
                        },
                        editDisabled: !canEdit,
                        editTitle: canEdit
                            ? `编辑 ${p.zhName}`
                            : '当前没有可编辑的图片'
                    }));
                    card.appendChild(controlRow);
                    card.onclick = (e) => {
                        if (e.target.closest('.texture-upload-dropdown') || e.target.closest('input')) return;
                        if (canEdit) selectTarget(target);
                    };

                    cardsGrid.appendChild(card);
                }

                block.appendChild(cardsGrid);
                grid.appendChild(block);
            }
        }

        function focusTexturePickerParams(paramKeys) {
            if (!isSkinEditingWorkspaceReady()) return false;
            const keys = Array.from(new Set(
                (Array.isArray(paramKeys) ? paramKeys : [paramKeys])
                    .filter((key) => typeof key === 'string' && key)
            ));
            if (keys.length === 0 || !open()) return false;

            activateTab('menu', { force: true });
            renderPicker();

            const cards = [];
            for (const key of keys) {
                const card = byId(`param-card-${key}`);
                if (!card) continue;
                const category = card.closest('.param-category-block');
                if (category) {
                    category.classList.remove('collapsed');
                    if (category.dataset.categoryKey) {
                        collapsedParamCategories.delete(category.dataset.categoryKey);
                    }
                }
                cards.push(card);
            }
            if (cards.length !== keys.length) return false;

            for (const card of cards) {
                if (card._textureFocusTimer) clearTimeout(card._textureFocusTimer);
                card.classList.add('highlight-pulse');
                card._textureFocusTimer = setTimeout(() => {
                    card.classList.remove('highlight-pulse');
                    card._textureFocusTimer = null;
                }, 3500);
            }
            cards[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
        }
