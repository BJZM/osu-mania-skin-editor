// ============================================================================
// texture-font-glyphs.js - score / combo 字形贴图目标与路径解析
// 依赖：core/state.js、render/fonts.js、skin/mania-config.js
// ============================================================================

        const FONT_GLYPH_TEXTURE_GROUPS = {
            score: {
                prefixKey: 'ScorePrefix',
                title: '数字贴图',
                category: '数字贴图',
                chars: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '%']
            },
            combo: {
                prefixKey: 'ComboPrefix',
                title: '连击数字贴图',
                category: '连击数字贴图',
                chars: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
            }
        };

        function isFontGlyphTextureParam(p) {
            return !!(p && p._fontGlyph &&
                FONT_GLYPH_TEXTURE_GROUPS[p._fontGlyph.group]);
        }

        function getEffectiveScoreFontPrefix(keys) {
            const cfg = typeof getManiaConfigForKeys === 'function'
                ? getManiaConfigForKeys(keys)
                : null;
            const maniaPrefix = cfg && cfg.FontScore
                ? String(cfg.FontScore).trim()
                : '';
            if (maniaPrefix && maniaPrefix.toLowerCase().includes('score')) {
                return maniaPrefix;
            }
            const globalPrefix = skinFontsConfig && skinFontsConfig.scorePrefix
                ? String(skinFontsConfig.scorePrefix).trim()
                : '';
            if (globalPrefix && globalPrefix.toLowerCase().includes('score')) {
                return globalPrefix;
            }
            return 'score';
        }

        function getEffectiveComboFontPrefix(keys) {
            const explicit = typeof getExplicitComboFontPrefix === 'function'
                ? getExplicitComboFontPrefix(keys)
                : '';
            if (explicit) return String(explicit).trim();
            // 未显式指定 ComboPrefix / FontCombo 时，stable 与画布均沿用 score 字体。
            return getEffectiveScoreFontPrefix(keys);
        }

        function getFontGlyphEffectivePrefix(group, keys) {
            return group === 'combo'
                ? getEffectiveComboFontPrefix(keys)
                : getEffectiveScoreFontPrefix(keys);
        }

        function getFontGlyphCharacterSuffix(char) {
            if (char === '.') return 'dot';
            if (char === '%') return 'percent';
            return String(char);
        }

        function getFontGlyphTexturePath(group, char, keys) {
            const prefix = getFontGlyphEffectivePrefix(group, keys);
            const formatted = typeof formatFontPrefix === 'function'
                ? formatFontPrefix(prefix)
                : `${prefix}-`;
            return normalizeTextureLookupPath(
                `${formatted}${getFontGlyphCharacterSuffix(char)}`
            );
        }

        function getFontGlyphTextureKey(group, char) {
            const suffix = char === '.'
                ? 'Dot'
                : (char === '%' ? 'Percent' : `Digit${char}`);
            return `FontGlyph${group === 'combo' ? 'Combo' : 'Score'}${suffix}`;
        }

        function buildFontGlyphTextureParams(keys) {
            const params = [];
            for (const group of ['score', 'combo']) {
                const meta = FONT_GLYPH_TEXTURE_GROUPS[group];
                const prefix = getFontGlyphEffectivePrefix(group, keys);
                for (const char of meta.chars) {
                    const path = getFontGlyphTexturePath(group, char, keys);
                    const glyphLabel = char === '.'
                        ? '小数点 (.)'
                        : (char === '%' ? '百分号 (%)' : char);
                    const displayName = char === '.'
                        ? glyphLabel
                        : (char === '%'
                            ? glyphLabel
                            : (group === 'combo' ? `连击数字 ${glyphLabel}` : `数字 ${glyphLabel}`));
                    params.push({
                        key: getFontGlyphTextureKey(group, char),
                        zhName: displayName,
                        enName: `${meta.prefixKey}: ${prefix}`,
                        comment: path,
                        desc: group === 'combo'
                            ? `连击数字贴图路径由 ComboPrefix 决定，当前目标为 ${path}.png。`
                            : `数字贴图路径由 ScorePrefix 决定，当前目标为 ${path}.png。`,
                        category: meta.category,
                        tab: 'textures',
                        type: 'texture',
                        default: path,
                        virtual: true,
                        elementId: group === 'combo' ? 'combo' : 'hud_score_digit_0',
                        fontType: group,
                        _fontGlyph: {
                            group,
                            char,
                            prefix,
                            prefixKey: meta.prefixKey,
                            path
                        }
                    });
                }
            }
            return params;
        }

        function resolveFontGlyphTextureParam(keys, p) {
            if (!isFontGlyphTextureParam(p)) return null;
            const group = p._fontGlyph.group;
            const char = p._fontGlyph.char;
            const expectedPath = p._fontGlyph.path || p.default;
            const img = typeof getSkinFontImage === 'function'
                ? getSkinFontImage(group, char, keys)
                : null;
            if (img) {
                return {
                    img,
                    name: expectedPath || img._candKey || '',
                    state: 'ok'
                };
            }
            return {
                img: null,
                name: expectedPath || '',
                state: 'missing'
            };
        }

        function resolveFontGlyphTextureFrames(keys, p) {
            const resolved = resolveFontGlyphTextureParam(keys, p);
            if (!resolved || resolved.state !== 'ok' || !resolved.img) return null;
            return [resolved.img];
        }

        function deriveFontPrefixFromGlyphPath(path) {
            const normalized = normalizeTextureLookupPath(path);
            const match = normalized.match(
                /^(.*)-(?:[0-9]|dot|period|percent|precent|comma|x)$/i
            );
            return match && match[1] ? match[1] : '';
        }

        function applyFontGlyphPrefixFromExistingTexture(p, selectedPath, keys) {
            if (!isFontGlyphTextureParam(p)) return false;
            const prefix = deriveFontPrefixFromGlyphPath(selectedPath);
            if (!prefix) return false;
            const group = p._fontGlyph.group;
            const prefixKey = group === 'combo' ? 'ComboPrefix' : 'ScorePrefix';
            if (typeof onParamChange === 'function') {
                onParamChange(prefixKey, prefix);
            } else {
                if (typeof recordSkinUndoBeforeChange === 'function') {
                    recordSkinUndoBeforeChange(
                        `引用${group === 'combo' ? '连击' : '数字'}字体贴图组: ${prefix}`,
                        { force: true }
                    );
                }
                if (group === 'combo') {
                    skinFontsConfig.comboPrefix = prefix;
                    skinFontsConfig.hasExplicitComboPrefix = true;
                } else {
                    skinFontsConfig.scorePrefix = prefix;
                }
            }
            return true;
        }

        async function copyExistingTextureToFontGlyph(p, source, keys) {
            if (!isFontGlyphTextureParam(p) || !source ||
                typeof textureUploadUi === 'undefined' || !textureUploadUi ||
                typeof textureUploadUi.applyEditedTexture !== 'function') {
                return false;
            }
            const sourceFrame = source.image || (source.frames && source.frames[0]);
            if (!sourceFrame) return false;
            const width = sourceFrame.naturalWidth || sourceFrame.videoWidth || sourceFrame.width || 0;
            const height = sourceFrame.naturalHeight || sourceFrame.videoHeight || sourceFrame.height || 0;
            if (!(width > 0) || !(height > 0)) return false;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(sourceFrame, 0, 0);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (!blob) return false;
            const arrayBuffer = await blob.arrayBuffer();
            const targetPath = p._fontGlyph.path || p.default;
            const fileName = `${targetPath.split('/').pop() || p.key}.png`;
            const file = new File([blob], fileName, { type: 'image/png' });
            return textureUploadUi.applyEditedTexture(
                file,
                arrayBuffer,
                canvas,
                !!source.is2x,
                targetPath,
                p.key,
                p.key,
                null
            );
        }

        async function applyExistingTextureToFontGlyph(p, selectedPath, keys) {
            if (!isFontGlyphTextureParam(p) || !selectedPath) return false;
            const sources = typeof collectExistingTextureSources === 'function'
                ? collectExistingTextureSources()
                : [];
            const source = sources.find((item) =>
                normalizeSkinKey(item.path) === normalizeSkinKey(selectedPath)
            );
            if (applyFontGlyphPrefixFromExistingTexture(p, selectedPath, keys)) {
                return true;
            }
            if (!source) return false;
            return copyExistingTextureToFontGlyph(p, source, keys);
        }
