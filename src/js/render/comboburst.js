// ============================================================================
// comboburst.js - 连击提示图里程碑、轮播与 stable 风格演出
// 依赖：render/comboburst-assets.js、core/state.js、skin/mania-config.js
// ============================================================================

        const COMBOBURST_DURATION_MS = 1400;
        const COMBOBURST_FADE_IN_MS = 250;
        const COMBOBURST_FADE_OUT_START_MS = 400;

        const comboburstRuntimeState = {
            lastCombo: 0,
            sequentialIndex: 0,
            active: []
        };

        function clearComboburstRuntimeEffects() {
            comboburstRuntimeState.lastCombo = 0;
            comboburstRuntimeState.active.length = 0;
        }

        function setComboburstPreviewEnabled(enabled) {
            isComboburstPreviewEnabled = !!enabled;
            const toggle = document.getElementById('comboburstPreviewToggle');
            if (toggle) toggle.checked = isComboburstPreviewEnabled;
            if (!isComboburstPreviewEnabled) {
                clearComboburstRuntimeEffects();
            }
            if (typeof drawFrame === 'function') drawFrame();
        }

        function normalizeComboBurstBoolean(value) {
            return value === true || value === 1 || value === '1' || value === 'true';
        }

        function getComboburstRandomSetting() {
            const general = currentSkinMetadata && currentSkinMetadata.general;
            return normalizeComboBurstBoolean(general && general.ComboBurstRandom);
        }

        function getComboburstStyle(keys) {
            const result = getManiaSkinConfig(keys, LML.ComboBurstStyle);
            const style = result && Number(result.value);
            return (style >= 0 && style <= 2) ? style : 1;
        }

        function selectComboburstImage(images) {
            if (!images || images.length === 0) return null;
            if (images.length === 1) return images[0];
            if (getComboburstRandomSetting()) {
                return images[Math.floor(Math.random() * images.length)];
            }
            const selected = images[comboburstRuntimeState.sequentialIndex % images.length];
            comboburstRuntimeState.sequentialIndex =
                (comboburstRuntimeState.sequentialIndex + 1) % images.length;
            return selected;
        }

        function selectComboburstSide(style) {
            if (style === 0) return 'left';
            if (style === 1) return 'right';
            return Math.random() < 0.5 ? 'left' : 'right';
        }

        function getComboburstEffectClock() {
            return (isPlaying || isPreviewMode)
                ? { now: effectAnimClockMs, mode: 'effect' }
                : { now: performance.now(), mode: 'real' };
        }

        function triggerComboburst(milestone, options = {}) {
            if (!isComboburstPreviewEnabled) return false;
            const state = getComboburstAssetState();
            if (state.mode === 'none') return false;

            const image = selectComboburstImage(state.images);
            if (!image || !image.image) return false;

            const keys = Math.max(1, Number(options.keys) || getActiveKeyCount());
            const style = options.style != null ? options.style : getComboburstStyle(keys);
            const clock = getComboburstEffectClock();
            comboburstRuntimeState.active.push({
                startedAt: clock.now,
                clockMode: clock.mode,
                side: selectComboburstSide(style),
                image: image.image,
                milestone: Number(milestone) || 100
            });
            return true;
        }

        function triggerComboburstPreview(milestone = 100, options = {}) {
            const triggered = triggerComboburst(milestone, options);
            if (triggered && typeof drawFrame === 'function') drawFrame();
            return triggered;
        }

        function syncComboburstPlayback(combo, keys) {
            const current = Math.max(0, Number(combo) || 0);
            const previous = comboburstRuntimeState.lastCombo;
            let triggered = 0;

            if (isPlaying && current > previous) {
                const firstMilestone = Math.floor(previous / 100) * 100 + 100;
                for (let milestone = firstMilestone; milestone <= current; milestone += 100) {
                    if (milestone < 100) continue;
                    if (triggerComboburst(milestone, { keys })) triggered++;
                }
            }

            comboburstRuntimeState.lastCombo = current;
            return triggered;
        }

        function comboburstEffectElapsed(effect) {
            const clockNow = effect.clockMode === 'effect' ? effectAnimClockMs : performance.now();
            return Math.max(0, clockNow - effect.startedAt);
        }

        function drawMirroredComboburst(ctx, image, x, y, width, height, alpha) {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x + width, y);
            ctx.scale(-1, 1);
            ctx.drawImage(image, 0, 0, width, height);
            ctx.restore();
        }

        function getComboburstHorizontalPosition(segment, side, drawWidth, edgeInset, movement) {
            if (side === 'left') {
                return segment.x - drawWidth + edgeInset + movement;
            }
            // 右侧镜像图的 x 是绘制框左边界，不能再减一次图宽。
            return segment.x + segment.width - edgeInset - movement;
        }

        function drawComboburstEffects(context) {
            if (!isComboburstPreviewEnabled) {
                comboburstRuntimeState.active.length = 0;
                return false;
            }
            if (!comboburstRuntimeState.active.length) return false;
            const { ctx, canvas, stageSegments, scale768 } = context;
            if (!ctx || !canvas || !stageSegments || stageSegments.length === 0) return false;

            let hasActive = false;
            for (let i = comboburstRuntimeState.active.length - 1; i >= 0; i--) {
                const effect = comboburstRuntimeState.active[i];
                const elapsed = comboburstEffectElapsed(effect);
                if (elapsed >= COMBOBURST_DURATION_MS) {
                    comboburstRuntimeState.active.splice(i, 1);
                    continue;
                }
                hasActive = true;

                const image = effect.image;
                const imageWidth = image.naturalWidth || image.width || 0;
                const imageHeight = image.naturalHeight || image.height || 0;
                if (imageWidth <= 0 || imageHeight <= 0) continue;

                const is2x = !!image._is2x;
                const nativeWidth = is2x ? imageWidth / 2 : imageWidth;
                const nativeHeight = is2x ? imageHeight / 2 : imageHeight;
                const drawWidth = nativeWidth * scale768;
                const drawHeight = nativeHeight * scale768;
                const segment = effect.side === 'left'
                    ? stageSegments[0]
                    : stageSegments[stageSegments.length - 1];

                const fadeIn = Math.min(1, elapsed / COMBOBURST_FADE_IN_MS);
                const fadeOut = elapsed <= COMBOBURST_FADE_OUT_START_MS
                    ? 1
                    : Math.max(0, 1 - (elapsed - COMBOBURST_FADE_OUT_START_MS) /
                        (COMBOBURST_DURATION_MS - COMBOBURST_FADE_OUT_START_MS));
                const alpha = Math.min(fadeIn, fadeOut);
                const moveProgress = Math.min(1, elapsed / COMBOBURST_DURATION_MS);
                const outCirc = 1 - Math.pow(1 - moveProgress, 3);
                const movement = 36 * scale768 * outCirc;

                const bottomAlignedY = canvas.height - drawHeight;
                const x = getComboburstHorizontalPosition(
                    segment, effect.side, drawWidth, 8 * scale768, movement
                );
                if (effect.side === 'left') {
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(image, x, bottomAlignedY, drawWidth, drawHeight);
                    ctx.restore();
                } else {
                    drawMirroredComboburst(
                        ctx, image, x, bottomAlignedY,
                        drawWidth, drawHeight, alpha
                    );
                }
            }
            return hasActive;
        }
