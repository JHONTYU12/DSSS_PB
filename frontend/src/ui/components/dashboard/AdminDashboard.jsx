import React, { useState, useEffect } from "react";
import { Card, CardHeader, Table, Button, Modal, TextArea, Select, useToast, StatCard } from "../common";
import { IconKey, IconRefresh, IconPlus, IconUnlock } from "../icons/Icons";
import { apiFetch } from "../../api";

export function AdminDashboard() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState("");
  const [reason, setReason] = useState("");
  const [mRequired, setMRequired] = useState("2");

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

  const loadCases = async () => {
    try {
      const data = await apiFetch("/secretaria/casos", { method: "GET", csrf: true });
      setCases(data || []);
    } catch (e) {
      // Silently fail - might not have permission
    }
  };

  useEffect(() => {
    loadRequests();
    loadCases();
  }, []);

  const handleCreate = async () => {
    try {
      await apiFetch("/aperturas/solicitudes", {
        method: "POST",
        csrf: true,
        body: {
          case_id: Number(selectedCase),
          reason,
          m_required: Number(mRequired),
        },
      });
      toast.success("Solicitud de apertura creada");
      setShowModal(false);
      setSelectedCase("");
      setReason("");
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
      render: (val) => <span className="pseudo-ref">APT-{val}</span>
    },
    { 
      key: "case_id", 
      header: "Caso",
      render: (val) => <span className="pseudo-ref">CASO-{val}</span>
    },
    { 
      key: "status", 
      header: "Estado",
      render: (val) => getStatusBadge(val)
    },
    {
      key: "approvals",
      header: "Aprobaciones",
      render: (val, row) => (
        <span style={{ color: val >= row.m_required ? "var(--success)" : "var(--text-secondary)" }}>
          {val || 0} / {row.m_required}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Fecha",
      render: (val) => val ? new Date(val).toLocaleDateString() : "—",
    },
  ];

  const pending = requests.filter(r => r.status === "PENDING");
  const approved = requests.filter(r => r.status === "APPROVED");

  return (
    <div className="fade-in">
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard value={requests.length} label="Total Solicitudes" icon={IconKey} />
        <StatCard value={pending.length} label="Pendientes" icon={IconUnlock} />
        <StatCard value={approved.length} label="Aprobadas" icon={IconKey} />
      </div>

      <Card>
        <CardHeader
          title="Solicitudes de Apertura"
          icon={IconUnlock}
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={loadRequests} disabled={loading}>
                <IconRefresh size={16} />
                Actualizar
              </Button>
              <Button onClick={() => setShowModal(true)}>
                <IconPlus size={16} />
                Nueva Solicitud
              </Button>
            </div>
          }
        />

        <Table
          columns={columns}
          data={requests}
          emptyMessage="No hay solicitudes de apertura"
        />
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Nueva Solicitud de Apertura"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!selectedCase || !reason.trim()}>
              Crear Solicitud
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Select
            label="Caso"
            value={selectedCase}
            onChange={(e) => setSelectedCase(e.target.value)}
            placeholder="Seleccionar caso..."
            options={cases.map((c) => ({
              value: String(c.id),
              label: `${c.case_number} — ${c.title}`,
            }))}
          />
          <Select
            label="Aprobaciones Requeridas (M de N)"
            value={mRequired}
            onChange={(e) => setMRequired(e.target.value)}
            options={[
              { value: "1", label: "1 custodio" },
              { value: "2", label: "2 custodios" },
              { value: "3", label: "3 custodios" },
            ]}
          />
          <TextArea
            label="Justificación Legal"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describa la razón legal para solicitar la apertura..."
            rows={4}
          />
        </div>
      </Modal>
    </div>
  );
}
