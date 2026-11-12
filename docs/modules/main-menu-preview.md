# main-menu-preview

**一句话职责：** 渲染并管理 osu!stable 主界面（Main Menu）预览画布，还原中央 osu! Logo 的节拍跳动、环形音频频谱柱、侧边菜单展开与视差背景。

## 接口
- `MainMenuPreview.init(canvas)` 绑定主界面目标画布与鼠标交互事件。
- `MainMenuPreview.start()` 启动主界面渲染动画循环。
- `MainMenuPreview.stop()` 停止动画循环并释放资源。
- `MainMenuPreview.draw(time)` 单帧绘制主界面完整层级（背景视差、Logo、频谱、侧边按钮、点唱机与用户卡片）。
- **不变量**：优先读取当前皮肤工作区贴图（如 `menu-osu`、`menu-button-background`、`menu-background`），缺失时自动优雅回退至官方默认资产或矢量回退。

## 输入
- 当前音频时钟与 BPM/TimingPoint 节拍信息、当前谱面与皮肤贴图仓库（`skinImageStore` / `defaultSkinImageStore`）、鼠标光标位置与点击事件。
- **前置条件**：画布 DOM 元素存在，已加载基础皮肤或默认皮肤。

## 输出
- 在 `#mainMenuCanvas` 绘制 640×480 虚拟坐标下的 stable 风格主界面。
- 点击 Play/Solo 菜单项可触发场景切换至选歌界面。

## 依赖模块
- `stage-view-tabs`、`skin-assets`、`transport`。

## 副作用 / 外部资源
- 持续在活动画布上进行 Canvas 2D 绘图，读取音频播放时间。

## 非功能
- 严格对照 stable 的节拍跳动（BPM Pulse / Kiai）衰减曲线；侧边按钮展开支持平滑插值与超时收回。

## 深度评估
- 所有主界面的几何计算、动效时钟与事件交互封装在模块内，不污染已有 Mania 游戏内渲染逻辑。

## 复用状态
- implemented
