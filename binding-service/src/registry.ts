import { asc, eq, sql } from "drizzle-orm"
import type {
  BindingAnchor,
  BindingDescriptor,
  BindingVersion,
  ManagedBinding,
} from "shared"
import type { BindingSource } from "./adapters/adapter.js"
import type { Db } from "./db/client.js"
import { bindingVersions, configuredBindings } from "./db/schema.js"
import { completeDescriptor } from "./descriptors.js"
import { CODE_BINDINGS, type DictionaryEntry } from "./dictionary.js"

// A binding created in the binding creator: its source mapping plus every
// version. Published versions are immutable; at most one draft exists, and
// it is always the highest version.
export interface ConfiguredBinding {
  key: string
  source: BindingSource
  versions: BindingVersion[]
}

// Saving would change a binding's source, or bind an attribute another
// binding already has. Both are fixed for life, so both are refused.
export class BindingSourceConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BindingSourceConflictError"
  }
}

// Where configured bindings are kept -- the DBS's own database, never
// form-builder's. `save` adds new versions and updates the draft; it never
// changes a published version or a binding's source.
export interface ConfiguredBindingRepository {
  list(): Promise<ConfiguredBinding[]>
  save(binding: ConfiguredBinding): Promise<void>
}

const sameSource = (a: BindingSource, b: BindingSource) =>
  a.strategy === b.strategy &&
  a.entity === b.entity &&
  a.attribute === b.attribute &&
  (a.target ?? null) === (b.target ?? null)

// For tests and the in-memory fake store only, with the same rules as the
// database.
export class InMemoryConfiguredBindingRepository
  implements ConfiguredBindingRepository
{
  private readonly bindings = new Map<string, ConfiguredBinding>()

  async list() {
    return [...this.bindings.values()].map((b) => structuredClone(b))
  }

  async save(binding: ConfiguredBinding) {
    const existing = this.bindings.get(binding.key)
    if (existing && !sameSource(existing.source, binding.source)) {
      throw new BindingSourceConflictError(
        `${binding.key} is already bound to ${existing.source.attribute}`,
      )
    }
    const holder = [...this.bindings.values()].find(
      (b) =>
        b.key !== binding.key &&
        b.source.entity === binding.source.entity &&
        b.source.attribute === binding.source.attribute,
    )
    if (holder) {
      throw new BindingSourceConflictError(
        `${binding.source.attribute} is already bound as ${holder.key}`,
      )
    }
    const published = new Map(
      (existing?.versions ?? [])
        .filter((v) => v.status === "published")
        .map((v) => [v.version, v]),
    )
    const versions = binding.versions.map((v) => published.get(v.version) ?? v)
    for (const v of published.values()) {
      if (!versions.some((kept) => kept.version === v.version)) versions.push(v)
    }
    versions.sort((a, b) => a.version - b.version)
    this.bindings.set(binding.key, structuredClone({ ...binding, versions }))
  }
}

// The durable repository: the DBS's own Postgres database. Unique indexes
// stop a key changing attribute or two keys sharing one, and a trigger
// makes published versions immutable even to hand-run SQL.
export class PostgresConfiguredBindingRepository
  implements ConfiguredBindingRepository
{
  constructor(private readonly db: Db) {}

  async list(): Promise<ConfiguredBinding[]> {
    const [bindings, versions] = await Promise.all([
      this.db.select().from(configuredBindings).orderBy(asc(configuredBindings.createdAt)),
      this.db
        .select()
        .from(bindingVersions)
        .orderBy(asc(bindingVersions.key), asc(bindingVersions.version)),
    ])
    return bindings.map((b) => ({
      key: b.key,
      source: {
        strategy: b.strategy,
        entity: b.entity,
        attribute: b.attribute,
        ...(b.target ? { target: b.target } : {}),
      },
      versions: versions
        .filter((v) => v.key === b.key)
        .map((v) => ({
          version: v.version,
          status: v.status,
          descriptor: v.descriptor as BindingDescriptor,
          createdAt: v.createdAt.toISOString(),
          publishedAt: v.publishedAt?.toISOString() ?? null,
        })),
    }))
  }

  async save(binding: ConfiguredBinding): Promise<void> {
    await this.db.transaction(async (tx) => {
      try {
        await tx
          .insert(configuredBindings)
          .values({
            key: binding.key,
            strategy: binding.source.strategy,
            entity: binding.source.entity,
            attribute: binding.source.attribute,
            target: binding.source.target ?? null,
          })
          .onConflictDoNothing({ target: configuredBindings.key })
      } catch (error) {
        if (isUniqueViolation(error, "configured_bindings_attribute")) {
          throw new BindingSourceConflictError(
            `${binding.source.attribute} is already bound by another binding`,
          )
        }
        throw error
      }
      const [stored] = await tx
        .select()
        .from(configuredBindings)
        .where(eq(configuredBindings.key, binding.key))
      const storedSource: BindingSource = {
        strategy: stored.strategy,
        entity: stored.entity,
        attribute: stored.attribute,
        ...(stored.target ? { target: stored.target } : {}),
      }
      if (!sameSource(storedSource, binding.source)) {
        throw new BindingSourceConflictError(
          `${binding.key} is already bound to ${stored.attribute}`,
        )
      }

      for (const v of binding.versions) {
        await tx
          .insert(bindingVersions)
          .values({
            key: binding.key,
            version: v.version,
            status: v.status,
            descriptor: v.descriptor,
            createdAt: new Date(v.createdAt),
            publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          })
          // Only ever a draft is updated -- replaced, or published. The
          // trigger would refuse anything else; the WHERE means an
          // unchanged published version simply isn't touched.
          .onConflictDoUpdate({
            target: [bindingVersions.key, bindingVersions.version],
            set: {
              status: v.status,
              descriptor: v.descriptor,
              createdAt: new Date(v.createdAt),
              publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
            },
            setWhere: sql`${bindingVersions.status} = 'draft'`,
          })
      }
    })
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error
  const pg = cause as { code?: string; constraint?: string }
  return pg.code === "23505" && pg.constraint === constraint
}

export function latestPublished(versions: BindingVersion[]) {
  return versions
    .filter((v) => v.status === "published")
    .sort((a, b) => b.version - a.version)[0]
}

// Every binding the DBS knows, from code and from the creator, behind one
// lookup. Forms only ever see a binding's latest *published* version.
export class BindingRegistry {
  constructor(private readonly configured: ConfiguredBindingRepository) {}

  async published(anchor?: BindingAnchor): Promise<DictionaryEntry[]> {
    const configured = (await this.configured.list()).flatMap((binding) => {
      const version = latestPublished(binding.versions)
      return version
        ? [{ descriptor: version.descriptor, source: binding.source }]
        : []
    })
    return [...CODE_BINDINGS, ...configured]
      .filter((entry) => !anchor || entry.descriptor.anchor === anchor)
      .map((entry) => ({
        ...entry,
        descriptor: completeDescriptor(entry.descriptor, entry.source),
      }))
  }

  async find(key: string): Promise<DictionaryEntry | undefined> {
    return (await this.published()).find((entry) => entry.descriptor.key === key)
  }

  // Everything, drafts included, for the creator.
  async managed(): Promise<ManagedBinding[]> {
    const code: ManagedBinding[] = CODE_BINDINGS.map((entry) => ({
      key: entry.descriptor.key,
      origin: "code",
      attribute: entry.source.attribute,
      versions: [codeVersion(completeDescriptor(entry.descriptor, entry.source))],
    }))
    const configured: ManagedBinding[] = (await this.configured.list()).map(
      (binding) => ({
        key: binding.key,
        origin: "configured",
        attribute: binding.source.attribute,
        versions: binding.versions.map((v) => ({
          ...v,
          descriptor: completeDescriptor(v.descriptor, binding.source),
        })),
      }),
    )
    return [...code, ...configured]
  }

  configuredBindings() {
    return this.configured.list()
  }

  saveConfigured(binding: ConfiguredBinding) {
    return this.configured.save(binding)
  }
}

// Code bindings have no creation history; present them as published v1.
const EPOCH = new Date(0).toISOString()
function codeVersion(descriptor: BindingDescriptor): BindingVersion {
  return {
    version: descriptor.version,
    status: "published",
    descriptor,
    createdAt: EPOCH,
    publishedAt: EPOCH,
  }
}
