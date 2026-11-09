import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { ToastProvider } from "./components/feedback/ToastProvider";
import { AuthGate } from "./features/auth/AuthGate";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <AuthGate><App /></AuthGate>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>,
);
