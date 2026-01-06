import React, { useState, useEffect } from "react";
import { Card, CardHeader, Table, Button, Modal, useToast, StatCard } from "../common";
import { IconKey, IconRefresh, IconCheck, IconX, IconUsers } from "../icons/Icons";
import { apiFetch } from "../../api";

export function CustodioDashboard() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [actionResult, setActionResult] = useState(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/aperturas/solicitudes", { method: "GET", csrf: true });
      setRequests(data || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApprove = async (decision) => {
    if (!selectedRequest) return;
    try {
      const result = await apiFetch(`/aperturas/solicitudes/${selectedRequest.id}/aprobar`, {
        method: "POST",
        csrf: true,
        body: { decision },
      });
      setActionResult(result);
      toast.success(`Solicitud ${decision === "APPROVE" ? "aprobada" : "rechazada"}`);
      loadRequests();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      PENDING: { class: "status-pending", label: "Pendiente" },
      APPROVED: { class: "status-success", label: "Aprobada" },
      REJECTED: { class: "status-error", label: "Rechazada" },
    };
    const s = statusMap[status] || { class: "status-neutral", label: status };
    return <span className={`status-badge ${s.class}`}>{s.label}</span>;
  };

  const columns = [
    {
      key: "id",
      header: "Solicitud",
      render: (val) => <span className="pseudo-ref">APT-{val}</span>,
    },
    {
      key: "case_id",
      header: "Caso",
      render: (val) => <span className="pseudo-ref">CASO-{val}</span>,
    },
    {
      key: "status",
      header: "Estado",
      render: (val) => getStatusBadge(val),
    },
    {
      key: "approvals",
      header: "Progreso",
      render: (val, row) => {
        const pct = ((val || 0) / row.m_required) * 100;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 60, height: 6, background: "var(--bg-secondary)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--success)" : "var(--accent)", transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {val || 0}/{row.m_required}
            </span>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (_, row) =>
        row.status === "PENDING" && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRequest(row);
              setShowModal(true);
              setActionResult(null);
            }}
          >
            Votar
          </Button>
        ),
    },
  ];

  const pending = requests.filter((r) => r.status === "PENDING");

  return (
    <div className="fade-in">
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard value={requests.length} label="Total Solicitudes" icon={IconKey} />
        <StatCard value={pending.length} label="Pendientes de Voto" icon={IconUsers} />
        <StatCard value={requests.filter((r) => r.status === "APPROVED").length} label="Aprobadas" icon={IconCheck} />
      </div>

      <Card>
        <CardHeader
          title="Solicitudes de Apertura"
          icon={IconKey}
          actions={
            <Button variant="secondary" onClick={loadRequests} disabled={loading}>
              <IconRefresh size={16} />
              Actualizar
            </Button>
          }
        />

        <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(251, 191, 36, 0.1)", borderRadius: "var(--radius-md)", fontSize: "0.875rem", color: "var(--accent)" }}>
          Como custodio, tu voto es necesario para aprobar solicitudes de apertura de documentos sellados.
        </div>

        <Table columns={columns} data={requests} emptyMessage="No hay solicitudes pendientes" />
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setActionResult(null);
        }}
        title="Votar Solicitud de Apertura"
        actions={
          actionResult ? (
            <Button
              onClick={() => {
                setShowModal(false);
                setActionResult(null);
              }}
            >
              Cerrar
            </Button>
          ) : (
            <>
              <Button variant="danger" onClick={() => handleApprove("REJECT")}>
                <IconX size={16} />
                Rechazar
              </Button>
              <Button onClick={() => handleApprove("APPROVE")}>
                <IconCheck size={16} />
                Aprobar
              </Button>
            </>
          )
        }
      >
        {actionResult ? (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div
              style={{
                width: 64,
                height: 64,
                background: "rgba(34, 197, 94, 0.15)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <IconCheck size={32} style={{ color: "var(--success)" }} />
            </div>
            <h3 style={{ marginBottom: 8 }}>Voto Registrado</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              Aprobaciones actuales: {actionResult.approvals} / {actionResult.m_required}
            </p>
            {actionResult.status === "APPROVED" && (
              <div style={{ marginTop: 16, padding: 12, background: "rgba(34, 197, 94, 0.1)", borderRadius: "var(--radius-md)", color: "var(--success)" }}>
                ¡La solicitud ha sido completamente aprobada!
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 20 }}>
            <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
              ¿Deseas aprobar o rechazar la solicitud{" "}
              <strong className="pseudo-ref">APT-{selectedRequest?.id}</strong>?
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
              Tu decisión quedará registrada en el sistema de auditoría.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
