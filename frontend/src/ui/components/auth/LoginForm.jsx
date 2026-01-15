import React, { useState, useRef, useEffect } from "react";
import { Card } from "../common/Card";
import { Input } from "../common/Input";
import { Button } from "../common/Button";
import { IconShield, IconUser, IconLock, IconEye, IconEyeOff } from "../icons/Icons";

export function LoginForm({ onLogin, loading, error, onGoToPublic }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <IconShield size={28} />
          </div>
          <h1 className="login-title">LexSecure</h1>
          <p className="login-subtitle">Sistema de Firmas y Aperturas Seguras</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <Input
            label="Usuario"
            icon={IconUser}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ingresa tu usuario"
            autoComplete="username"
            required
          />

          <div className="input-group">
            <label className="input-label">Contraseña</label>
            <div className="input-with-icon" style={{ position: "relative" }}>
              <IconLock size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type={showPassword ? "text" : "password"}
                className="input"
                style={{ paddingLeft: 44, paddingRight: 44 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: 4,
                }}
              >
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ padding: "12px 16px", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-md)", color: "var(--error)", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          <Button type="submit" loading={loading} style={{ width: "100%", marginTop: 8 }}>
            Continuar
          </Button>

          {onGoToPublic && (
            <Button 
              type="button" 
              variant="secondary" 
              onClick={onGoToPublic} 
              style={{ width: "100%", marginTop: 8 }}
            >
              ← Consulta Pública de Casos
            </Button>
          )}
        </form>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Autenticación de dos factores requerida
        </div>
      </Card>
    </div>
  );
}

export function OtpForm({ onVerify, loading, error, onBack, loginToken, demoOtp, demoSeconds, onRefreshOtp }) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Auto-fill cuando hay demoOtp disponible
  useEffect(() => {
    if (demoOtp && demoOtp.length === 6) {
      const newOtp = demoOtp.split("");
      setOtp(newOtp);
    }
  }, [demoOtp]);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = text.split("").concat(Array(6 - text.length).fill(""));
    setOtp(newOtp);
    if (text.length === 6) {
      onVerify(text);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length === 6) {
      onVerify(code);
    }
  };

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <IconShield size={28} />
          </div>
          <h1 className="login-title">Verificación MFA</h1>
          <p className="login-subtitle">Ingresa el código de tu aplicación de autenticación</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {/* Demo OTP Display */}
          {demoOtp && (
            <div style={{ 
              padding: "16px", 
              background: "linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1))", 
              borderRadius: "var(--radius-md)", 
              border: "1px solid rgba(34, 197, 94, 0.3)",
              marginBottom: "16px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                🔐 Código Demo (Auto-llenado)
              </div>
              <div style={{ 
                fontSize: "2rem", 
                fontWeight: "700", 
                fontFamily: "monospace", 
                letterSpacing: "0.5rem",
                color: "var(--success)"
              }}>
                {demoOtp}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
                Válido por {demoSeconds}s
                <button
                  type="button"
                  onClick={onRefreshOtp}
                  style={{
                    marginLeft: "8px",
                    background: "none",
                    border: "none",
                    color: "var(--primary)",
                    cursor: "pointer",
                    fontSize: "0.7rem",
                    textDecoration: "underline"
                  }}
                >
                  Refrescar
                </button>
              </div>
            </div>
          )}

          <div className="otp-container" onPaste={handlePaste}>
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                className="otp-input"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                maxLength={1}
              />
            ))}
          </div>

          {error && (
            <div style={{ padding: "12px 16px", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-md)", color: "var(--error)", fontSize: "0.875rem", textAlign: "center" }}>
              {error}
            </div>
          )}

          <Button type="submit" loading={loading} disabled={otp.join("").length !== 6} style={{ width: "100%" }}>
            Verificar
          </Button>

          <Button type="button" variant="ghost" onClick={onBack} style={{ width: "100%" }}>
            Volver al inicio
          </Button>
        </form>
      </Card>
    </div>
  );
}
