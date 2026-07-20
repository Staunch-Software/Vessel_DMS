import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
import { captureDiagnostics } from "../historyProbe";
import {
    Mail,
    ArrowRight,
    ShieldCheck,
    FileCheck2,
    ClipboardList,
    BellRing,
    Anchor,
    LogIn,
    Ship,
    Compass,
    Award,
    Clock,
    AlertTriangle,
} from "lucide-react";

const NISSEN_LOGO = "/nissen-logo.svg";

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
    /** Error surfaced from a failed SSO redirect/backend login, shown on load */
    authError?: string | null;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Shared chrome (header + background)                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="dms-app-bg min-h-screen w-full relative bg-bg text-fg">
            {/* Ambient gradient wash — tinted with the active theme's primary/accent */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--dms-primary)_15%,transparent),transparent_55%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklab,var(--dms-accent)_12%,transparent),transparent_50%)]" />

            {/* Nautical chart lines */}
            <svg
                className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.25]"
                preserveAspectRatio="none"
                viewBox="0 0 1600 900"
            >
                <path
                    d="M -50 620 C 250 560, 480 700, 760 610 S 1250 480, 1650 560"
                    fill="none"
                    className="stroke-primary"
                    strokeWidth="1"
                    strokeDasharray="2 10"
                    opacity="0.5"
                />
                <path
                    d="M -50 300 C 300 260, 520 380, 820 320 S 1300 200, 1650 260"
                    fill="none"
                    className="stroke-accent"
                    strokeWidth="1"
                    strokeDasharray="1 8"
                    opacity="0.35"
                />
                {[
                    [180, 300], [820, 320], [1300, 200], [480, 700], [1250, 480],
                ].map(([cx, cy], i) => (
                    <circle key={i} cx={cx} cy={cy} r="3" className="fill-primary" opacity="0.4" />
                ))}
            </svg>

            {/* Top bar */}
            <header className="sticky top-0 z-20 backdrop-blur-sm flex items-center justify-between px-4 md:px-14 py-4 border-b border-border bg-topnav-bg/90">
                <div className="flex items-center gap-3">
                    <img
                        src={NISSEN_LOGO}
                        alt="Nissen Kaiun logo"
                        className="h-12 w-auto drop-shadow-md"
                    />
                    <div>
                        <div className="text-fg font-bold tracking-[0.22em] text-sm">
                            NISSEN DMS
                        </div>
                        <div className="text-primary text-[10px] tracking-[0.2em] font-medium">
                            ENTERPRISE EDITION · DOCUMENT MANAGEMENT
                        </div>
                    </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-[11px] tracking-[0.15em] text-muted font-medium">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    SYSTEM ONLINE&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;NISSEN DMS
                </div>
            </header>

            {children}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Shared sub-components                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function FeatureCard({
    icon,
    title,
    copy,
}: {
    icon: React.ReactNode;
    title: string;
    copy: string;
}) {
    return (
        <div className="dms-card dms-card-hover rounded-xl px-4 py-4 transition">
            <div className="w-8 h-8 rounded-md bg-primary/20 text-primary flex items-center justify-center mb-3">
                {icon}
            </div>
            <div className="text-sm font-semibold text-primary mb-1">{title}</div>
            <div className="text-xs text-fg/75 leading-relaxed">{copy}</div>
        </div>
    );
}

function StatusRow({
    dotColor,
    title,
    subtitle,
    status,
    statusColor,
    last = false,
}: {
    dotColor: string;
    title: string;
    subtitle: string;
    status: string;
    statusColor: string;
    last?: boolean;
}) {
    return (
        <div
            className={`flex items-center justify-between px-5 py-4 ${!last ? "border-b border-border" : ""
                }`}
        >
            <div className="flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 inline-block ${dotColor}`} />
                <div>
                    <div className="text-sm font-semibold text-primary">{title}</div>
                    <div className="text-xs text-fg/70">{subtitle}</div>
                </div>
            </div>
            <div className={`text-xs font-bold tracking-wide ${statusColor}`}>
                {status}
            </div>
        </div>
    );
}

function CardFooter() {
    return (
        <>
            <div className="flex items-center justify-center gap-1.5 mt-6 text-[10px] tracking-[0.1em] text-fg/70">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                256-BIT TLS ENCRYPTED CONNECTION
            </div>

            <div className="text-center mt-3 text-[10px] tracking-[0.1em] text-fg/60">
                SECURED · SHAREPOINT EMBEDDED · © 2026 NISSEN DMS
            </div>
        </>
    );
}

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
        <PageShell>
            <main className="relative z-10 px-4 md:px-14 py-8 md:py-14 flex flex-col lg:flex-row gap-8 lg:gap-12 items-start justify-between">
                {/* Left column */}
                <div className="w-full lg:max-w-[calc(100%-30rem)] lg:pr-8 mb-12 lg:mb-0">
                    <div className="flex items-center gap-2 text-primary text-[11px] tracking-[0.2em] font-semibold mb-6">
                        <span className="w-6 h-px bg-primary inline-block" />
                        NISSEN KAIUN SINGAPORE FLEET
                    </div>

                    <h1 className="font-serif text-3xl sm:text-5xl md:text-[3.75rem] leading-[1.05] text-fg mb-6 font-semibold">
                        Premium global shipping,
                        <br />
                        <span className="italic bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">managed locally.</span>
                    </h1>

                    <p className="text-fg/85 text-base md:text-lg leading-relaxed max-w-xl mb-10">
                        Nissen Kaiun Singapore oversees the{" "}
                        <strong className="font-semibold text-fg">technical management</strong>,{" "}
                        <strong className="font-semibold text-fg">crewing</strong>, and{" "}
                        <strong className="font-semibold text-fg">compliance</strong> of a high-specification global fleet operating state-of-the-art bulkers, eco-friendly container ships, and advanced product tankers.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-xl mb-10">
                        <FeatureCard icon={<Ship className="w-4 h-4" />} title="Modern Fleet" copy="Over 100 high-spec bulkers, tankers, and boxships." />
                        <FeatureCard icon={<Compass className="w-4 h-4" />} title="Global Routing" copy="Reliable sea transport routes across all major oceans." />
                        <FeatureCard icon={<Award className="w-4 h-4" />} title="Class Certified" copy="Classified under top maritime boards for safety." />
                    </div>
                </div>

                {/* Right column — expired card */}
                <div className="relative lg:fixed z-10 w-full max-w-md lg:w-[26rem] top-auto right-auto lg:top-[7.5rem] lg:right-[3.5rem] self-center lg:self-auto">
                    <Anchor className="absolute -top-6 -right-6 w-28 h-28 text-primary/10 -z-10" strokeWidth={1} />

                    <div className="dms-card rounded-2xl p-8 md:p-9">
                        {/* Icon badge */}
                        <div className="w-14 h-14 rounded-full bg-warning/10 border border-warning/20 flex items-center justify-center mb-5">
                            {isInactivity
                                ? <Clock className="w-7 h-7 text-warning" />
                                : <AlertTriangle className="w-7 h-7 text-warning" />}
                        </div>

                        <h2 className="font-serif text-3xl text-fg mb-2 font-semibold">
                            {isInactivity ? "Session Timed Out" : "Session Expired"}
                        </h2>
                        <p className="text-[11px] tracking-[0.12em] text-muted font-medium mb-7">
                            {isInactivity
                                ? "INACTIVE FOR 8 HOURS — SESSION CLOSED"
                                : "24-HOUR SESSION LIMIT REACHED"}
                        </p>

                        <div className="space-y-4">
                            <div className="bg-warning-bg border border-warning/20 rounded-xl px-4 py-3.5">
                                <p className="text-sm text-warning leading-relaxed">
                                    {isInactivity
                                        ? "Your session was automatically closed after 8 hours of inactivity to protect your documents."
                                        : "Your session reached the 24-hour security limit. Please sign in again to continue."}
                                </p>
                            </div>

                            <button
                                onClick={onSignBackIn}
                                className="w-full py-3.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-sm font-semibold flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-[0.99] transition cursor-pointer"
                            >
                                <LogIn className="w-4 h-4 text-primary-fg" />
                                Sign In Again
                            </button>
                        </div>

                        <CardFooter />
                    </div>
                </div>
            </main>
        </PageShell>
    );
}

/* ───────────────────────────────────────────────────────────────────────────── *//*  Signed-out view                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function SignedOutView({ onSignBackIn }: { onSignBackIn: () => void }) {
    return (
        <PageShell>
            <main className="relative z-10 px-4 md:px-14 py-8 md:py-14 flex flex-col lg:flex-row gap-8 lg:gap-12 items-start justify-between">
                {/* Left column */}
                <div className="w-full lg:max-w-[calc(100%-30rem)] lg:pr-8 mb-12 lg:mb-0">
                    <div className="flex items-center gap-2 text-primary text-[11px] tracking-[0.2em] font-semibold mb-6">
                        <span className="w-6 h-px bg-primary inline-block" />
                        NISSEN KAIUN SINGAPORE FLEET
                    </div>

                    <h1 className="font-serif text-3xl sm:text-5xl md:text-[3.75rem] leading-[1.05] text-fg mb-6 font-semibold">
                        Premium global shipping,
                        <br />
                        <span className="italic bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">managed locally.</span>
                    </h1>

                    <p className="text-fg/85 text-base md:text-lg leading-relaxed max-w-xl mb-10">
                        Nissen Kaiun Singapore oversees the{" "}
                        <strong className="font-semibold text-fg">technical management</strong>,{" "}
                        <strong className="font-semibold text-fg">crewing</strong>, and{" "}
                        <strong className="font-semibold text-fg">compliance</strong> of a high-specification global fleet. Operating state-of-the-art bulkers, eco-friendly container ships, and advanced product tankers, we uphold the highest international safety standards.
                    </p>

                    {/* Feature cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-xl mb-10">
                        <FeatureCard
                            icon={<Ship className="w-4 h-4" />}
                            title="Modern Fleet"
                            copy="Over 100 high-spec bulkers, tankers, and boxships."
                        />
                        <FeatureCard
                            icon={<Compass className="w-4 h-4" />}
                            title="Global Routing"
                            copy="Reliable sea transport routes across all major oceans."
                        />
                        <FeatureCard
                            icon={<Award className="w-4 h-4" />}
                            title="Class Certified"
                            copy="Classified under top maritime boards for safety."
                        />
                    </div>

                    {/* System Stats panel */}
                    <div className="dms-card max-w-xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                            <div className="flex items-center gap-2 text-[11px] tracking-[0.15em] font-semibold text-muted">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                                SYSTEM OVERVIEW
                            </div>
                            <div className="text-[11px] tracking-[0.1em] text-muted">
                                LIVE STATUS
                            </div>
                        </div>

                        <StatusRow
                            dotColor="bg-primary"
                            title="Document Repository"
                            subtitle="Certificates, surveys & reports · SharePoint Embedded"
                            status="ONLINE"
                            statusColor="text-primary"
                        />
                        <StatusRow
                            dotColor="bg-primary"
                            title="Approval Workflow"
                            subtitle="Multi-level review & sign-off · Audit trail enabled"
                            status="ACTIVE"
                            statusColor="text-primary"
                        />
                        <StatusRow
                            dotColor="bg-primary"
                            title="Azure AD Authentication"
                            subtitle="Microsoft SSO · Role-based access control"
                            status="SECURED"
                            statusColor="text-primary"
                            last
                        />
                    </div>
                </div>

                {/* Right column — auth card */}
                <div className="relative lg:fixed z-10 w-full max-w-md lg:w-[26rem] top-auto right-auto lg:top-[7.5rem] lg:right-[3.5rem] self-center lg:self-auto">
                    <Anchor
                        className="absolute -top-6 -right-6 w-28 h-28 text-primary/10 -z-10"
                        strokeWidth={1}
                    />

                    <div className="dms-card rounded-2xl p-8 md:p-9">
                        <h2 className="font-serif text-3xl text-fg mb-2 font-semibold">
                            Signed Out
                        </h2>
                        <p className="text-[11px] tracking-[0.12em] text-muted font-medium mb-7">
                            YOUR SESSION WAS SECURELY CLOSED
                        </p>

                        <div className="space-y-4">
                            <p className="text-sm text-muted leading-relaxed">
                                Thank you for using the Vessel Document Management System.
                                You have been successfully signed out of your account.
                            </p>

                            <button
                                onClick={onSignBackIn}
                                className="dms-btn-primary w-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition cursor-pointer"
                            >
                                <LogIn className="w-4 h-4" />
                                Back to Login
                            </button>
                        </div>

                        <CardFooter />
                    </div>
                </div>
            </main>
        </PageShell>
    );
}

function LoginView({ authError }: { authError?: string | null }) {
    const { instance, inProgress } = useMsal();
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(authError ?? null);
    const [loading, setLoading] = useState(false);

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
        <PageShell>
            <main className="relative z-10 px-4 md:px-14 py-8 md:py-14 flex flex-col lg:flex-row gap-8 lg:gap-12 items-start justify-between">
                {/* Left column */}
                <div className="w-full lg:max-w-[calc(100%-30rem)] lg:pr-8 mb-12 lg:mb-0">
                    <div className="flex items-center gap-2 text-primary text-[11px] tracking-[0.2em] font-semibold mb-6">
                        <span className="w-6 h-px bg-primary inline-block" />
                        VESSEL DOCUMENT MANAGEMENT SYSTEM
                    </div>

                    <h1 className="font-serif text-3xl sm:text-5xl md:text-[3.75rem] leading-[1.05] text-fg mb-6 font-semibold">
                        Every certificate,
                        <br />
                        <span className="italic bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">every vessel,</span> in one
                        <br />
                        place.
                    </h1>

                    <p className="text-fg/85 text-base md:text-lg leading-relaxed max-w-xl mb-10">
                        <strong className="font-semibold text-fg">Centralize certificates</strong>,{" "}
                        <strong className="font-semibold text-fg">survey reports</strong>, and{" "}
                        <strong className="font-semibold text-fg">compliance records</strong> across the fleet — with automatic{" "}
                        <span className="font-semibold text-primary">renewal alerts</span> and a full{" "}
                        <span className="font-semibold text-primary">audit trail</span> for every document, on every hull.
                    </p>

                    {/* Feature cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-xl mb-10">
                        <FeatureCard
                            icon={<FileCheck2 className="w-4 h-4" />}
                            title="Certificate registry"
                            copy="One record per vessel, always current."
                        />
                        <FeatureCard
                            icon={<BellRing className="w-4 h-4" />}
                            title="Renewal alerts"
                            copy="Flagged automatically before they lapse."
                        />
                        <FeatureCard
                            icon={<ClipboardList className="w-4 h-4" />}
                            title="Audit trail"
                            copy="Every edit, sign-off, and survey logged."
                        />
                    </div>

                    {/* System Stats panel */}
                    <div className="dms-card max-w-xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                            <div className="flex items-center gap-2 text-[11px] tracking-[0.15em] font-semibold text-muted">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                                SYSTEM OVERVIEW
                            </div>
                            <div className="text-[11px] tracking-[0.1em] text-muted">
                                LIVE STATUS
                            </div>
                        </div>

                        <StatusRow
                            dotColor="bg-primary"
                            title="Document Repository"
                            subtitle="Certificates, surveys & reports · SharePoint Embedded"
                            status="ONLINE"
                            statusColor="text-primary"
                        />
                        <StatusRow
                            dotColor="bg-primary"
                            title="Approval Workflow"
                            subtitle="Multi-level review & sign-off · Audit trail enabled"
                            status="ACTIVE"
                            statusColor="text-primary"
                        />
                        <StatusRow
                            dotColor="bg-primary"
                            title="Azure AD Authentication"
                            subtitle="Microsoft SSO · Role-based access control"
                            status="SECURED"
                            statusColor="text-primary"
                            last
                        />
                    </div>
                </div>

                {/* Right column — auth card */}
                <div className="relative lg:fixed z-10 w-full max-w-md lg:w-[26rem] top-auto right-auto lg:top-[7.5rem] lg:right-[3.5rem] self-center lg:self-auto">
                    <Anchor
                        className="absolute -top-6 -right-6 w-28 h-28 text-primary/10 -z-10"
                        strokeWidth={1}
                    />

                    <div className="dms-card rounded-2xl p-8 md:p-9">
                        <h2 className="font-serif text-3xl text-fg mb-2">
                            Welcome Back
                        </h2>
                        <p className="text-[11px] tracking-[0.12em] text-muted font-medium mb-7">
                            SIGN IN TO ACCESS THE DOCUMENT REGISTRY
                        </p>

                        {/* Work Email field */}
                        <div className="mb-1">
                            <label
                                htmlFor="work-email"
                                className="block text-[10px] tracking-[0.15em] font-semibold text-fg/80 mb-2"
                            >
                                WORK EMAIL
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                <input
                                    id="work-email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && void handleContinue()}
                                    placeholder="name@company.com"
                                    className="dms-input w-full pl-10 pr-4 py-3 text-fg placeholder-subtle text-sm"
                                />
                            </div>
                        </div>

                        {error && (
                            <p className="mt-4 text-sm text-error bg-error/10 border border-error/20 rounded-lg px-4 py-2">
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
                            <span className="flex-1">
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

                        <CardFooter />
                    </div>
                </div>
            </main>
        </PageShell>
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
                onSignBackIn={onSignBackIn ?? (() => (window.location.href = "/"))}
            />
        );
    }
    return <LoginView authError={authError} />;
}
