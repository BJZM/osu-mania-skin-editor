// ============================================================================
// texture-library-operations.js - 复制、删除与参数引用清理
// 依赖：skin-assets、history、texture-image-editor-store-serialize、texture-param-lookup
// ============================================================================

        function normalizeTextureLibraryArchiveName(name) {
            return String(name || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
        }

        function normalizeTextureLibraryCopyPath(source, rawName) {
            if (!source || !source.path) throw new Error('缺少要复制的贴图');
            let name = String(rawName || '').trim().replace(/\\/g, '/');
            name = name.replace(/\.(png|jpe?g)$/i, '');
            if (!name) throw new Error('请输入副本名称');
            if (name.includes('/')) throw new Error('副本名称不能包含路径分隔符');
            if (/[\\/:*?"<>|\u0000-\u001F\u007F]/.test(name) ||
                /^\.+$/.test(name) ||
                /[. ]$/.test(name)) {
                throw new Error('副本名称包含不可用字符');
            }
            const directory = source.path.split('/').slice(0, -1).join('/');
            return directory ? `${directory}/${name}` : name;
        }

        function validateTextureLibraryCopyPath(source, rawName, sources = collectExistingTextureSources()) {
            const copyPath = normalizeTextureLibraryCopyPath(source, rawName);
            const normalizedCopy = normalizeSkinKey(copyPath);
            const collision = sources.some((item) => {
                return normalizeSkinKey(item.path) === normalizedCopy;
            });
            if (collision) throw new Error('已存在同名贴图，请换一个名称');
            return copyPath;
        }

        function removeTextureLibraryReplacementVariants(fileBase) {
            const expected = new Set([
                `${fileBase}.png`.toLowerCase(),
                `${fileBase}.jpg`.toLowerCase(),
                `${fileBase}.jpeg`.toLowerCase(),
                `${fileBase}@2x.png`.toLowerCase(),
                `${fileBase}@2x.jpg`.toLowerCase(),
                `${fileBase}@2x.jpeg`.toLowerCase()
            ]);
            for (const key of Array.from(userReplacedTextures.keys())) {
                if (expected.has(normalizeTextureLibraryArchiveName(key))) {
                    userReplacedTextures.delete(key);
                }
            }
        }

        function createTextureLibraryCopyFrame(frame) {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, frame.width || frame.naturalWidth || 1);
            canvas.height = Math.max(1, frame.height || frame.naturalHeight || 1);
            const context = canvas.getContext('2d');
            context.drawImage(frame, 0, 0, canvas.width, canvas.height);
            canvas._is2x = !!frame._is2x;
            canvas._isRootLevel = !!frame._isRootLevel;
            canvas._keyImageHeightOffset1x = Number(frame._keyImageHeightOffset1x) || 0;
            canvas._keyImageHeightPadding1x = Number(frame._keyImageHeightPadding1x) || 0;
            return canvas;
        }

        async function copyTextureLibrarySource(source, copyPath) {
            if (!source || !Array.isArray(source.frames) || source.frames.length === 0) {
                throw new Error('源贴图没有可复制的帧');
            }
            const copyFrames = source.frames.map(createTextureLibraryCopyFrame);
            const serialized = await serializeFrames(copyPath, copyFrames);
            if (serialized.length === 0) throw new Error('无法编码副本贴图');

            recordSkinUndoBeforeChange(`复制贴图: ${source.path} -> ${copyPath}`, { force: true });
            const is2x = !!serialized[0].img._is2x;
            const suffix = is2x ? '@2x.png' : '.png';
            const oppositeSuffix = is2x ? '.png' : '@2x.png';
            const fallbackBase = copyPath.split('/').pop();
            const files = [];

            serialized.forEach((frame, index) => {
                const frameBase = serialized.length > 1 ? `${copyPath}-${index}` : copyPath;
                const fallbackFrameBase = serialized.length > 1
                    ? `${fallbackBase}-${index}`
                    : fallbackBase;
                frame.img._is2x = is2x;
                frame.img._isRootLevel = !copyPath.includes('/');
                saveSkinAssetToStore(skinImageStore, frameBase, frame.img, is2x, true, true);
                saveSkinAssetToStore(
                    skinFallbackImageStore,
                    fallbackFrameBase,
                    frame.img,
                    is2x,
                    true,
                    true
                );

                removeTextureLibraryReplacementVariants(frameBase);
                const fileName = `${frameBase}${suffix}`;
                userReplacedTextures.set(fileName, frame.arrayBuffer);
                deletedSkinTexturePaths.delete(
                    normalizeTextureLibraryArchiveName(`${frameBase}${oppositeSuffix}`)
                );
                deletedSkinTexturePaths.delete(normalizeTextureLibraryArchiveName(fileName));
                files.push(fileName);
            });

            const existingParams = getCreatedTextureParams(source.path);
            if (existingParams) {
                saveCreatedTextureParams(copyPath, {
                    ...existingParams,
                    name: copyPath
                });
            }

            return {
                path: copyPath,
                frameCount: serialized.length,
                files
            };
        }

        function collectTextureLibraryStoreKeys(source) {
            const base = normalizeSkinKey(source && source.path);
            const keys = new Set([base]);
            const frameCount = Math.max(1, source && source.frames ? source.frames.length : 1);
            for (let index = 0; index < frameCount; index++) {
                keys.add(`${base}-${index}`);
            }
            return keys;
        }

        function deleteTextureLibraryStoreSource(store, keys) {
            if (!store) return;
            for (const key of keys) store.delete(key);
        }

        function clearTextureLibraryParamReferences(paths) {
            const normalizedPaths = new Set(
                Array.from(paths, (path) => normalizeTextureLookupPath(path))
            );
            let cleared = 0;

            const clearConfig = (cfg) => {
                if (!cfg || !cfg.ImageLookups) return;
                const lookupKeys = new Set();
                for (const [key, value] of cfg.ImageLookups.entries()) {
                    if (!normalizedPaths.has(normalizeTextureLookupPath(value))) continue;
                    lookupKeys.add(key);
                    cfg.ImageLookups.delete(key);
                    cleared++;
                }
                for (const key of Object.keys(cfg)) {
                    if (typeof cfg[key] === 'string' &&
                        normalizedPaths.has(normalizeTextureLookupPath(cfg[key]))) {
                        delete cfg[key];
                        lookupKeys.add(key);
                    }
                }
                for (const key of lookupKeys) cfg.ImageLookups.delete(key);
            };

            for (const cfg of maniaSkinConfigurations.values()) clearConfig(cfg);
            for (const [key, value] of Array.from(globalSkinImageLookups.entries())) {
                if (!normalizedPaths.has(normalizeTextureLookupPath(value))) continue;
                globalSkinImageLookups.delete(key);
                cleared++;
            }
            return cleared;
        }

        function renameTextureLibraryParamReferences(oldPath, newPath) {
            if (!oldPath || !newPath) return 0;
            const normalizedOld = normalizeTextureLookupPath(oldPath);
            const normalizedNew = normalizeTextureLookupPath(newPath);
            if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) {
                return 0;
            }
            let renamed = 0;

            const renameConfig = (cfg) => {
                if (!cfg) return;
                if (cfg.ImageLookups) {
                    for (const [key, value] of Array.from(cfg.ImageLookups.entries())) {
                        if (normalizeTextureLookupPath(value) !== normalizedOld) continue;
                        cfg.ImageLookups.set(key, newPath);
                        renamed++;
                    }
                }
                for (const key of Object.keys(cfg)) {
                    if (typeof cfg[key] !== 'string' ||
                        normalizeTextureLookupPath(cfg[key]) !== normalizedOld) {
                        continue;
                    }
                    cfg[key] = newPath;
                    renamed++;
                }
            };

            for (const cfg of maniaSkinConfigurations.values()) renameConfig(cfg);
            if (globalSkinImageLookups) {
                for (const [key, value] of Array.from(globalSkinImageLookups.entries())) {
                    if (normalizeTextureLookupPath(value) !== normalizedOld) continue;
                    globalSkinImageLookups.set(key, newPath);
                    renamed++;
                }
            }
            return renamed;
        }

        function deleteTextureLibrarySource(source) {
            if (!source || !source.path) throw new Error('缺少要删除的贴图');
            const storeKeys = collectTextureLibraryStoreKeys(source);
            const sourceBase = normalizeSkinKey(source.path);
            const storeKey = normalizeSkinKey(source.storeKey || sourceBase);
            const fallbackBase = sourceBase.split('/').pop();
            const fallbackFrames = resolveEntryFrames(skinFallbackImageStore.get(fallbackBase)) || [];
            const fallbackMatchesSource = storeKey.includes('/') &&
                fallbackFrames.length === source.frames.length &&
                fallbackFrames.every((frame, index) => frame === source.frames[index]);
            const removedFiles = new Set();

            recordSkinUndoBeforeChange(`删除贴图: ${source.path}`, { force: true });
            deleteTextureLibraryStoreSource(skinImageStore, storeKeys);
            if (fallbackMatchesSource) {
                deleteTextureLibraryStoreSource(
                    skinFallbackImageStore,
                    collectTextureLibraryStoreKeys({
                        path: fallbackBase,
                        frames: source.frames
                    })
                );
            }

            for (const key of Array.from(userReplacedTextures.keys())) {
                const normalized = normalizeSkinKey(key).replace(/@2x$/i, '');
                if (!storeKeys.has(normalized)) continue;
                removedFiles.add(key);
                userReplacedTextures.delete(key);
            }
            if (currentSkinZip && currentSkinZip.files) {
                for (const filename of Object.keys(currentSkinZip.files)) {
                    const normalized = normalizeSkinKey(filename).replace(/@2x$/i, '');
                    if (!storeKeys.has(normalized)) continue;
                    removedFiles.add(filename);
                }
            }
            for (const key of storeKeys) {
                for (const suffix of ['.png', '@2x.png', '.jpg', '@2x.jpg', '.jpeg', '@2x.jpeg']) {
                    removedFiles.add(`${key}${suffix}`);
                }
            }
            for (const filename of removedFiles) {
                deletedSkinTexturePaths.add(normalizeTextureLibraryArchiveName(filename));
            }

            const clearedReferences = clearTextureLibraryParamReferences(storeKeys);
            deleteCreatedTextureParams(source.path);
            return {
                path: source.path,
                removedFiles: Array.from(removedFiles),
                clearedReferences
            };
        }

        function getCreatedTextureParams(path) {
            if (!path || typeof createdSkinTextureParams === 'undefined') return null;
            const key = normalizeSkinKey(path);
            const params = createdSkinTextureParams.get(key);
            return params ? { ...params } : null;
        }

        function saveCreatedTextureParams(path, params) {
            if (!path || !params || typeof createdSkinTextureParams === 'undefined') return;
            const key = normalizeSkinKey(path);
            createdSkinTextureParams.set(key, { ...params, name: path });
        }

        function deleteCreatedTextureParams(path) {
            if (!path || typeof createdSkinTextureParams === 'undefined') return;
            const key = normalizeSkinKey(path);
            createdSkinTextureParams.delete(key);
        }

        function hasCreatedTextureParams(path) {
            if (!path || typeof createdSkinTextureParams === 'undefined') return false;
            const key = normalizeSkinKey(path);
            return createdSkinTextureParams.has(key);
        }

        function cloneTextureEditParams(params) {
            if (!params) return null;
            return JSON.parse(JSON.stringify(params));
        }

        function getCreatedTextureGeneralEditParams(path) {
            const params = getCreatedTextureParams(path);
            return params && params.generalEditParams
                ? cloneTextureEditParams(params.generalEditParams)
                : null;
        }

        function saveCreatedTextureGeneralEditParams(path, editParams) {
            const params = getCreatedTextureParams(path);
            if (!params || !editParams) return false;
            saveCreatedTextureParams(path, {
                ...params,
                generalEditParams: cloneTextureEditParams(editParams)
            });
            return true;
        }

        function cloneCreatedTextureParams(sourcePath, targetPath) {
            const params = getCreatedTextureParams(sourcePath);
            if (!params || !targetPath) return false;
            saveCreatedTextureParams(targetPath, {
                ...cloneTextureEditParams(params),
                name: targetPath
            });
            return true;
        }

        async function saveSolidTextureToLibrary(payload, options = {}) {
            if (!payload || !payload.name) throw new Error('请输入贴图名称');
            let path = String(payload.name).trim().replace(/\\/g, '/');
            path = path.replace(/\.(png|jpe?g)$/i, '');
            if (!path) throw new Error('请输入贴图名称');
            if (/[\\:*?"<>|\u0000-\u001F\u007F]/.test(path) ||
                /^\.+$/.test(path) ||
                /[. ]$/.test(path)) {
                throw new Error('贴图名称包含不可用字符');
            }
            if (path.startsWith('/') || path.endsWith('/') || path.includes('//')) {
                throw new Error('贴图路径格式无效');
            }

            const normalizedNew = normalizeSkinKey(path);
            const normalizedOld = options.oldPath ? normalizeSkinKey(options.oldPath) : null;
            const previousCreatedParams = normalizedOld
                ? getCreatedTextureParams(options.oldPath)
                : null;
            const generalEditParams = previousCreatedParams
                ? cloneTextureEditParams(previousCreatedParams.generalEditParams)
                : null;

            const sources = collectExistingTextureSources();
            const collision = sources.some((item) => {
                const itemNorm = normalizeSkinKey(item.path);
                if (normalizedOld && itemNorm === normalizedOld) return false;
                return itemNorm === normalizedNew;
            });
            if (collision) {
                throw new Error('已存在同名贴图，请使用其他名称');
            }

            let frame = createSolidShapeTexture(payload);
            const is2x = payload.spec === '2x';
            frame._is2x = is2x;
            frame._isRootLevel = !path.includes('/');

            if (generalEditParams &&
                typeof buildEditedFrames === 'function' &&
                typeof applyRgbAdjustmentToCanvas === 'function') {
                const edited = buildEditedFrames([frame], generalEditParams);
                if (edited && edited.frames.length > 0) {
                    frame = edited.frames[0];
                    frame._is2x = is2x;
                    frame = applyRgbAdjustmentToCanvas(
                        frame,
                        generalEditParams.rgbAdjustment
                    );
                }
            }

            const serialized = await serializeFrames(path, [frame]);
            if (serialized.length === 0) throw new Error('无法编码贴图');

            const isEdit = !!normalizedOld;
            const desc = isEdit ? `编辑贴图: ${options.oldPath}` : `创建贴图: ${path}`;
            recordSkinUndoBeforeChange(desc, { force: true });

            if (isEdit && normalizedOld !== normalizedNew) {
                const oldStoreKeys = collectTextureLibraryStoreKeys({ path: options.oldPath });
                deleteTextureLibraryStoreSource(skinImageStore, oldStoreKeys);
                const oldFallbackBase = options.oldPath.split('/').pop();
                deleteTextureLibraryStoreSource(
                    skinFallbackImageStore,
                    collectTextureLibraryStoreKeys({ path: oldFallbackBase })
                );
                removeTextureLibraryReplacementVariants(options.oldPath);
                deleteCreatedTextureParams(options.oldPath);
            }

            const suffix = is2x ? '@2x.png' : '.png';
            const oppositeSuffix = is2x ? '.png' : '@2x.png';
            const fallbackBase = path.split('/').pop();

            const savedImg = serialized[0].img;
            savedImg._is2x = is2x;
            savedImg._isRootLevel = !path.includes('/');

            saveSkinAssetToStore(skinImageStore, path, savedImg, is2x, true, true, { isAnimFrame: false });
            saveSkinAssetToStore(skinFallbackImageStore, fallbackBase, savedImg, is2x, true, true, { isAnimFrame: false });
            removeTextureLibraryReplacementVariants(path);

            const fileName = `${path}${suffix}`;
            userReplacedTextures.set(fileName, serialized[0].arrayBuffer);
            deletedSkinTexturePaths.delete(normalizeTextureLibraryArchiveName(`${path}${oppositeSuffix}`));
            deletedSkinTexturePaths.delete(normalizeTextureLibraryArchiveName(fileName));

            saveCreatedTextureParams(path, {
                name: path,
                width: payload.width,
                height: payload.height,
                spec: payload.spec,
                color: payload.color,
                alpha: payload.alpha,
                strokeEnabled: !!payload.strokeEnabled,
                strokeColor: payload.strokeColor,
                strokeAlpha: payload.strokeAlpha,
                strokeWidth: payload.strokeWidth,
                shape: payload.shape,
                cornerRadius: payload.cornerRadius,
                arrowThickness: payload.arrowThickness,
                arrowRoundness: payload.arrowRoundness,
                fillTransparentEnabled: !!(payload.fillTransparentEnabled || payload.transparentFillEnabled),
                fillTransparentColor: payload.fillTransparentColor || payload.transparentFillColor || '#000000',
                fillTransparentAlpha: Number.isFinite(payload.fillTransparentAlpha !== undefined ? payload.fillTransparentAlpha : payload.transparentFillAlpha)
                    ? (payload.fillTransparentAlpha !== undefined ? payload.fillTransparentAlpha : payload.transparentFillAlpha)
                    : 100,
                generalEditParams
            });

            const renamedReferences = isEdit && normalizedOld !== normalizedNew
                ? renameTextureLibraryParamReferences(options.oldPath, path)
                : 0;
            if (isEdit && normalizedOld !== normalizedNew &&
                typeof renameTextureLibraryEditRecipe === 'function') {
                renameTextureLibraryEditRecipe(options.oldPath, path);
            }

            return {
                path,
                is2x,
                isEdit,
                frame,
                renamedReferences
            };
        }
