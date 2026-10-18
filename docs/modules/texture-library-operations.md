# texture-library-operations

**一句话职责：** 对当前皮肤贴图库执行可撤销的创建、二次编辑、复制、删除与参数引用清理。

## 接口
- `saveSolidTextureToLibrary(payload, options)`：校验贴图名称并保存纯色贴图至图片仓库、替换表，同时在 `createdSkinTextureParams` 中保留完整生成参数供二次编辑；二次编辑改名时会同步迁移所有指向旧路径的参数引用。
- `renameTextureLibraryParamReferences(oldPath, newPath)`：遍历各键数配置、`ImageLookups` 与 `globalSkinImageLookups`，把旧贴图路径替换为新路径。
- `saveCreatedTextureGeneralEditParams(path, params)`：把裁剪、扩边、拉伸、缩放与 RGB 作为独立通用编辑配方附在生成参数上，不写成第二张图片。
- `cloneCreatedTextureParams(sourcePath, targetPath)`：共享引用选择独立创建副本时，把完整生成与通用编辑配方迁移到新路径。
- `getCreatedTextureParams(path)` / `saveCreatedTextureParams(path, params)` / `deleteCreatedTextureParams(path)` / `hasCreatedTextureParams(path)`：管理创建贴图的参数集合。
- `normalizeTextureLibraryCopyPath(source, rawName)`：校验用户输入并返回副本的规范化路径。
- `copyTextureLibrarySource(source, copyPath)`：把源贴图按当前解析出的帧复制为新的 PNG 资源，若源为创建贴图则一并克隆参数。
- `deleteTextureLibrarySource(source)`：从图片仓库和替换表移除源贴图，清理指向该路径的参数别名，并删除对应的创建参数。

## 输入
- `payload`：纯色贴图参数对象（名称、尺寸、规格、颜色、透明度、形状、圆角/箭头参数等）。
- `options`：可选 `oldPath`（二次编辑时指明原路径以支持改名）。
- `source`：`collectExistingTextureSources()` 返回的候选对象。
- **前置条件**：当前皮肤工作区可用。

## 输出
- 保存/编辑返回包含 `path`, `is2x`, `isEdit`, `frame`, `renamedReferences` 的结果对象。
- 复制返回新贴图路径、帧数与导出文件名。
- 删除返回已移除文件、导出删除标记与清理的参数引用数量。
- **后置条件**：图片仓库、回退仓库、`userReplacedTextures`、`createdSkinTextureParams` 与撤销历史保持同步。
- **单图后置条件**：生成本体按需创建，不进入图片仓库；只保存最终合成后的唯一 PNG。

## 依赖模块
- `skin-assets`：读写贴图仓库与回退仓库。
- `history`：记录操作前快照（支持撤销恢复二次编辑和删除）。
- `texture-image-editor-store-serialize`：把 Image/canvas 帧编码成 PNG。
- `texture-param-lookup`：规范化参数引用路径。
- `texture-solid-shape-factory`：根据参数渲染纯色图形。

## 副作用 / 外部资源
- 修改内存图片仓库、替换表、参数映射、创建参数字典和删除标记。
- 生成 PNG Blob/ArrayBuffer，不直接写磁盘。

## 非功能
- 复制按帧串行编码，避免同时分配大量位图。
- 同名检测覆盖全路径与忽略大小写。
- 所有仓库修改同步进入现有撤销快照。

## 深度评估
- 调用方只需提供形状参数或操作目标，无需关心底层贴图存储结构、@2x 映射与撤销快照细节。

## 复用状态
- implemented
