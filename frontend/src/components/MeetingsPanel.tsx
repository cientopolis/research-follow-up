import React, { useState, useEffect, useCallback } from 'react';

export interface PersonOption {
  uri: string;
  label: string;
  type: string;
}

export interface MeetingSession {
  uri: string;
  date: string;
  notes: string;
  attendees: string[]; // URIs of attendees
}

export interface MeetingItem {
  uri: string;
  label: string;
  recurrenceType: 'puntual' | 'periodica';
  frequency?: 'semanal' | 'quincenal' | 'mensual';
  dayOfWeek?: string;
  date?: string;
  time?: string;
  meetingUrl?: string;
  minutesUrl?: string;
  location?: string;
  participants: string[]; // URIs of participants
  inCanvas: boolean;
  posX?: number;
  posY?: number;
  sessions: MeetingSession[];
}

interface MeetingsPanelProps {
  userUid: string;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  canvasNodes: PersonOption[];
  onRefreshCanvas: () => Promise<void>;
}

const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const MeetingsPanel: React.FC<MeetingsPanelProps> = ({
  userUid,
  fetchWithAuth,
  canvasNodes,
  onRefreshCanvas
}) => {
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'periodica' | 'puntual'>('all');
  const [personFilterUri, setPersonFilterUri] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Create / Edit Meeting
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [editingMeetingUri, setEditingMeetingUri] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    label: '',
    uriSuffix: '',
    recurrenceType: 'periodica' as 'puntual' | 'periodica',
    frequency: 'semanal' as 'semanal' | 'quincenal' | 'mensual',
    dayOfWeek: 'Martes',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    meetingUrl: '',
    minutesUrl: '',
    location: '',
    participants: [] as string[],
    syncToCanvas: true
  });

  // Modal / Drawer for Session History & New Session Log
  const [activeHistoryMeeting, setActiveHistoryMeeting] = useState<MeetingItem | null>(null);
  const [newSessionForm, setNewSessionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    notes: '',
    attendees: [] as string[]
  });

  // Extract people (GraduateStudent, UndergraduateStudent, FacultyMember) from canvasNodes
  const peopleOptions: PersonOption[] = canvasNodes.filter(n =>
    n.type.includes('GraduateStudent') ||
    n.type.includes('UndergraduateStudent') ||
    n.type.includes('FacultyMember') ||
    n.type.includes('Student')
  );

  const getPersonRoleBadge = (typeUri: string) => {
    if (typeUri.includes('GraduateStudent')) return { text: 'Posgrado', color: '#8839ef', bg: 'rgba(136, 57, 239, 0.12)' };
    if (typeUri.includes('UndergraduateStudent')) return { text: 'Grado', color: '#fe640b', bg: 'rgba(254, 100, 11, 0.12)' };
    if (typeUri.includes('FacultyMember')) return { text: 'Investigador', color: '#1e66f5', bg: 'rgba(30, 102, 245, 0.12)' };
    return { text: 'Persona', color: '#4c4f69', bg: 'rgba(76, 79, 105, 0.12)' };
  };

  const getPersonLabel = (uri: string) => {
    const found = canvasNodes.find(n => n.uri === uri);
    if (found) return found.label;
    return uri.split('/').pop() || uri;
  };

  const fetchMeetings = useCallback(async () => {
    if (!userUid) return;
    setLoading(true);
    const userUri = `http://cientopolis.org/rfu/user/${userUid}`;

    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX vivo: <http://vivoweb.org/ontology/core#>
      PREFIX rfu: <http://cientopolis.org/rfu/>
      PREFIX schema: <http://schema.org/>
      PREFIX ex: <http://example.org/resource/>

      SELECT ?meeting ?label ?recurrenceType ?frequency ?dayOfWeek ?date ?time ?meetingUrl ?minutesUrl ?location ?posX ?posY ?participant ?session ?sDate ?sNotes ?sAttendee WHERE {
        ?meeting rdf:type vivo:Meeting .
        { ?meeting rfu:createdBy <${userUri}> } UNION { ?meeting rfu:inCanvasOf <${userUri}> }
        ?meeting rdfs:label ?label .
        OPTIONAL { ?meeting rfu:recurrenceType ?recurrenceType }
        OPTIONAL { ?meeting rfu:frequency ?frequency }
        OPTIONAL { ?meeting rfu:dayOfWeek ?dayOfWeek }
        OPTIONAL { ?meeting ex:startDate ?date }
        OPTIONAL { ?meeting rfu:meetingTime ?time }
        OPTIONAL { ?meeting schema:url ?meetingUrl }
        OPTIONAL { ?meeting rfu:minutesUrl ?minutesUrl }
        OPTIONAL { ?meeting rfu:location ?location }
        OPTIONAL { ?meeting ex:posX ?posX }
        OPTIONAL { ?meeting ex:posY ?posY }
        OPTIONAL {
          { ?meeting rfu:hasParticipant ?participant }
          UNION
          { ?meeting vivo:hasMember ?participant }
          UNION
          { ?participant vivo:relatedBy ?meeting }
        }
        OPTIONAL {
          ?meeting rfu:hasSession ?session .
          OPTIONAL { ?session rfu:sessionDate ?sDate }
          OPTIONAL { ?session rfu:sessionNotes ?sNotes }
          OPTIONAL { ?session rfu:attendedBy ?sAttendee }
        }
      }
    `;

    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, infer: false })
      });
      const data = await res.json();
      if (data.results && data.results.bindings) {
        const map: Record<string, MeetingItem> = {};
        const sessionMap: Record<string, Record<string, MeetingSession>> = {};

        data.results.bindings.forEach((b: any) => {
          const uri = b.meeting.value;
          if (!map[uri]) {
            map[uri] = {
              uri,
              label: b.label?.value || 'Reunión sin título',
              recurrenceType: (b.recurrenceType?.value as 'puntual' | 'periodica') || (b.frequency ? 'periodica' : 'puntual'),
              frequency: b.frequency?.value as any,
              dayOfWeek: b.dayOfWeek?.value,
              date: b.date?.value,
              time: b.time?.value,
              meetingUrl: b.meetingUrl?.value,
              minutesUrl: b.minutesUrl?.value,
              location: b.location?.value,
              participants: [],
              inCanvas: Boolean(b.posX && b.posY),
              posX: b.posX ? parseFloat(b.posX.value) : undefined,
              posY: b.posY ? parseFloat(b.posY.value) : undefined,
              sessions: []
            };
            sessionMap[uri] = {};
          }

          if (b.participant?.value && !map[uri].participants.includes(b.participant.value)) {
            map[uri].participants.push(b.participant.value);
          }

          if (b.session?.value) {
            const sUri = b.session.value;
            if (!sessionMap[uri][sUri]) {
              sessionMap[uri][sUri] = {
                uri: sUri,
                date: b.sDate?.value || '',
                notes: b.sNotes?.value || '',
                attendees: []
              };
            }
            if (b.sAttendee?.value && !sessionMap[uri][sUri].attendees.includes(b.sAttendee.value)) {
              sessionMap[uri][sUri].attendees.push(b.sAttendee.value);
            }
          }
        });

        Object.keys(map).forEach(mUri => {
          map[mUri].sessions = Object.values(sessionMap[mUri] || {}).sort((a, b) => b.date.localeCompare(a.date));
        });

        const list = Object.values(map);
        setMeetings(list);

        if (activeHistoryMeeting) {
          const updatedActive = list.find(m => m.uri === activeHistoryMeeting.uri);
          if (updatedActive) setActiveHistoryMeeting(updatedActive);
        }
      }
    } catch (e) {
      console.error('Error al cargar reuniones:', e);
    } finally {
      setLoading(false);
    }
  }, [userUid, fetchWithAuth, activeHistoryMeeting]);

  useEffect(() => {
    fetchMeetings();
  }, [userUid]);

  const openCreateModal = () => {
    setEditingMeetingUri(null);
    setFormData({
      label: '',
      uriSuffix: '',
      recurrenceType: 'periodica',
      frequency: 'semanal',
      dayOfWeek: 'Martes',
      date: new Date().toISOString().split('T')[0],
      time: '10:00',
      meetingUrl: '',
      minutesUrl: '',
      location: '',
      participants: [],
      syncToCanvas: true
    });
    setShowMeetingModal(true);
  };

  const openEditModal = (m: MeetingItem) => {
    setEditingMeetingUri(m.uri);
    setFormData({
      label: m.label,
      uriSuffix: m.uri.split('/').pop() || '',
      recurrenceType: m.recurrenceType,
      frequency: m.frequency || 'semanal',
      dayOfWeek: m.dayOfWeek || 'Martes',
      date: m.date || new Date().toISOString().split('T')[0],
      time: m.time || '10:00',
      meetingUrl: m.meetingUrl || '',
      minutesUrl: m.minutesUrl || '',
      location: m.location || '',
      participants: [...m.participants],
      syncToCanvas: m.inCanvas
    });
    setShowMeetingModal(true);
  };

  const toggleParticipant = (personUri: string) => {
    setFormData(prev => {
      const exists = prev.participants.includes(personUri);
      return {
        ...prev,
        participants: exists
          ? prev.participants.filter(u => u !== personUri)
          : [...prev.participants, personUri]
      };
    });
  };

  const handleSaveMeeting = async () => {
    if (!formData.label.trim()) {
      alert('Por favor ingresa un título para la reunión.');
      return;
    }

    const userUri = `http://cientopolis.org/rfu/user/${userUid}`;
    const cleanSuffix = (formData.uriSuffix.trim() || formData.label.trim().replace(/[^a-zA-Z0-9_-]/g, '_')).replace(/\s+/g, '_');
    const meetingUri = editingMeetingUri || `http://example.org/resource/Meeting_${cleanSuffix}`;

    const escapedLabel = formData.label.trim().replace(/"/g, '\\"');
    const existingItem = meetings.find(m => m.uri === meetingUri);
    const posX = existingItem?.posX ?? Math.floor(Math.random() * 350 + 200);
    const posY = existingItem?.posY ?? Math.floor(Math.random() * 250 + 150);

    let sparql = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX vivo: <http://vivoweb.org/ontology/core#>
      PREFIX rfu: <http://cientopolis.org/rfu/>
      PREFIX schema: <http://schema.org/>
      PREFIX ex: <http://example.org/resource/>
    `;

    if (editingMeetingUri) {
      sparql += `
        DELETE WHERE {
          <${meetingUri}> rdfs:label ?l .
        };
        DELETE WHERE {
          <${meetingUri}> rfu:recurrenceType ?rt .
        };
        DELETE WHERE {
          <${meetingUri}> rfu:frequency ?f .
        };
        DELETE WHERE {
          <${meetingUri}> rfu:dayOfWeek ?dw .
        };
        DELETE WHERE {
          <${meetingUri}> ex:startDate ?sd .
        };
        DELETE WHERE {
          <${meetingUri}> rfu:meetingTime ?mt .
        };
        DELETE WHERE {
          <${meetingUri}> schema:url ?u .
        };
        DELETE WHERE {
          <${meetingUri}> rfu:minutesUrl ?mu .
        };
        DELETE WHERE {
          <${meetingUri}> rfu:location ?loc .
        };
        DELETE WHERE {
          <${meetingUri}> rfu:hasParticipant ?p .
        };
      `;
    }

    sparql += `
      INSERT DATA {
        <${meetingUri}> rdf:type vivo:Meeting ;
                        rdfs:label "${escapedLabel}" ;
                        rfu:createdBy <${userUri}> ;
                        rfu:recurrenceType "${formData.recurrenceType}" ;
                        rfu:meetingTime "${formData.time}" .
    `;

    if (formData.recurrenceType === 'periodica') {
      sparql += `
        <${meetingUri}> rfu:frequency "${formData.frequency}" ;
                        rfu:dayOfWeek "${formData.dayOfWeek}" .
      `;
    } else if (formData.date) {
      sparql += `
        <${meetingUri}> ex:startDate "${formData.date}" .
      `;
    }

    if (formData.meetingUrl.trim()) {
      sparql += `<${meetingUri}> schema:url <${formData.meetingUrl.trim()}> .\n`;
    }
    if (formData.minutesUrl.trim()) {
      sparql += `<${meetingUri}> rfu:minutesUrl "${formData.minutesUrl.trim().replace(/"/g, '\\"')}" .\n`;
    }
    if (formData.location.trim()) {
      sparql += `<${meetingUri}> rfu:location "${formData.location.trim().replace(/"/g, '\\"')}" .\n`;
    }

    if (formData.syncToCanvas) {
      sparql += `
        <${meetingUri}> ex:posX "${posX}" ;
                        ex:posY "${posY}" .
      `;
    }

    formData.participants.forEach(pUri => {
      sparql += `<${meetingUri}> rfu:hasParticipant <${pUri}> .\n`;
    });

    sparql += `}`;

    try {
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sparql })
      });
      setShowMeetingModal(false);
      await fetchMeetings();
      await onRefreshCanvas();
    } catch (e) {
      console.error('Error al guardar reunión:', e);
      alert('No se pudo guardar la reunión en GraphDB.');
    }
  };

  const handleDeleteMeeting = async (m: MeetingItem) => {
    if (!confirm(`¿Eliminar la reunión "${m.label}" y todo su historial?`)) return;

    const deleteQuery = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      DELETE WHERE {
        <${m.uri}> rfu:hasSession ?s .
        ?s ?sp ?so .
      };
      DELETE WHERE { <${m.uri}> ?p ?o . };
      DELETE WHERE { ?s ?p <${m.uri}> . }
    `;

    try {
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: deleteQuery })
      });
      await fetchMeetings();
      await onRefreshCanvas();
    } catch (e) {
      console.error('Error eliminando reunión:', e);
    }
  };

  const openSessionModal = (m: MeetingItem) => {
    setActiveHistoryMeeting(m);
    setNewSessionForm({
      date: new Date().toISOString().split('T')[0],
      notes: '',
      attendees: [...m.participants]
    });
  };

  const toggleSessionAttendee = (uri: string) => {
    setNewSessionForm(prev => {
      const exists = prev.attendees.includes(uri);
      return {
        ...prev,
        attendees: exists ? prev.attendees.filter(u => u !== uri) : [...prev.attendees, uri]
      };
    });
  };

  const handleAddSession = async () => {
    if (!activeHistoryMeeting) return;
    if (!newSessionForm.date.trim() || !newSessionForm.notes.trim()) {
      alert('Por favor completa la fecha y el resumen/notas del encuentro.');
      return;
    }

    const sessionUri = `${activeHistoryMeeting.uri}_session_${Date.now()}`;
    const escapedNotes = newSessionForm.notes.trim().replace(/"/g, '\\"').replace(/\n/g, '\\n');

    let insertQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      INSERT DATA {
        <${activeHistoryMeeting.uri}> rfu:hasSession <${sessionUri}> .
        <${sessionUri}> rdf:type rfu:MeetingSession ;
                        rfu:sessionDate "${newSessionForm.date}" ;
                        rfu:sessionNotes "${escapedNotes}" .
    `;

    newSessionForm.attendees.forEach(aUri => {
      insertQuery += `<${sessionUri}> rfu:attendedBy <${aUri}> .\n`;
    });

    insertQuery += `}`;

    try {
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });
      setNewSessionForm({
        date: new Date().toISOString().split('T')[0],
        notes: '',
        attendees: [...activeHistoryMeeting.participants]
      });
      await fetchMeetings();
    } catch (e) {
      console.error('Error al registrar encuentro:', e);
    }
  };

  const filteredMeetings = meetings.filter(m => {
    if (filterMode !== 'all' && m.recurrenceType !== filterMode) return false;
    if (personFilterUri !== 'all' && !m.participants.includes(personFilterUri)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = m.label.toLowerCase().includes(q);
      const matchParticipant = m.participants.some(p => getPersonLabel(p).toLowerCase().includes(q));
      const matchDay = (m.dayOfWeek || '').toLowerCase().includes(q);
      return matchTitle || matchParticipant || matchDay;
    }
    return true;
  });

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      color: 'var(--text-main)',
      overflowY: 'auto',
      padding: '28px 36px',
      gap: '24px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '18px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            📅 Agenda de Reuniones y Seguimiento de Dirigidos
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Planificá reuniones periódicas o puntuales con tus tesistas de grado, posgrado y colaboradores, vinculadas al grafo RDF.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={openCreateModal}
          style={{ padding: '10px 18px', fontSize: '0.9rem', fontWeight: 600 }}
        >
          ➕ Nueva Reunión
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        background: 'var(--bg-surface)',
        padding: '14px 18px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)'
      }}>
        {/* Mode Tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'all', label: `Todas (${meetings.length})` },
            { id: 'periodica', label: `🔄 Periódicas (${meetings.filter(m => m.recurrenceType === 'periodica').length})` },
            { id: 'puntual', label: `📌 Puntuales (${meetings.filter(m => m.recurrenceType === 'puntual').length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id as any)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: filterMode === tab.id ? '1px solid var(--color-investigador)' : '1px solid var(--border-color)',
                background: filterMode === tab.id ? 'rgba(30, 102, 245, 0.12)' : 'var(--bg-mantle)',
                color: filterMode === tab.id ? 'var(--color-investigador)' : 'var(--text-main)',
                fontWeight: filterMode === tab.id ? 600 : 400,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Person Selector & Search */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            aria-label="Filtrar por dirigido o persona"
            value={personFilterUri}
            onChange={(e) => setPersonFilterUri(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-mantle)',
              color: 'var(--text-main)',
              fontSize: '0.83rem'
            }}
          >
            <option value="all">👥 Todos los dirigidos / integrantes</option>
            {peopleOptions.map(p => (
              <option key={p.uri} value={p.uri}>
                {p.label} ({getPersonRoleBadge(p.type).text})
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="🔍 Buscar por título, tesista o día..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-mantle)',
              color: 'var(--text-main)',
              fontSize: '0.83rem',
              minWidth: '240px'
            }}
          />
        </div>
      </div>

      {/* Meetings Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          ⏳ Cargando reuniones desde GraphDB...
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div style={{
          padding: '48px',
          textAlign: 'center',
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          border: '1px dashed var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ fontSize: '2.2rem' }}>📅</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>No hay reuniones registradas para este filtro</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px' }}>
            Podés crear una reunión semanal o quincenal de seguimiento con tus tesistas de grado y posgrado o agendar una reunión puntual.
          </div>
          <button className="btn btn-primary" onClick={openCreateModal} style={{ marginTop: '6px' }}>
            ➕ Agendar Primera Reunión
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '18px'
        }}>
          {filteredMeetings.map(m => (
            <div
              key={m.uri}
              style={{
                background: 'var(--bg-surface)',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
              }}
            >
              <div>
                {/* Top Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: m.recurrenceType === 'periodica' ? 'rgba(30, 102, 245, 0.14)' : 'rgba(64, 160, 43, 0.14)',
                    color: m.recurrenceType === 'periodica' ? '#1e66f5' : '#40a02b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em'
                  }}>
                    {m.recurrenceType === 'periodica'
                      ? `🔄 Periódica • ${m.frequency || 'semanal'}`
                      : '📌 Reunión Puntual'}
                  </span>

                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {m.sessions.length} {m.sessions.length === 1 ? 'encuentro' : 'encuentros'}
                  </span>
                </div>

                {/* Title */}
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.08rem', color: 'var(--text-main)' }}>
                  {m.label}
                </h3>

                {/* Schedule Info */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                  fontSize: '0.82rem',
                  color: 'var(--text-muted)',
                  marginBottom: '12px'
                }}>
                  {m.recurrenceType === 'periodica' ? (
                    <span>🗓️ Todos los <strong>{m.dayOfWeek || 'Martes'}</strong></span>
                  ) : (
                    <span>📅 Fecha: <strong>{m.date || 'Sin definir'}</strong></span>
                  )}
                  {m.time && <span>⏰ {m.time} hs</span>}
                  {m.location && <span>📍 {m.location}</span>}
                </div>

                {/* Participants */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Dirigidos / Participantes ({m.participants.length})
                  </div>
                  {m.participants.length === 0 ? (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Sin participantes asignados
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {m.participants.map(pUri => {
                        const nodeObj = canvasNodes.find(n => n.uri === pUri);
                        const badge = getPersonRoleBadge(nodeObj?.type || '');
                        return (
                          <span
                            key={pUri}
                            style={{
                              fontSize: '0.76rem',
                              padding: '3px 9px',
                              borderRadius: '8px',
                              background: badge.bg,
                              color: badge.color,
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                          >
                            👤 {getPersonLabel(pUri)}
                            <small style={{ opacity: 0.8, fontWeight: 400 }}>({badge.text})</small>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Links */}
                {(m.meetingUrl || m.minutesUrl) && (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {m.meetingUrl && (
                      <a
                        href={m.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.78rem',
                          color: '#1e66f5',
                          textDecoration: 'none',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        🎥 Unirse a Llamada ↗
                      </a>
                    )}
                    {m.minutesUrl && (
                      <a
                        href={m.minutesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.78rem',
                          color: '#8839ef',
                          textDecoration: 'none',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        📝 Documento de Minutas ↗
                      </a>
                    )}
                  </div>
                )}

                {/* Latest Session Preview */}
                {m.sessions.length > 0 && (
                  <div style={{
                    marginTop: '12px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'var(--bg-mantle)',
                    borderLeft: '3px solid var(--color-investigador)',
                    fontSize: '0.78rem'
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      Último encuentro ({m.sessions[0].date}):
                    </div>
                    <div style={{
                      color: 'var(--text-muted)',
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {m.sessions[0].notes}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--border-color)',
                paddingTop: '12px',
                marginTop: '4px'
              }}>
                <button
                  className="btn btn-sm"
                  onClick={() => openSessionModal(m)}
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: 'rgba(30, 102, 245, 0.1)',
                    color: '#1e66f5',
                    border: '1px solid rgba(30, 102, 245, 0.25)'
                  }}
                >
                  📋 Bitácora / Asistencia ({m.sessions.length})
                </button>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => openEditModal(m)}
                    title="Editar reunión"
                    style={{ fontSize: '0.78rem' }}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleDeleteMeeting(m)}
                    title="Eliminar reunión"
                    style={{ fontSize: '0.78rem', color: '#d20f39' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create / Edit Meeting */}
      {showMeetingModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.55)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 800,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'var(--bg-mantle)',
            padding: '26px',
            borderRadius: '18px',
            width: '540px',
            maxWidth: '94vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.28)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                {editingMeetingUri ? '✏️ Editar Reunión' : '➕ Definir Reunión con Dirigidos'}
              </h3>
              <button className="btn btn-sm" onClick={() => setShowMeetingModal(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Título de la Reunión</label>
              <input
                type="text"
                placeholder="Ej: Seguimiento Tesis Doctoral - Ana / Reunión Semanal Grupo IA"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              />
            </div>

            {/* Tipo de Reunión: Periódica vs Puntual */}
            <div className="form-group">
              <label>Modalidad de la Reunión</label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, recurrenceType: 'periodica' })}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: formData.recurrenceType === 'periodica' ? '2px solid #1e66f5' : '1px solid var(--border-color)',
                    background: formData.recurrenceType === 'periodica' ? 'rgba(30, 102, 245, 0.12)' : 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    fontWeight: formData.recurrenceType === 'periodica' ? 700 : 400,
                    cursor: 'pointer'
                  }}
                >
                  🔄 Periódica (Recurrente)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, recurrenceType: 'puntual' })}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: formData.recurrenceType === 'puntual' ? '2px solid #40a02b' : '1px solid var(--border-color)',
                    background: formData.recurrenceType === 'puntual' ? 'rgba(64, 160, 43, 0.12)' : 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    fontWeight: formData.recurrenceType === 'puntual' ? 700 : 400,
                    cursor: 'pointer'
                  }}
                >
                  📌 Puntual (Fecha única)
                </button>
              </div>
            </div>

            {/* Configuración de Frecuencia o Fecha */}
            {formData.recurrenceType === 'periodica' ? (
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Frecuencia</label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label>Día de la Semana</label>
                  <select
                    value={formData.dayOfWeek}
                    onChange={(e) => setFormData({ ...formData, dayOfWeek: e.target.value })}
                  >
                    {DAYS_OF_WEEK.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ width: '120px' }}>
                  <label>Horario</label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Fecha de la Reunión</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ width: '140px' }}>
                  <label>Horario</label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Selección de Personas Involucradas */}
            <div className="form-group">
              <label>Personas Involucradas (Tesistas de Grado, Posgrado e Investigadores)</label>
              {peopleOptions.length === 0 ? (
                <div style={{
                  padding: '10px',
                  borderRadius: '8px',
                  background: 'var(--bg-surface)',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)'
                }}>
                  No se encontraron nodos de Tesistas o Investigadores en tu lienzo. Agregalos primero en el Lienzo de Investigación.
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  padding: '10px',
                  background: 'var(--bg-surface)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)'
                }}>
                  {peopleOptions.map(person => {
                    const selected = formData.participants.includes(person.uri);
                    const badge = getPersonRoleBadge(person.type);
                    return (
                      <button
                        key={person.uri}
                        type="button"
                        onClick={() => toggleParticipant(person.uri)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '999px',
                          border: selected ? `2px solid ${badge.color}` : '1px solid var(--border-color)',
                          background: selected ? badge.bg : 'var(--bg-mantle)',
                          color: selected ? badge.color : 'var(--text-main)',
                          fontSize: '0.8rem',
                          fontWeight: selected ? 700 : 400,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>{selected ? '✅' : '➕'}</span>
                        <span>{person.label}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>({badge.text})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Enlaces y Ubicación */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Enlace Videollamada (Meet / Zoom)</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/..."
                  value={formData.meetingUrl}
                  onChange={(e) => setFormData({ ...formData, meetingUrl: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Ubicación Física / Aula / Lab</label>
                <input
                  type="text"
                  placeholder="Ej: Laboratorio LIFIA / Oficina 3"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Documento de Minutas / Notas Compartidas (URL)</label>
              <input
                type="url"
                placeholder="https://docs.google.com/document/..."
                value={formData.minutesUrl}
                onChange={(e) => setFormData({ ...formData, minutesUrl: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button className="btn" onClick={() => setShowMeetingModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveMeeting}>
                💾 Guardar Reunión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Session History & Attendance Log */}
      {activeHistoryMeeting && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.55)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 850,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'var(--bg-mantle)',
            padding: '26px',
            borderRadius: '18px',
            width: '620px',
            maxWidth: '94vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                  📋 Bitácora de Encuentros: {activeHistoryMeeting.label}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Registrá avances, temas tratados y asistencia de cada sesión.
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setActiveHistoryMeeting(null)}>✕</button>
            </div>

            {/* New Session Form */}
            <div style={{
              background: 'var(--bg-surface)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>➕ Registrar Nuevo Encuentro</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Fecha del Encuentro</label>
                  <input
                    type="date"
                    value={newSessionForm.date}
                    onChange={(e) => setNewSessionForm({ ...newSessionForm, date: e.target.value })}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px', color: 'var(--text-muted)' }}>
                    Asistentes presentes
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {activeHistoryMeeting.participants.map(pUri => {
                      const attended = newSessionForm.attendees.includes(pUri);
                      return (
                        <button
                          key={pUri}
                          type="button"
                          onClick={() => toggleSessionAttendee(pUri)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '999px',
                            border: attended ? '1px solid #40a02b' : '1px solid var(--border-color)',
                            background: attended ? 'rgba(64, 160, 43, 0.14)' : 'var(--bg-mantle)',
                            color: attended ? '#40a02b' : 'var(--text-muted)',
                            fontSize: '0.76rem',
                            fontWeight: attended ? 600 : 400,
                            cursor: 'pointer'
                          }}
                        >
                          {attended ? '✓ ' : ''}{getPersonLabel(pUri)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem' }}>Acuerdos / Avances / Minuta del Encuentro</label>
                <textarea
                  rows={3}
                  placeholder="Ej: Se revisó el capítulo 2 del estado del arte. Próxima entrega: experimento inicial."
                  value={newSessionForm.notes}
                  onChange={(e) => setNewSessionForm({ ...newSessionForm, notes: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-mantle)',
                    color: 'var(--text-main)',
                    fontSize: '0.84rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-primary" onClick={handleAddSession}>
                  💾 Guardar Encuentro en Bitácora
                </button>
              </div>
            </div>

            {/* Sessions List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Historial de Sesiones ({activeHistoryMeeting.sessions.length})
              </div>
              {activeHistoryMeeting.sessions.length === 0 ? (
                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                  Todavía no hay encuentros registrados para esta reunión.
                </div>
              ) : (
                activeHistoryMeeting.sessions.map(sess => (
                  <div
                    key={sess.uri}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-investigador)' }}>
                        🗓️ {sess.date}
                      </span>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {sess.attendees.map(aUri => (
                          <span
                            key={aUri}
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: 'rgba(64, 160, 43, 0.12)',
                              color: '#40a02b',
                              fontWeight: 600
                            }}
                          >
                            ✓ {getPersonLabel(aUri)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                      {sess.notes}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
