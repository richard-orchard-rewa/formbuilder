import { randomUUID } from "node:crypto"

const COMBINING_DIACRITICS = /[̀-ͯ]/g

// Converts a form name into a URL/lookup-friendly base slug. Not guaranteed
// unique on its own -- callers append a disambiguating suffix on conflict.
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base.length > 0 ? base : "form"
}

// A short, unpredictable suffix used to disambiguate a slug when the base
// form is already taken, without leaking a sequential counter.
export function randomSlugSuffix(): string {
  return randomUUID().slice(0, 8)
}
