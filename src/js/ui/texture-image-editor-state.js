// ============================================================================
// texture-image-editor-state.js - 贴图图像编辑状态与几何变换
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function byId(id) {
            return document.getElementById(id);
        }
        window.byId = byId;

        const MAX_TEXTURE_DIMENSION = 50000;
        const MAX_TEXTURE_PIXELS = 64 * 1024 * 1024;
        const PREVIEW_ZOOM_MIN = 0.1;
        const PREVIEW_ZOOM_MAX = 4;
        const PREVIEW_ZOOM_STEP = 0.1;
        const LONG_BODY_DEFAULT_HEIGHT = 40000;
        const LONG_BODY_OPEN_HEIGHT_LIMIT = 5000;
        const LONG_BODY_PREVIEW_HEIGHT = 800;
        const LONG_BODY_FADE_MAX = 100;
        const longBodyComposerSessions = new Map();
        const textureEditRecipes = new Map();

        function createEditorState() {
            return {
                selected: null,
                originalFrames: [],
                originalReference: null,
                keyImageOriginalSources: {},
                keyImageEditRecipe: null,
                workingFrames: [],
                previewFrames: [],
                cropRect: null,
                imageTransform: {
                    scalePercent: 100,
                    stretchX: 0,
                    stretchY: 0,
                    scaleAfterStretch: false,
                    anchorX: 0.5,
                    anchorY: 0.5
                },
                rgbAdjustment: typeof createDefaultRgbAdjustment === 'function'
                    ? createDefaultRgbAdjustment()
                    : { r: 100, g: 100, b: 100 },
                previewViewport: null,
                cropDragState: null,
                transformDragState: null,
                previewPanState: null,
                previewSnapshot: null,
                livePreviewTimer: null,
                previewZoom: 1,
                previewBaseViewport: null,
                snapGuides: null,
                contentBoundsCache: null,
                editorUndoStack: [],
                editorRedoStack: [],
                editorHistoryTransaction: null,
                editorHistoryTimer: null,
                longBodyComposer: {
                    active: false,
                    sessionKey: null,
                    baseFrames: [],
                    tailFrame: null,
                    bodySourceName: '',
                    tailSourceName: '',
                    tailScaledHeight: 0,
                    targetHeight: LONG_BODY_DEFAULT_HEIGHT,
                    coverage: 0,
                    fade: 0,
                    previousNoteBodyStyle: null
                },
                savedLongBodyComposer: null,
                longBodyRegenerateTimer: null,
                longBodyDragState: null
            };
        }

        const menuState = createEditorState();
        const menuTab = { id: 'menu', kind: 'menu', title: '菜单', state: menuState };
        const libraryTab = {
            id: 'texture-library',
            kind: 'library',
            title: '全部贴图',
            state: menuState
        };
        let state = menuState;
        let editorBaseSnapshot = null;
        let tabs = [menuTab, libraryTab];
        let activeTabId = menuTab.id;
        let nextTextureTabId = 1;
        let externalChangesPending = false;
        const externalFrameUpdates = new Map();
        const MAX_EDITOR_HISTORY = 40;

        function createDefaultImageTransform() {
            return {
                scalePercent: 100,
                stretchX: 0,
                stretchY: 0,
                scaleAfterStretch: false,
                referenceWidth: null,
                referenceHeight: null,
                anchorX: 0.5,
                anchorY: 0.5
            };
        }

        function cloneImageTransform(transform) {
            const source = transform || createDefaultImageTransform();
            const referenceWidth = Number(source.referenceWidth);
            const referenceHeight = Number(source.referenceHeight);
            return {
                scalePercent: Number(source.scalePercent) || 100,
                stretchX: Number(source.stretchX) || 0,
                stretchY: Number(source.stretchY) || 0,
                scaleAfterStretch: !!source.scaleAfterStretch,
                referenceWidth: Number.isFinite(referenceWidth) && referenceWidth > 0
                    ? referenceWidth
                    : null,
                referenceHeight: Number.isFinite(referenceHeight) && referenceHeight > 0
                    ? referenceHeight
                    : null,
                anchorX: Number.isFinite(Number(source.anchorX)) ? Number(source.anchorX) : 0.5,
                anchorY: Number.isFinite(Number(source.anchorY)) ? Number(source.anchorY) : 0.5
            };
        }

        function imageTransformsEqual(a, b) {
            const left = cloneImageTransform(a);
            const right = cloneImageTransform(b);
            return left.scalePercent === right.scalePercent &&
                left.stretchX === right.stretchX &&
                left.stretchY === right.stretchY &&
                left.scaleAfterStretch === right.scaleAfterStretch &&
                left.referenceWidth === right.referenceWidth &&
                left.referenceHeight === right.referenceHeight &&
                left.anchorX === right.anchorX &&
                left.anchorY === right.anchorY;
        }

        function hasImageTransform(transform = state.imageTransform) {
            const value = cloneImageTransform(transform);
            return Math.abs(value.scalePercent - 100) > 0.001 ||
                Math.abs(value.stretchX) > 0.001 ||
                Math.abs(value.stretchY) > 0.001;
        }

        function getImageTransformScales(transform, cropRect) {
            const value = cloneImageTransform(transform);
            const fallbackWidth = Math.max(1, Number(cropRect && cropRect.width) || 1);
            const fallbackHeight = Math.max(1, Number(cropRect && cropRect.height) || 1);
            const referenceWidth = value.referenceWidth || fallbackWidth;
            const referenceHeight = value.referenceHeight || fallbackHeight;
            const baseScale = Math.max(0.01, value.scalePercent / 100);
            const stretchScaleX = Math.max(0.01, 1 + value.stretchX / referenceWidth);
            const stretchScaleY = Math.max(0.01, 1 + value.stretchY / referenceHeight);
            if (value.scaleAfterStretch) {
                return {
                    x: Math.max(0.01, stretchScaleX * baseScale),
                    y: Math.max(0.01, stretchScaleY * baseScale)
                };
            }
            return {
                x: Math.max(0.01, baseScale + value.stretchX / referenceWidth),
                y: Math.max(0.01, baseScale + value.stretchY / referenceHeight)
            };
        }

        function getImageScaleAnchor(cropRect, transform = state.imageTransform) {
            const value = cloneImageTransform(transform);
            return {
                x: cropRect.x + cropRect.width * value.anchorX,
                y: cropRect.y + cropRect.height * value.anchorY
            };
        }

        function getTransformedOutputRect(
            cropRect = state.cropRect,
            transform = state.imageTransform,
            sourceFrame = state.workingFrames[0]
        ) {
            if (!cropRect) return null;
            const value = cloneImageTransform(transform);
            const transformScales = getImageTransformScales(transform, cropRect);
            const width = Math.max(1, Math.round(cropRect.width * transformScales.x));
            const height = Math.max(1, Math.round(cropRect.height * transformScales.y));
            const uniformScale = Math.max(0.01, value.scalePercent / 100);
            const scaleX = width / Math.max(1, cropRect.width);
            const scaleY = height / Math.max(1, cropRect.height);
            const sourceWidth = Math.max(1, Number(sourceFrame && sourceFrame.width) || cropRect.width);
            const sourceHeight = Math.max(1, Number(sourceFrame && sourceFrame.height) || cropRect.height);
            const sourceCenterX = sourceWidth / 2;
            const sourceCenterY = sourceHeight / 2;
            if (value.scaleAfterStretch) {
                const stretchScaleX = scaleX / uniformScale;
                const stretchScaleY = scaleY / uniformScale;
                const stretchedWidth = cropRect.width * stretchScaleX;
                const stretchedHeight = cropRect.height * stretchScaleY;
                const stretchedX = sourceCenterX -
                    (sourceCenterX - cropRect.x) * stretchScaleX;
                const stretchedY = sourceCenterY -
                    (sourceCenterY - cropRect.y) * stretchScaleY;
                const scaleAnchor = getImageScaleAnchor({
                    x: stretchedX,
                    y: stretchedY,
                    width: stretchedWidth,
                    height: stretchedHeight
                }, value);
                const actualUniformScaleX = width / stretchedWidth;
                const actualUniformScaleY = height / stretchedHeight;
                return {
                    x: (scaleAnchor.x -
                        (scaleAnchor.x - stretchedX) * actualUniformScaleX) || 0,
                    y: (scaleAnchor.y -
                        (scaleAnchor.y - stretchedY) * actualUniformScaleY) || 0,
                    width,
                    height
                };
            }
            const stretchScaleX = scaleX / uniformScale;
            const stretchScaleY = scaleY / uniformScale;
            const anchor = getImageScaleAnchor(cropRect, value);
            const uniformlyScaledX = anchor.x - (anchor.x - cropRect.x) * uniformScale;
            const uniformlyScaledY = anchor.y - (anchor.y - cropRect.y) * uniformScale;
            return {
                x: (sourceCenterX - (sourceCenterX - uniformlyScaledX) * stretchScaleX) || 0,
                y: (sourceCenterY - (sourceCenterY - uniformlyScaledY) * stretchScaleY) || 0,
                width,
                height
            };
        }

        function updateImageTransformInputs() {
            const transform = cloneImageTransform(state.imageTransform);
            const scaleInput = byId('textureImageScalePercent');
            const stretchXInput = byId('textureImageStretchX');
            const stretchYInput = byId('textureImageStretchY');
            if (scaleInput) {
                scaleInput.value = String(Math.round(transform.scalePercent * 10) / 10);
            }
            if (stretchXInput) {
                stretchXInput.value = String(Math.round(transform.stretchX));
            }
            if (stretchYInput) {
                stretchYInput.value = String(Math.round(transform.stretchY));
            }
        }

        function updateImageTransformControlAvailability() {
            const disabled = !state.selected || state.longBodyComposer.active;
            for (const id of [
                'textureImageScalePercent',
                'textureImageStretchX',
                'textureImageStretchY'
            ]) {
                const input = byId(id);
                if (input) input.disabled = disabled;
            }
        }

        function updateRgbAdjustmentInputs() {
            const adjustment = cloneRgbAdjustment(state.rgbAdjustment);
            for (const channel of ['r', 'g', 'b']) {
                const range = byId(`textureImageRgb${channel.toUpperCase()}`);
                const number = byId(`textureImageRgb${channel.toUpperCase()}Value`);
                const value = String(adjustment[channel]);
                if (range) {
                    range.value = value;
                    updateTextureRangeFill(range);
                }
                if (number) number.value = value;
            }
        }

        function updateTextureRangeFill(range) {
            if (!range) return;
            const min = Number(range.min) || 0;
            const max = Number(range.max);
            const value = Number(range.value);
            const percent = Number.isFinite(max) && max > min
                ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
                : 0;
            range.style.setProperty('--slider-pct', `${percent}%`);
        }

        function updateTextureRangeFills(root = document) {
            if (!root || typeof root.querySelectorAll !== 'function') return;
            root.querySelectorAll('.texture-image-range').forEach(updateTextureRangeFill);
        }

        function updateRgbAdjustmentControlAvailability() {
            const disabled = !state.selected;
            for (const id of [
                'textureImageRgbR',
                'textureImageRgbRValue',
                'textureImageRgbG',
                'textureImageRgbGValue',
                'textureImageRgbB',
                'textureImageRgbBValue',
                'textureImageRgbResetBtn'
            ]) {
                const input = byId(id);
                if (input) input.disabled = disabled;
            }
        }

        function resetRgbAdjustmentInputs() {
            state.rgbAdjustment = createDefaultRgbAdjustment();
            updateRgbAdjustmentInputs();
            updateRgbAdjustmentControlAvailability();
        }
