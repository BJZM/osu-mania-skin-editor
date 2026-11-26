// ============================================================================
// agent-session.js - Agent 可调用的语义化皮肤会话核心与桥接调度
// 依赖：core/state.js、ui/history.js、ui/texture-upload.js、ui/export.js、
//       ui/agent-session-config-hitsounds.js、ui/agent-session-textures.js、
//       ui/agent-session-preview-export.js
// ============================================================================

        const skinAgentSession = (() => {
            let revision = 1;
            let transactionActive = false;
            let lastMutation = '';
            let bridgeInstalled = false;

            const MAX_OPERATIONS = 64;
            const MAX_IMAGE_BASE64_LENGTH = 24 * 1024 * 1024;

            function createSessionError(code, message, details = null) {
                const err = new Error(message);
                err.code = code;
                err.details = details;
                return err;
            }

            function serializeError(error) {
                return {
                    code: (error && error.code) || 'AGENT_SESSION_ERROR',
                    message: (error && error.message) || 'Unknown agent session error',
                    details: error && error.details ? error.details : null
                };
            }

            function isEditingWorkspaceReady() {
                if (typeof isSkinEditingWorkspaceReady === 'function') {
                    return isSkinEditingWorkspaceReady();
                }
                return typeof maniaSkinConfigurations !== 'undefined' &&
                    maniaSkinConfigurations instanceof Map &&
                    maniaSkinConfigurations.size > 0;
            }

            async function ensureEditingWorkspaceReady() {
                const deadline = performance.now() + 15000;
                while (performance.now() < deadline) {
                    if (isEditingWorkspaceReady() && !isSkinLoading) return;
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }
                throw createSessionError(
                    'EDITOR_NOT_READY',
                    '请先导入皮肤或从默认皮肤开始，再运行 Agent。',
                    { editorReady: isEditingWorkspaceReady(), skinLoading: !!isSkinLoading }
                );
            }

            function assertExpectedRevision(expectedRevision) {
                if (expectedRevision == null) return;
                const expected = Number(expectedRevision);
                if (!Number.isFinite(expected)) {
                    throw createSessionError(
                        'INVALID_REVISION',
                        'expectedRevision 必须是数字。'
                    );
                }
                if (expected !== revision) {
                    throw createSessionError(
                        'STALE_REVISION',
                        '皮肤状态已被其他操作修改，请重新读取皮肤描述后再提交。',
                        { expectedRevision: expected, currentRevision: revision }
                    );
                }
            }

            function cloneSerializable(value) {
                if (value == null || typeof value !== 'object') return value;
                if (typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number') {
                    return {
                        r: value.r,
                        g: value.g,
                        b: value.b,
                        a: value.a != null ? value.a : 255
                    };
                }
                if (Array.isArray(value)) return value.map(cloneSerializable);
                const out = {};
                for (const [key, item] of Object.entries(value)) out[key] = cloneSerializable(item);
                return out;
            }

            function decodeBase64Bytes(rawBase64, options = {}) {
                const raw = String(rawBase64 || '').trim();
                if (!raw) {
                    throw createSessionError(
                        options.emptyCode || 'INVALID_DATA',
                        options.emptyMessage || 'Base64 数据不能为空。'
                    );
                }
                const comma = raw.indexOf(',');
                const base64 = raw.startsWith('data:') && comma >= 0 ? raw.slice(comma + 1) : raw;
                if (options.maxBase64Length && base64.length > options.maxBase64Length) {
                    throw createSessionError(
                        options.tooLargeCode || 'DATA_TOO_LARGE',
                        options.tooLargeMessage || 'Base64 数据超过限制。',
                        { maxBase64Length: options.maxBase64Length }
                    );
                }
                let bytes;
                try {
                    const binary = atob(base64);
                    bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                } catch {
                    throw createSessionError(
                        options.invalidCode || 'INVALID_DATA',
                        options.invalidMessage || '不是有效的 Base64 数据。'
                    );
                }
                if (options.rejectEmptyBytes && bytes.length === 0) {
                    throw createSessionError(
                        options.emptyBytesCode || 'EMPTY_DATA',
                        options.emptyBytesMessage || '文件数据为空。'
                    );
                }
                if (options.maxBytes && bytes.length > options.maxBytes) {
                    throw createSessionError(
                        options.tooLargeBytesCode || 'DATA_TOO_LARGE',
                        options.tooLargeBytesMessage || '文件大小超过限制。'
                    );
                }
                return bytes;
            }

            function refreshEditorUi() {
                if (typeof renderSkinEditorParams === 'function') renderSkinEditorParams();
                if (typeof updateSkinEditorKeyPills === 'function') updateSkinEditorKeyPills();
                if (typeof updateSkinInfoDisplay === 'function') updateSkinInfoDisplay();
                if (typeof refreshSkinCursor === 'function') refreshSkinCursor();
                if (typeof drawFrame === 'function') drawFrame();
            }

            let inputLockState = null;

            function blockEditorKeyboard(event) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }

            function lockEditorInput() {
                if (inputLockState) return;
                inputLockState = {
                    pointerEvents: document.documentElement.style.pointerEvents || ''
                };
                document.documentElement.style.pointerEvents = 'none';
                window.addEventListener('keydown', blockEditorKeyboard, true);
                window.addEventListener('keyup', blockEditorKeyboard, true);
            }

            function unlockEditorInput() {
                if (!inputLockState) return;
                document.documentElement.style.pointerEvents = inputLockState.pointerEvents;
                inputLockState = null;
                window.removeEventListener('keydown', blockEditorKeyboard, true);
                window.removeEventListener('keyup', blockEditorKeyboard, true);
            }

            async function runInHistoryTransaction(label, fn) {
                if (transactionActive ||
                    (typeof isHistoryTransactionActive === 'function' && isHistoryTransactionActive())) {
                    throw createSessionError(
                        'TRANSACTION_IN_PROGRESS',
                        '已有正在执行的 Agent 写事务，请稍后再试。'
                    );
                }
                const txLabel = String(label || 'Agent 修改皮肤').trim() || 'Agent 修改皮肤';
                const revisionBefore = revision;
                const hasTxApi = typeof beginHistoryTransaction === 'function' &&
                    typeof commitHistoryTransaction === 'function' &&
                    typeof rollbackHistoryTransaction === 'function';
                let aborted = false;
                if (hasTxApi) {
                    beginHistoryTransaction(txLabel);
                }
                transactionActive = true;
                lockEditorInput();
                try {
                    const result = await fn({
                        abortNoOp: () => {
                            if (aborted) return;
                            aborted = true;
                            transactionActive = false;
                            if (hasTxApi) {
                                rollbackHistoryTransaction({ restoreSnapshot: false });
                            }
                        }
                    });
                    transactionActive = false;
                    if (!aborted) {
                        if (hasTxApi) {
                            commitHistoryTransaction();
                        } else {
                            notifyExternalMutation(txLabel);
                        }
                    }
                    if (result && typeof result === 'object' && 'revision' in result) {
                        result.revision = revision;
                    }
                    return result;
                } catch (error) {
                    transactionActive = false;
                    if (!aborted && hasTxApi) {
                        aborted = true;
                        rollbackHistoryTransaction({ restoreSnapshot: true });
                    }
                    revision = revisionBefore;
                    refreshEditorUi();
                    throw error;
                } finally {
                    transactionActive = false;
                    unlockEditorInput();
                }
            }

            function notifyExternalMutation(description) {
                if (transactionActive) return;
                revision += 1;
                lastMutation = description || 'external';
            }

            const sharedContext = {
                getRevision: () => revision,
                maxImageBase64Length: MAX_IMAGE_BASE64_LENGTH,
                createSessionError,
                isEditingWorkspaceReady,
                ensureEditingWorkspaceReady,
                assertExpectedRevision,
                cloneSerializable,
                decodeBase64Bytes,
                refreshEditorUi,
                runInHistoryTransaction
            };

            const configHitsoundsOps = createAgentSessionConfigHitsoundsOps(sharedContext);
            const textureOps = createAgentSessionTextureOps(sharedContext);
            const previewExportOps = createAgentSessionPreviewExportOps(sharedContext);

            function getDescription() {
                return {
                    ready: isEditingWorkspaceReady(),
                    revision,
                    skinName: currentSkinFileName || '',
                    keyCount: getActiveKeyCount(),
                    availableKeyCounts: Array.from(maniaSkinConfigurations.keys()).sort((a, b) => a - b),
                    format: 'osu!stable mania',
                    coordinateReference: 480,
                    capabilities: {
                        defaultSkin: true,
                        currentWorkspace: true,
                        importedOskWorkspace: true,
                        textureApply: true,
                        textureInspect: true,
                        textureEdit: true,
                        textureStretchFix: true,
                        textureSetBlank: true,
                        textureReset: true,
                        textureCreate: true,
                        textureLongBody: true,
                        configPatch: true,
                        preview: true,
                        validate: true,
                        editableExport: true,
                        releaseExport: true,
                        transactionUndo: true,
                        undoRedo: true,
                        revert: true,
                        configReset: true,
                        rawIni: true,
                        hitsounds: true
                    },
                    textures: isEditingWorkspaceReady() ? textureOps.listTextureTargets() : [],
                    parameters: isEditingWorkspaceReady() ? configHitsoundsOps.listConfigParameters() : []
                };
            }

            async function applyOperations(operations, label, expectedRevision) {
                await ensureEditingWorkspaceReady();
                assertExpectedRevision(expectedRevision);
                if (!Array.isArray(operations) || operations.length === 0) {
                    throw createSessionError('EMPTY_OPERATION_BATCH', 'operations 不能为空。');
                }
                if (operations.length > MAX_OPERATIONS) {
                    throw createSessionError(
                        'OPERATION_LIMIT_EXCEEDED',
                        `单次最多允许 ${MAX_OPERATIONS} 个操作。`
                    );
                }

                const transactionLabel = String(label || 'Agent 修改皮肤').trim() || 'Agent 修改皮肤';
                return runInHistoryTransaction(transactionLabel, async () => {
                    const applied = [];
                    for (const operation of operations) {
                        if (!operation || typeof operation.type !== 'string') {
                            throw createSessionError(
                                'INVALID_OPERATION',
                                '每个操作都必须包含 type。'
                            );
                        }
                        if (operation.type === 'texture.set') {
                            applied.push(await textureOps.applyTextureOperation(operation));
                        } else if (operation.type === 'config.set') {
                            applied.push(configHitsoundsOps.applyConfigOperation(operation));
                        } else {
                            throw createSessionError(
                                'UNSUPPORTED_OPERATION',
                                `不支持的操作类型：${operation.type}`,
                                { operationType: operation.type }
                            );
                        }
                    }
                    refreshEditorUi();
                    return {
                        revision,
                        label: transactionLabel,
                        applied
                    };
                });
            }

            async function openSkin(params = {}) {
                const source = params.source === 'default' ? 'default' : 'current';
                if (source === 'default') {
                    if (params.confirmReset !== true) {
                        throw createSessionError(
                            'CONFIRMATION_REQUIRED',
                            '从默认皮肤开始会清空当前工作区，必须显式传入 confirmReset=true。'
                        );
                    }
                    const keyCount = Number(params.keyCount);
                    if (Number.isFinite(keyCount) && keyCount >= 1 && keyCount <= 18) {
                        activeEditorKeyCount = Math.round(keyCount);
                    }
                    const opened = await startFromDefaultSkin({ skipConfirm: true });
                    if (!opened) {
                        throw createSessionError('OPEN_SKIN_FAILED', '无法从默认皮肤开始。');
                    }
                } else {
                    await ensureEditingWorkspaceReady();
                }
                return getDescription();
            }

            function getDebugState() {
                return {
                    revision,
                    transactionActive,
                    continuousActionActive: typeof continuousActionActive !== 'undefined'
                        ? !!continuousActionActive
                        : false,
                    lastMutation,
                    ready: isEditingWorkspaceReady(),
                    undoDepth: typeof undoStack !== 'undefined' ? undoStack.length : 0,
                    redoDepth: typeof redoStack !== 'undefined' ? redoStack.length : 0
                };
            }

            async function undoSkin() {
                await ensureEditingWorkspaceReady();
                if (typeof performSkinUndo !== 'function') {
                    throw createSessionError('FEATURE_UNAVAILABLE', '撤回功能不可用。');
                }
                if (typeof undoStack === 'undefined' || undoStack.length === 0) {
                    return {
                        ok: true,
                        undone: false,
                        message: '没有可撤回的操作',
                        revision,
                        undoDepth: 0,
                        redoDepth: typeof redoStack !== 'undefined' ? redoStack.length : 0
                    };
                }
                performSkinUndo();
                return {
                    ok: true,
                    undone: true,
                    revision,
                    undoDepth: typeof undoStack !== 'undefined' ? undoStack.length : 0,
                    redoDepth: typeof redoStack !== 'undefined' ? redoStack.length : 0
                };
            }

            async function redoSkin() {
                await ensureEditingWorkspaceReady();
                if (typeof performSkinRedo !== 'function') {
                    throw createSessionError('FEATURE_UNAVAILABLE', '重做功能不可用。');
                }
                if (typeof redoStack === 'undefined' || redoStack.length === 0) {
                    return {
                        ok: true,
                        redone: false,
                        message: '没有可重做的操作',
                        revision,
                        undoDepth: typeof undoStack !== 'undefined' ? undoStack.length : 0,
                        redoDepth: 0
                    };
                }
                performSkinRedo();
                return {
                    ok: true,
                    redone: true,
                    revision,
                    undoDepth: typeof undoStack !== 'undefined' ? undoStack.length : 0,
                    redoDepth: typeof redoStack !== 'undefined' ? redoStack.length : 0
                };
            }

            async function revertSkin(params = {}) {
                await ensureEditingWorkspaceReady();
                if (typeof initialSkinSnapshot === 'undefined' || !initialSkinSnapshot) {
                    throw createSessionError('NO_INITIAL_SNAPSHOT', '暂无已保存的初始皮肤快照。');
                }
                if (params.expectedRevision != null) {
                    assertExpectedRevision(params.expectedRevision);
                }
                return runInHistoryTransaction('Agent 复原初始皮肤', async () => {
                    selectedCanvasElement = null;
                    const card = document.getElementById('canvasSelectedCard');
                    if (card) card.style.display = 'none';

                    applySkinSnapshot(initialSkinSnapshot);
                    if (typeof syncTextureEditorBaseAfterSkinHistory === 'function') {
                        syncTextureEditorBaseAfterSkinHistory();
                    }
                    refreshEditorUi();
                    return {
                        ok: true,
                        revision,
                        message: '所有参数与贴图已复原为导入时的初始状态'
                    };
                });
            }

            async function dispatch(method, params = {}) {
                switch (method) {
                    case 'skin_open':
                        return openSkin(params);
                    case 'skin_describe':
                        return getDescription();
                    case 'texture_apply':
                        return applyOperations(
                            (params.textures || []).map((texture) => ({
                                type: 'texture.set',
                                ...texture
                            })),
                            params.label || 'Agent 替换贴图',
                            params.expectedRevision
                        );
                    case 'skin_config_patch':
                        return applyOperations(
                            (params.parameters || []).map((parameter) => ({
                                type: 'config.set',
                                ...parameter
                            })),
                            params.label || 'Agent 修改参数',
                            params.expectedRevision
                        );
                    case 'skin_config_reset':
                        return configHitsoundsOps.resetConfigCategory(params);
                    case 'skin_ini_get':
                        return configHitsoundsOps.getSkinIniText();
                    case 'skin_undo':
                        return undoSkin();
                    case 'skin_redo':
                        return redoSkin();
                    case 'skin_revert':
                        return revertSkin(params);
                    case 'skin_hitsound_list':
                        return configHitsoundsOps.listHitsounds();
                    case 'skin_hitsound_apply':
                        return configHitsoundsOps.applyHitsound(params);
                    case 'skin_hitsound_reset':
                        return configHitsoundsOps.resetHitsound(params);
                    case 'texture_inspect':
                        return textureOps.inspectTexture(params);
                    case 'texture_edit':
                        return textureOps.editTexture(params);
                    case 'texture_stretch_fix':
                        return textureOps.stretchFixTexture(params);
                    case 'texture_set_blank':
                        return textureOps.setBlankTexture(params);
                    case 'texture_reset':
                        return textureOps.resetTexture(params);
                    case 'texture_create':
                        return textureOps.createTexture(params);
                    case 'texture_longbody_apply':
                        return textureOps.applyLongbody(params);
                    case 'skin_preview':
                        return previewExportOps.capturePreview(params);
                    case 'skin_validate':
                        return previewExportOps.validateCurrentSkin();
                    case 'skin_export':
                        return previewExportOps.exportPackage(params);
                    default:
                        throw createSessionError(
                            'UNKNOWN_METHOD',
                            `未知的 Agent 方法：${method}`,
                            { method }
                        );
                }
            }

            function installBridge() {
                if (bridgeInstalled ||
                    !window.skinEditorAgentBridge ||
                    typeof window.skinEditorAgentBridge.onRequest !== 'function') {
                    return;
                }
                bridgeInstalled = true;
                window.skinEditorAgentBridge.onRequest(async (request) => {
                    if (!request || !request.requestId) return;
                    try {
                        const result = await dispatch(request.method, request.params || {});
                        window.skinEditorAgentBridge.respond(request.requestId, {
                            ok: true,
                            result
                        });
                    } catch (error) {
                        console.error('[AgentSession] command failed', request.method, error);
                        window.skinEditorAgentBridge.respond(request.requestId, {
                            ok: false,
                            error: serializeError(error)
                        });
                    }
                });
            }

            if (document.readyState === 'loading') {
                window.addEventListener('DOMContentLoaded', installBridge, { once: true });
            } else {
                installBridge();
            }

            return {
                openSkin,
                getDescription,
                applyOperations,
                capturePreview: previewExportOps.capturePreview,
                validate: previewExportOps.validateCurrentSkin,
                exportPackage: previewExportOps.exportPackage,
                dispatch,
                notifyExternalMutation,
                isApplying: () => transactionActive,
                getRevision: () => revision,
                getDebugState
            };
        })();

        window.skinAgentSession = skinAgentSession;
