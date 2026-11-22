// ============================================================================
// skin-ini.js - skin.ini 解析、字体前缀规则与 Mania 配置写入
// 依赖：core/state.js
// ============================================================================

        // skin.ini NoteBodyStyle: 0=Stretch, 1=FromTail, 2=FromHead, 3=TopAndBottom。
        // 同时兼容部分旧 skin 使用的 4=TopAndBottom。
        // 内部统一使用 0=Stretch, 1=FromTail, 2=FromHead, 3=TopAndBottom。
        function normalizeNoteBodyStyleValue(value) {
            const text = String(value == null ? '' : value).trim();
            const raw = parseInt(text, 10);
            if (!isNaN(raw)) {
                if (raw === 0) return NOTE_BODY_STYLE.Stretch;
                if (raw === 1) return NOTE_BODY_STYLE.RepeatFromTail;
                if (raw === 2) return NOTE_BODY_STYLE.RepeatFromHead;
                if (raw === 3 || raw === 4) return NOTE_BODY_STYLE.RepeatTopAndBottom;
                return null;
            }

            const low = text.toLowerCase();
            if (low === 'stretch') return NOTE_BODY_STYLE.Stretch;
            if (low.includes('topandbottom') || low.includes('topandb') || low.includes('both')) {
                return NOTE_BODY_STYLE.RepeatTopAndBottom;
            }
            if (low === 'repeatfromtail' || low === 'repeattail' || low.includes('top')) {
                return NOTE_BODY_STYLE.RepeatFromTail;
            }
            if (low === 'repeatfromhead' || low === 'repeathead' || low.includes('bottom')) {
                return NOTE_BODY_STYLE.RepeatFromHead;
            }
            return null;
        }

        // 连击数字 (Combo) 字体贴图前缀解析 —— 唯一真源，renderer.js 与 ui.js 必须共用。
        //  1. [Mania] FontCombo  : 键位区块内单独指定连击数字使用的贴图组 (优先级最高)
        //  2. [Fonts] ComboPrefix : 全局连击数字贴图前缀 (仅 ini 显式写了才算)
        //     单独的 Combo: 不是这个键。stable 不读取它，连击会退回 score。
        // 两者都没有时返回 null，语义 = 「连击数字与 score 共用同一套字体贴图」。
        // 注意：不要在这里做「名字必须含 score」的过滤，FontCombo 就是用来指定非 score 命名的贴图组的。
        function getExplicitComboFontPrefix(keyCount) {
            const cfg = (keyCount != null) ? getManiaConfigForKeys(keyCount) : null;
            if (cfg && cfg.FontCombo != null) {
                const v = String(cfg.FontCombo).trim();
                if (v) return v;
            }
            if (skinFontsConfig.hasExplicitComboPrefix && skinFontsConfig.comboPrefix) {
                const v = String(skinFontsConfig.comboPrefix).trim();
                if (v) return v;
            }
            return null;
        }

        // 根据前缀与目标字符生成候选贴图标识（包含常规数字、百分号、小数点、逗号、连击x及备选格式）
        function parseSkinIniLazer(text) {
            function splitKeyVal(line) {
                const commentIdx1 = line.indexOf('//');
                if (commentIdx1 >= 0) line = line.substring(0, commentIdx1);
                const commentIdx2 = line.indexOf('#');
                if (commentIdx2 >= 0) line = line.substring(0, commentIdx2);
                const idx = line.indexOf(':');
                if (idx < 0) return null;
                return { Key: line.substring(0, idx).trim(), Value: line.substring(idx + 1).trim() };
            }
            function parseArrayValue(value, output, applyScaleFactor) {
                const parts = value.split(',');
                if (parts.length === 1 && output.length > 1) {
                    let v = parseFloat(parts[0].trim());
                    if (!isNaN(v)) {
                        if (applyScaleFactor) v *= STABLE_MAGIC_SCALE_FACTOR;
                        output.fill(v);
                        return;
                    }
                }
                for (let i = 0; i < parts.length; i++) {
                    if (i >= output.length) break;
                    let v = parseFloat(parts[i].trim());
                    if (isNaN(v)) v = 0;
                    if (applyScaleFactor) v *= STABLE_MAGIC_SCALE_FACTOR;
                    output[i] = v;
                }
            }
            function createConfig(keys) {
                const DEFAULT_COLUMN_SIZE = 30;
                const DEFAULT_HIT_POSITION = 402;
                const cw = new Array(keys); cw.fill(DEFAULT_COLUMN_SIZE);
                const clw = new Array(keys + 1); clw.fill(2);
                const cs = new Array(Math.max(0, keys - 1)); cs.fill(0);
                const ew = new Array(keys); ew.fill(0);
                const hlw = new Array(keys); hlw.fill(0);
                const colLight = new Array(keys);
                for (let i = 0; i < keys; i++) colLight[i] = { r: 255, g: 255, b: 255, a: 255 };
                const colColours = new Array(keys);
                for (let i = 0; i < keys; i++) colColours[i] = { r: 0, g: 0, b: 0, a: 255 };
                return {
                    Keys: keys,
                    SkinVersion: globalSkinVersion,
                    CustomColours: {},
                    ImageLookups: new Map(),
                    WidthForNoteHeightScale: 0,
                    ColumnLineWidth: clw,
                    ColumnSpacing: cs,
                    ColumnWidth: cw,
                    ColumnColour: colColours,
                    ExplosionWidth: ew,
                    ComboBreakColour: { r: 255, g: 0, b: 0 },
                    ColourHold: { r: 255, g: 191, b: 51, a: 255 },
                    ColourLight: colLight,
                    GlobalColourLight: null,
                    HoldNoteLightWidth: hlw,
                    HitPosition: DEFAULT_HIT_POSITION,
                    LightPosition: 413,
                    ComboPosition: 111,
                    ScorePosition: 300,
                    FontCombo: null,
                    ComboOverlap: null,
                    FontScore: null,
                    ScoreOverlap: null,
                    BarLineHeight: 1.2,
                    ColourBarline: { r: 255, g: 255, b: 255, a: 255 },
                    ShowJudgementLine: true,
                    KeysUnderNotes: globalKeysUnderNotes !== undefined ? globalKeysUnderNotes : 0,
                    LightFramePerSecond: 60,
                    NoteBodyStyle: null,
                    NoteBodyStyles: new Array(keys).fill(null),
                    ColumnStart: 136,
                    ColumnRight: 19,
                    UpsideDown: false,
                    SplitStages: false,
                    StageSeparation: 40,
                    FlipSettings: new Map(),
                };
            }

            const output = [];
            let currentConfig = null;
            const pendingLines = [];

            globalSkinImageLookups.clear();
            let globalKeysUnderNotes = 0;
            // 注意：这里不能再用 let 声明，否则会遮蔽顶层的 globalSkinVersion，
            // 使 renderer.js / getManiaSkinConfig 读到的仍是旧值（甚至抛 ReferenceError）。
            // 每次解析 skin.ini 都重置为默认值，再按 [General] Version 覆盖。
            globalSkinVersion = 2.7; // 默认最新版本 (>= 2.5)

            currentSkinMetadata = {
                general: {
                    Name: 'Custom Mania Skin',
                    Author: 'Unknown',
                    Version: 'latest',
                    AnimationFramerate: 60,
                },
                colours: {},
                fonts: {},
                rawSections: {},
                rawIniText: text
            };

            const lines = text.split(/\r?\n/);
            let section = '';
            let sectionOriginal = '';

            for (const rawLine of lines) {
                let line = rawLine;
                const headerMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
                if (headerMatch) {
                    if (currentConfig !== null) flushPendingLazer();
                    pendingLines.length = 0;
                    currentConfig = null;
                    sectionOriginal = headerMatch[1].trim();
                    section = officialSkinIniSection(sectionOriginal) || '';
                    if (section === 'Mania') {
                        // 进入新的 [Mania] 区块，创建临时配置对象
                        currentConfig = createConfig(0);
                    }
                    continue;
                }

                const pair = splitKeyVal(line);
                if (!pair) continue;

                // 正式键按 wiki 拼写保存；不认识的键保留原文，导出时原样接回。
                const storedKey = officialSkinIniKeyName(section, pair.Key) || pair.Key;
                if (section === 'General') {
                    currentSkinMetadata.general[storedKey] = pair.Value;
                } else if (section === 'Colours') {
                    currentSkinMetadata.colours[storedKey] = pair.Value;
                } else if (section === 'Fonts') {
                    currentSkinMetadata.fonts[storedKey] = pair.Value;
                } else if (!section && sectionOriginal) {
                    if (!currentSkinMetadata.rawSections[sectionOriginal]) currentSkinMetadata.rawSections[sectionOriginal] = {};
                    currentSkinMetadata.rawSections[sectionOriginal][pair.Key] = pair.Value;
                } else if (section && section !== 'Mania') {
                    if (!currentSkinMetadata.rawSections[section]) currentSkinMetadata.rawSections[section] = {};
                    currentSkinMetadata.rawSections[section][storedKey] = pair.Value;
                }

                const K = pair.Key, V = pair.Value;
                if (section === 'General' && K === 'Version') {
                    const rawVal = V.trim().toLowerCase();
                    if (rawVal === 'latest') {
                        globalSkinVersion = 2.7;
                    } else {
                        const vNum = parseFloat(rawVal);
                        if (!isNaN(vNum)) globalSkinVersion = vNum;
                    }
                    if (currentConfig) currentConfig.SkinVersion = globalSkinVersion;
                }
                if (section === 'Mania' && isOfficialManiaImageKey(K)) {
                    globalSkinImageLookups.set(K, V);
                }

                // osu! wiki 规范: 解析 [Fonts] 区块。只认 ComboPrefix，不把 Combo 当成前缀。
                if (section === 'Fonts') {
                    switch (K) {
                        case 'ScorePrefix':
                            skinFontsConfig.scorePrefix = V.trim();
                            break;
                        case 'ScoreOverlap': {
                            const n = parseInt(V.trim(), 10);
                            if (!isNaN(n)) {
                                skinFontsConfig.scoreOverlap = n;
                                skinFontsConfig.hasExplicitScoreOverlap = true;
                            }
                            break;
                        }
                        case 'ComboPrefix': {
                            skinFontsConfig.comboPrefix = V.trim() || 'combo';
                            skinFontsConfig.hasExplicitComboPrefix = true;
                            break;
                        }
                        case 'ComboOverlap': {
                            const n = parseInt(V.trim(), 10);
                            if (!isNaN(n)) {
                                skinFontsConfig.comboOverlap = n;
                                skinFontsConfig.hasExplicitComboOverlap = true;
                            }
                            break;
                        }
                        case 'HitCirclePrefix':
                            skinFontsConfig.hitCirclePrefix = V.trim();
                            break;
                        case 'HitCircleOverlap': {
                            const n = parseInt(V.trim(), 10);
                            if (!isNaN(n)) skinFontsConfig.hitCircleOverlap = n;
                            break;
                        }
                    }
                    continue;
                }

                if (section !== 'Mania') continue;

                if (pair.Key === 'Keys') {
                    const n = parseInt(pair.Value, 10);
                    if (!isNaN(n) && n > 0) {
                        if (!currentConfig) currentConfig = createConfig(n);
                        currentConfig.Keys = n;
                        // 初始化各数组长度为 n
                        if (!currentConfig.ColumnWidth || currentConfig.ColumnWidth.length !== n) {
                            const oldW = currentConfig.ColumnWidth;
                            currentConfig.ColumnWidth = new Array(n).fill(30);
                            if (oldW && oldW.length > 0) {
                                for (let i = 0; i < Math.min(n, oldW.length); i++) currentConfig.ColumnWidth[i] = oldW[i];
                            }
                        }
                        const spacingCount = Math.max(0, n - 1);
                        if (!currentConfig.ColumnSpacing || currentConfig.ColumnSpacing.length !== spacingCount) {
                            const oldS = currentConfig.ColumnSpacing;
                            currentConfig.ColumnSpacing = new Array(spacingCount).fill(0);
                            if (oldS && oldS.length > 0) {
                                for (let i = 0; i < Math.min(spacingCount, oldS.length); i++) currentConfig.ColumnSpacing[i] = oldS[i];
                            }
                        }
                        if (!currentConfig.ColumnLineWidth || currentConfig.ColumnLineWidth.length !== n + 1) {
                            const oldL = currentConfig.ColumnLineWidth;
                            currentConfig.ColumnLineWidth = new Array(n + 1).fill(2);
                            if (oldL && oldL.length > 0) {
                                for (let i = 0; i < Math.min(n + 1, oldL.length); i++) currentConfig.ColumnLineWidth[i] = oldL[i];
                            }
                        }
                        if (!currentConfig.ExplosionWidth || currentConfig.ExplosionWidth.length !== n) {
                            const oldEw = currentConfig.ExplosionWidth;
                            currentConfig.ExplosionWidth = new Array(n).fill(0);
                            if (oldEw && oldEw.length > 0) {
                                for (let i = 0; i < Math.min(n, oldEw.length); i++) currentConfig.ExplosionWidth[i] = oldEw[i];
                            }
                        }
                        if (!currentConfig.HoldNoteLightWidth || currentConfig.HoldNoteLightWidth.length !== n) {
                            const oldHlw = currentConfig.HoldNoteLightWidth;
                            currentConfig.HoldNoteLightWidth = new Array(n).fill(0);
                            if (oldHlw && oldHlw.length > 0) {
                                for (let i = 0; i < Math.min(n, oldHlw.length); i++) currentConfig.HoldNoteLightWidth[i] = oldHlw[i];
                            }
                        }
                        if (!currentConfig.ColourLight || currentConfig.ColourLight.length !== n) {
                            const oldCl = currentConfig.ColourLight;
                            currentConfig.ColourLight = new Array(n);
                            for (let i = 0; i < n; i++) {
                                currentConfig.ColourLight[i] = (oldCl && oldCl[i]) ? oldCl[i] : (currentConfig.GlobalColourLight || { r: 255, g: 255, b: 255, a: 255 });
                            }
                        }
                        if (!currentConfig.ColumnColour || currentConfig.ColumnColour.length !== n) {
                            const oldCc = currentConfig.ColumnColour;
                            currentConfig.ColumnColour = new Array(n);
                            for (let i = 0; i < n; i++) {
                                currentConfig.ColumnColour[i] = (oldCc && oldCc[i]) ? oldCc[i] : { r: 0, g: 0, b: 0, a: 255 };
                            }
                        }
                        // 加入 output（若已有同键位配置则替换或合并）
                        const existingIdx = output.findIndex(c => c.Keys === n);
                        if (existingIdx >= 0) {
                            output[existingIdx] = currentConfig;
                        } else {
                            output.push(currentConfig);
                        }
                        flushPendingLazer();
                    }
                } else {
                    pendingLines.push(line);
                    if (currentConfig !== null) flushPendingLazer();
                }
            }
            if (currentConfig !== null) flushPendingLazer();

            function flushPendingLazer() {
                if (!currentConfig) return;
                for (const l of pendingLines) {
                    const p = splitKeyVal(l);
                    if (!p) continue;
                    const K = p.Key, V = p.Value;
                    if (!isOfficialManiaKey(K)) continue;

                    switch (K) {
                        case 'ColumnWidth':
                            parseArrayValue(V, currentConfig.ColumnWidth, false); break;
                        case 'ColumnSpacing':
                            parseArrayValue(V, currentConfig.ColumnSpacing, false); break;
                        case 'ColumnLineWidth':
                            parseArrayValue(V, currentConfig.ColumnLineWidth, false); break;
                        case 'BarlineHeight': {
                            const v = parseFloat(V); if (!isNaN(v)) currentConfig.BarLineHeight = v;
                            break;
                        }
                        case 'HitPosition': {
                            let v = parseFloat(V);
                            if (isNaN(v)) break;
                            v = Math.max(0, Math.min(480, v));
                            currentConfig.HitPosition = v;
                            break;
                        }
                        case 'LightPosition': {
                            const v = parseFloat(V);
                            if (isNaN(v)) break;
                            currentConfig.LightPosition = v;
                            break;
                        }
                        case 'ComboPosition': {
                            const v = parseFloat(V);
                            if (isNaN(v)) break;
                            currentConfig.ComboPosition = v;
                            break;
                        }
                        case 'ScorePosition': {
                            const v = parseFloat(V);
                            if (isNaN(v)) break;
                            currentConfig.ScorePosition = v;
                            break;
                        }
                        case 'FontCombo':
                            currentConfig.FontCombo = V.trim();
                            break;
                        case 'ComboOverlap': {
                            const n = parseInt(V, 10);
                            if (!isNaN(n)) currentConfig.ComboOverlap = n;
                            break;
                        }
                        case 'FontScore':
                            currentConfig.FontScore = V.trim();
                            break;
                        case 'ScoreOverlap': {
                            const n = parseInt(V, 10);
                            if (!isNaN(n)) currentConfig.ScoreOverlap = n;
                            break;
                        }
                        case 'JudgementLine':
                            currentConfig.ShowJudgementLine = (V === '1');
                            break;
                        case 'KeysUnderNotes':
                            currentConfig.KeysUnderNotes = (V === '1') ? 1 : 0;
                            break;
                        case 'LightingNWidth':
                            parseArrayValue(V, currentConfig.ExplosionWidth, false); break;
                        case 'ColourBreak': {
                            const parts = V.split(',').map(s => parseInt(s.trim(), 10));
                            if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                                currentConfig.ComboBreakColour = { r: parts[0], g: parts[1], b: parts[2] };
                            }
                            break;
                        }
                        case 'ColourHold': {
                            const parts = V.split(',').map(s => parseInt(s.trim(), 10));
                            if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                                const a = (parts.length >= 4 && !isNaN(parts[3])) ? parts[3] : 255;
                                currentConfig.ColourHold = { r: parts[0], g: parts[1], b: parts[2], a: a };
                            }
                            break;
                        }
                        case 'ColourBarline': {
                            const parts = V.split(',').map(s => parseInt(s.trim(), 10));
                            if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                                const a = (parts.length >= 4 && !isNaN(parts[3])) ? parts[3] : 255;
                                currentConfig.ColourBarline = { r: parts[0], g: parts[1], b: parts[2], a: a };
                            }
                            break;
                        }
                        case 'LightingLWidth':
                            parseArrayValue(V, currentConfig.HoldNoteLightWidth, false); break;
                        case 'NoteBodyStyle': {
                            const style = normalizeNoteBodyStyleValue(V);
                            if (style != null) currentConfig.NoteBodyStyle = style;
                            break;
                        }
                        case 'WidthForNoteHeightScale': {
                            const v = parseFloat(V);
                            if (!isNaN(v)) currentConfig.WidthForNoteHeightScale = v;
                            break;
                        }
                        case 'LightFramePerSecond': {
                            const n = parseInt(V, 10);
                            if (!isNaN(n)) currentConfig.LightFramePerSecond = (n > 0) ? n : 24;
                            break;
                        }
                        case 'UpsideDown':
                            currentConfig.UpsideDown = (V === '1'); break;
                        case 'SplitStages':
                            currentConfig.SplitStages = (V === '1'); break;
                        case 'SeparateScore':
                            currentConfig.SeparateScore = (V === '1');
                            break;
                        case 'StageSeparation': {
                            const v = parseFloat(V); if (!isNaN(v)) currentConfig.StageSeparation = v; break;
                        }
                        case 'ColumnStart': {
                            const v = parseFloat(V);
                            if (!isNaN(v)) currentConfig.ColumnStart = v;
                            break;
                        }
                        case 'ColumnRight': {
                            const v = parseFloat(V);
                            if (!isNaN(v)) currentConfig.ColumnRight = v;
                            break;
                        }
                        case 'SpecialStyle': {
                            const style = parseInt(V, 10);
                            if (style >= 0 && style <= 2) currentConfig.SpecialStyle = style;
                            break;
                        }
                        case 'ComboBurstStyle': {
                            const namedStyles = { Left: 0, Right: 1, Both: 2 };
                            const style = namedStyles[String(V || '').trim()] != null
                                ? namedStyles[String(V || '').trim()]
                                : parseInt(V, 10);
                            if (style >= 0 && style <= 2) currentConfig.ComboBurstStyle = style;
                            break;
                        }
                        default: {
                            const lightMatch = K.match(/^ColourLight(\d+)$/);
                            const columnMatch = K.match(/^Colour(\d+)$/);
                            const bodyMatch = K.match(/^NoteBodyStyle(\d+)$/);
                            if (lightMatch) {
                                const colIdx = maniaColourColumnIndex(lightMatch[1]);
                                const parts = V.split(',').map(s => parseInt(s.trim(), 10));
                                if (colIdx != null && parts.length >= 3 && !parts.slice(0, 3).some(isNaN)) {
                                    const r = Math.min(255, Math.max(0, parts[0]));
                                    const g = Math.min(255, Math.max(0, parts[1]));
                                    const b = Math.min(255, Math.max(0, parts[2]));
                                    const a = (parts.length >= 4 && !isNaN(parts[3])) ? Math.min(255, Math.max(0, parts[3])) : 255;
                                    if (!currentConfig.ColourLight) currentConfig.ColourLight = [];
                                    currentConfig.ColourLight[colIdx] = { r, g, b, a };
                                }
                            } else if (columnMatch) {
                                const colIdx = maniaColourColumnIndex(columnMatch[1]);
                                const parts = V.split(',').map(s => parseInt(s.trim(), 10));
                                if (colIdx != null && parts.length >= 3 && !parts.slice(0, 3).some(isNaN)) {
                                    const r = Math.min(255, Math.max(0, parts[0]));
                                    const g = Math.min(255, Math.max(0, parts[1]));
                                    const b = Math.min(255, Math.max(0, parts[2]));
                                    const a = (parts.length >= 4 && !isNaN(parts[3])) ? Math.min(255, Math.max(0, parts[3])) : 255;
                                    if (!currentConfig.ColumnColour) currentConfig.ColumnColour = [];
                                    currentConfig.ColumnColour[colIdx] = { r, g, b, a };
                                }
                            } else if (bodyMatch) {
                                const colIdx = maniaColumnIndex(bodyMatch[1]);
                                const sVal = normalizeNoteBodyStyleValue(V);
                                if (sVal !== null && colIdx != null && colIdx < currentConfig.Keys) {
                                    if (!Array.isArray(currentConfig.NoteBodyStyles)) currentConfig.NoteBodyStyles = new Array(currentConfig.Keys).fill(null);
                                    currentConfig.NoteBodyStyles[colIdx] = sVal;
                                }
                            } else if (isOfficialManiaImageKey(K)) {
                                currentConfig.ImageLookups.set(K, V);
                            } else if (K.startsWith('KeyFlipWhenUpsideDown') || K.startsWith('NoteFlipWhenUpsideDown')) {
                                currentConfig.FlipSettings.set(K, V);
                            }
                            break;
                        }
                    }
                }
                pendingLines.length = 0;
            }

            for (const c of output) maniaSkinConfigurations.set(c.Keys, c);
            updateSkinEditorKeyPills();
        }
