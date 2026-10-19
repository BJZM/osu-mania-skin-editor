# ui-localization

**一句话职责：** 管理界面语言、osu!mania 中英文术语映射、动态 DOM 本地化与用户语言偏好。

## 接口

- `window.I18n.getLanguage()`：返回当前语言，仅支持 `zh-CN` 与 `en`。
- `window.I18n.setLanguage(language)`：切换界面语言并同步选择器、`document.documentElement.lang` 与 `document.title`。
- `window.I18n.t(zhText, vars?)`：把中文界面文案转换为当前语言；变量按 `{name}` 插值。
- `window.I18n.translateNow(root?)`：立即翻译一个已挂载的 DOM 子树。
- `window.I18n.getMissing(root?)`：返回英文模式下仍含中文且未标记忽略的可见界面文本，用于回归测试。
- 不变量：切换语言只改变界面表现，不修改皮肤配置、贴图、输入框值或皮肤撤回历史。

## 输入

- 语言代码、中文源文案、可选插值变量。
- **前置条件**：DOM 根节点已经存在；动态模态框应挂载后再调用 `translateNow`，MutationObserver 也会自动处理后续节点。

## 输出

- 当前语言的文本节点与 `title`、`placeholder`、`aria-label` 属性。
- `html[lang]`、`document.title` 与 `localStorage` 中的语言偏好。
- **后置条件**：切回中文时界面恢复中文；英文词条覆盖静态文案、参数元数据和动态渲染文案。

## 依赖模块

- 无项目模块依赖；使用浏览器 DOM、MutationObserver 与 localStorage。

## 副作用 / 外部资源

- 读写 `localStorage["osu-mania-skin-editor.language"]`。
- 监听并翻译全页面 DOM 变化。
- 不访问网络。

## 非功能

- 词典是静态内存对象，翻译单节点为常数级查找。
- MutationObserver 按微任务批处理；语言未变化时不重复写同一个值。
- 语言偏好读取失败时回退到 `zh-CN`。

## 深度评估

- 接口只暴露当前语言、切换、翻译和 DOM 同步；词典、反向映射、术语优先级、观察器与持久化均隐藏在模块内。
- 删除测试：若删除该模块，语言状态、DOM 翻译、属性翻译与持久化会散落到全部 UI 模块，因此值得保留为深原子模块。
- 自检：窄接口覆盖全站静态与动态文本，调用方无需知道翻译机制。

## 复用状态

- implemented
