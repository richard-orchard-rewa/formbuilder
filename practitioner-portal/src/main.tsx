import { createRoot } from "react-dom/client"
import { App } from "./App"
import { loadNotes } from "./notes-store"
import "./portal.css"

// No StrictMode: in development it runs every effect twice, which would
// double every Data Binding Service call in the developer panel and the
// mock ICIS's API log -- and seeing each call exactly once is the point.
// Saved notes are read first, so every view can look them up directly.
void loadNotes().then(() => createRoot(document.getElementById("root")!).render(<App />))
