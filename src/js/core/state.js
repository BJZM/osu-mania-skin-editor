// ============================================================================
// state.js - 全局状态、DOM 引用、动画时钟与共享常量
// 依赖：core/stage-layout.js
// ============================================================================

        let isSkinLoading = false; // 皮肤加载状态标记

        const LML = Object.freeze({
            ColumnBackgroundColour: 'ColumnBackgroundColour',
            ColumnWidth: 'ColumnWidth',
            ColumnSpacing: 'ColumnSpacing',
            ColumnStart: 'ColumnStart',
            ColumnRight: 'ColumnRight',
            SplitStages: 'SplitStages',
            StageSeparation: 'StageSeparation',
            UpsideDown: 'UpsideDown',
            HitPosition: 'HitPosition',
            ScorePosition: 'ScorePosition',
            ComboPosition: 'ComboPosition',
            LightPosition: 'LightPosition',
            WidthForNoteHeightScale: 'WidthForNoteHeightScale',
            MinimumColumnWidth: 'MinimumColumnWidth',
            BarLineHeight: 'BarLineHeight',
            ColourBarline: 'ColourBarline',
            NoteBodyStyle: 'NoteBodyStyle',
            ShowJudgementLine: 'ShowJudgementLine',
            KeysUnderNotes: 'KeysUnderNotes',
            LightFramePerSecond: 'LightFramePerSecond',
            ExplosionWidth: 'ExplosionWidth',
            ExplosionScale: 'ExplosionScale',
            ComboBreakColour: 'ComboBreakColour',
            ColourHold: 'ColourHold',
            ColourLight: 'ColourLight',
            HoldNoteLightWidth: 'HoldNoteLightWidth',
            HoldNoteLightScale: 'HoldNoteLightScale',
            KeyImage: 'KeyImage',
            KeyImageDown: 'KeyImageDown',
            NoteImage: 'NoteImage',
            HoldNoteHeadImage: 'HoldNoteHeadImage',
            HoldNoteTailImage: 'HoldNoteTailImage',
            HoldNoteBodyImage: 'HoldNoteBodyImage',
            HoldNoteLightImage: 'HoldNoteLightImage',
            HitTargetImage: 'HitTargetImage',
            ExplosionImage: 'ExplosionImage',
            LightImage: 'LightImage',
            LeftStageImage: 'LeftStageImage',
            RightStageImage: 'RightStageImage',
            BottomStageImage: 'BottomStageImage',
            Hit300g: 'Hit300g', Hit300: 'Hit300', Hit200: 'Hit200', Hit100: 'Hit100', Hit50: 'Hit50', Hit0: 'Hit0',
        });

        const NOTE_BODY_STYLE = Object.freeze({
            Stretch: 0,
            RepeatFromTail: 1,
            RepeatFromHead: 2,
            RepeatTopAndBottom: 3,
        });

        const DEFAULT_HIT_POSITION = 402;
        const DEFAULT_COMBO_POSITION = 111;
        const DEFAULT_SCORE_POSITION = 300;

        let skinImageStore = new Map();
        let skinFallbackImageStore = new Map();
        let defaultSkinImageStore = new Map();
        let defaultSkinFallbackStore = new Map();
        let isDefaultSkinLoaded = false;
        let maniaSkinConfigurations = new Map();
        let globalSkinImageLookups = new Map();
        // skin.ini [General] Version 的全局快照（默认 2.7，即支持 @2x 与现代 Mania 排版的版本）。
        // 必须声明在脚本顶层：parseSkinIniLazer 负责写入，getManiaSkinConfig 与 renderer.js
        // 的 ColumnLineWidth 着色逻辑都要读取它（此前它是 parseSkinIniLazer 内的局部 let，
        // 导致「配置表为空时」渲染直接抛 ReferenceError: globalSkinVersion is not defined）。
        let globalSkinVersion = 2.7;
        let activeSkinBlobUrls = [];

        // ===== 可视化皮肤编辑器 & skin.ini 参数配置全局状态 =====
        let currentSkinZip = null;
        let currentSkinFileName = 'Custom_Mania_Skin';
        let currentSkinMetadata = {
            general: {
                Name: 'Custom Mania Skin',
                Author: 'Unknown',
                Version: 'latest',
                AnimationFramerate: 60,
                CursorRotate: 0,
                CursorExpand: 1,
                CursorCentre: 1,
            },
            colours: {},
            fonts: {},
            rawSections: {},
            rawIniText: ''
        };
        let userReplacedTextures = new Map();
        // 记录从贴图库删除的资源文件名；导出时据此移除原始包条目，并允许撤销恢复。
        let deletedSkinTexturePaths = new Set();
        // 记录通过创建贴图功能生成的纯色贴图参数；支持在全部贴图区域对其进行二次编辑
        let createdSkinTextureParams = new Map();
        // score-percent 首次被编辑器改写前保留可见百分号字形；用于在透明垫片模式下
        // 重新开启百分号时恢复同一套皮肤的原始字形，而不是退化成固定占位图。
        let scorePercentSourceImages = new Map();
        let initialSkinSnapshot = null;
        let canvasEditMode = true;
        let selectedCanvasElement = null;
        let canvasInteractiveElements = [];
        let isDraggingCanvasElement = false;
        let canvasDragState = null;
        let selectionAnimStartTime = 0;
        let currentTrackDragMode = 'auto'; // 'auto' | 'width' | 'spacing'
        let activeEditorTab = 'mania';
        let activeEditorKeyCount = 4;
        function getActiveKeyCount() {
            if (currentBeatmap && currentBeatmap.keys) return currentBeatmap.keys;
            if (currentBeatmap && currentBeatmap.difficulty && currentBeatmap.difficulty.circleSize) return Math.round(currentBeatmap.difficulty.circleSize);
            if (activeEditorKeyCount) return activeEditorKeyCount;
            if (maniaSkinConfigurations.size > 0) return maniaSkinConfigurations.keys().next().value || 4;
            return 4;
        }
        let paramSearchQuery = '';
        let isFontsAdvancedExpanded = false;
        // 参数面板「分类折叠」状态：key = `${tab}::${category}`，只记忆用户手动折叠过的分类
        let collapsedParamCategories = new Set();
        let targetTextureUploadKey = null;
        let targetTextureUploadFilename = null;
        let targetTextureUploadParamKey = null;
        let targetTextureUploadColIndex = null;
        let openAnimTextureEditor = null;
        let closeAnimTextureEditor = null;
        let textureUploadUi = null;
        let testHoldingUntil = 0;
        let testComboBreakUntil = 0;
        // 按键发光 (StageLight) 预览：> performance.now() 期间强制所有轨道视为「按下」，
        // 便于在参数面板里直接看到 ColourLight 的颜色效果（发光只在按住时可见）。
        let testLightUntil = 0;


        // 判定提示演示状态与参数
        let isPreviewJudgementActive = false;
        let judgementPreviewIndex = 0;
        let lastPreviewTickTime = 0;
        let previewSimCombo = 100;
        let previewSavedCombo = 0;
        let previewBreakResumeTime = 0;
        let playbackBreakResumeTime = 0;
        let playbackSavedCombo = 0;

        // 判定演示分布序列 (对齐实际高水平结算比例：300及以上占比超94%，300g与300保持约2.5:1，中间穿插少量200/100/50，末尾Miss断连)
        const JUDGEMENT_PREVIEW_PATTERN = (() => {
            const G = LML.Hit300g;
            const P = LML.Hit300;
            const pattern = [];
            const add300s = (countG, countP) => {
                const total = countG + countP;
                let nextP = countP > 0 ? (total / countP) / 2 : Infinity;
                let g = 0, p = 0;
                for (let i = 0; i < total; i++) {
                    if (p < countP && (i >= nextP || g >= countG)) {
                        pattern.push(P);
                        p++;
                        nextP += total / countP;
                    } else {
                        pattern.push(G);
                        g++;
                    }
                }
            };
            // 300g (MAX / ★) 90 个，300 (PERFECT) 36 个 (比例 2.5 : 1)
            // 穿插 4 次 200 (GREAT), 1 次 100 (GOOD), 1 次 50 (BAD), 1 次 0 (MISS)
            add300s(13, 5);
            pattern.push(LML.Hit200);
            add300s(13, 5);
            pattern.push(LML.Hit200);
            add300s(13, 5);
            pattern.push(LML.Hit100);
            add300s(13, 5);
            pattern.push(LML.Hit200);
            add300s(13, 5);
            pattern.push(LML.Hit200);
            add300s(13, 5);
            pattern.push(LML.Hit50);
            add300s(12, 6);
            pattern.push(LML.Hit0);
            return pattern;
        })();


        // 判定贴图参数键集合：画布上的「判定提示 / 判定结果评价」元素并非对应单张贴图，
        // 而是由这 6 张判定贴图共同决定 (彩300g / 黄300 / 绿200 / 蓝100 / 灰50 / Miss)。
        // 选中判定提示后点击「替换贴图」按钮时，会一次性定位并高亮这些参数卡片。
        const JUDGEMENT_TEXTURE_PARAM_KEYS = ['Hit300g', 'Hit300', 'Hit200', 'Hit100', 'Hit50', 'Hit0'];


        // osu! wiki 规范: [Fonts] 及 Mania 模式数字贴图与重叠量配置
        let skinFontsConfig = {
            scorePrefix: 'score',
            scoreOverlap: 0,
            comboPrefix: 'combo',
            comboOverlap: 0,
            hitCirclePrefix: 'default',
            hitCircleOverlap: -2,
            hasExplicitScoreOverlap: false,
            hasExplicitComboOverlap: false,
            hasExplicitComboPrefix: false
        };

        let beatmaps = [];
        let currentBeatmap = null;
        let currentTimingPoints = [];
        let currentManiaScrollState = null;
        let enableStoryboard = true;
        let enableVideo = true;
        let activeNotes = [];
        let isPreviewMode = false;
        let audio = new Audio();
        let audioBlobUrl = null;

        // osu!stable / lazer 常用默认流速为 24 (范围 1~40)
        let scrollSpeed = 24;
        let isPlaying = false;
        let animationId;
        let judgements = [];
        let lastAnimFrameTime = performance.now();
        let activeExplosions = [];

        // ===== 画布特效动画时钟（暂停即冻结）=====
        // 打击特效 (LightingN/L) 这类「演出型」动画原先用 performance.now() 计时，
        // 于是暂停后它仍会继续播放并在 ~200ms 内消失 —— 想点选/调宽度时特效已经没了。
        // 改为一条「只在播放时前进」的虚拟时钟：
        //   · 播放中 / 纯皮肤预览模式 → 与真实时间同速前进
        //   · 暂停时 → 完全冻结，特效定格在暂停那一刻，方便在画布上选中
        let effectAnimClockMs = 0;
        let effectAnimClockLastReal = performance.now();
        function updateEffectAnimClock() {
            const now = performance.now();
            let dt = now - effectAnimClockLastReal;
            effectAnimClockLastReal = now;
            if (!(dt > 0)) dt = 0;
            if (dt > 250) dt = 250; // 后台标签页 / 卡顿造成的跳变做钳制，避免动画瞬移
            if (isPlaying || isPreviewMode) effectAnimClockMs += dt;
            return effectAnimClockMs;
        }

        // osu!lazer LegacyColumnBackground 里写死的「松开按键」动画时长 (ms)：
        //   FadeTo(0, 250) + ScaleTo(new Vector2(1, 0), 250)，ini 不可配。
        const STAGE_LIGHT_FADE_DURATION_MS = 250;
        // 面板缩略图循环预览里的「按住」停留时长，仅影响预览观感，不参与画布渲染。
        const STAGE_LIGHT_PREVIEW_HOLD_MS = 500;
        let debugMode = false;

        let comboAnimState = {
            lastCombo: 0,
            incStartTime: -1000,
            breakStartTime: -1000,
            breakCount: 0,
        };

        let canvasBgImage = new Image();
        let hasCanvasBg = false;

        const ui = {
            osz: document.getElementById('oszInput'), osk: document.getElementById('oskInput'),
            oszWrapper: document.getElementById('oszWrapper'), oskWrapper: document.getElementById('oskWrapper'),
            oszFileName: document.getElementById('oszFileName'),
            oskFileName: document.getElementById('oskFileName'),
            diff: document.getElementById('diffSelect'),
            diffBtn: document.getElementById('diffSelectBtn'),
            diffLabel: document.getElementById('diffSelectLabel'),
            diffMenu: document.getElementById('diffMenu'),
            diffDropdown: document.getElementById('diffDropdownWrapper'),
            speedRange: document.getElementById('speedRange'), speedText: document.getElementById('speedText'),
            dimRange: document.getElementById('dimRange'), dimText: document.getElementById('dimText'),
            sidebarResizer: document.getElementById('sidebarResizer'),
            bg: document.getElementById('bg-image'), bgOverlay: document.getElementById('bg-overlay'),
            stats: {
                diff: document.getElementById('stat-diff'), keys: document.getElementById('stat-keys'),
                time: document.getElementById('stat-time'), notes: document.getElementById('stat-notes'),
                holds: document.getElementById('stat-holds')
            },
            // 播放器控制器组件
            playerControls: document.getElementById('playerControls'),
            progressRange: document.getElementById('progressRange'),
            currentTimeText: document.getElementById('currentTimeText'),
            remainTimeText: document.getElementById('remainTimeText'),
            playPauseBtn: document.getElementById('playPauseBtn'),
            volumeRange: document.getElementById('volumeRange'),
            volumeText: document.getElementById('volumeText'),
            volumeMuteBtn: document.getElementById('volumeMuteBtn'),
            // 加载与通知组件
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingTitle: document.getElementById('loadingTitle'),
            loadingPercent: document.getElementById('loadingPercent'),
            progressBarFill: document.getElementById('progressBarFill'),
            loadingFileText: document.getElementById('loadingFileText'),
            toastContainer: document.getElementById('toastContainer'),
            canvasWrapper: document.getElementById('canvasWrapper'),
            fullscreenBtn: document.getElementById('fullscreenBtn')
        };
        let canvasBgAlpha = 0;
        let canvasBgTargetAlpha = 0;
        let prevCanvasBgImage = null;
        let bgFadeStartTime = 0;
        const BG_FADE_DURATION = 450; // 背景切换淡入淡出动画时长 (ms)
        let bgDim = 80; // 背景暗化百分比 (0 ~ 100)，默认 80%
        let pageBgUrl = null;
        let loadedOszForBg = false;

        function formatPlayerTime(seconds) {
            if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
            const s = Math.floor(seconds);
            const m = Math.floor(s / 60);
            const remSec = s % 60;
            return `${String(m).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
        }
        function formatFontPrefix(prefix) {
            if (!prefix) return '';
            const p = prefix.trim();
            if (p.endsWith('-') || p.endsWith('/')) return p;
            return p + '-';
        }
