import React, { createContext, useContext, useState, useCallback } from "react";
import { IconCheckCircle, IconXCircle, IconX } from "../icons/Icons";

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "success", duration = 4000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((msg) => addToast(msg, "success"), [addToast]);
  const error = useCallback((msg) => addToast(msg, "error"), [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, success, error }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === "success" ? (
              <IconCheckCircle size={18} style={{ color: "var(--success)" }} />
            ) : (
              <IconXCircle size={18} style={{ color: "var(--error)" }} />
            )}
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
            >
              <IconX size={14} style={{ color: "var(--text-muted)" }} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
