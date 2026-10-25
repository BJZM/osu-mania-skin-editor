// ============================================================================
// skin-hitsound-assets.js - 只读识别 osu!stable 皮肤包内的打击音效
// 依赖：JSZip 条目结构；不依赖图片资源、音频解码或播放器
// ============================================================================

        const HITSOUND_AUDIO_EXTENSION_PRIORITY = Object.freeze({
            wav: 3,
            mp3: 2,
            ogg: 1
        });
        const HITSOUND_ASSET_NAME_RE =
            /^(?:(normal|soft|drum)-)?(hitnormal|hitwhistle|hitfinish|hitclap)(\d*)$/i;

        function parseSkinHitsoundAssetPath(path) {
            const normalizedPath = String(path || '')
                .replace(/\\/g, '/')
                .replace(/^\/+/, '');
            if (!normalizedPath || normalizedPath.endsWith('/')) return null;

            const segments = normalizedPath.split('/');
            const filename = segments.pop() || '';
            const extensionMatch = filename.match(/\.([^.]+)$/);
            if (!extensionMatch) return null;

            const extension = extensionMatch[1].toLowerCase();
            const extensionPriority = HITSOUND_AUDIO_EXTENSION_PRIORITY[extension];
            if (!extensionPriority) return null;

            const stem = filename.slice(0, -extensionMatch[0].length);
            const nameMatch = stem.match(HITSOUND_ASSET_NAME_RE);
            if (!nameMatch) return null;

            const sampleSet = (nameMatch[1] || 'any').toLowerCase();
            const sound = nameMatch[2].toLowerCase();
            const indexText = nameMatch[3] || '';
            const customIndex = indexText ? Number(indexText) : 0;

            // stable 的 C1 音效不带数字后缀；数字 1 不会成为独立音效槽位。
            if (!Number.isSafeInteger(customIndex) || (indexText && customIndex < 2)) return null;

            return {
                path: normalizedPath,
                filename,
                normalizedKey: `${sampleSet === 'any' ? '' : `${sampleSet}-`}${sound}${customIndex || ''}`,
                sampleSet,
                sound,
                customIndex,
                extension,
                extensionPriority,
                isRootLevel: segments.length === 0
            };
        }

        function readSkinHitsoundAssets(zip, options = {}) {
            const source = options.source === 'default' ? 'default' : 'skin';
            const groups = new Map();
            const files = [];

            if (!zip || !zip.files) {
                return {
                    groups,
                    files,
                    groupCount: 0,
                    fileCount: 0,
                    selectedFileCount: 0
                };
            }

            for (const path of Object.keys(zip.files)) {
                const entry = zip.files[path];
                if (!entry || entry.dir) continue;
                if (typeof isTextureProjectInternalPath === 'function' &&
                    isTextureProjectInternalPath(path)) {
                    continue;
                }

                const parsedAsset = parseSkinHitsoundAssetPath(path);
                // stable 从皮肤根目录解析打击音效；子目录音频仍保留在 ZIP 中，但不算读取成功。
                if (!parsedAsset || !parsedAsset.isRootLevel) continue;
                const asset = { ...parsedAsset, source };

                const groupKey = asset.normalizedKey;
                let group = groups.get(groupKey);
                if (!group) {
                    group = {
                        key: groupKey,
                        sampleSet: asset.sampleSet,
                        sound: asset.sound,
                        customIndex: asset.customIndex,
                        source,
                        variants: [],
                        selectedPath: '',
                        selectedExtension: ''
                    };
                    groups.set(groupKey, group);
                }
                group.variants.push(asset);
                files.push(asset);
            }

            for (const group of groups.values()) {
                group.variants.sort((left, right) =>
                    right.extensionPriority - left.extensionPriority ||
                    left.path.localeCompare(right.path)
                );
                const selected = group.variants[0];
                group.selectedPath = selected.path;
                group.selectedExtension = selected.extension;
            }

            return {
                groups,
                files,
                groupCount: groups.size,
                fileCount: files.length,
                selectedFileCount: groups.size
            };
        }

        function summarizeSkinHitsoundCatalog(groups) {
            const catalog = groups instanceof Map ? groups : new Map();
            let fileCount = 0;
            for (const group of catalog.values()) {
                fileCount += Array.isArray(group?.variants) ? group.variants.length : 0;
            }
            return {
                groupCount: catalog.size,
                fileCount,
                selectedFileCount: catalog.size
            };
        }

        function mergeSkinHitsoundCatalogs(...catalogs) {
            const merged = new Map();
            for (const catalog of catalogs) {
                if (!(catalog instanceof Map)) continue;
                for (const [key, group] of catalog.entries()) {
                    if (!group) continue;
                    merged.set(key, group);
                }
            }
            return merged;
        }

        function getSkinHitsoundAsset(sampleSet, sound, customIndex = 0) {
            if (!(skinHitsoundCatalog instanceof Map)) return null;
            const normalizedSet = String(sampleSet || '').toLowerCase();
            const normalizedSound = String(sound || '').toLowerCase();
            const normalizedIndex = Number(customIndex) || 0;
            if (!normalizedSound) return null;

            const specificKey = `${normalizedSet}-${normalizedSound}${normalizedIndex || ''}`;
            const specific = skinHitsoundCatalog.get(specificKey);
            if (specific) return specific;

            // 不带 sampleset 前缀的文件是 stable 的通用回退音效。
            return skinHitsoundCatalog.get(`${normalizedSound}${normalizedIndex || ''}`) || null;
        }

        function getSkinHitsoundSummary() {
            const summary = skinHitsoundSummary || {};
            return {
                groupCount: Number(summary.groupCount) || 0,
                fileCount: Number(summary.fileCount) || 0,
                selectedFileCount: Number(summary.selectedFileCount) || 0
            };
        }
