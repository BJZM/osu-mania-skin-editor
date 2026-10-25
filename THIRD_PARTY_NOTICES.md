# 第三方组件与许可声明

本项目（osu!mania Skin Editor）包含、依赖或参考了以下第三方项目。本文件说明
各部分的版权归属与许可条件。

除本文件和各目录内 `NOTICE` / `README` 另有说明外，本项目自身编写的源码
（`src/`、`electron/`、`tools/`、`tests/`、`assets/favicon.svg`、
`assets/app-icon.*` 及根目录配置文件）按仓库根目录的 [LICENSE](LICENSE)
（MIT）授权。

---

## 1. 随程序分发的第三方资源与运行库

| 组件 | 版本 | 许可 | 用途 | 上游 |
| --- | --- | --- | --- | --- |
| JSZip | 3.10.1 | MIT（自 MIT / GPLv3 双许可中选择 MIT） | `.osz` / `.osk` 压缩包读写 | https://github.com/Stuk/jszip |
| UTIF.js | 3.1.0 | MIT | TIFF 及伪装 PNG 图像解码 | https://github.com/photopea/UTIF.js |
| Feather Icons | 4.x | MIT | 顶栏、弹窗与播放器按钮的内联 SVG 图标 | https://github.com/feathericons/feather |
| FFmpeg LGPL shared（Windows x64） | n8.1.3-16-ge0a878dd70 | **LGPL-3.0-or-later** | 本机视频回落转码，输出 VP8/WebM | https://github.com/BtbN/FFmpeg-Builds |

两个库以本地副本形式存放于 `vendor/`，详见 `vendor/README.md`。页面在
`vendor/` 副本缺失时会回退到 cdnjs / jsDelivr 上的同版本文件。

界面图标以内联 SVG 的形式写入 `src/html/` 与 `src/css/`，未引入额外依赖包。
其中 `settings`、`help-circle`、`download`、`star` 等图形的路径数据与
Feather Icons 一致，属于该图标集的衍生使用。

### FFmpeg LGPL shared（再分发前必读）

`vendor/ffmpeg-lgpl-win64/` 使用 BtbN 的 Windows x64 LGPL shared 构建
`n8.1.3-16-ge0a878dd70`。该构建未启用 `--enable-gpl` 或
`--enable-nonfree`，启用了 `--enable-version3`、`--enable-libvpx` 和
WebM muxer，整体按 **LGPL-3.0-or-later** 使用。

程序通过独立 `ffmpeg.exe` 进程与可替换 DLL 调用该组件，不把 FFmpeg
代码静态链接进本项目；用户也可用 `OSU_SKIN_EDITOR_FFMPEG_DIR` 指向自己的
兼容构建。再分发时必须：

1. 随附 LGPLv3、GPLv3 与 FFmpeg 自身的许可说明；
2. 保留版权、构建来源和对应源码链接；
3. 不限制用户替换兼容版本的 FFmpeg 动态库。

对应源码与构建参数：

- BtbN 构建配方：https://github.com/BtbN/FFmpeg-Builds
- 固定构建版本：https://github.com/BtbN/FFmpeg-Builds/releases/tag/autobuild-2026-10-09-14-16
- FFmpeg 源码：https://github.com/FFmpeg/FFmpeg
- libvpx 源码：https://chromium.googlesource.com/webm/libvpx/

完整说明与文件校验值见 `vendor/ffmpeg-lgpl-win64/NOTICE.md`。

### JSZip

```
The MIT License

Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

（JSZip 同时提供 GPLv3 选项；本项目选择并遵守 MIT 分支。）

### UTIF.js

```
MIT License

Copyright (c) 2017 Photopea

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Feather Icons

```
The MIT License (MIT)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. 构建与测试依赖（devDependencies）

这些依赖仅用于开发、构建与测试，不进入浏览器端源码；打包后的 Windows
便携版内含 Electron 运行时，按 Electron 自身许可分发。

| 组件 | 版本 | 许可 | 上游 |
| --- | --- | --- | --- |
| Electron | 44.7.0 | MIT | https://github.com/electron/electron |
| @electron/asar | 3.4.1 | MIT | https://github.com/electron/asar |
| @electron/get | 5.1.0 | MIT | https://github.com/electron/get |
| electron-builder | 26.15.3 | MIT | https://github.com/electron-userland/electron-builder |
| extract-zip | 2.0.1 | BSD-2-Clause | https://github.com/maxogden/extract-zip |
| @playwright/test | 1.64.0 | Apache-2.0 | https://github.com/microsoft/playwright |

各依赖的完整许可文本随 `node_modules/<包名>/LICENSE*` 一同由 npm 安装，
构建产物中若包含其代码，则相应许可同样适用。

## 3. 参考的源码项目

### osu!lazer（ppy/osu）— MIT

`docs/lazer-reference/` 下为 osu!lazer 的源码摘录，仅用于对照和还原
osu!stable 行为。每个文件均保留上游版权头：

```
// Copyright (c) ppy Pty Ltd <contact@ppy.sh>. Licensed under the MIT Licence.
```

完整许可文本：

```
MIT License

Copyright (c) ppy Pty Ltd <contact@ppy.sh>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### peppy/osu-stable-reference

仅在上述 osu!lazer 源码注释中作为参考链接出现，本项目未复制该仓库任何内容。
该仓库未提供公开许可证，因此不作为本项目代码来源。

### kionell/osu-parsers — MIT（可选兼容，未随包分发）

`src/js/parser/beatmap-format.js` 保留了可选的 `window.BeatmapDecoder` 兼容入口。
若页面外部注入了实现 `new BeatmapDecoder().decodeFromString(text)` 的解码器，
程序会在内置解析器无法处理时回退到它。新增的 `.osu` / `.osb` storyboard、
Video 事件、循环命令和旧版动画帧延时语义也对照了该项目的 stable 解码行为：

- 上游：https://github.com/kionell/osu-parsers
- 许可：MIT，Copyright (c) 2023 Kionell
- 说明：该项目基于 osu!lazer 源码实现谱面编解码。

**本仓库不包含、也不加载该库的任何源码文件**，默认路径始终使用项目自带的
解析与渲染实现。此处仅作兼容性说明与署名。

```
The MIT License (MIT)

Copyright (c) 2023 Kionell

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### ppy/osu-web — AGPL-3.0

`.agents/skills/osu-web-ui-design/SKILL.md` 是对 osu! 网站视觉设计语言的独立
归纳与重写（自定义类名和中文注释），未复制 osu-web 的源代码或样式表。若后续
引入 osu-web 的实际代码，则该部分需遵守 AGPL-3.0 并保持网络分发时的源码
开放义务。

## 4. 游戏素材（不适用本项目 MIT 许可）

`assets/default_skin/` 下的贴图与打击音效来自 osu! 官方默认皮肤，是 ppy Pty Ltd 的
版权素材，**不在本项目 MIT 许可范围内**。具体来说：

- 与 `ppy/osu-resources` 仓库 `osu.Game.Resources/Skins/Legacy/` 对应的
  贴图（175 个贴图清单中的 84 个），该仓库以
  [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 提供；
- 其余 1x 分辨率和 mania 专用贴图来自 osu!stable 内置默认皮肤，未在任何
  公开仓库中提供明确的再分发许可。
- `normal-*`、`soft-*`、`drum-*` 三套标准打击音效共 12 个 WAV 文件来自
  `osu.Game.Resources/Skins/Legacy/`，按 CC BY-NC 4.0 提供。

无论适用上述哪一项，均须遵守以下条件：

- 署名：ppy Pty Ltd 及 osu! 贡献者；
- 来源：https://github.com/ppy/osu-resources 与 osu!stable 内置默认皮肤；
- 用途限制：**仅限非商业用途**。商业使用或再分发前必须取得 ppy Pty Ltd
  的授权；
- 本仓库仅复制使用，未修改像素或音频内容。

如果本仓库转为公开或随便携版 exe 对外分发，请先确认这部分素材的授权状态。
详见 `assets/default_skin/NOTICE.md`。

## 5. 商标与免责声明

osu!、osu!mania 及相关标识是 ppy Pty Ltd 的商标或注册商标。本项目是非官方
第三方工具，与 ppy Pty Ltd 不存在隶属、赞助或背书关系，也不代表 osu! 官方
立场。项目管理方不对使用本工具产生的任何后果负责。
