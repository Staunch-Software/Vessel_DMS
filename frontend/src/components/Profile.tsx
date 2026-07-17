import React, { useState, useEffect, useRef } from "react";
import {
  Mail, Phone, Clock, LogOut, Camera,
  MapPin, Hash, Calendar, Users, ArrowLeft, LayoutDashboard,
  Layers, ShieldOff, Edit3, Save, X,
  Building2, Activity, RefreshCw, UserCheck,
  AlertCircle, Upload, FolderOpen, Trash2, FolderPlus, LogIn, Printer,
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
  address_line1: string;
  address_line2: string;
  area_locality: string;
  landmark: string;
  city: string;
  state: string;
  province: string;
  postal_code: string;
  country: string;
  department: string;
  manager_name: string;
  manager_email: string;
  ec_name: string;
  ec_relationship: string;
  ec_phone: string;
  ec_email: string;
  date_of_joining: string;
  office_address_line1: string;
  office_address_line2: string;
  office_area_locality: string;
  office_landmark: string;
  office_city: string;
  office_state: string;
  office_province: string;
  office_postal_code: string;
  office_country: string;
  office_tel: string;
  office_fax: string;
  office_phone: string;
}

function initForm(p: UserProfile | null): EditForm {
  return {
    employee_id:     p?.employee_id     ?? "",
    first_name:      p?.first_name      ?? "",
    last_name:       p?.last_name       ?? "",
    phone:           p?.phone           ?? "",
    office_name:     p?.office_name     ?? "",
    office_location: p?.office_location ?? "",
    address_line1:   p?.address_line1   ?? "",
    address_line2:   p?.address_line2   ?? "",
    area_locality:   p?.area_locality   ?? "",
    landmark:        p?.landmark        ?? "",
    city:            p?.city            ?? "",
    state:           p?.state           ?? "",
    province:        p?.province        ?? "",
    postal_code:     p?.postal_code     ?? "",
    country:         p?.country         ?? "",
    department:      p?.department      ?? "",
    manager_name:    p?.manager_name    ?? "",
    manager_email:   p?.manager_email   ?? "",
    ec_name:         p?.emergency_contact?.name              ?? "",
    ec_relationship: p?.emergency_contact?.relationship_type ?? "",
    ec_phone:        p?.emergency_contact?.phone             ?? "",
    ec_email:        p?.emergency_contact?.email             ?? "",
    date_of_joining: p?.date_of_joining                      ?? "",
    office_address_line1: p?.office_address_line1            ?? "",
    office_address_line2: p?.office_address_line2            ?? "",
    office_area_locality: p?.office_area_locality            ?? "",
    office_landmark:      p?.office_landmark                 ?? "",
    office_city:          p?.office_city                     ?? "",
    office_state:         p?.office_state                    ?? "",
    office_province:      p?.office_province                 ?? "",
    office_postal_code:   p?.office_postal_code              ?? "",
    office_country:       p?.office_country                  ?? "",
    office_tel:           p?.office_tel                      ?? "",
    office_fax:           p?.office_fax                      ?? "",
    office_phone:         p?.office_phone                    ?? "",
  };
}

// ── Validation ────────────────────────────────────────────────────────────────
type FormErrors = Partial<Record<keyof EditForm, string>>;

function validateForm(f: EditForm): FormErrors {
  const err: FormErrors = {};
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^[+\d()\-\s]*$/;
  const alphaSpaceRe = /^[a-zA-Z\s'\-]*$/;
  const alphaOnlyRe = /^[a-zA-Z\s]*$/;
  const postalRe = /^[a-zA-Z0-9\s\-]*$/;
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
    { key: "ec_name", label: "Full Name", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "ec_relationship", label: "Relationship", regex: alphaOnlyRe, regexError: "Only letters and spaces are allowed" },
    { key: "ec_phone", label: "Phone", regex: phoneRe, regexError: "Only digits, +, \u2013, ( ), and spaces are allowed" },
    { key: "ec_email", label: "Email", regex: emailRe, regexError: "Enter a valid email address" },
    
    // Personal Address
    { key: "address_line1", label: "Address Line 1", regex: addressRe, regexError: "Invalid characters in address" },
    { key: "address_line2", label: "Address Line 2", regex: addressRe, regexError: "Invalid characters in address" },
    { key: "area_locality", label: "Area / Locality", regex: addressRe, regexError: "Invalid characters" },
    { key: "landmark", label: "Landmark", regex: addressRe, regexError: "Invalid characters" },
    { key: "city", label: "City", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "state", label: "State", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "province", label: "Province", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "postal_code", label: "Postal Code", regex: postalRe, regexError: "Enter a valid postal / ZIP code" },
    { key: "country", label: "Country", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    
    // Office Address
    { key: "office_name", label: "Office Name", regex: addressRe, regexError: "Invalid characters" },
    { key: "office_address_line1", label: "Address Line 1", regex: addressRe, regexError: "Invalid characters in address" },
    { key: "office_address_line2", label: "Address Line 2", regex: addressRe, regexError: "Invalid characters in address" },
    { key: "office_area_locality", label: "Area / Locality", regex: addressRe, regexError: "Invalid characters" },
    { key: "office_landmark", label: "Landmark", regex: addressRe, regexError: "Invalid characters" },
    { key: "office_city", label: "City", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "office_state", label: "State", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "office_province", label: "Province", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "office_postal_code", label: "Postal Code", regex: postalRe, regexError: "Enter a valid postal / ZIP code" },
    { key: "office_country", label: "Country", regex: alphaSpaceRe, regexError: "Only letters, spaces, hyphens, and apostrophes are allowed" },
    { key: "office_tel", label: "Office TEL", regex: phoneRe, regexError: "Only digits, +, \u2013, ( ), and spaces are allowed" },
    { key: "office_fax", label: "Office FAX", regex: phoneRe, regexError: "Only digits, +, \u2013, ( ), and spaces are allowed" },
    { key: "office_phone", label: "Office Phone", regex: phoneRe, regexError: "Only digits, +, \u2013, ( ), and spaces are allowed" },
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
  photoBase64?: string | null;
  onBack: () => void;
  onDashboard: () => void;
  onViewFullPhoto?: () => void;
}

function MiniSidebar({ mains, displayName, jobTitle, photoBase64, onBack, onDashboard, onViewFullPhoto }: MiniSidebarProps) {
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
        <img
          src="/nissen-logo.svg"
          alt="Nissen Kaiun logo"
          className="h-10 w-auto drop-shadow-md"
        />
        <div>
          <h1 className="text-sm font-semibold leading-tight" style={{ color: white }}>
            Nissen DMS
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
                className={
                  "flex h-7 w-7 items-center justify-center rounded-lg " +
                  (accent ? accent.chip : "bg-white/10")
                }
              >
                <Layers
                  className={"h-4 w-4 " + (accent ? accent.text : "text-white")}
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
            onClick={() => {
              if (photoBase64 && onViewFullPhoto) onViewFullPhoto();
            }}
            className={"flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold overflow-hidden " + (photoBase64 ? "cursor-pointer hover:opacity-80 transition" : "")}
            style={{ background: teal, color: navy }}
            title={photoBase64 ? "Click to view full photo" : undefined}
          >
            {photoBase64 ? (
              <img src={photoBase64} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              displayName.split(" ").map((n) => n[0]).join("")
            )}
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
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
        office_address_line1: form.office_address_line1 || undefined,
        office_address_line2: form.office_address_line2 || undefined,
        office_area_locality: form.office_area_locality || undefined,
        office_landmark: form.office_landmark || undefined,
        office_city: form.office_city || undefined,
        office_state: form.office_state || undefined,
        office_province: form.office_province || undefined,
        office_postal_code: form.office_postal_code || undefined,
        office_country: form.office_country || undefined,
        office_tel: form.office_tel || undefined,
        office_fax: form.office_fax || undefined,
        office_phone: form.office_phone || undefined,
        address_line1: form.address_line1 || undefined,
        address_line2: form.address_line2 || undefined,
        area_locality: form.area_locality || undefined,
        landmark: form.landmark || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        province: form.province || undefined,
        postal_code: form.postal_code || undefined,
        country: form.country || undefined,
        department: form.department || undefined, manager_name: form.manager_name || undefined,
        manager_email: form.manager_email || undefined,
        emergency_contact_name: form.ec_name || undefined,
        emergency_contact_relationship: form.ec_relationship || undefined,
        emergency_contact_phone: form.ec_phone || undefined,
        emergency_contact_email: form.ec_email || undefined,
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
  const initials = displayName.split(" ").map((n) => n[0]).filter(Boolean).join("").toUpperCase().slice(0, 2);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: slate100 }}>
      <MiniSidebar
        mains={mains}
        displayName={displayName}
        jobTitle={profile?.job_title ?? ""}
        photoBase64={profile?.photo_base64}
        onBack={onBack}
        onDashboard={onDashboard}
        onViewFullPhoto={() => setShowFullPhoto(true)}
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
          <div className="flex items-center gap-3">
            {editing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 transition"
                  style={{ color: slate500 }}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                  style={{ background: teal, color: white }}
                >
                  {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={handleEdit}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white border hover:bg-slate-50 transition"
                style={{ color: slate500, borderColor: slate200 }}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit Profile
              </button>
            )}
            <button
              onClick={() => setShowSignOutPopup(true)}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
              style={{ background: teal, color: white }}
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
                        className={"flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold overflow-hidden " + (profile?.photo_base64 ? "cursor-pointer hover:opacity-90 transition" : "")}
                        style={{ background: `radial-gradient(circle at 35% 30%, ${steel}, ${navy2} 75%)`, border: `3px solid ${teal300}`, color: white }}
                        title={profile?.photo_base64 ? "Click to view full photo" : undefined}
                      >
                        {profile?.photo_base64 ? (
                          <img src={profile.photo_base64} alt="Profile" className="h-full w-full object-cover" />
                        ) : (
                          initials
                        )}
                      </div>
                      <button
                        onClick={handlePhotoClick}
                        className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-105"
                        style={{ background: teal, border: `2px solid ${navy}` }}
                        title="Upload photo"
                      >
                        <Camera className="h-3.5 w-3.5" style={{ color: navy }} />
                      </button>
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight" style={{ color: white }}>{displayName}</h1>
                      {profile?.employee_id && <p className="mt-0.5 font-mono text-xs uppercase tracking-widest" style={{ color: slate400 }}>Employee ID {profile.employee_id}</p>}
                      <p className="mt-1 text-sm" style={{ color: teal300 }}>
                        {[profile?.job_title, profile?.company_name].filter(Boolean).join(" \u00b7 ") || profile?.email}
                      </p>
                      {/* Photo Size / Errors */}
                      <div className="mt-1 flex flex-col gap-0.5">
                        {profile?.photo_base64 && (
                          <p className="text-[11px] font-medium" style={{ color: teal300 }}>
                            Photo size: {getBase64SizeLabel(profile.photo_base64)} (Max 10 MB)
                          </p>
                        )}
                        {photoError && (
                          <p className="text-[11px] font-medium" style={{ color: danger }}>
                            {photoError}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {profile?.department && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "#cfece7" }}><Building2 className="h-3 w-3" />{profile.department}</span>}
                        {(profile?.city || profile?.office_location) && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "#cfece7" }}><MapPin className="h-3 w-3" />{profile.city ? [profile.city, profile.state, profile.country].filter(Boolean).join(", ") : profile.office_location}</span>}
                        {profile?.date_of_joining && yearsLabel(profile.date_of_joining) && <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "#cfece7" }}><Calendar className="h-3 w-3" />{yearsLabel(profile.date_of_joining)}</span>}
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

                {/* Left Column (spans 2 columns on desktop) */}
                <div className="lg:col-span-2 flex flex-col gap-5">
                  {/* WORK INFO */}
                  <Card title="Work Info" icon={<Building2 className="h-3.5 w-3.5" />}>
                    <div style={{ borderTop: `1px dashed ${slate200}` }}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                        <FieldRow icon={<Hash className="h-3.5 w-3.5" />} label="Employee ID" value={profile?.employee_id} editing={editing} inputValue={form.employee_id} onInputChange={(v) => setField("employee_id", v)} placeholder="e.g. EMP-4471" mono error={formErrors.employee_id} />
                        <FieldRow icon={<Mail className="h-3.5 w-3.5" />} label="Work Email" value={profile?.email} readOnly />
                        <FieldRow icon={<Building2 className="h-3.5 w-3.5" />} label="Department" value={profile?.department} editing={editing} inputValue={form.department} onInputChange={(v) => setField("department", v)} placeholder="e.g. Documentation & Compliance" error={formErrors.department} />
                        <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Reports To (Manager)" value={profile?.manager_name ? `${profile.manager_name}${profile.manager_email ? ` \u2014 ${profile.manager_email}` : ""}` : null} editing={editing} inputValue={form.manager_name} onInputChange={(v) => setField("manager_name", v)} placeholder="e.g. Rakesh Iyer (Fleet Manager)" error={formErrors.manager_name} />
                        {editing && <FieldRow icon={<Mail className="h-3.5 w-3.5" />} label="Manager Email" value={profile?.manager_email} editing={editing} inputValue={form.manager_email} onInputChange={(v) => setField("manager_email", v)} placeholder="e.g. r.iyer@company.com" error={formErrors.manager_email} />}
                        <FieldRow icon={<Calendar className="h-3.5 w-3.5" />} label="Date of Joining" value={profile?.date_of_joining ? fmtOnlyDate(profile.date_of_joining) : null} editing={editing} inputValue={form.date_of_joining} type="date" onInputChange={(v) => setField("date_of_joining", v)} placeholder="Select date" error={formErrors.date_of_joining} />
                      </div>
                      
                      {/* Office Address inside Work Info */}
                      <div className="mt-5 border-t pt-4" style={{ borderColor: slate200 }}>
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: ink }}>
                          <MapPin className="h-4 w-4" style={{ color: slate500 }} />
                          Office Address
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                          <FieldRow icon={<Building2 className="h-3.5 w-3.5" />} label="Office Name" value={profile?.office_name} editing={editing} inputValue={form.office_name} onInputChange={(v) => setField("office_name", v)} placeholder="e.g. HQ Tower" error={formErrors.office_name} />
                          <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address Line 1" value={profile?.office_address_line1} editing={editing} inputValue={form.office_address_line1} onInputChange={(v) => setField("office_address_line1", v)} placeholder="e.g. 21 Marina Boulevard" error={formErrors.office_address_line1} />
                          <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address Line 2" value={profile?.office_address_line2} editing={editing} inputValue={form.office_address_line2} onInputChange={(v) => setField("office_address_line2", v)} placeholder="e.g. #14-02 MBFC" error={formErrors.office_address_line2} />
                          <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Area / Locality" value={profile?.office_area_locality} editing={editing} inputValue={form.office_area_locality} onInputChange={(v) => setField("office_area_locality", v)} placeholder="e.g. Marina Bay" error={formErrors.office_area_locality} />
                          <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Landmark" value={profile?.office_landmark} editing={editing} inputValue={form.office_landmark} onInputChange={(v) => setField("office_landmark", v)} placeholder="e.g. Near Marina Sands" error={formErrors.office_landmark} />
                          <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="City" value={profile?.office_city} editing={editing} inputValue={form.office_city} onInputChange={(v) => setField("office_city", v)} placeholder="e.g. Singapore" error={formErrors.office_city} />
                          <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="State" value={profile?.office_state} editing={editing} inputValue={form.office_state} onInputChange={(v) => setField("office_state", v)} placeholder="e.g. Central" error={formErrors.office_state} />
                          <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Province" value={profile?.office_province} editing={editing} inputValue={form.office_province} onInputChange={(v) => setField("office_province", v)} placeholder="e.g. Western Province" error={formErrors.office_province} />
                          <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Postal Code" value={profile?.office_postal_code} editing={editing} inputValue={form.office_postal_code} onInputChange={(v) => setField("office_postal_code", v)} placeholder="e.g. 018982" error={formErrors.office_postal_code} />
                          <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Country" value={profile?.office_country} editing={editing} inputValue={form.office_country} onInputChange={(v) => setField("office_country", v)} placeholder="e.g. Singapore" error={formErrors.office_country} />
                          <FieldRow icon={<Phone className="h-3.5 w-3.5" />} label="Office TEL" value={profile?.office_tel} editing={editing} inputValue={form.office_tel} type="tel" onInputChange={(v) => setField("office_tel", v.replace(/[^\d+\-() ]/g, ""))} placeholder="e.g. +65 6112 3456" error={formErrors.office_tel} />
                          <FieldRow icon={<Printer className="h-3.5 w-3.5" />} label="Office FAX" value={profile?.office_fax} editing={editing} inputValue={form.office_fax} type="tel" onInputChange={(v) => setField("office_fax", v.replace(/[^\d+\-() ]/g, ""))} placeholder="e.g. +65 6112 3457" error={formErrors.office_fax} />
                          <FieldRow icon={<Phone className="h-3.5 w-3.5" />} label="Office Phone" value={profile?.office_phone} editing={editing} inputValue={form.office_phone} type="tel" onInputChange={(v) => setField("office_phone", v.replace(/[^\d+\-() ]/g, ""))} placeholder="e.g. +65 8112 3458" error={formErrors.office_phone} />
                        </div>
                      </div>
                    </div>
                  </Card>
                  
                  {/* 2. EMERGENCY CONTACT */}
                  <Card title="Emergency Contact" icon={<UserCheck className="h-3.5 w-3.5" />}>
                    <div style={{ borderTop: `1px dashed ${slate200}` }}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                        <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Full Name"
                          value={profile?.emergency_contact?.name ? `${profile.emergency_contact.name}${profile.emergency_contact.relationship_type ? ` \u2014 ${profile.emergency_contact.relationship_type}` : ""}` : null}
                          editing={editing} inputValue={form.ec_name} onInputChange={(v) => setField("ec_name", v)} placeholder="e.g. Vikram Menon" error={formErrors.ec_name} />
                        {editing && <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Relationship" value={profile?.emergency_contact?.relationship_type} editing={editing} inputValue={form.ec_relationship} onInputChange={(v) => setField("ec_relationship", v)} placeholder="e.g. Spouse, Parent, Sibling" error={formErrors.ec_relationship} />}
                        <FieldRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={profile?.emergency_contact?.phone} editing={editing} inputValue={form.ec_phone} onInputChange={(v) => setField("ec_phone", v.replace(/[^\d+\-() ]/g, ""))} placeholder="e.g. +65 9027 6612" error={formErrors.ec_phone} />
                        <FieldRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={profile?.emergency_contact?.email} editing={editing} inputValue={form.ec_email} onInputChange={(v) => setField("ec_email", v)} placeholder="e.g. contact@gmail.com" asLink={!editing} error={formErrors.ec_email} />
                      </div>
                    </div>
                    {editing && <p className="mt-3 text-xs" style={{ color: slate400 }}>Emergency contact is saved together with account fields.</p>}
                    {!editing && !profile?.emergency_contact?.name && <p className="mt-3 text-xs" style={{ color: slate400 }}>No emergency contact on record. Click <strong>Edit Profile</strong> to add one.</p>}
                  </Card>
                </div>

                {/* Right Column (spans 1 column on desktop) */}
                <div className="lg:col-span-1 flex flex-col gap-5">
                  {/* 1. PERSONAL INFO */}
                  <Card title="Personal Info" icon={<Users className="h-3.5 w-3.5" />} eyebrow="Core record">
                    {saveError && <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(225,29,72,0.08)", color: danger }}><AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{saveError}</div>}
                    
                    {/* Account detail list */}
                    <div style={{ borderTop: `1px dashed ${slate200}` }}>
                      <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="First Name" value={profile?.first_name} editing={editing} inputValue={form.first_name} onInputChange={(v) => setField("first_name", v)} placeholder="e.g. Anjali" error={formErrors.first_name} />
                      <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Last Name" value={profile?.last_name} editing={editing} inputValue={form.last_name} onInputChange={(v) => setField("last_name", v)} placeholder="e.g. Menon" error={formErrors.last_name} />
                      <FieldRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={profile?.phone} editing={editing} inputValue={form.phone} type="tel" onInputChange={(v) => setField("phone", v.replace(/[^\d+\-() ]/g, ""))} placeholder="e.g. +65 8123 4477" error={formErrors.phone} />
                      <FieldRow icon={<Clock className="h-3.5 w-3.5" />} label="Last Login" value={fmtDate(profile?.last_login)} readOnly mono />
                    </div>

                    {/* Personal Address Details inside Personal Info Card */}
                    <div className="mt-6 border-t pt-5" style={{ borderColor: slate200 }}>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: ink }}>
                        <MapPin className="h-4 w-4" style={{ color: slate500 }} />
                        Personal Address
                      </h3>
                      <div style={{ borderTop: `1px dashed ${slate200}` }}>
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address Line 1" value={profile?.address_line1} editing={editing} inputValue={form.address_line1} onInputChange={(v) => setField("address_line1", v)} placeholder="e.g. 21 Marina Boulevard" error={formErrors.address_line1} />
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address Line 2" value={profile?.address_line2} editing={editing} inputValue={form.address_line2} onInputChange={(v) => setField("address_line2", v)} placeholder="e.g. #14-02 MBFC" error={formErrors.address_line2} />
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Area / Locality" value={profile?.area_locality} editing={editing} inputValue={form.area_locality} onInputChange={(v) => setField("area_locality", v)} placeholder="e.g. Marina Bay" error={formErrors.area_locality} />
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Landmark" value={profile?.landmark} editing={editing} inputValue={form.landmark} onInputChange={(v) => setField("landmark", v)} placeholder="e.g. Near Marina Bay Sands" error={formErrors.landmark} />
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="City" value={profile?.city} editing={editing} inputValue={form.city} onInputChange={(v) => setField("city", v)} placeholder="e.g. Singapore" error={formErrors.city} />
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="State" value={profile?.state} editing={editing} inputValue={form.state} onInputChange={(v) => setField("state", v)} placeholder="e.g. Central" error={formErrors.state} />
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Province" value={profile?.province} editing={editing} inputValue={form.province} onInputChange={(v) => setField("province", v)} placeholder="e.g. Western Province" error={formErrors.province} />
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Postal Code" value={profile?.postal_code} editing={editing} inputValue={form.postal_code} onInputChange={(v) => setField("postal_code", v)} placeholder="e.g. 018982" error={formErrors.postal_code} />
                        <FieldRow icon={<MapPin className="h-3.5 w-3.5" />} label="Country" value={profile?.country} editing={editing} inputValue={form.country} onInputChange={(v) => setField("country", v)} placeholder="e.g. Singapore" error={formErrors.country} />
                      </div>
                    </div>
                  </Card>
                </div>

                {/* 4. ACTIVITY LOG */}
                <div className="lg:col-span-3">
                  <Card title="Recent Activity" icon={<Activity className="h-3.5 w-3.5" />} eyebrow="Last 10 events">
                    {(profile?.recent_activity ?? []).length === 0 ? (
                      <p className="py-2 text-sm" style={{ color: slate400 }}>No recent activity on record.</p>
                    ) : (
                      <div className="relative pl-6 pt-2">
                        <div className="pointer-events-none absolute bottom-2 left-[9px] top-4" style={{ width: 1.5, background: `repeating-linear-gradient(to bottom, ${slate200} 0 4px, transparent 4px 8px)` }} />
                        {profile!.recent_activity.map((entry, i) => {
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
                            <div key={i} className="relative mb-5 last:mb-0">
                              <div className="absolute -left-6 top-1 rounded-full flex items-center justify-center"
                                style={{ width: 18, height: 18, background: entry.action === "file_upload" ? teal : white, border: `2px solid ${teal}` }}>
                                <span style={{ color: entry.action === "file_upload" ? white : teal }}>
                                  {actionIcon[entry.action] ?? <Activity className="h-3 w-3" />}
                                </span>
                              </div>
                              <div className="mb-0.5 font-mono text-[11px]" style={{ color: slate400 }}>{fmtDate(entry.created_at)}</div>

                              {folderPath ? (
                                /* Rich upload entry with file + path */
                                <div className="rounded-lg border p-2.5" style={{ borderColor: slate200, background: "#f8fafc" }}>
                                  <div className="flex items-start gap-2">
                                    <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: teal }} />
                                    <div className="min-w-0 flex-1">
                                      {/* File name */}
                                      <p className="text-[13px] font-semibold leading-snug" style={{ color: ink }}>
                                        {displayName.replace(/^Uploaded:\s*/i, "")}
                                      </p>
                                      {/* Folder path breadcrumb */}
                                      <div className="mt-1 flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
                                        <FolderOpen className="h-3 w-3 shrink-0" style={{ color: slate400 }} />
                                        {pathSegments.map((seg, si) => (
                                          <span key={si} className="flex items-center gap-x-0.5">
                                            {si > 0 && (
                                              <span className="text-[10px]" style={{ color: slate400 }}>›</span>
                                            )}
                                            <span
                                              className="rounded px-1 py-0.5 text-[11px] font-medium leading-none"
                                              style={{
                                                background: si === pathSegments.length - 1 ? "#e0f2fe" : "transparent",
                                                color: si === pathSegments.length - 1 ? "#0369a1" : slate400,
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
            </>
          )}
        </div>
      </main>

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

    </div>
  );
}
