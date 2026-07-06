import { useState } from "react";
import {
  Anchor,
  Ship,
  FileText,
  FileCheck2,
  FileClock,
  Building2,
  ShieldCheck,
  KeyRound,
  Mail,
  Phone,
  Clock,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Lock,
  ChevronRight,
  LogOut,
  Camera,
  MapPin,
  Hash,
  Calendar,
  Users,
  ArrowLeft,
  LayoutDashboard,
  Layers,
} from "lucide-react";
import { MAIN_ACCENTS } from "./nodeStyle";
import type { FolderNode } from "../api";

// ── palette aligned with the app's dark navy/teal theme ──────────────────────
const navy = "#0a2027";   // --color-navy-900
const navy2 = "#0e2a33";  // --color-navy-800
const steel = "#1B4965";
const teal = "#14b8a6";   // --color-brand-500
const teal300 = "#5eead4";
const amber = "#f59e0b";
const danger = "#e11d48";
const white = "#ffffff";
const slate400 = "#94a3b8";
const slate500 = "#64748b";
const slate200 = "#e2e8f0";
const slate50 = "#f8fafc";
const slate100 = "#f1f5f9";

// ── mock user data ─────────────────────────────────────────────────────────────
const user = {
  name: "Anjali Menon",
  employeeId: "EMP-4471",
  designation: null as string | null,
  role: "Document Controller",
  tenant: "Meridian Shipping Pte Ltd",
  tenantId: "TEN-2291",
  plan: "Fleet Enterprise",
  photo: null as string | null,
  email: "a.menon@meridianshipping.com",
  phone: "+65 8123 4477",
  address: "21 Marina Boulevard, #14-02, Singapore 018982",
  createdDate: "14 Feb 2023",
  managerId: "EMP-1027 — Rakesh Iyer (Fleet Manager)",
  lastLogin: "06 Jul 2026, 09:12 SGT",
  twoFactor: true,
  status: "Active",
};

const profileStats = [
  { label: "Documents managed", value: "1,248", icon: FileText },
  { label: "Pending approvals", value: "6", icon: FileClock },
  { label: "Vessels in scope", value: "9", icon: Ship },
  { label: "Expiring in 30 days", value: "4", icon: AlertTriangle },
];

const vessels = [
  { name: "MV Konkan Voyager", imo: "9483726", docs: 182, flagged: 1 },
  { name: "MV Arabian Star", imo: "9312044", docs: 210, flagged: 0 },
  { name: "MT Coral Horizon", imo: "9276190", docs: 156, flagged: 2 },
  { name: "MV Pacific Trader", imo: "9401987", docs: 134, flagged: 1 },
];

const activity = [
  { action: "Approved", doc: "Safety Management Certificate — MV Konkan Voyager", time: "Today, 08:40", icon: CheckCircle2, color: teal },
  { action: "Uploaded", doc: "Class Survey Report — MT Coral Horizon", time: "Yesterday, 17:05", icon: UploadCloud, color: slate400 },
  { action: "Flagged expiring", doc: "P&I Insurance Certificate — MV Pacific Trader", time: "Yesterday, 11:20", icon: AlertTriangle, color: amber },
  { action: "Reviewed", doc: "Crew List — MV Arabian Star", time: "2 days ago", icon: Eye, color: slate400 },
];

const expiringCertificates = [
  { name: "P&I Insurance Certificate", vessel: "MV Pacific Trader", expiry: "18 Jul 2026", daysLeft: 12 },
  { name: "Safety Management Certificate", vessel: "MV Konkan Voyager", expiry: "22 Jul 2026", daysLeft: 16 },
  { name: "Class Survey Certificate", vessel: "MT Coral Horizon", expiry: "28 Jul 2026", daysLeft: 22 },
  { name: "Load Line Certificate", vessel: "MV Arabian Star", expiry: "02 Aug 2026", daysLeft: 27 },
];

const permissions = [
  { label: "Upload & version documents", granted: true },
  { label: "Approve certificates", granted: true },
  { label: "Manage vessel access", granted: true },
  { label: "Manage tenant users", granted: false },
  { label: "Billing & subscription", granted: false },
];

// ── Mini sidebar (profile page) ────────────────────────────────────────────────
interface MiniSidebarProps {
  mains: FolderNode[];
  onBack: () => void;
  onDashboard: () => void;
}

function MiniSidebar({ mains, onBack, onDashboard }: MiniSidebarProps) {
  return (
    <aside
      className="flex h-full w-72 shrink-0 flex-col"
      style={{ background: navy, color: slate200 }}
    >
      {/* Logo */}
      <button
        onClick={onBack}
        className="flex items-center gap-3 px-5 py-5 text-left transition hover:bg-white/5 w-full"
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: "rgba(20,184,166,0.2)", border: "1px solid rgba(94,234,212,0.3)" }}
        >
          <Anchor className="h-5 w-5" style={{ color: teal300 }} />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight" style={{ color: white }}>
            Vessel DMS
          </h1>
          <p className="text-[11px]" style={{ color: slate400 }}>SharePoint Embedded</p>
        </div>
      </button>

      {/* Back / Nav */}
      <div className="px-4 pb-3">
        <button
          onClick={onBack}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition"
          style={{ background: "rgba(255,255,255,0.08)", color: slate200 }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to DMS
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        <button
          onClick={onDashboard}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition hover:bg-white/5"
          style={{ color: slate200 }}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <LayoutDashboard className="h-4 w-4" style={{ color: teal300 }} />
          </span>
          Dashboard
        </button>

        <p
          className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: slate500 }}
        >
          Main Folders
        </p>

        {mains.map((m) => {
          const accent = MAIN_ACCENTS[m.name];
          return (
            <button
              key={m.id}
              onClick={onBack}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition hover:bg-white/5"
              style={{ color: slate200 }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: accent ? undefined : "rgba(255,255,255,0.1)" }}
              >
                <Layers
                  className="h-4 w-4"
                  style={{ color: accent ? undefined : white }}
                />
              </span>
              <span className="truncate text-left">{m.name}</span>
            </button>
          );
        })}
      </nav>

      {/* Profile strip at bottom */}
      <div
        className="border-t px-5 py-3"
        style={{ borderColor: "rgba(255,255,255,0.05)", color: slate500 }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
            style={{ background: teal, color: navy }}
          >
            {user.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium" style={{ color: slate200 }}>
              {user.name}
            </p>
            <p className="text-[10px]" style={{ color: slate500 }}>{user.role}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Profile Page ───────────────────────────────────────────────────────────────
interface ProfilePageProps {
  mains: FolderNode[];
  onBack: () => void;
  onDashboard: () => void;
}

export default function ProfilePage({ mains, onBack, onDashboard }: ProfilePageProps) {
  const [resetSent, setResetSent] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);

  if (loggedOut) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: navy, color: white }}
      >
        <div className="text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "rgba(20,184,166,0.15)", border: `1px solid ${teal}` }}
          >
            <Anchor className="h-8 w-8" style={{ color: teal }} />
          </div>
          <p className="text-xl font-semibold tracking-wide">Signed Out</p>
          <p className="mt-1 text-sm" style={{ color: slate400 }}>
            You have been signed out of Vessel DMS.
          </p>
          <button
            onClick={() => setLoggedOut(false)}
            className="mt-6 rounded-lg px-5 py-2.5 text-sm font-medium transition"
            style={{ background: teal, color: navy }}
          >
            Back to Profile (demo)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: slate100 }}>
      {/* Sidebar */}
      <MiniSidebar mains={mains} onBack={onBack} onDashboard={onDashboard} />

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center justify-between border-b px-8 py-3"
          style={{ background: white, borderColor: slate200 }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition hover:bg-slate-100"
              style={{ color: slate500 }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <span style={{ color: slate200 }}>/</span>
            <span className="text-sm font-medium" style={{ color: "#0f172a" }}>
              My Profile
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs"
              style={{ background: "rgba(10,32,39,0.06)", color: slate500 }}
            >
              <Building2 className="h-3.5 w-3.5" />
              {user.tenant}
            </div>
            <button
              onClick={() => setLoggedOut(true)}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition"
              style={{
                background: "rgba(225,29,72,0.08)",
                color: danger,
                border: "1px solid rgba(225,29,72,0.25)",
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Hero banner */}
          <div
            className="px-8 py-8"
            style={{
              background: `linear-gradient(135deg, ${navy} 0%, ${navy2} 60%, ${steel} 100%)`,
            }}
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="flex items-center gap-5">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold overflow-hidden"
                    style={{ background: steel, border: `3px solid ${teal}`, color: white }}
                  >
                    {user.photo ? (
                      <img src={user.photo} alt={user.name} className="h-full w-full object-cover" />
                    ) : (
                      user.name.split(" ").map((n) => n[0]).join("")
                    )}
                  </div>
                  <button
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full transition"
                    style={{ background: teal, border: `2px solid ${navy}` }}
                    title="Upload photo"
                  >
                    <Camera className="h-3.5 w-3.5" style={{ color: navy }} />
                  </button>
                </div>

                <div>
                  <h1 className="text-3xl font-bold tracking-tight" style={{ color: white }}>
                    {user.name}
                  </h1>
                  <p className="mt-0.5 text-xs font-mono" style={{ color: slate400 }}>
                    Employee ID {user.employeeId}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: teal300 }}>
                    {user.role} · {user.tenant}
                  </p>
                </div>
              </div>

              {/* Status badge */}
              <div
                className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide md:self-auto"
                style={{
                  background: "rgba(20,184,166,0.15)",
                  border: `1px solid ${teal}`,
                  color: teal300,
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: teal }}
                />
                {user.status.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div
            className="grid grid-cols-2 gap-px md:grid-cols-4"
            style={{ background: slate200 }}
          >
            {profileStats.map((s) => (
              <div
                key={s.label}
                className="flex flex-col gap-1 p-5"
                style={{ background: white }}
              >
                <s.icon className="h-4 w-4" style={{ color: slate500 }} />
                <div className="mt-1 text-2xl font-bold" style={{ color: "#0f172a" }}>
                  {s.value}
                </div>
                <div className="text-xs" style={{ color: slate500 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Expiring certificates alert */}
          <div className="px-8 pt-8">
            <section
              className="rounded-xl p-5"
              style={{
                background: "rgba(245,158,11,0.06)",
                border: `1px solid rgba(245,158,11,0.35)`,
              }}
            >
              <h2
                className="flex items-center gap-2 text-base font-semibold"
                style={{ color: "#0f172a" }}
              >
                <AlertTriangle className="h-4 w-4" style={{ color: amber }} />
                Certificates Expiring Within 30 Days
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: slate500 }}>
                Across vessels in this user's scope — action required before expiry
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                {expiringCertificates.map((cert) => {
                  const critical = cert.daysLeft <= 14;
                  return (
                    <div
                      key={cert.name}
                      className="flex items-center justify-between gap-3 rounded-lg px-4 py-3"
                      style={{ background: white, border: `1px solid ${slate200}` }}
                    >
                      <div>
                        <div className="text-sm font-medium" style={{ color: "#0f172a" }}>
                          {cert.name}
                        </div>
                        <div className="mt-0.5 font-mono text-xs" style={{ color: slate500 }}>
                          {cert.vessel} · Expires {cert.expiry}
                        </div>
                      </div>
                      <div
                        className="flex-shrink-0 rounded px-2.5 py-1 font-mono text-xs whitespace-nowrap"
                        style={{
                          background: critical ? "rgba(225,29,72,0.1)" : "rgba(245,158,11,0.12)",
                          color: critical ? danger : amber,
                        }}
                      >
                        {cert.daysLeft}d left
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-8 px-8 py-8 lg:grid-cols-3">
            {/* Left: vessels + activity */}
            <div className="flex flex-col gap-8 lg:col-span-2">
              {/* Vessels */}
              <section>
                <h2
                  className="flex items-center gap-2 text-base font-semibold"
                  style={{ color: "#0f172a" }}
                >
                  <Ship className="h-4 w-4" style={{ color: navy }} />
                  Vessels in Scope
                </h2>
                <p className="mt-0.5 text-sm" style={{ color: slate500 }}>
                  Vessels this user manages documents for, within {user.tenant}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {vessels.map((v) => (
                    <div
                      key={v.imo}
                      className="flex items-center justify-between gap-4 rounded-xl px-4 py-3 transition hover:shadow-sm"
                      style={{ background: white, border: `1px solid ${slate200}` }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                          style={{ background: slate50, border: `1px solid ${slate200}` }}
                        >
                          <Ship className="h-4 w-4" style={{ color: steel }} />
                        </div>
                        <div>
                          <div className="text-sm font-medium" style={{ color: "#0f172a" }}>
                            {v.name}
                          </div>
                          <div className="font-mono text-xs" style={{ color: slate500 }}>
                            IMO {v.imo} · {v.docs} documents
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-3">
                        {v.flagged > 0 && (
                          <span className="flex items-center gap-1 font-mono text-xs" style={{ color: amber }}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {v.flagged}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4" style={{ color: slate400 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Activity log */}
              <section>
                <h2
                  className="flex items-center gap-2 text-base font-semibold"
                  style={{ color: "#0f172a" }}
                >
                  <FileCheck2 className="h-4 w-4" style={{ color: navy }} />
                  Recent Document Activity
                </h2>
                <div className="relative mt-6 pl-2">
                  {/* Dashed timeline line */}
                  <div
                    className="absolute left-[15px] top-2 bottom-2 w-px"
                    style={{
                      backgroundImage: `repeating-linear-gradient(to bottom, ${slate400} 0, ${slate400} 5px, transparent 5px, transparent 10px)`,
                    }}
                  />
                  <div className="flex flex-col gap-6">
                    {activity.map((a, i) => (
                      <div key={i} className="relative flex gap-4">
                        <div
                          className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                          style={{ background: slate50, border: `2px solid ${a.color}` }}
                        >
                          <a.icon className="h-3.5 w-3.5" style={{ color: a.color }} />
                        </div>
                        <div className="pb-1">
                          <span className="text-sm font-semibold" style={{ color: "#0f172a" }}>
                            {a.action}
                          </span>
                          <div className="mt-0.5 text-sm" style={{ color: slate500 }}>
                            {a.doc}
                          </div>
                          <div className="mt-0.5 font-mono text-xs" style={{ color: slate400 }}>
                            {a.time}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            {/* Right: tenant + permissions + account */}
            <div className="flex flex-col gap-6">
              {/* Tenant card */}
              <section
                className="rounded-xl p-5"
                style={{ background: navy }}
              >
                <h3
                  className="flex items-center gap-2 text-sm font-semibold tracking-wide"
                  style={{ color: white }}
                >
                  <Building2 className="h-4 w-4" style={{ color: teal }} />
                  Tenant
                </h3>
                <div className="mt-4 flex flex-col gap-3 font-mono text-xs" style={{ color: slate400 }}>
                  {[
                    ["Organization", user.tenant],
                    ["Tenant ID", user.tenantId],
                    ["Plan", user.plan],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span>{label}</span>
                      <span style={{ color: white }}>{value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Permissions */}
              <section
                className="rounded-xl p-5"
                style={{ background: white, border: `1px solid ${slate200}` }}
              >
                <h3
                  className="flex items-center gap-2 text-sm font-semibold"
                  style={{ color: "#0f172a" }}
                >
                  <ShieldCheck className="h-4 w-4" style={{ color: steel }} />
                  Permissions
                </h3>
                <div className="mt-4 flex flex-col gap-2.5 text-sm">
                  {permissions.map((p) => (
                    <div key={p.label} className="flex items-center justify-between">
                      <span style={{ color: p.granted ? "#0f172a" : slate500 }}>
                        {p.label}
                      </span>
                      {p.granted ? (
                        <CheckCircle2 className="h-4 w-4" style={{ color: teal }} />
                      ) : (
                        <Lock className="h-3.5 w-3.5" style={{ color: slate400 }} />
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Account details */}
              <section
                className="rounded-xl p-5"
                style={{ background: white, border: `1px solid ${slate200}` }}
              >
                <h3 className="text-sm font-semibold" style={{ color: "#0f172a" }}>
                  Account
                </h3>
                <div className="mt-4 flex flex-col gap-3 text-sm">
                  {[
                    { icon: Hash, text: `Employee ID ${user.employeeId}` },
                    { icon: Mail, text: user.email },
                    { icon: Phone, text: user.phone },
                    { icon: MapPin, text: user.address },
                    { icon: Users, text: `Reports to ${user.managerId}` },
                    { icon: Calendar, text: `Account created ${user.createdDate}` },
                    { icon: Clock, text: `Last login ${user.lastLogin}` },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-start gap-2">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: slate400 }} />
                      <span style={{ color: "#334155" }}>{text}</span>
                    </div>
                  ))}

                  {/* 2FA */}
                  <div
                    className="mt-2 flex items-center gap-2 border-t pt-3"
                    style={{ borderColor: slate200 }}
                  >
                    <KeyRound
                      className="h-4 w-4"
                      style={{ color: user.twoFactor ? teal : slate400 }}
                    />
                    <span style={{ color: user.twoFactor ? teal : slate400 }}>
                      Two-factor authentication {user.twoFactor ? "enabled" : "disabled"}
                    </span>
                  </div>

                  {/* Reset password */}
                  <button
                    onClick={() => setResetSent(true)}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition"
                    style={{ background: navy, color: white }}
                  >
                    <KeyRound className="h-4 w-4" />
                    Reset Password
                  </button>
                  {resetSent && (
                    <p className="text-center text-xs" style={{ color: teal }}>
                      Password reset link sent to {user.email}
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
