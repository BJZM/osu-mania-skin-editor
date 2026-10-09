---
name: osu-web-ui-design
description: Comprehensive UI/UX design system and frontend styling guidelines based on the official osu! website (osu.ppy.sh) and osu!next design language. Use when designing, building, or styling web applications, dashboards, or gaming interfaces with osu!'s rhythmic dark aesthetic.
---

# osu! Web UI/UX Design System Skill (osu!next)

> 本 Skill 全面解析并提炼了 [osu.ppy.sh](https://osu.ppy.sh/)（ppy/osu-web）官方全站（主页、谱面列表、谱面详情、排行榜、个人主页、社区论坛、更新日志、Wiki、支持者商店等）的 UI/UX 设计语言、动态色相系统（Hue System）、设计令牌（Design Tokens）、排版规范、组件模式与微交互细节。

---

## 1. 核心设计哲学 (Design Philosophy)

1. **Rhythm & Game Feel in Web Form（将节奏游戏体验融入网页）**
   - **圆润与几何（Soft Geometric）**：以圆（Hit Circle）和圆角矩形为基础形状语言，弱化生硬锐角。
   - **高对比度深色模式（Dark-First Modernism）**：拒绝死黑（#000），使用带有微妙色相倾向的深邃紫灰/暗蓝，搭配高饱和度霓虹点缀色。
   - **层级浮现（Tonal Layering over Heavy Shadows）**：主要依靠表面色阶（Surface Elevation）明度差异来构建空间层级，辅以微弱内发光与边框线，极少使用笨重的纯黑投影。

2. **动态色相系统（Dynamic Base-Hue System）**
   - osu-web 的灵魂机制：**页面主色相并非写死，而是由当前模块决定**。
   - 整个页面的背景色阶、卡片表面、边框色均通过 HSL 相对计算。切换模块时，整个界面的微弱底色会随之改变，既统一又有分区辨识度。

---

## 2. 色彩系统与设计令牌 (Color System & Tokens)

### 2.1 各板块与模式的主题色相 (Section & Mode Hues)

| 页面 / 模块 | Base Hue (° / deg) | 主题基调色描述 | 代表性主色/强调色 |
| :--- | :--- | :--- | :--- |
| **osu! 主模式 (Standard)** | `330°` | 标志性粉色 (osu! Pink) | `#ff66aa` / `#e2609a` |
| **osu!taiko (太鼓)** | `140°` | 活力翠绿 (Taiko Green) | `#00ca51` / `#22b14c` |
| **osu!catch (接水果)** | `200°` | 清爽天蓝 (Catch Blue) | `#008be3` / `#00b0ff` |
| **osu!mania (琴键)** | `285°` | 电音紫粉 (Mania Purple) | `#9c27b0` / `#a23cd1` |
| **首页 (Home / Dashboard)** | `255°` | 经典深邃紫蓝灰 | `#615c70` / `#2a2238` |
| **谱面列表 (Beatmapsets)** | `210°` | 科技冰蓝 | `#2e4359` / `#387ebd` |
| **排行榜 (Rankings)** | `45°` | 荣耀金橙 | `#e6a23c` / `#e5b42d` |
| **社区/论坛 (Community)** | `340°` | 温暖粉红 | `#693b4a` / `#b84f70` |
| **Wiki / 帮助** | `220°` | 沉稳钢蓝 | `#3b4d66` / `#4a709c` |

### 2.2 表面与层次色阶 (CSS HSL Variables)

```css
:root {
  /* 当前页面色相 (默认 255 为首页深紫蓝，各子页面按需重写) */
  --base-hue: 255;

  /* 背景与表面层次 (Surface Hierarchy) */
  --osu-bg-darkest: hsl(var(--base-hue), 16%, 8%);     /* 极深背景/侧边栏: #121016 */
  --osu-bg-base:    hsl(var(--base-hue), 16%, 12%);    /* 页面基底 Canvas: #1b1921 */
  --osu-surface-1:  hsl(var(--base-hue), 18%, 18%);    /* 卡片底板 Card: #292433 */
  --osu-surface-2:  hsl(var(--base-hue), 20%, 23%);    /* 浮起层/悬停: #362f43 */
  --osu-surface-3:  hsl(var(--base-hue), 22%, 28%);    /* 弹窗/输入框: #433a54 */

  /* 边框与分割线 */
  --osu-border-subtle:  hsla(var(--base-hue), 20%, 35%, 0.25);
  --osu-border-medium:  hsla(var(--base-hue), 25%, 45%, 0.4);
  --osu-border-focus:   #ff66aa;

  /* 文字对比度规范 */
  --osu-text-primary:   #ffffff;                       /* 主标题与关键指标: 100% */
  --osu-text-secondary: hsl(var(--base-hue), 12%, 80%);/* 正文与副标签: #c6c2cd */
  --osu-text-muted:     hsl(var(--base-hue), 10%, 58%);/* 描述与未激活状态: #8e8998 */
  --osu-text-dimmed:    hsl(var(--base-hue), 10%, 40%);/* 占位符/禁用文本: #625e6a */

  /* 功能点缀色 (Basic Palette - 保持常量，不受 Base Hue 影响) */
  --osu-pink:           #ff66aa;                       /* osu! 标志粉 / Supporter 心形 */
  --osu-blue:           #008be3;                       /* 下载 / 链接 / Qualified */
  --osu-cyan:           #00c3e3;                       /* 正常 Ranked 状态 */
  --osu-green:          #53d987;                       /* 成功 / 在线 / 准确度高 */
  --osu-yellow:         #f1c40f;                       /* 警告 / Pending 状态 */
  --osu-red:            #ff4646;                       /* 危险 / 失败 / 错误 */
  --osu-graveyard:      #7c778a;                       /* 墓地谱面灰 */
}
```

### 2.3 难度星级色彩阶梯 (Difficulty Star Rating Spectrum)

osu! 著名的星级渐变条和难度星级颜色：
- **Easy (0.00★ - 1.99★)**: 浅青蓝 `#4fc0ff`
- **Normal (2.00★ - 2.69★)**: 浅绿 `#4fffa3`
- **Hard (2.70★ - 3.99★)**: 明黄 `#ffdf4f`
- **Insane (4.00★ - 5.29★)**: 暖橙 `#ff7a4f`
- **Expert (5.30★ - 6.49★)**: 玫红/洋红 `#ff4f7a`
- **Master (6.50★ - 7.99★)**: 妖艳深紫 `#a64fff`
- **Expert+ / Grandmaster (8.00★+)**: 暗黑金/黑曜紫带有高亮霓虹边框 `#2b1b47`

### 2.4 评级 (Grade) 视觉标识
- **SS / Silver SS**: 白金渐变与金光描边（银金高贵）
- **S / Silver S**: 辉煌亮金色 / 银白色
- **A**: 柔和翠绿 `#22b14c`
- **B**: 活力亮蓝 `#209bee`
- **C**: 醒目紫罗兰 `#b245dd`
- **D**: 警示亮红 `#e53935`

---

## 3. 字体与排版标准 (Typography)

### 3.1 字体栈
```css
font-family: Torus, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```
- **Torus 特性**：具有轻微圆角末端（Soft Terminals）的几何非衬线体，既保证现代数码科技感，又带有亲和、灵动的街机美学。
- **数字显示**：统计数据（PP、Combo、Rank、BPM、时长）必须开启等宽数字对齐：
  ```css
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  ```

### 3.2 字体字阶与字重
- **超大英雄标题 (Hero / Stat Big)**: `36px` - `48px`, Weight 700 / 800, 行高 `1.1`
- **模块主标题 (Section H1/H2)**: `22px` - `26px`, Weight 600, 常搭配前置 FontAwesome 图标
- **卡片标题 (Card Title)**: `15px` - `16px`, Weight 600, 支持单行文字溢出省略（`text-overflow: ellipsis`）
- **常规正文 (Body)**: `13px` - `14px`, Weight 400, 行高 `1.5`
- **微型标签/徽章 (Badges/Caps)**: `10px` - `11px`, Weight 700, `text-transform: uppercase`, `letter-spacing: 0.06em`

---

## 4. 全站核心子页面 UI 结构与布局模式

### 4.1 全局双层导航栏 (Global Dual Navbar)
- **第一层（主导航）**：
  - 左侧：圆形粉色 osu! Logo（带有脉冲/旋转悬停态）。
  - 中部：一级频道选项卡（`home`, `beatmaps`, `rankings`, `community`, `wiki`, `store`）。
  - 右侧：全站搜索胶囊框（带快捷键提示 `Ctrl+K`）、消息提醒铃铛、用户头像胶囊（登录态显示头像+等级环，未登录显示 Guest 登录/注册按钮）。
- **第二层（二级子导航 / Sub-navbar）**：
  - 位于主导航下方，背景色更深或半透明。
  - 显示子板块分类，例如 Beatmaps 下为：`listing`, `favourites`, `packs`, `spotlights`。
  - 当前激活项底部带有一个平滑过渡的高亮色横条或胶囊发光底座。

### 4.2 谱面列表页 (`/beatmapsets`)
- **多维度筛选头（Filter Bar）**：
  - 模式切换四连胶囊：`osu!` (标准粉), `taiko` (鼓绿), `catch` (果蓝), `mania` (琴紫)。
  - 状态筛选排：`Ranked`, `Qualified`, `Loved`, `Pending`, `Graveyard`，采用互斥或多选按钮组。
  - 难度星级双滑块（Range Slider）与精准数字输入。
- **谱面卡片（Beatmap Card - Grid / List）**：
  - **背景图像遮罩**：卡片右侧或整张卡片使用曲绘（Cover），叠加左深右透的黑紫色渐变遮罩。
  - **试听按钮（Audio Preview）**：圆环播放按钮，点击后边框呈现顺时针圆环进度条（Circular Progress Ring）。
  - **难度小图标排（Difficulty Icons Bar）**：一系列微型小圆点/模式图标，颜色严格映射对应难度的 Star Rating 阶梯色。
  - **数据指标槽**：心形喜欢数、播放总数、BPM、时长、Mapper 链接。

### 4.3 谱面详情页 (`/beatmapsets/:id`)
- **巨幕封面（Cover Hero Banner）**：
  - 模糊全宽背景 + 居中清晰封面卡片。
  - 超大醒目操作区：巨大的“Download”（带文件大小）与“osu!direct”按钮。
  - Hype / 提名进度条（Beatmap Nomination Progress）。
- **难度切换栏（Difficulty Tabs）**：
  - 顶部横向滚动药丸按钮，每个按钮标明难度名称及对应星级色标。
- **属性条（Attributes Bars）**：
  - CS (圈大小), AR (缩圈速度), OD (准度判定), HP (掉血率), Stars, BPM。
  - 采用半透明暗色背景条 + 亮色填充条展示。
- **榜单积分榜（Leaderboard Table）**：
  - 分类切换：`Global`, `Friend`, `Country`, `Selected Mods`。
  - 紧凑行排版：Rank 勋章（1~3 名为金银铜底）、评级大图标（SS/S/A）、玩家国旗+头像、总分、Accuracy、Max Combo、300/100/50 判定细节、生效 Mod 图标组（HD, HR, DT 等）。

### 4.4 个人主页 (`/users/:id`)
- **顶部档案巨幕（Profile Cover）**：
  - 用户的自定义大横幅，左下角叠加大头像（圆角矩形，边角 6px 或圆环，右下角带在线状态绿点）。
  - 用户名右侧配 Supporter 粉红心形图标（按赞助年限显示小红心个数）、国旗徽章、职位徽章（如 Dev, GMT, NAT, Elite Mapper）。
- **段位与全球排名称号卡（Global Rank / Country Rank）**：
  - 巨大的数字与全球排名，并列展示 90 天历史排位折线趋势图（SVG 曲线平滑面积图）。
- **Tab 栏与多模块面板**：
  - `General`: 游玩时间、总打击数、等级进度条（Level xx% 条）。
  - `Top Ranks`: Best Performance（最好成绩列表，展示权重计算如 `100% -> 420pp`, `95% -> 390pp`）。
  - `Historical`: 每月游玩次数柱状图、回放观看数。
  - `Beatmapsets`: 玩家自己作图/客串图/收藏图列表。
  - `Me!` 模块：BBCode / Markdown 自定义个人签名介绍卡。

### 4.5 排行榜页 (`/rankings`)
- **极度高密度的数据表格（Dense Leaderboards）**：
  - 奇偶行微妙色阶区分（Zebra striping），悬停时整行升亮（`--osu-surface-2`）。
  - 当前登录用户固定在底部悬浮条或在表格中以亮色边框高亮。
  - 增减排名指示器：绿色向上小三角（↑ 3）或红色向下小三角（↓ 1）。

### 4.6 社区与论坛 (`/community/forums`)
- **板块卡片网格**：各版块带有专属图标、主题数、发帖数、最后发帖人头像与时间戳。
- **帖子详情（Topic View）**：
  - 左侧：经典竖向用户身份卡（头像、头衔、注册日期、帖子数、位置、Kudosu 数量）。
  - 右侧：富文本帖子内容、引用框（Quote Block 带有左侧粗粉边框与深色衬底）、签名栏分割线。

---

## 5. UI 组件与微交互规格 (Components & Micro-interactions)

### 5.1 圆角体系 (Border Radii)
- **微型标签 / 徽章**：`border-radius: 4px;`
- **卡片 / 容器 / 头像**：`border-radius: 8px;` ~ `10px;`
- **操作按钮 / 搜索框 / Mod 胶囊**：`border-radius: 9999px;` (全圆角 Pill)
- **小头像**：`border-radius: 50%;` 或 `border-radius: 6px;`

### 5.2 核心按钮样式 (Buttons)
```css
/* 经典 osu! 大操作胶囊按钮 */
.osu-btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: 9999px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #ffffff;
  background: linear-gradient(135deg, #ff66aa 0%, #d83d81 100%);
  border: none;
  box-shadow: 0 4px 15px rgba(255, 102, 170, 0.35);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.osu-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 102, 170, 0.55);
  filter: brightness(1.08);
}

.osu-btn-primary:active {
  transform: translateY(1px);
  filter: brightness(0.95);
}

/* 次级半透明按钮 */
.osu-btn-secondary {
  background: hsla(var(--base-hue), 20%, 25%, 0.6);
  border: 1px solid hsla(var(--base-hue), 30%, 40%, 0.4);
  color: var(--osu-text-primary);
  backdrop-filter: blur(8px);
}
.osu-btn-secondary:hover {
  background: hsla(var(--base-hue), 25%, 32%, 0.8);
  border-color: var(--osu-pink);
}
```

### 5.3 游戏 Mod 图标样式 (Mod Pills)
osu! 中的 Mod（如 HD - Hidden, HR - HardRock, DT - DoubleTime）表现为特制的圆角小牌：
```css
.osu-mod-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 22px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
  background: #1e1b26;
  border: 1px solid #4a445a;
  color: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}
/* Mod 特殊强调色 */
.osu-mod-badge.mod-dt { border-color: #9c27b0; color: #e1bee7; }
.osu-mod-badge.mod-hr { border-color: #e53935; color: #ffcdd2; }
.osu-mod-badge.mod-hd { border-color: #fbc02d; color: #fff9c4; }
.osu-mod-badge.mod-fl { border-color: #00acc1; color: #b2ebf2; }
```

### 5.4 谱面卡片 HTML/CSS 结构范例
```html
<div class="osu-beatmap-card">
  <!-- 曲绘背景与渐变层 -->
  <div class="card-cover" style="background-image: url('cover.jpg');">
    <div class="card-cover-overlay"></div>
  </div>

  <!-- 试听按钮 -->
  <button class="audio-preview-btn" aria-label="Play Preview">
    <svg class="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
    <svg class="progress-ring" viewBox="0 0 40 40">
      <circle class="ring-bg" cx="20" cy="20" r="18" />
      <circle class="ring-bar" cx="20" cy="20" r="18" />
    </svg>
  </button>

  <!-- 卡片内容 -->
  <div class="card-content">
    <div class="card-header">
      <h3 class="song-title">Kuu ni Naru</h3>
      <span class="song-artist">MIMI feat. Hatsune Miku</span>
    </div>
    
    <div class="card-footer">
      <span class="mapper-name">mapped by <strong>peppy</strong></span>
      
      <!-- 难度点点组 -->
      <div class="diff-spectrum">
        <span class="diff-pip" style="--pip-color: #4fc0ff;" title="Easy 1.5★"></span>
        <span class="diff-pip" style="--pip-color: #4fffa3;" title="Normal 2.3★"></span>
        <span class="diff-pip" style="--pip-color: #ffdf4f;" title="Hard 3.6★"></span>
        <span class="diff-pip" style="--pip-color: #ff4f7a;" title="Expert 5.8★"></span>
      </div>
    </div>
  </div>
</div>
```

---

## 6. 设计实战检查清单 (osu! UI Checklist)

在实现 osu! 风格前端时，逐项核对以确保纯正的 osu!next 体验：

1. [ ] **底色拒绝纯灰**：深色背景必须带有基底色相微调（推荐 HSL 饱和度 15%~20%，明度 8%~14%）。
2. [ ] **圆角克制而统一**：大操作按钮用 9999px 全圆角，内容卡片用 8px~10px，小标签用 4px。
3. [ ] **数据指标高亮**：PP、Combo、Score、Rank 使用高亮白色或模式专属主题色，配以等宽数字。
4. [ ] **曲绘渐变融合**：展示背景图时，叠加从纯深色（左侧）到半透明（右侧）的横向渐变遮罩，确保文字可读性。
5. [ ] **微交互灵动响应**：按钮和可点击卡片悬停时应有 `translateY(-2px)` 微移、轻度提亮和外发光扩散。
6. [ ] **难度色阶准确**：若包含评级或难度，遵照 Cyan -> Green -> Yellow -> Orange -> Magenta -> Purple 的经典光谱。
