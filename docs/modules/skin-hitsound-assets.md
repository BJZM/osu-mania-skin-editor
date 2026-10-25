# skin-hitsound-assets

**一句话职责：** 从皮肤归档中只读识别 osu!stable 可用的打击音效，并给出每种音效最终优先采用的扩展名文件。

## 接口

- `readSkinHitsoundAssets(zip, options)`：读取 ZIP 条目名，返回按 sampleset、音效类型和 custom index 分组的结果；`options.source` 标记为 `skin` 或 `default`。
- `getSkinHitsoundAsset(sampleSet, sound, customIndex)`：返回指定音效组，找不到指定组时回退到不带 sampleset 前缀的通用音效。
- `getSkinHitsoundSummary()`：返回已读取的组数、文件数和每组选中的文件数。
- `mergeSkinHitsoundCatalogs(...catalogs)`：按参数顺序合并目录，后传入的皮肤覆盖同名默认回退。
- `summarizeSkinHitsoundCatalog(groups)`：根据目录计算组数、变体数和选中文件数。
- **调用边界**：本模块只读取原始 ZIP；详细设置中的可撤回替换由 `hitsound-editor` 维护覆盖层，并以其重建后的目录供播放与导出使用。
- 不读取、解码或播放音频二进制；归档中的原始音频条目保持不变。

## 输入

- `zip`：`JSZip` 实例，可包含图片、音频、`skin.ini` 和其他资源。
- **前置条件**：ZIP 已完成不兼容条目清理；当前解析只考虑皮肤根目录的音频。

## 输出

- 分组 Map，键为 `normal-hitnormal`、`soft-hitclap2` 或通用 `hitnormal` 等逻辑名称。
- 每组包含 sampleset、音效类型、custom index、全部扩展名变体以及最终选中的路径。
- 每组带有 `source: skin | default`，供目录 UI 和播放器选择正确的数据源。
- **后置条件**：同一逻辑音效按 `WAV > MP3 > OGG` 选择；custom index `1` 不视为独立槽位。

## 依赖模块

- `JSZip`：只使用条目元数据，不消费音频内容。
- `texture-project-archive`：通过可选函数 `isTextureProjectInternalPath` 排除编辑器私有资源。

## 副作用 / 外部资源

- 无。不会修改 ZIP、全局音频状态、文件系统、网络或播放器。

## 非功能

- 只遍历 ZIP 文件名，时间与音频文件大小无关。
- 不加载 `.wav`、`.mp3`、`.ogg` 内容，避免大音频增加导入内存。
- 子目录音频和未识别的音效仍由原始 ZIP 保留并参与导出。

## 深度评估

- 调用方只关心音效组和优先文件，不需要知道文件名正则、扩展名优先级或 custom index 规则。
- 删除该模块会把识别规则散到皮肤导入、信息面板和未来音效入口，因此保留。
- 原子模块接口窄，且不持有状态；全局状态由导入编排方写入。

## 复用状态

- implemented
