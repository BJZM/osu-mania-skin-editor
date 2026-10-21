# skin-agent-session

**一句话职责：** 把编辑器现有贴图、参数、历史、预览和导出能力包装成 Agent 可调用的语义事务。

## 接口

- `skinAgentSession.openSkin({ source, keyCount, confirmReset })`：读取当前工作区或建立默认皮肤工作区。
- `skinAgentSession.getDescription()`：返回 revision、键数、贴图槽位、实际贴图状态和可修改参数。
- `skinAgentSession.applyOperations(operations, label, expectedRevision)`：原子应用贴图与参数操作。
- `skinAgentSession.capturePreview({ state })`：返回当前 Canvas 的 PNG Base64。
- `skinAgentSession.validate()`：返回缺失贴图、未配置槽位和大尺寸警告。
- `skinAgentSession.exportPackage({ format, mode })`：返回完整 `.osk` / `.zip` 归档数据。
- `skinAgentSession.getRevision()`、`notifyExternalMutation(desc)`、`isApplying()`：维护并发版本与历史事务。
- 写操作遇到过期 revision 必须返回 `STALE_REVISION`；批次任一操作失败时必须整体回滚。

## 输入

- 当前编辑器已经加载皮肤或默认皮肤工作区。
- 贴图操作包含合法参数键、轨道索引、图片 Base64、`1x` / `2x` 规格。
- 参数操作使用现有 `SKIN_INI_PARAM_SCHEMA` 中的键和值类型。
- **前置条件**：历史、贴图上传、导出和 Skin 参数模块已经初始化。

## 输出

- 成功时返回新的 revision 和实际应用的操作摘要。
- 图片预览返回 `image/png` Base64、宽高和当前 revision。
- 导出返回文件名、字节数、工程摘要和归档 Base64。
- **后置条件**：一次 `applyOperations` 只产生一条撤回记录；失败批次不改变贴图和参数。

## 依赖模块

- `global-skin-state`
- `history`
- `texture-upload`
- `texture-resolve`
- `export-skin`
- `skin-assets`

## 副作用 / 外部资源

- 修改贴图仓库、`userReplacedTextures`、Mania 配置和 `skin.ini` 元数据。
- 创建对象 URL、Canvas PNG 和 JSZip 归档。
- 通过预览接口读取当前游戏 Canvas。

## 非功能

- 单批最多 64 个操作。
- 单张贴图 Base64 上限 24 MB。
- 同一时间只应存在一个 Agent 写事务。
- Agent 批次内部改动不得拆成多条全局撤回记录。

## 深度评估

- 调用方只提交语义操作，不需要知道 DOM、参数联动、贴图命名隔离或历史快照。
- 删除该模块会把 revision、事务回滚、贴图编码和预览导出约束散回 Agent Bridge 与 MCP。
- 自检结论：保留为 Renderer 侧的复合模块。

## 复用状态

- implemented
