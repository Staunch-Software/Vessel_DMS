/**
 * TEMPORARY investigation-only instrumentation for the post-login Back button
 * / AADSTS900561 issue. Captures the exact signals needed to prove, from real
 * browser output, which origin created which history entry:
 *   - window.history.length      (grows on push, unchanged on replace)
 *   - window.location.href       (which document is currently active)
 *   - document.referrer          (what page, if any, "sent" us to this one —
 *                                 only ever set on a fresh top-level navigation,
 *                                 not on pushState/replaceState/popstate)
 *   - performance.getEntriesByType("navigation")[0].type
 *       "navigate" | "reload" | "back_forward" | "prerender" — tells us
 *       whether THIS document load was reached by the user pressing Back.
 *
 * Persisted to sessionStorage (survives full-page navigations, which
 * regular JS state does not) and printed as a running, comparable timeline.
 * Remove this file and its call sites once the investigation is complete.
 */

const LOG_KEY = "__dms_history_probe_log";

interface ProbeEntry {
  label: string;
  at: string;
  historyLength: number;
  href: string;
  title: string;
  referrer: string;
  navigationType: string | null;
}

function readLog(): ProbeEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLog(entries: ProbeEntry[]) {
  try {
    sessionStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    // sessionStorage unavailable (private mode etc.) — degrade to console-only
  }
}

export function captureDiagnostics(label: string): ProbeEntry {
  const navEntries = performance.getEntriesByType(
    "navigation"
  ) as PerformanceNavigationTiming[];
  const entry: ProbeEntry = {
    label,
    at: new Date().toISOString(),
    historyLength: window.history.length,
    href: window.location.href,
    title: document.title,
    referrer: document.referrer || "(empty)",
    navigationType: navEntries[0]?.type ?? null,
  };

  const log = readLog();
  log.push(entry);
  writeLog(log);

  console.info(`[history-probe] ${label}`, entry);
  return entry;
}

/** Prints the full recorded timeline (call from the DevTools console: dmsPrintHistoryProbe()) */
export function printHistoryProbeLog(): void {
  const log = readLog();
  console.table(log);
}

if (typeof window !== "undefined") {
  (window as unknown as { dmsPrintHistoryProbe: () => void }).dmsPrintHistoryProbe =
    printHistoryProbeLog;
}
