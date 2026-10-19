# osu!mania 中英文界面术语

参考 osu! 官方 wiki 的 [Skinning/osu!mania 英文版](https://github.com/ppy/osu-wiki/blob/master/wiki/Skinning/osu%21mania/en.md) 与 [中文版](https://github.com/ppy/osu-wiki/blob/master/wiki/Skinning/osu%21mania/zh.md)，并以 osu!stable 皮肤字段为准。字段名、文件名和 `skin.ini` 键名保持原样，不翻译。

| 中文 | 英文界面用语 | 说明 |
|---|---|---|
| 谱面 | Beatmap | 不把 beatmap 译成 map |
| 难度 | Difficulty | |
| 键数 | Key count | 4K、7K 等保持不变 |
| 轨道 | Lane | 玩家击打的一条纵向区域 |
| 列 / 列宽 | Column / Column width | `ColumnWidth` 字段不翻译 |
| 音符 | Note | |
| 单键 / 普通音符 | Note | 与长按音符相对时用 normal note |
| 长按音符 / 长条 | Long note (LN) | 也使用 hold note，界面优先 Long note |
| 投皮 / 一键投皮 | Percy-style LN | 固定术语，不译成 apply skin |
| 音符头 | Note head | |
| 音符体 / 长身 | Note body | |
| 音符尾 | Note tail | |
| 按键 | Key | |
| 按键按下状态 | Pressed key state | 文件名中的 `D` 保持不译 |
| 判定 | Judgement | 与 osu! wiki 统一使用英式拼写 |
| 判定线 | Judgement line | `HitPosition` 字段不翻译 |
| 打击结果提示 | Hit burst | `mania-hit*.png` 保持不译 |
| 打击特效 | Hit lighting | `LightingN` / `LightingL` 保持不译 |
| 连击提示图 | Comboburst | |
| 舞台 | Stage | |
| 舞台左右边框 | Stage left/right | |
| 舞台底栏 | Stage bottom | |
| 按键动画 / 按键光柱 | Stage light | `mania-stage-light` 保持不译 |
| 皮肤 | Skin | |
| 贴图 / 皮肤元素 | Texture / Skin element | 本编辑器界面统一用 Texture |
| 拉伸 | Stretch | |
| 平铺 | Repeat | 与 `NoteBodyStyle` 的 From tail / From head 对应 |
| 裁剪与扩边 | Crop and padding | |
| 透明度 | Opacity | RGBA 的 alpha 值仍称 alpha |
| 缩略图 | Thumbnail | |
| 高清贴图 | HD texture (`@2x`) | `@2x` 保持原样 |
| 标准尺寸 | Standard (`1x`) | `1x` 保持原样 |

## 翻译原则

- osu! 官方字段、文件名、参数键、游戏等级（300g、300、200、100、50、Miss）和格式扩展名保持原样。
- 同一概念只使用一个英文词：Lane 不混用 track，Texture 不混用 image，Judgement 不写成 judgment。
- 面向操作时使用动词开头的短句，例如 Import skin、Apply to all lanes、Save to skin。
- 英文界面不显示中文说明；`中文` 语言名称作为语言自称保留。
