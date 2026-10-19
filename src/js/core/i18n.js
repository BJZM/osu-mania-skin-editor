// ============================================================================
// i18n.js - 界面语言切换、中文词条翻译与动态 DOM 本地化
// 依赖：core/i18n-dictionary.js
// ============================================================================

        (function initI18nModule() {
            const STORAGE_KEY = 'osu-mania-skin-editor.language';
            const DEFAULT_LANGUAGE = 'zh-CN';
            const SUPPORTED_LANGUAGES = new Set(['zh-CN', 'en']);
            const ATTRIBUTE_NAMES = ['title', 'placeholder', 'aria-label', 'alt'];
            const HAN_PATTERN = /[\u3400-\u9fff]/;
            const dictionary = window.OSU_I18N_EN || { exact: {}, patterns: [], fragments: [] };
            const exact = dictionary.exact || {};
            const html = dictionary.html || {};
            const exactReverse = new Map();
            const patterns = Array.isArray(dictionary.patterns) ? dictionary.patterns : [];
            const fragments = (Array.isArray(dictionary.fragments) ? dictionary.fragments : [])
                .slice()
                .sort((left, right) => right[0].length - left[0].length);
            const textNodeState = new WeakMap();
            const attributeState = new WeakMap();
            const htmlElementState = new WeakMap();
            const missing = new Set();
            let currentLanguage = DEFAULT_LANGUAGE;
            let observer = null;
            let isApplying = false;
            let pendingSweep = 0;

            for (const [source, translated] of Object.entries(exact)) {
                if (!exactReverse.has(translated)) exactReverse.set(translated, source);
            }

            function readStoredLanguage() {
                const queryLanguage = new URLSearchParams(window.location.search).get('lang');
                if (queryLanguage && SUPPORTED_LANGUAGES.has(queryLanguage)) {
                    return queryLanguage;
                }
                try {
                    const stored = window.localStorage.getItem(STORAGE_KEY);
                    if (SUPPORTED_LANGUAGES.has(stored)) return stored;
                } catch {
                    // file:// 或受限嵌入环境可能禁用 localStorage。
                }
                return DEFAULT_LANGUAGE;
            }

            function storeLanguage(language) {
                try {
                    window.localStorage.setItem(STORAGE_KEY, language);
                } catch {
                    // 语言切换本身不应因存储不可用而失败。
                }
            }

            function isIgnoredElement(element) {
                return !!element && !!element.closest('[data-i18n-ignore], [translate="no"]');
            }

            function translateFragments(source) {
                let translated = source;
                for (const [from, to] of fragments) {
                    if (translated.includes(from)) translated = translated.split(from).join(to);
                }
                return translated;
            }

            function translateChineseText(source) {
                const normalized = source.trim();
                if (!normalized) return source;
                if (Object.prototype.hasOwnProperty.call(exact, normalized)) return exact[normalized];

                for (const [pattern, replacement] of patterns) {
                    const match = normalized.match(pattern);
                    if (!match) continue;
                    return typeof replacement === 'function'
                        ? replacement(...match)
                        : normalized.replace(pattern, replacement);
                }

                // 片段替换只用于较短的状态与复合标签；长说明必须精确翻译，避免出现半中半英。
                return normalized.length <= 80 ? translateFragments(normalized) : source;
            }

            function translateValue(value) {
                if (typeof value !== 'string' || !HAN_PATTERN.test(value)) return value;
                const leading = value.match(/^\s*/)?.[0] || '';
                const trailing = value.match(/\s*$/)?.[0] || '';
                const body = value.slice(leading.length, value.length - trailing.length);
                if (!body) return value;

                if (body.includes('\n')) {
                    return body
                        .split('\n')
                        .map((line) => {
                            if (!HAN_PATTERN.test(line)) return line;
                            const indent = line.match(/^\s*/)?.[0] || '';
                            return indent + translateChineseText(line.slice(indent.length));
                        })
                        .join('\n');
                }

                return leading + translateChineseText(body) + trailing;
            }

            function applyTextNode(node) {
                if (!node || node.nodeType !== Node.TEXT_NODE) return;
                const parent = node.parentElement;
                if (!parent || isIgnoredElement(parent)) return;
                if (/^(SCRIPT|STYLE|TEXTAREA)$/.test(parent.tagName)) return;

                const current = node.nodeValue || '';
                const state = textNodeState.get(node);

                if (currentLanguage === 'zh-CN') {
                    if (state && current === state.applied && current !== state.source) {
                        node.nodeValue = state.source;
                    }
                    return;
                }

                if (!HAN_PATTERN.test(current)) return;
                const translated = translateValue(current);
                if (translated !== current) {
                    textNodeState.set(node, { source: current, applied: translated });
                    node.nodeValue = translated;
                }
                if (HAN_PATTERN.test(translated)) missing.add(current.trim());
            }

            function getElementAttributeState(element) {
                let state = attributeState.get(element);
                if (!state) {
                    state = new Map();
                    attributeState.set(element, state);
                }
                return state;
            }

            function applyAttribute(element, name) {
                if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
                if (isIgnoredElement(element)) return;
                const current = element.getAttribute(name);
                if (current == null) return;
                const states = getElementAttributeState(element);
                const state = states.get(name);

                if (currentLanguage === 'zh-CN') {
                    if (state && current === state.applied && current !== state.source) {
                        element.setAttribute(name, state.source);
                    }
                    return;
                }

                if (!HAN_PATTERN.test(current)) return;
                const translated = translateValue(current);
                if (translated !== current) {
                    states.set(name, { source: current, applied: translated });
                    element.setAttribute(name, translated);
                }
                if (HAN_PATTERN.test(translated)) missing.add(current.trim());
            }

            function applyElement(element) {
                if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
                if (isIgnoredElement(element)) return;
                applyHtmlElement(element);
                for (const name of ATTRIBUTE_NAMES) applyAttribute(element, name);
            }

            function applyHtmlElement(element) {
                const state = htmlElementState.get(element);
                if (currentLanguage === 'zh-CN') {
                    if (state && element.innerHTML === state.applied) {
                        element.innerHTML = state.source;
                    }
                    return;
                }

                const key = (element.textContent || '').replace(/\s+/g, ' ').trim();
                const translated = html[key];
                if (!translated || translated === element.innerHTML) return;
                htmlElementState.set(element, { source: element.innerHTML, applied: translated });
                element.innerHTML = translated;
            }

            function translateSubtree(root = document.documentElement) {
                if (!root) return;
                isApplying = true;
                try {
                    if (root.nodeType === Node.TEXT_NODE) {
                        applyTextNode(root);
                    } else if (root.nodeType === Node.ELEMENT_NODE) {
                        applyElement(root);
                        const walker = document.createTreeWalker(
                            root,
                            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
                        );
                        let node = walker.nextNode();
                        while (node) {
                            if (node.nodeType === Node.TEXT_NODE) applyTextNode(node);
                            else applyElement(node);
                            node = walker.nextNode();
                        }
                    }
                } finally {
                    isApplying = false;
                }
            }

            function refreshMissing(root = document.documentElement) {
                if (currentLanguage !== 'en' || !root) return;
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                let node = walker.nextNode();
                while (node) {
                    const parent = node.parentElement;
                    if (
                        parent &&
                        !isIgnoredElement(parent) &&
                        !/^(SCRIPT|STYLE|TEXTAREA)$/.test(parent.tagName) &&
                        HAN_PATTERN.test(node.nodeValue || '')
                    ) {
                        missing.add((node.nodeValue || '').trim());
                    }
                    node = walker.nextNode();
                }
            }

            function startObserver() {
                if (observer || typeof MutationObserver === 'undefined') return;
                const scheduleSweep = () => {
                    if (currentLanguage !== 'en' || pendingSweep) return;
                    pendingSweep = window.setTimeout(() => {
                        pendingSweep = 0;
                        translateSubtree(document.documentElement);
                    }, 0);
                };
                observer = new MutationObserver((mutations) => {
                    if (isApplying) return;
                    for (const mutation of mutations) {
                        if (mutation.type === 'characterData') {
                            applyTextNode(mutation.target);
                            continue;
                        }
                        if (mutation.type === 'attributes') {
                            applyAttribute(mutation.target, mutation.attributeName);
                            continue;
                        }
                        for (const node of mutation.addedNodes) translateSubtree(node);
                    }
                    // 部分模块通过大段 innerHTML / DocumentFragment 批量挂载节点；
                    // 子节点级回调可能早于完整 UI 状态形成。微任务后再扫一遍全树，
                    // 确保新渲染的卡片、标签与属性也使用当前语言。
                    scheduleSweep();
                });
                observer.observe(document.documentElement, {
                    subtree: true,
                    childList: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ATTRIBUTE_NAMES
                });
            }

            function syncLanguageControls(language) {
                document.querySelectorAll('[data-language-select]').forEach((select) => {
                    select.value = language;
                });
            }

            function updateDocumentLanguage(language) {
                document.documentElement.lang = language;
                document.documentElement.classList.toggle('lang-en', language === 'en');
                document.documentElement.classList.toggle('lang-zh', language === 'zh-CN');
                const title = document.querySelector('title');
                if (title) {
                    if (language === 'en') {
                        title.textContent = 'osu!mania Visual Skin Editor';
                    } else {
                        title.textContent = exactReverse.get(title.textContent) || 'osu!mania 可视化皮肤编辑器';
                    }
                }
            }

            function setLanguage(language) {
                const nextLanguage = SUPPORTED_LANGUAGES.has(language) ? language : DEFAULT_LANGUAGE;
                if (pendingSweep) {
                    window.clearTimeout(pendingSweep);
                    pendingSweep = 0;
                }
                currentLanguage = nextLanguage;
                storeLanguage(nextLanguage);
                syncLanguageControls(nextLanguage);
                updateDocumentLanguage(nextLanguage);
                translateSubtree(document.documentElement);
                if (nextLanguage === 'en') refreshMissing(document.documentElement);
                window.dispatchEvent(new CustomEvent('app-language-changed', {
                    detail: { language: nextLanguage }
                }));
                return nextLanguage;
            }

            function t(source, vars = {}) {
                const replaced = String(source).replace(/\{(\w+)\}/g, (_, key) => (
                    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{${key}}`
                ));
                return currentLanguage === 'en' ? translateValue(replaced) : replaced;
            }

            function initLanguageControls() {
                document.querySelectorAll('[data-language-select]').forEach((select) => {
                    select.value = currentLanguage;
                    select.addEventListener('click', (event) => event.stopPropagation());
                    select.addEventListener('mousedown', (event) => event.stopPropagation());
                    select.addEventListener('change', () => setLanguage(select.value));
                });
            }

            window.I18n = Object.freeze({
                getLanguage: () => currentLanguage,
                setLanguage,
                t,
                translateNow: (root) => {
                    translateSubtree(root || document.documentElement);
                    if (currentLanguage === 'en') refreshMissing(root || document.documentElement);
                },
                getMissing: (root) => {
                    if (root) refreshMissing(root);
                    return Array.from(missing).sort();
                },
                clearMissing: () => missing.clear()
            });

            currentLanguage = readStoredLanguage();
            syncLanguageControls(currentLanguage);
            updateDocumentLanguage(currentLanguage);
            translateSubtree(document.documentElement);
            initLanguageControls();
            startObserver();
            if (currentLanguage === 'en') refreshMissing(document.documentElement);
        })();
