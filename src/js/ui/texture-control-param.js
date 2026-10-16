// ============================================================================
// texture-control-param.js - 单个贴图参数控件
// 从 texture-controls.js 按职责拆分。
// ============================================================================

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
