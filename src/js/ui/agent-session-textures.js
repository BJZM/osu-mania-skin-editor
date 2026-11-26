// ============================================================================
// agent-session-textures.js - Agent 会话贴图查询、编辑与自动化操作
// 从 ui/agent-session.js 按业务域拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function createAgentSessionTextureOps(ctx) {
            const {
                getRevision,
                maxImageBase64Length,
                createSessionError,
                ensureEditingWorkspaceReady,
                assertExpectedRevision,
                cloneSerializable,
                decodeBase64Bytes,
                refreshEditorUi,
                runInHistoryTransaction
            } = ctx;

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
                const parsed = typeof parseManiaTextureParamKey === 'function'
                    ? parseManiaTextureParamKey(key)
                    : null;
                if (parsed) return parsed.lookup;
                const stageMap = {
                    stageleft: LML.LeftStageImage,
                    stageright: LML.RightStageImage,
                    stagebottom: LML.BottomStageImage,
                    stagehint: LML.HitTargetImage,
                    stagelight: LML.LightImage
                };
                return stageMap[key.toLowerCase()] || key || null;
            }

            function getTrackColumn(paramKey, metadata, explicitColumn) {
                if (metadata && metadata._trackCol != null) return Number(metadata._trackCol);
                if (explicitColumn != null && Number.isFinite(Number(explicitColumn))) {
                    return Number(explicitColumn);
                }
                const parsed = typeof parseManiaTextureParamKey === 'function'
                    ? parseManiaTextureParamKey(paramKey)
                    : null;
                return parsed && parsed.column != null ? parsed.column : null;
            }

            function canonicalizeTextureParamKey(paramKey, column) {
                if (typeof canonicalizeTrackTextureParamKey === 'function') {
                    return canonicalizeTrackTextureParamKey(paramKey, column);
                }
                return String(paramKey || '').trim();
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

            function decodeBase64Image(imageBase64) {
                return decodeBase64Bytes(imageBase64, {
                    emptyCode: 'INVALID_IMAGE',
                    emptyMessage: 'imageBase64 不能为空。',
                    maxBase64Length: maxImageBase64Length,
                    tooLargeCode: 'IMAGE_TOO_LARGE',
                    tooLargeMessage: '单张贴图 Base64 数据超过限制。',
                    invalidCode: 'INVALID_IMAGE',
                    invalidMessage: 'imageBase64 不是有效的图片数据。'
                }).buffer;
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

            async function inspectTexture(params = {}) {
                await ensureEditingWorkspaceReady();
                const canonicalKey = canonicalizeTextureParamKey(
                    params && params.paramKey,
                    params && params.column
                );
                if (!canonicalKey) {
                    throw createSessionError('INVALID_TEXTURE_TARGET', '缺少 paramKey。');
                }
                const metadata = findTextureMetadata(canonicalKey);
                const allParams = typeof getTextureTabParams === 'function' ? getTextureTabParams() : [];
                const p = allParams.find((item) => String(item.key).toLowerCase() === canonicalKey.toLowerCase()) || metadata;
                if (!p) {
                    throw createSessionError('UNKNOWN_TEXTURE_TARGET', `未找到贴图目标：${canonicalKey}`, { paramKey: canonicalKey });
                }
                const target = typeof buildEditorTarget === 'function' ? buildEditorTarget(p) : null;
                const frame = target && target.frames && target.frames[0];
                const recipe = target && typeof getStoredTextureEditRecipe === 'function' ? getStoredTextureEditRecipe(target) : null;
                const stretchFix = target && frame && typeof getStretchFixTarget === 'function' ? getStretchFixTarget(target, frame) : null;
                const sessionKey = target && typeof getLongBodySessionKey === 'function' ? getLongBodySessionKey(target) : null;
                const longBody = sessionKey && typeof longBodyComposerSessions !== 'undefined' ? longBodyComposerSessions.get(sessionKey) : null;
                return {
                    ok: true,
                    revision: getRevision(),
                    paramKey: canonicalKey,
                    column: getTrackColumn(canonicalKey, metadata, params && params.column),
                    effectiveName: (target && target.resolved && target.resolved.name) || (target && target.base) || '',
                    state: target ? target.state : 'unset',
                    sourceSize: frame ? { width: frame.width, height: frame.height } : null,
                    is2x: !!(frame && frame._is2x),
                    isBlank: !!(frame && (frame._isBlankPlaceholder || frame._isTransparent1x1)),
                    hasRecipe: !!recipe,
                    recipe: recipe && recipe.params ? {
                        left: recipe.params.left,
                        right: recipe.params.right,
                        top: recipe.params.top,
                        bottom: recipe.params.bottom,
                        imageTransform: cloneSerializable(recipe.params.imageTransform),
                        rgbAdjustment: cloneSerializable(recipe.params.rgbAdjustment)
                    } : null,
                    stretchFix: stretchFix && stretchFix.axis ? {
                        axis: stretchFix.axis,
                        size: stretchFix.size,
                        label: stretchFix.label || null,
                        reason: stretchFix.reason || null
                    } : null,
                    longBody: longBody ? {
                        targetHeight: longBody.targetHeight,
                        coverage: longBody.coverage,
                        fade: longBody.fade,
                        tailPreset: longBody.tailPreset || 'none',
                        presetHeight: longBody.presetHeight || 0
                    } : null
                };
            }

            async function withTextureEditorTarget(paramKey, column, fn) {
                const canonicalKey = canonicalizeTextureParamKey(paramKey, column);
                if (!canonicalKey) {
                    throw createSessionError('INVALID_TEXTURE_TARGET', '缺少 paramKey。');
                }
                if (!textureImageEditorUi || typeof textureImageEditorUi.selectByParamKey !== 'function') {
                    throw createSessionError('FEATURE_UNAVAILABLE', '贴图编辑器未就绪。');
                }
                const prevTabIds = (typeof tabs !== 'undefined' && Array.isArray(tabs))
                    ? new Set(tabs.map((tab) => tab.id))
                    : null;
                const selected = textureImageEditorUi.selectByParamKey(canonicalKey);
                if (!selected) {
                    throw createSessionError(
                        'UNKNOWN_TEXTURE_TARGET',
                        `未找到或无法选择贴图目标：${canonicalKey}`,
                        { paramKey: canonicalKey }
                    );
                }
                const openedTabId = (typeof activeTabId !== 'undefined' &&
                    prevTabIds &&
                    !prevTabIds.has(activeTabId))
                    ? activeTabId
                    : null;
                const closeOpenedTab = () => {
                    if (openedTabId && typeof removeTab === 'function') {
                        removeTab(openedTabId, { restorePreview: false });
                    }
                };
                try {
                    return await fn({ canonicalKey, closeOpenedTab });
                } catch (error) {
                    closeOpenedTab();
                    throw error;
                }
            }

            async function runTextureEditorTransaction(params, labelPrefix, handler, options = {}) {
                await ensureEditingWorkspaceReady();
                if (params && params.expectedRevision != null) {
                    assertExpectedRevision(params.expectedRevision);
                }
                const canonicalKey = options.canonicalKey || canonicalizeTextureParamKey(
                    params && params.paramKey,
                    params && params.column
                );
                if (!canonicalKey) {
                    throw createSessionError('INVALID_TEXTURE_TARGET', '缺少 paramKey。');
                }
                const column = options.column !== undefined ? options.column : null;
                if (typeof options.beforeRun === 'function') {
                    options.beforeRun(canonicalKey);
                }
                return runInHistoryTransaction(`${labelPrefix}: ${canonicalKey}`, (tx) =>
                    withTextureEditorTarget(canonicalKey, column, (targetCtx) =>
                        handler({ ...targetCtx, tx, canonicalKey })
                    )
                );
            }

            async function editTexture(params = {}) {
                return runTextureEditorTransaction(params, 'Agent 编辑贴图', async ({ canonicalKey }) => {
                    if (params.crop) {
                        const cl = byId('textureImageCropLeft');
                        const cr = byId('textureImageCropRight');
                        const ct = byId('textureImageCropTop');
                        const cb = byId('textureImageCropBottom');
                        if (cl) cl.value = String(Number(params.crop.left) || 0);
                        if (cr) cr.value = String(Number(params.crop.right) || 0);
                        if (ct) ct.value = String(Number(params.crop.top) || 0);
                        if (cb) cb.value = String(Number(params.crop.bottom) || 0);
                    }

                    if (params.transform && state && state.imageTransform) {
                        const scale = Number(params.transform.scalePercent);
                        if (Number.isFinite(scale) && scale >= 1 && scale <= 5000) {
                            state.imageTransform.scalePercent = scale;
                            const el = byId('textureImageScalePercent');
                            if (el) el.value = String(scale);
                        }
                        const sx = Number(params.transform.stretchX);
                        if (Number.isFinite(sx)) {
                            state.imageTransform.stretchX = Math.round(sx);
                            const el = byId('textureImageStretchX');
                            if (el) el.value = String(Math.round(sx));
                        }
                        const sy = Number(params.transform.stretchY);
                        if (Number.isFinite(sy)) {
                            state.imageTransform.stretchY = Math.round(sy);
                            const el = byId('textureImageStretchY');
                            if (el) el.value = String(Math.round(sy));
                        }
                    }

                    if (params.rgb && state && state.rgbAdjustment) {
                        for (const channel of ['r', 'g', 'b']) {
                            const val = Number(params.rgb[channel]);
                            if (Number.isFinite(val)) {
                                const normalized = Math.max(0, Math.min(200, Math.round(val)));
                                state.rgbAdjustment[channel] = normalized;
                                const range = byId(`textureImageRgb${channel.toUpperCase()}`);
                                const num = byId(`textureImageRgb${channel.toUpperCase()}Value`);
                                if (range) range.value = String(normalized);
                                if (num) num.value = String(normalized);
                            }
                        }
                    }

                    if (typeof refreshLivePreview === 'function') {
                        refreshLivePreview();
                    }

                    const saved = await applySelectedTexture({
                        mode: params.mode || 'overwrite',
                        keyImageScope: params.keyImageScope || 'current',
                        syncKeyImagePair: params.syncKeyImagePair !== false,
                        closeTabAfterSave: true,
                        closeEditorWhenLast: true
                    });
                    if (!saved) {
                        throw createSessionError('TEXTURE_SAVE_FAILED', `贴图编辑保存失败：${canonicalKey}`, { paramKey: canonicalKey });
                    }

                    refreshEditorUi();
                    return {
                        ok: true,
                        revision: getRevision(),
                        paramKey: canonicalKey,
                        mode: params.mode || 'overwrite'
                    };
                });
            }

            async function stretchFixTexture(params = {}) {
                return runTextureEditorTransaction(params, 'Agent 修复贴图拉伸', async ({ tx, canonicalKey, closeOpenedTab }) => {
                    const currentPreview = (state && state.previewFrames && state.previewFrames[0]) ||
                        (typeof buildPreviewFrames === 'function' ? buildPreviewFrames()[0] : null) ||
                        (state && state.workingFrames && state.workingFrames[0]);
                    const target = (currentPreview && typeof getStretchFixTarget === 'function')
                        ? getStretchFixTarget(state.selected, currentPreview)
                        : null;

                    if (!target || !target.axis) {
                        closeOpenedTab();
                        tx.abortNoOp();
                        return {
                            ok: true,
                            revision: getRevision(),
                            fixed: false,
                            message: target && target.reason ? target.reason : '当前贴图无需修复拉伸',
                            paramKey: canonicalKey
                        };
                    }

                    if (typeof applyStretchFix !== 'function') {
                        throw createSessionError('FEATURE_UNAVAILABLE', '拉伸修复功能未就绪。');
                    }
                    applyStretchFix();

                    const saved = await applySelectedTexture({
                        mode: params.mode || 'overwrite',
                        closeTabAfterSave: true,
                        closeEditorWhenLast: true
                    });
                    if (!saved) {
                        throw createSessionError('TEXTURE_SAVE_FAILED', `贴图拉伸修复保存失败：${canonicalKey}`, { paramKey: canonicalKey });
                    }

                    refreshEditorUi();
                    return {
                        ok: true,
                        revision: getRevision(),
                        fixed: true,
                        paramKey: canonicalKey,
                        axis: target.axis,
                        targetSize: target.size
                    };
                });
            }

            async function setBlankTexture(params = {}) {
                return runTextureEditorTransaction(params, 'Agent 设为空白贴图', async ({ canonicalKey }) => {
                    if (typeof setCurrentTextureBlank !== 'function') {
                        throw createSessionError('FEATURE_UNAVAILABLE', '设为空白功能未就绪。');
                    }
                    const blanked = setCurrentTextureBlank();
                    if (!blanked) {
                        throw createSessionError('TEXTURE_SET_BLANK_FAILED', `设为空白操作失败：${canonicalKey}`);
                    }

                    const saved = await applySelectedTexture({
                        mode: params.mode || 'overwrite',
                        keyImageScope: params.scope || 'current',
                        closeTabAfterSave: true,
                        closeEditorWhenLast: true
                    });
                    if (!saved) {
                        throw createSessionError('TEXTURE_SAVE_FAILED', `设为空白保存失败：${canonicalKey}`);
                    }

                    refreshEditorUi();
                    return {
                        ok: true,
                        revision: getRevision(),
                        paramKey: canonicalKey,
                        isBlank: true
                    };
                });
            }

            async function resetTexture(params = {}) {
                return runTextureEditorTransaction(params, 'Agent 重置贴图', async ({ canonicalKey }) => {
                    if (typeof resetCurrentTexture !== 'function') {
                        throw createSessionError('FEATURE_UNAVAILABLE', '重置贴图功能未就绪。');
                    }
                    resetCurrentTexture();

                    const saved = await applySelectedTexture({
                        mode: 'overwrite',
                        closeTabAfterSave: true,
                        closeEditorWhenLast: true
                    });
                    if (!saved) {
                        throw createSessionError('TEXTURE_SAVE_FAILED', `重置贴图保存失败：${canonicalKey}`);
                    }

                    refreshEditorUi();
                    return {
                        ok: true,
                        revision: getRevision(),
                        paramKey: canonicalKey,
                        reset: true
                    };
                });
            }

            async function createTexture(params = {}) {
                await ensureEditingWorkspaceReady();
                if (params.expectedRevision != null) {
                    assertExpectedRevision(params.expectedRevision);
                }
                const canonicalKey = params.paramKey
                    ? canonicalizeTextureParamKey(params.paramKey, params.column)
                    : null;
                const cleanName = sanitizeAssetBaseName(
                    params.name,
                    canonicalKey ? `created_${canonicalKey}` : 'created_texture'
                );

                if (typeof saveSolidTextureToLibrary !== 'function' || typeof normalizeTextureShape !== 'function') {
                    throw createSessionError('FEATURE_UNAVAILABLE', '纯色贴图创建模块未就绪。');
                }

                const payload = {
                    name: cleanName,
                    spec: params.spec === '2x' ? '2x' : '1x',
                    width: Math.max(1, Math.min(50000, Number(params.width) || 256)),
                    height: Math.max(1, Math.min(50000, Number(params.height) || 256)),
                    shape: normalizeTextureShape(params.shape || 'rectangle'),
                    color: typeof normalizeTextureHexColor === 'function'
                        ? normalizeTextureHexColor(params.color || '#ffffff')
                        : (params.color || '#ffffff'),
                    alpha: Math.max(0, Math.min(100, Number(params.alpha != null ? params.alpha : 100))),
                    cornerRadius: Math.max(0, Number(params.cornerRadius != null ? params.cornerRadius : 24)),
                    arrowThickness: Math.max(8, Math.min(50, Number(params.arrowThickness != null ? params.arrowThickness : 20))),
                    arrowRoundness: Math.max(0, Math.min(100, Number(params.arrowRoundness != null ? params.arrowRoundness : 50))),
                    strokeEnabled: !!params.strokeEnabled,
                    strokeColor: typeof normalizeTextureHexColor === 'function'
                        ? normalizeTextureHexColor(params.strokeColor || '#000000')
                        : (params.strokeColor || '#000000'),
                    strokeWidth: Math.max(0, Math.min(64, Number(params.strokeWidth || 0))),
                    strokeAlpha: Math.max(0, Math.min(100, Number(params.strokeAlpha != null ? params.strokeAlpha : 100))),
                    fillTransparentColor: typeof normalizeTextureHexColor === 'function'
                        ? normalizeTextureHexColor(params.fillTransparentColor || '#000000')
                        : (params.fillTransparentColor || '#000000'),
                    fillTransparentAlpha: Math.max(0, Math.min(100, Number(params.fillTransparentAlpha || 0)))
                };

                return runInHistoryTransaction(`Agent 创建贴图: ${cleanName}`, async () => {
                    const result = await saveSolidTextureToLibrary(payload, { oldPath: null });
                    if (canonicalKey && typeof pointTextureEditParamToPath === 'function') {
                        pointTextureEditParamToPath(canonicalKey, result.path);
                    }

                    if (typeof updateEditorBaseAfterSave === 'function') {
                        updateEditorBaseAfterSave();
                    }
                    refreshEditorUi();
                    return {
                        ok: true,
                        revision: getRevision(),
                        path: result.path,
                        paramKey: canonicalKey || null,
                        spec: payload.spec,
                        width: payload.width,
                        height: payload.height,
                        shape: payload.shape
                    };
                });
            }

            async function applyLongbody(params = {}) {
                const parsedCol = Number(params.column);
                const col = (params.column != null && Number.isFinite(parsedCol))
                    ? Math.max(0, Math.min(17, Math.round(parsedCol)))
                    : 0;
                const bodyParamKey = canonicalizeTextureParamKey('HoldNoteBodyImage', col);

                return runTextureEditorTransaction(
                    params,
                    'Agent 应用一键投皮',
                    async () => {
                        const enabled = (state && state.longBodyComposer && state.longBodyComposer.active)
                            ? true
                            : enableLongBodyComposer();
                        if (!enabled) {
                            throw createSessionError(
                                'LONGBODY_NOT_ELIGIBLE',
                                `当前轨道长条身体不满足一键投皮启用条件：${bodyParamKey}`,
                                { paramKey: bodyParamKey, column: col }
                            );
                        }

                        if (state && state.longBodyComposer) {
                            if (params.targetHeight != null) {
                                state.longBodyComposer.targetHeight = Math.max(1, Math.min(50000, Number(params.targetHeight) || 40000));
                            }
                            if (params.coverage != null) {
                                state.longBodyComposer.coverage = Math.max(0, Number(params.coverage) || 0);
                            }
                            if (params.fade != null) {
                                state.longBodyComposer.fade = Math.max(0, Math.min(100, Number(params.fade) || 0));
                            }
                            if (params.tailPreset != null) {
                                state.longBodyComposer.tailPreset = ['sharp', 'round'].includes(params.tailPreset)
                                    ? params.tailPreset
                                    : 'none';
                            }
                            if (params.presetHeight != null) {
                                state.longBodyComposer.presetHeight = Math.max(0, Number(params.presetHeight) || 0);
                            }
                        }

                        const appliedTargetHeight = (state && state.longBodyComposer && state.longBodyComposer.targetHeight) || 40000;
                        const appliedTailPreset = (state && state.longBodyComposer && state.longBodyComposer.tailPreset) || 'none';

                        const saved = await applySelectedTexture({
                            scope: params.scope || 'current',
                            longBodyScope: params.scope || 'current',
                            closeTabAfterSave: true,
                            closeEditorWhenLast: true
                        });
                        if (!saved) {
                            throw createSessionError('TEXTURE_SAVE_FAILED', `一键投皮应用失败：${bodyParamKey}`);
                        }

                        refreshEditorUi();
                        return {
                            ok: true,
                            revision: getRevision(),
                            column: col,
                            paramKey: bodyParamKey,
                            targetHeight: appliedTargetHeight,
                            tailPreset: appliedTailPreset,
                            scope: params.scope || 'current'
                        };
                    },
                    {
                        canonicalKey: bodyParamKey,
                        column: col,
                        beforeRun: () => {
                            if (typeof enableLongBodyComposer !== 'function') {
                                throw createSessionError('FEATURE_UNAVAILABLE', '一键投皮功能未就绪。');
                            }
                        }
                    }
                );
            }

            return {
                listTextureTargets,
                applyTextureOperation,
                inspectTexture,
                editTexture,
                stretchFixTexture,
                setBlankTexture,
                resetTexture,
                createTexture,
                applyLongbody
            };
        }
