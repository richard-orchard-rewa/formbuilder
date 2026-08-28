import { useEffect, useState } from "react"
import type { FormSummary } from "shared"
import { createForm, listForms } from "./api.js"
import { FormBuilder } from "./FormBuilder.js"

export function App() {
  const [forms, setForms] = useState<FormSummary[]>([])
  const [selected, setSelected] = useState<FormSummary | null>(null)

  useEffect(() => {
    listForms()
      .then(setForms)
      .catch(() => setForms([]))
  }, [])

  if (selected) {
    return (
      <FormBuilder
        formId={selected.id}
        formName={selected.name}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <main>
      <h1>form-builder</h1>
      <ul>
        {forms.map((form) => (
          <li key={form.id}>
            <button type="button" onClick={() => setSelected(form)}>
              {form.name}
            </button>
          </li>
        ))}
      </ul>
      <NewFormButton onCreated={(form) => setForms([form, ...forms])} />
    </main>
  )
}

function NewFormButton({ onCreated }: { onCreated: (form: FormSummary) => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        const name = window.prompt("Form name?")
        if (!name) return
        createForm(name).then(onCreated)
      }}
    >
      New form
    </button>
  )
}
