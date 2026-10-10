# 第三方运行库

本目录存放浏览器端运行时直接加载的第三方库本地副本，便于离线使用。

## 文件

| 文件 | 组件 | 版本 | 许可 | 上游 |
| --- | --- | --- | --- | --- |
| `jszip.min.js` | JSZip | 3.10.1 | MIT（自 MIT / GPLv3 双许可中选择 MIT） | https://github.com/Stuk/jszip |
| `utif.min.js` | UTIF.js | 3.1.0 | MIT | https://github.com/photopea/UTIF.js |
| `ffmpeg/**` | ffmpeg.wasm | 0.12.9 | 加载器 MIT；WASM 核心 GPL-2.0-or-later | https://github.com/ffmpegwasm/ffmpeg.wasm |

`jszip.min.js` 文件头保留了上游版权与双许可说明。`utif.min.js` 为 jsDelivr
的压缩构建，原文件未带版权头，本仓库在文件开头补充了 MIT 许可横幅；
版权归 Photopea 所有，完整许可文本见根目录 `THIRD_PARTY_NOTICES.md`。

升级压缩文件时请重新补回版权横幅，避免许可证声明随压缩丢失。

`ffmpeg/` 子目录包含强 copyleft 组件，另有独立的
[`ffmpeg/NOTICE.md`](ffmpeg/NOTICE.md) 与 `ffmpeg/LICENSE.GPL-2.0.txt`，
再分发前必须阅读。

## 加载方式

页面按以下顺序加载：

1. `vendor/jszip.min.js`，缺失时回退到
   `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`；
2. `vendor/utif.min.js`，缺失时回退到
   `https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js`。

修改或升级本目录中的文件时，请同步更新版本号、许可信息和根目录的
`THIRD_PARTY_NOTICES.md`。
