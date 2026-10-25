# hitsound-editor

**一句话职责：** 在详细设置中展示皮肤覆盖、默认回退与谱面音效，并为皮肤音效提供可试听、可替换、可撤回且不破坏导入 ZIP 的虚拟覆盖层。

## 接口
- `renderHitsoundEditor(container)`：渲染“皮肤音效”和“谱面音效”两个分类及音效卡片。
- `replaceSkinHitsound(groupKey, file)`：用 `.wav` / `.mp3` / `.ogg` 覆盖指定皮肤音效槽位，记录一次撤回快照。
- `resetSkinHitsoundReplacement(groupKey)`：撤销指定槽位的音效覆盖，同时保留撤回历史。
- `refreshSkinHitsoundCatalogWithReplacements()`：从原始皮肤 ZIP 重建目录并叠加当前覆盖层。
- `getEffectiveSkinHitsoundCatalog()`：把当前皮肤目录覆盖到默认回退目录上，返回音效标签页实际展示的完整目录。
- `createSkinHitsoundExportArchive(zip)`：复制导出 ZIP、移除被替代槽位的原始扩展名变体并写入新音效。
- `cloneSkinHitsoundReplacements()` / `restoreSkinHitsoundReplacements(replacements)`：供皮肤快照保存与恢复使用。
- **不变量**：覆盖层只替换稳定的标准打击音效槽位；谱面音效永不写入皮肤；同一槽位导出后只保留一个音效文件。

## 输入
- 当前 `skinHitsoundCatalog`、默认音效目录、`skinHitsoundReplacements`、`currentSkinZip`。
- 当前谱面 `activeNotes`、`hitsoundSampleRefs`、`currentOszZip` 与 note/timing hitSample。
- 用户选择的音频文件；**前置条件**：已导入皮肤和谱面，文件扩展名为 `wav`、`mp3` 或 `ogg`，且不超过 32 MB。

## 输出
- 音效页签的 DOM 卡片、试听状态和结构化分类计数。
- 更新后的 `skinHitsoundCatalog` / `skinHitsoundSummary`。
- 含覆盖音效的导出 ZIP 副本；**后置条件**：内存中的原始 `currentSkinZip` 不被导出过程改写。

## 依赖模块
- `skin-hitsound-assets`：识别原始皮肤音效槽位、sampleset、custom index 与扩展名优先级。
- `default-skin-hitsounds`：提供 12 个 Legacy 标准音效，供默认工作区展示及缺失槽位回退。
- `hitsound-playback`：解析 note/timing 引用、播放预览所需的实际文件来源，并在替换后重建缓冲区。
- `history`：保存与恢复音效覆盖层快照。
- `export-skin`：在发布或可续编导出前合入音效覆盖层。
- `ui-localization`、`feedback`：界面词条、Toast 与试听错误提示。

## 副作用 / 外部资源
- 读取 ZIP 条目、内置默认音效、浏览器 `File` 和 `ArrayBuffer`。
- 创建对象 URL、`HTMLAudioElement` 进行试听，并在结束、切换或关闭面板时释放。
- 导出时复制 ZIP 条目到内存，仅在本次导出中使用。

## 非功能
- 单次替换为独立撤回步骤，不受 600ms 连续编辑合并影响。
- 试听失败静默停止并提示，不阻断谱面或音效编辑。
- 文件读取与试听为异步；覆盖层字节不可变，可被多个历史快照安全共享。
- 默认工作区没有 `currentSkinZip` 时仍可按槽位替换；导出只写入被替换文件，不复制整套默认音效。

## 深度评估
- 调用方只需传入槽位键与文件；目录重建、扩展名优先级、历史、播放缓存与导出清理都隐藏在模块内部。
- 删除该模块会把音效分类渲染、变体替换、ZIP 安全检查、历史恢复和试听生命周期散到参数面板、历史与导出三处，因此保留。
- 复合模块的自检：编排顺序固定为“记录快照 → 写入覆盖层 → 重建目录 → 刷新播放/UI”，导出顺序为“复制 ZIP → 替换槽位 → 后续工程写入”。

## 复用状态
- implemented
