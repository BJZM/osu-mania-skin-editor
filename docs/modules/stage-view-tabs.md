# stage-view-tabs

**一句话职责：** 管理网页右侧纵向排列的场景切换选项卡，统一调度“游戏内”、“选歌页面”与“主页面”的状态流转与画布渲染生命周期。

## 接口
- `setStageView(viewName)` 切换当前活动预览场景（`'gameplay'` | `'song-select'` | `'main-menu'`）。
- `getStageView()` 获取当前活动预览场景标识。
- `initStageViewTabs()` 初始化右侧纵向导航栏的 DOM 事件、快捷键绑定（Alt+1/2/3）与画布切换。
- **不变量**：任何时刻仅有一个场景画布处于活动渲染状态；非活动画布停止 `requestAnimationFrame` 循环；全屏时自动隐蔽右侧导航栏保持舞台无遮挡。

## 输入
- 用户对右侧选项卡的点击、快捷键输入或来自其他预览模块的场景跳转指令（如主界面点击 Play 跳转选歌）。
- **前置条件**：页面完成基础 DOM 解析，存在对应的目标 Canvas 节点与选项卡按钮。

## 输出
- 更新选项卡高亮样式（`.active`），切换目标 Canvas 显隐（`style.display`），启停相应模块的渲染循环。
- 派发全局自定义事件 `stageviewchange` 携带 `{ view, prevView }`。

## 依赖模块
- `main-menu-preview`、`song-select-preview`、`render/frame`。

## 副作用 / 外部资源
- 操作 DOM 节点的样式与属性（`#stageNavRail`、`#gameCanvas`、`#songSelectCanvas`、`#mainMenuCanvas`）。

## 非功能
- 按钮采用扁平深色半透明圆角规范，严禁 1px 白色描边，Hover 纯白底黑字；切换响应延时低于 16ms。

## 深度评估
- 将场景切换的逻辑与各个具体界面的绘制细节彻底解耦，外部调用方只需通过 `setStageView('song-select')` 即可安全切流。

## 复用状态
- implemented
