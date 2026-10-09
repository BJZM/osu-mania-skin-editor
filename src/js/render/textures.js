// ============================================================================
// textures.js - Mania 贴图、动画帧、缩略缓存与着色辅助
// 依赖：skin/mania-config.js、parser/skin-assets.js
// ============================================================================

        // 导入皮肤流程
        let transparent1x1Canvas = null;
        function getTransparent1x1Image() {
            if (!transparent1x1Canvas) {
                transparent1x1Canvas = document.createElement('canvas');
                transparent1x1Canvas.width = 1;
                transparent1x1Canvas.height = 1;
                transparent1x1Canvas._isBlankPlaceholder = true;
                transparent1x1Canvas._isTransparent1x1 = true;
            }
            return transparent1x1Canvas;
        }

        function getManiaSkinImage(keyCount, lookup, columnIndex) {
            const info = imageLookupToIniPrefixSuffix(lookup);
            if (!info) return null;

            let customName = null;
            let explicitlySpecified = false;

            const cfg = getManiaConfigForKeys(keyCount);
            if (cfg && !info.fallbackOnly) {
                const searchKeys = [];
                const ci = (columnIndex == null) ? '' : String(columnIndex | 0);

                if (info.isGlobal) {
                    searchKeys.push(info.prefix);
                    if (info.altKeys) {
                        for (const ak of info.altKeys) {
                            if (!searchKeys.includes(ak)) searchKeys.push(ak);
                        }
                    }
                } else if (PER_TRACK_TEXTURE_LOOKUPS.indexOf(lookup) >= 0) {
                    // 逐轨贴图查找顺序统一取自 config.js buildPerTrackTextureSearchKeys，
                    // 保证画布渲染与参数面板缩略图识别出完全相同的贴图。
                    const sharedKeys = buildPerTrackTextureSearchKeys(lookup, ci);
                    if (sharedKeys) for (const sk of sharedKeys) searchKeys.push(sk);
                } else if (lookup === LML.HoldNoteLightImage || lookup === LML.ExplosionImage) {
                    // 打击特效 (LightingN / LightingL) 查找顺序统一取自
                    // config.js buildPerTrackTextureSearchKeys（唯一真源），保证画布与面板识别一致。
                    // stable 下这两个贴图只认全局键，所有轨道共用，不读取 LightingN0 / Lighting0N 等分轨键。
                    const sharedKeys = buildPerTrackTextureSearchKeys(lookup, ci);
                    if (sharedKeys) for (const sk of sharedKeys) searchKeys.push(sk);
                } else if (lookup === LML.HitTargetImage) {
                    searchKeys.push('StageHint' + ci, 'StageHint', 'HitTarget' + ci, 'HitTarget');
                } else if (lookup === LML.LeftStageImage) {
                    searchKeys.push('StageLeft', 'Stage_Left', 'StageLeft' + ci);
                } else if (lookup === LML.RightStageImage) {
                    searchKeys.push('StageRight', 'Stage_Right', 'StageRight' + ci);
                } else if (lookup === LML.BottomStageImage) {
                    searchKeys.push('StageBottom', 'Stage_Bottom');
                } else if (lookup === LML.LightImage) {
                    // 按键发光贴图：查找顺序统一取自 config.js buildStageLightSearchKeys（唯一真源）
                    const sharedKeys = buildStageLightSearchKeys(ci);
                    if (sharedKeys) for (const sk of sharedKeys) searchKeys.push(sk);
                } else {
                    searchKeys.push(info.prefix + ci + info.suffix);
                    searchKeys.push(info.prefix);
                    if (info.altKeys) {
                        for (const ak of info.altKeys) {
                            if (!searchKeys.includes(ak)) searchKeys.push(ak);
                        }
                    }
                }

                // 1. 在当前 keyCount 的 ImageLookups 中查找
                if (cfg.ImageLookups) {
                    for (const sk of searchKeys) {
                        if (cfg.ImageLookups.has(sk)) {
                            customName = cfg.ImageLookups.get(sk);
                            explicitlySpecified = true;
                            break;
                        }
                        const skLow = sk.toLowerCase();
                        if (cfg.ImageLookups.has(skLow)) {
                            customName = cfg.ImageLookups.get(skLow);
                            explicitlySpecified = true;
                            break;
                        }
                    }
                }

                // 检查显式 blank / none / null / _blank 等伪贴图名
                if (explicitlySpecified && isDummyBlankName(customName)) {
                    return null;
                }

                // 2. 只有真正的全局资源（如判定字样 Hit300）才允许跨 Mania keyCount 继承
                if (info.isGlobal && !customName && maniaSkinConfigurations.size > 0) {
                    for (const otherCfg of maniaSkinConfigurations.values()) {
                        if (!otherCfg.ImageLookups) continue;
                        for (const sk of searchKeys) {
                            if (otherCfg.ImageLookups.has(sk)) {
                                customName = otherCfg.ImageLookups.get(sk);
                                explicitlySpecified = true;
                                break;
                            }
                            const skLow = sk.toLowerCase();
                            if (otherCfg.ImageLookups.has(skLow)) {
                                customName = otherCfg.ImageLookups.get(skLow);
                                explicitlySpecified = true;
                                break;
                            }
                        }
                        if (customName) break;
                    }
                    if (explicitlySpecified && isDummyBlankName(customName)) return null;
                }

                // 3. 同样仅全局资源在全局 skin.ini 字典中查找
                if (info.isGlobal && !customName && globalSkinImageLookups.size > 0) {
                    for (const sk of searchKeys) {
                        if (globalSkinImageLookups.has(sk)) {
                            customName = globalSkinImageLookups.get(sk);
                            explicitlySpecified = true;
                            break;
                        }
                        const skLow = sk.toLowerCase();
                        if (globalSkinImageLookups.has(skLow)) {
                            customName = globalSkinImageLookups.get(skLow);
                            explicitlySpecified = true;
                            break;
                        }
                    }
                    if (explicitlySpecified && isDummyBlankName(customName)) return null;
                }
            }

            // 严格按照读取到的 ini 指定路径读取：
            if (explicitlySpecified) {
                if (isDummyBlankName(customName)) return null;
                if (customName && customName.trim().length > 0) {
                    const targetName = customName.trim().replace(/\.(png|jpg|jpeg)$/i, '');
                    const userImg = getSkinAnimationFromStore(skinImageStore, targetName);
                    if (userImg) return userImg;
                    const userFrames = getSkinAnimationFramesFromStore(skinImageStore, targetName);
                    if (userFrames && userFrames.length > 0) return userFrames[0];
                    // 找不到对应图片则不显示（不回退到默认文件名或默认皮肤）
                    return null;
                }
                return null;
            }

            const fc = computeFallbackColumnIndex(keyCount, columnIndex | 0);
            const defaultName = defaultFilenameForLookup(lookup, fc);

            let result = null;
            const candidates = [];
            if (defaultName) candidates.push(defaultName);
            if (!info.isGlobal) {
                if (lookup === LML.NoteImage) {
                    const headFallback = defaultFilenameForLookup(LML.HoldNoteHeadImage, fc);
                    if (headFallback && !candidates.includes(headFallback)) candidates.push(headFallback);
                } else if (lookup === LML.HoldNoteHeadImage) {
                    const noteFallback = defaultFilenameForLookup(LML.NoteImage, fc);
                    if (noteFallback && !candidates.includes(noteFallback)) candidates.push(noteFallback);
                } else if (lookup === LML.HoldNoteTailImage) {
                    // osu! stable 规范: 尾部优先使用 mania-noteXh (反向缩放绘制) 或单键 noteX
                    const headFallback = defaultFilenameForLookup(LML.HoldNoteHeadImage, fc);
                    if (headFallback && !candidates.includes(headFallback)) candidates.push(headFallback);
                    const noteFallback = defaultFilenameForLookup(LML.NoteImage, fc);
                    if (noteFallback && !candidates.includes(noteFallback)) candidates.push(noteFallback);
                }
                if (fc === '2') {
                    const extra = defaultFilenameForLookup(lookup, '1');
                    if (extra && !candidates.includes(extra)) candidates.push(extra);
                }
            }
            if (info.isGlobal && (lookup === LML.Hit300g || lookup === LML.Hit300 || lookup === LML.Hit200 ||
                lookup === LML.Hit100 || lookup === LML.Hit50 || lookup === LML.Hit0)) {
                const defNames = [];
                if (lookup === LML.Hit300g) defNames.push('mania-hit300g', 'mania-hit300g-0', 'hit300g', 'hit300k', 'mania-hit300', 'hit300');
                else if (lookup === LML.Hit300) defNames.push('mania-hit300', 'hit300');
                else if (lookup === LML.Hit200) defNames.push('mania-hit200', 'hit200');
                else if (lookup === LML.Hit100) defNames.push('mania-hit100', 'hit100', 'hit100k');
                else if (lookup === LML.Hit50) defNames.push('mania-hit50', 'hit50');
                else if (lookup === LML.Hit0) defNames.push('mania-hit0', 'hit0');
                for (const dn of defNames) {
                    if (!candidates.includes(dn)) candidates.push(dn);
                }
            }

            for (const cand of candidates) {
                result = getSkinAnimation(cand);
                if (result) break;
            }
            return result;
        }

        function getManiaSkinAnimationFrames(keyCount, lookup, columnIndex) {
            const info = imageLookupToIniPrefixSuffix(lookup);
            if (!info) return null;

            let customName = null;
            let explicitlySpecified = false;
            const cfg = getManiaConfigForKeys(keyCount);
            if (cfg && !info.fallbackOnly) {
                const searchKeys = [];
                const ci = (columnIndex == null) ? '' : String(columnIndex | 0);
                if (lookup === LML.HoldNoteLightImage || lookup === LML.ExplosionImage) {
                    // 打击特效 (LightingN / LightingL) 查找顺序统一取自
                    // config.js buildPerTrackTextureSearchKeys（唯一真源），保证动画帧与静态贴图识别一致。
                    // stable 下这两个贴图只认全局键，所有轨道共用，不读取 LightingN0 / Lighting0N 等分轨键。
                    const sharedKeys = buildPerTrackTextureSearchKeys(lookup, ci);
                    if (sharedKeys) for (const sk of sharedKeys) searchKeys.push(sk);
                } else if (lookup === LML.LightImage) {
                    // 按键发光贴图：与 getStageLightFrames / getManiaSkinImage 共用同一份查找顺序
                    const sharedKeys = buildStageLightSearchKeys(ci);
                    if (sharedKeys) for (const sk of sharedKeys) searchKeys.push(sk);
                } else if (PER_TRACK_TEXTURE_LOOKUPS.indexOf(lookup) >= 0) {
                    // 与 getManiaSkinImage 共用同一份逐轨查找顺序，避免静态贴图能找到、动画帧却找不到
                    const sharedKeys = buildPerTrackTextureSearchKeys(lookup, ci);
                    if (sharedKeys) for (const sk of sharedKeys) searchKeys.push(sk);
                } else {
                    searchKeys.push(info.prefix + ci + info.suffix, info.prefix);
                    if (info.altKeys) {
                        for (const ak of info.altKeys) {
                            if (!searchKeys.includes(ak)) searchKeys.push(ak);
                        }
                    }
                }

                if (cfg.ImageLookups) {
                    for (const sk of searchKeys) {
                        if (cfg.ImageLookups.has(sk)) { customName = cfg.ImageLookups.get(sk); explicitlySpecified = true; break; }
                        const skLow = sk.toLowerCase();
                        if (cfg.ImageLookups.has(skLow)) { customName = cfg.ImageLookups.get(skLow); explicitlySpecified = true; break; }
                    }
                }

                // 检查显式 blank / none / null / _blank 等伪贴图名
                if (explicitlySpecified && isDummyBlankName(customName)) return null;

                if (info.isGlobal && !customName && maniaSkinConfigurations.size > 0) {
                    for (const otherCfg of maniaSkinConfigurations.values()) {
                        if (!otherCfg.ImageLookups) continue;
                        for (const sk of searchKeys) {
                            if (otherCfg.ImageLookups.has(sk)) { customName = otherCfg.ImageLookups.get(sk); explicitlySpecified = true; break; }
                            const skLow = sk.toLowerCase();
                            if (otherCfg.ImageLookups.has(skLow)) { customName = otherCfg.ImageLookups.get(skLow); explicitlySpecified = true; break; }
                        }
                        if (customName) break;
                    }
                    if (explicitlySpecified && isDummyBlankName(customName)) return null;
                }

                if (info.isGlobal && !customName && globalSkinImageLookups.size > 0) {
                    for (const sk of searchKeys) {
                        if (globalSkinImageLookups.has(sk)) { customName = globalSkinImageLookups.get(sk); explicitlySpecified = true; break; }
                        const skLow = sk.toLowerCase();
                        if (globalSkinImageLookups.has(skLow)) { customName = globalSkinImageLookups.get(skLow); explicitlySpecified = true; break; }
                    }
                    if (explicitlySpecified && isDummyBlankName(customName)) return null;
                }
            }

            // 严格按照读取到的 ini 指定路径读取：
            if (explicitlySpecified) {
                if (isDummyBlankName(customName)) return null;
                if (customName && customName.trim().length > 0) {
                    const targetName = customName.trim().replace(/\.(png|jpg|jpeg)$/i, '');
                    const userFrames = getSkinAnimationFramesFromStore(skinImageStore, targetName);
                    if (userFrames && userFrames.length > 0) return userFrames;
                    const userSingle = getSkinAnimationFromStore(skinImageStore, targetName);
                    if (userSingle) return [userSingle];
                    // 找不到对应图片则不显示
                    return null;
                }
                return null;
            }

            const defaultName = defaultFilenameForLookup(lookup, '1');
            const candidates = [];
            if (defaultName) candidates.push(defaultName);

            for (const cand of candidates) {
                const frames = getSkinAnimationFrames(cand);
                if (frames && frames.length > 0) return frames;
            }
            const single = getManiaSkinImage(keyCount, lookup, columnIndex);
            return single ? [single] : null;
        }

        function getManiaNoteDrawHeight(keys, columnIndex, img, colW, scale48) {
            if (!img || img.width <= 0 || img.height <= 0) return 20 * (scale48 / 1.5);
            const wnRes = getManiaSkinConfig(keys, LML.WidthForNoteHeightScale);

            // 1. 如果 skin.ini 明确定义了 WidthForNoteHeightScale，严格按照该参考宽度计算高度（对齐 osu! 官方规范）
            if (wnRes && wnRes.value > 0) {
                const refW = wnRes.value * scale48;
                return Math.max(4, refW * (img.height / img.width));
            }

            // 2. 若未显式配置 WidthForNoteHeightScale，对齐 osu! 官方 (LegacyNotePiece / LegacySkin) 规范：
            // 基准高度优先采用 MinimumColumnWidth (全轨道最小列宽)；未指定各列宽度时使用当前列宽 colW。
            // 贴图高度严格按横向等比缩放 (baseW * (img.height / img.width))，绝不人为截断高度或压缩宽高比。
            let minColW = null;
            if (keys && keys > 0) {
                for (let c = 0; c < keys; c++) {
                    const cwRes = getManiaSkinConfig(keys, LML.ColumnWidth, c);
                    if (cwRes && cwRes.value > 0) {
                        if (minColW === null || cwRes.value < minColW) {
                            minColW = cwRes.value;
                        }
                    }
                }
            }
            const baseW = (minColW !== null && minColW > 0) ? (minColW * scale48) : colW;
            return Math.max(4, baseW * (img.height / img.width));
        }

        // 获取特定轨道的 ColourLight 颜色与透明度配置 (默认纯白 { r: 255, g: 255, b: 255, a: 255 })
        function getManiaColourLight(keys, col) {
            const res = getManiaSkinConfig(keys, LML.ColourLight, col);
            return (res && res.value) ? res.value : { r: 255, g: 255, b: 255, a: 255 };
        }

        // 获取特定轨道的 StageLight (mania-stage-light) 动画贴图：
        // 1. 若 skin.ini 显式指定 StageLight (或 StageLight[col]) 为 blank/none，则禁用，绝不回退默认；
        // 2. 若皮肤包含自定义 StageLight 或自带 mania-stage-light 贴图文件，严格使用皮肤贴图，绝不使用默认贴图；
        // 3. 仅当皮肤未包含任何 mania-stage-light / StageLight 资源时，才安全回退到官方经典默认动画贴图。
        // 注意：这是「按下按键就出现」的按键发光动画（位置由 LightPosition 决定），
        //       与 LightingN / LightingL（打到 note 才有的打击特效）是两套完全独立的贴图，严禁互相回退。
        function getStageLightFrames(keys, col) {
            // 1. 检查 skin.ini 是否配置了 StageLight / StageLight[col]
            const cfg = getManiaConfigForKeys(keys);
            let customName = null;
            let explicitlySpecified = false;

            if (cfg && cfg.ImageLookups) {
                // 查找顺序统一取自 config.js buildStageLightSearchKeys（唯一真源），
                // 保证画布绘制与参数面板缩略图识别出完全相同的贴图。
                const searchKeys = buildStageLightSearchKeys(col);
                for (const sk of searchKeys) {
                    if (cfg.ImageLookups.has(sk)) {
                        customName = cfg.ImageLookups.get(sk);
                        explicitlySpecified = true;
                        break;
                    }
                    const skLow = sk.toLowerCase();
                    if (cfg.ImageLookups.has(skLow)) {
                        customName = cfg.ImageLookups.get(skLow);
                        explicitlySpecified = true;
                        break;
                    }
                }
            }

            // 若 skin.ini 显式声明为 blank / none / null / _blank 等，表明皮肤作者有意关闭光效，直接返回 null，不回退默认
            if (explicitlySpecified && customName) {
                if (isDummyBlankName(customName)) {
                    return null;
                }
                // 在用户皮肤库中寻找指定名称
                let frames = getSkinAnimationFramesFromStore(skinImageStore, customName);
                if (frames && frames.length > 0) return frames;
                const single = getSkinAnimationFromStore(skinImageStore, customName);
                if (single) return [single];
                // 如果皮肤显式配置了 StageLight，无论找不找得到，都不应该加载默认的 mania-stage-light
                return null;
            }

            // 2. skin.ini 未指定 StageLight，检查用户皮肤是否存在 mania-stage-light 文件
            let userFrames = getSkinAnimationFramesFromStore(skinImageStore, 'mania-stage-light');
            if (userFrames && userFrames.length > 0) {
                return userFrames;
            }
            const userSingle = getSkinAnimationFromStore(skinImageStore, 'mania-stage-light');
            if (userSingle) {
                return [userSingle];
            }

            // 3. 用户皮肤完全未包含 mania-stage-light，回退至官方默认皮肤 (defaultSkinImageStore)
            let defFrames = getSkinAnimationFramesFromStore(defaultSkinImageStore, 'mania-stage-light');
            if (defFrames && defFrames.length > 0) {
                return defFrames;
            }
            const defSingle = getSkinAnimationFromStore(defaultSkinImageStore, 'mania-stage-light');
            if (defSingle) {
                return [defSingle];
            }
            return null;
        }

        let lightTintCanvas = null;
        let lightTintCtx = null;
        function getTintedLightCanvas(img, color) {
            if (!lightTintCanvas) {
                lightTintCanvas = document.createElement('canvas');
                lightTintCtx = lightTintCanvas.getContext('2d');
            }
            if (lightTintCanvas.width !== img.width || lightTintCanvas.height !== img.height) {
                lightTintCanvas.width = img.width;
                lightTintCanvas.height = img.height;
            }
            lightTintCtx.clearRect(0, 0, lightTintCanvas.width, lightTintCanvas.height);
            lightTintCtx.drawImage(img, 0, 0);
            lightTintCtx.globalCompositeOperation = 'source-in';
            lightTintCtx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
            lightTintCtx.fillRect(0, 0, lightTintCanvas.width, lightTintCanvas.height);
            lightTintCtx.globalCompositeOperation = 'source-over';
            return lightTintCanvas;
        }

        let digitTintCanvas = null;
        let digitTintCtx = null;
        function getTintedDigitCanvas(img, color) {
            if (!img) return img;
            if (!digitTintCanvas) {
                digitTintCanvas = document.createElement('canvas');
                digitTintCtx = digitTintCanvas.getContext('2d');
            }
            if (digitTintCanvas.width !== img.width || digitTintCanvas.height !== img.height) {
                digitTintCanvas.width = img.width;
                digitTintCanvas.height = img.height;
            }
            digitTintCtx.clearRect(0, 0, digitTintCanvas.width, digitTintCanvas.height);
            digitTintCtx.drawImage(img, 0, 0);
            if (color) {
                digitTintCtx.globalCompositeOperation = 'source-in';
                const r = (color.r != null) ? color.r : 255;
                const g = (color.g != null) ? color.g : 255;
                const b = (color.b != null) ? color.b : 255;
                const aValue = Number(color.a);
                const a = Number.isFinite(aValue) ? Math.max(0, Math.min(255, aValue)) / 255 : 1;
                digitTintCtx.fillStyle = `rgba(${r},${g},${b},${a})`;
                digitTintCtx.fillRect(0, 0, digitTintCanvas.width, digitTintCanvas.height);
                digitTintCtx.globalCompositeOperation = 'source-over';
            }
            return digitTintCanvas;
        }
