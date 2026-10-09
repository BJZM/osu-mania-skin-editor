// Skin cursor renderer.
// Uses cursor.png / cursor@2x.png and cursortrail.png from the imported skin,
// while keeping the rest of the editor interactive.
(function () {
    const TRAIL_LIFETIME_MS = 220;
    const TRAIL_MAX_POINTS = 28;
    const ROTATION_EASE = 16;
    const SCALE_EASE = 18;
    const CURSOR_BASE_SCALE = 0.86;
    const POINTER_EXIT_GUARD_PX = 1;

    let layer = null;
    let layerCtx = null;
    let rafId = 0;
    let active = false;
    let pointerInside = false;
    let pointerX = 0;
    let pointerY = 0;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let targetAngle = 0;
    let currentAngle = 0;
    let targetScale = 1;
    let currentScale = 1;
    let lastFrameTime = 0;
    let lastPointerMoveTime = 0;
    let pressed = false;
    let cursorFrames = [];
    let middleFrames = [];
    let trailFrames = [];
    let trail = [];
    let settings = {
        centre: true,
        expand: true,
        rotate: false,
        trailRotate: false,
        size: 1,
        frameRate: 60
    };

    function readBool(value, fallback) {
        if (value === undefined || value === null || value === '') return fallback;
        if (typeof value === 'boolean') return value;
        const normalized = String(value).trim().toLowerCase();
        if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
        if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
        return fallback;
    }

    function readNumber(value, fallback) {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function getGeneral() {
        return (typeof currentSkinMetadata !== 'undefined' && currentSkinMetadata && currentSkinMetadata.general)
            ? currentSkinMetadata.general
            : {};
    }

    function readSettings() {
        const general = getGeneral();
        settings.centre = readBool(general.CursorCentre, true);
        settings.expand = readBool(general.CursorExpand, true);
        settings.rotate = readBool(general.CursorRotate, false);
        settings.trailRotate = readBool(general.CursorTrailRotate, false);
        settings.size = CURSOR_BASE_SCALE * Math.max(0.05, readNumber(general.CursorSize, 1));
        settings.frameRate = Math.max(1, readNumber(general.AnimationFramerate, 60));
    }

    function readFrames(store, name) {
        if (typeof getSkinAnimationFramesFromStore !== 'function' || !store || !name) return [];
        return getSkinAnimationFramesFromStore(store, name) || [];
    }

    function isUsableFrame(frame) {
        return !!frame && frame.width > 1 && frame.height > 1 &&
            !frame._isTransparent1x1 && !frame._isBlankPlaceholder;
    }

    function findSkinFrames(store, names) {
        let found = false;
        for (const name of names) {
            const frames = readFrames(store, name);
            if (!frames || frames.length === 0) continue;
            found = true;
            const usable = frames.filter(isUsableFrame);
            if (usable.length > 0) return { found: true, frames: usable };
        }
        return { found, frames: [] };
    }

    function loadSkinFrames(names, useDefaultFallback) {
        let result = findSkinFrames(skinImageStore, names);
        if (result.frames.length > 0) return result.frames;
        // An explicitly blank texture disables the element in stable and must not fall through to the default skin.
        if (result.found) return [];

        result = findSkinFrames(skinFallbackImageStore, names);
        if (result.frames.length > 0) return result.frames;
        if (result.found) return [];

        if (useDefaultFallback) {
            result = findSkinFrames(defaultSkinImageStore, names);
            if (result.frames.length > 0) return result.frames;
            result = findSkinFrames(defaultSkinFallbackStore, names);
            if (result.frames.length > 0) return result.frames;
        }
        return [];
    }

    function ensureLayer() {
        if (layer) return;
        layer = document.createElement('canvas');
        layer.id = 'skinCursorLayer';
        layer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(layer);
        layerCtx = layer.getContext('2d');
        resizeLayer();
    }

    function resizeLayer() {
        if (!layer || !layerCtx) return;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = Math.max(1, Math.round(window.innerWidth));
        const height = Math.max(1, Math.round(window.innerHeight));
        layer.width = Math.round(width * dpr);
        layer.height = Math.round(height * dpr);
        layer.style.width = width + 'px';
        layer.style.height = height + 'px';
        layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        requestRender();
    }

    function setLayerVisible(visible) {
        if (!layer) return;
        layer.style.visibility = visible ? 'visible' : 'hidden';
    }

    function clearLayer() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        if (!layer || !layerCtx) return;
        // Clear the real device-pixel buffer; a DPR-scaled clearRect can leave a partial bottom row.
        layerCtx.save();
        layerCtx.setTransform(1, 0, 0, 1, 0, 0);
        layerCtx.clearRect(0, 0, layer.width, layer.height);
        layerCtx.restore();
    }

    function leavePointerSurface() {
        pointerInside = false;
        pressed = false;
        resetTrail();
        clearLayer();
        setLayerVisible(false);
    }

    function attachLayerToFullscreenHost() {
        if (!layer) return;
        const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
        const host = fullscreenElement || document.body;
        if (host && layer.parentNode !== host) {
            host.appendChild(layer);
        }
        resizeLayer();
    }

    function getFrame(frames, now) {
        if (!frames || frames.length === 0) return null;
        if (frames.length === 1) return frames[0];
        const index = Math.floor((now / 1000) * settings.frameRate) % frames.length;
        return frames[index] || frames[0];
    }

    function getDisplaySize(image) {
        if (!image || image.width <= 0 || image.height <= 0) return { width: 0, height: 0 };
        const nativeScale = image._is2x ? 0.5 : 1;
        return {
            width: image.width * nativeScale * settings.size,
            height: image.height * nativeScale * settings.size
        };
    }

    function resetTrail() {
        trail = [];
    }

    function pushTrailPoint(now) {
        if (!pointerInside || trailFrames.length === 0) return;
        const last = trail[trail.length - 1];
        if (last && Math.hypot(pointerX - last.x, pointerY - last.y) < 1.2) return;
        trail.push({ x: pointerX, y: pointerY, angle: targetAngle, time: now });
        if (trail.length > TRAIL_MAX_POINTS) trail.splice(0, trail.length - TRAIL_MAX_POINTS);
    }

    function easeAngle(from, to, amount) {
        let delta = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
        if (delta < -Math.PI) delta += Math.PI * 2;
        return from + delta * amount;
    }

    function drawFrame(now) {
        rafId = 0;
        if (!active || !pointerInside || !layerCtx) return;

        const dt = lastFrameTime > 0 ? Math.min(0.05, (now - lastFrameTime) / 1000) : 0.016;
        lastFrameTime = now;

        const cursorFrame = getFrame(pressed && middleFrames.length > 0 ? middleFrames : cursorFrames, now);
        if (!cursorFrame) return;

        if (settings.rotate) {
            currentAngle = easeAngle(currentAngle, targetAngle, Math.min(1, dt * ROTATION_EASE));
        } else {
            currentAngle = 0;
        }

        const desiredScale = pressed && settings.expand ? 1.1 : 1;
        targetScale = desiredScale;
        currentScale += (targetScale - currentScale) * Math.min(1, dt * SCALE_EASE);

        const cursorSize = getDisplaySize(cursorFrame);
        const cursorW = cursorSize.width * currentScale;
        const cursorH = cursorSize.height * currentScale;
        const cursorHotX = settings.centre ? -cursorW / 2 : 0;
        const cursorHotY = settings.centre ? -cursorH / 2 : 0;

        clearLayer();

        if (trailFrames.length > 0) {
            const trailFrame = getFrame(trailFrames, now);
            const trailSize = getDisplaySize(trailFrame);
            for (const point of trail) {
                const age = (now - point.time) / TRAIL_LIFETIME_MS;
                if (age < 0 || age > 1) continue;
                const alpha = Math.pow(1 - age, 1.65) * 0.72;
                if (alpha <= 0.01) continue;
                const pointScale = 0.55 + (1 - age) * 0.45;
                layerCtx.save();
                layerCtx.globalAlpha = alpha;
                layerCtx.translate(point.x, point.y);
                if (settings.trailRotate) layerCtx.rotate(point.angle);
                layerCtx.drawImage(
                    trailFrame,
                    -trailSize.width * pointScale / 2,
                    -trailSize.height * pointScale / 2,
                    trailSize.width * pointScale,
                    trailSize.height * pointScale
                );
                layerCtx.restore();
            }
        }

        layerCtx.save();
        layerCtx.translate(pointerX, pointerY);
        layerCtx.rotate(currentAngle);
        layerCtx.drawImage(cursorFrame, cursorHotX, cursorHotY, cursorW, cursorH);
        layerCtx.restore();

        const hasTrail = trail.some(function (point) { return now - point.time <= TRAIL_LIFETIME_MS; });
        const stillMoving = now - lastPointerMoveTime < 120;
        const stillScaling = Math.abs(currentScale - targetScale) > 0.002;
        if (hasTrail || stillMoving || stillScaling || cursorFrames.length > 1 || middleFrames.length > 1 || trailFrames.length > 1) {
            requestRender();
        }
    }

    function requestRender() {
        if (!active || !pointerInside || rafId) return;
        rafId = requestAnimationFrame(drawFrame);
    }

    function setPointerPosition(event) {
        if (
            event.clientX < 0 ||
            event.clientY < 0 ||
            event.clientX >= window.innerWidth ||
            event.clientY >= window.innerHeight - POINTER_EXIT_GUARD_PX
        ) {
            leavePointerSurface();
            return;
        }

        const now = performance.now();
        const dx = event.clientX - lastPointerX;
        const dy = event.clientY - lastPointerY;
        const distance = Math.hypot(dx, dy);
        if (distance > 0.5) {
            targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
            lastPointerX = event.clientX;
            lastPointerY = event.clientY;
            lastPointerMoveTime = now;
        }
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerInside = true;
        setLayerVisible(true);
        pushTrailPoint(now);
        requestRender();
    }

    function handlePointerEnter(event) {
        pointerInside = true;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        setPointerPosition(event);
    }

    function handlePointerLeave(event) {
        if (event.relatedTarget) return;
        leavePointerSurface();
    }

    function handlePointerDown(event) {
        if (!active) return;
        pressed = true;
        setPointerPosition(event);
    }

    function handlePointerUp(event) {
        if (!active) return;
        pressed = false;
        setPointerPosition(event);
    }

    function setActive(nextActive) {
        active = nextActive;
        pointerInside = false;
        pressed = false;
        resetTrail();
        clearLayer();
        if (layer) {
            layer.style.display = active ? 'block' : 'none';
            setLayerVisible(false);
        }
        document.documentElement.classList.toggle('skin-cursor-active', active);
    }

    function refreshSkinCursor() {
        if (typeof skinImageStore === 'undefined') return;
        ensureLayer();
        readSettings();

        cursorFrames = loadSkinFrames(['cursor'], true);
        middleFrames = loadSkinFrames(['cursormiddle', 'cursor-middle'], true);
        trailFrames = loadSkinFrames(['cursortrail', 'cursor-trail'], true);

        if (cursorFrames.length === 0 && middleFrames.length > 0) {
            cursorFrames = middleFrames;
        }

        if (cursorFrames.length === 0) {
            setActive(false);
            return;
        }

        setActive(true);
        requestRender();
    }

    function refreshSkinCursorSettings() {
        readSettings();
        requestRender();
    }

    function init() {
        ensureLayer();
        attachLayerToFullscreenHost();
        window.addEventListener('resize', resizeLayer, { passive: true });
        document.addEventListener('fullscreenchange', attachLayerToFullscreenHost);
        document.addEventListener('webkitfullscreenchange', attachLayerToFullscreenHost);
        window.addEventListener('pointermove', setPointerPosition, { passive: true, capture: true });
        window.addEventListener('pointerdown', handlePointerDown, { passive: true, capture: true });
        window.addEventListener('pointerup', handlePointerUp, { passive: true, capture: true });
        window.addEventListener('pointerout', handlePointerLeave, { passive: true, capture: true });
        window.addEventListener('pointerleave', handlePointerLeave, { passive: true, capture: true });
        window.addEventListener('mouseout', handlePointerLeave, { passive: true, capture: true });
        window.addEventListener('mouseleave', handlePointerLeave, { passive: true, capture: true });
        window.addEventListener('blur', function () {
            leavePointerSurface();
        });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) leavePointerSurface();
        });
        window.addEventListener('pagehide', leavePointerSurface, { passive: true });
        document.addEventListener('pointerenter', handlePointerEnter, { passive: true });
        document.addEventListener('pointerleave', handlePointerLeave, { passive: true });
        window.refreshSkinCursor = refreshSkinCursor;
        window.refreshSkinCursorSettings = refreshSkinCursorSettings;
        refreshSkinCursor();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
