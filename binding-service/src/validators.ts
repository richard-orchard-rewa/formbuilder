import type { BindingOptions, BindingValidationRule } from "shared"

// What a rule check may need beyond the value itself.
export interface RuleContext {
  // The binding's options as the store holds them now. Only fetched for
  // bindings that have a oneOfOptions rule.
  options?: () => Promise<BindingOptions>
}

type Check<T extends BindingValidationRule["type"]> = (
  value: string,
  rule: Extract<BindingValidationRule, { type: T }>,
  context: RuleContext,
) => Promise<string | null>

// One check per rule type, each returning why the value fails (safe to show
// a user) or null. The Data Binding Service runs every rule on commit -- the
// API boundary (requirements §3) -- whatever the form did. A new rule type
// (an email format, a named pattern from the maintained validation
// library) is added here and in shared's json-schema.ts, nowhere else.
const CHECKS: { [T in BindingValidationRule["type"]]: Check<T> } = {
  maxLength: async (value, rule) =>
    value.length > rule.value
      ? `Longer than the ${rule.value} characters this field allows`
      : null,
  oneOfOptions: async (value, _rule, context) => {
    const list = await context.options?.()
    if (!list || list.source === "unavailable") {
      return "Couldn't check the value against the list of options"
    }
    return list.options.some((option) => option.value === value)
      ? null
      : "Not one of the allowed options"
  },
}

// Why `value` fails the first rule it breaks, or null. Blank values aren't
// checked here: whether a value is required is a separate question.
export async function firstFailure(
  value: string,
  rules: BindingValidationRule[],
  context: RuleContext,
): Promise<string | null> {
  for (const rule of rules) {
    const check = CHECKS[rule.type] as Check<typeof rule.type>
    const failure = await check(value, rule as never, context)
    if (failure) return failure
  }
  return null
}
