// ============================================================================
// agent-session.js - Agent 可调用的语义化皮肤会话
// 依赖：core/state.js、ui/history.js、ui/texture-upload.js、ui/export.js
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

            function normalizeTargetKey(value) {
                return String(value || '')
                    .trim()
                    .replace(/\\/g, '/')
                    .replace(/\.(png|jpg|jpeg)$/i, '')
                    .replace(/@2x$/i, '');
            }

            function sanitizeAssetBaseName(value, fallback) {
                const clean = String(value || '')
                    .replace(/\\/g, '/')
                    .split('/')
                    .pop()
                    .replace(/\.(png|jpg|jpeg)$/i, '')
                    .replace(/@2x$/i, '')
                    .replace(/[^a-z0-9_-]+/gi, '_')
                    .replace(/^_+|_+$/g, '')
                    .toLowerCase();
                return clean || fallback;
            }

            function getTargetKeyFromParamKey(paramKey) {
                const key = String(paramKey || '');
                if (/^NoteImage\d+[Hh]$/i.test(key) || /^HoldNoteHeadImage\d+$/i.test(key)) {
                    return LML.HoldNoteHeadImage;
                }
                if (/^NoteImage\d+[Ll]$/i.test(key) || /^HoldNoteBodyImage\d+$/i.test(key)) {
                    return LML.HoldNoteBodyImage;
                }
                if (/^NoteImage\d+[Tt]$/i.test(key) || /^HoldNoteTailImage\d+$/i.test(key)) {
                    return LML.HoldNoteTailImage;
                }
                if (/^NoteImage\d*$/i.test(key)) return LML.NoteImage;
                if (/^KeyImage\d+[Dd]$/i.test(key) || /^KeyImageDown\d*$/i.test(key)) {
                    return LML.KeyImageDown;
                }
                if (/^KeyImage\d*$/i.test(key)) return LML.KeyImage;
                if (/^StageLeft$/i.test(key)) return LML.LeftStageImage;
                if (/^StageRight$/i.test(key)) return LML.RightStageImage;
                if (/^StageBottom$/i.test(key)) return LML.BottomStageImage;
                if (/^StageHint$/i.test(key)) return LML.HitTargetImage;
                if (/^StageLight$/i.test(key)) return LML.LightImage;
                return key || null;
            }

            function getTrackColumn(paramKey, metadata, explicitColumn) {
                if (metadata && metadata._trackCol != null) return Number(metadata._trackCol);
                if (explicitColumn != null && Number.isFinite(Number(explicitColumn))) {
                    return Number(explicitColumn);
                }
                const match = String(paramKey || '').match(
                    /(?:NoteImage|HoldNoteHeadImage|HoldNoteBodyImage|HoldNoteTailImage|KeyImageDown|KeyImage)(\d+)/i
                );
                return match ? Number(match[1]) : null;
            }

            function canonicalizeTextureParamKey(paramKey, column) {
                const raw = String(paramKey || '').trim();
                const normalizedColumn = (column != null && Number.isFinite(Number(column)))
                    ? Math.max(0, Math.min(17, Number(column)))
                    : null;
                const genericSuffixMap = {
                    HoldNoteHeadImage: 'H',
                    HoldNoteBodyImage: 'L',
                    HoldNoteTailImage: 'T'
                };
                if (genericSuffixMap[raw] && normalizedColumn != null) {
                    return `NoteImage${normalizedColumn}${genericSuffixMap[raw]}`;
                }
                if (raw === 'NoteImage' && normalizedColumn != null) {
                    return `NoteImage${normalizedColumn}`;
                }
                if (raw === 'KeyImage' && normalizedColumn != null) {
                    return `KeyImage${normalizedColumn}`;
                }
                if (raw === 'KeyImageDown' && normalizedColumn != null) {
                    return `KeyImage${normalizedColumn}D`;
                }
                return raw;
            }

            function findTextureMetadata(paramKey) {
                const params = getTextureTabParams();
                const exact = params.find((item) =>
                    String(item.key).toLowerCase() === String(paramKey).toLowerCase());
                if (exact) return exact;
                const schema = SKIN_INI_PARAM_SCHEMA.find((item) =>
                    item.type === 'texture' &&
                    String(item.key).toLowerCase() === String(paramKey).toLowerCase());
                return schema ? { ...schema } : null;
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

            function readSchemaParameterValue(schemaItem) {
                if (!schemaItem) return undefined;
                if (schemaItem.tab === 'mania') {
                    const cfg = maniaSkinConfigurations.get(activeEditorKeyCount);
                    return cfg ? cloneSerializable(cfg[schemaItem.key]) : undefined;
                }
                if (schemaItem.tab === 'fonts') {
                    const map = {
                        ScorePrefix: skinFontsConfig.scorePrefix,
                        ScoreOverlap: skinFontsConfig.scoreOverlap,
                        ComboPrefix: skinFontsConfig.comboPrefix,
                        ComboOverlap: skinFontsConfig.comboOverlap,
                        HitCirclePrefix: skinFontsConfig.hitCirclePrefix,
                        HitCircleOverlap: skinFontsConfig.hitCircleOverlap
                    };
                    return cloneSerializable(map[schemaItem.key]);
                }
                if (schemaItem.tab === 'general') {
                    return cloneSerializable(currentSkinMetadata.general &&
                        currentSkinMetadata.general[schemaItem.key]);
                }
                if (schemaItem.tab === 'colours') {
                    return cloneSerializable(currentSkinMetadata.colours &&
                        currentSkinMetadata.colours[schemaItem.key]);
                }
                return undefined;
            }

            function listTextureTargets() {
                const keys = getActiveKeyCount();
                return getTextureTabParams().map((param) => {
                    const resolved = resolveTextureParam(keys, param);
                    const width = resolved && resolved.img
                        ? (resolved.img.naturalWidth || resolved.img.width || 0)
                        : 0;
                    const height = resolved && resolved.img
                        ? (resolved.img.naturalHeight || resolved.img.height || 0)
                        : 0;
                    const explicitValue = typeof getTextureParamIniValue === 'function'
                        ? getTextureParamIniValue(keys, param)
                        : '';
                    return {
                        paramKey: param.key,
                        label: param.zhName || param.enName || param.key,
                        defaultName: param.default || '',
                        column: param._trackCol != null ? Number(param._trackCol) : null,
                        lookup: param._trackLookup != null ? Number(param._trackLookup) : null,
                        state: resolved ? resolved.state : 'unset',
                        effectiveName: resolved ? resolved.name : '',
                        configuredName: explicitValue || '',
                        width,
                        height
                    };
                });
            }

            function listConfigParameters() {
                return SKIN_INI_PARAM_SCHEMA
                    .filter((item) => item.type !== 'texture' && !item.virtual)
                    .map((item) => ({
                        key: item.key,
                        label: item.zhName || item.enName || item.key,
                        tab: item.tab,
                        type: item.type,
                        value: readSchemaParameterValue(item),
                        default: cloneSerializable(item.default),
                        description: item.desc || ''
                    }));
            }

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
                        configPatch: true,
                        preview: true,
                        validate: true,
                        editableExport: true,
                        releaseExport: true,
                        transactionUndo: true
                    },
                    textures: isEditingWorkspaceReady() ? listTextureTargets() : [],
                    parameters: isEditingWorkspaceReady() ? listConfigParameters() : []
                };
            }

            function decodeBase64Image(imageBase64) {
                const raw = String(imageBase64 || '').trim();
                if (!raw) throw createSessionError('INVALID_IMAGE', 'imageBase64 不能为空。');
                const comma = raw.indexOf(',');
                const base64 = raw.startsWith('data:') && comma >= 0 ? raw.slice(comma + 1) : raw;
                if (base64.length > MAX_IMAGE_BASE64_LENGTH) {
                    throw createSessionError(
                        'IMAGE_TOO_LARGE',
                        '单张贴图 Base64 数据超过限制。',
                        { maxBase64Length: MAX_IMAGE_BASE64_LENGTH }
                    );
                }
                try {
                    const binary = atob(base64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    return bytes.buffer;
                } catch {
                    throw createSessionError('INVALID_IMAGE', 'imageBase64 不是有效的图片数据。');
                }
            }

            function loadImageFromBuffer(arrayBuffer, mimeType) {
                return new Promise((resolve, reject) => {
                    const blob = new Blob([arrayBuffer], { type: mimeType || 'image/png' });
                    const blobUrl = URL.createObjectURL(blob);
                    const img = new Image();
                    img.onload = () => resolve({ img, blobUrl });
                    img.onerror = () => {
                        URL.revokeObjectURL(blobUrl);
                        reject(createSessionError('INVALID_IMAGE', '浏览器无法解码该贴图。'));
                    };
                    img.src = blobUrl;
                });
            }

            async function applyTextureOperation(operation) {
                const requestedKey = canonicalizeTextureParamKey(
                    operation && operation.paramKey,
                    operation && operation.column
                );
                if (!requestedKey) {
                    throw createSessionError('INVALID_TEXTURE_TARGET', '缺少 paramKey。');
                }
                const metadata = findTextureMetadata(requestedKey);
                if (!metadata) {
                    throw createSessionError(
                        'UNKNOWN_TEXTURE_TARGET',
                        `未找到贴图目标：${requestedKey}`,
                        { paramKey: requestedKey }
                    );
                }

                const column = getTrackColumn(requestedKey, metadata, operation.column);
                const targetKey = metadata._trackLookup != null
                    ? metadata._trackLookup
                    : getTargetKeyFromParamKey(requestedKey);
                const arrayBuffer = decodeBase64Image(operation.imageBase64);
                const fileNameBase = sanitizeAssetBaseName(
                    operation.fileName,
                    `agent_${requestedKey}`
                );
                const extensionMatch = String(operation.fileName || '').match(/\.(png|jpg|jpeg)$/i);
                const extension = extensionMatch ? extensionMatch[0].toLowerCase() : '.png';
                const file = new File(
                    [arrayBuffer],
                    `${fileNameBase}${extension}`,
                    { type: operation.mimeType || 'image/png' }
                );
                const loaded = await loadImageFromBuffer(arrayBuffer, operation.mimeType);

                try {
                    if (!textureUploadUi ||
                        typeof textureUploadUi.applyEditedTexture !== 'function') {
                        throw createSessionError(
                            'TEXTURE_PIPELINE_UNAVAILABLE',
                            '贴图上传流程尚未初始化。'
                        );
                    }
                    const beforePaths = new Set(userReplacedTextures.keys());
                    const applied = await textureUploadUi.applyEditedTexture(
                        file,
                        arrayBuffer,
                        loaded.img,
                        operation.spec === '2x',
                        fileNameBase,
                        targetKey,
                        requestedKey,
                        column,
                        {
                            recordUndo: false,
                            notify: false,
                            refresh: false
                        }
                    );
                    if (!applied) {
                        throw createSessionError(
                            'TEXTURE_APPLY_FAILED',
                            `贴图应用失败：${requestedKey}`,
                            { paramKey: requestedKey }
                        );
                    }
                    const paths = [];
                    for (const path of userReplacedTextures.keys()) {
                        if (!beforePaths.has(path)) paths.push(path);
                    }
                    return {
                        type: 'texture.set',
                        paramKey: requestedKey,
                        column,
                        spec: operation.spec === '2x' ? '2x' : '1x',
                        paths
                    };
                } finally {
                    if (loaded.blobUrl) {
                        try {
                            URL.revokeObjectURL(loaded.blobUrl);
                        } catch {}
                    }
                }
            }

            function applyConfigOperation(operation) {
                const key = String((operation && operation.key) || '').trim();
                const schemaItem = SKIN_INI_PARAM_SCHEMA.find((item) => item.key === key);
                if (!schemaItem) {
                    throw createSessionError(
                        'UNKNOWN_PARAMETER',
                        `未知的 skin.ini 参数：${key}`,
                        { key }
                    );
                }
                if (schemaItem.type === 'texture') {
                    throw createSessionError(
                        'PARAMETER_IS_TEXTURE',
                        `参数 ${key} 是贴图路径，请使用 texture_apply。`,
                        { key }
                    );
                }
                const appliedValue = onParamChange(key, operation.value);
                return {
                    type: 'config.set',
                    key,
                    value: cloneSerializable(appliedValue !== undefined ? appliedValue : operation.value)
                };
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
                const revisionBefore = revision;
                const redoBefore = redoStack.slice();
                recordSkinUndoBeforeChange(transactionLabel, { force: true });
                const undoSnapshot = undoStack[undoStack.length - 1];
                const applied = [];
                transactionActive = true;
                lockEditorInput();

                try {
                    for (const operation of operations) {
                        if (!operation || typeof operation.type !== 'string') {
                            throw createSessionError(
                                'INVALID_OPERATION',
                                '每个操作都必须包含 type。'
                            );
                        }
                        if (operation.type === 'texture.set') {
                            applied.push(await applyTextureOperation(operation));
                        } else if (operation.type === 'config.set') {
                            applied.push(applyConfigOperation(operation));
                        } else {
                            throw createSessionError(
                                'UNSUPPORTED_OPERATION',
                                `不支持的操作类型：${operation.type}`,
                                { operationType: operation.type }
                            );
                        }
                    }
                    continuousActionActive = false;
                    refreshEditorUi();
                    lastMutation = transactionLabel;
                    return {
                        revision,
                        label: transactionLabel,
                        applied
                    };
                } catch (error) {
                    if (undoSnapshot) {
                        applySkinSnapshot(undoSnapshot);
                        if (undoStack[undoStack.length - 1] === undoSnapshot) {
                            undoStack.pop();
                        }
                    }
                    redoStack.splice(0, redoStack.length, ...redoBefore);
                    revision = revisionBefore;
                    continuousActionActive = false;
                    if (typeof syncTextureEditorBaseAfterSkinHistory === 'function') {
                        syncTextureEditorBaseAfterSkinHistory();
                    }
                    refreshEditorUi();
                    throw error;
                } finally {
                    transactionActive = false;
                    unlockEditorInput();
                }
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
                        revision,
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
                        revision,
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
                    revision,
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
                    return {
                        revision,
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

            function notifyExternalMutation(description) {
                if (transactionActive) return;
                revision += 1;
                lastMutation = description || 'external';
            }

            function getDebugState() {
                return {
                    revision,
                    transactionActive,
                    lastMutation,
                    ready: isEditingWorkspaceReady(),
                    undoDepth: typeof undoStack !== 'undefined' ? undoStack.length : 0,
                    redoDepth: typeof redoStack !== 'undefined' ? redoStack.length : 0
                };
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
                    case 'skin_preview':
                        return capturePreview(params);
                    case 'skin_validate':
                        return validateCurrentSkin();
                    case 'skin_export':
                        return exportPackage(params);
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

            window.addEventListener('DOMContentLoaded', installBridge);

            return {
                openSkin,
                getDescription,
                applyOperations,
                capturePreview,
                validate: validateCurrentSkin,
                exportPackage,
                dispatch,
                notifyExternalMutation,
                isApplying: () => transactionActive,
                getRevision: () => revision,
                getDebugState
            };
        })();

        window.skinAgentSession = skinAgentSession;
