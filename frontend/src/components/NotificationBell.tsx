import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export interface NotificationItem {
  id: string;
  filename: string;
  status: "pending" | "approved" | "rejected";
  timestamp: string;
  message: string;
  uploader: string;
  rejectionReason?: string | null;
}

interface Props {
  notifications: NotificationItem[];
  readIds: string[];
  onMarkAllAsRead: () => void;
  onNotificationClick: (item: NotificationItem) => void;
}

export function NotificationBell({
  notifications,
  readIds,
  onMarkAllAsRead,
  onNotificationClick,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !readIds.includes(n.id)).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen) {
      onMarkAllAsRead();
    }
    setIsOpen(!isOpen);
  };

  const handleItemClick = (item: NotificationItem) => {
    setIsOpen(false);
    onNotificationClick(item);
  };

  const formatTime = (iso: string) => {
    if (!iso) return "";
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) return "";
      
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHrs / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="dms-touch-btn relative flex items-center justify-center rounded-lg text-fg hover:bg-surface2 transition cursor-pointer"
        aria-label="View notifications"
        id="notification-bell-btn"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white ring-2 ring-surface animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border bg-surface p-2 shadow-2xl z-50 animate-fadeIn overflow-hidden dms-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold text-fg">Notifications Feed</h3>
            <span className="text-[10px] font-medium text-muted bg-surface2 px-2 py-0.5 rounded-full">
              {notifications.length} Total
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted">
                <Bell className="h-8 w-8 text-subtle mb-2 opacity-50" />
                <p className="text-xs">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((item) => {
                const isUnread = !readIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-surface2 transition cursor-pointer ${
                      isUnread ? "bg-primary/5" : ""
                    }`}
                  >
                    {/* Status Icon */}
                    <div className="mt-0.5 shrink-0">
                      {item.status === "approved" ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : item.status === "rejected" ? (
                        <XCircle className="h-5 w-5 text-error" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-warning" />
                      )}
                    </div>

                    {/* Message Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-fg truncate">
                          {item.filename}
                        </span>
                        <span className="text-[10px] text-muted whitespace-nowrap">
                          {formatTime(item.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-0.5 line-clamp-2">
                        {item.message}
                      </p>
                      {item.status === "rejected" && item.rejectionReason && (
                        <div className="mt-1 text-[11px] bg-error-bg/60 text-error rounded px-2 py-0.5 border border-error/10 truncate">
                          Reason: {item.rejectionReason}
                        </div>
                      )}
                    </div>

                    {/* Unread indicator dot */}
                    {isUnread && (
                      <span className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0 animate-pulse" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
