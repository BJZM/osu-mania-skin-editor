# texture-rgb-adjustment

**一句话职责：** 对单张 canvas 按 R/G/B 三个通道的百分比增益调整整体颜色，并保持 alpha 不变。

## 接口

- `createDefaultRgbAdjustment()`：返回 `{ r: 100, g: 100, b: 100 }`。
- `normalizeRgbAdjustment(value)`：把输入归一化为三通道对象；非法或缺失通道回退到 `100`。
- `cloneRgbAdjustment(value)`：返回独立副本。
- `rgbAdjustmentsEqual(a, b)`：比较两个通道配置是否等价。
- `hasRgbAdjustment(value)`：任一通道不等于 `100` 时返回 `true`。
- `applyRgbAdjustmentToCanvas(canvas, value)`：原地修改 canvas 像素并返回同一 canvas。
- 通道值范围为 `0` 到 `200`，`100` 表示原始强度。

## 输入

- `value`：可包含 `r`、`g`、`b` 的对象，值可为数字。
- `canvas`：带有效 2D 上下文的 canvas 或 OffscreenCanvas。
- **前置条件**：canvas 宽高至少为 1；调用方已经完成几何绘制。

## 输出

- 返回处理后的同一个 canvas。
- **后置条件**：每个 RGB 通道按 `原值 * 通道值 / 100` 计算并截断到 `0..255`；alpha 不变。

## 依赖模块

- 无。该模块是原子模块，只依赖 Web Canvas 2D API。

## 副作用 / 外部资源

- 修改传入 canvas 的像素数据。
- 使用 `getImageData` / `putImageData`，不访问网络、文件、时钟或随机数。

## 非功能

- 单次调用时间复杂度为 O(width × height)。
- 同一调整值重复应用会继续叠加，因此每张输出 canvas 必须只调用一次。
- 无调整时直接返回，不读取像素。

## 深度评估

- 接口窄，调用方只需提供 canvas 和三通道值，像素循环、查表与边界处理都隐藏在实现内。
- 删除该模块后，帧编辑与长条输出都要各自维护通道计算，复杂度会散到至少两处，因此保留。
- 原子、可组合，且没有依赖其它项目模块。

## 复用状态

- implemented
