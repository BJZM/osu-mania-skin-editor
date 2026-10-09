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
                        if (uninherited && beatLength > 0 && !isNaN(time)) {
                            timingPoints.push({ time, beatLength, meter });
                        }
                    }
                }
            }
            timingPoints.sort((a, b) => a.time - b.time);
            return timingPoints;
        }

        function getBeatLengthAt(timingPoints, time) {
            if (!timingPoints || timingPoints.length === 0) return 500;
            let active = timingPoints[0];
            for (let i = 0; i < timingPoints.length; i++) {
                if (timingPoints[i].time <= time) {
                    active = timingPoints[i];
                } else {
                    break;
                }
            }
            return active.beatLength;
        }

        // 计算当前可视视口范围内需要渲染的小节线垂直坐标 (barline Y positions)
        function getVisibleBarlines(timingPoints, currentTime, minTime, maxTime, isPreviewMode, speedFactor, hitPos, isUpsideDown) {
            if (isPreviewMode) {
                // 预览模式：在判定线前后生成静态小节线供视觉预览
                return isUpsideDown
                    ? [hitPos + 220, hitPos + 440]
                    : [hitPos - 220, hitPos - 440];
            }

            const calcY = (t) => isUpsideDown
                ? hitPos + (t - currentTime) * speedFactor
                : hitPos - (t - currentTime) * speedFactor;

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