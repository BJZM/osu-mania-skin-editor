// 选歌曲库：把已导入谱面（或示例曲库）整理成 stable 的分组、排序和搜索结果。
// 文案对齐本机 osu! Localisation/zh-CHS.txt 的 SongSelection_* / BeatmapTreeManager_*。
(function (window) {
    'use strict';

    const GROUPS = ['none', 'difficulty', 'artist', 'recent', 'collections'];
    const SORTS = ['artist', 'title', 'bpm', 'creator', 'length', 'difficulty'];

    const COPY = {
        zh: {
            by: '作者：{0}',
            length: '长度：{0}　BPM：{1}　物件数：{2}',
            objects: '圈数：{0}　滑条数：{1}　转盘数：{2}',
            diffLine: '键数：{0}　OD：{1}　HP：{2}　星级：{3}',
            search: '搜索：',
            typeToBegin: '直接输入搜索内容',
            matches: '找到{0}个结果！',
            local: '本地排行',
            noRecord: '尚无个人记录',
            group: '分组',
            sort: '排序',
            none: '不分组',
            artist: '艺术家',
            difficulty: '难度★',
            recent: '最近玩过的',
            collections: '收藏夹',
            title: '标题',
            creator: '作图者',
            bpm: 'BPM',
            lengthSort: '长度',
            never: '从来没有',
            emptyCollections: '没有收藏',
            selectSong: '请选择一首歌曲！',
            guest: 'Guest'
        },
        en: {
            by: 'Mapped by {0}',
            length: 'Length: {0}  BPM: {1}  Objects: {2}',
            objects: 'Circles: {0}  Sliders: {1}  Spinners: {2}',
            diffLine: 'Keys: {0}  OD: {1}  HP: {2}  Stars: {3}',
            search: 'Search:',
            typeToBegin: 'Type to search!',
            matches: '{0} matches found!',
            local: 'Local Ranking',
            noRecord: 'No records set!',
            group: 'Group',
            sort: 'Sort',
            none: 'No Grouping',
            artist: 'Artist',
            difficulty: 'Difficulty',
            recent: 'Recently Played',
            collections: 'Collections',
            title: 'Title',
            creator: 'Creator',
            bpm: 'BPM',
            lengthSort: 'Length',
            never: 'Never',
            emptyCollections: 'No collections',
            selectSong: 'Select a song!',
            guest: 'Guest'
        }
    };

    const DEMO = [
        setDemo('glass', 'Glass Arcade', 'Kite & June', 'maple', false, 152, [
            diffDemo('Light', 4, 1.86, 5, 4, 168, 102000, 210, 38),
            diffDemo('Normal', 4, 2.74, 7, 5, 168, 102000, 340, 72)
        ]),
        setDemo('lantern', 'Paper Lanterns', 'Hoshino Rin', 'nori', true, 206, [
            diffDemo('Rain', 4, 3.42, 7, 6, 176, 128000, 410, 90),
            diffDemo('Storm', 7, 4.18, 8, 6, 176, 128000, 510, 180)
        ]),
        setDemo('market', 'Night Market', 'Sora Line', 'quill', false, 42, [
            diffDemo('4K', 4, 5.1, 8, 7, 190, 154000, 620, 140)
        ])
    ];

    function setDemo(id, title, artist, creator, played, hue, diffs) {
        return { id: id, title: title, artist: artist, creator: creator, played: played, hue: hue, diffs: diffs, beatmapBacked: false };
    }

    function diffDemo(version, keys, stars, od, hp, bpm, lengthMs, notes, holds) {
        return {
            version: version, keys: keys, stars: stars, od: od, hp: hp, ar: null,
            bpm: bpm, lengthMs: lengthMs, notes: notes, holds: holds, spinners: 0,
            beatmapIndex: null
        };
    }

    function copy() {
        const en = window.I18n && window.I18n.getLanguage() === 'en';
        return en ? COPY.en : COPY.zh;
    }

    function label(id) {
        return copy()[id] || id;
    }

    function fmt(template, values) {
        return String(template).replace(/\{(\d+)\}/g, function (_, index) {
            const value = values[Number(index)];
            return value == null || value === '' ? '—' : String(value);
        });
    }

    function formatCount(value) {
        const n = Math.round(Number(value) || 0);
        return n.toLocaleString('en-US');
    }

    function formatLength(ms) {
        if (!Number.isFinite(ms) || ms < 0) return '—';
        const total = Math.round(ms / 1000);
        const min = Math.floor(total / 60);
        const sec = total % 60;
        return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }

    function formatStat(value, digits) {
        if (!Number.isFinite(value)) return '—';
        const factor = Math.pow(10, digits);
        return String(Math.round(value * factor) / factor);
    }

    function bpmOf(points, fallback) {
        const red = (points || []).filter(function (tp) {
            return tp && tp.uninherited !== false && tp.beatLength > 0;
        });
        if (!red.length) return Number.isFinite(fallback) ? Math.round(fallback) : null;
        const values = red.map(function (tp) { return 60000 / tp.beatLength; });
        return { min: Math.round(Math.min.apply(null, values)), max: Math.round(Math.max.apply(null, values)) };
    }

    function bpmLabel(bpm) {
        if (bpm == null) return '—';
        if (typeof bpm === 'number') return String(bpm);
        return bpm.min === bpm.max ? String(bpm.min) : (bpm.min + '-' + bpm.max);
    }

    function createSession() {
        return {
            group: 'none',
            sort: 'artist',
            query: '',
            expandedSetId: 'lantern',
            selectedKey: 'lantern:0',
            collapsed: {},
            previousKey: null,
            sets: DEMO,
            rows: [],
            selected: null
        };
    }

    function setsFromBeatmaps(list) {
        const grouped = new Map();
        list.forEach(function (bm, index) {
            const meta = (bm.data && bm.data.metadata) || {};
            const id = [meta.title || '', meta.artist || '', meta.creator || ''].join('\n');
            if (!grouped.has(id)) {
                grouped.set(id, {
                    id: 'set:' + grouped.size,
                    title: meta.titleUnicode || meta.title || 'Untitled',
                    artist: meta.artistUnicode || meta.artist || 'Unknown',
                    creator: meta.creator || 'Unknown',
                    played: false,
                    hue: 196,
                    beatmapBacked: true,
                    diffs: []
                });
            }
            const difficulty = (bm.data && bm.data.difficulty) || {};
            const stats = bm.stats || {};
            const bpm = bpmOf(bm.timingPoints, null);
            grouped.get(id).diffs.push({
                version: meta.version || ((stats.keys || 4) + 'K'),
                keys: stats.keys || Math.round(difficulty.circleSize) || 4,
                stars: null,
                od: Number.isFinite(difficulty.overallDifficulty) ? difficulty.overallDifficulty : null,
                hp: Number.isFinite(difficulty.hpDrainRate) ? difficulty.hpDrainRate : null,
                ar: Number.isFinite(difficulty.approachRate) ? difficulty.approachRate : null,
                bpm: bpm,
                lengthMs: stats.lengthMs,
                notes: stats.notes || 0,
                holds: stats.holds || 0,
                spinners: 0,
                beatmapIndex: index
            });
        });
        grouped.forEach(function (set) {
            set.diffs.sort(function (a, b) {
                return (a.keys - b.keys) || String(a.version).localeCompare(String(b.version));
            });
        });
        return Array.from(grouped.values());
    }

    function diffKey(set, index) {
        return set.id + ':' + index;
    }

    function sortValue(set, diff, mode) {
        if (mode === 'title') return set.title.toLowerCase();
        if (mode === 'creator') return set.creator.toLowerCase();
        if (mode === 'bpm') return typeof diff.bpm === 'number' ? diff.bpm : (diff.bpm ? diff.bpm.max : 0);
        if (mode === 'length') return diff.lengthMs || 0;
        if (mode === 'difficulty') return diff.stars != null ? diff.stars : (diff.keys || 0);
        return set.artist.toLowerCase();
    }

    function matches(set, diff, query) {
        const hay = [set.title, set.artist, set.creator, diff.version].join('\n').toLowerCase();
        return query.split(/\s+/).every(function (part) { return part && hay.indexOf(part) !== -1; });
    }

    function visibleSets(session) {
        const query = session.query.trim().toLowerCase();
        const sets = session.sets.map(function (set) {
            const diffs = set.diffs.map(function (diff, index) {
                return Object.assign({}, diff, { sourceIndex: index });
            }).filter(function (diff) {
                return !query || matches(set, diff, query);
            });
            return diffs.length ? Object.assign({}, set, { diffs: diffs }) : null;
        }).filter(Boolean);
        const mode = session.sort;
        sets.sort(function (a, b) {
            const av = sortValue(a, a.diffs[0], mode);
            const bv = sortValue(b, b.diffs[0], mode);
            if (typeof av === 'number' && typeof bv === 'number') return av - bv;
            return String(av).localeCompare(String(bv));
        });
        return sets;
    }

    function groupName(set, mode) {
        const text = copy();
        if (mode === 'artist') return (set.artist || '?').charAt(0).toUpperCase();
        if (mode === 'difficulty') {
            const stars = set.diffs.map(function (diff) { return diff.stars; }).filter(function (n) { return n != null; });
            if (stars.length) return '★ ' + Math.floor(Math.max.apply(null, stars));
            const keys = Math.min.apply(null, set.diffs.map(function (diff) { return diff.keys || 0; }));
            return keys + 'K';
        }
        if (mode === 'recent') return text.never;
        if (mode === 'collections') return text.collections;
        return '';
    }

    function project(session) {
        const text = copy();
        if (session.group === 'collections') {
            session.rows = [{ kind: 'empty', key: 'empty', title: text.emptyCollections }];
            return;
        }
        const sets = visibleSets(session);
        const rows = [];
        if (session.group === 'none') {
            pushSets(rows, sets, session);
        } else {
            const buckets = new Map();
            sets.forEach(function (set) {
                const name = groupName(set, session.group);
                if (!buckets.has(name)) buckets.set(name, []);
                buckets.get(name).push(set);
            });
            Array.from(buckets.keys()).sort(function (a, b) { return String(a).localeCompare(String(b)); }).forEach(function (name) {
                rows.push({ kind: 'group', key: 'group:' + name, title: name });
                if (!session.collapsed[name]) pushSets(rows, buckets.get(name), session);
            });
        }
        session.rows = rows;
    }

    function pushSets(rows, sets, session) {
        sets.forEach(function (set) {
            rows.push({
                kind: 'set',
                key: set.id,
                setId: set.id,
                title: set.title,
                artist: set.artist,
                creator: set.creator,
                played: set.played,
                hue: set.hue,
                beatmapBacked: set.beatmapBacked
            });
            if (session.expandedSetId !== set.id) return;
            set.diffs.forEach(function (diff) {
                const index = diff.sourceIndex != null ? diff.sourceIndex : 0;
                rows.push({
                    kind: 'diff',
                    key: diffKey(set, index),
                    setId: set.id,
                    diffIndex: index,
                    title: set.title,
                    artist: set.artist,
                    creator: set.creator,
                    version: diff.version,
                    played: set.played,
                    hue: set.hue,
                    beatmapBacked: set.beatmapBacked,
                    beatmapIndex: diff.beatmapIndex,
                    stars: diff.stars,
                    keys: diff.keys
                });
            });
        });
    }

    function findSelection(session) {
        for (let i = 0; i < session.sets.length; i++) {
            const set = session.sets[i];
            for (let d = 0; d < set.diffs.length; d++) {
                if (diffKey(set, d) === session.selectedKey) return { set: set, diff: set.diffs[d], index: d };
            }
        }
        return null;
    }

    function infoFor(session) {
        const text = copy();
        const found = findSelection(session);
        if (!found) return { lines: [text.selectSong], bpm: 60 };
        const diff = found.diff;
        const set = found.set;
        const stars = diff.stars == null ? '—' : formatStat(diff.stars, 2);
        return {
            bpm: typeof diff.bpm === 'number' ? diff.bpm : (diff.bpm ? diff.bpm.max : 60),
            lines: [
                set.artist + ' - ' + set.title + ' [' + diff.version + ']',
                fmt(text.by, [set.creator]),
                fmt(text.length, [formatLength(diff.lengthMs), bpmLabel(diff.bpm), formatCount((diff.notes || 0) + (diff.holds || 0))]),
                fmt(text.objects, [formatCount(diff.notes), formatCount(diff.holds), formatCount(diff.spinners)]),
                fmt(text.diffLine, [diff.keys, formatStat(diff.od, 1), formatStat(diff.hp, 1), stars])
            ]
        };
    }

    function rebuild(session, beatmaps, currentBeatmap) {
        const list = Array.isArray(beatmaps) ? beatmaps : [];
        session.sets = list.length ? setsFromBeatmaps(list) : DEMO.map(function (set) {
            return Object.assign({}, set, { diffs: set.diffs.slice() });
        });
        if (list.length && currentBeatmap) {
            session.sets.forEach(function (set) {
                set.diffs.forEach(function (diff, index) {
                    const source = list[diff.beatmapIndex];
                    if (source && source.data === currentBeatmap) {
                        session.selectedKey = diffKey(set, index);
                        session.expandedSetId = set.id;
                    }
                });
            });
        }
        if (!findSelection(session)) {
            const first = session.sets[0];
            session.expandedSetId = first ? first.id : null;
            session.selectedKey = first ? diffKey(first, 0) : null;
        }
        session.selected = findSelection(session);
        project(session);
    }

    function selectKey(session, key) {
        const previous = session.selectedKey;
        session.selectedKey = key;
        const found = findSelection(session);
        if (!found) {
            session.selectedKey = previous;
            return null;
        }
        session.previousKey = previous;
        session.expandedSetId = found.set.id;
        session.selected = found;
        project(session);
        return found;
    }

    function selectedRowIndex(session) {
        const key = session.selectedKey;
        for (let i = 0; i < session.rows.length; i++) {
            if (session.rows[i].key === key) return i;
        }
        const setId = session.expandedSetId;
        for (let i = 0; i < session.rows.length; i++) {
            if (session.rows[i].key === setId) return i;
        }
        return 0;
    }

    function cycle(list, current, dir) {
        const index = Math.max(0, list.indexOf(current));
        return list[(index + dir + list.length) % list.length];
    }

    window.SongSelectCatalog = {
        GROUPS: GROUPS,
        SORTS: SORTS,
        createSession: createSession,
        copy: copy,
        label: label,
        rebuild: rebuild,
        project: project,
        selectKey: selectKey,
        selectedRowIndex: selectedRowIndex,
        infoFor: infoFor,
        cycle: cycle,
        diffKey: diffKey
    };
})(window);
