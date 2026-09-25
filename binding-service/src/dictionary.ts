import type { BindingDescriptor } from "shared"
import type { ClientProperty } from "./adapters/adapter.js"

export interface DictionaryEntry {
  descriptor: BindingDescriptor
  // Which property of the anchor record this binding reads/writes.
  property: ClientProperty
}

// The dictionary of bindable fields (requirements §7). Developer-maintained
// code rather than admin-editable data: the rules for keeping a bound value
// consistent with its record live here, not in a form. Keys are stable,
// store-agnostic names -- swapping ICIS for another store changes the
// adapter, never these.
export const DICTIONARY: DictionaryEntry[] = [
  {
    property: "titleId",
    descriptor: {
      key: "client.title",
      version: 1,
      label: "Title",
      description: "The client's title (Mr, Ms, ...), from the salutation list.",
      anchor: "client",
      access: "readWrite",
      control: { kind: "lookup" },
      overridable: ["label", "required"],
    },
  },
  {
    property: "firstName",
    descriptor: {
      key: "client.firstName",
      version: 1,
      label: "First name",
      description: "The client's first (given) name.",
      anchor: "client",
      access: "readWrite",
      control: { kind: "text", maxLength: 50 },
      overridable: ["label", "required"],
    },
  },
  {
    property: "lastName",
    descriptor: {
      key: "client.lastName",
      version: 1,
      label: "Last name",
      description: "The client's last (family) name.",
      anchor: "client",
      access: "readWrite",
      control: { kind: "text", maxLength: 50 },
      overridable: ["label", "required"],
    },
  },
  {
    property: "clientNumber",
    descriptor: {
      key: "client.clientNumber",
      version: 1,
      label: "Client number",
      description: "The client's ICIS client number. Display only.",
      anchor: "client",
      access: "read",
      control: { kind: "text" },
      overridable: ["label"],
    },
  },
]

export function findEntry(key: string): DictionaryEntry | undefined {
  return DICTIONARY.find((entry) => entry.descriptor.key === key)
}
