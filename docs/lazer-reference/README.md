# osu!lazer 参考源码摘录

本目录中的 `*.cs` 文件摘录自 [ppy/osu](https://github.com/ppy/osu)
（osu!lazer），以 MIT 许可发布，版权归 ppy Pty Ltd 所有。每个文件均保留了
上游的版权与许可声明：

```
// Copyright (c) ppy Pty Ltd <contact@ppy.sh>. Licensed under the MIT Licence.
```

## 用途与边界

- 这些文件仅用于对照、还原和验证 **osu!stable** 的皮肤解析与渲染行为。
- 按项目约束，只参考 lazer 中用于还原或兼容 stable 行为的实现；lazer 独有
  或尚未反映 stable 行为的逻辑不作为本项目目标。
- 本目录内容不参与构建，也不会被打包进桌面包。
- 部分文件注释中包含指向 `peppy/osu-stable-reference` 的链接，仅为上游注释
  原文，本项目未复制该仓库内容。

完整许可文本见根目录 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)
第 3 节。
