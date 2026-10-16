// ============================================================================
// frame-judgement.js - 帧内判定触发与无缝动画衔接
// 从 render/frame.js 按帧内职责拆分；共享数据通过 context 显式传入。
// ============================================================================

        function createJudgementTrigger(context) {
            const {
                isUpsideDown, scorePosFromSkin, scale48, startX, totalTrackWidth, keys
            } = context;

            return (now, specificLookup = null) => {
                const defaultScorePosRaw = isUpsideDown ? (480 - DEFAULT_SCORE_POSITION) : DEFAULT_SCORE_POSITION;
                let scorePosY = (scorePosFromSkin !== null)
                    ? scorePosFromSkin
                    : defaultScorePosRaw * scale48;
                let scorePosX = startX + totalTrackWidth / 2;

                let lookup = specificLookup || LML.Hit300g;
                let isMiss = (lookup === LML.Hit0);

                let hitFrames = getManiaSkinAnimationFrames(keys, lookup) || null;
                let hitImg = (hitFrames && hitFrames.length > 0)
                    ? hitFrames[0]
                    : (getManiaSkinImage(keys, lookup) || null);

                // 若 300g 无独立贴图，回退至 300
                if (!hitImg && lookup === LML.Hit300g) {
                    hitFrames = getManiaSkinAnimationFrames(keys, LML.Hit300);
                    hitImg = (hitFrames && hitFrames.length > 0) ? hitFrames[0] : getManiaSkinImage(keys, LML.Hit300);
                }

                // 对齐 osu!lazer LegacyManiaJudgementPiece: 随机生成 [-5.73°, +5.73°] 的旋转角度
                const targetRotation = (Math.random() - 0.5) * (11.46 * Math.PI / 180);

                // 动画时间重叠衔接优化：
                // 如果前一个动画正在播放，且正处于缩小或持续阶段，有新按键/音符判定要播放时，
                // 不直接从 0.8 突变打断，而是从当前的缩放大小无缝开始快速放大（把大小再顶回到 1.0），然后继续播放缩小的动画
                let startScale = 0.80;
                let startAlpha = 0.0;
                if (judgements.length > 0) {
                    const prev = judgements[0];
                    const prevElapsed = (prev.hitTime !== undefined) ? (now - prev.hitTime) : ((prev.elapsed !== undefined) ? prev.elapsed : 999);
                    if (prevElapsed < 2) {
                        // 同一瞬间触发的押键（双押/多押音符），继承相同的起始缩放与透明度
                        startScale = (prev.startScale != null) ? prev.startScale : 0.80;
                        startAlpha = (prev.startAlpha != null) ? prev.startAlpha : 0.0;
                    } else {
                        const prevHasSkin = (prev.frames && prev.frames.length > 0) || (prev.img && prev.img.width > 0);
                        const prevMaxLifetime = prevHasSkin ? 220 : (prev.isMiss ? 800 : 550);
                        if (prevElapsed >= 0 && prevElapsed <= prevMaxLifetime) {
                            startScale = getJudgementCurrentScale(prev, prevElapsed);
                            startAlpha = getJudgementCurrentAlpha(prev, prevElapsed);
                        }
                    }
                }

                judgements = [{
                    x: scorePosX,
                    y: scorePosY,
                    hitTime: now,
                    img: hitImg,
                    frames: hitFrames,
                    isMiss: isMiss,
                    lookup: lookup,
                    targetRotation: targetRotation,
                    startScale: startScale,
                    startAlpha: startAlpha
                }];
            };
        }
