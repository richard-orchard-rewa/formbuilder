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

// How a binding's value is read and written. Strategies are code; a
// binding is a strategy plus configuration.
export const BindingStrategySchema = z.enum(["attribute", "lookup"])

export type BindingStrategy = z.infer<typeof BindingStrategySchema>

// A way a form may present the value. Which of these a binding allows is
// the binding's call; which one a given form uses is the form admin's
// (a layout choice, requirements §6).
export const BindingPresentationSchema = z.enum(["text", "dropdown", "radio"])

export type BindingPresentation = z.infer<typeof BindingPresentationSchema>

// One rule a value must satisfy. The DBS enforces every rule when a value
// is committed; form-builder mirrors them in the rendered form. A typed
// list rather than fixed fields so new kinds (an email format, a named
// pattern from the maintained validation library, requirements §3) are
// added as new members without changing the descriptor's shape.
export const BindingValidationRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("maxLength"), value: z.number().int().positive() }),
  // The value must be one of the binding's options, as the store holds them now.
  z.object({ type: z.literal("oneOfOptions") }),
])

export type BindingValidationRule = z.infer<typeof BindingValidationRuleSchema>

// One dictionary entry (`GET /bindings/:key`). Everything form-builder
// needs to render and lock the control lives here; a bound field snapshots
// it so a published version never depends on the DBS still describing it
// the same way.
//
// `presentations`, `options`, `validation` and `operations` make the
// descriptor self-describing: a consumer learns how to show, list, check,
// read and write the value from the descriptor itself, not from knowing
// the DBS's URL conventions. They're optional only so descriptors
// snapshotted into forms before they existed still parse; the DBS always
// sends them.
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
  presentations: z
    .object({
      allowed: z.array(BindingPresentationSchema).min(1),
      default: BindingPresentationSchema,
    })
    .optional(),
  options: z
    .object({
      href: z.string(),
      // Whether "no value" is a valid choice.
      allowBlank: z.boolean(),
    })
    .optional(),
  validation: z
    .object({
      // Whether the store itself requires a value. A form may require one
      // where the store doesn't, never the reverse.
      required: z.boolean(),
      rules: z.array(BindingValidationRuleSchema),
    })
    .optional(),
  operations: z
    .object({
      resolve: z.object({ href: z.string() }),
      commit: z.object({ href: z.string(), strategy: BindingStrategySchema }),
    })
    .optional(),
})

export type BindingDescriptor = z.infer<typeof BindingDescriptorSchema>

export const BindingDescriptorListSchema = z.array(BindingDescriptorSchema)

export const BindingOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})

export const BindingOptionsSchema = z.object({
  options: z.array(BindingOptionSchema),
  // `fallback`: the backing store couldn't be queried for the live list and
  // a known-good static list was served instead. `unavailable`: neither --
  // the DBS's account can't read the reference table.
  source: z.enum(["live", "fallback", "unavailable"]),
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

// --- Binding creator (docs/proposals/databound-fields.md, "Creating
// bindings without a developer"). ---

// One allow-listed store attribute a binding could be created on, with what
// the store itself says about it and what the DBS's own account can do.
export const AttributeCandidateSchema = z.object({
  attribute: z.string(),
  displayName: z.string(),
  // null: the attribute's type has no strategy yet (e.g. dates).
  strategy: BindingStrategySchema.nullable(),
  maxLength: z.number().int().positive().nullable(),
  storeRequired: z.boolean(),
  lookupTarget: z.string().nullable(),
  // The most a binding on this attribute may allow, after the allow-list,
  // the store's metadata and the DBS account's privileges have had a say.
  maxAccess: z.enum(["read", "readWrite"]),
  // Why `maxAccess` is capped at read, if it is.
  accessNotes: z.array(z.string()),
  // What would stop a binding on this attribute being published.
  problems: z.array(z.string()),
  // The binding key already using this attribute, if any.
  boundBy: z.string().nullable(),
  // The presentations a binding on this attribute could allow.
  presentations: z.array(BindingPresentationSchema),
})

export type AttributeCandidate = z.infer<typeof AttributeCandidateSchema>

export const AttributeCandidateListSchema = z.array(AttributeCandidateSchema)

export const BindingVersionSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(["draft", "published"]),
  descriptor: BindingDescriptorSchema,
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
})

export type BindingVersion = z.infer<typeof BindingVersionSchema>

// A binding as the creator sees it: every version, where it came from, and
// which store attribute it maps to (never exposed to forms).
export const ManagedBindingSchema = z.object({
  key: z.string(),
  origin: z.enum(["code", "configured"]),
  attribute: z.string(),
  versions: z.array(BindingVersionSchema),
})

export type ManagedBinding = z.infer<typeof ManagedBindingSchema>

export const ManagedBindingListSchema = z.array(ManagedBindingSchema)

// Creates (or replaces) a binding's draft version. Strategy, control kind
// and the store's limits are derived from metadata, not taken from here;
// `maxLength` may only narrow the store's.
export const CreateBindingRequestSchema = z.object({
  key: z.string(),
  label: z.string().trim().min(1),
  description: z.string().trim().default(""),
  attribute: z.string(),
  access: z.enum(["read", "readWrite"]),
  maxLength: z.number().int().positive().optional(),
  // Narrows which presentations forms may use; defaults to all the
  // attribute's strategy supports. The first listed is the default.
  presentations: z.array(BindingPresentationSchema).min(1).optional(),
})

export type CreateBindingRequest = z.infer<typeof CreateBindingRequestSchema>
