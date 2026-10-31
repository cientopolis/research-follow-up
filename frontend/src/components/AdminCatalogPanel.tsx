import React, { useState, useEffect } from 'react';

interface CatalogItem {
  uri: string;
  label: string;
  type: string;
  rank?: string;
  deadlineMonth?: string;
  subject?: string;
  externalUrl?: string;
  photoUrl?: string;
  email?: string;
}

interface LifiaMemberItem {
  slug: string;
  uriSuffix: string;
  uri: string;
  name: string;
  position: string;
  vivoType: string;
  degree: string;
  email: string;
  tags: string;
  photoUrl: string;
  profileUrl: string;
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
    photoUrl: '',
    email: '',
    subject: ''
  });
  const [csoSearch, setCsoSearch] = useState('');

  // LIFIA Auto-Import Modal state
  const [showLifiaImportModal, setShowLifiaImportModal] = useState(false);
  const [lifiaMembers, setLifiaMembers] = useState<LifiaMemberItem[]>([]);
  const [loadingLifia, setLoadingLifia] = useState(false);
  const [lifiaSearch, setLifiaSearch] = useState('');
  const [lifiaRoleFilter, setLifiaRoleFilter] = useState<'all' | 'FacultyMember' | 'GraduateStudent' | 'UndergraduateStudent'>('all');
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [typeOverrides, setTypeOverrides] = useState<{ [slug: string]: string }>({});
  const [existingPersonUris, setExistingPersonUris] = useState<Set<string>>(new Set());
  const [isImportingLifia, setIsImportingLifia] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  const openLifiaImportModal = async (forceRefresh = false) => {
    setShowLifiaImportModal(true);
    setLoadingLifia(true);
    setImportSuccessMsg(null);

    try {
      // 1. Fetch existing person URIs in GraphDB across all 3 person classes
      const existingQuery = `
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX vivo: <http://vivoweb.org/ontology/core#>
        SELECT DISTINCT ?person WHERE {
          ?person rdf:type ?type .
          FILTER(?type IN (vivo:FacultyMember, vivo:GraduateStudent, vivo:UndergraduateStudent))
        }
      `;
      const [sparqlRes, lifiaRes] = await Promise.all([
        fetchWithAuth('/api/sparql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: existingQuery, infer: false })
        }),
        fetchWithAuth(forceRefresh ? '/api/lifia-members?refresh=true' : '/api/lifia-members')
      ]);

      const existingSet = new Set<string>();
      if (sparqlRes.ok) {
        const sparqlData = await sparqlRes.json();
        (sparqlData?.results?.bindings || []).forEach((b: any) => {
          if (b?.person?.value) existingSet.add(b.person.value);
        });
      }
      setExistingPersonUris(existingSet);

      if (lifiaRes.ok) {
        const lifiaData = await lifiaRes.json();
        const members: LifiaMemberItem[] = lifiaData.members || [];
        setLifiaMembers(members);
        // Preselect all members not yet in GraphDB (or all if user wants to update)
        const initialSelected = new Set<string>();
        const initialTypes: { [slug: string]: string } = {};
        members.forEach(m => {
          initialTypes[m.slug] = m.vivoType || 'http://vivoweb.org/ontology/core#FacultyMember';
          if (!existingSet.has(m.uri)) {
            initialSelected.add(m.slug);
          }
        });
        setTypeOverrides(initialTypes);
        setSelectedSlugs(initialSelected.size > 0 ? initialSelected : new Set(members.map(m => m.slug)));
      }
    } catch (e) {
      console.error('Error al consultar directorio Memorias@LIFIA:', e);
    } finally {
      setLoadingLifia(false);
    }
  };

  const handleBulkImportLifia = async () => {
    const chosen = lifiaMembers.filter(m => selectedSlugs.has(m.slug));
    if (chosen.length === 0) return;

    setIsImportingLifia(true);
    setImportSuccessMsg(null);

    try {
      // Construir consulta SPARQL que actualiza o inserta cada integrante seleccionado
      const deleteBlocks: string[] = [];
      const insertTriples: string[] = [];

      chosen.forEach(m => {
        const targetUri = m.uri || `http://example.org/resource/${m.uriSuffix || m.slug}`;
        const targetType = typeOverrides[m.slug] || m.vivoType || 'http://vivoweb.org/ontology/core#FacultyMember';
        const escName = (m.name || '').replace(/"/g, '\\"');

        deleteBlocks.push(`
          DELETE WHERE { <${targetUri}> rdf:type vivo:FacultyMember . };
          DELETE WHERE { <${targetUri}> rdf:type vivo:GraduateStudent . };
          DELETE WHERE { <${targetUri}> rdf:type vivo:UndergraduateStudent . };
          DELETE WHERE { <${targetUri}> rdfs:label ?l . };
          DELETE WHERE { <${targetUri}> schema:image ?img . };
          DELETE WHERE { <${targetUri}> schema:url ?u . };
          DELETE WHERE { <${targetUri}> vivo:email ?em . };
          DELETE WHERE { <${targetUri}> ex:status ?st . };
          DELETE WHERE { <${targetUri}> dcterms:subject ?sub . };
        `);

        insertTriples.push(`<${targetUri}> rdf:type <${targetType}> .`);
        insertTriples.push(`<${targetUri}> rdfs:label "${escName}" .`);
        if (m.photoUrl) {
          insertTriples.push(`<${targetUri}> schema:image "${m.photoUrl.replace(/"/g, '\\"')}" .`);
        }
        if (m.profileUrl) {
          insertTriples.push(`<${targetUri}> schema:url <${m.profileUrl}> .`);
        }
        if (m.email) {
          insertTriples.push(`<${targetUri}> vivo:email "${m.email.replace(/"/g, '\\"')}" .`);
        }
        if (m.position) {
          insertTriples.push(`<${targetUri}> ex:status "${m.position.replace(/"/g, '\\"')}" .`);
        }
        if (m.tags) {
          m.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(tag => {
            insertTriples.push(`<${targetUri}> dcterms:subject "${tag.replace(/"/g, '\\"')}" .`);
          });
        }
      });

      const fullDeleteQuery = `
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX vivo: <http://vivoweb.org/ontology/core#>
        PREFIX schema: <http://schema.org/>
        PREFIX dcterms: <http://purl.org/dc/terms/>
        PREFIX ex: <http://example.org/resource/>
        ${deleteBlocks.join('\n')}
      `;

      const fullInsertQuery = `
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX vivo: <http://vivoweb.org/ontology/core#>
        PREFIX schema: <http://schema.org/>
        PREFIX dcterms: <http://purl.org/dc/terms/>
        PREFIX ex: <http://example.org/resource/>
        INSERT DATA {
          ${insertTriples.join('\n          ')}
        }
      `;

      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: fullDeleteQuery })
      });

      const insertRes = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: fullInsertQuery })
      });

      const insertData = await insertRes.json();
      if (insertData.success) {
        setImportSuccessMsg(`✅ Se sincronizaron ${chosen.length} personas desde Memorias@LIFIA en GraphDB.`);
        fetchCategoryItems(activeCategory);
        // Update existing URIs set
        const nextExisting = new Set(existingPersonUris);
        chosen.forEach(m => nextExisting.add(m.uri));
        setExistingPersonUris(nextExisting);
      }
    } catch (e) {
      console.error('Error en importación masiva desde LIFIA:', e);
      alert('Ocurrió un error al importar personas desde Memorias@LIFIA.');
    } finally {
      setIsImportingLifia(false);
    }
  };

  const fetchCategoryItems = async (typeUri: string) => {
    setLoading(true);
    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX bibo: <http://purl.org/ontology/bibo/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX schema: <http://schema.org/>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      PREFIX vivo: <http://vivoweb.org/ontology/core#>

      SELECT DISTINCT ?node ?label ?rank ?deadlineMonth ?subject ?externalUrl ?photoUrl ?email WHERE {
        ?node rdf:type <${typeUri}> .
        ?node rdfs:label ?label .
        OPTIONAL { ?node bibo:rank ?rank }
        OPTIONAL { ?node <http://example.org/resource/submissionDeadlineMonth> ?deadlineMonth }
        OPTIONAL { ?node dcterms:subject ?subject }
        OPTIONAL { ?node schema:url ?url1 }
        OPTIONAL { ?node foaf:page ?url2 }
        OPTIONAL { ?node schema:image ?img1 }
        OPTIONAL { ?node foaf:depiction ?img2 }
        OPTIONAL { ?node vivo:email ?email }
        BIND(COALESCE(?url1, ?url2) AS ?externalUrl)
        BIND(COALESCE(?img1, ?img2) AS ?photoUrl)
      } LIMIT 1000
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
          const type = typeUri;
          const rank = b.rank ? b.rank.value : undefined;
          const deadlineMonth = b.deadlineMonth ? b.deadlineMonth.value : undefined;
          const subject = b.subject ? b.subject.value : undefined;
          const externalUrl = b.externalUrl ? b.externalUrl.value : undefined;
          const photoUrl = b.photoUrl ? b.photoUrl.value : undefined;
          const email = b.email ? b.email.value : undefined;

          if (!itemMap[uri]) {
            itemMap[uri] = { uri, label, type, rank, deadlineMonth, subject, externalUrl, photoUrl, email };
          } else {
            if (rank) itemMap[uri].rank = rank;
            if (deadlineMonth) itemMap[uri].deadlineMonth = deadlineMonth;
            if (subject) {
              const currentSubjects = itemMap[uri].subject ? itemMap[uri].subject!.split(',').map(s => s.trim()) : [];
              if (!currentSubjects.includes(subject)) {
                itemMap[uri].subject = [...currentSubjects, subject].join(', ');
              }
            }
            if (externalUrl) itemMap[uri].externalUrl = externalUrl;
            if (photoUrl) itemMap[uri].photoUrl = photoUrl;
            if (email) itemMap[uri].email = email;
          }
        });
        setItems(Object.values(itemMap).sort((a, b) => a.label.localeCompare(b.label, 'es')));
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
    const { uri, label, rank, deadlineMonth, externalUrl, photoUrl, email, subject } = editingItem;

    const deleteOldTriples = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX bibo: <http://purl.org/ontology/bibo/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX schema: <http://schema.org/>
      PREFIX vivo: <http://vivoweb.org/ontology/core#>
      PREFIX ex: <http://example.org/resource/>

      DELETE WHERE { <${uri}> rdfs:label ?l . };
      DELETE WHERE { <${uri}> bibo:rank ?r . };
      DELETE WHERE { <${uri}> ex:submissionDeadlineMonth ?m . };
      DELETE WHERE { <${uri}> schema:url ?u . };
      DELETE WHERE { <${uri}> schema:image ?img . };
      DELETE WHERE { <${uri}> vivo:email ?em . };
      DELETE WHERE { <${uri}> dcterms:subject ?s . }
    `;

    let insertTriples = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX bibo: <http://purl.org/ontology/bibo/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX schema: <http://schema.org/>
      PREFIX vivo: <http://vivoweb.org/ontology/core#>
      PREFIX ex: <http://example.org/resource/>

      INSERT DATA {
        <${uri}> rdfs:label "${label.replace(/"/g, '\\"')}" .
    `;

    const isVenueCategory = activeCategory === 'http://purl.org/ontology/bibo/Conference' || activeCategory === 'http://purl.org/ontology/bibo/Journal';

    if (isVenueCategory) {
      if (rank) insertTriples += ` <${uri}> bibo:rank "${rank.replace(/"/g, '\\"')}" .`;
      if (deadlineMonth) insertTriples += ` <${uri}> ex:submissionDeadlineMonth "${deadlineMonth.replace(/"/g, '\\"')}" .`;
    }
    if (externalUrl) insertTriples += ` <${uri}> schema:url <${externalUrl}> .`;
    if (photoUrl) insertTriples += ` <${uri}> schema:image "${photoUrl.replace(/"/g, '\\"')}" .`;
    if (email) insertTriples += ` <${uri}> vivo:email "${email.replace(/"/g, '\\"')}" .`;
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
    }
    if (createForm.externalUrl) insertQuery += ` <${nodeUri}> schema:url <${createForm.externalUrl}> .`;
    if (createForm.photoUrl) insertQuery += ` <${nodeUri}> schema:image "${createForm.photoUrl.replace(/"/g, '\\"')}" .`;
    if (createForm.email) insertQuery += ` <${nodeUri}> <http://vivoweb.org/ontology/core#email> "${createForm.email.replace(/"/g, '\\"')}" .`;
    if (createForm.subject) {
      const subjects = createForm.subject.split(',').map(s => s.trim()).filter(Boolean);
      subjects.forEach(s => {
        insertQuery += ` <${nodeUri}> dcterms:subject "${s.replace(/"/g, '\\"')}" .`;
      });
    }

    insertQuery += ` }`;

    try {
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });

      setShowCreateModal(false);
      setCreateForm({ label: '', uriSuffix: '', rank: 'CORE A*', deadlineMonth: 'Marzo', externalUrl: '', photoUrl: '', email: '', subject: '' });
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            👑 Gestor del Catálogo Compartido (SuperAdmin)
          </h2>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Administrá y actualizá los recursos globales disponibles para todos los usuarios en GraphDB.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn"
            onClick={() => openLifiaImportModal(false)}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(30, 102, 245, 0.1)',
              color: '#1e66f5',
              border: '1px solid rgba(30, 102, 245, 0.3)',
              fontWeight: 700
            }}
          >
            🏛️ Carga Automática desde Memorias@LIFIA
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ➕ Crear {currentCategoryObj.clean} en el Sistema
          </button>
        </div>
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
            placeholder={
              activeCategory === 'http://purl.org/ontology/bibo/Conference' || activeCategory === 'http://purl.org/ontology/bibo/Journal'
                ? `🔍 Buscar ${currentCategoryObj.label.toLowerCase()} por nombre, rank o temática...`
                : `🔍 Buscar ${currentCategoryObj.label.toLowerCase()} por nombre, email o temática...`
            }
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
                    {item.photoUrl && (
                      <img
                        src={item.photoUrl}
                        alt={item.label}
                        referrerPolicy="no-referrer"
                        style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                    )}
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{item.label}</span>
                    {(activeCategory === 'http://purl.org/ontology/bibo/Conference' || activeCategory === 'http://purl.org/ontology/bibo/Journal') && item.rank && (
                      <span style={{
                        background: 'rgba(193,127,89,0.18)', color: '#C17F59',
                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700
                      }}>
                        {item.rank}
                      </span>
                    )}
                    {(activeCategory === 'http://purl.org/ontology/bibo/Conference' || activeCategory === 'http://purl.org/ontology/bibo/Journal') && item.deadlineMonth && (
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

                  {item.email && (
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-main)' }}>
                      ✉️ {item.email}
                    </span>
                  )}

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

                  {(activeCategory === 'http://purl.org/ontology/bibo/Conference' || activeCategory === 'http://purl.org/ontology/bibo/Journal') && (
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
                  )}

                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem' }}>URL Oficial / Perfil</label>
                    <input
                      type="text"
                      value={editingItem.externalUrl || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, externalUrl: e.target.value })}
                      placeholder="https://..."
                      style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                    />
                  </div>

                  {(activeCategory.includes('FacultyMember') || activeCategory.includes('GraduateStudent') || activeCategory.includes('UndergraduateStudent')) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label style={{ fontSize: '0.75rem' }}>URL Foto de Perfil (schema:image)</label>
                        <input
                          type="url"
                          value={editingItem.photoUrl || ''}
                          onChange={(e) => setEditingItem({ ...editingItem, photoUrl: e.target.value })}
                          placeholder="https://..."
                          style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                        />
                      </div>
                      <div className="form-group">
                        <label style={{ fontSize: '0.75rem' }}>Email (vivo:email)</label>
                        <input
                          type="email"
                          value={editingItem.email || ''}
                          onChange={(e) => setEditingItem({ ...editingItem, email: e.target.value })}
                          placeholder="nombre@lifia.info.unlp.edu.ar"
                          style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                        />
                      </div>
                    </div>
                  )}

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
            )}

            {(activeCategory.includes('FacultyMember') || activeCategory.includes('GraduateStudent') || activeCategory.includes('UndergraduateStudent')) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>URL Foto de Perfil (schema:image)</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={createForm.photoUrl}
                    onChange={(e) => setCreateForm({ ...createForm, photoUrl: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email (vivo:email)</label>
                  <input
                    type="email"
                    placeholder="nombre@lifia.info.unlp.edu.ar"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>URL Oficial / Perfil</label>
              <input
                type="text"
                placeholder="https://..."
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

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button className="btn" onClick={() => setShowCreateModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateNode}>💾 Registrar Entidad</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Carga Automática de Personas desde Memorias@LIFIA */}
      {showLifiaImportModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 750, backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'var(--bg-mantle)', padding: '28px', borderRadius: '18px',
            width: '820px', maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-color)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.35)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-main)' }}>
                  🏛️ Carga Automática de Personas desde Memorias@LIFIA
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Sincroniza integrantes desde <a href="https://memorias.lifia.info.unlp.edu.ar/members" target="_blank" rel="noopener noreferrer" style={{ color: '#1e66f5' }}>memorias.lifia.info.unlp.edu.ar/members</a> hacia el catálogo global de GraphDB (solo URLs externas, sin archivos binarios).
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="btn btn-sm"
                  onClick={() => openLifiaImportModal(true)}
                  disabled={loadingLifia}
                  title="Recargar listado desde el portal web"
                >
                  🔄 Actualizar
                </button>
                <button className="btn btn-sm" onClick={() => setShowLifiaImportModal(false)}>✕</button>
              </div>
            </div>

            {importSuccessMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: '10px',
                background: 'rgba(64, 160, 43, 0.14)', color: '#40a02b',
                border: '1px solid rgba(64, 160, 43, 0.3)', fontSize: '0.85rem', fontWeight: 600
              }}>
                {importSuccessMsg}
              </div>
            )}

            {/* Filtros y Selección Masiva */}
            <div style={{
              display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center',
              justifyContent: 'space-between', background: 'var(--bg-surface)',
              padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border-color)'
            }}>
              <input
                type="text"
                placeholder="🔍 Filtrar por nombre, cargo o email..."
                value={lifiaSearch}
                onChange={(e) => setLifiaSearch(e.target.value)}
                style={{ flex: 1, minWidth: '220px', fontSize: '0.82rem', padding: '7px 12px' }}
              />

              <select
                value={lifiaRoleFilter}
                onChange={(e) => setLifiaRoleFilter(e.target.value as any)}
                style={{ fontSize: '0.8rem', padding: '7px 10px' }}
              >
                <option value="all">Todos los roles ({lifiaMembers.length})</option>
                <option value="FacultyMember">👨‍🔬 Investigadores</option>
                <option value="GraduateStudent">🎓 Tesistas de Posgrado</option>
                <option value="UndergraduateStudent">🎓 Tesistas de Grado</option>
              </select>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const onlyNew = new Set<string>();
                    lifiaMembers.forEach(m => {
                      if (!existingPersonUris.has(m.uri)) onlyNew.add(m.slug);
                    });
                    setSelectedSlugs(onlyNew);
                  }}
                  style={{ fontSize: '0.75rem' }}
                >
                  Seleccionar nuevos
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setSelectedSlugs(new Set(lifiaMembers.map(m => m.slug)))}
                  style={{ fontSize: '0.75rem' }}
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setSelectedSlugs(new Set())}
                  style={{ fontSize: '0.75rem' }}
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* Lista de Personas de Memorias@LIFIA */}
            {loadingLifia ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                ⏳ Consultando integrantes en memorias.lifia.info.unlp.edu.ar/members...
              </div>
            ) : (
              <div style={{
                maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px',
                paddingRight: '4px'
              }}>
                {lifiaMembers
                  .filter(m => {
                    const currentType = typeOverrides[m.slug] || m.vivoType || '';
                    if (lifiaRoleFilter !== 'all' && !currentType.includes(lifiaRoleFilter)) return false;
                    const q = lifiaSearch.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      m.name.toLowerCase().includes(q) ||
                      (m.position || '').toLowerCase().includes(q) ||
                      (m.email || '').toLowerCase().includes(q) ||
                      (m.tags || '').toLowerCase().includes(q)
                    );
                  })
                  .map(m => {
                    const isChecked = selectedSlugs.has(m.slug);
                    const alreadyInDb = existingPersonUris.has(m.uri);
                    const currentType = typeOverrides[m.slug] || m.vivoType || 'http://vivoweb.org/ontology/core#FacultyMember';

                    return (
                      <div
                        key={m.slug}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                          padding: '10px 14px', borderRadius: '10px',
                          background: isChecked ? 'rgba(30, 102, 245, 0.06)' : 'var(--bg-surface)',
                          border: isChecked ? '1px solid rgba(30, 102, 245, 0.35)' : '1px solid var(--border-color)'
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const next = new Set(selectedSlugs);
                              if (e.target.checked) next.add(m.slug);
                              else next.delete(m.slug);
                              setSelectedSlugs(next);
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          {m.photoUrl ? (
                            <img
                              src={m.photoUrl}
                              alt={m.name}
                              referrerPolicy="no-referrer"
                              style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--bg-mantle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>{m.name}</span>
                              <span style={{
                                fontSize: '0.68rem', padding: '1px 7px', borderRadius: '999px',
                                background: alreadyInDb ? 'rgba(64, 160, 43, 0.14)' : 'rgba(30, 102, 245, 0.14)',
                                color: alreadyInDb ? '#40a02b' : '#1e66f5', fontWeight: 600
                              }}>
                                {alreadyInDb ? '✓ Ya en GraphDB (actualizará datos)' : '✨ Nuevo'}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              Cargo LIFIA: <strong>{m.position || 'Investigador'}</strong>
                              {m.email ? ` • ✉️ ${m.email}` : ''}
                            </span>
                          </div>
                        </label>

                        {/* Selector de Tipo VIVO */}
                        <select
                          value={currentType}
                          onChange={(e) => setTypeOverrides(prev => ({ ...prev, [m.slug]: e.target.value }))}
                          style={{ fontSize: '0.76rem', padding: '5px 8px', width: '195px', flexShrink: 0 }}
                        >
                          <option value="http://vivoweb.org/ontology/core#FacultyMember">👨‍🔬 Investigador (FacultyMember)</option>
                          <option value="http://vivoweb.org/ontology/core#GraduateStudent">🎓 Tesista Posgrado (GraduateStudent)</option>
                          <option value="http://vivoweb.org/ontology/core#UndergraduateStudent">🎓 Tesista Grado (UndergraduateStudent)</option>
                        </select>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Footer Acciones */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '4px'
            }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Seleccionados para importar/actualizar: <strong>{selectedSlugs.size}</strong> de {lifiaMembers.length}
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn" onClick={() => setShowLifiaImportModal(false)}>Cerrar</button>
                <button
                  className="btn btn-primary"
                  disabled={selectedSlugs.size === 0 || isImportingLifia}
                  onClick={handleBulkImportLifia}
                >
                  {isImportingLifia
                    ? '⏳ Sincronizando en GraphDB...'
                    : `🚀 Importar / Sincronizar Seleccionados (${selectedSlugs.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
