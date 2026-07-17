import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";
import "./index.css";
import App from "./App";
import { msalInstance } from "./authConfig";
import { ThemeProvider } from "./theme/ThemeProvider";

async function bootstrap() {
  await msalInstance.initialize();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </ThemeProvider>
    </StrictMode>
  );
}

bootstrap();
