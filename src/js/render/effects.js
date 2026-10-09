// ============================================================================
// effects.js - 连击中断预览等渲染状态入口
// 依赖：core/state.js
// ============================================================================

        const COMBO_BREAK_PREVIEW_DURATION_MS = 2500;

        function triggerComboBreakPreview() {
            const now = performance.now();
            comboAnimState.breakStartTime = now;
            comboAnimState.breakCount = (comboAnimState.lastCombo > 0) ? comboAnimState.lastCombo : 100;
            comboAnimState.lastCombo = 0;
            testComboBreakUntil = now + COMBO_BREAK_PREVIEW_DURATION_MS;
            drawFrame();
        }