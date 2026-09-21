import { z } from "zod"

// US-8.1: name required, description optional -- mirrors CreateModuleSchema.
export const CreateSessionTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
})

export type CreateSessionTemplate = z.infer<typeof CreateSessionTemplateSchema>

export const SessionTemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})

export type SessionTemplateSummary = z.infer<
  typeof SessionTemplateSummarySchema
>

export const SessionTemplateListSchema = z.array(SessionTemplateSummarySchema)
