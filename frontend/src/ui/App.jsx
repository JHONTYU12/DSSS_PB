import React, { useEffect, useState } from "react";
import "./styles.css";
import { login, verifyOtp, checkSession, logout, getUser, getDemoOtp } from "./api.js";

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
  const [demoOtp, setDemoOtp] = useState("");
  const [demoSeconds, setDemoSeconds] = useState(30);

  // Verificar sesión al cargar (usa cookie HttpOnly automáticamente)
  async function checkExistingSession() {
    try {
      const data = await checkSession();
      if (data.authenticated && data.user) {
        setUser(data.user);
        setStage("app");
        setError("");
      } else {
        setUser(null);
        setStage("public");
      }
    } catch {
      setUser(null);
      setStage("public");
    }
  }

  useEffect(() => {
    checkExistingSession();
  }, []);

  const handleGoToLogin = () => {
    setStage("login");
    setError("");
  };

  const handleGoToPublic = () => {
    setStage("public");
    setError("");
  };

  // Función para obtener OTP demo
  const fetchDemoOtp = async (token) => {
    try {
      const r = await getDemoOtp(token);
      setDemoOtp(r.current_otp);
      setDemoSeconds(r.valid_for_seconds);
    } catch (e) {
      console.log("Demo OTP no disponible:", e.message);
    }
  };

  const handleLogin = async (username, password) => {
    setError("");
    setLoading(true);
    try {
      const r = await login(username, password);
      setLoginToken(r.login_token);
      setStage("otp");
      // Obtener código OTP demo automáticamente
      fetchDemoOtp(r.login_token);
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
      // El backend setea cookies HttpOnly automáticamente
      // Solo recibimos info del usuario, NO tokens
      const userData = r.user;
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
    setDemoOtp("");
    setError("");
  };

  const handleRefreshOtp = () => {
    if (loginToken) {
      fetchDemoOtp(loginToken);
    }
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
        demoOtp={demoOtp}
        demoSeconds={demoSeconds}
        onRefreshOtp={handleRefreshOtp}
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
