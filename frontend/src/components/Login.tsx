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
    /** Error surfaced from a failed SSO redirect/backend login, shown on load */
    authError?: string | null;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Shared chrome (header + background)                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen w-full relative bg-sidebar-bg">
            {/* Ambient gradient wash — tinted with the active theme's primary/accent */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_color-mix(in_oklab,var(--dms-primary)_15%,transparent),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_color-mix(in_oklab,var(--dms-accent)_12%,transparent),_transparent_50%)]" />

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
            <header className="sticky top-0 z-20 backdrop-blur-sm flex items-center justify-between px-8 md:px-14 py-5 border-b border-white/10 bg-sidebar-bg/90">
                <div className="flex items-center gap-3">
                    <img
                        src={NISSEN_LOGO}
                        alt="Nissen Kaiun logo"
                        className="h-12 w-auto drop-shadow-md"
                    />
                    <div>
                        <div className="text-sidebar-fg font-bold tracking-[0.22em] text-sm">
                            NISSEN DMS
                        </div>
                        <div className="text-primary text-[10px] tracking-[0.2em] font-medium">
                            ENTERPRISE EDITION · DOCUMENT MANAGEMENT
                        </div>
                    </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-[11px] tracking-[0.15em] text-sidebar-muted font-medium">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    REGISTRY ONLINE&nbsp;&nbsp;&nbsp;V 4.2 · DEEP DRAFT
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
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 shadow-sm px-4 py-4 hover:bg-white/10 hover:border-primary/30 transition">
            <div className="w-8 h-8 rounded-md bg-primary/20 text-primary flex items-center justify-center mb-3">
                {icon}
            </div>
            <div className="text-sm font-semibold text-primary mb-1">{title}</div>
            <div className="text-xs text-sidebar-muted leading-relaxed">{copy}</div>
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
            className={`flex items-center justify-between px-5 py-4 ${!last ? "border-b border-white/10" : ""
                }`}
        >
            <div className="flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 inline-block ${dotColor}`} />
                <div>
                    <div className="text-sm font-semibold text-primary">{title}</div>
                    <div className="text-xs text-sidebar-muted">{subtitle}</div>
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
            <div className="flex items-center justify-center gap-1.5 mt-6 text-[10px] tracking-[0.1em] text-sidebar-muted">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                256-BIT TLS ENCRYPTED CONNECTION
            </div>

            <div className="text-center mt-3 text-[10px] tracking-[0.1em] text-sidebar-muted">
                REGISTRY SYNCED · 25 VESSELS · © 2026 VESSEL DMS
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

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Signed-out view                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function SignedOutView({ onSignBackIn }: { onSignBackIn: () => void }) {
    return (
        <PageShell>
            <main className="relative z-10 px-8 md:px-14 py-14 flex flex-col lg:flex-row gap-12 items-start justify-between">
                {/* Left column */}
                <div className="w-full lg:max-w-[calc(100%-30rem)] lg:pr-8 mb-12 lg:mb-0">
                    <div className="flex items-center gap-2 text-primary text-[11px] tracking-[0.2em] font-semibold mb-6">
                        <span className="w-6 h-px bg-primary inline-block" />
                        NISSEN KAIUN SINGAPORE FLEET
                    </div>

                    <h1 className="font-serif text-5xl md:text-[3.75rem] leading-[1.05] text-sidebar-fg mb-6">
                        Premium global shipping,
                        <br />
                        <span className="italic text-primary">managed locally.</span>
                    </h1>

                    <p className="text-sidebar-muted text-base leading-relaxed max-w-lg mb-10">
                        Nissen Kaiun Singapore oversees the technical management, crewing,
                        and compliance of a high-specification global fleet. Operating
                        state-of-the-art bulkers, eco-friendly container ships, and advanced
                        product tankers, we uphold the highest international safety
                        standards.
                    </p>

                    {/* Feature cards */}
                    <div className="grid sm:grid-cols-3 gap-4 max-w-xl mb-10">
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

                    {/* Status panel */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 shadow-sm max-w-xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                            <div className="flex items-center gap-2 text-[11px] tracking-[0.15em] font-semibold text-sidebar-muted">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                                SINGAPORE MANAGED VESSELS
                            </div>
                            <div className="text-[11px] tracking-[0.1em] text-sidebar-muted">
                                ACTIVE STATUS
                            </div>
                        </div>

                        <StatusRow
                            dotColor="bg-primary"
                            title="MT Southern Wave"
                            subtitle="LPG Tanker · Class NK Registered"
                            status="ACTIVE"
                            statusColor="text-primary"
                        />
                        <StatusRow
                            dotColor="bg-primary"
                            title="MV Pacific Horizon"
                            subtitle="Supramax Bulk Carrier · DNV Certified"
                            status="UNDERWAY"
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

                    <div className="bg-white/5 backdrop-blur-md rounded-2xl shadow-xl shadow-black/30 border border-white/10 p-8 md:p-9">
                        <h2 className="font-serif text-3xl text-sidebar-fg mb-2 font-semibold">
                            Signed Out
                        </h2>
                        <p className="text-[11px] tracking-[0.12em] text-sidebar-muted font-medium mb-7">
                            YOUR SESSION WAS SECURELY CLOSED
                        </p>

                        <div className="space-y-4">
                            <p className="text-sm text-sidebar-muted leading-relaxed">
                                Thank you for using the Vessel Document Management System.
                                You have been successfully signed out of your account.
                            </p>

                            <button
                                onClick={onSignBackIn}
                                className="w-full py-3.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-primary/30 hover:shadow-lg active:scale-[0.99] transition cursor-pointer"
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

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Login view                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

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
                    setError(
                        data.detail ??
                        "This email address is not authorised. Contact your administrator."
                    );
                    return;
                }
            } catch {
                // If the pre-check itself fails (network error) let MSAL proceed —
                // Entra will still reject the user on the server side.
            }
        }

        setLoading(true);
        try {
            // TEMPORARY diagnostic — see src/historyProbe.ts. Captures the
            // last state we control right before control passes to Microsoft.
            captureDiagnostics("before loginRedirect (leaving our app)");
            await instance.loginRedirect({
                ...loginRequest,
                loginHint: hasEmail ? trimmed : undefined,
                prompt: "login",
                extraQueryParameters: { domain_hint: "organizations" },
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Sign in failed");
            setLoading(false);
        }
    };

    return (
        <PageShell>
            <main className="relative z-10 px-8 md:px-14 py-14 flex flex-col lg:flex-row gap-12 items-start justify-between">
                {/* Left column */}
                <div className="w-full lg:max-w-[calc(100%-30rem)] lg:pr-8 mb-12 lg:mb-0">
                    <div className="flex items-center gap-2 text-primary text-[11px] tracking-[0.2em] font-semibold mb-6">
                        <span className="w-6 h-px bg-primary inline-block" />
                        VESSEL DOCUMENT MANAGEMENT SYSTEM
                    </div>

                    <h1 className="font-serif text-5xl md:text-[3.75rem] leading-[1.05] text-sidebar-fg mb-6">
                        Every certificate,
                        <br />
                        <span className="italic text-primary">every vessel,</span> in one
                        <br />
                        place.
                    </h1>

                    <p className="text-sidebar-muted text-base leading-relaxed max-w-lg mb-10">
                        Centralize certificates, survey reports, and compliance records
                        across the fleet — with automatic renewal alerts and a full audit
                        trail for every document, on every hull.
                    </p>

                    {/* Feature cards */}
                    <div className="grid sm:grid-cols-3 gap-4 max-w-xl mb-10">
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

                    {/* Status panel */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 shadow-sm max-w-xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                            <div className="flex items-center gap-2 text-[11px] tracking-[0.15em] font-semibold text-sidebar-muted">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                                DOCUMENT &amp; COMPLIANCE STATUS
                            </div>
                            <div className="text-[11px] tracking-[0.1em] text-sidebar-muted">
                                REGISTRY SYNCED · 12S AGO
                            </div>
                        </div>

                        <StatusRow
                            dotColor="bg-primary"
                            title="MV Meridian"
                            subtitle="Safety Management Certificate · Verified"
                            status="VALID"
                            statusColor="text-primary"
                        />
                        <StatusRow
                            dotColor="bg-warning"
                            title="MV Solstice"
                            subtitle="ISM Audit Report · Renewal due"
                            status="12 DAYS"
                            statusColor="text-warning"
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

                    <div className="bg-white/5 backdrop-blur-md rounded-2xl shadow-xl shadow-black/30 border border-white/10 p-8 md:p-9">
                        <h2 className="font-serif text-3xl text-sidebar-fg mb-2">
                            Welcome Back
                        </h2>
                        <p className="text-[11px] tracking-[0.12em] text-sidebar-muted font-medium mb-7">
                            SIGN IN TO ACCESS THE DOCUMENT REGISTRY
                        </p>

                        {/* Work Email field */}
                        <div className="mb-1">
                            <label
                                htmlFor="work-email"
                                className="block text-[10px] tracking-[0.15em] font-semibold text-sidebar-muted mb-2"
                            >
                                WORK EMAIL
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sidebar-muted" />
                                <input
                                    id="work-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && void handleContinue()}
                                    placeholder="name@company.com"
                                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-white/10 bg-white/5 text-sidebar-fg placeholder-sidebar-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
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
                            className="w-full mt-6 flex items-center gap-3 px-5 py-3.5 rounded-lg bg-primary hover:bg-primary-hover shadow-md shadow-primary/30 hover:shadow-lg active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
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
    authError,
}: LoginPageProps) {
    void onAuthenticated;
    if (signedOut) {
        return (
            <SignedOutView
                onSignBackIn={onSignBackIn ?? (() => (window.location.href = "/"))}
            />
        );
    }
    return <LoginView authError={authError} />;
}
