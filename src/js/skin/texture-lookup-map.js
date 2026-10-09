// ============================================================================
// texture-lookup-map.js - 参数键到 skin.ini lookup 的映射
// 依赖：skin/parameter-schema.js
// ============================================================================

        // 4. 生成规范标准的 skin.ini 文本 (结构清晰、分组明确并附带详尽注释)
        const TEXTURE_PARAM_LOOKUP_MAP = {
            NoteImage: LML.NoteImage,
            HoldNoteHeadImage: LML.HoldNoteHeadImage,
            HoldNoteBodyImage: LML.HoldNoteBodyImage,
            HoldNoteTailImage: LML.HoldNoteTailImage,
            KeyImage: LML.KeyImage,
            KeyImageDown: LML.KeyImageDown,
            StageHint: LML.HitTargetImage,
            StageLeft: LML.LeftStageImage,
            StageRight: LML.RightStageImage,
            StageBottom: LML.BottomStageImage,
            StageLight: LML.LightImage,
            LightingN: LML.ExplosionImage,
            LightingL: LML.HoldNoteLightImage,
            Hit300g: LML.Hit300g,
            Hit300: LML.Hit300,
            Hit200: LML.Hit200,
            Hit100: LML.Hit100,
            Hit50: LML.Hit50,
            Hit0: LML.Hit0,
        };

        // 官方 wiki 的 osu!mania 皮肤表明确规定 Animatable = No 的元素：
        // mania-key*、mania-stage-left、mania-stage-right、mania-stage-hint。
        // 血条背景 scorebar-bg 同样不可动画，而 scorebar-colour 可动画。
        // 这里的白名单只覆盖编辑器当前允许导入的贴图；未知目标默认不开放动态序列。
        const ANIMATABLE_TEXTURE_PARAM_PATTERNS = [
            /^noteimage\d*[hlt]?$/,
            /^holdnote(?:head|body|tail)image\d*$/,
            /^stagebottom$/,
            /^stagelight$/,
            /^lighting[ln]$/,
            /^hit(?:300g|300|200|100|50|0)$/,
            /^scorebar-colour$/
        ];

        const ANIMATABLE_TEXTURE_FILE_PATTERNS = [
            /^mania-note(?:\d+[hlt]?|s[hlt]?)$/,
            /^mania-stage-(?:bottom|light)$/,
            /^lighting[ln]$/,
            /^mania-hit(?:300g|300|200|100|50|0)$/,
            /^hit(?:300g|300|200|100|50|0)$/,
            /^scorebar-colour$/
        ];

        function normalizeTextureAnimationTarget(value) {
            return String(value || '')
                .trim()
                .toLowerCase()
                .replace(/\.[^/.]+$/, '')
                .replace(/@2x$/, '')
                .replace(/-\d+$/, '');
        }

        function isTextureAnimationSupported(paramKey, targetKey, targetFilename) {
            const paramCandidates = [paramKey, targetKey]
                .map(normalizeTextureAnimationTarget)
                .filter(Boolean);
            if (paramCandidates.some(value =>
                ANIMATABLE_TEXTURE_PARAM_PATTERNS.some(pattern => pattern.test(value))
            )) {
                return true;
            }

            const filenameCandidate = normalizeTextureAnimationTarget(targetFilename);
            if (filenameCandidate) {
                return ANIMATABLE_TEXTURE_FILE_PATTERNS.some(pattern => pattern.test(filenameCandidate));
            }

            return false;
        }
