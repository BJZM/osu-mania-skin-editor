// ============================================================================
// hitsound-playback.js - 谱面 / 皮肤打击音效解析、预解码与多音混播
// 依赖：skin-hitsound-assets、beatmap timing、transport 效果音量、Web Audio
// ============================================================================

        const MANIA_HITSOUND_SAMPLE_SET_NAMES = Object.freeze({
            1: 'normal',
            2: 'soft',
            3: 'drum'
        });
        const MANIA_HITSOUND_ADDITIONS = Object.freeze([
            { bit: 2, sound: 'hitwhistle' },
            { bit: 4, sound: 'hitfinish' },
            { bit: 8, sound: 'hitclap' }
        ]);
        const MANIA_HITSOUND_EXTENSIONS = Object.freeze(['wav', 'mp3', 'ogg']);

        let maniaHitsoundAudioContext = null;
        let maniaHitsoundMasterGain = null;
        let maniaHitsoundBufferCache = new Map();
        let maniaHitsoundActiveSources = new Set();
        let maniaHitsoundPrepareToken = 0;
        let maniaHitsoundPlaybackStats = {
            ready: false,
            noteCount: 0,
            resolvedNoteCount: 0,
            loadedSampleCount: 0,
            failedSampleCount: 0,
            missingBufferCount: 0,
            triggerCount: 0,
            sourceCount: 0,
            skippedMutedCount: 0,
            lastPlayed: []
        };

        function getManiaHitsoundAudioContext() {
            if (maniaHitsoundAudioContext) return maniaHitsoundAudioContext;
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            try {
                maniaHitsoundAudioContext = new AudioContextClass();
                maniaHitsoundMasterGain = maniaHitsoundAudioContext.createGain();
                maniaHitsoundMasterGain.gain.value = typeof getEffectVolume === 'function'
                    ? getEffectVolume()
                    : 0.8;
                maniaHitsoundMasterGain.connect(maniaHitsoundAudioContext.destination);
            } catch (error) {
                console.warn('无法创建打击音效音频上下文:', error);
                maniaHitsoundAudioContext = null;
                maniaHitsoundMasterGain = null;
            }
            return maniaHitsoundAudioContext;
        }

        function syncManiaHitsoundVolume() {
            if (!maniaHitsoundAudioContext || !maniaHitsoundMasterGain) return;
            const value = typeof getEffectVolume === 'function' ? getEffectVolume() : 0;
            try {
                maniaHitsoundMasterGain.gain.setValueAtTime(value, maniaHitsoundAudioContext.currentTime);
            } catch (_) {}
        }

        function resumeManiaHitsoundPlayback() {
            const context = getManiaHitsoundAudioContext();
            if (!context) return Promise.resolve();
            syncManiaHitsoundVolume();
            if (context.state === 'suspended' && typeof context.resume === 'function') {
                return context.resume().catch(() => {});
            }
            return Promise.resolve();
        }

        function stopActiveManiaHitsounds() {
            for (const source of maniaHitsoundActiveSources) {
                try { source.stop(); } catch (_) {}
            }
            maniaHitsoundActiveSources.clear();
        }

        function disposeManiaHitsoundPlayback() {
            maniaHitsoundPrepareToken++;
            stopActiveManiaHitsounds();
            maniaHitsoundBufferCache.clear();
            maniaHitsoundPlaybackStats = {
                ready: false,
                noteCount: 0,
                resolvedNoteCount: 0,
                loadedSampleCount: 0,
                failedSampleCount: 0,
                missingBufferCount: 0,
                triggerCount: 0,
                sourceCount: 0,
                skippedMutedCount: 0,
                lastPlayed: []
            };
            for (const note of activeNotes || []) {
                note.hitsoundSampleRefs = [];
            }
        }

        function getActiveManiaTimingSampleSettings(time) {
            const points = (currentTimingPoints || [])
                .filter((point) => point && isFinite(point.time) && point.time <= time)
                .sort((left, right) => left.time - right.time);
            let sampleSet = 1;
            let sampleIndex = 0;
            let volume = 100;
            for (const point of points) {
                if (point.sampleSet > 0) sampleSet = point.sampleSet;
                if (point.sampleIndex > 0) sampleIndex = point.sampleIndex;
                if (point.volume > 0) volume = point.volume;
            }
            return { sampleSet, sampleIndex, volume };
        }

        function resolveBeatmapAudioFile(filename) {
            if (!currentOszZip || !filename) return null;
            const raw = String(filename).trim().replace(/\\/g, '/');
            if (!raw) return null;
            const hasExtension = /\.[^.]+$/.test(raw);
            const candidates = hasExtension
                ? [raw]
                : MANIA_HITSOUND_EXTENSIONS.map((extension) => `${raw}.${extension}`);
            for (const candidate of candidates) {
                const path = findZipEntry(currentOszZip, candidate);
                if (!path || currentOszZip.files[path].dir) continue;
                return {
                    source: 'beatmap',
                    path,
                    key: `beatmap:${path.replace(/\\/g, '/').toLowerCase()}`,
                    filename: candidate
                };
            }
            return null;
        }

        function resolveSkinAudioFile(filename) {
            if (!currentSkinZip || !filename) return null;
            const raw = String(filename).trim().replace(/\\/g, '/');
            if (!raw) return null;
            const hasExtension = /\.[^.]+$/.test(raw);
            const candidates = hasExtension
                ? [raw]
                : MANIA_HITSOUND_EXTENSIONS.map((extension) => `${raw}.${extension}`);
            for (const candidate of candidates) {
                const path = findZipEntry(currentSkinZip, candidate);
                if (!path || currentSkinZip.files[path].dir) continue;
                return {
                    source: 'skin',
                    path,
                    key: `skin:${path.replace(/\\/g, '/').toLowerCase()}`,
                    filename: candidate
                };
            }
            return null;
        }

        function resolveDefaultSkinAudioFile(filename) {
            if (!filename || typeof getDefaultSkinHitsoundRecord !== 'function') return null;
            const raw = String(filename).trim().replace(/\\/g, '/');
            if (!raw) return null;
            const hasExtension = /\.[^.]+$/.test(raw);
            const candidates = hasExtension
                ? [raw]
                : MANIA_HITSOUND_EXTENSIONS.map((extension) => `${raw}.${extension}`);
            for (const candidate of candidates) {
                const record = getDefaultSkinHitsoundRecord(candidate);
                if (!record) continue;
                return {
                    source: 'default',
                    path: record.path,
                    key: `default:${record.path.replace(/\\/g, '/').toLowerCase()}`,
                    filename: candidate
                };
            }
            return null;
        }

        function resolveStandardHitsound(sampleSetName, sound, sampleIndex) {
            const indexSuffix = sampleIndex > 1 ? String(sampleIndex) : '';
            const stemCandidates = [];
            if (sampleSetName) {
                stemCandidates.push(`${sampleSetName}-${sound}${indexSuffix}`);
                if (indexSuffix) stemCandidates.push(`${sampleSetName}-${sound}`);
            }
            stemCandidates.push(`${sound}${indexSuffix}`);
            if (indexSuffix) stemCandidates.push(sound);

            const uniqueStems = Array.from(new Set(stemCandidates));
            for (const stem of uniqueStems) {
                const beatmapFile = resolveBeatmapAudioFile(stem);
                if (beatmapFile) return beatmapFile;
            }

            const effectiveSkinCatalog = typeof getEffectiveSkinHitsoundCatalog === 'function'
                ? getEffectiveSkinHitsoundCatalog()
                : skinHitsoundCatalog;
            for (const stem of uniqueStems) {
                const entry = effectiveSkinCatalog instanceof Map
                    ? effectiveSkinCatalog.get(stem)
                    : null;
                if (!entry || !entry.selectedPath) continue;
                const source = entry.source === 'default'
                    ? 'default'
                    : (entry.source === 'replacement' ? 'replacement' : 'skin');
                if (source === 'skin' && !currentSkinZip) continue;
                return {
                    source,
                    path: entry.selectedPath,
                    key: `${source}:${entry.selectedPath.replace(/\\/g, '/').toLowerCase()}`,
                    filename: entry.selectedPath
                };
            }
            return null;
        }

        function getManiaNoteHitsoundSettings(note) {
            const timing = getActiveManiaTimingSampleSettings(note.startTime);
            const hitSample = note.hitSample || parseOsuHitSample('');
            const sampleSet = hitSample.normalSet > 0 ? hitSample.normalSet : timing.sampleSet;
            const additionSet = hitSample.additionSet > 0 ? hitSample.additionSet : sampleSet;
            const sampleIndex = hitSample.index > 0 ? hitSample.index : timing.sampleIndex;
            const volume = hitSample.volume > 0 ? hitSample.volume : timing.volume;
            return {
                hitSound: Number(note.hitSound) || 0,
                sampleSet,
                additionSet,
                sampleIndex,
                volume,
                filename: hitSample.filename || ''
            };
        }

        function buildManiaNoteHitsoundRefs(note) {
            const settings = getManiaNoteHitsoundSettings(note);
            const refs = [];
            const sampleSetName = MANIA_HITSOUND_SAMPLE_SET_NAMES[settings.sampleSet] || 'normal';
            const additionSetName = MANIA_HITSOUND_SAMPLE_SET_NAMES[settings.additionSet] || sampleSetName;
            const additions = MANIA_HITSOUND_ADDITIONS.filter((addition) =>
                (settings.hitSound & addition.bit) !== 0
            );
            const layeredSetting = currentSkinMetadata &&
                currentSkinMetadata.general &&
                currentSkinMetadata.general.LayeredHitSounds;
            const layeredHitSounds = !(String(layeredSetting) === '0' || layeredSetting === 0 || layeredSetting === false);

            let normalFile = null;
            if (settings.filename) {
                normalFile = resolveBeatmapAudioFile(settings.filename) ||
                    resolveSkinAudioFile(settings.filename) ||
                    resolveDefaultSkinAudioFile(settings.filename);
            }
            if (!normalFile && (layeredHitSounds || additions.length === 0)) {
                normalFile = resolveStandardHitsound(sampleSetName, 'hitnormal', settings.sampleIndex);
            }
            if (normalFile) {
                refs.push({ ...normalFile, sound: 'hitnormal', volume: settings.volume });
            }

            for (const addition of additions) {
                const file = resolveStandardHitsound(additionSetName, addition.sound, settings.sampleIndex);
                if (file) refs.push({ ...file, sound: addition.sound, volume: settings.volume });
            }
            return refs;
        }

        async function loadManiaHitsoundBuffer(ref, context, token) {
            if (!ref || !ref.key) return null;
            if (maniaHitsoundBufferCache.has(ref.key)) {
                const cached = maniaHitsoundBufferCache.get(ref.key);
                if (!cached || typeof cached.then !== 'function') return cached;
                const buffer = await cached;
                if (buffer) maniaHitsoundBufferCache.set(ref.key, buffer);
                return buffer;
            }
            let bytesPromise = null;
            if (typeof getSkinHitsoundReplacementBytes === 'function') {
                const replacementBytes = getSkinHitsoundReplacementBytes(ref.path);
                if (replacementBytes) {
                    bytesPromise = Promise.resolve(
                        replacementBytes.buffer.slice(
                            replacementBytes.byteOffset,
                            replacementBytes.byteOffset + replacementBytes.byteLength
                        )
                    );
                }
            }
            if (!bytesPromise) {
                if (ref.source === 'default') {
                    const defaultBytes = typeof getDefaultSkinHitsoundBytes === 'function'
                        ? getDefaultSkinHitsoundBytes(ref.path)
                        : null;
                    if (!defaultBytes) return null;
                    bytesPromise = Promise.resolve(
                        defaultBytes.buffer.slice(
                            defaultBytes.byteOffset,
                            defaultBytes.byteOffset + defaultBytes.byteLength
                        )
                    );
                } else {
                    const zip = ref.source === 'skin' ? currentSkinZip : currentOszZip;
                    const file = zip && zip.file(ref.path);
                    if (!file) return null;
                    bytesPromise = file.async('arraybuffer');
                }
            }

            const promise = bytesPromise.then((arrayBuffer) =>
                context.decodeAudioData(arrayBuffer.slice(0))
            );
            maniaHitsoundBufferCache.set(ref.key, promise);
            try {
                const buffer = await promise;
                maniaHitsoundBufferCache.set(ref.key, buffer);
                return buffer;
            } catch (error) {
                if (token === maniaHitsoundPrepareToken) {
                    console.warn(`打击音效解码失败: ${ref.path}`, error);
                }
                maniaHitsoundBufferCache.delete(ref.key);
                return null;
            }
        }

        async function prepareManiaHitsoundPlayback() {
            const token = ++maniaHitsoundPrepareToken;
            stopActiveManiaHitsounds();
            maniaHitsoundPlaybackStats.ready = false;
            if (!currentBeatmap || !Array.isArray(activeNotes) || activeNotes.length === 0) {
                maniaHitsoundPlaybackStats.ready = true;
                return getManiaHitsoundDebugSnapshot();
            }

            if (typeof ensureDefaultSkinHitsoundsLoaded === 'function') {
                await ensureDefaultSkinHitsoundsLoaded();
            }

            const context = getManiaHitsoundAudioContext();
            if (!context) {
                maniaHitsoundPlaybackStats.ready = true;
                return getManiaHitsoundDebugSnapshot();
            }

            const refsByKey = new Map();
            let resolvedNoteCount = 0;
            for (const note of activeNotes) {
                const refs = buildManiaNoteHitsoundRefs(note);
                note.hitsoundSampleRefs = refs;
                if (refs.length > 0) resolvedNoteCount++;
                for (const ref of refs) {
                    if (!refsByKey.has(ref.key)) refsByKey.set(ref.key, ref);
                }
            }

            const loadedKeys = new Set();
            const failedKeys = new Set();
            await Promise.all(Array.from(refsByKey.values(), async (ref) => {
                const buffer = await loadManiaHitsoundBuffer(ref, context, token);
                if (buffer) loadedKeys.add(ref.key);
                else failedKeys.add(ref.key);
            }));
            if (token !== maniaHitsoundPrepareToken) return getManiaHitsoundDebugSnapshot();

            let missingBufferCount = 0;
            for (const note of activeNotes) {
                for (const ref of note.hitsoundSampleRefs || []) {
                    const buffer = maniaHitsoundBufferCache.get(ref.key);
                    if (!buffer || typeof buffer.then === 'function' || !buffer.duration) {
                        missingBufferCount++;
                    }
                }
            }
            maniaHitsoundPlaybackStats = {
                ready: true,
                noteCount: activeNotes.length,
                resolvedNoteCount,
                loadedSampleCount: loadedKeys.size,
                failedSampleCount: failedKeys.size,
                missingBufferCount,
                triggerCount: 0,
                sourceCount: 0,
                skippedMutedCount: 0,
                lastPlayed: []
            };
            syncManiaHitsoundVolume();
            return getManiaHitsoundDebugSnapshot();
        }

        function playManiaHitSound(note, currentTime) {
            if (!note || !maniaHitsoundAudioContext || !maniaHitsoundMasterGain) return 0;
            const refs = Array.isArray(note.hitsoundSampleRefs) ? note.hitsoundSampleRefs : [];
            if (refs.length === 0) return 0;
            const effectiveVolume = typeof getEffectVolume === 'function' ? getEffectVolume() : 0;
            if (effectiveVolume <= 0) {
                maniaHitsoundPlaybackStats.skippedMutedCount++;
                return 0;
            }

            syncManiaHitsoundVolume();
            let started = 0;
            for (const ref of refs) {
                const buffer = maniaHitsoundBufferCache.get(ref.key);
                if (!buffer || typeof buffer === 'string' || !buffer.duration) continue;
                try {
                    const source = maniaHitsoundAudioContext.createBufferSource();
                    const sampleGain = maniaHitsoundAudioContext.createGain();
                    source.buffer = buffer;
                    sampleGain.gain.value = Math.max(0, Math.min(1, (Number(ref.volume) || 100) / 100));
                    source.connect(sampleGain);
                    sampleGain.connect(maniaHitsoundMasterGain);
                    source.onended = () => maniaHitsoundActiveSources.delete(source);
                    maniaHitsoundActiveSources.add(source);
                    source.start();
                    started++;
                    maniaHitsoundPlaybackStats.sourceCount++;
                    if (maniaHitsoundPlaybackStats.lastPlayed.length >= 30) {
                        maniaHitsoundPlaybackStats.lastPlayed.shift();
                    }
                    maniaHitsoundPlaybackStats.lastPlayed.push({
                        noteTime: note.startTime,
                        playbackTime: currentTime,
                        source: ref.source,
                        path: ref.path,
                        sound: ref.sound,
                        volume: ref.volume
                    });
                } catch (error) {
                    console.warn(`播放打击音效失败: ${ref.path}`, error);
                }
            }
            if (started > 0) maniaHitsoundPlaybackStats.triggerCount++;
            return started;
        }

        function getManiaHitsoundDebugSnapshot() {
            return {
                ready: !!maniaHitsoundPlaybackStats.ready,
                contextState: maniaHitsoundAudioContext ? maniaHitsoundAudioContext.state : 'unavailable',
                noteCount: maniaHitsoundPlaybackStats.noteCount,
                resolvedNoteCount: maniaHitsoundPlaybackStats.resolvedNoteCount,
                loadedSampleCount: maniaHitsoundPlaybackStats.loadedSampleCount,
                failedSampleCount: maniaHitsoundPlaybackStats.failedSampleCount,
                missingBufferCount: maniaHitsoundPlaybackStats.missingBufferCount,
                triggerCount: maniaHitsoundPlaybackStats.triggerCount,
                sourceCount: maniaHitsoundPlaybackStats.sourceCount,
                skippedMutedCount: maniaHitsoundPlaybackStats.skippedMutedCount,
                lastPlayed: maniaHitsoundPlaybackStats.lastPlayed.slice()
            };
        }
