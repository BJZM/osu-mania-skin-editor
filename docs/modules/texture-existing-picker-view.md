# texture-existing-picker-view

**一句话职责：** 渲染已有贴图候选网格、缩略图、规格角标和空状态。

## 接口
- `getTextureExistingTargetLabel(p)` 返回目标贴图的友好名称。
- `renderTextureExistingGrid(options)` 根据候选、过滤结果和当前选择重建网格。
- `options` 包含 DOM 节点、全部/可见候选、选择和确认回调。

## 输入
- 已枚举的贴图候选与选中路径。
- **前置条件**：选择器模态框 DOM 已加载。

## 输出
- 可访问的候选卡片网格，卡片附带 `data-texture-path`。
- **后置条件**：只更新 DOM，不修改皮肤状态。

## 依赖模块
- `texture-existing-sources` 提供的候选数据结构。

## 副作用 / 外部资源
- DOM 写入与 Canvas 缩略图绘制。

## 非功能
- 每次过滤只重建可见卡片；预览只绘制首帧。

## 深度评估
- 把预览、角标、文本转义和卡片事件从选择器控制器中隔离出来。
- 删除后这些渲染细节会与状态编排混杂，因此保留。

## 复用状态
- implemented
