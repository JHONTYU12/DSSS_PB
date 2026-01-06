import React, { useState, useEffect } from "react";
import { Card, CardHeader, Table, Button, FilterChips, useToast, StatCard, PseudoBadge, SuccessBadge } from "../common";
import { IconActivity, IconRefresh, IconFilter, IconShield, IconCheckCircle, IconXCircle } from "../icons/Icons";
import { apiFetch } from "../../api";

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

export function AuditDashboard() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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

  useEffect(() => {
    loadLogs();
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
    </div>
  );
}
