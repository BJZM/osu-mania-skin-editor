// ============================================================================
// agent-session-preview-export.js - Agent 会话预览捕获、皮肤校验与打包导出
// 从 ui/agent-session.js 按业务域拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function createAgentSessionPreviewExportOps(ctx) {
            const {
                getRevision,
                createSessionError,
                isEditingWorkspaceReady,
                ensureEditingWorkspaceReady
            } = ctx;

            async function capturePreview(params = {}) {
                await ensureEditingWorkspaceReady();
                const previewState = params.state === 'hold' ? 'hold' : 'idle';
                const previousHoldUntil = testHoldingUntil;
                if (previewState === 'hold') {
                    testHoldingUntil = performance.now() + 2000;
                } else {
                    testHoldingUntil = 0;
                }
                try {
                    drawFrame();
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                    drawFrame();
                    const gameCanvas = document.getElementById('gameCanvas');
                    if (!gameCanvas) {
                        throw createSessionError('CANVAS_NOT_FOUND', '找不到游戏画布。');
                    }
                    const dataUrl = gameCanvas.toDataURL('image/png');
                    const comma = dataUrl.indexOf(',');
                    return {
                        revision: getRevision(),
                        state: previewState,
                        width: gameCanvas.width,
                        height: gameCanvas.height,
                        mimeType: 'image/png',
                        imageBase64: comma >= 0 ? dataUrl.slice(comma + 1) : ''
                    };
                } catch (error) {
                    if (error && error.name === 'SecurityError') {
                        throw createSessionError(
                            'PREVIEW_TAINTED',
                            '画布包含无法导出的跨源资源。',
                            { originalMessage: error.message }
                        );
                    }
                    throw error;
                } finally {
                    testHoldingUntil = previousHoldUntil;
                    drawFrame();
                }
            }

            function validateCurrentSkin() {
                if (!isEditingWorkspaceReady()) {
                    return {
                        ok: false,
                        revision: getRevision(),
                        errors: [{
                            code: 'EDITOR_NOT_READY',
                            message: '请先导入皮肤或从默认皮肤开始。'
                        }],
                        warnings: [],
                        summary: { textureCount: 0, missingCount: 0, warningCount: 1 }
                    };
                }

                const errors = [];
                const warnings = [];
                const targets = getTextureTabParams();
                for (const target of targets) {
                    const resolved = resolveTextureParam(activeEditorKeyCount, target);
                    if (resolved && resolved.state === 'missing') {
                        errors.push({
                            code: 'MISSING_TEXTURE',
                            message: `${target.key} 指向的贴图不存在：${resolved.name}`,
                            paramKey: target.key,
                            path: resolved.name
                        });
                    } else if (resolved && resolved.state === 'unset') {
                        warnings.push({
                            code: 'UNSET_TEXTURE',
                            message: `${target.key} 没有解析到明确贴图，但 stable 可能使用内置回退。`,
                            paramKey: target.key
                        });
                    }
                    const width = resolved && resolved.img
                        ? (resolved.img.naturalWidth || resolved.img.width || 0)
                        : 0;
                    const height = resolved && resolved.img
                        ? (resolved.img.naturalHeight || resolved.img.height || 0)
                        : 0;
                    if (width > 4096 || height > 4096) {
                        warnings.push({
                            code: 'LARGE_TEXTURE',
                            message: `${target.key} 尺寸较大：${width}×${height}。`,
                            paramKey: target.key,
                            width,
                            height
                        });
                    }
                }
                return {
                    ok: errors.length === 0,
                    revision: getRevision(),
                    errors,
                    warnings,
                    summary: {
                        textureCount: targets.length,
                        missingCount: errors.length,
                        warningCount: warnings.length
                    }
                };
            }

            function arrayBufferToBase64(buffer) {
                const bytes = new Uint8Array(buffer);
                const chunkSize = 0x8000;
                let binary = '';
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
                }
                return btoa(binary);
            }

            async function exportPackage(params = {}) {
                await ensureEditingWorkspaceReady();
                const format = params.format === 'zip' ? 'zip' : 'osk';
                const mode = params.mode === 'release' ? 'release' : 'editable';
                showProgress(`Agent 正在打包 ${format.toUpperCase()} 皮肤...`);
                try {
                    const result = await buildSkinArchiveBlob(format, { mode });
                    const arrayBuffer = await result.blob.arrayBuffer();
                    if (window.skinWorkspaceRevision) window.skinWorkspaceRevision.markExported();
                    return {
                        revision: getRevision(),
                        format,
                        mode,
                        fileName: result.exportFileName,
                        byteLength: arrayBuffer.byteLength,
                        projectSummary: result.projectSummary || null,
                        archiveBase64: arrayBufferToBase64(arrayBuffer)
                    };
                } finally {
                    hideProgress();
                }
            }

            return {
                capturePreview,
                validateCurrentSkin,
                exportPackage
            };
        }
