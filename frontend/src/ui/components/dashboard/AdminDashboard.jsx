import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardHeader, Table, Button, Modal, TextArea, Select, useToast, StatCard } from "../common";
import { IconKey, IconRefresh, IconPlus, IconUnlock, IconVideo, IconDownload, IconPlay, IconTrash } from "../icons/Icons";
import { apiFetch } from "../../api";

// Componente de video que usa Blob URL para mejor rendimiento
function VideoPlayer({ recording }) {
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    console.log('[VideoPlayer] Recording changed:', recording?.id);
    
    if (!recording?.recording_data) {
      console.log('[VideoPlayer] No recording_data');
      setBlobUrl(null);
      return;
    }

    try {
      console.log('[VideoPlayer] Converting base64, length:', recording.recording_data.length);
      console.log('[VideoPlayer] MIME type:', recording.mime_type);
      
      // Convertir base64 a Blob
      const binaryString = atob(recording.recording_data);
      console.log('[VideoPlayer] Binary length:', binaryString.length);
      
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: recording.mime_type || 'video/webm' });
      console.log('[VideoPlayer] Blob size:', blob.size);
      
      const url = URL.createObjectURL(blob);
      console.log('[VideoPlayer] Created URL:', url);
      setBlobUrl(url);
      setVideoError(null);
    } catch (e) {
      console.error('[VideoPlayer] Error creating video URL:', e);
      setVideoError(e.message);
      setBlobUrl(null);
    }

    // Cleanup
    return () => {
      if (blobUrl) {
        console.log('[VideoPlayer] Revoking URL');
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [recording?.recording_data, recording?.mime_type, recording?.id]);

  if (videoError) {
    return (
      <div style={{ 
        width: "100%", 
        padding: "20px",
        background: "rgba(239, 68, 68, 0.1)", 
        borderRadius: "var(--radius-md)",
        color: "#ef4444",
        textAlign: "center"
      }}>
        Error al cargar video: {videoError}
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div style={{ 
        width: "100%", 
        height: "200px", 
        background: "#000", 
        borderRadius: "var(--radius-md)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#666"
      }}>
        Cargando video...
      </div>
    );
  }

  return (
    <video 
      ref={videoRef}
      controls 
      autoPlay
      playsInline
      style={{ width: "100%", maxHeight: "400px", borderRadius: "var(--radius-md)", background: "#000" }}
      src={blobUrl}
      onError={(e) => {
        console.error('[VideoPlayer] Video playback error:', e.target.error);
        setVideoError('Error al reproducir el video: ' + (e.target.error?.message || 'desconocido'));
      }}
      onLoadedData={() => console.log('[VideoPlayer] Video loaded successfully')}
      onCanPlay={() => console.log('[VideoPlayer] Video can play')}
    >
      Tu navegador no soporta la reproducción de video.
    </video>
  );
}

export function AdminDashboard() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("aperturas");
  const [requests, setRequests] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState(null);
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

  const loadRecordings = async () => {
    try {
      const data = await apiFetch("/recordings/list", { method: "GET", csrf: true });
      setRecordings(data?.recordings || []);
    } catch (e) {
      toast.error("Error cargando grabaciones: " + e.message);
    }
  };

  const viewRecording = async (recordingId) => {
    try {
      const data = await apiFetch(`/recordings/${recordingId}`, { method: "GET", csrf: true });
      setSelectedRecording(data);
      setShowVideoModal(true);
    } catch (e) {
      toast.error("Error cargando grabación: " + e.message);
    }
  };

  const deleteRecording = async (recordingId) => {
    if (!confirm("¿Está seguro de eliminar esta grabación?")) return;
    try {
      await apiFetch(`/recordings/${recordingId}`, { method: "DELETE", csrf: true });
      toast.success("Grabación eliminada");
      loadRecordings();
    } catch (e) {
      toast.error("Error eliminando grabación: " + e.message);
    }
  };

  const downloadRecording = (recording) => {
    try {
      // Convertir base64 a Blob para descargar
      const binaryString = atob(recording.recording_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: recording.mime_type || 'video/webm' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      const extension = recording.mime_type?.includes('mp4') ? 'mp4' : 'webm';
      link.download = `security_${recording.username}_${recording.id}.${extension}`;
      link.click();
      
      // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      toast.error("Error al descargar: " + e.message);
    }
  };

  useEffect(() => {
    loadRequests();
    loadCases();
    loadRecordings();
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

  const recordingColumns = [
    { 
      key: "id", 
      header: "ID",
      render: (val) => <span className="pseudo-ref">REC-{val}</span>
    },
    { 
      key: "username", 
      header: "Usuario",
    },
    { 
      key: "role", 
      header: "Rol",
      render: (val) => <span className="status-badge status-neutral">{val}</span>
    },
    {
      key: "duration_seconds",
      header: "Duración",
      render: (val) => `${Math.floor(val / 60)}:${(val % 60).toString().padStart(2, '0')}`,
    },
    {
      key: "file_size",
      header: "Tamaño",
      render: (val) => `${(val / 1024).toFixed(1)} KB`,
    },
    {
      key: "uploaded_at",
      header: "Fecha",
      render: (val) => val ? new Date(val).toLocaleString() : "—",
    },
    {
      key: "actions",
      header: "Acciones",
      render: (_, row) => (
        <div style={{ display: "flex", gap: 4 }}>
          <Button variant="secondary" size="sm" onClick={() => viewRecording(row.id)}>
            <IconPlay size={14} />
            Ver
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="fade-in">
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <Button 
          variant={activeTab === "aperturas" ? "primary" : "secondary"}
          onClick={() => setActiveTab("aperturas")}
        >
          <IconUnlock size={16} />
          Solicitudes de Apertura
        </Button>
        <Button 
          variant={activeTab === "grabaciones" ? "primary" : "secondary"}
          onClick={() => setActiveTab("grabaciones")}
        >
          <IconVideo size={16} />
          Grabaciones de Seguridad ({recordings.length})
        </Button>
      </div>

      {activeTab === "aperturas" && (
        <>
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
        </>
      )}

      {activeTab === "grabaciones" && (
        <Card>
          <CardHeader
            title="Grabaciones de Seguridad"
            icon={IconVideo}
            actions={
              <Button variant="secondary" onClick={loadRecordings}>
                <IconRefresh size={16} />
                Actualizar
              </Button>
            }
          />

          <Table
            columns={recordingColumns}
            data={recordings}
            emptyMessage="No hay grabaciones de seguridad"
          />
        </Card>
      )}

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

      {/* Modal para ver grabación */}
      <Modal
        isOpen={showVideoModal}
        onClose={() => { setShowVideoModal(false); setSelectedRecording(null); }}
        title={`Grabación de Seguridad - ${selectedRecording?.username || ''}`}
        size="lg"
      >
        {selectedRecording && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <VideoPlayer recording={selectedRecording} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: "0.875rem" }}>
              <div><strong>Usuario:</strong> {selectedRecording.username}</div>
              <div><strong>Rol:</strong> {selectedRecording.role}</div>
              <div><strong>IP:</strong> {selectedRecording.ip_address || "N/A"}</div>
              <div><strong>Duración:</strong> {Math.floor(selectedRecording.duration_seconds / 60)}:{(selectedRecording.duration_seconds % 60).toString().padStart(2, '0')}</div>
              <div><strong>Tamaño:</strong> {(selectedRecording.file_size / 1024).toFixed(1)} KB</div>
              <div><strong>Fecha:</strong> {new Date(selectedRecording.uploaded_at).toLocaleString()}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
