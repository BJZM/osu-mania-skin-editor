# comboburst-editor

**一句话职责：** 作为“贴图映射”中的独立贴图项，通过“导入多张贴图”批量维护连击提示图组，并按每张图片向左、向右的节奏循环预览。

## 接口
- `openComboburstGroupEditor()` 从贴图映射项的“导入多张贴图”等入口打开多图编辑器，并载入当前主图或编号组。
- `addComboburstGroupFiles(files, options)` 添加单张或多张图片，批量模式按文件名自然排序。
- `applyComboburstGroupFrames()` 将列表压紧为 `comboburst-mania-0..N`，零张时清空整个连击提示图集合。
- `initComboburstEditorUI()` 绑定贴图编辑入口、文件输入、排序、规格、播放和保存控件。
- **不变量**：列表顺序就是导出编号顺序；一次保存或清空只产生一条皮肤撤回记录；不写入虚构的 `skin.ini` 图片路径键。

## 输入
- 当前图片组和用户选择的 PNG / JPEG；单张与批量入口使用同一个待保存列表。
- **前置条件**：已有可编辑皮肤工作区。

## 输出
- 更新后的图片仓库与待导出替换文件。
- **后置条件**：非空图组导出后保持 `comboburst-mania-0.png`、`-1.png` 连续命名；清空后主图与编号图都不再显示。

## 依赖模块
- `comboburst-assets`、`history`、`skin-assets`、`feedback`、`ui-localization`、texture-image-editor。

## 副作用 / 外部资源
- 读取本地图片、修改内存皮肤仓库、撤回历史与导出覆盖层。

## 非功能
- 预览固定按每张图片先左后右、每次约 1.4 秒循环；单次保存是独立撤回步骤。

## 深度评估
- 调用方只需点击“连击提示图”贴图项的导入菜单；编号压紧、规格替换、历史记录和左右预览都隐藏在模块内。
- 删除该模块会把连续编号约束、撤回顺序和左右循环预览分散到贴图上传与 Canvas 预览两处。

## 复用状态
- implemented
