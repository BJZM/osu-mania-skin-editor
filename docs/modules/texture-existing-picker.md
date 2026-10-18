# texture-existing-picker

**一句话职责：** 提供已有贴图选择弹窗，并把用户选择应用到目标贴图参数。

## 接口
- `initTextureExistingPickerUI()` 绑定弹窗、搜索、选择、确认和关闭行为。
- `openTextureExistingPicker(p, keys)` 打开指定贴图参数的选择器。
- `textureExistingPickerUi.confirm()` 与 `textureExistingPickerUi.getState()` 供快捷键和回归测试使用。

## 输入
- 目标贴图参数 `p` 与当前键数 `keys`。
- **前置条件**：启动初始化已完成，皮肤编辑工作区可用。

## 输出
- 确认后当前参数路径被改写，参数面板和画布刷新。
- **后置条件**：弹窗关闭；不新增或覆盖贴图文件。

## 依赖模块
- `texture-existing-sources` 候选列表接口。
- `texture-existing-picker-view` 候选网格渲染接口。
- `texture-param-lookup` 路径写入接口。
- `recordSkinUndoBeforeChange`、`syncParamInputValue`、`renderSkinEditorParams`、`drawFrame`。

## 副作用 / 外部资源
- 修改 DOM、skin.ini 内存映射和撤销快照；触发画布重绘。

## 非功能
- 搜索只过滤已加载候选，不重复扫描资源。
- 确认是同步内存操作；重复确认相同路径不会产生额外修改。

## 深度评估
- 复合模块把“资源枚举 -> 选择 -> 路径写回 -> 界面刷新”的编排集中在一个入口。
- 删除后同一顺序会散到每个贴图参数控件，因此保留。

## 复用状态
- implemented
