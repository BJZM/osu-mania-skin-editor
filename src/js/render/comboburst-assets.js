// ============================================================================
// comboburst-assets.js - 连击提示图静态主图与编号替代图解析
// 依赖：core/state.js、parser/skin-assets.js、skin/mania-config.js
// ============================================================================

        const COMBOBURST_BASE_NAME = 'comboburst-mania';

        function getComboburstVariantPath(index, is2x = false) {
            const suffix = Number.isInteger(index) && index >= 0 ? `-${index}` : '';
            return `${COMBOBURST_BASE_NAME}${suffix}${is2x ? '@2x' : ''}.png`;
        }

        function getComboburstStaticEntryImage(entry) {
            if (!entry) return null;
            // 编号文件也会被通用资源仓库登记成动画帧；这里必须只读取静态槽位。
            return entry.static2x || entry.static1x || null;
        }

        function isComboburstPathDeleted(path) {
            if (typeof deletedSkinTexturePaths === 'undefined') return false;
            const normalized = String(path || '')
                .replace(/\\/g, '/')
                .replace(/\.(png|jpe?g)$/i, '')
                .replace(/@2x$/i, '')
                .toLowerCase();
            if (!normalized) return false;
            if (deletedSkinTexturePaths.has(normalized)) return true;
            // 清理相反规格只表示导出时应移除旧文件；两种规格都标记才是整张图被逻辑删除。
            return deletedSkinTexturePaths.has(`${normalized}.png`) &&
                deletedSkinTexturePaths.has(`${normalized}@2x.png`);
        }

        function getComboburstRuntimeStores() {
            const stores = [{ store: skinImageStore, source: 'current' }];
            if (typeof isEditableDefaultSkinWorkspaceActive === 'function' &&
                isEditableDefaultSkinWorkspaceActive()) {
                stores.push({ store: defaultSkinImageStore, source: 'default-workspace' });
            }
            return stores;
        }

        function readComboburstStaticImage(store, logicalPath) {
            if (!store || !logicalPath || isComboburstPathDeleted(logicalPath)) return null;
            const image = getComboburstStaticEntryImage(store.get(logicalPath));
            if (!image) return null;
            return {
                image,
                path: logicalPath,
                spec: image._is2x ? '2x' : '1x'
            };
        }

        function collectComboburstNumberedSet(store, source) {
            const images = [];
            for (let index = 0; index < 1024; index++) {
                const logicalPath = `${COMBOBURST_BASE_NAME}-${index}`;
                const record = readComboburstStaticImage(store, logicalPath);
                if (!record) break;
                images.push({ ...record, index, source });
            }
            return images;
        }

        function getComboburstAssetState() {
            for (const { store, source } of getComboburstRuntimeStores()) {
                const numbered = collectComboburstNumberedSet(store, source);
                if (numbered.length > 0) {
                    return {
                        mode: 'numbered',
                        images: numbered,
                        count: numbered.length,
                        source
                    };
                }
            }

            for (const { store, source } of getComboburstRuntimeStores()) {
                const primary = readComboburstStaticImage(store, COMBOBURST_BASE_NAME);
                if (primary) {
                    return {
                        mode: 'single',
                        images: [{ ...primary, index: null, source }],
                        count: 1,
                        source
                    };
                }
            }

            return { mode: 'none', images: [], count: 0, source: null };
        }

        function getComboburstPrimaryImage() {
            for (const { store, source } of getComboburstRuntimeStores()) {
                const primary = readComboburstStaticImage(store, COMBOBURST_BASE_NAME);
                if (primary) {
                    return { ...primary, index: null, source };
                }
            }
            return null;
        }

        function getNextComboburstAlternativeIndex() {
            const state = getComboburstAssetState();
            return state.mode === 'numbered' ? state.count : 0;
        }
