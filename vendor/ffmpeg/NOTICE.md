# FFmpeg.wasm 声明

本目录存放 [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) 0.12.9
的浏览器端构建，用于在客户端对播放器不支持的视频做回落转码。

## 文件与许可

| 文件 | 来源 | 许可 |
| --- | --- | --- |
| `ffmpeg.min.js`、`814.ffmpeg.js`、`046d0074eee1d99a674a.js` | `@ffmpeg/ffmpeg@0.12.9` | MIT |
| `ffmpeg-core.js`、`ffmpeg-core.wasm`、`ffmpeg-core.worker.js` | `@ffmpeg/core@0.12.9` | **GPL-2.0-or-later** |

`@ffmpeg/ffmpeg` 只是加载器，真正执行转码的是 `@ffmpeg/core` 的 WASM 构建，
该构建包含 GPL 授权的 FFmpeg 组件，因此整体按 GPL-2.0-or-later 使用。

## 再分发义务

因为包含 GPL-2.0-or-later 的二进制组件，对外分发（包括打包后的便携版
exe）时必须：

1. 随附 GPL 全文，见本目录 `LICENSE.GPL-2.0.txt`；
2. 提供对应的 FFmpeg 源码，或按 GPLv2 第 3 条给出有效的书面要约；
3. 保留版权与许可声明。

对应源码可从以下位置获取：

- ffmpeg.wasm 构建脚本与补丁：https://github.com/ffmpegwasm/ffmpeg.wasm
- FFmpeg 官方源码：https://ffmpeg.org/download.html

本项目自身的代码仍按根目录 `LICENSE`（MIT）授权，但任何包含本目录组件的
分发都需要同时满足上述 GPL 条款。若计划公开发布或商业使用，建议先确认是否
改用 LGPL 构建或其它转码方案。

FFmpeg 是 FFmpeg 项目的商标；本项目与 FFmpeg 项目无隶属关系。
