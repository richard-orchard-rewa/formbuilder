import { z } from "zod"

// Contracts for the Data Binding Service (DBS) -- the self-describing API
// that owns the dictionary of data-bound fields and reads/writes their
// values in a backing store (ICIS today). See
// docs/proposals/databound-fields.md. form-builder only ever reaches the
// DBS over HTTP; these schemas are shared for prototype convenience.

// The record a binding is "about" (requirements §7: a module type is
// anchored to a core table). Only `client` exists in the prototype.
export const BindingAnchorSchema = z.enum(["client"])

export type BindingAnchor = z.infer<typeof BindingAnchorSchema>

// How the bound control is rendered. `text` is a free-text value;
// `lookup` is an ID drawn from a list the DBS serves at
// `GET /bindings/:key/options`, so option IDs and labels always reflect
// the backing store rather than being copied into the form.
export const BindingControlSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    maxLength: z.number().int().positive().optional(),
  }),
  z.object({ kind: z.literal("lookup") }),
])

export type BindingControl = z.infer<typeof BindingControlSchema>

// One dictionary entry (`GET /bindings/:key`). Everything form-builder
// needs to render and lock the control lives here; a bound field snapshots
// it so a published version never depends on the DBS still describing it
// the same way.
export const BindingDescriptorSchema = z.object({
  key: z.string(),
  version: z.number().int().positive(),
  label: z.string(),
  description: z.string(),
  anchor: BindingAnchorSchema,
  access: z.enum(["read", "readWrite"]),
  control: BindingControlSchema,
  // Which of the field's own properties a builder may change. Everything
  // else (control kind, length, option source) is fixed by the dictionary.
  overridable: z.array(z.enum(["label", "required"])),
})

export type BindingDescriptor = z.infer<typeof BindingDescriptorSchema>

export const BindingDescriptorListSchema = z.array(BindingDescriptorSchema)

export const BindingOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})

export const BindingOptionsSchema = z.object({
  options: z.array(BindingOptionSchema),
  // `fallback` means the backing store couldn't be queried for the live
  // list and a known-good static list was served instead.
  source: z.enum(["live", "fallback"]),
})

export type BindingOptions = z.infer<typeof BindingOptionsSchema>

// Identifies the anchor record(s) a resolve/commit applies to.
export const AnchorContextSchema = z.object({
  client: z.guid(),
})

export type AnchorContext = z.infer<typeof AnchorContextSchema>

// A bound value. Every prototype binding is a string (text, or a lookup's
// option ID); null means "no value" in the backing store.
export const BoundValueSchema = z.string().nullable()

export const BoundValuesSchema = z.record(z.string(), BoundValueSchema)

export type BoundValues = z.infer<typeof BoundValuesSchema>

// `GET /anchors/client?clientNumber=` -- finds the record to anchor on by
// the identifier staff actually know.
export const ClientAnchorSchema = z.object({
  id: z.guid(),
  clientNumber: z.string().nullable(),
  displayName: z.string(),
})

export type ClientAnchor = z.infer<typeof ClientAnchorSchema>

export const ResolveRequestSchema = z.object({
  anchor: AnchorContextSchema,
  bindings: z.array(z.string()).min(1),
})

export type ResolveRequest = z.infer<typeof ResolveRequestSchema>

export const ResolveResponseSchema = z.object({
  values: BoundValuesSchema,
  resolvedAt: z.iso.datetime(),
})

export type ResolveResponse = z.infer<typeof ResolveResponseSchema>

// `baseline` is what the caller resolved when the form was opened. A value
// that has changed in the backing store since then *and* differs from what
// the caller is sending is reported as a conflict rather than overwritten
// (requirements §4/§8: a save never overwrites a version it wasn't based on).
export const CommitRequestSchema = z.object({
  anchor: AnchorContextSchema,
  values: BoundValuesSchema,
  baseline: BoundValuesSchema.optional(),
})

export type CommitRequest = z.infer<typeof CommitRequestSchema>

export const BindingCommitStatusSchema = z.enum([
  "written",
  "unchanged",
  "conflict",
  "readOnly",
  "failed",
  "skipped",
])

export type BindingCommitStatus = z.infer<typeof BindingCommitStatusSchema>

export const BindingCommitResultSchema = z.object({
  status: BindingCommitStatusSchema,
  message: z.string().optional(),
  // For a conflict: the value currently in the backing store.
  current: BoundValueSchema.optional(),
})

export type BindingCommitResult = z.infer<typeof BindingCommitResultSchema>

export const CommitResponseSchema = z.object({
  results: z.record(z.string(), BindingCommitResultSchema),
})

export type CommitResponse = z.infer<typeof CommitResponseSchema>
