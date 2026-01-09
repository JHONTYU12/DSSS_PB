import React from "react";
import { IconCheck, IconX } from "../icons/Icons";

const statusVariants = {
  success: "status-success",
  error: "status-error",
  warning: "status-warning",
  pending: "status-pending",
  neutral: "status-neutral",
  secondary: "status-neutral",
};

/**
 * Badge component - versatile badge with variant support
 * @param {string} variant - Badge variant (success, error, warning, pending, neutral, secondary)
 * @param {ReactNode} children - Badge content
 */
export function Badge({ variant = "neutral", children, className = "" }) {
  return (
    <span className={`status-badge ${statusVariants[variant] || statusVariants.neutral} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, label }) {
  return <span className={`status-badge ${statusVariants[status] || statusVariants.neutral}`}>{label}</span>;
}

export function SuccessBadge({ success }) {
  return success ? (
    <span className="status-badge status-success">
      <IconCheck size={12} /> OK
    </span>
  ) : (
    <span className="status-badge status-error">
      <IconX size={12} /> FAIL
    </span>
  );
}

export function RoleBadge({ role }) {
  const roleColors = {
    admin: "status-warning",
    juez: "status-pending",
    secretario: "status-neutral",
    custodio: "status-success",
    auditor: "status-neutral",
  };
  return (
    <span className={`status-badge ${roleColors[role] || "status-neutral"}`}>
      {role?.toUpperCase() || "—"}
    </span>
  );
}

export function PseudoBadge({ value }) {
  if (!value) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return <span className="pseudo-ref">{value}</span>;
}
