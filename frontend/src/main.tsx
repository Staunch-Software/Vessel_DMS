import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";
import "./index.css";
import App from "./App";
import { msalInstance } from "./authConfig";

async function bootstrap() {
  await msalInstance.initialize();
  try {
    await msalInstance.handleRedirectPromise();
  } catch (error) {
    console.error("MSAL Redirect Error:", error);
  }


  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>
  );
}

bootstrap();
