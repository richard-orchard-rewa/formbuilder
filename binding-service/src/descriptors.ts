import type {
  BindingDescriptor,
  BindingPresentation,
  BindingStrategy,
  BindingValidationRule,
} from "shared"
import type { BindingSource } from "./adapters/adapter.js"

// What each strategy's values can be shown as, in order of preference.
export const STRATEGY_PRESENTATIONS: Record<BindingStrategy, BindingPresentation[]> = {
  attribute: ["text"],
  lookup: ["dropdown", "radio"],
}

// The rules that follow from a binding's control alone.
function controlRules(descriptor: BindingDescriptor): BindingValidationRule[] {
  if (descriptor.control.kind === "lookup") return [{ type: "oneOfOptions" }]
  return descriptor.control.maxLength
    ? [{ type: "maxLength", value: descriptor.control.maxLength }]
    : []
}

// Every descriptor the DBS serves is complete: how the value may be shown,
// where its options come from, what makes it valid, and which operations
// read and write it. Stored descriptors (code bindings, and configured
// ones saved before these parts existed) may omit any of them; this fills
// them in from the binding's source, so there is one place that decides
// what a binding advertises.
export function completeDescriptor(
  descriptor: BindingDescriptor,
  source: BindingSource,
): BindingDescriptor {
  const allowed = STRATEGY_PRESENTATIONS[source.strategy]
  const presentations = descriptor.presentations ?? {
    allowed,
    default: allowed[0],
  }
  const validation = {
    required: descriptor.validation?.required ?? false,
    rules: descriptor.validation?.rules ?? controlRules(descriptor),
  }
  const key = encodeURIComponent(descriptor.key)
  return {
    ...descriptor,
    presentations,
    ...(source.strategy === "lookup"
      ? {
          options: {
            href: `/bindings/${key}/options`,
            allowBlank: !validation.required,
          },
        }
      : {}),
    validation,
    operations: {
      resolve: { href: "/resolve" },
      commit: { href: "/commit", strategy: source.strategy },
    },
  }
}
