import { z } from "zod"

// US-7.1: name is required, description optional -- mirrors CreateFormSchema.
export const CreateModuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
})

export type CreateModule = z.infer<typeof CreateModuleSchema>

// US-7.4: modules can be archived (unlike forms, which have no such state
// yet), so the summary carries `archivedAt` for the library list to filter
// and display against. `hasPublishedVersion` lets a session template's
// module picker (US-8.2) only offer modules it can actually reference.
export const ModuleSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  hasPublishedVersion: z.boolean(),
  createdAt: z.iso.datetime(),
})

export type ModuleSummary = z.infer<typeof ModuleSummarySchema>

export const ModuleListSchema = z.array(ModuleSummarySchema)
