import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PomodoroTimer } from './components/PomodoroTimer';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase';
import { AuthScreen } from './components/AuthScreen';
import { NodeAvatar } from './components/NodeAvatar';
import { IconPicker } from './components/IconPicker';
import { AvatarPicker } from './components/AvatarPicker';
import { MindmapCanvas } from './components/MindmapCanvas';
import { AdminUsersModal } from './components/AdminUsersModal';

interface RDFNode {
  uri: string;
  label: string;
  type: string;
  x: number;
  y: number;
  status?: string;
  thesisType?: string;
  photoUrl?: string;
  mindmapContent?: string;
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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [associatedResearcher, setAssociatedResearcher] = useState<string | null>(null);
  const [configNewNode, setConfigNewNode] = useState({ label: '', uriSuffix: '' });
  const [configSelectUri, setConfigSelectUri] = useState('');

  // Monitor auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const fetchWithAuth = useCallback(async (url: RequestInfo | URL, options: RequestInit = {}) => {
    const token = await auth.currentUser?.getIdToken();
    const headers = {
      ...options.headers,
      'Content-Type': 'application/json',
    } as Record<string, string>;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, {
      ...options,
      headers,
    });
  }, []);

  const [nodes, setNodes] = useState<RDFNode[]>([]);
  const [connections, setConnections] = useState<RDFConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<RDFNode | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<RDFConnection | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<RDFNode | null>(null);

  // Global Inference Toggle state (default false / off)
  const [useInference, setUseInference] = useState<boolean>(false);

  // Inspector property editing states
  const [nodeDetails, setNodeDetails] = useState<{ [predURI: string]: string }>({});
  const [availableProperties, setAvailableProperties] = useState<string[]>([]);
  const [openSections, setOpenSections] = useState({ basic: true, ontology: true, meta: false });
  const [validationErrors, setValidationErrors] = useState<{ [predURI: string]: string }>({});
  const [newPropURI, setNewPropURI] = useState('');
  const [newPropVal, setNewPropVal] = useState('');
  const [isAddingCustomProp, setIsAddingCustomProp] = useState(false);

  // Node photos — stored as data URLs keyed by node URI
  const [nodePhotos, setNodePhotos] = useState<{ [uri: string]: string }>({});
  // Node custom icons — Phosphor icon name keyed by node URI (null = use automatic avatar)
  const [nodeIcons, setNodeIcons] = useState<{ [uri: string]: string | null }>({});
  // Node custom icon background colors
  const [nodeIconBgs, setNodeIconBgs] = useState<{ [uri: string]: string | null }>({});
  // Tab state for the avatar editor in the inspector
  const [avatarTab, setAvatarTab] = useState<'photo' | 'icon'>('photo');

  const handlePhotoUpload = useCallback((nodeUri: string, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setNodePhotos(prev => ({ ...prev, [nodeUri]: dataUrl }));
    };
    reader.readAsDataURL(file);
  }, []);

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

  // Quick-connect flow: "+" button on node edge
  const [quickConnectSourceUri, setQuickConnectSourceUri] = useState<string | null>(null);
  const [pendingConnectionTarget, setPendingConnectionTarget] = useState<string | null>(null);
  const [showRelationModal, setShowRelationModal] = useState(false);
  const [selectedRelationPredicate, setSelectedRelationPredicate] = useState('http://vivoweb.org/ontology/core#relatedBy');

  // Connection predicate editing
  const [editingPredicate, setEditingPredicate] = useState<string>('');
  const [isSavingPredicate, setIsSavingPredicate] = useState(false);

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

  // Mindmap Modal state
  const [showMindmapModal, setShowMindmapModal] = useState(false);
  const [mindmapMarkdown, setMindmapMarkdown] = useState<string>(`# Título`);
  const [activeMindmapNode, setActiveMindmapNode] = useState<RDFNode | null>(null);

  // SuperAdmin User Management Modal state
  const [showAdminModal, setShowAdminModal] = useState(false);



  const canvasRef = useRef<HTMLDivElement>(null);

  // Load data from GraphDB
  const fetchGraphData = async () => {
    if (!user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX ex: <http://example.org/resource/>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      SELECT DISTINCT ?node ?label ?type ?x ?y ?status ?thesisType ?mindmapContent WHERE {
        ?node rdf:type ?type .
        ?node rfu:createdBy <${userUri}> .
        ?node rdfs:label ?label .
        OPTIONAL { ?node ex:posX ?x }
        OPTIONAL { ?node ex:posY ?y }
        OPTIONAL { ?node ex:status ?status }
        OPTIONAL { ?node ex:thesisType ?thesisType }
        OPTIONAL { ?node rfu:hasMindmap ?mindmapContent }
        FILTER(STRSTARTS(STR(?node), "http://example.org/"))
      }
    `;

    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, infer: useInference })
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
            if (b.mindmapContent) nodeMap[uri].mindmapContent = b.mindmapContent.value;
            return;
          }
          
          nodeMap[uri] = {
            uri,
            label: b.label.value,
            type,
            x: b.x ? parseFloat(b.x.value) : Math.random() * 400 + 100,
            y: b.y ? parseFloat(b.y.value) : Math.random() * 300 + 100,
            status: b.status ? b.status.value : undefined,
            thesisType: b.thesisType ? b.thesisType.value : undefined,
            mindmapContent: b.mindmapContent ? b.mindmapContent.value : undefined
          };
        });

        const loadedNodes = Object.values(nodeMap);
        setNodes(loadedNodes);
        
        // Fetch connections
        await fetchConnections();

        // Fetch associated researcher
        await fetchAssociatedResearcher();
      }
    } catch (e) {
      console.error("Error al cargar nodos de GraphDB", e);
    }
  };

  // Re-fetch canvas data whenever inference setting is toggled
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (user) {
      fetchGraphData();
    }
  }, [useInference]);

  const fetchAssociatedResearcher = async () => {
    if (!user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    const query = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      SELECT ?researcher WHERE {
        <${userUri}> rfu:associatedResearcher ?researcher .
      }
    `;
    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (data.results && data.results.bindings && data.results.bindings.length > 0) {
        setAssociatedResearcher(data.results.bindings[0].researcher.value);
      } else {
        setAssociatedResearcher(null);
      }
    } catch (e) {
      console.error("Error al obtener investigador asociado:", e);
    }
  };

  const linkResearcher = async (researcherUri: string) => {
    if (!user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    
    // First, delete any previous association
    const deleteQuery = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      DELETE WHERE {
        <${userUri}> rfu:associatedResearcher ?r .
      }
    `;
    const insertQuery = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      INSERT DATA {
        <${userUri}> rfu:associatedResearcher <${researcherUri}> .
      }
    `;
    try {
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: deleteQuery })
      });
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });
      setAssociatedResearcher(researcherUri);
    } catch (e) {
      console.error("Error al vincular investigador:", e);
    }
  };

  const unlinkResearcher = async () => {
    if (!user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    const query = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      DELETE WHERE {
        <${userUri}> rfu:associatedResearcher ?r .
      }
    `;
    try {
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      setAssociatedResearcher(null);
    } catch (e) {
      console.error("Error al desvincular investigador:", e);
    }
  };

  const createAndLinkResearcher = async (label: string, uriSuffix: string) => {
    if (!user || !label.trim() || !uriSuffix.trim()) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    const cleanSuffix = uriSuffix.trim().replace(/\s+/g, '');
    const nodeUri = `http://example.org/resource/${cleanSuffix}`;
    
    if (nodes.some(n => n.uri === nodeUri)) {
      alert("La URI del nodo ya existe. Por favor, elige otro sufijo.");
      return;
    }

    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX ex: <http://example.org/resource/>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      INSERT DATA {
        <${nodeUri}> rdf:type <http://vivoweb.org/ontology/core#FacultyMember> ;
                     rdfs:label "${label.trim()}" ;
                     rfu:createdBy <${userUri}> ;
                     ex:posX "150" ;
                     ex:posY "150" .
        <${userUri}> rfu:associatedResearcher <${nodeUri}> .
      }
    `;

    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (data.success) {
        await fetchGraphData();
      }
    } catch (e) {
      console.error("Error al crear y vincular investigador:", e);
    }
  };

  const fetchConnections = async () => {
    if (!user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    const query = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      SELECT ?from ?predicate ?to WHERE {
        ?from ?predicate ?to .
        ?from rfu:createdBy <${userUri}> .
        ?to rfu:createdBy <${userUri}> .
        FILTER(STRSTARTS(STR(?from), "http://example.org/") && STRSTARTS(STR(?to), "http://example.org/"))
        FILTER(?predicate != <http://example.org/resource/posX> && ?predicate != <http://example.org/resource/posY> && ?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> && ?predicate != <http://www.w3.org/2000/01/rdf-schema#label> && ?predicate != <http://example.org/resource/status>)
      }
    `;

    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, infer: useInference })
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
      const res = await fetchWithAuth('/api/sparql', {
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
      const res = await fetchWithAuth('/api/sparql', {
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

  // Load all datatypes when user is resolved
  useEffect(() => {
    if (user) {
      fetchGraphData();
      fetchAllDatatypeProperties();
    }
  }, [user]);

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
      const res = await fetchWithAuth('/api/sparql', {
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

  const saveNodeMindmap = async (targetNode: RDFNode, markdownContent: string) => {
    const escMarkdown = markdownContent.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const updateQuery = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      DELETE {
        <${targetNode.uri}> rfu:hasMindmap ?m .
      }
      INSERT {
        <${targetNode.uri}> rfu:hasMindmap "${escMarkdown}" .
      }
      WHERE {
        OPTIONAL { <${targetNode.uri}> rfu:hasMindmap ?m }
      }
    `;

    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: updateQuery })
      });
      const data = await res.json();
      if (data.success) {
        setNodes(prev => prev.map(n => n.uri === targetNode.uri ? { ...n, mindmapContent: markdownContent } : n));
      }
    } catch (e) {
      console.error('Error saving node mindmap:', e);
    }
  };

   const loadSeedData = async () => {
    if (!user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    const seedQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX vivo: <http://vivoweb.org/ontology/core#>
      PREFIX dblp: <https://dblp.org/rdf/schema#>
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX cso: <http://cso.kmi.open.ac.uk/schema/cso#>
      PREFIX ex: <http://example.org/resource/>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      INSERT DATA {
        ex:TuUsuario a vivo:FacultyMember ;
                     rdfs:label "Dr. Torres" ;
                     ex:posX 400 ;
                     ex:posY 300 ;
                     rfu:createdBy <${userUri}> .
                      
        ex:AnaGomez a vivo:GraduateStudent ;
                    rdfs:label "Lic. Ana Gómez" ;
                    ex:posX 650 ;
                    ex:posY 150 ;
                    rfu:createdBy <${userUri}> .
                     
        ex:ProyectoPICTGrafos a vivo:Project ;
                              rdfs:label "PICT-Grafos" ;
                              ex:posX 150 ;
                              ex:posY 300 ;
                              rfu:createdBy <${userUri}> .

        ex:PaperGNN a dblp:Article ;
                    rdfs:label "GNN for Link Prediction" ;
                    ex:status "In Review" ;
                    ex:posX 900 ;
                    ex:posY 100 ;
                    rfu:createdBy <${userUri}> .

        ex:TopicGNN a cso:Topic ;
                    rdfs:label "Graph Neural Networks" ;
                    ex:posX 900 ;
                    ex:posY -50 ;
                    rfu:createdBy <${userUri}> .

        ex:TuUsuario vivo:advisor ex:AnaGomez .
        ex:AnaGomez vivo:contributorTo ex:ProyectoPICTGrafos .
        ex:PaperGNN dblp:authoredBy ex:AnaGomez .
        ex:PaperGNN dct:subject ex:TopicGNN .
      }
    `;

    try {
      const response = await fetchWithAuth('/api/sparql', {
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
      const response = await fetchWithAuth('/api/sparql', {
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
          await fetchWithAuth('/api/sparql', {
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
    if (!user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    
    const uri = `http://example.org/resource/${newNodeData.uriSuffix.trim()}`;

    // If triggered via quick-connect, place child node offset from parent
    let x: number;
    let y: number;
    if (quickConnectSourceUri) {
      const srcNode = nodes.find(n => n.uri === quickConnectSourceUri);
      x = srcNode ? srcNode.x + 210 : Math.round((-pan.x + window.innerWidth / 2) / zoom);
      y = srcNode ? srcNode.y : Math.round((-pan.y + window.innerHeight / 2) / zoom);
    } else {
      x = Math.round((-pan.x + window.innerWidth / 2) / zoom);
      y = Math.round((-pan.y + window.innerHeight / 2) / zoom);
    }

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
      PREFIX rfu: <http://cientopolis.org/rfu/>
      
      INSERT DATA {
        <${uri}> rdf:type <${finalType}> ;
                 rdfs:label "${newNodeData.label}" ;
                 ex:posX ${x} ;
                 ex:posY ${y} ;
                 rfu:createdBy <${userUri}> .
        ${extraTriples}
      }
    `;

    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });
      const data = await res.json();
      if (data.success) {
        setShowNewNodeModal(false);
        setNewNodeData({ label: '', type: 'http://vivoweb.org/ontology/core#GraduateStudent', uriSuffix: '' });
        await fetchGraphData();
        // If this was a quick-connect action, open relation picker
        if (quickConnectSourceUri) {
          setPendingConnectionTarget(uri);
          const defaultPred = finalType === 'http://cientopolis.org/rfu/Mindmap'
            ? 'http://cientopolis.org/rfu/hasMindmap'
            : 'http://vivoweb.org/ontology/core#relatedBy';
          setSelectedRelationPredicate(defaultPred);
          setShowRelationModal(true);
        }
      }
    } catch (e) {
      console.error("Error creando nodo", e);
    }
  };

  // Create RDF relation triple between two nodes
  const createRelation = async () => {
    if (!quickConnectSourceUri || !pendingConnectionTarget || !selectedRelationPredicate) return;
    
    const sourceNode = nodes.find(n => n.uri === quickConnectSourceUri);
    const targetNode = nodes.find(n => n.uri === pendingConnectionTarget);

    const isSourcePerson = sourceNode && (
      sourceNode.type.includes('Person') ||
      sourceNode.type.includes('FacultyMember') ||
      sourceNode.type.includes('GraduateStudent') ||
      sourceNode.type.includes('UndergraduateStudent')
    );
    const isTargetProject = targetNode && targetNode.type.includes('Project');

    const isSourceProject = sourceNode && sourceNode.type.includes('Project');
    const isTargetPerson = targetNode && (
      targetNode.type.includes('Person') ||
      targetNode.type.includes('FacultyMember') ||
      targetNode.type.includes('GraduateStudent') ||
      targetNode.type.includes('UndergraduateStudent')
    );

    let insertQuery = '';

    // Check if connecting Person <-> Project (VIVO PrincipalInvestigatorRole pattern)
    if ((isSourcePerson && isTargetProject) || (isSourceProject && isTargetPerson)) {
      const personUri = isSourcePerson ? sourceNode.uri : targetNode.uri;
      const projectUri = isSourceProject ? sourceNode.uri : targetNode.uri;
      const roleId = Math.random().toString(36).substring(2, 9);
      const roleUri = `http://example.org/resource/pi_role_${roleId}`;
      const userUri = user ? `http://cientopolis.org/rfu/user/${user.uid}` : 'http://cientopolis.org/rfu/user/guest';

      insertQuery = `
        PREFIX vivo: <http://vivoweb.org/ontology/core#>
        PREFIX obo: <http://purl.obolibrary.org/obo/>
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX rfu: <http://cientopolis.org/rfu/>

        INSERT DATA {
          <${roleUri}> a vivo:PrincipalInvestigatorRole ;
                       rdfs:label "Principal Investigator Role" ;
                       obo:RO_0000052 <${personUri}> ;
                       obo:BFO_0000054 <${projectUri}> ;
                       rfu:createdBy <${userUri}> .

          <${projectUri}> vivo:relates <${personUri}> ;
                          vivo:relates <${roleUri}> .

          <${quickConnectSourceUri}> <${selectedRelationPredicate}> <${pendingConnectionTarget}> .
        }
      `;
    } else {
      insertQuery = `
        INSERT DATA {
          <${quickConnectSourceUri}> <${selectedRelationPredicate}> <${pendingConnectionTarget}> .
        }
      `;
    }

    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });
      const data = await res.json();
      if (data.success) {
        setShowRelationModal(false);
        setQuickConnectSourceUri(null);
        setPendingConnectionTarget(null);
        fetchGraphData();
      }
    } catch (e) {
      console.error("Error creando relación", e);
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
      const res = await fetchWithAuth('/api/sparql', {
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

  // Save (update) the predicate of an existing connection
  const saveConnectionPredicate = async () => {
    if (!selectedConnection || !editingPredicate || editingPredicate === selectedConnection.predicate) return;
    setIsSavingPredicate(true);
    const updateQuery = `
      DELETE DATA {
        <${selectedConnection.from}> <${selectedConnection.predicate}> <${selectedConnection.to}> .
      };
      INSERT DATA {
        <${selectedConnection.from}> <${editingPredicate}> <${selectedConnection.to}> .
      }
    `;
    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: updateQuery })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConnection(null);
        setIsInspectorOpen(false);
        setEditingPredicate('');
        await fetchGraphData();
      }
    } catch (e) {
      console.error('Error al actualizar predicado', e);
    } finally {
      setIsSavingPredicate(false);
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
      const res = await fetchWithAuth('/api/sparql', {
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
    if (typeURI.includes('Mindmap')) return 'Mapa Mental';
    if (typeURI.includes('FacultyMember')) return 'Investigador';
    if (typeURI.includes('GraduateStudent')) return 'Estudiante de posgrado';
    if (typeURI.includes('UndergraduateStudent')) return 'Estudiante de grado';
    if (typeURI.includes('Project')) return 'Proyecto';
    if (typeURI.includes('Article') || typeURI.includes('Publication')) return 'Paper';
    if (typeURI.includes('Topic')) return 'Tópico CSO';
    if (typeURI.includes('Thesis')) {
      if (thesisType === 'PhD Thesis') return 'Tesis Doctoral';
      if (thesisType === 'Magister') return 'Tesis de Maestría';
      return 'Tesis';
    }
    return getCleanLabel(typeURI);
  };

  // Helper selector helper mapping component styles
  const getNodeComponentId = (type: string, thesisType?: string) => {
    if (type.includes('Mindmap')) return 'nodeMindmap';
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

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100vw', height: '100vh', background: '#eff1f5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '2.5rem', animation: 'spin 2s linear infinite' }}>🍅</div>
          <div style={{ fontSize: '1rem', color: '#4c4f69', fontWeight: 500 }}>Iniciando aplicación semántica...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      
      {/* Top Header/Navbar */}
      <div className="top-navbar" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: 'var(--bg-surface)', 
        borderBottom: '1px solid var(--border-color)', 
        padding: '12px 24px',
        zIndex: 100,
        height: '64px',
        boxSizing: 'border-box',
        position: 'relative',
        flexShrink: 0
      }}>
        {/* Left Side: Title and Node Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Spatial Semantic Canvas</h1>
          
          <div style={{ position: 'relative' }}>
            {isDev && <span className="dev-tag-badge" style={{ top: '-18px' }}>#btnAgregarNodo</span>}
            <button className="btn btn-primary" onClick={() => setShowNewNodeModal(true)}>+ Agregar Nodo</button>
          </div>

          <div style={{ position: 'relative' }}>
            {isDev && <span className="dev-tag-badge" style={{ top: '-18px' }}>#btnConectarNodos</span>}
            <button 
              className={`btn ${isConnectingMode ? 'btn-primary' : ''}`}
              onClick={() => {
                setIsConnectingMode(!isConnectingMode);
                setConnectSourceNode(null);
              }}
            >
              {isConnectingMode ? 'Conectando...' : 'Conectar Nodos'}
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            {isDev && <span className="dev-tag-badge" style={{ top: '-18px' }}>#btnMindmap</span>}
            <button className="btn" onClick={() => setShowMindmapModal(true)} style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed', borderColor: 'rgba(124, 58, 237, 0.3)' }}>
              🧠 Mapa Mental
            </button>
          </div>
          
          {nodes.length === 0 && (
            <button className="btn" onClick={loadSeedData}>Cargar Semilla Inicial</button>
          )}
        </div>

        {/* Right Side: SPARQL Console, Pomodoro, and User Profile Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Floating Toggle Buttons (Open Panels) */}
          {activeRightPanel === 'none' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ position: 'relative' }}>
                {isDev && <span className="dev-tag-badge" style={{ top: '-18px' }}>#btnConsolaSparql</span>}
                <button className="btn" onClick={() => setActiveRightPanel('sparql')}>
                  Consola SPARQL
                </button>
              </div>
              
              <div style={{ position: 'relative' }}>
                {isDev && <span className="dev-tag-badge" style={{ top: '-18px' }}>#btnPomodoro</span>}
                <button className="btn btn-primary" onClick={() => setActiveRightPanel('pomodoro')}>
                  ⏱️ Pomodoro
                </button>
              </div>
            </div>
          )}

          {/* User Profile Dropdown */}
          <div style={{ position: 'relative' }}>
            {isDev && <span className="dev-tag-badge" style={{ top: '-18px' }}>#userDropdownMenu</span>}
            <div 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                padding: '8px 16px',
                borderRadius: '12px',
                cursor: 'pointer',
                userSelect: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                transition: 'background-color 0.2s',
              }}
            >
              <span style={{ fontSize: '1rem' }}>👤</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)' }}>{user.email}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isUserMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▼</span>
            </div>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <div style={{
                position: 'absolute',
                top: '48px',
                right: 0,
                background: 'var(--bg-surface)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '8px 0',
                width: '220px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', marginBottom: '4px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SESIÓN ACTIVA</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', wordBreak: 'break-all' }}>{user.email}</div>
                </div>

                <button 
                  onClick={() => {
                    setShowConfigModal(true);
                    setIsUserMenuOpen(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-main)',
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    transition: 'background-color 0.2s',
                  }}
                >
                  ⚙️ Configuración General
                </button>

                <button 
                  onClick={() => {
                    setShowAdminModal(true);
                    setIsUserMenuOpen(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-main)',
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    transition: 'background-color 0.2s',
                  }}
                >
                  👑 Gestión de Usuarios (Admin)
                </button>

                <button 
                  onClick={() => {
                    const configHeader = document.querySelector('label[style*="cursor: pointer"]');
                    if (configHeader) {
                      (configHeader as HTMLElement).click();
                    }
                    alert('Puedes ajustar el Pomodoro usando el panel colapsable "CONFIGURACIÓN" en la barra lateral.');
                    setIsUserMenuOpen(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-main)',
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    transition: 'background-color 0.2s',
                  }}
                >
                  🍅 Configuración Pomodoro
                </button>

                <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

                <button 
                  onClick={() => signOut(auth)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#d20f39',
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    transition: 'background-color 0.2s',
                  }}
                >
                  🚪 Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area (Canvas & Sidebars) */}
      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden', height: 'calc(100vh - 64px)' }}>

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
            {(() => {
              // Group connections by node pair key (unordered) to identify multi-edges
              const pairGroups: Record<string, RDFConnection[]> = {};
              connections.forEach(conn => {
                const pairKey = [conn.from, conn.to].sort().join(':::');
                if (!pairGroups[pairKey]) pairGroups[pairKey] = [];
                pairGroups[pairKey].push(conn);
              });

              return connections.map((conn) => {
                const fromNode = nodes.find(n => n.uri === conn.from);
                const toNode = nodes.find(n => n.uri === conn.to);
                
                if (!fromNode || !toNode) return null;

                const pairKey = [conn.from, conn.to].sort().join(':::');
                const siblingConns = pairGroups[pairKey] || [conn];
                const multiIndex = siblingConns.findIndex(c => c.id === conn.id);
                const totalMulti = siblingConns.length;

                // Retrieve measured heights, fallback to 80px
                const hFrom = nodeHeights[conn.from] || 80;
                const hTo = nodeHeights[conn.to] || 80;

                // Node Centers (width = 220px -> half = 110px)
                let cx1 = fromNode.x + 110;
                let cy1 = fromNode.y + hFrom / 2;
                let cx2 = toNode.x + 110;
                let cy2 = toNode.y + hTo / 2;
                
                let fromHeight = hFrom;
                let toHeight = hTo;

                // Invert visually for vivo:advisor if student -> faculty
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

                // Border Intersections (w = 220)
                const startPt = getCardBorderPoint(cx1, cy1, cx2, cy2, 220, fromHeight);
                const endPt = getCardBorderPoint(cx2, cy2, cx1, cy1, 220, toHeight);

                const x1 = startPt.x;
                const y1 = startPt.y;
                const x2 = endPt.x;
                const y2 = endPt.y;

                // Calculate curvature offset for multi-edges
                // Single edge: curvatureOffset = 0 (straight line)
                // Multiple edges: alternate -45px, +45px, -85px, +85px, etc.
                let curvatureOffset = 0;
                if (totalMulti > 1) {
                  const step = 42;
                  const side = multiIndex % 2 === 0 ? 1 : -1;
                  const magnitude = Math.floor(multiIndex / 2) + 1;
                  curvatureOffset = side * magnitude * step;
                }

                // Calculate Bézier Control Point (Q cx, cy)
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                // Perpendicular vector
                const nx = -dy / dist;
                const ny = dx / dist;

                const ctrlX = midX + nx * curvatureOffset;
                const ctrlY = midY + ny * curvatureOffset;

                // Midpoint on quadratic Bézier curve at t=0.5: B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
                const labelX = 0.25 * x1 + 0.5 * ctrlX + 0.25 * x2;
                const labelY = 0.25 * y1 + 0.5 * ctrlY + 0.25 * y2;

                const isSel = selectedConnection?.id === conn.id;
                const labelText = getCleanLabel(conn.predicate);
                const badgeWidth = Math.max(70, labelText.length * 7 + 16);

                const pathData = curvatureOffset === 0
                  ? `M ${x1} ${y1} L ${x2} ${y2}`
                  : `M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`;

                const handleClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setSelectedConnection(conn);
                  setEditingPredicate(conn.predicate);
                  setSelectedNode(null);
                  setIsInspectorOpen(true);
                };

                return (
                  <g key={conn.id} style={{ cursor: 'pointer' }}>
                    {/* Invisible wide hit area path for easier clicking */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      onClick={handleClick}
                    />

                    {/* Visible edge line/curve */}
                    <path
                      d={pathData}
                      fill="none"
                      className={`edge-connector-path ${isSel ? 'selected' : ''}`}
                      markerEnd="url(#arrow)"
                      onClick={handleClick}
                    />

                    {/* Badge background + label text centered at curve midpoint */}
                    <g transform={`translate(${labelX}, ${labelY})`} onClick={handleClick}>
                      {/* Pill Badge Background */}
                      <rect
                        x={-badgeWidth / 2}
                        y={-12}
                        width={badgeWidth}
                        height={22}
                        rx={11}
                        ry={11}
                        fill={isSel ? '#1e66f5' : '#ffffff'}
                        stroke={isSel ? '#1e66f5' : '#cbd5e1'}
                        strokeWidth={1.5}
                        style={{
                          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))',
                          transition: 'all 0.15s ease',
                        }}
                      />
                      {/* Label Text */}
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          fill: isSel ? '#ffffff' : '#334155',
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                          userSelect: 'none',
                          pointerEvents: 'none',
                        }}
                      >
                        {labelText}
                      </text>
                    </g>
                  </g>
                );
              });
            })()}
          </svg>

          {/* Cards / Nodes */}
          {nodes.map((node) => {
            const isSelected = selectedNode?.uri === node.uri;
            const isConnectSrc = connectSourceNode === node.uri;
            const isSelf = node.uri === associatedResearcher;
            const nodeDomId = getNodeComponentId(node.type, node.thesisType);

            // Tinted Chips palette — guaranteed inline so CSS specificity never interferes
            const chipPalette: Record<string, { bg: string; chipColor: string; titleColor: string; tagBg: string; tagColor: string }> = {
              nodeInvestigador:   { bg: 'rgba(219, 234, 254, 0.9)',  chipColor: '#1e66f5', titleColor: '#1e3a8a', tagBg: 'rgba(30,102,245,0.15)',  tagColor: '#1e3a8a' },
              nodeTesistaPosgrado:{ bg: 'rgba(209, 250, 229, 0.9)',  chipColor: '#16a34a', titleColor: '#14532d', tagBg: 'rgba(22,163,74,0.15)',   tagColor: '#14532d' },
              nodeTesistaDeGrado: { bg: 'rgba(204, 251, 241, 0.9)',  chipColor: '#0891b2', titleColor: '#164e63', tagBg: 'rgba(8,145,178,0.15)',   tagColor: '#164e63' },
              nodeProyecto:       { bg: 'rgba(254, 226, 226, 0.9)',  chipColor: '#dc2626', titleColor: '#7f1d1d', tagBg: 'rgba(220,38,38,0.15)',   tagColor: '#7f1d1d' },
              nodePaper:          { bg: 'rgba(237, 233, 254, 0.9)',  chipColor: '#7c3aed', titleColor: '#4c1d95', tagBg: 'rgba(124,58,237,0.15)',  tagColor: '#4c1d95' },
              nodeTesisDoctoral:  { bg: 'rgba(255, 237, 213, 0.9)',  chipColor: '#ea580c', titleColor: '#7c2d12', tagBg: 'rgba(234,88,12,0.15)',   tagColor: '#7c2d12' },
              nodeTesisMaestria:  { bg: 'rgba(254, 249, 195, 0.9)',  chipColor: '#ca8a04', titleColor: '#713f12', tagBg: 'rgba(202,138,4,0.15)',   tagColor: '#713f12' },
              nodeTopicCSO:       { bg: 'rgba(204, 251, 241, 0.9)',  chipColor: '#0d9488', titleColor: '#134e4a', tagBg: 'rgba(13,148,136,0.15)',  tagColor: '#134e4a' },
              nodeMindmap:        { bg: 'rgba(238, 242, 255, 0.95)', chipColor: '#4f46e5', titleColor: '#312e81', tagBg: 'rgba(79,70,229,0.15)',   tagColor: '#312e81' },
            };
            const chip = chipPalette[nodeDomId] ?? { bg: 'rgba(241,245,249,0.9)', chipColor: '#64748b', titleColor: '#1e293b', tagBg: 'rgba(100,116,139,0.12)', tagColor: '#334155' };

            return (
              <div
                key={node.uri}
                ref={(el) => nodeRef(el, node.uri)}
                id={node.uri}
                className={`node-card ${isSelected ? 'selected' : ''}`}
                style={{
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  background: chip.bg,
                  border: isConnectSrc
                    ? '2px dashed #f59e0b'
                    : isSelected
                      ? `2px solid ${chip.chipColor}`
                      : '1.5px solid transparent',
                  boxShadow: isSelected
                    ? `0 0 0 3px ${chip.chipColor}22, 0 4px 16px rgba(0,0,0,0.10)`
                    : isSelf
                      ? `0 0 18px ${chip.chipColor}55, 0 4px 16px rgba(0,0,0,0.08)`
                      : '0 2px 8px rgba(0,0,0,0.07)',
                  backdropFilter: 'none',
                  outline: isSelf ? `2px solid ${chip.chipColor}` : 'none',
                  outlineOffset: '2px',
                }}
                onMouseDown={(e) => startDragNode(e, node)}
                onDoubleClick={(e) => {
                  if (node.type.includes('Mindmap')) {
                    e.stopPropagation();
                    setActiveMindmapNode(node);
                    setMindmapMarkdown(node.mindmapContent || `# ${node.label}`);
                    setShowMindmapModal(true);
                  }
                }}
              >
                {/* Quick-connect "+" button on right edge */}
                <button
                  title="Crear y conectar nuevo nodo"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickConnectSourceUri(node.uri);
                    setShowNewNodeModal(true);
                  }}
                  style={{
                    position: 'absolute',
                    right: '-14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: chip.chipColor,
                    color: '#fff',
                    border: '2px solid #fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    fontWeight: 700,
                    lineHeight: 1,
                    boxShadow: `0 2px 8px ${chip.chipColor}66`,
                    zIndex: 20,
                    opacity: 0,
                    transition: 'opacity 0.15s ease, transform 0.15s ease',
                  }}
                  className="node-quick-connect-btn"
                >+</button>
                {isDev && <span className="dev-tag-badge">#{nodeDomId}</span>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Inspector / Details Gear Icon (Left side) */}
                  <button
                    className="node-inspect-btn"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setSelectedNode(node); setSelectedConnection(null); setIsInspectorOpen(true); }}
                    title="Ver detalles / Configurar nodo"
                    style={{ color: chip.titleColor, fontSize: '0.95rem', padding: '2px', cursor: 'pointer', background: 'none', border: 'none' }}
                  >⚙️</button>
                  {/* Avatar / Icon */}
                  <NodeAvatar
                    nodeType={nodeDomId}
                    seed={node.uri}
                    photoUrl={nodePhotos[node.uri]}
                    iconName={nodeIcons[node.uri]}
                    iconBgColor={nodeIconBgs[node.uri]}
                    size={40}
                    chipColor={chip.chipColor}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        background: chip.tagBg,
                        color: chip.tagColor,
                        padding: '1px 5px',
                        borderRadius: '4px',
                      }}>{getCleanType(node.type, node.thesisType)}</span>
                      {isSelf && (
                        <span style={{
                          fontSize: '0.58rem',
                          fontWeight: 700,
                          background: chip.chipColor,
                          color: '#fff',
                          padding: '1px 5px',
                          borderRadius: '4px',
                        }}>Este sos vos</span>
                      )}
                    </div>
                  </div>
                  {node.status && <span style={{ fontSize: '0.6rem', color: chip.chipColor, alignSelf: 'center', flexShrink: 0 }}>{node.status}</span>}
                </div>
                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: chip.titleColor, lineHeight: 1.25, wordBreak: 'break-word' }}>
                  {node.label}
                </h3>
                <p style={{ margin: 0, fontSize: '0.62rem', color: chip.titleColor, opacity: 0.45, lineHeight: 1.2 }}>
                  {getCleanLabel(node.uri)}
                </p>

                {/* Mindmap specific trigger button */}
                {node.type.includes('Mindmap') && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMindmapNode(node);
                      setMindmapMarkdown(node.mindmapContent || `# ${node.label}`);
                      setShowMindmapModal(true);
                    }}
                    style={{
                      marginTop: '6px',
                      padding: '5px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#fff',
                      background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      boxShadow: '0 2px 6px rgba(79,70,229,0.3)',
                      transition: 'all 0.15s ease'
                    }}
                    title="Abrir editor de Mapa Mental"
                  >
                    🧠 Ver / Editar Mapa Mental
                  </button>
                )}
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
                  {/* Sección 3: Mapa Mental Asociado (rfu:hasMindmap) */}
                  <div className="collapsible-section">
                    <div
                      className={`collapsible-header ${openSections.mindmap !== false ? 'open' : ''}`}
                      onClick={() => setOpenSections({ ...openSections, mindmap: openSections.mindmap === false })}
                    >
                      <span>🧠 Mapa Mental (rfu:hasMindmap)</span>
                      <span className="caret">▶</span>
                    </div>
                    {openSections.mindmap !== false && (
                      <div className="collapsible-content">
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                          Vinculá un mapa mental interactivo a este nodo utilizando la propiedad semántica <code>rfu:hasMindmap</code>.
                        </p>
                        <button
                          className="btn btn-primary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}
                          onClick={() => {
                            const target = selectedNode;
                            setSelectedNode(null);
                            setIsInspectorOpen(false);
                            setActiveMindmapNode(target);
                            setMindmapMarkdown(target.mindmapContent || `# ${target.label}`);
                            setShowMindmapModal(true);
                          }}
                        >
                          🧠 {selectedNode.mindmapContent ? 'Editar Mapa Mental Asociado' : 'Crear Mapa Mental para este Nodo'}
                        </button>
                      </div>
                    )}
                  </div>
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

                        {/* Photo / Icon section — tabbed */}
                        <div className="form-group">
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🖼️ Imagen / Ícono del nodo
                          </label>

                          {/* Preview + tab switcher */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '10px' }}>
                            <div style={{ flexShrink: 0 }}>
                              <NodeAvatar
                                nodeType={getNodeComponentId(selectedNode.type, selectedNode.thesisType)}
                                seed={selectedNode.uri}
                                photoUrl={nodePhotos[selectedNode.uri]}
                                iconName={nodeIcons[selectedNode.uri]}
                                iconBgColor={nodeIconBgs[selectedNode.uri]}
                                size={60}
                                chipColor="#6c6f85"
                              />
                            </div>
                            {/* Tab buttons */}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {(['photo', 'icon'] as const).map(tab => (
                                <button
                                  key={tab}
                                  onClick={() => setAvatarTab(tab)}
                                  style={{
                                    padding: '5px 14px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    background: avatarTab === tab ? '#6c6f85' : 'var(--bg-surface)',
                                    color: avatarTab === tab ? '#fff' : 'var(--text-muted)',
                                    border: '1.5px solid var(--border-color)',
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  {tab === 'photo' ? '📷 Foto' : '🏷️ Ícono'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Tab: Photo */}
                          {avatarTab === 'photo' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label
                                id="photoUploadLabel"
                                htmlFor="photoUploadInput"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                                  cursor: 'pointer', padding: '7px 14px',
                                  background: 'var(--bg-surface)', border: '1px dashed var(--border-color)',
                                  borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-main)',
                                  transition: 'background 0.15s',
                                  alignSelf: 'flex-start',
                                }}
                              >
                                📁 Elegir foto…
                              </label>
                              <input
                                id="photoUploadInput"
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handlePhotoUpload(selectedNode.uri, file);
                                    // Photo takes priority — clear any custom icon
                                    setNodeIcons(prev => ({ ...prev, [selectedNode.uri]: null }));
                                  }
                                  e.target.value = '';
                                }}
                              />
                              {nodePhotos[selectedNode.uri] && (
                                <button
                                  className="btn"
                                  style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#d20f39', alignSelf: 'flex-start' }}
                                  onClick={() => setNodePhotos(prev => {
                                    const next = { ...prev };
                                    delete next[selectedNode.uri];
                                    return next;
                                  })}
                                >
                                  ✕ Quitar foto
                                </button>
                              )}
                              {!nodePhotos[selectedNode.uri] && (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                  Sin foto. Se usa el avatar o ícono seleccionado.
                                </span>
                              )}
                            </div>
                          )}

                          {/* Tab: Icon / Avatar picker */}
                          {avatarTab === 'icon' && (
                            (() => {
                              const componentId = getNodeComponentId(selectedNode.type, selectedNode.thesisType);
                              const isPersonNode = componentId === 'nodeInvestigador' || componentId === 'nodeTesistaPosgrado' || componentId === 'nodeTesistaDeGrado';
                              
                              if (isPersonNode) {
                                return (
                                  <AvatarPicker
                                    currentSeed={selectedNode.uri}
                                    selectedPreset={nodeIcons[selectedNode.uri] ?? null}
                                    onSelect={(presetSeed) => {
                                      setNodeIcons(prev => ({ ...prev, [selectedNode.uri]: presetSeed }));
                                      if (presetSeed) {
                                        setNodePhotos(prev => {
                                          const next = { ...prev };
                                          delete next[selectedNode.uri];
                                          return next;
                                        });
                                      }
                                    }}
                                    chipColor="#6c6f85"
                                  />
                                );
                              }

                              return (
                                <IconPicker
                                  nodeType={componentId}
                                  selectedIcon={nodeIcons[selectedNode.uri] ?? null}
                                  selectedBgColor={nodeIconBgs[selectedNode.uri] ?? null}
                                  onSelect={(name, bgColor) => {
                                    setNodeIcons(prev => ({ ...prev, [selectedNode.uri]: name }));
                                    setNodeIconBgs(prev => ({ ...prev, [selectedNode.uri]: bgColor || null }));
                                    if (name) {
                                      setNodePhotos(prev => {
                                        const next = { ...prev };
                                        delete next[selectedNode.uri];
                                        return next;
                                      });
                                    }
                                  }}
                                  chipColor="#6c6f85"
                                />
                              );
                            })()
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
                    <button
                      className="btn"
                      style={{ color: '#d20f39', borderColor: '#d20f39' }}
                      onClick={() => {
                        const targetNode = selectedNode;
                        setSelectedNode(null);
                        setIsInspectorOpen(false);
                        setNodeToDelete(targetNode);
                      }}
                    >
                      🗑️ Eliminar Nodo
                    </button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn" onClick={() => { setSelectedNode(null); setIsInspectorOpen(false); }}>Cancelar</button>
                      <button className="btn btn-primary" onClick={saveNodeProperties}>Guardar Cambios</button>
                    </div>
                  </div>
                </>
              )}

              {selectedConnection && (
                <>
                  <div className="form-group">
                    <label>Sujeto (Origen)</label>
                    <input type="text" value={getCleanLabel(selectedConnection.from)} readOnly style={{ cursor: 'default', opacity: 0.75 }} />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ✏️ Predicado (Relación)
                      <span style={{ fontSize: '0.65rem', fontWeight: 400, background: 'rgba(var(--accent-rgb, 30,102,245),0.12)', color: 'var(--color-investigador, #1e3a8a)', padding: '1px 6px', borderRadius: '4px' }}>editable</span>
                    </label>
                    <select
                      id="connectionPredicateSelect"
                      value={editingPredicate}
                      onChange={(e) => setEditingPredicate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${editingPredicate !== selectedConnection.predicate ? '#1e66f5' : 'var(--border-color)'}`, background: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '0.85rem', transition: 'border-color 0.2s' }}
                    >
                      <optgroup label="VIVO (académico)">
                        <option value="http://vivoweb.org/ontology/core#advisor">vivo:advisor — Director de tesis</option>
                        <option value="http://vivoweb.org/ontology/core#hasMember">vivo:hasMember — Miembro de proyecto</option>
                        <option value="http://vivoweb.org/ontology/core#relatedBy">vivo:relatedBy — Relación genérica</option>
                        <option value="http://vivoweb.org/ontology/core#supportedInformationResource">vivo:supportedInformationResource — Produce paper</option>
                        <option value="http://vivoweb.org/ontology/core#hasCollaborator">vivo:hasCollaborator — Colabora con</option>
                        <option value="http://vivoweb.org/ontology/core#contributorTo">vivo:contributorTo — Contribuye a</option>
                      </optgroup>
                      <optgroup label="DBLP / Bibliográfico">
                        <option value="https://dblp.org/rdf/schema#authoredBy">dblp:authoredBy — Autoría de paper</option>
                        <option value="https://dblp.org/rdf/schema#publishedIn">dblp:publishedIn — Publicado en</option>
                      </optgroup>
                      <optgroup label="Dublin Core">
                        <option value="http://purl.org/dc/terms/subject">dct:subject — Trata sobre tema</option>
                        <option value="http://purl.org/dc/terms/isPartOf">dct:isPartOf — Es parte de</option>
                      </optgroup>
                      <optgroup label="RFU (proyecto)">
                        <option value="http://cientopolis.org/rfu/collaboratesWith">rfu:collaboratesWith — Colabora con</option>
                        <option value="http://cientopolis.org/rfu/supervises">rfu:supervises — Supervisa</option>
                        <option value="http://cientopolis.org/rfu/partOf">rfu:partOf — Parte de</option>
                        <option value="http://cientopolis.org/rfu/researchedIn">rfu:researchedIn — Investigado en</option>
                      </optgroup>
                      <optgroup label="Genérico">
                        <option value="http://example.org/resource/relatedTo">ex:relatedTo — Relacionado con</option>
                      </optgroup>
                    </select>
                    {editingPredicate !== selectedConnection.predicate && (
                      <span style={{ fontSize: '0.7rem', color: '#1e66f5', marginTop: '4px', display: 'block' }}>
                        ⚠️ Predicado cambiado — guardá para aplicar el cambio en GraphDB.
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Objeto (Destino)</label>
                    <input type="text" value={getCleanLabel(selectedConnection.to)} readOnly style={{ cursor: 'default', opacity: 0.75 }} />
                  </div>

                  <div className="flex-row flex-space" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                    <button className="btn" onClick={() => { setSelectedConnection(null); setIsInspectorOpen(false); setEditingPredicate(''); }}>Cancelar</button>
                    <button
                      id="btnGuardarPredicado"
                      className="btn btn-primary"
                      onClick={saveConnectionPredicate}
                      disabled={isSavingPredicate || editingPredicate === selectedConnection.predicate}
                      style={{ opacity: (isSavingPredicate || editingPredicate === selectedConnection.predicate) ? 0.55 : 1, transition: 'opacity 0.2s' }}
                    >
                      {isSavingPredicate ? '⏳ Guardando...' : '💾 Guardar Predicado'}
                    </button>
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
                <option value="http://cientopolis.org/rfu/Mindmap">🧠 Mapa Mental (rfu:Mindmap)</option>
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

      {/* Modal: Selector de relación (quick-connect) */}
      {showRelationModal && quickConnectSourceUri && pendingConnectionTarget && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 600, backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'var(--bg-mantle)', padding: '28px', borderRadius: '18px',
            width: '400px', display: 'flex', flexDirection: 'column', gap: '20px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>🔗 Elegir Relación</h2>
              <button className="btn" onClick={() => {
                setShowRelationModal(false);
                setQuickConnectSourceUri(null);
                setPendingConnectionTarget(null);
              }}>✕</button>
            </div>

            {/* Node pair summary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.04)', padding: '12px 16px', borderRadius: '10px', fontSize: '0.82rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-main)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nodes.find(n => n.uri === quickConnectSourceUri)?.label || '…'}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>→</span>
              <span style={{ fontWeight: 600, color: 'var(--text-main)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nodes.find(n => n.uri === pendingConnectionTarget)?.label || pendingConnectionTarget.split('/').pop()}
              </span>
            </div>

            <div className="form-group">
              <label style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px' }}>Tipo de relación semántica</label>
              <select
                value={selectedRelationPredicate}
                onChange={(e) => setSelectedRelationPredicate(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '0.85rem', width: '100%' }}
              >
                <optgroup label="VIVO (académico)">
                  <option value="http://vivoweb.org/ontology/core#advisor">vivo:advisor — Director de tesis</option>
                  <option value="http://vivoweb.org/ontology/core#hasMember">vivo:hasMember — Miembro de proyecto</option>
                  <option value="http://vivoweb.org/ontology/core#relatedBy">vivo:relatedBy — Relación genérica</option>
                  <option value="http://vivoweb.org/ontology/core#supportedInformationResource">vivo:supportedInformationResource — Produce paper</option>
                  <option value="http://vivoweb.org/ontology/core#hasCollaborator">vivo:hasCollaborator — Colabora con</option>
                </optgroup>
                <optgroup label="DBLP / Bibliográfico">
                  <option value="https://dblp.org/rdf/schema#authoredBy">dblp:authoredBy — Autoría de paper</option>
                  <option value="https://dblp.org/rdf/schema#publishedIn">dblp:publishedIn — Publicado en</option>
                </optgroup>
                <optgroup label="RFU (proyecto)">
                  <option value="http://cientopolis.org/rfu/hasMindmap">rfu:hasMindmap — Mapa mental de</option>
                  <option value="http://cientopolis.org/rfu/collaboratesWith">rfu:collaboratesWith — Colabora con</option>
                  <option value="http://cientopolis.org/rfu/supervises">rfu:supervises — Supervisa</option>
                  <option value="http://cientopolis.org/rfu/partOf">rfu:partOf — Parte de</option>
                  <option value="http://cientopolis.org/rfu/researchedIn">rfu:researchedIn — Investigado en</option>
                </optgroup>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => {
                setShowRelationModal(false);
                setQuickConnectSourceUri(null);
                setPendingConnectionTarget(null);
              }}>Omitir relación</button>
              <button className="btn btn-primary" onClick={createRelation}>
                Conectar Nodos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Configuración General */}
      {showConfigModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 500, backdropFilter: 'blur(4px)'
        }}>
          <div style={{ 
            background: 'var(--bg-mantle)', 
            padding: '32px', 
            borderRadius: '20px', 
            width: '450px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '24px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.2)'
          }}>
            <div className="flex-row flex-space" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-main)' }}>⚙️ Configuración General</h2>
              <button className="btn" onClick={() => setShowConfigModal(false)}>Cerrar</button>
            </div>

            {/* Toggle: Motor de Inferencia SPARQL */}
            <div style={{
              background: 'var(--bg-surface)',
              padding: '16px 20px',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    🧠 Razonamiento e Inferencia GraphDB
                  </span>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                    Consultas del canvas ({`#canvasMain`}) con reglas RDFS/OWL activadas
                  </span>
                </div>

                {/* iOS-style toggle switch */}
                <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={useInference}
                    onChange={(e) => {
                      const nextVal = e.target.checked;
                      setUseInference(nextVal);
                    }}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: useInference ? '#16a34a' : 'var(--border-color)',
                    transition: '0.2s', borderRadius: '26px',
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '20px', width: '20px',
                      left: useInference ? '24px' : '3px', bottom: '3px',
                      backgroundColor: 'white', transition: '0.2s', borderRadius: '50%',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }} />
                  </span>
                </label>
              </div>

              <div style={{
                fontSize: '0.72rem',
                color: useInference ? '#15803d' : 'var(--text-sub)',
                background: useInference ? 'rgba(22,163,74,0.08)' : 'rgba(0,0,0,0.03)',
                padding: '8px 12px',
                borderRadius: '8px',
                borderLeft: useInference ? '3px solid #16a34a' : '3px solid var(--border-color)',
                lineHeight: 1.4
              }}>
                {useInference
                  ? '⚡ Inferencia ACTIVADA: Retorna relaciones deducidas automáticamente por las ontologías VIVO, DBLP y CSO.'
                  : '🔒 Inferencia DESACTIVADA (Default): Retorna únicamente las tripletas creadas explícitamente por los usuarios.'
                }
              </div>
            </div>

            {associatedResearcher ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'rgba(76, 79, 105, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-investigador)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-investigador)', fontWeight: 600, marginBottom: '6px' }}>ESTADO DE VINCULACIÓN</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    ✅ Vinculado a: <strong>{nodes.find(n => n.uri === associatedResearcher)?.label || getCleanLabel(associatedResearcher)}</strong>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', wordBreak: 'break-all' }}>
                    URI: {associatedResearcher}
                  </div>
                </div>
                <button 
                  className="btn" 
                  style={{ color: '#d20f39', borderColor: '#d20f39', alignSelf: 'flex-start' }}
                  onClick={unlinkResearcher}
                >
                  Desvincular Cuenta
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Asocia tu cuenta de usuario con un nodo investigador para destacar tu perfil en el lienzo del sistema.
                </p>

                {/* Opción A: Vincular existente */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Opción A: Vincular a un Investigador Existente
                  </label>
                  <div className="flex-row" style={{ gap: '8px' }}>
                    <select 
                      value={configSelectUri}
                      onChange={(e) => setConfigSelectUri(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="">-- Seleccionar investigador --</option>
                      {nodes
                        .filter(n => n.type.includes('FacultyMember'))
                        .map(n => (
                          <option key={n.uri} value={n.uri}>{n.label}</option>
                        ))
                      }
                    </select>
                    <button 
                      className="btn btn-primary" 
                      disabled={!configSelectUri}
                      onClick={() => {
                        linkResearcher(configSelectUri);
                        setConfigSelectUri('');
                      }}
                    >
                      Vincular
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>O</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                </div>

                {/* Opción B: Crear y vincular nuevo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Opción B: Crear Nuevo Investigador y Vincular
                  </label>
                  <div className="form-group">
                    <label>Nombre / Etiqueta</label>
                    <input 
                      type="text" 
                      placeholder="Ej: Dr. Gomez" 
                      value={configNewNode.label} 
                      onChange={(e) => setConfigNewNode({ ...configNewNode, label: e.target.value })} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Sufijo de URI</label>
                    <input 
                      type="text" 
                      placeholder="Ej: DrGomez" 
                      value={configNewNode.uriSuffix} 
                      onChange={(e) => setConfigNewNode({ ...configNewNode, uriSuffix: e.target.value.replace(/\s+/g, '') })} 
                    />
                  </div>
                  <button 
                    className="btn btn-primary"
                    disabled={!configNewNode.label.trim() || !configNewNode.uriSuffix.trim()}
                    onClick={() => {
                      createAndLinkResearcher(configNewNode.label, configNewNode.uriSuffix);
                      setConfigNewNode({ label: '', uriSuffix: '' });
                    }}
                  >
                    Crear y Vincular
                  </button>
                </div>
              </div>
            )}
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
      <div id="sidebarPomodoro" className={activeRightPanel === 'pomodoro' ? '' : 'collapsed'} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
        {isDev && <span className="dev-tag-badge">#sidebarPomodoro</span>}
        <PomodoroTimer onClose={() => setActiveRightPanel('none')} nodes={nodes} />
      </div>

      {/* Fullscreen Mindmap Modal */}
      {showMindmapModal && (
        <div className="modal-backdrop" style={{ zIndex: 1000, background: 'rgba(0,0,0,0.65)' }}>
          <div style={{
            width: '92vw', height: '90vh', background: 'var(--bg-surface)',
            borderRadius: '16px', border: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)', position: 'relative'
          }}>
            {/* Mindmap Modal Header */}
            <div style={{
              padding: '14px 24px', background: 'var(--bg-mantle)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem' }}>🧠</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    {activeMindmapNode ? `Mapa Mental: ${activeMindmapNode.label}` : 'Mapa Mental (FreeMind / Markdown)'}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {activeMindmapNode ? `Vinculado al nodo via rfu:hasMindmap` : 'Crea y organiza ramas libremente. Guardado en formato estándar Markdown.'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  className="btn"
                  onClick={() => {
                    const blob = new Blob([mindmapMarkdown], { type: 'text/markdown;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = activeMindmapNode ? `mapa-mental-${activeMindmapNode.label.toLowerCase().replace(/\s+/g, '-')}.md` : 'mapa-mental.md';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  title="Descargar archivo Markdown"
                >
                  📥 Exportar .md
                </button>
                <label
                  className="btn"
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                  title="Cargar archivo Markdown"
                >
                  📤 Importar .md
                  <input
                    type="file"
                    accept=".md,.txt"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          const text = evt.target?.result as string;
                          if (text) {
                            setMindmapMarkdown(text);
                            if (activeMindmapNode) {
                              saveNodeMindmap(activeMindmapNode, text);
                            }
                          }
                        };
                        reader.readAsText(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setShowMindmapModal(false);
                    setActiveMindmapNode(null);
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Mindmap Interactive Canvas Container */}
            <div style={{ flex: 1, position: 'relative' }}>
              <MindmapCanvas
                initialMarkdown={mindmapMarkdown}
                onChange={(md) => {
                  setMindmapMarkdown(md);
                  if (activeMindmapNode) {
                    saveNodeMindmap(activeMindmapNode, md);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* SuperAdmin User Management Modal */}
      <AdminUsersModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        fetchWithAuth={fetchWithAuth}
        currentUid={user.uid}
      />

      </div>
    </div>
  );
}
