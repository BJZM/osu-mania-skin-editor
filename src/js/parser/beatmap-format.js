// ============================================================================
// beatmap-format.js - BeatmapDecoder 获取与 .osu 文本解析
// 依赖：core/state.js
// ============================================================================

// 获取可选的 BeatmapDecoder；主解析流程使用本地原生 parseOsuBeatmap。
async function getBeatmapDecoder() {
    return window.BeatmapDecoder || null;
}


        ui.osz.addEventListener('click', (e) => { e.target.value = ''; });
        ui.osk.addEventListener('click', (e) => { e.target.value = ''; });

        // 纯原生高性能 .osu 谱面解析器 (零外部网络依赖、兼容各版本规范、容错性强、支持 BOM 与单文件直接导入)
        function parseOsuBeatmap(text) {
            if (!text || typeof text !== 'string') return null;
            if (text.charCodeAt(0) === 0xFEFF) {
                text = text.slice(1);
            }
            const lines = text.split(/\r?\n/);
            let section = '';
            const general = {};
            const metadata = {};
            const difficulty = { circleSize: 4, sliderTickRate: 1 };
            const hitObjects = [];
            let bgPath = null;

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                if (!line || line.startsWith('//')) continue;
                if (line.startsWith('[') && line.endsWith(']')) {
                    section = line.slice(1, -1);
                    continue;
                }

                if (section === 'General') {
                    const idx = line.indexOf(':');
                    if (idx > 0) {
                        const k = line.slice(0, idx).trim();
                        const v = line.slice(idx + 1).trim();
                        general[k.charAt(0).toLowerCase() + k.slice(1)] = v;
                        if (k.toLowerCase() === 'audiofilename') general.audioFilename = v;
                        if (k.toLowerCase() === 'mode') general.mode = parseInt(v, 10);
                    }
                } else if (section === 'Metadata') {
                    const idx = line.indexOf(':');
                    if (idx > 0) {
                        const k = line.slice(0, idx).trim();
                        const v = line.slice(idx + 1).trim();
                        metadata[k.charAt(0).toLowerCase() + k.slice(1)] = v;
                    }
                } else if (section === 'Difficulty') {
                    const idx = line.indexOf(':');
                    if (idx > 0) {
                        const k = line.slice(0, idx).trim().toLowerCase();
                        const v = parseFloat(line.slice(idx + 1).trim());
                        if (k === 'circlesize' && !isNaN(v)) difficulty.circleSize = v;
                        if (k === 'slidertickrate' && !isNaN(v)) difficulty.sliderTickRate = v;
                    }
                } else if (section === 'Events') {
                    if (!bgPath) {
                        const m = line.match(/^\s*(?:0|Background)\s*,\s*0\s*,\s*"?([^",\r\n]+?)"?\s*(?:,.*)?$/i);
                        if (m && m[1]) bgPath = m[1].trim();
                    }
                } else if (section === 'HitObjects') {
                    const parts = line.split(',');
                    if (parts.length >= 3) {
                        const x = parseFloat(parts[0]);
                        const y = parseFloat(parts[1]);
                        const time = parseFloat(parts[2]);
                        const type = parts.length >= 4 ? parseInt(parts[3], 10) : 1;
                        let endTime = null;
                        if (parts.length >= 6) {
                            const colonIdx = parts[5].indexOf(':');
                            const rawEnd = colonIdx >= 0 ? parts[5].slice(0, colonIdx) : parts[5];
                            const parsedEnd = parseFloat(rawEnd);
                            if (!isNaN(parsedEnd) && parsedEnd > time) {
                                endTime = parsedEnd;
                            }
                        }
                        if (!isNaN(time)) {
                            hitObjects.push({
                                startX: !isNaN(x) ? x : 256,
                                x: !isNaN(x) ? x : 256,
                                y: !isNaN(y) ? y : 192,
                                startTime: time,
                                endTime: endTime,
                                type: !isNaN(type) ? type : 1
                            });
                        }
                    }
                }
            }

            const mode = general.mode !== undefined ? general.mode : 0;
            return {
                mode: mode,
                general: general,
                metadata: metadata,
                difficulty: difficulty,
                hitObjects: hitObjects,
                bgPath: bgPath
            };
        }
