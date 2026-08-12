import React, { useState, useEffect } from 'react';

interface CatalogItem {
  uri: string;
  label: string;
  type: string;
  rank?: string;
  deadlineMonth?: string;
  subject?: string;
  externalUrl?: string;
}

interface AdminCatalogPanelProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  STATIC_CSO_TOPICS: { uri: string; label: string }[];
  fetchCSOTopics: (search: string) => Promise<void>;
  csoTopicsList: { uri: string; label: string }[];
  isFetchingCSO: boolean;
}

const CATEGORIES = [
  { id: 'http://purl.org/ontology/bibo/Conference', label: 'Conferencias', icon: '🎤', clean: 'Conferencia' },
  { id: 'http://purl.org/ontology/bibo/Journal', label: 'Revistas / Journals', icon: '📰', clean: 'Revista / Journal' },
  { id: 'http://cso.kmi.open.ac.uk/schema/cso#Topic', label: 'Tópicos CSO', icon: '🏷️', clean: 'Tópico CSO' },
  { id: 'http://vivoweb.org/ontology/core#FacultyMember', label: 'Investigadores', icon: '👨‍🔬', clean: 'Investigador' },
  { id: 'http://vivoweb.org/ontology/core#GraduateStudent', label: 'Tesistas de Posgrado', icon: '🎓', clean: 'Tesista de Posgrado' },
  { id: 'http://vivoweb.org/ontology/core#UndergraduateStudent', label: 'Tesistas de Grado', icon: '🎓', clean: 'Tesista de Grado' },
  { id: 'http://schema.org/Dataset', label: 'Datasets', icon: '📋', clean: 'Dataset' },
  { id: 'http://schema.org/MediaObject', label: 'Archivos / Media', icon: '📄', clean: 'Archivo' },
  { id: 'http://vivoweb.org/ontology/core#Project', label: 'Proyectos', icon: '🚀', clean: 'Proyecto' }
];

export const AdminCatalogPanel: React.FC<AdminCatalogPanelProps> = ({
  fetchWithAuth,
  STATIC_CSO_TOPICS,
  fetchCSOTopics,
  csoTopicsList,
  isFetchingCSO
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('http://purl.org/ontology/bibo/Conference');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state for creating new node
  const [createForm, setCreateForm] = useState({
    label: '',
    uriSuffix: '',
    rank: 'CORE A*',
    deadlineMonth: 'Marzo',
    externalUrl: '',
    subject: ''
  });
  const [csoSearch, setCsoSearch] = useState('');

  const fetchCategoryItems = async (typeUri: string) => {
    setLoading(true);
    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX bibo: <http://purl.org/ontology/bibo/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX schema: <http://schema.org/>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>

      SELECT DISTINCT ?node ?label ?type ?rank ?deadlineMonth ?subject ?externalUrl WHERE {
        ?node rdf:type <${typeUri}> .
        ?node rdfs:label ?label .
        OPTIONAL { ?node rdf:type ?type . FILTER(?type != <http://www.w3.org/2000/01/rdf-schema#Resource>) }
        OPTIONAL { ?node bibo:rank ?rank }
        OPTIONAL { ?node <http://example.org/resource/submissionDeadlineMonth> ?deadlineMonth }
        OPTIONAL { ?node dcterms:subject ?subject }
        OPTIONAL { ?node schema:url ?url1 }
        OPTIONAL { ?node foaf:page ?url2 }
        BIND(COALESCE(?url1, ?url2) AS ?externalUrl)
      } LIMIT 200
    `;

    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, infer: true })
      });
      const data = await res.json();
      if (data.results && data.results.bindings) {
        const itemMap: { [uri: string]: CatalogItem } = {};
        data.results.bindings.forEach((b: any) => {
          const uri = b.node.value;
          const label = b.label.value;
          const type = b.type ? b.type.value : typeUri;
          const rank = b.rank ? b.rank.value : undefined;
          const deadlineMonth = b.deadlineMonth ? b.deadlineMonth.value : undefined;
          const subject = b.subject ? b.subject.value : undefined;
          const externalUrl = b.externalUrl ? b.externalUrl.value : undefined;

          if (!itemMap[uri]) {
            itemMap[uri] = { uri, label, type, rank, deadlineMonth, subject, externalUrl };
          } else {
            if (rank) itemMap[uri].rank = rank;
            if (deadlineMonth) itemMap[uri].deadlineMonth = deadlineMonth;
            if (subject) itemMap[uri].subject = subject;
            if (externalUrl) itemMap[uri].externalUrl = externalUrl;
          }
        });
        setItems(Object.values(itemMap));
      }
    } catch (e) {
      console.error('Error al cargar elementos del catálogo admin', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategoryItems(activeCategory);
    setEditingItem(null);
  }, [activeCategory]);

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    const { uri, label, rank, deadlineMonth, externalUrl, subject } = editingItem;

    const deleteOldTriples = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX bibo: <http://purl.org/ontology/bibo/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX schema: <http://schema.org/>
      PREFIX ex: <http://example.org/resource/>

      DELETE WHERE { <${uri}> rdfs:label ?l . };
      DELETE WHERE { <${uri}> bibo:rank ?r . };
      DELETE WHERE { <${uri}> ex:submissionDeadlineMonth ?m . };
      DELETE WHERE { <${uri}> schema:url ?u . };
      DELETE WHERE { <${uri}> dcterms:subject ?s . }
    `;

    let insertTriples = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX bibo: <http://purl.org/ontology/bibo/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX schema: <http://schema.org/>
      PREFIX ex: <http://example.org/resource/>

      INSERT DATA {
        <${uri}> rdfs:label "${label.replace(/"/g, '\\"')}" .
    `;

    if (rank) insertTriples += ` <${uri}> bibo:rank "${rank.replace(/"/g, '\\"')}" .`;
    if (deadlineMonth) insertTriples += ` <${uri}> ex:submissionDeadlineMonth "${deadlineMonth.replace(/"/g, '\\"')}" .`;
    if (externalUrl) insertTriples += ` <${uri}> schema:url <${externalUrl}> .`;
    if (subject) {
      const subjects = subject.split(',').map(s => s.trim()).filter(Boolean);
      subjects.forEach(s => {
        insertTriples += ` <${uri}> dcterms:subject "${s.replace(/"/g, '\\"')}" .`;
      });
    }
    insertTriples += ` }`;

    try {
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: deleteOldTriples })
      });
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertTriples })
      });

      setEditingItem(null);
      fetchCategoryItems(activeCategory);
    } catch (e) {
      console.error('Error guardando edición en GraphDB:', e);
      alert('Error al guardar los cambios en GraphDB.');
    }
  };

  const handleDeleteGlobal = async (item: CatalogItem) => {
    if (!confirm(`¿Eliminar GLOBALMENTE de GraphDB la entidad "${item.label}"?\nEsta acción afectará a todos los usuarios.`)) {
      return;
    }

    const deleteQuery = `
      DELETE WHERE { <${item.uri}> ?p ?o . };
      DELETE WHERE { ?s ?p <${item.uri}> . }
    `;

    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: deleteQuery })
      });
      const data = await res.json();
      if (data.success) {
        fetchCategoryItems(activeCategory);
      }
    } catch (e) {
      console.error('Error al eliminar globalmente entidad:', e);
    }
  };

  const handleCreateNode = async () => {
    if (!createForm.label.trim() || !createForm.uriSuffix.trim()) {
      alert('Por favor completa la etiqueta y el sufijo de URI.');
      return;
    }

    const cleanSuffix = createForm.uriSuffix.trim().replace(/\s+/g, '');
    const nodeUri = `http://example.org/resource/${cleanSuffix}`;

    let insertQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX bibo: <http://purl.org/ontology/bibo/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX schema: <http://schema.org/>
      PREFIX ex: <http://example.org/resource/>

      INSERT DATA {
        <${nodeUri}> rdf:type <${activeCategory}> .
        <${nodeUri}> rdfs:label "${createForm.label.replace(/"/g, '\\"')}" .
    `;

    if (activeCategory === 'http://purl.org/ontology/bibo/Conference' || activeCategory === 'http://purl.org/ontology/bibo/Journal') {
      if (createForm.rank) insertQuery += ` <${nodeUri}> bibo:rank "${createForm.rank}" .`;
      if (createForm.deadlineMonth) insertQuery += ` <${nodeUri}> ex:submissionDeadlineMonth "${createForm.deadlineMonth}" .`;
      if (createForm.externalUrl) insertQuery += ` <${nodeUri}> schema:url <${createForm.externalUrl}> .`;
      if (createForm.subject) {
        const subjects = createForm.subject.split(',').map(s => s.trim()).filter(Boolean);
        subjects.forEach(s => {
          insertQuery += ` <${nodeUri}> dcterms:subject "${s.replace(/"/g, '\\"')}" .`;
        });
      }
    }

    insertQuery += ` }`;

    try {
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });

      setShowCreateModal(false);
      setCreateForm({ label: '', uriSuffix: '', rank: 'CORE A*', deadlineMonth: 'Marzo', externalUrl: '', subject: '' });
      setCsoSearch('');
      fetchCategoryItems(activeCategory);
    } catch (e) {
      console.error('Error al crear nodo administrativo:', e);
    }
  };

  const filteredItems = items.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (item.label || '').toLowerCase().includes(q) ||
      (item.rank || '').toLowerCase().includes(q) ||
      (item.subject || '').toLowerCase().includes(q) ||
      (item.externalUrl || '').toLowerCase().includes(q) ||
      item.uri.toLowerCase().includes(q)
    );
  });

  const currentCategoryObj = CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1, padding: '24px 32px',
      background: 'var(--bg-base)', overflowY: 'auto', gap: '20px'
    }}>
      {/* Panel Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            👑 Gestor del Catálogo Compartido (SuperAdmin)
          </h2>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Administrá y actualizá los recursos globales disponibles para todos los usuarios en GraphDB.
          </span>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
          style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          ➕ Crear {currentCategoryObj.clean} en el Sistema
        </button>
      </div>

      {/* Categories Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: isActive ? '1px solid var(--color-investigador)' : '1px solid var(--border-color)',
                background: isActive ? 'rgba(76, 79, 105, 0.12)' : 'var(--bg-surface)',
                color: isActive ? 'var(--color-investigador)' : 'var(--text-main)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter and Stats Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div style={{ flex: 1, maxWidth: '420px', position: 'relative' }}>
          <input
            type="text"
            placeholder={`🔍 Buscar ${currentCategoryObj.label.toLowerCase()} por nombre, rank o temática...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: '10px',
              border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
              color: 'var(--text-main)', fontSize: '0.85rem'
            }}
          />
        </div>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Total en la categoría: {filteredItems.length} {currentCategoryObj.label}
        </span>
      </div>

      {/* Items Table / Cards Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          ⏳ Cargando recursos de GraphDB...
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center', background: 'var(--bg-surface)',
          borderRadius: '12px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)'
        }}>
          No se encontraron registros de {currentCategoryObj.label} en el sistema.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredItems.map(item => (
            <div
              key={item.uri}
              style={{
                background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '12px',
                border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{item.label}</span>
                    {item.rank && (
                      <span style={{
                        background: 'rgba(193,127,89,0.18)', color: '#C17F59',
                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700
                      }}>
                        {item.rank}
                      </span>
                    )}
                    {item.deadlineMonth && (
                      <span style={{
                        background: 'rgba(163,217,201,0.25)', color: '#1B5346',
                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600
                      }}>
                        📅 Deadline: {item.deadlineMonth}
                      </span>
                    )}
                  </div>

                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    URI: {item.uri}
                  </span>

                  {item.externalUrl && (
                    <a
                      href={item.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      🌐 {item.externalUrl}
                    </a>
                  )}

                  {item.subject && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {item.subject.split(',').map((s, idx) => (
                        <span
                          key={idx}
                          style={{
                            background: 'rgba(76, 79, 105, 0.08)', color: 'var(--text-main)',
                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem'
                          }}
                        >
                          🏷️ {s.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => setEditingItem(editingItem?.uri === item.uri ? null : { ...item })}
                    style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleDeleteGlobal(item)}
                    style={{ padding: '6px 12px', fontSize: '0.78rem', color: '#d20f39', borderColor: '#d20f39' }}
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>

              {/* Inline Editor Form */}
              {editingItem?.uri === item.uri && (
                <div style={{
                  marginTop: '10px', paddingTop: '14px', borderTop: '1px dashed var(--border-color)',
                  display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-mantle)',
                  padding: '14px', borderRadius: '10px'
                }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-investigador)' }}>
                    ✏️ Editar Entidad en GraphDB
                  </span>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem' }}>Nombre / Etiqueta</label>
                    <input
                      type="text"
                      value={editingItem.label}
                      onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem' }}>Ranking / Cuartil</label>
                      <select
                        value={editingItem.rank || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, rank: e.target.value })}
                        style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                      >
                        <option value="">-- Sin Ranking --</option>
                        <option value="CORE A*">CORE A*</option>
                        <option value="CORE A">CORE A</option>
                        <option value="CORE B">CORE B</option>
                        <option value="CORE C">CORE C</option>
                        <option value="Q1">Q1</option>
                        <option value="Q2">Q2</option>
                        <option value="Q3">Q3</option>
                        <option value="Q4">Q4</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem' }}>Mes de Deadline</label>
                      <input
                        type="text"
                        value={editingItem.deadlineMonth || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, deadlineMonth: e.target.value })}
                        placeholder="Ej: Marzo"
                        style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem' }}>URL Oficial</label>
                    <input
                      type="text"
                      value={editingItem.externalUrl || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, externalUrl: e.target.value })}
                      placeholder="https://..."
                      style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem' }}>Temáticas (CSO)</label>
                    <input
                      type="text"
                      value={editingItem.subject || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, subject: e.target.value })}
                      placeholder="Semantic Web, Artificial Intelligence"
                      style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button className="btn btn-sm" onClick={() => setEditingItem(null)} style={{ fontSize: '0.78rem' }}>Cancelar</button>
                    <button className="btn btn-sm btn-primary" onClick={handleSaveEdit} style={{ fontSize: '0.78rem' }}>💾 Guardar en GraphDB</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Crear Nueva Entidad */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 700, backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'var(--bg-mantle)', padding: '28px', borderRadius: '18px',
            width: '460px', maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-color)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>
                ➕ Crear {currentCategoryObj.clean} en GraphDB
              </h3>
              <button className="btn btn-sm" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Etiqueta / Nombre</label>
              <input
                type="text"
                placeholder="Ej: IEEE ISWC 2026"
                value={createForm.label}
                onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Sufijo de URI</label>
              <input
                type="text"
                placeholder="Ej: ISWC2026"
                value={createForm.uriSuffix}
                onChange={(e) => setCreateForm({ ...createForm, uriSuffix: e.target.value.replace(/\s+/g, '') })}
              />
            </div>

            {(activeCategory === 'http://purl.org/ontology/bibo/Conference' || activeCategory === 'http://purl.org/ontology/bibo/Journal') && (
              <>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Ranking / Cuartil</label>
                    <select
                      value={createForm.rank}
                      onChange={(e) => setCreateForm({ ...createForm, rank: e.target.value })}
                    >
                      <option value="CORE A*">CORE A*</option>
                      <option value="CORE A">CORE A</option>
                      <option value="CORE B">CORE B</option>
                      <option value="CORE C">CORE C</option>
                      <option value="Q1">Q1</option>
                      <option value="Q2">Q2</option>
                      <option value="Q3">Q3</option>
                      <option value="Q4">Q4</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Mes de Deadline</label>
                    <select
                      value={createForm.deadlineMonth}
                      onChange={(e) => setCreateForm({ ...createForm, deadlineMonth: e.target.value })}
                    >
                      <option value="Enero">Enero</option>
                      <option value="Febrero">Febrero</option>
                      <option value="Marzo">Marzo</option>
                      <option value="Abril">Abril</option>
                      <option value="Mayo">Mayo</option>
                      <option value="Junio">Junio</option>
                      <option value="Julio">Julio</option>
                      <option value="Agosto">Agosto</option>
                      <option value="Septiembre">Septiembre</option>
                      <option value="Octubre">Octubre</option>
                      <option value="Noviembre">Noviembre</option>
                      <option value="Diciembre">Diciembre</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>URL Oficial</label>
                  <input
                    type="text"
                    placeholder="https://iswc2026.semanticweb.org"
                    value={createForm.externalUrl}
                    onChange={(e) => setCreateForm({ ...createForm, externalUrl: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ position: 'relative' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>🏷️ Temáticas CSO (Autocompletar)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Escriba para sugerir tópicos CSO..."
                    value={csoSearch}
                    onFocus={() => fetchCSOTopics('a')}
                    onChange={(e) => {
                      setCsoSearch(e.target.value);
                      fetchCSOTopics(e.target.value);
                    }}
                  />

                  {csoTopicsList.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, width: '100%',
                      maxHeight: '140px', overflowY: 'auto', background: 'var(--bg-mantle)',
                      border: '1px solid var(--border-color)', borderRadius: '8px', zIndex: 10
                    }}>
                      {csoTopicsList.map(t => (
                        <div
                          key={t.uri}
                          onClick={() => {
                            const current = createForm.subject ? createForm.subject.split(',').map(s => s.trim()) : [];
                            if (!current.includes(t.label)) {
                              current.push(t.label);
                              setCreateForm({ ...createForm, subject: current.join(', ') });
                            }
                            setCsoSearch('');
                          }}
                          style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
                        >
                          🏷️ {t.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {createForm.subject && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Temáticas seleccionadas: <strong>{createForm.subject}</strong>
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button className="btn" onClick={() => setShowCreateModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateNode}>💾 Registrar Entidad</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
