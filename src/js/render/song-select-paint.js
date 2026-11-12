// 绘制 osu!stable 选歌界面。
// 贴图谁和谁是一张图、谁盖住谁，对照了默认皮肤和会整页替换选谱界面的皮肤（白聖女、sample）：
//   menu-button-background 是整张谱面卡片，乘色。缩略图、文字、star、评价是客户端画在卡片上的。
//   songselect-top / songselect-bottom 各是一整条顶栏、底栏。没有这两张图时，用矢量楔形和黑条。
//   selection-mode 平时只是 Mode 按钮；皮肤可以把它做成从左下角长出去的整页外框。
//   selection-mods / random / options 是独立按钮。悬停时 -over 叠在原按钮上，不替换整页外框。
//   mode-mania-small 是 Mode 按钮上的键位图标（加法）。皮肤会把这张图撑满，用来盖住顶栏。
//   menu-snow 作为飘落粒子（雪花/花瓣）替代 star2 飘星，不覆盖 mode-mania-small。
//   mode-mania 是画面中央随 BPM 闪的加法层，在卡片后面。
//   star2 是向左飘的星星，star 只用于难度星。
// 从后往前：背景、模式闪光、飘星、轮盘、楔形或 songselect-top、底条或 songselect-bottom、
// menu-back、四个 selection 按钮、模式图标、信息文字和页眉。文字最后画，避免被外框盖住。
(function (window) {
    'use strict';

    const TINT = {
        pink: 'rgb(235, 73, 153)',
        orange: 'rgb(233, 104, 0)',
        blue: 'rgb(0, 150, 236)',
        white: 'rgb(255, 255, 255)',
        group: 'rgb(88, 108, 138)'
    };

    const TABS = [
        { id: 'none', fill: '#ffffff', text: '#222222' },
        { id: 'difficulty', fill: '#f2c14b', text: '#222222' },
        { id: 'artist', fill: '#ef7d1a', text: '#ffffff' },
        { id: 'recent', fill: '#d0123a', text: '#ffffff' },
        { id: 'collections', fill: '#e35696', text: '#ffffff' }
    ];

    const FOOTER = [
        { id: 'mode', name: 'selection-mode', w: 92 },
        { id: 'mods', name: 'selection-mods', w: 77 },
        { id: 'random', name: 'selection-random', w: 77 },
        { id: 'options', name: 'selection-options', w: 77 }
    ];

    const tintCache = new Map();
    const blankCache = new WeakMap();
    const darkTexCache = new WeakMap();
    const texIds = new WeakMap();
    let nextTexId = 1;
    let flyers = [];

    function sourceKey(source) {
        if (!source) return 'flat';
        if (source.src) return source.src;
        let id = texIds.get(source);
        if (!id) {
            id = nextTexId++;
            texIds.set(source, id);
        }
        return 'tex#' + id;
    }

    function probePixels(image, maxDim) {
        if (!image || !image.complete || !(image.width > 0) || !(image.height > 0)) return null;
        try {
            const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
            const cw = Math.max(1, Math.round(image.width * scale));
            const ch = Math.max(1, Math.round(image.height * scale));
            const probe = document.createElement('canvas');
            probe.width = cw;
            probe.height = ch;
            const g = probe.getContext('2d');
            g.drawImage(image, 0, 0, cw, ch);
            return g.getImageData(0, 0, cw, ch).data;
        } catch (err) {
            return null;
        }
    }

    // 皮肤常以多像素全透明 PNG 显式屏蔽默认元件，与“未提供贴图”区分。
    function isBlankImage(image) {
        if (!image) return false;
        if (image._isTransparent1x1 || image._isBlankPlaceholder) return true;
        if (!image.complete || !(image.width > 0) || !(image.height > 0)) return false;
        if (blankCache.has(image)) return blankCache.get(image);
        const data = probePixels(image, 512);
        let blank = false;
        if (data) {
            blank = true;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] > 2) {
                    blank = false;
                    break;
                }
            }
        }
        blankCache.set(image, blank);
        return blank;
    }

    function isSuppressedBlank(image) {
        if (!image) return false;
        if (image._isTransparent1x1 || image._isBlankPlaceholder) return true;
        return !!(image.complete && image.width > 0 && image.height > 0 && isBlankImage(image));
    }

    function sdBox(image) {
        if (!image || !(image.width > 1) || !(image.height > 1)) return null;
        if (isBlankImage(image)) return null;
        const div = image._is2x ? 2 : 1;
        return { w: image.width / div, h: image.height / div };
    }

    function usable(image) {
        return !!sdBox(image);
    }

    function oversized(image, slotW, slotH) {
        const box = sdBox(image);
        if (!box) return false;
        return box.w > slotW * 2.5 || box.h > slotH * 2.5;
    }

    function isDarkTexture(image) {
        if (!usable(image)) return false;
        if (darkTexCache.has(image)) return darkTexCache.get(image);
        const data = probePixels(image, 96);
        let dark = false;
        if (data) {
            let lumSum = 0;
            let weightSum = 0;
            for (let i = 0; i < data.length; i += 4) {
                const a = data[i + 3] / 255;
                if (a <= 0.15) continue;
                const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
                lumSum += lum * a;
                weightSum += a;
            }
            dark = weightSum > 0 && (lumSum / weightSum) < 0.42;
        }
        darkTexCache.set(image, dark);
        return dark;
    }

    function isLightColor(css) {
        if (!css) return false;
        let r = 0;
        let g = 0;
        let b = 0;
        const rgb = String(css).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgb) {
            r = Number(rgb[1]);
            g = Number(rgb[2]);
            b = Number(rgb[3]);
        } else {
            const hex = String(css).replace('#', '').trim();
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else if (hex.length >= 6) {
                r = parseInt(hex.slice(0, 2), 16);
                g = parseInt(hex.slice(2, 4), 16);
                b = parseInt(hex.slice(4, 6), 16);
            } else {
                return false;
            }
        }
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.58;
    }

    function tinted(source, color, w, h) {
        const key = color + '|' + Math.round(w) + '|' + Math.round(h) + '|' + sourceKey(source);
        const cached = tintCache.get(key);
        if (cached) return cached;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        const g = canvas.getContext('2d');
        if (source) {
            g.drawImage(source, 0, 0, canvas.width, canvas.height);
            g.globalCompositeOperation = 'multiply';
            g.fillStyle = color;
            g.fillRect(0, 0, canvas.width, canvas.height);
            g.globalCompositeOperation = 'destination-in';
            g.drawImage(source, 0, 0, canvas.width, canvas.height);
        } else {
            g.fillStyle = color;
            g.fillRect(0, 0, canvas.width, canvas.height);
        }
        if (tintCache.size > 48) tintCache.clear();
        tintCache.set(key, canvas);
        return canvas;
    }

    function ellipsis(ctx, text, maxWidth) {
        const value = String(text || '');
        if (ctx.measureText(value).width <= maxWidth) return value;
        let cut = value;
        while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) cut = cut.slice(0, -1);
        return cut + '…';
    }

    function font(ctx, weight, px) {
        ctx.font = weight + ' ' + Math.round(px) + 'px Torus, "Segoe UI", sans-serif';
    }

    function drawCover(ctx, image, x, y, w, h) {
        if (!image || !(image.width > 0)) return false;
        const scale = Math.max(w / image.width, h / image.height);
        const dw = image.width * scale;
        const dh = image.height * scale;
        ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        return true;
    }

    function drawBackground(ctx, view) {
        const width = view.width;
        const height = view.height;
        const bg = view.background;
        const dx = (view.mouse.x / Math.max(1, width) - 0.5) * -18;
        const dy = (view.mouse.y / Math.max(1, height) - 0.5) * -12;
        ctx.fillStyle = '#120e16';
        ctx.fillRect(0, 0, width, height);
        if (bg && bg.complete && bg.width > 0) {
            drawCover(ctx, bg, dx - 12, dy - 12, width + 24, height + 24);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.fillRect(0, 0, width, height);
    }

    function drawModeFlash(ctx, view) {
        const image = view.getTexture('mode-mania');
        const box = sdBox(image);
        if (!box) return;
        const beat = view.beat == null ? 0 : view.beat;
        const pulse = 0.08 + (beat < 0.18 ? (1 - beat / 0.18) * 0.22 : 0);
        const s = view.metrics.s;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse;
        ctx.drawImage(image, (view.width - box.w * s) / 2, (view.height - box.h * s) / 2, box.w * s, box.h * s);
        ctx.restore();
    }

    function drawFlyers(ctx, view) {
        const menuSnow = view.getTexture('menu-snow');
        const useSnow = usable(menuSnow);
        const particle = useSnow ? menuSnow : view.getTexture('star2');
        const box = sdBox(particle);
        if (!box) return;
        if (flyers.length !== 16) {
            flyers = [];
            for (let i = 0; i < 16; i++) {
                flyers.push({
                    x: Math.random(),
                    y: Math.random(),
                    speed: 0.00003 + Math.random() * 0.00006,
                    size: 10 + Math.random() * 14,
                    alpha: 0.28 + Math.random() * 0.45,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
        const now = view.now || 0;
        const s = view.metrics.s;
        const aspect = box.w / Math.max(1, box.h);
        ctx.save();
        ctx.globalCompositeOperation = useSnow ? 'source-over' : 'lighter';
        flyers.forEach(function (item) {
            ctx.globalAlpha = item.alpha;
            if (useSnow) {
                const py = ((item.y + now * item.speed) % 1.12 - 0.06) * view.height;
                const sway = Math.sin(now * 0.0008 + item.phase) * 0.025;
                const px = (((item.x + sway - now * item.speed * 0.22) % 1) + 1) % 1 * view.width;
                const dh = Math.min(34 * s, Math.max(12 * s, box.h * s * 0.7)) * (0.75 + (item.size - 10) / 28);
                const dw = dh * aspect;
                ctx.drawImage(particle, px - dw / 2, py - dh / 2, dw, dh);
            } else {
                const px = (((item.x - now * item.speed) % 1) + 1) % 1 * view.width;
                const py = (0.12 + item.y * 0.72) * view.height;
                const dh = item.size * s;
                const dw = dh * aspect;
                ctx.drawImage(particle, px, py, dw, dh);
            }
        });
        ctx.restore();
    }

    function drawThumb(ctx, x, y, w, h, row, view) {
        const image = row.beatmapBacked ? view.background : null;
        if (!image && view.customButton) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        if (image && image.complete && image.width > 0) {
            drawCover(ctx, image, x, y, w, h);
        } else {
            const hue = row.hue || 210;
            const grad = ctx.createLinearGradient(x, y, x + w, y + h);
            grad.addColorStop(0, 'hsl(' + hue + ', 72%, 64%)');
            grad.addColorStop(1, 'hsl(' + hue + ', 42%, 28%)');
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
    }

    function drawStarRow(ctx, x, y, starsValue, size, starImage, color) {
        const box = sdBox(starImage);
        if (starsValue == null || !box) return;
        const aspect = box.w / Math.max(1, box.h);
        const tintW = Math.max(1, Math.round(48 * aspect));
        const sprite = color ? tinted(starImage, color, tintW, 48) : starImage;
        const slotW = size * aspect;
        const step = Math.max(size * 0.9, slotW) * 1.05;
        const full = Math.floor(starsValue);
        const frac = starsValue - full;
        for (let i = 0; i < 10; i++) {
            let scale = 0.42;
            let alpha = 0.4;
            if (i < full) {
                scale = 1;
                alpha = 1;
            } else if (i === full && frac > 0) {
                scale = 0.42 + frac * 0.58;
                alpha = 0.9;
            }
            const dh = size * scale;
            const dw = dh * aspect;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.drawImage(sprite, x + i * step + (slotW - dw) / 2, y + (size - dh) / 2, dw, dh);
            ctx.restore();
        }
    }

    function panelTint(row, selected) {
        if (row.kind === 'group') return TINT.group;
        if (selected) return TINT.white;
        if (row.kind === 'diff') return TINT.blue;
        return row.played ? TINT.orange : TINT.pink;
    }

    function drawCarousel(ctx, view) {
        const m = view.metrics;
        const hits = [];
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, m.carouselTop, view.width, Math.max(0, m.carouselBottom - m.carouselTop));
        ctx.clip();
        const button = view.getTexture('menu-button-background');
        const star = view.getTexture('star');
        view.placements.forEach(function (place) {
            const row = place.row;
            if (place.y > m.carouselBottom || place.y + place.h < m.carouselTop) return;
            if (row.kind === 'empty') {
                font(ctx, '600', 16 * m.s);
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(row.title, view.width - 28 * m.s, place.y + place.h / 2);
                return;
            }
            const selected = row.key === view.selectedKey;
            const hover = place.index === view.hoverIndex;
            const expandedMember = row.kind === 'diff' || (row.kind === 'set' && row.key === view.expandedSetId);
            const x = window.SongSelectLayout.panelLeft(m, place.y + place.h / 2, {
                expandedMember: expandedMember,
                selected: selected,
                hover: hover
            });
            const spriteH = row.kind === 'group' ? place.h : m.panelH;
            const drawY = place.y + (place.h - spriteH) / 2;
            const sprite = isSuppressedBlank(button)
                ? null
                : tinted(usable(button) ? button : null, panelTint(row, selected), m.panelW, spriteH);
            if (sprite) {
                ctx.save();
                ctx.globalAlpha = row.kind === 'group' ? 1 : (selected ? 220 / 255 : 240 / 255);
                ctx.drawImage(sprite, x, drawY, m.panelW, spriteH);
                ctx.restore();
            }
            hits.push({ kind: 'row', index: place.index, x: x, y: place.y, w: m.panelW, h: place.h });

            const titleColor = selected ? (view.activeText || '#10283c') : (view.inactiveText || '#ffffff');
            const darkCard = usable(button) && isDarkTexture(button);
            const lightInk = darkCard || isLightColor(titleColor);
            const subColor = lightInk ? 'rgba(255, 255, 255, 0.9)' : 'rgba(16, 40, 60, 0.82)';
            const starColor = lightInk ? '#ffffff' : '#16324a';
            const versionColor = selected ? (lightInk ? titleColor : '#eb4999') : titleColor;
            const thumbH = Math.min(m.thumbH, place.h - 2 * m.s);
            const thumbW = Math.min(m.thumbW, thumbH * (115 / 85));
            const textX = x + m.thumbInset + (row.kind === 'group' ? 8 * m.s : thumbW + 10 * m.s);
            const textMax = Math.max(20, m.panelW - (textX - x) - 16 * m.s);
            if (row.kind !== 'group') {
                const thumbY = place.y + (place.h - thumbH) / 2;
                drawThumb(ctx, x + m.thumbInset, thumbY, thumbW, thumbH, row, view);
            }
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.shadowColor = lightInk ? 'rgba(0, 0, 0, 0.5)' : 'transparent';
            ctx.shadowOffsetY = lightInk ? Math.max(1, m.s) : 0;
            if (row.kind === 'group') {
                font(ctx, '700', 15 * m.s);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(ellipsis(ctx, row.title, m.panelW - 28 * m.s), x + 16 * m.s, place.y + (place.h - 18 * m.s) / 2);
                ctx.shadowOffsetY = 0;
                return;
            }
            const grade = row.grade ? view.getTexture('ranking-' + row.grade + '-small') : null;
            let titleOffset = 0;
            if (usable(grade)) {
                const gh = Math.min(28 * m.s, place.h * 0.42);
                const gw = gh * (grade.width / grade.height);
                ctx.shadowOffsetY = 0;
                ctx.drawImage(grade, textX, place.y + 6 * m.s, gw, gh);
                titleOffset = gw + 6 * m.s;
                ctx.shadowOffsetY = lightInk ? Math.max(1, m.s) : 0;
            }
            font(ctx, '700', 16 * m.s);
            ctx.fillStyle = titleColor;
            ctx.fillText(ellipsis(ctx, row.title, textMax - titleOffset), textX + titleOffset, place.y + 7 * m.s);
            font(ctx, '500', 13 * m.s);
            ctx.fillStyle = subColor;
            ctx.fillText(ellipsis(ctx, row.artist + ' // ' + row.creator, textMax), textX, place.y + 27 * m.s);
            if (row.kind === 'diff') {
                font(ctx, '700', 14 * m.s);
                ctx.fillStyle = versionColor;
                const keyLabel = row.keys ? row.keys + 'K' : '';
                const version = keyLabel && String(row.version).indexOf(keyLabel) === -1
                    ? row.version + ' (' + keyLabel + ')'
                    : row.version;
                ctx.fillText(ellipsis(ctx, version, textMax), textX, place.y + 46 * m.s);
                ctx.shadowOffsetY = 0;
                drawStarRow(ctx, textX, place.y + place.h - 24 * m.s, row.stars, 16 * m.s, star, starColor);
            }
            ctx.shadowOffsetY = 0;
        });
        ctx.restore();
        return hits;
    }

    function drawWedge(ctx, view, skipVectorFallback) {
        const top = view.getTexture('songselect-top');
        if (usable(top)) {
            drawTopBand(ctx, view, top);
            return null;
        }
        if (isSuppressedBlank(top) || skipVectorFallback) return null;
        const m = view.metrics;
        const w = m.wedgeW;
        const h = m.wedgeH;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w * 0.86, 0);
        ctx.bezierCurveTo(w * 1.05, h * 0.08, w * 0.98, h * 0.42, w * 0.7, h * 0.78);
        ctx.bezierCurveTo(w * 0.58, h * 0.96, w * 0.42, h, w * 0.28, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = 'rgba(7, 22, 58, 0.78)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(198, 230, 255, 0.92)';
        ctx.lineWidth = Math.max(1, 1.5 * m.s);
        ctx.stroke();
        ctx.restore();
        return { x: 0, y: 0, w: w, h: h };
    }

    function drawTopBand(ctx, view, image) {
        const box = sdBox(image);
        const s = view.metrics.s;
        const h = box.h * s;
        const nativeW = box.w * s;
        if (nativeW >= view.width) {
            const srcW = Math.min(image.width, Math.max(1, Math.round(image.width * (view.width / nativeW))));
            ctx.drawImage(image, 0, 0, srcW, image.height, 0, 0, view.width, h);
            return;
        }
        ctx.drawImage(image, 0, 0, nativeW, h);
        const srcX = Math.max(0, image.width - 2);
        ctx.drawImage(image, srcX, 0, Math.min(2, image.width), image.height, nativeW, 0, view.width - nativeW, h);
    }

    function drawInfoText(ctx, view, strongShadow) {
        const m = view.metrics;
        const lines = view.info.lines || [];
        const sizes = [17, 13, 13, 13, 13];
        let y = 10 * m.s;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.save();
        ctx.shadowColor = strongShadow ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = strongShadow ? Math.max(2, 4 * m.s) : 0;
        ctx.shadowOffsetY = Math.max(1, m.s);
        lines.forEach(function (line, index) {
            font(ctx, index === 0 ? '700' : '500', sizes[index] * m.s);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(ellipsis(ctx, line, m.wedgeW - 28 * m.s), 14 * m.s, y);
            y += (index === 0 ? 24 : 18) * m.s;
        });
        ctx.restore();

        const topTex = view.getTexture('songselect-top');
        const topBox = sdBox(topTex);
        const topBottom = topBox ? Math.min(200, topBox.h) * m.s + 2 * m.s : m.wedgeH + 14 * m.s;
        const boxY = Math.max(m.wedgeH + 14 * m.s, topBottom);
        font(ctx, '700', 13 * m.s);
        ctx.save();
        if (strongShadow) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
            ctx.shadowBlur = Math.max(2, 3 * m.s);
            ctx.shadowOffsetY = Math.max(1, m.s);
        }
        ctx.fillStyle = '#d7ecff';
        ctx.fillText(view.chrome.local + '   ▾', 14 * m.s, boxY);
        ctx.restore();
        const boxX = 12 * m.s;
        const boxW = Math.min(250 * m.s, m.wedgeW - 8 * m.s);
        const boxH = 36 * m.s;
        const cardY = boxY + 20 * m.s;
        ctx.fillStyle = strongShadow ? 'rgba(4, 8, 16, 0.72)' : 'rgba(4, 8, 16, 0.88)';
        ctx.fillRect(boxX, cardY, boxW, boxH);
        ctx.strokeStyle = strongShadow ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.92)';
        ctx.lineWidth = Math.max(1, 1.25 * m.s);
        ctx.strokeRect(boxX + 0.5, cardY + 0.5, boxW - 1, boxH - 1);
        drawTrophy(ctx, boxX + 10 * m.s, cardY + boxH / 2 - 9 * m.s, m.s);
        font(ctx, '600', 15 * m.s);
        ctx.fillStyle = '#c8f4ff';
        ctx.textBaseline = 'middle';
        ctx.fillText(view.chrome.noRecord, boxX + 32 * m.s, cardY + boxH / 2);
        ctx.textBaseline = 'alphabetic';
    }

    function drawTrophy(ctx, x, y, s) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.fillStyle = '#8adfff';
        ctx.strokeStyle = '#e7f8ff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(4, 1);
        ctx.lineTo(14, 1);
        ctx.quadraticCurveTo(13.2, 9, 9, 12);
        ctx.quadraticCurveTo(4.8, 9, 4, 1);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(3.2, 5.2, 2.6, Math.PI * 0.55, Math.PI * 1.45);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(14.8, 5.2, 2.6, Math.PI * 1.55, Math.PI * 0.45);
        ctx.stroke();
        ctx.fillRect(8, 12, 2, 3.5);
        ctx.fillRect(5.5, 15.2, 7, 1.8);
        ctx.restore();
    }

    function drawTop(ctx, view, skinnedHeader) {
        const m = view.metrics;
        const s = m.s;
        const hits = { tabs: [], groupBox: null, sortBox: null };
        const right = view.width - 8 * s;
        font(ctx, '700', 13 * s);
        ctx.textBaseline = 'middle';
        const boxW = 132 * s;
        const boxH = 22 * s;
        const boxY = skinnedHeader ? 12 * s : 20 * s;
        const sortX = right - boxW;
        const groupX = sortX - boxW - 70 * s;
        ctx.save();
        if (skinnedHeader) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
            ctx.shadowBlur = Math.max(2, 3 * s);
            ctx.shadowOffsetY = Math.max(1, s);
        }
        ctx.fillStyle = '#8fd0ff';
        ctx.textAlign = 'right';
        ctx.fillText(view.chrome.group, groupX - 8 * s, boxY + boxH / 2);
        ctx.fillText(view.chrome.sort, sortX - 8 * s, boxY + boxH / 2);
        ctx.restore();
        [{ id: 'group', x: groupX, label: view.chrome.groupValue }, { id: 'sort', x: sortX, label: view.chrome.sortValue }].forEach(function (box) {
            ctx.fillStyle = skinnedHeader ? 'rgba(0, 0, 0, 0.32)' : 'rgba(0, 0, 0, 0.82)';
            ctx.fillRect(box.x, boxY, boxW, boxH);
            if (!skinnedHeader) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.lineWidth = 1;
                ctx.strokeRect(box.x + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
            }
            ctx.fillStyle = '#ffffff';
            font(ctx, '500', 12 * s);
            ctx.textAlign = 'left';
            ctx.fillText(ellipsis(ctx, box.label, boxW - 22 * s), box.x + 8 * s, boxY + boxH / 2);
            ctx.textAlign = 'right';
            ctx.fillText('▾', box.x + boxW - 6 * s, boxY + boxH / 2);
            hits[box.id === 'group' ? 'groupBox' : 'sortBox'] = { x: box.x, y: boxY, w: boxW, h: boxH };
        });

        const tabImage = view.getTexture('selection-tab');
        const tabBox = sdBox(tabImage);
        const tabBlank = isSuppressedBlank(tabImage);
        const darkTab = !!(tabBox && isDarkTexture(tabImage));
        let cursor = view.width;
        const tabH = tabBox ? Math.max(22 * s, Math.min(34 * s, tabBox.h * s)) : 22 * s;
        const tabY = boxY + boxH + 4 * s;
        const tabCap = Math.max(96 * s, (view.width * 0.62) / TABS.length);
        font(ctx, '700', 12 * s);
        TABS.forEach(function (tab) {
            const name = view.chrome.tabs[tab.id];
            const minW = Math.max(96 * s, ctx.measureText(name).width + 22 * s);
            const tabW = tabBox ? Math.min(tabCap, Math.max(minW, tabBox.w * s)) : minW;
            cursor -= tabW;
            const active = view.group === tab.id;
            ctx.save();
            ctx.globalAlpha = active ? 1 : 0.78;
            if (tabBox) {
                ctx.drawImage(tinted(tabImage, tab.fill, tabW - 2 * s, tabH), cursor, tabY, tabW - 2 * s, tabH);
            } else if (!tabBlank) {
                ctx.fillStyle = tab.fill;
                ctx.fillRect(cursor, tabY, tabW - 2 * s, tabH);
            }
            if (tabBlank || darkTab) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
                ctx.shadowBlur = Math.max(2, 2 * s);
                ctx.shadowOffsetY = Math.max(1, s);
                ctx.fillStyle = '#ffffff';
            } else {
                ctx.fillStyle = tab.text;
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(name, cursor + (tabW - 2 * s) / 2, tabY + tabH / 2);
            ctx.restore();
            hits.tabs.push({ id: tab.id, x: cursor, y: tabY, w: tabW - 2 * s, h: tabH });
        });

        const searchX = Math.max(m.wedgeW + 12 * s, view.width - 370 * s);
        const searchY = skinnedHeader ? Math.max(tabY + tabH + 8 * s, 86 * s) : (tabY + tabH + 4 * s);
        const searchH = view.query ? 36 * s : 24 * s;
        ctx.fillStyle = skinnedHeader ? 'rgba(0, 0, 0, 0.32)' : 'rgba(0, 0, 0, 0.42)';
        ctx.fillRect(searchX, searchY, view.width - searchX, searchH);
        ctx.save();
        if (skinnedHeader) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
            ctx.shadowBlur = Math.max(2, 2 * s);
            ctx.shadowOffsetY = Math.max(1, s);
        }
        font(ctx, '700', 14 * s);
        ctx.fillStyle = '#b6ff3b';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(view.chrome.search, searchX + 12 * s, searchY + 12 * s);
        ctx.fillStyle = view.query ? '#ffffff' : 'rgba(255, 255, 255, 0.92)';
        const queryText = view.query || view.chrome.placeholder;
        const labelW = ctx.measureText(view.chrome.search).width;
        ctx.fillText(ellipsis(ctx, queryText, view.width - searchX - labelW - 36 * s), searchX + 16 * s + labelW, searchY + 12 * s);
        if (view.query) {
            font(ctx, '500', 12 * s);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(view.chrome.result, searchX + 12 * s, searchY + 28 * s);
        }
        ctx.restore();
        drawScrollSpeed(ctx, view);
        return hits;
    }

    function drawScrollSpeed(ctx, view) {
        const s = view.metrics.s;
        font(ctx, '700', 13 * s);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(String(view.scrollSpeed || 1) + ' (fixed)', view.width - 10 * s, 2 * s);
    }

    function drawBottomBand(ctx, view) {
        const image = view.getTexture('songselect-bottom');
        const box = sdBox(image);
        if (!box) {
            if (isSuppressedBlank(image)) return false;
            const s = view.metrics.s;
            const barTop = view.height - 58 * s;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
            ctx.fillRect(0, barTop, view.width, view.height - barTop);
            ctx.strokeStyle = 'rgb(49, 94, 237)';
            ctx.lineWidth = Math.max(1, 1.5 * s);
            ctx.beginPath();
            ctx.moveTo(0, barTop);
            ctx.lineTo(view.width, barTop);
            ctx.stroke();
            return false;
        }
        const h = box.h * view.metrics.s;
        ctx.drawImage(image, 0, view.height - h, view.width, h);
        return oversized(image, 400, 120);
    }

    function drawNative(ctx, image, x, bottom, scale) {
        const box = sdBox(image);
        if (!box) return null;
        const w = box.w * scale;
        const h = box.h * scale;
        ctx.drawImage(image, x, bottom - h, w, h);
        return { w: w, h: h };
    }

    function drawNativeBackButton(ctx, bottom, s, hover) {
        const btnH = 45 * s;
        const bottomY = bottom - 13 * s;
        const topY = bottomY - btnH;
        const slant = 9.5 * s;
        const topW = (hover ? 104 : 94) * s;
        const tabTopW = (hover ? 36 : 33) * s;
        const botW = topW - slant;
        const tabBotW = tabTopW - slant;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = Math.max(3, 6 * s);
        ctx.shadowOffsetX = 1.5 * s;
        ctx.shadowOffsetY = 2 * s;
        const bodyGrad = ctx.createLinearGradient(0, topY, 0, bottomY);
        bodyGrad.addColorStop(0, hover ? '#ff59a7' : '#ff3d95');
        bodyGrad.addColorStop(1, hover ? '#ec2f84' : '#da2276');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(0, topY);
        ctx.lineTo(topW, topY);
        ctx.lineTo(botW, bottomY);
        ctx.lineTo(0, bottomY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = Math.max(2, 4 * s);
        ctx.shadowOffsetX = 1.5 * s;
        const tabGrad = ctx.createLinearGradient(0, topY, 0, bottomY);
        tabGrad.addColorStop(0, hover ? '#ff6fb4' : '#ff55a3');
        tabGrad.addColorStop(1, hover ? '#f03e90' : '#e62d81');
        ctx.fillStyle = tabGrad;
        ctx.beginPath();
        ctx.moveTo(0, topY);
        ctx.lineTo(tabTopW, topY);
        ctx.lineTo(tabBotW, bottomY);
        ctx.lineTo(0, bottomY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const cy = (topY + bottomY) / 2;
        const cx = (tabTopW + tabBotW) * 0.25;
        const iconR = 10.5 * s;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = Math.max(1, 2 * s);
        ctx.shadowOffsetY = s;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, iconR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = hover ? '#f03e90' : '#e62d81';
        ctx.lineWidth = Math.max(1.5, 2.5 * s);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + 2.2 * s, cy - 4.4 * s);
        ctx.lineTo(cx - 2.6 * s, cy);
        ctx.lineTo(cx + 2.2 * s, cy + 4.4 * s);
        ctx.stroke();

        const textX = (tabTopW + tabBotW) / 2 + (topW - tabTopW) * 0.44;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
        ctx.shadowBlur = Math.max(1, 2 * s);
        ctx.shadowOffsetY = s;
        ctx.fillStyle = '#ffffff';
        font(ctx, '500', 19 * s);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('back', textX, cy + 0.5 * s);
        ctx.restore();

        return { x: 0, y: topY - 4 * s, w: Math.max(topW, 100 * s), h: btnH + 17 * s };
    }

    function drawFooter(ctx, view) {
        const m = view.metrics;
        const bottom = view.height;
        const skinnedBar = drawBottomBand(ctx, view);
        const hits = {};
        const back = view.getTexture('menu-back');
        const backOver = view.getTexture('menu-back-over');
        const backBox = sdBox(back);
        const backOverflow = backBox && (backBox.w > 420 || backBox.h > 280);
        const backW = (backBox && !backOverflow ? backBox.w : 140) * m.s;
        const backH = (backBox && !backOverflow ? backBox.h : 90) * m.s;
        if (backBox) {
            drawNative(ctx, back, 0, bottom, m.s);
            if (view.hoverFooter === 'back') {
                if (usable(backOver)) {
                    drawNative(ctx, backOver, 0, bottom, m.s);
                } else if (!backOverflow) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.22;
                    drawNative(ctx, back, 0, bottom, m.s);
                    ctx.restore();
                }
            }
            hits.back = { x: 0, y: bottom - Math.min(backH, m.footerH), w: Math.min(backW, 220 * m.s), h: Math.min(backH, m.footerH) };
        } else if (!isSuppressedBlank(back)) {
            hits.back = drawNativeBackButton(ctx, bottom, m.s, view.hoverFooter === 'back');
        } else {
            hits.back = { x: 0, y: bottom - Math.min(backH, m.footerH), w: Math.min(backW, 220 * m.s), h: Math.min(backH, m.footerH) };
        }

        // osu!stable 中 selection-mode 固定从 x=224 (768p 基准) 起排，不随 menu-back 宽度挤压右侧控件
        let x = 224 * m.s;
        let modeSlot = null;
        let frameOverflow = false;
        FOOTER.forEach(function (spec) {
            const image = view.getTexture(spec.name);
            const over = view.getTexture(spec.name + '-over');
            const box = sdBox(image);
            const blank = isSuppressedBlank(image);
            const overflow = oversized(image, spec.w, 90);
            const slotW = (box && !overflow ? box.w : spec.w) * m.s;
            const slotH = m.footerH;
            if (box) drawNative(ctx, image, x, bottom, m.s);
            else if (!frameOverflow && !blank) {
                ctx.fillStyle = 'rgba(16, 14, 22, 0.92)';
                ctx.fillRect(x, bottom - slotH, slotW, slotH);
            }
            if (view.hoverFooter === spec.id) {
                if (usable(over)) {
                    drawNative(ctx, over, x, bottom, m.s);
                } else if (box && !overflow) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.16;
                    drawNative(ctx, image, x, bottom, m.s);
                    ctx.restore();
                }
            }
            hits[spec.id] = { x: x, y: bottom - slotH, w: slotW, h: slotH };
            if (spec.id === 'mode') modeSlot = hits.mode;
            if (overflow) frameOverflow = true;
            x += overflow ? spec.w * m.s : slotW;
        });
        drawModeIcon(ctx, view, modeSlot);
        drawGuest(ctx, view, Math.max(x + 12 * m.s, 634 * m.s));
        if (!frameOverflow && !skinnedBar) hits.cookie = drawCookie(ctx, view);
        else hits.cookie = { x: view.width - 80 * m.s, y: view.height - 80 * m.s, w: 80 * m.s, h: 80 * m.s };
        return { hits: hits, framed: frameOverflow };
    }

    function drawModeIcon(ctx, view, slot) {
        if (!slot) return;
        const icon = view.getTexture('mode-mania-small');
        const box = sdBox(icon);
        if (!box) return;
        const big = oversized(icon, 64, 64);
        if (!big && isSuppressedBlank(view.getTexture('selection-mode'))) return;
        const s = view.metrics.s;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (big) {
            const cx = slot.x + slot.w / 2;
            const cy = view.height - 34 * s;
            ctx.drawImage(icon, cx - box.w * s / 2, cy - box.h * s / 2, box.w * s, box.h * s);
        } else {
            const dw = box.w * s;
            const dh = box.h * s;
            ctx.drawImage(icon, slot.x + (slot.w - dw) / 2, slot.y + slot.h * 0.34 - dh / 2, dw, dh);
        }
        ctx.restore();
    }

    function drawGuest(ctx, view, x) {
        const s = view.metrics.s;
        const size = 58 * s;
        const y = view.height - 66 * s;
        ctx.fillStyle = '#ff66aa';
        roundRect(ctx, x, y, size, size, 4 * s);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        font(ctx, '700', 22 * s);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♪', x + size / 2, y + size / 2);
        const textX = x + size + 10 * s;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
        ctx.shadowBlur = Math.max(2, 3 * s);
        ctx.shadowOffsetY = Math.max(1, s);
        ctx.textAlign = 'left';
        font(ctx, '700', 16 * s);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(view.chrome.guest, textX, y + 12 * s);
        font(ctx, '500', 12 * s);
        ctx.fillText('Performance: 0pp', textX, y + 30 * s);
        ctx.fillText('Accuracy: 0.00%', textX, y + 45 * s);
        ctx.restore();
        const barY = view.height - 8 * s;
        const barW = 92 * s;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(textX, barY, barW, 4 * s);
        ctx.fillStyle = '#e0b13a';
        ctx.fillRect(textX, barY, barW * 0.18, 4 * s);
        ctx.textBaseline = 'alphabetic';
    }

    function roundRect(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    const COOKIE_TRIANGLES = [
        [-0.45, -0.35, 0.34, 0, 'rgba(255, 255, 255, 0.14)'],
        [0.12, -0.58, 0.26, 0, 'rgba(255, 255, 255, 0.16)'],
        [0.44, -0.28, 0.42, 0, 'rgba(255, 255, 255, 0.12)'],
        [-0.64, 0.08, 0.28, 0, 'rgba(255, 255, 255, 0.11)'],
        [-0.18, 0.02, 0.48, Math.PI, 'rgba(180, 20, 90, 0.12)'],
        [0.24, 0.14, 0.36, 0, 'rgba(255, 255, 255, 0.13)'],
        [-0.36, 0.46, 0.30, 0, 'rgba(255, 255, 255, 0.12)'],
        [0.08, 0.44, 0.38, Math.PI, 'rgba(180, 20, 90, 0.10)'],
        [0.52, 0.36, 0.26, 0, 'rgba(255, 255, 255, 0.15)'],
        [-0.08, -0.44, 0.20, 0, 'rgba(255, 255, 255, 0.18)'],
        [-0.56, -0.14, 0.18, 0, 'rgba(255, 255, 255, 0.16)']
    ];

    function drawCookie(ctx, view) {
        const s = view.metrics.s;
        const footerH = view.metrics.footerH;
        const beat = view.beat == null ? 0 : view.beat;
        const scale = 1 + (beat < 0.2 ? (1 - beat / 0.2) * 0.06 : 0);
        const radius = footerH * 0.99 * scale;
        const cx = view.width - 71 * s;
        const cy = view.height - 53 * s;
        const logo = view.getTexture('menu-osu');
        const hasLogo = usable(logo);
        const discR = hasLogo ? radius * 0.96 : radius;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, discR, 0, Math.PI * 2);
        ctx.clip();
        const grad = ctx.createRadialGradient(cx - discR * 0.22, cy - discR * 0.28, discR * 0.08, cx, cy, discR);
        grad.addColorStop(0, '#ff6fb4');
        grad.addColorStop(0.65, '#ee4b98');
        grad.addColorStop(1, '#d82b7d');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - discR, cy - discR, discR * 2, discR * 2);

        for (let i = 0; i < COOKIE_TRIANGLES.length; i++) {
            const tri = COOKIE_TRIANGLES[i];
            const tx = cx + tri[0] * discR;
            const ty = cy + tri[1] * discR;
            const ts = tri[2] * discR;
            ctx.save();
            ctx.translate(tx, ty);
            ctx.rotate(tri[3]);
            ctx.fillStyle = tri[4];
            ctx.beginPath();
            ctx.moveTo(0, -ts * 0.65);
            ctx.lineTo(ts * 0.58, ts * 0.45);
            ctx.lineTo(-ts * 0.58, ts * 0.45);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();

        if (hasLogo) {
            // menu-osu.png 外白环外缘位于 94.5% 半径处，按此反算使白环恰好贴合 radius 且外侧不露粉边
            const logoR = radius / 0.945;
            ctx.drawImage(logo, cx - logoR, cy - logoR, logoR * 2, logoR * 2);
        } else {
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(2, radius * 0.08);
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.94, 0, Math.PI * 2);
            ctx.stroke();
            font(ctx, '900', radius * 0.6);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('osu!', cx, cy - radius * 0.02);
            ctx.restore();
        }
        return { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
    }

    function hasFullScreenFrame(view) {
        if (oversized(view.getTexture('mode-mania-small'), 64, 64)) return true;
        return FOOTER.some(function (spec) {
            return oversized(view.getTexture(spec.name), spec.w, 90);
        });
    }

    function draw(ctx, view) {
        const framedScreen = hasFullScreenFrame(view);
        const skinnedHeader = framedScreen || oversized(view.getTexture('songselect-top'), 400, 80);
        drawBackground(ctx, view);
        drawModeFlash(ctx, view);
        drawFlyers(ctx, view);
        const rows = drawCarousel(ctx, view);
        const wedge = drawWedge(ctx, view, framedScreen);
        const footer = drawFooter(ctx, view);
        const top = drawTop(ctx, view, skinnedHeader || footer.framed);
        drawInfoText(ctx, view, skinnedHeader || footer.framed);
        return {
            rows: rows,
            tabs: top.tabs,
            groupBox: top.groupBox,
            sortBox: top.sortBox,
            footer: footer.hits,
            wedge: wedge
        };
    }

    window.SongSelectPaint = {
        draw: draw,
        sdBox: sdBox
    };
})(window);
