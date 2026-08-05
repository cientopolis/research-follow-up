import React, { useState, useEffect, useRef } from 'react';

interface RDFNode {
  uri: string;
  label: string;
  type: string;
  x: number;
  y: number;
  status?: string;
}

interface RDFConnection {
  id: string;
  from: string;
  to: string;
  predicate: string;
}

export default function App() {
  const isDev = import.meta.env.DEV;
  const [nodes, setNodes] = useState<RDFNode[]>([]);
  const [connections, setConnections] = useState<RDFConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<RDFNode | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<RDFConnection | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<RDFNode | null>(null);
  
  // Navigation / Canvas Transforms
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Node Drag & Drop
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Creation State
  const [isConnectingMode, setIsConnectingMode] = useState(false);
  const [connectSourceNode, setConnectSourceNode] = useState<string | null>(null);
  const [showNewNodeModal, setShowNewNodeModal] = useState(false);
  const [newNodeData, setNewNodeData] = useState({ label: '', type: 'http://vivoweb.org/ontology/core#GraduateStudent', uriSuffix: '' });

  // SPARQL console
  const [sparqlQuery, setSparqlQuery] = useState(`PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX vivo: <http://vivoweb.org/ontology/core#>
PREFIX dblp: <https://dblp.org/rdf/schema#>

SELECT ?s ?p ?o WHERE {
  ?s ?p ?o .
} LIMIT 10`);
  const [sparqlResult, setSparqlResult] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Load data from GraphDB
  const fetchGraphData = async () => {
    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX ex: <http://example.org/resource/>

      SELECT DISTINCT ?node ?label ?type ?x ?y ?status WHERE {
        ?node rdf:type ?type .
        ?node rdfs:label ?label .
        OPTIONAL { ?node ex:posX ?x }
        OPTIONAL { ?node ex:posY ?y }
        OPTIONAL { ?node ex:status ?status }
        FILTER(STRSTARTS(STR(?node), "http://example.org/"))
      }
    `;

    try {
      const response = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      
      if (data.results && data.results.bindings) {
        const nodeMap: { [uri: string]: RDFNode } = {};
        
        data.results.bindings.forEach((b: any) => {
          const uri = b.node.value;
          const type = b.type.value;
          
          // Si ya existe la URI, preferimos tipos de la ontología VIVO, o más específicos en su defecto
          if (nodeMap[uri]) {
            const currentType = nodeMap[uri].type;
            const isCurrentVivo = currentType.includes('vivoweb.org');
            const isNewVivo = type.includes('vivoweb.org');
            
            if (!isCurrentVivo && isNewVivo) {
              nodeMap[uri].type = type; // Priorizar VIVO
            } else if (isCurrentVivo === isNewVivo) {
              if (currentType.includes('Publication') || currentType.includes('Thing')) {
                nodeMap[uri].type = type; // Más específico
              }
            }
            return;
          }
          
          nodeMap[uri] = {
            uri,
            label: b.label.value,
            type,
            x: b.x ? parseFloat(b.x.value) : Math.random() * 400 + 100,
            y: b.y ? parseFloat(b.y.value) : Math.random() * 300 + 100,
            status: b.status ? b.status.value : undefined
          };
        });

        const loadedNodes = Object.values(nodeMap);
        setNodes(loadedNodes);
        
        // Fetch connections
        await fetchConnections();
      }
    } catch (e) {
      console.error("Error al cargar nodos de GraphDB", e);
    }
  };

  const fetchConnections = async () => {
    const query = `
      SELECT ?from ?predicate ?to WHERE {
        ?from ?predicate ?to .
        FILTER(STRSTARTS(STR(?from), "http://example.org/") && STRSTARTS(STR(?to), "http://example.org/"))
        FILTER(?predicate != <http://example.org/resource/posX> && ?predicate != <http://example.org/resource/posY> && ?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> && ?predicate != <http://www.w3.org/2000/01/rdf-schema#label> && ?predicate != <http://example.org/resource/status>)
      }
    `;

    try {
      const response = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      
      if (data.results && data.results.bindings) {
        const loadedConns: RDFConnection[] = data.results.bindings.map((b: any, index: number) => ({
          id: `conn-${index}`,
          from: b.from.value,
          to: b.to.value,
          predicate: b.predicate.value
        }));
        setConnections(loadedConns);
      }
    } catch (e) {
      console.error("Error al cargar conexiones", e);
    }
  };

  useEffect(() => {
    fetchGraphData();
  }, []);

  // Seed Data Loader
  const loadSeedData = async () => {
    const seedQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX vivo: <http://vivoweb.org/ontology/core#>
      PREFIX dblp: <https://dblp.org/rdf/schema#>
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX cso: <http://cso.kmi.open.ac.uk/schema/cso#>
      PREFIX ex: <http://example.org/resource/>

      INSERT DATA {
        ex:TuUsuario a vivo:FacultyMember ;
                     rdfs:label "Dr. Torres" ;
                     ex:posX 400 ;
                     ex:posY 300 .
                     
        ex:AnaGomez a vivo:GraduateStudent ;
                    rdfs:label "Lic. Ana Gómez" ;
                    ex:posX 650 ;
                    ex:posY 150 .
                    
        ex:ProyectoPICTGrafos a vivo:Project ;
                              rdfs:label "PICT-Grafos" ;
                              ex:posX 150 ;
                              ex:posY 300 .

        ex:PaperGNN a dblp:Article ;
                    rdfs:label "GNN for Link Prediction" ;
                    ex:status "In Review" ;
                    ex:posX 900 ;
                    ex:posY 100 .

        ex:TopicGNN a cso:Topic ;
                    rdfs:label "Graph Neural Networks" ;
                    ex:posX 900 ;
                    ex:posY -50 .

        ex:TuUsuario vivo:advisor ex:AnaGomez .
        ex:AnaGomez vivo:contributorTo ex:ProyectoPICTGrafos .
        ex:PaperGNN dblp:authoredBy ex:AnaGomez .
        ex:PaperGNN dct:subject ex:TopicGNN .
      }
    `;

    try {
      const response = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: seedQuery })
      });
      const resData = await response.json();
      if (resData.success) {
        fetchGraphData();
      }
    } catch (e) {
      console.error("Error cargando semilla", e);
    }
  };

  // Run custom SPARQL Query
  const runCustomSPARQL = async () => {
    try {
      const response = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sparqlQuery })
      });
      const data = await response.json();
      setSparqlResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setSparqlResult("Error: " + e.message);
    }
  };

  // Canvas Pan & Zoom Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-viewport')) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    } else if (draggingNodeId) {
      const updatedNodes = nodes.map(n => {
        if (n.uri === draggingNodeId) {
          // Calculate grid-snapped coordinates
          const rawX = (e.clientX - pan.x) / zoom - dragOffset.x;
          const rawY = (e.clientY - pan.y) / zoom - dragOffset.y;
          return { ...n, x: Math.round(rawX / 10) * 10, y: Math.round(rawY / 10) * 10 };
        }
        return n;
      });
      setNodes(updatedNodes);
    }
  };

  const handleMouseUp = async () => {
    if (isPanning) {
      setIsPanning(false);
    }
    
    if (draggingNodeId) {
      const node = nodes.find(n => n.uri === draggingNodeId);
      if (node) {
        // Persist new coordinates in GraphDB
        const updateQuery = `
          PREFIX ex: <http://example.org/resource/>
          DELETE {
            <${node.uri}> ex:posX ?x ; ex:posY ?y .
          } INSERT {
            <${node.uri}> ex:posX ${node.x} ; ex:posY ${node.y} .
          } WHERE {
            OPTIONAL { <${node.uri}> ex:posX ?x }
            OPTIONAL { <${node.uri}> ex:posY ?y }
          }
        `;
        try {
          await fetch('/api/sparql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: updateQuery })
          });
        } catch (err) {
          console.error("No se pudo guardar la posición en GraphDB", err);
        }
      }
      setDraggingNodeId(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.05;
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(0.2, Math.min(newZoom, 3)));
  };

  // Node Drag Setup
  const startDragNode = (e: React.MouseEvent, node: RDFNode) => {
    e.stopPropagation();
    setSelectedNode(node);
    setSelectedConnection(null);
    
    if (isConnectingMode) {
      if (connectSourceNode && connectSourceNode !== node.uri) {
        // Connect nodes
        createConnection(connectSourceNode, node.uri);
      } else {
        setConnectSourceNode(node.uri);
      }
    } else {
      setDraggingNodeId(node.uri);
      // Calculate offset inside the node card
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDragOffset({
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom
      });
    }
  };

  // Create Node
  const createNode = async () => {
    if (!newNodeData.label || !newNodeData.uriSuffix) return;
    
    const uri = `http://example.org/resource/${newNodeData.uriSuffix.trim()}`;
    const x = Math.round((-pan.x + window.innerWidth / 2) / zoom);
    const y = Math.round((-pan.y + window.innerHeight / 2) / zoom);

    const insertQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX ex: <http://example.org/resource/>
      
      INSERT DATA {
        <${uri}> rdf:type <${newNodeData.type}> ;
                 rdfs:label "${newNodeData.label}" ;
                 ex:posX ${x} ;
                 ex:posY ${y} .
      }
    `;

    try {
      const res = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });
      const data = await res.json();
      if (data.success) {
        setShowNewNodeModal(false);
        setNewNodeData({ label: '', type: 'http://vivoweb.org/ontology/core#GraduateStudent', uriSuffix: '' });
        fetchGraphData();
      }
    } catch (e) {
      console.error("Error creando nodo", e);
    }
  };

  // Delete Node from GraphDB
  const deleteNode = async () => {
    if (!nodeToDelete) return;
    
    const query = `
      DELETE WHERE { <${nodeToDelete.uri}> ?p ?o . };
      DELETE WHERE { ?s ?p <${nodeToDelete.uri}> . }
    `;

    try {
      const res = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (data.success) {
        setNodeToDelete(null);
        setSelectedNode(null);
        setSelectedConnection(null);
        setIsInspectorOpen(false);
        fetchGraphData();
      }
    } catch (e) {
      console.error("Error al borrar nodo", e);
    }
  };

  // Create Connection
  const createConnection = async (sourceURI: string, targetURI: string) => {
    const sourceNode = nodes.find(n => n.uri === sourceURI);
    const targetNode = nodes.find(n => n.uri === targetURI);
    if (!sourceNode || !targetNode) return;

    // Ontological Predicate Suggestion
    let suggestedPredicate = 'http://example.org/resource/relatedTo';
    
    if (sourceNode.type.includes('FacultyMember') && targetNode.type.includes('GraduateStudent')) {
      suggestedPredicate = 'http://vivoweb.org/ontology/core#advisor';
    } else if (sourceNode.type.includes('GraduateStudent') && targetNode.type.includes('Project')) {
      suggestedPredicate = 'http://vivoweb.org/ontology/core#contributorTo';
    } else if (sourceNode.type.includes('Article') && targetNode.type.includes('GraduateStudent')) {
      suggestedPredicate = 'https://dblp.org/rdf/schema#authoredBy';
    } else if (sourceNode.type.includes('Article') && targetNode.type.includes('Topic')) {
      suggestedPredicate = 'http://purl.org/dc/terms/subject';
    }

    const insertQuery = `
      INSERT DATA {
        <${sourceURI}> <${suggestedPredicate}> <${targetURI}> .
      }
    `;

    try {
      const res = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });
      const data = await res.json();
      if (data.success) {
        setIsConnectingMode(false);
        setConnectSourceNode(null);
        fetchGraphData();
      }
    } catch (e) {
      console.error("Error creando conexión", e);
    }
  };

  const getCleanLabel = (uri: string) => {
    if (uri.startsWith('http://example.org/resource/')) {
      return uri.replace('http://example.org/resource/', 'ex:');
    }
    if (uri.startsWith('http://vivoweb.org/ontology/core#')) {
      return uri.replace('http://vivoweb.org/ontology/core#', 'vivo:');
    }
    if (uri.startsWith('https://dblp.org/rdf/schema#')) {
      return uri.replace('https://dblp.org/rdf/schema#', 'dblp:');
    }
    if (uri.startsWith('http://purl.org/dc/terms/')) {
      return uri.replace('http://purl.org/dc/terms/', 'dct:');
    }
    return uri;
  };

  const getCleanType = (typeURI: string) => {
    return getCleanLabel(typeURI);
  };

  // Helper selector helper mapping component styles
  const getNodeComponentId = (type: string) => {
    if (type.includes('FacultyMember')) return 'nodeInvestigador';
    if (type.includes('Student') || type.includes('GraduateStudent')) return 'nodeTesista';
    if (type.includes('Project')) return 'nodeProyecto';
    if (type.includes('InformationResource') || type.includes('AcademicArticle') || type.includes('Article') || type.includes('Publication')) return 'nodePaper';
    if (type.includes('Topic')) return 'nodeTopicCSO';
    return 'nodeCard';
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      
      {/* Floating Header */}
      <div className="canvas-header">
        <h1>Spatial Semantic Canvas</h1>
        <button className="btn btn-primary" onClick={() => setShowNewNodeModal(true)}>+ Agregar Nodo</button>
        <button 
          className={`btn ${isConnectingMode ? 'btn-primary' : ''}`}
          onClick={() => {
            setIsConnectingMode(!isConnectingMode);
            setConnectSourceNode(null);
          }}
        >
          {isConnectingMode ? 'Conectando...' : 'Conectar Nodos'}
        </button>
        {nodes.length === 0 && (
          <button className="btn" onClick={loadSeedData}>Cargar Semilla Inicial</button>
        )}
      </div>

      {/* Main Interactive Canvas */}
      <div 
        id="canvasMain" 
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        {isDev && <span className="dev-tag-badge">#canvasMain</span>}
        <div 
          className="canvas-viewport"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* Dynamic SVG Connections Overlay */}
          <svg className="canvas-connections">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a6adc8" />
              </marker>
            </defs>
            {connections.map((conn) => {
              const fromNode = nodes.find(n => n.uri === conn.from);
              const toNode = nodes.find(n => n.uri === conn.to);
              
              if (!fromNode || !toNode) return null;

              // Node Dimensions: 220px width, ~80px height
              const x1 = fromNode.x + 110;
              const y1 = fromNode.y + 40;
              const x2 = toNode.x + 110;
              const y2 = toNode.y + 40;

              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;

              const isSel = selectedConnection?.id === conn.id;

              return (
                <g key={conn.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    className={`edge-connector-path ${isSel ? 'selected' : ''}`}
                    markerEnd="url(#arrow)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedConnection(conn);
                      setSelectedNode(null);
                      setIsInspectorOpen(true);
                    }}
                  />
                  <text 
                    x={mx} 
                    y={my - 6} 
                    textAnchor="middle" 
                    className="edge-label"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedConnection(conn);
                      setSelectedNode(null);
                      setIsInspectorOpen(true);
                    }}
                  >
                    {getCleanLabel(conn.predicate)}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Cards / Nodes */}
          {nodes.map((node) => {
            const isSelected = selectedNode?.uri === node.uri;
            const isConnectSrc = connectSourceNode === node.uri;
            const nodeDomId = getNodeComponentId(node.type);

            return (
              <div
                key={node.uri}
                id={nodeDomId}
                className={`node-card ${isSelected ? 'selected' : ''}`}
                style={{
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  border: isConnectSrc ? '2.5px solid var(--accent)' : undefined
                }}
                onMouseDown={(e) => startDragNode(e, node)}
              >
                {isDev && <span className="dev-tag-badge">#{nodeDomId}</span>}
                <div className="flex-row flex-space">
                  <span className="node-tag">{getCleanType(node.type)}</span>
                  <div className="flex-row" style={{ gap: '6px' }}>
                    {node.status && <span style={{ fontSize: '0.7rem', color: 'var(--color-proyecto)' }}>{node.status}</span>}
                    <button 
                      className="node-inspect-btn"
                      onMouseDown={(e) => e.stopPropagation()} // Prevent drag on click
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(node);
                        setSelectedConnection(null);
                        setIsInspectorOpen(true);
                      }}
                      title="Inspeccionar propiedades"
                    >
                      ⚙️
                    </button>
                    <button 
                      className="node-delete-btn"
                      onMouseDown={(e) => e.stopPropagation()} // Prevent drag on click
                      onClick={(e) => {
                        e.stopPropagation();
                        setNodeToDelete(node);
                      }}
                      title="Eliminar nodo"
                    >
                      ❌
                    </button>
                  </div>
                </div>
                <h3>{node.label}</h3>
                <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>{getCleanLabel(node.uri)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Property Inspector (#ventanaEspecial) */}
      {isInspectorOpen && (selectedNode || selectedConnection) && (
        <div id="ventanaEspecial">
          {isDev && <span className="dev-tag-badge">#ventanaEspecial</span>}
          <div className="window-header">
            <h3>Inspector Semántico</h3>
            <button className="btn" onClick={() => { setSelectedNode(null); setSelectedConnection(null); setIsInspectorOpen(false); }}>Cerrar</button>
          </div>
          <div className="window-body">
            {selectedNode && (
              <>
                <div className="form-group">
                  <label>URI</label>
                  <input type="text" value={selectedNode.uri} readOnly />
                </div>
                <div className="form-group">
                  <label>Etiqueta (rdfs:label)</label>
                  <input 
                    type="text" 
                    value={selectedNode.label} 
                    onChange={async (e) => {
                      const newLabel = e.target.value;
                      setNodes(nodes.map(n => n.uri === selectedNode.uri ? { ...n, label: newLabel } : n));
                      setSelectedNode({ ...selectedNode, label: newLabel });
                      
                      // SPARQL update for label
                      const query = `
                        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
                         DELETE { <${selectedNode.uri}> rdfs:label ?label }
                         INSERT { <${selectedNode.uri}> rdfs:label "${newLabel}" }
                         WHERE { OPTIONAL { <${selectedNode.uri}> rdfs:label ?label } }
                      `;
                      await fetch('/api/sparql', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query })
                      });
                    }}
                  />
                </div>
                <div className="form-group">
                  <label>Clase RDF (rdf:type)</label>
                  <input type="text" value={selectedNode.type} readOnly />
                </div>
              </>
            )}

            {selectedConnection && (
              <>
                <div className="form-group">
                  <label>Sujeto (From)</label>
                  <input type="text" value={getCleanLabel(selectedConnection.from)} readOnly />
                </div>
                <div className="form-group">
                  <label>Predicado (Property)</label>
                  <input type="text" value={getCleanLabel(selectedConnection.predicate)} readOnly />
                </div>
                <div className="form-group">
                  <label>Objeto (To)</label>
                  <input type="text" value={getCleanLabel(selectedConnection.to)} readOnly />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Agregar Nodo */}
      {showNewNodeModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 500
        }}>
          <div style={{ background: 'var(--bg-mantle)', padding: '24px', borderRadius: '16px', width: '350px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2>Agregar Nuevo Nodo</h2>
            <div className="form-group">
              <label>Etiqueta / Nombre</label>
              <input type="text" placeholder="Ej: Dr. Gomez" value={newNodeData.label} onChange={(e) => setNewNodeData({ ...newNodeData, label: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Tipo Semántico</label>
              <select value={newNodeData.type} onChange={(e) => setNewNodeData({ ...newNodeData, type: e.target.value })}>
                <option value="http://vivoweb.org/ontology/core#FacultyMember">Investigador (vivo:FacultyMember)</option>
                <option value="http://vivoweb.org/ontology/core#GraduateStudent">Tesista de Posgrado (vivo:GraduateStudent)</option>
                <option value="http://vivoweb.org/ontology/core#Project">Proyecto (vivo:Project)</option>
                <option value="https://dblp.org/rdf/schema#Article">Paper (dblp:Article)</option>
                <option value="http://cso.kmi.open.ac.uk/schema/cso#Topic">Tópico CSO (cso:Topic)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Sufijo de URI</label>
              <input type="text" placeholder="Ej: JuanPerez" value={newNodeData.uriSuffix} onChange={(e) => setNewNodeData({ ...newNodeData, uriSuffix: e.target.value.replace(/\s+/g, '') })} />
            </div>
            <div className="flex-row flex-space" style={{ marginTop: '10px' }}>
              <button className="btn" onClick={() => setShowNewNodeModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createNode}>Crear Nodo</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmación de Eliminación */}
      {nodeToDelete && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 600
        }}>
          <div style={{ background: 'var(--bg-mantle)', padding: '24px', borderRadius: '16px', width: '350px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--color-proyecto)' }}>
            <h2 style={{ color: 'var(--color-proyecto)' }}>⚠️ Advertencia de Eliminación</h2>
            <p>¿Estás seguro de que deseas eliminar el nodo <strong>{nodeToDelete.label}</strong>?</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Esta acción eliminará el nodo y todas sus conexiones asociadas del Triplestore de forma permanente. Esta acción no se puede deshacer.</p>
            <div className="flex-row flex-space" style={{ marginTop: '10px' }}>
              <button className="btn" onClick={() => setNodeToDelete(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-proyecto)', color: '#fff' }} onClick={deleteNode}>Aceptar</button>
            </div>
          </div>
        </div>
      )}

      {/* Semantic Sidebar */}
      <div id="sidebarSemantic" className={sidebarCollapsed ? 'collapsed' : ''}>
        {isDev && <span className="dev-tag-badge">#sidebarSemantic</span>}
        <div className="sidebar-header">
          <h2>Consola SPARQL</h2>
          <button className="btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '<<' : 'Ocultar'}
          </button>
        </div>
        <div className="sidebar-content">
          <div className="sparql-console">
            <textarea 
              className="sparql-input"
              value={sparqlQuery}
              onChange={(e) => setSparqlQuery(e.target.value)}
            />
            <button className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} onClick={runCustomSPARQL}>Ejecutar Consulta</button>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>RESULTADO</label>
            <pre style={{
              flex: 1, overflow: 'auto', background: 'var(--bg-crust)',
              padding: '10px', borderRadius: '8px', fontSize: '0.75rem',
              color: '#89b4fa', margin: 0
            }}>
              {sparqlResult || 'No se han ejecutado consultas aún.'}
            </pre>
          </div>
        </div>
      </div>
      {sidebarCollapsed && (
        <button 
          className="btn" 
          style={{ position: 'absolute', top: 20, right: 20, zIndex: 100 }}
          onClick={() => setSidebarCollapsed(false)}
        >
          Consola SPARQL
        </button>
      )}
    </div>
  );
}
