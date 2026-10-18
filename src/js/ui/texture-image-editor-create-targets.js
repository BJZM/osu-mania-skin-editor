// ============================================================================
// texture-image-editor-create-targets.js - 创建贴图的目标选择器渲染与交互
// ============================================================================

        function renderTextureCreatorTargetPicker() {
            const select = byId('textureImageCreateTarget');
            const trigger = byId('textureImageCreateTargetTrigger');
            const selectedName = byId('textureImageCreateTargetSelectedName');
            const selectedKey = byId('textureImageCreateTargetSelectedKey');
            const panel = byId('textureImageCreateTargetPanel');
            const list = byId('textureImageCreateTargetList');
            if (!select || !trigger || !panel || !list) return;

            const targets = getTextureCreatorTargets();
            if (!targets.some((target) => target.key === textureCreatorState.targetKey)) {
                textureCreatorState.targetKey = targets[0] ? targets[0].key : '';
            }
            const selected = targets.find(
                (target) => target.key === textureCreatorState.targetKey
            ) || targets[0] || null;
            if (!selected) textureCreatorState.targetKey = '';

            select.innerHTML = '';
            for (const target of targets) {
                const option = document.createElement('option');
                option.value = target.key;
                option.textContent = target.zhName || target.key;
                select.appendChild(option);
            }
            select.value = textureCreatorState.targetKey;
            select.disabled = targets.length === 0;

            if (selectedName) {
                selectedName.textContent = selected
                    ? (selected.zhName || selected.key)
                    : '无可用贴图';
            }
            if (selectedKey) {
                selectedKey.textContent = selected ? selected.key : '';
            }
            trigger.disabled = targets.length === 0;
            trigger.setAttribute(
                'aria-expanded',
                textureCreatorState.targetPickerOpen ? 'true' : 'false'
            );

            list.innerHTML = '';
            for (const unit of buildTextureCreatorTargetUnits(targets)) {
                if (unit.kind === 'group') {
                    appendTextureCreatorTargetGroup(
                        list,
                        unit,
                        textureCreatorState.targetKey
                    );
                    continue;
                }
                list.appendChild(
                    createTextureCreatorTargetOption(
                        unit.target,
                        textureCreatorState.targetKey,
                        true
                    )
                );
            }
            panel.classList.toggle(
                'is-open',
                textureCreatorState.targetPickerOpen && targets.length > 0
            );
        }

        function setTextureCreatorTargetPickerOpen(open) {
            textureCreatorState.targetPickerOpen = !!open;
            const trigger = byId('textureImageCreateTargetTrigger');
            const panel = byId('textureImageCreateTargetPanel');
            if (trigger) {
                trigger.setAttribute(
                    'aria-expanded',
                    textureCreatorState.targetPickerOpen ? 'true' : 'false'
                );
            }
            if (panel) {
                panel.classList.toggle(
                    'is-open',
                    textureCreatorState.targetPickerOpen
                );
            }
        }

        function selectTextureCreatorTarget(key, options = {}) {
            const targets = getTextureCreatorTargets();
            if (!targets.some((target) => target.key === key)) return false;
            textureCreatorState.targetKey = key;
            if (options.closePanel !== false) {
                textureCreatorState.targetPickerOpen = false;
            }
            renderTextureCreatorTargetPicker();
            if (options.restoreFocus !== false) {
                const trigger = byId('textureImageCreateTargetTrigger');
                if (trigger) trigger.focus({ preventScroll: true });
            }
            return true;
        }

        function initTextureCreatorTargetPickerUI() {
            const root = byId('textureImageCreateTargetPicker');
            const trigger = byId('textureImageCreateTargetTrigger');
            const panel = byId('textureImageCreateTargetPanel');
            const select = byId('textureImageCreateTarget');
            if (!root || !trigger || !panel) return;

            trigger.onclick = (event) => {
                event.stopPropagation();
                setTextureCreatorTargetPickerOpen(!textureCreatorState.targetPickerOpen);
            };

            panel.onclick = (event) => {
                event.stopPropagation();
                const toggle = event.target.closest('[data-creator-target-group-toggle]');
                if (toggle) {
                    const groupKey = toggle.dataset.creatorTargetGroupToggle;
                    if (textureCreatorState.targetCollapsedGroups.has(groupKey)) {
                        textureCreatorState.targetCollapsedGroups.delete(groupKey);
                    } else {
                        textureCreatorState.targetCollapsedGroups.add(groupKey);
                    }
                    renderTextureCreatorTargetPicker();
                    return;
                }

                const option = event.target.closest('[data-creator-target-key]');
                if (option) {
                    selectTextureCreatorTarget(option.dataset.creatorTargetKey);
                }
            };

            if (select) {
                select.onchange = () => {
                    selectTextureCreatorTarget(select.value, {
                        closePanel: false,
                        restoreFocus: false
                    });
                };
            }

            document.addEventListener('click', (event) => {
                if (!textureCreatorState.targetPickerOpen) return;
                if (!root.contains(event.target)) {
                    setTextureCreatorTargetPickerOpen(false);
                }
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && textureCreatorState.targetPickerOpen) {
                    setTextureCreatorTargetPickerOpen(false);
                    trigger.focus({ preventScroll: true });
                }
            });
        }
