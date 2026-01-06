import React from "react";

export function Input({ label, icon: Icon, error, className = "", ...props }) {
  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <div className={Icon ? "input-with-icon" : ""}>
        {Icon && <Icon size={18} />}
        <input className={`input ${error ? "input-error" : ""} ${className}`} {...props} />
      </div>
      {error && <span className="input-error-text">{error}</span>}
    </div>
  );
}

export function TextArea({ label, error, className = "", ...props }) {
  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <textarea className={`input ${error ? "input-error" : ""} ${className}`} {...props} />
      {error && <span className="input-error-text">{error}</span>}
    </div>
  );
}

export function Select({ label, options = [], placeholder, error, className = "", ...props }) {
  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <select className={`input ${className}`} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="input-error-text">{error}</span>}
    </div>
  );
}
