// ============================================================================
// bootstrap.js - 应用元信息与默认皮肤核心资源预加载
// 依赖：parser/skin-assets.js、render/frame.js
// ============================================================================

// 应用元信息，供“关于”弹窗与版本展示使用；与 package.json 保持同步。
window.APP_INFO = Object.freeze({
    name: 'osu!mania Skin Editor',
    version: '0.3.2',
    author: 'BJZM',
    year: 2026,
    license: 'MIT'
});

void primeDefaultSkin();
