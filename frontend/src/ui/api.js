export const API_BASE = "/api";

// JWT Token Management (LocalStorage - mejores prácticas de seguridad)
export function getAccessToken() {
  return localStorage.getItem("access_token");
}

export function getRefreshToken() {
  return localStorage.getItem("refresh_token");
}

export function setTokens(access_token, refresh_token) {
  localStorage.setItem("access_token", access_token);
  localStorage.setItem("refresh_token", refresh_token);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
}

export function getUser() {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
}

export function setUser(user) {
  localStorage.setItem("user", JSON.stringify(user));
}

// LEGACY: Cookie helper (mantener para compatibilidad)
function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

export async function apiFetch(
  path,
  { method = "GET", body = null, csrf = false, useJWT = true } = {}
) {
  const headers = { "Content-Type": "application/json" };

  // Usar JWT por defecto (más seguro)
  if (useJWT) {
    const token = getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  // LEGACY: CSRF para compatibilidad con cookies
  if (csrf) {
    const token = getCookie("sfas_csrf");
    if (token) headers["X-CSRF-Token"] = token;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include", // Mantener para cookies legacy
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const txt = await res.text();
  let data = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = { raw: txt };
  }

  // Si el token expiró (401), intentar renovar con refresh token
  if (!res.ok && res.status === 401 && useJWT && getRefreshToken()) {
    try {
      const refreshData = await refreshAccessToken();
      // Reintentar el request original con el nuevo token
      headers["Authorization"] = `Bearer ${refreshData.access_token}`;
      const retryRes = await fetch(`${API_BASE}${path}`, {
        method,
        credentials: "include",
        headers,
        body: body ? JSON.stringify(body) : null,
      });
      const retryTxt = await retryRes.text();
      let retryData = null;
      try {
        retryData = retryTxt ? JSON.parse(retryTxt) : null;
      } catch {
        retryData = { raw: retryTxt };
      }
      if (!retryRes.ok) {
        throw new Error(retryData?.detail || `HTTP ${retryRes.status}`);
      }
      return retryData;
    } catch (refreshError) {
      // Si el refresh falla, limpiar tokens y redirigir al login
      clearTokens();
      window.location.href = "/";
      throw refreshError;
    }
  }

  if (!res.ok) {
    const msg =
      data && (data.detail || data.message)
        ? data.detail || data.message
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function login(username, password) {
  return apiFetch("/auth/login", {
    method: "POST",
    body: { username, password },
    useJWT: false, // Login no requiere autenticación previa
  });
}

export async function verifyOtp(login_token, otp) {
  const data = await apiFetch("/auth/verify-otp", {
    method: "POST",
    body: { login_token, otp },
    useJWT: false, // Verify-OTP no requiere autenticación previa
  });

  // Guardar tokens y datos de usuario
  if (data.access_token && data.refresh_token) {
    setTokens(data.access_token, data.refresh_token);
    if (data.user) {
      setUser(data.user);
    }
  }

  return data;
}

export async function refreshAccessToken() {
  const refresh_token = getRefreshToken();
  if (!refresh_token) {
    throw new Error("No refresh token available");
  }

  const data = await apiFetch("/auth/refresh", {
    method: "POST",
    body: { refresh_token },
    useJWT: false, // Refresh no usa access token
  });

  // Actualizar tokens en localStorage
  if (data.access_token && data.refresh_token) {
    setTokens(data.access_token, data.refresh_token);
  }

  return data;
}

export async function logout() {
  try {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: {},
      useJWT: true, // Enviar token para revocación
    });
  } finally {
    // Limpiar tokens incluso si el request falla
    clearTokens();
  }
}

export async function whoami() {
  return apiFetch("/secure/whoami", { method: "GET" });
}
