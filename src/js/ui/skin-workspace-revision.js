// ============================================================================
// skin-workspace-revision.js - 当前皮肤状态与最近一次成功导出是否一致
// 依赖：无。由历史记录、导出和便携版退出提示调用。
// ============================================================================

        (function initSkinWorkspaceRevision() {
            let nextRevisionId = 1;
            let currentRevisionId = 0;
            let exportedRevisionId = 0;

            function reset() {
                nextRevisionId = 1;
                currentRevisionId = 0;
                exportedRevisionId = 0;
            }

            function advance() {
                currentRevisionId = nextRevisionId;
                nextRevisionId += 1;
                return currentRevisionId;
            }

            function adopt(snapshot) {
                if (!snapshot || !Number.isInteger(snapshot.revisionId)) return currentRevisionId;
                currentRevisionId = snapshot.revisionId;
                if (nextRevisionId <= currentRevisionId) nextRevisionId = currentRevisionId + 1;
                return currentRevisionId;
            }

            function markExported() {
                exportedRevisionId = currentRevisionId;
                return exportedRevisionId;
            }

            function hasUnexportedOperations() {
                return currentRevisionId !== exportedRevisionId;
            }

            window.skinWorkspaceRevision = Object.freeze({
                reset,
                advance,
                adopt,
                markExported,
                hasUnexportedOperations,
                currentId: () => currentRevisionId,
                exportedId: () => exportedRevisionId
            });
        })();
