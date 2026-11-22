// ============================================================================
// skin-ini-keys.js - 官方 wiki skin.ini 键名（大小写敏感）
// 来源：https://osu.ppy.sh/wiki/en/Skinning/skin.ini
// 只承认页面上写出的节名和键名。大小写、英式 Colour 拼写、后缀都要对上。
// ============================================================================

        const OFFICIAL_SKIN_INI_SECTIONS = new Set([
            'General',
            'Colours',
            'Fonts',
            'CatchTheBeat',
            'Mania'
        ]);

        const OFFICIAL_GENERAL_KEYS = new Set([
            'Name',
            'Author',
            'Version',
            'AnimationFramerate',
            'AllowSliderBallTint',
            'ComboBurstRandom',
            'CursorCentre',
            'CursorExpand',
            'CursorRotate',
            'CursorTrailRotate',
            'CustomComboBurstSounds',
            'HitCircleOverlayAboveNumber',
            'HitCircleOverlayAboveNumer',
            'LayeredHitSounds',
            'SliderBallFlip',
            'SpinnerFadePlayfield',
            'SpinnerFrequencyModulate',
            'SpinnerNoBlink'
        ]);

        const OFFICIAL_COLOUR_KEYS = new Set([
            'Combo1',
            'Combo2',
            'Combo3',
            'Combo4',
            'Combo5',
            'Combo6',
            'Combo7',
            'Combo8',
            'InputOverlayText',
            'MenuGlow',
            'SliderBall',
            'SliderBorder',
            'SliderTrackOverride',
            'SongSelectActiveText',
            'SongSelectInactiveText',
            'SpinnerBackground',
            'StarBreakAdditive'
        ]);

        const OFFICIAL_FONT_KEYS = new Set([
            'HitCirclePrefix',
            'HitCircleOverlap',
            'ScorePrefix',
            'ScoreOverlap',
            'ComboPrefix',
            'ComboOverlap'
        ]);

        const OFFICIAL_CATCH_KEYS = new Set([
            'HyperDash',
            'HyperDashFruit',
            'HyperDashAfterImage'
        ]);

        // 编辑器仍使用的 [Mania] 字体覆盖。wiki 没有这两个键，只接受与导出名完全一致的写法。
        const EDITOR_MANIA_FONT_KEYS = new Set([
            'FontCombo',
            'FontScore'
        ]);

        const OFFICIAL_MANIA_EXACT_KEYS = new Set([
            'Keys',
            'ColumnStart',
            'ColumnRight',
            'ColumnSpacing',
            'ColumnWidth',
            'ColumnLineWidth',
            'BarlineHeight',
            'LightingNWidth',
            'LightingLWidth',
            'WidthForNoteHeightScale',
            'HitPosition',
            'LightPosition',
            'ScorePosition',
            'ComboPosition',
            'JudgementLine',
            'LightFramePerSecond',
            'SpecialStyle',
            'ComboBurstStyle',
            'SplitStages',
            'StageSeparation',
            'SeparateScore',
            'KeysUnderNotes',
            'UpsideDown',
            'KeyFlipWhenUpsideDown',
            'NoteFlipWhenUpsideDown',
            'NoteBodyStyle',
            'ColourColumnLine',
            'ColourBarline',
            'ColourJudgementLine',
            'ColourKeyWarning',
            'ColourHold',
            'ColourBreak',
            'ComboOverlap',
            'ScoreOverlap',
            'StageLeft',
            'StageRight',
            'StageBottom',
            'StageHint',
            'StageLight',
            'LightingN',
            'LightingL',
            'WarningArrow',
            'Hit0',
            'Hit50',
            'Hit100',
            'Hit200',
            'Hit300',
            'Hit300g'
        ]);

        const OFFICIAL_MANIA_IMAGE_EXACT = new Set([
            'StageLeft',
            'StageRight',
            'StageBottom',
            'StageHint',
            'StageLight',
            'LightingN',
            'LightingL',
            'WarningArrow',
            'Hit0',
            'Hit50',
            'Hit100',
            'Hit200',
            'Hit300',
            'Hit300g'
        ]);

        // wiki：列下标 0–17；Colour# / ColourLight# 从 1 起，18K 到 18。
        const MANIA_COLUMN_INDEX = '(?:1[0-7]|[0-9])';
        const MANIA_COLOUR_INDEX = '(?:1[0-8]|[1-9])';

        function officialSkinIniSection(name) {
            const text = String(name || '').trim();
            return OFFICIAL_SKIN_INI_SECTIONS.has(text) ? text : null;
        }

        function isOfficialManiaImageKey(key) {
            const name = String(key || '');
            if (OFFICIAL_MANIA_IMAGE_EXACT.has(name)) return true;
            if (new RegExp('^KeyImage' + MANIA_COLUMN_INDEX + '$').test(name)) return true;
            if (new RegExp('^KeyImage' + MANIA_COLUMN_INDEX + 'D$').test(name)) return true;
            if (new RegExp('^NoteImage' + MANIA_COLUMN_INDEX + '$').test(name)) return true;
            if (new RegExp('^NoteImage' + MANIA_COLUMN_INDEX + '[HLT]$').test(name)) return true;
            return false;
        }

        function isOfficialManiaKey(key) {
            const name = String(key || '');
            if (OFFICIAL_MANIA_EXACT_KEYS.has(name) || EDITOR_MANIA_FONT_KEYS.has(name)) return true;
            if (isOfficialManiaImageKey(name)) return true;
            if (new RegExp('^KeyFlipWhenUpsideDown' + MANIA_COLUMN_INDEX + '$').test(name)) return true;
            if (new RegExp('^KeyFlipWhenUpsideDown' + MANIA_COLUMN_INDEX + 'D$').test(name)) return true;
            if (new RegExp('^NoteFlipWhenUpsideDown' + MANIA_COLUMN_INDEX + '$').test(name)) return true;
            if (new RegExp('^NoteFlipWhenUpsideDown' + MANIA_COLUMN_INDEX + '[HLT]$').test(name)) return true;
            if (new RegExp('^NoteBodyStyle' + MANIA_COLUMN_INDEX + '$').test(name)) return true;
            if (new RegExp('^Colour' + MANIA_COLOUR_INDEX + '$').test(name)) return true;
            if (new RegExp('^ColourLight' + MANIA_COLOUR_INDEX + '$').test(name)) return true;
            return false;
        }

        function officialSkinIniKeyName(section, key) {
            const name = String(key || '');
            if (section === 'General') return OFFICIAL_GENERAL_KEYS.has(name) ? name : null;
            if (section === 'Colours') return OFFICIAL_COLOUR_KEYS.has(name) ? name : null;
            if (section === 'Fonts') return OFFICIAL_FONT_KEYS.has(name) ? name : null;
            if (section === 'CatchTheBeat') return OFFICIAL_CATCH_KEYS.has(name) ? name : null;
            if (section === 'Mania') return isOfficialManiaKey(name) ? name : null;
            return null;
        }

        // 导出合并时的身份：只有和 wiki 完全一致的键才算同一个参数。
        // ColorHold、barlineheight、ShowJudgementLine 不会并进正式键。
        function skinIniExportKeyIdentity(sectionName, key) {
            const section = officialSkinIniSection(sectionName);
            const official = section ? officialSkinIniKeyName(section, key) : null;
            if (official) return 'official:' + official;
            return 'raw:' + String(sectionName || '') + ':' + String(key || '');
        }

        function maniaColumnIndex(text) {
            const index = parseInt(text, 10);
            return (index >= 0 && index <= 17) ? index : null;
        }

        function maniaColourColumnIndex(text) {
            const index = parseInt(text, 10);
            if (!(index >= 1 && index <= 18)) return null;
            return index - 1;
        }
