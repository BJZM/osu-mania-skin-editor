# default-skin-hitsounds

**一句话职责：** 从内置静态资源加载 osu!stable Legacy 默认打击音效，并为目录展示、试听和播放提供可索引的只读数据源。

## 接口

- `ensureDefaultSkinHitsoundsLoaded()`：幂等加载资源清单中的 WAV，返回默认音效目录。
- `getDefaultSkinHitsoundCatalog()`：返回按标准槽位分组的默认目录。
- `getDefaultSkinHitsoundRecord(path)` / `getDefaultSkinHitsoundBytes(path)`：按文件名返回原始字节和 MIME。
- **不变量**：加载成功后路径查找不区分大小写；部分文件失败时保留其余成功资源，并记录一次警告。

## 输入

- `window.DEFAULT_SKIN_HITSOUND_ASSETS`：三套 Legacy 标准音效的根目录文件名清单。
- `assets/default_skin/*.wav`：随桌面版与网页版一同分发的静态音频。
- **前置条件**：应用通过静态 HTTP 服务或同源网页加载。

## 输出

- `Map<groupKey, group>` 默认音效目录，组来源固定为 `default`。
- 每个文件的 `Uint8Array` 字节和 `audio/wav` MIME 类型。
- **后置条件**：不会解码、播放或修改音频；调用方可安全共享同一只读字节。

## 依赖模块

- `default_skin`：提供默认音效文件清单。
- `skin-hitsound-assets`：复用 stable 文件名解析、扩展名优先与目录分组规则。
- HTTP static assets：读取内置 WAV。

## 副作用 / 外部资源

- 发起 12 个同源 GET 请求；使用 `force-cache` 避免同一会话重复下载。
- 加载结果保存在页面内存，不写文件、网络远端或持久化存储。

## 非功能

- 加载调用幂等；并发调用共享同一个 Promise。
- 单个资源失败不阻止其余默认音效使用。
- 目录构建只遍历 12 个固定文件名，成本与音频时长和大小无关。
- 二进制仅在播放或试听需要时交给解码器，不提前解码。

## 深度评估

- 调用方只需要“加载”和“取目录/字节”，无需知道清单格式、请求缓存和部分失败处理。
- 删除该模块会把默认资源 URL、MIME、加载状态与目录构建散到默认工作区、编辑器、播放器和测试中，因此保留。
- 自检结论：这是默认资源 adapter，和现有 ZIP 目录共用 stable 解析规则。

## 复用状态

- implemented
