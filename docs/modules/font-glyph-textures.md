# font-glyph-textures

**一句话职责：** 把 ScorePrefix / ComboPrefix 解析为可导入、引用、编辑和保存的逐字形贴图目标。

## 接口
- `buildFontGlyphTextureParams(keys)`：生成 score 与 combo 的 0-9、小数点、百分号虚拟贴图参数。
- `resolveFontGlyphTextureParam(keys, p)` / `resolveFontGlyphTextureFrames(keys, p)`：按有效字体前缀解析预览与编辑源。
- `applyExistingTextureToFontGlyph(p, path, keys)`：从已有字形贴图反推前缀，或在无法反推时复制到当前字形目标路径。
- **不变量**：score 路径只由 ScorePrefix 决定；combo 路径只由有效 ComboPrefix（含 FontCombo 优先级）决定；未显式指定 combo 时与 score 共用。

## 输入
- 当前键数、`skinFontsConfig`、`[Mania]` 的 FontScore / FontCombo。
- 虚拟贴图参数中的字体组、字符与目标路径。
- **前置条件**：皮肤编辑工作区已就绪，字体解析函数已加载。

## 输出
- 带 `_fontGlyph` 元数据的贴图参数，以及 `{ img, name, state }` 字形解析结果。
- **后置条件**：贴图页显示的目标文件路径始终来自对应字体前缀，不依赖 score 与 combo 是否共享。
- 详细设置中的字形卡提供与贴图页一致的 `1x`、`@2x`、从已有贴图导入下拉菜单。

## 依赖模块
- `render/fonts.js` 的 `getSkinFontImage` 接口。
- `skin/mania-config.js` 的 `getManiaConfigForKeys` 与 `getExplicitComboFontPrefix`。
- `texture-upload` 的编辑图片应用接口。

## 副作用 / 外部资源
- 应用已有贴图时可生成 PNG 画布、读取贴图仓库、写入替换贴图层并记录撤回快照。
- 前缀反推通过 `updateSkinParam` 更新 ScorePrefix / ComboPrefix。

## 非功能
- 字形列表固定为 score 12 项、combo 10 项。
- 路径解析为同步操作；复制已有图片仅在无法反推前缀时异步发生。

## 深度评估
- 贴图页、详细设置和图片编辑器只消费虚拟参数，无需各自重复实现字体前缀拼接。
- 删除该模块后，前缀解析、字形路径和已有贴图适配会散到至少三个调用方，因此保留。

## 复用状态
- implemented
