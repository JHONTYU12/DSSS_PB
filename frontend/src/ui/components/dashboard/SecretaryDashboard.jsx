import React, { useState, useEffect } from "react";
import { Card, CardHeader, Table, Button, Modal, Input, TextArea, Select, useToast, StatCard } from "../common";
import { IconFolder, IconPlus, IconRefresh, IconFile } from "../icons/Icons";
import { apiFetch } from "../../api";

export function SecretaryDashboard() {
  const toast = useToast();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    caseNumber: "",
    title: "",
    parties: "",
    assignJudge: "",
  });

  const loadCases = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/secretaria/casos", { method: "GET", csrf: true });
      setCases(data || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  const handleCreate = async () => {
    try {
      await apiFetch("/secretaria/casos", {
        method: "POST",
        csrf: true,
        body: {
          case_number: formData.caseNumber,
          title: formData.title,
          parties: formData.parties,
          assign_to_judge_username: formData.assignJudge || null,
        },
      });
      toast.success("Caso creado exitosamente");
      setShowModal(false);
      setFormData({ caseNumber: "", title: "", parties: "", assignJudge: "" });
      loadCases();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const columns = [
    { key: "case_number", header: "Número" },
    { key: "title", header: "Título" },
    { 
      key: "status", 
      header: "Estado",
      render: (val) => (
        <span className={`status-badge ${val === "OPEN" ? "status-success" : "status-neutral"}`}>
          {val}
        </span>
      )
    },
    { 
      key: "created_at", 
      header: "Fecha",
      render: (val) => val ? new Date(val).toLocaleDateString() : "—"
    },
  ];

  return (
    <div className="fade-in">
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard value={cases.length} label="Total Casos" icon={IconFolder} />
        <StatCard value={cases.filter(c => c.status === "OPEN").length} label="Casos Abiertos" icon={IconFile} />
        <StatCard value={cases.filter(c => c.status === "CLOSED").length} label="Casos Cerrados" icon={IconFile} />
      </div>

      <Card>
        <CardHeader 
          title="Gestión de Casos" 
          icon={IconFolder}
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={loadCases} disabled={loading}>
                <IconRefresh size={16} />
                Actualizar
              </Button>
              <Button onClick={() => setShowModal(true)}>
                <IconPlus size={16} />
                Nuevo Caso
              </Button>
            </div>
          }
        />
        
        <Table 
          columns={columns} 
          data={cases} 
          onRowClick={setSelectedCase}
          selectedId={selectedCase?.id}
          emptyMessage="No hay casos registrados"
        />
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Crear Nuevo Caso"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!formData.caseNumber || !formData.title}>
              Crear Caso
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            label="Número de Caso"
            value={formData.caseNumber}
            onChange={(e) => setFormData({ ...formData, caseNumber: e.target.value })}
            placeholder="CN-001"
          />
          <Input
            label="Título"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Descripción breve del caso"
          />
          <TextArea
            label="Partes Involucradas"
            value={formData.parties}
            onChange={(e) => setFormData({ ...formData, parties: e.target.value })}
            placeholder="Parte A vs Parte B"
            rows={3}
          />
          <Select
            label="Asignar a Juez (opcional)"
            value={formData.assignJudge}
            onChange={(e) => setFormData({ ...formData, assignJudge: e.target.value })}
            placeholder="Seleccionar juez..."
            options={[
              { value: "juez1", label: "Juez 1" },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
