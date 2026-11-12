# song-select-paint

**一句话职责：** 把选歌视图画到画布上，并返回本帧的点击区域。

## 接口
- `SongSelectPaint.draw(ctx, view)` 绘制背景、轮盘、信息楔形、分组标签、搜索条和底栏。
- **不变量**：从后往前绘制。`menu-button-background` 按 `panelH` 居中绘制并乘色（未玩粉 `#EB4999`、玩过橙 `#E96800`、展开难度蓝 `#0096EC`、选中白），无自定义底板且未关联真实谱面背景时才绘程序渐变缩略图；卡片副标题、版本与按原宽高比绘制的 `star` 亮度同时参考 `menu-button-background` 深浅与 `SongSelectActiveText`/`InactiveText` 自动适配对比度。`menu-snow` 以普通混合做飘落粒子替换 `star2` 加法飘星。`menu-back` 居左，其后 `selection-mode`..`options` 固定从 `224 * scale` 起排，玩家资料固定避让 `>= 634 * scale` 镂空框。`mode-mania-small` 仅以加法混合画在 Mode 槽，超宽满屏外框以 `cy = height - 34 * scale` 对齐；若 `selection-mode` 被全透明贴图屏蔽则不画残留小键位图标。全透明多像素/1×1 屏蔽贴图不回退画默认色块；整屏皮肤外框生效且无 `songselect-top` 时省略默认矢量楔形并增强文字投影；深色 `selection-tab` 自动切浅色文字，有定制顶框时保留轻量可交互的分组/排序/标签与搜索栏。

## 输入
- 2D 上下文，以及含尺寸、行位置、文案、贴图取值函数和背景图的 view。
- **前置条件**：`SongSelectLayout.panelLeft` 可用。

## 输出
- `{ rows, tabs, groupBox, sortBox, footer }` 命中矩形。

## 依赖模块
- song-select-layout。

## 副作用 / 外部资源
- 缓存少量乘色后的面板画布。

## 非功能
- 轮盘区域裁剪在页眉与页脚之间。

## 深度评估
- 删掉它，染色、裁剪和命中矩形会散回帧循环。

## 复用状态
- implemented
