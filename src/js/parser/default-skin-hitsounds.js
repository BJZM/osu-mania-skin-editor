// ============================================================================
// default-skin-hitsounds.js - 加载 osu!stable Legacy 默认打击音效回退资源
// 依赖：default_skin 资源清单、skin-hitsound-assets；不依赖音频解码
// ============================================================================

        const DEFAULT_SKIN_HITSOUND_MIME_TYPES = Object.freeze({
            wav: 'audio/wav',
            mp3: 'audio/mpeg',
            ogg: 'audio/ogg'
        });

        let defaultSkinHitsoundStore = new Map();
        let defaultSkinHitsoundCatalog = new Map();
        let defaultSkinHitsoundLoadPromise = null;

        function normalizeDefaultSkinHitsoundPath(path) {
            return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
        }

        function getDefaultSkinHitsoundAssetList() {
            return (window.DEFAULT_SKIN_HITSOUND_ASSETS || []).slice();
        }

        function getDefaultSkinHitsoundMimeType(filename) {
            const extension = String(filename || '').split('.').pop().toLowerCase();
            return DEFAULT_SKIN_HITSOUND_MIME_TYPES[extension] || 'application/octet-stream';
        }

        async function loadDefaultSkinHitsoundFile(filename) {
            const response = await fetch(`assets/default_skin/${filename}`, { cache: 'force-cache' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.byteLength === 0) {
                throw new Error('文件为空');
            }
            return {
                path: filename,
                bytes,
                mimeType: getDefaultSkinHitsoundMimeType(filename)
            };
        }

        function ensureDefaultSkinHitsoundsLoaded() {
            if (defaultSkinHitsoundLoadPromise) return defaultSkinHitsoundLoadPromise;

            const assetList = getDefaultSkinHitsoundAssetList();
            if (assetList.length === 0) {
                defaultSkinHitsoundLoadPromise = Promise.resolve(defaultSkinHitsoundCatalog);
                return defaultSkinHitsoundLoadPromise;
            }

            defaultSkinHitsoundLoadPromise = Promise.allSettled(
                assetList.map((filename) => loadDefaultSkinHitsoundFile(filename))
            ).then((results) => {
                const records = [];
                const failed = [];
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        records.push(result.value);
                    } else {
                        failed.push(assetList[index]);
                    }
                });

                defaultSkinHitsoundStore = new Map(records.map((record) => [
                    normalizeDefaultSkinHitsoundPath(record.path),
                    record
                ]));

                const archiveLike = {
                    files: Object.fromEntries(records.map((record) => [
                        record.path,
                        { dir: false }
                    ]))
                };
                const hitsoundRead = readSkinHitsoundAssets(archiveLike, { source: 'default' });
                defaultSkinHitsoundCatalog = hitsoundRead.groups;

                if (failed.length > 0) {
                    console.warn('部分默认打击音效加载失败:', failed.join(', '));
                }
                return defaultSkinHitsoundCatalog;
            }).catch((error) => {
                console.warn('默认打击音效加载失败:', error);
                defaultSkinHitsoundStore = new Map();
                defaultSkinHitsoundCatalog = new Map();
                return defaultSkinHitsoundCatalog;
            });

            return defaultSkinHitsoundLoadPromise;
        }

        function getDefaultSkinHitsoundRecord(path) {
            return defaultSkinHitsoundStore.get(normalizeDefaultSkinHitsoundPath(path)) || null;
        }

        function getDefaultSkinHitsoundBytes(path) {
            const record = getDefaultSkinHitsoundRecord(path);
            return record ? record.bytes : null;
        }

        function getDefaultSkinHitsoundCatalog() {
            return defaultSkinHitsoundCatalog;
        }
