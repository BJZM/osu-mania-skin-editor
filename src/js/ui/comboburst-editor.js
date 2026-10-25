// ============================================================================
// comboburst-editor.js - 贴图编辑窗口中的连击提示图组上传与预览
// 依赖：render/comboburst-assets、history、skin-assets、feedback
// ============================================================================

        const COMBOBURST_GROUP_UPLOAD_LIMIT_BYTES = 32 * 1024 * 1024;
        const COMBOBURST_PREVIEW_PHASE_MS = 1400;

        let comboburstGroupEditorInitialized = false;
        let comboburstGroupEditorUi = null;
        let comboburstGroupState = {
            frames: [],
            spec: '1x',
            isPlaying: true,
            previewStartedAt: 0,
            previewPausedAt: 0,
            previewTimer: null,
            initialMode: 'none'
        };

        function comboburstGroupPathVariants(logicalPath) {
            const base = String(logicalPath || '')
                .replace(/\.(png|jpe?g)$/i, '')
                .replace(/@2x$/i, '')
                .toLowerCase();
            return [`${base}.png`, `${base}@2x.png`];
        }

        function markComboburstGroupPathDeleted(logicalPath) {
            for (const path of comboburstGroupPathVariants(logicalPath)) {
                deletedSkinTexturePaths.add(path);
            }
        }

        function unmarkComboburstGroupPathDeleted(logicalPath) {
            for (const path of comboburstGroupPathVariants(logicalPath)) {
                deletedSkinTexturePaths.delete(path);
            }
        }

        function removeComboburstGroupUserReplacement(logicalPath) {
            const expected = String(logicalPath || '')
                .replace(/\.(png|jpe?g)$/i, '')
                .replace(/@2x$/i, '')
                .toLowerCase();
            for (const path of Array.from(userReplacedTextures.keys())) {
                const normalized = String(path || '')
                    .replace(/\.(png|jpe?g)$/i, '')
                    .replace(/@2x$/i, '')
                    .toLowerCase();
                if (normalized === expected) userReplacedTextures.delete(path);
            }
        }

        function createComboburstGroupBlobUrl(image) {
            if (!image) return '';
            if (image.src && (image.src.startsWith('blob:') || image.src.startsWith('data:') ||
                image.src.startsWith('http') || image.src.startsWith('file:'))) {
                return image.src;
            }
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width || 1;
            canvas.height = image.naturalHeight || image.height || 1;
            canvas.getContext('2d').drawImage(image, 0, 0);
            return canvas.toDataURL('image/png');
        }

        function getComboburstGroupSeedFrames() {
            const state = getComboburstAssetState();
            return state.images.map((record, index) => ({
                file: null,
                arrayBuffer: null,
                img: record.image,
                blobUrl: createComboburstGroupBlobUrl(record.image),
                ownsBlobUrl: false,
                name: `${record.path || `comboburst-mania-${index}`}.png`,
                width: record.image.naturalWidth || record.image.width || 0,
                height: record.image.naturalHeight || record.image.height || 0,
                size: 0
            }));
        }

        function stopComboburstGroupPreview() {
            if (comboburstGroupState.previewTimer) {
                clearInterval(comboburstGroupState.previewTimer);
                comboburstGroupState.previewTimer = null;
            }
        }

        function comboburstGroupTimeline() {
            const frames = comboburstGroupState.frames || [];
            if (frames.length === 0) {
                return { index: 0, side: 'left', elapsed: 0, progress: 0 };
            }
            const now = performance.now();
            if (!comboburstGroupState.isPlaying) {
                const elapsed = comboburstGroupState.previewPausedAt;
                const imageCycle = COMBOBURST_PREVIEW_PHASE_MS * 2;
                const cycleElapsed = elapsed % (imageCycle * frames.length);
                return {
                    index: Math.floor(cycleElapsed / imageCycle),
                    side: (cycleElapsed % imageCycle) < COMBOBURST_PREVIEW_PHASE_MS ? 'left' : 'right',
                    elapsed: cycleElapsed % imageCycle,
                    progress: (cycleElapsed % COMBOBURST_PREVIEW_PHASE_MS) / COMBOBURST_PREVIEW_PHASE_MS
                };
            }
            const elapsed = Math.max(0, now - comboburstGroupState.previewStartedAt);
            const imageCycle = COMBOBURST_PREVIEW_PHASE_MS * 2;
            const cycleElapsed = elapsed % (imageCycle * frames.length);
            return {
                index: Math.floor(cycleElapsed / imageCycle),
                side: (cycleElapsed % imageCycle) < COMBOBURST_PREVIEW_PHASE_MS ? 'left' : 'right',
                elapsed: cycleElapsed % imageCycle,
                progress: (cycleElapsed % COMBOBURST_PREVIEW_PHASE_MS) / COMBOBURST_PREVIEW_PHASE_MS
            };
        }

        function drawComboburstGroupPreview() {
            const canvas = document.getElementById('comboburstGroupPreviewCanvas');
            const badge = document.getElementById('comboburstGroupPreviewBadge');
            const status = document.getElementById('comboburstGroupPreviewStatus');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const frames = comboburstGroupState.frames || [];
            if (frames.length === 0 || !frames[0].img) {
                if (badge) badge.textContent = '0 张';
                if (status) status.textContent = '等待添加图片';
                return;
            }

            const timeline = comboburstGroupTimeline();
            const frame = frames[Math.min(frames.length - 1, timeline.index)];
            const image = frame && frame.img;
            if (!image) return;

            const nativeW = image.naturalWidth || image.width || 1;
            const nativeH = image.naturalHeight || image.height || 1;
            const scale = Math.min((canvas.width - 20) / nativeW, (canvas.height - 20) / nativeH);
            const drawW = Math.max(1, nativeW * scale);
            const drawH = Math.max(1, nativeH * scale);
            const phaseElapsed = timeline.elapsed;
            const fadeIn = Math.min(1, phaseElapsed / 250);
            const fadeOut = phaseElapsed <= 400
                ? 1
                : Math.max(0, 1 - (phaseElapsed - 400) / (COMBOBURST_PREVIEW_PHASE_MS - 400));
            const alpha = Math.min(fadeIn, fadeOut);
            const outCirc = 1 - Math.pow(1 - timeline.progress, 3);
            const movement = 16 * outCirc;
            const y = canvas.height - drawH;

            ctx.save();
            if (timeline.side === 'left') {
                ctx.globalAlpha = alpha;
                ctx.drawImage(image, 4 + movement, y, drawW, drawH);
            } else {
                ctx.globalAlpha = alpha;
                ctx.translate(canvas.width - 4 - movement, y);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, 0, drawW, drawH);
            }
            ctx.restore();

            const sideText = timeline.side === 'left' ? '向左' : '向右';
            if (badge) {
                badge.textContent = `${timeline.index + 1} / ${frames.length} · ${sideText}`;
            }
            if (status) {
                status.textContent = `第 ${timeline.index + 1} 张 · ${sideText}`;
            }
        }

        function startComboburstGroupPreview() {
            stopComboburstGroupPreview();
            comboburstGroupState.previewTimer = setInterval(drawComboburstGroupPreview, 33);
            drawComboburstGroupPreview();
        }

        function resetComboburstGroupPreviewClock() {
            comboburstGroupState.previewStartedAt = performance.now();
            comboburstGroupState.previewPausedAt = 0;
            comboburstGroupState.isPlaying = true;
            const playBtn = document.getElementById('comboburstGroupPlayToggleBtn');
            if (playBtn) playBtn.textContent = '暂停';
            startComboburstGroupPreview();
        }

        function updateComboburstGroupSpecButtons() {
            const btn1x = document.getElementById('comboburstGroupSpec1xBtn');
            const btn2x = document.getElementById('comboburstGroupSpec2xBtn');
            if (btn1x) btn1x.classList.toggle('active', comboburstGroupState.spec === '1x');
            if (btn2x) btn2x.classList.toggle('active', comboburstGroupState.spec === '2x');
            renderComboburstGroupFrames();
        }

        function comboburstGroupEscapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function renderComboburstGroupFrames() {
            const emptyState = document.getElementById('comboburstGroupEmptyState');
            const grid = document.getElementById('comboburstGroupFramesGrid');
            const previewPanel = document.getElementById('comboburstGroupPreviewPanel');
            const confirmBtn = document.getElementById('comboburstGroupConfirmBtn');
            const clearAllBtn = document.getElementById('comboburstGroupClearAllBtn');
            const frames = comboburstGroupState.frames || [];
            const total = frames.length;
            const canApply = total > 0 || comboburstGroupState.initialMode !== 'none';

            if (confirmBtn) {
                confirmBtn.disabled = !canApply;
                confirmBtn.textContent = total > 0
                    ? `保存图组 (${total} 张)`
                    : (canApply ? '清空连击提示图组' : '保存图组 (0 张)');
            }
            if (clearAllBtn) clearAllBtn.style.display = total > 0 ? 'inline-flex' : 'none';
            if (emptyState) emptyState.style.display = total === 0 ? 'flex' : 'none';
            if (grid) {
                grid.style.display = total > 0 ? 'grid' : 'none';
                grid.innerHTML = '';
            }
            if (previewPanel) previewPanel.style.display = total > 0 ? 'flex' : 'none';

            if (total === 0) {
                drawComboburstGroupPreview();
                return;
            }

            const suffix = comboburstGroupState.spec === '2x' ? '@2x.png' : '.png';
            frames.forEach((frame, index) => {
                const card = document.createElement('div');
                card.className = 'anim-frame-card comboburst-group-frame-card';
                card.dataset.comboburstGroupIndex = String(index);
                const exportName = `comboburst-mania-${index}${suffix}`;
                const kb = frame.size > 0 ? ` (${(frame.size / 1024).toFixed(1)} KB)` : '';
                card.innerHTML = `
                    <div class="anim-frame-header">
                        <span class="anim-frame-badge">第 ${index + 1} 张</span>
                        <span class="anim-frame-export-name" title="${comboburstGroupEscapeHtml(exportName)}">${comboburstGroupEscapeHtml(exportName)}</span>
                        <button type="button" class="anim-frame-delete-btn" title="删除此图片">✕</button>
                    </div>
                    <div class="anim-frame-thumb-box">
                        <img src="${comboburstGroupEscapeHtml(frame.blobUrl)}" alt="Comboburst ${index}">
                    </div>
                    <div class="anim-frame-meta">
                        <span class="anim-frame-name" title="${comboburstGroupEscapeHtml(frame.name)}">${comboburstGroupEscapeHtml(frame.name)}</span>
                        <span class="anim-frame-dim">${frame.width}×${frame.height}${kb}</span>
                    </div>
                    <div class="anim-frame-move-btns">
                        <button type="button" class="anim-move-btn comboburst-group-move-left" title="向前移动" ${index === 0 ? 'disabled' : ''}>◀ 前移</button>
                        <button type="button" class="anim-move-btn comboburst-group-move-right" title="向后移动" ${index === total - 1 ? 'disabled' : ''}>后移 ▶</button>
                    </div>
                `;
                const moveLeft = card.querySelector('.comboburst-group-move-left');
                const moveRight = card.querySelector('.comboburst-group-move-right');
                const remove = card.querySelector('.anim-frame-delete-btn');
                if (moveLeft && index > 0) {
                    moveLeft.onclick = () => {
                        [frames[index - 1], frames[index]] = [frames[index], frames[index - 1]];
                        resetComboburstGroupPreviewClock();
                        renderComboburstGroupFrames();
                    };
                }
                if (moveRight && index < total - 1) {
                    moveRight.onclick = () => {
                        [frames[index + 1], frames[index]] = [frames[index], frames[index + 1]];
                        resetComboburstGroupPreviewClock();
                        renderComboburstGroupFrames();
                    };
                }
                if (remove) {
                    remove.onclick = () => {
                        const [removed] = frames.splice(index, 1);
                        if (removed && removed.ownsBlobUrl && removed.blobUrl) {
                            try { URL.revokeObjectURL(removed.blobUrl); } catch (_) {}
                        }
                        resetComboburstGroupPreviewClock();
                        renderComboburstGroupFrames();
                    };
                }
                grid.appendChild(card);
            });
            drawComboburstGroupPreview();
        }

        function closeComboburstGroupEditor() {
            stopComboburstGroupPreview();
            for (const frame of comboburstGroupState.frames || []) {
                if (frame.ownsBlobUrl && frame.blobUrl) {
                    try { URL.revokeObjectURL(frame.blobUrl); } catch (_) {}
                }
            }
            comboburstGroupState.frames = [];
            const singleInput = document.getElementById('comboburstGroupSingleInput');
            const batchInput = document.getElementById('comboburstGroupBatchInput');
            if (singleInput) singleInput.value = '';
            if (batchInput) batchInput.value = '';
            const modal = document.getElementById('comboburstGroupModal');
            if (modal) modal.style.display = 'none';
        }

        function openComboburstGroupEditor(options = {}) {
            closeComboburstGroupEditor();
            const assetState = getComboburstAssetState();
            const seedFrames = getComboburstGroupSeedFrames();
            const first = seedFrames[0];
            const requestedSpec = options && (options.spec === '1x' || options.spec === '2x')
                ? options.spec
                : null;
            comboburstGroupState = {
                frames: seedFrames,
                spec: requestedSpec || (first && first.img && first.img._is2x ? '2x' : '1x'),
                isPlaying: true,
                previewStartedAt: performance.now(),
                previewPausedAt: 0,
                previewTimer: null,
                initialMode: assetState.mode
            };
            updateComboburstGroupSpecButtons();
            renderComboburstGroupFrames();
            const modal = document.getElementById('comboburstGroupModal');
            if (modal) modal.style.display = 'flex';
            resetComboburstGroupPreviewClock();
        }

        async function readComboburstGroupFile(file) {
            if (!file) throw new Error('未选择图片文件');
            const supportedType = /image\/(?:png|jpeg|pjpeg)/i.test(file.type || '') ||
                /\.(png|jpe?g)$/i.test(file.name || '');
            if (!supportedType) throw new Error('仅支持 PNG 或 JPEG 图片');
            if (file.size > COMBOBURST_GROUP_UPLOAD_LIMIT_BYTES) {
                throw new Error('单张图片不能超过 32 MB');
            }
            const arrayBuffer = await file.arrayBuffer();
            const blobUrl = URL.createObjectURL(new Blob([arrayBuffer]));
            try {
                const img = await new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => resolve(image);
                    image.onerror = () => reject(new Error('无法解析该图片文件'));
                    image.src = blobUrl;
                });
                return {
                    file,
                    arrayBuffer,
                    img,
                    blobUrl,
                    ownsBlobUrl: true,
                    name: file.name,
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height,
                    size: file.size
                };
            } catch (err) {
                try { URL.revokeObjectURL(blobUrl); } catch (_) {}
                throw err;
            }
        }

        async function addComboburstGroupFiles(fileList, options = {}) {
            const files = Array.from(fileList || []);
            if (files.length === 0) return;
            if (options.sortByName !== false) {
                files.sort((a, b) => a.name.localeCompare(b.name, undefined, {
                    numeric: true,
                    sensitivity: 'base'
                }));
            }
            let added = 0;
            for (const file of files) {
                try {
                    comboburstGroupState.frames.push(await readComboburstGroupFile(file));
                    added++;
                } catch (err) {
                    console.warn('跳过无法解析的连击提示图', file.name, err);
                }
            }
            if (added > 0) {
                resetComboburstGroupPreviewClock();
                renderComboburstGroupFrames();
                showToast('添加连击提示图成功', `已添加 ${added} 张图片`);
            } else {
                showToast('添加失败', '所选图片都无法解析');
            }
        }

        async function canvasToComboburstGroupBuffer(image) {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width || 1;
            canvas.height = image.naturalHeight || image.height || 1;
            canvas.getContext('2d').drawImage(image, 0, 0);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('无法编码连击提示图');
            return blob.arrayBuffer();
        }

        function collectExistingComboburstGroupPaths() {
            const paths = new Set([COMBOBURST_BASE_NAME]);
            for (let index = 0; index < 1024; index++) {
                const path = `comboburst-mania-${index}`;
                if (skinImageStore.has(path) || skinFallbackImageStore.has(path)) paths.add(path);
            }
            if (currentSkinZip) {
                for (const filename of Object.keys(currentSkinZip.files || {})) {
                    const normalized = normalizeSkinAssetStoreKey(filename);
                    if (/^comboburst-mania-\d+$/i.test(normalized)) paths.add(normalized);
                }
            }
            return paths;
        }

        function clearExistingComboburstGroup() {
            for (const path of collectExistingComboburstGroupPaths()) {
                markComboburstGroupPathDeleted(path);
                removeComboburstGroupUserReplacement(path);
                skinImageStore.delete(path);
                skinFallbackImageStore.delete(path);
            }
        }

        async function applyComboburstGroupFrames() {
            const frames = comboburstGroupState.frames || [];
            const is2x = comboburstGroupState.spec === '2x';
            const currentState = getComboburstAssetState();
            if (frames.length === 0 && currentState.mode === 'none') {
                closeComboburstGroupEditor();
                return false;
            }

            const prepared = [];
            for (const frame of frames) {
                const bytes = await canvasToComboburstGroupBuffer(frame.img);
                prepared.push({ frame, bytes });
            }

            recordSkinUndoBeforeChange(
                frames.length > 0 ? `保存连击提示图组 (${frames.length} 张)` : '清空连击提示图组',
                { force: true }
            );
            continuousActionActive = false;
            clearExistingComboburstGroup();

            for (let index = 0; index < prepared.length; index++) {
                const { frame, bytes } = prepared[index];
                const logicalPath = `comboburst-mania-${index}`;
                const exportName = getComboburstVariantPath(index, is2x);
                frame.img._is2x = is2x;
                frame.img._isRootLevel = true;
                unmarkComboburstGroupPathDeleted(logicalPath);
                saveSkinAssetToStore(skinImageStore, logicalPath, frame.img, is2x, true, true);
                removeComboburstGroupUserReplacement(logicalPath);
                userReplacedTextures.set(exportName, bytes);
                deletedSkinTexturePaths.add(
                    `${logicalPath}${is2x ? '.png' : '@2x.png'}`
                );
                deletedSkinTexturePaths.delete(
                    `${logicalPath}${is2x ? '@2x.png' : '.png'}`
                );
            }

            comboburstRuntimeState.active.length = 0;
            closeComboburstGroupEditor();
            drawFrame();
            renderSkinEditorParams();
            showToast(
                frames.length > 0 ? '连击提示图组已保存' : '连击提示图组已清空',
                frames.length > 0
                    ? `已写入 ${frames.length} 张图片，导出文件名从 comboburst-mania-0${is2x ? '@2x' : ''}.png 开始`
                    : '已移除当前皮肤的编号连击提示图组'
            );
            return true;
        }

        function buildComboburstTextureControl(p, keys, hoverHost, options = {}) {
            const combo = document.createElement('div');
            combo.className = 'texture-param-combo texture-comboburst-param';
            combo.dataset.paramKey = p.key;
            const assetState = getComboburstAssetState();

            const previewWrap = document.createElement('div');
            previewWrap.className = 'texture-preview-wrap';
            const box = document.createElement('div');
            box.className = 'texture-preview-box';
            previewWrap.appendChild(box);
            const previewImage = assetState.images[0] ? assetState.images[0].image : null;
            renderTextureThumbnail(
                box,
                previewImage,
                '未配置',
                44,
                32,
                null,
                previewWrap
            );

            const pathInput = document.createElement('input');
            pathInput.type = 'text';
            pathInput.className = 'param-text-input texture-path-input';
            pathInput.readOnly = true;
            if (assetState.mode === 'numbered') {
                pathInput.value = assetState.count === 1
                    ? 'comboburst-mania-0'
                    : `comboburst-mania-0..${assetState.count - 1}`;
                pathInput.title = '当前使用连续编号连击提示图组';
            } else if (assetState.mode === 'single') {
                pathInput.value = 'comboburst-mania';
                pathInput.title = '当前使用单张主图';
            } else {
                pathInput.value = '';
                pathInput.placeholder = '未配置 (导入多张贴图)';
                pathInput.title = '当前皮肤没有连击提示图';
            }

            const dropdown = document.createElement('div');
            dropdown.className = 'texture-upload-dropdown';
            const openMenu = () => {
                dropdown.classList.add('is-open');
                if (hoverHost) hoverHost.style.zIndex = '500';
            };
            const closeMenu = () => {
                dropdown.classList.remove('is-open');
                if (hoverHost) hoverHost.style.zIndex = '';
            };
            dropdown.addEventListener('pointerenter', openMenu);
            dropdown.addEventListener('pointerleave', closeMenu);
            dropdown.addEventListener('focusin', openMenu);
            dropdown.addEventListener('focusout', (event) => {
                if (!dropdown.contains(event.relatedTarget)) closeMenu();
            });

            const mainBtn = document.createElement('button');
            mainBtn.type = 'button';
            mainBtn.className = 'texture-upload-main-btn';
            mainBtn.title = '打开连击提示图组，可导入单张或多张图片';
            mainBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true">
                    <rect x="3" y="5" width="13" height="14" rx="2"></rect>
                    <path d="m8 13 3-3 3 3"></path>
                    <path d="M8 19h11a2 2 0 0 0 2-2V8"></path>
                </svg>
                <span>导入图片</span>
                <svg class="dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            mainBtn.onclick = (event) => {
                event.stopPropagation();
                openComboburstGroupEditor();
            };

            const menu = document.createElement('div');
            menu.className = 'texture-upload-menu';
            const appendItem = (mode, tag, text, title, spec) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `texture-upload-menu-item item-${mode}`;
                button.dataset.uploadMode = mode;
                button.title = title;
                button.innerHTML = `
                    <span class="upload-menu-tag ${mode === 'multi' ? 'tag-anim' : (mode === '2x' ? 'tag-2x' : 'tag-1x')}">${tag}</span>
                    <span class="upload-menu-text">${text}</span>
                `;
                button.onclick = (event) => {
                    event.stopPropagation();
                    closeMenu();
                    openComboburstGroupEditor(spec ? { spec } : {});
                };
                menu.appendChild(button);
            };
            appendItem('1x', '1x', '导入 1x 普通贴图', '打开图组并默认使用 1x 规格', '1x');
            appendItem('2x', '@2x', '导入 @2x 高清图片', '打开图组并默认使用 @2x 规格', '2x');
            appendItem('multi', '批量', '导入多张贴图', '批量导入多张连击提示图并循环预览');

            dropdown.append(mainBtn, menu);
            combo.appendChild(previewWrap);
            combo.appendChild(pathInput);
            if (typeof options.onEdit === 'function') {
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'texture-upload-main-btn texture-edit-main-btn';
                editButton.dataset.paramKey = p.key;
                editButton.title = '编辑连击提示图组';
                editButton.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                    <span>编辑</span>
                `;
                editButton.onclick = (event) => {
                    event.stopPropagation();
                    options.onEdit();
                };
                combo.appendChild(editButton);
            }
            combo.appendChild(dropdown);
            return combo;
        }

        function initComboburstEditorUI() {
            if (comboburstGroupEditorInitialized) return;
            const modal = document.getElementById('comboburstGroupModal');
            if (!modal) return;
            comboburstGroupEditorInitialized = true;

            const singleInput = document.getElementById('comboburstGroupSingleInput');
            const batchInput = document.getElementById('comboburstGroupBatchInput');
            const triggerSingle = () => {
                if (!singleInput) return;
                singleInput.value = '';
                singleInput.click();
            };
            const triggerBatch = () => {
                if (!batchInput) return;
                batchInput.value = '';
                batchInput.click();
            };
            for (const id of [
                'comboburstGroupAddBtn',
                'comboburstGroupEmptyAddBtn'
            ]) {
                const button = document.getElementById(id);
                if (button) button.onclick = triggerSingle;
            }
            for (const id of [
                'comboburstGroupBatchBtn',
                'comboburstGroupEmptyBatchBtn'
            ]) {
                const button = document.getElementById(id);
                if (button) button.onclick = triggerBatch;
            }
            if (singleInput) {
                singleInput.onchange = (event) => {
                    const files = event.target.files ? Array.from(event.target.files) : [];
                    event.target.value = '';
                    if (files.length > 0) void addComboburstGroupFiles(files, { sortByName: false });
                };
            }
            if (batchInput) {
                batchInput.onchange = (event) => {
                    const files = event.target.files ? Array.from(event.target.files) : [];
                    event.target.value = '';
                    if (files.length > 0) void addComboburstGroupFiles(files);
                };
            }

            const spec1x = document.getElementById('comboburstGroupSpec1xBtn');
            const spec2x = document.getElementById('comboburstGroupSpec2xBtn');
            if (spec1x) spec1x.onclick = () => {
                comboburstGroupState.spec = '1x';
                updateComboburstGroupSpecButtons();
            };
            if (spec2x) spec2x.onclick = () => {
                comboburstGroupState.spec = '2x';
                updateComboburstGroupSpecButtons();
            };

            const playBtn = document.getElementById('comboburstGroupPlayToggleBtn');
            if (playBtn) {
                playBtn.onclick = () => {
                    if (comboburstGroupState.isPlaying) {
                        comboburstGroupState.previewPausedAt = performance.now() -
                            comboburstGroupState.previewStartedAt;
                        comboburstGroupState.isPlaying = false;
                        playBtn.textContent = '继续';
                    } else {
                        comboburstGroupState.previewStartedAt = performance.now() -
                            comboburstGroupState.previewPausedAt;
                        comboburstGroupState.isPlaying = true;
                        playBtn.textContent = '暂停';
                    }
                    drawComboburstGroupPreview();
                };
            }

            const clearAll = document.getElementById('comboburstGroupClearAllBtn');
            if (clearAll) {
                clearAll.onclick = () => {
                    for (const frame of comboburstGroupState.frames) {
                        if (frame.ownsBlobUrl && frame.blobUrl) {
                            try { URL.revokeObjectURL(frame.blobUrl); } catch (_) {}
                        }
                    }
                    comboburstGroupState.frames = [];
                    resetComboburstGroupPreviewClock();
                    renderComboburstGroupFrames();
                };
            }

            const closeIds = [
                'comboburstGroupCloseBtn',
                'comboburstGroupCancelBtn'
            ];
            for (const id of closeIds) {
                const button = document.getElementById(id);
                if (button) button.onclick = closeComboburstGroupEditor;
            }
            const backdrop = document.getElementById('comboburstGroupBackdrop');
            if (backdrop) backdrop.onclick = closeComboburstGroupEditor;
            const confirm = document.getElementById('comboburstGroupConfirmBtn');
            if (confirm) {
                confirm.onclick = async () => {
                    try {
                        await applyComboburstGroupFrames();
                    } catch (error) {
                        console.error('保存连击提示图组失败', error);
                        showToast('保存连击提示图组失败', error.message || '未知错误');
                    }
                };
            }
            document.addEventListener('keydown', (event) => {
                if (event.key !== 'Escape' || modal.style.display === 'none') return;
                event.preventDefault();
                event.stopPropagation();
                closeComboburstGroupEditor();
            }, true);

            comboburstGroupEditorUi = {
                open: openComboburstGroupEditor,
                close: closeComboburstGroupEditor,
                apply: applyComboburstGroupFrames,
                getState: () => ({
                    frameCount: comboburstGroupState.frames.length,
                    spec: comboburstGroupState.spec,
                    isPlaying: comboburstGroupState.isPlaying,
                    timeline: comboburstGroupTimeline()
                })
            };
        }
