import { desc } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import { forms, formVersions } from "../../../db/schema.js"
import { randomSlugSuffix, slugify } from "../slug.js"
import type { CreateFormInput, FormRow, FormsRepository } from "./forms.js"

const UNIQUE_VIOLATION = "23505"
const MAX_SLUG_ATTEMPTS = 5

const FORM_COLUMNS = {
  id: forms.id,
  name: forms.name,
  description: forms.description,
  slug: forms.slug,
  createdAt: forms.createdAt,
}

export class DrizzleFormsRepository implements FormsRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<FormRow[]> {
    return this.db
      .select(FORM_COLUMNS)
      .from(forms)
      .orderBy(desc(forms.createdAt))
  }

  // Creates the form and its initial draft schema version (v0, unpublished)
  // together, so a form is never left without a version to edit. The slug
  // starts as a plain slugified name and only gains a random suffix if that
  // collides, so most forms get a clean, human-readable slug.
  async create({ name, description }: CreateFormInput): Promise<FormRow> {
    const baseSlug = slugify(name)

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug =
        attempt === 0 ? baseSlug : `${baseSlug}-${randomSlugSuffix()}`

      try {
        return await this.db.transaction(async (tx) => {
          const [row] = await tx
            .insert(forms)
            .values({ name, description: description ?? null, slug })
            .returning(FORM_COLUMNS)

          await tx.insert(formVersions).values({
            formId: row.id,
            version: 0,
            schema: { fields: [] },
            status: "draft",
          })

          return row
        })
      } catch (error) {
        const isLastAttempt = attempt === MAX_SLUG_ATTEMPTS - 1
        if (isUniqueSlugViolation(error) && !isLastAttempt) {
          continue
        }
        throw error
      }
    }

    throw new Error("Failed to generate a unique form slug")
  }
}

function isUniqueSlugViolation(error: unknown): boolean {
  // drizzle-orm wraps the underlying pg driver error (which carries `code`
  // and `constraint`) in a DrizzleQueryError's `cause`.
  const cause =
    error instanceof Error && error.cause !== undefined ? error.cause : error
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: string }).code === UNIQUE_VIOLATION &&
    (cause as { constraint?: string }).constraint === "forms_slug_unique"
  )
}
