// ============================================================================
// ini-export.js - 将当前 Mania 配置生成 skin.ini 文本
// 依赖：skin/parameter-schema.js、skin/mania-config.js
// ============================================================================

        // =========================================================================
        // 完整的 skin.ini 参数定义元数据字典 (SKIN_INI_PARAM_SCHEMA)
        // =========================================================================
        function generateSkinIniText() {
            function canonicalizeImageKey(key) {
                const low = key.toLowerCase();
                const mKey = low.match(/^keyimage(\d+)(d|down)?$/);
                if (mKey) {
                    const num = mKey[1];
                    const isDown = mKey[2] ? (mKey[2] === 'd' ? 'D' : 'Down') : '';
                    return `KeyImage${num}${isDown}`;
                }
                if (low === 'keyimage') return 'KeyImage';
                if (low === 'keyimagedown') return 'KeyImageDown';

                const mNote = low.match(/^noteimage(\d+)([hlt])?$/);
                if (mNote) {
                    const num = mNote[1];
                    const suffix = mNote[2] ? mNote[2].toUpperCase() : '';
                    return `NoteImage${num}${suffix}`;
                }
                if (low === 'noteimage') return 'NoteImage';

                const mHold = low.match(/^holdnote(head|tail|body)image(\d+)?$/);
                if (mHold) {
                    const type = mHold[1].charAt(0).toUpperCase() + mHold[1].slice(1);
                    const num = mHold[2] !== undefined ? mHold[2] : '';
                    if (num !== '') {
                        const s = (type === 'Head') ? 'H' : ((type === 'Body') ? 'L' : 'T');
                        return `NoteImage${num}${s}`;
                    }
                    return `HoldNote${type}Image`;
                }

                const map = {
                    stageleft: 'StageLeft',
                    stageright: 'StageRight',
                    stagebottom: 'StageBottom',
                    stagehint: 'StageHint',
                    stagelight: 'StageLight',
                    leftstageimage: 'LeftStageImage',
                    rightstageimage: 'RightStageImage',
                    bottomstageimage: 'BottomStageImage',
                    hit300g: 'Hit300g',
                    hit300: 'Hit300',
                    hit200: 'Hit200',
                    hit100: 'Hit100',
                    hit50: 'Hit50',
                    hit0: 'Hit0',
                    lightingn: 'LightingN',
                    lightingl: 'LightingL',
                    warningarrow: 'WarningArrow'
                };
                if (map[low]) return map[low];
                return key;
            }

            function getImageCategory(key) {
                const low = key.toLowerCase();
                if (low.startsWith('keyimage')) return 'key';
                if (low.startsWith('noteimage') || low.includes('holdnote')) return 'note';
                if (low.includes('stage') || low.includes('hint') || low.includes('lightimage')) return 'stage';
                if (low.startsWith('hit') || low.startsWith('lighting') || low.includes('arrow')) return 'judgement';
                return 'other';
            }

            const lines = [];
            lines.push('// ==========================================');
            lines.push('// osu!mania Visual Skin Editor Generated');
            lines.push('// Exported At: ' + new Date().toLocaleString());
            lines.push('// ==========================================');
            lines.push('');

            // [General]
            lines.push('[General]');
            lines.push('// ------------------------------------------');
            lines.push('// 基础信息 (General Settings)');
            lines.push('// ------------------------------------------');
            const gen = currentSkinMetadata.general || {};
            for (const [k, v] of Object.entries(gen)) {
                if (v !== undefined && v !== null && v !== '') {
                    lines.push(`${k}: ${v}`);
                }
            }
            lines.push('');

            // [Colours] (若原皮肤有残留颜色数据则保留)
            const col = currentSkinMetadata.colours || {};
            const colEntries = Object.entries(col).filter(([k, v]) => v !== undefined && v !== null && v !== '');
            if (colEntries.length > 0) {
                lines.push('[Colours]');
                lines.push('// ------------------------------------------');
                lines.push('// 界面与连击色彩 (Interface Colours)');
                lines.push('// ------------------------------------------');
                for (const [k, v] of colEntries) {
                    lines.push(`${k}: ${v}`);
                }
                lines.push('');
            }

            // [Fonts]
            lines.push('[Fonts]');
            lines.push('// ------------------------------------------');
            lines.push('// 字体与数字贴图前缀设置 (Fonts & Prefixes)');
            lines.push('// ------------------------------------------');
            if (skinFontsConfig.hitCirclePrefix) lines.push(`HitCirclePrefix: ${skinFontsConfig.hitCirclePrefix}`);
            if (skinFontsConfig.hitCircleOverlap != null) lines.push(`HitCircleOverlap: ${skinFontsConfig.hitCircleOverlap}`);
            if (skinFontsConfig.scorePrefix) lines.push(`ScorePrefix: ${skinFontsConfig.scorePrefix}`);
            if (skinFontsConfig.scoreOverlap != null) lines.push(`ScoreOverlap: ${skinFontsConfig.scoreOverlap}`);
            // 连击字体前缀：只有 ini 显式指定过才写回，避免导出的皮肤凭空多出一项
            // [Fonts] ComboPrefix 而导致「未指定时沿用 score 字体」的规则在二次导入后失效
            if (skinFontsConfig.hasExplicitComboPrefix) {
                lines.push(`ComboPrefix: ${skinFontsConfig.comboPrefix || 'score'}`);
            }
            if (skinFontsConfig.comboOverlap != null) lines.push(`ComboOverlap: ${skinFontsConfig.comboOverlap}`);
            lines.push('');

            // [Mania] 各键位配置
            const keysList = [...maniaSkinConfigurations.keys()].sort((a, b) => a - b);
            if (keysList.length === 0) keysList.push(4);

            for (const k of keysList) {
                const cfg = maniaSkinConfigurations.get(k);
                if (!cfg) continue;
                lines.push('// ==========================================');
                lines.push(`// [Mania] ${k}K 键位配置`);
                lines.push('// ==========================================');
                lines.push('[Mania]');
                lines.push(`Keys: ${k}`);
                lines.push('');

                // 1. 基础与轨道布局 (Layout & Track Geometry)
                const layoutLines = [];
                if (cfg.ColumnStart != null) layoutLines.push(`ColumnStart: ${cfg.ColumnStart}`);
                if (cfg.ColumnRight != null) layoutLines.push(`ColumnRight: ${cfg.ColumnRight}`);
                if (cfg.ColumnWidth && cfg.ColumnWidth.length > 0) layoutLines.push(`ColumnWidth: ${cfg.ColumnWidth.map(Math.round).join(',')}`);
                const spacingValues = Array.isArray(cfg.ColumnSpacing)
                    ? cfg.ColumnSpacing.slice(0, Math.max(0, k - 1))
                    : [];
                if (spacingValues.length > 0) layoutLines.push(`ColumnSpacing: ${spacingValues.map(Math.round).join(',')}`);
                if (cfg.ColumnLineWidth && cfg.ColumnLineWidth.length > 0) layoutLines.push(`ColumnLineWidth: ${cfg.ColumnLineWidth.map(Math.round).join(',')}`);
                if (cfg.SplitStages != null) layoutLines.push(`SplitStages: ${cfg.SplitStages ? 1 : 0}`);
                if (cfg.StageSeparation != null) layoutLines.push(`StageSeparation: ${cfg.StageSeparation}`);
                if (cfg.SpecialStyle != null) layoutLines.push(`SpecialStyle: ${cfg.SpecialStyle}`);
                if (cfg.UpsideDown != null) layoutLines.push(`UpsideDown: ${cfg.UpsideDown ? 1 : 0}`);

                if (layoutLines.length > 0) {
                    lines.push('// ------------------------------------------');
                    lines.push('// 1. 基础与轨道布局 (Layout & Track Geometry)');
                    lines.push('// ------------------------------------------');
                    lines.push('// ColumnStart / ColumnRight: 舞台左边界起始 X 与右侧边距');
                    lines.push('// ColumnWidth: 各轨道列宽 (像素数组)');
                    lines.push('// ColumnSpacing: 各轨道间距数组');
                    lines.push('// ColumnLineWidth: 轨道分割线宽度');
                    lines.push('// SplitStages / StageSeparation: 双舞台分离模式及间距');
                    lines.push('// SpecialStyle: 特殊样式 (0: 默认)');
                    lines.push('// UpsideDown: 上升模式 (0:下落, 1:上升)');
                    for (const l of layoutLines) lines.push(l);
                    lines.push('');
                }

                // 2. 判定与视觉位置 (Positions & Metrics)
                const posLines = [];
                if (cfg.HitPosition != null) posLines.push(`HitPosition: ${Math.round(cfg.HitPosition)}`);
                if (cfg.ShowJudgementLine != null) posLines.push(`JudgementLine: ${cfg.ShowJudgementLine ? 1 : 0}`);
                if (cfg.ScorePosition != null) posLines.push(`ScorePosition: ${Math.round(cfg.ScorePosition)}`);
                if (cfg.ComboPosition != null) posLines.push(`ComboPosition: ${Math.round(cfg.ComboPosition)}`);
                if (cfg.LightPosition != null) posLines.push(`LightPosition: ${Math.round(cfg.LightPosition)}`);
                if (cfg.BarLineHeight != null) posLines.push(`BarlineHeight: ${cfg.BarLineHeight}`);

                if (posLines.length > 0) {
                    lines.push('// ------------------------------------------');
                    lines.push('// 2. 判定与视觉位置 (Positions & Metrics)');
                    lines.push('// ------------------------------------------');
                    lines.push('// HitPosition: 打击判定线垂直高度');
                    lines.push('// JudgementLine: 是否显示判定线 (1:显示, 0:隐藏)');
                    lines.push('// ScorePosition: 判定评价结果 (Hit300/100 等) 垂直高度');
                    lines.push('// ComboPosition: 连击数 (Combo) 垂直高度');
                    lines.push('// LightPosition: 按键发光贴图垂直高度 (不是打击特效，而是按下按键之后出现的动画)');
                    lines.push('// BarlineHeight: 小节线像素厚度 (设为 0 可隐藏)');
                    for (const l of posLines) lines.push(l);
                    lines.push('');
                }

                // 3. 特效与渲染规则 (Effects & Render Options)
                const effectLines = [];
                if (cfg.KeysUnderNotes != null) effectLines.push(`KeysUnderNotes: ${cfg.KeysUnderNotes}`);
                if (cfg.NoteBodyStyle != null) {
                    const stableNoteBodyStyle = cfg.NoteBodyStyle === NOTE_BODY_STYLE.RepeatFromTail ? 1
                        : (cfg.NoteBodyStyle === NOTE_BODY_STYLE.RepeatFromHead ? 2
                            : (cfg.NoteBodyStyle === NOTE_BODY_STYLE.RepeatTopAndBottom ? 3 : 0));
                    effectLines.push(`NoteBodyStyle: ${stableNoteBodyStyle}`);
                }
                if (cfg.WidthForNoteHeightScale != null) effectLines.push(`WidthForNoteHeightScale: ${cfg.WidthForNoteHeightScale}`);
                // 注：官方 skin.ini 的 [Mania] 只有 LightingNWidth / LightingLWidth 两个打击特效宽度参数。
                // 「缩放倍率」是 lazer 内部由宽度派生出来的 lookup（宽度/30，缺省 列宽/30），**不是 ini 键**，
                // 因此这里绝不写出 ExplosionScale / HoldNoteLightScale（写了只会污染皮肤）。
                if (cfg.ExplosionWidth && cfg.ExplosionWidth.some(v => v > 0)) effectLines.push(`LightingNWidth: ${cfg.ExplosionWidth.map(Math.round).join(',')}`);
                if (cfg.HoldNoteLightWidth && cfg.HoldNoteLightWidth.some(v => v > 0)) effectLines.push(`LightingLWidth: ${cfg.HoldNoteLightWidth.map(Math.round).join(',')}`);
                if (cfg.LightFramePerSecond != null) effectLines.push(`LightFramePerSecond: ${cfg.LightFramePerSecond}`);
                if (cfg.ComboBurstStyle != null) effectLines.push(`ComboBurstStyle: ${cfg.ComboBurstStyle}`);

                if (effectLines.length > 0) {
                    lines.push('// ------------------------------------------');
                    lines.push('// 3. 特效与渲染规则 (Effects & Render Options)');
                    lines.push('// ------------------------------------------');
                    lines.push('// KeysUnderNotes: 按键图层是否位于音符下方 (0:覆盖音符, 1:置于音符下)');
                    lines.push('// NoteBodyStyle: 长条身体平铺样式 (0:拉伸Stretch, 1:尾部重复, 2:头部重复, 3:两端重复)');
                    lines.push('// WidthForNoteHeightScale: 音符长宽比缩放基准宽度');
                    lines.push('// LightingNWidth / LightingLWidth: 打击光效与长条发光宽度 (像素数组，0 = 跟随列宽)');
                    lines.push('// LightFramePerSecond: 按键动画播放帧率');
                    lines.push('// ComboBurstStyle: 连击提示图出现侧 (0:左侧, 1:右侧, 2:双侧随机)');
                    for (const l of effectLines) lines.push(l);
                    lines.push('');
                }

                // 4. 轨道底色与特效色彩 (Colours & Lighting)
                const colourLines = [];
                if (cfg.ColourBarline) colourLines.push(`ColourBarline: ${cfg.ColourBarline.r},${cfg.ColourBarline.g},${cfg.ColourBarline.b},${cfg.ColourBarline.a != null ? cfg.ColourBarline.a : 255}`);
                if (cfg.ColourHold) colourLines.push(`ColourHold: ${cfg.ColourHold.r},${cfg.ColourHold.g},${cfg.ColourHold.b},${cfg.ColourHold.a != null ? cfg.ColourHold.a : 255}`);
                if (cfg.ComboBreakColour) colourLines.push(`ComboBreakColour: ${cfg.ComboBreakColour.r},${cfg.ComboBreakColour.g},${cfg.ComboBreakColour.b}`);

                if (cfg.ColumnColour && cfg.ColumnColour.length > 0) {
                    for (let c = 0; c < k; c++) {
                        const cc = cfg.ColumnColour[c];
                        if (cc) colourLines.push(`Colour${c + 1}: ${cc.r},${cc.g},${cc.b},${cc.a != null ? cc.a : 255}`);
                    }
                }

                if (cfg.ColourLight && cfg.ColourLight.length > 0) {
                    for (let c = 0; c < cfg.ColourLight.length; c++) {
                        const cl = cfg.ColourLight[c];
                        // ColourLight 的 alpha 是有效参数（与按下/松开动画的 alpha 相乘），
                        // 只有 255 时才省略第 4 个分量，避免丢数据。
                        if (cl) colourLines.push(`ColourLight${c + 1}: ${cl.r},${cl.g},${cl.b}${(cl.a != null && cl.a !== 255) ? ',' + cl.a : ''}`);
                    }
                }

                if (colourLines.length > 0) {
                    lines.push('// ------------------------------------------');
                    lines.push('// 4. 轨道底色与特效色彩 (Colours & Lighting)');
                    lines.push('// ------------------------------------------');
                    lines.push('// ColourBarline: 小节线颜色及透明度 (RGBA)');
                    lines.push('// ColourHold: 按住长条时连击数变色滤镜色彩 (RGBA)');
                    lines.push('// ComboBreakColour: 断连击时屏幕闪烁警示颜色 (RGB)');
                    lines.push('// Colour1..N: 各轨道背景底色与透明度 (RGBA)');
                    lines.push('// ColourLight1..N: 各轨道按键按压发光色彩 (RGB)');
                    for (const l of colourLines) lines.push(l);
                    lines.push('');
                }

                // 5. 自定义贴图路径 (Custom Images & Textures)
                if (cfg.ImageLookups && cfg.ImageLookups.size > 0) {
                    const written = new Set();
                    const keyImgs = [];
                    const noteImgs = [];
                    const stageImgs = [];
                    const judgeImgs = [];
                    const otherImgs = [];

                    for (const [kLookup, vLookup] of cfg.ImageLookups.entries()) {
                        if (!vLookup) continue;
                        // stable 的打击特效贴图只有全局 LightingN / LightingL。
                        // 旧版本编辑器曾写出的 LightingN0 / Lighting0N / LightingL0 / Lighting0L / Lighting0 等分轨键不再导出。
                        if (/^lighting(?:\d+[nl]|[nl]\d+|\d+)$/i.test(kLookup)) continue;
                        const canonical = canonicalizeImageKey(kLookup);
                        const lowerCanonical = canonical.toLowerCase();
                        if (written.has(lowerCanonical)) continue;
                        written.add(lowerCanonical);

                        const category = getImageCategory(kLookup);
                        const entry = { key: canonical, val: vLookup, rawKey: kLookup };

                        if (category === 'key') keyImgs.push(entry);
                        else if (category === 'note') noteImgs.push(entry);
                        else if (category === 'stage') stageImgs.push(entry);
                        else if (category === 'judgement') judgeImgs.push(entry);
                        else otherImgs.push(entry);
                    }

                    const totalImgs = keyImgs.length + noteImgs.length + stageImgs.length + judgeImgs.length + otherImgs.length;
                    if (totalImgs > 0) {
                        lines.push('// ------------------------------------------');
                        lines.push('// 5. 自定义贴图路径 (Custom Images & Textures)');
                        lines.push('// ------------------------------------------');

                        const sortImgEntries = (a, b) => a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: 'base' });

                        if (keyImgs.length > 0) {
                            lines.push('// -- 按键贴图 (Key Images) --');
                            keyImgs.sort(sortImgEntries);
                            for (const item of keyImgs) lines.push(`${item.key}: ${item.val}`);
                            lines.push('');
                        }
                        if (noteImgs.length > 0) {
                            lines.push('// -- 音符与长条贴图 (Note Images) --');
                            noteImgs.sort(sortImgEntries);
                            for (const item of noteImgs) lines.push(`${item.key}: ${item.val}`);
                            lines.push('');
                        }
                        if (stageImgs.length > 0) {
                            lines.push('// -- 舞台与背景贴图 (Stage Textures) --');
                            stageImgs.sort(sortImgEntries);
                            for (const item of stageImgs) lines.push(`${item.key}: ${item.val}`);
                            lines.push('');
                        }
                        if (judgeImgs.length > 0) {
                            lines.push('// -- 判定与打击光效贴图 (Judgement & Lighting) --');
                            judgeImgs.sort(sortImgEntries);
                            for (const item of judgeImgs) lines.push(`${item.key}: ${item.val}`);
                            lines.push('');
                        }
                        if (otherImgs.length > 0) {
                            lines.push('// -- 其他贴图 (Other Lookups) --');
                            otherImgs.sort(sortImgEntries);
                            for (const item of otherImgs) lines.push(`${item.key}: ${item.val}`);
                            lines.push('');
                        }
                    }
                }

                // 6. 字体覆盖 (Font Overrides) —— [Mania] 区块可单独指定连击 / 分数数字使用的贴图组
                const fontLines = [];
                if (cfg.FontCombo) fontLines.push(`FontCombo: ${cfg.FontCombo}`);
                if (cfg.ComboOverlap != null) fontLines.push(`ComboOverlap: ${cfg.ComboOverlap}`);
                if (cfg.FontScore) fontLines.push(`FontScore: ${cfg.FontScore}`);
                if (cfg.ScoreOverlap != null) fontLines.push(`ScoreOverlap: ${cfg.ScoreOverlap}`);

                if (fontLines.length > 0) {
                    lines.push('// ------------------------------------------');
                    lines.push('// 6. 字体覆盖 (Font Overrides)');
                    lines.push('// ------------------------------------------');
                    lines.push('// FontCombo: 连击数字使用的贴图文件名前缀 (优先于 [Fonts] Combo；不写则沿用 score 字体)');
                    lines.push('// ComboOverlap: 连击数字各字符的横向重叠像素');
                    lines.push('// FontScore: 分数 / 准度数字使用的贴图文件名前缀 (优先于 [Fonts] ScorePrefix)');
                    lines.push('// ScoreOverlap: 分数数字各字符的横向重叠像素');
                    for (const l of fontLines) lines.push(l);
                    lines.push('');
                }
            }

            // 清理多余空行，保证段落之间最多一个空行
            const cleanLines = [];
            for (let i = 0; i < lines.length; i++) {
                const curr = lines[i];
                if (curr === '' && cleanLines.length > 0 && cleanLines[cleanLines.length - 1] === '') {
                    continue;
                }
                cleanLines.push(curr);
            }
            return cleanLines.join('\r\n');
        }

        // 轨道区在 ColumnStart / ColumnRight 记账口径下的占用宽度：
        // Σ列宽 + Σ相邻列间距（前 keys-1 项）+ 分割舞台间距（SplitStages 开启时）。
        // 注意：与「轨道总宽上限」用的 computeTrackBlockWidth480 口径不同，后者不含 StageSeparation。
