export const API_BASE = "/api";

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

export async function apiFetch(path, { method="GET", body=null, csrf=false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (csrf) {
    const token = getCookie("sfas_csrf");
    if (token) headers["X-CSRF-Token"] = token;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) ? (data.detail || data.message) : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function login(username, password) {
  return apiFetch("/auth/login", { method: "POST", body: { username, password }, csrf: false });
}

export async function verifyOtp(login_token, otp) {
  return apiFetch("/auth/verify-otp", { method: "POST", body: { login_token, otp }, csrf: false });
}

export async function logout() {
  return apiFetch("/auth/logout", { method: "POST", body: {}, csrf: true });
}

export async function whoami() {
  return apiFetch("/secure/whoami", { method: "GET" });
}

// [DESARROLLO/DEMO] Obtener código OTP actual sin necesidad de app autenticadora
export async function getDevOtp(login_token) {
  return apiFetch("/auth/dev/get-otp", { method: "POST", body: { login_token }, csrf: false });
}
