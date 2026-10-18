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

            const keyImageMatch = String(p.key).match(/^KeyImage(\d+)$/i);
            const keyImageColumn = p._trackLookup === LML.KeyImage
                ? p._trackCol
                : (keyImageMatch ? Number(keyImageMatch[1]) : null);
            if (keyImageColumn != null &&
                Number.isFinite(Number(keyImageColumn)) &&
                typeof preserveTrackKeyImageDownBeforeKeyImageEdit === 'function') {
                preserveTrackKeyImageDownBeforeKeyImageEdit(
                    keyCount,
                    Number(keyImageColumn),
                    { syncInput: true }
                );
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

            return { path: normalizedPath, aliases };
        }
