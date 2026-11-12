// osu!stable 选歌预览的输入与帧循环。
// 滚轮、左右键、方向键、搜索和 F2 随机对应 stable 选歌的操作；双击难度或点右下角 Cookie 进入游戏内预览。
(function (window) {
    'use strict';

    const Catalog = function () { return window.SongSelectCatalog; };
    const Layout = function () { return window.SongSelectLayout; };

    let canvas = null;
    let ctx = null;
    let running = false;
    let frame = 0;
    let session = null;
    let scroll = 0;
    let target = 0;
    let hoverIndex = -1;
    let hoverFooter = null;
    let hits = null;
    let dragging = false;
    let dragLastY = 0;
    let dragMoved = false;
    let mouse = { x: -1000, y: -1000 };
    const images = new Map();

    const SOURCES = {
        'menu-background': 'assets/default_skin/menu-background.jpg',
        'menu-button-background': 'assets/default_skin/menu-button-background.png',
        'menu-osu': 'assets/default_skin/menu-osu.png',
        'songselect-top': 'assets/default_skin/songselect-top.png',
        'songselect-bottom': 'assets/default_skin/songselect-bottom.png',
        'selection-tab': 'assets/default_skin/selection-tab.png',
        'selection-mode': 'assets/default_skin/selection-mode.png',
        'selection-mode-over': 'assets/default_skin/selection-mode-over@2x.png',
        'selection-mods': 'assets/default_skin/selection-mods.png',
        'selection-mods-over': 'assets/default_skin/selection-mods-over@2x.png',
        'selection-random': 'assets/default_skin/selection-random.png',
        'selection-random-over': 'assets/default_skin/selection-random-over@2x.png',
        'selection-options': 'assets/default_skin/selection-options.png',
        'selection-options-over': 'assets/default_skin/selection-options-over@2x.png',
        'mode-mania-small': 'assets/default_skin/mode-mania-small@2x.png',
        'star': 'assets/default_skin/star@2x.png',
        'star2': 'assets/default_skin/star2@2x.png'
    };

    Object.keys(SOURCES).forEach(function (key) {
        const image = new Image();
        if (/@2x/.test(SOURCES[key])) image._is2x = true;
        image.src = SOURCES[key];
        images.set(key, image);
    });

    function pickAnimFrame(frames, timeMs) {
        if (!frames || !frames.length) return null;
        if (frames.length === 1) return frames[0];
        const fps = (typeof getSkinAnimationFramerate === 'function')
            ? getSkinAnimationFramerate()
            : 60;
        const idx = Math.floor(Math.max(0, timeMs || 0) / 1000 * Math.max(1, fps)) % frames.length;
        return frames[idx] || frames[0];
    }

    function getTexture(name, timeMs) {
        if (typeof skinImageStore !== 'undefined') {
            let userImg = null;
            if (typeof getSkinAnimationFramesFromStore === 'function') {
                userImg = pickAnimFrame(getSkinAnimationFramesFromStore(skinImageStore, name, true), timeMs);
            } else if (typeof getSkinAnimationFromStore === 'function') {
                userImg = getSkinAnimationFromStore(skinImageStore, name);
            } else {
                userImg = skinImageStore.get(name + '.png') || skinImageStore.get(name);
            }
            if (userImg && userImg.complete && userImg.width > 0) return userImg;
        }
        if (typeof defaultSkinImageStore !== 'undefined') {
            let defImg = null;
            if (typeof getSkinAnimationFramesFromStore === 'function') {
                defImg = pickAnimFrame(getSkinAnimationFramesFromStore(defaultSkinImageStore, name, true), timeMs);
            } else if (typeof getSkinAnimationFromStore === 'function') {
                defImg = getSkinAnimationFromStore(defaultSkinImageStore, name);
            } else {
                defImg = defaultSkinImageStore.get(name + '.png');
            }
            if (defImg && defImg.complete && defImg.width > 0) return defImg;
        }
        const cached = images.get(name);
        if (cached && cached.complete && cached.width > 0) return cached;
        return null;
    }

    function hasCustomTexture(name) {
        if (typeof skinImageStore === 'undefined' || !skinImageStore) return false;
        if (typeof getSkinAnimationFramesFromStore === 'function') {
            const frames = getSkinAnimationFramesFromStore(skinImageStore, name, true);
            return !!(frames && frames.length > 0 && frames[0] && frames[0].complete && frames[0].width > 1);
        }
        return false;
    }

    function ensureSession() {
        if (!session) session = Catalog().createSession();
        return session;
    }

    function importedBeatmaps() {
        return (typeof beatmaps !== 'undefined' && Array.isArray(beatmaps)) ? beatmaps : [];
    }

    function updateCarouselData() {
        const current = ensureSession();
        Catalog().rebuild(current, importedBeatmaps(), typeof currentBeatmap !== 'undefined' ? currentBeatmap : null);
        target = Catalog().selectedRowIndex(current);
        scroll = target;
    }

    function init(targetCanvas) {
        canvas = targetCanvas || document.getElementById('songSelectCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('dblclick', onDblClick);
        canvas.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('keydown', onKey, true);
    }

    function localPoint(event) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    function onMouseMove(event) {
        if (!canvas) return;
        mouse = localPoint(event);
        if (!dragging || !hits) return;
        const metrics = Layout().metrics(canvas.width, canvas.height);
        const dy = mouse.y - dragLastY;
        if (Math.abs(dy) > 2) dragMoved = true;
        dragLastY = mouse.y;
        target = clampScroll(target - dy / ((metrics.rowH || metrics.panelH) + metrics.gap));
    }

    function onMouseLeave() {
        mouse = { x: -1000, y: -1000 };
        hoverIndex = -1;
        dragging = false;
    }

    function onWheel(event) {
        if (!running) return;
        event.preventDefault();
        const current = ensureSession();
        target = clampScroll(target + Math.sign(event.deltaY));
        const row = current.rows[Math.round(target)];
        if (row && row.kind === 'diff') applySelection(row);
    }

    function onMouseDown(event) {
        if (event.button !== 0) return;
        dragging = true;
        dragMoved = false;
        dragLastY = localPoint(event).y;
    }

    function onMouseUp() {
        dragging = false;
    }

    function hitContains(rect, point) {
        if (!rect) return false;
        return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
    }

    function onClick() {
        if (!running || !hits || dragMoved) return;
        const point = mouse;
        const current = ensureSession();
        if (hitContains(hits.footer.back, point)) {
            if (typeof window.setStageView === 'function') window.setStageView('main-menu');
            return;
        }
        if (hitContains(hits.footer.random, point)) {
            pickRandom(false);
            return;
        }
        if (hitContains(hits.footer.cookie, point)) {
            enterGameplay();
            return;
        }
        if (hitContains(hits.wedge, point)) return;
        if (hitContains(hits.groupBox, point)) {
            current.group = Catalog().cycle(Catalog().GROUPS, current.group, 1);
            current.collapsed = {};
            Catalog().project(current);
            target = Catalog().selectedRowIndex(current);
            return;
        }
        if (hitContains(hits.sortBox, point)) {
            current.sort = Catalog().cycle(Catalog().SORTS, current.sort, 1);
            Catalog().project(current);
            target = Catalog().selectedRowIndex(current);
            return;
        }
        for (let i = 0; i < hits.tabs.length; i++) {
            if (hitContains(hits.tabs[i], point)) {
                current.group = hits.tabs[i].id;
                current.collapsed = {};
                Catalog().project(current);
                target = Catalog().selectedRowIndex(current);
                return;
            }
        }
        for (let i = 0; i < hits.rows.length; i++) {
            const rect = hits.rows[i];
            if (!hitContains(rect, point)) continue;
            const row = current.rows[rect.index];
            if (!row) return;
            if (row.kind === 'group') {
                const name = row.title;
                current.collapsed[name] = !current.collapsed[name];
                Catalog().project(current);
                target = Catalog().selectedRowIndex(current);
                return;
            }
            if (row.kind === 'set') {
                current.expandedSetId = current.expandedSetId === row.key ? null : row.key;
                if (current.expandedSetId) {
                    const found = current.sets.filter(function (set) { return set.id === row.key; })[0];
                    if (found && found.diffs[0]) {
                        applySelection({ key: Catalog().diffKey(found, 0) });
                        return;
                    }
                }
                Catalog().project(current);
                target = Catalog().selectedRowIndex(current);
                return;
            }
            if (row.kind === 'diff') applySelection(row);
        }
    }

    function onDblClick() {
        if (!running) return;
        const current = ensureSession();
        const row = current.rows[hoverIndex];
        if (row && row.kind === 'diff' && row.key === current.selectedKey) enterGameplay();
    }

    function onContextMenu(event) {
        if (!running || !canvas) return;
        event.preventDefault();
        const point = localPoint(event);
        const metrics = Layout().metrics(canvas.width, canvas.height);
        const span = metrics.carouselBottom - metrics.carouselTop;
        const ratio = span > 0 ? (point.y - metrics.carouselTop) / span : 0;
        const current = ensureSession();
        target = clampScroll(ratio * Math.max(0, current.rows.length - 1));
    }

    function typingTarget(event) {
        const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'textarea' || tag === 'select' || (event.target && event.target.isContentEditable);
    }

    function modalOpen() {
        return !!document.querySelector('#skinEditorModal.active, #textureImageEditorModal.active, #textureUploadModal[style*="block"], #aboutModal[style*="block"], #helpModal[style*="block"]');
    }

    function onKey(event) {
        if (!running || typingTarget(event) || modalOpen()) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const current = ensureSession();
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (current.query) {
                current.query = '';
                Catalog().project(current);
                target = Catalog().selectedRowIndex(current);
            } else if (typeof window.setStageView === 'function') {
                window.setStageView('main-menu');
            }
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            moveSelection(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            enterGameplay();
            return;
        }
        if (event.key === 'F2') {
            event.preventDefault();
            event.stopPropagation();
            pickRandom(event.shiftKey);
            return;
        }
        if (event.key === 'Backspace') {
            event.preventDefault();
            event.stopPropagation();
            current.query = current.query.slice(0, -1);
            Catalog().project(current);
            target = Catalog().selectedRowIndex(current);
            return;
        }
        if (event.key.length === 1) {
            event.preventDefault();
            event.stopPropagation();
            current.query = (current.query + event.key).slice(0, 60);
            Catalog().project(current);
            target = Catalog().selectedRowIndex(current);
        }
    }

    function moveSelection(dir) {
        const current = ensureSession();
        let index = Catalog().selectedRowIndex(current);
        for (let step = 0; step < current.rows.length; step++) {
            index = clampScroll(index + dir);
            const row = current.rows[index];
            if (row && row.kind === 'diff') {
                applySelection(row);
                target = index;
                return;
            }
        }
    }

    function applySelection(row) {
        const found = Catalog().selectKey(ensureSession(), row.key);
        target = Catalog().selectedRowIndex(ensureSession());
        if (!found || found.diff.beatmapIndex == null) return;
        if (typeof loadBeatmapDifficulty !== 'function') return;
        const source = importedBeatmaps()[found.diff.beatmapIndex];
        if (source && source.data !== currentBeatmap) loadBeatmapDifficulty(found.diff.beatmapIndex);
    }

    function pickRandom(restore) {
        const current = ensureSession();
        if (restore && current.previousKey) {
            Catalog().selectKey(current, current.previousKey);
            target = Catalog().selectedRowIndex(current);
            return;
        }
        const diffs = current.rows.filter(function (row) { return row.kind === 'diff'; });
        if (!diffs.length) return;
        const row = diffs[Math.floor(Math.random() * diffs.length)];
        applySelection(row);
    }

    function enterGameplay() {
        if (typeof window.setStageView === 'function') window.setStageView('gameplay');
    }

    function clampScroll(value) {
        const rows = ensureSession().rows;
        if (!rows.length) return 0;
        return Math.max(0, Math.min(rows.length - 1, value));
    }

    function visibleResultCount(current) {
        return current.rows.filter(function (row) { return row.kind === 'set'; }).length;
    }

    function draw(now) {
        if (!canvas || !ctx) return;
        if (canvas.clientWidth > 0 && (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight)) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }
        const current = ensureSession();
        const list = importedBeatmaps();
        const stamp = list.length + ':' + (typeof currentBeatmap !== 'undefined' && currentBeatmap && currentBeatmap.metadata ? currentBeatmap.metadata.version : '');
        if (current.sourceStamp !== stamp) {
            current.sourceStamp = stamp;
            Catalog().rebuild(current, list, typeof currentBeatmap !== 'undefined' ? currentBeatmap : null);
            target = Catalog().selectedRowIndex(current);
            scroll = target;
        }
        const lang = window.I18n ? window.I18n.getLanguage() : 'zh-CN';
        if (current.lang !== lang) {
            current.lang = lang;
            Catalog().project(current);
        }
        scroll += (target - scroll) * 0.18;
        if (Math.abs(target - scroll) < 0.001) scroll = target;

        const width = canvas.width;
        const height = canvas.height;
        const buttonArt = getTexture('menu-button-background', now);
        const metrics = Layout().metrics(width, height, window.SongSelectPaint.sdBox(buttonArt));
        const placements = Layout().placeRows(current.rows, scroll, metrics);
        const text = Catalog().copy();
        const sortLabels = {
            artist: text.artist,
            title: text.title,
            bpm: text.bpm,
            creator: text.creator,
            length: text.lengthSort,
            difficulty: text.difficulty
        };
        const info = Catalog().infoFor(current);
        const bpm = info.bpm > 0 ? info.bpm : 60;
        const beat = ((now || 0) / (60000 / bpm)) % 1;
        const speed = (typeof scrollSpeed === 'number' && isFinite(scrollSpeed)) ? scrollSpeed : 24;
        const bg = (typeof canvasBgImage !== 'undefined' && canvasBgImage && canvasBgImage.complete && canvasBgImage.width > 0)
            ? canvasBgImage
            : getTexture('menu-background', now);
        ctx.clearRect(0, 0, width, height);
        hits = window.SongSelectPaint.draw(ctx, {
            width: width,
            height: height,
            now: now,
            mouse: mouse,
            metrics: metrics,
            placements: placements,
            rows: current.rows,
            selectedKey: current.selectedKey,
            expandedSetId: current.expandedSetId,
            hoverIndex: hoverIndex,
            hoverFooter: hoverFooter,
            beat: beat,
            scrollSpeed: speed,
            activeText: skinColour('SongSelectActiveText', null),
            inactiveText: skinColour('SongSelectInactiveText', null),
            group: current.group,
            query: current.query,
            info: info,
            background: bg,
            customButton: hasCustomTexture('menu-button-background'),
            getTexture: function (name) { return getTexture(name, now); },
            chrome: {
                group: text.group,
                sort: text.sort,
                groupValue: text[current.group] || text.none,
                sortValue: sortLabels[current.sort] || text.artist,
                tabs: {
                    none: text.none,
                    difficulty: text.difficulty,
                    artist: text.artist,
                    recent: text.recent,
                    collections: text.collections
                },
                search: text.search,
                placeholder: text.typeToBegin,
                result: text.matches.replace('{0}', String(visibleResultCount(current))),
                local: text.local,
                noRecord: text.noRecord,
                guest: text.guest
            }
        });
        hoverIndex = -1;
        hoverFooter = null;
        if (hits) {
            for (let i = 0; i < hits.rows.length; i++) {
                if (hitContains(hits.rows[i], mouse)) hoverIndex = hits.rows[i].index;
            }
            ['back', 'mode', 'mods', 'random', 'options'].forEach(function (id) {
                if (hits.footer && hitContains(hits.footer[id], mouse)) hoverFooter = id;
            });
        }
    }

    function skinColour(name, fallback) {
        const colours = (typeof currentSkinMetadata !== 'undefined' && currentSkinMetadata) ? currentSkinMetadata.colours : null;
        if (!colours) return fallback;
        const raw = colours[name] || colours[name.toLowerCase()];
        if (!raw) return fallback;
        const parts = String(raw).split(',');
        if (parts.length < 3) return fallback;
        const nums = parts.slice(0, 3).map(function (part) { return parseInt(part.trim(), 10); });
        if (nums.some(function (n) { return !isFinite(n); })) return fallback;
        return 'rgb(' + nums.join(',') + ')';
    }

    function start() {
        if (running) return;
        if (!canvas) init();
        if (!canvas) return;
        running = true;
        updateCarouselData();
        const loop = function (now) {
            if (!running) return;
            draw(now);
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
    }

    function stop() {
        running = false;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
    }

    window.SongSelectPreview = {
        init: init,
        start: start,
        stop: stop,
        draw: draw,
        updateCarouselData: updateCarouselData
    };
})(window);
