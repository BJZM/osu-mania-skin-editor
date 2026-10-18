# texture-library-view

**一句话职责：** 渲染全部贴图网格并处理贴图选择，保持与“引用”界面一致的排列与卡片样式。

## 接口
- `createTextureLibraryCard(source, options)`：构建单张贴图卡片元素并处理点击、键盘选择。
- `renderTextureLibraryGrid(options)`：渲染全部贴图卡片网格、空状态与数量计数。
- `options` 包含网格 DOM、候选、过滤结果、已选路径 `selectedPath` 与点击选中回调 `onSelect`。
- “全部贴图”不提供单卡编辑入口；编辑方式选择由“菜单”中引用该贴图的参数项承担。

## 输入
- `collectExistingTextureSources()` 产生的候选数组、创建参数字典与用户搜索词。
- **前置条件**：贴图编辑器弹窗 DOM 已加载。

## 输出
- 带 `data-texture-path` 的贴图库卡片网格。
- **后置条件**：只更新 DOM，不直接修改皮肤状态。

## 依赖模块
- `texture-existing-picker-view`：共享候选内容、缩略图与角标实现。
- `texture-existing-sources`：候选数据结构。
- `texture-library-operations`：`hasCreatedTextureParams` 判断。

## 副作用 / 外部资源
- DOM 写入与 Canvas 缩略图绘制。

## 非功能
- 遵循全局暗色规范：无白色/半透明白色描边，圆角与悬浮反馈平滑。
- 普通贴图不额外渲染空操作区，防止卡片信息挤压。

## 深度评估
- 隔离控制器与具体卡片 DOM 组装逻辑，使贴图选择与网格排列保持解耦。

## 复用状态
- implemented
