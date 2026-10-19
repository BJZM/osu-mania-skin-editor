# texture-project-archive

**一句话职责：** 在 `.osk` / `.zip` 内保存和恢复可续编的贴图工程数据，同时保持最终 PNG 是 osu!stable 可直接读取的派生结果。

## 接口
- `writeTextureProjectToArchive(zip, options)`：将自建贴图参数、普通贴图编辑配方、投皮会话和必要的隐藏源图写入 `_skin-editor/`。
- `stripTextureProjectFromArchive(zip)`：移除归档内全部 `_skin-editor/` 条目，用于“仅发布”导出和覆盖旧工程数据。
- `readTextureProjectFromArchive(zip)`：读取并校验工程清单，解码隐藏源图，回填现有创建参数、编辑配方和投皮会话。
- `clearTextureProjectImportState()`：清除上一次导入标记；新皮肤或默认皮肤工作区开始时调用。
- `hasActiveTextureProjectImport()`：告诉贴图编辑器刷新流程是否应保留刚恢复的工程状态。
- 不暴露 frame、canvas、ZIP 条目组织或哈希去重细节；调用方只需选择写入、移除或读取。

## 输入
- `zip`：`JSZip` 实例。
- `options`：`includeSources` 控制是否写入工程数据；“仅发布”模式会先移除全部工程条目。
- **前置条件**：当前皮肤状态已经完成参数解析；隐藏源图只来自编辑器实际保存的编辑前帧。

## 输出
- 写入后返回 `{ manifestPath, sourceCount, createdCount, recipeCount, longBodyCount }`。
- 读取后返回恢复数量；缺少清单、版本不支持或数据损坏时返回 `null`，不影响普通皮肤导入。
- **后置条件**：可编辑导出保留最终 PNG；发布导出不包含 `_skin-editor/`；导入恢复不会把隐藏源图注册到“全部贴图”列表。

## 依赖模块
- `skin-assets`：解析最终贴图帧并规范化资源路径。
- `global-skin-state`：读取和回填创建参数、编辑配方与投皮会话。
- `texture-image-editor-recipes`：提供普通贴图编辑配方的帧语义。
- `texture-image-editor-state`：提供投皮会话结构。
- `JSZip`：读写归档条目。

## 副作用 / 外部资源
- 修改传入的 ZIP 条目。
- 在导入时修改内存中的创建参数、编辑配方、投皮会话和导入标记。
- 使用浏览器 Canvas 编解码 PNG；不访问网络或本地磁盘。

## 非功能
- 源图按内容哈希去重，路径固定为 `_skin-editor/sources/<hash>.png`。
- 只保存当前编辑前源图，不保存历史版本；JSON 不嵌入 Base64 图片。
- 清单版本固定为 `1`，未知版本安全回退到普通皮肤导入。
- 隐藏源图在普通资源枚举和“全部贴图”中不可见。
- 工程写入不改变当前编辑状态，因此可连续导出可编辑版和发布版。

## 深度评估
- 接口只有写入、移除、读取三个主动作，调用方无需知道源图去重、帧标记和状态回填顺序。
- 删除该模块会把 ZIP 布局、版本校验、哈希去重和三个状态 Map 的恢复顺序散到导出、导入和 UI 多处，因此值得保留。
- 复合模块通过复合删测：写入与读取的编排约束会被导出、导入至少两个调用方使用。

## 复用状态
- implemented
