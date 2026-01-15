import React, { useState, useCallback } from "react";
import { Card, CardHeader, Badge, Button, Input, Table, Modal } from "../common";
import { SearchIcon, FileTextIcon, ShieldCheckIcon, CheckCircleIcon, XCircleIcon, ScaleIcon } from "../icons";

/**
 * PublicCaseSearch - Componente de búsqueda pública de casos
 * 
 * SEGURIDAD:
 * - Solo muestra información pública sanitizada
 * - No expone información de jueces, secretarios o custodios
 * - Los datos sensibles nunca llegan al frontend
 */
export function PublicCaseSearch({ onGoToLogin }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [cases, setCases] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [verifyHash, setVerifyHash] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const searchCases = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("q", searchQuery);
      if (statusFilter) params.append("status", statusFilter);
      params.append("page", page.toString());
      params.append("page_size", "10");

      const res = await fetch(`/api/public/cases?${params.toString()}`);
      if (!res.ok) throw new Error("Error al buscar casos");
      const data = await res.json();
      setCases(data.cases || []);
      setPagination(data.pagination);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    searchCases(1);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!selectedCase || !verifyHash) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/public/verify/${encodeURIComponent(selectedCase.case_number)}?document_hash=${encodeURIComponent(verifyHash)}`);
      const data = await res.json();
      setVerifyResult(data);
    } catch (e) {
      setVerifyResult({ verified: false, message: "Error al verificar" });
    } finally {
      setLoading(false);
    }
  };

  const viewCaseDetails = async (caseNumber) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/cases/${encodeURIComponent(caseNumber)}`);
      if (!res.ok) throw new Error("Caso no encontrado");
      const data = await res.json();
      setSelectedCase(data);
      setVerifyHash("");
      setVerifyResult(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedCase(null);
    setVerifyHash("");
    setVerifyResult(null);
    setShowVerifyModal(false);
  };

  return (
    <div className="public-search-container">
      {/* Header público */}
      <div className="public-header">
        <div className="public-header-content">
          <div className="logo">
            <div className="logo-icon">
              <ScaleIcon size={24} />
            </div>
            <div>
              <span className="logo-text">LexSecure</span>
              <span className="logo-subtitle">Consulta Pública</span>
            </div>
          </div>
          <Button variant="secondary" onClick={onGoToLogin}>
            Acceso Personal
          </Button>
        </div>
      </div>

      <div className="public-content">
        {/* Hero section */}
        <div className="public-hero">
          <h1 className="public-title">Consulta de Casos y Resoluciones</h1>
          <p className="public-subtitle">
            Busque casos judiciales y acceda a las resoluciones firmadas digitalmente.
            La información mostrada es pública y no revela datos personales de los funcionarios.
          </p>
        </div>

        {/* Search form */}
        <Card className="search-card">
          <form onSubmit={handleSearch} className="search-form">
            <div className="search-row">
              <div className="search-input-wrapper">
                <Input
                  placeholder="Buscar por número de caso o título..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  icon={SearchIcon}
                />
              </div>
              <select 
                className="input status-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="EN PROCESO">En Proceso</option>
                <option value="RESUELTO">Resuelto</option>
              </select>
              <Button type="submit" disabled={loading}>
                {loading ? "Buscando..." : "Buscar"}
              </Button>
            </div>
          </form>
        </Card>

        {/* Error display */}
        {error && (
          <div className="public-error">
            <XCircleIcon size={20} />
            {error}
          </div>
        )}

        {/* Results */}
        {cases.length > 0 && (
          <Card>
            <CardHeader 
              title="Resultados de búsqueda" 
              icon={FileTextIcon}
            />
            <Table
              columns={[
                { key: "case_number", label: "N° Caso" },
                { key: "title", label: "Título" },
                { key: "status", label: "Estado", render: (v) => (
                  <Badge variant={v === "RESUELTO" ? "success" : "warning"}>
                    {v}
                  </Badge>
                )},
                { key: "has_resolution", label: "Resolución", render: (v) => (
                  v ? <Badge variant="success">Disponible</Badge> : <Badge variant="secondary">Pendiente</Badge>
                )},
                { key: "actions", label: "", render: (_, row) => (
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={() => viewCaseDetails(row.case_number)}
                  >
                    Ver detalles
                  </Button>
                )}
              ]}
              data={cases.map(c => ({ ...c, actions: null }))}
            />
            
            {/* Pagination */}
            {pagination && pagination.total_pages > 1 && (
              <div className="pagination">
                <Button 
                  size="sm" 
                  variant="secondary"
                  disabled={pagination.page <= 1}
                  onClick={() => searchCases(pagination.page - 1)}
                >
                  Anterior
                </Button>
                <span className="pagination-info">
                  Página {pagination.page} de {pagination.total_pages}
                </span>
                <Button 
                  size="sm" 
                  variant="secondary"
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() => searchCases(pagination.page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* No results message */}
        {!loading && cases.length === 0 && pagination && (
          <Card className="no-results">
            <FileTextIcon size={48} />
            <p>No se encontraron casos con los criterios de búsqueda.</p>
          </Card>
        )}

        {/* Security notice */}
        <div className="security-notice">
          <div>
            <strong>Información Pública Segura</strong>
            <p>
              Esta consulta solo muestra información pública. Los datos de funcionarios 
              judiciales (jueces, secretarios, custodios) están protegidos y no son visibles.
            </p>
          </div>
        </div>
      </div>

      {/* Case detail modal */}
      {selectedCase && (
        <Modal 
          isOpen={true} 
          onClose={closeModal}
          title={`Caso: ${selectedCase.case_number}`}
          size="large"
        >
          <div className="case-detail">
            <div className="case-detail-header">
              <h3>{selectedCase.title}</h3>
              <Badge variant={selectedCase.status === "RESUELTO" ? "success" : "warning"}>
                {selectedCase.status}
              </Badge>
            </div>

            {selectedCase.has_resolution && selectedCase.resolution ? (
              <div className="resolution-section">
                <h4>Resolución Firmada</h4>
                <div className="resolution-content">
                  {selectedCase.resolution.content}
                </div>
                <div className="resolution-meta">
                  <span>Fecha de firma: {selectedCase.resolution.signed_date || "N/A"}</span>
                </div>
                
                {/* Verificación de autenticidad - sin datos del firmante */}
                <div className="verify-section">
                  <h5>Verificar Autenticidad</h5>
                  <p className="verify-info">
                    Hash del documento: <code>{selectedCase.resolution.document_hash}</code>
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
                    Ingrese el hash para verificar que esta resolución es auténtica y no ha sido alterada.
                  </p>
                  <form onSubmit={handleVerify} className="verify-form">
                    <Input
                      placeholder="Hash para verificar..."
                      value={verifyHash}
                      onChange={(e) => setVerifyHash(e.target.value)}
                    />
                    <Button type="submit" size="sm" disabled={loading || !verifyHash}>
                      Verificar
                    </Button>
                  </form>
                  
                  {verifyResult && (
                    <div className={`verify-result ${verifyResult.verified ? "verified" : "not-verified"}`}>
                      {verifyResult.verified ? (
                        <><CheckCircleIcon size={20} /> {verifyResult.message}</>
                      ) : (
                        <><XCircleIcon size={20} /> {verifyResult.message}</>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="no-resolution">
                <FileTextIcon size={32} />
                <p>Este caso aún no tiene una resolución firmada disponible.</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PublicCaseSearch;
