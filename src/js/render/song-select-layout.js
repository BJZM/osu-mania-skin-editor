// osu!stable 选歌界面的几何。
// 轮盘水平偏移沿用 stable 的大圆：xpos = sqrt(r^2 - mid^2) - r + 50*scale，r = 700*scale。
// 卡片尺寸用 menu-button-background 的 SD 像素（@2x 先折半），不再拉到窗口宽度。
// 缩略图距左边 9px、115x85。底栏按钮槽高 90。轮盘铺到顶栏底下，页眉是后画的覆盖层。
(function (window) {
    'use strict';

    function metrics(width, height, panelSd) {
        const s = height / 768;
        const panelH = ((panelSd && panelSd.h) || 85) * s;
        const panelW = ((panelSd && panelSd.w) || 690) * s;
        // 外层阴影导致的透明留白不撑开行距，保持稳定约 85~90 SD 的紧凑轮盘节距
        const rowH = Math.min(panelH, 90 * s);
        const footerH = 90 * s;
        const curvePad = 50 * s;
        return {
            s: s,
            panelH: panelH,
            rowH: rowH,
            panelW: panelW,
            footerH: footerH,
            headerH: 78 * s,
            circleR: 700 * s,
            curvePad: curvePad,
            hoverShift: 30 * s,
            expandShift: panelW * 0.12,
            selectShift: 18 * s,
            gap: 4 * s,
            groupH: 34 * s,
            carouselTop: 0,
            carouselBottom: height - footerH,
            anchorX: width - panelW * 0.88 + curvePad,
            wedgeW: Math.min(480 * s, width * 0.4),
            wedgeH: 132 * s,
            thumbInset: 9 * s,
            thumbW: 115 * s,
            thumbH: 85 * s
        };
    }

    function panelLeft(m, itemCenterY, flags) {
        const mid = (m.carouselTop + m.carouselBottom) / 2 - itemCenterY;
        const radius = m.circleR;
        const inside = radius * radius - mid * mid;
        const curve = (inside > 0 ? Math.sqrt(inside) : 0) - radius + m.curvePad;
        let left = m.anchorX - curve;
        if (flags && flags.expandedMember) left -= m.expandShift;
        if (flags && flags.selected) left -= m.selectShift;
        if (flags && flags.hover && !flags.selected) left -= m.hoverShift;
        return left;
    }

    function placeRows(rows, scrollIndex, m) {
        const cardH = m.rowH || m.panelH;
        const heights = rows.map(function (row) {
            return (row.kind === 'group' || row.kind === 'empty') ? m.groupH : cardH;
        });
        const prefix = [];
        let acc = 0;
        for (let i = 0; i < rows.length; i++) {
            prefix.push(acc);
            acc += heights[i] + m.gap;
        }
        const last = Math.max(0, rows.length - 1);
        const index = Math.max(0, Math.min(last, scrollIndex));
        const i0 = Math.floor(index);
        const frac = index - i0;
        const h0 = heights[i0] || 0;
        const origin = (prefix[i0] || 0) + frac * (h0 + m.gap) + h0 / 2;
        const center = (m.carouselTop + m.carouselBottom) / 2;
        return rows.map(function (row, i) {
            return {
                row: row,
                index: i,
                y: center - origin + prefix[i],
                h: heights[i]
            };
        });
    }

    window.SongSelectLayout = {
        metrics: metrics,
        panelLeft: panelLeft,
        placeRows: placeRows
    };
})(window);
