import { PublicClientApplication, type Configuration } from "@azure/msal-browser";

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || "";
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || "";
const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin;

const msalConfig: Configuration = {
    auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri,
        postLogoutRedirectUri: redirectUri,
    },
    cache: {
        cacheLocation: "sessionStorage",
    },
};

export const loginRequest = {
    scopes: ["User.Read", "openid", "profile"],
};

export const msalInstance = new PublicClientApplication(msalConfig);
