// ============================================================================
// main-menu-preview.js - osu!stable 主界面 (Main Menu) 100% 像素级对标原版
// 还原：中心大粉 Cookie + 内部漂浮粉红多边形 (Triangles) + 放射细声波光环 +
// 左上角玩家信息条 + 右上角 Jukebox +
// 底栏 ppy 签名、F12 提示条与绿色 FPS 计数器 + 点击展开四色斜角主菜单
// ============================================================================

(function (window) {
    'use strict';

    let canvas = null;
    let ctx = null;
    let isRunning = false;
    let animFrameId = null;

    // 交互状态
    let mousePos = { x: -1000, y: -1000 };
    let isHoveringLogo = false;
    let isMenuExpanded = false;
    let currentLogoX = 0;
    let lastInteractionTime = 0;
    let hoveredMenuItem = -1;

    // 预加载贴图缓存，确保首帧即呈现，无加载闪烁
    const assetCache = new Map();
    const ASSET_SOURCES = {
        'menu-osu': 'assets/default_skin/menu-osu.png',
        'menu-background': 'assets/default_skin/menu-background.jpg'
    };

    Object.keys(ASSET_SOURCES).forEach((key) => {
        const img = new Image();
        img.src = ASSET_SOURCES[key];
        assetCache.set(key, img);
    });

    // Cookie 内部漂浮粉色多边形 (Triangles)
    const TRIANGLES_COUNT = 22;
    const triangles = [];
    for (let i = 0; i < TRIANGLES_COUNT; i++) {
        triangles.push({
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            size: 0.10 + Math.random() * 0.16,
            speedY: 0.0012 + Math.random() * 0.0022,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.012,
            alpha: 0.18 + Math.random() * 0.28
        });
    }

    // 浮动落叶 / 光点粒子
    const PARTICLES_COUNT = 24;
    const particles = [];
    for (let i = 0; i < PARTICLES_COUNT; i++) {
        particles.push({
            x: Math.random(),
            y: Math.random(),
            size: 2 + Math.random() * 4,
            speedX: (Math.random() - 0.3) * 0.0006,
            speedY: 0.0008 + Math.random() * 0.0016,
            color: Math.random() > 0.4 ? 'rgba(255, 140, 60, ' : 'rgba(255, 80, 120, ',
            alpha: 0.2 + Math.random() * 0.5
        });
    }

    // osu!stable 原版主菜单按钮
    const STABLE_MENU_BUTTONS = [
        { id: 'play', label: 'play', action: 'play', bg1: '#e03678', bg2: '#a81855' },
        { id: 'edit', label: 'edit', action: 'edit', bg1: '#1e824c', bg2: '#11522f' },
        { id: 'options', label: 'options', action: 'options', bg1: '#1f5f99', bg2: '#123e66' },
        { id: 'exit', label: 'exit', action: 'exit', bg1: '#8e1b1b', bg2: '#570d0d' }
    ];

    const STABLE_PLAY_SUB_BUTTONS = [
        { id: 'solo', label: 'solo', action: 'solo', bg1: '#e03678', bg2: '#a81855' },
        { id: 'multi', label: 'multi', action: 'multi', bg1: '#7d3c98', bg2: '#4a154b' }
    ];
    let isPlaySubExpanded = false;

    function getTexture(name) {
        if (typeof skinImageStore !== 'undefined') {
            const userImg = (typeof getSkinAnimationFromStore === 'function')
                ? getSkinAnimationFromStore(skinImageStore, name)
                : skinImageStore.get(name + '.png') || skinImageStore.get(name);
            if (userImg && userImg.complete && userImg.width > 0) return userImg;
        }
        if (typeof defaultSkinImageStore !== 'undefined') {
            const defImg = (typeof getSkinAnimationFromStore === 'function')
                ? getSkinAnimationFromStore(defaultSkinImageStore, name)
                : defaultSkinImageStore.get(name + '.png');
            if (defImg && defImg.complete && defImg.width > 0) return defImg;
        }
        const cached = assetCache.get(name);
        if (cached && cached.complete && cached.width > 0) return cached;
        return null;
    }

    function init(targetCanvas) {
        if (!targetCanvas) {
            targetCanvas = document.getElementById('mainMenuCanvas');
        }
        canvas = targetCanvas;
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);
        canvas.addEventListener('click', onClick);
    }

    function onMouseMove(e) {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        mousePos.x = (e.clientX - rect.left) * scaleX;
        mousePos.y = (e.clientY - rect.top) * scaleY;
        lastInteractionTime = performance.now();
    }

    function onMouseLeave() {
        mousePos.x = -1000;
        mousePos.y = -1000;
        isHoveringLogo = false;
        hoveredMenuItem = -1;
    }

    function onClick(e) {
        if (!canvas) return;
        const width = canvas.width;
        const height = canvas.height;
        const logoY = height * 0.5;
        const baseRadius = Math.min(width, height) * 0.22;

        const dist = Math.hypot(mousePos.x - currentLogoX, mousePos.y - logoY);

        if (dist <= baseRadius) {
            isMenuExpanded = !isMenuExpanded;
            isPlaySubExpanded = false;
            lastInteractionTime = performance.now();
            return;
        }

        // 顶栏 Jukebox 播放控制点击响应
        if (mousePos.y >= 10 && mousePos.y <= 42 && mousePos.x >= width - 240) {
            if (typeof toggleAudioPlayback === 'function') {
                toggleAudioPlayback();
            }
            return;
        }

        // 侧边菜单按钮点击
        if (isMenuExpanded && hoveredMenuItem >= 0) {
            const list = isPlaySubExpanded ? STABLE_PLAY_SUB_BUTTONS : STABLE_MENU_BUTTONS;
            const item = list[hoveredMenuItem];
            if (item) {
                handleMenuAction(item.action);
            }
        }
    }

    function handleMenuAction(action) {
        lastInteractionTime = performance.now();
        if (action === 'play') {
            isPlaySubExpanded = true;
            return;
        }
        if (action === 'solo') {
            if (typeof window.setStageView === 'function') {
                window.setStageView('song-select');
            }
            isMenuExpanded = false;
            isPlaySubExpanded = false;
            return;
        }
        if (action === 'multi') {
            if (typeof window.setStageView === 'function') {
                window.setStageView('song-select');
            }
            return;
        }
        if (action === 'edit') {
            if (typeof window.setStageView === 'function') {
                window.setStageView('gameplay');
            }
            isMenuExpanded = false;
            isPlaySubExpanded = false;
            return;
        }
        if (action === 'options') {
            const settingsBtn = document.getElementById('btnOpenSettings');
            if (settingsBtn) settingsBtn.click();
            return;
        }
        if (action === 'exit') {
            isMenuExpanded = false;
            isPlaySubExpanded = false;
        }
    }

    function start() {
        if (isRunning) return;
        if (!canvas) init();
        if (!canvas) return;

        isRunning = true;
        currentLogoX = canvas.width / 2;
        lastInteractionTime = performance.now();

        const loop = (time) => {
            if (!isRunning) return;
            draw(time);
            animFrameId = requestAnimationFrame(loop);
        };
        animFrameId = requestAnimationFrame(loop);
    }

    function stop() {
        isRunning = false;
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
    }

    function draw(now) {
        if (!canvas || !ctx) return;
        if (canvas.clientWidth > 0 && (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight)) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        if (isMenuExpanded && (now - lastInteractionTime > 15000)) {
            isMenuExpanded = false;
            isPlaySubExpanded = false;
        }

        // 1. 全屏背景壁纸 (支持导入谱面背景或默认星空/秋季图)
        drawBackground(width, height, now);

        // 2. Logo 节拍缩放与动画计算
        const beatInfo = computeBeatPulse(now);
        const targetLogoX = isMenuExpanded ? (width * 0.30) : (width * 0.5);
        currentLogoX += (targetLogoX - currentLogoX) * 0.14;
        const logoY = height * 0.5;
        const baseRadius = Math.min(width, height) * 0.22;

        const distToLogo = Math.hypot(mousePos.x - currentLogoX, mousePos.y - logoY);
        isHoveringLogo = (distToLogo <= baseRadius);

        let scale = 1.0 + (beatInfo.pulse * (beatInfo.isKiai ? 0.075 : 0.04));
        if (isHoveringLogo) scale += 0.035;

        // 3. 经典细声波放射光环 (Fine Radial Spectrum Wave)
        drawFineVisualizer(now, currentLogoX, logoY, baseRadius * scale, beatInfo.pulse);

        // 4. 中央 100% stable 标志性粉 Cookie (含浮动三角形 Triangles)
        drawStableCookieWithTriangles(now, currentLogoX, logoY, baseRadius, scale);

        // 5. 侧边展开四色斜角按钮 (play / edit / options / exit)
        if (isMenuExpanded || Math.abs(currentLogoX - width * 0.5) > 8) {
            drawMenuButtons(now, currentLogoX, logoY, width, height);
        }

        // 6. 左上角玩家信息条
        drawStableUserCard(width, height);

        // 7. 右上角 Jukebox (Now Playing ♫ / 控制条)
        drawStableJukebox(width, height);

        // 8. 底栏信息：ppy 签名、F12 提示条、右下角 FPS
        drawStableFooterHUD(width, height);
    }

    function drawBackground(width, height, now) {
        let bgImg = null;
        if (typeof canvasBgImage !== 'undefined' && canvasBgImage && canvasBgImage.complete) {
            bgImg = canvasBgImage;
        } else {
            bgImg = getTexture('menu-background');
        }

        const parallaxX = (mousePos.x >= 0 ? ((mousePos.x / width) - 0.5) : 0) * -16;
        const parallaxY = (mousePos.y >= 0 ? ((mousePos.y / height) - 0.5) : 0) * -10;

        if (bgImg && bgImg.complete && bgImg.width > 0) {
            const extraScale = 1.06;
            const destW = width * extraScale;
            const destH = height * extraScale;
            const destX = (width - destW) / 2 + parallaxX;
            const destY = (height - destH) / 2 + parallaxY;

            ctx.drawImage(bgImg, destX, destY, destW, destH);

            // 柔和暗角增强层次感
            const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.25, width / 2, height / 2, width * 0.7);
            vignette.addColorStop(0, 'rgba(12, 8, 20, 0.25)');
            vignette.addColorStop(1, 'rgba(8, 4, 14, 0.75)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, width, height);
        } else {
            // 深紫与暗红秋日渐变底色
            const grad = ctx.createLinearGradient(0, 0, width, height);
            grad.addColorStop(0, '#1c1328');
            grad.addColorStop(0.5, '#120b1c');
            grad.addColorStop(1, '#08050e');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
        }

        // 飘落秋日光粒 / 枫叶
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.speedX;
            p.y += p.speedY;
            if (p.y > 1.0) {
                p.y = 0;
                p.x = Math.random();
            }
            if (p.x < 0) p.x = 1.0;
            if (p.x > 1.0) p.x = 0;

            const px = p.x * width;
            const py = p.y * height;
            ctx.fillStyle = `${p.color}${p.alpha})`;
            ctx.beginPath();
            ctx.arc(px, py, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function computeBeatPulse(now) {
        let pulse = 0;
        let isKiai = false;
        let bpm = 160;

        if (typeof currentBeatmap !== 'undefined' && currentBeatmap && Array.isArray(currentBeatmap.TimingPoints) && currentBeatmap.TimingPoints.length > 0) {
            const curTime = (typeof getCurrentAudioTime === 'function') ? getCurrentAudioTime() * 1000 : now;
            let activeTp = currentBeatmap.TimingPoints[0];
            for (let i = 0; i < currentBeatmap.TimingPoints.length; i++) {
                const tp = currentBeatmap.TimingPoints[i];
                if (tp.time <= curTime && !tp.inherited) {
                    activeTp = tp;
                }
            }
            if (activeTp && activeTp.beatLength > 0) {
                bpm = 60000 / activeTp.beatLength;
                const beatMs = activeTp.beatLength;
                const elapsed = (curTime - activeTp.time) % beatMs;
                const progress = (elapsed >= 0 ? elapsed : elapsed + beatMs) / beatMs;
                pulse = Math.exp(-progress * 4.5);
                isKiai = Boolean(activeTp.kiai);
                return { pulse, isKiai, bpm };
            }
        }

        // 回退默认节拍 (160 BPM)
        const beatInterval = 60000 / bpm;
        const phase = (now % beatInterval) / beatInterval;
        pulse = Math.exp(-phase * 4.2);
        return { pulse, isKiai: false, bpm };
    }

    // 经典细密放射声波频谱光环 (Fine Radial Spectrum Wave)
    function drawFineVisualizer(now, cx, cy, innerRadius, beatPulse) {
        ctx.save();
        const barCount = 130;
        const angleStep = (Math.PI * 2) / barCount;
        const timeSec = now * 0.0025;

        for (let i = 0; i < barCount; i++) {
            const angle = i * angleStep;
            const wave1 = Math.sin(i * 0.28 + timeSec) * 0.5 + 0.5;
            const wave2 = Math.cos(i * 0.65 - timeSec * 1.5) * 0.5 + 0.5;
            const wave3 = Math.sin(i * 1.1 + timeSec * 0.8) * 0.5 + 0.5;
            const combined = (wave1 * 0.45 + wave2 * 0.35 + wave3 * 0.20);

            const barLen = 14 + combined * (42 + beatPulse * 48);

            const startX = cx + Math.cos(angle) * (innerRadius + 4);
            const startY = cy + Math.sin(angle) * (innerRadius + 4);
            const endX = cx + Math.cos(angle) * (innerRadius + 4 + barLen);
            const endY = cy + Math.sin(angle) * (innerRadius + 4 + barLen);

            const barGrad = ctx.createLinearGradient(startX, startY, endX, endY);
            barGrad.addColorStop(0, 'rgba(255, 130, 180, 0.95)');
            barGrad.addColorStop(0.65, 'rgba(160, 140, 255, 0.85)');
            barGrad.addColorStop(1, 'rgba(255, 255, 255, 0.95)');

            ctx.strokeStyle = barGrad;
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        ctx.restore();
    }

    // 标志性粉色 Cookie + 内部漂浮粉红多边形 (Triangles)
    function drawStableCookieWithTriangles(now, cx, cy, radius, scale) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);

        // 1. 底层大粉圆
        const cookieGrad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
        cookieGrad.addColorStop(0, '#f04383');
        cookieGrad.addColorStop(0.65, '#e03070');
        cookieGrad.addColorStop(1, '#b81855');

        ctx.fillStyle = cookieGrad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        // 2. 内部多边形剪裁并绘制漂浮的粉色三角形
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.96, 0, Math.PI * 2);
        ctx.clip();

        for (let i = 0; i < triangles.length; i++) {
            const tri = triangles[i];
            tri.y -= tri.speedY;
            tri.rotation += tri.rotSpeed;
            if (tri.y < -1.1) {
                tri.y = 1.1;
                tri.x = (Math.random() - 0.5) * 2;
            }

            const tx = tri.x * radius * 0.85;
            const ty = tri.y * radius * 0.85;
            const tSize = tri.size * radius * 0.55;

            ctx.save();
            ctx.translate(tx, ty);
            ctx.rotate(tri.rotation);

            ctx.fillStyle = `rgba(255, 255, 255, ${tri.alpha * 0.35})`;
            ctx.beginPath();
            ctx.moveTo(0, -tSize * 0.65);
            ctx.lineTo(tSize * 0.58, tSize * 0.45);
            ctx.lineTo(-tSize * 0.58, tSize * 0.45);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
        ctx.restore();

        // 3. 优先使用官方默认贴图 menu-osu.png
        const menuOsuImg = getTexture('menu-osu');
        if (menuOsuImg && menuOsuImg.complete && menuOsuImg.width > 0) {
            ctx.drawImage(menuOsuImg, -radius, -radius, radius * 2, radius * 2);
        } else {
            // 回退高保真矢量绘制
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = radius * 0.085;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.94, 0, Math.PI * 2);
            ctx.stroke();

            ctx.font = `900 ${Math.round(radius * 0.64)}px "Comfortaa", "Varela Round", sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = radius * 0.12;
            ctx.shadowOffsetY = radius * 0.03;
            ctx.fillText('osu!', 0, -radius * 0.02);
        }

        ctx.restore();
    }

    // 侧边四色斜角主菜单按钮
    function drawMenuButtons(now, logoX, logoY, width, height) {
        ctx.save();
        const list = isPlaySubExpanded ? STABLE_PLAY_SUB_BUTTONS : STABLE_MENU_BUTTONS;
        const count = list.length;
        const btnHeight = 54;
        const btnGap = 12;
        const totalH = count * btnHeight + (count - 1) * btnGap;
        const startY = logoY - totalH * 0.5;

        const btnLeft = Math.max(logoX + 110, width * 0.52);
        const btnRight = width;
        const btnWidth = btnRight - btnLeft;

        hoveredMenuItem = -1;

        for (let i = 0; i < count; i++) {
            const btn = list[i];
            const by = startY + i * (btnHeight + btnGap);

            const isHover = (mousePos.x >= btnLeft && mousePos.x <= btnRight && mousePos.y >= by && mousePos.y <= by + btnHeight);
            if (isHover) hoveredMenuItem = i;

            const hoverSlide = isHover ? -18 : 0;
            const drawX = btnLeft + hoverSlide;

            ctx.save();

            // 斜角卡片剪裁路径
            ctx.beginPath();
            ctx.moveTo(drawX + 16, by);
            ctx.lineTo(btnRight, by);
            ctx.lineTo(btnRight, by + btnHeight);
            ctx.lineTo(drawX, by + btnHeight);
            ctx.closePath();

            const grad = ctx.createLinearGradient(drawX, by, btnRight, by);
            grad.addColorStop(0, btn.bg1);
            grad.addColorStop(1, btn.bg2);
            ctx.fillStyle = grad;
            ctx.fill();

            // 悬浮亮边
            if (isHover) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }

            // 按钮文字
            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = 6;
            ctx.fillText(btn.label, drawX + 32, by + btnHeight * 0.5);

            ctx.restore();
        }

        ctx.restore();
    }

    const PREVIEW_PROFILE = {
        name: 'nori',
        rank: '#12840',
        pp: '4,280pp',
        accuracy: '97.42%',
        level: 78,
        levelProgress: 0.42
    };

    function drawPreviewAvatar(cx, cy, radius) {
        const grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.2, cx, cy, radius);
        grad.addColorStop(0, '#ffd0e4');
        grad.addColorStop(1, '#ff66aa');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - radius * 0.28, cy - radius * 0.08, radius * 0.12, 0, Math.PI * 2);
        ctx.arc(cx + radius * 0.28, cy - radius * 0.08, radius * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, radius * 0.08);
        ctx.beginPath();
        ctx.arc(cx, cy + radius * 0.12, radius * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
    }

    function drawStableUserCard(width, height) {
        ctx.save();
        const startX = 18;
        const startY = 16;
        const profile = PREVIEW_PROFILE;

        const barW = 280;
        const barH = 58;
        const bgGrad = ctx.createLinearGradient(startX, startY, startX + barW, startY);
        bgGrad.addColorStop(0, 'rgba(10, 6, 16, 0.72)');
        bgGrad.addColorStop(1, 'rgba(10, 6, 16, 0)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(startX - 6, startY - 4, barW, barH);

        const avatarSize = 42;
        drawPreviewAvatar(startX + avatarSize / 2, startY + avatarSize / 2, avatarSize / 2);

        const textX = startX + avatarSize + 10;
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(profile.rank, textX + 42, startY - 4);

        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(profile.name, textX, startY);

        ctx.font = '11px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.fillText('Performance: ' + profile.pp, textX, startY + 18);
        ctx.fillText('Accuracy: ' + profile.accuracy, textX, startY + 32);

        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Lv' + profile.level, textX, startY + 46);
        const barX = textX + 32;
        const barY = startY + 49;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(barX, barY, 120, 4);
        ctx.fillStyle = '#ffb300';
        ctx.fillRect(barX, barY, 120 * profile.levelProgress, 4);

        ctx.restore();
    }

    // 右上角 Jukebox (Now Playing ♫ / 控制条)
    function drawStableJukebox(width, height) {
        ctx.save();
        const jukeX = width - 240;
        const jukeY = 16;

        ctx.font = 'italic 11px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('Now Playing ♫', jukeX, jukeY);

        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#ffffff';
        const trackTitle = (typeof currentBeatmap !== 'undefined' && currentBeatmap && currentBeatmap.Title)
            ? currentBeatmap.Title
            : 'nekodex - circles!';
        ctx.fillText(trackTitle, jukeX + 85, jukeY, 150);

        // 播放控制按钮图标行
        const ctrlY = jukeY + 18;
        const icons = ['|◀◀', '◀◀', '❚❚', '▶▶', '▶▶|', 'ℹ', '☰'];
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.textAlign = 'center';

        icons.forEach((ic, idx) => {
            ctx.fillText(ic, jukeX + 20 + idx * 30, ctrlY);
        });

        ctx.restore();
    }

    // 底栏信息：ppy 签名、F12 提示条、右下角 FPS
    function drawStableFooterHUD(width, height) {
        ctx.save();

        // 1. 左下角 ppy powered
        ctx.font = '900 22px "Comfortaa", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('ppy', 18, height - 14);

        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.fillText('ppy powered 2007-2026', 64, height - 24);
        ctx.fillText('osu.ppy.sh', 64, height - 12);

        // 2. 居中 F12 提示条
        const tipText = 'Take a screenshot from within osu! by hitting F12.';
        ctx.font = '12px sans-serif';
        const tipW = ctx.measureText(tipText).width + 36;
        const tipH = 26;
        const tipX = (width - tipW) / 2;
        const tipY = height - 36;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(tipX, tipY, tipW, tipH, 13);
            ctx.fill();
        } else {
            ctx.fillRect(tipX, tipY, tipW, tipH);
        }

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tipText, tipX + tipW / 2, tipY + tipH / 2);

        // 3. 右下角绿色 FPS 框
        const fpsW = 54;
        const fpsH = 28;
        const fpsX = width - fpsW - 10;
        const fpsY = height - fpsH - 8;

        ctx.fillStyle = '#73c332';
        ctx.fillRect(fpsX, fpsY, fpsW, fpsH);

        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#122c06';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('288/288fps', fpsX + fpsW / 2, fpsY + 3);
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('4.7ms', fpsX + fpsW / 2, fpsY + 14);

        ctx.restore();
    }

    window.MainMenuPreview = {
        init,
        start,
        stop,
        draw
    };
})(window);
