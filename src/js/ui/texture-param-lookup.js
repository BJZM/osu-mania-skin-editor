// ============================================================================
// texture-param-lookup.js - 把贴图参数映射到当前皮肤中的已有路径
// 依赖：skin/mania-config.js、ui/texture-resolve.js
// ============================================================================

        function normalizeTextureLookupPath(path) {
            return String(path || '')
                .trim()
                .replace(/\\/g, '/')
                .replace(/\.(png|jpg|jpeg)$/i, '')
                .replace(/@2x$/i, '');
        }

        function shouldOverwriteDefaultKeyImageSource(paramOrTarget) {
            if (typeof isEditableDefaultSkinWorkspaceActive !== 'function' ||
                !isEditableDefaultSkinWorkspaceActive()) {
                return false;
            }
            const p = paramOrTarget && paramOrTarget.p
                ? paramOrTarget.p
                : paramOrTarget;
            if (!p) return false;
            if (typeof isEditingKeyImageParam === 'function') {
                return isEditingKeyImageParam(p);
            }
            return p._trackLookup === LML.KeyImage ||
                p._trackLookup === LML.KeyImageDown;
        }

        function assignTextureParamLookup(keys, p, selectedPath) {
            if (!p || !p.key) throw new Error('缺少目标贴图参数');
            const normalizedPath = normalizeTextureLookupPath(selectedPath);
            if (!normalizedPath) throw new Error('贴图路径不能为空');

            const keyCount = keys || getActiveKeyCount();
            let cfg = maniaSkinConfigurations.get(keyCount);
            if (!cfg) {
                cfg = ensureManiaConfigForKeys(keyCount);
                maniaSkinConfigurations.set(keyCount, cfg);
            }
            if (!cfg.ImageLookups) cfg.ImageLookups = new Map();

            const isNote = p._trackLookup === LML.NoteImage || /^NoteImage(?:\d+)?$/i.test(p.key);
            if (isNote && typeof preserveHoldHeadsBeforeNoteEdit === 'function') {
                preserveHoldHeadsBeforeNoteEdit(
                    keyCount,
                    p,
                    { syncInput: true }
                );
            }

            const keyImageMatch = String(p.key).match(/^KeyImage(\d+)$/i);
            const keyImageColumn = p._trackLookup === LML.KeyImage && p._trackCol != null
                ? Number(p._trackCol)
                : (keyImageMatch ? Number(keyImageMatch[1]) : null);
            const isKeyImage = p._trackLookup === LML.KeyImage || /^KeyImage(?:\d+)?$/i.test(p.key);
            if (isKeyImage && typeof preserveTrackKeyImageDownBeforeKeyImageEdit === 'function') {
                const targetCols = keyImageColumn != null && Number.isFinite(keyImageColumn)
                    ? [keyImageColumn]
                    : Array.from({ length: Math.max(1, Math.min(18, keyCount || 4)) }, (_, i) => i);
                for (const col of targetCols) {
                    preserveTrackKeyImageDownBeforeKeyImageEdit(
                        keyCount,
                        col,
                        { syncInput: true }
                    );
                }
            }

            const aliases = getTextureParamAliases(p.key, keyCount);
            for (const alias of aliases) {
                cfg[alias] = normalizedPath;
                cfg.ImageLookups.set(alias, normalizedPath);
                cfg.ImageLookups.set(alias.toLowerCase(), normalizedPath);
            }
            cfg[p.key] = normalizedPath;
            cfg.ImageLookups.set(p.key, normalizedPath);
            cfg.ImageLookups.set(p.key.toLowerCase(), normalizedPath);

            if (globalSkinImageLookups) {
                for (const alias of aliases) {
                    globalSkinImageLookups.set(alias, normalizedPath);
                    globalSkinImageLookups.set(alias.toLowerCase(), normalizedPath);
                }
                globalSkinImageLookups.set(p.key, normalizedPath);
                globalSkinImageLookups.set(p.key.toLowerCase(), normalizedPath);
            }

            if (p._trackCol == null && typeof getTextureParamColumnKeys === 'function') {
                const columnKeys = getTextureParamColumnKeys(p.key, keyCount);
                for (const ck of columnKeys) {
                    if (cfg[ck] !== undefined || (cfg.ImageLookups && (cfg.ImageLookups.has(ck) || cfg.ImageLookups.has(ck.toLowerCase())))) {
                        cfg[ck] = normalizedPath;
                        cfg.ImageLookups.set(ck, normalizedPath);
                        cfg.ImageLookups.set(ck.toLowerCase(), normalizedPath);
                        if (typeof syncParamInputValue === 'function') {
                            syncParamInputValue(ck, normalizedPath);
                        }
                    }
                }
            }

            return { path: normalizedPath, aliases };
        }

        function clearTextureParamLookup(keys, p) {
            if (!p || !p.key) return;
            const keyCount = keys || (typeof getActiveKeyCount === 'function' ? getActiveKeyCount() : 4);
            const cfg = (typeof maniaSkinConfigurations !== 'undefined' && maniaSkinConfigurations.get)
                ? (maniaSkinConfigurations.get(keyCount) || (typeof getManiaConfigForKeys === 'function' ? getManiaConfigForKeys(keyCount) : null))
                : null;
            const aliases = typeof getTextureParamAliases === 'function' ? getTextureParamAliases(p.key, keyCount) : [p.key];
            if (cfg) {
                delete cfg[p.key];
                if (cfg.ImageLookups) {
                    cfg.ImageLookups.delete(p.key);
                    cfg.ImageLookups.delete(p.key.toLowerCase());
                }
                for (const alias of aliases) {
                    delete cfg[alias];
                    if (cfg.ImageLookups) {
                        cfg.ImageLookups.delete(alias);
                        cfg.ImageLookups.delete(alias.toLowerCase());
                    }
                }
                if (p._trackCol == null && typeof getTextureParamColumnKeys === 'function') {
                    const columnKeys = getTextureParamColumnKeys(p.key, keyCount);
                    for (const ck of columnKeys) {
                        delete cfg[ck];
                        if (cfg.ImageLookups) {
                            cfg.ImageLookups.delete(ck);
                            cfg.ImageLookups.delete(ck.toLowerCase());
                        }
                        if (typeof syncParamInputValue === 'function') {
                            syncParamInputValue(ck, '');
                        }
                    }
                }
            }
            if (typeof globalSkinImageLookups !== 'undefined' && globalSkinImageLookups) {
                globalSkinImageLookups.delete(p.key);
                globalSkinImageLookups.delete(p.key.toLowerCase());
                for (const alias of aliases) {
                    globalSkinImageLookups.delete(alias);
                    globalSkinImageLookups.delete(alias.toLowerCase());
                }
            }
        }

        function collectTexturePathReferences(path, options = {}) {
            const normalizeReference = options.caseInsensitive
                ? ((value) => {
                    if (typeof normalizeSkinAssetStoreKey === 'function') {
                        return normalizeSkinAssetStoreKey(value);
                    }
                    if (typeof normalizeSkinKey === 'function') {
                        return normalizeSkinKey(value).replace(/@2x/g, '');
                    }
                    return normalizeTextureLookupPath(value).toLowerCase();
                })
                : ((value) => normalizeTextureLookupPath(value));
            const normalizedPath = normalizeReference(path);
            if (!normalizedPath) return [];
            const activeKeys = typeof getActiveKeyCount === 'function' ? getActiveKeyCount() : 4;
            const keyCounts = options.allKeyCounts
                ? Array.from(new Set([
                    activeKeys,
                    ...Array.from(maniaSkinConfigurations.keys())
                ]))
                : [activeKeys];
            const references = [];
            const seen = new Set();
            for (const keys of keyCounts) {
                const params = typeof getTextureTabParamsForKeys === 'function'
                    ? getTextureTabParamsForKeys(keys)
                    : (typeof getTextureTabParams === 'function' ? getTextureTabParams() : []);
                for (const p of params) {
                    const referenceKey = `${keys}|${p.key}`;
                    if (seen.has(referenceKey)) continue;
                    seen.add(referenceKey);
                    const resolved = typeof resolveTextureParam === 'function' ? resolveTextureParam(keys, p) : null;
                    if (!resolved || resolved.state !== 'ok') continue;
                    const resolvedName = normalizeReference(resolved.name);
                    if (resolvedName !== normalizedPath) continue;
                    references.push(p);
                }
            }
            return references;
        }

        function createIndependentTexturePath(sourcePath, paramKey) {
            const normalizedSource = normalizeTextureLookupPath(sourcePath);
            const slash = normalizedSource.lastIndexOf('/');
            const directory = slash >= 0 ? normalizedSource.slice(0, slash + 1) : '';
            const basename = slash >= 0 ? normalizedSource.slice(slash + 1) : normalizedSource;
            const suffix = String(paramKey || 'copy')
                .replace(/[^a-z0-9_-]+/gi, '_')
                .replace(/^_+|_+$/g, '')
                .toLowerCase() || 'copy';
            const existing = new Set(
                typeof collectExistingTextureSources === 'function'
                    ? collectExistingTextureSources().map((item) => normalizeSkinKey(item.path))
                    : []
            );
            if (typeof tabs !== 'undefined') {
                for (const tab of tabs) {
                    if (tab.kind === 'creator' && tab.creatorState && tab.creatorState.name) {
                        existing.add(normalizeSkinKey(tab.creatorState.name));
                    }
                }
            }
            let index = 1;
            let candidate;
            do {
                const suffixText = index === 1 ? suffix : `${suffix}_${index}`;
                candidate = `${directory}${basename}_${suffixText}`;
                index++;
            } while (
                existing.has(normalizeSkinKey(candidate)) ||
                (typeof hasCreatedTextureParams === 'function' && hasCreatedTextureParams(candidate))
            );
            return candidate;
        }

        function pointTextureEditParamToPath(paramKey, targetPath) {
            if (!paramKey || !targetPath) return false;
            const params = typeof getTextureTabParams === 'function' ? getTextureTabParams() : [];
            const p = params.find((item) => item.key === paramKey) ||
                (typeof SKIN_INI_PARAM_SCHEMA !== 'undefined'
                    ? SKIN_INI_PARAM_SCHEMA.find((item) => item.key === paramKey)
                    : null);
            if (!p || typeof assignTextureParamLookup !== 'function') return false;
            if (isFontGlyphTextureParam(p)) return false;
            const keys = typeof getActiveKeyCount === 'function' ? getActiveKeyCount() : 4;
            if (typeof preserveHoldHeadsBeforeNoteEdit === 'function') {
                preserveHoldHeadsBeforeNoteEdit(
                    keys,
                    p,
                    { syncInput: true }
                );
            }
            assignTextureParamLookup(keys, p, targetPath);
            return true;
        }
