// ============================================================================
// canvas-interactions.js - 画布元素命中、选中、拖动与参数同步
// 依赖：ui/canvas-editor.js、ui/param-core.js、render/diagnostics.js
// ============================================================================

        const KEY_IMAGE_HEIGHT_MAX_PADDING_1X = 4096;
        const KEY_IMAGE_HEIGHT_MAX_CROP_1X = 4096;
        const KEY_IMAGE_HEIGHT_MAGNET_CANVAS_PX = 8;
        const keyImageHeightBaselineState = new Map();
        let keyImageHeightPersistGeneration = 0;

        function initCanvasEditorUI() {
            // 画布交互点击与拖拽监听
            if (canvas) {
                canvas.addEventListener('mousedown', (e) => {
                    if (!canvasEditMode) return;
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    const mouseX = (e.clientX - rect.left) * scaleX;
                    const mouseY = (e.clientY - rect.top) * scaleY;

                    // 严格分级命中检测算法（从高到低）：
                    // 判定提示 > 连击 > 血条 > note > hitposition > lightposition
                    // > lighting > mania-stage-light > KeyImage > 轨道。
                    let hit = null;
                    let keyImageHeightHandleHit = false;

                    // KeyImage 高度手柄属于独立编辑控件，优先于所有贴图命中，避免与 hitposition 重叠时失效。
                    const keyImageHandlePad = Math.max(8, 12 * (canvas.height / 480));
                    for (const item of canvasInteractiveElements) {
                        if (!item.id.startsWith('key_') || !item.keyImageHeightAdjustable ||
                            item.keyImageResizeEdgeY == null) continue;
                        if (mouseX >= item.x && mouseX <= item.x + item.w &&
                            Math.abs(mouseY - item.keyImageResizeEdgeY) <= keyImageHandlePad) {
                            keyImageHeightHandleHit = true;
                            hit = item;
                            break;
                        }
                    }

                    // 1. 判定提示（最高）
                    if (!hit) {
                        const item = canvasInteractiveElements.find(el => el.id === 'judgement');
                        if (item && mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                            hit = item;
                        }
                    }

                    // 2. 连击
                    if (!hit) {
                        const item = canvasInteractiveElements.find(el => el.id === 'combo');
                        if (item && mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                            hit = item;
                        }
                    }

                    // 3. 血条
                    if (!hit) {
                        const item = canvasInteractiveElements.find(el => el.id === 'healthDisplay');
                        if (item && mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                            hit = item;
                        }
                    }

                    // 其余 HUD 控件保持为高层 UI，优先级位于 note 之前。
                    if (!hit) {
                        for (const item of canvasInteractiveElements) {
                            if (!item.id.startsWith('hud_')) continue;
                            const pad = 3;
                            if (mouseX >= item.x - pad && mouseX <= item.x + item.w + pad &&
                                mouseY >= item.y - pad && mouseY <= item.y + item.h + pad) {
                                hit = item;
                                break;
                            }
                        }
                    }

                    // 4. note / hold
                    if (!hit && !isPlaying) {
                        let bestNote = null;
                        let minCenterDist = Infinity;
                        for (let i = canvasInteractiveElements.length - 1; i >= 0; i--) {
                            const item = canvasInteractiveElements[i];
                            if (!item.id.startsWith('note_') && !item.id.startsWith('hold_')) continue;
                            if (mouseX >= item.x && mouseX <= item.x + item.w &&
                                mouseY >= item.y && mouseY <= item.y + item.h) {
                                const centerY = item.y + item.h / 2;
                                const dist = Math.abs(mouseY - centerY);
                                if (dist < minCenterDist) {
                                    minCenterDist = dist;
                                    bestNote = item;
                                }
                            }
                        }
                        if (bestNote) hit = bestNote;
                    }

                    // 5. hitposition
                    if (!hit) {
                        const hp = canvasInteractiveElements.find(el => el.id === 'hitPosition');
                        const containsRect = (r) => r && mouseX >= r.x && mouseX <= r.x + r.w &&
                            mouseY >= r.y && mouseY <= r.y + r.h;
                        if (containsRect(hp)) hit = hp;
                    }

                    // 6. lightposition 手柄
                    if (!hit) {
                        const lp = canvasInteractiveElements.find(el => el.id === 'lightPosition');
                        if (lp) {
                            const lightHandle = {
                                x: lp.x,
                                y: (lp.handleY != null) ? lp.handleY : lp.y,
                                w: lp.w,
                                h: (lp.handleH != null) ? lp.handleH : lp.h
                            };
                            if (mouseX >= lightHandle.x && mouseX <= lightHandle.x + lightHandle.w &&
                                mouseY >= lightHandle.y && mouseY <= lightHandle.y + lightHandle.h) {
                                hit = lp;
                            }
                        }
                    }

                    // 7. lighting (LightingN / LightingL)
                    if (!hit) {
                        for (const item of canvasInteractiveElements) {
                            if (item.dragType !== 'lighting_width') continue;
                            // 已选中时外扩一点，方便直接抓住白色高亮边框向外/向内拉伸宽度
                            const lwPad = (selectedCanvasElement && selectedCanvasElement.id === item.id) ? 8 : 0;
                            if (mouseX >= item.x - lwPad && mouseX <= item.x + item.w + lwPad &&
                                mouseY >= item.y - lwPad && mouseY <= item.y + item.h + lwPad) {
                                hit = item;
                                break;
                            }
                        }
                    }

                    // 8. mania-stage-light 可见光柱本体
                    if (!hit) {
                        const lp = canvasInteractiveElements.find(el => el.id === 'lightPosition');
                        if (lp && lp.visibleY != null && lp.visibleH > 0 &&
                            mouseX >= lp.x && mouseX <= lp.x + lp.w &&
                            mouseY >= lp.visibleY && mouseY <= lp.visibleY + lp.visibleH) {
                            hit = lp;
                        }
                    }

                    // 9. KeyImage 贴图本体
                    if (!hit) {
                        for (const item of canvasInteractiveElements) {
                            if (!item.id.startsWith('key_')) continue;
                            if (mouseX >= item.x && mouseX <= item.x + item.w &&
                                mouseY >= item.y && mouseY <= item.y + item.h) {
                                hit = item;
                                break;
                            }
                        }
                    }

                    // 10. 轨道（最低；选中轨道的边缘手柄也属于轨道层级）
                    if (!hit) {
                        for (const item of canvasInteractiveElements) {
                            if (!item.id.startsWith('track_col_')) continue;
                            const isSelected = selectedCanvasElement && selectedCanvasElement.id === item.id;
                            const pad = isSelected ? 12 : 6;
                            if (mouseX >= item.x - pad && mouseX <= item.x + item.w + pad &&
                                mouseY >= item.y - pad && mouseY <= item.y + item.h + pad) {
                                hit = item;
                                break;
                            }
                        }
                    }

                    // 舞台边界不在指定顺序内，放在轨道同层附近，且不会抢占任何贴图。
                    if (!hit) {
                        const stageEdgePad = Math.max(18, Math.round(22 * (canvas.height / 480)));
                        for (const item of canvasInteractiveElements) {
                            const isStageEdge = item.id.startsWith('stageLeft') || item.id.startsWith('stageRight');
                            if (!isStageEdge) continue;
                            const isSelected = selectedCanvasElement && selectedCanvasElement.id === item.id;
                            const padX = isSelected ? Math.round(stageEdgePad * 1.35) : stageEdgePad;
                            const padY = Math.round(stageEdgePad * 0.55);
                            if (mouseX >= item.x - padX && mouseX <= item.x + item.w + padX &&
                                mouseY >= item.y - padY && mouseY <= item.y + item.h + padY) {
                                hit = item;
                                break;
                            }
                        }
                    }

                    if (hit) {
                        const isDifferentElement = !selectedCanvasElement ||
                            (selectedCanvasElement.noteInstanceKey || hit.noteInstanceKey
                                ? selectedCanvasElement.noteInstanceKey !== hit.noteInstanceKey
                                : selectedCanvasElement.id !== hit.id);
                        if (isDifferentElement) {
                            selectionAnimStartTime = performance.now();
                        }
                        selectedCanvasElement = hit;
                        syncCanvasSelectedCard(hit);
                        if (hit.dragAxis || keyImageHeightHandleHit) {
                            isDraggingCanvasElement = true;
                            const keys = getActiveKeyCount();
                            let cfg = maniaSkinConfigurations.get(keys);
                            if (!cfg) {
                                cfg = ensureManiaConfigForKeys(keys);
                                maniaSkinConfigurations.set(keys, cfg);
                            }
                            let initialVal;
                            let resolvedDragType = keyImageHeightHandleHit ? 'key_image_height' : hit.dragType;
                            // 打击特效宽度：记录本次抓取的是左边缘还是右边缘（向外拖 = 放大，向内拖 = 缩小）
                            let resizeEdge = null;
                            let keyImageHeightTarget = null;
                            let keyImageDownHeightTarget = null;
                            let keyImageLogicalPxPerCanvasPx = 1;

                            if (hit.id.startsWith('track_col_')) {
                                const pad = 6;
                                const rightHandleX = hit.x + hit.w + pad;
                                // 命中右边缘或者白色加粗控制手柄区域时，均触发宽度调整 (column_width)
                                const isRightEdge = (mouseX >= (hit.x + hit.w - 14) && mouseX <= (rightHandleX + 12));
                                if (currentTrackDragMode === 'width') {
                                    resolvedDragType = 'column_width';
                                } else if (currentTrackDragMode === 'spacing') {
                                    resolvedDragType = (hit.colIndex === 0) ? 'column_start' : 'column_spacing';
                                } else {
                                    // auto: 靠近右侧边缘或在白色加粗手柄区域拉伸宽度，主体区域左右拖动调整间距/位置
                                    resolvedDragType = isRightEdge ? 'column_width' : ((hit.colIndex === 0) ? 'column_start' : 'column_spacing');
                                }

                                if (resolvedDragType === 'column_width') {
                                    const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, hit.colIndex);
                                    initialVal = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;
                                } else if (resolvedDragType === 'column_spacing') {
                                    const spacingIdx = hit.colIndex - 1;
                                    const rawSRes = getManiaSkinConfig(keys, LML.ColumnSpacing, spacingIdx);
                                    initialVal = (rawSRes && rawSRes.value != null) ? rawSRes.value : 0;
                                } else if (resolvedDragType === 'column_start') {
                                    const colStartRes = getManiaSkinConfig(keys, LML.ColumnStart);
                                    initialVal = (colStartRes && colStartRes.value != null) ? colStartRes.value : 136;
                                }
                            } else if (resolvedDragType === 'key_image_height') {
                                keyImageHeightTarget = collectKeyImageHeightTarget(keys, hit.colIndex);
                                keyImageDownHeightTarget = collectKeyImageDownHeightTarget(keys, hit.colIndex);
                                initialVal = keyImageHeightTarget ? keyImageHeightTarget.initialOffset1x : 0;
                                const ratio = hit.keyImageIs2x ? 2 : 1;
                                const stableRefW = hit.keyImageStableRefWidth || (30 * 1.6 * ratio);
                                keyImageLogicalPxPerCanvasPx = stableRefW / Math.max(1, hit.w) / ratio;
                            } else if (hit.dragType === 'score_percent_width') {
                                initialVal = getScorePercentPaddingWidth(keys);
                            } else if (hit.dragType === 'lighting_width') {
                                // 打击特效宽度：宽度存在 cfg.ExplosionWidth / cfg.HoldNoteLightWidth 数组里，
                                // 不能像普通数值参数那样直接取 cfg[paramKey]（那会拿到整个数组）。
                                // 未显式配置时从「实际生效值 = 当前列宽」起拖，保证起始宽度不跳变。
                                initialVal = (hit.lightWidthValue != null) ? hit.lightWidthValue : 30;
                                // 判断抓取的是左边缘还是右边缘：向外拖 = 放大，向内拖 = 缩小
                                resizeEdge = (mouseX < hit.x + hit.w / 2) ? 'left' : 'right';
                            } else {
                                if (cfg[hit.paramKey] != null) {
                                    initialVal = cfg[hit.paramKey];
                                } else if (hit.paramKey === 'HitPosition') {
                                    initialVal = 402;
                                } else if (hit.paramKey === 'ScorePosition') {
                                    initialVal = 300;
                                } else if (hit.paramKey === 'ComboPosition') {
                                    initialVal = 111;
                                } else if (hit.paramKey === 'LightPosition') {
                                    initialVal = 413;
                                } else if (hit.paramKey === 'ColumnStart') {
                                    initialVal = 136;
                                } else {
                                    initialVal = 0;
                                }
                            }

                            canvasDragState = {
                                element: hit,
                                dragType: resolvedDragType,
                                startMouseX: mouseX,
                                startMouseY: mouseY,
                                initialVal: initialVal,
                                resizeEdge: resizeEdge,
                                keys: keys,
                                keyImageHeightTarget: keyImageHeightTarget,
                                keyImageDownHeightTarget: keyImageDownHeightTarget,
                                keyImageLogicalPxPerCanvasPx: keyImageLogicalPxPerCanvasPx,
                                currentOffset1x: initialVal
                            };
                        }
                        drawFrame();
                    } else {
                        selectedCanvasElement = null;
                        const card = document.getElementById('canvasSelectedCard');
                        if (card) card.style.display = 'none';
                        drawFrame();
                    }
                });

                window.addEventListener('mousemove', (e) => {
                    if (!canvas || !canvasEditMode) return;
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    const mouseX = (e.clientX - rect.left) * scaleX;
                    const mouseY = (e.clientY - rect.top) * scaleY;
                    const scale48 = canvas.height / 480;

                    if (isDraggingCanvasElement && canvasDragState) {
                        if (!canvasDragState.hasMoved) {
                            canvasDragState.hasMoved = true;
                            recordSkinUndoBeforeChange(`画布拖拽: ${canvasDragState.element.name || canvasDragState.dragType}`);
                        }
                        const elem = canvasDragState.element;
                        let cfg = maniaSkinConfigurations.get(canvasDragState.keys);
                        if (!cfg) {
                            // 只导入谱面（内置默认皮肤）时这里会走到：必须补一份**完整**配置，
                            // 否则残缺配置写回后 getManiaSkinConfig 读 cfg.ColumnWidth.length 会崩。
                            cfg = ensureManiaConfigForKeys(canvasDragState.keys);
                        }

                        const tooltip = document.getElementById('canvasDragTooltip');
                        const dragType = canvasDragState.dragType;

                        if (dragType === 'key_image_height') {
                            const deltaY = canvasDragState.startMouseY - mouseY;
                            const nextOffset1x = canvasDragState.initialVal +
                                deltaY * (canvasDragState.keyImageLogicalPxPerCanvasPx || 1);
                            const magnet = resolveKeyImageHeightMagnet(canvasDragState, nextOffset1x, scale48);
                            updateKeyImageHeightPreview(canvasDragState, magnet.offset1x, canvasDragState.keys);
                            if (tooltip) {
                                const offset = canvasDragState.currentOffset1x;
                                const offsetText = offset >= 0
                                    ? `底部透明 +${offset}px`
                                    : `裁短 ${Math.abs(offset)}px`;
                                const magnetText = magnet.magnetCol != null
                                    ? ` | 已吸附第 ${magnet.magnetCol + 1} 轨`
                                    : '';
                                tooltip.textContent = `按键高度: ${offsetText} (1x)${magnetText}`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'column_width') {
                            const col = elem.colIndex;
                            if (!Array.isArray(cfg.ColumnWidth)) {
                                cfg.ColumnWidth = new Array(canvasDragState.keys).fill(30);
                            }
                            while (cfg.ColumnWidth.length < canvasDragState.keys) {
                                cfg.ColumnWidth.push(30);
                            }
                            const deltaX = (mouseX - canvasDragState.startMouseX) / scale48;
                            let newW = Math.max(5, Math.min(300, Math.round(canvasDragState.initialVal + deltaX)));
                            // 轨道区最大总宽度保护：拖到上限即停住并提示
                            const boundDragW = getTrackParamUpperBound(cfg, canvasDragState.keys, 'ColumnWidth', col);
                            if (newW > boundDragW.maxAllowed) {
                                newW = Math.max(5, Math.floor(boundDragW.maxAllowed));
                                notifyTrackWidthLimit(`第 ${col + 1} 轨列宽`);
                            }
                            cfg.ColumnWidth[col] = newW;
                            syncColumnRightFromLayout(cfg, canvasDragState.keys);
                            if (tooltip) {
                                tooltip.textContent = `第 ${col + 1} 轨宽度: ${newW}px (480p)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue('ColumnWidth', cfg.ColumnWidth);
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'column_spacing') {
                            const spacingIdx = elem.colIndex - 1;
                            const spacingCount = Math.max(0, canvasDragState.keys - 1);
                            if (!Array.isArray(cfg.ColumnSpacing)) {
                                cfg.ColumnSpacing = new Array(spacingCount).fill(0);
                            }
                            while (cfg.ColumnSpacing.length < spacingCount) {
                                cfg.ColumnSpacing.push(0);
                            }
                            const deltaX = (mouseX - canvasDragState.startMouseX) / scale48;
                            // 核心要求：两个轨道之间的最小间距为 0！
                            let newS = Math.max(0, Math.min(200, Math.round(canvasDragState.initialVal + deltaX)));
                            // 轨道区最大总宽度保护：拖到上限即停住并提示
                            const boundDragS = getTrackParamUpperBound(cfg, canvasDragState.keys, 'ColumnSpacing', spacingIdx);
                            if (newS > boundDragS.maxAllowed) {
                                newS = Math.max(0, Math.floor(boundDragS.maxAllowed));
                                notifyTrackWidthLimit(`第 ${spacingIdx + 1} 轨与第 ${spacingIdx + 2} 轨间距`);
                            }
                            cfg.ColumnSpacing[spacingIdx] = newS;
                            syncColumnRightFromLayout(cfg, canvasDragState.keys);
                            if (tooltip) {
                                tooltip.textContent = `第 ${spacingIdx + 1} 轨与第 ${spacingIdx + 2} 轨间距: ${newS}px (最小: 0)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue('ColumnSpacing', cfg.ColumnSpacing);
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'column_start') {
                            const deltaX = (mouseX - canvasDragState.startMouseX) / scale48;
                            const newStart = Math.max(-200, Math.min(600, Math.round(canvasDragState.initialVal + deltaX)));
                            cfg.ColumnStart = newStart;
                            syncColumnRightFromLayout(cfg, canvasDragState.keys);
                            if (tooltip) {
                                tooltip.textContent = `整体轨道起始位置 ColumnStart: ${newStart}px | 靠右偏移 ColumnRight: ${cfg.ColumnRight}px`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue('ColumnStart', newStart);
                            syncParamInputValue('ColumnRight', cfg.ColumnRight);
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'score_percent_width') {
                            // 饼图向左右移动多少，就通过百分号垫片宽度反向换算多少：
                            // accLeftX = accRightX - ... - scorePercentWidth * 0.576 * scale768。
                            const accScale = 0.576 * (canvas.height / 768);
                            const deltaCanvas = mouseX - canvasDragState.startMouseX;
                            const nextWidth = clampScorePercentPaddingWidth(canvasDragState.initialVal - deltaCanvas / accScale);
                            setScorePercentPaddingWidth(nextWidth, canvasDragState.keys);
                            if (tooltip) {
                                tooltip.textContent = `准度位置: score-percent 宽度 ${nextWidth}px (1x)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue('ScorePercentWidth', nextWidth);
                            syncParamInputValue('ScorePercentVisible', false);
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'lighting_width') {
                            // 打击特效宽度拖拽：只改宽度，绝不改位置（位置被判定线 + 轨道中心锁死）
                            const col = elem.colIndex;
                            const widthKey = elem.paramKey; // 'ExplosionWidth' | 'HoldNoteLightWidth'
                            if (!Array.isArray(cfg[widthKey])) cfg[widthKey] = new Array(canvasDragState.keys).fill(0);
                            while (cfg[widthKey].length < canvasDragState.keys) cfg[widthKey].push(0);

                            // 按「该贴图 1px 宽度对应的画布像素」换算，拖拽时框边与鼠标严格 1:1 跟随
                            const pxPerUnit = (elem.pxPerUnit > 0) ? elem.pxPerUnit : scale48;
                            const deltaCanvas = mouseX - canvasDragState.startMouseX;
                            // 抓左边缘：向左拖 (deltaCanvas<0) 即向外 → 放大；抓右边缘：向右拖即向外 → 放大。
                            // 归纳起来就是「向外拉 = 放大，向内拉 = 缩小」，两个边缘都支持拉伸。
                            const outwardDelta = (canvasDragState.resizeEdge === 'left') ? -deltaCanvas : deltaCanvas;
                            let newW = Math.round(canvasDragState.initialVal + outwardDelta / pxPerUnit);
                            newW = Math.max(0, Math.min(300, newW));
                            cfg[widthKey][col] = newW;

                            if (tooltip) {
                                tooltip.textContent = `${elem.name}: ${newW}px${newW === 0 ? ' (0 = 跟随列宽)' : ''}`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue(widthKey, cfg[widthKey]);
                            syncCanvasSelectedCard(elem);
                        } else if (elem.dragAxis === 'y') {
                            const deltaY = (mouseY - canvasDragState.startMouseY) / scale48;
                            const udRes = getManiaSkinConfig(canvasDragState.keys, LML.UpsideDown);
                            const isUpsideDown = (udRes && (udRes.value === true || udRes.value === 1 || udRes.value === '1'));
                            const effectiveDeltaY = isUpsideDown ? -deltaY : deltaY;
                            const newVal = Math.max(0, Math.min(480, Math.round(canvasDragState.initialVal + effectiveDeltaY)));
                            cfg[elem.paramKey] = newVal;
                            if (elem.paramKey === 'ScorePosition') {
                                scorePosFromSkin = (isUpsideDown ? (480 - newVal) : newVal) * scale48;
                            }
                            if (tooltip) {
                                tooltip.textContent = `${elem.name}: ${newVal} (480p)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue(elem.paramKey, newVal);
                            syncCanvasSelectedCard(elem);
                        } else if (elem.dragAxis === 'x') {
                            const deltaX = (mouseX - canvasDragState.startMouseX) / scale48;
                            const newVal = Math.max(-200, Math.min(600, Math.round(canvasDragState.initialVal + deltaX)));
                            cfg[elem.paramKey] = newVal;
                            if (tooltip) {
                                tooltip.textContent = `${elem.name}: ${newVal} (480p)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue(elem.paramKey, newVal);
                            syncCanvasSelectedCard(elem);
                        }
                    } else {
                        // 鼠标悬停改变指针图标 (同样遵循分级检测原则)
                        let hoverHit = null;
                        let hoveringKeyImageHeightHandle = false;

                        // KeyImage 高度手柄与 mousedown 保持一致，始终最先命中。
                        const keyImageHandlePad = Math.max(8, 12 * (canvas.height / 480));
                        for (const item of canvasInteractiveElements) {
                            if (!item.id.startsWith('key_') || !item.keyImageHeightAdjustable ||
                                item.keyImageResizeEdgeY == null) continue;
                            if (mouseX >= item.x && mouseX <= item.x + item.w &&
                                Math.abs(mouseY - item.keyImageResizeEdgeY) <= keyImageHandlePad) {
                                hoverHit = item;
                                hoveringKeyImageHeightHandle = true;
                                break;
                            }
                        }

                        // 与 mousedown 保持相同的高到低优先级。
                        if (!hoverHit) {
                            const item = canvasInteractiveElements.find(el => el.id === 'judgement');
                            if (item && mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                                hoverHit = item;
                            }
                        }
                        if (!hoverHit) {
                            const item = canvasInteractiveElements.find(el => el.id === 'combo');
                            if (item && mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                                hoverHit = item;
                            }
                        }
                        if (!hoverHit) {
                            const item = canvasInteractiveElements.find(el => el.id === 'healthDisplay');
                            if (item && mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                                hoverHit = item;
                            }
                        }
                        if (!hoverHit) {
                            for (const item of canvasInteractiveElements) {
                                if (!item.id.startsWith('hud_')) continue;
                                const pad = 3;
                                if (mouseX >= item.x - pad && mouseX <= item.x + item.w + pad &&
                                    mouseY >= item.y - pad && mouseY <= item.y + item.h + pad) {
                                    hoverHit = item;
                                    break;
                                }
                            }
                        }

                        // note / hold
                        if (!hoverHit && !isPlaying) {
                            let bestHover = null;
                            let minHoverDist = Infinity;
                            for (let i = canvasInteractiveElements.length - 1; i >= 0; i--) {
                                const item = canvasInteractiveElements[i];
                                if (!item.id.startsWith('note_') && !item.id.startsWith('hold_')) continue;
                                if (mouseX >= item.x && mouseX <= item.x + item.w &&
                                    mouseY >= item.y && mouseY <= item.y + item.h) {
                                    const centerY = item.y + item.h / 2;
                                    const dist = Math.abs(mouseY - centerY);
                                    if (dist < minHoverDist) {
                                        minHoverDist = dist;
                                        bestHover = item;
                                    }
                                }
                            }
                            if (bestHover) {
                                hoverHit = bestHover;
                            }
                        }

                        // hitposition
                        if (!hoverHit) {
                            const hp = canvasInteractiveElements.find(el => el.id === 'hitPosition');
                            if (hp && mouseX >= hp.x && mouseX <= hp.x + hp.w && mouseY >= hp.y && mouseY <= hp.y + hp.h) {
                                hoverHit = hp;
                            }
                        }

                        // lightposition 手柄
                        if (!hoverHit) {
                            const lp = canvasInteractiveElements.find(el => el.id === 'lightPosition');
                            if (lp) {
                                const lightHandle = {
                                    x: lp.x,
                                    y: (lp.handleY != null) ? lp.handleY : lp.y,
                                    w: lp.w,
                                    h: (lp.handleH != null) ? lp.handleH : lp.h
                                };
                                if (mouseX >= lightHandle.x && mouseX <= lightHandle.x + lightHandle.w &&
                                    mouseY >= lightHandle.y && mouseY <= lightHandle.y + lightHandle.h) {
                                    hoverHit = lp;
                                }
                            }
                        }

                        // lighting
                        if (!hoverHit) {
                            for (const item of canvasInteractiveElements) {
                                if (item.dragType !== 'lighting_width') continue;
                                const lwPad = (selectedCanvasElement && selectedCanvasElement.id === item.id) ? 8 : 0;
                                if (mouseX >= item.x - lwPad && mouseX <= item.x + item.w + lwPad &&
                                    mouseY >= item.y - lwPad && mouseY <= item.y + item.h + lwPad) {
                                    hoverHit = item;
                                    break;
                                }
                            }
                        }

                        // mania-stage-light 可见光柱本体
                        if (!hoverHit) {
                            const lp = canvasInteractiveElements.find(el => el.id === 'lightPosition');
                            if (lp) {
                                if (lp.visibleY != null && lp.visibleH > 0 &&
                                    mouseX >= lp.x && mouseX <= lp.x + lp.w &&
                                    mouseY >= lp.visibleY && mouseY <= lp.visibleY + lp.visibleH) {
                                    hoverHit = lp;
                                }
                            }
                        }

                        // KeyImage 贴图本体
                        if (!hoverHit) {
                            for (const item of canvasInteractiveElements) {
                                if (!item.id.startsWith('key_')) continue;
                                if (mouseX >= item.x && mouseX <= item.x + item.w &&
                                    mouseY >= item.y && mouseY <= item.y + item.h) {
                                    hoverHit = item;
                                    break;
                                }
                            }
                        }

                        // 轨道
                        if (!hoverHit) {
                            for (const item of canvasInteractiveElements) {
                                if (!item.id.startsWith('track_col_')) continue;
                                const pad = (selectedCanvasElement && selectedCanvasElement.id === item.id) ? 12 : 6;
                                if (mouseX >= item.x - pad && mouseX <= item.x + item.w + pad &&
                                    mouseY >= item.y - pad && mouseY <= item.y + item.h + pad) {
                                    hoverHit = item;
                                    break;
                                }
                            }
                        }

                        if (hoverHit) {
                            if (hoveringKeyImageHeightHandle) {
                                canvas.style.cursor = 'ns-resize';
                            } else if (hoverHit.id.startsWith('track_col_')) {
                                const pad = 6;
                                const rightHandleX = hoverHit.x + hoverHit.w + pad;
                                // 判定是否在右边缘或者白色加粗控制条手柄区域 (包括白色高亮外延)
                                const isRightEdge = (mouseX >= (hoverHit.x + hoverHit.w - 14) && mouseX <= (rightHandleX + 12));
                                if (currentTrackDragMode === 'width') {
                                    canvas.style.cursor = 'ew-resize';
                                } else if (currentTrackDragMode === 'spacing') {
                                    canvas.style.cursor = 'grab';
                                } else {
                                    canvas.style.cursor = isRightEdge ? 'col-resize' : 'grab';
                                }
                            } else if (hoverHit.dragAxis === 'y') {
                                canvas.style.cursor = 'ns-resize';
                            } else if (hoverHit.dragAxis === 'x') {
                                canvas.style.cursor = 'ew-resize';
                            } else {
                                canvas.style.cursor = 'pointer';
                            }
                        } else {
                            canvas.style.cursor = 'default';
                        }
                    }
                });

                window.addEventListener('mouseup', () => {
                    if (isDraggingCanvasElement) {
                        const finishedDragState = canvasDragState;
                        isDraggingCanvasElement = false;
                        canvasDragState = null;
                        continuousActionActive = false;
                        const tooltip = document.getElementById('canvasDragTooltip');
                        if (tooltip) tooltip.style.display = 'none';
                        if (selectedCanvasElement) {
                            syncCanvasSelectedCard(selectedCanvasElement);
                        }
                        if (typeof syncTextureEditorNonTextureSettings === 'function') {
                            syncTextureEditorNonTextureSettings();
                        }
                        if (finishedDragState && finishedDragState.dragType === 'key_image_height' &&
                            finishedDragState.hasMoved && finishedDragState.keyImageHeightTarget) {
                            if (typeof handleKeyImageHeightDragEnd === 'function') {
                                void handleKeyImageHeightDragEnd(finishedDragState)
                                    .catch((err) => {
                                        console.error('保存按键高度调整失败', err);
                                        showToast('按键高度保存失败', err.message || '未知错误');
                                    });
                            }
                        }
                    }
                });
            }
        }
