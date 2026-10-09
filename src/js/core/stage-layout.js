// ============================================================================
// stage-layout.js - 480p 轨道布局计算、宽度上限与数值收敛
// 依赖：canvas / ctx（core/state.js 之前的 core/stage-layout.js 提供基础画布引用）
// ============================================================================

        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const SCALE = 1.5;

        // Canvas 绘制带圆角矩形通用辅助函数 (兼容高版本 ctx.roundRect 与路径回退)
        function roundRect(targetCtx, x, y, width, height, radius = 4) {
            const c = targetCtx || ctx;
            if (!c) return;
            if (width <= 0 || height <= 0) return;
            const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
            c.beginPath();
            if (typeof c.roundRect === 'function') {
                c.roundRect(x, y, width, height, r);
            } else {
                c.moveTo(x + r, y);
                c.arcTo(x + width, y, x + width, y + height, r);
                c.arcTo(x + width, y + height, x, y + height, r);
                c.arcTo(x, y + height, x, y, r);
                c.arcTo(x, y, x + width, y, r);
                c.closePath();
            }
        }

        // ============================================================================
        // osu!mania 轨道区 (Stage) 总宽度限制
        // ----------------------------------------------------------------------------
        // 轨道总宽 = 所有轨道宽度之和 + 相邻轨道间距之和（480p 虚拟像素）。
        //
        // 上限依据（已联网核实，非推测）：
        //   * 官方 wiki（en/zh）的 skin.ini [Mania] 节对这 5 个字段都没有给数值范围，
        //     只有「水平位置以 480 高度为基准」+「逐键数参数给多了忽略、给少了用默认值」。
        //   * 屏幕可用宽度 = 480 × 屏宽 / 屏高，随宽高比变化：
        //     16:9 → 853.3、4:3 → 640、21:9 → 1120、竖屏更小。
        //     （社区标准居中公式：ColumnStart = (480 / (屏高/屏宽)) / 2 − Σ(ColumnWidth)/2）
        //   * osu!stable 的约束是 ColumnStart + 轨道总宽 + ColumnRight ≤ 屏幕宽度，
        //     超限时把舞台「压缩」而不越过 ColumnRight（官方论坛 Skinnable Files List）。
        //     由于 ColumnRight ≥ 0，轨道总宽的上界即「屏幕可用宽度 − ColumnStart」。
        //   * osu!lazer 完全不实现 ColumnStart / ColumnRight（源码中标注为
        //     Unimplemented properties），舞台强制居中、超宽直接溢出；
        //     上游 issue #20252（2022-09 起，priority:1，至今 open）与 #35492 均确认。
        //   * 注意：osu!standard 的 playfield 是 512 × 384 游戏像素，mania 只在
        //     「回放 X 坐标 → 列号」换算里复用它（每列 = 512/n px），与皮肤列宽无关。
        //
        // 因此采用「硬限制 + 提示」：不允许把 ColumnWidth / ColumnSpacing 调到使
        // 轨道总宽超过「画布可用宽度 − ColumnStart」，触达上限即提示用户。
        // ============================================================================
        const MANIA_STAGE_WIDTH_FALLBACK_480 = 853.3; // canvas 尺寸不可用时按 16:9 兜底

        // 画布可用宽度（480p 虚拟像素）= canvas.width / (canvas.height / 480)，随窗口宽高比变化
        function getManiaCanvasWidth480() {
            if (canvas && canvas.height > 0) return canvas.width / (canvas.height / 480);
            return MANIA_STAGE_WIDTH_FALLBACK_480;
        }

        // 轨道总宽的允许上限（480p 虚拟像素）= 画布可用宽度 − ColumnStart。
        // 下限放宽到「每个轨道取最小列宽 5」，避免 ColumnStart 推到极右时约束无法满足。
        function getTrackMaxWidth480(cfg, keys) {
            const startX = (cfg && cfg.ColumnStart != null) ? cfg.ColumnStart : 136;
            const limit = getManiaCanvasWidth480() - startX;
            const floor = (keys && keys > 0) ? keys * 5 : 20;
            return Math.max(floor, limit);
        }

        // 轨道区总宽度（480p 虚拟像素）：各轨列宽之和 + 相邻轨道之间的间距之和。
        // stable / lazer 的 ColumnSpacing 固定为 keys - 1 项，不包含轨道区右侧留白。
        function computeTrackBlockWidth480(cfg, keys) {
            if (!cfg || !keys || keys <= 0) return 0;
            let total = 0;
            for (let i = 0; i < keys; i++) {
                const w = (cfg.ColumnWidth && cfg.ColumnWidth[i] > 0) ? cfg.ColumnWidth[i] : 30;
                total += w;
            }
            for (let i = 0; i < keys - 1; i++) {
                const s = (cfg.ColumnSpacing && cfg.ColumnSpacing[i] != null) ? cfg.ColumnSpacing[i] : 0;
                total += s;
            }
            return total;
        }

        // 双舞台模式下，两组舞台之间的分隔位于该轨道下标之后。
        // 奇数键位时左侧多一轨（例如 7K = 4 + 3）。
        function getManiaStageSplitAfter(keys) {
            return (keys && keys > 1) ? (Math.ceil(keys / 2) - 1) : -1;
        }

        function isManiaSplitStagesEnabled(cfg, keys) {
            if (!cfg || !keys || keys <= 1) return false;
            const value = cfg.SplitStages;
            return value === true || value === 1 || value === '1';
        }

        // 在「其余项保持不变」的前提下，某个轨道布局参数允许取到的最大值。
        // paramKey: 'ColumnWidth' | 'ColumnSpacing'
        // paramIndex: 目标下标；ColumnSpacing 的有效下标为 0..keys-2。
        function getTrackParamUpperBound(cfg, keys, paramKey, paramIndex) {
            const limit = getTrackMaxWidth480(cfg, keys);
            let self = 0;
            if (paramKey === 'ColumnWidth') {
                self = (cfg.ColumnWidth && cfg.ColumnWidth[paramIndex] > 0) ? cfg.ColumnWidth[paramIndex] : 30;
            } else if (paramKey === 'ColumnSpacing') {
                self = (cfg.ColumnSpacing && cfg.ColumnSpacing[paramIndex] != null) ? cfg.ColumnSpacing[paramIndex] : 0;
            }
            const othersWidth = computeTrackBlockWidth480(cfg, keys) - self;
            return {
                limit: limit,
                othersWidth: othersWidth,
                maxAllowed: limit - othersWidth
            };
        }

        // 校验并收敛一组轨道布局数值，使其总宽度不超过上限。
        // paramKey:     'ColumnWidth' | 'ColumnSpacing'
        // candidate:    待写入的数组（ColumnWidth 按 keys、ColumnSpacing 按 keys - 1 对齐；缺失项取原值/默认值）
        // changedIndex: 用户本次直接改动的下标；传 null 表示整组数值被一次性替换
        // 返回 { values, total, limit, overflow, clamped, rejected }
        //   values === null  → 整组替换超限，未采纳（调用方应保留原值）
        //   clamped === true → 仅被直接改动的那一项被收敛到上限
        function clampTrackLayoutArray(cfg, keys, paramKey, candidate, changedIndex) {
            const limit = getTrackMaxWidth480(cfg, keys);
            const isWidth = (paramKey === 'ColumnWidth');
            const minVal = isWidth ? 5 : 0;
            const defaultVal = isWidth ? 30 : 0;

            const current = (cfg && Array.isArray(cfg[paramKey])) ? cfg[paramKey].slice() : [];
            const src = Array.isArray(candidate) ? candidate : [];
            const valueCount = isWidth ? keys : Math.max(0, keys - 1);
            const values = new Array(valueCount);
            for (let i = 0; i < valueCount; i++) {
                const raw = (src[i] != null) ? Number(src[i]) : (current[i] != null ? Number(current[i]) : defaultVal);
                values[i] = isNaN(raw) ? defaultVal : raw;
            }

            // 参与总宽度计算的下标数量：列宽全部参与；列间距固定 keys-1 项。
            const countedCount = valueCount;

            // 另一项参数当前占用的宽度
            let othersWidth = 0;
            if (isWidth) {
                for (let i = 0; i < keys - 1; i++) {
                    const s = (cfg.ColumnSpacing && cfg.ColumnSpacing[i] != null) ? cfg.ColumnSpacing[i] : 0;
                    othersWidth += s;
                }
            } else {
                for (let i = 0; i < keys; i++) {
                    const w = (cfg.ColumnWidth && cfg.ColumnWidth[i] > 0) ? cfg.ColumnWidth[i] : 30;
                    othersWidth += w;
                }
            }

            const budget = limit - othersWidth;
            let sumValues = 0;
            for (let i = 0; i < countedCount; i++) sumValues += values[i];

            if (sumValues <= budget) {
                return { values: values, total: othersWidth + sumValues, limit: limit, overflow: false, clamped: false, rejected: false };
            }

            if (changedIndex != null && changedIndex >= 0 && changedIndex < countedCount) {
                // 只收敛被直接改动的那一项，其余轨道保持用户设定
                const othersSum = sumValues - values[changedIndex];
                const room = budget - othersSum;
                if (room >= minVal) {
                    // 收敛到整数像素（画布拖拽 / ± 按钮 / 输入框都按整数像素处理）
                    values[changedIndex] = Math.min(values[changedIndex], Math.floor(room));
                    return {
                        values: values,
                        total: othersWidth + othersSum + values[changedIndex],
                        limit: limit,
                        overflow: false,
                        clamped: true,
                        rejected: false
                    };
                }
            }

            // 整组替换超限（或即便收敛到最小值仍放不下）→ 不予采纳，保留原值
            return { values: null, total: othersWidth + sumValues, limit: limit, overflow: true, clamped: false, rejected: true };
        }

        let currentOszZip = null;
