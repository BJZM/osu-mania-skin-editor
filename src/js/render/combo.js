// ============================================================================
// combo.js - 连击数字与连击动画绘制
// 依赖：render/fonts.js
// ============================================================================

        function drawCoverImage(ctx, img, targetW, targetH) {
            const imgW = img.videoWidth || img.naturalWidth || img.width;
            const imgH = img.videoHeight || img.naturalHeight || img.height;
            if (!imgW || !imgH || !targetW || !targetH) return;
            const targetRatio = targetW / targetH;
            const imgRatio = imgW / imgH;
            let renderW, renderH, offsetX, offsetY;

            if (imgRatio > targetRatio) {
                renderH = targetH;
                renderW = imgW * (targetH / imgH);
                offsetX = (targetW - renderW) / 2;
                offsetY = 0;
            } else {
                renderW = targetW;
                renderH = imgH * (targetW / imgW);
                offsetX = 0;
                offsetY = (targetH - renderH) / 2;
            }

            ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
        }

        const COMBO_HOLD_COLOUR_TRANSITION_MS = 300;
        const COMBO_HOLD_COLOUR_TAIL_WARNING_MS = 100;
        const COMBO_HOLD_COLOUR_WHITE = { r: 255, g: 255, b: 255, a: 255 };

        function normalizeComboHoldColour(color) {
            const readChannel = (value) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? Math.max(0, Math.min(255, parsed)) : 255;
            };
            return {
                r: readChannel(color?.r),
                g: readChannel(color?.g),
                b: readChannel(color?.b),
                a: readChannel(color?.a),
            };
        }

        function resetComboHoldColourTint() {
            comboAnimState.holdColourActive = false;
            comboAnimState.holdColourCurrent = { ...COMBO_HOLD_COLOUR_WHITE };
            comboAnimState.holdColourTransitionStartTime = -1000;
            comboAnimState.holdColourTailWarningActive = false;
        }

        function isComboHoldColourTransitionActive(now = performance.now()) {
            if (!comboAnimState.holdColourActive) {
                return false;
            }
            const duration = comboAnimState.holdColourTailWarningActive
                ? COMBO_HOLD_COLOUR_TAIL_WARNING_MS
                : COMBO_HOLD_COLOUR_TRANSITION_MS;
            const elapsed = now - comboAnimState.holdColourTransitionStartTime;
            return elapsed >= 0 && elapsed < duration;
        }

        function getComboHoldColourTint(keys, isHolding, now = performance.now(), options = {}) {
            const state = comboAnimState;
            const active = !!isHolding;
            const cfgHold = getManiaSkinConfig(keys, LML.ColourHold)?.value || { r: 255, g: 191, b: 51, a: 255 };
            const holdColour = normalizeComboHoldColour(cfgHold);

            if (!active) {
                state.holdColourActive = false;
                state.holdColourTailWarningActive = false;
                state.holdColourCurrent = { ...COMBO_HOLD_COLOUR_WHITE };
                state.holdColourTransitionStartTime = -1000;
                return state.holdColourCurrent;
            }

            // 按住：White -> ColourHold -> White，共 300ms；
            // 尾部预警：同样的往返脉冲压缩到 100ms。连续衔接不重新开始按住脉冲。
            if (!state.holdColourActive) {
                state.holdColourActive = true;
                state.holdColourTailWarningActive = false;
                state.holdColourTransitionStartTime = now;
            }
            if (options.isTailWarning && !state.holdColourTailWarningActive) {
                state.holdColourTailWarningActive = true;
                state.holdColourTransitionStartTime = now;
            }

            const duration = state.holdColourTailWarningActive
                ? COMBO_HOLD_COLOUR_TAIL_WARNING_MS
                : COMBO_HOLD_COLOUR_TRANSITION_MS;
            const elapsed = now - state.holdColourTransitionStartTime;
            if (elapsed <= 0 || elapsed >= duration) {
                state.holdColourCurrent = { ...COMBO_HOLD_COLOUR_WHITE };
                if (!options.isTailWarning && state.holdColourTailWarningActive) {
                    state.holdColourTailWarningActive = false;
                }
            } else {
                const progress = elapsed / duration;
                const direction = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
                state.holdColourCurrent = {
                    r: Math.round(COMBO_HOLD_COLOUR_WHITE.r + (holdColour.r - COMBO_HOLD_COLOUR_WHITE.r) * direction),
                    g: Math.round(COMBO_HOLD_COLOUR_WHITE.g + (holdColour.g - COMBO_HOLD_COLOUR_WHITE.g) * direction),
                    b: Math.round(COMBO_HOLD_COLOUR_WHITE.b + (holdColour.b - COMBO_HOLD_COLOUR_WHITE.b) * direction),
                    a: Math.round(COMBO_HOLD_COLOUR_WHITE.a + (holdColour.a - COMBO_HOLD_COLOUR_WHITE.a) * direction),
                };
            }
            return state.holdColourCurrent;
        }

        function renderComboDigits(str, centerX, centerY, keys, scale768, scaleX, scaleY, alpha, isBreakGhost, holdColour = null) {
            let digits = [];
            let totalWidth = 0;
            const overlapVal = getSkinFontOverlap('combo', keys);
            // 贴图字体基于 768p 原生坐标缩放 (scale768 = canvas.height / 768)
            const scaledOverlap = overlapVal * scale768 * scaleX;

            for (let i = 0; i < str.length; i++) {
                const digitImg = getSkinFontImage('combo', str[i], keys);
                digits.push(digitImg);
                if (digitImg && digitImg.width > 0 && digitImg.height > 0) {
                    const is2x = digitImg._is2x || false;
                    const nativeW = is2x ? digitImg.width / 2 : digitImg.width;
                    const charW = nativeW * scale768 * scaleX;
                    totalWidth += charW;
                } else {
                    totalWidth += 24 * scale768 * scaleX;
                }
            }

            if (digits.length > 1) {
                totalWidth -= (digits.length - 1) * scaledOverlap;
            }
            totalWidth = Math.max(0, totalWidth);

            let curX = centerX - totalWidth / 2;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
            if (isBreakGhost) {
                ctx.globalCompositeOperation = 'lighter';
            }

            for (let i = 0; i < str.length; i++) {
                const digitImg = digits[i];
                if (digitImg && digitImg.width > 0 && digitImg.height > 0) {
                    const is2x = digitImg._is2x || false;
                    const nativeW = is2x ? digitImg.width / 2 : digitImg.width;
                    const nativeH = is2x ? digitImg.height / 2 : digitImg.height;
                    const charW = nativeW * scale768 * scaleX;
                    const charH = nativeH * scale768 * scaleY;

                    if (isBreakGhost) {
                        const cfgCol = getManiaSkinConfig(keys, LML.ComboBreakColour)?.value || { r: 255, g: 0, b: 0 };
                        const tinted = getTintedDigitCanvas(digitImg, cfgCol);
                        ctx.drawImage(tinted, curX, centerY - charH / 2, charW, charH);
                    } else if (holdColour) {
                        const tinted = getTintedDigitCanvas(digitImg, holdColour);
                        ctx.drawImage(tinted, curX, centerY - charH / 2, charW, charH);
                    } else {
                        ctx.drawImage(digitImg, curX, centerY - charH / 2, charW, charH);
                    }
                    curX += (charW - scaledOverlap);
                } else {
                    const fallbackH = 34 * scale768 * scaleY;
                    const fallbackW = 24 * scale768 * scaleX;
                    ctx.font = `bold ${Math.round(fallbackH * 0.9)}px sans-serif`;
                    if (isBreakGhost) {
                        ctx.fillStyle = '#ff2222';
                    } else if (holdColour) {
                        ctx.fillStyle = `rgba(${holdColour.r}, ${holdColour.g}, ${holdColour.b}, ${holdColour.a / 255})`;
                    } else {
                        ctx.fillStyle = '#ffffff';
                    }
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(str[i], curX + fallbackW / 2, centerY);
                    curX += (fallbackW - scaledOverlap);
                }
            }
            ctx.restore();
        }

        // osu!lazer 连击数渲染引擎 (对齐 LegacyManiaComboCounter: 768p 分辨率基准缩放 + 1.4x 纵向拉伸弹跳 + 增长透明度恒定 1.0 + 断连红色爆破扩散与遮罩)
        function drawCombo(combo, centerX, centerY, keys, scale768, isHolding = false, trackStartX = null, trackWidth = null, holdDetails = null) {
            const now = performance.now();
            const holdColour = getComboHoldColourTint(keys, isHolding, now, {
                isTailWarning: !!holdDetails?.isTailWarning
            });

            // 1. 断连爆破残影动画与遮罩闪烁 (对齐 lazer LegacyManiaComboCounter.onCountRolling: 膨胀扩散淡出)
            const breakDuration = 350;
            const breakElapsed = now - comboAnimState.breakStartTime;
            if (breakElapsed >= 0 && breakElapsed < breakDuration && comboAnimState.breakCount > 0) {
                const bt = breakElapsed / breakDuration;
                const easeOut = 1 - Math.pow(1 - bt, 2);
                const ghostScale = 1.0 + 2.8 * easeOut;
                const ghostAlpha = Math.max(0, 0.85 * (1.0 - bt));
                const ghostStr = comboAnimState.breakCount.toString();

                if (trackStartX !== null && trackWidth !== null) {
                    const cfgCol = getManiaSkinConfig(keys, LML.ComboBreakColour)?.value || { r: 255, g: 0, b: 0 };
                    ctx.save();
                    ctx.fillStyle = `rgba(${cfgCol.r}, ${cfgCol.g}, ${cfgCol.b}, ${ghostAlpha * 0.18})`;
                    ctx.fillRect(trackStartX, 0, trackWidth, canvas.height);
                    ctx.restore();
                }

                renderComboDigits(ghostStr, centerX, centerY, keys, scale768, ghostScale, ghostScale, ghostAlpha, true, null);
            }

            if (combo <= 0) return;

            // 2. 连击数增长动画 (对齐 lazer LegacyManiaComboCounter.onCountIncrement: ScaleTo(1f, 1.4f) -> ScaleTo(1f, 300, Easing.Out))
            // 注意：osu!lazer 中连击数增长只有纵向弹性缩放，透明度恒定为 1.0，完全无闪烁或淡入淡出变化
            const incElapsed = now - comboAnimState.incStartTime;
            let scaleY = 1.0;
            if (incElapsed >= 0 && incElapsed < 300) {
                const t = incElapsed / 300;
                const easeOut = 1 - Math.pow(1 - t, 3);
                scaleY = 1.4 - 0.4 * easeOut;
            }

            renderComboDigits(combo.toString(), centerX, centerY, keys, scale768, 1.0, scaleY, 1.0, false, holdColour);
        }
