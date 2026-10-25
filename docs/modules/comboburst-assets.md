# comboburst-assets

**一句话职责：** 从当前工作区解析 `comboburst-mania` 静态主图或从 0 开始连续编号的替代图组。

## 接口
- `getComboburstAssetState()` 返回 `{ mode, images, count, source }`。
- `getComboburstStaticImage(store, baseName)` 只读取精确路径的静态图片，不把编号图当成动画帧。
- `getComboburstVariantPath(index, is2x)` 生成稳定的导出文件名。
- **不变量**：连续编号组优先于主图；编号必须从 0 开始且无断档；导入皮肤缺失图片时不读取默认皮肤资源。

## 输入
- 当前 `skinImageStore`、默认工作区状态和 `deletedSkinTexturePaths`。
- **前置条件**：皮肤工作区已经建立。

## 输出
- `mode` 为 `numbered`、`single` 或 `none`。
- `images` 按文件名顺序返回静态图片与逻辑路径。
- **后置条件**：返回结果只属于当前工作区；“从默认皮肤开始”时默认资源被视为该工作区的显式基线。

## 依赖模块
- `skin-assets`：图片仓库键格式与 `@2x` 标记。
- `default-skin-workspace`：仅在可编辑默认工作区中允许把内置默认素材作为基线。

## 副作用 / 外部资源
- 只读内存图片仓库和删除标记。

## 非功能
- 同步、无额外 I/O；结果稳定，不修改轮播序号。

## 深度评估
- 调用方只需一个状态对象，即可处理主图、编号组、默认工作区与删除状态。
- 删除该模块会把“编号不是动画”“编号组优先”和“无默认回退”三条规则散到渲染器、编辑器和导出检查中。

## 复用状态
- implemented
