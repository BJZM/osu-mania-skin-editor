# texture-param-lookup

**一句话职责：** 把一个贴图参数及其别名统一指向当前皮肤中的已有贴图路径。

## 接口
- `normalizeTextureLookupPath(path)` 去掉扩展名、`@2x` 并统一为 `/`。
- `assignTextureParamLookup(keys, p, selectedPath)` 写入当前键位配置、全部参数别名和全局查找表。
- `clearTextureParamLookup(keys, p)` 清理当前键位配置、全部别名及逐轨分键映射，恢复未显式指定的继承默认状态。
- 写入逐轨普通 `KeyImage` 前，如果该轨没有显式 `KeyImageD`，先固定当前实际使用的按下态路径，避免默认皮肤按 stable 回退规则同步换图。
- 返回 `{ path, aliases }`。

## 输入
- `keys`：当前键数。
- `p`：贴图参数定义。
- `selectedPath`：已有贴图路径。
- **前置条件**：`p.key` 是贴图参数，路径非空。

## 输出
- 规范化后的路径和已写入的别名列表。
- **后置条件**：只修改查找映射，不写入图片仓库、不复制导出文件；普通 `KeyImage` 改路径时不会顺带改变独立的按下态来源。

## 依赖模块
- `getActiveKeyCount`、`ensureManiaConfigForKeys`。
- `getTextureParamAliases`。
- `maniaSkinConfigurations`、`globalSkinImageLookups`。

## 副作用 / 外部资源
- 修改当前 `skin.ini` 的内存查找状态。

## 非功能
- 同步、幂等；相同路径重复赋值结果一致。
- 不承担撤销记录和 UI 刷新，由调用方控制。

## 深度评估
- 调用方只需提供目标和路径，即可覆盖通用贴图、逐轨贴图和别名的写入差异。
- 删除后这些映射规则会在上传、路径输入和已有贴图引用间重复，因此保留。

## 复用状态
- implemented
