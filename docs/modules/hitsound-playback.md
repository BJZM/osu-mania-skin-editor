# hitsound-playback

**一句话职责：** 将谱面 note 的 hitSample 与 timing point 音效设置解析为实际音频资源，预解码并通过 Web Audio 按效果音量混播。

## 接口

- `prepareManiaHitsoundPlayback()`：根据当前谱面、timing points、activeNotes、谱面 ZIP 与皮肤 ZIP 重建样本引用并解码。
- `playManiaHitSound(note, currentTime, startAtContextTime)`：播放一个 note 已解析的 hitnormal/additions，返回启动的音频源数量。传入音频上下文时间时按该时刻开播。
- `scheduleManiaHitsounds(currentTimeMs)`：播放中按歌曲时钟提前排程，并用 `AudioContext.outputLatency` 抵消输出延迟，使音效到达扬声器时音符落到判定线。
- `reconcileManiaHitsoundCues(currentTimeMs)`：暂停、拖动进度或跳转后停掉已排程音效，并按新时间重记哪些音符已经错过。
- `resumeManiaHitsoundPlayback()` / `stopActiveManiaHitsounds()`：跟随歌曲播放与暂停。
- `syncManiaHitsoundVolume()`：同步独立音效音量与静音状态。
- `disposeManiaHitsoundPlayback()`：切换谱面时释放缓冲区并停止残留音频。
- `getManiaHitsoundDebugSnapshot()`：返回预解码和播放计数，不参与产品界面。

## 输入

- `activeNotes`：包含 startTime、hitSound 与解析后的 hitSample。
- `currentTimingPoints`：包含 sampleSet、sampleIndex 与 volume。
- `currentOszZip`、`currentSkinZip`、`skinHitsoundCatalog` 与默认打击音效目录。
- 皮肤音效文件可来自 `hitsound-editor` 的虚拟替换字节；播放缓存键仍指向覆盖后的稳定路径。
- **前置条件**：谱面已解析；皮肤可以尚未导入，此时只解析谱面自带采样。

## 输出

- note 上写入 `hitsoundSampleRefs`，每个引用包含来源、路径、音效名和 note 音量；来源可为 `beatmap`、`skin`、`replacement` 或 `default`。
- **回退顺序**：对每个标准音效候选名依次查找谱面、当前皮肤、Legacy 默认皮肤；因此当前皮肤缺少某个文件时会继续使用默认音效。
- **后置条件**：同一时刻的多个 note 独立创建音频源并自然混音；暂停、结束或拖动进度后不会留下已排程的尾音。播放中会提前约一个输出延迟排程，音效与判定线对齐。暂停期间只补播已经落到当前时间、且迟到不超过 100ms 的 note；更早的 note 标记为已处理但不补播。

## 依赖模块

- `skin-hitsound-assets`：提供皮肤音效文件与扩展名优先结果。
- `default-skin-hitsounds`：提供 Legacy 默认音效目录、二进制与 `default` 来源。
- `hitsound-editor`：提供可撤回的皮肤音效替换字节，并在替换后触发缓冲区重建。
- `beatmap-format`：提供 hitSound 与 hitSample。
- `zip-timing`：提供 sampleset、custom index 与 timing volume。
- `transport`：提供独立效果音量与静音状态。
- Web Audio API：解码与混播。

## 副作用 / 外部资源

- 创建浏览器 `AudioContext`、GainNode 与 BufferSource。
- 读取 ZIP 或内置默认音效的 WAV/MP3/OGG 字节并解码到内存。
- 不修改谱面、皮肤、ZIP 或持久化状态。

## 非功能

- 只解码谱面实际引用到的唯一音频文件，不加载整张谱面音频目录。
- 同一路径缓冲只解码一次；切换难度时清空。
- 音频源短于数秒，结束自动从活动集合移除。
- AudioContext 不可用或单个文件损坏时安全静默，不阻断谱面播放。

## 深度评估

- 调用方只需在 note 首次跨过判定线时传入 note；资源优先级、timing 继承、音量与多音混播均被隐藏。
- 删除该模块会把 hitSample 分发、ZIP 解析、缓冲区缓存和 Web Audio 节点生命周期散到导入、播放循环与暂停逻辑。
- 复合模块通过复合删测：至少被谱面加载、皮肤切换、播放、暂停和音量控制五处编排使用。

## 复用状态

- implemented
