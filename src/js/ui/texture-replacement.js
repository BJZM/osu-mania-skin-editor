// ============================================================================
// texture-replacement.js - 单贴图替换后的旧资源引用回收
// 依赖：texture-existing-sources、texture-library-operations、texture-param-lookup
// ============================================================================

        function normalizeTextureReplacementIdentity(path) {
            const raw = String(path || '').trim();
            if (!raw) return '';
            if (typeof normalizeSkinKey === 'function') {
                return normalizeSkinKey(raw).replace(/@2x$/i, '');
            }
            return String(
                typeof normalizeTextureLookupPath === 'function'
                    ? normalizeTextureLookupPath(raw)
                    : raw.replace(/\\/g, '/').replace(/\.(png|jpg|jpeg)$/i, '').replace(/@2x$/i, '')
            ).toLowerCase();
        }

        function getEffectiveTextureReplacementPath(p, keys) {
            if (!p) return '';
            const configured = typeof getTextureParamIniValue === 'function'
                ? getTextureParamIniValue(keys, p)
                : '';
            if (configured) return String(configured).trim();
            const resolved = typeof resolveTextureParam === 'function'
                ? resolveTextureParam(keys, p)
                : null;
            return resolved && resolved.name ? String(resolved.name).trim() : '';
        }

        function collectTextureReplacementStoreKeys(source) {
            if (!source || !source.path) return new Set();
            if (typeof collectTextureLibraryStoreKeys === 'function') {
                return collectTextureLibraryStoreKeys(source);
            }
            const base = normalizeSkinKey(source.path);
            const keys = new Set([base]);
            const frameCount = Math.max(1, source.frames ? source.frames.length : 1);
            for (let index = 0; index < frameCount; index++) {
                keys.add(`${base}-${index}`);
            }
            return keys;
        }

        function isTextureReplacementSourceOwned(source) {
            if (!source || !source.path) return false;
            if (typeof hasCreatedTextureParams === 'function' && hasCreatedTextureParams(source.path)) {
                return false;
            }

            const storeKeys = collectTextureReplacementStoreKeys(source);
            for (const key of userReplacedTextures.keys()) {
                const normalized = typeof normalizeSkinAssetStoreKey === 'function'
                    ? normalizeSkinAssetStoreKey(key)
                    : normalizeSkinKey(key).replace(/@2x/g, '');
                if (storeKeys.has(normalized)) return true;
            }
            if (currentSkinZip && currentSkinZip.files) {
                for (const filename of Object.keys(currentSkinZip.files)) {
                    const normalized = typeof normalizeSkinAssetStoreKey === 'function'
                        ? normalizeSkinAssetStoreKey(filename)
                        : normalizeSkinKey(filename).replace(/@2x/g, '');
                    if (storeKeys.has(normalized)) return true;
                }
            }
            return false;
        }

        function prepareTextureReplacement(p, keys, newPath) {
            if (!p || !p.key) return null;
            const paramKey = String(p.key);
            if ((typeof isFontGlyphTextureParam === 'function' && isFontGlyphTextureParam(p)) ||
                paramKey === 'ScorePrefix' ||
                paramKey === 'ComboPrefix' ||
                paramKey.startsWith('FontGlyph') ||
                paramKey.startsWith('Font_')) {
                return null;
            }

            const keyCount = keys || getActiveKeyCount();
            const oldPath = getEffectiveTextureReplacementPath(p, keyCount);
            const oldIdentity = normalizeTextureReplacementIdentity(oldPath);
            const newIdentity = normalizeTextureReplacementIdentity(newPath);
            if (!oldIdentity || oldIdentity === newIdentity) return null;

            const sources = typeof collectExistingTextureSources === 'function'
                ? collectExistingTextureSources()
                : [];
            const oldSource = sources.find((source) =>
                normalizeTextureReplacementIdentity(source.path) === oldIdentity
            ) || null;
            return {
                p,
                keyCount,
                oldPath,
                oldIdentity,
                oldSource,
                newPath: newPath || ''
            };
        }

        function completeTextureReplacement(replacement) {
            if (!replacement || !replacement.oldPath) {
                return { deleted: false, remainingReferences: 0 };
            }
            const newIdentity = normalizeTextureReplacementIdentity(replacement.newPath);
            if (newIdentity && (typeof isDummyBlankName !== 'function' || !isDummyBlankName(replacement.newPath))) {
                const replacementExists = (typeof lookupTextureByName === 'function' &&
                    !!lookupTextureByName(replacement.newPath)) ||
                    (typeof collectExistingTextureSources === 'function' &&
                        collectExistingTextureSources().some((source) =>
                            normalizeTextureReplacementIdentity(source.path) === newIdentity
                        ));
                if (!replacementExists) {
                    return {
                        deleted: false,
                        remainingReferences: 0,
                        reason: 'replacement-source-missing'
                    };
                }
            }
            const references = typeof collectTexturePathReferences === 'function'
                ? collectTexturePathReferences(replacement.oldPath, {
                    allKeyCounts: true,
                    caseInsensitive: true
                })
                : [];
            if (references.length > 0) {
                return {
                    deleted: false,
                    remainingReferences: references.length,
                    references
                };
            }
            if (!replacement.oldSource || !isTextureReplacementSourceOwned(replacement.oldSource)) {
                return {
                    deleted: false,
                    remainingReferences: 0,
                    reason: replacement.oldSource ? 'not-owned' : 'source-not-found'
                };
            }
            if (typeof markTextureLibrarySourceDeleted !== 'function') {
                return { deleted: false, remainingReferences: 0, reason: 'cleanup-unavailable' };
            }

            const result = markTextureLibrarySourceDeleted(replacement.oldSource, {
                recordUndo: false,
                clearReferences: false,
                deleteCreatedParams: false
            });
            return {
                deleted: true,
                remainingReferences: 0,
                result
            };
        }
