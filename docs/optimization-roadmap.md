# 代码优化与修复顺序路线图

本文档基于对 `src/`、`electron/`、`tools/` 的静态检查与源码走查整理，按 **“收益 / 风险比”** 与 **“先修正确性与撤回链路 → 再做性能优化 → 再解耦架构与重复代码 → 最后统一 CSS 与构建工具链”** 的原则排序。每完成一个阶段，都应执行阶段对应的回归命令后再进入下一阶段，避免跨层改动叠加导致定位困难。

> **通用约束（来自 `AGENTS.md` 与 `docs/architecture.md`）**
> - 修改任何会改变可编辑状态的功能时，必须同步验证撤回/重做粒度、连续操作、跨面板操作与导出/持久化一致性。
> - 本项目主目标为 **osu!stable**，任何涉及渲染或查找逻辑的重构不得以 lazer 独有行为替代 stable 行为。
> - 按钮统一采用扁平简约风格（无 `1px` 白色/半透明白边框，悬浮纯白底黑字 `#ffffff` / `#111118`，点击 `scale(0.96)` + `#e2e2e8`，禁用 `opacity: 0.45` + `not-allowed`）；弹窗/面板/卡片默认不加 `1px` 白色/半透明白描边。
> - 经典脚本共享全局词法作用域，拆分 JS 模块时必须保证 `tools/build-js.mjs` 中的 `modules` 加载顺序与初始化时序一致。
> - JS 与 CSS 单文件接近 ~800 行时按工作流或数据边界拆分，不按任意行号硬切。

---

## 阶段总览

| 阶段 | 主题 | 预期收益 | 引入新 Bug 风险 | 建议执行方式 |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | 确定性点状缺陷 & 撤回链路修复 | 高（直接修复 `Ctrl+Z` 失效、溢出与同步漏洞） | **低** | 可直接逐项小步提交 |
| **Phase 2** | `agent-session.js` 异步与版本号修复 | 高（若使用 MCP/Agent Bridge 则关键） | **低～中** | 修复后跑 Agent 相关 E2E |
| **Phase 3** | 渲染主循环与资源导入性能优化 | 高（长谱不掉帧、`.osk` 提速、防 UI 卡死） | **中** | 重点回归 Seek、Hold、长条与导入 |
| **Phase 4** | 核心重复逻辑抽取与超大 JS 模块拆分 | 中～高（消除改 A 漏 B，控制单文件体积） | **中～高** | 纯搬移不改逻辑，严守 `build-js.mjs` 顺序 |
| **Phase 5** | CSS Token 落地、去重复与边框/按钮规范统一 | 中（长期可维护性与视觉规范统一） | **高** | 按组件渐进替换，视觉对照截图 |
| **Phase 6** | Electron 安全加固、流式转码与构建瘦身 | 中（降内存峰值、收口服务端点、精简产物） | **中** | 分别验证 `serve` 与 `desktop` 打包模式 |

---

## Phase 1：确定性缺陷与撤回链路修复（低风险 · 最先做）

**排序理由**：改动局部、边界清晰、收益直接，且不涉及大范围文件搬移或渲染管线重构，最安全。

1. **修复 `ColourBarline` 拖动后 `Ctrl+Z` 撤回无效**
   - **位置**：`src/js/ui/param-render.js`（L625–L643，`updateColourBarline`）
   - **问题**：`picker.oninput` 与 `alphaSlider.oninput` 调用 `updateColourBarline(false)` 直接改写 `cfg.ColourBarline`；松手触发 `onchange` 才调用 `recordSkinUndoBeforeChange('调整小节线颜色')`，记录的是修改后的终值。
   - **修复**：在开始拖动/首次 `oninput` 时（或统一由 `updateColourBarline(true)` 配合 `continuousActionActive` 600ms 合并窗口）在写入 `cfg.ColourBarline` 之前调用 `recordSkinUndoBeforeChange`。

2. **修复 `Int16Array` 超 32767px 溢出**
   - **位置**：`src/js/ui/texture-solid-shape-factory.js`（L6，L603–L605，`createTexturePixelBoundaryStrokeCanvas`）
   - **问题**：最大画布单边限制为 `50000`（`TEXTURE_SOLID_SHAPE_MAX_DIMENSION`），但 `vx`/`vy` 使用 `Int16Array`（最大 `32767`）。
   - **修复**：将 `vx`/`vy` 改为 `Int32Array`，同时评估将 `distSq` 从 `Float64Array` 改为 `Uint32Array`/`Float32Array` 以减半峰值内存。

3. **补全 `history.js` 快照深拷贝与初始快照字段**
   - **位置**：`src/js/ui/history.js`（L192–L233 `createSkinSnapshot`，L277–L460 `applySkinSnapshot`，L534–L546 `initialSkinSnapshot`）
   - **问题**：
     - `createdSkinTextureParams` 在快照与还原时仅做 `{ ...v }` 浅拷贝，共享嵌套 `generalEditParams`。
     - `initialSkinSnapshot` 缺少 `userReplacedTextures`、`createdSkinTextureParams`、`textureEditRecipes`、`longBodyComposerSessions` 和 `activeEditorKeyCount`。
     - `requestDisableLongBodyComposer`（`texture-image-editor-longbody-apply.js` L337、L362、L480–L487）会直接修改 `currentSkinZip.remove(...)`，撤回无法恢复 zip 条目。
   - **修复**：
     - 对 `createdSkinTextureParams` 做包含 `generalEditParams`（及内层 `imageTransform`/`rgbAdjustment`）的深拷贝。
     - 为 `initialSkinSnapshot` 补全缺失字段。
     - 避免在可撤回的编辑流中直接对原 `currentSkinZip` 做不可逆 `remove`，改为在导出 `buildSkinArchiveBlob` 时根据当前状态统一删除，或记录待恢复条目。

4. **修复贴图编辑器状态同步与失败回滚**
   - **位置**：`src/js/ui/texture-image-editor-save-close.js`（L34–L62、L238–L578、L740–L748）与 `src/js/ui/texture-image-editor-create.js`（L275–L294）
   - **问题**：
     - 皮肤撤回后 `refreshTextureImageEditorAfterSkinHistory` 只重刷 `KeyImage` 激活标签页，非 `KeyImage` 标签页与后台标签页数据陈旧。
     - 纯色创建器（编辑模式）把实时预览写入 `skinImageStore`，直接调用 `close()` 时因 `isTabDirty` 只认 `tab.kind === 'texture'` 而跳过还原。
     - `applySelectedTexture` 在异步写入前入栈，写入失败时未弹出该无效快照，且长条分支 `catch` 调用了 `setNoteBodyStyleOne(false, false)` 而非 `restoreNoteBodyStyle()`。
   - **修复**：
     - 皮肤撤回后同步刷新所有打开的编辑器标签页（或失效重读）。
     - `isTabDirty` / `close()` 覆盖有 `creatorState.previewSnapshot` 的编辑态创建器标签页。
     - 异步保存失败时显式回滚本次预压入的 `undoStack` 快照并还原 `restoreNoteBodyStyle()`。

5. **Phase 1 验证**
   - 命令：`npm.cmd run check`
   - 重点 E2E：`npx playwright test tests/e2e/edit-history-menu.spec.js tests/e2e/texture-image-editor.spec.js tests/e2e/texture-image-create.spec.js`

---

## Phase 2：`agent-session.js` 异步时序、版本号与重置逻辑修复（低～中风险）

**排序理由**：集中在单个接口模块内，把自动化桥接的协议与撤回边界先打牢，避免后续重构时误判测试失败原因。

1. **补齐缺失的 `await ensureEditingWorkspaceReady()`**
   - **位置**：`src/js/ui/agent-session.js`（`undoSkin` L715、`redoSkin` L740、`revertSkin` L765、`resetConfigCategory` L794、`listHitsounds` L836、`applyHitsound` L866、`resetHitsound` L964）
   - **修复**：将相关方法改为 `async` 并统一 `await ensureEditingWorkspaceReady()`，消除未就绪时的静默放行与 15s 空轮询。

2. **消除 `revision` 双重递增与 `continuousActionActive` 泄漏**
   - **位置**：`src/js/ui/agent-session.js`（`revertSkin`、`resetConfigCategory`、`applyHitsound`、`resetHitsound`、`editTexture`、`stretchFixTexture`、`setBlankTexture`、`resetTexture`、`createTexture`、`applyLongbody`）及 `src/js/ui/history.js`（L247–L264）
   - **问题**：`recordSkinUndoBeforeChange` 在 `transactionActive === false` 时已通过 `notifyExternalMutation` 使 `revision += 1`，各命令随后又手工 `revision += 1`；且部分命令未复位 `continuousActionActive = false`，导致 600ms 内的人工微调被吞并进同一次撤销快照。
   - **修复**：在 `history.js` 暴露明确的事务 API（如 `beginHistoryTransaction` / `commitHistoryTransaction` / `rollbackHistoryTransaction`），Agent 写入操作统一包裹在该事务内，由事务提交时单次推进 `revision` 并重置 `continuousActionActive`。

3. **修复 `resetConfigCategory`、`applyLongbody` 与 `resetHitsound`**
   - **位置**：`src/js/ui/agent-session.js`（L805–L810、L976–L993、L1387–L1414）
   - **修复**：
     - `resetConfigCategory` 按 `p.type` 正确构造 `array_number`（填充至 `keys` 列）与颜色对象 `{ col/all, color }`。
     - `applyLongbody` 检查 `enableLongBodyComposer()` 返回值，返回 `false` 时抛出明确错误码而非继续保存。
     - `resetHitsound` 全部重置分支补充 `refreshManiaHitsoundPlaybackAfterEdit()`，且仅在实际发生变更时递增 `revision`。
     - `installBridge`（L1526）在 `document.readyState !== 'loading'` 时立即执行，避免晚加载漏绑。

4. **Phase 2 验证**
   - 命令：`npm.cmd run check`
   - 重点 E2E：`npx playwright test tests/e2e/agent-session.spec.js tests/e2e/electron-agent-bridge.spec.js`

---

## Phase 3：渲染主循环与导入性能热点优化（中风险）

**排序理由**：对用户感知（播放帧率、`.osk` 导入速度、创建器输入流畅度）改善最明显，但涉及热路径游标和异步时序，必须单独作为独立阶段验证。

1. **主渲染循环 `notesList` 窗口化与先裁剪后取贴图**
   - **位置**：`src/js/render/frame.js`（L352–L364、L410–L433、L514–L610）、`src/js/render/frame-notes.js`（L14–L104）、`src/js/render/frame-lighting.js`（L27–L65）
   - **问题**：每帧对有序 `notesList` 重复全量遍历 5～6 次；`renderHoldNotes` 与 `createNoteRenderer` 在视口裁剪前提前解析贴图并计算绘制高度。
   - **修复**：
     - 利用 `activeNotes` 已按 `startTime` 升序排列的特性（`beatmap-load.js` L170），结合“单帧按时间窗口二分起止索引 + 长条活跃集合 / `combo` 前缀计数”替代全量遍历。
     - 在 `syncNotesStateWithTime`、切难度、倍速/倒放切换时重置相关游标，特别确保长条 `startTime < windowStart < endTime` 不被漏判。
     - `renderHoldNotes` 与 `frame-notes.js` 先用宽松边距做 Y 轴视口裁剪，命中视口后再调用 `resolveAnimatedNoteImage`。

2. **减少每帧 `ctx.shadowBlur` 与热路径对象分配**
   - **位置**：`src/js/render/hud.js`（L211–L212）、`src/js/render/diagnostics.js`（L216–L257）
   - **修复**：对固定尺寸/微弱辉光可采用半透明外描边叠加或缓存小离屏图标替代逐帧动态 `shadowBlur`；将 `drawFrame` 内与配置相关的静态查找缓存到布局/配置变更时失效。

3. **`.osk` 皮肤并发解码与 `processSkinImage` 去 `toDataURL`**
   - **位置**：`src/js/parser/skin-import.js`（L235–L303）、`src/js/parser/skin-assets.js`（L47–L88）
   - **修复**：
     - 参照 `loadDefaultSkinImages`（`skin-assets.js` L220）使用固定并发度（如 6～8）并发读取解压与解码图片，再按 `orderedImages` 原顺序调用 `registerSkinImage` 以保证根目录/子目录优先级完全不变。
     - 被 `processSkinImage` 替换掉的原图立即释放其 `blobUrl`；评估在消费端兼容的前提下让 `processSkinImage` 直接返回离屏 Canvas 或 `ImageBitmap`（避免同步 PNG `toDataURL` 编解码），并给进度条 DOM 更新节流。

4. **纯色贴图创建器预览防抖**
   - **位置**：`src/js/ui/texture-image-editor-create.js`（L150–L294）
   - **修复**：输入事件中对形状网格预览与画布实时预览使用 `requestAnimationFrame` / ~80ms 防抖合并；点击确认创建/保存时先同步读取当前表单值再生成最终贴图。

5. **`i18n.js` 降低 DOM 遍历开销**
   - **位置**：`src/js/core/i18n.js`（L162–L250）
   - **修复**：仅对 `html` 字典确实命中的可能标签或叶子容器做 HTML 替换，避免对整棵子树每个祖先节点都读取 `.textContent`；`MutationObserver` 在 `currentLanguage === 'zh-CN'` 且无恢复需求时可暂停，仅在切换为 `'en'` 时启用（需确保切换语言与动态弹窗时 `translateSubtree` 完整）。

6. **Phase 3 验证**
   - 命令：`npm.cmd run check`
   - 重点 E2E：`npx playwright test tests/e2e/mania-scroll.spec.js tests/e2e/notebodystyle.spec.js tests/e2e/keyimage-height.spec.js tests/e2e/localization.spec.js tests/e2e/feature-coverage.spec.js`
   - 人工/自动化回归：用 `samples/beatmaps/` 中高密度长条谱（如 `Hylotl's LN Collection`）与大型 `.osk` 测试快速拖进度条（前/后 Seek）、`UpsideDown` 切换和帧率表现。

---

## Phase 4：重复逻辑抽取与超长 JS 模块拆分（中～高风险）

**排序理由**：代码搬移与统一抽象涉及多模块耦合；在前面核心行为稳定且测试通过的前提下再做结构整理，并且严格遵循 **“先纯提取合并、再拆分文件，每步不夹带功能变更”**。

1. **统一“唯一真源”公共辅助函数（先消重再拆分）**
   - **Mania 默认配置对象**：`skin-ini.js` 的 `createConfig`（L82–L132）复用 `mania-config.js` 的 `createDefaultManiaSkinConfiguration`（L24–L74），立即消除 `ComboBurstStyle` 等字段漂移。
   - **贴图查找逻辑**：将 `render/textures.js` 中 `getManiaSkinImage`（L81–L246）与 `getManiaSkinAnimationFrames`（L248–L352）共用的百余行 `searchKeys` 构建与三级查找抽取为单一 `resolveManiaImageLookupSpec`。
   - **贴图键名正则解析**：统一 `app-shell.js`、`texture-upload.js`、`texture-resolve.js`、`ini-export.js`、`agent-session.js` 中的 `NoteImage(\d+)([HLT])` / `KeyImage(\d+)D` 解析函数到 `skin/` 或 `ui/` 公共辅助模块。
   - **画布命中测试**：将 `ui/canvas-interactions.js` 中 `mousedown`（L30–L189）与 `mousemove`（L499–L635）重复的 10 层优先级命中逻辑合并为单一 `hitTestCanvasInteractiveElement(mouseX, mouseY)`。
   - **编辑器多引用弹窗与配方回放**：统一 `texture-image-editor-create.js`（L647–L675）与 `texture-image-editor-save-close.js`（L124–L160、L300–L335）的多引用过滤规则（含同轨 `KeyImage`/`KeyImageD` 一致性）；抽取 `history.js` 中重复的 `textureEditRecipes` 克隆与 `agent-session.js` 中的 `decodeBase64` / 贴图操作事务包装器。

2. **按业务边界拆分超 ~800 行的 JS 文件**
   - **`src/js/ui/agent-session.js`（1543 行）**：拆为会话核心与事务/桥接（`agent-session.js`）、参数与音效操作、贴图编辑自动化、预览捕获与校验导出。
   - **`src/js/ui/texture-image-editor-create.js`（1075 行）**：拆为状态与预览渲染、创建/保存控制器与 DOM 绑定。
   - **`src/js/ui/texture-image-editor-save-close.js`（867 行）**：将 `applySelectedTexture`（341 行）的 KeyImage、普通贴图、长条投皮三条保存管线拆分为独立 helper，并分离窗口拖拽/关闭控制。
   - **`src/js/ui/param-render.js`（776 行）**：将 `renderSkinEditorParams`（771 行）按字体块、分类折叠块、控件类型（`number`/`boolean`/`color`/`select`/`text`）拆成小渲染函数。
   - **`src/js/ui/texture-solid-shape-factory.js`（873 行）**：拆分几何路径生成器与像素描边光栅化器。
   - **`src/js/render/frame.js`（887 行）**：将预览假音符生成、Combo 统计与 Hold 身体绘制进一步下沉到 `frame-notes.js` / `hold-note-geometry.js`。

3. **Phase 4 验证**
   - 每拆一个模块即更新 `tools/build-js.mjs` 的 `modules` 列表、`src/js/README.md` 与 `docs/modules/`。
   - 执行 `npm.cmd run build:js && npm.cmd run check && npm.cmd run test:e2e` 全量回归（重点检查经典脚本加载顺序无 TDZ `ReferenceError`）。

---

## Phase 5：CSS 体系重构、Token 落地与规范对齐（高风险）

**排序理由**：当前 4 个主要 CSS 模块累计 **254 处 `!important`**，且依赖级联优先级与跨文件注释拼接，是回归最容易误伤视觉细节的区域，适合作为独立 UI 专题推进。

1. **修复跨文件注释边界并拆分超长 CSS**
   - 清理 `shell.css`（L1358）、`skin-editor.css`（L1809）、`texture-editor.css`（L3727）末尾未闭合与下文件开头闭合的注释。
   - 将 `texture-editor.css`（3727 行）、`skin-editor.css`（1809 行）、`shell.css`（1358 行）按弹窗/功能域拆分为 ≤800 行的模块（如上传弹窗、序列帧编辑器、图片编辑器、纯色创建器、长条投皮面板），并同步更新 `tools/build-css.mjs` 与 `src/css/README.md`。
   - 清理 `tokens.css`（L87–L187）已废弃隐藏的 `.sidebar` / `.sidebar-resizer` 死样式，以及 `texture-editor.css:414` 未定义的 `--primary-pink`。

2. **统一 Token、公共组件类与去重复**
   - 激活 `tokens.css` 已定义但未使用的 13 个变量，补充 `#111118`（悬浮字色）与 `#e2e2e8`（点击态底色）Token。
   - 合并 4 处完全重复的滑块 `input[type="range"]` 样式（每次约 60–75 行 / 38 个 `!important`）、4 处透明棋盘格、8 处滚动条、7 处弹窗居中遮罩与 2 套开关样式。

3. **逐项对齐 `AGENTS.md` 按钮与边框规范（增量替代，避免暴力删 `!important`）**
   - 统一 `.btn` 基类覆写或替换未接入的分散按钮（`.startup-action`、`.key-pill`、`.texture-spec-card`、`.texture-image-tab`、`.topbar-btn`、`.file-upload-btn` 等），补齐 `border: none`、悬浮白底黑字 `#ffffff` / `#111118`、点击 `scale(0.96)` + `#e2e2e8`。
   - 移除弹窗/面板/卡片（`.skin-editor-dialog`、`.dropdown-menu`、`.texture-upload-dialog`、`.anim-texture-dialog`、`.texture-image-scope-dialog`、`.loading-card`、`.toast`、`.left-info-panel` 等）默认自带的 `1px` 白色或半透明白描边，改用背景色阶与阴影区分层级。

4. **Phase 5 验证**
   - 命令：`npm.cmd run build:css && npm.cmd run check && npm.cmd run test:e2e`
   - 视觉检查：逐个弹窗截图对比（主界面、参数面板、全部贴图库、贴图裁剪/长条投皮、创建纯色贴图、动画序列编辑器、音效窗口、导出弹窗）。

---

## Phase 6：Electron 安全加固、流式转码与构建瘦身（中风险 · 收尾阶段）

**排序理由**：对日常核心编辑体验无阻塞性影响，但能显著优化桌面端大图/视频边界稳定性和发布产物整洁度。

1. **抽取共享静态服务并修复校验漏洞**
   - 将 `electron/main.cjs`（L45–L139）与 `tools/static-server.cjs`（L9–L85）合并为共享模块：
     - 统一使用 `path.relative(root, filePath)` 做目录穿越拦截。
     - 为 `new URL(...)` 加 `try/catch`，限制仅允许 `GET`/`HEAD` 访问静态资源，补齐 `.md` / `.wasm` / `.webm` / `.mp4` MIME 与 `response.on('close')` 流销毁。
     - 限制静态服务只暴露运行时必需目录/文件（`index.html`、`assets/`、`src/css/style.css`、`src/js/bundle.js`、`vendor/`、`LICENSE`、`THIRD_PARTY_NOTICES.md`），避免暴露 `electron/`、`tools/`、`package.json`（开发测试如直接引用源码模块时可配置白名单）。

2. **视频转码流式化与进程生命周期治理**
   - **位置**：`electron/video-transcoder.cjs`（L31–L193、L205–L237）与 `electron/main.cjs`（L202、L397–L470）
   - **修复**：
     - 将 `readRequestBody` + `writeFile` 改为边收边写临时文件（超 `MAX_VIDEO_BYTES` 立即 `request.destroy()` 并删临时文件），转码后流式返回 `output.webm`，消除最大 ~1GB 的内存峰值。
     - 跟踪活跃 `ffmpeg`/`ffprobe` 子进程与临时目录，在 `request.on('close')` 与 `app.on('before-quit')` 时中止进程并清理临时文件；为 `/__video-transcode` 补充严格 Origin / Token 校验（仅同源或带桌面会话 Token 允许调用）。
     - 在 `mainWindow.on('closed')`、`did-start-navigation`、`render-process-gone` 中及时 reject `pendingAgentRequests` 并复位 `rendererCloseGuardReady`，关闭 HTTP 服务时调用 `closeAllConnections()`。

3. **清理构建冗余与扩展校验脚本**
   - 移除确认无引用的 `src/js/ui/texture-image-editor-create-target-options.js` 与 `src/js/ui/texture-image-editor-create-targets.js`（先再确认全仓无引用）。
   - 修复 `tools/build-site.mjs`：不再把 `src/js/` 整个源目录连同 `bundle.js` 重复部署到 `site/`；`package.json` 的 `build.files` 改为只打包运行时产物（`index.html`、`src/css/style.css`、`src/js/bundle.js` 等）；为 `build-site.mjs` 增加源产物同步前置检查或自动构建，同时评估 `_headers` 缓存与版本号策略。
   - 扩展 `tools/check-js.mjs`：改用基于 `import.meta.url` 的绝对路径，并一并检查 `electron/*.cjs` 与 `tools/*.{mjs,cjs}` 语法，以及校验 `src/js/` 下的 `.js` 文件是否均已登记在 `tools/build-js.mjs`（防止再次遗留未入包死文件）。

4. **Phase 6 验证**
   - 命令：`npm.cmd run check && npm.cmd run build:site && npm.cmd run test:e2e`
   - 手动/桌面验证：启动 `npm.cmd run desktop` 测试含视频背景 `.osz` 的加载、切难度中止转码、窗口关闭拦截与 Agent Bridge 连接/断开。
