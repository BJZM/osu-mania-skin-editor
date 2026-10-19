---
name: osu-mania-terminology
description: "Standardize osu!mania Chinese-English terminology when translating skin editor UI, help text, skin.ini parameter descriptions, tutorials, or release notes. Use when wording must match osu!stable skinning conventions and mixed translations such as track/lane, image/texture, or judgment/judgement must be avoided."
---

# osu!mania Terminology

Use this reference when translating or writing osu!mania skinning content in Chinese or English. It follows the osu! wiki `Skinning/osu!mania` pages and osu!stable `skin.ini` naming.

Sources:

- English: <https://github.com/ppy/osu-wiki/blob/master/wiki/Skinning/osu%21mania/en.md>
- Chinese: <https://github.com/ppy/osu-wiki/blob/master/wiki/Skinning/osu%21mania/zh.md>
- `skin.ini`: <https://github.com/ppy/osu-wiki/blob/master/wiki/Skinning/skin.ini/en.md>

## Preferred pairs

| 中文 | English | Use |
|---|---|---|
| 谱面 | beatmap | Do not shorten to map in UI |
| 难度 | difficulty | Beatmap difficulty |
| 键数 | key count | Keep `4K`, `7K`, `10K` unchanged |
| 轨道 | lane | One playable vertical lane |
| 列 / 列宽 | column / column width | Use column for geometry and `ColumnWidth` |
| 轨道区 / 舞台 | stage | The complete mania playfield |
| 音符 | note | General note |
| 单键音符 / 普通音符 | normal note | In contrast with long notes |
| 长按音符 / 长条 | long note (LN) | `hold note` is acceptable in code discussions; prefer long note in UI |
| 投皮 / 一键投皮 | Percy-style LN | Fixed product term; do not translate as apply skin |
| 音符头 | note head | |
| 音符体 / 长身 | note body | |
| 音符尾 | note tail | |
| 按键 | key | The receptor at the bottom of a lane |
| 按键按下状态 | pressed key state | Keep filename `D` suffix unchanged |
| 判定 | judgement | Use British spelling, matching the osu! wiki |
| 判定线 | judgement line | Keep `HitPosition` unchanged |
| 打击结果提示 | hit burst | Keep `mania-hit*.png` unchanged |
| 打击特效 | hit lighting | Keep `LightingN` / `LightingL` unchanged |
| 连击提示图 | comboburst | Keep `comboburst-mania` unchanged |
| 舞台左右边框 | stage left/right | Keep `mania-stage-left/right` unchanged |
| 舞台底栏 | stage bottom | Keep `mania-stage-bottom` unchanged |
| 按键动画 / 按键光柱 | stage light | Keep `mania-stage-light` / `StageLight` unchanged |
| 皮肤 | skin | |
| 贴图 / 皮肤元素 | texture / skin element | Prefer texture in this editor's UI |
| 裁剪与扩边 | crop and padding | |
| 拉伸 | stretch | |
| 平铺 | repeat | Match `NoteBodyStyle` |
| 透明度 | opacity | Keep RGBA alpha called alpha in technical prose |
| 缩略图 | thumbnail | |
| 高清贴图 | HD texture / `@2x` texture | Keep `@2x` unchanged |
| 标准尺寸 | standard / `1x` texture | Keep `1x` unchanged |

## Fixed terminology

- Preserve osu! field names exactly: `ColumnStart`, `ColumnWidth`, `ColumnSpacing`, `ColumnLineWidth`, `BarLineHeight`, `HitPosition`, `ScorePosition`, `ComboPosition`, `LightPosition`, `NoteBodyStyle`, `WidthForNoteHeightScale`.
- Preserve file names and path fragments exactly: `mania-note1`, `mania-note1H`, `mania-note1L`, `mania-note1T`, `mania-key1`, `mania-key1D`, `mania-stage-*`, `lightingN`, `lightingL`, `scorebar-*`.
- Preserve judgement labels: `300g`, `300`, `200`, `100`, `50`, `Miss`.
- Match `NoteBodyStyle` wording: `Stretch`, `RepeatFromTail`, `RepeatFromHead`, `RepeatTopAndBottom`.

## Translation rules

- Use `lane` consistently for 轨道; do not alternate with `track` in the same screen.
- Use `texture` consistently for 贴图; do not alternate with `image` in the same screen.
- Use `judgement` consistently; do not alternate with `judgment`.
- Prefer short command-style UI verbs: `Import skin`, `Apply to all lanes`, `Save to skin`, `Reset texture`.
- Keep Chinese metadata values such as song titles, artist names, skin names, and filenames unchanged when translating an interface.
- Do not translate the self-name of a language option: keep `中文` as `中文`, even in English UI.
