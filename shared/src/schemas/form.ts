import { z } from "zod"

export const CreateFormSchema = z.object({
  name: z.string().min(1),
})

export type CreateForm = z.infer<typeof CreateFormSchema>

export const FormSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
})

export type FormSummary = z.infer<typeof FormSummarySchema>

export const FormListSchema = z.array(FormSummarySchema)
