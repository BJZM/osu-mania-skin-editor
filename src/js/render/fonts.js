// ============================================================================
// fonts.js - 皮肤字体贴图查找、重叠量与数字绘制
// 依赖：skin/mania-config.js、parser/skin-assets.js
// ============================================================================

        function getFontCharacterCandidates(prefix, char) {
            if (!prefix) return [];
            const rawPrefix = prefix.trim();
            const formatted = formatFontPrefix(rawPrefix);
            const cands = [];
            const ch = String(char);

            if (ch >= '0' && ch <= '9') {
                cands.push(`${formatted}${ch}`);
                if (formatted.endsWith('-') && formatted.length > 1) {
                    cands.push(`${rawPrefix}${ch}`);
                }
            } else if (ch === '%') {
                cands.push(`${formatted}percent`);
                cands.push(`${formatted}%`);
                cands.push(`${rawPrefix}percent`);
                cands.push(`${formatted}precent`);
                cands.push(`${rawPrefix}precent`);
            } else if (ch === '.') {
                cands.push(`${formatted}dot`);
                cands.push(`${formatted}period`);
                cands.push(`${formatted}.`);
                cands.push(`${rawPrefix}dot`);
            } else if (ch === ',') {
                cands.push(`${formatted}comma`);
                cands.push(`${formatted},`);
                cands.push(`${rawPrefix}comma`);
            } else if (ch.toLowerCase() === 'x') {
                cands.push(`${formatted}x`);
                cands.push(`${formatted}X`);
                cands.push(`${rawPrefix}x`);
            } else {
                cands.push(`${formatted}${ch}`);
                cands.push(`${rawPrefix}${ch}`);
            }
            return cands;
        }

        // 根据 osu! wiki 规范多级回退获取数字/字符贴图
        // 核心规则：Combo 与 Score 属于同一套字体族体系，当皮肤未提供某类前缀时，必须优先在用户皮肤中回退共享同族字体，均无时才回退默认皮肤
        function getSkinFontImage(fontType, char, keyCount) {
            const maniaCfg = (keyCount != null) ? getManiaConfigForKeys(keyCount) : null;
            const prefixesToTry = [];

            // 连击数字 (combo) 字体贴图读取规则：
            //   1. ini 显式指定了连击字体 (FontCombo / [Fonts] Combo) → 优先按「指定的那一组贴图」读取，
            //      此时不再要求名字必须含 score（作者可以指定 combo-0..9 / mania-combo-0..9 等任意前缀）。
            //   2. 未指定 → 与 score 共用同一套字体贴图（多级回退）。
            // 分数 / 准度 (score / accuracy) 仍严格要求名字包含 score 的贴图，其余名字一律不读取。
            if (fontType === 'combo') {
                const explicitComboPrefix = getExplicitComboFontPrefix(keyCount);
                if (explicitComboPrefix && !prefixesToTry.includes(explicitComboPrefix)) {
                    prefixesToTry.push(explicitComboPrefix);
                }
                // 回退：与 score 使用同一套字体贴图
                if (maniaCfg && maniaCfg.FontScore && maniaCfg.FontScore.toLowerCase().includes('score')) {
                    if (!prefixesToTry.includes(maniaCfg.FontScore)) prefixesToTry.push(maniaCfg.FontScore);
                }
                if (skinFontsConfig.scorePrefix && skinFontsConfig.scorePrefix.toLowerCase().includes('score')) {
                    if (!prefixesToTry.includes(skinFontsConfig.scorePrefix)) prefixesToTry.push(skinFontsConfig.scorePrefix);
                }
                if (!prefixesToTry.includes('score')) prefixesToTry.push('score');
            } else if (fontType === 'score' || fontType === 'accuracy') {
                // 1. [Mania] 覆盖: FontScore (若名字含 score)
                if (maniaCfg && maniaCfg.FontScore && maniaCfg.FontScore.toLowerCase().includes('score')) {
                    if (!prefixesToTry.includes(maniaCfg.FontScore)) prefixesToTry.push(maniaCfg.FontScore);
                }
                // 2. [Fonts] ScorePrefix (若配置了且含 score)
                if (skinFontsConfig.scorePrefix && skinFontsConfig.scorePrefix.toLowerCase().includes('score')) {
                    if (!prefixesToTry.includes(skinFontsConfig.scorePrefix)) prefixesToTry.push(skinFontsConfig.scorePrefix);
                }
                // 3. 基础 score 前缀
                if (!prefixesToTry.includes('score')) prefixesToTry.push('score');
            } else if (fontType === 'hitcircle') {
                if (skinFontsConfig.hitCirclePrefix) prefixesToTry.push(skinFontsConfig.hitCirclePrefix);
                if (!prefixesToTry.includes('default')) prefixesToTry.push('default');
            }

            // 【第一阶段：严格优先从用户导入的皮肤 (skinImageStore & skinFallbackImageStore) 查找】
            // 必须在遍历完所有用户候选前缀后，才能判断用户是否提供了该字符。绝不能中途回退到默认皮肤！
            for (const prefix of prefixesToTry) {
                const candidates = getFontCharacterCandidates(prefix, char);
                for (const cand of candidates) {
                    const userImg = getSkinAnimationFromStore(skinImageStore, cand) ||
                                    getSkinAnimationFromStore(skinFallbackImageStore, cand);
                    if (userImg) {
                        // 特殊处理百分号 (%)：
                        // a) 1x1 透明图：用于彻底隐去百分号，仅展示纯数字准度
                        // b) 超宽透明图（可达数百乃至上千像素）：作为水平推移垫片
                        if (char === '%') {
                            if (userImg.width <= 1 && userImg.height <= 1) {
                                return { _isBlankPlaceholder: true, width: 0, height: 0, _candKey: cand, _prefixUsed: prefix };
                            }
                            userImg._candKey = cand;
                            userImg._prefixUsed = prefix;
                            return userImg;
                        }

                        // 常规字符：过滤 1x1 占位图及极端异常宽高比
                        if (userImg.width > 1 && userImg.height > 1) {
                            const aspect = userImg.width / userImg.height;
                            if (aspect <= 3.5 && aspect >= 0.05) {
                                userImg._candKey = cand;
                                userImg._prefixUsed = prefix;
                                return userImg;
                            }
                        }
                    }
                }
            }

            // 【第二阶段：仅当用户皮肤完全没有提供该字符时，才回退到官方默认皮肤 (defaultSkinImageStore)】
            for (const prefix of prefixesToTry) {
                const candidates = getFontCharacterCandidates(prefix, char);
                for (const cand of candidates) {
                    const defImg = getSkinAnimationFromStore(defaultSkinImageStore, cand);
                    if (defImg && defImg.width > 0 && defImg.height > 0) {
                        defImg._candKey = cand;
                        defImg._prefixUsed = prefix;
                        return defImg;
                    }
                }
            }
            return null;
        }

        // ===== score-percent 透明垫片 =====
        // osu!stable 没有独立的准度 X 坐标参数；皮肤作者通过修改 score-percent.png 的宽度，
        // 利用准度右侧固定对齐来向左推移整个准度块。这里统一提供读取、名称解析与位移换算。
        function getScorePercentTextureName(keyCount) {
            const percentImg = getSkinFontImage('score', '%', keyCount);
            if (percentImg && percentImg._candKey) return percentImg._candKey;

            const cfg = (keyCount != null) ? getManiaConfigForKeys(keyCount) : null;
            const prefix = (cfg && cfg.FontScore) || skinFontsConfig.scorePrefix || 'score';
            return `${String(prefix).replace(/@2x$/i, '')}-percent`;
        }

        function getScorePercentPaddingWidth(keyCount) {
            const percentImg = getSkinFontImage('score', '%', keyCount);
            if (!percentImg || percentImg._isBlankPlaceholder) return 1;

            const rawWidth = Number(percentImg.width) || 0;
            const nativeWidth = percentImg._is2x ? (rawWidth / 2) : rawWidth;
            return Math.max(1, Math.min(2000, Math.round(nativeWidth)));
        }

        function getScorePercentVisibility(keyCount) {
            const percentImg = getSkinFontImage('score', '%', keyCount);
            if (!percentImg || percentImg._isBlankPlaceholder) return false;
            return !isFullyTransparentImage(percentImg, 64, 16);
        }

        function getScorePercentPaddingShiftPx(width, scale768) {
            const w = Math.max(0, Number(width) || 0);
            const scale = Math.max(0, Number(scale768) || 0);
            return w * 0.576 * scale;
        }

        // 根据 osu! wiki 获取字符重叠量 (单位：1x 像素)
        function getSkinFontOverlap(fontType, keyCount) {
            const maniaCfg = (keyCount != null) ? getManiaConfigForKeys(keyCount) : null;
            if (fontType === 'combo') {
                if (maniaCfg && maniaCfg.ComboOverlap != null) return maniaCfg.ComboOverlap;
                if (skinFontsConfig.comboOverlap != null && skinFontsConfig.hasExplicitComboOverlap) return skinFontsConfig.comboOverlap;
                if (maniaCfg && maniaCfg.ScoreOverlap != null) return maniaCfg.ScoreOverlap;
                if (skinFontsConfig.scoreOverlap != null) return skinFontsConfig.scoreOverlap;
                if (skinFontsConfig.comboOverlap != null) return skinFontsConfig.comboOverlap;
                return 0;
            } else if (fontType === 'score' || fontType === 'accuracy') {
                if (maniaCfg && maniaCfg.ScoreOverlap != null) return maniaCfg.ScoreOverlap;
                if (skinFontsConfig.scoreOverlap != null && skinFontsConfig.hasExplicitScoreOverlap) return skinFontsConfig.scoreOverlap;
                if (maniaCfg && maniaCfg.ComboOverlap != null) return maniaCfg.ComboOverlap;
                if (skinFontsConfig.comboOverlap != null) return skinFontsConfig.comboOverlap;
                if (skinFontsConfig.scoreOverlap != null) return skinFontsConfig.scoreOverlap;
                return 0;
            } else if (fontType === 'hitcircle') {
                if (skinFontsConfig.hitCircleOverlap != null) return skinFontsConfig.hitCircleOverlap;
                return -2;
            }
            return 0;
        }

        // 通用数字/文本绘制方法 (对齐 osu!lazer / stable: 统一按基准数字 '0' 的高度等比缩放并底对齐 baseline)
        function drawSkinNumber(ctx, text, fontType = 'score', x, y, charH, align = 'center', keyCount = null) {
            if (text == null || text === '') return 0;
            const str = String(text);
            const overlapVal = getSkinFontOverlap(fontType, keyCount);

            // 1. 获取参考基准字符 (以 '0' 为基准) 的原生高度，统一整个字体的等比缩放率
            let baseImg = getSkinFontImage(fontType, '0', keyCount);
            let baseNativeH = 30;
            if (baseImg && baseImg.height > 0) {
                baseNativeH = baseImg._is2x ? baseImg.height / 2 : baseImg.height;
            }
            const fontScale = (baseNativeH > 0) ? (charH / baseNativeH) : (charH / 30);

            const chars = [];
            let totalWidth = 0;

            for (let i = 0; i < str.length; i++) {
                const ch = str[i];
                const img = getSkinFontImage(fontType, ch, keyCount);
                let charW = 0;
                let charHActual = charH;
                if (img) {
                    if (img._isBlankPlaceholder) {
                        charW = 0;
                        charHActual = 0;
                    } else {
                        const is2x = img._is2x || false;
                        const nativeW = is2x ? img.width / 2 : img.width;
                        const nativeH = is2x ? img.height / 2 : img.height;
                        charW = nativeW * fontScale;
                        charHActual = nativeH * fontScale;
                        totalWidth += charW;
                    }
                } else {
                    charW = charH * 0.55;
                    charHActual = charH;
                    totalWidth += charW;
                }
                chars.push({ ch, img, charW, charHActual });
            }

            const scaledOverlap = overlapVal * fontScale;
            if (chars.length > 1) {
                totalWidth -= (chars.length - 1) * scaledOverlap;
            }
            totalWidth = Math.max(0, totalWidth);

            let startX = x;
            if (align === 'center') {
                startX = x - totalWidth / 2;
            } else if (align === 'right') {
                startX = x - totalWidth;
            }

            const baselineY = y + charH / 2; // 基准底部对齐线

            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            for (let i = 0; i < chars.length; i++) {
                const { ch, img, charW, charHActual } = chars[i];

                if (img) {
                    if (!img._isBlankPlaceholder && img.width > 0 && img.height > 0) {
                        // 底部基准线对齐 (如点号 dot、百分号 percent、数字底部一致对齐)
                        const drawY = baselineY - charHActual;
                        ctx.drawImage(img, startX, drawY, charW, charHActual);
                    }
                } else {
                    ctx.font = `bold ${Math.round(charH * 0.8)}px sans-serif`;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(ch, startX, baselineY - charH * 0.15);
                }
                startX += (charW - scaledOverlap);
            }
            ctx.restore();
            return totalWidth;
        }
