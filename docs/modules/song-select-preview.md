# song-select-preview

**一句话职责：** 驱动 osu!stable 选歌预览的帧循环、指针与键盘，并把选中难度交回谱面加载。

## 接口
- `SongSelectPreview.init(canvas)` 绑定 `#songSelectCanvas` 的滚轮、拖拽、点击、右键绝对滚动与捕获阶段键盘。
- `SongSelectPreview.start()` / `stop()` 启动或停止动画循环，并在启动时刷新曲库。
- `SongSelectPreview.draw(time)` 绘制一帧。
- `SongSelectPreview.updateCarouselData()` 按当前 `beatmaps` 重建曲库。
- **不变量**：只有选歌视图在运行时才吞掉键盘；输入框和已打开的编辑弹窗优先。按 `AnimationFramerate` 从多帧动画贴图按时间取帧，并将自定义 `menu-button-background` 标记传给绘制层；拖拽滚动按 `(rowH || panelH) + gap` 换算。双击当前难度、回车或右下角 Cookie 进入游戏内预览。Esc 先清空搜索，再回到主界面。

## 输入
- 画布、鼠标、滚轮、键盘、`beatmaps`、`currentBeatmap`。
- **前置条件**：`SongSelectLayout`、`SongSelectCatalog`、`SongSelectPaint` 已加载。

## 输出
- 画布帧与命中区域；选中已导入难度时调用 `loadBeatmapDifficulty`。

## 依赖模块
- song-select-layout、song-select-catalog、song-select-paint、stage-view-tabs、beatmap-load。

## 副作用 / 外部资源
- `requestAnimationFrame`、画布监听、文档捕获键盘。

## 非功能
- 滚动用阻尼插值；远距离面板不参与命中。

## 深度评估
- 输入和生命周期留在这里，几何、曲库和绘制分开。删掉它，事件会散回三个绘制模块。

## 复用状态
- implemented
