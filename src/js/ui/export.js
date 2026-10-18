// ============================================================================
// export.js - 皮肤替换上传入口与 .osk / 文件夹导出
// 依赖：parser/skin-assets.js、ui/ini-export.js
// ============================================================================

        let preferredTextureUploadSpec = null;

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

        // 11. 导出更新后的完整皮肤包 (.osk 或 .zip)
        async function exportSkin(format = 'osk') {
            showProgress(`正在打包生成 ${format.toUpperCase()} 皮肤文件...`);
            try {
                let zip = currentSkinZip ? currentSkinZip : new JSZip();
                stripUnsafeSkinArchiveEntries(zip);
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

                // 2. 将所有用户上传替换的贴图写入压缩包
                for (const [texPath, texData] of userReplacedTextures.entries()) {
                    zip.file(texPath, texData);
                    // 若替换的是 1x 普通贴图且原压缩包里存在同名 @2x 贴图，移除旧 @2x，防止 osu! 启动时优先读取旧的高清贴图
                    if (!texPath.includes('@2x')) {
                        const baseName = texPath.replace(/\.png$/i, '');
                        const old2xName = `${baseName}@2x.png`;
                        if (zip.file(old2xName) && !userReplacedTextures.has(old2xName)) {
                            zip.remove(old2xName);
                        }
                    }
                }

                // 3. 开始执行异步压缩
                const blob = await zip.generateAsync({
                    type: 'blob',
                    compression: 'DEFLATE',
                    compressionOptions: { level: 6 }
                }, (meta) => {
                    updateProgress(Math.round(meta.percent), 100, `正在压缩资源 (${Math.round(meta.percent)}%)...`);
                });

                // 4. 触发浏览器保存下载
                const rawName = (currentSkinMetadata.general && currentSkinMetadata.general.Name) || currentSkinFileName || 'Mania_Custom_Skin';
                const cleanName = rawName.replace(/\.(osk|zip)$/i, '').replace(/[\\/:*?"<>|]/g, '_');
                const exportFileName = `${cleanName}_edited.${format}`;

                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = exportFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(downloadUrl), 8000);

                hideProgress();
                showToast('导出皮肤成功', `已下载生成文件: ${exportFileName}`);
            } catch (err) {
                hideProgress();
                console.error('导出皮肤异常', err);
                showToast('导出失败', err.message || '未知错误');
            }
        }
