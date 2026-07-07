import { useEffect } from "react";
import { msalInstance } from "./authConfig";

/**
 * Navigate to /homepage while removing the Microsoft auth URLs from history.
 *
 * Strategy:
 *   1. Set a sessionStorage flag "_postAuthGoHome".
 *   2. Call history.go(-delta) to navigate back to the pre-login page ("/").
 *      This causes a full-page reload (or bfcache restore → App.tsx forces a
 *      reload via its pageshow handler).  Either way the AuthCallback context
 *      is destroyed, so we CANNOT rely on onPop / setTimeout callbacks here.
 *   3. When App.tsx re-mounts at "/" it sees the flag and calls
 *      window.location.replace("/homepage"), which also discards forward
 *      history — including the Microsoft auth URL — so it can never be
 *      reached via the back button.
 */
function goHomeClearingAuthHistory() {
    const preLoginHistLen = parseInt(
        sessionStorage.getItem("_preLoginHistLen") || "0",
        10
    );
    sessionStorage.removeItem("_preLoginHistLen");

    const delta = preLoginHistLen > 0 ? window.history.length - preLoginHistLen : 0;

    if (delta > 0 && delta < 20) {
        // Signal App.tsx to redirect to /homepage once MSAL accounts are ready.
        sessionStorage.setItem("_postAuthGoHome", "1");
        window.history.go(-delta);
        // Fallback: if history.go cannot navigate (e.g. already at boundary)
        // just replace directly.
        setTimeout(() => window.location.replace("/homepage?view=dashboard"), 1500);
    } else {
        window.location.replace("/homepage?view=dashboard");
    }
}

export default function AuthCallback() {
    useEffect(() => {
        const completeLogin = async () => {
            try {
                await msalInstance.initialize();

                const response = await msalInstance.handleRedirectPromise();

                if (response?.account) {
                    msalInstance.setActiveAccount(response.account);
                    goHomeClearingAuthHistory();
                } else {
                    const accounts = msalInstance.getAllAccounts();
                    if (accounts.length > 0) {
                        msalInstance.setActiveAccount(accounts[0]);
                        goHomeClearingAuthHistory();
                    } else {
                        window.location.replace("/signout");
                    }
                }
            } catch (err) {
                console.error("Auth callback error:", err);
                window.location.replace("/");
            }
        };

        completeLogin();
    }, []);

    return (
        <div className="flex h-screen items-center justify-center bg-[#fbf5ee]">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
                <p className="text-sm text-slate-500 tracking-wide font-semibold">Completing sign in...</p>
            </div>
        </div>
    );
}