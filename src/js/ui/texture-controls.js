// ============================================================================
// texture-controls.js - 贴图缩略图、参数控件、逐轨分组与颜色管理器
// 依赖：ui/texture-resolve.js、skin/parameter-schema.js
// ============================================================================

        // 高性能内存贴图缩略图渲染器：直接从 Image/Canvas 实例显存位图绘制到微型画布，绝不通过外部网络/失效 blob URL，杜绝破损图标
        // ===== 动态贴图缩略图播放器 =====
        // 多帧贴图（如 lightingN-0..N / lightingL-0..N / mania-stage-light-0..N）在参数面板的缩略图里
        // 逐帧循环播放，让用户一眼看出这是动画贴图。所有缩略图共用一个 60ms 定时器；
        // 容器被移出文档（面板重绘）后自动注销，绝不会因为反复重绘而泄漏定时器。
        const animatedThumbnails = [];
        let animatedThumbTimer = null;

        function expandCategoryBlockFor(el) {
            if (!el || !el.closest) return;
            const blk = el.closest('.param-category-block');
            if (!blk || !blk.classList.contains('collapsed')) return;
            blk.classList.remove('collapsed');
            if (blk.dataset && blk.dataset.categoryKey) collapsedParamCategories.delete(blk.dataset.categoryKey);
        }
