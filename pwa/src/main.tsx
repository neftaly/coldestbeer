import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useStore } from "./store";
import "./global.css";

// Auto-connect — same-origin, no user action needed
useStore.getState().connect();

// Take over ESPHome's default page
const root = document.createElement("div");
root.id = "root";
document.body.textContent = "";
document.body.appendChild(root);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
