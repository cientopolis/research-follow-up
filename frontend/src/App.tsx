import React, { useState, useEffect, useRef, useCallback } from 'react';

interface RDFNode {
  uri: string;
  label: string;
  type: string;
  x: number;
  y: number;
  status?: string;
  thesisType?: string;
}

interface RDFConnection {
  id: string;
  from: string;
  to: string;
  predicate: string;
}

const DEFAULT_PROPERTIES_BY_TYPE: { [type: string]: { uri: string; label: string; validation?: (val: string) => string | null }[] } = {
  'FacultyMember': [
    { uri: 'http://vivoweb.org/ontology/core#email', label: 'Email', validation: (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Email inválido' },
    { uri: 'http://example.org/resource/status', label: 'Estado' }
  ],
  'GraduateStudent': [
    { uri: 'http://vivoweb.org/ontology/core#email', label: 'Email', validation: (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Email inválido' },
    { uri: 'http://example.org/resource/status', label: 'Estado' },
    { uri: 'http://vivoweb.org/ontology/core#thesisTitle', label: 'Título de Tesis' }
  ],
  'UndergraduateStudent': [
    { uri: 'http://vivoweb.org/ontology/core#email', label: 'Email', validation: (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Email inválido' },
    { uri: 'http://example.org/resource/status', label: 'Estado' },
    { uri: 'http://vivoweb.org/ontology/core#thesisTitle', label: 'Título de Tesis de Grado' }
  ],
  'Project': [
    { uri: 'http://example.org/resource/status', label: 'Estado' },
    { uri: 'http://example.org/resource/grantNumber', label: 'Número de Subsidio' },
    { uri: 'http://example.org/resource/startDate', label: 'Fecha de Inicio (YYYY-MM-DD)', validation: (val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val) ? null : 'Formato YYYY-MM-DD requerido' },
    { uri: 'http://example.org/resource/endDate', label: 'Fecha de Fin (YYYY-MM-DD)', validation: (val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val) ? null : 'Formato YYYY-MM-DD requerido' }
  ],
  'Article': [
    { uri: 'http://example.org/resource/doi', label: 'DOI', validation: (val) => !val || /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(val) ? null : 'DOI inválido' },
    { uri: 'https://dblp.org/rdf/schema#year', label: 'Año (YYYY)', validation: (val) => !val || /^\d{4}$/.test(val) ? null : 'Año de 4 dígitos requerido' },
    { uri: 'https://dblp.org/rdf/schema#journal', label: 'Journal / Revista' }
  ],
  'Topic': [
    { uri: 'http://example.org/resource/description', label: 'Descripción' }
  ],
  'Thesis': [
    { uri: 'http://purl.org/ontology/bibo/degree', label: 'Grado Académico (bibo:degree)' },
    { uri: 'https://dblp.org/rdf/schema#year', label: 'Año (YYYY)', validation: (val) => !val || /^\d{4}$/.test(val) ? null : 'Año de 4 dígitos requerido' }
  ]
};

export default function App() {
  const isDev = import.meta.env.DEV;
  const [nodes, setNodes] = useState<RDFNode[]>([]);
  const [connections, setConnections] = useState<RDFConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<RDFNode | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<RDFConnection | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<RDFNode | null>(null);

  // Inspector property editing states
  const [nodeDetails, setNodeDetails] = useState<{ [predURI: string]: string }>({});
  const [availableProperties, setAvailableProperties] = useState<string[]>([]);
  const [openSections, setOpenSections] = useState({ basic: true, ontology: true, meta: false });
  const [validationErrors, setValidationErrors] = useState<{ [predURI: string]: string }>({});
  const [newPropURI, setNewPropURI] = useState('');
  const [newPropVal, setNewPropVal] = useState('');
  const [isAddingCustomProp, setIsAddingCustomProp] = useState(false);

  // Dynamic Node Card Heights tracking
  const [nodeHeights, setNodeHeights] = useState<{ [uri: string]: number }>({});
  const nodeRef = useCallback((el: HTMLDivElement | null, uri: string) => {
    if (el) {
      const rect = el.getBoundingClientRect();
      setNodeHeights(prev => {
        if (prev[uri] === rect.height) return prev;
        return { ...prev, [uri]: rect.height };
      });
    }
  }, []);
  
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
  const [activeRightPanel, setActiveRightPanel] = useState<'none' | 'sparql' | 'pomodoro'>('none');

  // Pomodoro Timer State & Logic
  const [pomodoroMode, setPomodoroMode] = useState<'work' | 'shortBreak' | 'longBreak'>('work');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [customWorkTime, setCustomWorkTime] = useState(25);
  const [customBreakTime, setCustomBreakTime] = useState(5);
  const [completedCycles, setCompletedCycles] = useState(0);

  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      const now = audioCtx.currentTime;
      
      oscillator.frequency.setValueAtTime(880, now);
      gainNode.gain.setValueAtTime(0.15, now);
      
      oscillator.frequency.setValueAtTime(1200, now + 0.15);
      gainNode.gain.setValueAtTime(0.15, now + 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      oscillator.start(now);
      oscillator.stop(now + 0.8);
    } catch (e) {
      console.error("Audio Context failed", e);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (timerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(t => t - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerRunning) {
      setTimerRunning(false);
      playChime();
      
      if (pomodoroMode === 'work') {
        setCompletedCycles(c => c + 1);
        setPomodoroMode('shortBreak');
        setTimeLeft(customBreakTime * 60);
      } else {
        setPomodoroMode('work');
        setTimeLeft(customWorkTime * 60);
      }
    }
    return () => clearInterval(interval);
  }, [timerRunning, timeLeft, pomodoroMode, customWorkTime, customBreakTime]);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Load data from GraphDB
  const fetchGraphData = async () => {
    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX ex: <http://example.org/resource/>

      SELECT DISTINCT ?node ?label ?type ?x ?y ?status ?thesisType WHERE {
        ?node rdf:type ?type .
        ?node rdfs:label ?label .
        OPTIONAL { ?node ex:posX ?x }
        OPTIONAL { ?node ex:posY ?y }
        OPTIONAL { ?node ex:status ?status }
        OPTIONAL { ?node ex:thesisType ?thesisType }
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
              const isCurrentGeneric = currentType.endsWith('#Student') || currentType.endsWith('#Publication') || currentType.endsWith('#Thing') || currentType.endsWith('#InformationResource');
              const isNewGeneric = type.endsWith('#Student') || type.endsWith('#Publication') || type.endsWith('#Thing') || type.endsWith('#InformationResource');
              
              if (isCurrentGeneric && !isNewGeneric) {
                nodeMap[uri].type = type; // Reemplazar genérico por específico
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
            status: b.status ? b.status.value : undefined,
            thesisType: b.thesisType ? b.thesisType.value : undefined
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

  const getPredefinedProperties = (typeURI: string) => {
    if (typeURI.includes('FacultyMember')) return DEFAULT_PROPERTIES_BY_TYPE['FacultyMember'];
    if (typeURI.includes('GraduateStudent')) return DEFAULT_PROPERTIES_BY_TYPE['GraduateStudent'];
    if (typeURI.includes('UndergraduateStudent')) return DEFAULT_PROPERTIES_BY_TYPE['UndergraduateStudent'];
    if (typeURI.includes('Project')) return DEFAULT_PROPERTIES_BY_TYPE['Project'];
    if (typeURI.includes('Article')) return DEFAULT_PROPERTIES_BY_TYPE['Article'];
    if (typeURI.includes('Topic')) return DEFAULT_PROPERTIES_BY_TYPE['Topic'];
    if (typeURI.includes('Thesis')) return DEFAULT_PROPERTIES_BY_TYPE['Thesis'];
    return [];
  };

  const getCardBorderPoint = (xSrc: number, ySrc: number, xDst: number, yDst: number, w = 220, h = 80) => {
    const dx = xDst - xSrc;
    const dy = yDst - ySrc;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: xSrc, y: ySrc };

    const halfW = w / 2;
    const halfH = h / 2;

    // Proteger contra divisiones por cero (alineaciones exactas)
    if (Math.abs(dx) < 0.001) {
      return { x: xSrc, y: ySrc + (dy > 0 ? halfH : -halfH) };
    }
    if (Math.abs(dy) < 0.001) {
      return { x: xSrc + (dx > 0 ? halfW : -halfW), y: ySrc };
    }

    // Probar bordes verticales (izq / der)
    const tX = dx > 0 ? halfW : -halfW;
    const yProj = ySrc + (dy / dx) * tX;
    if (yProj >= ySrc - halfH && yProj <= ySrc + halfH) {
      return { x: xSrc + tX, y: yProj };
    }

    // Probar bordes horizontales (arr / abj)
    const tY = dy > 0 ? halfH : -halfH;
    const xProj = xSrc + (dx / dy) * tY;
    return { x: xProj, y: ySrc + tY };
  };

  const fetchNodeDetails = async (nodeURI: string) => {
    const query = `
      SELECT ?predicate ?value WHERE {
        <${nodeURI}> ?predicate ?value .
        FILTER(isLiteral(?value))
      }
    `;
    try {
      const res = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (data.results && data.results.bindings) {
        const props: { [predURI: string]: string } = {};
        data.results.bindings.forEach((b: any) => {
          props[b.predicate.value] = b.value.value;
        });
        // Asegurarse de que rdfs:label siempre exista
        if (!props['http://www.w3.org/2000/01/rdf-schema#label']) {
          const matched = nodes.find(n => n.uri === nodeURI);
          props['http://www.w3.org/2000/01/rdf-schema#label'] = matched ? matched.label : '';
        }
        setNodeDetails(props);
      }
    } catch (e) {
      console.error("Error loading node details", e);
    }
  };

  const fetchAllDatatypeProperties = async () => {
    const query = `
      SELECT DISTINCT ?prop WHERE {
        { ?prop a <http://www.w3.org/2002/07/owl#DatatypeProperty> . }
        UNION
        { ?s ?prop ?o . FILTER(isLiteral(?o)) }
        FILTER(?prop != <http://example.org/resource/posX> && ?prop != <http://example.org/resource/posY> && ?prop != <http://www.w3.org/2000/01/rdf-schema#label> && ?prop != <http://example.org/resource/status>)
      }
    `;
    try {
      const res = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (data.results && data.results.bindings) {
        const list = data.results.bindings.map((b: any) => b.prop.value);
        setAvailableProperties(list);
      }
    } catch (e) {
      console.error("Error loading datatype properties", e);
    }
  };

  // Sync node selection and details
  useEffect(() => {
    if (selectedNode && isInspectorOpen) {
      fetchNodeDetails(selectedNode.uri);
    } else {
      setNodeDetails({});
      setValidationErrors({});
    }
  }, [selectedNode, isInspectorOpen]);

  // Load all datatypes on mount
  useEffect(() => {
    fetchGraphData();
    fetchAllDatatypeProperties();
  }, []);

  const handlePropertyChange = (predicateURI: string, value: string, validationFn?: (val: string) => string | null) => {
    setNodeDetails(prev => ({ ...prev, [predicateURI]: value }));
    if (validationFn) {
      const err = validationFn(value);
      setValidationErrors(prev => ({ ...prev, [predicateURI]: err || '' }));
    } else {
      setValidationErrors(prev => ({ ...prev, [predicateURI]: '' }));
    }
  };

  const saveNodeProperties = async () => {
    if (!selectedNode) return;
    
    // Validate all predefined properties first
    const errors: { [predURI: string]: string } = {};
    let hasErrors = false;

    const labelVal = nodeDetails['http://www.w3.org/2000/01/rdf-schema#label'] || '';
    if (!labelVal.trim()) {
      errors['http://www.w3.org/2000/01/rdf-schema#label'] = 'La etiqueta no puede estar vacía';
      hasErrors = true;
    }

    const preProps = getPredefinedProperties(selectedNode.type);
    preProps.forEach(p => {
      if (p.validation) {
        const val = nodeDetails[p.uri] || '';
        const err = p.validation(val);
        if (err) {
          errors[p.uri] = err;
          hasErrors = true;
        }
      }
    });

    if (hasErrors) {
      setValidationErrors(errors);
      return;
    }

    // Build SPARQL Update Query
    const predicatesToClear = [
      'http://www.w3.org/2000/01/rdf-schema#label',
      ...preProps.map(p => p.uri),
      ...Object.keys(nodeDetails).filter(k => !k.startsWith('http://www.w3.org/2000/01/rdf-schema#') && !preProps.some(p => p.uri === k))
    ];

    const filterList = predicatesToClear.map(p => `<${p}>`).join(', ');

    // Filter nodeDetails to only insert non-empty values
    const insertTriples = Object.entries(nodeDetails)
      .filter(([_, val]) => val.trim() !== '')
      .map(([pred, val]) => `<${selectedNode.uri}> <${pred}> "${val.replace(/"/g, '\\"')}" .`)
      .join('\n        ');

    const updateQuery = `
      DELETE {
        <${selectedNode.uri}> ?p ?o .
      }
      INSERT {
        ${insertTriples}
      }
      WHERE {
        OPTIONAL {
          <${selectedNode.uri}> ?p ?o .
          FILTER(?p IN (${filterList}))
        }
      }
    `;

    try {
      const res = await fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: updateQuery })
      });
      const data = await res.json();
      if (data.success) {
        // Update local state label
        const newLabel = nodeDetails['http://www.w3.org/2000/01/rdf-schema#label'] || selectedNode.label;
        const newStatus = nodeDetails['http://example.org/resource/status'] || selectedNode.status;
        setNodes(nodes.map(n => n.uri === selectedNode.uri ? { ...n, label: newLabel, status: newStatus } : n));
        
        setIsInspectorOpen(false);
        setSelectedNode(null);
        fetchGraphData();
      }
    } catch (e) {
      console.error("Error saving properties", e);
    }
  };

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

    let finalType = newNodeData.type;
    let extraTriples = '';
    if (newNodeData.type === 'http://purl.org/ontology/bibo/Thesis#PhD') {
      finalType = 'http://purl.org/ontology/bibo/Thesis';
      extraTriples = `<${uri}> <http://example.org/resource/thesisType> "PhD Thesis" .`;
    } else if (newNodeData.type === 'http://purl.org/ontology/bibo/Thesis#Master') {
      finalType = 'http://purl.org/ontology/bibo/Thesis';
      extraTriples = `<${uri}> <http://example.org/resource/thesisType> "Magister" .`;
    }

    const insertQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX ex: <http://example.org/resource/>
      
      INSERT DATA {
        <${uri}> rdf:type <${finalType}> ;
                 rdfs:label "${newNodeData.label}" ;
                 ex:posX ${x} ;
                 ex:posY ${y} .
        ${extraTriples}
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
    
    if (sourceNode.type.includes('FacultyMember') && (targetNode.type.includes('GraduateStudent') || targetNode.type.includes('UndergraduateStudent'))) {
      suggestedPredicate = 'http://vivoweb.org/ontology/core#advisor';
    } else if ((sourceNode.type.includes('GraduateStudent') || sourceNode.type.includes('UndergraduateStudent')) && targetNode.type.includes('Project')) {
      suggestedPredicate = 'http://vivoweb.org/ontology/core#contributorTo';
    } else if ((sourceNode.type.includes('Article') || sourceNode.type.includes('Thesis')) && (targetNode.type.includes('GraduateStudent') || targetNode.type.includes('UndergraduateStudent'))) {
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

  const getCleanType = (typeURI: string, thesisType?: string) => {
    if (typeURI.includes('Thesis')) {
      if (thesisType === 'PhD Thesis') return 'Tesis Doctoral';
      if (thesisType === 'Magister') return 'Tesis de Maestría';
      return 'Tesis';
    }
    return getCleanLabel(typeURI);
  };

  // Helper selector helper mapping component styles
  const getNodeComponentId = (type: string, thesisType?: string) => {
    if (type.includes('FacultyMember')) return 'nodeInvestigador';
    if (type.includes('GraduateStudent')) return 'nodeTesistaPosgrado';
    if (type.includes('UndergraduateStudent')) return 'nodeTesistaDeGrado';
    if (type.includes('Project')) return 'nodeProyecto';
    if (type.includes('Thesis')) {
      if (thesisType === 'PhD Thesis') return 'nodeTesisDoctoral';
      if (thesisType === 'Magister') return 'nodeTesisMaestria';
      return 'nodePaper';
    }
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
              <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#8c8fa1" />
              </marker>
            </defs>
            {connections.map((conn) => {
              const fromNode = nodes.find(n => n.uri === conn.from);
              const toNode = nodes.find(n => n.uri === conn.to);
              
              if (!fromNode || !toNode) return null;

              // Retrieve measured heights, fallback to 80px
              const hFrom = nodeHeights[conn.from] || 80;
              const hTo = nodeHeights[conn.to] || 80;

              // Node Centers
              let cx1 = fromNode.x + 110;
              let cy1 = fromNode.y + hFrom / 2;
              let cx2 = toNode.x + 110;
              let cy2 = toNode.y + hTo / 2;
              
              let fromHeight = hFrom;
              let toHeight = hTo;

              // Si la relación es vivo:advisor y está guardada en sentido Estudiante -> Investigador,
              // invertimos visualmente el origen y destino para que la flecha apunte del Investigador al Estudiante.
              if (conn.predicate === 'http://vivoweb.org/ontology/core#advisor') {
                const isFromStudent = fromNode.type.includes('Student') || fromNode.type.includes('GraduateStudent') || fromNode.type.includes('UndergraduateStudent');
                const isToFaculty = toNode.type.includes('FacultyMember');
                if (isFromStudent && isToFaculty) {
                  cx1 = toNode.x + 110;
                  cy1 = toNode.y + hTo / 2;
                  cx2 = fromNode.x + 110;
                  cy2 = fromNode.y + hFrom / 2;
                  fromHeight = hTo;
                  toHeight = hFrom;
                }
              }

              // Border Intersections
              const startPt = getCardBorderPoint(cx1, cy1, cx2, cy2, 220, fromHeight);
              const endPt = getCardBorderPoint(cx2, cy2, cx1, cy1, 220, toHeight);

              const x1 = startPt.x;
              const y1 = startPt.y;
              const x2 = endPt.x;
              const y2 = endPt.y;

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
            const nodeDomId = getNodeComponentId(node.type, node.thesisType);

            return (
              <div
                key={node.uri}
                ref={(el) => nodeRef(el, node.uri)}
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
                  <span className="node-tag">{getCleanType(node.type, node.thesisType)}</span>
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

      {/* Centered Property Inspector Modal Backdrop */}
      {isInspectorOpen && (selectedNode || selectedConnection) && (
        <div className="modal-backdrop" onClick={() => { setSelectedNode(null); setSelectedConnection(null); setIsInspectorOpen(false); }}>
          <div id="inspectorSemantico" onClick={(e) => e.stopPropagation()}>
            {isDev && <span className="dev-tag-badge">#inspectorSemantico</span>}
            <div className="window-header">
              <h3>Inspector Semántico {selectedNode ? ' - Nodo' : ' - Conector'}</h3>
              <button className="btn" onClick={() => { setSelectedNode(null); setSelectedConnection(null); setIsInspectorOpen(false); }}>Cerrar</button>
            </div>
            
            <div className="window-body">
              {selectedNode && (
                <>
                  {/* Sección 1: Datos Básicos */}
                  <div className="collapsible-section">
                    <div 
                      className={`collapsible-header ${openSections.basic ? 'open' : ''}`}
                      onClick={() => setOpenSections({ ...openSections, basic: !openSections.basic })}
                    >
                      <span>📂 Datos Básicos</span>
                      <span className="caret">▶</span>
                    </div>
                    {openSections.basic && (
                      <div className="collapsible-content">
                        <div className="form-group">
                          <label>Nombre / Etiqueta (rdfs:label)</label>
                          <input 
                            type="text" 
                            className={validationErrors['http://www.w3.org/2000/01/rdf-schema#label'] ? 'input-error' : ''}
                            value={nodeDetails['http://www.w3.org/2000/01/rdf-schema#label'] || ''} 
                            onChange={(e) => handlePropertyChange('http://www.w3.org/2000/01/rdf-schema#label', e.target.value)} 
                          />
                          {validationErrors['http://www.w3.org/2000/01/rdf-schema#label'] && (
                            <span className="error-message">{validationErrors['http://www.w3.org/2000/01/rdf-schema#label']}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sección 2: Propiedades específicas de Ontología */}
                  <div className="collapsible-section">
                    <div 
                      className={`collapsible-header ${openSections.ontology ? 'open' : ''}`}
                      onClick={() => setOpenSections({ ...openSections, ontology: !openSections.ontology })}
                    >
                      <span>🛠️ Propiedades de la Ontología</span>
                      <span className="caret">▶</span>
                    </div>
                    {openSections.ontology && (
                      <div className="collapsible-content">
                        {/* Renderizar propiedades sugeridas fijas */}
                        {getPredefinedProperties(selectedNode.type).map((prop) => {
                          const val = nodeDetails[prop.uri] || '';
                          const error = validationErrors[prop.uri];
                          return (
                            <div className="form-group" key={prop.uri}>
                              <label>{prop.label} ({getCleanLabel(prop.uri)})</label>
                              <input 
                                type="text"
                                className={error ? 'input-error' : ''}
                                placeholder="Ej: No asignado"
                                value={val}
                                onChange={(e) => handlePropertyChange(prop.uri, e.target.value, prop.validation)}
                              />
                              {error && <span className="error-message">{error}</span>}
                            </div>
                          );
                        })}

                        {/* Renderizar otras propiedades personalizadas asignadas */}
                        {Object.entries(nodeDetails)
                          .filter(([uri]) => {
                            // Ocultar labels, status predefinidos, o propiedades sugeridas fijas
                            const isLabel = uri === 'http://www.w3.org/2000/01/rdf-schema#label';
                            const isPredefined = getPredefinedProperties(selectedNode.type).some(p => p.uri === uri);
                            return !isLabel && !isPredefined;
                          })
                          .map(([uri, val]) => (
                            <div className="form-group" key={uri}>
                              <label>{getCleanLabel(uri)}</label>
                              <div className="flex-row">
                                <input 
                                  type="text" 
                                  value={val} 
                                  onChange={(e) => handlePropertyChange(uri, e.target.value)} 
                                />
                                <button 
                                  className="btn" 
                                  style={{ color: 'var(--color-proyecto)', padding: '8px' }}
                                  onClick={() => {
                                    const updated = { ...nodeDetails };
                                    delete updated[uri];
                                    setNodeDetails(updated);
                                  }}
                                  title="Quitar propiedad"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          ))}

                        {/* Agregar otra propiedad (Dropdown de asistencia) */}
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
                          {!isAddingCustomProp ? (
                            <div className="flex-row flex-space">
                              <select 
                                defaultValue=""
                                onChange={(e) => {
                                  const uri = e.target.value;
                                  if (uri === 'custom') {
                                    setIsAddingCustomProp(true);
                                  } else if (uri) {
                                    setNodeDetails(prev => ({ ...prev, [uri]: '' }));
                                  }
                                  e.target.value = '';
                                }}
                                style={{ flex: 1 }}
                              >
                                <option value="" disabled>➕ Agregar otra propiedad ontológica...</option>
                                {availableProperties
                                  .filter(p => !nodeDetails[p] && !getPredefinedProperties(selectedNode.type).some(sp => sp.uri === p))
                                  .map(p => (
                                    <option key={p} value={p}>{getCleanLabel(p)}</option>
                                  ))}
                                <option value="custom">✏️ Propiedad personalizada por URI...</option>
                              </select>
                            </div>
                          ) : (
                            <div className="flex-row" style={{ gap: '6px' }}>
                              <input 
                                type="text" 
                                placeholder="ex:miPropiedad o URI completa" 
                                value={newPropURI}
                                onChange={(e) => setNewPropURI(e.target.value)}
                                style={{ flex: 1 }}
                              />
                              <button 
                                className="btn btn-primary"
                                onClick={() => {
                                  if (newPropURI.trim()) {
                                    let resolvedURI = newPropURI.trim();
                                    if (resolvedURI.startsWith('ex:')) {
                                      resolvedURI = resolvedURI.replace('ex:', 'http://example.org/resource/');
                                    } else if (!resolvedURI.startsWith('http://') && !resolvedURI.startsWith('https://')) {
                                      resolvedURI = `http://example.org/resource/${resolvedURI}`;
                                    }
                                    setNodeDetails(prev => ({ ...prev, [resolvedURI]: '' }));
                                    setNewPropURI('');
                                    setIsAddingCustomProp(false);
                                  }
                                }}
                              >
                                Añadir
                              </button>
                              <button className="btn" onClick={() => setIsAddingCustomProp(false)}>Cancelar</button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sección 3: Metadatos del Sistema */}
                  <div className="collapsible-section">
                    <div 
                      className={`collapsible-header ${openSections.meta ? 'open' : ''}`}
                      onClick={() => setOpenSections({ ...openSections, meta: !openSections.meta })}
                    >
                      <span>ℹ️ Metadatos del Sistema</span>
                      <span className="caret">▶</span>
                    </div>
                    {openSections.meta && (
                      <div className="collapsible-content">
                        <div className="form-group">
                          <label>URI del Recurso</label>
                          <input type="text" value={selectedNode.uri} readOnly style={{ cursor: 'copy' }} onClick={() => navigator.clipboard.writeText(selectedNode.uri)} title="Clic para copiar URI" />
                        </div>
                        <div className="form-group">
                          <label>Clase RDF de la Ontología (rdf:type)</label>
                          <input type="text" value={selectedNode.type} readOnly />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botones de acción del Modal */}
                  <div className="flex-row flex-space" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                    <button className="btn" onClick={() => { setSelectedNode(null); setIsInspectorOpen(false); }}>Cancelar</button>
                    <button className="btn btn-primary" onClick={saveNodeProperties}>Guardar Cambios</button>
                  </div>
                </>
              )}

              {selectedConnection && (
                <>
                  <div className="form-group">
                    <label>Sujeto (Origen)</label>
                    <input type="text" value={getCleanLabel(selectedConnection.from)} readOnly />
                  </div>
                  <div className="form-group">
                    <label>Predicado (Relación)</label>
                    <input type="text" value={getCleanLabel(selectedConnection.predicate)} readOnly />
                  </div>
                  <div className="form-group">
                    <label>Objeto (Destino)</label>
                    <input type="text" value={getCleanLabel(selectedConnection.to)} readOnly />
                  </div>
                </>
              )}
            </div>
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
                <option value="http://vivoweb.org/ontology/core#UndergraduateStudent">Tesista de Grado (vivo:UndergraduateStudent)</option>
                <option value="http://vivoweb.org/ontology/core#Project">Proyecto (vivo:Project)</option>
                <option value="https://dblp.org/rdf/schema#Article">Paper (dblp:Article)</option>
                <option value="http://cso.kmi.open.ac.uk/schema/cso#Topic">Tópico CSO (cso:Topic)</option>
                <option value="http://purl.org/ontology/bibo/Thesis#PhD">Tesis Doctoral (PhD Thesis)</option>
                <option value="http://purl.org/ontology/bibo/Thesis#Master">Tesis de Maestría (Magister)</option>
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
      <div id="sidebarSemantic" className={activeRightPanel === 'sparql' ? '' : 'collapsed'}>
        {isDev && <span className="dev-tag-badge">#sidebarSemantic</span>}
        <div className="sidebar-header">
          <h2>Consola SPARQL</h2>
          <button className="btn" onClick={() => setActiveRightPanel('none')}>
            Ocultar
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

      {/* Pomodoro Timer Sidebar */}
      <div id="sidebarPomodoro" className={activeRightPanel === 'pomodoro' ? '' : 'collapsed'}>
        {isDev && <span className="dev-tag-badge">#sidebarPomodoro</span>}
        <div className="sidebar-header">
          <h2>🍅 Pomodoro</h2>
          <button className="btn" onClick={() => setActiveRightPanel('none')}>
            Ocultar
          </button>
        </div>
        <div className="sidebar-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', padding: '20px', overflowY: 'auto' }}>
          
          {/* Circular/Capsule Timer Display */}
          <div className={`pomodoro-display ${pomodoroMode === 'work' ? 'work-mode' : 'break-mode'}`}>
            <span className="pomodoro-time">
              {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:
              {(timeLeft % 60).toString().padStart(2, '0')}
            </span>
            <span className="pomodoro-status-tag">
              {pomodoroMode === 'work' ? 'TRABAJO' : 'RECREO'}
            </span>
          </div>

          {/* Controls */}
          <div className="flex-row" style={{ gap: '12px', justifyContent: 'center', width: '100%' }}>
            <button 
              className={`btn ${timerRunning ? 'btn-danger' : 'btn-primary'}`} 
              onClick={() => setTimerRunning(!timerRunning)}
              style={{ flex: 1 }}
            >
              {timerRunning ? '⏸️ Pausar' : '▶️ Iniciar'}
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setTimerRunning(false);
                setTimeLeft(pomodoroMode === 'work' ? customWorkTime * 60 : customBreakTime * 60);
              }}
            >
              🔄 Reiniciar
            </button>
          </div>

          {/* Presets and custom settings */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>PREAJUSTES</label>
            <div className="flex-row" style={{ gap: '6px' }}>
              <button className="btn btn-sm" onClick={() => {
                setTimerRunning(false);
                setPomodoroMode('work');
                setTimeLeft(customWorkTime * 60);
              }} style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}>Trabajo</button>
              
              <button className="btn btn-sm" onClick={() => {
                setTimerRunning(false);
                setPomodoroMode('shortBreak');
                setTimeLeft(5 * 60);
              }} style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}>Recreo (5m)</button>

              <button className="btn btn-sm" onClick={() => {
                setTimerRunning(false);
                setPomodoroMode('longBreak');
                setTimeLeft(15 * 60);
              }} style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}>Largo (15m)</button>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '8px 0' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>CONFIGURACIÓN</label>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem' }}>Minutos Trabajo:</span>
                <input 
                  type="number" 
                  value={customWorkTime} 
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 25);
                    setCustomWorkTime(val);
                    if (!timerRunning && pomodoroMode === 'work') setTimeLeft(val * 60);
                  }}
                  style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-mantle)', color: 'var(--text)' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem' }}>Minutos Recreo:</span>
                <input 
                  type="number" 
                  value={customBreakTime} 
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 5);
                    setCustomBreakTime(val);
                    if (!timerRunning && pomodoroMode === 'shortBreak') setTimeLeft(val * 60);
                  }}
                  style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-mantle)', color: 'var(--text)' }}
                />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ width: '100%', marginTop: 'auto', background: 'var(--bg-crust)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ESTADÍSTICAS</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Pomodoros Completados:</span>
              <span style={{ fontSize: '1.1rem', marginTop: '4px' }}>
                {completedCycles > 0 ? Array(completedCycles).fill('🍅').join(' ') : 'Ninguno todavía'}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* Floating Toggle Buttons (Open Panels) */}
      {activeRightPanel === 'none' && (
        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 100, display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={() => setActiveRightPanel('sparql')}>
            Consola SPARQL
          </button>
          <button className="btn btn-primary" onClick={() => setActiveRightPanel('pomodoro')}>
            ⏱️ Pomodoro
          </button>
        </div>
      )}
    </div>
  );
}
