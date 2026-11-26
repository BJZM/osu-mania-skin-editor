// ============================================================================
// agent-session-config-hitsounds.js - Agent 会话参数配置与打击音效操作
// 从 ui/agent-session.js 按业务域拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function createAgentSessionConfigHitsoundsOps(ctx) {
            const {
                getRevision,
                createSessionError,
                ensureEditingWorkspaceReady,
                assertExpectedRevision,
                cloneSerializable,
                decodeBase64Bytes,
                refreshEditorUi,
                runInHistoryTransaction
            } = ctx;

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

            function parseSchemaDefaultColor(rawDefault, fallback) {
                if (rawDefault && typeof rawDefault === 'object') {
                    return {
                        r: Number(rawDefault.r) || 0,
                        g: Number(rawDefault.g) || 0,
                        b: Number(rawDefault.b) || 0,
                        a: rawDefault.a !== undefined ? Number(rawDefault.a) : 255
                    };
                }
                const parts = String(rawDefault || '').split(',').map((s) => parseInt(s.trim(), 10));
                if (parts.length >= 3 && !parts.slice(0, 3).some(Number.isNaN)) {
                    return {
                        r: parts[0],
                        g: parts[1],
                        b: parts[2],
                        a: parts[3] !== undefined && !Number.isNaN(parts[3]) ? parts[3] : 255
                    };
                }
                return { ...fallback };
            }

            function buildResetParamValue(p, keys) {
                if (!p) return undefined;
                if (p.type === 'array_number') {
                    const count = p.key === 'ColumnLineWidth'
                        ? keys + 1
                        : (p.key === 'ColumnSpacing' ? Math.max(0, keys - 1) : keys);
                    if (Array.isArray(p.default)) {
                        const out = [];
                        for (let i = 0; i < count; i++) {
                            const item = p.default[i] !== undefined ? Number(p.default[i]) : Number(p.default[0] || 0);
                            out.push(Number.isFinite(item) ? item : 0);
                        }
                        return out;
                    }
                    const fillVal = Number.isFinite(Number(p.default)) ? Number(p.default) : 0;
                    return new Array(count).fill(fillVal);
                }
                if (p.type === 'column_colour' || p.type === 'light_colour') {
                    const fallback = p.type === 'light_colour'
                        ? { r: 255, g: 255, b: 255, a: 255 }
                        : { r: 0, g: 0, b: 0, a: 255 };
                    return {
                        all: true,
                        color: parseSchemaDefaultColor(p.default, fallback)
                    };
                }
                if (p.type === 'color' || p.type === 'colour_hold' || p.type === 'colour_barline') {
                    return parseSchemaDefaultColor(p.default, { r: 255, g: 255, b: 255, a: 255 });
                }
                return cloneSerializable(p.default);
            }

            async function resetConfigCategory(params = {}) {
                await ensureEditingWorkspaceReady();
                const tab = params.tab;
                if (!['mania', 'fonts', 'general'].includes(tab)) {
                    throw createSessionError('INVALID_CATEGORY', '无效的分类标签，必须为 mania、fonts 或 general。', { tab });
                }
                if (params.expectedRevision != null) {
                    assertExpectedRevision(params.expectedRevision);
                }
                const items = SKIN_INI_PARAM_SCHEMA.filter((p) => p.tab === tab && !p.virtual);
                // ColumnRight 会反推覆盖 ColumnStart；在恢复 mania 分类时先复位 ColumnRight，
                // 再由 ColumnStart=136 与列宽/间距统一重算一致的 ColumnRight。
                const orderedItems = tab === 'mania'
                    ? [...items].sort((a, b) => {
                        if (a.key === 'ColumnRight' && b.key !== 'ColumnRight') return -1;
                        if (b.key === 'ColumnRight' && a.key !== 'ColumnRight') return 1;
                        return 0;
                    })
                    : items;
                return runInHistoryTransaction(`Agent 恢复${tab}分类默认值`, async () => {
                    const keys = getActiveKeyCount();
                    for (const p of orderedItems) {
                        if (typeof onParamChange === 'function') {
                            onParamChange(p.key, buildResetParamValue(p, keys));
                        }
                    }
                    refreshEditorUi();
                    return {
                        ok: true,
                        revision: getRevision(),
                        tab,
                        resetCount: items.length
                    };
                });
            }

            async function getSkinIniText() {
                await ensureEditingWorkspaceReady();
                if (typeof generateSkinIniText !== 'function') {
                    throw createSessionError('FEATURE_UNAVAILABLE', 'skin.ini 生成模块不可用。');
                }
                const text = generateSkinIniText();
                return {
                    ok: true,
                    revision: getRevision(),
                    text
                };
            }

            async function listHitsounds() {
                await ensureEditingWorkspaceReady();
                const catalog = typeof getEffectiveSkinHitsoundCatalog === 'function'
                    ? getEffectiveSkinHitsoundCatalog()
                    : (typeof skinHitsoundCatalog !== 'undefined' ? skinHitsoundCatalog : new Map());
                const items = [];
                for (const [key, group] of catalog.entries()) {
                    const replacement = typeof skinHitsoundReplacements !== 'undefined'
                        ? skinHitsoundReplacements.get(key)
                        : null;
                    items.push({
                        key,
                        sampleSet: group.sampleSet,
                        sound: group.sound,
                        customIndex: group.customIndex || 0,
                        isReplaced: Boolean(replacement),
                        effectivePath: replacement ? replacement.path : (group.variants && group.variants[0] ? group.variants[0].path : `${key}.wav`),
                        extension: replacement ? replacement.extension : (group.variants && group.variants[0] ? group.variants[0].extension : 'wav'),
                        source: replacement ? 'replacement' : (group.source || 'default')
                    });
                }
                return {
                    ok: true,
                    revision: getRevision(),
                    total: items.length,
                    replacedCount: typeof skinHitsoundReplacements !== 'undefined' ? skinHitsoundReplacements.size : 0,
                    hitsounds: items
                };
            }

            async function applyHitsound(params = {}) {
                await ensureEditingWorkspaceReady();
                const groupKey = String(params.groupKey || '').trim().toLowerCase();
                const rawAudio = String(params.audioBase64 || '').trim();
                const fileName = String(params.fileName || `${groupKey}.wav`).trim();

                if (!groupKey) {
                    throw createSessionError('INVALID_HITSOUND_PARAM', '必须提供 groupKey。');
                }
                if (!rawAudio) {
                    throw createSessionError('INVALID_HITSOUND_PARAM', '必须提供 audioBase64 音频数据。');
                }
                if (params.expectedRevision != null) {
                    assertExpectedRevision(params.expectedRevision);
                }

                const match = fileName.match(/\.([^.]+)$/);
                const extension = match ? match[1].toLowerCase() : 'wav';
                if (!['wav', 'mp3', 'ogg'].includes(extension)) {
                    throw createSessionError('INVALID_HITSOUND_FORMAT', '仅支持 .wav、.mp3 和 .ogg 音效格式。', { extension });
                }

                const bytes = decodeBase64Bytes(rawAudio, {
                    emptyCode: 'INVALID_HITSOUND_PARAM',
                    emptyMessage: '必须提供 audioBase64 音频数据。',
                    invalidCode: 'INVALID_HITSOUND_DATA',
                    invalidMessage: 'audioBase64 不是有效的 Base64 数据。',
                    rejectEmptyBytes: true,
                    emptyBytesCode: 'EMPTY_HITSOUND_DATA',
                    emptyBytesMessage: '音效文件数据为空。',
                    maxBytes: 32 * 1024 * 1024,
                    tooLargeBytesCode: 'HITSOUND_TOO_LARGE',
                    tooLargeBytesMessage: '音效文件大小超过 32MB 限制。'
                });

                const catalog = typeof getEffectiveSkinHitsoundCatalog === 'function'
                    ? getEffectiveSkinHitsoundCatalog()
                    : (typeof skinHitsoundCatalog !== 'undefined' ? skinHitsoundCatalog : new Map());
                const group = catalog.get(groupKey);
                if (!group) {
                    throw createSessionError('HITSOUND_NOT_FOUND', `未找到音效组：${groupKey}`, { groupKey });
                }

                return runInHistoryTransaction(`Agent 替换音效: ${groupKey}`, async () => {
                    const previous = typeof skinHitsoundReplacements !== 'undefined' ? skinHitsoundReplacements.get(groupKey) : null;
                    const replacementPath = `${group.key}.${extension}`;
                    const mimeType = extension === 'wav' ? 'audio/wav' : (extension === 'mp3' ? 'audio/mpeg' : 'audio/ogg');

                    if (typeof skinHitsoundReplacements !== 'undefined') {
                        skinHitsoundReplacements.set(groupKey, {
                            key: groupKey,
                            sampleSet: group.sampleSet,
                            sound: group.sound,
                            customIndex: Number(group.customIndex) || 0,
                            originalPaths: previous?.originalPaths?.length
                                ? [...previous.originalPaths]
                                : (group.variants || []).map((v) => v.path),
                            path: replacementPath,
                            extension,
                            mimeType,
                            sourceFileName: fileName,
                            bytes
                        });
                    }

                    if (typeof refreshSkinHitsoundCatalogWithReplacements === 'function') {
                        refreshSkinHitsoundCatalogWithReplacements();
                    }
                    if (typeof updateSkinInfoDisplay === 'function') updateSkinInfoDisplay();
                    refreshEditorUi();
                    try {
                        if (typeof refreshManiaHitsoundPlaybackAfterEdit === 'function') {
                            await refreshManiaHitsoundPlaybackAfterEdit();
                        }
                    } catch (playbackError) {
                        console.warn('音效已替换，但重建播放缓存失败:', playbackError);
                    }

                    return {
                        ok: true,
                        revision: getRevision(),
                        groupKey,
                        path: replacementPath,
                        byteLength: bytes.length
                    };
                });
            }

            async function resetHitsound(params = {}) {
                await ensureEditingWorkspaceReady();
                const groupKey = params.groupKey ? String(params.groupKey).trim().toLowerCase() : null;
                if (params.expectedRevision != null) {
                    assertExpectedRevision(params.expectedRevision);
                }

                const label = groupKey ? `Agent 恢复音效: ${groupKey}` : 'Agent 恢复所有音效';
                return runInHistoryTransaction(label, async (tx) => {
                    const replacementsAvailable = typeof skinHitsoundReplacements !== 'undefined' &&
                        skinHitsoundReplacements instanceof Map;
                    const hasChanges = groupKey
                        ? (replacementsAvailable && skinHitsoundReplacements.has(groupKey))
                        : (replacementsAvailable && skinHitsoundReplacements.size > 0);
                    if (!hasChanges) {
                        tx.abortNoOp();
                        return {
                            ok: true,
                            revision: getRevision(),
                            resetAll: !groupKey,
                            groupKey: groupKey || null,
                            changed: false
                        };
                    }

                    if (groupKey) {
                        skinHitsoundReplacements.delete(groupKey);
                    } else if (typeof clearSkinHitsoundReplacements === 'function') {
                        clearSkinHitsoundReplacements();
                    } else {
                        skinHitsoundReplacements.clear();
                    }

                    if (typeof refreshSkinHitsoundCatalogWithReplacements === 'function') {
                        refreshSkinHitsoundCatalogWithReplacements();
                    }
                    if (typeof updateSkinInfoDisplay === 'function') updateSkinInfoDisplay();
                    refreshEditorUi();
                    try {
                        if (typeof refreshManiaHitsoundPlaybackAfterEdit === 'function') {
                            await refreshManiaHitsoundPlaybackAfterEdit();
                        }
                    } catch (playbackError) {
                        console.warn('音效已恢复，但重建播放缓存失败:', playbackError);
                    }

                    return {
                        ok: true,
                        revision: getRevision(),
                        resetAll: !groupKey,
                        groupKey: groupKey || null,
                        changed: true
                    };
                });
            }

            return {
                listConfigParameters,
                applyConfigOperation,
                resetConfigCategory,
                getSkinIniText,
                listHitsounds,
                applyHitsound,
                resetHitsound
            };
        }
