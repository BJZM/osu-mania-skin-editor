// ============================================================================
// texture-project-archive.js - 可续编贴图工程数据在皮肤归档内的读写
// 依赖：skin-assets、texture-image-editor-recipes、texture-image-editor-state、JSZip
// ============================================================================

        const TEXTURE_PROJECT_FORMAT = 'osu-mania-skin-editor/texture-project';
        const TEXTURE_PROJECT_VERSION = 1;
        const TEXTURE_PROJECT_ROOT = '_skin-editor';
        const TEXTURE_PROJECT_MANIFEST_PATH = `${TEXTURE_PROJECT_ROOT}/texture-project.json`;
        const TEXTURE_PROJECT_SOURCE_ROOT = `${TEXTURE_PROJECT_ROOT}/sources`;

        let activeTextureProjectImport = false;

        function normalizeTextureProjectEntryPath(value) {
            if (typeof value !== 'string') return null;
            const normalized = value
                .replace(/\\/g, '/')
                .replace(/^\/+/, '')
                .replace(/\/+$/, '');
            if (!normalized || normalized.includes('\0')) return null;
            const parts = normalized.split('/');
            if (parts.some((part) => !part || part === '.' || part === '..')) return null;
            return normalized;
        }

        function isTextureProjectInternalPath(path) {
            const normalized = normalizeTextureProjectEntryPath(path);
            if (!normalized) return false;
            const lower = normalized.toLowerCase();
            return lower === TEXTURE_PROJECT_ROOT || lower.startsWith(`${TEXTURE_PROJECT_ROOT}/`);
        }

        function clearTextureProjectImportState() {
            activeTextureProjectImport = false;
        }

        function hasActiveTextureProjectImport() {
            return activeTextureProjectImport;
        }

        function stripTextureProjectFromArchive(zip) {
            if (!zip || !zip.files) return 0;
            let removed = 0;
            for (const filename of Object.keys(zip.files)) {
                if (!isTextureProjectInternalPath(filename)) continue;
                zip.remove(filename);
                removed++;
            }
            return removed;
        }

        function cloneTextureProjectValue(value, fallback) {
            if (value == null) return fallback;
            try {
                return JSON.parse(JSON.stringify(value));
            } catch (_) {
                return fallback;
            }
        }

        function textureProjectFrameFlags(frame) {
            return {
                is2x: !!(frame && frame._is2x),
                isRootLevel: !!(frame && frame._isRootLevel),
                isTransparent1x1: !!(frame && frame._isTransparent1x1),
                isBlankPlaceholder: !!(frame && frame._isBlankPlaceholder),
                keyImageHeightOffset1x: Number(frame && frame._keyImageHeightOffset1x) || 0,
                keyImageHeightPadding1x: Number(frame && frame._keyImageHeightPadding1x) || 0
            };
        }

        function sanitizeTextureProjectSourceName(value, fallback = 'texture') {
            const clean = String(value || '')
                .replace(/\\/g, '/')
                .split('/')
                .pop()
                .replace(/\.(png|jpe?g)$/i, '')
                .replace(/@2x$/i, '')
                .replace(/[^a-z0-9_-]+/gi, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 64);
            return clean || fallback;
        }

        function frameFromTextureProjectDescriptor(image, descriptor) {
            const flags = descriptor && descriptor.flags || {};
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width || 1;
            canvas.height = image.naturalHeight || image.height || 1;
            canvas.getContext('2d').drawImage(image, 0, 0);
            canvas._is2x = !!flags.is2x;
            canvas._isRootLevel = !!flags.isRootLevel;
            canvas._isTransparent1x1 = !!flags.isTransparent1x1;
            canvas._isBlankPlaceholder = !!flags.isBlankPlaceholder;
            canvas._keyImageHeightOffset1x = Number(flags.keyImageHeightOffset1x) || 0;
            canvas._keyImageHeightPadding1x = Number(flags.keyImageHeightPadding1x) || 0;
            return canvas;
        }

        function textureProjectCanvasToBlob(frame) {
            let canvas = frame;
            if (!canvas || typeof canvas.getContext !== 'function') {
                canvas = document.createElement('canvas');
                canvas.width = frame.naturalWidth || frame.width || 1;
                canvas.height = frame.naturalHeight || frame.height || 1;
                canvas.getContext('2d').drawImage(frame, 0, 0);
            }
            if (typeof canvas.convertToBlob === 'function') {
                return canvas.convertToBlob({ type: 'image/png' });
            }
            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('无法编码贴图工程源图'));
                }, 'image/png');
            });
        }

        async function hashTextureProjectBuffer(arrayBuffer) {
            const subtle = globalThis.crypto && globalThis.crypto.subtle;
            if (subtle && typeof subtle.digest === 'function') {
                const digest = await subtle.digest('SHA-256', arrayBuffer);
                return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
            }
            const bytes = new Uint8Array(arrayBuffer);
            let hash = 2166136261;
            for (let index = 0; index < bytes.length; index++) {
                hash ^= bytes[index];
                hash = Math.imul(hash, 16777619);
            }
            return `${(hash >>> 0).toString(16).padStart(8, '0')}${bytes.length.toString(16)}`;
        }

        async function writeTextureProjectFrame(zip, frame, writeState, options = {}) {
            if (!frame) return null;
            const blob = await textureProjectCanvasToBlob(frame);
            const arrayBuffer = await blob.arrayBuffer();
            const hash = await hashTextureProjectBuffer(arrayBuffer);
            const sourceGroup = String(options.sourceGroup || 'sources')
                .split('/')
                .filter(Boolean)
                .join('/');
            const sourceName = options.sourceName
                ? `${sanitizeTextureProjectSourceName(options.sourceName)}-`
                : '';
            const file = sourceGroup === 'sources'
                ? `${TEXTURE_PROJECT_SOURCE_ROOT}/${hash}.png`
                : `${TEXTURE_PROJECT_ROOT}/${sourceGroup}/${sourceName}${hash}.png`;
            if (!writeState.files.has(file)) {
                zip.file(file, arrayBuffer);
                writeState.files.add(file);
            }
            return {
                file,
                width: frame.naturalWidth || frame.width || 0,
                height: frame.naturalHeight || frame.height || 0,
                flags: textureProjectFrameFlags(frame)
            };
        }

        async function writeTextureProjectFrames(zip, frames, writeState, options = {}) {
            const descriptors = [];
            const sourceFrames = frames || [];
            for (let index = 0; index < sourceFrames.length; index++) {
                const frame = sourceFrames[index];
                const sourceName = typeof options.sourceName === 'function'
                    ? options.sourceName(index)
                    : options.sourceName;
                const descriptor = await writeTextureProjectFrame(zip, frame, writeState, {
                    sourceGroup: options.sourceGroup,
                    sourceName: sourceFrames.length > 1 && sourceName
                        ? `${sourceName}-${index}`
                        : sourceName
                });
                if (descriptor) descriptors.push(descriptor);
            }
            return descriptors;
        }

        function collectTextureProjectOutputFiles(zip, reference) {
            const files = new Set();
            if (!reference) return files;
            const expected = normalizeSkinKey(reference).replace(/@2x$/i, '');
            if (!expected) return files;
            const consider = (filename) => {
                if (!filename || isTextureProjectInternalPath(filename)) return;
                const normalized = normalizeSkinKey(filename)
                    .replace(/@2x$/i, '')
                    .replace(/-\d+$/i, '');
                if (normalized === expected) files.add(String(filename).replace(/\\/g, '/'));
            };
            for (const filename of Object.keys(zip && zip.files || {})) consider(filename);
            if (typeof userReplacedTextures !== 'undefined') {
                for (const filename of userReplacedTextures.keys()) consider(filename);
            }
            return files;
        }

        function textureProjectReferenceIsCreated(reference) {
            if (!reference || typeof hasCreatedTextureParams !== 'function') return false;
            return hasCreatedTextureParams(reference);
        }

        async function captureTextureProjectRecipe(zip, key, recipe, writeState) {
            if (!recipe || !Array.isArray(recipe.sourceFrames) || recipe.sourceFrames.length === 0) {
                return null;
            }
            const libraryMatch = String(key || '').match(/^library\|(.+)$/i);
            const outputReference = normalizeSkinKey(
                recipe.originalReference || (libraryMatch ? libraryMatch[1] : '')
            );
            if (textureProjectReferenceIsCreated(outputReference)) return null;

            const keyImageOriginalSources = {};
            for (const [paramKey, source] of Object.entries(recipe.keyImageOriginalSources || {})) {
                const frames = await writeTextureProjectFrames(zip, source && source.frames, writeState);
                if (frames.length === 0) continue;
                keyImageOriginalSources[paramKey] = {
                    reference: source && source.reference,
                    frames
                };
            }

            return {
                key,
                originalReference: recipe.originalReference || '',
                outputReference,
                outputFiles: Array.from(collectTextureProjectOutputFiles(zip, outputReference)),
                sourceFrames: await writeTextureProjectFrames(zip, recipe.sourceFrames, writeState),
                keyImageOriginalSources,
                params: cloneTextureProjectValue(recipe.params, {})
            };
        }

        function textureProjectLongBodyColumn(sessionKey) {
            const match = String(sessionKey || '').match(/NoteImage(\d+)L$/i);
            return match ? Number(match[1]) : null;
        }

        async function captureTextureProjectLongBody(zip, sessionKey, session, writeState) {
            if (!session || !Array.isArray(session.baseFrames) || session.baseFrames.length === 0) {
                return null;
            }
            const column = textureProjectLongBodyColumn(sessionKey);
            const outputBase = column == null ? '' : `longbody-body_col${column + 1}L`;
            const bodySourceName = session.bodySourceName || outputBase || 'body';
            const tailSourceName = session.tailSourceName || (column == null ? 'tail' : `tail_col${column + 1}`);
            const baseFrames = await writeTextureProjectFrames(zip, session.baseFrames, writeState, {
                sourceGroup: 'longbody/body',
                sourceName: bodySourceName
            });
            const tailFrame = session.tailFrame
                ? await writeTextureProjectFrame(zip, session.tailFrame, writeState, {
                    sourceGroup: 'longbody/tail',
                    sourceName: tailSourceName
                })
                : null;
            const preComposerState = session.preComposerState &&
                Array.isArray(session.preComposerState.workingFrames) &&
                session.preComposerState.workingFrames.length > 0
                ? {
                    workingFrames: await writeTextureProjectFrames(
                        zip,
                        session.preComposerState.workingFrames,
                        writeState
                    ),
                    cropRect: cloneTextureProjectValue(session.preComposerState.cropRect, null),
                    imageTransform: cloneTextureProjectValue(
                        session.preComposerState.imageTransform,
                        null
                    ),
                    rgbAdjustment: cloneTextureProjectValue(
                        session.preComposerState.rgbAdjustment,
                        null
                    )
                }
                : null;
            return {
                sessionKey,
                column,
                outputBase,
                outputFiles: Array.from(collectTextureProjectOutputFiles(zip, outputBase)),
                baseFrames,
                tailFrame,
                preComposerState,
                bodySourceFiles: baseFrames.map((frame) => frame.file),
                tailSourceFile: tailFrame ? tailFrame.file : null,
                bodySourceName: session.bodySourceName || '',
                tailSourceName: session.tailSourceName || '',
                settings: {
                    targetHeight: Number(session.targetHeight) || 0,
                    coverage: Number(session.coverage) || 0,
                    fade: Number(session.fade) || 0,
                    tailPreset: session.tailPreset || 'none',
                    presetHeight: Number(session.presetHeight) || 0
                }
            };
        }

        async function writeTextureProjectToArchive(zip, options = {}) {
            if (!zip || typeof zip.file !== 'function') {
                throw new Error('缺少用于写入工程数据的皮肤归档');
            }
            stripTextureProjectFromArchive(zip);
            const includeSources = options.includeSources !== false;
            if (!includeSources) {
                return {
                    manifestPath: null,
                    sourceCount: 0,
                    createdCount: 0,
                    recipeCount: 0,
                    longBodyCount: 0
                };
            }

            const writeState = { files: new Set() };
            const createdTextures = [];
            if (typeof createdSkinTextureParams !== 'undefined' && createdSkinTextureParams instanceof Map) {
                for (const [path, params] of createdSkinTextureParams.entries()) {
                    if (!path || !params || isTextureProjectInternalPath(path)) continue;
                    createdTextures.push({
                        path,
                        generatorVersion: 1,
                        params: cloneTextureProjectValue(params, {}),
                        outputFiles: Array.from(collectTextureProjectOutputFiles(zip, path))
                    });
                }
            }

            const editedTextures = [];
            if (typeof textureEditRecipes !== 'undefined' && textureEditRecipes instanceof Map) {
                for (const [key, recipe] of textureEditRecipes.entries()) {
                    const captured = await captureTextureProjectRecipe(zip, key, recipe, writeState);
                    if (captured) editedTextures.push(captured);
                }
            }

            const longBodies = [];
            if (typeof longBodyComposerSessions !== 'undefined' && longBodyComposerSessions instanceof Map) {
                for (const [sessionKey, session] of longBodyComposerSessions.entries()) {
                    const captured = await captureTextureProjectLongBody(zip, sessionKey, session, writeState);
                    if (captured) longBodies.push(captured);
                }
            }

            const manifest = {
                format: TEXTURE_PROJECT_FORMAT,
                version: TEXTURE_PROJECT_VERSION,
                createdAt: new Date().toISOString(),
                createdTextures,
                editedTextures,
                longBodies
            };
            zip.file(TEXTURE_PROJECT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
            return {
                manifestPath: TEXTURE_PROJECT_MANIFEST_PATH,
                sourceCount: writeState.files.size,
                createdCount: createdTextures.length,
                recipeCount: editedTextures.length,
                longBodyCount: longBodies.length
            };
        }

        function findTextureProjectManifestEntry(zip) {
            if (!zip || !zip.files) return null;
            const expected = TEXTURE_PROJECT_MANIFEST_PATH.toLowerCase();
            const filename = Object.keys(zip.files).find(
                (name) => name.replace(/\\/g, '/').toLowerCase() === expected
            );
            return filename ? zip.files[filename] : null;
        }

        function parseTextureProjectManifest(manifest) {
            if (!manifest || manifest.format !== TEXTURE_PROJECT_FORMAT) return null;
            if (!Number.isInteger(manifest.version) || manifest.version < 1) return null;
            if (manifest.version > TEXTURE_PROJECT_VERSION) return null;
            return manifest;
        }

        async function readTextureProjectFrame(zip, descriptor, cache) {
            if (!descriptor) return null;
            const file = normalizeTextureProjectEntryPath(descriptor.file);
            if (!file || !isTextureProjectInternalPath(file)) return null;
            if (cache.has(file)) return cache.get(file);
            const promise = (async () => {
                const entry = zip.file(file) || zip.file(file.toLowerCase());
                if (!entry) return null;
                const arrayBuffer = await entry.async('arraybuffer');
                const blob = new Blob([arrayBuffer], { type: 'image/png' });
                const url = URL.createObjectURL(blob);
                try {
                    const image = await new Promise((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = () => reject(new Error(`无法读取工程源图: ${file}`));
                        img.src = url;
                    });
                    return frameFromTextureProjectDescriptor(image, descriptor);
                } finally {
                    URL.revokeObjectURL(url);
                }
            })();
            cache.set(file, promise);
            return promise;
        }

        async function readTextureProjectFrames(zip, descriptors, cache) {
            const frames = [];
            for (const descriptor of descriptors || []) {
                const frame = await readTextureProjectFrame(zip, descriptor, cache);
                if (frame) frames.push(frame);
            }
            return frames;
        }

        function resolveTextureProjectFrames(reference) {
            if (!reference || typeof getSkinAnimationFramesFromStore !== 'function') return [];
            const key = normalizeSkinKey(reference).replace(/@2x$/i, '');
            const candidates = [key];
            const base = key.split('/').pop();
            if (base && base !== key) candidates.push(base);
            const stores = [skinImageStore, skinFallbackImageStore];
            for (const candidate of candidates) {
                for (const store of stores) {
                    const frames = getSkinAnimationFramesFromStore(store, candidate, true);
                    if (frames && frames.length > 0) return frames;
                }
            }
            return [];
        }

        function resolveTextureProjectRecipeOutputFrames(record) {
            const direct = resolveTextureProjectFrames(record && record.outputReference);
            if (direct.length > 0) return direct;
            const match = String(record && record.key || '').match(/^(\d+)\|(.+)$/);
            if (!match || typeof getTextureTabParams !== 'function' || typeof buildEditorTarget !== 'function') {
                return [];
            }
            const paramKey = match[2];
            const param = getTextureTabParams().find((item) => item.key === paramKey);
            const target = param ? buildEditorTarget(param) : null;
            return target && target.frames ? target.frames.slice() : [];
        }

        async function restoreTextureProjectCreated(zip, manifest, cache) {
            const restored = [];
            for (const record of manifest.createdTextures || []) {
                const path = normalizeTextureProjectEntryPath(record && record.path);
                if (!path || !record.params) continue;
                const key = normalizeSkinKey(path);
                createdSkinTextureParams.set(key, {
                    ...cloneTextureProjectValue(record.params, {}),
                    name: path
                });
                restored.push(key);
            }
            return restored;
        }

        async function restoreTextureProjectRecipes(zip, manifest, cache) {
            const restored = [];
            for (const record of manifest.editedTextures || []) {
                const key = String(record && record.key || '');
                if (!key || !record.params) continue;
                const sourceFrames = await readTextureProjectFrames(zip, record.sourceFrames, cache);
                if (sourceFrames.length === 0) continue;
                const keyImageOriginalSources = {};
                for (const [paramKey, source] of Object.entries(record.keyImageOriginalSources || {})) {
                    const frames = await readTextureProjectFrames(zip, source && source.frames, cache);
                    if (frames.length === 0) continue;
                    keyImageOriginalSources[paramKey] = {
                        reference: source && source.reference,
                        frames
                    };
                }
                const outputFrames = resolveTextureProjectRecipeOutputFrames(record);
                if (outputFrames.length === 0) continue;
                textureEditRecipes.set(key, {
                    sourceFrames,
                    originalReference: normalizeSkinKey(record.originalReference || record.outputReference || ''),
                    keyImageOriginalSources,
                    params: cloneTextureProjectValue(record.params, {}),
                    outputFrames
                });
                restored.push(key);
            }
            return restored;
        }

        async function restoreTextureProjectLongBodies(zip, manifest, cache) {
            const restored = [];
            for (const record of manifest.longBodies || []) {
                const sessionKey = String(record && record.sessionKey || '');
                if (!sessionKey) continue;
                const baseFrames = await readTextureProjectFrames(zip, record.baseFrames, cache);
                if (baseFrames.length === 0) continue;
                const tailFrame = await readTextureProjectFrame(zip, record.tailFrame, cache);
                const preComposerRecord = record.preComposerState || null;
                const preComposerFrames = preComposerRecord
                    ? await readTextureProjectFrames(
                        zip,
                        preComposerRecord.workingFrames,
                        cache
                    )
                    : [];
                const settings = record.settings || {};
                longBodyComposerSessions.set(sessionKey, {
                    baseFrames,
                    preComposerState: preComposerFrames.length > 0
                        ? {
                            workingFrames: preComposerFrames,
                            cropRect: cloneTextureProjectValue(
                                preComposerRecord.cropRect,
                                null
                            ),
                            imageTransform: cloneTextureProjectValue(
                                preComposerRecord.imageTransform,
                                null
                            ),
                            rgbAdjustment: cloneTextureProjectValue(
                                preComposerRecord.rgbAdjustment,
                                null
                            )
                        }
                        : null,
                    tailFrame,
                    preserveImportedOutput: true,
                    bodySourceName: record.bodySourceName || '',
                    tailSourceName: record.tailSourceName || '',
                    targetHeight: Number(settings.targetHeight) || LONG_BODY_DEFAULT_HEIGHT,
                    coverage: Number(settings.coverage) || 0,
                    fade: Number(settings.fade) || 0,
                    tailPreset: settings.tailPreset || 'none',
                    presetHeight: Number(settings.presetHeight) || 0
                });
                restored.push(sessionKey);
            }
            return restored;
        }

        async function readTextureProjectFromArchive(zip) {
            activeTextureProjectImport = false;
            const manifestEntry = findTextureProjectManifestEntry(zip);
            if (!manifestEntry) return null;
            try {
                const manifest = parseTextureProjectManifest(
                    JSON.parse(await manifestEntry.async('string'))
                );
                if (!manifest) return null;
                const cache = new Map();
                const created = await restoreTextureProjectCreated(zip, manifest, cache);
                const recipes = await restoreTextureProjectRecipes(zip, manifest, cache);
                const longBodies = await restoreTextureProjectLongBodies(zip, manifest, cache);
                activeTextureProjectImport = true;
                return {
                    version: manifest.version,
                    createdCount: created.length,
                    recipeCount: recipes.length,
                    longBodyCount: longBodies.length,
                    sourceCount: cache.size
                };
            } catch (error) {
                console.warn('读取贴图工程数据失败，已按普通皮肤导入:', error);
                return null;
            }
        }
