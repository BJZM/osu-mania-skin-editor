# default-skin-workspace

**一句话职责：** 在用户选择“从默认皮肤开始”后建立可编辑的官方默认皮肤工作区，并按当前谱面键数补齐 Mania 配置。

## 接口

- `isEditableDefaultSkinWorkspaceActive()`：当前是否处于未导入皮肤的可编辑默认工作区。
- `activateEditableDefaultSkinWorkspace(keyCount)`：激活默认工作区，并为指定键数建立完整 Mania 配置。
- `deactivateEditableDefaultSkinWorkspace()`：导入真实皮肤或离开默认工作区时关闭该状态。
- 激活操作是幂等的；重复激活只补配置，不重置用户已经修改的默认皮肤参数。

## 输入

- `keyCount`：当前谱面或编辑器使用的 Mania 键数。
- 全局默认皮肤资源库、默认 Mania 配置工厂与当前皮肤元数据。
- **前置条件**：`mania-config` 已加载；当前没有已导入的皮肤压缩包。

## 输出

- 返回当前键数对应的完整 Mania 配置；无有效默认工作区时返回 `null`。
- **后置条件**：该键数在 `maniaSkinConfigurations` 中存在完整配置；默认皮肤图片仍由回退资源库提供，不复制进用户替换仓库。

## 依赖模块

- `mania-config`：调用 `createDefaultManiaSkinConfiguration` 与 `ensureManiaConfigForKeys`。
- 全局皮肤状态：读写 `currentSkinZip`、`currentSkinMetadata`、`activeEditorKeyCount` 和 `maniaSkinConfigurations`。

## 副作用 / 外部资源

- 修改内存中的默认工作区状态、Mania 配置表和默认皮肤元数据。
- 不读写文件、网络、时钟或随机数。

## 非功能

- 时间复杂度只与当前键数线性相关。
- 幂等，不重复覆盖已编辑配置。
- 默认图片不复制，避免无修改导出时打包整套官方素材。

## 深度评估

- 调用方只需知道“当前键数”，工作区激活、元数据初始化和图片回退策略均隐藏在内。
- 删除该模块后，编辑器初始化、谱面键数切换和导入状态清理会各自维护默认工作区判断，复杂度会散到至少三处，因此保留。

## 复用状态

- implemented
