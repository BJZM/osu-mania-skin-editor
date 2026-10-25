// ============================================================================
// hitsound-editor.js - 详细设置中的皮肤 / 谱面打击音效窗口
// 依赖：skin-hitsound-assets、hitsound-playback、history、skin-import/export
// ============================================================================

        const HITSOUND_EDITOR_ALLOWED_EXTENSIONS = Object.freeze(['wav', 'mp3', 'ogg']);
        const HITSOUND_EDITOR_MAX_FILE_BYTES = 32 * 1024 * 1024;
        const HITSOUND_EDITOR_MIME_TYPES = Object.freeze({
            wav: 'audio/wav',
            mp3: 'audio/mpeg',
            ogg: 'audio/ogg'
        });
        const HITSOUND_EDITOR_SAMPLE_SET_LABELS = Object.freeze({
            any: '通用',
            normal: '普通',
            soft: '柔和',
            drum: '鼓'
        });
        const HITSOUND_EDITOR_SOUND_LABELS = Object.freeze({
            hitnormal: '击打',
            hitwhistle: '哨音',
            hitfinish: '结束音',
            hitclap: '拍手'
        });

        let pendingHitsoundReplacementKey = null;
        let hitsoundPreviewAudio = null;
        let hitsoundPreviewUrl = null;
        let hitsoundPreviewKey = '';

        function normalizeHitsoundEditorPath(path) {
            return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
        }

        function getHitsoundEditorFileExtension(filename) {
            const match = String(filename || '').match(/\.([^.]+)$/);
            return match ? match[1].toLowerCase() : '';
        }

        function cloneSkinHitsoundReplacements(source = skinHitsoundReplacements) {
            const cloned = new Map();
            if (!(source instanceof Map)) return cloned;
            for (const [key, record] of source.entries()) {
                if (!record || !record.path || !record.bytes) continue;
                cloned.set(key, {
                    ...record,
                    originalPaths: Array.isArray(record.originalPaths)
                        ? [...record.originalPaths]
                        : []
                });
            }
            return cloned;
        }

        function restoreSkinHitsoundReplacements(replacements) {
            skinHitsoundReplacements.clear();
            const cloned = cloneSkinHitsoundReplacements(replacements);
            for (const [key, record] of cloned.entries()) {
                skinHitsoundReplacements.set(key, record);
            }
        }

        function areSkinHitsoundReplacementsEqual(left, right) {
            const leftMap = left instanceof Map ? left : new Map();
            const rightMap = right instanceof Map ? right : new Map();
            if (leftMap.size !== rightMap.size) return false;
            for (const [key, leftRecord] of leftMap.entries()) {
                const rightRecord = rightMap.get(key);
                if (!rightRecord) return false;
                if (normalizeHitsoundEditorPath(leftRecord?.path) !==
                    normalizeHitsoundEditorPath(rightRecord?.path)) {
                    return false;
                }
                if (leftRecord?.bytes !== rightRecord?.bytes) return false;
            }
            return true;
        }

        function getSkinHitsoundReplacementByPath(path) {
            const normalizedPath = normalizeHitsoundEditorPath(path);
            if (!normalizedPath || !(skinHitsoundReplacements instanceof Map)) return null;
            for (const record of skinHitsoundReplacements.values()) {
                if (normalizeHitsoundEditorPath(record.path) === normalizedPath) return record;
            }
            return null;
        }

        function getSkinHitsoundReplacementBytes(path) {
            const record = getSkinHitsoundReplacementByPath(path);
            return record && record.bytes ? record.bytes : null;
        }

        function updateSkinHitsoundSummaryFromCatalog() {
            let fileCount = 0;
            for (const group of skinHitsoundCatalog.values()) {
                fileCount += Array.isArray(group.variants) ? group.variants.length : 0;
            }
            skinHitsoundSummary = {
                groupCount: skinHitsoundCatalog.size,
                fileCount,
                selectedFileCount: skinHitsoundCatalog.size
            };
            return getSkinHitsoundSummary();
        }

        function getEffectiveSkinHitsoundCatalog() {
            const defaultCatalog = typeof getDefaultSkinHitsoundCatalog === 'function'
                ? getDefaultSkinHitsoundCatalog()
                : new Map();
            if (typeof mergeSkinHitsoundCatalogs === 'function') {
                return mergeSkinHitsoundCatalogs(defaultCatalog, skinHitsoundCatalog);
            }
            const merged = new Map(defaultCatalog);
            for (const [key, group] of skinHitsoundCatalog.entries()) {
                merged.set(key, group);
            }
            return merged;
        }

        function buildSkinHitsoundReplacementVariant(record) {
            const extension = getHitsoundEditorFileExtension(record.path);
            const parsed = typeof parseSkinHitsoundAssetPath === 'function'
                ? parseSkinHitsoundAssetPath(record.path)
                : null;
            if (parsed) return parsed;
            return {
                path: record.path,
                filename: String(record.path).split('/').pop() || record.path,
                normalizedKey: record.key,
                sampleSet: record.sampleSet || 'any',
                sound: record.sound || 'hitnormal',
                customIndex: Number(record.customIndex) || 0,
                extension,
                extensionPriority: HITSOUND_AUDIO_EXTENSION_PRIORITY[extension] || 0,
                isRootLevel: true
            };
        }

        function refreshSkinHitsoundCatalogWithReplacements() {
            const fallbackCatalog = typeof getDefaultSkinHitsoundCatalog === 'function'
                ? getDefaultSkinHitsoundCatalog()
                : new Map();
            const base = currentSkinZip && typeof readSkinHitsoundAssets === 'function'
                ? readSkinHitsoundAssets(currentSkinZip)
                : { groups: new Map(fallbackCatalog) };
            const groups = base.groups instanceof Map ? base.groups : new Map();

            for (const [key, record] of skinHitsoundReplacements.entries()) {
                if (!record || !record.path) continue;
                const existing = groups.get(key);
                const variant = buildSkinHitsoundReplacementVariant(record);
                groups.set(key, {
                    key,
                    sampleSet: record.sampleSet || existing?.sampleSet || 'any',
                    sound: record.sound || existing?.sound || 'hitnormal',
                    customIndex: Number(record.customIndex ?? existing?.customIndex) || 0,
                    source: 'replacement',
                    variants: [variant],
                    selectedPath: record.path,
                    selectedExtension: variant.extension
                });
            }

            skinHitsoundCatalog = groups;
            return updateSkinHitsoundSummaryFromCatalog();
        }

        function clearSkinHitsoundReplacements() {
            if (skinHitsoundReplacements instanceof Map) skinHitsoundReplacements.clear();
        }

        function sortSkinHitsoundGroups(groups) {
            return Array.from(groups || []).sort((left, right) => {
                const setOrder = { any: 0, normal: 1, soft: 2, drum: 3 };
                const leftSet = setOrder[left.sampleSet] ?? 9;
                const rightSet = setOrder[right.sampleSet] ?? 9;
                return leftSet - rightSet ||
                    String(left.sound).localeCompare(String(right.sound)) ||
                    (Number(left.customIndex) || 0) - (Number(right.customIndex) || 0);
            });
        }

        function collectBeatmapHitsoundEntries() {
            const entries = new Map();
            if (!Array.isArray(activeNotes) || typeof buildManiaNoteHitsoundRefs !== 'function') {
                return entries;
            }
            for (const note of activeNotes) {
                let refs = Array.isArray(note.hitsoundSampleRefs) ? note.hitsoundSampleRefs : [];
                if (refs.length === 0) {
                    try {
                        refs = buildManiaNoteHitsoundRefs(note);
                    } catch (_) {
                        refs = [];
                    }
                }
                for (const ref of refs) {
                    if (!ref || ref.source !== 'beatmap' || !ref.path) continue;
                    const key = ref.key || `beatmap:${normalizeHitsoundEditorPath(ref.path)}`;
                    let entry = entries.get(key);
                    if (!entry) {
                        entry = {
                            key,
                            path: ref.path,
                            sounds: new Set(),
                            usageCount: 0
                        };
                        entries.set(key, entry);
                    }
                    if (ref.sound) entry.sounds.add(ref.sound);
                    entry.usageCount++;
                }
            }
            return entries;
        }

        function hitsoundEditorMatchesQuery(parts, query) {
            if (!query) return true;
            return parts
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query);
        }

        function stopHitsoundPreview() {
            if (hitsoundPreviewAudio) {
                const preview = hitsoundPreviewAudio;
                hitsoundPreviewAudio = null;
                preview.onended = null;
                preview.onerror = null;
                try { preview.pause(); } catch (_) {}
                try { preview.src = ''; } catch (_) {}
            }
            if (hitsoundPreviewUrl) {
                try { URL.revokeObjectURL(hitsoundPreviewUrl); } catch (_) {}
                hitsoundPreviewUrl = null;
            }
            hitsoundPreviewKey = '';
            document.querySelectorAll('.hitsound-preview-btn.is-playing').forEach((button) => {
                button.classList.remove('is-playing');
                button.title = window.I18n.t('试听音效');
            });
        }

        async function previewHitsound(button, source, path, key) {
            if (!path) return;
            if (hitsoundPreviewKey === key && hitsoundPreviewAudio && !hitsoundPreviewAudio.paused) {
                stopHitsoundPreview();
                return;
            }

            stopHitsoundPreview();
            if (button) button.disabled = true;
            try {
                let blob = null;
                const replacement = source === 'skin'
                    ? getSkinHitsoundReplacementByPath(path)
                    : null;
                if (replacement) {
                    blob = new Blob([replacement.bytes], {
                        type: replacement.mimeType || HITSOUND_EDITOR_MIME_TYPES[replacement.extension] || ''
                    });
                } else if (source === 'default') {
                    const defaultBytes = typeof getDefaultSkinHitsoundBytes === 'function'
                        ? getDefaultSkinHitsoundBytes(path)
                        : null;
                    if (!defaultBytes) throw new Error('找不到默认音效文件');
                    blob = new Blob([defaultBytes], {
                        type: getHitsoundMimeType(getHitsoundEditorFileExtension(path))
                    });
                } else {
                    const zip = source === 'skin' ? currentSkinZip : currentOszZip;
                    const found = zip && typeof findZipEntry === 'function'
                        ? findZipEntry(zip, path)
                        : null;
                    if (!zip || !found) throw new Error('找不到音效文件');
                    blob = await zip.file(found).async('blob');
                }

                const url = URL.createObjectURL(blob);
                const preview = new Audio(url);
                preview.volume = typeof getEffectVolume === 'function'
                    ? Math.max(0, Math.min(1, getEffectVolume()))
                    : 0.8;
                hitsoundPreviewAudio = preview;
                hitsoundPreviewUrl = url;
                hitsoundPreviewKey = key;
                if (button) {
                    button.classList.add('is-playing');
                    button.title = window.I18n.t('停止试听');
                }
                preview.onended = () => {
                    if (hitsoundPreviewAudio === preview) stopHitsoundPreview();
                };
                preview.onerror = () => {
                    // 停止试听会清空 src，Chromium 随后可能派发一次 error。
                    // 只有当前仍有效的播放实例才应提示解码失败。
                    if (hitsoundPreviewAudio !== preview) return;
                    stopHitsoundPreview();
                    showToast('试听失败', '这个音效文件无法在当前浏览器中解码。');
                };
                await preview.play();
            } catch (error) {
                stopHitsoundPreview();
                showToast('试听失败', error.message || '无法播放这个音效文件。');
            } finally {
                if (button) button.disabled = false;
            }
        }

        function createHitsoundActionButton(action, label, key, iconName) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `btn btn-secondary hitsound-action-btn hitsound-${action}-btn`;
            button.dataset.hitsoundAction = action;
            button.dataset.hitsoundKey = key;
            button.title = label === '试听' ? window.I18n.t('试听音效') : window.I18n.t(label);

            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('fill', 'none');
            icon.setAttribute('stroke', 'currentColor');
            icon.setAttribute('stroke-width', '2');
            icon.setAttribute('stroke-linecap', 'round');
            icon.setAttribute('stroke-linejoin', 'round');
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = iconName;

            const text = document.createElement('span');
            text.textContent = window.I18n.t(label);
            button.append(icon, text);
            return button;
        }

        function createHitsoundBadge(text, className = '') {
            const badge = document.createElement('span');
            badge.className = `hitsound-badge ${className}`.trim();
            badge.textContent = window.I18n.t(text);
            return badge;
        }

        function buildSkinHitsoundCard(group) {
            const card = document.createElement('div');
            card.className = 'param-card hitsound-card';
            card.dataset.hitsoundCategory = 'skin';
            card.dataset.hitsoundKey = group.key;

            const header = document.createElement('div');
            header.className = 'hitsound-card-header';

            const titleArea = document.createElement('div');
            titleArea.className = 'hitsound-card-title-area';
            const title = document.createElement('span');
            title.className = 'hitsound-card-title';
            title.textContent = window.I18n.t(HITSOUND_EDITOR_SOUND_LABELS[group.sound] || group.sound);
            const key = document.createElement('code');
            key.className = 'hitsound-key';
            key.textContent = group.key;
            titleArea.append(title, key);

            const replacement = skinHitsoundReplacements.get(group.key);
            header.append(
                titleArea,
                createHitsoundBadge(
                    replacement ? '已替换' : '可编辑',
                    replacement ? 'is-replaced' : 'is-editable'
                )
            );

            const meta = document.createElement('div');
            meta.className = 'hitsound-meta';
            meta.append(
                createHitsoundBadge(HITSOUND_EDITOR_SAMPLE_SET_LABELS[group.sampleSet] || group.sampleSet),
                createHitsoundBadge(group.customIndex > 0 ? `索引 ${group.customIndex}` : '默认索引'),
                createHitsoundBadge(String(group.selectedExtension || '').toUpperCase())
            );
            if (group.source === 'default') {
                meta.appendChild(createHitsoundBadge('默认回退'));
            } else if (group.source === 'skin') {
                meta.appendChild(createHitsoundBadge('当前皮肤'));
            }

            const path = document.createElement('div');
            path.className = 'hitsound-path';
            path.textContent = group.selectedPath;
            path.title = group.selectedPath;

            const actions = document.createElement('div');
            actions.className = 'hitsound-card-actions';
            const previewBtn = createHitsoundActionButton(
                'preview',
                '试听',
                group.key,
                '<polygon points="5 3 19 12 5 21 5 3"></polygon>'
            );
            previewBtn.onclick = () => previewHitsound(
                previewBtn,
                group.source === 'default' ? 'default' : 'skin',
                group.selectedPath,
                `skin:${group.key}`
            );
            const replaceBtn = createHitsoundActionButton(
                'replace',
                '替换',
                group.key,
                '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>'
            );
            replaceBtn.onclick = () => requestSkinHitsoundReplacement(group.key);
            actions.append(previewBtn, replaceBtn);

            if (replacement) {
                const resetBtn = createHitsoundActionButton(
                    'reset',
                    '恢复原音效',
                    group.key,
                    '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>'
                );
                resetBtn.onclick = () => resetSkinHitsoundReplacement(group.key);
                actions.appendChild(resetBtn);
            }

            card.append(header, meta, path, actions);
            return card;
        }

        function buildBeatmapHitsoundCard(entry) {
            const card = document.createElement('div');
            card.className = 'param-card hitsound-card hitsound-card-readonly';
            card.dataset.hitsoundCategory = 'beatmap';
            card.dataset.hitsoundKey = entry.key;

            const header = document.createElement('div');
            header.className = 'hitsound-card-header';
            const titleArea = document.createElement('div');
            titleArea.className = 'hitsound-card-title-area';
            const title = document.createElement('span');
            title.className = 'hitsound-card-title';
            title.textContent = String(entry.path).split('/').pop() || entry.path;
            const key = document.createElement('code');
            key.className = 'hitsound-key';
            key.textContent = 'beatmap';
            titleArea.append(title, key);
            header.append(titleArea, createHitsoundBadge('谱面只读', 'is-readonly'));

            const sounds = document.createElement('div');
            sounds.className = 'hitsound-meta';
            const soundLabels = Array.from(entry.sounds)
                .map((sound) => HITSOUND_EDITOR_SOUND_LABELS[sound] || sound)
                .join(' / ');
            if (soundLabels) sounds.appendChild(createHitsoundBadge(soundLabels));
            sounds.appendChild(createHitsoundBadge(
                window.I18n.t('被 {count} 个音符使用', { count: entry.usageCount })
            ));

            const path = document.createElement('div');
            path.className = 'hitsound-path';
            path.textContent = entry.path;
            path.title = entry.path;

            const actions = document.createElement('div');
            actions.className = 'hitsound-card-actions';
            const previewBtn = createHitsoundActionButton(
                'preview',
                '试听',
                entry.key,
                '<polygon points="5 3 19 12 5 21 5 3"></polygon>'
            );
            previewBtn.onclick = () => previewHitsound(
                previewBtn,
                'beatmap',
                entry.path,
                `beatmap:${entry.key}`
            );
            actions.appendChild(previewBtn);

            card.append(header, sounds, path, actions);
            return card;
        }

        function buildHitsoundCategory(title, items, builder, emptyText) {
            const block = document.createElement('div');
            block.className = 'param-category-block hitsound-category-block';

            const heading = document.createElement('div');
            heading.className = 'param-category-title hitsound-category-title';
            const headingText = document.createElement('span');
            headingText.textContent = window.I18n.t(title);
            const count = document.createElement('span');
            count.className = 'count-badge';
            count.textContent = String(items.length);
            heading.append(headingText, count);

            const grid = document.createElement('div');
            grid.className = 'hitsound-cards-grid';
            if (items.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'hitsound-empty';
                empty.textContent = window.I18n.t(emptyText);
                grid.appendChild(empty);
            } else {
                for (const item of items) grid.appendChild(builder(item));
            }

            block.append(heading, grid);
            return block;
        }

        function renderHitsoundEditor(container) {
            if (!container) return;
            stopHitsoundPreview();
            container.innerHTML = '';

            const query = String(paramSearchQuery || '').trim().toLowerCase();
            const effectiveSkinCatalog = getEffectiveSkinHitsoundCatalog();
            const skinGroups = sortSkinHitsoundGroups(effectiveSkinCatalog.values()).filter((group) =>
                hitsoundEditorMatchesQuery([
                    group.key,
                    group.sound,
                    group.sampleSet,
                    group.selectedPath,
                    HITSOUND_EDITOR_SOUND_LABELS[group.sound],
                    HITSOUND_EDITOR_SAMPLE_SET_LABELS[group.sampleSet]
                ], query)
            );
            const beatmapEntries = Array.from(collectBeatmapHitsoundEntries().values())
                .sort((left, right) => left.path.localeCompare(right.path))
                .filter((entry) => hitsoundEditorMatchesQuery([
                    entry.path,
                    Array.from(entry.sounds).join(' ')
                ], query));

            if (query && skinGroups.length === 0 && beatmapEntries.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'hitsound-query-empty';
                empty.textContent = window.I18n.t('未找到匹配的音效。');
                container.appendChild(empty);
                return;
            }

            container.appendChild(buildHitsoundCategory(
                '皮肤音效',
                skinGroups,
                buildSkinHitsoundCard,
                '当前皮肤没有可编辑的打击音效。'
            ));
            container.appendChild(buildHitsoundCategory(
                '谱面音效',
                beatmapEntries,
                buildBeatmapHitsoundCard,
                currentOszZip
                    ? '当前谱面没有自带且被音符引用的打击音效。'
                    : '请先导入谱面。'
            ));
        }

        function requestSkinHitsoundReplacement(groupKey) {
            const group = skinHitsoundCatalog.get(groupKey);
            const effectiveGroup = group || getEffectiveSkinHitsoundCatalog().get(groupKey);
            if (!effectiveGroup) {
                showToast('无法替换音效', '当前没有可替换的打击音效槽位。');
                return;
            }
            pendingHitsoundReplacementKey = groupKey;
            const input = document.getElementById('hitsoundReplaceInput');
            if (!input) return;
            input.value = '';
            input.click();
        }

        async function replaceSkinHitsound(groupKey, file) {
            const group = skinHitsoundCatalog.get(groupKey) ||
                getEffectiveSkinHitsoundCatalog().get(groupKey);
            if (!group || !file) return false;
            const extension = getHitsoundEditorFileExtension(file.name);
            if (!HITSOUND_EDITOR_ALLOWED_EXTENSIONS.includes(extension)) {
                showToast('音效格式不支持', '仅支持 .wav、.mp3 和 .ogg 音效文件。');
                return false;
            }
            if (file.size > HITSOUND_EDITOR_MAX_FILE_BYTES) {
                showToast('音效文件过大', '单个音效文件不能超过 32 MB。');
                return false;
            }

            try {
                const bytes = new Uint8Array(await file.arrayBuffer());
                if (bytes.length === 0) throw new Error('音效文件为空');

                const previous = skinHitsoundReplacements.get(groupKey);
                const replacementPath = `${group.key}.${extension}`;
                recordSkinUndoBeforeChange(
                    `替换皮肤音效: ${HITSOUND_EDITOR_SOUND_LABELS[group.sound] || group.key}`,
                    { force: true }
                );
                continuousActionActive = false;
                skinHitsoundReplacements.set(groupKey, {
                    key: groupKey,
                    sampleSet: group.sampleSet,
                    sound: group.sound,
                    customIndex: Number(group.customIndex) || 0,
                    originalPaths: previous?.originalPaths?.length
                        ? [...previous.originalPaths]
                        : group.variants.map((variant) => variant.path),
                    path: replacementPath,
                    extension,
                    mimeType: getHitsoundMimeType(extension),
                    sourceFileName: file.name,
                    bytes
                });

                refreshSkinHitsoundCatalogWithReplacements();
                if (typeof updateSkinInfoDisplay === 'function') updateSkinInfoDisplay();
                renderSkinEditorParams();
                try {
                    await refreshManiaHitsoundPlaybackAfterEdit();
                } catch (playbackError) {
                    console.warn('音效已替换，但重建播放缓存失败:', playbackError);
                }
                showToast('皮肤音效已替换', `${group.key} 将在导出时写入皮肤包 (可按 Ctrl+Z 撤回)`);
                return true;
            } catch (error) {
                showToast('替换音效失败', error.message || '无法读取所选音效文件。');
                return false;
            }
        }

        function getHitsoundMimeType(extension) {
            return HITSOUND_EDITOR_MIME_TYPES[extension] || 'application/octet-stream';
        }

        function resetSkinHitsoundReplacement(groupKey) {
            if (!skinHitsoundReplacements.has(groupKey)) return false;
            const group = skinHitsoundCatalog.get(groupKey) ||
                getEffectiveSkinHitsoundCatalog().get(groupKey);
            recordSkinUndoBeforeChange(
                `恢复皮肤音效: ${HITSOUND_EDITOR_SOUND_LABELS[group?.sound] || groupKey}`,
                { force: true }
            );
            continuousActionActive = false;
            skinHitsoundReplacements.delete(groupKey);
            refreshSkinHitsoundCatalogWithReplacements();
            if (typeof updateSkinInfoDisplay === 'function') updateSkinInfoDisplay();
            renderSkinEditorParams();
            void refreshManiaHitsoundPlaybackAfterEdit();
            showToast('已恢复原音效', `${groupKey} 已恢复为皮肤包内的原始文件 (可按 Ctrl+Z 撤回)`);
            return true;
        }

        async function refreshManiaHitsoundPlaybackAfterEdit() {
            try {
                if (typeof disposeManiaHitsoundPlayback === 'function') {
                    disposeManiaHitsoundPlayback();
                }
                if (typeof prepareManiaHitsoundPlayback === 'function' &&
                    currentBeatmap &&
                    Array.isArray(activeNotes) &&
                    activeNotes.length > 0) {
                    await prepareManiaHitsoundPlayback();
                }
            } catch (error) {
                console.warn('重建打击音效播放缓存失败:', error);
            }
        }

        async function createSkinHitsoundExportArchive(sourceZip) {
            if (skinHitsoundReplacements.size === 0) return sourceZip;

            const cloned = new JSZip();
            if (sourceZip) {
                for (const path of Object.keys(sourceZip.files)) {
                    const entry = sourceZip.files[path];
                    if (!entry) continue;
                    if (entry.dir) {
                        cloned.folder(path.replace(/\/+$/, ''));
                    } else {
                        cloned.file(path, await entry.async('uint8array'));
                    }
                }
            }

            for (const record of skinHitsoundReplacements.values()) {
                const removePaths = new Set([
                    ...(record.originalPaths || []),
                    record.path
                ].map(normalizeHitsoundEditorPath));
                for (const path of Object.keys(cloned.files)) {
                    if (removePaths.has(normalizeHitsoundEditorPath(path))) {
                        cloned.remove(path);
                    }
                }
                cloned.file(record.path, record.bytes);
            }
            return cloned;
        }

        function initHitsoundEditorUI() {
            const input = document.getElementById('hitsoundReplaceInput');
            if (!input) return;
            input.onchange = async () => {
                const file = input.files && input.files[0];
                const groupKey = pendingHitsoundReplacementKey;
                pendingHitsoundReplacementKey = null;
                input.value = '';
                if (!file || !groupKey) return;
                await replaceSkinHitsound(groupKey, file);
            };
        }
