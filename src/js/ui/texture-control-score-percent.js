// ============================================================================
// texture-control-score-percent.js - 准度透明垫片贴图控制
// 从 texture-controls.js 按职责拆分。
// ============================================================================

        function clampScorePercentPaddingWidth(value) {
            const num = Math.round(Number(value));
            if (!Number.isFinite(num)) return 1;
            return Math.max(1, Math.min(2000, num));
        }

        function dataUrlToArrayBuffer(dataUrl) {
            const base64 = String(dataUrl).split(',')[1] || '';
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        }

        function getScorePercentVisibleGlyphSource(keys, textureName) {
            if (scorePercentSourceImages.has(textureName)) {
                return scorePercentSourceImages.get(textureName);
            }

            const current = getSkinFontImage('score', '%', keys);
            let source = (current && !current._isBlankPlaceholder && !isFullyTransparentImage(current, 64, 16))
                ? current
                : null;
            if (!source) {
                source = getSkinAnimationFromStore(defaultSkinImageStore, 'score-percent') ||
                    getSkinAnimationFromStore(defaultSkinFallbackStore, 'score-percent');
            }
            if (source) scorePercentSourceImages.set(textureName, source);
            return source;
        }

        function writeScorePercentTexture(canvas, textureName, is2x) {
            canvas._isRootLevel = !textureName.includes('/');
            canvas._candKey = textureName;

            saveSkinAssetToStore(skinImageStore, textureName, canvas, is2x, canvas._isRootLevel, true);
            const basename = textureName.split('/').pop();
            if (basename) {
                saveSkinAssetToStore(skinFallbackImageStore, basename, canvas, is2x, canvas._isRootLevel, true);
            }

            const arrayBuffer = dataUrlToArrayBuffer(canvas.toDataURL('image/png'));
            const currentSuffix = is2x ? '@2x.png' : '.png';
            const oppositeSuffix = is2x ? '.png' : '@2x.png';
            const exportFilename = `${textureName}${currentSuffix}`;
            userReplacedTextures.set(exportFilename, arrayBuffer);
            if (exportFilename !== exportFilename.toLowerCase()) {
                userReplacedTextures.set(exportFilename.toLowerCase(), arrayBuffer);
            }
            userReplacedTextures.delete(`${textureName}${oppositeSuffix}`);
            userReplacedTextures.delete(`${textureName.toLowerCase()}${oppositeSuffix}`);
        }

        // stable 导出包里不需要额外 ini 键，位置完全由 score-percent 贴图宽度决定。
        // 一旦调整宽度，就进入透明垫片模式；重新显示百分号必须恢复原始贴图。

        function setScorePercentPaddingWidth(value, keyCount = null) {
            const width = clampScorePercentPaddingWidth(value);
            const keys = (keyCount != null) ? keyCount : getActiveKeyCount();
            const textureName = getScorePercentTextureName(keys);

            // 覆盖透明垫片前保留原始贴图，供“显示百分号”开关恢复。
            getScorePercentVisibleGlyphSource(keys, textureName);

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = 1;
            canvas._is2x = false;
            writeScorePercentTexture(canvas, textureName, false);
            return width;
        }

        function restoreOriginalScorePercentTexture(keyCount = null) {
            const keys = (keyCount != null) ? keyCount : getActiveKeyCount();
            const textureName = getScorePercentTextureName(keys);
            const source = getScorePercentVisibleGlyphSource(keys, textureName);

            const restoreSuffixes = ['.png', '@2x.png'];
            for (const suffix of restoreSuffixes) {
                userReplacedTextures.delete(`${textureName}${suffix}`);
                userReplacedTextures.delete(`${textureName.toLowerCase()}${suffix}`);
            }

            if (!source) {
                // 没有可恢复的原始字形时，删除透明覆盖，让游戏回退到默认皮肤。
                saveSkinAssetToStore(skinImageStore, textureName, null, false, !textureName.includes('/'), true);
                const basename = textureName.split('/').pop();
                if (basename) {
                    saveSkinAssetToStore(skinFallbackImageStore, basename, null, false, !textureName.includes('/'), true);
                }
                return;
            }

            const srcW = source.naturalWidth || source.width || 1;
            const srcH = source.naturalHeight || source.height || 1;
            const canvas = document.createElement('canvas');
            canvas.width = srcW;
            canvas.height = srcH;
            canvas.getContext('2d').drawImage(source, 0, 0);
            canvas._is2x = !!source._is2x;
            writeScorePercentTexture(canvas, textureName, canvas._is2x);
        }

        // 8.5 构建「贴图参数」控件 (缩略图 + 路径输入 + 上传下拉)
        // 普通卡片与「逐轨道分组框」内的每一行共用此实现，保证两者功能与样式完全一致。
        // hoverHost: 上传菜单展开时需要提升 z-index 的容器 (普通卡片传卡片本身，逐轨行传所属分组框)
