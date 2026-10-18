# texture-solid-shape-factory

**一句话职责：** 按指定像素尺寸、RGBA 填充、可选像素边界描边与形状蒙版生成一张可直接进入现有贴图编辑流程的 canvas。

## 接口

- `normalizeTextureShape(value)`：把外部形状值归一化为受支持的形状 ID；非法值回退为 `rectangle`。
- `normalizeTextureHexColor(value)`：把 `#RGB` / `#RRGGBB` 归一化为小写 `#rrggbb`。
- `createSolidShapeTexture(options)`：返回带 2D 像素数据的 canvas。
- `options.width` / `options.height`：整数像素尺寸，至少为 `1`。
- `options.color`：十六进制颜色；非法颜色回退为 `#ffffff`。
- `options.alpha`：透明度，接受 `0..1` 或 `0..100`，最终归一化为 `0..1`。
- `options.shape`：`rectangle`、`circle`、`rounded-rectangle`、`rotated-square`、`arrow-up`、`arrow-down`、`arrow-left`、`arrow-right`。
- `options.strokeEnabled`：是否在填充像素边界内侧生成描边，默认关闭。
- `options.strokeColor`：描边十六进制颜色，默认 `#000000`；非法颜色回退为白色。
- `options.strokeAlpha`：描边透明度，接受 `0..1` 或 `0..100`，最终归一化为 `0..1`，与 `options.alpha` 独立。
- `options.strokeWidth`：向内收缩的像素宽度，非负整数；`0` 表示不生成描边。
- `options.arrowThickness`：四向箭头的箭杆宽度百分比，默认 `20`，范围为 `8..50`。
- `options.arrowRoundness`：箭头尖端、翼角与箭杆端部的圆角百分比，默认 `50`，范围 `0..100`；`0` 为尖角，`100` 为最大圆角。
- 四向箭头采用“个”字式开放 V 形头部与中央箭杆。两条斜线先组成单个连续 V 形轮廓，尖端使用单个连接弧参与圆角调节；箭杆向中心回插重叠，低粗细下仍保持单块连通。尖端位置会随粗细和圆角自动内收，避免变粗后伸出画布。
- `options.cornerRadius`：圆角矩形或菱形的圆角半径；实现内会按几何边界限制，半径过大时自动收束，避免相邻圆角重叠。
- `options.is2x`：把生成 canvas 标记为 osu!stable 的 `@2x` 资源。
- 输出 canvas 的形状外区域保持透明；形状内区域使用同一 RGBA 纯色填充。
- 描边只占据原填充边界之内的像素，并先从填充层中扣除；描边 alpha 直接由 `strokeAlpha` 决定，不乘以填充 alpha。

## 输入

- 参数使用普通对象传入。
- **前置条件**：调用环境提供浏览器 Canvas 2D API。
- **错误模式**：宽高不是正整数、超过实现上限，或无法取得 2D 上下文时抛出 `Error`。

## 输出

- 返回一个新创建的 `HTMLCanvasElement`。
- **后置条件**：canvas 宽高精确等于请求尺寸；填充区域使用请求填充 RGBA，描边区域使用独立描边 RGBA。
- canvas 带有与现有贴图管线一致的 `_is2x` 标记。

## 依赖模块

- 无。该模块是原子模块，只依赖 Web Canvas 2D API。

## 副作用 / 外部资源

- 分配新的 canvas 与位图内存。
- 不访问网络、文件、时钟、随机数或项目全局状态。

## 非功能

- 生成耗时与像素数量及描边像素区域线性相关。
- 不修改调用方传入的对象。
- 不需要序列化或持久化。

## 深度评估

- 接口只需尺寸、颜色和形状描述，路径构造、透明度换算、圆角限制和参数化箭头几何全部隐藏在实现内。
- 删除后，创建贴图与形状预览需要各自维护画布路径，复杂度会散到至少两处，因此保留。
- 原子、可组合，并且不依赖其它项目模块。

## 复用状态

- implemented
