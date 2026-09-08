import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/space-grotesk";
import "./styles/global.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");

// Choose the homepage language before mounting so first-time visitors see Chinese.
// Explicit /zh/* and other deep links retain the language in their URL.
if (window.location.pathname === "/") {
  let preferredLanguage: string | null = null;
  try {
    preferredLanguage = localStorage.getItem("yc-auto-locale");
  } catch {
    // Browsing still works when storage is unavailable.
  }
  if (preferredLanguage !== "en") {
    history.replaceState(
      history.state,
      "",
      `/zh${window.location.search}${window.location.hash}`,
    );
    document.documentElement.lang = "zh-CN";
  }
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
