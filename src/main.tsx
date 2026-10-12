import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { connect } from "./store/game";
import { syncThemeToDocument } from "./store/ui";

// Keep old bookmarks working: "#admin" -> "#/admin".
if (/^#[a-z]/.test(location.hash)) location.replace(`#/${location.hash.slice(1)}`);

syncThemeToDocument();
void connect();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
