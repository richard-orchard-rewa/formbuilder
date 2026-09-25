import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type {
  BindingAnchor,
  BindingDescriptor,
  BindingVersion,
  ManagedBinding,
} from "shared"
import type { BindingSource } from "./adapters/adapter.js"
import { CODE_BINDINGS, type DictionaryEntry } from "./dictionary.js"

// A binding created in the binding creator: its source mapping plus every
// version. Published versions are immutable; at most one draft exists, and
// it is always the highest version.
export interface ConfiguredBinding {
  key: string
  source: BindingSource
  versions: BindingVersion[]
}

// Where configured bindings are kept -- the DBS's own storage, never
// form-builder's database.
export interface ConfiguredBindingRepository {
  list(): Promise<ConfiguredBinding[]>
  save(binding: ConfiguredBinding): Promise<void>
}

export class InMemoryConfiguredBindingRepository
  implements ConfiguredBindingRepository
{
  private readonly bindings = new Map<string, ConfiguredBinding>()

  async list() {
    return [...this.bindings.values()].map((b) => structuredClone(b))
  }

  async save(binding: ConfiguredBinding) {
    this.bindings.set(binding.key, structuredClone(binding))
  }
}

// Prototype storage: one JSON file, rewritten atomically on each save. Fine
// for a handful of bindings edited by one steward at a time; a real DBS
// would use a database with the same interface.
export class JsonFileConfiguredBindingRepository
  implements ConfiguredBindingRepository
{
  constructor(private readonly path: string) {}

  async list(): Promise<ConfiguredBinding[]> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as ConfiguredBinding[]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
  }

  async save(binding: ConfiguredBinding): Promise<void> {
    const all = (await this.list()).filter((b) => b.key !== binding.key)
    all.push(binding)
    await mkdir(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp`
    await writeFile(temp, JSON.stringify(all, null, 2))
    await rename(temp, this.path)
  }
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
    return [...CODE_BINDINGS, ...configured].filter(
      (entry) => !anchor || entry.descriptor.anchor === anchor,
    )
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
      versions: [codeVersion(entry.descriptor)],
    }))
    const configured: ManagedBinding[] = (await this.configured.list()).map(
      (binding) => ({
        key: binding.key,
        origin: "configured",
        attribute: binding.source.attribute,
        versions: binding.versions,
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
