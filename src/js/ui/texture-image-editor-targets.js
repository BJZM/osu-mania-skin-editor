// ============================================================================
// texture-image-editor-targets.js - 贴图编辑目标、尺寸与拉伸修复解析
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function cloneFrame(source) {
            const width = source.naturalWidth || source.videoWidth || source.width || 0;
            const height = source.naturalHeight || source.videoHeight || source.height || 0;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(source, 0, 0);
            canvas._is2x = !!source._is2x;
            canvas._isRootLevel = !!source._isRootLevel;
            canvas._isTransparent1x1 = !!source._isTransparent1x1;
            canvas._isBlankPlaceholder = !!source._isBlankPlaceholder;
            canvas._keyImageHeightOffset1x = Number(source._keyImageHeightOffset1x) || 0;
            canvas._keyImageHeightPadding1x = Number(source._keyImageHeightPadding1x) || 0;
            return canvas;
        }

        function stripTextureName(value) {
            return String(value || '')
                .trim()
                .replace(/\.(png|jpg|jpeg)$/i, '')
                .replace(/@2x$/i, '')
                .replace(/-\d+$/, '');
        }

        function getTargetBaseName(p, resolvedName) {
            let base = stripTextureName(resolvedName || p.default || p.key || 'texture');
            if (!base || isDummyBlankName(base)) base = stripTextureName(p.key || 'texture');

            if (p._trackCol == null) return base;
            if (typeof hasCreatedTextureParams === 'function' && hasCreatedTextureParams(base)) return base;

            const col = p._trackCol;
            const colRegex = new RegExp(`(?:col|track|轨)[-_]?${col + 1}\\b`, 'i');
            if (colRegex.test(base)) return base;

            const lookup = p._trackLookup;
            const suffix = (lookup === LML.HoldNoteHeadImage) ? 'H'
                : (lookup === LML.HoldNoteBodyImage) ? 'L'
                : (lookup === LML.HoldNoteTailImage) ? 'T'
                : (lookup === LML.KeyImageDown) ? 'D'
                : '';

            if (suffix) {
                let cleanBase = base;
                if (cleanBase.toLowerCase().endsWith(suffix.toLowerCase())) {
                    cleanBase = cleanBase.slice(0, -suffix.length);
                }
                return `${cleanBase}_col${col + 1}${suffix}`;
            }
            return `${base}_col${col + 1}`;
        }

        function getTextureTabParams() {
            const keys = getActiveKeyCount();
            const items = [];
            for (const schemaItem of SKIN_INI_PARAM_SCHEMA) {
                if (schemaItem.tab !== 'textures' || schemaItem.type !== 'texture' || schemaItem.virtual) continue;
                const expanded = expandPerTrackTextureParams(schemaItem, keys, true);
                if (expanded && expanded.length > 0) items.push(...expanded);
                else items.push(schemaItem);
            }
            return items;
        }

        function getTextureLibraryTargetKey(sourceOrPath) {
            const path = typeof sourceOrPath === 'string'
                ? sourceOrPath
                : (sourceOrPath && sourceOrPath.path);
            return `TextureLibrary:${normalizeSkinKey(path)}`;
        }

        function buildTextureLibraryEditorTarget(source, options = {}) {
            if (!source || !source.path) return null;
            let frames = ((source.frames && source.frames.length > 0)
                ? source.frames
                : (source.image ? [source.image] : [])
            ).filter((frame) => {
                const width = frame.naturalWidth || frame.videoWidth || frame.width || 0;
                const height = frame.naturalHeight || frame.videoHeight || frame.height || 0;
                return width > 0 && height > 0;
            });
            const path = normalizeTextureLookupPath(source.path) || source.path;
            const createdParams = typeof getCreatedTextureParams === 'function'
                ? getCreatedTextureParams(path)
                : null;
            const generalEditParams = createdParams && createdParams.generalEditParams
                ? JSON.parse(JSON.stringify(createdParams.generalEditParams))
                : null;
            if (generalEditParams && typeof createSolidShapeTexture === 'function') {
                const generated = createSolidShapeTexture(createdParams);
                generated._is2x = createdParams.spec === '2x';
                generated._isRootLevel = !path.includes('/');
                frames = [generated];
            }
            if (frames.length === 0) return null;
            return {
                kind: 'library',
                p: {
                    key: getTextureLibraryTargetKey(source),
                    zhName: source.basename || path.split('/').pop() || '贴图',
                    default: path,
                    _libraryPath: path,
                    _libraryStoreKey: source.storeKey || path
                },
                keys: getActiveKeyCount(),
                resolved: {
                    name: path,
                    img: frames[0],
                    state: 'set'
                },
                frames,
                selectable: true,
                base: path,
                libraryPath: path,
                libraryStoreKey: source.storeKey || path,
                librarySource: source,
                libraryParamKey: options.paramKey || null,
                generalEditParams,
                state: 'set'
            };
        }

        function openTextureLibraryGeneralEditor(sourceOrPath, options = {}) {
            const source = typeof sourceOrPath === 'string'
                ? collectExistingTextureSources().find((item) =>
                    normalizeSkinKey(item.path) === normalizeSkinKey(sourceOrPath))
                : sourceOrPath;
            if (!source) return false;
            const target = buildTextureLibraryEditorTarget(source, options);
            if (!target) return false;
            const modal = byId('textureImageEditorModal');
            if (!modal || !modal.classList.contains('active')) {
                if (typeof open !== 'function' || !open()) return false;
            }
            selectTarget(target);
            return true;
        }

        function buildEditorTarget(p) {
            const keys = getActiveKeyCount();
            const resolved = resolveTextureParam(keys, p);
            let frames = resolveTextureParamFrames(keys, p);
            if ((!frames || frames.length === 0) && resolved && resolved.img) {
                frames = [resolved.img];
            }
            const usableFrames = (frames || []).filter((frame) => {
                const w = frame.naturalWidth || frame.videoWidth || frame.width || 0;
                const h = frame.naturalHeight || frame.videoHeight || frame.height || 0;
                return w > 0 && h > 0;
            });

            return {
                p,
                keys,
                resolved,
                frames: usableFrames,
                selectable: usableFrames.length > 0,
                base: getTargetBaseName(p, resolved && resolved.name),
                state: resolved ? resolved.state : 'unset'
            };
        }

        function getParamTrackIndex(p) {
            if (p && p._trackCol != null) return Number(p._trackCol);
            const match = String((p && p.key) || '').match(
                /(?:NoteImage|HoldNoteHeadImage|HoldNoteBodyImage|HoldNoteTailImage|KeyImageDown|KeyImage|StageHint|HitTarget)(\d+)/i
            );
            return match ? Number(match[1]) : null;
        }

        function getConfiguredColumnWidth(keys, columnIndex) {
            const res = getManiaSkinConfig(keys, LML.ColumnWidth, columnIndex);
            return (res && Number(res.value) > 0) ? Number(res.value) : 30;
        }

        function getUniformResizeResult(frame, target) {
            if (!frame || !target || (target.axis !== 'width' && target.axis !== 'height')) return null;
            const current = target.axis === 'width' ? frame.width : frame.height;
            if (!(current > 0) || !(target.size > 0)) return null;
            const scale = target.size / current;
            return {
                width: Math.max(1, Math.round(frame.width * scale)),
                height: Math.max(1, Math.round(frame.height * scale))
            };
        }

        function getEffectiveParamForTarget(selected) {
            if (!selected) return null;
            if (selected.kind !== 'library' && selected.p) return selected.p;
            if (selected.libraryParamKey) {
                const tabParams = getTextureTabParams();
                let p = tabParams.find((item) => item.key === selected.libraryParamKey);
                if (!p) {
                    const norm = String(selected.libraryParamKey).toLowerCase();
                    p = tabParams.find((item) => item.key.toLowerCase() === norm);
                }
                if (!p) {
                    const match = String(selected.libraryParamKey).match(/(NoteImage|HoldNoteHeadImage|HoldNoteBodyImage|HoldNoteTailImage|KeyImageDown|KeyImage)(\d+)/i);
                    if (match) {
                        const name = match[1].toLowerCase();
                        const col = Number(match[2]);
                        const lookup = (name === 'holdnotebodyimage' || name === 'noteimagel') ? LML.HoldNoteBodyImage
                            : (name === 'holdnoteheadimage' || name === 'noteimageh') ? LML.HoldNoteHeadImage
                            : (name === 'holdnotetailimage' || name === 'noteimaget') ? LML.HoldNoteTailImage
                            : (name === 'keyimagedown' || name === 'keyimaged') ? LML.KeyImageDown
                            : (name === 'keyimage') ? LML.KeyImage
                            : LML.NoteImage;
                        p = tabParams.find((item) => item._trackLookup === lookup && item._trackCol === col);
                    }
                }
                if (p) return p;
            }
            const path = selected.libraryPath || selected.base;
            if (path && typeof collectTexturePathReferences === 'function') {
                const refs = collectTexturePathReferences(path);
                if (refs.length > 0) return refs[0];
            }
            return selected.p || null;
        }

        function getStretchFixTarget(selected, frame) {
            if (!selected || !frame) return null;
            let p = selected.p;
            if (selected.kind === 'library') {
                const eff = getEffectiveParamForTarget(selected);
                if (!eff) {
                    return {
                        axis: null,
                        size: 0,
                        reason: '普通贴图没有参数规则可自动推导拉伸修复目标。'
                    };
                }
                p = eff;
            }
            const rawKey = String(p.key || '');
            const key = rawKey.toLowerCase();
            const keys = selected.keys || getActiveKeyCount();
            const dpr = frame._is2x ? 2 : 1;
            const trackIndex = getParamTrackIndex(p);
            const columnIndex = trackIndex != null ? trackIndex : 0;
            const rawColW = getConfiguredColumnWidth(keys, columnIndex);

            if (key.startsWith('keyimage')) {
                const multiplier = dpr === 2 ? 3.2 : 1.6;
                return {
                    axis: 'width',
                    size: Math.round(rawColW * multiplier),
                    label: '固定宽度',
                    detail: `按键横向拉满 ${rawColW}px 轨道，源图宽度需匹配 stable 的 ${multiplier} 倍列宽。`
                };
            }

            if (key === 'stageleft' || key === 'stageright') {
                const size = 768 * dpr;
                return {
                    axis: 'height',
                    size,
                    label: '固定高度',
                    detail: `舞台边框横向保持原宽、纵向拉满画面；${dpr === 2 ? '@2x' : '1x'} 目标高度为 ${size}px。`
                };
            }

            if (key === 'stagelight') {
                const multiplier = dpr === 2 ? 3.2 : 1.6;
                return {
                    axis: 'width',
                    size: Math.round(rawColW * multiplier),
                    label: '固定宽度',
                    detail: `按键光柱横向拉满第 ${columnIndex + 1} 轨（${rawColW}px）。各轨列宽不一致时需分别使用对应宽度的贴图。`
                };
            }

            if (key === 'stagehint' || key === 'hittarget') {
                const cfg = getManiaConfigForKeys(keys);
                const stageWidth = Math.max(1, computeTrackBlockWidth480(cfg, keys));
                return {
                    axis: 'width',
                    size: Math.round(stageWidth * dpr),
                    label: '固定宽度',
                    detail: `判定线光条横向覆盖 ${stageWidth}px 舞台宽度；开启双舞台且两侧宽度不一致时无法用单张贴图同时完全修复。`
                };
            }

            if (/^(noteimage|holdnoteheadimage|holdnotetailimage)/i.test(rawKey)) {
                return {
                    axis: null,
                    size: 0,
                    reason: '该贴图在 stable 中按原图宽高比计算高度，不需要通过改贴图尺寸修复单向拉伸。'
                };
            }

            if (/^holdnotebodyimage/i.test(rawKey) || /^noteimage\d*l$/i.test(rawKey)) {
                return {
                    axis: null,
                    size: 0,
                    reason: '长条身体在平铺模式下由 stable 等比计算；整段拉伸模式的高度由长条长度决定，需在画布中观察实际效果。'
                };
            }

            return {
                axis: null,
                size: 0,
                reason: '该贴图没有可自动计算的单轴拉伸规则。'
            };
        }

        window.openTextureLibraryGeneralEditor = openTextureLibraryGeneralEditor;
        window.getEffectiveParamForTarget = getEffectiveParamForTarget;
