# comboburst-runtime

**一句话职责：** 在连击达到 100 的整数倍时选择一张替代图，并按 stable 兼容的左右边缘时间线绘制。

## 接口
- `syncComboburstPlayback(combo, keys)` 根据连击增长触发里程碑。
- `triggerComboburstPreview(milestone)` 手动触发 100 / 200 / 300 连击预览。
- `setComboburstPreviewEnabled(enabled)` 控制底栏的编辑器内预览门控，默认关闭；该状态不写入、不导出。
- `drawComboburstEffects(context)` 绘制并回收约 1.4 秒的演出，返回是否仍有活动效果。
- `getComboburstRandomSetting()` 与 `getComboburstStyle(keys)` 暴露当前生效设置。
- **不变量**：`ComboBurstRandom: 0` 顺序轮播，`1` 随机选择；右侧图水平翻转并以对应舞台右边缘为锚点；连击中断后从新一轮里程碑重新计算；预览门控关闭时不触发、不绘制、不消耗轮播索引。

## 输入
- `comboburst-assets` 返回的图片组。
- `[General] ComboBurstRandom`、`[Mania] ComboBurstStyle`、编辑器内预览门控、键数、轨道分段和画布尺寸。
- **前置条件**：当前帧已有有效连击值。

## 输出
- 画布上的连击提示图演出与活动状态。
- **后置条件**：缺失图片时不绘制任何默认替代图。

## 依赖模块
- `comboburst-assets`、`global-skin-state`、`mania-config`、Canvas 2D、effect animation clock。

## 副作用 / 外部资源
- 读取 `performance.now()` 与 `Math.random()`；修改进程内轮播序号和活动效果列表。

## 非功能
- 单个效果约 1.4 秒；允许短暂叠加；暂停时播放效果随特效时钟冻结，手动预览继续播放。

## 深度评估
- 调用方只提交连击数，里程碑、选图、侧别、缩放和时间线都封装在模块内。
- 删除后这些顺序约束会同时散到帧循环、参数预览和图片轮播状态中。

## 复用状态
- implemented
