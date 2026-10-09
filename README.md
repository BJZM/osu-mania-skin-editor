# osu!mania Skin Editor

本地运行的 osu!mania 皮肤可视化编辑器，主要用于预览、修改并导出 osu!stable 兼容的 `skin.ini` 与贴图资源。

## 启动

需要 Node.js；浏览器建议使用本机 Chrome。

```powershell
npm install
npm run serve
```

然后访问：

```text
http://127.0.0.1:8765/
```

也可以直接以桌面窗口启动：

```powershell
npm install
npm run desktop
```

## 打包 Windows exe

```powershell
npm install
npm run dist:win
```

生成的便携版程序位于 `dist/osu-mania-skin-editor-0.1.0-x64.exe`，无需安装，双击即可运行。

## 常用命令

```powershell
npm run check
npm run test:e2e
```

`npm run check` 对运行时 JavaScript 做语法检查，并确认 CSS、HTML 构建产物与源码同步。`npm run test:e2e` 使用 Playwright 验证页面加载和关键画布行为。

CSS 源码按领域拆分，运行时使用生成的 `style.css`。修改 `src/css/` 后运行：

```powershell
npm run build:css
```

HTML 页面由模板和片段生成。修改 `src/html/` 后运行：

```powershell
npm run build:html
```

不要再直接修改生成的 `index.html`。`npm run serve` 和 `npm run test:e2e` 会自动先执行构建。

## 目录结构

```text
/
  index.html                 # 唯一入口
  src/
    html/
      index.template.html    # 页面骨架与片段引用
      partials/              # 顶栏、画布、弹窗、播放器和脚本列表
    css/
      style.css              # 构建生成的 CSS 单文件入口
      README.md              # CSS 模块索引与级联顺序
      tokens.css             # 变量、重置与基础样式
      player.css             # 底部播放器
      shell.css              # 顶栏、侧边栏与主舞台
      skin-editor.css        # skin.ini 编辑器
      canvas-tools.css       # 画布选中与拖拽工具
      texture-editor.css     # 贴图上传与动态贴图编辑器
      help.css               # 帮助弹窗
      cursor.css             # 皮肤光标
    js/
      core/                  # 全局状态、布局与共享常量
      skin/                  # skin.ini 解析、Mania 配置与参数元数据
      parser/                # 谱面、压缩包、贴图和 TimingPoints
      render/                # Canvas 帧、字体、贴图、HUD 与诊断
      ui/                    # 播放器、参数面板、贴图编辑、导出与启动
      cursor.js              # 皮肤光标覆盖层
      default_skin.js        # 官方默认皮肤资源清单
      README.md              # JS 模块索引与加载顺序
  assets/
    default_skin/            # 运行时默认皮肤资源
  vendor/                    # 本地第三方运行库
  docs/
    architecture.md          # 依赖关系和维护说明
    lazer-reference/         # 仅用于 stable 兼容行为对照的源码片段
  tests/e2e/                 # 浏览器端回归测试
  tools/                     # 辅助脚本和工具
  samples/                   # 本地测试皮肤与谱面，不纳入版本控制
```

## 依赖说明

- `jszip` 与 `utif` 已放在 `vendor/`，页面在离线环境仍可使用其本地副本。
- 谱面解析使用本地原生解析器，桌面版可完全离线运行。
- `samples/` 和 `test-results/` 默认被 `.gitignore` 排除，避免测试素材与生成结果污染源码仓库。

## 项目约束

本项目以 osu!stable 行为为目标。涉及 lazer 源码时，只参考 lazer 中用于还原、兼容或对照 stable 的实现，不将 lazer 独有行为作为目标。
