// ============================================================================
// texture-library-view.js - 全部贴图标签的卡片网格
// 依赖：ui/texture-existing-picker-view.js、ui/texture-existing-sources.js
// ============================================================================

        function createTextureLibraryCard(source, options = {}) {
            const { selectedPath, onSelect } = options;
            const card = document.createElement('div');
            card.className = 'texture-existing-card texture-library-card';
            card.dataset.texturePath = source.path;
            card.setAttribute('role', 'option');
            card.setAttribute('tabindex', '0');
            const isSelected = source.path === selectedPath;
            card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            if (isSelected) card.classList.add('selected');
            card.title = source.path;

            appendTextureExistingSourceContent(card, source);

            card.onclick = () => {
                if (onSelect) onSelect(source.path);
            };
            card.onkeydown = (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                if (onSelect) onSelect(source.path);
            };

            return card;
        }

        function renderTextureLibraryGrid(options) {
            const {
                grid,
                empty,
                count,
                allSources,
                visibleSources,
                selectedPath,
                onSelect
            } = options;
            if (!grid) return;
            grid.innerHTML = '';
            const hasSources = allSources && allSources.length > 0;
            if (empty) {
                empty.style.display = (!visibleSources || visibleSources.length === 0) ? '' : 'none';
                empty.textContent = hasSources ? '没有匹配的贴图' : '当前皮肤中没有读取到贴图';
            }
            if (count) {
                const visibleCount = visibleSources ? visibleSources.length : 0;
                const totalCount = allSources ? allSources.length : 0;
                count.textContent = `${visibleCount} / ${totalCount} 项`;
            }

            const fragment = document.createDocumentFragment();
            if (Array.isArray(visibleSources)) {
                for (const source of visibleSources) {
                    fragment.appendChild(createTextureLibraryCard(source, {
                        selectedPath,
                        onSelect
                    }));
                }
            }
            grid.appendChild(fragment);
        }
