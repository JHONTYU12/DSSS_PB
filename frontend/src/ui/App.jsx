import React, { useEffect, useState } from "react";
import "./styles.css";
import { login, verifyOtp, whoami, logout } from "./api.js";

// Components
import { ToastProvider, useToast } from "./components/common";
import { Header } from "./components/layout";
import { LoginForm, OtpForm } from "./components/auth";
import { 
  SecretaryDashboard, 
  JudgeDashboard, 
  AdminDashboard, 
  CustodioDashboard, 
  AuditDashboard 
} from "./components/dashboard";
import { PublicCaseSearch } from "./components/public";

function AppContent() {
  const toast = useToast();
  const [stage, setStage] = useState("loading");
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginToken, setLoginToken] = useState("");

  async function refreshWhoami() {
    try {
      const me = await whoami();
      setUser(me);
      setStage("app");
      setError("");
    } catch {
      setUser(null);
      // Por defecto mostrar vista pública en lugar de login
      setStage("public");
    }
  }

  useEffect(() => {
    refreshWhoami();
  }, []);

  const handleGoToLogin = () => {
    setStage("login");
    setError("");
  };

  const handleGoToPublic = () => {
    setStage("public");
    setError("");
  };

  const handleLogin = async (username, password) => {
    setError("");
    setLoading(true);
    try {
      const r = await login(username, password);
      setLoginToken(r.login_token);
      setStage("otp");
      toast.success("Credenciales válidas. Ingresa tu código OTP.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (otp) => {
    setError("");
    setLoading(true);
    try {
      const r = await verifyOtp(loginToken, otp);
      // El backend retorna {access_token, refresh_token, user: {username, role, user_id}}
      const userData = r.user || r;
      setUser(userData);
      setStage("app");
      toast.success(`Bienvenido, ${userData.username}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Sesión cerrada");
    } catch {}
    setUser(null);
    setStage("public");
    setLoginToken("");
  };

  const handleBackToLogin = () => {
    setStage("login");
    setLoginToken("");
    setError("");
  };

  // Loading state
  if (stage === "loading") {
    return (
      <div className="login-container">
        <div className="loading-spinner" style={{ width: 48, height: 48 }} />
      </div>
    );
  }

  // Public case search (default for unauthenticated users)
  if (stage === "public") {
    return <PublicCaseSearch onGoToLogin={handleGoToLogin} />;
  }

  // Login stage
  if (stage === "login") {
    return <LoginForm onLogin={handleLogin} loading={loading} error={error} onGoToPublic={handleGoToPublic} />;
  }

  // OTP stage
  if (stage === "otp") {
    return (
      <OtpForm
        onVerify={handleVerifyOtp}
        loading={loading}
        error={error}
        onBack={handleBackToLogin}
        loginToken={loginToken}
      />
    );
  }

  // App stage - render role-based dashboard
  return (
    <div className="app-container">
      <Header user={user} onLogout={handleLogout} />
      <main className="main-content">
        {user?.role === "secretario" && <SecretaryDashboard />}
        {user?.role === "juez" && <JudgeDashboard />}
        {user?.role === "admin" && <AdminDashboard />}
        {user?.role === "custodio" && <CustodioDashboard />}
        {user?.role === "auditor" && <AuditDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
