import { useEffect, useState } from "react"
import type { FormSummary, ModuleSummary, SessionTemplateSummary } from "shared"
import { createForm, listForms } from "./api.js"
import { FormBuilder } from "./FormBuilder.js"
import { FormFill } from "./FormFill.js"
import { MigrationPlanner } from "./MigrationPlanner.js"
import { ModuleBuilder } from "./ModuleBuilder.js"
import { ModulesList } from "./ModulesList.js"
import { RendererSpike } from "./renderer-spike/RendererSpike.js"
import { SessionTemplateBuilder } from "./SessionTemplateBuilder.js"
import { SessionTemplateFill } from "./SessionTemplateFill.js"
import { SessionTemplateVersionHistory } from "./SessionTemplateVersionHistory.js"
import { SessionTemplateVersionView } from "./SessionTemplateVersionView.js"
import { SessionTemplatesList } from "./SessionTemplatesList.js"
import { SubmissionEdit } from "./SubmissionEdit.js"
import { SubmissionHistory } from "./SubmissionHistory.js"
import { SubmissionList } from "./SubmissionList.js"
import { SubmissionVersionView } from "./SubmissionVersionView.js"
import { SubmissionView } from "./SubmissionView.js"

type View =
  | { mode: "list" }
  | { mode: "modules" }
  | { mode: "build-module"; mod: ModuleSummary }
  | { mode: "session-templates" }
  | { mode: "build-session-template"; sessionTemplate: SessionTemplateSummary }
  | { mode: "fill-session-template"; sessionTemplate: SessionTemplateSummary }
  | {
      mode: "session-template-history"
      sessionTemplate: SessionTemplateSummary
    }
  | {
      mode: "session-template-version"
      sessionTemplate: SessionTemplateSummary
      versionId: string
    }
  | { mode: "build"; form: FormSummary }
  | { mode: "fill"; form: FormSummary }
  | { mode: "submissions"; form: FormSummary }
  | { mode: "view-submission"; form: FormSummary; submissionId: string }
  | { mode: "edit-submission"; form: FormSummary; submissionId: string }
  | { mode: "submission-history"; form: FormSummary; submissionId: string }
  | {
      mode: "submission-version"
      form: FormSummary
      submissionId: string
      versionId: string
    }
  | {
      mode: "migrate"
      form: FormSummary
      fromVersionId: string
      fromVersionNumber: number
      submissionId?: string
    }

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

  if (view.mode === "modules") {
    return (
      <ModulesList
        onBack={() => setView({ mode: "list" })}
        onBuild={(mod) => setView({ mode: "build-module", mod })}
      />
    )
  }

  if (view.mode === "build-module") {
    return (
      <ModuleBuilder
        moduleId={view.mod.id}
        moduleName={view.mod.name}
        onBack={() => setView({ mode: "modules" })}
      />
    )
  }

  if (view.mode === "session-templates") {
    return (
      <SessionTemplatesList
        onBack={() => setView({ mode: "list" })}
        onBuild={(sessionTemplate) =>
          setView({ mode: "build-session-template", sessionTemplate })
        }
        onFill={(sessionTemplate) =>
          setView({ mode: "fill-session-template", sessionTemplate })
        }
      />
    )
  }

  if (view.mode === "build-session-template") {
    const { sessionTemplate } = view
    return (
      <SessionTemplateBuilder
        sessionTemplateId={sessionTemplate.id}
        sessionTemplateName={sessionTemplate.name}
        onBack={() => setView({ mode: "session-templates" })}
        onViewHistory={() =>
          setView({ mode: "session-template-history", sessionTemplate })
        }
      />
    )
  }

  if (view.mode === "fill-session-template") {
    const { sessionTemplate } = view
    return (
      <SessionTemplateFill
        sessionTemplateId={sessionTemplate.id}
        sessionTemplateName={sessionTemplate.name}
        onBack={() => setView({ mode: "session-templates" })}
      />
    )
  }

  if (view.mode === "session-template-history") {
    const { sessionTemplate } = view
    return (
      <SessionTemplateVersionHistory
        sessionTemplateId={sessionTemplate.id}
        sessionTemplateName={sessionTemplate.name}
        onBack={() =>
          setView({ mode: "build-session-template", sessionTemplate })
        }
        onSelectVersion={(versionId) =>
          setView({ mode: "session-template-version", sessionTemplate, versionId })
        }
      />
    )
  }

  if (view.mode === "session-template-version") {
    const { sessionTemplate, versionId } = view
    return (
      <SessionTemplateVersionView
        sessionTemplateId={sessionTemplate.id}
        sessionTemplateName={sessionTemplate.name}
        versionId={versionId}
        onBack={() =>
          setView({ mode: "session-template-history", sessionTemplate })
        }
      />
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
        onEdit={(submissionId) =>
          setView({ mode: "edit-submission", form, submissionId })
        }
        onMigrate={(fromVersionId, fromVersionNumber, submissionId) =>
          setView({
            mode: "migrate",
            form,
            fromVersionId,
            fromVersionNumber,
            submissionId,
          })
        }
      />
    )
  }

  if (view.mode === "migrate") {
    const { form } = view
    return (
      <MigrationPlanner
        formId={form.id}
        formName={form.name}
        fromVersionId={view.fromVersionId}
        fromVersionNumber={view.fromVersionNumber}
        submissionId={view.submissionId}
        onBack={() => setView({ mode: "submissions", form })}
      />
    )
  }

  if (view.mode === "view-submission") {
    const { form, submissionId } = view
    return (
      <SubmissionView
        formId={form.id}
        formName={form.name}
        submissionId={submissionId}
        onBack={() => setView({ mode: "submissions", form })}
        onViewHistory={() =>
          setView({ mode: "submission-history", form, submissionId })
        }
      />
    )
  }

  if (view.mode === "submission-history") {
    const { form, submissionId } = view
    return (
      <SubmissionHistory
        formId={form.id}
        formName={form.name}
        submissionId={submissionId}
        onBack={() => setView({ mode: "view-submission", form, submissionId })}
        onSelectVersion={(versionId) =>
          setView({ mode: "submission-version", form, submissionId, versionId })
        }
      />
    )
  }

  if (view.mode === "submission-version") {
    const { form, submissionId, versionId } = view
    return (
      <SubmissionVersionView
        formId={form.id}
        formName={form.name}
        submissionId={submissionId}
        versionId={versionId}
        onBack={() => setView({ mode: "submission-history", form, submissionId })}
      />
    )
  }

  if (view.mode === "edit-submission") {
    const { form } = view
    return (
      <SubmissionEdit
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
      <nav>
        <button type="button" disabled>
          Forms
        </button>
        <button type="button" onClick={() => setView({ mode: "modules" })}>
          Modules
        </button>
        <button
          type="button"
          onClick={() => setView({ mode: "session-templates" })}
        >
          Session templates
        </button>
      </nav>
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
      className="primary"
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
