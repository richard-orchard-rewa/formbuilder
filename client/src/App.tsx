import { useState, type ReactNode } from "react"
import type { FormSummary, ModuleSummary, SessionTemplateSummary } from "shared"
import { AdminShell, type NavKey } from "./AdminShell.js"
import { DataBindings } from "./DataBindings.js"
import { FormBuilder } from "./FormBuilder.js"
import { FormFill } from "./FormFill.js"
import { FormsList } from "./FormsList.js"
import { Home } from "./Home.js"
import { MigrationPlanner } from "./MigrationPlanner.js"
import { ModuleBuilder } from "./ModuleBuilder.js"
import { ModuleSetup } from "./ModuleSetup.js"
import { ModulesList } from "./ModulesList.js"
import { RendererSpike } from "./renderer-spike/RendererSpike.js"
import { SessionTemplateBuilder } from "./SessionTemplateBuilder.js"
import { SessionTemplateSetup } from "./SessionTemplateSetup.js"
import { SessionTemplateFill } from "./SessionTemplateFill.js"
import { SessionTemplateSubmissionList } from "./SessionTemplateSubmissionList.js"
import { SessionTemplateSubmissionView } from "./SessionTemplateSubmissionView.js"
import { SessionTemplateVersionHistory } from "./SessionTemplateVersionHistory.js"
import { SessionTemplateVersionView } from "./SessionTemplateVersionView.js"
import { SessionTemplatesList } from "./SessionTemplatesList.js"
import { SubmissionEdit } from "./SubmissionEdit.js"
import { SubmissionHistory } from "./SubmissionHistory.js"
import { SubmissionList } from "./SubmissionList.js"
import { SubmissionVersionView } from "./SubmissionVersionView.js"
import { SubmissionView } from "./SubmissionView.js"

type View =
  | { mode: "home" }
  | { mode: "forms" }
  | { mode: "renderer-spike" }
  | { mode: "modules" }
  | { mode: "data-bindings" }
  | { mode: "new-module" }
  | { mode: "build-module"; mod: ModuleSummary }
  | { mode: "session-templates" }
  | { mode: "new-session-template" }
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
  | {
      mode: "session-template-submissions"
      sessionTemplate: SessionTemplateSummary
    }
  | {
      mode: "session-template-submission-view"
      sessionTemplate: SessionTemplateSummary
      submissionId: string
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

// Which sidebar entry a view belongs to.
function navKeyFor(view: View): NavKey | null {
  switch (view.mode) {
    case "home":
      return "home"
    case "modules":
    case "new-module":
    case "build-module":
      return "modules"
    case "data-bindings":
      return "data-bindings"
    case "session-templates":
    case "new-session-template":
    case "build-session-template":
    case "fill-session-template":
    case "session-template-history":
    case "session-template-version":
    case "session-template-submissions":
    case "session-template-submission-view":
      return "session-templates"
    default:
      return "forms"
  }
}

const NAV_VIEWS: Record<NavKey, View> = {
  home: { mode: "home" },
  modules: { mode: "modules" },
  "session-templates": { mode: "session-templates" },
  forms: { mode: "forms" },
  "data-bindings": { mode: "data-bindings" },
}

export function App() {
  const [view, setView] = useState<View>({ mode: "home" })

  return (
    <AdminShell
      active={navKeyFor(view)}
      onNavigate={(key) => setView(NAV_VIEWS[key])}
    >
      <CurrentView view={view} setView={setView} />
    </AdminShell>
  )
}

function CurrentView({
  view,
  setView,
}: {
  view: View
  setView: (view: View) => void
}): ReactNode {
  if (view.mode === "home") {
    return (
      <Home
        onNavigate={(key) => setView(NAV_VIEWS[key])}
        onNewModule={() => setView({ mode: "new-module" })}
        onNewTemplate={() => setView({ mode: "new-session-template" })}
        onOpenModule={(mod) => setView({ mode: "build-module", mod })}
        onOpenTemplate={(sessionTemplate) =>
          setView({ mode: "build-session-template", sessionTemplate })
        }
        onOpenForm={(form) => setView({ mode: "build", form })}
      />
    )
  }

  if (view.mode === "forms") {
    return (
      <FormsList
        onBuild={(form) => setView({ mode: "build", form })}
        onFill={(form) => setView({ mode: "fill", form })}
        onSubmissions={(form) => setView({ mode: "submissions", form })}
        onRendererSpike={() => setView({ mode: "renderer-spike" })}
      />
    )
  }

  if (view.mode === "renderer-spike") {
    return (
      <main>
        <button type="button" onClick={() => setView({ mode: "forms" })}>
          ← Back
        </button>
        <RendererSpike />
      </main>
    )
  }

  if (view.mode === "data-bindings") {
    return <DataBindings onBack={() => setView({ mode: "home" })} />
  }

  if (view.mode === "modules") {
    return (
      <ModulesList
        onNew={() => setView({ mode: "new-module" })}
        onBuild={(mod) => setView({ mode: "build-module", mod })}
      />
    )
  }

  if (view.mode === "new-module") {
    return (
      <ModuleSetup
        onCancel={() => setView({ mode: "modules" })}
        onCreated={(mod) => setView({ mode: "build-module", mod })}
      />
    )
  }

  if (view.mode === "build-module") {
    return (
      <ModuleBuilder
        key={view.mod.id}
        mod={view.mod}
        onBack={() => setView({ mode: "modules" })}
      />
    )
  }

  if (view.mode === "session-templates") {
    return (
      <SessionTemplatesList
        onNew={() => setView({ mode: "new-session-template" })}
        onBuild={(sessionTemplate) =>
          setView({ mode: "build-session-template", sessionTemplate })
        }
        onFill={(sessionTemplate) =>
          setView({ mode: "fill-session-template", sessionTemplate })
        }
        onSubmissions={(sessionTemplate) =>
          setView({ mode: "session-template-submissions", sessionTemplate })
        }
      />
    )
  }

  if (view.mode === "new-session-template") {
    return (
      <SessionTemplateSetup
        onCancel={() => setView({ mode: "session-templates" })}
        onCreated={(sessionTemplate) =>
          setView({ mode: "build-session-template", sessionTemplate })
        }
      />
    )
  }

  if (view.mode === "build-session-template") {
    const { sessionTemplate } = view
    return (
      <SessionTemplateBuilder
        key={sessionTemplate.id}
        sessionTemplate={sessionTemplate}
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

  if (view.mode === "session-template-submissions") {
    const { sessionTemplate } = view
    return (
      <SessionTemplateSubmissionList
        sessionTemplateId={sessionTemplate.id}
        sessionTemplateName={sessionTemplate.name}
        onBack={() => setView({ mode: "session-templates" })}
        onView={(submissionId) =>
          setView({
            mode: "session-template-submission-view",
            sessionTemplate,
            submissionId,
          })
        }
      />
    )
  }

  if (view.mode === "session-template-submission-view") {
    const { sessionTemplate, submissionId } = view
    return (
      <SessionTemplateSubmissionView
        sessionTemplateId={sessionTemplate.id}
        sessionTemplateName={sessionTemplate.name}
        submissionId={submissionId}
        onBack={() =>
          setView({ mode: "session-template-submissions", sessionTemplate })
        }
      />
    )
  }

  if (view.mode === "build") {
    return (
      <FormBuilder
        formId={view.form.id}
        formName={view.form.name}
        onBack={() => setView({ mode: "forms" })}
      />
    )
  }

  if (view.mode === "fill") {
    return (
      <FormFill
        formId={view.form.id}
        formName={view.form.name}
        onBack={() => setView({ mode: "forms" })}
      />
    )
  }

  if (view.mode === "submissions") {
    const { form } = view
    return (
      <SubmissionList
        formId={form.id}
        formName={form.name}
        onBack={() => setView({ mode: "forms" })}
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

  // Unreachable: every view mode is handled above.
  return null
}
