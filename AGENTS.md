# Project Instructions

- 本项目主要面向 osu!stable。之后凡提到“参考 lazer 源码”，只参考 lazer 中用于还原、兼容或对照 stable 版本行为的相关源码；不要把 lazer 独有或尚未反映 stable 行为的实现当作本项目目标。
- 新增弹窗、面板、卡片等“框”统一沿用现有界面框风格：保留深色底色、圆角和阴影层级，默认不添加 1px 白色或半透明白色描边。
- 按钮风格统一规范：全站所有页面与模块（包含编辑模块、贴图编辑、参数设置、弹窗与操作栏等）的所有按钮统一采用通用扁平简约风格（.btn / .btn-primary / .btn-secondary / .btn-danger 等）：深色半透明底色（如 rgba(255, 255, 255, 0.12)）、圆角、border: none，严禁添加 1px 白色或半透明白色描边；悬浮态统一切换为纯白底黑字（background: #ffffff !important; color: #111118 !important; border: none; box-shadow: none !important;）；点击态 scale(0.96) 与浅灰底 #e2e2e8；禁用态 opacity: 0.45 且 not-allowed。此后新增或修改任何按钮必须严格沿用此标准，不得新增任何白色或浅色边框。
- 新增或修改任何会改变可编辑状态的功能时，必须同时设计并实现对应的撤回/重做行为，验证撤回历史粒度、连续操作、跨面板操作以及撤回后 UI 与持久化状态一致；不能只实现功能操作而遗漏撤回链路。
