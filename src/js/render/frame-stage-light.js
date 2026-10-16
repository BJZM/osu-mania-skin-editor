// ============================================================================
// frame-stage-light.js - 帧内 StageLight 按键光柱绘制
// 从 render/frame.js 按帧内职责拆分；共享数据通过 context 显式传入。
// ============================================================================

        function renderStageLightColumns(context) {
            const {
                ctx, keys, columnPressed, columnLastReleaseTime, currentTime,
                stageLightPreviewActive, colWidths, colXCache, stageLightPosY,
                stageLightFps, stageLightFadeDuration, scale768, rectTop
            } = context;
            const STAGE_LIGHT_FADE_DURATION = stageLightFadeDuration;
            const activeStageLightBoxes = [];
            for (let i = 0; i < keys; i++) {
                let animAlpha = 0;
                let animScaleY = 0;

                if (columnPressed[i] || stageLightPreviewActive) {
                    animAlpha = 1.0;
                    animScaleY = 1.0;
                } else if (columnLastReleaseTime[i] > -Infinity) {
                    const elapsed = currentTime - columnLastReleaseTime[i];
                    if (elapsed >= 0 && elapsed < STAGE_LIGHT_FADE_DURATION) {
                        const p = elapsed / STAGE_LIGHT_FADE_DURATION;
                        animAlpha = 1.0 - p;
                        animScaleY = 1.0 - p;
                    }
                }

                if (animAlpha <= 0 || animScaleY <= 0) continue;

                const frames = getStageLightFrames(keys, i);
                if (!frames || frames.length === 0) continue;

                const frameIdx = (frames.length > 1)
                    ? Math.floor(((currentTime || performance.now()) / 1000 * stageLightFps) % frames.length)
                    : 0;
                const img = frames[frameIdx];
                if (!img || img.width <= 0 || img.height <= 0) continue;
                // 若贴图为 1x1 占位透明图，则无需绘制
                if (img.width <= 1 || img.height <= 1) continue;

                const is2x = !!img._is2x;
                const nativeH = is2x ? img.height / 2 : img.height;
                const colW = colWidths[i] || colWidths[0];
                const colX = colXCache[i];

                // 轨道变宽时进行横向拉伸充满轨道 (drawW = colW)；
                // 垂直高度保持为 nativeH * scale768，不随轨道宽度等比暴涨；同时随释放动画按 animScaleY 向底端判定线收缩
                const drawW = colW;
                const drawH = nativeH * scale768 * animScaleY;
                const drawX = colX;
                const drawY = stageLightPosY - drawH;

                activeStageLightBoxes.push({
                    col: i,
                    x: drawX,
                    y: rectTop(drawY, drawH),
                    w: drawW,
                    h: drawH
                });

                const colLight = getManiaColourLight(keys, i);
                const isWhite = (colLight.r === 255 && colLight.g === 255 && colLight.b === 255);
                // 对齐 lazer LegacyColourCompatibility.DisallowZeroAlpha：
                //   `if (colour.A == 0) colour.A = 1;`
                // 即 alpha=0 会被强制改成「全不透明」，所以 skin.ini 写 `ColourLight1: 255,0,0,0`
                // 在游戏里是「不透明红光」而不是「看不见」。想彻底隐藏发光请用 StageLight: blank。
                const rawLightA = (colLight.a != null && !isNaN(colLight.a)) ? colLight.a : 255;
                const effectiveLightA = (rawLightA === 0) ? 255 : rawLightA;
                const skinAlpha = effectiveLightA / 255;
                const finalAlpha = skinAlpha * animAlpha;

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = finalAlpha;
                if (!isWhite) {
                    const tinted = getTintedLightCanvas(img, colLight);
                    ctx.drawImage(tinted, drawX, drawY, drawW, drawH);
                } else {
                    ctx.drawImage(img, drawX, drawY, drawW, drawH);
                }
                ctx.restore();
            }
            return activeStageLightBoxes;
        }
