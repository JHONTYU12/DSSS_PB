import React from "react";

export function Card({ children, className = "", ...props }) {
  return (
    <div className={`glass-card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon: Icon, actions, children }) {
  return (
    <div className="glass-card-header">
      <h3 className="glass-card-title">
        {Icon && <Icon size={20} />}
        {title}
      </h3>
      {actions && <div className="card-actions">{actions}</div>}
      {children}
    </div>
  );
}

export function StatCard({ value, label, icon: Icon }) {
  return (
    <div className="glass-card stat-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div className="stat-value">{value}</div>
          <div className="stat-label">{label}</div>
        </div>
        {Icon && (
          <div style={{ opacity: 0.3 }}>
            <Icon size={32} />
          </div>
        )}
      </div>
    </div>
  );
}
