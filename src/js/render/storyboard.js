// ============================================================================
// storyboard.js - storyboard command evaluation and Canvas rendering
// 依赖：render/storyboard-assets.js、parser/storyboard.js、core/state.js
// ============================================================================

        function storyboardLayerIndex(layer) {
            const value = String(layer || '').trim().toLowerCase();
            if (value === '0' || value === 'background') return 0;
            if (value === '1' || value === 'fail') return 1;
            if (value === '2' || value === 'pass') return 2;
            if (value === '3' || value === 'foreground') return 3;
            return 0;
        }

        function storyboardOrigin(name) {
            const value = String(name || '').trim().toLowerCase();
            if (value === 'topleft') return { x: 0, y: 0 };
            if (value === 'topcentre' || value === 'topcenter') return { x: 0.5, y: 0 };
            if (value === 'topright') return { x: 1, y: 0 };
            if (value === 'centreleft' || value === 'centerleft') return { x: 0, y: 0.5 };
            if (value === 'centre' || value === 'center') return { x: 0.5, y: 0.5 };
            if (value === 'centreright' || value === 'centerright') return { x: 1, y: 0.5 };
            if (value === 'bottomleft') return { x: 0, y: 1 };
            if (value === 'bottomcentre' || value === 'bottomcenter') return { x: 0.5, y: 1 };
            if (value === 'bottomright') return { x: 1, y: 1 };
            return { x: 0, y: 0 };
        }

        function storyboardAssetDimensions(asset) {
            if (asset && asset.width && asset.height) {
                return { width: asset.width, height: asset.height };
            }
            const image = asset && asset.image;
            if (!image) return { width: 0, height: 0 };
            return {
                width: image.videoWidth || image.naturalWidth || image.width || 0,
                height: image.videoHeight || image.naturalHeight || image.height || 0
            };
        }

        function storyboardAnimationFrame(element, timeMs) {
            const frameCount = Math.max(1, Math.round(element.frameCount || 1));
            if (frameCount <= 1) return { index: 0, asset: element.path };

            if (!Number.isFinite(element._animationStartTime)) {
                const firstCommandTime = (element.commands || []).reduce((min, command) => (
                    Math.min(min, command.startTime)
                ), Number.POSITIVE_INFINITY);
                element._animationStartTime = Number.isFinite(firstCommandTime) ? firstCommandTime : 0;
            }
            const startTime = element._animationStartTime;
            const delay = Math.max(1, Number(element.frameDelay) || 100);
            const elapsedFrames = Math.max(0, Math.floor((timeMs - startTime) / delay));
            const loopType = String(element.loopType || '').toLowerCase();

            let index;
            if (loopType === 'looponce' || loopType === '1') {
                index = Math.min(frameCount - 1, elapsedFrames);
            } else if (loopType === 'hold' || loopType === '2') {
                index = Math.min(frameCount - 1, elapsedFrames);
            } else {
                index = elapsedFrames % frameCount;
            }

            return {
                index,
                asset: storyboardAnimationFramePath(element.path, index)
            };
        }

        
        function getLatestTimelineCommand(commands, timeMs) {
            if (!commands || commands.length === 0) return null;
            if (timeMs < commands[0].startTime) return null;

            // 二分查找或倒序快速定位最后一个 startTime <= timeMs 的命令
            let low = 0;
            let high = commands.length - 1;
            let bestIndex = -1;
            while (low <= high) {
                const mid = (low + high) >> 1;
                if (commands[mid].startTime <= timeMs) {
                    bestIndex = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            if (bestIndex < 0) return null;
            const cmd = commands[bestIndex];
            let progress;
            if (timeMs >= cmd.endTime) {
                progress = 1.0;
            } else {
                const duration = cmd.endTime - cmd.startTime;
                const rawProgress = duration > 0 ? (timeMs - cmd.startTime) / duration : 1.0;
                progress = storyboardEase(cmd.easing || 0, rawProgress);
            }
            return { cmd, progress };
        }

        function storyboardEase(easing, value) {
            const t = Math.max(0, Math.min(1, value));
            const easeInQuad = x => x * x;
            const easeOutQuad = x => x * (2 - x);
            const easeInCubic = x => x * x * x;
            const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
            const easeInQuart = x => x * x * x * x;
            const easeOutQuart = x => 1 - Math.pow(1 - x, 4);
            const easeInQuint = x => x * x * x * x * x;
            const easeOutQuint = x => 1 - Math.pow(1 - x, 5);
            const easeInSine = x => 1 - Math.cos((x * Math.PI) / 2);
            const easeOutSine = x => Math.sin((x * Math.PI) / 2);
            const easeInExpo = x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
            const easeOutExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
            const easeInCirc = x => 1 - Math.sqrt(1 - x * x);
            const easeOutCirc = x => Math.sqrt(1 - Math.pow(x - 1, 2));
            const easeInElastic = x => {
                if (x <= 0) return 0;
                if (x >= 1) return 1;
                const c4 = (2 * Math.PI) / 3;
                return -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * c4);
            };
            const easeOutElastic = x => {
                if (x <= 0) return 0;
                if (x >= 1) return 1;
                const c4 = (2 * Math.PI) / 3;
                return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
            };
            const easeInOutElastic = x => {
                if (x <= 0) return 0;
                if (x >= 1) return 1;
                const c5 = (2 * Math.PI) / 4.5;
                return x < 0.5
                    ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
                    : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1;
            };
            const easeInBack = x => {
                const c1 = 1.70158;
                const c3 = c1 + 1;
                return c3 * x * x * x - c1 * x * x;
            };
            const easeOutBack = x => {
                const c1 = 1.70158;
                const c3 = c1 + 1;
                return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
            };
            const easeInOut = (fnIn, fnOut) => x => (
                x < 0.5 ? fnIn(x * 2) / 2 : 1 - fnOut((1 - x) * 2) / 2
            );
            const easeOutBounce = x => {
                const n1 = 7.5625;
                const d1 = 2.75;
                if (x < 1 / d1) return n1 * x * x;
                if (x < 2 / d1) {
                    x -= 1.5 / d1;
                    return n1 * x * x + 0.75;
                }
                if (x < 2.5 / d1) {
                    x -= 2.25 / d1;
                    return n1 * x * x + 0.9375;
                }
                x -= 2.625 / d1;
                return n1 * x * x + 0.984375;
            };
            const easeInBounce = x => 1 - easeOutBounce(1 - x);

            switch (easing) {
                case 0: return t;
                case 1: return easeOutQuad(t);
                case 2: return easeInQuad(t);
                case 3: return easeInQuad(t);
                case 4: return easeOutQuad(t);
                case 5: return easeInOut(easeInQuad, easeOutQuad)(t);
                case 6: return easeInCubic(t);
                case 7: return easeOutCubic(t);
                case 8: return easeInOut(easeInCubic, easeOutCubic)(t);
                case 9: return easeInQuart(t);
                case 10: return easeOutQuart(t);
                case 11: return easeInOut(easeInQuart, easeOutQuart)(t);
                case 12: return easeInQuint(t);
                case 13: return easeOutQuint(t);
                case 14: return easeInOut(easeInQuint, easeOutQuint)(t);
                case 15: return easeInSine(t);
                case 16: return easeOutSine(t);
                case 17: return easeInOut(easeInSine, easeOutSine)(t);
                case 18: return easeInExpo(t);
                case 19: return easeOutExpo(t);
                case 20: return easeInOut(easeInExpo, easeOutExpo)(t);
                case 21: return easeInCirc(t);
                case 22: return easeOutCirc(t);
                case 23: return easeInOut(easeInCirc, easeOutCirc)(t);
                case 24: return easeInElastic(t);
                case 25: return easeOutElastic(t);
                case 26: return easeInOutElastic(t);
                case 27: return easeInBack(t);
                case 28: return easeOutBack(t);
                case 29: return easeInOut(easeInBack, easeOutBack)(t);
                case 30: return easeInBounce(t);
                case 31: return easeOutBounce(t);
                case 32: return t < 0.5 ? easeInBounce(t * 2) / 2 : 1 - easeOutBounce((1 - t) * 2) / 2;
                default: return t;
            }
        }

        function interpolateStoryboardNumber(from, to, progress) {
            return from + (to - from) * progress;
        }

        function interpolateStoryboardColour(colours, progress) {
            if (!colours || colours.length === 0) return [255, 255, 255];
            if (colours.length === 1) return colours[0].slice();

            const segmentCount = colours.length - 1;
            const scaled = Math.max(0, Math.min(1, progress)) * segmentCount;
            const index = Math.min(segmentCount - 1, Math.floor(scaled));
            const local = Math.max(0, Math.min(1, scaled - index));
            const from = colours[index];
            const to = colours[index + 1];
            return [
                Math.round(interpolateStoryboardNumber(from[0], to[0], local)),
                Math.round(interpolateStoryboardNumber(from[1], to[1], local)),
                Math.round(interpolateStoryboardNumber(from[2], to[2], local))
            ];
        }

        function expandStoryboardCommands(element) {
            if (element._compiledCommands) return element._compiledCommands;
            const expanded = [];
            const loopDurations = new Map();
            const maxCommands = 20000;

            for (const command of element.commands || []) {
                if (expanded.length >= maxCommands) break;
                if (!command.loop || command.loop.iterations <= 1) {
                    expanded.push(command);
                    continue;
                }

                let loopDuration = loopDurations.get(command.loop);
                if (loopDuration === undefined) {
                    let maxEnd = command.loop.startTime;
                    for (const candidate of element.commands) {
                        if (candidate.loop === command.loop) {
                            maxEnd = Math.max(maxEnd, candidate.endTime);
                        }
                    }
                    loopDuration = Math.max(0, maxEnd - command.loop.startTime);
                    loopDurations.set(command.loop, loopDuration);
                }

                for (let iteration = 0; iteration < command.loop.iterations; iteration++) {
                    if (expanded.length >= maxCommands) break;
                    const timeOffset = loopDuration * iteration;
                    expanded.push({
                        ...command,
                        startTime: command.startTime + timeOffset,
                        endTime: command.endTime + timeOffset,
                        order: command.order * 100000 + iteration,
                        loop: null
                    });
                }
            }

            expanded.sort((a, b) => a.startTime - b.startTime || a.order - b.order);

            let minStartTime = Infinity;
            let maxEndTime = -Infinity;
            let hasFade = false;
            let firstFadeStartTime = Infinity;
            let firstFadeStartAlpha = 0;
            let lastFadeEndTime = -Infinity;
            let lastFadeEndAlpha = 0;

            for (const cmd of expanded) {
                if (cmd.trigger) continue;
                if (cmd.startTime < minStartTime) minStartTime = cmd.startTime;
                if (cmd.endTime > maxEndTime) maxEndTime = cmd.endTime;
                if (cmd.type === 'F') {
                    hasFade = true;
                    if (cmd.startTime < firstFadeStartTime) {
                        firstFadeStartTime = cmd.startTime;
                        firstFadeStartAlpha = (cmd.values && cmd.values.length > 0) ? cmd.values[0] : 0;
                    }
                    if (cmd.endTime >= lastFadeEndTime) {
                        lastFadeEndTime = cmd.endTime;
                        lastFadeEndAlpha = (cmd.values && cmd.values.length > 1) ? cmd.values[1] : ((cmd.values && cmd.values.length > 0) ? cmd.values[0] : 0);
                    }
                }
            }

            const layer = String(element.layer || '').trim().toLowerCase();
            const isBackgroundLayer = layer === '0' || layer === 'background';
            element._meta = {
                minStartTime: Number.isFinite(minStartTime) ? minStartTime : 0,
                maxEndTime: Number.isFinite(maxEndTime) ? maxEndTime : 0,
                hasFade,
                firstFadeStartTime: Number.isFinite(firstFadeStartTime) ? firstFadeStartTime : 0,
                firstFadeStartAlpha,
                lastFadeEndTime: Number.isFinite(lastFadeEndTime) ? lastFadeEndTime : 0,
                lastFadeEndAlpha,
                isDeadAfterEnd: (hasFade && lastFadeEndAlpha <= 0.001) ||
                    (expanded.length === 0 && !isBackgroundLayer)
            };
            
            const typedCommands = {};
            for (const cmd of expanded) {
                if (cmd.trigger) continue;
                if (!typedCommands[cmd.type]) typedCommands[cmd.type] = [];
                typedCommands[cmd.type].push(cmd);
            }
            element._typedCommands = typedCommands;

            element._compiledCommands = expanded;
            return expanded;
        }

                function evaluateStoryboardElement(element, timeMs, compiledCommands) {
            const commands = compiledCommands || expandStoryboardCommands(element);
            const meta = element._meta;

            // osu!stable 生命周期快速剔除：
            if (commands.length > 0) {
                if (timeMs < meta.minStartTime) return null;
                if (timeMs > meta.maxEndTime && meta.isDeadAfterEnd) return null;
            } else {
                const layer = String(element.layer || '').toLowerCase();
                if (layer !== '0' && layer !== 'background') return null;
            }

            if (meta && meta.hasFade && timeMs < meta.firstFadeStartTime && meta.firstFadeStartAlpha <= 0.001) {
                return null;
            }

            const typed = element._typedCommands || {};

            // 1. Alpha 透明度求值（若隐形则立刻退出，跳过后续所有位移与计算）
            let alpha = (meta && meta.hasFade) ? meta.firstFadeStartAlpha : 1;
            const hitF = getLatestTimelineCommand(typed.F, timeMs);
            if (hitF) {
                const v = hitF.cmd.values;
                if (v && v.length >= 2) {
                    alpha = interpolateStoryboardNumber(v[0], v[1], hitF.progress);
                } else if (v && v.length === 1) {
                    alpha = v[0];
                }
            }
            if (alpha <= 0.005) return null;

            // 2. 坐标位移求值 (M, MX, MY)
            let x = element.x;
            let y = element.y;
            const hitM = getLatestTimelineCommand(typed.M, timeMs);
            if (hitM && hitM.cmd.values && hitM.cmd.values.length >= 4) {
                x = interpolateStoryboardNumber(hitM.cmd.values[0], hitM.cmd.values[2], hitM.progress);
                y = interpolateStoryboardNumber(hitM.cmd.values[1], hitM.cmd.values[3], hitM.progress);
            }
            const hitMX = getLatestTimelineCommand(typed.MX, timeMs);
            if (hitMX && hitMX.cmd.values && hitMX.cmd.values.length >= 2) {
                x = interpolateStoryboardNumber(hitMX.cmd.values[0], hitMX.cmd.values[1], hitMX.progress);
            }
            const hitMY = getLatestTimelineCommand(typed.MY, timeMs);
            if (hitMY && hitMY.cmd.values && hitMY.cmd.values.length >= 2) {
                y = interpolateStoryboardNumber(hitMY.cmd.values[0], hitMY.cmd.values[1], hitMY.progress);
            }

            // 3. 缩放求值 (S, V, VX, VY)
            let scaleX = 1;
            let scaleY = 1;
            const hitS = getLatestTimelineCommand(typed.S, timeMs);
            if (hitS) {
                const v = hitS.cmd.values;
                if (v && v.length >= 2) {
                    scaleX = interpolateStoryboardNumber(v[0], v[1], hitS.progress);
                    scaleY = scaleX;
                } else if (v && v.length === 1) {
                    scaleX = v[0];
                    scaleY = v[0];
                }
            }
            const hitV = getLatestTimelineCommand(typed.V, timeMs);
            if (hitV && hitV.cmd.values && hitV.cmd.values.length >= 4) {
                scaleX = interpolateStoryboardNumber(hitV.cmd.values[0], hitV.cmd.values[2], hitV.progress);
                scaleY = interpolateStoryboardNumber(hitV.cmd.values[1], hitV.cmd.values[3], hitV.progress);
            }
            const hitVX = getLatestTimelineCommand(typed.VX, timeMs);
            if (hitVX && hitVX.cmd.values && hitVX.cmd.values.length >= 2) {
                scaleX = interpolateStoryboardNumber(hitVX.cmd.values[0], hitVX.cmd.values[1], hitVX.progress);
            }
            const hitVY = getLatestTimelineCommand(typed.VY, timeMs);
            if (hitVY && hitVY.cmd.values && hitVY.cmd.values.length >= 2) {
                scaleY = interpolateStoryboardNumber(hitVY.cmd.values[0], hitVY.cmd.values[1], hitVY.progress);
            }
            if (Math.abs(scaleX) <= 0.001 || Math.abs(scaleY) <= 0.001) return null;

            // 4. 旋转角度求值 (R)
            let rotation = 0;
            const hitR = getLatestTimelineCommand(typed.R, timeMs);
            if (hitR) {
                const v = hitR.cmd.values;
                if (v && v.length >= 2) {
                    rotation = interpolateStoryboardNumber(v[0], v[1], hitR.progress);
                } else if (v && v.length === 1) {
                    rotation = v[0];
                }
            }

            // 5. 颜色求值 (C)
            let colour = [255, 255, 255];
            const hitC = getLatestTimelineCommand(typed.C, timeMs);
            if (hitC && hitC.cmd.values) {
                colour = interpolateStoryboardColour(hitC.cmd.values, hitC.progress);
            }

            // 6. 参数标志 (P)
            let additive = false;
            let flipX = false;
            let flipY = false;
            const hitP = getLatestTimelineCommand(typed.P, timeMs);
            if (hitP && hitP.cmd.values) {
                for (const flag of hitP.cmd.values) {
                    if (flag === 'A') additive = true;
                    if (flag === 'H') flipX = true;
                    if (flag === 'V') flipY = true;
                }
            }

            return {
                x, y, scaleX, scaleY, rotation, alpha, colour, additive, flipX, flipY
            };
        }

        function getTintedStoryboardImage(state, asset, image, colour) {
            if (!asset || !image) return image;
            if (colour[0] === 255 && colour[1] === 255 && colour[2] === 255) return image;

            const quantized = colour.map(channel => (
                Math.max(0, Math.min(255, Math.round(channel / 32) * 32))
            ));
            const key = quantized.join(',');
            const cached = asset.tintCache.get(key);
            if (cached) {
                cached._storyboardLastUsedFrame = state.assetFrameSerial;
                return cached;
            }

            const width = image.videoWidth || image.naturalWidth || image.width || 0;
            const height = image.videoHeight || image.naturalHeight || image.height || 0;
            if (!width || !height) return image;

            const tinted = document.createElement('canvas');
            tinted.width = width;
            tinted.height = height;
            const tintCtx = tinted.getContext('2d');
            tintCtx.drawImage(image, 0, 0, width, height);
            tintCtx.globalCompositeOperation = 'multiply';
            tintCtx.fillStyle = `rgb(${quantized[0]}, ${quantized[1]}, ${quantized[2]})`;
            tintCtx.fillRect(0, 0, width, height);
            tintCtx.globalCompositeOperation = 'destination-in';
            tintCtx.drawImage(image, 0, 0, width, height);
            tintCtx.globalCompositeOperation = 'source-over';

            tinted._storyboardBytes = storyboardCanvasBytes(tinted);
            tinted._storyboardLastUsedFrame = state.assetFrameSerial;
            asset.tintCache.set(key, tinted);
            state.tintCacheBytes += tinted._storyboardBytes;
            if (asset.tintCache.size > 8) {
                const firstKey = asset.tintCache.keys().next().value;
                const firstCanvas = asset.tintCache.get(firstKey);
                state.tintCacheBytes = Math.max(
                    0,
                    state.tintCacheBytes - (firstCanvas._storyboardBytes || storyboardCanvasBytes(firstCanvas))
                );
                try {
                    firstCanvas.width = 1;
                    firstCanvas.height = 1;
                } catch (_) {}
                asset.tintCache.delete(firstKey);
            }
            pruneStoryboardTintCache(state);
            return tinted;
        }

        function storyboardSpriteIntersectsViewport(visual, origin, dimensions, viewport, width, height) {
            const scaleX = visual.scaleX || 1;
            const scaleY = visual.scaleY || 1;
            const rotation = visual.rotation || 0;
            const w = dimensions.width * Math.abs(scaleX) * viewport.scale;
            const h = dimensions.height * Math.abs(scaleY) * viewport.scale;
            const anchorX = viewport.offsetX + visual.x * viewport.scale;
            const anchorY = viewport.offsetY + visual.y * viewport.scale;
            const margin = 32;

            if (rotation === 0) {
                const left = anchorX - origin.x * w;
                const top = anchorY - origin.y * h;
                return (left + w >= -margin) && (left <= width + margin) &&
                       (top + h >= -margin) && (top <= height + margin);
            }

            const radius = Math.hypot(dimensions.width, dimensions.height) * Math.max(Math.abs(scaleX), Math.abs(scaleY)) * viewport.scale;
            const centerX = anchorX + (0.5 - origin.x) * w;
            const centerY = anchorY + (0.5 - origin.y) * h;
            return (centerX + radius >= -margin) && (centerX - radius <= width + margin) &&
                   (centerY + radius >= -margin) && (centerY - radius <= height + margin);
        }

                function drawStoryboardSprite(ctx, state, runtimeElement, timeMs, viewport) {
            const element = runtimeElement.data;
            if (!runtimeElement.compiledCommands) {
                runtimeElement.compiledCommands = expandStoryboardCommands(element);
            }
            const visual = evaluateStoryboardElement(element, timeMs, runtimeElement.compiledCommands);
            if (!visual || visual.alpha <= 0.005) return false;

            const frame = storyboardAnimationFrame(element, timeMs);
            const path = frame.asset;
            const asset = getStoryboardAsset(state, path);
            if (!runtimeElement.origin) runtimeElement.origin = storyboardOrigin(element.origin);
            const origin = runtimeElement.origin;
            let dimensions = storyboardAssetDimensions(asset);
            if (dimensions.width && dimensions.height && !storyboardSpriteIntersectsViewport(
                visual,
                origin,
                dimensions,
                viewport,
                viewport.width,
                viewport.height
            )) {
                return false;
            }

            const image = getStoryboardImage(state, path);
            if (!image) return false;
            dimensions = storyboardAssetDimensions(asset);
            if (!dimensions.width || !dimensions.height) return false;
            if (!storyboardSpriteIntersectsViewport(
                visual,
                origin,
                dimensions,
                viewport,
                viewport.width,
                viewport.height
            )) {
                return false;
            }

            asset.lastUsedFrame = state.assetFrameSerial;
            asset.lastUsedTime = timeMs;
            const scaleX = (visual.scaleX || 1) * (visual.flipX ? -1 : 1);
            const scaleY = (visual.scaleY || 1) * (visual.flipY ? -1 : 1);
            const rotation = visual.rotation || 0;
            const alpha = Math.max(0, Math.min(1, visual.alpha));
            const additive = visual.additive;
            const renderImage = getTintedStoryboardImage(state, asset, image, visual.colour);

            // Fast Path: 无旋转且无翻转（避免矩阵堆栈与 save/restore 极大开销）
            if (rotation === 0 && !visual.flipX && !visual.flipY) {
                const sw = dimensions.width * scaleX * viewport.scale;
                const sh = dimensions.height * scaleY * viewport.scale;
                const sx = viewport.offsetX + visual.x * viewport.scale - origin.x * sw;
                const sy = viewport.offsetY + visual.y * viewport.scale - origin.y * sh;

                ctx.globalAlpha = alpha;
                ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
                ctx.drawImage(renderImage, sx, sy, sw, sh);
                return true;
            }

            // Normal Path: 带有旋转或镜像翻转
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
            ctx.translate(
                viewport.offsetX + visual.x * viewport.scale,
                viewport.offsetY + visual.y * viewport.scale
            );
            ctx.rotate(rotation * Math.PI / 180);
            ctx.scale(viewport.scale * scaleX, viewport.scale * scaleY);
            ctx.translate(-origin.x * dimensions.width, -origin.y * dimensions.height);
            ctx.drawImage(renderImage, 0, 0, dimensions.width, dimensions.height);
            ctx.restore();
            return true;
        }

                function drawStoryboardFrame(ctx, timeMs, width, height, maxLayer = 3, minLayer = 0) {
            const state = storyboardPlaybackState;
            if (!state || !state.storyboard || !state.elements || state.elements.length === 0) return;
            if (typeof enableStoryboard !== 'undefined' && !enableStoryboard) return;

            state.assetFrameSerial++;
            const scale = Math.max(width / 640, height / 480);
            const viewport = {
                scale,
                offsetX: (width - 640 * scale) / 2,
                offsetY: (height - 480 * scale) / 2,
                width,
                height
            };

            if (!state.elementsByLayer) {
                const elementsByLayer = [[], [], [], []];
                for (const element of state.elements) {
                    const index = storyboardLayerIndex(element.data.layer);
                    if (!element.compiledCommands) {
                        element.compiledCommands = expandStoryboardCommands(element.data);
                    }
                    element.meta = element.data._meta || {
                        minStartTime: 0,
                        maxEndTime: Infinity,
                        isDeadAfterEnd: false
                    };
                    elementsByLayer[index].push(element);
                }
                for (const layerElements of elementsByLayer) {
                    layerElements.sort((a, b) => (a.meta.minStartTime - b.meta.minStartTime) || ((a.data.order || 0) - (b.data.order || 0)));
                }
                state.elementsByLayer = elementsByLayer;
                state.activeElementsByLayer = [[], [], [], []];
                state.layerCursor = [0, 0, 0, 0];
                state.lastStoryboardDrawTime = Number.NEGATIVE_INFINITY;
            }
            const elementsByLayer = state.elementsByLayer;
            const activeElementsByLayer = state.activeElementsByLayer;
            const layerCursor = state.layerCursor;
            const seekedBackwards = timeMs + 1 < state.lastStoryboardDrawTime;

            if (seekedBackwards) {
                for (let layer = 0; layer < activeElementsByLayer.length; layer++) {
                    activeElementsByLayer[layer].length = 0;
                    layerCursor[layer] = 0;
                }
            }

            const startL = Math.max(0, minLayer);
            const endL = Math.min(3, maxLayer);
            let drawnCount = 0;
            const MAX_DRAWN_PER_FRAME = 400;

            for (let layer = startL; layer <= endL; layer++) {
                const layerElements = elementsByLayer[layer];
                const activeElements = activeElementsByLayer[layer];
                let cursor = layerCursor[layer];

                while (cursor < layerElements.length && layerElements[cursor].meta.minStartTime <= timeMs) {
                    const element = layerElements[cursor++];
                    if (element.meta.isDeadAfterEnd && timeMs > element.meta.maxEndTime) continue;
                    activeElements.push(element);
                }
                layerCursor[layer] = cursor;

                let writeIndex = 0;
                for (let readIndex = 0; readIndex < activeElements.length; readIndex++) {
                    const element = activeElements[readIndex];
                    if (element.meta.isDeadAfterEnd && timeMs > element.meta.maxEndTime) continue;
                    activeElements[writeIndex++] = element;
                }
                activeElements.length = writeIndex;

                for (let i = 0; i < activeElements.length; i++) {
                    const element = activeElements[i];
                    if (drawStoryboardSprite(ctx, state, element, timeMs, viewport)) {
                        drawnCount++;
                        if (drawnCount >= MAX_DRAWN_PER_FRAME) break;
                    }
                }
                if (drawnCount >= MAX_DRAWN_PER_FRAME) break;
            }

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            state.lastStoryboardDrawTime = timeMs;
            pruneStoryboardAssetCache(state);
            pruneStoryboardTintCache(state);
        }
