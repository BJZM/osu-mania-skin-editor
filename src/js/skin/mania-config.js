// ============================================================================
// mania-config.js - 默认 Mania 配置、字段读取与逐轨贴图名解析
// 依赖：core/state.js、skin/skin-ini.js
// ============================================================================

        function getManiaConfigForKeys(keyCount) {
            if (maniaSkinConfigurations.size === 0) return null;
            if (maniaSkinConfigurations.has(keyCount)) return maniaSkinConfigurations.get(keyCount);
            let bestKeys = null, bestDelta = Infinity;
            for (const k of maniaSkinConfigurations.keys()) {
                const d = Math.abs(k - keyCount);
                if (d < bestDelta) { bestDelta = d; bestKeys = k; }
            }
            return bestKeys !== null ? maniaSkinConfigurations.get(bestKeys) : null;
        }

        // 构造一份「完整的」默认 mania 配置（字段与 parseSkinIniLazer 内部的 createConfig 对齐）。
        // 用途：「未导入皮肤 / 只导入谱面（展示默认皮肤）」时用户在画布上直接点选并编辑。
        // 必须补齐 getManiaSkinConfig 会访问到的**所有数组字段**，否则一旦把不完整的配置写回
        // maniaSkinConfigurations，getManiaSkinConfig 读 `cfg.ColumnWidth.length` 就会直接抛
        // TypeError: Cannot read properties of undefined (reading 'length')，整个 drawFrame 崩掉。
        function createDefaultManiaSkinConfiguration(keyCount) {
            const k = Math.max(1, keyCount | 0);
            const cw = new Array(k).fill(30);
            const clw = new Array(k + 1).fill(2);
            const cs = new Array(Math.max(0, k - 1)).fill(0);
            const colColours = new Array(k);
            for (let i = 0; i < k; i++) colColours[i] = { r: 0, g: 0, b: 0, a: 255 };
            const colLight = new Array(k);
            for (let i = 0; i < k; i++) colLight[i] = { r: 255, g: 255, b: 255, a: 255 };
            return {
                Keys: k,
                SkinVersion: 2.7,
                CustomColours: {},
                ImageLookups: new Map(),
                WidthForNoteHeightScale: 0,
                ColumnLineWidth: clw,
                ColumnSpacing: cs,
                ColumnWidth: cw,
                ColumnColour: colColours,
                ExplosionWidth: new Array(k).fill(0),
                ComboBreakColour: { r: 255, g: 0, b: 0 },
                ColourHold: { r: 255, g: 191, b: 51, a: 255 },
                ColourLight: colLight,
                GlobalColourLight: null,
                HoldNoteLightWidth: new Array(k).fill(0),
                HitPosition: 402,
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
                KeysUnderNotes: 0,
                LightFramePerSecond: 60,
                NoteBodyStyle: null,
                NoteBodyStyles: new Array(k).fill(null),
                ColumnStart: 136,
                ColumnRight: 19,
                UpsideDown: false,
                SplitStages: false,
                StageSeparation: 40,
                FlipSettings: new Map(),
                // 标记为「按需生成的默认配置」，便于区分真实皮肤解析出的配置
                _isDefaultFallback: true,
            };
        }

        // 取某个键位的 mania 配置；若不存在（典型：只导入了谱面、用的是内置默认皮肤），
        // 按需生成一份**完整**的默认配置并登记后返回。
        // 各编辑入口一律用它兜底，绝不要再用 `{ Keys: keys }` 这种残缺对象写回配置表。
        function ensureManiaConfigForKeys(keyCount) {
            const existing = getManiaConfigForKeys(keyCount);
            if (existing) return existing;
            const cfg = createDefaultManiaSkinConfiguration(keyCount);
            maniaSkinConfigurations.set(cfg.Keys, cfg);
            return cfg;
        }

        function isDummyBlankName(name) {
            if (!name) return true;
            const low = String(name).trim().toLowerCase().replace(/\.(png|jpg|jpeg)$/i, '');
            return low === 'blank' || low === '_blank' || low === 'none' || low === 'null' || low === 'empty' || low === 'transparent' || low === '0' || low === '';
        }

        function computeFallbackColumnIndex(totalKeys, columnIndex) {
            if (totalKeys <= 0) return '1';
            const i = ((columnIndex % totalKeys) + totalKeys) % totalKeys;
            // osu! stable 规范: 奇数键位中间列（如 7K 的第 4 列）采用专属特殊键 'S' (mania-noteS, mania-keyS)
            if (totalKeys % 2 === 1 && i === Math.floor(totalKeys / 2)) {
                return 'S';
            }
            const last = totalKeys - 1;
            const distanceToEdge = Math.min(i, last - i);
            return (distanceToEdge % 2 === 0) ? '1' : '2';
        }

        function imageLookupToIniPrefixSuffix(lookup) {
            switch (lookup) {
                case LML.NoteImage: return { prefix: 'NoteImage', suffix: '' };
                case LML.HoldNoteHeadImage: return { prefix: 'NoteImage', suffix: 'H' };
                case LML.HoldNoteBodyImage: return { prefix: 'NoteImage', suffix: 'L' };
                case LML.HoldNoteTailImage: return { prefix: 'NoteImage', suffix: 'T' };
                case LML.KeyImage: return { prefix: 'KeyImage', suffix: '' };
                case LML.KeyImageDown: return { prefix: 'KeyImage', suffix: 'D' };
                case LML.HoldNoteLightImage: return { prefix: 'LightingL', suffix: '', altKeys: ['LightingL', 'Lighting'] };
                case LML.ExplosionImage: return { prefix: 'LightingN', suffix: '', altKeys: ['LightingN', 'Lighting'] };
                case LML.HitTargetImage: return { prefix: 'StageHint', suffix: '', altKeys: ['StageHint', 'HitTarget', 'mania-stage-hint'] };
                case LML.BottomStageImage: return { prefix: 'StageBottom', suffix: '', altKeys: ['StageBottom', 'Stage_Bottom', 'mania-stage-bottom'] };
                case LML.LeftStageImage: return { prefix: 'StageLeft', suffix: '', altKeys: ['StageLeft', 'Stage_Left', 'mania-stage-left'] };
                case LML.RightStageImage: return { prefix: 'StageRight', suffix: '', altKeys: ['StageRight', 'Stage_Right', 'mania-stage-right'] };
                case LML.LightImage: return { prefix: 'StageLight', suffix: '', altKeys: ['StageLight', 'mania-stage-light'] };
                case LML.Hit300g: return { prefix: 'Hit300g', suffix: '', isGlobal: true, altKeys: ['Hit300g', 'Hit300k', 'Hit300'] };
                case LML.Hit300: return { prefix: 'Hit300', suffix: '', isGlobal: true, altKeys: ['Hit300'] };
                case LML.Hit200: return { prefix: 'Hit200', suffix: '', isGlobal: true, altKeys: ['Hit200'] };
                case LML.Hit100: return { prefix: 'Hit100', suffix: '', isGlobal: true, altKeys: ['Hit100'] };
                case LML.Hit50: return { prefix: 'Hit50', suffix: '', isGlobal: true, altKeys: ['Hit50'] };
                case LML.Hit0: return { prefix: 'Hit0', suffix: '', isGlobal: true, altKeys: ['Hit0'] };
                default: return null;
            }
        }

        function defaultFilenameForLookup(lookup, fallbackColumnIndex) {
            const fc = fallbackColumnIndex;
            switch (lookup) {
                case LML.NoteImage: return `mania-note${fc}`;
                case LML.HoldNoteHeadImage: return `mania-note${fc}h`;
                case LML.HoldNoteBodyImage: return `mania-note${fc}l`;
                case LML.HoldNoteTailImage: return `mania-note${fc}t`;
                case LML.KeyImage: return `mania-key${fc}`;
                case LML.KeyImageDown: return `mania-key${fc}d`;
                case LML.HoldNoteLightImage: return 'lightingL';
                case LML.ExplosionImage: return 'lightingN';
                case LML.HitTargetImage: return 'mania-stage-hint';
                // stable 的 mania 舞台底图默认文件名是全小写 stagebottom，且只读取皮肤根目录。
                case LML.BottomStageImage: return 'stagebottom';
                case LML.LeftStageImage: return 'mania-stage-left';
                case LML.RightStageImage: return 'mania-stage-right';
                case LML.LightImage: return 'mania-stage-light';
                case LML.Hit300g: return 'mania-hit300g';
                case LML.Hit300: return 'mania-hit300';
                case LML.Hit200: return 'mania-hit200';
                case LML.Hit100: return 'mania-hit100';
                case LML.Hit50: return 'mania-hit50';
                case LML.Hit0: return 'mania-hit0';
                default: return null;
            }
        }

        function getManiaSkinConfig(keyCount, lookup, columnIndex) {
            const cfg = getManiaConfigForKeys(keyCount);
            if (!cfg) {
                if (lookup === LML.KeysUnderNotes) return { ok: true, value: 0 };
                if (lookup === LML.ColumnBackgroundColour) return { ok: true, value: { r: 0, g: 0, b: 0, a: 255 } };
                if (lookup === LML.NoteBodyStyle) {
                    const version = (typeof globalSkinVersion === 'number') ? globalSkinVersion : 2.7;
                    return { ok: true, value: version < 2.5 ? NOTE_BODY_STYLE.Stretch : NOTE_BODY_STYLE.RepeatFromTail };
                }
                return null;
            }

            // 自愈：历史路径 / 外部调用可能把不完整的配置写进 maniaSkinConfigurations，
            // 这里补齐下方 switch 会直接解引用的数组字段，避免 `undefined.length` / 迭代崩溃。
            const __k = Math.max(1, (cfg.Keys | 0) || keyCount || 4);
            if (!Array.isArray(cfg.ColumnWidth) || cfg.ColumnWidth.length === 0) cfg.ColumnWidth = new Array(__k).fill(30);
            const spacingCount = Math.max(0, __k - 1);
            if (!Array.isArray(cfg.ColumnSpacing) || cfg.ColumnSpacing.length !== spacingCount) {
                const oldSpacing = Array.isArray(cfg.ColumnSpacing) ? cfg.ColumnSpacing : [];
                cfg.ColumnSpacing = new Array(spacingCount).fill(0);
                for (let i = 0; i < Math.min(spacingCount, oldSpacing.length); i++) {
                    cfg.ColumnSpacing[i] = oldSpacing[i];
                }
            }
            if (!Array.isArray(cfg.ColumnLineWidth)) cfg.ColumnLineWidth = new Array(__k + 1).fill(2);
            if (!Array.isArray(cfg.ColumnColour) || cfg.ColumnColour.length === 0) {
                cfg.ColumnColour = new Array(__k).fill(null).map(() => ({ r: 0, g: 0, b: 0, a: 255 }));
            }
            if (!Array.isArray(cfg.ColourLight)) {
                cfg.ColourLight = new Array(__k).fill(null).map(() => ({ r: 255, g: 255, b: 255, a: 255 }));
            }

            switch (lookup) {
                case LML.ColumnBackgroundColour: {
                    if (columnIndex == null) return null;
                    const arr = cfg.ColumnColour;
                    if (!arr || arr.length === 0) return { ok: true, value: { r: 0, g: 0, b: 0, a: 255 } };
                    const i = Math.min(arr.length - 1, Math.max(0, columnIndex | 0));
                    return { ok: true, value: arr[i] || { r: 0, g: 0, b: 0, a: 255 } };
                }
                case LML.ColumnWidth: {
                    if (columnIndex == null) return null;
                    const i = Math.min(cfg.ColumnWidth.length - 1, Math.max(0, columnIndex | 0));
                    return { ok: true, value: cfg.ColumnWidth[i] };
                }
                case LML.ColumnSpacing: {
                    if (columnIndex == null) return null;
                    const arr = cfg.ColumnSpacing;
                    if (!arr || arr.length === 0) return { ok: true, value: 0 };
                    const idx = columnIndex | 0;
                    if (idx < 0 || idx >= arr.length) return { ok: true, value: 0 };
                    return { ok: true, value: arr[idx] };
                }
                case LML.ExplosionWidth: {
                    if (columnIndex == null) return null;
                    const arr = cfg.ExplosionWidth;
                    if (!arr || arr.length === 0) return null;
                    const i = Math.min(arr.length - 1, Math.max(0, columnIndex | 0));
                    return { ok: true, value: arr[i] };
                }
                case LML.ExplosionScale: {
                    // 严格对齐 osu!lazer LegacySkin.cs 的 ExplosionScale lookup：
                    // 它**不是** ini 参数，而是由 LightingNWidth (ExplosionWidth) 派生出来的缩放倍率。
                    //   version < 2.5            -> 1
                    //   ExplosionWidth[i] != 0   -> ExplosionWidth[i] / DEFAULT_COLUMN_SIZE(30)
                    //   否则                      -> ColumnWidth[i] / 30
                    const version = (cfg.SkinVersion != null) ? cfg.SkinVersion : globalSkinVersion;
                    if (version < 2.5) return { ok: true, value: 1.0 };
                    if (columnIndex == null) return { ok: true, value: 1.0 };
                    const i = Math.min(cfg.ColumnWidth.length - 1, Math.max(0, columnIndex | 0));
                    if (cfg.ExplosionWidth && cfg.ExplosionWidth[i] != null && cfg.ExplosionWidth[i] != 0) {
                        return { ok: true, value: cfg.ExplosionWidth[i] / 30.0 };
                    }
                    const cw = (cfg.ColumnWidth && cfg.ColumnWidth[i] > 0) ? cfg.ColumnWidth[i] : 30.0;
                    return { ok: true, value: cw / 30.0 };
                }
                case LML.ComboBreakColour: {
                    return { ok: true, value: cfg.ComboBreakColour || { r: 255, g: 0, b: 0 } };
                }
                case LML.ColourHold: {
                    return { ok: true, value: cfg.ColourHold || { r: 255, g: 191, b: 51, a: 255 } };
                }
                case LML.ColourBarline: {
                    return { ok: true, value: cfg.ColourBarline || { r: 255, g: 255, b: 255, a: 255 } };
                }
                case LML.ColourLight: {
                    if (columnIndex == null) return { ok: true, value: cfg.GlobalColourLight || { r: 255, g: 255, b: 255, a: 255 } };
                    const i = Math.min(cfg.Keys - 1, Math.max(0, columnIndex | 0));
                    const val = (cfg.ColourLight && cfg.ColourLight[i]) ? cfg.ColourLight[i] : (cfg.GlobalColourLight || { r: 255, g: 255, b: 255, a: 255 });
                    return { ok: true, value: val };
                }
                case LML.HoldNoteLightWidth: {
                    if (columnIndex == null) return null;
                    const arr = cfg.HoldNoteLightWidth;
                    if (!arr || arr.length === 0) return null;
                    const i = Math.min(arr.length - 1, Math.max(0, columnIndex | 0));
                    return { ok: true, value: arr[i] };
                }
                case LML.HoldNoteLightScale: {
                    // 严格对齐 osu!lazer LegacySkin.cs 的 HoldNoteLightScale lookup：
                    // 同样**不是** ini 参数，而是由 LightingLWidth (HoldNoteLightWidth) 派生。
                    const version = (cfg.SkinVersion != null) ? cfg.SkinVersion : globalSkinVersion;
                    if (version < 2.5) return { ok: true, value: 1.0 };
                    if (columnIndex == null) return { ok: true, value: 1.0 };
                    const i = Math.min(cfg.ColumnWidth.length - 1, Math.max(0, columnIndex | 0));
                    if (cfg.HoldNoteLightWidth && cfg.HoldNoteLightWidth[i] != null && cfg.HoldNoteLightWidth[i] != 0) {
                        return { ok: true, value: cfg.HoldNoteLightWidth[i] / 30.0 };
                    }
                    const cw = (cfg.ColumnWidth && cfg.ColumnWidth[i] > 0) ? cfg.ColumnWidth[i] : 30.0;
                    return { ok: true, value: cw / 30.0 };
                }
                case LML.MinimumColumnWidth: {
                    let min = cfg.ColumnWidth[0];
                    for (const w of cfg.ColumnWidth) if (w < min) min = w;
                    return { ok: true, value: min };
                }
                case LML.WidthForNoteHeightScale: {
                    let w = cfg.WidthForNoteHeightScale;
                    if (w <= 0) {
                        let min = cfg.ColumnWidth[0];
                        for (const ww of cfg.ColumnWidth) if (ww < min) min = ww;
                        w = min;
                    }
                    return { ok: true, value: w };
                }
                case LML.HitPosition: return { ok: true, value: cfg.HitPosition };
                case LML.ScorePosition: return { ok: true, value: cfg.ScorePosition };
                case LML.ComboPosition: return { ok: true, value: cfg.ComboPosition };
                case LML.ColumnStart: return { ok: true, value: cfg.ColumnStart };
                case LML.ColumnRight: return { ok: true, value: cfg.ColumnRight };
                case LML.SplitStages: return { ok: true, value: cfg.SplitStages };
                case LML.StageSeparation: return { ok: true, value: cfg.StageSeparation };
                case LML.UpsideDown: return { ok: true, value: cfg.UpsideDown };
                case LML.LightPosition: return { ok: true, value: cfg.LightPosition };
                case LML.BarLineHeight: return { ok: true, value: cfg.BarLineHeight };
                case LML.ShowJudgementLine: return { ok: true, value: cfg.ShowJudgementLine };
                case LML.KeysUnderNotes: {
                    const val = cfg.KeysUnderNotes;
                    return { ok: true, value: (val === 1 || val === '1' || val === true) ? 1 : 0 };
                }
                case LML.LightFramePerSecond: return { ok: true, value: cfg.LightFramePerSecond };
                case LML.NoteBodyStyle: {
                    if (columnIndex != null && Array.isArray(cfg.NoteBodyStyles) && cfg.NoteBodyStyles[columnIndex] != null) {
                        return { ok: true, value: cfg.NoteBodyStyles[columnIndex] };
                    }
                    if (cfg.NoteBodyStyle != null) {
                        return { ok: true, value: cfg.NoteBodyStyle };
                    }
                    const version = (cfg.SkinVersion != null) ? cfg.SkinVersion : globalSkinVersion;
                    return { ok: true, value: version < 2.5 ? NOTE_BODY_STYLE.Stretch : NOTE_BODY_STYLE.RepeatFromTail };
                }
                default:
                    return null;
            }
        }

        // ===== 逐轨贴图 ini 键查找顺序（唯一真源） =====
        // 下列 8 个 lookup 的 ini 键查找顺序，被三处共用：
        //   1) 画布渲染 renderer.js getManiaSkinImage / getManiaSkinAnimationFrames
        //   2) 面板缩略图/路径回显 ui.js resolveTextureParam
        //   3) 面板逐轨生效名 getManiaNoteTextureName
        // 任何一处单独改动都会让「画布显示」与「面板显示」识别出不同贴图，因此必须共用本函数。
        // 注：PER_TRACK_TEXTURE_LOOKUPS 是「可逐轨展开的面板分组」清单（6 个音符/按键贴图）；
        //     打击特效 LightingN / LightingL 也走本函数，但它们不属于那个分组清单。
        const PER_TRACK_TEXTURE_LOOKUPS = [
            LML.NoteImage, LML.HoldNoteHeadImage, LML.HoldNoteBodyImage,
            LML.HoldNoteTailImage, LML.KeyImage, LML.KeyImageDown,
        ];

        function buildPerTrackTextureSearchKeys(lookup, columnIndex) {
            const ci = (columnIndex == null) ? '' : String(columnIndex | 0);
            switch (lookup) {
                case LML.NoteImage:
                    return ['NoteImage' + ci, 'NoteImage'];
                case LML.HoldNoteHeadImage:
                    return ['NoteImage' + ci + 'H', 'HoldNoteHeadImage' + ci, 'NoteImage' + ci, 'HoldNoteHeadImage', 'NoteImageH', 'NoteImage'];
                case LML.HoldNoteBodyImage:
                    return ['NoteImage' + ci + 'L', 'HoldNoteBodyImage' + ci, 'HoldNoteBodyImage', 'NoteImageL', 'NoteImage'];
                case LML.HoldNoteTailImage:
                    return ['NoteImage' + ci + 'T', 'HoldNoteTailImage' + ci, 'HoldNoteTailImage', 'NoteImageT', 'NoteImage'];
                // 打击特效：单键爆炸 LightingN / 长条光效 LightingL。
                // 稳定版只按全局键读取这两张贴图，所有轨道共用同一张；不能识别 LightingN0 / Lighting0N 这类分轨键。
                // 两者是**相互独立**的两套贴图，查找顺序里绝不允许互相回退（LightingN 永不回退到 LightingL）。
                case LML.ExplosionImage:
                    return ['LightingN', 'Lighting'];
                case LML.HoldNoteLightImage:
                    return ['LightingL', 'Lighting'];
                case LML.KeyImageDown:
                    return ['KeyImage' + ci + 'D', 'KeyImage' + ci + 'Down', 'KeyImageDown' + ci, 'KeyImage' + ci, 'KeyImageD', 'KeyImageDown', 'KeyImage'];
                case LML.KeyImage:
                    return ['KeyImage' + ci, 'KeyImage'];
                default:
                    return null;
            }
        }

        // ===== 按键发光贴图 (StageLight / mania-stage-light) ini 键查找顺序（唯一真源） =====
        // 语义区分（务必牢记，两者绝不可互相回退）：
        //   StageLight / mania-stage-light  —— 按键发光。**只要按下按键**轨道上就常驻播放的发光动画，
        //                                      渲染位置由 LightPosition 决定，与是否打到 note 无关。
        //   LightingN / LightingL           —— 打击特效。**只有打到 note 那一刻**才迸发的爆炸/长条光效。
        // 查找顺序被四处共用，任何一处单独改动都会让「画布显示」与「面板识别」不一致：
        //   1) renderer.js getStageLightFrames（实际绘制）
        //   2) renderer.js getManiaSkinImage（静态贴图识别）
        //   3) renderer.js getManiaSkinAnimationFrames（动画帧识别）
        //   4) ui.js getTextureParamAliases / getTextureParamColumnKeys（面板回显）
        // 注：osu!lazer 的 LegacySkin 只认精确键 `StageLight`（无逐轨后缀），
        //     这里额外支持 `StageLight#` 作为向前兼容的超集，并保留 `mania-stage-light` 作为
        //     「作者把默认文件名写进 ini」的兜底，行为与旧实现完全一致。
        function buildStageLightSearchKeys(columnIndex) {
            const ci = (columnIndex == null) ? '' : String(columnIndex | 0);
            return ['StageLight' + ci, 'StageLight', 'mania-stage-light'];
        }

        // 在 mCfg.ImageLookups 中按给定顺序查找显式配置，返回 { value, matchedKey }；找不到返回 null
        function findExplicitImageLookupValue(mCfg, searchKeys) {
            if (!mCfg || !mCfg.ImageLookups || !searchKeys) return null;
            for (const sk of searchKeys) {
                if (mCfg.ImageLookups.has(sk)) return { value: mCfg.ImageLookups.get(sk), matchedKey: sk };
                const skLow = sk.toLowerCase();
                if (mCfg.ImageLookups.has(skLow)) return { value: mCfg.ImageLookups.get(skLow), matchedKey: sk };
            }
            return null;
        }

        // 获取某个逐轨贴图「当前实际生效」的贴图名。
        // out（可选）会带上 { explicit, explicitValue, matchedKey }，用于区分
        // 「ini 里显式写了」与「没写、只是按默认文件名回退」——面板据此决定提示文案。
