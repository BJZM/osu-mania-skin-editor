// ============================================================================
// diagnostics.js - 调试面板、播放状态同步、选择高亮与画布尺寸同步
// 依赖：core/state.js、skin/mania-config.js
// ============================================================================

        function drawDebugWindow(d) {
            const cfg = getManiaConfigForKeys(d.keys);
            const lines = [];
            lines.push('===== skin.ini Debug (按 D 关闭) =====');
            lines.push(`Keys: ${d.keys}`);
            lines.push(`scale48: ${d.scale48.toFixed(4)}  (canvas ${canvas.width}x${canvas.height})`);
            lines.push('');
            lines.push('--- 坐标 / 位置 (raw → scaled) ---');
            lines.push(`ColumnStart: ${d.columnStartRaw} → ${d.startX.toFixed(1)}px`);
            lines.push(`HitPosition: ${(d.hitPos / d.scale48).toFixed(1)} → ${d.hitPos.toFixed(1)}px`);
            lines.push(`ScorePosition: ${d.scorePosFromSkin !== null ? (d.scorePosFromSkin / d.scale48).toFixed(1) + ' → ' + d.scorePosFromSkin.toFixed(1) + 'px' : '(默认)'}`);
            lines.push(`ComboPosition: ${(d.comboPosY / d.scale48).toFixed(1)} → ${d.comboPosY.toFixed(1)}px`);
            lines.push(`JudgementLine: ${d.showLine ? '1 (显示)' : '0 (隐藏)'}`);
            const noteBodyStyleLabel = d.noteBodyStyleCfg === NOTE_BODY_STYLE.Stretch ? 'Stretch'
                : (d.noteBodyStyleCfg === NOTE_BODY_STYLE.RepeatFromTail ? 'RepeatFromTail'
                    : (d.noteBodyStyleCfg === NOTE_BODY_STYLE.RepeatFromHead ? 'RepeatFromHead' : 'RepeatTopAndBottom'));
            lines.push(`NoteBodyStyle: ${d.noteBodyStyleCfg} (${noteBodyStyleLabel})`);
            lines.push('');
            lines.push('--- 列宽 (raw → scaled) ---');
            for (let i = 0; i < d.keys; i++) {
                const raw = (d.colWidths[i] / d.scale48).toFixed(1);
                lines.push(`  col[${i}]: width=${raw} → ${d.colWidths[i].toFixed(1)}px  x=${d.colXCache[i].toFixed(1)}`);
            }
            lines.push(`  totalTrackWidth: ${d.totalTrackWidth.toFixed(1)}px`);
            lines.push('');
            lines.push('--- 列间距 (raw → scaled) ---');
            for (let i = 0; i < d.keys - 1; i++) {
                const raw = (d.colSpacings[i] / d.scale48).toFixed(1);
                lines.push(`  gap[${i}↔${i + 1}]: ${raw} → ${d.colSpacings[i].toFixed(1)}px`);
            }
            lines.push('');
            lines.push('--- 按键状态 ---');
            let pressedStr = '';
            for (let i = 0; i < d.keys; i++) pressedStr += d.columnPressed[i] ? '■ ' : '□ ';
            lines.push(`  ${pressedStr}`);
            lines.push('');
            lines.push('--- 图片资源 ---');
            const lookups = [
                ['KeyImage', LML.KeyImage],
                ['KeyImageDown', LML.KeyImageDown],
                ['NoteImage', LML.NoteImage],
                ['NoteImageH', LML.HoldNoteHeadImage],
                ['NoteImageL', LML.HoldNoteBodyImage],
                ['NoteImageT', LML.HoldNoteTailImage],
                ['StageHint', LML.HitTargetImage],
                ['StageLeft', LML.LeftStageImage],
                ['StageRight', LML.RightStageImage],
                ['StageBottom', LML.BottomStageImage],
                ['StageLight', LML.LightImage],
                ['LightingN', LML.ExplosionImage],
                ['LightingL', LML.HoldNoteLightImage],
                ['Hit300g', LML.Hit300g],
            ];
            if (cfg) {
                lines.push(`  raw ColumnSpacing: [${cfg.ColumnSpacing.join(', ')}]`);
                lines.push(`  raw ColumnLineWidth: [${cfg.ColumnLineWidth.join(', ')}]`);
                lines.push(`  raw HitPosition: ${cfg.HitPosition}`);
                lines.push(`  raw ColumnStart: ${cfg.ColumnStart}`);
                lines.push(`  raw ScorePosition: ${cfg.ScorePosition}`);
                lines.push(`  raw ComboPosition: ${cfg.ComboPosition}`);
                lines.push(`  raw LightPosition: ${cfg.LightPosition}`);
                const clInfo = cfg.ColourLight ? cfg.ColourLight.slice(0, d.keys).map((c, i) => `c${i}:[${c.r},${c.g},${c.b}]`).join(' ') : 'none';
                lines.push(`  raw ColourLight: ${clInfo}`);
                lines.push(`  raw NoteBodyStyle: ${cfg.NoteBodyStyle}`);
                lines.push(`  raw ShowJudgementLine: ${cfg.ShowJudgementLine}`);
                lines.push(`  raw LightingNWidth: [${cfg.ExplosionWidth ? cfg.ExplosionWidth.join(', ') : ''}]`);
                lines.push(`  raw LightingLWidth: [${cfg.HoldNoteLightWidth ? cfg.HoldNoteLightWidth.join(', ') : ''}]`);
                lines.push(`  LightingN Scale col0: ${(getManiaSkinConfig(d.keys, LML.ExplosionScale, 0)?.value?.toFixed(2) || '1.00')}`);
                lines.push(`  LightingL Scale col0: ${(getManiaSkinConfig(d.keys, LML.HoldNoteLightScale, 0)?.value?.toFixed(2) || '1.00')}`);
                lines.push(`  raw KeysUnderNotes: ${cfg.KeysUnderNotes} (生效值: ${d.keysUnderNotes !== undefined ? d.keysUnderNotes : (cfg.KeysUnderNotes ? 1 : 0)})`);
                lines.push(`  -- all configs in map: [${[...maniaSkinConfigurations.keys()].join(', ')}]`);
            } else {
                lines.push('  config: NOT FOUND (using defaults)');
            }
            for (const [name, lookup] of lookups) {
                let img0 = getManiaSkinImage(d.keys, lookup, 0);
                let info;
                if (img0) {
                    info = `${img0.width}x${img0.height}${img0._is2x ? ' (@2x)' : ''}`;
                } else {
                    info = 'null';
                }
                let iniVal = '(默认文件名)';
                if (cfg) {
                    const info2 = imageLookupToIniPrefixSuffix(lookup);
                    if (info2 && !info2.fallbackOnly) {
                        const ci = '0';
                        const iniKey = info2.prefix + ci + info2.suffix;
                        if (cfg.ImageLookups.has(iniKey)) iniVal = cfg.ImageLookups.get(iniKey);
                        else if (cfg.ImageLookups.has(iniKey.toLowerCase())) iniVal = cfg.ImageLookups.get(iniKey.toLowerCase());
                    } else if (info2 && info2.fallbackOnly) {
                        iniVal = '(全局fallback)';
                    }
                }
                lines.push(`  ${name}[0]: ${info}  ini: "${iniVal}"`);
            }

            lines.push('');
            lines.push('--- 字体 / 数字贴图规范 (Fonts) ---');
            const explicitComboFont = getExplicitComboFontPrefix(d.keys);
            const activeComboPfx = explicitComboFont || skinFontsConfig.scorePrefix || 'score';
            const activeComboOverlap = (cfg && cfg.ComboOverlap != null) ? cfg.ComboOverlap : skinFontsConfig.comboOverlap;
            lines.push(`  ScorePrefix: "${skinFontsConfig.scorePrefix}" (overlap: ${skinFontsConfig.scoreOverlap})`);
            lines.push(`  ComboPrefix: "${skinFontsConfig.comboPrefix || '(inherit score)'}" (overlap: ${skinFontsConfig.comboOverlap})`);
            lines.push(`  HitCirclePrefix: "${skinFontsConfig.hitCirclePrefix}" (overlap: ${skinFontsConfig.hitCircleOverlap})`);
            lines.push(`  Mania Active FontCombo: "${activeComboPfx}" ${explicitComboFont ? '(ini 指定)' : '(未指定, 沿用 score 字体)'} (overlap: ${activeComboOverlap})`);
            let combo0Sample = getSkinFontImage('combo', '0', d.keys);
            let score0Sample = getSkinFontImage('score', '0', d.keys);
            lines.push(`  combo-0: ${combo0Sample ? `${combo0Sample.width}x${combo0Sample.height}${combo0Sample._is2x ? ' (@2x)' : ''}` : 'null'}`);
            lines.push(`  score-0: ${score0Sample ? `${score0Sample.width}x${score0Sample.height}${score0Sample._is2x ? ' (@2x)' : ''}` : 'null'}`);

            ctx.save();
            ctx.globalAlpha = 0.85;
            const panelW = 480;
            const panelH = lines.length * 16 + 16;
            const panelX = canvas.width - panelW - 10;
            const panelY = 10;
            ctx.fillStyle = '#1a1a2e';
            roundRect(ctx, panelX, panelY, panelW, panelH, 8);
            ctx.fill();
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
            ctx.lineWidth = 1;
            roundRect(ctx, panelX, panelY, panelW, panelH, 8);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.font = '12px Consolas, monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const y = panelY + 8 + i * 16;
                if (line.startsWith('=====') || line.startsWith('---')) {
                    ctx.fillStyle = '#66ccff';
                } else if (line.includes('null')) {
                    ctx.fillStyle = '#ff6b6b';
                } else {
                    ctx.fillStyle = '#e0e0e0';
                }
                ctx.fillText(line, panelX + 10, y);
            }
            ctx.restore();
        }


        function syncNotesStateWithTime(currentTimeMs) {
            judgements = [];
            activeExplosions = [];
            playbackBreakResumeTime = 0;
            judgementPreviewIndex = 0;
            comboAnimState.lastCombo = 0;
            comboAnimState.incStartTime = -1000;
            comboAnimState.breakStartTime = -1000;
            comboAnimState.breakCount = 0;
            resetComboHoldColourTint();
            for (let i = 0; i < activeNotes.length; i++) {
                let note = activeNotes[i];
                if (note.isHold) {
                    note.hit = (currentTimeMs >= note.startTime);
                    note.holdHeadFrozen = (currentTimeMs >= note.startTime);
                    note.tailHit = (currentTimeMs >= note.endTime);
                } else {
                    note.hit = (currentTimeMs >= note.startTime);
                }
            }
            if (typeof reconcileManiaHitsoundCues === 'function') {
                reconcileManiaHitsoundCues(currentTimeMs);
            }
        }

        // 说明：打击特效 (LightingN / LightingL) 过去会绘制一层「常驻虚线占位框」用于点选。
        // 现已按需求移除：改为「特效真正出现在画布上时才可点选」，与音符等元素的行为一致。
        // 选中后的可视化反馈统一交给 drawCanvasSelectionHighlight（白色圆角高亮外框）。

        function drawCanvasSelectionHighlight(ctx, elem, scale48) {
            if (!elem) return;

            const now = performance.now();
            const elapsed = now - selectionAnimStartTime;
            const ANIM_DURATION = 220; // 展开动画时长 220ms
            const progress = Math.min(1.0, Math.max(0.04, elapsed / ANIM_DURATION));
            // 三次方缓出 (Ease-Out Cubic)
            const ease = 1 - Math.pow(1 - progress, 3);

            // 比元素本体稍大一些：四周留 6px 留白 padding
            const pad = 6;
            const targetW = elem.w + pad * 2;
            const targetH = elem.h + pad * 2;
            const cx = elem.x + elem.w / 2;
            const cy = elem.y + elem.h / 2;

            // 从元素中心平滑展开
            const curW = Math.max(1, targetW * ease);
            const curH = Math.max(1, targetH * ease);
            const curX = cx - curW / 2;
            const curY = cy - curH / 2;

            ctx.save();

            // 透明的圆角矩形高亮外框 (白色样式)
            const cornerRadius = Math.min(8, Math.min(curW, curH) / 2);
            ctx.beginPath();
            roundRect(ctx, curX, curY, curW, curH, cornerRadius);

            // 透明底色填充 (纯白微透明)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fill();

            // 高亮边框描边 (纯白带微发光)
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 + 0.5 * ease})`;
            ctx.lineWidth = 1.8;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            ctx.shadowBlur = 8;
            ctx.stroke();

            // 针对单轨元素渲染精致的右边缘拉伸控制条手柄
            if (elem.id.startsWith('track_col_') && progress >= 0.7) {
                const rightX = curX + curW;
                const handleH = Math.min(80, curH * 0.25);
                const handleY = (canvas.height - handleH) / 2;
                const isDraggingWidth = (isDraggingCanvasElement && canvasDragState &&
                    canvasDragState.element && canvasDragState.element.id === elem.id &&
                    canvasDragState.dragType === 'column_width');

                ctx.save();
                ctx.fillStyle = isDraggingWidth ? '#ffffff' : 'rgba(255, 255, 255, 0.95)';
                ctx.shadowColor = isDraggingWidth ? 'rgba(255, 102, 170, 0.9)' : 'rgba(255, 255, 255, 0.75)';
                ctx.shadowBlur = isDraggingWidth ? 12 : 8;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(rightX - 2.5, handleY, 5, handleH, 2.5);
                } else {
                    ctx.rect(rightX - 2.5, handleY, 5, handleH);
                }
                ctx.fill();
                ctx.restore();
            }

            // KeyImage 上边框拉伸手柄：向上拖补底部透明像素，向下拖裁短 PNG，从而改变有效高度。
            if (elem.id.startsWith('key_') && elem.keyImageHeightAdjustable && progress >= 0.7) {
                const edgeY = Math.max(2, Math.min(canvas.height - 2,
                    elem.keyImageResizeEdgeY != null ? elem.keyImageResizeEdgeY : elem.y));
                const handleW = Math.max(28, Math.min(68, curW * 0.72));
                const handleH = 5;
                const handleX = elem.x + (elem.w - handleW) / 2;
                const isDraggingHeight = (isDraggingCanvasElement && canvasDragState &&
                    canvasDragState.element && canvasDragState.element.id === elem.id &&
                    canvasDragState.dragType === 'key_image_height');

                ctx.save();
                ctx.fillStyle = isDraggingHeight ? '#ffffff' : 'rgba(255, 255, 255, 0.95)';
                ctx.shadowColor = isDraggingHeight ? 'rgba(255, 102, 170, 0.95)' : 'rgba(255, 255, 255, 0.75)';
                ctx.shadowBlur = isDraggingHeight ? 12 : 8;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(handleX, edgeY - handleH / 2, handleW, handleH, handleH / 2);
                } else {
                    ctx.rect(handleX, edgeY - handleH / 2, handleW, handleH);
                }
                ctx.fill();
                ctx.restore();
            }

            // 贯穿全屏的水平参考虚线（针对判定线、连击数、判定评价、光效等 Y 轴位置元素：选中期间持续常驻显示，拖动与步进实时联动）
            // 轨道选取的垂直参考虚线已按要求彻底删除
            if (elem.dragAxis === 'y' && !elem.id.startsWith('track_col_')) {
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                const midY = elem.y + elem.h / 2;
                ctx.moveTo(0, midY);
                ctx.lineTo(canvas.width, midY);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();

            // 若动画未播放完毕，驱动下一帧渲染以保证流畅 60fps 展开
            if (progress < 1.0) {
                cancelAnimationFrame(animationId);
                animationId = requestAnimationFrame(drawFrame);
            }
        }

        // 3. 将画布选中元素的坐标同步到紧贴矩形框的操作工具栏
        function syncCanvasSize() {
            if (!canvas) return;
            const parent = canvas.parentElement;
            const w = Math.round(canvas.clientWidth || (parent ? parent.clientWidth : 0));
            const h = Math.round(canvas.clientHeight || (parent ? parent.clientHeight : 0));
            if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
                canvas.width = w;
                canvas.height = h;
                if (typeof drawFrame === 'function') {
                    drawFrame();
                }
            }
        }
