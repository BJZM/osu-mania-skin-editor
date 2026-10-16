// ============================================================================
// parameter-schema.js - skin.ini 可视化参数元数据
// 依赖：core/state.js、skin/mania-config.js
// ============================================================================

        function getManiaNoteTextureName(keys, lookup, columnIndex, out) {
            if (out) { out.explicit = false; out.explicitValue = ''; out.matchedKey = ''; }
            const mCfg = maniaSkinConfigurations.get(keys) || getManiaConfigForKeys(keys);
            const searchKeys = buildPerTrackTextureSearchKeys(lookup, columnIndex);
            const hit = findExplicitImageLookupValue(mCfg, searchKeys);
            if (hit) {
                if (out) { out.explicit = true; out.explicitValue = hit.value; out.matchedKey = hit.matchedKey; }
                return hit.value;
            }
            const fc = computeFallbackColumnIndex(keys, columnIndex | 0);
            return defaultFilenameForLookup(lookup, fc) || '';
        }

        const SKIN_INI_PARAM_SCHEMA = [
            ...SKIN_INI_PARAM_SCHEMA_MANIA,
            ...SKIN_INI_PARAM_SCHEMA_TEXTURES,
            ...SKIN_INI_PARAM_SCHEMA_FONTS,
            ...SKIN_INI_PARAM_SCHEMA_GENERAL,
        ];
