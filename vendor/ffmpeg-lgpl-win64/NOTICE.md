# FFmpeg LGPL Shared Build

本目录存放 Windows x64 视频回落转码所需的 FFmpeg 运行时：

- 版本：`n8.1.3-16-ge0a878dd70`
- 构建：`ffmpeg-n8.1.3-16-ge0a878dd70-win64-lgpl-shared-8.1.zip`
- 来源：[BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)
- 固定发布页：
  https://github.com/BtbN/FFmpeg-Builds/releases/tag/autobuild-2026-10-09-14-16
- 压缩包 SHA-256：
  `f652a6506b6b9e600275ea3dfac3d1b1ae3835a966f7f20fe712a310c414e007`

该构建的 `configuration` 同时包含 `--enable-version3`、`--enable-libvpx`
和 WebM muxer，且没有 `--enable-gpl` 或 `--enable-nonfree`。因此二进制按
GNU Lesser General Public License v3.0 or later（LGPL-3.0-or-later）使用。
LGPLv3 条款援引 GPLv3；完整文本见本目录的 `LICENSE.LGPL-3.0.txt` 和
`LICENSE.GPL-3.0.txt`，FFmpeg 自身说明见 `LICENSE.txt`。

## 使用方式

应用不会把 FFmpeg 链接进 Electron 进程，而是通过独立进程调用
`bin/ffmpeg.exe`，并把不支持的视频转换为 VP8/WebM。构建便携版时，该目录
会复制到 Electron 的 `resources/ffmpeg-lgpl-win64/`，不包含在 `app.asar`
内。

为了便于替换库版本，应用支持 `OSU_SKIN_EDITOR_FFMPEG_DIR` 环境变量。
该变量指向包含 `ffmpeg.exe`、`ffprobe.exe` 和兼容 DLL 的目录时，程序会优先
使用该目录，而不使用随包副本。

## 文件校验值

| 文件 | SHA-256 |
| --- | --- |
| `bin/avcodec-62.dll` | `e382d899f08c836dd642de7750c1bf3e6175095ecdecb5ceebae3941faa8773f` |
| `bin/avdevice-62.dll` | `9207cbce61fc871af60b715ab06c9642f7b0d7c9c87edcedd9f90ed0f6a8cb83` |
| `bin/avfilter-11.dll` | `24522cba87641f61ba64d7c7d4d4f3f5afa58739c5e8671a64de6196a23bf660` |
| `bin/avformat-62.dll` | `5cebb6d78bd863f48faa4ade77e7bac535b44f921c46d7a15f64f8e932ed381b` |
| `bin/avutil-60.dll` | `b6c508c38d82c5b7866ccd35b9ada912ff33da92f7ec5d0d22c103aa9eea8bc9` |
| `bin/ffmpeg.exe` | `9ceaafb0b026463d1050001cf60945ddb020e27c32c9ce47492e4d0e4adf3e45` |
| `bin/ffprobe.exe` | `20954d7e0036b2d1ca49f2f507f4a884492cfb4513564ae30ba65e8653ced39a` |
| `bin/swresample-6.dll` | `131aa0b9c1be3b4e40fecf26f336e1a0cdda16aced1d93c326504e59b9f03fc8` |
| `bin/swscale-9.dll` | `b279b677869dd191345afbed87f8a318f4dddb97fe1869dc871ae5eeac781fae` |

FFmpeg 是 FFmpeg 项目的商标。本项目与 FFmpeg、BtbN 均无隶属或背书关系。
