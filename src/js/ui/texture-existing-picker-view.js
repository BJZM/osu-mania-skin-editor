// ============================================================================
// texture-existing-picker-view.js - 已有贴图候选卡片与预览渲染
// 依赖：ui/texture-existing-sources.js
// ============================================================================

        function getTextureExistingTargetLabel(p) {
            if (!p) return '-';
            const schema = (typeof SKIN_INI_PARAM_SCHEMA !== 'undefined')
                ? SKIN_INI_PARAM_SCHEMA.find((item) => item.key === p.key)
                : null;
            return schema && schema.zhName ? `${schema.zhName} (${p.key})` : p.zhName || p.key;
        }

        function paintTextureExistingSourcePreview(canvas, source) {
            if (!canvas || !source || !source.image) return;
            const width = 88;
            const height = 58;
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, width, height);
            const sourceWidth = Math.max(1, source.width || 1);
            const sourceHeight = Math.max(1, source.height || 1);
            const scale = Math.min(width / sourceWidth, height / sourceHeight, 1);
            const drawWidth = Math.max(1, sourceWidth * scale);
            const drawHeight = Math.max(1, sourceHeight * scale);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(source.image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
        }

        function appendTextureExistingSourceContent(card, source) {
            const preview = document.createElement('span');
            preview.className = 'texture-existing-preview';
            const canvas = document.createElement('canvas');
            paintTextureExistingSourcePreview(canvas, source);
            preview.appendChild(canvas);

            const meta = document.createElement('span');
            meta.className = 'texture-existing-meta';
            const name = document.createElement('strong');
            name.textContent = source.basename;
            const path = document.createElement('span');
            path.className = 'texture-existing-path';
            path.textContent = `${source.path}.png`;
            meta.appendChild(name);
            meta.appendChild(path);

            const badges = document.createElement('span');
            badges.className = 'texture-existing-badges';
            const spec = document.createElement('span');
            spec.className = 'texture-existing-badge';
            spec.textContent = source.is2x ? '@2x' : '1x';
            badges.appendChild(spec);
            if (source.isAnimation) {
                const animation = document.createElement('span');
                animation.className = 'texture-existing-badge is-animation';
                animation.textContent = `${source.frames.length} 帧`;
                badges.appendChild(animation);
            }
            meta.appendChild(badges);

            card.appendChild(preview);
            card.appendChild(meta);
        }

        function createTextureExistingSourceCard(source, selectedPath, onSelect, onConfirm, formatTitle) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'texture-existing-card';
            card.dataset.texturePath = source.path;
            card.setAttribute('role', 'option');
            card.setAttribute('aria-selected', source.path === selectedPath ? 'true' : 'false');
            card.title = typeof formatTitle === 'function'
                ? formatTitle(source)
                : (onConfirm ? `引用 ${source.path}` : source.path);
            if (source.path === selectedPath) card.classList.add('selected');
            appendTextureExistingSourceContent(card, source);
            card.onclick = () => {
                if (onSelect) onSelect(source.path);
            };
            card.ondblclick = () => {
                if (onSelect) onSelect(source.path);
                if (onConfirm) onConfirm(source.path);
            };
            return card;
        }

        function renderTextureExistingGrid(options) {
            const {
                grid,
                empty,
                count,
                allSources,
                visibleSources,
                selectedPath,
                onSelect,
                onConfirm,
                emptyText,
                formatTitle
            } = options;
            if (!grid) return;
            grid.innerHTML = '';
            const hasSources = allSources.length > 0;
            if (empty) {
                empty.style.display = visibleSources.length === 0 ? '' : 'none';
                if (typeof emptyText === 'function') {
                    empty.textContent = emptyText(hasSources);
                } else if (emptyText) {
                    empty.textContent = hasSources ? '没有匹配的贴图' : emptyText;
                } else {
                    empty.textContent = hasSources ? '没有匹配的贴图' : '当前皮肤中没有可引用的贴图';
                }
            }
            if (count) count.textContent = `${visibleSources.length} / ${allSources.length} 项`;

            const fragment = document.createDocumentFragment();
            for (const source of visibleSources) {
                fragment.appendChild(createTextureExistingSourceCard(source, selectedPath, onSelect, onConfirm, formatTitle));
            }
            grid.appendChild(fragment);
        }
