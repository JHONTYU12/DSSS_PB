import React, { useState, useRef, useEffect } from "react";
import { Card } from "../common/Card";
import { Input } from "../common/Input";
import { Button } from "../common/Button";
import { IconShield, IconUser, IconLock, IconEye, IconEyeOff, IconKey } from "../icons/Icons";
import { getDevOtp } from "../../api";

export function LoginForm({ onLogin, loading, error }) {
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
        </form>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Autenticación de dos factores requerida
        </div>
      </Card>
    </div>
  );
}

export function OtpForm({ onVerify, loading, error, onBack, loginToken }) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [devOtp, setDevOtp] = useState(null);
  const [devLoading, setDevLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const inputRefs = useRef([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Countdown timer for OTP validity
  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => setTimeRemaining(timeRemaining - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeRemaining === 0 && devOtp) {
      setDevOtp(null);
    }
  }, [timeRemaining, devOtp]);

  const handleGetDevOtp = async () => {
    setDevLoading(true);
    try {
      const result = await getDevOtp(loginToken);
      setDevOtp(result.otp);
      setTimeRemaining(result.valid_for_seconds);
      // Auto-fill the OTP
      const digits = result.otp.split("");
      setOtp(digits);
    } catch (e) {
      console.error(e);
    } finally {
      setDevLoading(false);
    }
  };

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

          {/* Dev/Demo OTP Helper */}
          <div style={{ 
            padding: "16px", 
            background: "rgba(251, 191, 36, 0.08)", 
            border: "1px solid rgba(251, 191, 36, 0.2)",
            borderRadius: "var(--radius-md)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <IconKey size={16} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Modo Demo
              </span>
            </div>
            
            {devOtp ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ 
                  fontSize: "1.75rem", 
                  fontWeight: 700, 
                  fontFamily: "monospace", 
                  letterSpacing: "0.3em",
                  color: "var(--accent)",
                  marginBottom: 4
                }}>
                  {devOtp}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Válido por {timeRemaining}s
                  <div style={{ 
                    width: "100%", 
                    height: 3, 
                    background: "var(--bg-secondary)", 
                    borderRadius: 2, 
                    marginTop: 6,
                    overflow: "hidden"
                  }}>
                    <div style={{ 
                      width: `${(timeRemaining / 30) * 100}%`, 
                      height: "100%", 
                      background: timeRemaining > 10 ? "var(--accent)" : "var(--error)",
                      transition: "width 1s linear"
                    }} />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 12 }}>
                  ¿No tienes una app autenticadora? Obtén el código directamente:
                </p>
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={handleGetDevOtp} 
                  loading={devLoading}
                  style={{ width: "100%" }}
                >
                  <IconKey size={16} />
                  Obtener Código OTP
                </Button>
              </>
            )}
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
