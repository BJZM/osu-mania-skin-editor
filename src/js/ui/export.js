// ============================================================================
// export.js - 皮肤替换上传入口与 .osk / 文件夹导出
// 依赖：parser/skin-assets.js、ui/ini-export.js、ui/texture-project-archive.js
// ============================================================================

        let preferredTextureUploadSpec = null;

        function normalizeTextureExportMode(mode) {
            return mode === 'release' ? 'release' : 'editable';
        }

        function normalizeSkinArchivePathKey(path) {
            return String(path || '')
                .replace(/\\/g, '/')
                .replace(/^\/+/, '')
                .toLowerCase();
        }

        function isHighResolutionSkinArchivePath(path) {
            return /@2x(?:\.[^./\\]+)?$/i.test(String(path || '').replace(/\\/g, '/'));
        }

        function getSkinArchivePathVariants(zip, targetPath) {
            if (!zip || !zip.files) return [];
            const targetKey = normalizeSkinArchivePathKey(targetPath);
            if (!targetKey) return [];
            return Object.keys(zip.files).filter((filename) =>
                !zip.files[filename].dir &&
                normalizeSkinArchivePathKey(filename) === targetKey
            );
        }

        function resolveSkinArchiveWritePath(zip, requestedPath) {
            const variants = getSkinArchivePathVariants(zip, requestedPath);
            if (variants.length === 0) return requestedPath;
            if (variants.includes(requestedPath)) return requestedPath;
            if (variants.length === 1) return variants[0];
            throw new Error(`导出路径存在无法确定的大小写冲突: ${variants.join(' / ')}`);
        }

        function removeSkinArchivePathVariants(zip, targetPath) {
            if (!zip || !zip.files) return;
            for (const filename of getSkinArchivePathVariants(zip, targetPath)) {
                zip.remove(filename);
            }
        }

        function assertUniqueSkinArchivePaths(zip) {
            if (!zip || !zip.files) return;
            const namesByPath = new Map();
            for (const filename of Object.keys(zip.files)) {
                if (zip.files[filename].dir) continue;
                const pathKey = normalizeSkinArchivePathKey(filename);
                if (!pathKey) continue;
                if (!namesByPath.has(pathKey)) namesByPath.set(pathKey, []);
                namesByPath.get(pathKey).push(filename);
            }

            const conflicts = Array.from(namesByPath.values()).filter((names) => names.length > 1);
            if (conflicts.length > 0) {
                const details = conflicts
                    .slice(0, 5)
                    .map((names) => names.join(' / '))
                    .join('；');
                const remaining = conflicts.length > 5 ? `；另有 ${conflicts.length - 5} 组` : '';
                throw new Error(`导出失败：皮肤包仍存在大小写冲突路径: ${details}${remaining}`);
            }
        }

        function requestTextureExportMode(format = 'osk') {
            const modal = document.getElementById('textureExportModeModal');
            if (!modal) return Promise.resolve('editable');
            const dialog = document.getElementById('textureExportModeDialog');
            const editableBtn = document.getElementById('textureExportEditableBtn');
            const releaseBtn = document.getElementById('textureExportReleaseBtn');
            const cancelBtn = document.getElementById('textureExportModeCancelBtn');
            const backdrop = document.getElementById('textureExportModeBackdrop');

            return new Promise((resolve) => {
                const finish = (mode) => {
                    modal.style.display = 'none';
                    if (editableBtn) editableBtn.onclick = null;
                    if (releaseBtn) releaseBtn.onclick = null;
                    if (cancelBtn) cancelBtn.onclick = null;
                    if (backdrop) backdrop.onclick = null;
                    window.removeEventListener('keydown', onKeyDown, true);
                    resolve(mode);
                };
                const onKeyDown = (event) => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    event.stopPropagation();
                    finish(null);
                };
                if (editableBtn) editableBtn.onclick = () => finish('editable');
                if (releaseBtn) releaseBtn.onclick = () => finish('release');
                if (cancelBtn) cancelBtn.onclick = () => finish(null);
                if (backdrop) backdrop.onclick = () => finish(null);
                window.addEventListener('keydown', onKeyDown, true);
                modal.style.display = 'flex';
                if (editableBtn) editableBtn.focus();
                if (dialog) dialog.scrollTop = 0;
            });
        }

        async function requestAndExportSkin(format = 'osk') {
            const mode = await requestTextureExportMode(format);
            if (!mode) return false;
            return exportSkin(format, { mode });
        }

        // 10. 触发本地图片替换
        // 详细设置入口会传入已选择的 '1x' / '2x'，选完本地文件后直接导入；
        // 画布入口不传规格，继续通过弹窗询问导入类型。
        function triggerTextureUpload(textureName, textureKey = null, paramKey = null, colIndex = null, preferredSpec = null) {
            targetTextureUploadKey = textureKey;
            targetTextureUploadFilename = textureName;
            targetTextureUploadParamKey = paramKey;
            targetTextureUploadColIndex = colIndex;
            preferredTextureUploadSpec = preferredSpec;
            const input = document.getElementById('textureReplaceInput');
            if (input) {
                input.value = '';
                input.click();
            }
        }

        // 11. 构建最新完整皮肤包，供普通导出和 Agent 导出共用
        async function buildSkinArchiveBlob(format = 'osk', options = {}) {
            const mode = normalizeTextureExportMode(
                typeof options === 'string' ? options : options.mode
            );
            let zip = currentSkinZip ? currentSkinZip : new JSZip();
            // 音效替换通过虚拟覆盖层参与导出；先复制 ZIP，避免移除低优先级
            // 原始音效变体时破坏内存中的导入资源，保证导出后仍可撤回。
            if (skinHitsoundReplacements.size > 0 &&
                typeof createSkinHitsoundExportArchive === 'function') {
                zip = await createSkinHitsoundExportArchive(zip);
            }
            stripUnsafeSkinArchiveEntries(zip);
            stripTextureProjectFromArchive(zip);
            if (deletedSkinTexturePaths.size > 0) {
                for (const filename of Object.keys(zip.files)) {
                    if (deletedSkinTexturePaths.has(filename.replace(/\\/g, '/').toLowerCase())) {
                        zip.remove(filename);
                    }
                }
            }

            // 1. 生成最新完整 skin.ini 文本并覆盖写入
            const newIniText = generateSkinIniText();
            let iniFilename = 'skin.ini';
            for (const filename of Object.keys(zip.files)) {
                if (filename.toLowerCase().endsWith('skin.ini')) {
                    iniFilename = filename;
                    break;
                }
            }
            zip.file(iniFilename, newIniText);

            // 2. 将所有用户上传替换的贴图写入压缩包。
            // 同一逻辑路径可能因大小写不同在内存 Map 中出现两次，先按 ZIP 路径规则合并。
            const replacementEntriesByPath = new Map();
            for (const [texPath, texData] of userReplacedTextures.entries()) {
                const pathKey = normalizeSkinArchivePathKey(texPath);
                if (!pathKey) continue;
                replacementEntriesByPath.set(pathKey, [texPath, texData]);
            }
            // 已有贴图沿用 ZIP 中的原始拼写；只有全新贴图才使用编辑器请求的路径。
            const replacementEntries = Array.from(replacementEntriesByPath.values()).map(([texPath, texData]) => ({
                writePath: resolveSkinArchiveWritePath(zip, texPath),
                texData
            }));
            const replacementPathKeys = new Set(replacementEntriesByPath.keys());

            // 删除旧条目时必须删除所有大小写变体，再按保留下来的原始路径写入一次。
            for (const entry of replacementEntries) {
                removeSkinArchivePathVariants(zip, entry.writePath);
            }

            // 若替换的是 1x 普通贴图且没有对应的 2x 替换，移除旧 @2x，防止游戏优先读取旧高清贴图。
            for (const entry of replacementEntries) {
                if (isHighResolutionSkinArchivePath(entry.writePath) || !/\.png$/i.test(entry.writePath)) continue;
                const baseName = entry.writePath.replace(/\.png$/i, '');
                const old2xName = `${baseName}@2x.png`;
                if (!replacementPathKeys.has(normalizeSkinArchivePathKey(old2xName))) {
                    removeSkinArchivePathVariants(zip, old2xName);
                }
            }

            for (const entry of replacementEntries) {
                zip.file(entry.writePath, entry.texData);
            }

            // 3. 开始执行异步压缩
            const projectSummary = mode === 'editable'
                ? await writeTextureProjectToArchive(zip, { includeSources: true })
                : null;

            // 最后只做唯一性校验；若仍有冲突，说明导出链路遗漏了修正，不能静默选择其中一张。
            assertUniqueSkinArchivePaths(zip);

            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            }, (meta) => {
                updateProgress(Math.round(meta.percent), 100, `正在压缩资源 (${Math.round(meta.percent)}%)...`);
            });

            const rawName = (currentSkinMetadata.general && currentSkinMetadata.general.Name) || currentSkinFileName || 'Mania_Custom_Skin';
            const cleanName = rawName.replace(/\.(osk|zip)$/i, '').replace(/[\\/:*?"<>|]/g, '_');
            const suffix = mode === 'editable' ? '_editable' : '_release';
            const exportFileName = `${cleanName}${suffix}.${format}`;
            return { blob, exportFileName, mode, format, projectSummary };
        }

        // 12. 导出更新后的完整皮肤包 (.osk 或 .zip)
        async function exportSkin(format = 'osk', options = {}) {
            const mode = normalizeTextureExportMode(
                typeof options === 'string' ? options : options.mode
            );
            const modeLabel = mode === 'editable' ? '可继续编辑' : '仅发布';
            showProgress(`正在打包生成 ${format.toUpperCase()} 皮肤文件（${modeLabel}）...`);
            try {
                const { blob, exportFileName, projectSummary } = await buildSkinArchiveBlob(format, { mode });
                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = exportFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(downloadUrl), 8000);

                hideProgress();
                const projectDetail = projectSummary
                    ? `，工程源图 ${projectSummary.sourceCount} 张`
                    : '，不含工程编辑数据';
                showToast('导出皮肤成功', `已下载生成文件: ${exportFileName}${projectDetail}`);
                return true;
            } catch (err) {
                hideProgress();
                console.error('导出皮肤异常', err);
                showToast('导出失败', err.message || '未知错误');
                return false;
            }
        }
