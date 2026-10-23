# osu!mania Skin Editor

一款面向 osu!mania 皮肤作者与玩家的可视化编辑器。导入皮肤与谱面后，可以在接近 osu!stable 的画面中实时预览、调整 `skin.ini` 参数与贴图，并导出可直接导入游戏的 `.osk` 皮肤包。

[在线使用](https://osu-mania-skin-editor.pages.dev/) · [下载 Windows 便携版](https://github.com/BJZM/osu-mania-skin-editor/releases) · [反馈问题](https://github.com/BJZM/osu-mania-skin-editor/issues)

![version](https://img.shields.io/badge/version-0.3.7-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/platform-Web%20%7C%20Windows-lightgrey)

## 声明

本项目完全通过 vibe coding 制作：代码、文档与资源均由 AI 辅助生成并持续迭代，甚至连上传GitHub也是通过agent完成的，作者本人完全业余。

## 项目简介

osu!mania Skin Editor 把传统「改贴图、进游戏、反复确认」的皮肤调整流程搬到可视化画布中。导入皮肤与谱面后，`skin.ini` 参数、贴图替换与轨道布局的改动会立即反映在预览画面里，方便在导出前反复比对与微调。

它适合这些使用场景：

- 在现成皮肤上调整轨道、音符、长条、判定文字与 HUD 的表现。
- 制作个人 mania 皮肤时，快速验证贴图规格、命名与显示效果。
- 对照 osu!stable 的贴图拉伸与尺寸规则排查皮肤问题。

项目以 osu!stable 的 mania 皮肤解析与渲染行为为兼容目标，支持 storyboard、背景图片与视频。所有解析、编辑与打包默认在本地完成，皮肤、谱面与贴图不会被上传到服务器。

## 主要功能

### 实时预览与播放

- 导入 `.osz` / `.zip` / `.osu` 谱面，切换难度后在画布中播放。
- 导入 `.osk` / `.zip` 皮肤，在保留原有皮肤结构的基础上进行修改。
- 渲染 osu!stable 风格的轨道、音符、长条、按键光效、判定文字、连击、分数与血条。
- 支持 storyboard、背景图片与视频；桌面版可完全离线运行，浏览器不支持的视频会自动转码播放。
- 提供播放/暂停、进度跳转、音量、流速、背景暗化与全屏预览。

### 可视化编辑 `skin.ini`

- 按 `[Mania]` 配置读取参数，滑块、输入框与分键位设置改动后即时反映到画布。
- 可在画布上直接拖动判定文字、连击数字等元素的位置。
- 内置判定演示，可查看 300MAX / 300 / 200 / 100 / 50 与 Miss 断连恢复等表现。
- 内置撤回、重做与恢复初始状态，方便对比调整前后的效果。

### 画布拖拽与轨道布局

- 直接在画布上调整轨道宽度、轨道间距与元素位置。
- 可逐轨设置底色与透明度，也可一键应用到全部轨道。
- 支持逐轨调整 `KeyImage` 高度，用于修正按键底图与长条的衔接位置。

### 贴图替换与编辑

- 支持普通 1x、`@2x` 高清贴图与多帧动画序列的导入。
- 导入时提示导出文件名与规格，减少命名不符合 osu! 规则的情况。
- 内置贴图裁剪、透明扩展画布与拉伸修复功能。
- 一键投皮：根据长条尾部与指定高度生成完整长条身体贴图，可按轨道单独应用或应用到全部轨道。

### 导出皮肤

- 导出为 `.osk` 可直接导入 osu!，也可导出 `.zip` 便于查看和备份。
- 未改动的贴图与参数保持原样，仅写入编辑器中被修改的内容。
- 导出前可随时在原始皮肤与修改结果之间切换预览。

### 内置贴图规则指南

- 帮助弹窗按音符、长条、舞台、爆光、HUD、`@2x` 等类别整理贴图拉伸与尺寸规则。
- 支持按贴图名或关键词搜索，快速确认某张贴图在 osu!stable 中的实际表现。
- 规则内容按 osu!stable 的 480p 布局与 768p 贴图基准整理。

## 使用方式

| 项目 | 说明 |
| --- | --- |
| 皮肤格式 | `.osk` / `.zip` |
| 谱面格式 | `.osz` / `.zip` / `.osu` |
| 运行方式 | 浏览器在线使用、Windows 便携版、源码运行 |
| 兼容目标 | osu!stable 的 mania 皮肤解析与渲染行为 |
| 数据处理 | 默认全部在本地完成，不上传皮肤、谱面或贴图 |

### 在线使用

打开 <https://osu-mania-skin-editor.pages.dev/> 即可使用，无需安装。皮肤和谱面都在浏览器本地处理，不会上传到服务器。

### Windows 便携版

在 [Releases](https://github.com/BJZM/osu-mania-skin-editor/releases) 下载最新的 `osu-mania-skin-editor-*-x64.exe`，双击运行即可。便携版无需安装，可以完全离线使用。

### 从源码运行

需要 Node.js，适合自行构建或参与开发。

```powershell
npm install
npm run serve
```

然后访问 `http://127.0.0.1:8765/`。

也可以直接以桌面窗口启动：

```powershell
npm install
npm run desktop
```

打包 Windows 便携版：

```powershell
npm install
npm run dist:win
```

生成的文件位于 `dist/osu-mania-skin-editor-0.3.7-x64.exe`。

## 反馈与帮助

当前版本为 `v0.3.7`，后续仍会持续迭代。遇到问题或希望补充新的编辑功能，可以通过 [GitHub Issues](https://github.com/BJZM/osu-mania-skin-editor/issues) 反馈。

界面内的「帮助」按钮提供贴图规则速查，「关于」按钮会展示版本、许可与第三方声明。

## 版权与许可

- 本项目自身编写的源码以 [MIT License](LICENSE) 授权，版权归 `BJZM` 所有。
- 第三方组件、参考源码与游戏素材的归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- `docs/lazer-reference/` 摘录自 [ppy/osu](https://github.com/ppy/osu)，按 MIT 许可使用并保留原始版权头。
- 谱面解析默认使用项目自带的 `parseOsuBeatmap`；storyboard / Video 的 stable 事件解码行为对照了 [kionell/osu-parsers](https://github.com/kionell/osu-parsers)（MIT），代码同时保留可选 `BeatmapDecoder` 入口，但未捆绑该库源码。
- `vendor/` 内的 JSZip 与 UTIF.js 分别按 MIT 许可使用。
- 界面内联 SVG 图标来自 [Feather Icons](https://github.com/feathericons/feather)（MIT）。
- 视频回落转码使用随包附带的 [BtbN FFmpeg Builds](https://github.com/BtbN/FFmpeg-Builds) `n8.1.3-16-ge0a878dd70` Windows x64 LGPL shared 构建，转码输出为 VP8/WebM。组件按 **LGPL-3.0-or-later** 使用，动态库与独立进程均可替换；详见 `vendor/ffmpeg-lgpl-win64/NOTICE.md`。
- `assets/default_skin/` 来自 osu! 官方默认皮肤，版权归 ppy Pty Ltd，**不适用本项目 MIT 许可**，仅限非商业使用；详见 `assets/default_skin/NOTICE.md`。
- osu!、osu!mania 是 ppy Pty Ltd 的商标。本项目为非官方第三方工具，与 ppy Pty Ltd 无隶属或背书关系。
