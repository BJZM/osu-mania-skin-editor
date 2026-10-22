// ============================================================================
// texture-existing-sources.js - 枚举当前皮肤中可供贴图参数引用的图片资源
// 依赖：parser/skin-assets.js、core/state.js
// ============================================================================

        function getExistingTextureOriginalBasePath(zipName) {
            return String(zipName || '')
                .replace(/\\/g, '/')
                .replace(/\.(png|jpg|jpeg)$/i, '')
                .replace(/@2x$/i, '');
        }

        function buildExistingTexturePathCaseMap(zip) {
            const originalPaths = new Map();
            if (zip && zip.files) {
                for (const zipName of Object.keys(zip.files)) {
                    const entry = zip.files[zipName];
                    if (!entry || entry.dir || !/\.(png|jpg|jpeg)$/i.test(zipName)) continue;

                    const normalized = normalizeSkinKey(zipName).replace(/@2x$/i, '');
                    const original = getExistingTextureOriginalBasePath(zipName);
                    if (!originalPaths.has(normalized)) originalPaths.set(normalized, original);

                    const frameMatch = normalized.match(/^(.*)-\d+$/);
                    if (frameMatch && !originalPaths.has(frameMatch[1])) {
                        originalPaths.set(frameMatch[1], original.replace(/-\d+$/i, ''));
                    }
                }
                return originalPaths;
            }

            const defaultAssets = typeof getDefaultSkinAssetList === 'function'
                ? getDefaultSkinAssetList()
                : ((typeof window !== 'undefined' && window.DEFAULT_SKIN_ASSETS) || []);

            if (Array.isArray(defaultAssets) && defaultAssets.length > 0) {
                for (const assetName of defaultAssets) {
                    if (!/\.(png|jpg|jpeg)$/i.test(assetName)) continue;

                    const normalized = normalizeSkinKey(assetName).replace(/@2x$/i, '');
                    const original = getExistingTextureOriginalBasePath(assetName);
                    if (!originalPaths.has(normalized)) originalPaths.set(normalized, original);

                    const frameMatch = normalized.match(/^(.*)-\d+$/);
                    if (frameMatch && !originalPaths.has(frameMatch[1])) {
                        originalPaths.set(frameMatch[1], original.replace(/-\d+$/i, ''));
                    }
                }
            }

            if (typeof userReplacedTextures !== 'undefined' && userReplacedTextures) {
                for (const filename of userReplacedTextures.keys()) {
                    if (!/\.(png|jpg|jpeg)$/i.test(filename)) continue;
                    const normalized = normalizeSkinKey(filename).replace(/@2x$/i, '');
                    const original = getExistingTextureOriginalBasePath(filename);
                    if (!originalPaths.has(normalized)) originalPaths.set(normalized, original);

                    const frameMatch = normalized.match(/^(.*)-\d+$/);
                    if (frameMatch && !originalPaths.has(frameMatch[1])) {
                        originalPaths.set(frameMatch[1], original.replace(/-\d+$/i, ''));
                    }
                }
            }

            return originalPaths;
        }

        function countExistingTexturePathSegments(path) {
            return String(path || '').split('/').filter(Boolean).length;
        }

        function compareExistingTextureSources(a, b) {
            const depthDiff = countExistingTexturePathSegments(a.path) - countExistingTexturePathSegments(b.path);
            if (depthDiff !== 0) return depthDiff;
            return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
        }

        function isDefaultSkinWorkspaceActive() {
            if (typeof isEditableDefaultSkinWorkspaceActive === 'function' && isEditableDefaultSkinWorkspaceActive()) {
                return true;
            }
            if (!currentSkinZip && typeof currentSkinFileName !== 'undefined' && currentSkinFileName === '默认皮肤') {
                return true;
            }
            if (!currentSkinZip && (typeof skinImageStore === 'undefined' || !skinImageStore || skinImageStore.size === 0)) {
                return true;
            }
            return false;
        }

        function resolveEffectiveTextureStoreMap(storeMap, zip) {
            const inDefault = !zip && isDefaultSkinWorkspaceActive();
            if (storeMap && storeMap !== skinImageStore && (!inDefault || storeMap.size > 0)) {
                return storeMap;
            }
            if (!inDefault) {
                return storeMap || skinImageStore;
            }

            const merged = new Map();
            if (typeof defaultSkinImageStore !== 'undefined' && defaultSkinImageStore && defaultSkinImageStore.entries) {
                for (const [key, entry] of defaultSkinImageStore.entries()) {
                    merged.set(key, entry);
                }
            }
            if (typeof skinImageStore !== 'undefined' && skinImageStore && skinImageStore.entries) {
                for (const [key, entry] of skinImageStore.entries()) {
                    merged.set(key, entry);
                }
            }
            return merged;
        }

        function isExistingTextureSourceDeleted(key, path) {
            if (typeof deletedSkinTexturePaths === 'undefined' || !deletedSkinTexturePaths || deletedSkinTexturePaths.size === 0) {
                return false;
            }
            const cleanKey = normalizeSkinKey(key || path);
            const cleanPath = normalizeSkinKey(path || key);
            return deletedSkinTexturePaths.has(`${cleanKey}.png`) ||
                deletedSkinTexturePaths.has(`${cleanKey}@2x.png`) ||
                deletedSkinTexturePaths.has(`${cleanPath}.png`) ||
                deletedSkinTexturePaths.has(`${cleanPath}@2x.png`);
        }

        function buildExistingTextureSource(key, path, image, frames, options = {}) {
            const basename = path.split('/').pop() || path;
            const width = image.naturalWidth || image.videoWidth || image.width || 0;
            const height = image.naturalHeight || image.videoHeight || image.height || 0;
            return {
                path,
                storeKey: key,
                basename,
                image,
                frames,
                width,
                height,
                is2x: !!image._is2x,
                isAnimation: frames.length > 1,
                ...options
            };
        }

        function collectExistingTextureSources(storeMap = null, zip = currentSkinZip, options = {}) {
            const targetStore = resolveEffectiveTextureStoreMap(storeMap, zip);
            if (!targetStore || typeof targetStore.entries !== 'function') return [];
            const allKeys = Array.from(targetStore.keys());
            const keySet = new Set(allKeys);
            const originalPaths = buildExistingTexturePathCaseMap(zip);
            const sources = [];

            for (const [key, entry] of targetStore.entries()) {
                if (!key || !entry) continue;

                const path = originalPaths.get(key) || key;
                if (isExistingTextureSourceDeleted(key, path)) continue;

                // 动画帧条目会同时以 base 和 base-N 出现，列表中只保留有效动画的 base；自建贴图不作为帧被剔除。
                const frameMatch = String(key).match(/^(.*)-\d+$/);
                if (frameMatch && keySet.has(frameMatch[1])) {
                    const isCreated = typeof hasCreatedTextureParams === 'function' && (
                        hasCreatedTextureParams(key) || hasCreatedTextureParams(path)
                    );
                    if (!isCreated) {
                        const baseEntry = targetStore.get(frameMatch[1]);
                        const baseFrames = typeof resolveEntryFrames === 'function' ? resolveEntryFrames(baseEntry) : null;
                        const baseHasValidAnimation = Array.isArray(baseFrames) && baseFrames.length > 0;
                        if (baseHasValidAnimation) continue;
                    }
                }

                const frames = (typeof resolveEntryFrames === 'function' ? resolveEntryFrames(entry) : null) || [];
                const image = frames[0] || (typeof resolveEntrySingle === 'function' ? resolveEntrySingle(entry) : null);
                if (!image) continue;

                if (options.expandAnimationFrames && frames.length > 1) {
                    frames.forEach((frame, index) => {
                        const frameKey = `${key}-${index}`;
                        const framePath = originalPaths.get(frameKey) || frameKey;
                        if (isExistingTextureSourceDeleted(frameKey, framePath)) return;
                        sources.push(buildExistingTextureSource(
                            frameKey,
                            framePath,
                            frame,
                            [frame],
                            {
                                isAnimationFrame: true,
                                animationBasePath: path,
                                animationFrameIndex: index,
                                animationFrameCount: frames.length
                            }
                        ));
                    });
                    continue;
                }

                sources.push(buildExistingTextureSource(key, path, image, frames));
            }

            const uniqueSources = [];
            const sourceIndexByPath = new Map();
            for (const source of sources.sort(compareExistingTextureSources)) {
                const normalizedPath = normalizeSkinKey(source.path);
                if (!normalizedPath) {
                    uniqueSources.push(source);
                    continue;
                }

                const existingIndex = sourceIndexByPath.get(normalizedPath);
                if (existingIndex == null) {
                    sourceIndexByPath.set(normalizedPath, uniqueSources.length);
                    uniqueSources.push(source);
                    continue;
                }

                const existing = uniqueSources[existingIndex];
                const existingKey = String(existing.storeKey || '');
                const incomingKey = String(source.storeKey || '');
                const existingIsCanonical =
                    existingKey === normalizeSkinAssetStoreKey(existingKey);
                const incomingIsCanonical =
                    incomingKey === normalizeSkinAssetStoreKey(incomingKey);
                if (incomingIsCanonical && !existingIsCanonical) {
                    uniqueSources[existingIndex] = source;
                }
            }
            return uniqueSources;
        }

        function filterExistingTextureSources(sources, query) {
            const list = Array.isArray(sources) ? sources : [];
            const needle = String(query || '').trim().toLowerCase();
            if (!needle) return list.slice();
            return list.filter((source) => {
                return String(source.path || '').toLowerCase().includes(needle) ||
                    String(source.basename || '').toLowerCase().includes(needle);
            });
        }
