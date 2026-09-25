import type {
  AttributeCandidate,
  BindingAnchor,
  BindingDescriptor,
  CreateBindingRequest,
  ManagedBinding,
} from "shared"
import type {
  AttributeMetadata,
  BindingSource,
  RecordStore,
} from "./adapters/adapter.js"
import { ALLOW_LIST, ANCHOR_ENTITIES, allowedAttribute } from "./allow-list.js"
import { CODE_BINDINGS } from "./dictionary.js"
import type { BindingRegistry, ConfiguredBinding } from "./registry.js"

// A request the creator's rules won't allow. `message` explains why, for
// the steward.
export class BindingRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BindingRuleError"
  }
}

export class BindingNotFoundError extends Error {
  constructor(key: string) {
    super(`No configured binding ${key}`)
    this.name = "BindingNotFoundError"
  }
}

const KEY_PATTERN = /^client\.[a-z][A-Za-z0-9]{1,48}$/

// The build-time half of the DBS: lets a data steward create bindings on
// allow-listed attributes without a developer (docs/proposals/databound-fields.md,
// "Creating bindings without a developer"). Everything a binding may offer
// is derived from the store's own metadata and the DBS account's own
// privileges; a request can only narrow it.
export class BindingCreator {
  constructor(
    private readonly store: RecordStore,
    private readonly registry: BindingRegistry,
  ) {}

  async candidates(anchor: BindingAnchor): Promise<AttributeCandidate[]> {
    const entity = ANCHOR_ENTITIES[anchor]
    const allowed = ALLOW_LIST[anchor]
    const metadata = await this.store.describe(
      entity,
      allowed.map((a) => a.attribute),
    )
    const byAttribute = new Map(metadata.map((m) => [m.attribute, m]))
    const targets = metadata.flatMap((m) => (m.lookupTarget ? [m.lookupTarget] : []))
    const permissions = await this.store.permissions(entity, targets)
    const boundBy = await this.boundAttributes()

    return allowed.flatMap((entry) => {
      const meta = byAttribute.get(entry.attribute)
      // Allow-listed but not in this store (yet): nothing to offer.
      if (!meta) return []

      const accessNotes: string[] = []
      if (entry.maxAccess === "read") {
        accessNotes.push("The allow-list makes this display-only.")
      }
      if (!meta.updatable) {
        accessNotes.push("ICIS doesn't allow this attribute to be updated.")
      }
      if (!permissions.writeEntity) {
        accessNotes.push(
          "The Data Binding Service's ICIS account can't write client records.",
        )
      }

      const problems: string[] = []
      const strategy = strategyFor(meta)
      if (!strategy) {
        problems.push("No binding strategy exists for this attribute's type yet.")
      }
      if (!permissions.readEntity) {
        problems.push(
          "The Data Binding Service's ICIS account can't read client records.",
        )
      }
      if (meta.lookupTarget && !permissions.readTargets[meta.lookupTarget]) {
        problems.push(
          `The Data Binding Service's ICIS account can't read the ${meta.lookupTarget} list, so its options can't be shown.`,
        )
      }

      return [
        {
          attribute: meta.attribute,
          displayName: meta.displayName,
          strategy,
          maxLength: meta.maxLength ?? null,
          storeRequired: meta.requiredLevel === "required",
          lookupTarget: meta.lookupTarget ?? null,
          maxAccess: accessNotes.length > 0 ? "read" : "readWrite",
          accessNotes,
          problems,
          boundBy: boundBy.get(meta.attribute) ?? null,
        },
      ]
    })
  }

  managed(): Promise<ManagedBinding[]> {
    return this.registry.managed()
  }

  // Creates a binding's first draft, or replaces the draft of (or starts a
  // new draft version on) an existing configured binding. Never touches a
  // published version.
  async saveDraft(request: CreateBindingRequest): Promise<ManagedBinding> {
    const anchor: BindingAnchor = "client"
    if (!KEY_PATTERN.test(request.key)) {
      throw new BindingRuleError(
        "A binding key is 'client.' followed by a camelCase name, e.g. client.preferredName.",
      )
    }
    if (CODE_BINDINGS.some((e) => e.descriptor.key === request.key)) {
      throw new BindingRuleError(`${request.key} is a built-in binding and can't be changed here.`)
    }
    if (!allowedAttribute(anchor, request.attribute)) {
      throw new BindingRuleError(`${request.attribute} isn't on the allow-list.`)
    }

    const candidate = (await this.candidates(anchor)).find(
      (c) => c.attribute === request.attribute,
    )
    if (!candidate || !candidate.strategy) {
      throw new BindingRuleError(
        candidate?.problems[0] ?? `${request.attribute} isn't available in ICIS.`,
      )
    }

    const configured = await this.registry.configuredBindings()
    const existing = configured.find((b) => b.key === request.key)
    if (existing && existing.source.attribute !== request.attribute) {
      throw new BindingRuleError(
        `${request.key} is already bound to ${existing.source.attribute}; a binding's attribute can't change.`,
      )
    }
    if (candidate.boundBy && candidate.boundBy !== request.key) {
      throw new BindingRuleError(
        `${request.attribute} is already bound as ${candidate.boundBy}.`,
      )
    }
    if (request.access === "readWrite" && candidate.maxAccess === "read") {
      throw new BindingRuleError(
        `This binding can only be display-only: ${candidate.accessNotes.join(" ")}`,
      )
    }

    let maxLength: number | undefined
    if (candidate.strategy === "attribute") {
      const storeMax = candidate.maxLength ?? undefined
      if (request.maxLength !== undefined && storeMax !== undefined && request.maxLength > storeMax) {
        throw new BindingRuleError(
          `ICIS allows at most ${storeMax} characters here; a binding can only narrow that.`,
        )
      }
      maxLength = request.maxLength ?? storeMax
    }

    const source: BindingSource = {
      strategy: candidate.strategy,
      entity: ANCHOR_ENTITIES[anchor],
      attribute: candidate.attribute,
      ...(candidate.lookupTarget ? { target: candidate.lookupTarget } : {}),
    }
    const now = new Date().toISOString()
    const binding: ConfiguredBinding = existing ?? {
      key: request.key,
      source,
      versions: [],
    }
    const published = binding.versions.filter((v) => v.status === "published")
    const version = published.length === 0 ? 1 : Math.max(...published.map((v) => v.version)) + 1
    const descriptor: BindingDescriptor = {
      key: request.key,
      version,
      label: request.label,
      description: request.description,
      anchor,
      access: request.access,
      control:
        candidate.strategy === "lookup"
          ? { kind: "lookup" }
          : { kind: "text", ...(maxLength ? { maxLength } : {}) },
      overridable: request.access === "read" ? ["label"] : ["label", "required"],
    }

    binding.versions = [
      ...published,
      { version, status: "draft", descriptor, createdAt: now, publishedAt: null },
    ]
    await this.registry.saveConfigured(binding)
    return toManaged(binding)
  }

  // Publishes a binding's draft, re-checking everything against the store
  // and the DBS account's privileges *now* -- they may have changed since
  // the draft was saved, and a check made against a stale picture isn't a
  // check (the same reasoning as §4's affected-forms warning).
  async publish(key: string): Promise<ManagedBinding> {
    const binding = (await this.registry.configuredBindings()).find((b) => b.key === key)
    if (!binding) throw new BindingNotFoundError(key)
    const draft = binding.versions.find((v) => v.status === "draft")
    if (!draft) throw new BindingRuleError(`${key} has no draft to publish.`)

    const candidate = (await this.candidates("client")).find(
      (c) => c.attribute === binding.source.attribute,
    )
    if (!candidate) {
      throw new BindingRuleError(`${binding.source.attribute} is no longer available.`)
    }
    if (candidate.problems.length > 0) {
      throw new BindingRuleError(candidate.problems.join(" "))
    }
    if (draft.descriptor.access === "readWrite" && candidate.maxAccess === "read") {
      throw new BindingRuleError(
        `This binding can no longer be writable: ${candidate.accessNotes.join(" ")}`,
      )
    }

    draft.status = "published"
    draft.publishedAt = new Date().toISOString()
    await this.registry.saveConfigured(binding)
    return toManaged(binding)
  }

  private async boundAttributes(): Promise<Map<string, string>> {
    const bound = new Map<string, string>()
    for (const binding of await this.registry.managed()) {
      bound.set(binding.attribute, binding.key)
    }
    return bound
  }
}

function strategyFor(meta: AttributeMetadata) {
  if (meta.kind === "text") return "attribute" as const
  if (meta.kind === "lookup" && meta.lookupTarget) return "lookup" as const
  return null
}

function toManaged(binding: ConfiguredBinding): ManagedBinding {
  return {
    key: binding.key,
    origin: "configured",
    attribute: binding.source.attribute,
    versions: binding.versions,
  }
}
