import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
import { captureDiagnostics } from "../historyProbe";
import {
    Mail,
    ArrowRight,
    ShieldCheck,
    Anchor,
    LogIn,
    Clock,
    AlertTriangle,
} from "lucide-react";

const SHIP_HERO_IMAGE = "/ship.jpg";

/** localStorage flag marking that this browser has completed a successful
 *  login before, so the login page can greet with "Welcome Back" instead of
 *  "Welcome". Set by App.tsx once the backend confirms a successful sign-in. */
export const RETURNING_USER_STORAGE_KEY = "dms_returning_user";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

interface LoginPageProps {
    /** Called with the authenticated user once Microsoft SSO succeeds */
    onAuthenticated: (user: { display_name: string; email: string }) => void;
    /** When true the page renders the "Signed Out" confirmation view */
    signedOut?: boolean;
    /** Called when the user clicks "Back to Login" on the signed-out view */
    onSignBackIn?: () => void;
    /** Set when the session expired automatically (inactivity or token limit) */
    sessionExpired?: "inactivity" | "token_expiry";
    /** Set when arriving at /signout with a reason=expired query param */
    sessionExpiredFromSignout?: "inactivity" | "token_expiry";
    /** Error surfaced from a failed SSO redirect/backend login, shown on load */
    authError?: string | null;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Shared chrome (header + background)                                         */
/* ─────────────────────────────────────────────────────────────────────────── */



function MicrosoftIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="1" width="8.5" height="8.5" fill="#F35325" />
            <rect x="10.5" y="1" width="8.5" height="8.5" fill="#81BC06" />
            <rect x="1" y="10.5" width="8.5" height="8.5" fill="#05A6F0" />
            <rect x="10.5" y="10.5" width="8.5" height="8.5" fill="#FFBA08" />
        </svg>
    );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Floating light particles drifting over the hero photo                       */
/* ─────────────────────────────────────────────────────────────────────────── */

const BOKEH_PARTICLES = [
    { top: "12%", left: "8%", size: 10, delay: "0s", warm: true },
    { top: "22%", left: "84%", size: 6, delay: "1.4s", warm: false },
    { top: "68%", left: "18%", size: 8, delay: "2.6s", warm: true },
    { top: "40%", left: "48%", size: 5, delay: "0.8s", warm: false },
    { top: "78%", left: "70%", size: 9, delay: "3.4s", warm: true },
    { top: "30%", left: "30%", size: 4, delay: "2s", warm: false },
    { top: "58%", left: "90%", size: 7, delay: "1.1s", warm: true },
];

function BokehField() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {BOKEH_PARTICLES.map((p, i) => (
                <span
                    key={i}
                    className="absolute rounded-full blur-[2px] animate-float-drift"
                    style={{
                        top: p.top,
                        left: p.left,
                        width: p.size * 4,
                        height: p.size * 4,
                        background: p.warm
                            ? "radial-gradient(circle, rgba(255,214,150,0.85), rgba(255,214,150,0))"
                            : "radial-gradient(circle, rgba(255,255,255,0.75), rgba(255,255,255,0))",
                        animationDelay: p.delay,
                        animationDuration: `${8 + (i % 4) * 2}s`,
                    }}
                />
            ))}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────── *//*  Session-expired view (inactivity or 24-h token limit)                        */
/* ───────────────────────────────────────────────────────────────────────────── */

function SessionExpiredView({
    reason,
    onSignBackIn,
}: {
    reason: "inactivity" | "token_expiry";
    onSignBackIn: () => void;
}) {
    const isInactivity = reason === "inactivity";
    return (
        <div className="min-h-screen w-full relative overflow-hidden flex flex-col text-white">
            {/* Hero photo background */}
            <div className="absolute inset-0 -z-20 overflow-hidden">
                <img
                    src={SHIP_HERO_IMAGE}
                    alt=""
                    className="w-full h-full object-cover animate-ken-burns"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/60" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40" />
                <div className="dms-auth-grain absolute inset-0 opacity-40 mix-blend-overlay" />
                {/* Diagonal sheen sweep */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -inset-y-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-sheen" />
                </div>
            </div>

            <BokehField />

            {/* Top status bar */}
            <header className="relative z-10 flex items-center justify-end px-6 md:px-12 py-6">
                <div className="hidden sm:flex items-center gap-2 text-[10px] tracking-[0.15em] text-white/70 font-medium">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    SYSTEM ONLINE
                </div>
            </header>

            {/* Main content — same layout as login, session expired card content */}
            <main className="relative z-10 flex-1 w-full max-w-[1480px] mx-auto flex flex-col lg:flex-row items-center lg:justify-center gap-8 lg:gap-20 xl:gap-28 px-6 md:px-12 lg:px-16 pb-10">
                {/* Headline */}
                <div className="max-w-xl text-center lg:text-left">
                    <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] font-semibold text-white/75 mb-6 drop-shadow-md">
                        <span className="w-6 h-px bg-white/50 inline-block" />
                        VESSEL DOCUMENT MANAGEMENT SYSTEM
                    </div>
                    <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl xl:text-[3.85rem] leading-[1.12] font-semibold mb-8 drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]">
                        Every <span className="italic text-accent">document</span>,
                        <br />
                        every vessel, in one place.
                    </h1>
                    <p className="text-base xl:text-lg leading-relaxed text-white/85 mb-8 drop-shadow-md max-w-lg mx-auto lg:mx-0">
                        Centralize documents, survey reports, and compliance records across the fleet — with automatic renewal alerts and a full audit trail for every document, on every hull.
                    </p>
                    <div className="h-px w-16 bg-gradient-to-r from-accent to-transparent mb-5 mx-auto lg:mx-0" />
                    <p className="text-[11px] tracking-[0.15em] text-white/60 uppercase drop-shadow-md">
                        Trusted for fleet-wide maritime compliance
                    </p>
                </div>

                {/* Session expired card */}
                <div className="w-full max-w-lg">
                    {/* Brand mark — above the card, first thing seen in this column */}
                    <div className="flex items-center justify-center gap-3 mb-10 md:mb-12">
                        <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-accent/30 to-primary/20 border border-accent/30 flex items-center justify-center shadow-lg shadow-black/25 backdrop-blur-sm">
                            <Anchor className="w-6 h-6 text-accent" strokeWidth={1.75} />
                        </div>
                        <div className="text-left">
                            <div className="text-white font-bold tracking-[0.22em] text-sm drop-shadow-md">
                                NISSEN KAIUN
                            </div>
                            <div className="text-[9px] tracking-[0.2em] font-medium text-white/70 drop-shadow-md">
                                ENTERPRISE EDITION · DOCUMENT MANAGEMENT
                            </div>
                        </div>
                    </div>

                    <div className="dms-auth-card animate-card-float rounded-[34px] p-9 md:p-11">
                        {/* Icon badge */}
                        <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center mb-5 mx-auto">
                            {isInactivity ? (
                                <Clock className="w-7 h-7 text-yellow-300" />
                            ) : (
                                <AlertTriangle className="w-7 h-7 text-yellow-300" />
                            )}
                        </div>

                        <h2 className="text-2xl font-semibold text-white mb-1.5 text-center">
                            {isInactivity ? "Session Timed Out" : "Session Expired"}
                        </h2>
                        <p className="text-sm text-white/65 mb-6 text-center tracking-wide uppercase">
                            {isInactivity
                                ? "INACTIVE FOR 8 HOURS — SESSION CLOSED"
                                : "24-HOUR SESSION LIMIT REACHED"}
                        </p>

                        <div className="space-y-6">
                            <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3.5">
                                <p className="text-sm text-yellow-200 leading-relaxed text-center font-normal">
                                    {isInactivity
                                        ? "Your session was automatically closed after 8 hours of inactivity to protect your documents."
                                        : "Your session reached the 24-hour security limit. Please sign in again to continue."}
                                </p>
                            </div>

                            <button
                                onClick={onSignBackIn}
                                className="dms-btn-primary w-full flex items-center justify-center gap-2 px-5 py-3.5 active:scale-[0.99] transition cursor-pointer"
                            >
                                <LogIn className="w-4 h-4 text-primary-fg" />
                                <span className="text-sm font-semibold text-primary-fg">Sign In Again</span>
                            </button>
                        </div>

                        <div className="flex items-center justify-center gap-1.5 mt-7 text-[10px] tracking-[0.1em] text-white/50">
                            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                            256-BIT TLS ENCRYPTED CONNECTION
                        </div>
                    </div>
                </div>
            </main>

            <p className="relative z-10 text-center pb-6 text-[10px] tracking-[0.15em] text-white/55 drop-shadow-md">
                SECURED · SHAREPOINT EMBEDDED · © 2026 NISSEN KAIUN
            </p>
        </div>
    );
}

/* ───────────────────────────────────────────────────────────────────────────── *//*  Signed-out view                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function SignedOutView({ onSignBackIn, expiredReason }: { onSignBackIn: () => void; expiredReason?: "inactivity" | "token_expiry" }) {
    return (
        <div className="min-h-screen w-full relative overflow-hidden flex flex-col text-white">
            {/* Hero photo background */}
            <div className="absolute inset-0 -z-20 overflow-hidden">
                <img
                    src={SHIP_HERO_IMAGE}
                    alt=""
                    className="w-full h-full object-cover animate-ken-burns"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/60" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40" />
                <div className="dms-auth-grain absolute inset-0 opacity-40 mix-blend-overlay" />
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -inset-y-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-sheen" />
                </div>
            </div>

            <BokehField />

            {/* Top status bar */}
            <header className="relative z-10 flex items-center justify-end px-6 md:px-12 py-6">
                <div className="hidden sm:flex items-center gap-2 text-[10px] tracking-[0.15em] text-white/70 font-medium">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    SYSTEM ONLINE
                </div>
            </header>

            {/* Main content — same layout as login, sign-out card content */}
            <main className="relative z-10 flex-1 w-full max-w-[1480px] mx-auto flex flex-col lg:flex-row items-center lg:justify-center gap-8 lg:gap-20 xl:gap-28 px-6 md:px-12 lg:px-16 pb-10">
                {/* Headline */}
                <div className="max-w-xl text-center lg:text-left">
                    <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] font-semibold text-white/75 mb-6 drop-shadow-md">
                        <span className="w-6 h-px bg-white/50 inline-block" />
                        VESSEL DOCUMENT MANAGEMENT SYSTEM
                    </div>
                    <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl xl:text-[3.85rem] leading-[1.12] font-semibold mb-8 drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]">
                        Every <span className="italic text-accent">document</span>,
                        <br />
                        every vessel, in one place.
                    </h1>
                    <p className="text-base xl:text-lg leading-relaxed text-white/85 mb-8 drop-shadow-md max-w-lg mx-auto lg:mx-0">
                        Centralize documents, survey reports, and compliance records across the fleet — with automatic renewal alerts and a full audit trail for every document, on every hull.
                    </p>
                    <div className="h-px w-16 bg-gradient-to-r from-accent to-transparent mb-5 mx-auto lg:mx-0" />
                    <p className="text-[11px] tracking-[0.15em] text-white/60 uppercase drop-shadow-md">
                        Trusted for fleet-wide maritime compliance
                    </p>
                </div>

                {/* Sign-out card */}
                <div className="w-full max-w-lg">
                    <div className="flex items-center justify-center gap-3 mb-10 md:mb-12">
                        <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-accent/30 to-primary/20 border border-accent/30 flex items-center justify-center shadow-lg shadow-black/25 backdrop-blur-sm">
                            <Anchor className="w-6 h-6 text-accent" strokeWidth={1.75} />
                        </div>
                        <div className="text-left">
                            <div className="text-white font-bold tracking-[0.22em] text-sm drop-shadow-md">
                                NISSEN KAIUN
                            </div>
                            <div className="text-[9px] tracking-[0.2em] font-medium text-white/70 drop-shadow-md">
                                ENTERPRISE EDITION · DOCUMENT MANAGEMENT
                            </div>
                        </div>
                    </div>

                    <div className="dms-auth-card animate-card-float rounded-[34px] p-9 md:p-11">
                        <h2 className="text-2xl font-semibold text-white mb-1.5 text-center">
                            {expiredReason ? "Session Expired" : "Signed Out"}
                        </h2>
                        <p className="text-sm text-white/65 mb-6 text-center tracking-wide uppercase">
                            {expiredReason ? "24-HOUR SESSION LIMIT REACHED" : "Your session was securely closed"}
                        </p>

                        {expiredReason ? (
                            <div className="mb-6 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3.5">
                                <p className="text-sm text-yellow-200 leading-relaxed text-center">
                                    Your session has expired. Please sign in again to continue.
                                </p>
                            </div>
                        ) : (
                        <p className="text-sm text-white/80 leading-relaxed text-center mb-6">
                            Thank you for using the Vessel Document Management System. You have been successfully signed out of your account.
                        </p>
                        )}

                        <button
                            onClick={onSignBackIn}
                            className="dms-btn-primary w-full flex items-center justify-center gap-2 px-5 py-3.5 active:scale-[0.99] transition cursor-pointer"
                        >
                            <LogIn className="w-4 h-4" />
                            <span className="text-sm font-semibold text-primary-fg">Back to Login</span>
                        </button>

                        <div className="flex items-center justify-center gap-1.5 mt-7 text-[10px] tracking-[0.1em] text-white/50">
                            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                            256-BIT TLS ENCRYPTED CONNECTION
                        </div>
                    </div>
                </div>
            </main>

            <p className="relative z-10 text-center pb-6 text-[10px] tracking-[0.15em] text-white/55 drop-shadow-md">
                SECURED · SHAREPOINT EMBEDDED · © 2026 NISSEN KAIUN
            </p>
        </div>
    );
}

function LoginView({ authError }: { authError?: string | null }) {
    const { instance, inProgress } = useMsal();
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(authError ?? null);
    const [loading, setLoading] = useState(false);
    const [isReturningUser] = useState<boolean>(() => {
        try {
            return localStorage.getItem(RETURNING_USER_STORAGE_KEY) === "true";
        } catch {
            return false;
        }
    });

    const handleContinue = async () => {
        setError(null);

        const trimmed = email.trim();
        const hasEmail = trimmed.includes("@");

        // Pre-flight: ask the backend whether this email is a recognised
        // tenant member / invited guest BEFORE launching the MSAL redirect.
        if (hasEmail) {
            try {
                const res = await fetch("/api/auth/check-email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: trimmed }),
                });
                if (!res.ok) {
                    const data = (await res.json().catch(() => ({}))) as { detail?: string };
                    if (res.status === 500 || data.detail === "connection time-out and unreachable authentication request") {
                        setError("connection time-out and unreachable authentication request");
                    } else {
                        setError(
                            data.detail ??
                            "This email address is not authorised. Contact your administrator."
                        );
                    }
                    return;
                }
            } catch {
                setError("connection time-out and unreachable authentication request");
                return;
            }
        }

        setLoading(true);
        // Inside handleContinue function in LoginPage.tsx
        try {
            // TEMPORARY diagnostic — see src/historyProbe.ts. Captures the
            // last state we control right before control passes to Microsoft.
            captureDiagnostics("before loginRedirect (leaving our app)");
            await instance.loginRedirect({
                ...loginRequest,
                loginHint: hasEmail ? trimmed : undefined,
                prompt: hasEmail ? "login" : "select_account",
                extraQueryParameters: { domain_hint: "organizations" },
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Sign in failed");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full relative overflow-hidden flex flex-col text-white">
            {/* Hero photo background */}
            <div className="absolute inset-0 -z-20 overflow-hidden">
                <img
                    src={SHIP_HERO_IMAGE}
                    alt=""
                    className="w-full h-full object-cover animate-ken-burns"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/60" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40" />
                <div className="dms-auth-grain absolute inset-0 opacity-40 mix-blend-overlay" />
                {/* Diagonal sheen sweep */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -inset-y-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-sheen" />
                </div>
            </div>

            <BokehField />

            {/* Top status bar */}
            <header className="relative z-10 flex items-center justify-end px-6 md:px-12 py-6">
                <div className="hidden sm:flex items-center gap-2 text-[10px] tracking-[0.15em] text-white/70 font-medium">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    SYSTEM ONLINE
                </div>
            </header>

            {/* Main content — headline left, sign-in card right */}
            <main className="relative z-10 flex-1 w-full max-w-[1480px] mx-auto flex flex-col lg:flex-row items-center lg:justify-center gap-8 lg:gap-20 xl:gap-28 px-6 md:px-12 lg:px-16 pb-10">
                {/* Headline */}
                <div className="max-w-xl text-center lg:text-left">
                    <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] font-semibold text-white/75 mb-6 drop-shadow-md">
                        <span className="w-6 h-px bg-white/50 inline-block" />
                        VESSEL DOCUMENT MANAGEMENT SYSTEM
                    </div>
                    <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl xl:text-[3.85rem] leading-[1.12] font-semibold mb-8 drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]">
                        Every <span className="italic text-accent">document</span>,
                        <br />
                        every vessel, in one place.
                    </h1>
                    <p className="text-base xl:text-lg leading-relaxed text-white/85 mb-8 drop-shadow-md max-w-lg mx-auto lg:mx-0">
                        Centralize documents, survey reports, and compliance records across the fleet — with automatic renewal alerts and a full audit trail for every document, on every hull.
                    </p>
                    <div className="h-px w-16 bg-gradient-to-r from-accent to-transparent mb-5 mx-auto lg:mx-0" />
                    <p className="text-[11px] tracking-[0.15em] text-white/60 uppercase drop-shadow-md">
                        Trusted for fleet-wide maritime compliance
                    </p>
                </div>

                {/* Sign-in card */}
                <div className="w-full max-w-lg">
                    {/* Brand mark — above the card, first thing seen in this column */}
                    <div className="flex items-center justify-center gap-3 mb-10 md:mb-12">
                        <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-accent/30 to-primary/20 border border-accent/30 flex items-center justify-center shadow-lg shadow-black/25 backdrop-blur-sm">
                            <Anchor className="w-6 h-6 text-accent" strokeWidth={1.75} />
                        </div>
                        <div className="text-left">
                            <div className="text-white font-bold tracking-[0.22em] text-sm drop-shadow-md">
                                NISSEN KAIUN
                            </div>
                            <div className="text-[9px] tracking-[0.2em] font-medium text-white/70 drop-shadow-md">
                                ENTERPRISE EDITION · DOCUMENT MANAGEMENT
                            </div>
                        </div>
                    </div>

                    <div className="dms-auth-card animate-card-float rounded-[34px] p-9 md:p-11">
                        <h2 className="text-2xl font-semibold text-white mb-1.5 text-center">
                            {isReturningUser ? "Welcome Back" : "Welcome"}
                        </h2>
                        <p className="text-sm text-white/65 mb-8 text-center">
                            Sign in with your work email to access the document registry.
                        </p>

                        {/* Work Email field */}
                        <div className="mb-1">
                            <label
                                htmlFor="work-email"
                                className="block text-[10px] tracking-[0.15em] font-semibold text-white/70 mb-2"
                            >
                                WORK EMAIL
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                                <input
                                    id="work-email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && void handleContinue()}
                                    placeholder="name@company.com"
                                    className="dms-auth-input w-full pl-10 pr-4 py-3 text-sm"
                                />
                            </div>
                        </div>

                        {error && (
                            <p className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-400/25 rounded-lg px-4 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={() => void handleContinue()}
                            disabled={loading || (inProgress as string) === "login"}
                            className="dms-btn-primary w-full mt-6 flex items-center gap-3 px-5 py-3.5 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <MicrosoftIcon />
                            <span className="flex-1 text-left">
                                <span className="block text-sm font-semibold text-primary-fg">
                                    {loading || (inProgress as string) === "login"
                                        ? "Redirecting…"
                                        : "Continue with Microsoft"}
                                </span>
                                <span className="block text-[11px] text-primary-fg/70 tracking-wide">
                                    INCLUDING GMAIL &amp; GOOGLE WORKSPACE
                                </span>
                            </span>
                            <ArrowRight className="w-4 h-4 text-primary-fg" />
                        </button>

                        <div className="flex items-center justify-center gap-1.5 mt-7 text-[10px] tracking-[0.1em] text-white/50">
                            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                            256-BIT TLS ENCRYPTED CONNECTION
                        </div>
                    </div>
                </div>
            </main>

            <p className="relative z-10 text-center pb-6 text-[10px] tracking-[0.15em] text-white/55 drop-shadow-md">
                SECURED · SHAREPOINT EMBEDDED · © 2026 NISSEN KAIUN
            </p>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Public export — single entry point for both login & logout states           */
/* ─────────────────────────────────────────────────────────────────────────── */

export function LoginPage({
    onAuthenticated,
    signedOut = false,
    onSignBackIn,
    sessionExpired,
    sessionExpiredFromSignout,
    authError,
}: LoginPageProps) {
    void onAuthenticated;
    if (sessionExpired) {
        return (
            <SessionExpiredView
                reason={sessionExpired}
                onSignBackIn={onSignBackIn ?? (() => (window.location.href = "/"))}
            />
        );
    }
    if (signedOut) {
        return (
            <SignedOutView
                expiredReason={sessionExpiredFromSignout}
                onSignBackIn={onSignBackIn ?? (() => (window.location.href = "/"))}
            />
        );
    }
    return <LoginView authError={authError} />;
}
