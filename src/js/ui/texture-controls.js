// ============================================================================
// texture-controls.js - 贴图缩略图、参数控件、逐轨分组与颜色管理器
// 依赖：ui/texture-resolve.js、skin/parameter-schema.js
// ============================================================================

        // 高性能内存贴图缩略图渲染器：直接从 Image/Canvas 实例显存位图绘制到微型画布，绝不通过外部网络/失效 blob URL，杜绝破损图标
        // ===== 动态贴图缩略图播放器 =====
        // 多帧贴图（如 lightingN-0..N / lightingL-0..N / mania-stage-light-0..N）在参数面板的缩略图里
        // 逐帧循环播放，让用户一眼看出这是动画贴图。所有缩略图共用一个 60ms 定时器；
        // 容器被移出文档（面板重绘）后自动注销，绝不会因为反复重绘而泄漏定时器。
        const animatedThumbnails = [];
        let animatedThumbTimer = null;

        function drawThumbFrameToCanvas(canvas, imgObj, targetW, targetH) {
            const c = canvas.getContext('2d');
            if (!c || !imgObj) return;
            c.clearRect(0, 0, targetW, targetH);
            c.imageSmoothingEnabled = true;
            c.imageSmoothingQuality = 'high';
            const w = imgObj.naturalWidth || imgObj.videoWidth || imgObj.width || 0;
            const h = imgObj.naturalHeight || imgObj.videoHeight || imgObj.height || 0;
            if (w <= 0 || h <= 0) return;
            const scale = Math.min(targetW / w, targetH / h);
            const dw = Math.max(1, Math.round(w * scale));
            const dh = Math.max(1, Math.round(h * scale));
            c.drawImage(imgObj, Math.round((targetW - dw) / 2), Math.round((targetH - dh) / 2), dw, dh);
        }

        // 按键发光 (StageLight) 缩略图专用：底边对齐 + 纵向缩放 + 淡出，
        // 复刻 osu!lazer 里写死的按下(立即) / 松开(250ms 收缩淡出) 动画。
        function drawStageLightPreviewFrame(canvas, imgObj, targetW, targetH, scaleY, alpha) {
            const c = canvas.getContext('2d');
            if (!c || !imgObj) return;
            c.clearRect(0, 0, targetW, targetH);
            c.imageSmoothingEnabled = true;
            c.imageSmoothingQuality = 'high';
            const w = imgObj.naturalWidth || imgObj.videoWidth || imgObj.width || 0;
            const h = imgObj.naturalHeight || imgObj.videoHeight || imgObj.height || 0;
            if (w <= 0 || h <= 0) return;
            const scale = Math.min(targetW / w, targetH / h);
            const dw = Math.max(1, Math.round(w * scale));
            const fullH = Math.max(1, Math.round(h * scale));
            const dh = Math.max(1, Math.round(fullH * Math.max(0, Math.min(1, scaleY))));
            const x = Math.round((targetW - dw) / 2);
            const y = Math.max(0, Math.round(targetH - dh)); // Origin = BottomCentre：底边固定
            c.globalAlpha = Math.max(0, Math.min(1, alpha));
            c.drawImage(imgObj, x, y, dw, dh);
            c.globalAlpha = 1;
        }

        function pumpAnimatedThumbnails() {
            const now = performance.now();
            for (let i = animatedThumbnails.length - 1; i >= 0; i--) {
                const it = animatedThumbnails[i];
                if (!it.canvas.isConnected) { animatedThumbnails.splice(i, 1); continue; }

                // 按键发光缩略图：循环「出现 → 保持 → 250ms 收缩淡出」（引擎写死的固定动画）
                if (it.mode === 'stagelight') {
                    if (it.frames.length > 1 && now >= it.nextDue) {
                        it.nextDue = now + it.frameMs;
                        it.idx = (it.idx + 1) % it.frames.length;
                    }
                    const cycle = STAGE_LIGHT_PREVIEW_HOLD_MS + STAGE_LIGHT_FADE_DURATION_MS;
                    const t = (now - it.start) % cycle;
                    let scaleY = 1;
                    let alpha = 1;
                    if (t >= STAGE_LIGHT_PREVIEW_HOLD_MS) {
                        const p = (t - STAGE_LIGHT_PREVIEW_HOLD_MS) / STAGE_LIGHT_FADE_DURATION_MS;
                        scaleY = Math.max(0, 1 - p);
                        alpha = Math.max(0, 1 - p);
                    }
                    drawStageLightPreviewFrame(it.canvas, it.frames[it.idx], it.targetW, it.targetH, scaleY, alpha);
                    continue;
                }

                if (now < it.nextDue) continue;
                it.nextDue = now + it.frameMs;
                it.idx = (it.idx + 1) % it.frames.length;
                drawThumbFrameToCanvas(it.canvas, it.frames[it.idx], it.targetW, it.targetH);
            }
            if (animatedThumbnails.length === 0 && animatedThumbTimer) {
                clearInterval(animatedThumbTimer);
                animatedThumbTimer = null;
            }
        }

        function registerAnimatedThumbnail(canvas, frames, targetW, targetH, opts) {
            animatedThumbnails.push({
                canvas, frames, idx: 0,
                mode: (opts && opts.mode) || 'frames',
                start: performance.now(),
                // 一轮播放控制在 0.4~0.8s 之间：明显是动画，又不会闪得刺眼
                frameMs: Math.max(45, Math.min(160, Math.round(800 / frames.length))),
                nextDue: performance.now() + 300,
                targetW, targetH
            });
            if (!animatedThumbTimer) animatedThumbTimer = setInterval(pumpAnimatedThumbnails, 60);
        }

        function renderTextureThumbnail(container, imgObj, fallbackText = '未配置', targetW = 44, targetH = 32, frames = null, badgeHost = null, opts = null) {
            if (!container) return;
            container.innerHTML = '';
            if (!imgObj) {
                container.innerHTML = `<span class="no-img">${fallbackText}</span>`;
                return;
            }

            const w = imgObj.naturalWidth || imgObj.videoWidth || imgObj.width || 0;
            const h = imgObj.naturalHeight || imgObj.videoHeight || imgObj.height || 0;

            if (imgObj._isBlankPlaceholder) {
                container.innerHTML = '<span class="hud-glyph-placeholder" style="font-size:0.65rem; color:rgba(255,255,255,0.45); font-weight:500;">透明</span>';
                return;
            }

            if (w <= 0 || h <= 0) {
                container.innerHTML = `<span class="no-img">${fallbackText}</span>`;
                return;
            }

            if (w <= 1 && h <= 1) {
                container.innerHTML = '<span class="hud-glyph-placeholder" style="font-size:0.65rem; color:rgba(255,255,255,0.45); font-weight:500;">透明</span>';
                return;
            }

            // 整体全透明的贴图 → 同样标注「透明」，而不是显示一个空白框
            if (isFullyTransparentImage(imgObj, targetW, targetH)) {
                container.innerHTML = '<span class="hud-glyph-placeholder" style="font-size:0.65rem; color:rgba(255,255,255,0.45); font-weight:500;" title="该贴图整体全透明（皮肤作者用透明 PNG 隐藏了此元素）">透明</span>';
                return;
            }

            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = targetW;
            thumbCanvas.height = targetH;

            // 多帧贴图 → 缩略图逐帧循环播放；单帧 → 静态绘制
            const animFrames = (frames && frames.length > 1) ? frames : null;

            // 规格角标 (1x / @2x) 的落点：优先用调用方指定的 badgeHost（缩略图右侧的容器），
            // 其次若缩略图外层就是 .texture-preview-wrap 也放进去，否则退回贴在缩略图内部角落。
            const badgeTarget = badgeHost
                || ((container.parentElement && container.parentElement.classList.contains('texture-preview-wrap'))
                    ? container.parentElement : container);
            // 清掉上一次渲染残留的角标（缩略图容器已被 innerHTML 清空，外层容器需要手动清）
            if (badgeTarget !== container) {
                badgeTarget.querySelectorAll('.thumb-badge').forEach(el => el.remove());
            }

            try {
                if (opts && opts.stageLightPreview) {
                    // 按键发光：缩略图循环播放引擎写死的「按下 → 保持 → 250ms 收缩淡出」动画，
                    // 即使是单帧贴图也能直观看到按下 / 松开的动态效果。
                    const list = (frames && frames.length > 0) ? frames : [imgObj];
                    drawStageLightPreviewFrame(thumbCanvas, list[0], targetW, targetH, 1, 1);
                    registerAnimatedThumbnail(thumbCanvas, list, targetW, targetH, { mode: 'stagelight' });
                } else if (animFrames) {
                    drawThumbFrameToCanvas(thumbCanvas, animFrames[0], targetW, targetH);
                    registerAnimatedThumbnail(thumbCanvas, animFrames, targetW, targetH);
                } else {
                    drawThumbFrameToCanvas(thumbCanvas, imgObj, targetW, targetH);
                }
                container.appendChild(thumbCanvas);
                // 贴图规格角标：1x 与 @2x 使用**同一种**低调样式，且默认放在缩略图右侧、绝不遮挡缩略图。
                // 注：动态贴图不再额外标注帧数（帧数信息由缩略图本身的逐帧播放体现）。
                const is2x = !!imgObj._is2x;
                const badge = document.createElement('span');
                badge.className = 'thumb-badge badge-spec';
                badge.textContent = is2x ? '@2x' : '1x';
                badge.title = is2x ? '当前为 @2x 高清贴图 (在480p画布中以 0.5x 尺寸抗锯齿渲染)' : '当前为普通贴图 (以 1x 原始像素映射渲染)';
                badgeTarget.appendChild(badge);
            } catch (err) {
                console.warn('绘制缩略图失败:', err);
                container.innerHTML = `<span class="no-img">${fallbackText}</span>`;
            }
        }

        function clampScorePercentPaddingWidth(value) {
            const num = Math.round(Number(value));
            if (!Number.isFinite(num)) return 1;
            return Math.max(1, Math.min(2000, num));
        }

        function dataUrlToArrayBuffer(dataUrl) {
            const base64 = String(dataUrl).split(',')[1] || '';
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        }

        function getScorePercentVisibleGlyphSource(keys, textureName) {
            if (scorePercentSourceImages.has(textureName)) {
                return scorePercentSourceImages.get(textureName);
            }

            const current = getSkinFontImage('score', '%', keys);
            let source = (current && !current._isBlankPlaceholder && !isFullyTransparentImage(current, 64, 16))
                ? current
                : null;
            if (!source) {
                source = getSkinAnimationFromStore(defaultSkinImageStore, 'score-percent') ||
                    getSkinAnimationFromStore(defaultSkinFallbackStore, 'score-percent');
            }
            if (source) scorePercentSourceImages.set(textureName, source);
            return source;
        }

        function writeScorePercentTexture(canvas, textureName, is2x) {
            canvas._isRootLevel = !textureName.includes('/');
            canvas._candKey = textureName;

            saveSkinAssetToStore(skinImageStore, textureName, canvas, is2x, canvas._isRootLevel, true);
            const basename = textureName.split('/').pop();
            if (basename) {
                saveSkinAssetToStore(skinFallbackImageStore, basename, canvas, is2x, canvas._isRootLevel, true);
            }

            const arrayBuffer = dataUrlToArrayBuffer(canvas.toDataURL('image/png'));
            const currentSuffix = is2x ? '@2x.png' : '.png';
            const oppositeSuffix = is2x ? '.png' : '@2x.png';
            const exportFilename = `${textureName}${currentSuffix}`;
            userReplacedTextures.set(exportFilename, arrayBuffer);
            if (exportFilename !== exportFilename.toLowerCase()) {
                userReplacedTextures.set(exportFilename.toLowerCase(), arrayBuffer);
            }
            userReplacedTextures.delete(`${textureName}${oppositeSuffix}`);
            userReplacedTextures.delete(`${textureName.toLowerCase()}${oppositeSuffix}`);
        }

        // stable 导出包里不需要额外 ini 键，位置完全由 score-percent 贴图宽度决定。
        // 一旦调整宽度，就进入透明垫片模式；重新显示百分号必须恢复原始贴图。
        function setScorePercentPaddingWidth(value, keyCount = null) {
            const width = clampScorePercentPaddingWidth(value);
            const keys = (keyCount != null) ? keyCount : getActiveKeyCount();
            const textureName = getScorePercentTextureName(keys);

            // 覆盖透明垫片前保留原始贴图，供“显示百分号”开关恢复。
            getScorePercentVisibleGlyphSource(keys, textureName);

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = 1;
            canvas._is2x = false;
            writeScorePercentTexture(canvas, textureName, false);
            return width;
        }

        function restoreOriginalScorePercentTexture(keyCount = null) {
            const keys = (keyCount != null) ? keyCount : getActiveKeyCount();
            const textureName = getScorePercentTextureName(keys);
            const source = getScorePercentVisibleGlyphSource(keys, textureName);

            const restoreSuffixes = ['.png', '@2x.png'];
            for (const suffix of restoreSuffixes) {
                userReplacedTextures.delete(`${textureName}${suffix}`);
                userReplacedTextures.delete(`${textureName.toLowerCase()}${suffix}`);
            }

            if (!source) {
                // 没有可恢复的原始字形时，删除透明覆盖，让游戏回退到默认皮肤。
                saveSkinAssetToStore(skinImageStore, textureName, null, false, !textureName.includes('/'), true);
                const basename = textureName.split('/').pop();
                if (basename) {
                    saveSkinAssetToStore(skinFallbackImageStore, basename, null, false, !textureName.includes('/'), true);
                }
                return;
            }

            const srcW = source.naturalWidth || source.width || 1;
            const srcH = source.naturalHeight || source.height || 1;
            const canvas = document.createElement('canvas');
            canvas.width = srcW;
            canvas.height = srcH;
            canvas.getContext('2d').drawImage(source, 0, 0);
            canvas._is2x = !!source._is2x;
            writeScorePercentTexture(canvas, textureName, canvas._is2x);
        }

        // 8.5 构建「贴图参数」控件 (缩略图 + 路径输入 + 上传下拉)
        // 普通卡片与「逐轨道分组框」内的每一行共用此实现，保证两者功能与样式完全一致。
        // hoverHost: 上传菜单展开时需要提升 z-index 的容器 (普通卡片传卡片本身，逐轨行传所属分组框)
        function buildTextureParamControl(p, keys, hoverHost) {
            const combo = document.createElement('div');
            combo.className = 'texture-param-combo';

            // 预览缩略图 (缩略图 + 右侧规格角标 1x/@2x 并排，角标不遮挡缩略图)
            const previewWrap = document.createElement('div');
            previewWrap.className = 'texture-preview-wrap';
            const box = document.createElement('div');
            box.className = 'texture-preview-box';
            previewWrap.appendChild(box);
            // 统一解析「当前实际生效的贴图 + 状态」，逐轨与通用参数走同一套语义，
            // 保证「缩略图 / 路径框提示」与画布渲染三者永远一致
            const resolveLiveTexture = () => resolveTextureParam(keys, p);
            const paintPreview = (resolved, frames) => {
                const fallback = (resolved && resolved.state === 'missing') ? '未找到' : '未配置';
                // 多帧贴图 → 缩略图逐帧循环播放（frames 为空或单帧时保持静态）
                renderTextureThumbnail(box, resolved ? resolved.img : null, fallback, 44, 32, frames || null, previewWrap,
                    (p.key === 'StageLight') ? { stageLightPreview: true } : null);
                // 缩略图悬停提示：直接说明当前生效的贴图来源
                if (resolved && resolved.state === 'ok') {
                    box.title = `当前生效贴图: ${resolved.name}`;
                } else if (resolved && resolved.state === 'blank') {
                    box.title = '该贴图已被关闭 (skin.ini 指定为 blank/null/transparent，或使用了全透明 PNG)';
                } else if (resolved && resolved.state === 'missing') {
                    box.title = `skin.ini 指定了 ${resolved.name}，但皮肤中找不到该贴图文件`;
                } else {
                    box.title = '未找到可用的贴图';
                }
            };
            const initialResolved = resolveLiveTexture();
            paintPreview(initialResolved, resolveTextureParamFrames(keys, p));

            const mCfg = maniaSkinConfigurations.get(keys) || maniaSkinConfigurations.get(4) || {};
            const rawIniValue = getTextureParamIniValue(keys, p);

            // 贴图路径文本输入框 (展示并允许直接修改/配置 ini 中的指定路径，如 blank / null / 自定义贴图名)
            const pathInput = document.createElement('input');
            pathInput.type = 'text';
            pathInput.className = 'param-text-input texture-path-input';
            pathInput.value = rawIniValue;
            // 占位符只在「ini 未显式指定」时可见，因此它必须说清「当前实际用的是哪张贴图」，
            // 而不是干巴巴一句「未指定」——否则缩略图明明有图、路径框却写「未指定」，会让人以为没生效。
            let placeholderText;
            if (p._trackLookup != null) {
                if (initialResolved.state === 'ok') {
                    placeholderText = `本轨未单独指定 (实际使用: ${initialResolved.name})`;
                } else if (initialResolved.state === 'blank') {
                    placeholderText = `本轨已关闭 (${initialResolved.name || 'blank'})`;
                } else {
                    placeholderText = `本轨未单独指定 (${initialResolved.name || p.default || '默认'} 不存在)`;
                }
            } else {
                if (initialResolved.state === 'ok') {
                    placeholderText = `ini 未指定 (实际使用: ${initialResolved.name})`;
                } else if (initialResolved.state === 'blank') {
                    placeholderText = `已关闭 (${initialResolved.name || 'blank'})`;
                } else if (p.default) {
                    placeholderText = `ini 未指定 (${initialResolved.name || p.default} 不存在)`;
                } else {
                    placeholderText = '未指定 (可输入 blank / null / 贴图名)';
                }
            }
            pathInput.placeholder = placeholderText;
            pathInput.title = '当前 ini 中指定的贴图路径/名称；留空表示沿用皮肤默认贴图，输入 blank 或 null 可关闭该贴图';
            // 显式指定了名字但皮肤里找不到该文件 → 给出醒目的异常态提示
            if (initialResolved.state === 'missing') {
                pathInput.classList.add('texture-path-missing');
                pathInput.title = `skin.ini 指定了「${initialResolved.name}」，但皮肤中不存在该贴图文件（画布上将不绘制该元素）`;
            }
            pathInput.onchange = (e) => {
                const newPath = e.target.value.trim();
                recordSkinUndoBeforeChange(`修改 ${p.zhName || p.key} 贴图路径`);
                if (!mCfg.ImageLookups) mCfg.ImageLookups = new Map();
                mCfg[p.key] = newPath;
                mCfg.ImageLookups.set(p.key, newPath);
                mCfg.ImageLookups.set(p.key.toLowerCase(), newPath);
                const aliases = getTextureParamAliases(p.key, keys || 4);
                for (const a of aliases) {
                    mCfg.ImageLookups.set(a, newPath);
                    mCfg.ImageLookups.set(a.toLowerCase(), newPath);
                }
                if (globalSkinImageLookups) {
                    globalSkinImageLookups.set(p.key, newPath);
                    globalSkinImageLookups.set(p.key.toLowerCase(), newPath);
                    for (const a of aliases) {
                        globalSkinImageLookups.set(a, newPath);
                        globalSkinImageLookups.set(a.toLowerCase(), newPath);
                    }
                }
                syncParamInputValue(p.key, newPath);
                const updated = resolveLiveTexture();
                paintPreview(updated, resolveTextureParamFrames(keys, p));
                pathInput.classList.toggle('texture-path-missing', updated.state === 'missing');
                drawFrame();
            };

            const uploadTargetName = rawIniValue || p.default || p.key;

            const animationSupported = isTextureAnimationSupported(p.key, p._trackLookup, uploadTargetName);

            // 可折叠贴图上传下拉组件 (默认点击上传 1x，悬停展开 1x / @2x；支持动画时追加动态图片)
            const dropdown = document.createElement('div');
            dropdown.className = 'texture-upload-dropdown';
            dropdown.addEventListener('mouseenter', () => {
                if (hoverHost) hoverHost.style.zIndex = '500';
            });
            dropdown.addEventListener('mouseleave', () => {
                if (hoverHost) hoverHost.style.zIndex = '';
            });

            const mainBtn = document.createElement('button');
            mainBtn.type = 'button';
            mainBtn.className = 'texture-upload-main-btn';
            mainBtn.title = '默认点击直接上传 1x 普通贴图，鼠标悬停展开更多规格选项';
            mainBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>上传贴图</span>
                <svg class="dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            // 需求重点：默认直接点击则是上传 1x 贴图
            mainBtn.onclick = (e) => {
                e.stopPropagation();
                triggerTextureUpload(uploadTargetName, p.key, p.key, null, '1x');
            };

            const menu = document.createElement('div');
            menu.className = 'texture-upload-menu';

            // 选项1: 上传普通贴图 (1x)
            const item1x = document.createElement('button');
            item1x.type = 'button';
            item1x.className = 'texture-upload-menu-item item-1x';
            item1x.title = '上传普通 (1x) 分辨率贴图';
            item1x.innerHTML = `
                <span class="upload-menu-tag tag-1x">1x</span>
                <span class="upload-menu-text">上传 1x 普通贴图</span>
            `;
            item1x.onclick = (e) => {
                e.stopPropagation();
                triggerTextureUpload(uploadTargetName, p.key, p.key, null, '1x');
            };

            // 选项2: 上传 @2x 图片
            const item2x = document.createElement('button');
            item2x.type = 'button';
            item2x.className = 'texture-upload-menu-item item-2x';
            item2x.title = '上传 @2x 高清分辨率贴图';
            item2x.innerHTML = `
                <span class="upload-menu-tag tag-2x">@2x</span>
                <span class="upload-menu-text">上传 @2x 高清图片</span>
            `;
            item2x.onclick = (e) => {
                e.stopPropagation();
                triggerTextureUpload(uploadTargetName, p.key, p.key, null, '2x');
            };

            // 选项3: 上传动态图片（仅官方 wiki 标记 Animatable = Yes 的贴图）
            let itemAnim = null;
            if (animationSupported) {
                itemAnim = document.createElement('button');
                itemAnim.type = 'button';
                itemAnim.className = 'texture-upload-menu-item item-anim';
                itemAnim.title = '打开动态贴图序列帧管理器制作/导入多帧动画';
                itemAnim.innerHTML = `
                    <span class="upload-menu-tag tag-anim">动态</span>
                    <span class="upload-menu-text">上传动态贴图</span>
                `;
                itemAnim.onclick = (e) => {
                    e.stopPropagation();
                    openAnimTextureEditor(uploadTargetName, p.key, p.key, '1x');
                };
            }

            menu.appendChild(item1x);
            menu.appendChild(item2x);
            if (itemAnim) menu.appendChild(itemAnim);

            dropdown.appendChild(mainBtn);
            dropdown.appendChild(menu);

            combo.appendChild(previewWrap);
            combo.appendChild(pathInput);
            combo.appendChild(dropdown);
            return combo;
        }

        // 8.6 构建「逐轨道贴图分组框」
        // 同一贴图类型 (单键音符 / 长条头 / 长条身 / 长条尾 / 按键 / 按键按下) 的所有轨道
        // 统一收纳进同一个带边框的框内，每轨一行，功能与普通贴图卡片完全一致。
        function buildPerTrackTextureGroup(unit, keys) {
            const first = unit.items[0];

            const group = document.createElement('div');
            // 复用 .param-card 的外观 (无边框轻拟物悬浮卡片)，仅额外独占整行宽度，保证与其他选项框风格一致
            group.className = 'param-card per-track-texture-group';
            // 分组框本身沿用通用键 id (如 param-card-NoteImage)，供 focusParameter 的兜底高亮使用
            group.id = `param-card-${unit.groupKey}`;

            const header = document.createElement('div');
            header.className = 'param-card-header';
            header.innerHTML = `
                <div class="param-names">
                    <span class="param-zh-name">${unit.groupName}</span>
                    ${unit.desc ? `
                        <span class="param-info-trigger" tabindex="0">
                            <span class="param-info-icon">ⓘ</span>
                            <div class="param-desc-tooltip">${unit.desc}</div>
                        </span>
                    ` : ''}
                    <span class="param-en-name">${unit.groupEnName || unit.groupKey}</span>
                </div>
                <span class="per-track-count-badge">${unit.items.length} 轨</span>
            `;
            group.appendChild(header);

            const rows = document.createElement('div');
            rows.className = 'per-track-texture-rows';

            for (const p of unit.items) {
                const row = document.createElement('div');
                row.className = 'per-track-texture-row';
                // 每轨一行同样以真实 ini 键作为 id，画布定位高亮可直接命中单轨
                row.id = `param-card-${p.key}`;

                const label = document.createElement('span');
                label.className = 'per-track-label';
                label.textContent = `第 ${(p._trackCol != null ? p._trackCol : 0) + 1} 轨`;
                row.appendChild(label);

                row.appendChild(buildTextureParamControl(p, keys, group));

                if (p.elementId) {
                    const locateBtn = document.createElement('button');
                    locateBtn.type = 'button';
                    locateBtn.className = 'param-action-btn locate';
                    locateBtn.title = '在画布上框选此元素';
                    locateBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
                    locateBtn.onclick = () => {
                        const target = canvasInteractiveElements.find(i => i.id === p.elementId) ||
                            canvasInteractiveElements.find(i => i.paramKey === p.key);
                        if (target) {
                            selectedCanvasElement = target;
                            selectionAnimStartTime = performance.now();
                            syncCanvasSelectedCard(target);
                            drawFrame();
                            return;
                        }
                        // 打击特效元素只在「特效真的出现在画布上」时才登记为可点选，
                        // 当前没出现时给出明确说明，而不是让按钮静默失效。
                        if (p._trackLookup === LML.ExplosionImage || p._trackLookup === LML.HoldNoteLightImage) {
                            showToast('该打击特效此刻未出现',
                                '单键 / 长条打击特效只有在播放到命中那一刻才会出现在画布上，请先播放谱面再点定位。');
                        }
                    };
                    row.appendChild(locateBtn);
                }

                rows.appendChild(row);
            }

            group.appendChild(rows);
            return group;
        }

        // 9. 渲染参数配置列表
        // 构建「数字贴图」字形网格块 —— 分数 (score) 与连击 (combo) 共用同一套实现，
        // 保证两块贴图面板的外观、上传与定位交互完全一致。
        // opts: { title, glyphs, fontType, uploadParamKey, cardIdPrefix, blockClass, keys, q, locate }
        //   glyphs: [{ char, label, tex, targetId }]
        //   locate: (glyph) => 画布可交互元素 | null
        function buildFontGlyphBlock(opts) {
            const { title, glyphs, fontType, uploadParamKey, cardIdPrefix, blockClass, keys, q, locate } = opts;

            const block = document.createElement('div');
            block.className = 'param-category-block hud-font-glyphs-block';
            if (blockClass) block.classList.add(blockClass);

            const header = document.createElement('div');
            header.className = 'param-category-title';
            header.innerHTML = `<span>${title}</span><span class="count-badge">${glyphs.length}</span>`;
            block.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'hud-glyphs-grid';

            for (const g of glyphs) {
                if (q && !g.label.toLowerCase().includes(q) && !g.tex.toLowerCase().includes(q) && !g.char.includes(q)) {
                    continue;
                }

                const itemCard = document.createElement('div');
                itemCard.className = 'hud-glyph-card';
                itemCard.id = `${cardIdPrefix}-${g.char === '.' ? 'dot' : (g.char === '%' ? 'percent' : g.char)}`;

                // 获取当前贴图图像
                const img = getSkinFontImage(fontType, g.char, keys);

                // 数字字形卡保持原样：规格角标贴在缩略图内角（用户明确要求「数字那一栏还放到里面」）
                const previewBox = document.createElement('div');
                previewBox.className = 'hud-glyph-preview-box';
                renderTextureThumbnail(previewBox, img, g.char, 44, 44);

                const metaGroup = document.createElement('div');
                metaGroup.className = 'hud-glyph-meta';
                metaGroup.innerHTML = `
                    <div class="hud-glyph-title">${g.label}</div>
                    <div class="hud-glyph-filename">${g.tex}.png</div>
                `;

                const btnGroup = document.createElement('div');
                btnGroup.className = 'hud-glyph-actions';

                const uploadBtn = document.createElement('button');
                uploadBtn.type = 'button';
                uploadBtn.className = 'hud-glyph-btn upload';
                uploadBtn.title = `上传并替换 ${g.tex}.png 贴图`;
                uploadBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <span>导入</span>
                `;
                uploadBtn.onclick = () => {
                    triggerTextureUpload(g.tex, null, uploadParamKey);
                };

                const locateBtn = document.createElement('button');
                locateBtn.type = 'button';
                locateBtn.className = 'hud-glyph-btn locate';
                locateBtn.title = `在画布上框选此字符`;
                locateBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span>定位</span>
                `;
                locateBtn.onclick = () => {
                    const modal = document.getElementById('skinEditorModal');
                    if (modal) modal.classList.remove('active');
                    const target = locate ? locate(g) : null;
                    if (target) {
                        selectedCanvasElement = target;
                        selectionAnimStartTime = performance.now();
                        syncCanvasSelectedCard(target);
                        drawFrame();
                    }
                };

                btnGroup.appendChild(uploadBtn);
                btnGroup.appendChild(locateBtn);

                itemCard.appendChild(previewBox);
                itemCard.appendChild(metaGroup);
                itemCard.appendChild(btnGroup);
                grid.appendChild(itemCard);
            }

            block.appendChild(grid);
            return block;
        }

        // ===== 逐轨颜色管理器（轨道底色 ColumnColour 与按键动画颜色 ColourLight 共用）=====
        // 两者数据结构完全同构：cfg 上一个长度 = keys 的 {r,g,b,a} 数组，skin.ini 里逐轨写成
        //   Colour1..N（轨道底色） / ColourLight1..N（按键发光）。
        // 因此统一由本函数渲染「全轨统一条 + 逐轨卡片网格」，避免两份几乎一样的实现各自漂移。
        //
        // opts:
        //   arrKey        cfg 上的数组字段名（'ColumnColour' | 'ColourLight'）
        //   iniPrefix     卡片右上角展示的 ini 键前缀（'Colour' | 'ColourLight'）
        //   defaultColour 缺省颜色（底色 {0,0,0,255} / 发光 {255,255,255,255}）
        //   unifiedTitle  「全轨统一…」标题
        //   what          撤销 / toast 文案里的名词（'底色' | '发光颜色'）
        //   withPreview   是否附带「预览发光」按钮（仅 ColourLight 需要，见 testLightUntil）
        //   alphaZeroForcedOpaque  alpha=0 是否会被游戏强制为不透明（仅 ColourLight；底色/小节线的 0 就是透明）
        function buildPerTrackColourManager(cfg, keys, opts) {
            const arrKey = opts.arrKey;
            const defaultColour = opts.defaultColour || { r: 0, g: 0, b: 0, a: 255 };
            const what = opts.what || '颜色';

            const wrapper = document.createElement('div');
            wrapper.className = 'column-colour-manager-wrapper';

            if (!Array.isArray(cfg[arrKey])) cfg[arrKey] = new Array(keys);
            while (cfg[arrKey].length < keys) cfg[arrKey].push({ ...defaultColour });

            const toHex = (c) => `#${((1 << 24) + (c.r << 16) + (c.g << 8) + c.b).toString(16).slice(1)}`;
            const readHex = (picker) => {
                const hex = picker.value;
                return {
                    r: parseInt(hex.slice(1, 3), 16),
                    g: parseInt(hex.slice(3, 5), 16),
                    b: parseInt(hex.slice(5, 7), 16)
                };
            };
            const pctOf = (a) => Math.max(0, Math.min(100, Math.round(a / 255 * 100)));

            // ---- 1. 全轨统一快速设置条 ----
            const unifiedBar = document.createElement('div');
            unifiedBar.className = 'col-colour-unified-bar';
            unifiedBar.innerHTML = `
                <div class="col-colour-unified-label">
                    <span class="unified-title">${opts.unifiedTitle}</span>
                </div>
            `;

            const unifiedControls = document.createElement('div');
            unifiedControls.className = 'col-colour-unified-controls';

            const refCol = cfg[arrKey][0] || defaultColour;

            const uPicker = document.createElement('input');
            uPicker.type = 'color';
            uPicker.className = 'col-colour-picker';
            uPicker.value = toHex(refCol);

            const uAlpha = document.createElement('input');
            uAlpha.type = 'range';
            uAlpha.min = 0;
            uAlpha.max = 255;
            uAlpha.step = 1;
            uAlpha.value = (refCol.a != null) ? refCol.a : 255;
            uAlpha.className = 'col-colour-slider';
            uAlpha.style.setProperty('--slider-pct', pctOf(parseInt(uAlpha.value, 10)) + '%');

            const uVal = document.createElement('span');
            uVal.className = 'col-colour-val';
            // alpha = 0 是否会被游戏强制改成「不透明」（仅 ColourLight 如此，见 renderer.js 的
            // effectiveLightA 与 lazer 的 LegacyColourCompatibility.DisallowZeroAlpha）。
            // 轨道底色 / 小节线等其它颜色的 alpha=0 就是「透明」，不受此规则影响。
            const a0hint = !!opts.alphaZeroForcedOpaque;

            const updateUVal = (a) => {
                uVal.textContent = (a0hint && a === 0)
                    ? '透明度: 0 —— 游戏内会被强制为不透明'
                    : `透明度: ${a} (${pctOf(a)}%)`;
                uAlpha.style.setProperty('--slider-pct', pctOf(a) + '%');
            };
            updateUVal(parseInt(uAlpha.value, 10));

            const applyAllBtn = document.createElement('button');
            applyAllBtn.type = 'button';
            applyAllBtn.className = 'col-colour-apply-btn';
            applyAllBtn.textContent = '应用到全轨';

            const writeAll = (r, g, b, a) => {
                for (let i = 0; i < keys; i++) cfg[arrKey][i] = { r, g, b, a };
            };

            applyAllBtn.onclick = () => {
                recordSkinUndoBeforeChange(`统一全轨${what}`);
                const c = readHex(uPicker);
                const a = parseInt(uAlpha.value, 10);
                writeAll(c.r, c.g, c.b, a);
                continuousActionActive = false;
                drawFrame();
                renderSkinEditorParams();
                showToast(`已更新全轨${what}`, `RGBA(${c.r}, ${c.g}, ${c.b}, ${a})`);
            };

            uAlpha.oninput = () => {
                recordSkinUndoBeforeChange(`调整全轨${what}透明度`);
                const a = parseInt(uAlpha.value, 10);
                updateUVal(a);
                const c = readHex(uPicker);
                writeAll(c.r, c.g, c.b, a);
                drawFrame();
            };

            uPicker.oninput = () => {
                recordSkinUndoBeforeChange(`调整全轨${what}`);
                const c = readHex(uPicker);
                writeAll(c.r, c.g, c.b, parseInt(uAlpha.value, 10));
                drawFrame();
            };

            unifiedControls.appendChild(uPicker);
            unifiedControls.appendChild(uAlpha);
            unifiedControls.appendChild(uVal);
            unifiedControls.appendChild(applyAllBtn);

            if (opts.withPreview) {
                const previewBtn = document.createElement('button');
                previewBtn.type = 'button';
                previewBtn.className = 'col-colour-preview-btn';
                previewBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <span>预览发光</span>
                `;
                // 按键发光只在「按住」期间可见，没有这个开关就无法在编辑器里直接看到改色效果。
                // 点击后由 renderer 的 stageLightPreviewActive 强制所有轨道视为按下。
                previewBtn.onclick = () => {
                    testLightUntil = performance.now() + 2500;
                    drawFrame();
                };
                unifiedControls.appendChild(previewBtn);
            }

            unifiedBar.appendChild(unifiedControls);
            wrapper.appendChild(unifiedBar);

            // ---- 2. 各轨道独立调节卡片网格 ----
            const tracksGrid = document.createElement('div');
            tracksGrid.className = 'col-colour-tracks-grid';

            for (let col = 0; col < keys; col++) {
                const cItem = cfg[arrKey][col] || defaultColour;
                const colCard = document.createElement('div');
                colCard.className = 'col-colour-track-card';
                colCard.innerHTML = `
                    <div class="col-colour-card-header">
                        <span class="col-track-badge">第 ${col + 1} 轨</span>
                        <span class="col-ini-key">${opts.iniPrefix}${col + 1}</span>
                    </div>
                `;

                const body = document.createElement('div');
                body.className = 'col-colour-card-body';

                const itemPicker = document.createElement('input');
                itemPicker.type = 'color';
                itemPicker.className = 'col-colour-picker mini';
                itemPicker.value = toHex(cItem);

                const itemSlider = document.createElement('input');
                itemSlider.type = 'range';
                itemSlider.min = 0;
                itemSlider.max = 255;
                itemSlider.step = 1;
                const initA = (cItem.a != null) ? cItem.a : 255;
                itemSlider.value = initA;
                itemSlider.className = 'col-colour-slider mini';
                itemSlider.style.setProperty('--slider-pct', pctOf(initA) + '%');

                const itemVal = document.createElement('span');
                itemVal.className = 'col-colour-val mini';
                itemVal.textContent = `${initA}`;

                const updateSingle = () => {
                    recordSkinUndoBeforeChange(`调整第 ${col + 1} 轨${what}`);
                    const c = readHex(itemPicker);
                    const a = parseInt(itemSlider.value, 10);
                    if (a0hint && a === 0) {
                        itemVal.textContent = '0 · 强制不透明';
                        itemVal.title = 'alpha = 0 会被 osu! 强制为不透明，发光不会消失（想隐藏发光请把 StageLight 贴图设为 blank）';
                    } else {
                        itemVal.textContent = `${a}`;
                        itemVal.title = '';
                    }
                    itemSlider.style.setProperty('--slider-pct', pctOf(a) + '%');
                    cfg[arrKey][col] = { r: c.r, g: c.g, b: c.b, a: a };
                    drawFrame();
                };

                itemPicker.oninput = updateSingle;
                itemSlider.oninput = updateSingle;

                body.appendChild(itemPicker);
                body.appendChild(itemSlider);
                body.appendChild(itemVal);
                colCard.appendChild(body);
                tracksGrid.appendChild(colCard);
            }

            wrapper.appendChild(tracksGrid);
            return wrapper;
        }

        // 展开某个元素所在的分类块（focusParameter 定位参数时用：目标若在折叠分类里会看不见）
        function expandCategoryBlockFor(el) {
            if (!el || !el.closest) return;
            const blk = el.closest('.param-category-block');
            if (!blk || !blk.classList.contains('collapsed')) return;
            blk.classList.remove('collapsed');
            if (blk.dataset && blk.dataset.categoryKey) collapsedParamCategories.delete(blk.dataset.categoryKey);
        }
