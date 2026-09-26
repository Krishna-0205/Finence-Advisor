import React, { useState, useEffect, useRef } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  AlertTriangle,
  Flame,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Clock,
  X,
} from "lucide-react";
import type { Notification, NotificationSummary } from "../../domain/platform/notifications";
import { notificationsFn, markNotificationReadFn } from "../../server/api";
import { unwrap } from "../state";

export function NotificationsBell() {
  const [data, setData] = useState<NotificationSummary | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = () => {
    unwrap(notificationsFn())
      .then((res) => setData(res))
      .catch((err) => console.error("Error loading notifications:", err));
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Polling every 30s
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await unwrap(markNotificationReadFn({ data: { notificationId: id } }));
      if (data) {
        setData({
          ...data,
          unreadCount: Math.max(0, data.unreadCount - 1),
          notifications: data.notifications.map((n) =>
            n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
          ),
        });
      }
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }
  };

  const unreadCount = data?.unreadCount || 0;

  return (
    <div style={{ position: "relative" }} ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        style={{
          background: "none",
          border: "none",
          position: "relative",
          cursor: "pointer",
          padding: "8px",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isOpen ? "var(--primary, #2563eb)" : "var(--text-muted, #64748b)",
          transition: "background 0.15s ease",
        }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "4px",
              right: "4px",
              background: "#ef4444",
              color: "#ffffff",
              fontSize: "10px",
              fontWeight: 700,
              minWidth: "16px",
              height: "16px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              boxShadow: "0 0 0 2px #ffffff",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "360px",
            maxHeight: "480px",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)",
            border: "1px solid #e2e8f0",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "#f8fafc",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: "#fee2e2",
                    color: "#dc2626",
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "2px",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* List */}
          <div
            style={{
              overflowY: "auto",
              flex: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {!data || data.notifications.length === 0 ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: "13px",
                }}
              >
                No notifications right now.
              </div>
            ) : (
              data.notifications.map((n) => {
                const isRead = !!n.readAt;
                const isCrit = n.severity === "CRITICAL";

                return (
                  <div
                    key={n.id}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      backgroundColor: !isRead ? (isCrit ? "rgba(254, 242, 242, 0.4)" : "#f0f9ff") : "#ffffff",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "10px",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          marginBottom: "2px",
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: isCrit ? "#ef4444" : "#f59e0b",
                            display: isRead ? "none" : "inline-block",
                          }}
                        />
                        <span
                          style={{
                            fontWeight: isRead ? 500 : 700,
                            fontSize: "13px",
                            color: "#0f172a",
                          }}
                        >
                          {n.title}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569", lineHeight: 1.4 }}>
                        {n.message}
                      </div>
                      {n.linkUrl && (
                        <a
                          href={n.linkUrl}
                          onClick={() => setIsOpen(false)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#2563eb",
                            textDecoration: "none",
                            marginTop: "6px",
                          }}
                        >
                          View Details <ArrowRight size={10} />
                        </a>
                      )}
                    </div>

                    {!isRead && (
                      <button
                        onClick={(e) => handleMarkAsRead(n.id, e)}
                        title="Mark as read"
                        style={{
                          background: "#f0fdfa",
                          border: "1px solid #99f6e4",
                          color: "#0f766e",
                          cursor: "pointer",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        <Check size={13} /> Read
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "10px 16px",
              backgroundColor: "#f8fafc",
              borderTop: "1px solid #f1f5f9",
              fontSize: "11px",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>In-app & email dispatch enabled</span>
            <span style={{ fontWeight: 600 }}>Feature 38</span>
          </div>
        </div>
      )}
    </div>
  );
}
