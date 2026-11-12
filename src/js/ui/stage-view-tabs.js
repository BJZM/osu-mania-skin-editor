// ============================================================================
// stage-view-tabs.js - 右侧场景切换选项卡交互与生命周期协调模块
// 管理 "游戏内 (gameplay)"、"选歌页面 (song-select)"、"主页面 (main-menu)" 的状态流转与画布切换
// ============================================================================

(function (window) {
    'use strict';

    let currentView = 'gameplay';

    const TAB_IDS = {
        'gameplay': 'tabViewGameplay',
        'song-select': 'tabViewSongSelect',
        'main-menu': 'tabViewMainMenu'
    };

    const CANVAS_IDS = {
        'gameplay': 'gameCanvas',
        'song-select': 'songSelectCanvas',
        'main-menu': 'mainMenuCanvas'
    };

    function initStageViewTabs() {
        const rail = document.getElementById('stageNavRail');
        if (!rail) return;

        Object.keys(TAB_IDS).forEach((viewKey) => {
            const btn = document.getElementById(TAB_IDS[viewKey]);
            if (btn) {
                btn.addEventListener('click', () => {
                    setStageView(viewKey);
                });
            }
        });

        // 窗口尺寸变化同步
        window.addEventListener('resize', onWindowResize);

        // 快捷键支持：Alt+1 (游戏内), Alt+2 (选歌), Alt+3 (主页面)
        window.addEventListener('keydown', (e) => {
            if (e.altKey && !e.ctrlKey && !e.metaKey) {
                if (e.key === '1') {
                    setStageView('gameplay');
                } else if (e.key === '2') {
                    setStageView('song-select');
                } else if (e.key === '3') {
                    setStageView('main-menu');
                }
            }
        });

        // 默认处于游戏内视图
        applyViewUI('gameplay');
    }

    function setStageView(viewKey) {
        if (!TAB_IDS[viewKey] || currentView === viewKey) return;
        const prevView = currentView;
        currentView = viewKey;

        // 停止上一个视图的动画循环
        if (prevView === 'song-select' && window.SongSelectPreview) {
            window.SongSelectPreview.stop();
        } else if (prevView === 'main-menu' && window.MainMenuPreview) {
            window.MainMenuPreview.stop();
        }

        applyViewUI(viewKey);

        // 启动新视图的动画与渲染
        if (viewKey === 'gameplay') {
            if (typeof drawFrame === 'function') {
                drawFrame();
            }
        } else if (viewKey === 'song-select') {
            if (window.SongSelectPreview) {
                window.SongSelectPreview.start();
            }
        } else if (viewKey === 'main-menu') {
            if (window.MainMenuPreview) {
                window.MainMenuPreview.start();
            }
        }

        // 触发全局视图切换事件
        window.dispatchEvent(new CustomEvent('stageviewchange', { detail: { view: viewKey, prevView } }));
    }

    function applyViewUI(viewKey) {
        // 1. 更新选项卡按钮高亮
        Object.keys(TAB_IDS).forEach((key) => {
            const btn = document.getElementById(TAB_IDS[key]);
            if (btn) {
                if (key === viewKey) {
                    btn.classList.add('active');
                    btn.setAttribute('aria-selected', 'true');
                } else {
                    btn.classList.remove('active');
                    btn.setAttribute('aria-selected', 'false');
                }
            }
        });

        // 2. 切换画布可见性
        Object.keys(CANVAS_IDS).forEach((key) => {
            const cvs = document.getElementById(CANVAS_IDS[key]);
            if (cvs) {
                if (key === viewKey) {
                    cvs.style.display = 'block';
                    if (cvs.clientWidth > 0 && cvs.clientHeight > 0) {
                        cvs.width = cvs.clientWidth;
                        cvs.height = cvs.clientHeight;
                    }
                } else {
                    cvs.style.display = 'none';
                }
            }
        });

        // 3. 游戏内辅助元素的显隐（如启动面板、选中框）
        const startupActions = document.getElementById('startupActions');
        const selectedCard = document.getElementById('canvasSelectedCard');

        if (viewKey === 'gameplay') {
            if (selectedCard) {
                // 由原生逻辑接管
            }
            if (startupActions) {
                // 若谱面未导入且未加载皮肤，允许显示启动操作面板
                if (typeof isBeatmapLoaded !== 'undefined' && !isBeatmapLoaded && !window.currentBeatmap) {
                    startupActions.style.display = '';
                }
            }
        } else {
            // 在选歌或主页面下，隐藏游戏内专属的吸附编辑卡与启动引导
            if (startupActions) startupActions.style.display = 'none';
            if (selectedCard) selectedCard.style.display = 'none';
        }
    }

    function onWindowResize() {
        const activeCanvasId = CANVAS_IDS[currentView];
        if (!activeCanvasId) return;
        const cvs = document.getElementById(activeCanvasId);
        if (cvs && cvs.clientWidth > 0 && cvs.clientHeight > 0) {
            cvs.width = cvs.clientWidth;
            cvs.height = cvs.clientHeight;
        }
    }

    function getStageView() {
        return currentView;
    }

    // 暴露全局 API
    window.setStageView = setStageView;
    window.getStageView = getStageView;

    // 页面就绪后自动绑定
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStageViewTabs);
    } else {
        initStageViewTabs();
    }
})(window);
