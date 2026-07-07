import { useState, useEffect } from "react";
import {
  Anchor, Mail, Phone, Clock, LogOut, Camera,
  MapPin, Hash, Calendar, Users, ArrowLeft, LayoutDashboard,
  Layers, ShieldOff, Edit3, Save, X, Shield,
  Building2, Activity, RefreshCw, UserCheck, Monitor, Smartphone,
  AlertCircle,
} from "lucide-react";
import { MAIN_ACCENTS } from "./nodeStyle";
import type { FolderNode, UserProfile, ProfileUpdatePayload } from "../api";
import { getProfile, updateProfile } from "../api";

// ── palette ───────────────────────────────────────────────────────────────────
const navy     = "#0a2027";
const navy2    = "#0e2a33";
const steel    = "#1B4965";
const teal     = "#14b8a6";
const teal300  = "#5eead4";
const danger   = "#e11d48";
const white    = "#ffffff";
const slate400 = "#94a3b8";
const slate500 = "#64748b";
const slate200 = "#e2e8f0";
const slate100 = "#f1f5f9";
const ink      = "#1e293b";

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function yearsLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const yrs = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 365),
  );
  if (yrs <= 0) return "< 1 yr";
  const v = yrs % 100;
  const sfx = v >= 11 && v <= 13 ? "th"
    : yrs % 10 === 1 ? "st"
    : yrs % 10 === 2 ? "nd"
    : yrs % 10 === 3 ? "rd"
    : "th";
  return `${yrs}${sfx} year`;
}

function daysAgo(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

// ── edit form type ─────────────────────────────────────────────────────────────
interface EditForm {
  employee_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  office_name: string;
  address_line1: string;
  address_line2: string;
  area_locality: string;
  landmark: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  department: string;
  manager_name: string;
  manager_email: string;
  ec_name: string;
  ec_relationship: string;
  ec_phone: string;
  ec_email: string;
}

function initForm(p: UserProfile | null): EditForm {
  return {
    employee_id:     p?.employee_id     ?? "",
    first_name:      p?.first_name      ?? "",
    last_name:       p?.last_name       ?? "",
    phone:           p?.phone           ?? "",
    office_name:     p?.office_name     ?? "",
    address_line1:   p?.address_line1   ?? "",
    address_line2:   p?.address_line2   ?? "",
    area_locality:   p?.area_locality   ?? "",
    landmark:        p?.landmark        ?? "",
    city:            p?.city            ?? "",
    state:           p?.state           ?? "",
    postal_code:     p?.postal_code     ?? "",
    country:         p?.country         ?? "",
    department:      p?.department      ?? "",
    manager_name:    p?.manager_name    ?? "",
    manager_email:   p?.manager_email   ?? "",
    ec_name:         p?.emergency_contact?.name              ?? "",
    ec_relationship: p?.emergency_contact?.relationship_type ?? "",
    ec_phone:        p?.emergency_contact?.phone             ?? "",
    ec_email:        p?.emergency_contact?.email             ?? "",
  };
}

// ── Validation ────────────────────────────────────────────────────────────────
type FormErrors = Partial<Record<keyof EditForm, string>>;

function validateForm(f: EditForm): FormErrors {
  const err: FormErrors = {};
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^[+\d()\-\s]+$/;
  if (f.manager_email && !emailRe.test(f.manager_email))
    err.manager_email = "Enter a valid email address (e.g. name@company.com)";
  if (f.ec_email && !emailRe.test(f.ec_email))
    err.ec_email = "Enter a valid email address";
  if (f.phone && !phoneRe.test(f.phone))
    err.phone = "Only digits, +, \u2013, ( ), and spaces are allowed";
  if (f.ec_phone && !phoneRe.test(f.ec_phone))
    err.ec_phone = "Only digits, +, \u2013, ( ), and spaces are allowed";
  if (f.postal_code && !/^[A-Za-z0-9\s\-]+$/.test(f.postal_code))
    err.postal_code = "Enter a valid postal / ZIP code";
  if (f.employee_id && f.employee_id.length > 100)
    err.employee_id = "Employee ID must be 100 characters or fewer";
  return err;
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
interface CardProps {
  title: string;
  icon: React.ReactNode;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}
function Card({ title, icon, eyebrow, action, children }: CardProps) {
  return (
    <div
      className="rounded-xl p-6"
      style={{ background: white, border: `1px solid ${slate200}` }}
    >
      <div
        className="flex items-center justify-between pb-4 mb-1"
        style={{ borderBottom: `1px solid ${slate200}` }}
      >
        <h3
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: ink }}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-lg"
            style={{ background: "rgba(20,184,166,0.12)", color: teal }}
          >
            {icon}
          </span>
          {title}
        </h3>
        <div className="flex items-center gap-3">
          {eyebrow && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: slate400 }}
            >
              {eyebrow}
            </span>
          )}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── FieldRow ──────────────────────────────────────────────────────────────────
interface FieldRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  editing?: boolean;
  inputValue?: string;
  onInputChange?: (v: string) => void;
  readOnly?: boolean;
  mono?: boolean;
  asLink?: boolean;
  type?: string;
  placeholder?: string;
  error?: string;
}
function FieldRow({
  icon, label, value, editing, inputValue, onInputChange,
  readOnly = false, mono = false, asLink = false, type = "text", placeholder = "", error,
}: FieldRowProps) {
  return (
    <div
      className="flex items-start gap-3 py-2.5"
      style={{ borderBottom: `1px dashed ${slate200}` }}
    >
      <span
        className="mt-0.5 flex-shrink-0 text-center"
        style={{ color: slate400, width: 16 }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="text-[12px] font-bold uppercase tracking-wider mb-1"
          style={{ color: slate500 }}
        >
          {label}
        </div>
        {editing && !readOnly ? (
          <>
            <input
              type={type}
              value={inputValue ?? ""}
              onChange={(e) => onInputChange?.(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-md px-2.5 py-1.5 text-sm outline-none placeholder:text-slate-400"
              style={{
                background: slate100,
                border: `1px solid ${error ? danger : slate200}`,
                color: ink,
                fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined,
              }}
            />
            {error && (
              <div className="mt-1 flex items-center gap-1 text-xs" style={{ color: danger }}>
                <AlertCircle className="h-3 w-3 flex-shrink-0" />{error}
              </div>
            )}
          </>
        ) : (
          <div
            className="text-sm font-medium break-words"
            style={{
              color: asLink ? teal : value ? ink : slate400,
              fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined,
              fontSize: mono ? "13px" : undefined,
            }}
          >
            {value || "\u2014"}
          </div>
        )}
      </div>
    </div>
  );
}



// ── Mini sidebar (profile page) ────────────────────────────────────────────────
interface MiniSidebarProps {
  mains: FolderNode[];
  displayName: string;
  jobTitle: string;
  onBack: () => void;
  onDashboard: () => void;
}

function MiniSidebar({ mains, displayName, jobTitle, onBack, onDashboard }: MiniSidebarProps) {
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
            {displayName.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium" style={{ color: slate200 }}>
              {displayName}
            </p>
            <p className="text-[10px]" style={{ color: slate500 }}>{jobTitle}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Profile Page ───────────────────────────────────────────────────────────────
interface ProfilePageProps {
  mains: FolderNode[];
  userEmail: string;
  onBack: () => void;
  onDashboard: () => void;
  onSignOut: () => void;
  onGlobalSignOut: () => void;
}

export default function ProfilePage({
  mains, userEmail, onBack, onDashboard, onSignOut, onGlobalSignOut,
}: ProfilePageProps) {
  const [profile,          setProfile]          = useState<UserProfile | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [fetchError,       setFetchError]       = useState<string | null>(null);
  const [editing,          setEditing]          = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [saveError,        setSaveError]        = useState<string | null>(null);
  const [form,             setForm]             = useState<EditForm>(initForm(null));
  const [formErrors,       setFormErrors]       = useState<FormErrors>({});
  const [showSignOutPopup, setShowSignOutPopup] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    getProfile(userEmail)
      .then((data) => { setProfile(data); setForm(initForm(data)); setLoading(false); })
      .catch(() => { setFetchError("Could not load profile."); setLoading(false); });
  }, [userEmail]);

  function handleEdit() {
    if (profile) setForm(initForm(profile));
    setSaveError(null);
    setFormErrors({});
    setEditing(true);
  }
  function handleCancel() {
    if (profile) setForm(initForm(profile));
    setSaveError(null);
    setFormErrors({});
    setEditing(false);
  }
  async function handleSave() {
    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setSaveError("Please fix the highlighted errors before saving.");
      return;
    }
    setFormErrors({});
    setSaving(true); setSaveError(null);
    try {
      const payload: ProfileUpdatePayload = {
        employee_id: form.employee_id || undefined,
        first_name: form.first_name || undefined, last_name: form.last_name || undefined,
        phone: form.phone || undefined,
        office_name: form.office_name || undefined,
        address_line1: form.address_line1 || undefined,
        address_line2: form.address_line2 || undefined,
        area_locality: form.area_locality || undefined,
        landmark: form.landmark || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        postal_code: form.postal_code || undefined,
        country: form.country || undefined,
        department: form.department || undefined, manager_name: form.manager_name || undefined,
        manager_email: form.manager_email || undefined,
        emergency_contact_name: form.ec_name || undefined,
        emergency_contact_relationship: form.ec_relationship || undefined,
        emergency_contact_phone: form.ec_phone || undefined,
        emergency_contact_email: form.ec_email || undefined,
      };
      const updated = await updateProfile(userEmail, payload);
      setProfile(updated); setForm(initForm(updated)); setEditing(false);
    } catch { setSaveError("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }
  function setField(key: keyof EditForm, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setFormErrors((prev) => { const e = { ...prev }; delete e[key]; return e; });
  }

  const displayName = profile?.display_name ?? userEmail;
  const initials = displayName.split(" ").map((n) => n[0]).filter(Boolean).join("").toUpperCase().slice(0, 2);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: slate100 }}>
      <MiniSidebar
        mains={mains}
        displayName={displayName}
        jobTitle={profile?.job_title ?? ""}
        onBack={onBack}
        onDashboard={onDashboard}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div
          className="flex flex-shrink-0 items-center justify-between border-b px-8 py-3"
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
            <span className="text-sm font-medium" style={{ color: ink }}>My Profile</span>
          </div>
          <button
            onClick={() => setShowSignOutPopup(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
            style={{ background: navy, color: white }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>

        </div>

        {/* Sign Out Modal */}
        {showSignOutPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setShowSignOutPopup(false)} />
            <div
              className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
              style={{ background: navy, border: "1px solid rgba(255,255,255,0.1)", color: slate200 }}
            >
              <div className="flex items-center gap-3 border-b pb-4 mb-5" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(20,184,166,0.1)", color: teal300 }}>
                  <LogOut className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: white }}>Sign Out</h3>
                  <p className="text-xs" style={{ color: slate400 }}>Choose your sign out method</p>
                </div>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => { setShowSignOutPopup(false); onSignOut(); }}
                  className="flex w-full items-center justify-between rounded-xl p-4 text-left transition hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="pr-4">
                    <div className="text-sm font-semibold" style={{ color: white }}>Sign Out (Current Account)</div>
                    <div className="text-xs mt-1" style={{ color: slate400 }}>Sign out of your active session on this device.</div>
                  </div>
                  <LogOut className="h-5 w-5 shrink-0" style={{ color: slate400 }} />
                </button>
                <button
                  onClick={() => { setShowSignOutPopup(false); onGlobalSignOut(); }}
                  className="flex w-full items-center justify-between rounded-xl p-4 text-left transition hover:bg-red-900/20"
                  style={{ background: "rgba(225,29,72,0.05)", border: "1px solid rgba(225,29,72,0.08)" }}
                >
                  <div className="pr-4">
                    <div className="text-sm font-semibold" style={{ color: "#fca5a5" }}>Sign Out All Accounts</div>
                    <div className="text-xs mt-1" style={{ color: slate400 }}>Completely sign out of all Microsoft SSO accounts.</div>
                  </div>
                  <ShieldOff className="h-5 w-5 shrink-0" style={{ color: slate500 }} />
                </button>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowSignOutPopup(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: slate200 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex h-40 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
            </div>
          )}
          {!loading && fetchError && (
            <div className="flex items-center gap-2 px-8 py-8 text-sm" style={{ color: danger }}>
              <AlertCircle className="h-4 w-4 shrink-0" />{fetchError}
            </div>
          )}

          {!loading && !fetchError && (
            <>
              {/* Hero */}
              <div
                className="relative overflow-hidden px-8 py-8"
                style={{ background: `linear-gradient(135deg, ${navy} 0%, ${navy2} 60%, ${steel} 100%)` }}
              >
                <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full" style={{ border: "1px solid rgba(94,234,212,0.15)" }} />
                <div className="pointer-events-none absolute -right-4 -top-4 h-44 w-44 rounded-full" style={{ border: "1px solid rgba(94,234,212,0.1)" }} />
                <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                  <div className="flex items-center gap-5">
                    <div className="relative flex-shrink-0">
                      <div className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold"
                        style={{ background: `radial-gradient(circle at 35% 30%, ${steel}, ${navy2} 75%)`, border: `3px solid ${teal300}`, color: white }}>
                        {initials}
                      </div>
                      <button className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full" style={{ background: teal, border: `2px solid ${navy}` }} title="Upload photo">
                        <Camera className="h-3.5 w-3.5" style={{ color: navy }} />
                      </button>
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight" style={{ color: white }}>{displayName}</h1>
                      {profile?.employee_id && <p className="mt-0.5 font-mono text-xs uppercase tracking-widest" style={{ color: slate400 }}>Employee ID {profile.employee_id}</p>}
                      <p className="mt-1 text-sm" style={{ color: teal300 }}>
                        {[profile?.job_title, profile?.company_name].filter(Boolean).join(" \u00b7 ") || profile?.email}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {profile?.department && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "#cfece7" }}><Building2 className="h-3 w-3" />{profile.department}</span>}
                        {(profile?.city || profile?.office_location) && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "#cfece7" }}><MapPin className="h-3 w-3" />{profile.city ? [profile.city, profile.state, profile.country].filter(Boolean).join(", ") : profile.office_location}</span>}
                        {yearsLabel(profile?.created_at) && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "#cfece7" }}><Calendar className="h-3 w-3" />{yearsLabel(profile?.created_at)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs font-bold tracking-widest md:self-auto" style={{ background: "rgba(20,184,166,0.15)", border: `1px solid ${teal}`, color: teal300 }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: teal, boxShadow: "0 0 0 3px rgba(20,184,166,0.25)" }} />ACTIVE
                  </div>
                </div>
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 gap-5 p-8 lg:grid-cols-3">

                {/* 1. PERSONAL INFO */}
                <div className="lg:col-span-2">
                <Card title="Personal Info" icon={<Hash className="h-3.5 w-3.5" />} eyebrow="Core record"
                  action={editing ? (
                    <div className="flex items-center gap-2">
                      <button onClick={handleCancel} disabled={saving} className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition hover:bg-slate-100" style={{ color: slate500 }}><X className="h-3.5 w-3.5" />Cancel</button>
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition hover:opacity-90" style={{ background: teal, color: white }}>
                        {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{saving ? "Saving\u2026" : "Save"}
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleEdit} className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition hover:bg-slate-100" style={{ color: slate500, border: `1px solid ${slate200}` }}><Edit3 className="h-3.5 w-3.5" />Edit Profile</button>
                  )}
                >
                  {saveError && <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(225,29,72,0.08)", color: danger }}><AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{saveError}</div>}
                  <div style={{ borderTop: `1px dashed ${slate200}` }}>
                    <FieldRow icon={<Hash className="h-3.5 w-3.5" />} label="Employee ID" value={profile?.employee_id} editing={editing} inputValue={form.employee_id} onInputChange={(v) => setField("employee_id", v)} placeholder="e.g. EMP-4471" mono error={formErrors.employee_id} />
                    <FieldRow icon={<Mail className="h-3.5 w-3.5" />} label="Work Email" value={profile?.email} readOnly />
                    <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="First Name" value={profile?.first_name} editing={editing} inputValue={form.first_name} onInputChange={(v) => setField("first_name", v)} placeholder="e.g. Anjali" error={formErrors.first_name} />
                    <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Last Name" value={profile?.last_name} editing={editing} inputValue={form.last_name} onInputChange={(v) => setField("last_name", v)} placeholder="e.g. Menon" error={formErrors.last_name} />
                    <FieldRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={profile?.phone} editing={editing} inputValue={form.phone} type="tel" onInputChange={(v) => setField("phone", v.replace(/[^\d+\-() ]/g, ""))} placeholder="e.g. +65 8123 4477" error={formErrors.phone} />
                    <FieldRow icon={<Building2 className="h-3.5 w-3.5" />} label="Department" value={profile?.department} editing={editing} inputValue={form.department} onInputChange={(v) => setField("department", v)} placeholder="e.g. Documentation & Compliance" error={formErrors.department} />
                    <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Reports To (Manager)" value={profile?.manager_name ? `${profile.manager_name}${profile.manager_email ? ` \u2014 ${profile.manager_email}` : ""}` : null} editing={editing} inputValue={form.manager_name} onInputChange={(v) => setField("manager_name", v)} placeholder="e.g. Rakesh Iyer (Fleet Manager)" error={formErrors.manager_name} />
                    {editing && <FieldRow icon={<Mail className="h-3.5 w-3.5" />} label="Manager Email" value={profile?.manager_email} editing={editing} inputValue={form.manager_email} onInputChange={(v) => setField("manager_email", v)} placeholder="e.g. r.iyer@company.com" error={formErrors.manager_email} />}
                    <FieldRow icon={<Clock className="h-3.5 w-3.5" />} label="Last Login" value={fmtDate(profile?.last_login)} readOnly mono />
                  </div>
                </Card>
                </div>

                {/* 2. EMERGENCY CONTACT */}
                <Card title="Emergency Contact" icon={<UserCheck className="h-3.5 w-3.5" />}>
                  <div style={{ borderTop: `1px dashed ${slate200}` }}>
                    <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Full Name"
                      value={profile?.emergency_contact?.name ? `${profile.emergency_contact.name}${profile.emergency_contact.relationship_type ? ` \u2014 ${profile.emergency_contact.relationship_type}` : ""}` : null}
                      editing={editing} inputValue={form.ec_name} onInputChange={(v) => setField("ec_name", v)} placeholder="e.g. Vikram Menon" error={formErrors.ec_name} />
                    {editing && <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Relationship" value={profile?.emergency_contact?.relationship_type} editing={editing} inputValue={form.ec_relationship} onInputChange={(v) => setField("ec_relationship", v)} placeholder="e.g. Spouse, Parent, Sibling" error={formErrors.ec_relationship} />}
                    <FieldRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={profile?.emergency_contact?.phone} editing={editing} inputValue={form.ec_phone} onInputChange={(v) => setField("ec_phone", v)} placeholder="e.g. +65 9027 6612" error={formErrors.ec_phone} />
                    <FieldRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={profile?.emergency_contact?.email} editing={editing} inputValue={form.ec_email} onInputChange={(v) => setField("ec_email", v)} placeholder="e.g. contact@gmail.com" asLink={!editing} error={formErrors.ec_email} />
                  </div>
                  {editing && <p className="mt-3 text-xs" style={{ color: slate400 }}>Emergency contact is saved together with account fields above.</p>}
                  {!editing && !profile?.emergency_contact?.name && <p className="mt-3 text-xs" style={{ color: slate400 }}>No emergency contact on record. Click <strong>Edit Profile</strong> to add one.</p>}
                </Card>

                {/* 3. ADDRESS */}
                <div className="lg:col-span-2">
                  <Card title="Address" icon={<MapPin className="h-3.5 w-3.5" />}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                      {([
                        ["Office Name (Optional)", "office_name",   profile?.office_name,   "e.g. HQ Tower, Level 5"],
                        ["Address Line 1",          "address_line1", profile?.address_line1,  "e.g. 21 Marina Boulevard"],
                        ["Address Line 2",          "address_line2", profile?.address_line2,  "e.g. #14-02, Marina Bay Financial Centre"],
                        ["Area / Locality",         "area_locality", profile?.area_locality,  "e.g. Marina Bay"],
                        ["Landmark",                "landmark",      profile?.landmark,       "e.g. Near Marina Bay Sands"],
                        ["City",                    "city",          profile?.city,           "e.g. Singapore"],
                        ["State",                   "state",         profile?.state,          "e.g. Central Region"],
                        ["Postal Code",             "postal_code",   profile?.postal_code,    "e.g. 018982"],
                        ["Country",                 "country",       profile?.country,        "e.g. Singapore"],
                      ] as [string, keyof EditForm, string | null | undefined, string][]).map(([label, field, val, ph]) => (
                        <div key={field} className="py-2.5" style={{ borderBottom: `1px dashed ${slate200}` }}>
                          <div className="text-[12px] font-bold uppercase tracking-wider mb-1" style={{ color: slate500 }}>{label}</div>
                          {editing ? (
                            <>
                              <input
                                value={form[field] as string}
                                onChange={e => setField(field, e.target.value)}
                                placeholder={ph}
                                className="w-full rounded-md px-2.5 py-1.5 text-sm outline-none placeholder:text-slate-400"
                                style={{ background: slate100, border: `1px solid ${formErrors[field] ? danger : slate200}`, color: ink }}
                              />
                              {formErrors[field] && (
                                <div className="mt-1 flex items-center gap-1 text-xs" style={{ color: danger }}>
                                  <AlertCircle className="h-3 w-3 flex-shrink-0" />{formErrors[field]}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-sm font-medium" style={{ color: val ? ink : slate400 }}>{val || "\u2014"}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                {/* 4. SECURITY */}
                <Card title="Security" icon={<Shield className="h-3.5 w-3.5" />}>
                  <div className="flex items-center gap-3 py-3" style={{ borderBottom: `1px dashed ${slate200}` }}>
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(20,184,166,0.12)", color: teal }}><RefreshCw className="h-4 w-4" /></div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: ink }}>Password last changed</div>
                      <div className="font-mono text-xs" style={{ color: slate500 }}>{profile?.password_changed_at ? `${daysAgo(profile.password_changed_at)} \u00b7 rotation policy: 180 days` : "\u2014"}</div>
                    </div>
                  </div>
                  <div className="py-3" style={{ borderBottom: `1px dashed ${slate200}` }}>
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: slate500 }}>Active Sessions</div>
                    <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: slate100, border: `1px solid ${slate200}` }}>
                      <div className="flex items-center gap-2"><Monitor className="h-4 w-4" style={{ color: slate400 }} /><div><div className="text-xs font-semibold" style={{ color: ink }}>Chrome \u00b7 Windows \u2014 Singapore</div><div className="font-mono text-[11px]" style={{ color: slate500 }}>Current device \u00b7 Started today</div></div></div>
                      <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: "rgba(20,184,166,0.12)", color: teal }}>This Device</span>
                    </div>
                    <div className="mt-3 mb-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: slate500 }}>Connected Devices (Inactive)</div>
                    <div className="space-y-2">
                      {[
                        { mobile: true,  label: "Mobile App \u00b7 iPhone",  region: "Singapore", last: "2 days ago" },
                        { mobile: false, label: "Firefox \u00b7 macOS",       region: "Singapore", last: "5 days ago" },
                      ].map((s, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: slate100, border: `1px solid ${slate200}`, opacity: 0.72 }}>
                          <div className="flex items-center gap-2">
                            {s.mobile
                              ? <Smartphone className="h-4 w-4" style={{ color: slate400 }} />
                              : <Monitor    className="h-4 w-4" style={{ color: slate400 }} />}
                            <div>
                              <div className="text-xs font-semibold" style={{ color: ink }}>{s.label} \u2014 {s.region}</div>
                              <div className="font-mono text-[11px]" style={{ color: slate500 }}>Last active: {s.last}</div>
                            </div>
                          </div>
                          <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: "rgba(100,116,139,0.12)", color: slate500 }}>Inactive</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>

                {/* 5. ACTIVITY LOG */}
                <div className="lg:col-span-3">
                  <Card title="Recent Activity" icon={<Activity className="h-3.5 w-3.5" />} eyebrow="Last 10 events">
                    {(profile?.recent_activity ?? []).length === 0 ? (
                      <p className="py-2 text-sm" style={{ color: slate400 }}>No recent activity on record.</p>
                    ) : (
                      <div className="relative pl-6 pt-2">
                        <div className="pointer-events-none absolute bottom-2 left-[9px] top-4" style={{ width: 1.5, background: `repeating-linear-gradient(to bottom, ${slate200} 0 4px, transparent 4px 8px)` }} />
                        {profile!.recent_activity.map((entry, i) => (
                          <div key={i} className="relative mb-5 last:mb-0">
                            <div className="absolute -left-6 top-1 rounded-full" style={{ width: 11, height: 11, background: white, border: `2px solid ${teal}` }} />
                            <div className="mb-0.5 font-mono text-[11px]" style={{ color: slate400 }}>{fmtDate(entry.created_at)}</div>
                            <div className="text-sm" style={{ color: ink }}>{entry.detail || entry.action}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
