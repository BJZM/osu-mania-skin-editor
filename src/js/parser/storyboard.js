// ============================================================================
// storyboard.js - osu!stable storyboard / video event parsing
// Stable event behavior cross-checked against kionell/osu-parsers (MIT).
// 依赖：无
// ============================================================================

        const STORYBOARD_COMMAND_NAMES = new Set([
            'F', 'M', 'MX', 'MY', 'S', 'V', 'VX', 'VY', 'R', 'C', 'P'
        ]);
        const STORYBOARD_MAX_SPRITES = 10000;
        const STORYBOARD_MAX_COMMANDS_PER_ELEMENT = 5000;
        const STORYBOARD_MAX_LOOP_ITERATIONS = 10000;

        function splitStoryboardCsv(line) {
            const fields = [];
            let current = '';
            let quoted = false;

            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (quoted && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        quoted = !quoted;
                    }
                } else if (ch === ',' && !quoted) {
                    fields.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
            fields.push(current.trim());
            return fields;
        }

        function normalizeStoryboardPath(path) {
            if (!path) return null;
            const clean = String(path).trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/');
            return clean || null;
        }

        function decodeStoryboardVariables(line, variables) {
            if (!line || !line.includes('$') || variables.size === 0) return line;
            variables.forEach((value, key) => {
                line = line.replace(key, value);
            });
            return line;
        }

        function storyboardNumber(value, fallback = 0) {
            const parsed = parseFloat(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }

        function parseStoryboardColor(values) {
            if (!Array.isArray(values) || values.length < 3) return null;
            const colours = [];
            for (let i = 0; i + 2 < values.length; i += 3) {
                colours.push([
                    Math.max(0, Math.min(255, Math.round(storyboardNumber(values[i], 255)))),
                    Math.max(0, Math.min(255, Math.round(storyboardNumber(values[i + 1], 255)))),
                    Math.max(0, Math.min(255, Math.round(storyboardNumber(values[i + 2], 255))))
                ]);
            }
            return colours.length > 0 ? colours : null;
        }

        function parseStoryboardCommand(fields) {
            if (!fields || fields.length < 4) return null;

            let type = String(fields[0] || '').trim().replace(/^_/, '').toUpperCase();
            if (!STORYBOARD_COMMAND_NAMES.has(type)) return null;

            const raw = fields.slice(1);
            const easing = Math.max(0, Math.min(34, Math.round(storyboardNumber(raw[0], 0))));
            const startTime = storyboardNumber(raw[1], NaN);
            const endTime = storyboardNumber(raw[2], startTime);
            if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;

            let values = raw.slice(3).map(value => storyboardNumber(value, 0));
            if (type === 'C') {
                const colour = parseStoryboardColor(values);
                if (colour) values = colour;
            } else if (type === 'P') {
                values = raw.slice(3)
                    .map(value => String(value || '').trim().toUpperCase())
                    .filter(Boolean);
            } else if (type === 'M' && values.length === 2) {
                values = [values[0], values[1], values[0], values[1]];
            } else if (type === 'V' && values.length === 2) {
                values = [values[0], values[1], values[0], values[1]];
            }

            return {
                type,
                easing,
                startTime,
                endTime: Math.max(startTime, endTime),
                values,
                order: 0
            };
        }

        function parseStoryboardEvents(text, formatVersion = 14) {
            const result = {
                sprites: [],
                video: null,
                backgroundPath: null,
                hasContent: false
            };
            if (!text || typeof text !== 'string') return result;

            const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
            let section = '';
            let currentElement = null;
            let currentTrigger = null;
            let currentLoop = null;
            let commandOrder = 0;
            const variables = new Map();

            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                let depth = 0;
                while (rawLine[depth] === ' ' || rawLine[depth] === '_') depth++;
                let line = rawLine.slice(depth).trim();
                if (!line || line.startsWith('//')) continue;

                if (line.startsWith('[') && line.endsWith(']')) {
                    section = line.slice(1, -1);
                    currentElement = null;
                    currentTrigger = null;
                    currentLoop = null;
                    continue;
                }

                if (section === 'Variables') {
                    if (line.startsWith('$') && line.includes('=')) {
                        const separator = line.indexOf('=');
                        variables.set(
                            line.slice(0, separator).trim(),
                            line.slice(separator + 1).trimEnd()
                        );
                    }
                    continue;
                }

                line = decodeStoryboardVariables(line, variables);
                if (section !== 'Events') continue;

                const fields = splitStoryboardCsv(line);
                if (fields.length === 0) continue;

                const token = String(fields[0] || '').replace(/^_/, '');
                const tokenLower = token.toLowerCase();
                const commandType = token.toUpperCase();

                const isAnimation = tokenLower === 'animation' || token === '6';
                const isSprite = tokenLower === 'sprite' || token === '3' || token === '4';
                if (isSprite || isAnimation) {
                    if (result.sprites.length >= STORYBOARD_MAX_SPRITES) {
                        currentElement = null;
                        currentTrigger = null;
                        currentLoop = null;
                        continue;
                    }
                    const layer = fields[1] || 'Background';
                    const origin = fields[2] || 'TopLeft';
                    const path = normalizeStoryboardPath(fields[3]);
                    if (!path) {
                        currentElement = null;
                        currentTrigger = null;
                        continue;
                    }

                    const rawFrameDelay = storyboardNumber(fields[7], 100);
                    const frameDelay = formatVersion < 6
                        ? Math.round(0.015 * rawFrameDelay) * 1.186 * (1000 / 60)
                        : rawFrameDelay;

                    currentElement = {
                        kind: isAnimation ? 'animation' : 'sprite',
                        layer,
                        origin,
                        path,
                        x: storyboardNumber(fields[4], 0),
                        y: storyboardNumber(fields[5], 0),
                        frameCount: isAnimation ? Math.max(1, Math.round(storyboardNumber(fields[6], 1))) : 1,
                        frameDelay: isAnimation ? Math.max(1, frameDelay) : 0,
                        loopType: isAnimation ? String(fields[8] || 'LoopForever').trim() : '',
                        commands: [],
                        order: result.sprites.length
                    };
                    currentTrigger = null;
                    currentLoop = null;
                    result.sprites.push(currentElement);
                    result.hasContent = true;
                    continue;
                }

                if (tokenLower === 'video' || token === '1') {
                    let offset = 0;
                    let path = null;
                    if (fields.length >= 3) {
                        offset = storyboardNumber(fields[1], 0);
                        path = normalizeStoryboardPath(fields[2]);
                    } else if (fields.length === 2) {
                        path = normalizeStoryboardPath(fields[1]);
                    }
                    if (path && !result.video) {
                        result.video = {
                            path,
                            offset: Number.isFinite(offset) ? offset : 0
                        };
                        result.hasContent = true;
                    }
                    currentElement = null;
                    currentTrigger = null;
                    currentLoop = null;
                    continue;
                }

                if (tokenLower === 'background' || token === '0') {
                    const path = normalizeStoryboardPath(fields[2]);
                    if (path && !result.backgroundPath) {
                        result.backgroundPath = path;
                        result.hasContent = true;
                    }
                    currentElement = null;
                    currentTrigger = null;
                    currentLoop = null;
                    continue;
                }

                if (token === '2' || token === '5' || tokenLower === 'sample') {
                    currentElement = null;
                    currentTrigger = null;
                    currentLoop = null;
                    continue;
                }

                if (tokenLower === 't') {
                    currentTrigger = {
                        name: String(fields[1] || '').trim(),
                        startTime: storyboardNumber(fields[2], 0),
                        endTime: storyboardNumber(fields[3], NaN)
                    };
                    currentLoop = null;
                    continue;
                }

                if (tokenLower === 'l') {
                    currentTrigger = null;
                    currentLoop = {
                        startTime: storyboardNumber(fields[1], 0),
                        iterations: Math.max(
                            1,
                            Math.min(
                                STORYBOARD_MAX_LOOP_ITERATIONS,
                                Math.round(storyboardNumber(fields[2], 1))
                            )
                        ),
                        depth
                    };
                    continue;
                }

                if (currentElement &&
                    currentElement.commands.length < STORYBOARD_MAX_COMMANDS_PER_ELEMENT &&
                    STORYBOARD_COMMAND_NAMES.has(commandType)) {
                    const command = parseStoryboardCommand(fields);
                    if (command) {
                        command.order = commandOrder++;
                        if (currentTrigger) {
                            command.trigger = {
                                name: currentTrigger.name,
                                startTime: currentTrigger.startTime,
                                endTime: currentTrigger.endTime
                            };
                        }
                        if (currentLoop && depth > currentLoop.depth) {
                            command.loop = currentLoop;
                        }
                        currentElement.commands.push(command);
                    }
                }
            }

            return result;
        }

        function mergeStoryboardData(...parts) {
            const merged = {
                sprites: [],
                video: null,
                backgroundPath: null,
                hasContent: false
            };

            for (const part of parts) {
                if (!part) continue;
                if (Array.isArray(part.sprites) && part.sprites.length > 0) {
                    const offset = merged.sprites.length;
                    for (const sprite of part.sprites) {
                        merged.sprites.push({
                            ...sprite,
                            order: offset + (Number.isFinite(sprite.order) ? sprite.order : merged.sprites.length)
                        });
                    }
                }
                if (part.video && part.video.path) merged.video = part.video;
                if (part.backgroundPath) merged.backgroundPath = part.backgroundPath;
                if (part.hasContent) merged.hasContent = true;
            }

            merged.hasContent = merged.hasContent || merged.sprites.length > 0 ||
                !!(merged.video && merged.video.path) || !!merged.backgroundPath;
            return merged;
        }

        function findStoryboardEntryForBeatmap(osuPath, entries) {
            if (!Array.isArray(entries) || entries.length === 0) return null;

            const normalize = value => String(value || '').replace(/\\/g, '/').toLowerCase();
            const beatmapPath = normalize(osuPath);
            const beatmapDir = beatmapPath.includes('/') ? beatmapPath.slice(0, beatmapPath.lastIndexOf('/')) : '';
            const beatmapBase = beatmapPath.split('/').pop().replace(/\.osu$/i, '');

            return entries.find(entry => {
                const entryPath = normalize(entry.path);
                const entryBase = entryPath.split('/').pop().replace(/\.osb$/i, '');
                return entryBase === beatmapBase;
            }) || entries.find(entry => {
                const entryPath = normalize(entry.path);
                const entryDir = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/')) : '';
                return entryDir === beatmapDir;
            }) || entries.find(entry => !normalize(entry.path).includes('/')) || entries[0];
        }
