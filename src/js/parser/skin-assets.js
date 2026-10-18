// ============================================================================
// skin-assets.js - 皮肤图片注册、资源存储、默认皮肤与序列帧读取
// 依赖：core/state.js
// ============================================================================

        const SKIN_ARCHIVE_UNSAFE_EXTENSION_RE = /\.(?:exe|dll|bat|cmd|com|scr|msi|ps1|vbs|vbe|js|jse|wsf|wsh|hta|cpl|jar|lnk|url)$/i;
        const SKIN_ARCHIVE_INVALID_NAME_RE = /[\u0000-\u001F\u007F-\u009F\uFFFD]/;

        function isUnsafeSkinArchiveEntryName(name) {
            if (typeof name !== 'string' || name.length === 0) return true;
            const baseName = name.replace(/\\/g, '/').split('/').pop() || '';
            return SKIN_ARCHIVE_INVALID_NAME_RE.test(name) || SKIN_ARCHIVE_UNSAFE_EXTENSION_RE.test(baseName);
        }

        function stripUnsafeSkinArchiveEntries(zip) {
            if (!zip || !zip.files) return [];
            const removed = [];
            for (const name of Object.keys(zip.files)) {
                if (!isUnsafeSkinArchiveEntryName(name)) continue;
                removed.push(name);
                zip.remove(name);
            }
            if (removed.length > 0) {
                console.warn('[皮肤包兼容性] 已移除不兼容的压缩包条目:', removed);
            }
            return removed;
        }

        function processSkinImage(img, relativePath = '', preserveBlack = false) {
            if (!img.width || !img.height) return img;
            // osu!mania 长条尾部贴图 (NoteImage*T / mania-note*T / tail / keyT) 依赖其黑色底色作为遮罩 (mask)
            // 覆盖在矩形身体上形成圆拱造型，绝不能将黑色抠成透明，否则会导致长条身体穿透暴露。
            // preserveBlack 用于 skin.ini 把其它文件名别名到尾巴槽位的情况，例如 NoteImage0T: Arrows\noteH。
            if (preserveBlack || (relativePath && /(tail|notet|keyt)/i.test(relativePath))) {
                return img;
            }
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const cx = c.getContext('2d');
            cx.drawImage(img, 0, 0);
            try {
                const imgData = cx.getImageData(0, 0, c.width, c.height);
                const data = imgData.data;
                let hasTransparent = false;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] < 255) {
                        hasTransparent = true;
                        break;
                    }
                }
                if (!hasTransparent) {
                    for (let i = 0; i < data.length; i += 4) {
                        if (data[i] < 12 && data[i + 1] < 12 && data[i + 2] < 12) {
                            data[i + 3] = 0;
                        }
                    }
                    cx.putImageData(imgData, 0, 0);
                    const newImg = new Image();
                    newImg.src = c.toDataURL();
                    return newImg;
                }
            } catch (err) {
                console.error("处理皮肤图片失败", err);
            }
            return img;
        }

        function normalizeSkinKey(path) {
            let p = path.replace(/\\/g, '/').toLowerCase();
            p = p.replace(/\.(png|jpg|jpeg)$/i, '');
            if (p.startsWith('/')) p = p.slice(1);
            return p;
        }

        function getOrCreateSkinAssetEntry(storeMap, key) {
            let entry = storeMap.get(key);
            if (!entry) {
                entry = {
                    anim2x: [],
                    anim1x: [],
                    static2x: null,
                    static1x: null
                };
                storeMap.set(key, entry);
            }
            return entry;
        }

        function shouldReplaceSkinAsset(current, incoming, incomingIsRoot) {
            if (!current) return true;
            // 根目录贴图优先级高于子目录同名贴图
            if (incomingIsRoot && !current._isRootLevel) return true;
            return false;
        }

        function saveSkinAssetToStore(storeMap, targetKey, img, isHighRes, isRootLevel, force = false, options = {}) {
            const cleanKey = normalizeSkinKey(targetKey).replace(/@2x/g, '');
            const asAnimFrame = options && options.isAnimFrame !== undefined ? options.isAnimFrame : true;
            const dashMatch = asAnimFrame ? cleanKey.match(/-(\d+)$/) : null;
            if (dashMatch) {
                const frameIdx = parseInt(dashMatch[1], 10);
                const basePrefix = cleanKey.slice(0, dashMatch.index);
                const animEntry = getOrCreateSkinAssetEntry(storeMap, basePrefix);
                if (force) {
                    if (isHighRes) animEntry.anim2x[frameIdx] = img;
                    else animEntry.anim1x[frameIdx] = img;
                } else if (isHighRes) {
                    if (shouldReplaceSkinAsset(animEntry.anim2x[frameIdx], img, isRootLevel)) {
                        animEntry.anim2x[frameIdx] = img;
                    }
                } else {
                    if (shouldReplaceSkinAsset(animEntry.anim1x[frameIdx], img, isRootLevel)) {
                        animEntry.anim1x[frameIdx] = img;
                    }
                }
            }

            // 同时也作为 cleanKey 本身的静态槽位存储（支持精确按全名检索，如 score-0, combo-1 等）
            const directEntry = getOrCreateSkinAssetEntry(storeMap, cleanKey);
            if (force) {
                directEntry.anim1x = [];
                directEntry.anim2x = [];
                if (isHighRes) {
                    directEntry.static2x = img;
                    directEntry.static1x = null;
                } else {
                    directEntry.static1x = img;
                    directEntry.static2x = null;
                }
            } else if (isHighRes) {
                if (shouldReplaceSkinAsset(directEntry.static2x, img, isRootLevel)) {
                    directEntry.static2x = img;
                }
            } else {
                if (shouldReplaceSkinAsset(directEntry.static1x, img, isRootLevel)) {
                    directEntry.static1x = img;
                }
            }
        }

        function registerSkinImage(normalizedKey, processedImg) {
            normalizedKey = normalizeSkinKey(normalizedKey);
            const is2x = normalizedKey.includes('@2x');
            processedImg._is2x = is2x;

            const cleanKey = normalizedKey.replace(/@2x/g, '');
            const isRootLevel = !cleanKey.includes('/');
            processedImg._isRootLevel = isRootLevel;

            // 1. 存入精确匹配表 (skinImageStore)
            saveSkinAssetToStore(skinImageStore, cleanKey, processedImg, is2x, isRootLevel);

            // 2. 如果贴图位于子目录，提取 basename 作为回退存储在独立回退表 (skinFallbackImageStore)
            const basename = cleanKey.split('/').pop();
            if (basename && basename !== cleanKey && !/(^|\/|[-_])(backup|old|temp)([-_]|\/|$)/i.test(cleanKey)) {
                saveSkinAssetToStore(skinFallbackImageStore, basename, processedImg, is2x, isRootLevel);
            }
        }

        function registerDefaultSkinImage(filename, img) {
            const is2x = filename.includes('@2x');
            img._is2x = is2x;
            const cleanKey = normalizeSkinKey(filename).replace(/@2x/g, '');
            const isRootLevel = !cleanKey.includes('/');
            img._isRootLevel = isRootLevel;

            saveSkinAssetToStore(defaultSkinImageStore, cleanKey, img, is2x, isRootLevel);
            const basename = cleanKey.split('/').pop();
            if (basename && basename !== cleanKey) {
                saveSkinAssetToStore(defaultSkinFallbackStore, basename, img, is2x, isRootLevel);
            }
        }

        const DEFAULT_SKIN_PRIORITY_PATTERNS = [
            /^mania-note[1-9S](?:H|L-\d+|T)?(?:@2x)?\.png$/i,
            /^mania-key[1-9S]D?(?:@2x)?\.png$/i,
            /^hit(?:0|50|100|200|300|300g)(?:@2x)?\.png$/i,
            /^score-\d(?:@2x)?\.png$/i,
            /^mania-stage-(?:hint|light|left|right)(?:@2x)?\.png$/i,
            /^lighting(?:N|L-\d+)?(?:@2x)?\.png$/i,
            /^scorebar-(?:bg|colour|marker)(?:@2x)?\.png$/i
        ];
        let defaultSkinPrimePromise = null;

        function getDefaultSkinAssetList() {
            return (typeof window !== 'undefined' && window.DEFAULT_SKIN_ASSETS) || [];
        }

        function isDefaultSkinPriorityAsset(filename) {
            return DEFAULT_SKIN_PRIORITY_PATTERNS.some((pattern) => pattern.test(filename));
        }

        function loadDefaultSkinImages(assetList) {
            return Promise.all(assetList.map((filename) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        img._is2x = filename.includes('@2x');
                        registerDefaultSkinImage(filename, img);
                        resolve();
                    };
                    img.onerror = () => {
                        resolve();
                    };
                    img.src = `assets/default_skin/${filename}`;
                });
            }));
        }

        function finalizeDefaultSkinPrime() {
            isDefaultSkinLoaded = true;
            if (typeof updateSkinInfoDisplay === 'function') updateSkinInfoDisplay();
            if (typeof saveInitialSkinSnapshot === 'function' && (!initialSkinSnapshot || maniaSkinConfigurations.size === 0)) {
                saveInitialSkinSnapshot();
            }
            drawFrame();
        }

        function primeDefaultSkin() {
            if (defaultSkinPrimePromise) return defaultSkinPrimePromise;
            const priorityAssets = getDefaultSkinAssetList().filter(isDefaultSkinPriorityAsset);
            defaultSkinPrimePromise = loadDefaultSkinImages(priorityAssets).then(finalizeDefaultSkinPrime);
            return defaultSkinPrimePromise;
        }

        async function loadDefaultSkin() {
            const assetList = getDefaultSkinAssetList();
            if (!assetList || assetList.length === 0) return;

            await primeDefaultSkin();

            if (document.readyState !== 'complete') {
                await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
            }

            const remainingAssets = assetList.filter((filename) => !isDefaultSkinPriorityAsset(filename));
            await loadDefaultSkinImages(remainingAssets);
            isDefaultSkinLoaded = true;
            if (typeof updateSkinInfoDisplay === 'function') updateSkinInfoDisplay();
            if (typeof refreshSkinCursor === 'function') refreshSkinCursor();
            drawFrame();
        }

        // osu! 规范贴图解析优先级：动态贴图 @2x > 动态贴图 1x > 普通静态贴图 @2x > 普通静态贴图 1x
        function resolveEntryFrames(entry) {
            if (!entry) return null;

            // 1. 动态贴图 @2x：必须存在 0 号帧才是有效的动画序列
            if (entry.anim2x && entry.anim2x[0]) {
                const frames = [];
                let i = 0;
                while (entry.anim2x[i] || entry.anim1x[i]) {
                    frames.push(entry.anim2x[i] || entry.anim1x[i]);
                    i++;
                }
                if (frames.length > 0) return frames;
            }

            // 2. 动态贴图 1x：必须存在 0 号帧才是有效的动画序列
            if (entry.anim1x && entry.anim1x[0]) {
                const frames = [];
                let i = 0;
                while (entry.anim1x[i] || entry.anim2x[i]) {
                    frames.push(entry.anim1x[i] || entry.anim2x[i]);
                    i++;
                }
                if (frames.length > 0) return frames;
            }

            // 3. 普通 @2x 静态贴图
            if (entry.static2x) {
                return [entry.static2x];
            }

            // 4. 普通 1x 静态贴图
            if (entry.static1x) {
                return [entry.static1x];
            }

            return null;
        }

        function resolveEntrySingle(entry) {
            if (!entry) return null;

            // 1. 动态贴图 @2x（取 0 号首帧）
            if (entry.anim2x && entry.anim2x[0]) {
                return entry.anim2x[0];
            }

            // 2. 动态贴图 1x（取 0 号首帧）
            if (entry.anim1x && entry.anim1x[0]) {
                return entry.anim1x[0];
            }

            // 3. 普通 @2x 静态贴图
            if (entry.static2x) {
                return entry.static2x;
            }

            // 4. 普通 1x 静态贴图
            if (entry.static1x) {
                return entry.static1x;
            }

            return null;
        }

        function getSkinAnimationFromStore(store, namePrefix, allowNestedFallback = true) {
            if (!store || !namePrefix || store.size === 0) return null;
            const fallbackStore = (store === skinImageStore) ? skinFallbackImageStore : (store === defaultSkinImageStore ? defaultSkinFallbackStore : null);
            const key = normalizeSkinKey(namePrefix).replace(/@2x/g, '');

            // 1. 优先在精确路径中查找：动态贴图 @2x > 动态贴图 1x > 普通 @2x > 普通 1x
            const entry = store.get(key);
            const res = resolveEntrySingle(entry);
            if (res) return res;

            // 2. 仅当精确匹配无结果时，才尝试子目录 basename 回退匹配
            if (allowNestedFallback && fallbackStore && fallbackStore.size > 0) {
                const base = key.split('/').pop();
                if (base) {
                    const fbEntry = fallbackStore.get(base);
                    const fbRes = resolveEntrySingle(fbEntry);
                    if (fbRes) return fbRes;
                }
            }

            return null;
        }

        function getSkinAnimationFramesFromStore(store, namePrefix, allowNestedFallback = true) {
            if (!store || !namePrefix || store.size === 0) return null;
            const fallbackStore = (store === skinImageStore) ? skinFallbackImageStore : (store === defaultSkinImageStore ? defaultSkinFallbackStore : null);
            const key = normalizeSkinKey(namePrefix).replace(/@2x/g, '');

            // 1. 优先在精确路径中查找：动态贴图 @2x > 动态贴图 1x > 普通 @2x > 普通 1x
            const entry = store.get(key);
            const res = resolveEntryFrames(entry);
            if (res && res.length > 0) return res;

            // 2. 仅当精确匹配无结果时，才尝试子目录 basename 回退匹配
            if (allowNestedFallback && fallbackStore && fallbackStore.size > 0) {
                const base = key.split('/').pop();
                if (base) {
                    const fbEntry = fallbackStore.get(base);
                    const fbRes = resolveEntryFrames(fbEntry);
                    if (fbRes && fbRes.length > 0) return fbRes;
                }
            }

            return null;
        }

        function getSkinAnimation(namePrefix, allowNestedFallback = true) {
            if (!namePrefix) return null;
            // 1. 优先在用户导入的皮肤 (skinImageStore) 中查找
            const userImg = getSkinAnimationFromStore(skinImageStore, namePrefix, allowNestedFallback);
            if (userImg) return userImg;

            // 2. 回退到 osu! stable 官方默认贴图库 (defaultSkinImageStore) 中查找
            return getSkinAnimationFromStore(defaultSkinImageStore, namePrefix, allowNestedFallback);
        }

        function getSkinAnimationFrames(namePrefix, allowNestedFallback = true) {
            if (!namePrefix) return null;
            const userFrames = getSkinAnimationFramesFromStore(skinImageStore, namePrefix, allowNestedFallback);
            if (userFrames && userFrames.length > 0) return userFrames;
            return getSkinAnimationFramesFromStore(defaultSkinImageStore, namePrefix, allowNestedFallback) || null;
        }
