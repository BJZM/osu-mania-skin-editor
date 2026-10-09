// ============================================================================
// parameter-schema.js - skin.ini 可视化参数元数据
// 依赖：core/state.js、skin/mania-config.js
// ============================================================================

        function getManiaNoteTextureName(keys, lookup, columnIndex, out) {
            if (out) { out.explicit = false; out.explicitValue = ''; out.matchedKey = ''; }
            const mCfg = maniaSkinConfigurations.get(keys) || getManiaConfigForKeys(keys);
            const searchKeys = buildPerTrackTextureSearchKeys(lookup, columnIndex);
            const hit = findExplicitImageLookupValue(mCfg, searchKeys);
            if (hit) {
                if (out) { out.explicit = true; out.explicitValue = hit.value; out.matchedKey = hit.matchedKey; }
                return hit.value;
            }
            const fc = computeFallbackColumnIndex(keys, columnIndex | 0);
            return defaultFilenameForLookup(lookup, fc) || '';
        }

        const SKIN_INI_PARAM_SCHEMA = [
            // [Mania] 显示与布局
            {
                key: 'ColumnStart',
                zhName: '轨道起始水平位置',
                enName: 'ColumnStart',
                comment: '480p 虚拟像素 (默认 136)',
                desc: '定义最左侧轨道距离整个游戏区域左边界的水平像素距离。数值越小轨道越靠左，数值越大越靠右。在画布上可以直接横向拖动轨道调整。',
                category: '显示与布局',
                tab: 'mania',
                type: 'number',
                min: -200,
                max: 800,
                step: 1,
                default: 136,
                elementId: 'track'
            },
            {
                key: 'ColumnRight',
                zhName: '轨道靠右对齐偏移',
                enName: 'ColumnRight',
                comment: '480p 虚拟像素 (默认 19)',
                desc: '当使用右对齐时距离右侧边界的偏移量。',
                category: '显示与布局',
                tab: 'mania',
                type: 'number',
                min: 0,
                max: 700,
                step: 1,
                default: 19,
                elementId: 'track'
            },
            {
                key: 'ColumnWidth',
                zhName: '轨道各列宽度',
                enName: 'ColumnWidth',
                comment: '逗号分隔的列宽像素 (默认 30；受轨道总宽上限约束)',
                desc: '每一列轨道的像素宽度，多列以逗号隔开 (如 70,70,70,70)。在画布上直接拖拽列之间的分割线也可实时调整单列列宽。注意：轨道总宽（所有列宽 + 列间距）不能超过「画布可用宽度 − ColumnStart」，其中画布可用宽度 = 480 × 屏宽 / 屏高（16:9 约 853.3、4:3 为 640、竖屏更小）。它与 ColumnSpacing 共享同一宽度预算，增大其一即压缩另一个的可用空间；触达上限时会提示并阻止继续调整。',
                category: '显示与布局',
                tab: 'mania',
                type: 'array_number',
                min: 5,
                max: 300,
                step: 1,
                default: 30,
                elementId: 'track'
            },
            {
                key: 'ColumnSpacing',
                zhName: '轨道各列间距',
                enName: 'ColumnSpacing',
                comment: '逗号分隔的列间距像素 (默认 0；受轨道总宽上限约束)',
                desc: '相邻轨道之间的空隙距离，多列以逗号隔开 (如 0,0,0,0)。注意：轨道总宽（所有列宽 + 列间距）不能超过「画布可用宽度 − ColumnStart」（画布可用宽度 = 480 × 屏宽 / 屏高，随窗口宽高比变化），与 ColumnWidth 共享同一宽度预算；触达上限时会提示并阻止继续调整。',
                category: '显示与布局',
                tab: 'mania',
                type: 'array_number',
                min: 0,
                max: 100,
                step: 1,
                default: 0,
                elementId: 'track'
            },
            {
                key: 'ColumnLineWidth',
                zhName: '轨道分界线宽度',
                enName: 'ColumnLineWidth',
                comment: '分界线粗细 (默认 2)',
                desc: '每条轨道左右分割线的像素宽度。',
                category: '显示与布局',
                tab: 'mania',
                type: 'array_number',
                min: 0,
                max: 20,
                step: 1,
                default: 2,
                elementId: 'track'
            },
            {
                key: 'BarLineHeight',
                zhName: '小节线像素高度',
                enName: 'BarlineHeight',
                comment: '像素 (默认 1.2)',
                desc: '音乐小节线的厚度/粗细。设为 0 可隐藏小节线。',
                category: '显示与布局',
                tab: 'mania',
                type: 'number',
                min: 0,
                max: 20,
                step: 0.1,
                default: 1.2,
                elementId: 'track'
            },
            {
                key: 'HitPosition',
                zhName: '判定线垂直位置',
                enName: 'HitPosition',
                comment: '480p 虚拟像素 (经典 402, 贴底 413)',
                desc: '控制判定基准线以及按键下边缘在屏幕上的垂直高度。osu! 规范采用 480p 虚拟网格，数值越大越靠近底部。在画布上直接拖拽判定线即可实时同步更新。',
                category: '显示与布局',
                tab: 'mania',
                type: 'number',
                min: 0,
                max: 480,
                step: 1,
                default: 402,
                elementId: 'hitPosition'
            },
            {
                key: 'ShowJudgementLine',
                zhName: '显示判定线',
                enName: 'JudgementLine',
                comment: '1 为开启，0 为关闭 (JudgementLine: 1/0)',
                desc: '控制是否在 HitPosition 处渲染明显的白色判定线或使用 StageHint 贴图。',
                category: '显示与布局',
                tab: 'mania',
                type: 'boolean',
                default: true,
                elementId: 'hitPosition'
            },
            {
                key: 'ScorePosition',
                zhName: '判定结果垂直位置',
                enName: 'ScorePosition',
                comment: '480p 虚拟像素 (默认 300)',
                desc: '控制击打音符时显示的判定评价（如 300g, 300, 200, 50, Miss）的垂直中心高度。在画布上直接拖拽判定文字即可实时调整。',
                category: '显示与布局',
                tab: 'mania',
                type: 'number',
                min: 0,
                max: 480,
                step: 1,
                default: 300,
                elementId: 'judgement'
            },
            {
                key: 'ScorePercentWidth',
                zhName: '准度位置（百分号透明垫片宽度）',
                enName: 'score-percent.png width',
                comment: '1x 逻辑像素；控制准度与进度饼图水平位置',
                desc: '通过 score-percent 贴图宽度移动右上角准度数字及左侧歌曲进度饼图。数值越大，准度与饼图整体越靠左；该值不会写入 skin.ini，导出时会实际生成透明 score-percent.png。调整宽度会自动关闭「显示百分号」。可在画布上直接横向拖动歌曲进度饼图实时调整。',
                category: '显示与布局',
                tab: 'mania',
                type: 'number',
                min: 1,
                max: 2000,
                step: 1,
                default: 1,
                elementId: 'hud_progress_pie',
                virtual: true
            },
            {
                key: 'ScorePercentVisible',
                zhName: '显示百分号',
                enName: 'Show score-percent',
                comment: '开启后移除透明覆盖并恢复原始百分号贴图',
                desc: '控制右上角准度文本中的百分号是否可见。关闭时会生成纯透明 score-percent.png，用于通过宽度移动准度与进度饼图；重新开启时会删除编辑器生成的透明覆盖，直接恢复皮肤原有的 score-percent 贴图。任何宽度调整都会自动关闭此开关。',
                category: '显示与布局',
                tab: 'mania',
                type: 'boolean',
                default: true,
                elementId: 'hud_progress_pie',
                virtual: true
            },
            {
                key: 'ComboPosition',
                zhName: '连击数垂直位置',
                enName: 'ComboPosition',
                comment: '480p 虚拟像素 (默认 111)',
                desc: '控制画面正中间显示的连击数字的垂直中心高度。未设置时通常继承自 ScorePosition 或默认 111。在画布上直接拖拽连击数即可实时调整。',
                category: '显示与布局',
                tab: 'mania',
                type: 'number',
                min: 0,
                max: 480,
                step: 1,
                default: 111,
                elementId: 'combo'
            },
            {
                key: 'LightPosition',
                zhName: '按键动画垂直位置',
                enName: 'LightPosition',
                comment: '480p 虚拟像素 (默认 413)',
                desc: '控制按键被按下时轨道底座发光贴图 (StageLight) 的基准位置（不是打击特效，而是按下按键之后出现的动画）。在画布上拖拽发光区域可实时调整。',
                category: '显示与布局',
                tab: 'mania',
                type: 'number',
                min: 0,
                max: 480,
                step: 1,
                default: 413,
                elementId: 'lightPosition'
            },
            {
                // 参数 key 沿用 cfg 内部字段名 ExplosionWidth（= ini 键 LightingNWidth），
                // 这样参数面板读写、画布元素 paramKey、撤销快照、导出逻辑全部指向同一份数据，无需任何映射。
                key: 'ExplosionWidth',
                zhName: '单键打击特效宽度',
                enName: 'LightingNWidth',
                comment: '各轨宽度数组，0 = 跟随列宽 (默认 0)',
                desc: '击中单键音符时播放的 LightingN 爆炸特效宽度，逐轨生效，多列以逗号隔开 (如 30,30,30,30)。贴图本身是全局 LightingN，所有轨道共用；这里只允许稳定版支持的逐轨宽度数组。数值为 480p 虚拟像素，与列宽同单位：特效缩放倍率 = 该数值 / 30；填 0 表示「不指定」并自动按当前列宽等比缩放。该特效的几何中心固定为对应轨道中心、垂直中心固定对齐判定线 HitPosition，因此不能在画布上拖动位置，但可以直接在画布上点选它、左右拖拽边缘实时调整宽度，也可以在此处逐轨精确填写。注意：它不是「按键按下发光」(那是 LightPosition + StageLight)，而是打到音符才出现的爆炸特效。',
                category: '显示与布局',
                tab: 'mania',
                type: 'array_number',
                min: 0,
                max: 300,
                step: 1,
                default: 0,
                elementId: 'lighting_n_col_0'
            },
            {
                // 同上：key = cfg 内部字段名 HoldNoteLightWidth（= ini 键 LightingLWidth）
                key: 'HoldNoteLightWidth',
                zhName: '长条打击特效宽度',
                enName: 'LightingLWidth',
                comment: '各轨宽度数组，0 = 跟随列宽 (默认 0)',
                desc: '长条 (LN) 按住期间持续播放的 LightingL 光效宽度，逐轨生效，多列以逗号隔开 (如 30,30,30,30)。贴图本身是全局 LightingL，所有轨道共用；这里只允许稳定版支持的逐轨宽度数组。数值为 480p 虚拟像素，与列宽同单位：特效缩放倍率 = 该数值 / 30；填 0 表示「不指定」并自动按当前列宽等比缩放。与单键打击特效 LightingNWidth 相互独立，请分别调整。该特效几何中心固定为对应轨道中心、垂直中心对齐判定线 HitPosition，不可拖动位置，但可在画布上点选并左右拖拽边缘实时调整宽度。',
                category: '显示与布局',
                tab: 'mania',
                type: 'array_number',
                min: 0,
                max: 300,
                step: 1,
                default: 0,
                elementId: 'lighting_l_col_0'
            },
            {
                key: 'KeysUnderNotes',
                zhName: '按键图层置于音符下方',
                enName: 'KeysUnderNotes',
                comment: '0: 覆盖音符, 1: 位于音符下',
                desc: '设置底部按键贴图 (KeyImage) 与下落音符的层叠渲染顺序。1 表示按键沉在音符底部，音符会穿过并覆盖按键。',
                category: '显示与布局',
                tab: 'mania',
                type: 'boolean',
                default: false,
                elementId: 'key_0'
            },
            {
                key: 'UpsideDown',
                zhName: '上下颠倒 (上升模式)',
                enName: 'UpsideDown',
                comment: '0: 下落式, 1: 上升式',
                desc: '将传统自上而下的下落式转变为自下而上的上升式演奏视角。',
                category: '显示与布局',
                tab: 'mania',
                type: 'boolean',
                default: false,
                elementId: 'track'
            },

            // [Mania] 颜色
            {
                key: 'ColumnColour',
                zhName: '轨道底色与透明度',
                enName: 'ColumnColour',
                comment: 'RGBA 颜色与透明度',
                desc: '定义各个轨道的背景底色与透明度（如 0,0,0,0 为全透隐形轨道，0,0,0,180 为半透磨砂黑）。对应 skin.ini 中的 Colour1, Colour2, ... 等参数。',
                category: '颜色',
                tab: 'mania',
                type: 'column_colour',
                default: '0,0,0,255',
                elementId: 'track_col_0'
            },
            {
                key: 'ColourBarline',
                zhName: '小节线颜色',
                enName: 'ColourBarline',
                comment: 'RGBA 颜色 (默认 255,255,255,255)',
                desc: '音乐小节线的绘制色彩与透明度。支持自由选择颜色与调节透明度，设为 0,0,0,0 或将透明度拉至 0 可隐藏小节线。',
                category: '颜色',
                tab: 'mania',
                type: 'colour_barline',
                default: '255,255,255,255',
                elementId: 'track'
            },
            {
                // 按键发光 (mania-stage-light / StageLight) 的着色来源。
                // lazer 侧：LegacyColumnBackground 取 ColumnLightColour lookup ->
                //   LegacySkin.cs `getCustomColour(existing, $"ColourLight{ColumnIndex + 1}")`
                //   -> light.Colour = LegacyColourCompatibility.DisallowZeroAlpha(lightColour)
                // 即 skin.ini 的 [Mania] ColourLight1, ColourLight2, ... 逐轨生效；
                // 未指定时该 lookup 返回 null，引擎回退 Color4.White（纯白）。
                // 注意区分：Colour1..N 是轨道底色 (ColumnColour)，LightingN/L 是打击特效颜色，三者互不相干。
                key: 'ColourLight',
                zhName: '按键动画颜色',
                enName: 'ColourLight',
                comment: 'RGBA 颜色 (默认 255,255,255,255 纯白)',
                desc: '按住按键时轨道发光贴图 (mania-stage-light / StageLight) 的着色，逐轨生效，对应 skin.ini 的 ColourLight1, ColourLight2, ...。alpha 会与「按下/松开」动画的透明度相乘，所以把透明度调低可以让发光变淡。它是「按下就常驻」的按键动画颜色，与打到音符才迸发的打击特效 (LightingN / LightingL) 是两套完全独立的颜色。',
                category: '颜色',
                tab: 'mania',
                type: 'light_colour',
                default: '255,255,255,255',
                elementId: 'lightPosition'
            },
            {
                key: 'ColourHold',
                zhName: '按住hold时连击字体颜色变换',
                enName: 'ColourHold',
                comment: 'RGBA 颜色 (默认 255,191,51,255)',
                desc: '按住长条（Hold Note）时，屏幕中央连击数字（Combo）变色的滤镜高亮色彩。支持颜色与透明度调节，并支持一键实时预览变色效果。',
                category: '颜色',
                tab: 'mania',
                type: 'colour_hold',
                default: '255,191,51,255',
                elementId: 'combo'
            },
            {
                key: 'ComboBreakColour',
                zhName: '断连遮罩颜色',
                enName: 'ComboBreakColour',
                comment: 'RGB 颜色 (默认红闪)',
                desc: '出现 Miss 断连击时屏幕短暂红闪及连击数爆破散开的警示颜色。支持一键实时预览断连击爆破效果。',
                category: '颜色',
                tab: 'mania',
                type: 'color',
                default: '255,0,0',
                elementId: 'combo'
            },

            // [Mania] 其他不常用选项
            {
                key: 'NoteBodyStyle',
                zhName: '长条身体拉伸/平铺模式',
                enName: 'NoteBodyStyle',
                comment: '0: 拉伸, 1: 从尾平铺, 2: 从头平铺',
                desc: '决定长条 (LN) 身体贴图 noteL 的渲染方式。0: 整张纵向拉伸 (Stretch)；1: 从尾部向下平铺循环 (RepeatFromTail，Percy LN 专属)；2: 从头部向上平铺循环 (RepeatFromHead)。',
                category: '其他不常用选项',
                tab: 'mania',
                type: 'select',
                options: [
                    { value: 1, label: '1 - 从尾部平铺 (RepeatFromTail, 推荐 / Percy LN)' },
                    { value: 0, label: '0 - 整段拉伸 (Stretch)' },
                    { value: 2, label: '2 - 从头部平铺 (RepeatFromHead)' },
                ],
                default: 1,
                elementId: 'track'
            },
            {
                key: 'WidthForNoteHeightScale',
                zhName: '音符高度自适应基准列宽',
                enName: 'WidthForNoteHeightScale',
                comment: '0 为自动自适应',
                desc: '根据指定列宽按比例缩放音符/长条头尾的垂直高度：高度 = 基准列宽 × (图片高 ÷ 图片宽)。设为 0 或不填时，自动取所有列宽中的最小值 MinimumColumnWidth 作为基准（与 osu! 官方一致），而不是当前列宽——因此各列列宽不同时，宽轨音符会被横向拉宽而高度仍按最窄列宽计算。',
                category: '其他不常用选项',
                tab: 'mania',
                type: 'number',
                min: 0,
                max: 200,
                step: 1,
                default: 0,
                elementId: 'track'
            },
            {
                key: 'LightFramePerSecond',
                zhName: '按键动画播放帧率',
                enName: 'LightFramePerSecond',
                comment: 'FPS (默认 60，写 ≤0 视为 24)',
                desc: '「按下按键就常驻」的按键发光贴图 (mania-stage-light / StageLight) 多帧序列的播放帧率，帧名形如 mania-stage-light-0, mania-stage-light-1…；ini 未写时默认 60，写了 0 或负数会被解析成 24。注意它只作用于按键发光：打到音符才迸发的打击特效 (LightingN / LightingL) 帧率与此参数无关，而是由帧数自行推导（总时长 170ms、单帧不短于 1/60 秒）。',
                category: '其他不常用选项',
                tab: 'mania',
                type: 'number',
                min: 1,
                max: 120,
                step: 1,
                default: 60,
                elementId: 'lightPosition'
            },
            {
                key: 'SplitStages',
                zhName: '双舞台分离模式',
                enName: 'SplitStages',
                comment: '0: 单舞台, 1: 双舞台左右分离',
                desc: '高键位 (如 7K/8K) 时将左右手轨道拆分成两组独立舞台。',
                category: '其他不常用选项',
                tab: 'mania',
                type: 'boolean',
                default: false,
                elementId: 'track'
            },
            {
                key: 'StageSeparation',
                zhName: '双舞台分离间距',
                enName: 'StageSeparation',
                comment: '分离距离像素 (默认 40)',
                desc: '启用双舞台时左右两块轨道之间的间隙距离。',
                category: '其他不常用选项',
                tab: 'mania',
                type: 'number',
                min: 0,
                max: 300,
                step: 1,
                default: 40,
                elementId: 'track'
            },

            // [Mania] 贴图映射
            {
                key: 'NoteImage',
                zhName: '单键音符默认贴图',
                enName: 'NoteImage',
                comment: 'NoteImage / NoteImage0..N',
                desc: '普通下落单键音符贴图。支持按轨单独配置 NoteImage0, NoteImage1... 或统一配置。在画布上点击音符可快速定位并替换贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-note1',
                elementId: 'note_0'
            },
            {
                key: 'HoldNoteHeadImage',
                zhName: '长条头部贴图',
                enName: 'HoldNoteHeadImage',
                comment: 'HoldNoteHeadImage / 0..N',
                desc: '长条音符 (LN) 起始头部的贴图。在画布上点击长条头部可快速定位并替换贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-note1',
                elementId: 'hold_head_1'
            },
            {
                key: 'HoldNoteBodyImage',
                zhName: '长条身体贴图',
                enName: 'HoldNoteBodyImage',
                comment: 'HoldNoteBodyImage / 0..N',
                desc: '长条音符 (LN) 身体拉伸/平铺部分的贴图。在画布上点击长条身体可快速定位并替换贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-note1L',
                elementId: 'hold_body_1'
            },
            {
                key: 'HoldNoteTailImage',
                zhName: '长条尾部贴图',
                enName: 'HoldNoteTailImage',
                comment: 'HoldNoteTailImage / 0..N',
                desc: '长条音符 (LN) 结尾尾部的贴图。在画布上点击长条尾部可快速定位并替换贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-note1T',
                elementId: 'hold_tail_1'
            },
            {
                key: 'KeyImage',
                zhName: '底座按键默认贴图',
                enName: 'KeyImage',
                comment: 'KeyImage / KeyImage0..N',
                desc: '底部琴键/按键未按下时的默认贴图。在画布上点击按键可快速定位并替换贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-key1',
                elementId: 'key_0'
            },
            {
                key: 'KeyImageDown',
                zhName: '底座按键按下贴图',
                enName: 'KeyImageDown',
                comment: 'KeyImageDown / KeyImage0D..ND',
                desc: '底部琴键/按键被按下点亮时的贴图。在画布上点击按键可快速定位并替换贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-key1D',
                elementId: 'key_0'
            },
            {
                key: 'StageLeft',
                zhName: '舞台左侧边界贴图',
                enName: 'StageLeft',
                comment: '轨道左外边框',
                desc: '垂直贴在第一轨左侧的边界立柱贴图。横向保持原始像素宽度不拉伸；纵向强制拉满全屏舞台高度。不拉伸推荐高度：1x 为 768px，@2x 高清为 1536px（1080p 为 1080px/2160px）。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-stage-left',
                elementId: 'track'
            },
            {
                key: 'StageRight',
                zhName: '舞台右侧边界贴图',
                enName: 'StageRight',
                comment: '轨道右外边框',
                desc: '垂直贴在最后一轨右侧的边界立柱贴图。横向保持原始像素宽度不拉伸；纵向强制拉满全屏舞台高度。不拉伸推荐高度：1x 为 768px，@2x 高清为 1536px（1080p 为 1080px/2160px）。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-stage-right',
                elementId: 'track'
            },
            {
                key: 'StageBottom',
                zhName: '舞台底部贴图',
                enName: 'StageBottom',
                comment: '轨道底部装饰条',
                desc: '位于整个游戏区域最底部的舞台基座贴图。宽高按原生尺寸 × 480p 缩放系数等比缩放（@2x 先折半），横向与纵向都不拉伸、水平居中并贴齐画布底部；存在 ColumnSpacing 或开启 SplitStages 时会被逐轨裁剪，轨道间隙留空。绘制层级在音符与按键之上，会遮挡落在舞台底部的音符。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-stage-bottom',
                elementId: 'track'
            },
            {
                key: 'StageHint',
                zhName: '判定线/提示贴图',
                enName: 'StageHint',
                comment: '横跨轨道的判定准心图',
                desc: '位于 HitPosition 的判定线贴图。支持点击上传本地图片替换。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-stage-hint',
                elementId: 'hitPosition'
            },
            {
                key: 'StageLight',
                zhName: '按键动画贴图',
                enName: 'StageLight',
                comment: '按下按键就出现的轨道发光动画',
                desc: '按键动画贴图。只要按下按键，轨道上就会常驻播放这段动画（与是否打到 note 无关），其渲染位置由「按键动画垂直位置 (LightPosition)」决定、颜色由 ColourLight 决定。默认文件名为 mania-stage-light.png，skin.ini 中对应键名为 StageLight（可写 blank / null / _blank 关闭）。注意区分：这不是打到 note 才出现的打击特效（那是「单键打击特效 LightingN」与「长条打击特效 LightingL」）。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-stage-light',
                elementId: 'lightPosition'
            },
            {
                key: 'LightingN',
                zhName: '单键打击特效',
                enName: 'LightingN',
                comment: '击中音符那一刻的爆炸光效',
                desc: '打到单键音符的那一刻迸发的爆炸 / 闪光贴图，只有命中才出现，平时不显示。默认文件名 lightingN.png，skin.ini 中对应键名为 LightingN。注意区分：按键按下时轨道上常驻的动画是「按键动画贴图 (StageLight / mania-stage-light)」。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'lightingN',
                elementId: 'lightPosition'
            },
            {
                key: 'LightingL',
                zhName: '长条打击特效',
                enName: 'LightingL',
                comment: '长条按住期间的持续光效',
                desc: '长条音符被击中并持续按住期间循环播放的光效贴图，只有打中长条才出现。默认文件名 lightingL.png，skin.ini 中对应键名为 LightingL。注意区分：按键按下时轨道上常驻的动画是「按键动画贴图 (StageLight / mania-stage-light)」。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'lightingL',
                elementId: 'lightPosition'
            },
            {
                key: 'Hit300g',
                zhName: '彩300 贴图',
                enName: 'Hit300g',
                comment: '完美判定打击特效',
                desc: '最高准度完美命中音符时弹出的判定效果贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-hit300g',
                elementId: 'judgement'
            },
            {
                key: 'Hit300',
                zhName: '黄300 判定贴图',
                enName: 'Hit300',
                comment: '300 判定效果',
                desc: '标准 300 判定效果文字贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-hit300',
                elementId: 'judgement'
            },
            {
                key: 'Hit200',
                zhName: '绿200 判定贴图',
                enName: 'Hit200',
                comment: '200 判定效果',
                desc: '200 判定效果文字贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-hit200',
                elementId: 'judgement'
            },
            {
                key: 'Hit100',
                zhName: '蓝100 判定贴图',
                enName: 'Hit100',
                comment: '100 判定效果',
                desc: '100 判定效果文字贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-hit100',
                elementId: 'judgement'
            },
            {
                key: 'Hit50',
                zhName: '灰50 判定贴图',
                enName: 'Hit50',
                comment: '50 判定效果',
                desc: '50 判定效果文字贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-hit50',
                elementId: 'judgement'
            },
            {
                key: 'Hit0',
                zhName: 'Miss 判定贴图',
                enName: 'Hit0',
                comment: 'Miss 判定效果',
                desc: '未击中音符时的 Miss 红色图标或文字贴图。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'mania-hit0',
                elementId: 'judgement'
            },
            {
                key: 'scorebar-colour',
                zhName: '血条colour贴图',
                enName: 'scorebar-colour',
                comment: '血条前景色/本体',
                desc: '生命值血条本体填充贴图 (scorebar-colour.png)。支持点击上传本地图片进行替换。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'scorebar-colour',
                elementId: 'healthDisplay'
            },
            {
                key: 'scorebar-bg',
                zhName: '血条背景贴图',
                enName: 'scorebar-bg',
                comment: '血条底座背景',
                desc: '生命值血条底座背景贴图 (scorebar-bg.png)。支持点击上传本地图片进行替换。',
                category: '贴图映射',
                tab: 'textures',
                type: 'texture',
                default: 'scorebar-bg',
                elementId: 'healthDisplay'
            },

            // [Fonts] 字体与数字
            {
                key: 'ScorePrefix',
                zhName: '数字贴图前缀',
                enName: 'ScorePrefix',
                comment: '贴图名前缀 (默认 score)',
                desc: '右上角数字 (0~9)、小数点与百分号对应的贴图文件名前缀 (如 score-0.png, score-dot.png, score-percent.png)',
                category: '字体排版',
                tab: 'fonts',
                type: 'text',
                default: 'score',
                elementId: 'hud_score_digit_0'
            },
            {
                key: 'ScoreOverlap',
                zhName: '数字间隙重叠像素',
                enName: 'ScoreOverlap',
                comment: '数字间隙重叠 (默认 0)',
                desc: '数字各个字符渲染时的水平重叠量。正值使字符紧凑，负值使字符分散。',
                category: '字体排版',
                tab: 'fonts',
                type: 'number',
                min: -30,
                max: 50,
                step: 1,
                default: 0,
                elementId: 'hud_score_digit_0'
            },
            {
                key: 'ComboPrefix',
                zhName: '连击数字前缀',
                enName: 'Combo',
                comment: '默认 combo (如 combo-0.png)',
                desc: '屏幕中心大连击数使用的贴图文件名前缀 (如 combo-0.png 或 score-0.png)。优先级: [Mania] FontCombo > [Fonts] Combo (本项) > 沿用 score 字体贴图。留空表示 ini 未指定连击字体，此时连击数字与分数共用同一套贴图。',
                category: '字体排版',
                tab: 'fonts',
                type: 'text',
                default: 'combo',
                elementId: 'combo'
            },
            {
                key: 'ComboOverlap',
                zhName: '连击数字重叠像素',
                enName: 'ComboOverlap',
                comment: '连击数字重叠量 (默认 0)',
                desc: '连击数字各个字符之间的横向重叠距离。',
                category: '字体排版',
                tab: 'fonts',
                type: 'number',
                min: -30,
                max: 50,
                step: 1,
                default: 0,
                elementId: 'combo'
            },
            {
                key: 'HitCirclePrefix',
                zhName: '音符打击圈数字前缀',
                enName: 'HitCirclePrefix',
                comment: '默认 default',
                desc: '打击圈或部分皮肤中数字贴图的文件名前缀。',
                category: '字体排版',
                tab: 'fonts',
                type: 'text',
                default: 'default',
                elementId: 'track'
            },
            {
                key: 'HitCircleOverlap',
                zhName: '打击圈数字重叠像素',
                enName: 'HitCircleOverlap',
                comment: '默认 -2',
                desc: '打击圈数字之间的排版重叠距离。',
                category: '字体排版',
                tab: 'fonts',
                type: 'number',
                min: -30,
                max: 50,
                step: 1,
                default: -2,
                elementId: 'track'
            },

            // [General] 基础设置
            {
                key: 'Name',
                zhName: '皮肤显示名称',
                enName: 'Name',
                comment: '皮肤显示名称',
                desc: '在 osu! 皮肤选择列表中展示的名称。',
                category: '基础信息',
                tab: 'general',
                type: 'text',
                default: 'Custom Mania Skin'
            },
            {
                key: 'Author',
                zhName: '皮肤创作者',
                enName: 'Author',
                comment: '作者昵称',
                desc: '制作该皮肤的创作者署名。',
                category: '基础信息',
                tab: 'general',
                type: 'text',
                default: 'Unknown'
            },
            {
                key: 'Version',
                zhName: '皮肤规范版本',
                enName: 'Version',
                comment: '2.5 / 2.7 / latest',
                desc: '定义皮肤遵从的 osu! 规范版本。2.5 及以上支持高清 @2x 贴图及现代 Mania 排版。',
                category: '基础信息',
                tab: 'general',
                type: 'select',
                options: [
                    { value: 'latest', label: 'latest (推荐: 最新高清特性)' },
                    { value: '2.7', label: '2.7 (现代特性)' },
                    { value: '2.5', label: '2.5 (经典稳定)' },
                    { value: '2.0', label: '2.0 (旧版)' }
                ],
                default: 'latest'
            },
            {
                key: 'AnimationFramerate',
                zhName: '全局动画默认帧率',
                enName: 'AnimationFramerate',
                comment: 'FPS (默认 60)',
                desc: '未在特定区域单独指定帧率时的默认序列帧播放速度。',
                category: '基础信息',
                tab: 'general',
                type: 'number',
                min: 1,
                max: 120,
                step: 1,
                default: 60
            },
            {
                key: 'CursorRotate',
                zhName: '光标随移动平滑旋转',
                enName: 'CursorRotate',
                comment: '0: 固定, 1: 旋转',
                desc: '鼠标光标移动时是否根据运动方向平滑旋转。',
                category: '基础信息',
                tab: 'general',
                type: 'boolean',
                default: false
            },
            {
                key: 'CursorExpand',
                zhName: '点击时光标轻微放大',
                enName: 'CursorExpand',
                comment: '0: 保持大小, 1: 放大',
                desc: '按键点击时光标是否产生轻微放大缩放特效。',
                category: '基础信息',
                tab: 'general',
                type: 'boolean',
                default: true
            },
            {
                key: 'CursorCentre',
                zhName: '光标热点位于贴图中心',
                enName: 'CursorCentre',
                comment: '0: 左上角, 1: 中心',
                desc: '决定皮肤光标贴图的哪个位置与真实鼠标坐标对齐。',
                category: '基础信息',
                tab: 'general',
                type: 'boolean',
                default: true
            }
        ];
