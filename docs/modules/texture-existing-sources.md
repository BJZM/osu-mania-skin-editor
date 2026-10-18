# texture-existing-sources

**一句话职责：** 把当前皮肤图片仓库转换成可搜索、可预览的已有贴图候选列表。

## 接口
- `collectExistingTextureSources(storeMap = skinImageStore, zip = currentSkinZip)` 返回按路径稳定排序的资源数组。
- `filterExistingTextureSources(sources, query)` 按完整路径或文件名过滤候选。
- 资源包含 `path`、`basename`、`image`、`frames`、尺寸、`is2x`、`isAnimation`。

## 输入
- `storeMap`：皮肤图片仓库 Map。
- `zip`：当前皮肤压缩包，用于恢复原始路径大小写；可为空。
- **前置条件**：皮肤资源已解析并存入 `skinImageStore`。

## 输出
- 去重后的贴图候选列表；动画只保留 base 条目，帧条目不重复显示。
- **后置条件**：不修改图片仓库、压缩包或 skin.ini。

## 依赖模块
- `normalizeSkinKey`、`resolveEntryFrames`、`resolveEntrySingle` 资源接口。
- `skinImageStore`、`currentSkinZip` 全局皮肤状态。

## 副作用 / 外部资源
- 只读取内存中的图片对象和 JSZip 文件表。

## 非功能
- 线性枚举当前皮肤资源；同一列表重复过滤不重新读取图片。
- 无网络、无文件写入、幂等。

## 深度评估
- 接口窄，调用方无需理解精确路径、回退仓库和动画帧存储细节。
- 删除后路径恢复、动画去重和稳定排序会散到选择弹窗中，因此保留。

## 复用状态
- implemented
