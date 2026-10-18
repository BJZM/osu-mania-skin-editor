// ============================================================================
// texture-control-param.js - 单个贴图参数控件
// 从 texture-controls.js 按职责拆分。
// ============================================================================

        let activeTextureEditModeDropdown = null;

        function closeActiveTextureEditModeMenu() {
            if (!activeTextureEditModeDropdown) return;
            activeTextureEditModeDropdown.dispatchEvent(
                new Event('texture-edit-menu-close')
            );
        }

        function buildTextureParamControl(p, keys, hoverHost, options = {}) {
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
            let editButton = null;
            let editDropdown = null;
            let editModeMenu = null;
            let editCreatedPath = '';
            let editMenuCloseHandler = null;
            let editMenuOpenTimer = null;
            let editMenuCloseTimer = null;

            function clearEditMenuTimers() {
                if (editMenuOpenTimer) clearTimeout(editMenuOpenTimer);
                if (editMenuCloseTimer) clearTimeout(editMenuCloseTimer);
                editMenuOpenTimer = null;
                editMenuCloseTimer = null;
            }

            function closeEditModeMenu() {
                if (!editDropdown || !editButton) return;
                clearEditMenuTimers();
                editDropdown.classList.remove('is-open');
                editButton.setAttribute('aria-expanded', 'false');
                if (editMenuCloseHandler) {
                    document.removeEventListener('pointerdown', editMenuCloseHandler);
                    editMenuCloseHandler = null;
                }
                if (hoverHost) hoverHost.style.zIndex = '';
                if (activeTextureEditModeDropdown === editDropdown) {
                    activeTextureEditModeDropdown = null;
                }
            }

            function openEditModeMenu() {
                if (!editDropdown || !editButton || !editCreatedPath) return;
                if (activeTextureEditModeDropdown &&
                    activeTextureEditModeDropdown !== editDropdown) {
                    activeTextureEditModeDropdown.dispatchEvent(
                        new Event('texture-edit-menu-close')
                    );
                }
                activeTextureEditModeDropdown = editDropdown;
                closeEditModeMenu();
                activeTextureEditModeDropdown = editDropdown;
                const buttonRect = editButton.getBoundingClientRect();
                const menuHeight = 140;
                const openUp = window.innerHeight - buttonRect.bottom < menuHeight + 12;
                editDropdown.classList.toggle('opens-up', openUp);
                editDropdown.classList.add('is-open');
                editButton.setAttribute('aria-expanded', 'true');
                if (hoverHost) hoverHost.style.zIndex = '650';
                editMenuCloseHandler = (event) => {
                    if (!editDropdown.contains(event.target)) closeEditModeMenu();
                };
                document.addEventListener('pointerdown', editMenuCloseHandler);
            }

            function scheduleEditModeMenuOpen() {
                if (!editDropdown || !editButton || !editCreatedPath ||
                    editDropdown.classList.contains('is-open')) {
                    return;
                }
                if (editMenuCloseTimer) {
                    clearTimeout(editMenuCloseTimer);
                    editMenuCloseTimer = null;
                }
                if (editMenuOpenTimer) return;
                editMenuOpenTimer = setTimeout(() => {
                    editMenuOpenTimer = null;
                    openEditModeMenu();
                }, 150);
            }

            function scheduleEditModeMenuClose() {
                if (!editDropdown || !editButton || !editCreatedPath) return;
                if (editMenuOpenTimer) {
                    clearTimeout(editMenuOpenTimer);
                    editMenuOpenTimer = null;
                }
                if (editMenuCloseTimer) clearTimeout(editMenuCloseTimer);
                editMenuCloseTimer = setTimeout(() => {
                    editMenuCloseTimer = null;
                    if (!editDropdown.matches(':hover') &&
                        !editDropdown.contains(document.activeElement)) {
                        closeEditModeMenu();
                    }
                }, 240);
            }

            function getCreatedTextureEditPath(resolved) {
                if (!resolved || resolved.state !== 'ok' || !resolved.name || !resolved.img) {
                    return '';
                }
                if (typeof hasCreatedTextureParams !== 'function' ||
                    !hasCreatedTextureParams(resolved.name)) {
                    return '';
                }
                return resolved.name;
            }

            function updateEditAction(resolved) {
                if (!editButton) return;
                editCreatedPath = getCreatedTextureEditPath(resolved);
                editButton.disabled = resolved.state !== 'ok' || !resolved.img;
                editButton.classList.toggle('has-modes', !!editCreatedPath);
                editButton.setAttribute('aria-haspopup', editCreatedPath ? 'menu' : 'false');
                editButton.setAttribute('aria-expanded', 'false');
                editButton.title = editCreatedPath
                    ? '编辑自建贴图，可选择通用编辑或生成设置'
                    : (options.editTitle
                        || (editButton.disabled ? '当前没有可编辑的图片' : '编辑该贴图'));
                if (editModeMenu) editModeMenu.hidden = !editCreatedPath;
                closeEditModeMenu();
            }

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

                preserveHoldHeadsBeforeNoteEdit(keys, p, { syncInput: true });

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
                updateEditAction(updated);
                drawFrame();
            };

            const uploadTargetName = rawIniValue || p.default || p.key;

            const animationSupported = isTextureAnimationSupported(p.key, p._trackLookup, uploadTargetName);

            // 可折叠贴图导入下拉组件 (默认点击导入 1x，悬停展开 1x / @2x；支持动画时追加动态图片)
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
            mainBtn.title = '默认点击直接导入 1x 普通贴图，鼠标悬停展开更多规格选项';
            mainBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>导入图片</span>
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
            item1x.title = '导入普通 (1x) 分辨率贴图';
            item1x.innerHTML = `
                <span class="upload-menu-tag tag-1x">1x</span>
                <span class="upload-menu-text">导入 1x 普通贴图</span>
            `;
            item1x.onclick = (e) => {
                e.stopPropagation();
                triggerTextureUpload(uploadTargetName, p.key, p.key, null, '1x');
            };

            // 选项2: 上传 @2x 图片
            const item2x = document.createElement('button');
            item2x.type = 'button';
            item2x.className = 'texture-upload-menu-item item-2x';
            item2x.title = '导入 @2x 高清分辨率贴图';
            item2x.innerHTML = `
                <span class="upload-menu-tag tag-2x">@2x</span>
                <span class="upload-menu-text">导入 @2x 高清图片</span>
            `;
            item2x.onclick = (e) => {
                e.stopPropagation();
                triggerTextureUpload(uploadTargetName, p.key, p.key, null, '2x');
            };

            // 选项3: 引用当前皮肤中已有的贴图，只改写 skin.ini 路径
            const itemExisting = document.createElement('button');
            itemExisting.type = 'button';
            itemExisting.className = 'texture-upload-menu-item item-existing';
            itemExisting.title = '从当前皮肤已有贴图中选择，只修改路径而不复制图片';
            itemExisting.innerHTML = `
                <span class="upload-menu-tag tag-existing">引用</span>
                <span class="upload-menu-text">从已有贴图导入</span>
            `;
            itemExisting.onclick = (e) => {
                e.stopPropagation();
                openTextureExistingPicker(p, keys);
            };

            // 选项4: 上传动态图片（仅官方 wiki 标记 Animatable = Yes 的贴图）
            let itemAnim = null;
            if (animationSupported) {
                itemAnim = document.createElement('button');
                itemAnim.type = 'button';
                itemAnim.className = 'texture-upload-menu-item item-anim';
                itemAnim.title = '打开动态贴图序列帧管理器制作/导入多帧动画';
                itemAnim.innerHTML = `
                    <span class="upload-menu-tag tag-anim">动态</span>
                    <span class="upload-menu-text">导入动态贴图</span>
                `;
                itemAnim.onclick = (e) => {
                    e.stopPropagation();
                    openAnimTextureEditor(uploadTargetName, p.key, p.key, '1x');
                };
            }

            menu.appendChild(item1x);
            menu.appendChild(item2x);
            menu.appendChild(itemExisting);
            if (itemAnim) menu.appendChild(itemAnim);

            dropdown.appendChild(mainBtn);
            dropdown.appendChild(menu);

            if (typeof options.onEdit === 'function') {
                editDropdown = document.createElement('div');
                editDropdown.className = 'texture-edit-dropdown';

                editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'texture-upload-main-btn texture-edit-main-btn';
                editButton.dataset.paramKey = p.key;
                editButton.disabled = !!options.editDisabled;
                editButton.title = options.editTitle
                    || (editButton.disabled ? '当前没有可编辑的图片' : '编辑该贴图');
                editButton.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                    <span>编辑</span>
                    <svg class="edit-mode-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                `;
                editButton.onclick = (event) => {
                    event.stopPropagation();
                    if (editButton.disabled) return;
                    if (editCreatedPath) {
                        openEditModeMenu();
                        return;
                    }
                    options.onEdit();
                };
                editButton.onkeydown = (event) => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    closeEditModeMenu();
                };

                editModeMenu = document.createElement('div');
                editModeMenu.className = 'texture-edit-mode-menu';
                editModeMenu.setAttribute('role', 'menu');
                editModeMenu.setAttribute('aria-label', '选择贴图编辑方式');
                editModeMenu.hidden = true;

                const generalEditBtn = document.createElement('button');
                generalEditBtn.type = 'button';
                generalEditBtn.className = 'texture-edit-mode-option is-general';
                generalEditBtn.dataset.editMode = 'general';
                generalEditBtn.setAttribute('role', 'menuitem');
                generalEditBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
                        <path d="M6 2v14a2 2 0 0 0 2 2h14"></path>
                        <path d="M18 22V8a2 2 0 0 0-2-2H2"></path>
                    </svg>
                    <span>通用编辑</span>
                `;
                generalEditBtn.onclick = (event) => {
                    event.stopPropagation();
                    const path = editCreatedPath;
                    closeEditModeMenu();
                    if (path && typeof openTextureLibraryGeneralEditor === 'function') {
                        openTextureLibraryGeneralEditor(path, { paramKey: p.key });
                    }
                };

                const generationEditBtn = document.createElement('button');
                generationEditBtn.type = 'button';
                generationEditBtn.className = 'texture-edit-mode-option is-generation';
                generationEditBtn.dataset.editMode = 'generation';
                generationEditBtn.setAttribute('role', 'menuitem');
                generationEditBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
                        <line x1="4" y1="7" x2="20" y2="7"></line>
                        <line x1="4" y1="17" x2="20" y2="17"></line>
                        <circle cx="9" cy="7" r="2"></circle>
                        <circle cx="15" cy="17" r="2"></circle>
                    </svg>
                    <span>生成设置</span>
                `;
                generationEditBtn.onclick = (event) => {
                    event.stopPropagation();
                    const path = editCreatedPath;
                    closeEditModeMenu();
                    if (path && typeof openTextureCreator === 'function') {
                        openTextureCreator({ editPath: path });
                    }
                };

                editModeMenu.append(generalEditBtn, generationEditBtn);
                editDropdown.append(editButton, editModeMenu);
                editDropdown.addEventListener(
                    'texture-edit-menu-close',
                    closeEditModeMenu
                );
                editDropdown.addEventListener('mouseenter', scheduleEditModeMenuOpen);
                editDropdown.addEventListener('mouseleave', scheduleEditModeMenuClose);
                editDropdown.addEventListener('focusin', () => {
                    if (editCreatedPath &&
                        !editDropdown.classList.contains('is-open')) {
                        openEditModeMenu();
                    }
                });
                editDropdown.addEventListener('focusout', (event) => {
                    if (!editDropdown.contains(event.relatedTarget)) {
                        scheduleEditModeMenuClose();
                    }
                });
                updateEditAction(initialResolved);
            }

            combo.appendChild(previewWrap);
            combo.appendChild(pathInput);
            if (editDropdown) combo.appendChild(editDropdown);
            combo.appendChild(dropdown);
            return combo;
        }

        // 8.6 构建「逐轨道贴图分组框」
        // 同一贴图类型 (单键音符 / 长条头 / 长条身 / 长条尾 / 按键 / 按键按下) 的所有轨道
        // 统一收纳进同一个带边框的框内，每轨一行，功能与普通贴图卡片完全一致。
