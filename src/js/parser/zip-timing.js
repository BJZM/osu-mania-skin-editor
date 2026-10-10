// ============================================================================
// zip-timing.js - zip 条目查找、背景定位与 TimingPoints / 小节线
// 依赖：core/state.js
// ============================================================================

        function findZipEntry(zip, targetPath) {
            if (!zip || !targetPath) return null;
            let clean = targetPath.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/');
            if (!clean) return null;
            const cleanLower = clean.toLowerCase();
            const baseNameLower = cleanLower.split('/').pop();
            const keys = Object.keys(zip.files);

            // 1. 完全路径匹配（大小写不敏感）
            let found = keys.find(k => k.replace(/\\/g, '/').toLowerCase() === cleanLower);
            if (found) return found;

            // 2. 结尾匹配（处理 zip 内有父目录的情况）
            found = keys.find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('/' + cleanLower));
            if (found) return found;

            // 3. 仅比对文件名（处理路径层级不一致的情况）
            found = keys.find(k => {
                const kBase = k.replace(/\\/g, '/').split('/').pop().toLowerCase();
                return kBase === baseNameLower;
            });
            if (found) return found;

            return null;
        }

        function getBeatmapBackgroundKey(zip, bm) {
            if (!zip || !zip.files) return null;
            if (bm && bm.bgPath) {
                const found = findZipEntry(zip, bm.bgPath);
                if (found) return found;
            }
            if (beatmaps && beatmaps.length > 0) {
                for (const b of beatmaps) {
                    if (b.bgPath) {
                        const found = findZipEntry(zip, b.bgPath);
                        if (found) return found;
                    }
                }
            }
            const keys = Object.keys(zip.files);
            return keys.find(k => {
                const lk = k.toLowerCase();
                return (lk.endsWith('.jpg') || lk.endsWith('.jpeg') || lk.endsWith('.png')) &&
                    !lk.includes('thumb') && !lk.includes('icon');
            }) || null;
        }

        
        function parseTimingPointsFromOsuText(text) {
            if (!text) return [];
            const timingPoints = [];
            const lines = text.split(/\r?\n/);
            let inTimingPoints = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('[TimingPoints]')) {
                    inTimingPoints = true;
                    continue;
                }
                if (line.startsWith('[') && inTimingPoints) {
                    break;
                }
                if (inTimingPoints && line && !line.startsWith('//')) {
                    const parts = line.split(',');
                    if (parts.length >= 2) {
                        const time = parseFloat(parts[0]);
                        const beatLength = parseFloat(parts[1]);
                        const meter = (parts.length >= 3 && parseInt(parts[2], 10) > 0) ? parseInt(parts[2], 10) : 4;
                        const uninherited = (parts.length >= 7) ? parseInt(parts[6], 10) === 1 : (beatLength > 0);
                        if (!isNaN(time) && isFinite(beatLength) && beatLength !== 0) {
                            if (uninherited && beatLength > 0) {
                                timingPoints.push({
                                    time: time,
                                    beatLength: beatLength,
                                    meter: meter,
                                    uninherited: true
                                });
                            } else if (!uninherited && beatLength < 0) {
                                // osu!stable / lazer legacy: inherited timing point SV = -100 / beatLength.
                                timingPoints.push({
                                    time: time,
                                    beatLength: beatLength,
                                    meter: meter,
                                    uninherited: false,
                                    scrollSpeed: -100 / beatLength
                                });
                            }
                        }
                    }
                }
            }
            timingPoints.sort((a, b) => a.time - b.time);
            return timingPoints;
        }

        function getBeatLengthAt(timingPoints, time) {
            const redPoints = getUninheritedTimingPoints(timingPoints);
            if (redPoints.length === 0) return 500;
            let active = redPoints[0];
            for (let i = 0; i < redPoints.length; i++) {
                if (redPoints[i].time <= time) {
                    active = redPoints[i];
                } else {
                    break;
                }
            }
            return active.beatLength;
        }

        function getUninheritedTimingPoints(timingPoints) {
            return (timingPoints || [])
                .filter(tp => tp && tp.uninherited !== false && isFinite(tp.beatLength) && tp.beatLength > 0)
                .sort((a, b) => a.time - b.time);
        }

        // 对齐 lazer Beatmap.GetMostCommonBeatLength()（mania stable 兼容的 RelativeScaleBeatLengths）：
        // 按每个红线的持续时间累计，取持续时间最长的节拍长度；第一条红线由 stable 强制从 0ms 开始。
        function getMostCommonBeatLength(timingPoints, lastObjectTime) {
            const redPoints = getUninheritedTimingPoints(timingPoints);
            if (redPoints.length === 0) return 500;

            const lastTime = (isFinite(lastObjectTime) && lastObjectTime > 0)
                ? lastObjectTime
                : redPoints[redPoints.length - 1].time;
            const durations = new Map();

            for (let i = 0; i < redPoints.length; i++) {
                const point = redPoints[i];
                if (point.time > lastTime) continue;

                const currentTime = (i === 0) ? 0 : point.time;
                const nextTime = (i === redPoints.length - 1) ? lastTime : redPoints[i + 1].time;
                const duration = Math.max(0, nextTime - currentTime);
                const roundedBeatLength = Math.round(point.beatLength * 1000) / 1000;
                durations.set(roundedBeatLength, (durations.get(roundedBeatLength) || 0) + duration);
            }

            let mostCommon = 0;
            let maxDuration = -Infinity;
            for (const entry of durations.entries()) {
                if (entry[1] > maxDuration) {
                    mostCommon = entry[0];
                    maxDuration = entry[1];
                }
            }

            if (!(mostCommon > 0)) return 500;
            const minBeatLength = Math.min(...redPoints.map(tp => tp.beatLength));
            const maxBeatLength = Math.max(...redPoints.map(tp => tp.beatLength));
            return Math.max(minBeatLength, Math.min(maxBeatLength, mostCommon));
        }

        // osu!stable 默认的固定流速模式：
        // 以地图主 BPM (commonBeatLength) 为基准，地图内红线 BPM 变化仍会按相对拍长改变流速；
        // inherited timing point 的 SV 再叠乘到该倍率上。
        // relativePosition 的单位是“倍率为 1 时的毫秒数”，之后只需乘以基础 px/ms 即得滚动距离。
        function createManiaScrollState(timingPoints, lastObjectTime) {
            const rawPoints = (timingPoints || [])
                .filter(tp => tp && isFinite(tp.time))
                .map((tp, order) => ({
                    time: tp.time,
                    beatLength: Number(tp.beatLength),
                    uninherited: tp.uninherited !== false && tp.beatLength > 0,
                    scrollSpeed: (isFinite(tp.scrollSpeed) && tp.scrollSpeed > 0) ? tp.scrollSpeed : 1,
                    order: order
                }))
                .sort((a, b) => a.time - b.time || a.order - b.order);

            const baseBeatLength = getMostCommonBeatLength(timingPoints, lastObjectTime);
            const points = [];
            let currentBeatLength = baseBeatLength;
            let currentScrollSpeed = 1;

            let i = 0;
            while (i < rawPoints.length) {
                const pointTime = rawPoints[i].time;
                let j = i;
                while (j < rawPoints.length && rawPoints[j].time === pointTime) {
                    const point = rawPoints[j];
                    if (point.uninherited && isFinite(point.beatLength) && point.beatLength > 0) {
                        currentBeatLength = point.beatLength;
                    } else if (!point.uninherited && isFinite(point.scrollSpeed) && point.scrollSpeed > 0) {
                        currentScrollSpeed = point.scrollSpeed;
                    }
                    j++;
                }

                const multiplier = currentScrollSpeed * baseBeatLength / currentBeatLength;
                if (points.length === 0 || Math.abs(points[points.length - 1].multiplier - multiplier) > 1e-9) {
                    points.push({ time: pointTime, multiplier: multiplier, position: 0 });
                }
                i = j;
            }

            for (let k = 1; k < points.length; k++) {
                points[k].position = points[k - 1].position
                    + (points[k].time - points[k - 1].time) * points[k - 1].multiplier;
            }

            return {
                baseBeatLength: baseBeatLength,
                points: points
            };
        }

        function getManiaScrollMultiplierAt(time, scrollState) {
            if (!scrollState || !scrollState.points || scrollState.points.length === 0) return 1;

            const points = scrollState.points;
            if (time < points[0].time) return points[0].multiplier;

            let lo = 0;
            let hi = points.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (points[mid].time <= time) {
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            return points[Math.max(0, hi)].multiplier;
        }

        function getManiaScrollPositionAt(time, scrollState) {
            const safeTime = isFinite(time) ? time : 0;
            if (!scrollState || !scrollState.points || scrollState.points.length === 0) return safeTime;

            const points = scrollState.points;
            if (safeTime < points[0].time) {
                return (safeTime - points[0].time) * points[0].multiplier;
            }

            let lo = 0;
            let hi = points.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (points[mid].time <= safeTime) {
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }

            const activeIndex = Math.max(0, hi);
            const active = points[activeIndex];
            return active.position + (safeTime - active.time) * active.multiplier;
        }

        // =========================================================================
        // 流速与可见时间计算（对齐 osu!stable 机制与 lazer 源码实现）
        // 参考 lazer: DrawableManiaRuleset.cs + SequentialScrollAlgorithm.cs
        // 1. MIN_TIME_RANGE = 290ms (scrollSpeed = 40)
        // 2. MAX_TIME_RANGE = 11485ms (scrollSpeed = 1)
        // 3. ComputeScrollTime(scrollSpeed) = MAX_TIME_RANGE / scrollSpeed
        // 4. 音符下落速度 (px/ms) = (DEFAULT_HIT_POSITION / scrollTime) * scale48
        // 5. 缩放机制保证音符实际下落速度独立于 skin.ini 自定义 HitPosition，与 stable 表现一致
        // =========================================================================
        const MANIA_MIN_TIME_RANGE = 290;
        const MANIA_MAX_TIME_RANGE = 11485;

        function computeManiaScrollTime(speed) {
            const safeSpeed = Math.max(1, Math.min(40, isFinite(speed) && speed > 0 ? Math.round(Number(speed)) : 24));
            return MANIA_MAX_TIME_RANGE / safeSpeed;
        }

        function getManiaSpeedFactor(speed, scale48) {
            const scrollTime = computeManiaScrollTime(speed);
            const defaultHp = (typeof DEFAULT_HIT_POSITION !== 'undefined') ? DEFAULT_HIT_POSITION : 402;
            const baseSpeed = defaultHp / scrollTime;
            return baseSpeed * (scale48 || 1);
        }

        // 计算当前可视视口范围内需要渲染的小节线垂直坐标 (barline Y positions)
        function getVisibleBarlines(timingPoints, currentTime, minTime, maxTime, isPreviewMode, positionAtTime, hitPos, isUpsideDown) {
            if (isPreviewMode) {
                // 预览模式：在判定线前后生成静态小节线供视觉预览
                return isUpsideDown
                    ? [hitPos + 220, hitPos + 440]
                    : [hitPos - 220, hitPos - 440];
            }

            const calcY = (typeof positionAtTime === 'function')
                ? positionAtTime
                : (t) => {
                    const fallbackSpeedFactor = Number(positionAtTime) || 1;
                    return isUpsideDown
                        ? hitPos + (t - currentTime) * fallbackSpeedFactor
                        : hitPos - (t - currentTime) * fallbackSpeedFactor;
                };

            const isYVisible = (y) => isUpsideDown
                ? (y <= canvas.height + 25 && y >= hitPos - 25)
                : (y >= -20 && y <= hitPos + 25);

            if (!timingPoints || timingPoints.length === 0) {
                const measureLen = 2000;
                const startM = Math.floor(minTime / measureLen);
                const endM = Math.ceil(maxTime / measureLen);
                const yPositions = [];
                for (let m = startM; m <= endM; m++) {
                    const t = m * measureLen;
                    const y = calcY(t);
                    if (isYVisible(y)) {
                        yPositions.push(y);
                    }
                }
                return yPositions;
            }

            const redPoints = timingPoints.filter(tp => tp.beatLength > 0);
            if (redPoints.length === 0) return [];

            const yPositions = [];
            const addedTimes = new Set();

            for (let i = 0; i < redPoints.length; i++) {
                const curPoint = redPoints[i];
                const nextPoint = (i + 1 < redPoints.length) ? redPoints[i + 1] : null;
                const meter = (curPoint.meter && curPoint.meter > 0) ? curPoint.meter : 4;
                const measureLen = curPoint.beatLength * meter;
                if (measureLen <= 20) continue;

                const segStart = curPoint.time;
                const segEnd = nextPoint ? nextPoint.time : Infinity;

                if (segStart > maxTime || segEnd < minTime) continue;

                const firstM = Math.max(0, Math.floor((minTime - segStart) / measureLen));
                for (let m = firstM; ; m++) {
                    const t = Math.round(segStart + m * measureLen);
                    if (t >= segEnd || t > maxTime) break;
                    if (t >= minTime && !addedTimes.has(t)) {
                        addedTimes.add(t);
                        const y = calcY(t);
                        if (isYVisible(y)) {
                            yPositions.push(y);
                        }
                    }
                }

                if (i === 0 && segStart > minTime) {
                    for (let m = 1; ; m++) {
                        const t = Math.round(segStart - m * measureLen);
                        if (t < minTime || t < -10000) break;
                        if (!addedTimes.has(t)) {
                            addedTimes.add(t);
                            const y = calcY(t);
                            if (isYVisible(y)) {
                                yPositions.push(y);
                            }
                        }
                    }
                }
            }

            return yPositions;
        }

        if (typeof window !== 'undefined') {
            window.MANIA_MIN_TIME_RANGE = MANIA_MIN_TIME_RANGE;
            window.MANIA_MAX_TIME_RANGE = MANIA_MAX_TIME_RANGE;
            window.computeManiaScrollTime = computeManiaScrollTime;
            window.getManiaSpeedFactor = getManiaSpeedFactor;
        }

        if (typeof module !== 'undefined' && module.exports) {
            module.exports = {
                findZipEntry,
                getBeatmapBackgroundKey,
                parseTimingPointsFromOsuText,
                getActiveBeatLengthAt,
                getUninheritedTimingPoints,
                getMostCommonBeatLength,
                createManiaScrollState,
                getManiaScrollMultiplierAt,
                getManiaScrollPositionAt,
                getVisibleBarlines,
                MANIA_MIN_TIME_RANGE,
                MANIA_MAX_TIME_RANGE,
                computeManiaScrollTime,
                getManiaSpeedFactor
            };
        }
