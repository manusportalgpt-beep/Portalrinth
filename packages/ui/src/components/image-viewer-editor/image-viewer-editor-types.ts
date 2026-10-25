export type ImageViewerEditorMode = 'view' | 'edit'

export type ScreenshotEditorTool =
	| 'select'
	| 'pen'
	| 'highlight'
	| 'eraser'
	| 'fill'
	| 'crop'
	| 'text'
	| 'arrow'
	| 'rectangle'
	| 'ellipse'
	| 'censor'

export type ScreenshotEraserMode = 'element' | 'area'

export type ScreenshotEditorObjectKind =
	| 'annotation'
	| 'arrow'
	| 'background'
	| 'censor'
	| 'ellipse'
	| 'fill'
	| 'highlight'
	| 'pen'
	| 'rectangle'
	| 'text'

export type ScreenshotEditorPropertyKind = Exclude<
	ScreenshotEditorObjectKind,
	'annotation' | 'background' | 'fill'
>

export type ScreenshotEditorSourceRect = {
	left: number
	top: number
	width: number
	height: number
}

export type ScreenshotEditorObjectState = Record<string, unknown> & {
	editorKind?: ScreenshotEditorObjectKind
	sourceRect?: ScreenshotEditorSourceRect
	censorColor?: string
}

export type EditorHistoryEntry = {
	objects: ScreenshotEditorObjectState[]
	crop: ScreenshotEditorSourceRect
}
