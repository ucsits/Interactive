import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import "@fontsource-variable/inter"
import "./styles/tailwind.css"
import "./styles/app.scss"
import Home from "./pages/Home"
import Join from "./pages/Join"
import Play from "./pages/Play"
import Dashboard from "./pages/Dashboard"
import Editor from "./pages/Editor"
import Host from "./pages/Host"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/play/:code" element={<Play />} />
        <Route path="/teach" element={<Dashboard />} />
        <Route path="/teach/:id" element={<Editor />} />
        <Route path="/host/:code" element={<Host />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
