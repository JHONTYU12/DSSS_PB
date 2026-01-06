import React from "react";

const variants = {
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
  ghost: "btn btn-ghost",
  danger: "btn btn-danger",
};

const sizes = {
  sm: "btn-sm",
  md: "",
  icon: "btn-icon",
};

export function Button({ 
  children, 
  variant = "primary", 
  size = "md", 
  loading = false, 
  disabled = false,
  className = "",
  ...props 
}) {
  return (
    <button
      className={`${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="loading-spinner" style={{ width: 16, height: 16 }} />
      ) : null}
      {children}
    </button>
  );
}
