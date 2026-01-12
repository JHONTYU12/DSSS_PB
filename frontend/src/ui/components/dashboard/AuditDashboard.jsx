import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardHeader, Table, Button, FilterChips, useToast, StatCard, PseudoBadge, SuccessBadge, Modal } from "../common";
import { IconActivity, IconRefresh, IconFilter, IconShield, IconCheckCircle, IconXCircle, IconUnlock, IconEye, IconAlertTriangle, IconClock, IconVideo } from "../icons/Icons";
import { apiFetch } from "../../api";
import { SecurityRecorder } from "../security/SecurityRecorder";

const ACTION_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "AUTH", label: "Autenticación" },
  { value: "CASE", label: "Casos" },
  { value: "RESOLUTION", label: "Resoluciones" },
  { value: "OPENING", label: "Aperturas" },
];

const STATUS_FILTERS = [
  { value: "all", label: "Todo" },
  { value: "success", label: "Exitosos" },
  { value: "failed", label: "Fallidos" },
];

// Secure View Modal Component
function SecureViewModal({ opening, onClose, onViewed }) {
  const toast = useToast();
  const [stage, setStage] = useState("confirm"); // confirm | loading | countdown | viewing | expired | error
  const [token, setToken] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [viewData, setViewData] = useState(null);
  const [error, setError] = useState(null);
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const timerRef = useRef(null);

  const requestToken = async () => {
    setStage("loading");
    try {
      const data = await apiFetch(`/aperturas/solicitar-vista/${opening.id}`, {
        method: "POST",
        csrf: true
      });
      setToken(data.token);
      setSecondsLeft(data.expires_in_seconds);
      setStage("countdown");
    } catch (e) {
      setError(e.message);
      setStage("error");
    }
  };

  const handleRecordingStart = () => {
    console.log("Grabación de seguridad iniciada");
  };

  const handleRecordingEnd = () => {
    console.log("Grabación de seguridad finalizada");
  };

  const handleRecordingUploaded = (response) => {
    toast.success("Grabación de seguridad guardada exitosamente");
  };

  // Manejar cierre del modal - detener grabación
  const handleClose = () => {
    setIsRecordingActive(false);
    onClose();
  };

  const viewSecureData = async () => {
    if (!token) return;
    setStage("loading");
    try {
      const data = await apiFetch(`/aperturas/ver-seguro/${opening.id}?token=${encodeURIComponent(token)}`, {
        method: "POST",
        csrf: true
      });
      setViewData(data);
      setStage("viewing");
      // Iniciar grabación al entrar a la vista de información sensible
      setIsRecordingActive(true);
      if (timerRef.current) clearInterval(timerRef.current);
      onViewed?.();
    } catch (e) {
      setError(e.message);
      setStage("error");
    }
  };

  // Countdown timer
  useEffect(() => {
    if (stage === "countdown" && secondsLeft > 0) {
      timerRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setStage("expired");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [stage]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const renderContent = () => {
    switch (stage) {
      case "confirm":
        return (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ 
              width: 80, height: 80, borderRadius: "50%", 
              background: "rgba(251, 191, 36, 0.15)", 
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px"
            }}>
              <IconShield size={40} style={{ color: "var(--accent)" }} />
            </div>
            <h3 style={{ margin: "0 0 12px", fontSize: "1.25rem" }}>Vista Segura de Apertura</h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
              Estás a punto de acceder a información sensible del caso <strong>{opening.case_number}</strong>.
            </p>
            <div style={{ 
              background: "rgba(239, 68, 68, 0.1)", 
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              marginBottom: 20,
              textAlign: "left"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <IconAlertTriangle size={20} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: "0.875rem" }}>
                  <strong style={{ color: "#ef4444" }}>Advertencia de Seguridad:</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: "var(--text-secondary)" }}>
                    <li>Esta información solo puede verse <strong>UNA VEZ</strong></li>
                    <li>Tendrás <strong>2 minutos</strong> para acceder</li>
                    <li>Todo acceso queda registrado en auditoría</li>
                    <li>No podrás volver a ver esta información</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );

      case "loading":
        return (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
            <p style={{ color: "var(--text-secondary)" }}>Procesando solicitud segura...</p>
          </div>
        );

      case "countdown":
        const progress = (secondsLeft / 120) * 100;
        const isUrgent = secondsLeft <= 30;
        return (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ 
              width: 100, height: 100, borderRadius: "50%", 
              background: isUrgent ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)", 
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px",
              position: "relative"
            }}>
              <svg style={{ position: "absolute", transform: "rotate(-90deg)" }} width="100" height="100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                <circle 
                  cx="50" cy="50" r="45" fill="none" 
                  stroke={isUrgent ? "#ef4444" : "#22c55e"} 
                  strokeWidth="6"
                  strokeDasharray={`${progress * 2.83} 283`}
                  style={{ transition: "stroke-dasharray 1s linear" }}
                />
              </svg>
              <IconClock size={36} style={{ color: isUrgent ? "#ef4444" : "#22c55e" }} />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: "2rem", fontFamily: "monospace", color: isUrgent ? "#ef4444" : "var(--text-primary)" }}>
              {formatTime(secondsLeft)}
            </h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
              Token de vista única generado. Haz clic para ver la información.
            </p>
            
            {/* Advertencia de grabación */}
            <div style={{ 
              background: "rgba(239, 68, 68, 0.1)", 
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 12
            }}>
              <IconVideo size={24} style={{ color: "#ef4444", flexShrink: 0 }} />
              <div style={{ textAlign: "left", fontSize: "0.875rem" }}>
                <strong style={{ color: "#ef4444" }}>⚠️ AVISO DE GRABACIÓN:</strong>
                <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
                  Al ver la información, serás <strong>grabado (video y audio)</strong> durante todo el tiempo que tengas abierta esta pantalla. La grabación se guardará como evidencia forense.
                </p>
              </div>
            </div>
            
            <Button onClick={viewSecureData} style={{ width: "100%" }}>
              <IconEye size={18} />
              Acepto ser grabado - Ver Información
            </Button>
          </div>
        );

      case "viewing":
        return (
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {/* Indicador de grabación activa */}
            <div style={{ 
              background: "rgba(239, 68, 68, 0.15)", 
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "var(--radius-md)",
              padding: "10px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ 
                  width: 12, height: 12, borderRadius: "50%", 
                  background: "#ef4444",
                  animation: "pulse 1s infinite"
                }}></span>
                <IconVideo size={18} style={{ color: "#ef4444" }} />
                <span style={{ fontWeight: 600, color: "#ef4444", fontSize: "0.875rem" }}>
                  GRABANDO - Sesión de Seguridad Activa
                </span>
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                La grabación finalizará al cerrar esta ventana
              </span>
            </div>

            {/* SecurityRecorder - solo activo durante viewing */}
            <SecurityRecorder 
              isActive={isRecordingActive}
              onRecordingStart={handleRecordingStart}
              onRecordingEnd={handleRecordingEnd}
              onRecordingUploaded={handleRecordingUploaded}
              maxDurationMs={120000}
            />

            <div style={{ 
              background: "rgba(34, 197, 94, 0.1)", 
              border: "1px solid rgba(34, 197, 94, 0.3)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 12
            }}>
              <IconCheckCircle size={20} style={{ color: "#22c55e" }} />
              <span style={{ fontSize: "0.875rem" }}>
                Vista única registrada: {viewData?.viewed_at ? new Date(viewData.viewed_at).toLocaleString() : "—"}
              </span>
            </div>

            {/* Case Information */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 12px", color: "var(--accent)", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Información del Caso
              </h4>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)", padding: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 16px", fontSize: "0.9rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>Número:</span>
                  <span style={{ fontWeight: 500 }}>{viewData?.case?.case_number}</span>
                  <span style={{ color: "var(--text-muted)" }}>Título:</span>
                  <span>{viewData?.case?.title}</span>
                  <span style={{ color: "var(--text-muted)" }}>Partes:</span>
                  <span>{viewData?.case?.parties}</span>
                  <span style={{ color: "var(--text-muted)" }}>Estado:</span>
                  <span>{viewData?.case?.status}</span>
                </div>
              </div>
            </div>

            {/* Judge Information */}
            {viewData?.judge && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: "0 0 12px", color: "var(--accent)", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Juez Asignado
                </h4>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)", padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ 
                      width: 40, height: 40, borderRadius: "50%", 
                      background: "var(--accent)", 
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 600, fontSize: "1.1rem"
                    }}>
                      {viewData.judge.username?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{viewData.judge.username}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        {viewData.judge.role}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resolutions */}
            {viewData?.resolutions?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: "0 0 12px", color: "var(--accent)", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Resoluciones ({viewData.resolutions.length})
                </h4>
                {viewData.resolutions.map((res, idx) => (
                  <div key={res.id} style={{ 
                    background: "rgba(255,255,255,0.03)", 
                    borderRadius: "var(--radius-md)", 
                    padding: 16,
                    marginBottom: 8
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontWeight: 500 }}>Resolución #{idx + 1}</span>
                      <span className={`status-badge ${res.status === "SIGNED" ? "status-success" : "status-pending"}`}>
                        {res.status}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
                      {res.content}
                    </p>
                    {res.doc_hash && (
                      <div style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-muted)", wordBreak: "break-all" }}>
                        Hash: {res.doc_hash}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Custodian Approvals */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 12px", color: "var(--accent)", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Custodios que Aprobaron
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {viewData?.custodian_approvals?.map((name, idx) => (
                  <span key={idx} style={{ 
                    background: "rgba(251, 191, 36, 0.15)", 
                    padding: "6px 12px", 
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.875rem"
                  }}>
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {/* Opening Reason */}
            <div>
              <h4 style={{ margin: "0 0 12px", color: "var(--accent)", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Razón de Apertura
              </h4>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)", padding: 16 }}>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{viewData?.reason}</p>
              </div>
            </div>

            {/* Security Notice */}
            <div style={{ 
              marginTop: 20,
              background: "rgba(239, 68, 68, 0.08)", 
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              fontSize: "0.8rem",
              color: "var(--text-secondary)"
            }}>
              <strong style={{ color: "#ef4444" }}>⚠️ Aviso:</strong> {viewData?.security_notice}
            </div>
          </div>
        );

      case "expired":
        return (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ 
              width: 80, height: 80, borderRadius: "50%", 
              background: "rgba(239, 68, 68, 0.15)", 
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px"
            }}>
              <IconXCircle size={40} style={{ color: "#ef4444" }} />
            </div>
            <h3 style={{ margin: "0 0 12px", color: "#ef4444" }}>Token Expirado</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              El tiempo para ver la información ha expirado. Puedes solicitar un nuevo token.
            </p>
          </div>
        );

      case "error":
        return (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ 
              width: 80, height: 80, borderRadius: "50%", 
              background: "rgba(239, 68, 68, 0.15)", 
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px"
            }}>
              <IconAlertTriangle size={40} style={{ color: "#ef4444" }} />
            </div>
            <h3 style={{ margin: "0 0 12px", color: "#ef4444" }}>Error</h3>
            <p style={{ color: "var(--text-secondary)" }}>{error}</p>
          </div>
        );

      default:
        return null;
    }
  };

  const getActions = () => {
    switch (stage) {
      case "confirm":
        return (
          <>
            <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
            <Button onClick={requestToken}>
              <IconUnlock size={16} />
              Solicitar Acceso Seguro
            </Button>
          </>
        );
      case "expired":
        return (
          <>
            <Button variant="secondary" onClick={handleClose}>Cerrar</Button>
            <Button onClick={requestToken}>Solicitar Nuevo Token</Button>
          </>
        );
      case "viewing":
        return (
          <Button onClick={handleClose}>
            Cerrar y Finalizar Grabación
          </Button>
        );
      case "error":
        return <Button onClick={handleClose}>Cerrar</Button>;
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={true} onClose={stage === "viewing" ? handleClose : undefined} title="🔐 Acceso Seguro" size="lg" actions={getActions()}>
      {renderContent()}
    </Modal>
  );
}

export function AuditDashboard() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [approvedOpenings, setApprovedOpenings] = useState([]);
  const [selectedOpening, setSelectedOpening] = useState(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/auditoria/logs", { method: "GET", csrf: true });
      setLogs(data || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadApprovedOpenings = async () => {
    try {
      const data = await apiFetch("/aperturas/aprobadas", { method: "GET", csrf: true });
      setApprovedOpenings(data || []);
    } catch (e) {
      // Silently fail - might not have permissions or no openings
      console.log("No approved openings available");
    }
  };

  useEffect(() => {
    loadLogs();
    loadApprovedOpenings();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (actionFilter !== "all" && !log.action?.startsWith(actionFilter)) return false;
    if (statusFilter === "success" && !log.success) return false;
    if (statusFilter === "failed" && log.success) return false;
    return true;
  });

  const columns = [
    {
      key: "ts",
      header: "Fecha/Hora",
      width: "160px",
      render: (val) => (
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          {val ? new Date(val).toLocaleString("es-ES", { 
            day: "2-digit", 
            month: "2-digit", 
            hour: "2-digit", 
            minute: "2-digit" 
          }) : "—"}
        </span>
      ),
    },
    {
      key: "actor_ref",
      header: "Actor",
      render: (val, row) => <PseudoBadge value={val || row.actor} />,
    },
    {
      key: "role",
      header: "Rol",
      width: "100px",
      render: (val) => (
        <span style={{ 
          fontSize: "0.7rem", 
          color: "var(--text-muted)", 
          textTransform: "uppercase",
          letterSpacing: "0.03em"
        }}>
          {val || "—"}
        </span>
      ),
    },
    {
      key: "action",
      header: "Acción",
      render: (val) => {
        const actionColors = {
          AUTH: "var(--accent)",
          CASE: "#60a5fa",
          RESOLUTION: "#a78bfa",
          OPENING: "#34d399",
        };
        const prefix = val?.split("_")[0];
        return (
          <span style={{ 
            fontSize: "0.8rem", 
            fontWeight: 500,
            color: actionColors[prefix] || "var(--text-primary)"
          }}>
            {val}
          </span>
        );
      },
    },
    {
      key: "target_ref",
      header: "Objetivo",
      render: (val, row) => <PseudoBadge value={val || row.target} />,
    },
    {
      key: "ip",
      header: "IP",
      width: "110px",
      render: (val) => (
        <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
          {val || "—"}
        </span>
      ),
    },
    {
      key: "success",
      header: "Estado",
      width: "80px",
      render: (val) => <SuccessBadge success={val} />,
    },
  ];

  const successCount = logs.filter((l) => l.success).length;
  const failedCount = logs.filter((l) => !l.success).length;

  return (
    <div className="fade-in">
      {/* Pending Secure Openings Alert */}
      {approvedOpenings.length > 0 && (
        <div style={{ 
          marginBottom: 24, 
          padding: "20px", 
          background: "linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 100%)", 
          border: "2px solid rgba(251, 191, 36, 0.4)",
          borderRadius: "var(--radius-lg)",
          animation: "pulse 2s infinite"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ 
              width: 48, height: 48, borderRadius: "50%", 
              background: "var(--accent)", 
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <IconUnlock size={24} style={{ color: "black" }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "1.1rem", marginBottom: 2 }}>
                {approvedOpenings.length} Apertura{approvedOpenings.length > 1 ? "s" : ""} Pendiente{approvedOpenings.length > 1 ? "s" : ""} de Visualización
              </div>
              <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                Hay aperturas aprobadas que requieren su atención. Solo puede ver cada una una vez.
              </div>
            </div>
          </div>
          
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {approvedOpenings.map(opening => (
              <button
                key={opening.id}
                onClick={() => setSelectedOpening(opening)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  color: "var(--text-primary)"
                }}
                onMouseOver={e => e.currentTarget.style.background = "rgba(251, 191, 36, 0.2)"}
                onMouseOut={e => e.currentTarget.style.background = "rgba(0,0,0,0.3)"}
              >
                <IconEye size={18} style={{ color: "var(--accent)" }} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{opening.case_number}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {opening.reason?.substring(0, 30)}...
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ 
        marginBottom: 24, 
        padding: "16px 20px", 
        background: "rgba(251, 191, 36, 0.08)", 
        border: "1px solid rgba(251, 191, 36, 0.2)",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        alignItems: "center",
        gap: 12
      }}>
        <IconShield size={24} style={{ color: "var(--accent)" }} />
        <div>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>Logs Anonimizados</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Los identificadores de actores y objetivos están pseudonimizados con HMAC-SHA256 para proteger la privacidad.
          </div>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard value={logs.length} label="Total Eventos" icon={IconActivity} />
        <StatCard value={successCount} label="Exitosos" icon={IconCheckCircle} />
        <StatCard value={failedCount} label="Fallidos" icon={IconXCircle} />
      </div>

      <Card>
        <CardHeader
          title="Registro de Auditoría"
          icon={IconActivity}
          actions={
            <Button variant="secondary" onClick={loadLogs} disabled={loading}>
              <IconRefresh size={16} />
              Actualizar
            </Button>
          }
        />

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <IconFilter size={14} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Filtrar por Tipo
            </span>
          </div>
          <FilterChips filters={ACTION_FILTERS} activeFilter={actionFilter} onFilterChange={setActionFilter} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <IconFilter size={14} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Filtrar por Estado
            </span>
          </div>
          <FilterChips filters={STATUS_FILTERS} activeFilter={statusFilter} onFilterChange={setStatusFilter} />
        </div>

        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 12 }}>
          Mostrando {filteredLogs.length} de {logs.length} eventos
        </div>

        <Table columns={columns} data={filteredLogs.slice(0, 100)} emptyMessage="No hay eventos de auditoría" />
        
        {filteredLogs.length > 100 && (
          <div style={{ textAlign: "center", padding: 16, color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Mostrando los primeros 100 resultados
          </div>
        )}
      </Card>

      {/* Secure View Modal */}
      {selectedOpening && (
        <SecureViewModal 
          opening={selectedOpening} 
          onClose={() => setSelectedOpening(null)}
          onViewed={() => {
            loadApprovedOpenings();
            loadLogs();
          }}
        />
      )}
    </div>
  );
}
