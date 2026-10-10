# 第三方运行库

本目录存放浏览器端运行时直接加载的第三方库本地副本，便于离线使用。

## 文件

| 文件 | 组件 | 版本 | 许可 | 上游 |
| --- | --- | --- | --- | --- |
| `jszip.min.js` | JSZip | 3.10.1 | MIT（自 MIT / GPLv3 双许可中选择 MIT） | https://github.com/Stuk/jszip |
| `utif.min.js` | UTIF.js | 3.1.0 | MIT | https://github.com/photopea/UTIF.js |
| `ffmpeg-lgpl-win64/**` | FFmpeg LGPL shared（Windows x64） | n8.1.3-16-ge0a878dd70 | LGPL-3.0-or-later | https://github.com/BtbN/FFmpeg-Builds |

`jszip.min.js` 文件头保留了上游版权与双许可说明。`utif.min.js` 为 jsDelivr
的压缩构建，原文件未带版权头，本仓库在文件开头补充了 MIT 许可横幅；
版权归 Photopea 所有，完整许可文本见根目录 `THIRD_PARTY_NOTICES.md`。

升级压缩文件时请重新补回版权横幅，避免许可证声明随压缩丢失。

`ffmpeg-lgpl-win64/` 子目录包含作为独立进程和动态库使用的 FFmpeg
LGPL 构建，另有独立的 [`NOTICE.md`](ffmpeg-lgpl-win64/NOTICE.md)、
`LICENSE.txt`、`LICENSE.LGPL-3.0.txt` 与 `LICENSE.GPL-3.0.txt`。
该目录不进入 `app.asar`，构建时会复制到 Electron 的 `resources/` 目录，
以便用户替换兼容的 FFmpeg 动态库。

## 加载方式

页面按以下顺序加载：

1. `vendor/jszip.min.js`，缺失时回退到
   `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`；
2. `vendor/utif.min.js`，缺失时回退到
   `https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js`。

修改或升级本目录中的文件时，请同步更新版本号、许可信息和根目录的
`THIRD_PARTY_NOTICES.md`。
