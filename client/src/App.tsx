import { useEffect, useState } from "react"
import type { FormSummary } from "shared"

// Placeholder view proving the client can reach the form-builder Fastify
// plugin end to end (US-0.5). The real form-building UI lands with US-1.x.
export function App() {
  const [forms, setForms] = useState<FormSummary[]>([])

  useEffect(() => {
    fetch("/api/forms")
      .then((res) => res.json())
      .then(setForms)
      .catch(() => setForms([]))
  }, [])

  return (
    <main>
      <h1>form-builder</h1>
      <ul>
        {forms.map((form) => (
          <li key={form.id}>{form.name}</li>
        ))}
      </ul>
    </main>
  )
}
