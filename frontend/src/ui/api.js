/**
 * API Client - JWT en Cookie HttpOnly + CSRF Protection
 * ======================================================
 *
 * ARQUITECTURA DE SEGURIDAD:
 *
 * 1. Cookie sfas_jwt (HttpOnly=True):
 *    - Contiene el JWT firmado con la información del usuario
 *    - JavaScript NO puede leerla (document.cookie no la muestra)
 *    - Se envía automáticamente con credentials: "include"
 *    - PROTECCIÓN XSS: Incluso si hay XSS, no pueden robar el JWT
 *
 * 2. Cookie sfas_csrf (HttpOnly=False):
 *    - Contiene el token CSRF vinculado al JWT
 *    - JavaScript SÍ puede leerla (necesario para enviarlo en header)
 *    - Frontend lee esta cookie y la envía en header X-CSRF-Token
 *    - PROTECCIÓN CSRF: Atacante en otro sitio no puede leer nuestras cookies
 *
 * FLUJO:
 * 1. Login + OTP → Backend setea cookies (sfas_jwt + sfas_csrf)
 * 2. Requests → Cookie automática + Header X-CSRF-Token
 * 3. Logout → Backend revoca JWT + borra cookies
 *
 * ¿Por qué NO usamos localStorage?
 * - localStorage es accesible por JavaScript
 * - Si hay vulnerabilidad XSS, el atacante roba el token
 * - Cookies HttpOnly son INMUNES a XSS
 */

export const API_BASE = "/api";

// ============================================================================
// Cookie Helpers
// ============================================================================

/**
 * Lee una cookie por nombre.
 * NOTA: Solo funciona para cookies NO HttpOnly (como sfas_csrf)
 * La cookie sfas_jwt es HttpOnly y NO puede ser leída por JS (esto es bueno!)
 */
function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

/**
 * Obtiene el token CSRF de la cookie sfas_csrf.
 * Este token debe enviarse en el header X-CSRF-Token.
 */
export function getCsrfToken() {
  return getCookie("sfas_csrf");
}

// ============================================================================
// User State (solo datos de usuario, NO tokens)
// Los tokens están seguros en cookies HttpOnly
// ============================================================================

let currentUser = null;

export function getUser() {
  if (currentUser) return currentUser;
  const stored = sessionStorage.getItem("user");
  return stored ? JSON.parse(stored) : null;
}

export function setUser(user) {
  currentUser = user;
  if (user) {
    sessionStorage.setItem("user", JSON.stringify(user));
  } else {
    sessionStorage.removeItem("user");
  }
}

export function clearUser() {
  currentUser = null;
  sessionStorage.removeItem("user");
}

// ============================================================================
// API Fetch con Cookies HttpOnly + CSRF
// ============================================================================

/**
 * Función principal para hacer requests a la API.
 *
 * - Cookies se envían automáticamente (credentials: "include")
 * - CSRF token se lee de cookie y se envía en header
 *
 * @param {string} path - Ruta de la API (ej: "/auth/login")
 * @param {object} options - Opciones del request
 * @param {string} options.method - HTTP method (GET, POST, PUT, DELETE)
 * @param {object} options.body - Body del request (se convierte a JSON)
 * @param {boolean} options.csrf - Si true, incluye header X-CSRF-Token
 */
export async function apiFetch(
  path,
  { method = "GET", body = null, csrf = true } = {}
) {
  const headers = { "Content-Type": "application/json" };

  // Incluir CSRF token para requests que modifican datos
  if (csrf) {
    const token = getCsrfToken();
    if (token) {
      headers["X-CSRF-Token"] = token;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include", // CRÍTICO: Envía cookies automáticamente
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

  if (!res.ok) {
    // Si sesión expiró, limpiar usuario
    if (res.status === 401) {
      clearUser();
    }
    const msg =
      data && (data.detail || data.message)
        ? data.detail || data.message
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// ============================================================================
// Auth Endpoints
// ============================================================================

/**
 * Paso 1: Login con username y password.
 * Retorna login_token para continuar con OTP.
 */
export async function login(username, password) {
  return apiFetch("/auth/login", {
    method: "POST",
    body: { username, password },
    csrf: false, // Login no requiere CSRF (no hay sesión aún)
  });
}

/**
 * SOLO DEMO: Obtener código OTP actual para el usuario.
 * En producción esto NO debería existir.
 */
export async function getDemoOtp(loginToken) {
  return apiFetch(`/auth/demo-otp/${loginToken}`, {
    method: "GET",
    csrf: false,
  });
}

/**
 * Paso 2: Verificar código OTP.
 * Si es exitoso, el backend setea las cookies HttpOnly automáticamente.
 * NO retorna tokens - los tokens están seguros en cookies.
 */
export async function verifyOtp(login_token, otp) {
  const data = await apiFetch("/auth/verify-otp", {
    method: "POST",
    body: { login_token, otp },
    csrf: false, // Verify-OTP no requiere CSRF (no hay sesión aún)
  });

  // Guardar info del usuario (no tokens sensibles)
  if (data.success && data.user) {
    setUser(data.user);
  }

  return data;
}

/**
 * Verificar si hay sesión activa.
 * Útil al cargar la página para saber si el usuario está logueado.
 */
export async function checkSession() {
  try {
    const data = await apiFetch("/auth/session", {
      method: "GET",
      csrf: false, // GET /session no requiere CSRF
    });
    if (data.authenticated && data.user) {
      setUser(data.user);
      return data;
    }
    clearUser();
    return { authenticated: false };
  } catch {
    clearUser();
    return { authenticated: false };
  }
}

/**
 * Alias para compatibilidad - usa checkSession internamente.
 */
export async function whoami() {
  const session = await checkSession();
  if (session.authenticated) {
    return session.user;
  }
  throw new Error("No autenticado");
}

/**
 * Cerrar sesión.
 * El backend revoca el JWT y borra las cookies.
 */
export async function logout() {
  try {
    await apiFetch("/auth/logout", {
      method: "POST",
      csrf: true, // Logout requiere CSRF (hay sesión activa)
    });
  } finally {
    clearUser();
  }
}

// ============================================================================
// Cases Endpoints (Secretario)
// ============================================================================

export async function fetchCases() {
  return apiFetch("/secretaria/casos", { method: "GET", csrf: true });
}

export async function createCase(data) {
  return apiFetch("/secretaria/casos", {
    method: "POST",
    body: data,
    csrf: true,
  });
}

export async function assignJudge(caseId, judgeId) {
  return apiFetch(`/secretaria/casos/${caseId}/asignar`, {
    method: "POST",
    body: { judge_id: judgeId },
    csrf: true,
  });
}

export async function fetchJudges() {
  return apiFetch("/secretaria/jueces", { method: "GET", csrf: true });
}

// ============================================================================
// Judge Endpoints (Juez)
// ============================================================================

export async function fetchMyCases() {
  return apiFetch("/juez/mis-casos", { method: "GET", csrf: true });
}

export async function createResolution(caseId, content) {
  return apiFetch(`/juez/resoluciones`, {
    method: "POST",
    body: { case_id: caseId, content },
    csrf: true,
  });
}

export async function signResolution(resolutionId) {
  return apiFetch(`/juez/resoluciones/${resolutionId}/firmar`, {
    method: "POST",
    csrf: true,
  });
}

// ============================================================================
// Opening Endpoints (Admin/Custodio)
// ============================================================================

export async function fetchOpenings() {
  return apiFetch("/aperturas", { method: "GET", csrf: true });
}

export async function createOpening(data) {
  return apiFetch("/aperturas", {
    method: "POST",
    body: data,
    csrf: true,
  });
}

export async function approveOpening(openingId) {
  return apiFetch(`/aperturas/${openingId}/aprobar`, {
    method: "POST",
    csrf: true,
  });
}

export async function fetchCustodios() {
  return apiFetch("/aperturas/custodios", { method: "GET", csrf: true });
}

// ============================================================================
// Audit Endpoints (Auditor)
// ============================================================================

export async function fetchAuditLogs(filters = {}) {
  const params = new URLSearchParams();
  if (filters.event_type) params.set("event_type", filters.event_type);
  if (filters.actor_ref) params.set("actor_ref", filters.actor_ref);
  if (filters.from_date) params.set("from_date", filters.from_date);
  if (filters.to_date) params.set("to_date", filters.to_date);
  if (filters.page) params.set("page", filters.page);
  if (filters.page_size) params.set("page_size", filters.page_size);

  const query = params.toString();
  return apiFetch(`/auditoria/logs${query ? "?" + query : ""}`, {
    method: "GET",
    csrf: true,
  });
}

// ============================================================================
// Public Endpoints (Sin autenticación)
// ============================================================================

export async function searchPublicCases(
  q = "",
  status = "",
  page = 1,
  pageSize = 10
) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  params.set("page", page);
  params.set("page_size", pageSize);

  return apiFetch(`/public/cases?${params.toString()}`, {
    method: "GET",
    csrf: false, // Endpoint público
  });
}

export async function getPublicCase(caseNumber) {
  return apiFetch(`/public/cases/${caseNumber}`, {
    method: "GET",
    csrf: false,
  });
}

export async function verifyResolution(caseNumber, documentHash) {
  return apiFetch(
    `/public/verify/${caseNumber}?document_hash=${encodeURIComponent(
      documentHash
    )}`,
    {
      method: "GET",
      csrf: false,
    }
  );
}
