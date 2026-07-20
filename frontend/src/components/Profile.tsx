import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mail, Phone, Clock, LogOut, Camera,
  MapPin, Hash, Calendar, Users, ArrowLeft,
  ShieldOff, Edit3, Save, X,
  Building2, Activity, RefreshCw, UserCheck,
  AlertCircle, Upload, FolderOpen, Trash2, FolderPlus, LogIn,
  Settings, Shield, Monitor, Smartphone, Tablet, Globe,
  XCircle, Timer, LogIn as LoginIcon, Briefcase, Key, Lock,
} from "lucide-react";

import type { FolderNode, UserProfile, ProfileUpdatePayload, SessionInfo, SessionAuditEntry } from "../api";
import { getProfile, updateProfile, listSessions, listSessionAudit, revokeSession } from "../api";


// ── palette ───────────────────────────────────────────────────────────────────
const danger   = "#e11d48";
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

function fmtOnlyDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
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

// ── edit form type ─────────────────────────────────────────────────────────────
interface EditForm {
  employee_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  office_name: string;
  office_location: string;
  department: string;
  manager_name: string;
  manager_email: string;
  date_of_joining: string;
}

function initForm(p: UserProfile | null): EditForm {
  return {
    employee_id:     p?.employee_id     ?? "",
    first_name:      p?.first_name      ?? "",
    last_name:       p?.last_name       ?? "",
    phone:           p?.phone           ?? "",
    office_name:     p?.office_name     ?? "",
    office_location: p?.office_location ?? "",
    department:      p?.department      ?? "",
    manager_name:    p?.manager_name    ?? "",
    manager_email:   p?.manager_email   ?? "",
    date_of_joining: p?.date_of_joining  ?? "",
  };
}

// ── Validation ────────────────────────────────────────────────────────────────
type FormErrors = Partial<Record<keyof EditForm, string>>;

function validateForm(f: EditForm): FormErrors {
  const err: FormErrors = {};
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^[+\d()\-\s]*$/;
  const alphaSpaceRe = /^[a-zA-Z\s'\-]*$/;
  const empIdRe = /^[a-zA-Z0-9\s\-\/]*$/;
  const addressRe = /^[a-zA-Z0-9\s\-\/\.,#]*$/;

  const fieldsConfig: Array<{
    key: keyof EditForm;
    label: string;
    regex?: RegExp;
    regexError?: string;
  }> = [
    { key: "first_name", label: "First Name", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "last_name", label: "Last Name", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "phone", label: "Phone", regex: phoneRe, regexError: "Only digits, +, \u2013, ( ), and spaces are allowed" },
    { key: "employee_id", label: "Employee ID", regex: empIdRe, regexError: "Only letters, numbers, spaces, hyphens, and slashes are allowed" },
    { key: "department", label: "Department", regex: /^[a-zA-Z\s'\-&]*$/, regexError: "Only letters, spaces, ampersands, hyphens, and apostrophes are allowed" },
    { key: "manager_name", label: "Manager Name", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "manager_email", label: "Manager Email", regex: emailRe, regexError: "Enter a valid email address (e.g. name@company.com)" },
    { key: "office_name", label: "Office Name", regex: addressRe, regexError: "Invalid characters" },
    { key: "office_location", label: "Office Location", regex: addressRe, regexError: "Invalid characters" }
  ];

  for (const field of fieldsConfig) {
    const val = f[field.key] || "";
    if (val.length > 60) {
      err[field.key] = `${field.label} must be 60 characters or fewer`;
      continue;
    }
    if (val && field.regex && !field.regex.test(val)) {
      err[field.key] = field.regexError || "Invalid format";
    }
  }

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
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div
        className="flex items-center justify-between pb-4 mb-1"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <h3
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-lg"
            style={{ background: "color-mix(in oklab, var(--color-primary) 12%, transparent)", color: "var(--color-primary)" }}
          >
            {icon}
          </span>
          {title}
        </h3>
        <div className="flex items-center gap-3">
          {eyebrow && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-muted)" }}
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
      style={{ borderBottom: "1px dashed var(--color-border)" }}
    >
      <span
        className="mt-0.5 flex-shrink-0 text-center"
        style={{ color: "var(--color-muted)", width: 16 }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="text-[12px] font-bold uppercase tracking-wider mb-1"
          style={{ color: "var(--color-muted)" }}
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
              className="w-full rounded-md px-2.5 py-1.5 text-sm outline-none placeholder:text-subtle"
              style={{
                background: "var(--color-surface2)",
                border: `1px solid var(--color-${error ? "error" : "border"})`,
                color: "var(--color-fg)",
                fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined,
              }}
            />
            {error && (
              <div className="mt-1 flex items-center gap-1 text-xs" style={{ color: "var(--color-error)" }}>
                <AlertCircle className="h-3 w-3 flex-shrink-0" />{error}
              </div>
            )}
          </>
        ) : (
          <div
            className="text-sm font-medium break-words"
            style={{
              color: asLink ? "var(--color-primary)" : value ? "var(--color-fg)" : "var(--color-muted)",
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




// ── Profile Page ───────────────────────────────────────────────────────────────
interface ProfilePageProps {
  userEmail: string;
  onBack: () => void;
  onSignOut: () => void;
  onGlobalSignOut: () => void;
  onSettings?: () => void;
  onPhotoUpdate?: (photo: string | null) => void;
  // kept for API compat — no longer used for sidebar rendering
  mains?: FolderNode[];
  onDashboard?: () => void;
}

export default function ProfilePage({
  userEmail, onBack, onSignOut, onGlobalSignOut, onSettings, onPhotoUpdate,
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
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Session security state
  const [sessions,      setSessions]      = useState<SessionInfo[]>([]);
  const [auditLog,      setAuditLog]      = useState<SessionAuditEntry[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId,    setRevokingId]    = useState<string | null>(null);
  const currentSessionId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('session_id') : null;

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const [s, a] = await Promise.all([listSessions(), listSessionAudit(100)]);
      setSessions(s);
      setAuditLog(a);
    } catch { /* non-critical */ }
    finally { setSessionsLoading(false); }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);


  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 10MB
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_SIZE) {
      setPhotoError("Photo size exceeds 10 MB limit");
      return;
    }
    setPhotoError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        setSaving(true);
        const updated = await updateProfile(userEmail, { photo_base64: base64 });
        setProfile(updated);
        setForm(initForm(updated));
        if (onPhotoUpdate) {
          onPhotoUpdate(updated.photo_base64 || null);
        }
      } catch {
        setPhotoError("Failed to update profile photo.");
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  function getBase64SizeLabel(base64String: string | null): string {
    if (!base64String) return "";
    const stringLength = base64String.length - (base64String.indexOf(",") + 1);
    const sizeInBytes = Math.ceil((stringLength * 3) / 4);
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

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
        office_location: form.office_location || undefined,
        department: form.department || undefined, manager_name: form.manager_name || undefined,
        manager_email: form.manager_email || undefined,
        date_of_joining: form.date_of_joining || undefined,
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

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-bg">
        {/* Top bar */}
        <div
          className="flex flex-shrink-0 items-center justify-between border-b dms-page-px py-3"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition hover:bg-surface-hover cursor-pointer"
              style={{ color: "var(--color-muted)" }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <span style={{ color: "var(--color-border)" }}>/</span>
            <span className="text-sm font-medium" style={{ color: "var(--color-fg)" }}>My Profile</span>
          </div>
          <div className="flex items-center gap-3">
            {editing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border border-border bg-surface hover:bg-surface-hover transition cursor-pointer"
                  style={{ color: "var(--color-muted)" }}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-fg shadow-sm transition hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  style={{ background: "var(--color-primary)" }}
                >
                  {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={onSettings}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border border-border bg-surface hover:bg-surface-hover transition cursor-pointer"
                  style={{ color: "var(--color-muted)" }}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </button>
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border border-border bg-surface hover:bg-surface-hover transition cursor-pointer"
                  style={{ color: "var(--color-muted)" }}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Profile
                </button>
              </>
            )}
            <button
              onClick={() => setShowSignOutPopup(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-fg shadow-sm transition hover:scale-[1.01] active:scale-[0.99] cursor-pointer animate-fade-in"
              style={{ background: "var(--color-primary)" }}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>

        </div>

        {/* Sign Out Modal */}
        {showSignOutPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setShowSignOutPopup(false)} />
            <div
              className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-fg)" }}
            >
              <div className="flex items-center gap-3 border-b pb-4 mb-5" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "color-mix(in oklab, var(--color-primary) 12%, transparent)", color: "var(--color-primary)" }}>
                  <LogOut className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: "var(--color-fg)" }}>Sign Out</h3>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Choose your sign out method</p>
                </div>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => { setShowSignOutPopup(false); onSignOut(); }}
                  className="flex w-full items-center justify-between rounded-xl p-4 text-left transition hover:bg-surface-hover cursor-pointer"
                  style={{ background: "var(--color-surface2)", border: "1px solid var(--color-border)" }}
                >
                  <div className="pr-4">
                    <div className="text-sm font-semibold" style={{ color: "var(--color-fg)" }}>Sign Out (Current Account)</div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>Sign out of your active session on this device.</div>
                  </div>
                  <LogOut className="h-5 w-5 shrink-0" style={{ color: "var(--color-muted)" }} />
                </button>
                <button
                  onClick={() => { setShowSignOutPopup(false); onGlobalSignOut(); }}
                  className="flex w-full items-center justify-between rounded-xl p-4 text-left transition hover:bg-error-bg/80 cursor-pointer"
                  style={{ background: "var(--color-error-bg)", border: "1px solid var(--color-error)" }}
                >
                  <div className="pr-4">
                    <div className="text-sm font-semibold" style={{ color: "var(--color-error)" }}>Sign Out All Accounts</div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>Completely sign out of all Microsoft SSO accounts.</div>
                  </div>
                  <ShieldOff className="h-5 w-5 shrink-0" style={{ color: "var(--color-error)" }} />
                </button>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowSignOutPopup(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition hover:bg-surface-hover cursor-pointer"
                  style={{ background: "var(--color-surface2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
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
            <div className="flex items-center gap-2 dms-page-px py-8 text-sm" style={{ color: danger }}>
              <AlertCircle className="h-4 w-4 shrink-0" />{fetchError}
            </div>
          )}

          {!loading && !fetchError && (
            <>
              {/* Hero */}
              <div
                className="relative overflow-hidden dms-page-px py-6 sm:py-8"
                style={{ background: "linear-gradient(135deg, #1a1a4e 0%, #0d0d3a 60%, #2a0a0a 100%)" }}
              >
                {/* Subtle red glow rings */}
                <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full" style={{ borderColor: "rgba(212,43,43,0.20)", borderStyle: "solid", borderWidth: 1 }} />
                <div className="pointer-events-none absolute -right-4 -top-4 h-44 w-44 rounded-full" style={{ borderColor: "rgba(212,43,43,0.12)", borderStyle: "solid", borderWidth: 1 }} />
                {/* Nissen logo watermark */}
                <img src="/nissen-logo.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-4 right-6 h-28 w-auto opacity-10 select-none" />
                <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                  <div className="flex items-center gap-5">
                    <div className="relative flex-shrink-0">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoChange}
                      />
                      <div 
                        onClick={() => {
                          if (profile?.photo_base64) setShowFullPhoto(true);
                        }}
                        className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold overflow-hidden cursor-pointer"
                        style={{ border: "3px solid #D42B2B", background: profile?.photo_base64 ? undefined : "rgba(255,255,255,0.08)" }}
                        title={profile?.photo_base64 ? "Click to view full photo" : undefined}
                      >
                        {profile?.photo_base64 ? (
                          <img src={profile.photo_base64} alt="Profile" className="h-full w-full object-cover" />
                        ) : (
                          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full object-cover">
                            <circle cx="50" cy="50" r="50" fill="rgba(255,255,255,0.12)" />
                            <circle cx="50" cy="45" r="18" fill="rgba(255,255,255,0.35)" />
                            <path d="M15 88C15 70 30 65 50 65C70 65 85 70 85 88" fill="rgba(255,255,255,0.35)" />
                          </svg>
                        )}
                      </div>
                      <button
                        onClick={handlePhotoClick}
                        className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-105 cursor-pointer"
                        style={{ background: "#D42B2B", border: "2px solid #1a1a4e" }}
                        title="Upload photo"
                      >
                        <Camera className="h-3.5 w-3.5" style={{ color: "white" }} />
                      </button>
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight" style={{ color: "white" }}>{displayName}</h1>
                      {profile?.employee_id && <p className="mt-0.5 font-mono text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>Employee ID {profile.employee_id}</p>}
                      <p className="mt-1 text-sm font-medium" style={{ color: "#f87171" }}>
                        {[profile?.job_title, profile?.company_name].filter(Boolean).join(" \u00b7 ") || profile?.email}
                      </p>
                      {/* Photo Size / Errors */}
                      <div className="mt-1 flex flex-col gap-0.5">
                        {profile?.photo_base64 && (
                          <p className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.50)" }}>
                            Photo size: {getBase64SizeLabel(profile.photo_base64)} (Max 10 MB)
                          </p>
                        )}
                        {photoError && (
                          <p className="text-[11px] font-medium" style={{ color: "#fca5a5" }}>
                            {photoError}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {profile?.department && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.10)", color: "white" }}><Building2 className="h-3 w-3" />{profile.department}</span>}
                        {profile?.office_location && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.10)", color: "white" }}><MapPin className="h-3 w-3" />{profile.office_location}</span>}
                        {profile?.date_of_joining && yearsLabel(profile.date_of_joining) && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.10)", color: "white" }}><Calendar className="h-3 w-3" />{yearsLabel(profile.date_of_joining)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs font-bold tracking-widest md:self-auto" style={{ background: "rgba(212,43,43,0.20)", border: "1px solid rgba(212,43,43,0.35)", color: "#fca5a5" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: "#D42B2B", boxShadow: "0 0 0 4px rgba(212,43,43,0.25)" }} />ACTIVE
                  </div>
                </div>
              </div>

              {/* Cards grid — 1 col on mobile, 3 on large desktop */}
              <div className="grid grid-cols-1 gap-4 dms-page-px dms-page-py lg:grid-cols-3">

                {/* Left Column (spans 2 columns on desktop) */}
                <div className="lg:col-span-2 flex flex-col gap-5">
                  {/* WORK INFO */}
                  <Card title="Work Info" icon={<Building2 className="h-3.5 w-3.5" />}>
                    <div style={{ borderTop: "1px dashed var(--color-border)" }}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                        <FieldRow icon={<Hash className="h-3.5 w-3.5" />} label="Employee ID" value={profile?.employee_id} editing={editing} inputValue={form.employee_id} onInputChange={(v) => setField("employee_id", v)} placeholder="e.g. EMP-4471" mono error={formErrors.employee_id} />
                        <FieldRow icon={<Building2 className="h-3.5 w-3.5" />} label="Department" value={profile?.department} editing={editing} inputValue={form.department} onInputChange={(v) => setField("department", v)} placeholder="e.g. Documentation & Compliance" error={formErrors.department} />
                        <FieldRow icon={<Building2 className="h-3.5 w-3.5" />} label="Office Name" value={profile?.office_name} editing={editing} inputValue={form.office_name} onInputChange={(v) => setField("office_name", v)} placeholder="e.g. Nissen HQ" error={formErrors.office_name} />
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Office Location" value={profile?.office_location} editing={editing} inputValue={form.office_location} onInputChange={(v) => setField("office_location", v)} placeholder="e.g. Singapore" error={formErrors.office_location} />
                        <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Reports To (Manager)" value={profile?.manager_name ? `${profile.manager_name}${profile.manager_email ? ` \u2014 ${profile.manager_email}` : ""}` : null} editing={editing} inputValue={form.manager_name} onInputChange={(v) => setField("manager_name", v)} placeholder="e.g. Rakesh Iyer (Fleet Manager)" error={formErrors.manager_name} />
                        {editing && <FieldRow icon={<Mail className="h-3.5 w-3.5" />} label="Manager Email" value={profile?.manager_email} editing={editing} inputValue={form.manager_email} onInputChange={(v) => setField("manager_email", v)} placeholder="e.g. r.iyer@company.com" error={formErrors.manager_email} />}
                        <FieldRow icon={<Calendar className="h-3.5 w-3.5" />} label="Date of Joining" value={profile?.date_of_joining ? fmtOnlyDate(profile.date_of_joining) : null} editing={editing} inputValue={form.date_of_joining} type="date" onInputChange={(v) => setField("date_of_joining", v)} placeholder="Select date" error={formErrors.date_of_joining} />
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Right Column (spans 1 column on desktop) */}
                <div className="lg:col-span-1 flex flex-col gap-5">
                  {/* 1. PERSONAL INFO */}
                  <Card title="Personal Info" icon={<Users className="h-3.5 w-3.5" />} eyebrow="Core record">
                    {saveError && <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-error-bg text-error border border-error/20"><AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{saveError}</div>}
                    
                    {/* Account detail list */}
                    <div style={{ borderTop: "1px dashed var(--color-border)" }}>
                      <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="First Name" value={profile?.first_name} editing={editing} inputValue={form.first_name} onInputChange={(v) => setField("first_name", v)} placeholder="e.g. Anjali" error={formErrors.first_name} />
                      <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Last Name" value={profile?.last_name} editing={editing} inputValue={form.last_name} onInputChange={(v) => setField("last_name", v)} placeholder="e.g. Menon" error={formErrors.last_name} />
                      <FieldRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={profile?.email} readOnly asLink />
                      <FieldRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Job Title" value={profile?.job_title} readOnly />
                      <FieldRow icon={<Building2 className="h-3.5 w-3.5" />} label="Company" value={profile?.company_name} readOnly />
                      <FieldRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={profile?.phone} editing={editing} inputValue={form.phone} type="tel" onInputChange={(v) => setField("phone", v.replace(/[^\d+\-() ]/g, ""))} placeholder="e.g. +65 8123 4477" error={formErrors.phone} />
                      <FieldRow icon={<Clock className="h-3.5 w-3.5" />} label="Last Login" value={fmtDate(profile?.last_login)} readOnly mono />
                      <FieldRow icon={<Calendar className="h-3.5 w-3.5" />} label="Account Created" value={fmtOnlyDate(profile?.created_at)} readOnly mono />
                    </div>
                  </Card>

                  {/* 2. ACCOUNT & SECURITY */}
                  <Card title="Account & Security" icon={<Shield className="h-3.5 w-3.5" />} eyebrow="Identity">
                    <div style={{ borderTop: "1px dashed var(--color-border)" }}>
                      <FieldRow
                        icon={<Lock className="h-3.5 w-3.5" />}
                        label="Two-Factor Auth"
                        value={profile?.two_factor_enabled ? "Enabled" : "Disabled"}
                        readOnly
                      />
                      <FieldRow
                        icon={<Key className="h-3.5 w-3.5" />}
                        label="Password Last Changed"
                        value={fmtDate(profile?.password_changed_at)}
                        readOnly
                        mono
                      />
                      {profile?.azure_oid && (
                        <FieldRow
                          icon={<Hash className="h-3.5 w-3.5" />}
                          label="Azure Object ID"
                          value={profile.azure_oid}
                          readOnly
                          mono
                        />
                      )}
                      {profile?.tenant_id && (
                        <FieldRow
                          icon={<Hash className="h-3.5 w-3.5" />}
                          label="Tenant ID"
                          value={profile.tenant_id}
                          readOnly
                          mono
                        />
                      )}
                    </div>
                  </Card>
                </div>

                {/* 4. ACTIVITY LOG */}
                <div className="lg:col-span-3">
                  <Card title="Recent Activity" icon={<Activity className="h-3.5 w-3.5" />} eyebrow="Last 10 events">
                    {(profile?.recent_activity ?? []).length === 0 ? (
                      <p className="py-2 text-sm" style={{ color: "var(--color-muted)" }}>No recent activity on record.</p>
                    ) : (
                      <div className="relative pl-6 pt-2">
                        <div className="pointer-events-none absolute bottom-2 left-[9px] top-4" style={{ width: 1.5, background: "repeating-linear-gradient(to bottom, var(--color-border) 0 4px, transparent 4px 8px)" }} />
                        {profile!.recent_activity.map((entry: { action: string; detail: string | null; created_at: string }, i: number) => {
                          const actionLabel: Record<string, string> = {
                            login: "Logged in",
                            logout: "Signed out",
                            profile_update: "Profile updated",
                            file_upload: "File uploaded",
                            delete_file: "File deleted",
                            create_folder: "Folder created",
                            delete_folder: "Folder deleted",
                            archive_folder: "Folder archived",
                            restore_folder: "Folder restored",
                          };

                          const actionIcon: Record<string, React.ReactNode> = {
                            login:          <LogIn  className="h-3 w-3" />,
                            logout:         <LogOut className="h-3 w-3" />,
                            profile_update: <UserCheck className="h-3 w-3" />,
                            file_upload:    <Upload className="h-3 w-3" />,
                            delete_file:    <Trash2 className="h-3 w-3" />,
                            create_folder:  <FolderPlus className="h-3 w-3" />,
                            delete_folder:  <Trash2 className="h-3 w-3" />,
                          };

                          // Parse pipe-separated upload details: "Uploaded: file.pdf|Main/Sub/Leaf"
                          let displayName: string;
                          let folderPath: string | null = null;

                          if (entry.action === "file_upload" && entry.detail) {
                            const pipeIdx = entry.detail.indexOf("|");
                            if (pipeIdx !== -1) {
                              // Has embedded folder path
                              displayName = entry.detail.slice(0, pipeIdx).trim();
                              const rawPath = entry.detail.slice(pipeIdx + 1).trim();
                              // Normalize separators and build breadcrumb
                              folderPath = rawPath.replace(/\/+/g, " / ");
                            } else {
                              displayName = entry.detail;
                            }
                          } else {
                            displayName = entry.detail || actionLabel[entry.action] || entry.action;
                          }

                          // Build folder breadcrumb segments for highlight
                          const pathSegments = folderPath
                            ? folderPath.split(" / ").map(s => s.trim()).filter(Boolean)
                            : [];

                          return (
                            <div key={i} className="relative mb-5 last:mb-0 text-fg">
                              <div className="absolute -left-6 top-1 rounded-full flex items-center justify-center"
                                style={{ width: 18, height: 18, background: entry.action === "file_upload" ? "var(--color-primary)" : "var(--color-surface)", border: "2px solid var(--color-primary)" }}>
                                <span style={{ color: entry.action === "file_upload" ? "var(--color-primary-fg)" : "var(--color-primary)" }}>
                                  {actionIcon[entry.action] ?? <Activity className="h-3 w-3" />}
                                </span>
                              </div>
                              <div className="mb-0.5 font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>{fmtDate(entry.created_at)}</div>

                              {folderPath ? (
                                /* Rich upload entry with file + path */
                                <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface2)" }}>
                                  <div className="flex items-start gap-2">
                                    <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-primary)" }} />
                                    <div className="min-w-0 flex-1">
                                      {/* File name */}
                                      <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--color-fg)" }}>
                                        {displayName.replace(/^Uploaded:\s*/i, "")}
                                      </p>
                                      {/* Folder path breadcrumb */}
                                      <div className="mt-1 flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
                                        <FolderOpen className="h-3 w-3 shrink-0" style={{ color: "var(--color-muted)" }} />
                                        {pathSegments.map((seg, si) => (
                                          <span key={si} className="flex items-center gap-x-0.5">
                                            {si > 0 && (
                                              <span className="text-[10px]" style={{ color: "var(--color-muted)" }}>›</span>
                                            )}
                                            <span
                                              className="rounded px-1 py-0.5 text-[11px] font-medium leading-none"
                                              style={{
                                                background: si === pathSegments.length - 1 ? "var(--color-primary-hover)" : "transparent",
                                                color: si === pathSegments.length - 1 ? "var(--color-primary-fg)" : "var(--color-muted)",
                                              }}
                                            >
                                              {seg}
                                            </span>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* Simple entry for non-upload actions */
                                <div className="text-sm" style={{ color: ink }}>{displayName}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </div>

              </div>

              {/* ── Session Security Dashboard ──────────────────────────── */}
              <div className="dms-page-px pb-8">
                <SessionSecurityCard
                  sessions={sessions}
                  auditLog={auditLog}
                  loading={sessionsLoading}
                  currentSessionId={currentSessionId}
                  revokingId={revokingId}
                  onRevoke={async (sid) => {
                    setRevokingId(sid);
                    try { await revokeSession(sid); await loadSessions(); } catch { /* ignore */ }
                    finally { setRevokingId(null); }
                  }}
                  onRefresh={loadSessions}
                />
              </div>
            </>
          )}
        </div>

        {/* Full Photo Modal */}
        {showFullPhoto && profile?.photo_base64 && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md cursor-pointer"
            onClick={() => setShowFullPhoto(false)}
          >
            <div 
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={profile.photo_base64} 
                alt="Full Profile" 
                className="max-h-[80vh] max-w-[80vw] rounded-xl object-contain" 
              />
              <div className="mt-3 flex items-center justify-between px-2">
                <span className="text-xs text-white/60 font-medium">{displayName} &middot; Profile Photo</span>
                <button 
                  onClick={() => setShowFullPhoto(false)}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

    </main>
  );
}

// ── SessionSecurityCard ───────────────────────────────────────────────────────

interface SessionSecurityCardProps {
  sessions: SessionInfo[];
  auditLog: SessionAuditEntry[];
  loading: boolean;
  currentSessionId: string | null;
  revokingId: string | null;
  onRevoke: (sessionId: string) => Promise<void>;
  onRefresh: () => void;
}

function BrowserIcon({ browser }: { browser: string | null }) {
  const b = (browser || "").toLowerCase();
  if (b.includes("chrome"))   return <Globe className="h-4 w-4" style={{ color: "#34a853" }} />;
  if (b.includes("edge"))     return <Globe className="h-4 w-4" style={{ color: "#0078d4" }} />;
  if (b.includes("firefox"))  return <Globe className="h-4 w-4" style={{ color: "#ff6611" }} />;
  if (b.includes("safari"))   return <Globe className="h-4 w-4" style={{ color: "#06b6d4" }} />;
  if (b.includes("opera"))    return <Globe className="h-4 w-4" style={{ color: "#ff1b2d" }} />;
  if (b.includes("ie") || b.includes("internet explorer")) return <Globe className="h-4 w-4" style={{ color: "#1EBBEE" }} />;
  return <Globe className="h-4 w-4" style={{ color: "var(--color-muted)" }} />;
}

function DeviceIcon({ deviceType }: { deviceType: string | null }) {
  if (deviceType === "Mobile")  return <Smartphone className="h-4 w-4" />;
  if (deviceType === "Tablet")  return <Tablet className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

const EVENT_LABEL: Record<string, string> = {
  session_created:          "Login",
  session_logged_out:       "Signed Out",
  session_expired:          "Session Expired",
  session_revoked:          "Session Revoked",
  invalid_session_attempt:  "Invalid Attempt",
  auth_failure:             "Auth Failure",
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Active:      { bg: "rgba(20,184,166,0.15)",  fg: "#14b8a6" },
  "Logged Out":{ bg: "rgba(100,116,139,0.15)", fg: "#94a3b8" },
  Expired:     { bg: "rgba(245,158,11,0.15)",  fg: "#f59e0b" },
  Revoked:     { bg: "rgba(239,68,68,0.15)",   fg: "#ef4444" },
  Failed:      { bg: "rgba(239,68,68,0.15)",   fg: "#ef4444" },
};

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

function SessionSecurityCard({
  sessions, auditLog, loading, currentSessionId, revokingId, onRevoke, onRefresh,
}: SessionSecurityCardProps) {
  const activeSessions  = sessions.filter(s => s.status === "Active");
  const pastSessions    = sessions.filter(s => s.status !== "Active");

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-fg)" }}>
          <span
            className="flex h-6 w-6 items-center justify-center rounded-lg"
            style={{ background: "color-mix(in oklab, var(--color-primary) 12%, transparent)", color: "var(--color-primary)" }}
          >
            <Shield className="h-3.5 w-3.5" />
          </span>
          Session Security
          <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: "color-mix(in oklab, var(--color-primary) 12%, transparent)", color: "var(--color-primary)" }}
          >
            {activeSessions.length} ACTIVE
          </span>
        </h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border border-border transition hover:bg-surface-hover cursor-pointer"
          style={{ color: "var(--color-muted)" }}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="p-6 space-y-8">

        {/* ── Active Sessions ── */}
        <section>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
            Active Sessions
          </p>
          {activeSessions.length === 0 && !loading && (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>No active sessions found.</p>
          )}
          <div className="space-y-3">
            {activeSessions.map((s) => {
              const isCurrent = s.session_id === currentSessionId;
              return (
                <div
                  key={s.session_id}
                  className="flex items-start justify-between gap-4 rounded-xl p-4"
                  style={{
                    background: isCurrent ? "color-mix(in oklab, var(--color-primary) 8%, transparent)" : "var(--color-surface2)",
                    border: `1px solid ${isCurrent ? "var(--color-primary)" : "var(--color-border)"}`,
                  }}
                >
                  {/* Left: icon + info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                    >
                      <DeviceIcon deviceType={s.device_type} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: "var(--color-fg)" }}>
                          {s.browser || "Unknown Browser"}
                        </span>
                        <BrowserIcon browser={s.browser} />
                        {isCurrent && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ background: "color-mix(in oklab, var(--color-primary) 18%, transparent)", color: "var(--color-primary)" }}
                          >
                            THIS DEVICE
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px]" style={{ color: "var(--color-muted)" }}>
                        {s.operating_system && <span>{s.operating_system}</span>}
                        {s.device_type      && <span>{s.device_type}</span>}
                        {s.ip_address       && <span>IP: {s.ip_address}</span>}
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: "var(--color-muted)" }}>
                        <span>Logged in: {fmtTs(s.login_time)}</span>
                        {s.last_activity && <span className="ml-3">Last active: {fmtTs(s.last_activity)}</span>}
                      </div>
                    </div>
                  </div>
                  {/* Right: revoke */}
                  {!isCurrent && (
                    <button
                      onClick={() => onRevoke(s.session_id)}
                      disabled={revokingId === s.session_id}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 cursor-pointer"
                      style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                    >
                      {revokingId === s.session_id
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <XCircle className="h-3 w-3" />}
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Past Sessions ── */}
        {pastSessions.length > 0 && (
          <section>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
              Past Sessions
            </p>
            <div className="space-y-2">
              {pastSessions.slice(0, 5).map((s) => {
                const sStyle = STATUS_STYLE[s.status] ?? STATUS_STYLE["Expired"];
                return (
                  <div
                    key={s.session_id}
                    className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                    style={{ background: "var(--color-surface2)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <DeviceIcon deviceType={s.device_type} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{ color: "var(--color-fg)" }}>
                            {s.browser || "Unknown Browser"}
                          </span>
                          <BrowserIcon browser={s.browser} />
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                          {fmtTs(s.login_time)}
                          {s.logout_time && <span className="ml-2">→ {fmtTs(s.logout_time)}</span>}
                        </div>
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                      style={{ background: sStyle.bg, color: sStyle.fg }}
                    >
                      {s.status.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Audit Trail ── */}
        <section>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
            Security Audit Trail
          </p>
          {auditLog.length === 0 && !loading && (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>No audit records found.</p>
          )}
          {auditLog.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["Event", "Browser", "IP Address", "Login Time", "Logout Time", "Duration", "Status"].map(h => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--color-muted)", whiteSpace: "nowrap" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((e, i) => {
                    const sStyle = STATUS_STYLE[e.status ?? ""] ?? { bg: "transparent", fg: "var(--color-muted)" };
                    const isLogin = e.event === "session_created";
                    return (
                      <tr
                        key={i}
                        style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "transparent" : "var(--color-surface2)" }}
                      >
                        <td className="px-3 py-2.5" style={{ whiteSpace: "nowrap" }}>
                          <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--color-fg)" }}>
                            {isLogin
                              ? <LoginIcon className="h-3 w-3 shrink-0" style={{ color: "#14b8a6" }} />
                              : <LogOut className="h-3 w-3 shrink-0" style={{ color: "#94a3b8" }} />}
                            {EVENT_LABEL[e.event] ?? e.event}
                          </span>
                        </td>
                        <td className="px-3 py-2.5" style={{ color: "var(--color-muted)", whiteSpace: "nowrap" }}>
                          <span className="flex items-center gap-1">
                            <BrowserIcon browser={e.browser} />
                            {e.browser || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: "var(--color-muted)", whiteSpace: "nowrap" }}>
                          {e.ip_address || "—"}
                        </td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: "var(--color-muted)", whiteSpace: "nowrap" }}>
                          {fmtTs(e.login_time)}
                        </td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: "var(--color-muted)", whiteSpace: "nowrap" }}>
                          {fmtTs(e.logout_time)}
                        </td>
                        <td className="px-3 py-2.5" style={{ whiteSpace: "nowrap" }}>
                          {e.active_duration_formatted ? (
                            <span className="flex items-center gap-1" style={{ color: "var(--color-fg)" }}>
                              <Timer className="h-3 w-3 shrink-0" style={{ color: "var(--color-primary)" }} />
                              {e.active_duration_formatted}
                            </span>
                          ) : (
                            <span style={{ color: "var(--color-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {e.status ? (
                            <span
                              className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                              style={{ background: sStyle.bg, color: sStyle.fg }}
                            >
                              {e.status.toUpperCase()}
                            </span>
                          ) : <span style={{ color: "var(--color-muted)" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
