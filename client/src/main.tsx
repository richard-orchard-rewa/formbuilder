import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"
import "./App.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="rawa-shell">
      <header className="rawa-header">
        <img
          src="/brand/rawa-wordmark-white.svg"
          alt="Relationships Australia WA"
          className="rawa-header__logo"
        />
      </header>
      <App />
    </div>
  </StrictMode>,
)
