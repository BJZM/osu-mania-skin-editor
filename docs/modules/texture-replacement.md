# texture-replacement

**一句话职责：** 在单贴图路径替换后统计旧资源的有效引用，并在最后一个引用离开时执行可撤销的逻辑删除。

## 接口
- `prepareTextureReplacement(p, keys, newPath)`：替换前捕获旧路径与旧图片来源；相同逻辑路径或字体前缀返回 `null`。
- `completeTextureReplacement(replacement)`：替换完成后扫描全部键数的有效贴图引用；仍有引用时保留旧资源，引用归零时写入删除标记并清理当前工程资源。
- **不变量**：调用方必须先记录一次替换撤销快照，再写入新路径，最后调用 `completeTextureReplacement()`。

## 输入
- `p`：目标贴图参数定义，不能是 ScorePrefix、ComboPrefix 或虚拟字体字形。
- `keys`：发生替换的键数。
- `newPath`：替换后的参数路径；允许为空，表示清空显式路径并恢复默认回退。
- `replacement`：`prepareTextureReplacement()` 返回的旧资源快照。
- **前置条件**：替换前的皮肤仓库和参数映射仍可读取。

## 输出
- 准备阶段返回 `{ p, keyCount, oldPath, oldIdentity, oldSource, newPath }` 或 `null`。
- 完成阶段返回 `{ deleted, remainingReferences, result?, reason? }`。
- **后置条件**：旧资源仅在全部键数的有效引用归零、且属于当前工程的普通导入/替换资源时被隐藏并进入导出删除集合。

## 依赖模块
- `texture-existing-sources`：按实际路径查找旧图片资源。
- `texture-param-lookup`：规范化资源身份并跨键数统计有效引用。
- `texture-library-operations`：复用仓库清理与删除标记写入。
- `global-skin-state`、`texture-resolve`：读取当前皮肤仓库与 stable 回退结果。

## 副作用 / 外部资源
- 修改 `skinImageStore`、`skinFallbackImageStore`、`userReplacedTextures` 和 `deletedSkinTexturePaths`。
- 不记录额外的撤销快照，也不生成图片或直接写磁盘。

## 非功能
- 同步、幂等；同一旧资源重复完成清理不会重新加入删除标记。
- 引用扫描覆盖全部已配置键数、参数别名以及 stable 隐式回退。

## 深度评估
- 调用方只需“准备 -> 替换 -> 完成”三步，无需理解资源所有权、动画帧、@2x 与跨键数引用规则。
- 删除该复合模块后，引用计数和清理顺序会散到已有贴图选择、路径输入和本地上传三个入口，因此保留。

## 复用状态
- implemented
