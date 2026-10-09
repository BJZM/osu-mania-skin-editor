// ============================================================================
// judgements.js - 判定提示静态预览与动画绘制
// 依赖：render/textures.js
// ============================================================================

        // 绘制静止/预览状态下的判定结果提示（Hit300g/300g），确保在未播放、暂停或未触发音符时画布始终能清晰看到判定位置
        function drawStaticJudgementPreview(keys, scorePosX, scorePosY, scale768) {
            let hitFrames = getManiaSkinAnimationFrames(keys, LML.Hit300g)
                || getManiaSkinAnimationFrames(keys, LML.Hit300)
                || null;
            let hitImg = (hitFrames && hitFrames.length > 0)
                ? hitFrames[0]
                : (getManiaSkinImage(keys, LML.Hit300g) || getManiaSkinImage(keys, LML.Hit300) || null);

            if (hitImg && hitImg.width > 0 && hitImg.height > 0) {
                const is2x = hitImg._is2x || false;
                const nativeW = is2x ? hitImg.width / 2 : hitImg.width;
                const nativeH = is2x ? hitImg.height / 2 : hitImg.height;
                const scale = scale768 * 0.70;
                let jWidth = nativeW * scale;
                let jHeight = nativeH * scale;
                ctx.save();
                ctx.globalAlpha = 0.95;
                ctx.drawImage(hitImg, scorePosX - jWidth / 2, scorePosY - jHeight / 2, jWidth, jHeight);
                ctx.restore();
            } else {
                ctx.save();
                ctx.globalAlpha = 0.95;
                ctx.font = `bold ${Math.round(25 * scale768)}px sans-serif`;
                ctx.fillStyle = '#66ccff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                ctx.shadowBlur = 4;
                ctx.fillText('300g', scorePosX, scorePosY);
                ctx.restore();
            }
        }

        // 计算当前判定动画在指定时刻的实时缩放大小（用于动画平滑重叠衔接）
        function getJudgementCurrentScale(j, nowOrElapsed) {
            if (!j) return 0.80;
            const elapsed = (typeof nowOrElapsed === 'number' && nowOrElapsed <= 1000)
                ? nowOrElapsed
                : (j.hitTime !== undefined ? ((nowOrElapsed || performance.now()) - j.hitTime) : (j.elapsed || 0));
            if (elapsed < 0 || elapsed > 220) return 0.80;

            if (j.isMiss) {
                if (elapsed < 100) {
                    const t = elapsed / 100;
                    const easeOut = 1 - Math.pow(1 - t, 2);
                    return 1.2 - 0.2 * easeOut;
                }
                return 1.0;
            }

            const baseStart = (j.startScale != null) ? j.startScale : 0.80;
            if (elapsed < 40) {
                // 快速放大阶段: 从 baseStart 放大至 1.0
                return baseStart + (1.0 - baseStart) * (elapsed / 40);
            } else if (elapsed < 80) {
                // 慢慢缩小阶段 1: 0.85 -> 0.70
                return 0.85 - 0.15 * ((elapsed - 40) / 40);
            } else if (elapsed <= 180) {
                // 稳定展示阶段: 0.70
                return 0.70;
            } else {
                // 慢慢缩小阶段 2: 0.70 -> 0.40
                const t = (elapsed - 180) / 40;
                return Math.max(0.40, 0.70 - 0.30 * (t * t));
            }
        }

        // 计算当前判定动画在指定时刻的实时透明度（避免重叠连击时透明度突变为 0 产生闪烁）
        function getJudgementCurrentAlpha(j, nowOrElapsed) {
            if (!j) return 0.0;
            const elapsed = (typeof nowOrElapsed === 'number' && nowOrElapsed <= 1000)
                ? nowOrElapsed
                : (j.hitTime !== undefined ? ((nowOrElapsed || performance.now()) - j.hitTime) : (j.elapsed || 0));
            if (elapsed < 0 || elapsed > 220) return 0.0;

            const baseAlpha = (j.startAlpha != null) ? j.startAlpha : 0.0;
            if (elapsed < 20) {
                const t = elapsed / 20;
                const easeOut = 1 - Math.pow(1 - t, 2);
                return baseAlpha + (1.0 - baseAlpha) * easeOut;
            } else if (elapsed <= 180) {
                return 1.0;
            } else {
                const t = (elapsed - 180) / 40;
                return Math.max(0.0, 1.0 - (t * t));
            }
        }

        // osu!lazer 官方打击判定效果引擎
        // 1. 皮肤贴图判定: 对齐 LegacyManiaJudgementPiece (原版尺寸 * scale768，220ms 寿命)
        //    - 透明度: 0~20ms FadeInFromZero(20, Easing.Out) -> 160ms 保持 -> 180~220ms FadeOutFromOne(40, Easing.In)
        //    - 命中缩放: 0~40ms 快速放大 (startScale->1.0) -> 40~80ms (0.85->0.70) -> 80~180ms 保持 0.70 -> 180~220ms (0.70->0.40, Easing.In)
        //    - Miss 缩放与旋转: 0~100ms ScaleTo(1.2->1.0, Easing.Out)，同时角度从 0 缓动旋转到 targetRotation [-5.73°, +5.73°]
        //    - 连击衔接: 慢缩小阶段遇新音符触发时，从当前缩小尺寸无缝顶回 1.0，继续播放缩小过程
        //    - 多帧序列帧动画: 对齐 IFramedAnimation.GotoFrame(0) + 20 FPS (50ms/帧)
        // 2. 默认矢量文字判定: 对齐 DefaultManiaJudgementPiece
        function drawJudgements(scale768, anchorX, anchorY) {
            const now = performance.now();
            // 判定提示需要跟随轨道布局实时居中：
            // 触发瞬间缓存的 j.x / j.y 只在「轨道区中心」这一刻成立，
            // 暂停状态下拖动轨道（改列宽/间距/ColumnStart）时布局会变，
            // 若继续沿用缓存坐标，判定贴图就会停留在旧位置、不跟随轨道区居中。
            // 因此这里优先采用调用方传入的当前帧坐标（轨道区中心 + ScorePosition 实时值）。
            const liveX = (typeof anchorX === 'number' && isFinite(anchorX)) ? anchorX : null;
            const liveY = (typeof anchorY === 'number' && isFinite(anchorY)) ? anchorY : null;
            for (let i = judgements.length - 1; i >= 0; i--) {
                const j = judgements[i];
                const jx = (liveX !== null) ? liveX : j.x;
                const jy = (liveY !== null) ? liveY : j.y;
                const elapsed = isPlaying
                    ? (now - j.hitTime)
                    : ((j.elapsed !== undefined) ? j.elapsed : (now - j.hitTime));
                j.elapsed = elapsed;
                if (elapsed < 0) continue;

                // 判断是否包含皮肤贴图或帧动画
                const hasSkinPiece = (j.frames && j.frames.length > 0) || (j.img && j.img.width > 0 && j.img.height > 0);
                const maxLifetime = hasSkinPiece ? 220 : (j.isMiss ? 800 : 550);

                // 播放中或静态预览判定演示中超时则移除；若谱面暂停则定格保持显示，方便用户直接观察或点击选中
                if ((isPlaying || (!currentBeatmap && isPreviewJudgementActive)) && elapsed > maxLifetime) {
                    judgements.splice(i, 1);
                    continue;
                }

                if (hasSkinPiece) {
                    // ---- 1. 对齐 LegacyManiaJudgementPiece ----
                    // 1.1 透明度 (FadeInFromZero(20, Out) -> Delay(160) -> FadeOutFromOne(40, In))
                    let alpha = 1.0;
                    const startAlpha = (j.startAlpha != null) ? j.startAlpha : 0.0;
                    if (elapsed < 20) {
                        const t = elapsed / 20;
                        const easeOut = 1 - Math.pow(1 - t, 2); // Easing.Out (Quad)
                        alpha = startAlpha + (1.0 - startAlpha) * easeOut;
                    } else if (elapsed > 180) {
                        const t = (elapsed - 180) / 40;
                        alpha = Math.max(0, 1 - (t * t)); // Easing.In (Quad)
                    }

                    // 1.2 缩放与旋转曲线
                    let currentScale = 1.0;
                    let currentRotation = 0;
                    if (j.isMiss) {
                        // Miss: ScaleTo(1.2->1.0, 100, Easing.Out), RotateTo(0->targetRotation, 100, Easing.Out)
                        if (elapsed < 100) {
                            const t = elapsed / 100;
                            const easeOut = 1 - Math.pow(1 - t, 2);
                            currentScale = 1.2 - 0.2 * easeOut;
                            currentRotation = (j.targetRotation || 0) * easeOut;
                        } else {
                            currentScale = 1.0;
                            currentRotation = j.targetRotation || 0;
                        }
                    } else {
                        // Hit:
                        // 快速放大阶段 (0~40ms): 从当前 startScale 平滑顶回到 1.0
                        // 慢慢缩小阶段 (40ms~220ms): 40~80ms (0.85->0.70) -> 80~180ms 稳定保持 (0.70) -> 180~220ms (0.70->0.40)
                        const startScale = (j.startScale != null) ? j.startScale : 0.80;
                        if (elapsed < 40) {
                            currentScale = startScale + (1.0 - startScale) * (elapsed / 40);
                        } else if (elapsed < 80) {
                            currentScale = 0.85 - 0.15 * ((elapsed - 40) / 40);
                        } else if (elapsed <= 180) {
                            currentScale = 0.70;
                        } else {
                            const t = (elapsed - 180) / 40;
                            currentScale = 0.70 - 0.30 * (t * t); // Easing.In (Quad)
                        }
                        currentRotation = 0;
                    }

                    // 1.3 序列帧解析 (20 FPS / 50ms 步进，从第 0 帧开始)
                    let currentImg = j.img;
                    if (j.frames && j.frames.length > 0) {
                        const frameIndex = Math.min(j.frames.length - 1, Math.floor(elapsed / 50));
                        currentImg = j.frames[frameIndex] || j.img;
                    }

                    if (currentImg && currentImg.width > 0 && currentImg.height > 0) {
                        const is2x = currentImg._is2x || false;
                        const nativeW = is2x ? currentImg.width / 2 : currentImg.width;
                        const nativeH = is2x ? currentImg.height / 2 : currentImg.height;
                        const jWidth = nativeW * scale768 * currentScale;
                        const jHeight = nativeH * scale768 * currentScale;

                        ctx.save();
                        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                        ctx.translate(jx, jy);
                        if (currentRotation !== 0) {
                            ctx.rotate(currentRotation);
                        }
                        ctx.drawImage(currentImg, -jWidth / 2, -jHeight / 2, jWidth, jHeight);
                        ctx.restore();
                    }
                } else {
                    // ---- 2. 对齐 DefaultManiaJudgementPiece (无贴图默认矢量字) ----
                    ctx.save();
                    if (j.isMiss) {
                        // Miss: ScaleTo(1.6->1.0, 100, In), MoveToOffset(100, 800, InQuint), RotateTo(40, 800, InQuint), FadeOut(800)
                        const tTotal = Math.min(1, elapsed / 800);
                        const inQuint = Math.pow(tTotal, 5);
                        const alpha = Math.max(0, 1 - tTotal);
                        const currentScale = elapsed < 100 ? (1.6 - 0.6 * Math.pow(elapsed / 100, 2)) : 1.0;
                        const offsetY = 100 * scale768 * inQuint;
                        const rotation = (40 * Math.PI / 180) * inQuint;

                        ctx.globalAlpha = alpha;
                        ctx.translate(jx, jy + offsetY);
                        ctx.rotate(rotation);
                        ctx.scale(currentScale, currentScale);
                        ctx.font = `bold ${Math.round(25 * scale768)}px sans-serif`;
                        ctx.fillStyle = '#ff4444';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('MISS', 0, 0);
                    } else {
                        // Hit: ScaleTo(0.8->1.0, 250, OutElastic) -> Delay(50) -> ScaleTo(1.0->0.75, 250) + FadeOut(200, from 350ms)
                        let currentScale = 1.0;
                        if (elapsed < 250) {
                            const t = elapsed / 250;
                            const easeElastic = Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
                            currentScale = 0.8 + 0.2 * easeElastic;
                        } else if (elapsed < 300) {
                            currentScale = 1.0;
                        } else {
                            currentScale = 1.0 - 0.25 * ((elapsed - 300) / 250);
                        }

                        let alpha = 1.0;
                        if (elapsed > 350) {
                            alpha = Math.max(0, 1 - ((elapsed - 350) / 200));
                        }

                        let label = '300g';
                        let fillStyle = '#66ccff';
                        if (j.lookup === LML.Hit300) { label = '300'; fillStyle = '#ffd700'; }
                        else if (j.lookup === LML.Hit200) { label = '200'; fillStyle = '#55ff55'; }
                        else if (j.lookup === LML.Hit100) { label = '100'; fillStyle = '#4488ff'; }
                        else if (j.lookup === LML.Hit50) { label = '50'; fillStyle = '#bbbbbb'; }

                        ctx.globalAlpha = alpha;
                        ctx.translate(jx, jy);
                        ctx.scale(currentScale, currentScale);
                        ctx.font = `bold ${Math.round(25 * scale768)}px sans-serif`;
                        ctx.fillStyle = fillStyle;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(label, 0, 0);
                    }
                    ctx.restore();
                }
            }
        }