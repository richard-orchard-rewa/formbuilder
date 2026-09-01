// Shared drag payload key between the palette (source) and the canvas
// (target), using the native HTML5 drag-and-drop API.
export const FIELD_TYPE_DRAG_KEY = "application/x-formbuilder-field-type"

// Drag payload key for reordering a field already on the canvas (US-2.2),
// distinct from FIELD_TYPE_DRAG_KEY so the canvas can tell "new field from
// the palette" apart from "move this existing field".
export const FIELD_REORDER_DRAG_KEY = "application/x-formbuilder-field-id"
