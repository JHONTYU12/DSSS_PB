import React, { useState, useEffect } from "react";
import { Card, CardHeader, Table, Button, Modal, TextArea, useToast, StatCard } from "../common";
import { IconGavel, IconRefresh, IconPen, IconCheck, IconFile } from "../icons/Icons";
import { apiFetch } from "../../api";

export function JudgeDashboard() {
  const toast = useToast();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [resolutionContent, setResolutionContent] = useState("");
  const [resolutions, setResolutions] = useState([]);
  const [selectedResolution, setSelectedResolution] = useState(null);
  const [signResult, setSignResult] = useState(null);

  const loadCases = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/juez/casos", { method: "GET", csrf: true });
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

  const handleCreateResolution = async () => {
    if (!selectedCase) return;
    try {
      const result = await apiFetch("/juez/resoluciones", {
        method: "POST",
        csrf: true,
        body: {
          case_id: selectedCase.id,
          content: resolutionContent,
        },
      });
      toast.success("Resolución creada exitosamente");
      setShowResolutionModal(false);
      setResolutionContent("");
      // Add to local list for signing
      setResolutions([...resolutions, { id: result.resolution_id, case_id: selectedCase.id, status: "PENDING" }]);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleSign = async () => {
    if (!selectedResolution) return;
    try {
      const result = await apiFetch(`/juez/resoluciones/${selectedResolution.id}/firmar`, {
        method: "POST",
        csrf: true,
        body: {},
      });
      setSignResult(result);
      toast.success("Resolución firmada exitosamente");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const caseColumns = [
    { key: "case_number", header: "Número" },
    { key: "title", header: "Título" },
    {
      key: "status",
      header: "Estado",
      render: (val) => (
        <span className={`status-badge ${val === "OPEN" ? "status-success" : "status-neutral"}`}>
          {val}
        </span>
      ),
    },
  ];

  const pendingResolutions = resolutions.filter(r => r.status === "PENDING");

  return (
    <div className="fade-in">
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard value={cases.length} label="Casos Asignados" icon={IconGavel} />
        <StatCard value={pendingResolutions.length} label="Pendientes de Firma" icon={IconPen} />
        <StatCard value={resolutions.filter(r => r.status === "SIGNED").length} label="Firmadas" icon={IconCheck} />
      </div>

      <Card style={{ marginBottom: 24 }}>
        <CardHeader
          title="Mis Casos Asignados"
          icon={IconGavel}
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={loadCases} disabled={loading}>
                <IconRefresh size={16} />
                Actualizar
              </Button>
            </div>
          }
        />

        <Table
          columns={caseColumns}
          data={cases}
          onRowClick={(c) => {
            setSelectedCase(c);
            setShowResolutionModal(true);
          }}
          selectedId={selectedCase?.id}
          emptyMessage="No tienes casos asignados"
        />
        
        <div style={{ marginTop: 16, fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Haz clic en un caso para crear una resolución
        </div>
      </Card>

      {resolutions.length > 0 && (
        <Card>
          <CardHeader title="Resoluciones Creadas" icon={IconFile} />
          <Table
            columns={[
              { key: "id", header: "Ref", render: (val) => <span className="pseudo-ref">RES-{val}</span> },
              { key: "case_id", header: "Caso", render: (val) => <span className="pseudo-ref">CASO-{val}</span> },
              {
                key: "status",
                header: "Estado",
                render: (val) => (
                  <span className={`status-badge ${val === "SIGNED" ? "status-success" : "status-pending"}`}>
                    {val === "SIGNED" ? "FIRMADA" : "PENDIENTE"}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "",
                render: (_, row) =>
                  row.status !== "SIGNED" && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedResolution(row);
                        setShowSignModal(true);
                      }}
                    >
                      <IconPen size={14} />
                      Firmar
                    </Button>
                  ),
              },
            ]}
            data={resolutions}
            emptyMessage="No hay resoluciones"
          />
        </Card>
      )}

      {/* Modal: Crear Resolución */}
      <Modal
        isOpen={showResolutionModal}
        onClose={() => setShowResolutionModal(false)}
        title={`Crear Resolución — ${selectedCase?.case_number || ""}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowResolutionModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateResolution} disabled={!resolutionContent.trim()}>
              Crear Resolución
            </Button>
          </>
        }
      >
        <TextArea
          label="Contenido de la Resolución"
          value={resolutionContent}
          onChange={(e) => setResolutionContent(e.target.value)}
          placeholder="Redacta el contenido legal de la resolución..."
          rows={6}
        />
      </Modal>

      {/* Modal: Firmar Resolución */}
      <Modal
        isOpen={showSignModal}
        onClose={() => {
          setShowSignModal(false);
          setSignResult(null);
        }}
        title="Firmar Resolución"
        actions={
          signResult ? (
            <Button onClick={() => {
              setShowSignModal(false);
              setSignResult(null);
              setSelectedResolution(prev => prev ? { ...prev, status: "SIGNED" } : null);
              setResolutions(prev => prev.map(r => r.id === selectedResolution?.id ? { ...r, status: "SIGNED" } : r));
            }}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setShowSignModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSign}>
                <IconPen size={16} />
                Confirmar Firma
              </Button>
            </>
          )
        }
      >
        {signResult ? (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ width: 64, height: 64, background: "rgba(34, 197, 94, 0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <IconCheck size={32} style={{ color: "var(--success)" }} />
            </div>
            <h3 style={{ marginBottom: 8 }}>Resolución Firmada</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              La firma digital ha sido aplicada correctamente.
            </p>
            {signResult.signature && (
              <div style={{ marginTop: 16, padding: 12, background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", fontFamily: "monospace", fontSize: "0.7rem", wordBreak: "break-all", color: "var(--accent)" }}>
                {signResult.signature.substring(0, 64)}...
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 20 }}>
            <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
              ¿Estás seguro de firmar la resolución <strong className="pseudo-ref">RES-{selectedResolution?.id}</strong>?
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
              Esta acción no puede deshacerse y quedará registrada en el sistema de auditoría.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
