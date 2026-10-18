// ============================================================================
// texture-image-editor-create-target-options.js - 创建贴图目标的分组与选项 DOM
// ============================================================================

        function buildTextureCreatorTargetUnits(targets) {
            const units = [];
            for (const target of targets) {
                const groupKey = target._trackGroupKey;
                if (!groupKey) {
                    units.push({ kind: 'direct', target });
                    continue;
                }

                const last = units[units.length - 1];
                if (last && last.kind === 'group' && last.key === groupKey) {
                    last.targets.push(target);
                    continue;
                }

                units.push({
                    kind: 'group',
                    key: groupKey,
                    label: target._trackGroupZhName ||
                        target._trackGroupName ||
                        groupKey,
                    targets: [target]
                });
            }
            return units;
        }

        function createTextureCreatorTargetOption(target, selectedKey, isDirect = false) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'texture-image-creator-target-option';
            if (isDirect) button.classList.add('is-direct');
            if (target.key === selectedKey) button.classList.add('is-selected');
            button.dataset.creatorTargetKey = target.key;
            button.setAttribute('role', 'option');
            button.setAttribute(
                'aria-selected',
                target.key === selectedKey ? 'true' : 'false'
            );

            const copy = document.createElement('span');
            copy.className = 'texture-image-creator-target-option-copy';

            const name = document.createElement('span');
            name.className = 'texture-image-creator-target-option-name';
            name.textContent = target.zhName || target.key;

            const key = document.createElement('span');
            key.className = 'texture-image-creator-target-option-key';
            key.textContent = target.key;

            const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            check.setAttribute('class', 'texture-image-creator-target-option-check');
            check.setAttribute('viewBox', '0 0 24 24');
            check.setAttribute('fill', 'none');
            check.setAttribute('stroke', 'currentColor');
            check.setAttribute('stroke-width', '2.4');
            check.setAttribute('stroke-linecap', 'round');
            check.setAttribute('stroke-linejoin', 'round');
            check.setAttribute('aria-hidden', 'true');

            const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            checkPath.setAttribute('points', '20 6 9 17 4 12');
            check.appendChild(checkPath);

            copy.appendChild(name);
            copy.appendChild(key);
            button.appendChild(copy);
            button.appendChild(check);
            return button;
        }

        function appendTextureCreatorTargetGroup(container, unit, selectedKey) {
            const collapsed = textureCreatorState.targetCollapsedGroups.has(unit.key);
            const group = document.createElement('section');
            group.className = 'texture-image-creator-target-group';
            group.dataset.creatorTargetGroup = unit.key;
            if (collapsed) group.classList.add('is-collapsed');

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'texture-image-creator-target-group-toggle';
            toggle.dataset.creatorTargetGroupToggle = unit.key;
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

            const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            arrow.setAttribute('class', 'texture-image-creator-target-group-arrow');
            arrow.setAttribute('viewBox', '0 0 24 24');
            arrow.setAttribute('fill', 'none');
            arrow.setAttribute('stroke', 'currentColor');
            arrow.setAttribute('stroke-width', '2');
            arrow.setAttribute('stroke-linecap', 'round');
            arrow.setAttribute('stroke-linejoin', 'round');
            arrow.setAttribute('aria-hidden', 'true');
            const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            arrowPath.setAttribute('points', '9 18 15 12 9 6');
            arrow.appendChild(arrowPath);

            const label = document.createElement('span');
            label.className = 'texture-image-creator-target-group-label';
            label.textContent = unit.label;

            const count = document.createElement('span');
            count.className = 'texture-image-creator-target-group-count';
            count.textContent = String(unit.targets.length);

            toggle.appendChild(arrow);
            toggle.appendChild(label);
            toggle.appendChild(count);
            group.appendChild(toggle);

            const items = document.createElement('div');
            items.className = 'texture-image-creator-target-group-items';
            items.dataset.creatorTargetGroupItems = unit.key;
            items.hidden = collapsed;
            for (const target of unit.targets) {
                items.appendChild(
                    createTextureCreatorTargetOption(target, selectedKey)
                );
            }
            group.appendChild(items);
            container.appendChild(group);
        }
