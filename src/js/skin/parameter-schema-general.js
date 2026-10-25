// ============================================================================
// parameter-schema-general.js - 基础信息参数元数据
// ============================================================================

        const SKIN_INI_PARAM_SCHEMA_GENERAL = [
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
            },
            {
                key: 'ComboBurstRandom',
                zhName: '连击提示图随机选择',
                enName: 'ComboBurstRandom',
                comment: '0: 按编号顺序轮播, 1: 随机选择',
                desc: '仅对 comboburst-mania-0.png、comboburst-mania-1.png 等编号替代图生效。关闭时按编号顺序轮播；开启时每个 100 连击里程碑随机抽一张。',
                notice: '总开关在游戏内，需要在游戏内开启或关闭',
                category: '其他不常用选项',
                tab: 'mania',
                type: 'boolean',
                default: false
            }
        ];
