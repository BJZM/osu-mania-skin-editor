// ============================================================================
// parameter-schema-fonts.js - 字体排版参数元数据
// ============================================================================

        const SKIN_INI_PARAM_SCHEMA_FONTS = [
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
        ];
