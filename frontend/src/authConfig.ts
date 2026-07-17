import {
    NavigationClient,
    PublicClientApplication,
    type Configuration,
    type NavigationOptions,
} from "@azure/msal-browser";

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || "";
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || "";
// Ensure the redirect URI points to the auth callback page
const redirectUri =
    import.meta.env.VITE_AZURE_REDIRECT_URI ||
    (typeof window !== "undefined"
        ? `${window.location.origin}/auth`
        : "http://localhost:5173/auth");

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

// MSAL's default NavigationClient pushes a *new* browser-history entry when it
// sends the browser to Microsoft's sign-in page (navigateExternal with
// noHistory: false). That leaves the pre-login app page sitting in history
// underneath every page Microsoft's own hosted sign-in flow renders. After a
// successful sign-in, pressing Back walks into the middle of that Microsoft
// flow (a stale, already-consumed auth step) and Entra rejects the replayed
// request with AADSTS900561 ("endpoint only accepts POST, received GET").
//
// Forcing this outbound navigation to always replace the current history
// entry means the app's pre-login page is overwritten instead of preserved,
// so Back from the signed-in app can never land back on a Microsoft URL.
// The inbound return-trip (navigateInternal) already uses noHistory: true by
// default, so it's left untouched here.
class BackButtonSafeNavigationClient extends NavigationClient {
    async navigateExternal(url: string, options: NavigationOptions) {
        return super.navigateExternal(url, { ...options, noHistory: true });
    }
}

msalInstance.setNavigationClient(new BackButtonSafeNavigationClient());
