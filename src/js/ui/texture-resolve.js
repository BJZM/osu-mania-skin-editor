// ============================================================================
// texture-resolve.js - 贴图参数别名、回退候选、实时图片与透明检测
// 依赖：parser/skin-assets.js、skin/mania-config.js
// ============================================================================

        function getTextureParamAliases(pKey, keys = 4) {
            const aliases = [pKey];
            const low = pKey.toLowerCase();

            // 1. 轨道特定贴图参数判定 (NoteImage0..N, NoteImage0H, HoldNoteHeadImage0..N, KeyImage0..N 等)
            const mNote = low.match(/^noteimage(\d+)([hlt])?$/);
            if (mNote) {
                const num = mNote[1];
                const s = mNote[2] ? mNote[2].toUpperCase() : '';
                if (s === 'H') {
                    if (!aliases.includes(`NoteImage${num}H`)) aliases.push(`NoteImage${num}H`);
                    if (!aliases.includes(`HoldNoteHeadImage${num}`)) aliases.push(`HoldNoteHeadImage${num}`);
                } else if (s === 'L') {
                    if (!aliases.includes(`NoteImage${num}L`)) aliases.push(`NoteImage${num}L`);
                    if (!aliases.includes(`HoldNoteBodyImage${num}`)) aliases.push(`HoldNoteBodyImage${num}`);
                } else if (s === 'T') {
                    if (!aliases.includes(`NoteImage${num}T`)) aliases.push(`NoteImage${num}T`);
                    if (!aliases.includes(`HoldNoteTailImage${num}`)) aliases.push(`HoldNoteTailImage${num}`);
                } else {
                    if (!aliases.includes(`NoteImage${num}`)) aliases.push(`NoteImage${num}`);
                }
                return aliases;
            }

            const mHold = low.match(/^holdnote(head|body|tail)image(\d+)$/);
            if (mHold) {
                const type = mHold[1];
                const num = mHold[2];
                const s = (type === 'head') ? 'H' : ((type === 'body') ? 'L' : 'T');
                const typeCap = type.charAt(0).toUpperCase() + type.slice(1);
                if (!aliases.includes(`NoteImage${num}${s}`)) aliases.push(`NoteImage${num}${s}`);
                if (!aliases.includes(`HoldNote${typeCap}Image${num}`)) aliases.push(`HoldNote${typeCap}Image${num}`);
                return aliases;
            }

            const mKey = low.match(/^keyimage(\d+)(d|down)?$/);
            if (mKey) {
                const num = mKey[1];
                if (mKey[2]) {
                    aliases.push(`KeyImage${num}D`, `KeyImage${num}Down`, `KeyImageDown${num}`);
                } else {
                    aliases.push(`KeyImage${num}`);
                }
                return aliases;
            }

            // 打击特效旧分轨键 (LightingN2 / LightingL2，含 Lighting2N / Lighting2L 别名形式)
            // stable 实际只读取全局 LightingN / LightingL，这两个贴图不再按轨道展开或分轨回显。
            const mLightN = low.match(/^lightingn(\d+)$/);
            if (mLightN) {
                aliases.push('LightingN');
                return aliases;
            }
            const mLightL = low.match(/^lightingl(\d+)$/);
            if (mLightL) {
                aliases.push('LightingL');
                return aliases;
            }

            // 2. 全局 / 回退贴图参数 (修改全局回退贴图时绝不静默覆盖各轨道已单独配置的贴图)
            if (low === 'holdnotebodyimage' || low === 'noteimagel') {
                aliases.push('NoteImageL', 'HoldNoteBodyImage');
            } else if (low === 'holdnotetailimage' || low === 'noteimaget') {
                aliases.push('NoteImageT', 'HoldNoteTailImage');
            } else if (low === 'holdnoteheadimage' || low === 'noteimageh') {
                aliases.push('NoteImageH', 'HoldNoteHeadImage');
            } else if (low === 'keyimagedown' || low === 'keyimaged') {
                aliases.push('KeyImageD', 'KeyImageDown');
            } else if (low === 'keyimage') {
                aliases.push('KeyImage');
            } else if (low === 'noteimage') {
                aliases.push('NoteImage');
            } else if (low === 'stagehint') {
                aliases.push('StageHint', 'HitTarget');
                for (let c = 0; c < Math.max(1, Math.min(18, keys || 4)); c++) {
                    aliases.push(`StageHint${c}`, `HitTarget${c}`);
                }
            } else if (low === 'lightingn') {
                // 打击特效贴图在 stable 中为全局键：所有轨道共用 LightingN，不能生成 LightingN0 / Lighting0N。
                aliases.push('LightingN', 'Lighting');
            } else if (low === 'lightingl') {
                // 打击特效贴图在 stable 中为全局键：所有轨道共用 LightingL，不能生成 LightingL0 / Lighting0L。
                aliases.push('LightingL', 'Lighting');
            } else if (low === 'stageleft') {
                aliases.push('StageLeft', 'Stage_Left', 'LeftStageImage', 'StageLeft0');
            } else if (low === 'stageright') {
                aliases.push('StageRight', 'Stage_Right', 'RightStageImage', 'StageRight0');
            } else if (low === 'stagebottom') {
                aliases.push('StageBottom', 'Stage_Bottom', 'BottomStageImage');
            } else if (low === 'stagelight') {
                // 按键发光贴图。别名顺序与 config.js buildStageLightSearchKeys 保持一致：
                //   StageLight / StageLight# / mania-stage-light
                // 注意：StageLight 是「按下按键就出现的轨道发光动画」，与 LightingN / LightingL
                //       （打到 note 才有的打击特效）是两套贴图，此处绝不能加入 lighting 别名。
                aliases.push('mania-stage-light');
                for (let c = 0; c < Math.max(1, Math.min(18, keys || 4)); c++) {
                    aliases.push(`StageLight${c}`);
                }
            } else if (/^hit(300g|300|200|100|50|0)$/i.test(low)) {
                aliases.push(pKey, pKey + '0');
                if (low === 'hit300g') aliases.push('Hit300k', 'Hit300g-0');
                if (low === 'hit100') aliases.push('Hit100k');
            } else {
                aliases.push(pKey + '0', pKey.replace(/Image$/, '') + '0');
            }

            return aliases;
        }

        function getEffectiveTextureSourceName(keys, lookup, columnIndex) {
            const out = {};
            const configuredName = getManiaNoteTextureName(keys, lookup, columnIndex, out);
            if (out.explicit) return configuredName;

            const info = imageLookupToIniPrefixSuffix(lookup);
            const candidates = getDefaultTextureFilenameCandidates(keys, lookup, columnIndex, info);
            for (const candidate of candidates) {
                if (getSkinAnimation(candidate, lookup !== LML.BottomStageImage)) {
                    return candidate;
                }
            }
            return configuredName;
        }

        // 长条头没有专属键时会按 stable 规则回退到同轨单键。编辑单键前必须把
        // 当前长条头的实际贴图源固定下来，否则单键换到新文件后，长条头会跟着一起换。
        function preserveTrackHoldHeadBeforeNoteEdit(keys, columnIndex, options = {}) {
            const cfg = maniaSkinConfigurations.get(keys) || getManiaConfigForKeys(keys);
            if (!cfg || columnIndex == null) return false;
            if (!cfg.ImageLookups) cfg.ImageLookups = new Map();

            const headKeys = buildPerTrackTextureSearchKeys(
                LML.HoldNoteHeadImage,
                columnIndex
            ).slice(0, 4);
            if (findExplicitImageLookupValue(cfg, headKeys)) return false;
            if (headKeys.some((key) => {
                const value = cfg[key];
                return value !== undefined && value !== null && String(value).trim().length > 0;
            })) {
                return false;
            }

            const headName = getEffectiveTextureSourceName(keys, LML.HoldNoteHeadImage, columnIndex);
            if (!headName) return false;

            const headParamKey = `NoteImage${columnIndex}H`;
            cfg[headParamKey] = headName;
            cfg.ImageLookups.set(headParamKey, headName);
            cfg.ImageLookups.set(headParamKey.toLowerCase(), headName);
            if (options.syncInput && typeof syncParamInputValue === 'function') {
                syncParamInputValue(headParamKey, headName);
            }
            return true;
        }

        function preserveHoldHeadsBeforeNoteEdit(keys, p, options = {}) {
            if (!p) return 0;
            const pKey = String(p.key || '');
            const lookup = p._trackLookup;
            const isNote = lookup === LML.NoteImage || /^NoteImage(?:\d+)?$/i.test(pKey);
            if (!isNote) return 0;

            const explicitColumn = p._trackCol != null
                ? Number(p._trackCol)
                : (pKey.match(/^NoteImage(\d+)$/i) ? Number(pKey.match(/^NoteImage(\d+)$/i)[1]) : null);
            const columns = explicitColumn != null && Number.isFinite(explicitColumn)
                ? [explicitColumn]
                : Array.from({ length: Math.max(1, Math.min(18, keys || 4)) }, (_, column) => column);

            let preserved = 0;
            for (const column of columns) {
                if (preserveTrackHoldHeadBeforeNoteEdit(keys, column, options)) preserved++;
            }
            return preserved;
        }

        // KeyImageDown 的 stable 查找顺序会在没有显式按下态贴图时回退到 KeyImage。
        // 修改普通 KeyImage 前先把按下态当前实际使用的默认贴图写成显式映射，
        // 否则默认皮肤中的 KeyImageD 会跟着 KeyImage 一起换图。
        function preserveTrackKeyImageDownBeforeKeyImageEdit(keys, columnIndex, options = {}) {
            const cfg = maniaSkinConfigurations.get(keys) || getManiaConfigForKeys(keys);
            if (!cfg || columnIndex == null) return false;
            if (!cfg.ImageLookups) cfg.ImageLookups = new Map();

            const fallbackKeys = new Set([`KeyImage${columnIndex}`, 'KeyImage']);
            const downKeys = buildPerTrackTextureSearchKeys(
                LML.KeyImageDown,
                columnIndex
            ).filter((key) => !fallbackKeys.has(key));
            if (findExplicitImageLookupValue(cfg, downKeys)) return false;
            if (downKeys.some((key) => {
                const value = cfg[key];
                return value !== undefined && value !== null && String(value).trim().length > 0;
            })) {
                return false;
            }

            const downName = getEffectiveTextureSourceName(keys, LML.KeyImageDown, columnIndex);
            if (!downName) return false;

            const downParamKey = `KeyImage${columnIndex}D`;
            cfg[downParamKey] = downName;
            cfg.ImageLookups.set(downParamKey, downName);
            cfg.ImageLookups.set(downParamKey.toLowerCase(), downName);
            if (options.syncInput && typeof syncParamInputValue === 'function') {
                syncParamInputValue(downParamKey, downName);
            }
            return true;
        }


        // 支持「按轨道单独配置」的通用贴图参数 → ini 键名前缀
        const PER_COLUMN_TEXTURE_PREFIX = {
            NoteImage: 'NoteImage',
            HoldNoteHeadImage: 'HoldNoteHeadImage',
            HoldNoteBodyImage: 'HoldNoteBodyImage',
            HoldNoteTailImage: 'HoldNoteTailImage',
            KeyImage: 'KeyImage',
            KeyImageDown: 'KeyImageDown',
            StageHint: 'StageHint',
            StageLight: 'StageLight',
        };

        // 生成通用贴图参数在当前键位下「按轨道」的候选 ini 键名 (第 1 轨优先)
        // 顺序与画布渲染 getManiaSkinImage / getManiaNoteTextureName 的识别顺序保持一致
        function getTextureParamColumnKeys(pKey, keys) {
            const prefix = PER_COLUMN_TEXTURE_PREFIX[pKey];
            if (!prefix) return [];
            const n = Math.max(1, Math.min(18, keys || 4));
            const out = [];
            const add = (k) => { if (!out.includes(k)) out.push(k); };
            for (let i = 0; i < n; i++) {
                switch (pKey) {
                    case 'NoteImage': add(`NoteImage${i}`); break;
                    case 'HoldNoteHeadImage': add(`NoteImage${i}H`); add(`HoldNoteHeadImage${i}`); break;
                    case 'HoldNoteBodyImage': add(`NoteImage${i}L`); add(`HoldNoteBodyImage${i}`); break;
                    case 'HoldNoteTailImage': add(`NoteImage${i}T`); add(`HoldNoteTailImage${i}`); break;
                    case 'KeyImage': add(`KeyImage${i}`); break;
                    case 'KeyImageDown': add(`KeyImage${i}D`); add(`KeyImage${i}Down`); add(`KeyImageDown${i}`); break;
                    case 'StageHint': add(`StageHint${i}`); add(`HitTarget${i}`); break;
                    case 'StageLight': add(`StageLight${i}`); break;
                }
            }
            return out;
        }
        // 逐轨道贴图参数定义：通用参数键 → 轨道 ini 键构成 / LML 查找枚举 / 卡片命名
        const PER_TRACK_TEXTURE_PARAMS = {
            NoteImage:         { prefix: 'NoteImage', suffix: '',  lookup: LML.NoteImage,         trackName: '单键音符贴图',   canvasIdPrefix: 'note_' },
            HoldNoteHeadImage: { prefix: 'NoteImage', suffix: 'H', lookup: LML.HoldNoteHeadImage, trackName: '长条头部贴图',   canvasIdPrefix: 'hold_head_' },
            HoldNoteBodyImage: { prefix: 'NoteImage', suffix: 'L', lookup: LML.HoldNoteBodyImage, trackName: '长条身体贴图',   canvasIdPrefix: 'hold_body_' },
            HoldNoteTailImage: { prefix: 'NoteImage', suffix: 'T', lookup: LML.HoldNoteTailImage, trackName: '长条尾部贴图',   canvasIdPrefix: 'hold_tail_' },
            KeyImage:          { prefix: 'KeyImage',  suffix: '',  lookup: LML.KeyImage,          trackName: '按键贴图',       canvasIdPrefix: 'key_' },
            KeyImageDown:      { prefix: 'KeyImage',  suffix: 'D', lookup: LML.KeyImageDown,      trackName: '按键按下贴图',   canvasIdPrefix: 'key_' },
            // 打击特效贴图 (LightingN / LightingL) 在 stable 中全局生效，所有轨道共用，
            // 因此不放进逐轨展开清单，只保留全局贴图参数卡片。
        };

        // 把「逐轨道贴图」参数展开为每个轨道一张独立卡片 (与其他贴图参数卡片样式完全一致)
        // 返回 null 表示该参数不是逐轨道贴图参数，应原样保留
        function expandPerTrackTextureParams(p, keys, ignoreTab = false) {
            // 「贴图」标签页里同样需要按轨道展开 (仅音符 / 按键这类真正逐轨的贴图)
            if (!ignoreTab && activeEditorTab !== 'mania' && activeEditorTab !== 'textures') return null;
            const meta = PER_TRACK_TEXTURE_PARAMS[p.key];
            if (!meta) return null;
            const n = Math.max(1, Math.min(18, keys || 4));
            const out = [];
            for (let c = 0; c < n; c++) {
                const iniKey = `${meta.prefix}${c}${meta.suffix}`;
                out.push({
                    ...p,
                    key: iniKey,
                    enName: iniKey,
                    zhName: `第 ${c + 1} 轨${meta.trackName}`,
                    comment: iniKey,
                    default: defaultFilenameForLookup(meta.lookup, computeFallbackColumnIndex(n, c)) || p.default,
                    elementId: `${meta.canvasIdPrefix}${c}`,
                    _trackLookup: meta.lookup,
                    _trackCol: c,
                    // 分组信息：同类型的各轨道卡片会被收纳进同一个「逐轨道贴图分组框」
                    _trackGroupKey: p.key,
                    _trackGroupName: meta.trackName,
                    _trackGroupZhName: p.zhName,
                    _trackGroupEnName: p.enName,
                    _trackGroupDesc: p.desc,
                });
            }
            return out;
        }

        function getTextureParamIniValue(keys, p) {
            const mCfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4) || {};
            const aliases = getTextureParamAliases(p.key, keys || 4);

            const checkMap = (map, k) => {
                if (!map || !k) return null;
                if (map.has(k)) return map.get(k);
                const low = k.toLowerCase();
                if (map.has(low)) return map.get(low);
                return null;
            };

            // 1. 优先在当前 keyCount 的 ImageLookups 中查找
            if (mCfg.ImageLookups) {
                for (const alias of aliases) {
                    const v = checkMap(mCfg.ImageLookups, alias);
                    if (v !== null && v !== undefined && String(v).trim().length > 0) {
                        return String(v).trim();
                    }
                }
            }

            // 2. 检查 mCfg 上的直接属性
            for (const alias of aliases) {
                if (mCfg[alias] !== undefined && mCfg[alias] !== null && String(mCfg[alias]).trim().length > 0) {
                    return String(mCfg[alias]).trim();
                }
            }

            // 3. 检查全局 skin.ini 字典
            if (globalSkinImageLookups) {
                for (const alias of aliases) {
                    const v = checkMap(globalSkinImageLookups, alias);
                    if (v !== null && v !== undefined && String(v).trim().length > 0) {
                        return String(v).trim();
                    }
                }
            }

            // 4. 通用键未显式配置时，回退识别各轨道单独配置的贴图 (NoteImage0..N / KeyImage0..N 等)。
            //    与画布渲染保持一致，避免 skin.ini 使用逐轨键时面板误显示为官方默认皮肤贴图。
            const columnKeys = getTextureParamColumnKeys(p.key, keys || 4);
            if (columnKeys.length > 0) {
                if (mCfg.ImageLookups) {
                    for (const ck of columnKeys) {
                        const v = checkMap(mCfg.ImageLookups, ck);
                        if (v !== null && v !== undefined && String(v).trim().length > 0) {
                            return String(v).trim();
                        }
                    }
                }
                for (const ck of columnKeys) {
                    if (mCfg[ck] !== undefined && mCfg[ck] !== null && String(mCfg[ck]).trim().length > 0) {
                        return String(mCfg[ck]).trim();
                    }
                }
                if (globalSkinImageLookups) {
                    for (const ck of columnKeys) {
                        const v = checkMap(globalSkinImageLookups, ck);
                        if (v !== null && v !== undefined && String(v).trim().length > 0) {
                            return String(v).trim();
                        }
                    }
                }
            }
            return '';
        }

        // 在用户皮肤库 / 官方默认皮肤库中按名字查找一张贴图 (支持精确路径与子目录 basename 回退)
        function lookupTextureByName(name, allowNestedFallback = true) {
            if (!name) return null;
            let img = getSkinAnimationFromStore(skinImageStore, name, allowNestedFallback);
            if (!img) {
                const frames = getSkinAnimationFramesFromStore(skinImageStore, name, allowNestedFallback);
                if (frames && frames.length > 0) img = frames[0];
            }
            if (img) return img;

            img = getSkinAnimationFromStore(defaultSkinImageStore, name, allowNestedFallback);
            if (!img) {
                const frames = getSkinAnimationFramesFromStore(defaultSkinImageStore, name, allowNestedFallback);
                if (frames && frames.length > 0) img = frames[0];
            }
            return img || null;
        }

        // 通用贴图参数在 ini 未显式指定时的备选文件名列表 (按 osu! 官方回退规则排列)
        function getTextureParamFallbackCandidates(p, keys) {
            const lookup = TEXTURE_PARAM_LOOKUP_MAP[p.key] || LML[p.key];
            const candidates = [];

            if (lookup) {
                // 计算当前键位首轨的备选文件名 (如 4K 第 1 轨为 '1', 7K 中间轨为 'S')
                const fc = computeFallbackColumnIndex(keys || 4, 0);
                const defFn = defaultFilenameForLookup(lookup, fc);
                if (defFn) candidates.push(defFn);

                // 针对各类长条和按键的特定回退规则
                if (lookup === LML.HoldNoteBodyImage) {
                    candidates.push('mania-note1L', 'mania-note1L-0', 'mania-note2L', 'mania-noteSL');
                } else if (lookup === LML.HoldNoteTailImage) {
                    candidates.push('mania-note1T', 'mania-note2T', 'mania-noteST', 'mania-note1H', 'mania-note1');
                } else if (lookup === LML.HoldNoteHeadImage) {
                    candidates.push('mania-note1H', 'mania-note2H', 'mania-noteSH', 'mania-note1');
                } else if (lookup === LML.NoteImage) {
                    candidates.push('mania-note1', 'mania-note2', 'mania-noteS');
                } else if (lookup === LML.KeyImage) {
                    candidates.push('mania-key1', 'mania-key2', 'mania-keyS');
                } else if (lookup === LML.KeyImageDown) {
                    candidates.push('mania-key1D', 'mania-key2D', 'mania-keySD');
                } else if (lookup === LML.HitTargetImage) {
                    candidates.push('mania-stage-hint');
                } else if (lookup === LML.ExplosionImage) {
                    candidates.push('lightingN', 'lighting');
                } else if (lookup === LML.HoldNoteLightImage) {
                    candidates.push('lightingL', 'lightingL-0', 'lighting');
                }
            }

            if (p.default && !candidates.includes(p.default)) candidates.push(p.default);
            // StageBottom 的参数键 StageBottom 会被归一化为旧文件名 stagebottom；
            // 未在 skin.ini 显式指定时不能靠它兜底，否则会误识别根目录旧贴图。
            if (lookup !== LML.BottomStageImage && p.key && !candidates.includes(p.key)) candidates.push(p.key);
            return candidates;
        }

        // ===== 贴图参数统一解析器 (参数面板唯一入口) =====
        // 返回 { img, name, state }：
        //   state = 'ok'      有可绘制贴图，img 为图片/画布对象，name 为实际生效的贴图名
        //           'blank'   皮肤作者显式关闭 (blank / null / transparent / 1x1) → 面板显示「透明」
        //           'missing' ini 显式写了贴图名，但皮肤里找不到该文件 → 面板显示「未找到」
        //           'unset'   完全没解析到任何贴图 → 面板显示「未配置」
        // 说明：'blank' 统一返回 1x1 透明占位图 (带 _isBlankPlaceholder 标记)，
        //       因此画布取不到贴图、面板却显示「未配置」这类不一致不会再出现。
        function resolveTextureParam(keys, p) {
            const keyCount = keys || 4;

            // ---- A. 逐轨贴图：与画布 getManiaSkinImage 共用同一份查找顺序 ----
            if (p._trackLookup != null) {
                const out = {};
                const effectiveName = getManiaNoteTextureName(keyCount, p._trackLookup, p._trackCol, out);
                const img = getManiaSkinImage(keyCount, p._trackLookup, p._trackCol);
                if (img) {
                    return { img: img, name: out.explicit ? out.explicitValue : effectiveName, state: 'ok' };
                }
                // 画布同样取不到：区分「显式关闭」「显式指定但文件缺失」「压根没配置」
                if (out.explicit && isDummyBlankName(out.explicitValue)) {
                    return { img: getTransparent1x1Image(), name: out.explicitValue, state: 'blank' };
                }
                if (out.explicit) {
                    return { img: null, name: out.explicitValue, state: 'missing' };
                }
                if (isDummyBlankName(effectiveName)) {
                    return { img: getTransparent1x1Image(), name: effectiveName, state: 'blank' };
                }
                return { img: null, name: effectiveName, state: 'unset' };
            }

            // ---- B. 通用贴图参数 ----
            const iniVal = getTextureParamIniValue(keyCount, p);

            // B1. ini 中显式指定了路径
            if (iniVal && iniVal.length > 0) {
                // blank / null / transparent 等伪贴图名 = 皮肤作者意图隐藏该贴图
                if (isDummyBlankName(iniVal)) {
                    return { img: getTransparent1x1Image(), name: iniVal, state: 'blank' };
                }
                const cleanPath = String(iniVal).trim().replace(/\.(png|jpg|jpeg)$/i, '');
                const lookup = TEXTURE_PARAM_LOOKUP_MAP[p.key] || LML[p.key];
                const img = lookupTextureByName(cleanPath, lookup !== LML.BottomStageImage);
                if (img) return { img: img, name: cleanPath, state: 'ok' };
                // 显式指定的图片文件在各库中均不存在 → 「未找到」，绝不伪装成「透明」
                return { img: null, name: iniVal, state: 'missing' };
            }

            // B2. ini 未显式指定：按 osu! 官方规则回退查找当前皮肤或官方默认皮肤中的对应素材
            const candidates = getTextureParamFallbackCandidates(p, keyCount);
            const lookup = TEXTURE_PARAM_LOOKUP_MAP[p.key] || LML[p.key];
            for (const cand of candidates) {
                const img = getSkinAnimation(cand, lookup !== LML.BottomStageImage);
                if (img) return { img: img, name: cand, state: 'ok' };
            }
            // 完全未找到任何贴图 → 「未配置」，绝不伪装成 1x1 透明图
            return { img: null, name: candidates[0] || '', state: 'unset' };
        }

        // 兼容旧调用点：只取图片对象
        function getTextureParamLiveImage(keys, p) {
            return resolveTextureParam(keys, p).img;
        }

        // 取某个贴图参数「当前实际生效」的动画帧序列：
        //   单帧贴图 → 长度 1 的数组（不播放动画）
        //   多帧贴图 → 完整帧数组（面板缩略图逐帧循环播放）
        //   关闭 / 缺失 / 未配置 → null
        // 逐轨贴图走 getManiaSkinAnimationFrames（与画布渲染同一份查找顺序）；
        // 通用贴图按 resolveTextureParam 解析出的实际生效名去贴图库里取帧序列。
        function resolveTextureParamFrames(keys, p) {
            const keyCount = keys || 4;
            if (p._trackLookup != null) {
                const frames = getManiaSkinAnimationFrames(keyCount, p._trackLookup, p._trackCol);
                if (frames && frames.length > 0) return frames;
                return null;
            }
            const res = resolveTextureParam(keyCount, p);
            if (!res || res.state !== 'ok') return null;
            if (res.name) {
                const frames = getSkinAnimationFrames(res.name);
                if (frames && frames.length > 0) return frames;
            }
            return res.img ? [res.img] : null;
        }

        // 全透明贴图识别：皮肤作者常用一张「整体全透明」的 PNG 来隐藏某个元素
        // (典型如隐藏 彩300 Hit300g、隐藏舞台底座)。这类贴图画进缩略图后就是一个
        // 「看不见的空白框」，必须显式标注「透明」，否则会被误认为贴图丢失 / 未配置。
        // 结果按「图片对象 + 缩略图尺寸」缓存，避免面板反复重绘时重复采样像素。
        const fullyTransparentCache = new WeakMap();
        function isFullyTransparentImage(imgObj, targetW, targetH) {
            if (!imgObj) return false;
            if (imgObj._isBlankPlaceholder) return true;

            const sizeKey = `${targetW}x${targetH}`;
            const cached = fullyTransparentCache.get(imgObj);
            if (cached && cached[sizeKey] !== undefined) return cached[sizeKey];

            let result = false;
            try {
                const w = imgObj.naturalWidth || imgObj.videoWidth || imgObj.width || 0;
                const h = imgObj.naturalHeight || imgObj.videoHeight || imgObj.height || 0;
                if (w <= 1 && h <= 1) {
                    result = true;
                } else if (w > 0 && h > 0) {
                    // 采样上限 128×128：既足够精确（全透明图必然全 0），又避免大贴图读取开销
                    const probe = document.createElement('canvas');
                    probe.width = Math.min(w, 128);
                    probe.height = Math.min(h, 128);
                    const px = probe.getContext('2d', { willReadFrequently: true });
                    px.clearRect(0, 0, probe.width, probe.height);
                    px.drawImage(imgObj, 0, 0, probe.width, probe.height);
                    const data = px.getImageData(0, 0, probe.width, probe.height).data;
                    let maxAlpha = 0;
                    for (let i = 3; i < data.length; i += 4) {
                        if (data[i] > maxAlpha) { maxAlpha = data[i]; if (maxAlpha > 2) break; }
                    }
                    result = (maxAlpha <= 2);
                }
            } catch (err) {
                // file:// 下把跨源图片画进画布会污染画布，getImageData 抛 SecurityError：
                // 此时保守判定为「非全透明」，不影响其余功能。
                result = false;
            }

            const box = cached || {};
            box[sizeKey] = result;
            fullyTransparentCache.set(imgObj, box);
            return result;
        }
