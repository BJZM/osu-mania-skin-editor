# song-select-catalog

**一句话职责：** 把已导入 mania 谱面或示例曲库整理成 stable 选歌的分组、排序、搜索和信息行。

## 接口
- `SongSelectCatalog.createSession()` 创建分组、排序、搜索和展开状态。
- `SongSelectCatalog.rebuild(session, beatmaps, currentBeatmap)` 用谱面重建曲库；没有谱面时使用示例曲。
- `SongSelectCatalog.project(session)` 按当前分组、折叠和搜索生成可见行。
- `SongSelectCatalog.selectKey(session, key)` 选中难度并展开所属谱面集。
- `SongSelectCatalog.infoFor(session)` 返回左上信息行和 BPM。
- **不变量**：分组标签与统计句式使用本机 `SongSelection_*` 文案。未玩为粉、玩过为橙由 `played` 标记，不编造成绩。

## 输入
- `beatmaps[]`（含 metadata、difficulty、stats、timingPoints）和当前 `currentBeatmap`。
- **前置条件**：session 由 `createSession` 创建。

## 输出
- `session.rows` 与信息行文本。

## 依赖模块
- 无。语言读取 `I18n.getLanguage()`。

## 副作用 / 外部资源
- 无。

## 非功能
- 搜索为大小写不敏感的分词包含匹配，查询最长由调用方限制。

## 深度评估
- 删掉它，分组和文案会散落到绘制与按键处理。示例曲只在没有导入谱面时出现。

## 复用状态
- implemented
