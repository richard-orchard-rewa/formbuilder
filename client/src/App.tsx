import { useEffect, useState } from "react"
import type { FormSummary } from "shared"
import { createForm, listForms } from "./api.js"
import { FormBuilder } from "./FormBuilder.js"
import { FormFill } from "./FormFill.js"
import { RendererSpike } from "./renderer-spike/RendererSpike.js"
import { SubmissionList } from "./SubmissionList.js"
import { SubmissionView } from "./SubmissionView.js"

type View =
  | { mode: "list" }
  | { mode: "build"; form: FormSummary }
  | { mode: "fill"; form: FormSummary }
  | { mode: "submissions"; form: FormSummary }
  | { mode: "view-submission"; form: FormSummary; submissionId: string }

export function App() {
  const [forms, setForms] = useState<FormSummary[]>([])
  const [view, setView] = useState<View>({ mode: "list" })
  const [showRendererSpike, setShowRendererSpike] = useState(false)

  useEffect(() => {
    listForms()
      .then(setForms)
      .catch(() => setForms([]))
  }, [])

  if (showRendererSpike) {
    return (
      <main>
        <button type="button" onClick={() => setShowRendererSpike(false)}>
          ← Back
        </button>
        <RendererSpike />
      </main>
    )
  }

  if (view.mode === "build") {
    return (
      <FormBuilder
        formId={view.form.id}
        formName={view.form.name}
        onBack={() => setView({ mode: "list" })}
      />
    )
  }

  if (view.mode === "fill") {
    return (
      <FormFill
        formId={view.form.id}
        formName={view.form.name}
        onBack={() => setView({ mode: "list" })}
      />
    )
  }

  if (view.mode === "submissions") {
    const { form } = view
    return (
      <SubmissionList
        formId={form.id}
        formName={form.name}
        onBack={() => setView({ mode: "list" })}
        onView={(submissionId) =>
          setView({ mode: "view-submission", form, submissionId })
        }
      />
    )
  }

  if (view.mode === "view-submission") {
    const { form } = view
    return (
      <SubmissionView
        formId={form.id}
        formName={form.name}
        submissionId={view.submissionId}
        onBack={() => setView({ mode: "submissions", form })}
      />
    )
  }

  return (
    <main>
      <h1>form-builder</h1>
      <ul>
        {forms.map((form) => (
          <li key={form.id} className="form-list__item">
            <span>{form.name}</span>
            <button type="button" onClick={() => setView({ mode: "build", form })}>
              Build
            </button>
            <button type="button" onClick={() => setView({ mode: "fill", form })}>
              Fill out
            </button>
            <button
              type="button"
              onClick={() => setView({ mode: "submissions", form })}
            >
              Submissions
            </button>
          </li>
        ))}
      </ul>
      <NewFormButton onCreated={(form) => setForms([form, ...forms])} />
      <p>
        <button type="button" onClick={() => setShowRendererSpike(true)}>
          View renderer spike (US-0.2)
        </button>
      </p>
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
