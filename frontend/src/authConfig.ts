import { PublicClientApplication, type Configuration } from "@azure/msal-browser";

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || "";
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || "";

// Ensure the redirect URI points to /homepage (the protected app page)
const redirectUri =
    typeof window !== "undefined"
        ? `${window.location.origin}/auth`
        : "http://localhost:5173/auth";

const msalConfig: Configuration = {
    auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri,
        postLogoutRedirectUri: redirectUri
    },
    cache: {
        cacheLocation: "localStorage",
    },
};

export const loginRequest = {
    scopes: ["User.Read", "openid", "profile"],
};

export const msalInstance = new PublicClientApplication(msalConfig);
