# song-select-layout

**一句话职责：** 计算 osu!stable 选歌界面的面板尺寸和弧形轮盘位置。

## 接口
- `SongSelectLayout.metrics(width, height, panelSd)` 按 768 高度为 1 的比例给出面板、页脚和楔形尺寸。`panelSd` 是 `menu-button-background` 的 SD 宽高，缺省 690×85。
- `SongSelectLayout.panelLeft(metrics, itemCenterY, flags)` 用半径 `700 * scale` 的圆计算面板左缘。
- `SongSelectLayout.placeRows(rows, scrollIndex, metrics)` 把选中行放在轮盘垂直中心。
- **不变量**：圆心公式为 `sqrt(r^2 - mid^2) - r + 50 * scale`。卡片沿用贴图原 SD 宽高绘制；行距高度 `rowH = min(panelH, 90 * scale)` 避免阴影留白撑开轮盘间距。轮盘从画面顶部排到 90px 底栏之上，页眉覆盖在轮盘上。展开成员与选中项再向左偏移。

## 输入
- 画布宽高、行列表、滚动索引、展开/选中/悬停标记。
- **前置条件**：行对象带 `kind`。

## 输出
- 尺寸对象，以及每行的 `y` 与高度。

## 依赖模块
- 无。

## 副作用 / 外部资源
- 无。

## 非功能
- 纯计算，可在每帧调用。

## 深度评估
- 删掉它，弧形偏移会散落到绘制和命中两处。

## 复用状态
- implemented
