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
import { AdminCatalogPanel } from './components/AdminCatalogPanel';
import { MeetingsPanel } from './components/MeetingsPanel';
import { lit, iri, httpIri, num, isValidUriSuffix } from './utils/sparql';

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
  externalUrl?: string;
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
    { uri: 'http://schema.org/image', label: 'URL Foto de Perfil (schema:image)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/status', label: 'Estado' }
  ],
  'GraduateStudent': [
    { uri: 'http://vivoweb.org/ontology/core#email', label: 'Email', validation: (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Email inválido' },
    { uri: 'http://schema.org/image', label: 'URL Foto de Perfil (schema:image)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/status', label: 'Estado' },
    { uri: 'http://vivoweb.org/ontology/core#thesisTitle', label: 'Título de Tesis' }
  ],
  'UndergraduateStudent': [
    { uri: 'http://vivoweb.org/ontology/core#email', label: 'Email', validation: (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Email inválido' },
    { uri: 'http://schema.org/image', label: 'URL Foto de Perfil (schema:image)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/status', label: 'Estado' },
    { uri: 'http://vivoweb.org/ontology/core#thesisTitle', label: 'Título de Tesis de Grado' }
  ],
  'Project': [
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/status', label: 'Estado' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/grantNumber', label: 'Número de Subsidio' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/startDate', label: 'Fecha de Inicio (YYYY-MM-DD)', validation: (val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val) ? null : 'Formato YYYY-MM-DD requerido' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/endDate', label: 'Fecha de Fin (YYYY-MM-DD)', validation: (val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val) ? null : 'Formato YYYY-MM-DD requerido' }
  ],
  'Article': [
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/doi', label: 'DOI', validation: (val) => !val || /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(val) ? null : 'DOI inválido' },
    { uri: 'https://dblp.org/rdf/schema#year', label: 'Año (YYYY)', validation: (val) => !val || /^\d{4}$/.test(val) ? null : 'Año de 4 dígitos requerido' },
    { uri: 'https://dblp.org/rdf/schema#journal', label: 'Journal / Revista' }
  ],
  'Topic': [
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/description', label: 'Descripción' }
  ],
  'Thesis': [
    { uri: 'http://purl.org/ontology/bibo/degree', label: 'Grado Académico (bibo:degree)' },
    { uri: 'https://dblp.org/rdf/schema#year', label: 'Año (YYYY)', validation: (val) => !val || /^\d{4}$/.test(val) ? null : 'Año de 4 dígitos requerido' }
  ],
  'DocumentDraft': [
    { uri: 'http://schema.org/url', label: 'URL Externa / Sitio (schema:url)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/status', label: 'Estado (ej. En borrador, En revisión)' }
  ],
  'AcademicArticle': [
    { uri: 'http://schema.org/url', label: 'URL Externa / Referencia (schema:url)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/doi', label: 'DOI', validation: (val) => !val || /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(val) ? null : 'DOI inválido' },
    { uri: 'https://dblp.org/rdf/schema#year', label: 'Año (YYYY)', validation: (val) => !val || /^\d{4}$/.test(val) ? null : 'Año de 4 dígitos requerido' }
  ],
  'Folder': [
    { uri: 'http://schema.org/url', label: 'URL Carpeta Nube (schema:url)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/description', label: 'Descripción / Proveedor' }
  ],
  'ImageObject': [
    { uri: 'http://schema.org/url', label: 'URL Diagrama / Imagen (schema:url)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' }
  ],
  'Dataset': [
    { uri: 'http://schema.org/url', label: 'URL Tabla / Datos (schema:url)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' }
  ],
  'MediaObject': [
    { uri: 'http://schema.org/url', label: 'URL Archivo Externo (schema:url)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' }
  ],
  'Meeting': [
    { uri: 'http://schema.org/url', label: 'URL Videollamada (schema:url)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' },
    { uri: 'http://cientopolis.org/rfu/minutesUrl', label: 'URL Minutas / Notas (rfu:minutesUrl)' },
    { uri: 'http://cientopolis.org/rfu/recurrenceType', label: 'Modalidad (periodica / puntual)' },
    { uri: 'http://cientopolis.org/rfu/frequency', label: 'Frecuencia (semanal / quincenal / mensual)' },
    { uri: 'http://cientopolis.org/rfu/dayOfWeek', label: 'Día de la Semana (rfu:dayOfWeek)' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/startDate', label: 'Fecha de Reunión (YYYY-MM-DD)', validation: (val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val) ? null : 'Formato YYYY-MM-DD requerido' },
    { uri: 'http://cientopolis.org/rfu/meetingTime', label: 'Horario (HH:MM)' },
    { uri: 'http://cientopolis.org/rfu/location', label: 'Ubicación / Aula (rfu:location)' }
  ],
  'Conference': [
    { uri: 'http://schema.org/url', label: 'URL Sitio de Conferencia (schema:url)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/submissionDeadlineMonth', label: 'Meses de Deadline (ej. Marzo, Septiembre)' },
    { uri: 'http://purl.org/ontology/bibo/rank', label: 'Ranking CORE (ej. A*, A, B, C)' },
    { uri: 'http://purl.org/dc/terms/subject', label: 'Temáticas / Tópicos (dcterms:subject)' }
  ],
  'Journal': [
    { uri: 'http://schema.org/url', label: 'URL Sitio de Revista (schema:url)', validation: (val) => !val || /^https?:\/\/.+/i.test(val) ? null : 'Debe comenzar con http:// o https://' },
    { uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/submissionDeadlineMonth', label: 'Meses / Fechas de Envió (ej. Abierto todo el año / Mayo, Nov)' },
    { uri: 'http://purl.org/ontology/bibo/rank', label: 'Cuartil / Ranking (ej. Q1, Q2, Q3, Q4)' },
    { uri: 'http://purl.org/dc/terms/subject', label: 'Temáticas / Tópicos (dcterms:subject)' }
  ]
};

const RELATION_CATEGORIES = [
  {
    category: "Publicaciones y Venues (Conferencias / Revistas)",
    options: [
      { value: "http://vivoweb.org/ontology/core#hasPublicationVenue", label: "vivo:hasPublicationVenue", desc: "Venue / Lugar oficial en la ontología VIVO" },
      { value: "http://vivoweb.org/ontology/core#publicationVenue", label: "vivo:publicationVenue", desc: "Venue / Lugar de publicación planificado u oficial" },
      { value: "http://purl.org/ontology/bibo/presentedAt", label: "bibo:presentedAt", desc: "Presentado o a presentar en conferencia" },
      { value: "https://dblp.org/rdf/schema#publishedIn", label: "dblp:publishedIn", desc: "Publicado o a enviar en revista/conferencia" },
      { value: "http://cientopolis.org/rfu/targetVenue", label: "rfu:targetVenue", desc: "Venue objetivo de envío (Planificación)" }
    ]
  },
  {
    category: "VIVO (académico)",
    options: [
      { value: "http://vivoweb.org/ontology/core#advisor", label: "vivo:advisor", desc: "Director de tesis" },
      { value: "http://vivoweb.org/ontology/core#hasMember", label: "vivo:hasMember", desc: "Miembro de proyecto" },
      { value: "http://vivoweb.org/ontology/core#relatedBy", label: "vivo:relatedBy", desc: "Relación genérica" },
      { value: "http://vivoweb.org/ontology/core#supportedInformationResource", label: "vivo:supportedInformationResource", desc: "Produce paper" },
      { value: "http://vivoweb.org/ontology/core#hasCollaborator", label: "vivo:hasCollaborator", desc: "Colabora con" }
    ]
  },
  {
    category: "DBLP / Bibliográfico",
    options: [
      { value: "https://dblp.org/rdf/schema#authoredBy", label: "dblp:authoredBy", desc: "Autoría de paper" }
    ]
  },
  {
    category: "RFU (proyecto)",
    options: [
      { value: "http://cientopolis.org/rfu/hasMindmap", label: "rfu:hasMindmap", desc: "Mapa mental de" },
      { value: "http://cientopolis.org/rfu/collaboratesWith", label: "rfu:collaboratesWith", desc: "Colabora con" },
      { value: "http://cientopolis.org/rfu/supervises", label: "rfu:supervises", desc: "Supervisa" },
      { value: "http://cientopolis.org/rfu/partOf", label: "rfu:partOf", desc: "Parte de" },
      { value: "http://cientopolis.org/rfu/researchedIn", label: "rfu:researchedIn", desc: "Investigado en" }
    ]
  }
];

const getNodeTypeIcon = (type: string = '') => {
  if (type.includes('FacultyMember')) return '👨‍🏫';
  if (type.includes('GraduateStudent') || type.includes('UndergraduateStudent')) return '🎓';
  if (type.includes('Project')) return '🚀';
  if (type.includes('Article') || type.includes('Publication') || type.includes('DocumentDraft')) return '📄';
  if (type.includes('Conference')) return '🏛️';
  if (type.includes('Journal')) return '📚';
  if (type.includes('Meeting')) return '📅';
  if (type.includes('Mindmap')) return '🧠';
  if (type.includes('Folder')) return '📁';
  if (type.includes('Topic')) return '🏷️';
  return '📍';
};

// Canvas Themes (Alternativa 1: Presets Curados)
export type CanvasThemeId = 'classic' | 'dark-slate' | 'warm-sepia' | 'fresh-sage' | 'monochrome';

export interface CanvasThemeInfo {
  id: CanvasThemeId;
  name: string;
  subtitle: string;
  icon: string;
  bgPreview: string;
  primaryPreview: string;
  accentPreview: string;
}

export const CANVAS_THEMES: CanvasThemeInfo[] = [
  {
    id: 'classic',
    name: 'DireAtento Clásico',
    subtitle: 'Marfil editorial claro',
    icon: '☀️',
    bgPreview: '#E2E8F0',
    primaryPreview: '#1A2B48',
    accentPreview: '#C17F59',
  },
  {
    id: 'dark-slate',
    name: 'Noche Científica',
    subtitle: 'Pizarra oscura baja fatiga',
    icon: '🌙',
    bgPreview: '#0B1120',
    primaryPreview: '#38BDF8',
    accentPreview: '#F59E0B',
  },
  {
    id: 'warm-sepia',
    name: 'Manuscrito Sepia',
    subtitle: 'Pergamino y biblioteca cálida',
    icon: '📜',
    bgPreview: '#ECE3CF',
    primaryPreview: '#4E342E',
    accentPreview: '#B25E29',
  },
  {
    id: 'fresh-sage',
    name: 'Menta Nórdica',
    subtitle: 'Salvia fresca y pino nórdico',
    icon: '🌿',
    bgPreview: '#E5ECE9',
    primaryPreview: '#1B4332',
    accentPreview: '#2D6A4F',
  },
  {
    id: 'monochrome',
    name: 'Monocromo Minimalista',
    subtitle: 'Blanco puro y alto contraste',
    icon: '🔳',
    bgPreview: '#F3F4F6',
    primaryPreview: '#111827',
    accentPreview: '#2563EB',
  },
];

export interface ChipStyle {
  bg: string;
  chipColor: string;
  titleColor: string;
  tagBg: string;
  tagColor: string;
}

export const THEME_PALETTES: Record<CanvasThemeId, Record<string, ChipStyle>> = {
  // 1. Classic (DireAtento original)
  'classic': {
    nodeInvestigador:    { bg: 'rgba(237, 242, 247, 0.95)', chipColor: '#1A2B48', titleColor: '#1A2B48', tagBg: 'rgba(26,43,72,0.12)',   tagColor: '#1A2B48' },
    nodeTesistaPosgrado: { bg: 'rgba(254, 243, 235, 0.95)', chipColor: '#C17F59', titleColor: '#7C4324', tagBg: 'rgba(193,127,89,0.15)', tagColor: '#7C4324' },
    nodeTesistaDeGrado:  { bg: 'rgba(240, 253, 248, 0.95)', chipColor: '#2D8A75', titleColor: '#1B5346', tagBg: 'rgba(163,217,201,0.25)',tagColor: '#1B5346' },
    nodeProyecto:        { bg: 'rgba(254, 243, 235, 0.95)', chipColor: '#C17F59', titleColor: '#7C4324', tagBg: 'rgba(193,127,89,0.15)', tagColor: '#7C4324' },
    nodePaper:           { bg: 'rgba(237, 242, 247, 0.95)', chipColor: '#1A2B48', titleColor: '#1A2B48', tagBg: 'rgba(26,43,72,0.12)',   tagColor: '#1A2B48' },
    nodeTesisDoctoral:   { bg: 'rgba(254, 243, 235, 0.95)', chipColor: '#C17F59', titleColor: '#7C4324', tagBg: 'rgba(193,127,89,0.15)', tagColor: '#7C4324' },
    nodeTesisMaestria:   { bg: 'rgba(240, 253, 248, 0.95)', chipColor: '#2D8A75', titleColor: '#1B5346', tagBg: 'rgba(163,217,201,0.25)',tagColor: '#1B5346' },
    nodeTopicCSO:        { bg: 'rgba(240, 253, 248, 0.95)', chipColor: '#2D8A75', titleColor: '#1B5346', tagBg: 'rgba(163,217,201,0.25)',tagColor: '#1B5346' },
    nodeMindmap:         { bg: 'rgba(237, 242, 247, 0.95)', chipColor: '#1A2B48', titleColor: '#1A2B48', tagBg: 'rgba(26,43,72,0.12)',   tagColor: '#1A2B48' },
    nodeRol:             { bg: 'rgba(254, 243, 235, 0.95)', chipColor: '#C17F59', titleColor: '#7C4324', tagBg: 'rgba(193,127,89,0.15)', tagColor: '#7C4324' },
    nodePaperEscribir:   { bg: 'rgba(254, 243, 235, 0.95)', chipColor: '#C17F59', titleColor: '#7C4324', tagBg: 'rgba(193,127,89,0.15)', tagColor: '#7C4324' },
    nodePaperReferencia: { bg: 'rgba(237, 242, 247, 0.95)', chipColor: '#1A2B48', titleColor: '#1A2B48', tagBg: 'rgba(26,43,72,0.12)',   tagColor: '#1A2B48' },
    nodeCarpetaNube:     { bg: 'rgba(240, 253, 248, 0.95)', chipColor: '#2D8A75', titleColor: '#1B5346', tagBg: 'rgba(163,217,201,0.25)',tagColor: '#1B5346' },
    nodeDiagrama:        { bg: 'rgba(254, 243, 235, 0.95)', chipColor: '#C17F59', titleColor: '#7C4324', tagBg: 'rgba(193,127,89,0.15)', tagColor: '#7C4324' },
    nodeTabla:           { bg: 'rgba(240, 253, 248, 0.95)', chipColor: '#2D8A75', titleColor: '#1B5346', tagBg: 'rgba(163,217,201,0.25)',tagColor: '#1B5346' },
    nodeArchivo:         { bg: 'rgba(237, 242, 247, 0.95)', chipColor: '#4A5568', titleColor: '#1A2B48', tagBg: 'rgba(74,85,104,0.12)',   tagColor: '#1A2B48' },
    nodeReunion:         { bg: 'rgba(254, 243, 235, 0.95)', chipColor: '#C17F59', titleColor: '#7C4324', tagBg: 'rgba(193,127,89,0.15)', tagColor: '#7C4324' },
    nodeConferencia:     { bg: 'rgba(237, 242, 247, 0.95)', chipColor: '#1A2B48', titleColor: '#1A2B48', tagBg: 'rgba(26,43,72,0.12)',   tagColor: '#1A2B48' },
    nodeRevista:         { bg: 'rgba(237, 242, 247, 0.95)', chipColor: '#1A2B48', titleColor: '#1A2B48', tagBg: 'rgba(26,43,72,0.12)',   tagColor: '#1A2B48' },
    default:             { bg: 'rgba(237, 242, 247, 0.95)', chipColor: '#1A2B48', titleColor: '#1A2B48', tagBg: 'rgba(26,43,72,0.12)',   tagColor: '#1A2B48' },
  },

  // 2. Dark Slate (Noche Científica)
  'dark-slate': {
    nodeInvestigador:    { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#38BDF8', titleColor: '#F8FAFC', tagBg: 'rgba(56, 189, 248, 0.20)', tagColor: '#38BDF8' },
    nodeTesistaPosgrado: { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#F59E0B', titleColor: '#FEF3C7', tagBg: 'rgba(245, 158, 11, 0.20)', tagColor: '#F59E0B' },
    nodeTesistaDeGrado:  { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#34D399', titleColor: '#D1FAE5', tagBg: 'rgba(52, 211, 153, 0.20)', tagColor: '#34D399' },
    nodeProyecto:        { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#F59E0B', titleColor: '#FEF3C7', tagBg: 'rgba(245, 158, 11, 0.20)', tagColor: '#F59E0B' },
    nodePaper:           { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#818CF8', titleColor: '#EEF2FF', tagBg: 'rgba(129, 140, 248, 0.20)', tagColor: '#818CF8' },
    nodeTesisDoctoral:   { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#F59E0B', titleColor: '#FEF3C7', tagBg: 'rgba(245, 158, 11, 0.20)', tagColor: '#F59E0B' },
    nodeTesisMaestria:   { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#34D399', titleColor: '#D1FAE5', tagBg: 'rgba(52, 211, 153, 0.20)', tagColor: '#34D399' },
    nodeTopicCSO:        { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#2DD4BF', titleColor: '#CCFBF1', tagBg: 'rgba(45, 212, 191, 0.20)', tagColor: '#2DD4BF' },
    nodeMindmap:         { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#A78BFA', titleColor: '#F5F3FF', tagBg: 'rgba(167, 139, 250, 0.20)', tagColor: '#A78BFA' },
    nodeRol:             { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#F59E0B', titleColor: '#FEF3C7', tagBg: 'rgba(245, 158, 11, 0.20)', tagColor: '#F59E0B' },
    nodePaperEscribir:   { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#F59E0B', titleColor: '#FEF3C7', tagBg: 'rgba(245, 158, 11, 0.20)', tagColor: '#F59E0B' },
    nodePaperReferencia: { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#818CF8', titleColor: '#EEF2FF', tagBg: 'rgba(129, 140, 248, 0.20)', tagColor: '#818CF8' },
    nodeCarpetaNube:     { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#34D399', titleColor: '#D1FAE5', tagBg: 'rgba(52, 211, 153, 0.20)', tagColor: '#34D399' },
    nodeDiagrama:        { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#F59E0B', titleColor: '#FEF3C7', tagBg: 'rgba(245, 158, 11, 0.20)', tagColor: '#F59E0B' },
    nodeTabla:           { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#2DD4BF', titleColor: '#CCFBF1', tagBg: 'rgba(45, 212, 191, 0.20)', tagColor: '#2DD4BF' },
    nodeArchivo:         { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#94A3B8', titleColor: '#F8FAFC', tagBg: 'rgba(148, 163, 184, 0.20)', tagColor: '#94A3B8' },
    nodeReunion:         { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#FB923C', titleColor: '#FFEDD5', tagBg: 'rgba(251, 146, 60, 0.20)',  tagColor: '#FB923C' },
    nodeConferencia:     { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#38BDF8', titleColor: '#F8FAFC', tagBg: 'rgba(56, 189, 248, 0.20)', tagColor: '#38BDF8' },
    nodeRevista:         { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#38BDF8', titleColor: '#F8FAFC', tagBg: 'rgba(56, 189, 248, 0.20)', tagColor: '#38BDF8' },
    default:             { bg: 'rgba(30, 41, 59, 0.95)', chipColor: '#38BDF8', titleColor: '#F8FAFC', tagBg: 'rgba(56, 189, 248, 0.20)', tagColor: '#38BDF8' },
  },

  // 3. Warm Sepia (Manuscrito)
  'warm-sepia': {
    nodeInvestigador:    { bg: 'rgba(254, 250, 242, 0.95)', chipColor: '#4E342E', titleColor: '#3E2723', tagBg: 'rgba(78, 52, 46, 0.12)',   tagColor: '#4E342E' },
    nodeTesistaPosgrado: { bg: 'rgba(255, 248, 236, 0.95)', chipColor: '#B25E29', titleColor: '#6D2E0B', tagBg: 'rgba(178, 94, 41, 0.15)', tagColor: '#6D2E0B' },
    nodeTesistaDeGrado:  { bg: 'rgba(244, 249, 242, 0.95)', chipColor: '#4A7C59', titleColor: '#2D5037', tagBg: 'rgba(74, 124, 89, 0.18)', tagColor: '#2D5037' },
    nodeProyecto:        { bg: 'rgba(255, 248, 236, 0.95)', chipColor: '#B25E29', titleColor: '#6D2E0B', tagBg: 'rgba(178, 94, 41, 0.15)', tagColor: '#6D2E0B' },
    nodePaper:           { bg: 'rgba(254, 250, 242, 0.95)', chipColor: '#4E342E', titleColor: '#3E2723', tagBg: 'rgba(78, 52, 46, 0.12)',   tagColor: '#4E342E' },
    nodeTesisDoctoral:   { bg: 'rgba(255, 248, 236, 0.95)', chipColor: '#B25E29', titleColor: '#6D2E0B', tagBg: 'rgba(178, 94, 41, 0.15)', tagColor: '#6D2E0B' },
    nodeTesisMaestria:   { bg: 'rgba(244, 249, 242, 0.95)', chipColor: '#4A7C59', titleColor: '#2D5037', tagBg: 'rgba(74, 124, 89, 0.18)', tagColor: '#2D5037' },
    nodeTopicCSO:        { bg: 'rgba(244, 249, 242, 0.95)', chipColor: '#4A7C59', titleColor: '#2D5037', tagBg: 'rgba(74, 124, 89, 0.18)', tagColor: '#2D5037' },
    nodeMindmap:         { bg: 'rgba(254, 250, 242, 0.95)', chipColor: '#5D4037', titleColor: '#3E2723', tagBg: 'rgba(93, 64, 55, 0.12)',   tagColor: '#3E2723' },
    nodeRol:             { bg: 'rgba(255, 248, 236, 0.95)', chipColor: '#B25E29', titleColor: '#6D2E0B', tagBg: 'rgba(178, 94, 41, 0.15)', tagColor: '#6D2E0B' },
    nodePaperEscribir:   { bg: 'rgba(255, 248, 236, 0.95)', chipColor: '#B25E29', titleColor: '#6D2E0B', tagBg: 'rgba(178, 94, 41, 0.15)', tagColor: '#6D2E0B' },
    nodePaperReferencia: { bg: 'rgba(254, 250, 242, 0.95)', chipColor: '#4E342E', titleColor: '#3E2723', tagBg: 'rgba(78, 52, 46, 0.12)',   tagColor: '#4E342E' },
    nodeCarpetaNube:     { bg: 'rgba(244, 249, 242, 0.95)', chipColor: '#4A7C59', titleColor: '#2D5037', tagBg: 'rgba(74, 124, 89, 0.18)', tagColor: '#2D5037' },
    nodeDiagrama:        { bg: 'rgba(255, 248, 236, 0.95)', chipColor: '#B25E29', titleColor: '#6D2E0B', tagBg: 'rgba(178, 94, 41, 0.15)', tagColor: '#6D2E0B' },
    nodeTabla:           { bg: 'rgba(244, 249, 242, 0.95)', chipColor: '#4A7C59', titleColor: '#2D5037', tagBg: 'rgba(74, 124, 89, 0.18)', tagColor: '#2D5037' },
    nodeArchivo:         { bg: 'rgba(254, 250, 242, 0.95)', chipColor: '#5D4037', titleColor: '#3E2723', tagBg: 'rgba(93, 64, 55, 0.12)',   tagColor: '#3E2723' },
    nodeReunion:         { bg: 'rgba(255, 248, 236, 0.95)', chipColor: '#B25E29', titleColor: '#6D2E0B', tagBg: 'rgba(178, 94, 41, 0.15)', tagColor: '#6D2E0B' },
    nodeConferencia:     { bg: 'rgba(254, 250, 242, 0.95)', chipColor: '#4E342E', titleColor: '#3E2723', tagBg: 'rgba(78, 52, 46, 0.12)',   tagColor: '#4E342E' },
    nodeRevista:         { bg: 'rgba(254, 250, 242, 0.95)', chipColor: '#4E342E', titleColor: '#3E2723', tagBg: 'rgba(78, 52, 46, 0.12)',   tagColor: '#4E342E' },
    default:             { bg: 'rgba(254, 250, 242, 0.95)', chipColor: '#4E342E', titleColor: '#3E2723', tagBg: 'rgba(78, 52, 46, 0.12)',   tagColor: '#4E342E' },
  },

  // 4. Fresh Sage (Menta Nórdica)
  'fresh-sage': {
    nodeInvestigador:    { bg: 'rgba(246, 250, 248, 0.95)', chipColor: '#1B4332', titleColor: '#1B4332', tagBg: 'rgba(27, 67, 50, 0.12)',   tagColor: '#1B4332' },
    nodeTesistaPosgrado: { bg: 'rgba(255, 250, 242, 0.95)', chipColor: '#D97706', titleColor: '#92400E', tagBg: 'rgba(217, 119, 6, 0.15)', tagColor: '#92400E' },
    nodeTesistaDeGrado:  { bg: 'rgba(240, 253, 244, 0.95)', chipColor: '#2D6A4F', titleColor: '#1B4332', tagBg: 'rgba(45, 106, 79, 0.15)', tagColor: '#1B4332' },
    nodeProyecto:        { bg: 'rgba(255, 250, 242, 0.95)', chipColor: '#D97706', titleColor: '#92400E', tagBg: 'rgba(217, 119, 6, 0.15)', tagColor: '#92400E' },
    nodePaper:           { bg: 'rgba(246, 250, 248, 0.95)', chipColor: '#1B4332', titleColor: '#1B4332', tagBg: 'rgba(27, 67, 50, 0.12)',   tagColor: '#1B4332' },
    nodeTesisDoctoral:   { bg: 'rgba(255, 250, 242, 0.95)', chipColor: '#D97706', titleColor: '#92400E', tagBg: 'rgba(217, 119, 6, 0.15)', tagColor: '#92400E' },
    nodeTesisMaestria:   { bg: 'rgba(240, 253, 244, 0.95)', chipColor: '#2D6A4F', titleColor: '#1B4332', tagBg: 'rgba(45, 106, 79, 0.15)', tagColor: '#1B4332' },
    nodeTopicCSO:        { bg: 'rgba(240, 253, 244, 0.95)', chipColor: '#2D6A4F', titleColor: '#1B4332', tagBg: 'rgba(45, 106, 79, 0.15)', tagColor: '#1B4332' },
    nodeMindmap:         { bg: 'rgba(246, 250, 248, 0.95)', chipColor: '#2D6A4F', titleColor: '#1B4332', tagBg: 'rgba(45, 106, 79, 0.15)', tagColor: '#1B4332' },
    nodeRol:             { bg: 'rgba(255, 250, 242, 0.95)', chipColor: '#D97706', titleColor: '#92400E', tagBg: 'rgba(217, 119, 6, 0.15)', tagColor: '#92400E' },
    nodePaperEscribir:   { bg: 'rgba(255, 250, 242, 0.95)', chipColor: '#D97706', titleColor: '#92400E', tagBg: 'rgba(217, 119, 6, 0.15)', tagColor: '#92400E' },
    nodePaperReferencia: { bg: 'rgba(246, 250, 248, 0.95)', chipColor: '#1B4332', titleColor: '#1B4332', tagBg: 'rgba(27, 67, 50, 0.12)',   tagColor: '#1B4332' },
    nodeCarpetaNube:     { bg: 'rgba(240, 253, 244, 0.95)', chipColor: '#2D6A4F', titleColor: '#1B4332', tagBg: 'rgba(45, 106, 79, 0.15)', tagColor: '#1B4332' },
    nodeDiagrama:        { bg: 'rgba(255, 250, 242, 0.95)', chipColor: '#D97706', titleColor: '#92400E', tagBg: 'rgba(217, 119, 6, 0.15)', tagColor: '#92400E' },
    nodeTabla:           { bg: 'rgba(240, 253, 244, 0.95)', chipColor: '#2D6A4F', titleColor: '#1B4332', tagBg: 'rgba(45, 106, 79, 0.15)', tagColor: '#1B4332' },
    nodeArchivo:         { bg: 'rgba(246, 250, 248, 0.95)', chipColor: '#52796F', titleColor: '#1B4332', tagBg: 'rgba(82, 121, 111, 0.12)', tagColor: '#1B4332' },
    nodeReunion:         { bg: 'rgba(255, 250, 242, 0.95)', chipColor: '#D97706', titleColor: '#92400E', tagBg: 'rgba(217, 119, 6, 0.15)', tagColor: '#92400E' },
    nodeConferencia:     { bg: 'rgba(246, 250, 248, 0.95)', chipColor: '#1B4332', titleColor: '#1B4332', tagBg: 'rgba(27, 67, 50, 0.12)',   tagColor: '#1B4332' },
    nodeRevista:         { bg: 'rgba(246, 250, 248, 0.95)', chipColor: '#1B4332', titleColor: '#1B4332', tagBg: 'rgba(27, 67, 50, 0.12)',   tagColor: '#1B4332' },
    default:             { bg: 'rgba(246, 250, 248, 0.95)', chipColor: '#1B4332', titleColor: '#1B4332', tagBg: 'rgba(27, 67, 50, 0.12)',   tagColor: '#1B4332' },
  },

  // 5. Monochrome (Alto Contraste)
  'monochrome': {
    nodeInvestigador:    { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#111827', titleColor: '#111827', tagBg: 'rgba(0, 0, 0, 0.08)',     tagColor: '#111827' },
    nodeTesistaPosgrado: { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#2563EB', titleColor: '#1E40AF', tagBg: 'rgba(37, 99, 235, 0.12)', tagColor: '#1E40AF' },
    nodeTesistaDeGrado:  { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#0D9488', titleColor: '#115E59', tagBg: 'rgba(13, 148, 136, 0.12)',tagColor: '#115E59' },
    nodeProyecto:        { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#2563EB', titleColor: '#1E40AF', tagBg: 'rgba(37, 99, 235, 0.12)', tagColor: '#1E40AF' },
    nodePaper:           { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#111827', titleColor: '#111827', tagBg: 'rgba(0, 0, 0, 0.08)',     tagColor: '#111827' },
    nodeTesisDoctoral:   { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#2563EB', titleColor: '#1E40AF', tagBg: 'rgba(37, 99, 235, 0.12)', tagColor: '#1E40AF' },
    nodeTesisMaestria:   { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#0D9488', titleColor: '#115E59', tagBg: 'rgba(13, 148, 136, 0.12)',tagColor: '#115E59' },
    nodeTopicCSO:        { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#0D9488', titleColor: '#115E59', tagBg: 'rgba(13, 148, 136, 0.12)',tagColor: '#115E59' },
    nodeMindmap:         { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#4B5563', titleColor: '#111827', tagBg: 'rgba(75, 85, 99, 0.10)',   tagColor: '#111827' },
    nodeRol:             { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#2563EB', titleColor: '#1E40AF', tagBg: 'rgba(37, 99, 235, 0.12)', tagColor: '#1E40AF' },
    nodePaperEscribir:   { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#2563EB', titleColor: '#1E40AF', tagBg: 'rgba(37, 99, 235, 0.12)', tagColor: '#1E40AF' },
    nodePaperReferencia: { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#111827', titleColor: '#111827', tagBg: 'rgba(0, 0, 0, 0.08)',     tagColor: '#111827' },
    nodeCarpetaNube:     { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#0D9488', titleColor: '#115E59', tagBg: 'rgba(13, 148, 136, 0.12)',tagColor: '#115E59' },
    nodeDiagrama:        { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#2563EB', titleColor: '#1E40AF', tagBg: 'rgba(37, 99, 235, 0.12)', tagColor: '#1E40AF' },
    nodeTabla:           { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#0D9488', titleColor: '#115E59', tagBg: 'rgba(13, 148, 136, 0.12)',tagColor: '#115E59' },
    nodeArchivo:         { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#4B5563', titleColor: '#111827', tagBg: 'rgba(75, 85, 99, 0.10)',   tagColor: '#111827' },
    nodeReunion:         { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#2563EB', titleColor: '#1E40AF', tagBg: 'rgba(37, 99, 235, 0.12)', tagColor: '#1E40AF' },
    nodeConferencia:     { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#111827', titleColor: '#111827', tagBg: 'rgba(0, 0, 0, 0.08)',     tagColor: '#111827' },
    nodeRevista:         { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#111827', titleColor: '#111827', tagBg: 'rgba(0, 0, 0, 0.08)',     tagColor: '#111827' },
    default:             { bg: 'rgba(255, 255, 255, 0.98)', chipColor: '#111827', titleColor: '#111827', tagBg: 'rgba(0, 0, 0, 0.08)',     tagColor: '#111827' },
  }
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
  const [catalogResearchers, setCatalogResearchers] = useState<{ uri: string; label: string }[]>([]);

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Monitor auth state changes & fetch custom claims
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const tokenResult = await currentUser.getIdTokenResult(true);
          const isAdminClaim = Boolean(tokenResult?.claims?.admin || tokenResult?.claims?.superadmin);
          setIsSuperAdmin(isAdminClaim);
        } catch (e) {
          setIsSuperAdmin(false);
        }
      } else {
        setIsSuperAdmin(false);
      }
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

  // Focus Mode / On-Demand Collapsed Edges state (Alternative 4)
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('canvas_focus_mode') === 'true';
    }
    return false;
  });
  const [hoveredNodeUri, setHoveredNodeUri] = useState<string | null>(null);
  const [pinnedNodeUris, setPinnedNodeUris] = useState<string[]>([]);

  // Canvas Theme State (Alternativa 1: Presets Curados)
  const [canvasTheme, setCanvasTheme] = useState<CanvasThemeId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('canvas_theme') as CanvasThemeId;
      if (saved && ['classic', 'dark-slate', 'warm-sepia', 'fresh-sage', 'monochrome'].includes(saved)) {
        return saved;
      }
    }
    return 'classic';
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  // Global Inference Toggle state (default false / off)
  const [useInference, setUseInference] = useState<boolean>(false);
  // Active GraphDB Inference Engine (ruleset) state: 'rdfsplus-optimized' vs 'owl-max-optimized' (OWL-DL)
  const [inferenceRuleset, setInferenceRuleset] = useState<'rdfsplus-optimized' | 'owl-max-optimized'>('rdfsplus-optimized');
  const [isSwitchingRuleset, setIsSwitchingRuleset] = useState<boolean>(false);
  const [rulesetStatusMsg, setRulesetStatusMsg] = useState<string | null>(null);

  // Inspector property editing states
  const [nodeDetails, setNodeDetails] = useState<{ [predURI: string]: string }>({});
  const [availableProperties, setAvailableProperties] = useState<string[]>([]);
  const [openSections, setOpenSections] = useState({ basic: true, ontology: true, meta: false });
  const [validationErrors, setValidationErrors] = useState<{ [predURI: string]: string }>({});
  const [newPropURI, setNewPropURI] = useState('');
  const [newPropVal, setNewPropVal] = useState('');
  const [isAddingCustomProp, setIsAddingCustomProp] = useState(false);

  // Node photos — stored as external URLs keyed by node URI
  const [nodePhotos, setNodePhotos] = useState<{ [uri: string]: string }>({});
  // Node custom icons — Phosphor icon name keyed by node URI (null = use automatic avatar)
  const [nodeIcons, setNodeIcons] = useState<{ [uri: string]: string | null }>({});
  // Node custom icon background colors
  const [nodeIconBgs, setNodeIconBgs] = useState<{ [uri: string]: string | null }>({});
  // Tab state for the avatar editor in the inspector
  const [avatarTab, setAvatarTab] = useState<'photo' | 'icon'>('photo');
  // Photo source sub-tab for people nodes: 'url' | 'google' | 'lifia'
  const [photoSourceMode, setPhotoSourceMode] = useState<'url' | 'google' | 'lifia'>('url');
  // Memorias@LIFIA members directory state
  const [lifiaMembers, setLifiaMembers] = useState<{ slug: string; name: string; photoUrl: string; profileUrl: string }[]>([]);
  const [lifiaSearchQuery, setLifiaSearchQuery] = useState('');
  const [isLoadingLifiaMembers, setIsLoadingLifiaMembers] = useState(false);
  const [lifiaError, setLifiaError] = useState<string | null>(null);

  const fetchLifiaMembers = useCallback(async () => {
    if (lifiaMembers.length > 0 || isLoadingLifiaMembers) return;
    setIsLoadingLifiaMembers(true);
    setLifiaError(null);
    try {
      const res = await fetchWithAuth('/api/lifia-members');
      if (!res.ok) throw new Error('No se pudo conectar con Memorias@LIFIA');
      const data = await res.json();
      if (data.members && Array.isArray(data.members)) {
        setLifiaMembers(data.members);
      }
    } catch (err: any) {
      setLifiaError(err.message || 'Error al consultar memorias.lifia.info.unlp.edu.ar/members');
    } finally {
      setIsLoadingLifiaMembers(false);
    }
  }, [fetchWithAuth, lifiaMembers.length, isLoadingLifiaMembers]);

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
  const [newNodeData, setNewNodeData] = useState({
    label: '',
    type: 'http://purl.org/ontology/bibo/Conference',
    uriSuffix: '',
    externalUrl: '',
    photoUrl: '',
    rank: 'CORE A*',
    deadlineMonth: 'Marzo',
    subject: ''
  });

  // Quick-connect flow: "+" button on node edge
  const [quickConnectSourceUri, setQuickConnectSourceUri] = useState<string | null>(null);
  const [pendingConnectionTarget, setPendingConnectionTarget] = useState<string | null>(null);
  const [showRelationModal, setShowRelationModal] = useState(false);
  const [selectedRelationPredicate, setSelectedRelationPredicate] = useState('http://vivoweb.org/ontology/core#relatedBy');

  // Search and dropdown state for "Elegir Relación" modal
  const [relationTargetSearch, setRelationTargetSearch] = useState('');
  const [isRelationTargetOpen, setIsRelationTargetOpen] = useState(false);
  const [relationPredicateSearch, setRelationPredicateSearch] = useState('');
  const [isRelationPredicateOpen, setIsRelationPredicateOpen] = useState(false);

  const openRelationModal = (sourceUri: string, targetUri: string, predicate: string = 'http://vivoweb.org/ontology/core#relatedBy') => {
    setQuickConnectSourceUri(sourceUri);
    setPendingConnectionTarget(targetUri);
    setSelectedRelationPredicate(predicate);
    setRelationTargetSearch('');
    setIsRelationTargetOpen(false);
    setRelationPredicateSearch('');
    setIsRelationPredicateOpen(false);
    setShowRelationModal(true);
  };

  const closeRelationModal = () => {
    setShowRelationModal(false);
    setQuickConnectSourceUri(null);
    setPendingConnectionTarget(null);
    setRelationTargetSearch('');
    setIsRelationTargetOpen(false);
    setRelationPredicateSearch('');
    setIsRelationPredicateOpen(false);
  };

  const getPredicateDetails = (predicateUri: string) => {
    for (const cat of RELATION_CATEGORIES) {
      const found = cat.options.find(opt => opt.value === predicateUri);
      if (found) return found;
    }
    return { value: predicateUri, label: getCleanLabel(predicateUri), desc: predicateUri };
  };

  // Close searchable dropdowns in "Elegir Relación" modal & Theme menu on outside click
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.searchable-target-node-container')) {
        setIsRelationTargetOpen(false);
      }
      if (!target.closest('.searchable-relation-predicate-container')) {
        setIsRelationPredicateOpen(false);
      }
      if (!target.closest('.theme-menu-container')) {
        setIsThemeMenuOpen(false);
      }
    };
    if (isRelationTargetOpen || isRelationPredicateOpen || isThemeMenuOpen) {
      document.addEventListener('mousedown', handleGlobalClick);
      return () => document.removeEventListener('mousedown', handleGlobalClick);
    }
  }, [isRelationTargetOpen, isRelationPredicateOpen, isThemeMenuOpen]);

  // Connection predicate editing & deletion
  const [editingPredicate, setEditingPredicate] = useState<string>('');
  const [isSavingPredicate, setIsSavingPredicate] = useState(false);
  const [isDeletingConnection, setIsDeletingConnection] = useState(false);
  const [isInvertingConnection, setIsInvertingConnection] = useState(false);

  // SPARQL console & resizable sidebar
  const [sparqlQuery, setSparqlQuery] = useState(`PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX vivo: <http://vivoweb.org/ontology/core#>
PREFIX dblp: <https://dblp.org/rdf/schema#>

SELECT ?s ?p ?o WHERE {
  ?s ?p ?o .
} LIMIT 10`);
  const [sparqlResult, setSparqlResult] = useState<string>('');
  const [sparqlRawData, setSparqlRawData] = useState<any>(null);
  const [sparqlResultFormat, setSparqlResultFormat] = useState<'table' | 'json' | 'csv' | 'tsv'>('table');
  const [sparqlLoading, setSparqlLoading] = useState(false);
  const [sparqlError, setSparqlError] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState(false);
  const [activeRightPanel, setActiveRightPanel] = useState<'none' | 'sparql' | 'pomodoro'>('none');

  // Resizable SPARQL Sidebar state (#sidebarSemantic)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar_semantic_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 320) {
          return Math.min(parsed, window.innerWidth - 40);
        }
      }
    }
    return 520;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const minWidth = 320;
      const maxWidth = Math.max(minWidth, window.innerWidth - 40);
      const calculatedWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsResizingSidebar(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setSidebarWidth(currentWidth => {
          localStorage.setItem('sidebar_semantic_width', currentWidth.toString());
          return currentWidth;
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    setIsResizingSidebar(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  // Mindmap Modal state
  const [showMindmapModal, setShowMindmapModal] = useState(false);
  const [mindmapMarkdown, setMindmapMarkdown] = useState<string>(`# Título`);
  const [activeMindmapNode, setActiveMindmapNode] = useState<RDFNode | null>(null);

  // Meeting Bitácora (Notes & Attendance) Modal state on Canvas
  const [activeMeetingLogNode, setActiveMeetingLogNode] = useState<RDFNode | null>(null);
  const [meetingLogParticipants, setMeetingLogParticipants] = useState<string[]>([]);
  const [meetingLogSessions, setMeetingLogSessions] = useState<{ uri: string; date: string; notes: string; attendees: string[] }[]>([]);
  const [isLoadingMeetingLog, setIsLoadingMeetingLog] = useState(false);
  const [newMeetingSessionForm, setNewMeetingSessionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    notes: '',
    attendees: [] as string[]
  });

  // Catalog / Shared Node Bank state
  const [nodeModeTab, setNodeModeTab] = useState<'catalog' | 'new'>('catalog');
  const [globalCatalogNodes, setGlobalCatalogNodes] = useState<{ uri: string; label: string; type: string; rank?: string; deadlineMonth?: string; subject?: string; externalUrl?: string; photoUrl?: string }[]>([]);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [editingCatalogNode, setEditingCatalogNode] = useState<{ uri: string; label: string; type: string; rank?: string; deadlineMonth?: string; subject?: string; externalUrl?: string } | null>(null);

  // View switcher state: 'canvas' vs 'meetings' vs 'admin-catalog'
  const [currentView, setCurrentView] = useState<'canvas' | 'meetings' | 'admin-catalog'>('canvas');

  // SuperAdmin User Management Modal state
  const [showAdminModal, setShowAdminModal] = useState(false);

  // CSO Topics Autocomplete State
  const [csoTopicsList, setCsoTopicsList] = useState<{ uri: string; label: string }[]>([]);
  const [csoSearchQuery, setCsoSearchQuery] = useState('');
  const [isFetchingCSO, setIsFetchingCSO] = useState(false);

  // Static curated fallback topics list from CSO ontology for instant responsiveness
  const STATIC_CSO_TOPICS = [
    { uri: 'https://cso.kmi.open.ac.uk/topics/semantic_web', label: 'Semantic Web' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/artificial_intelligence', label: 'Artificial Intelligence' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/machine_learning', label: 'Machine Learning' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/data_mining', label: 'Data Mining' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/knowledge_graph', label: 'Knowledge Graph' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/ontologies', label: 'Ontologies' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/natural_language_processing', label: 'Natural Language Processing' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/computer_vision', label: 'Computer Vision' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/software_engineering', label: 'Software Engineering' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/information_retrieval', label: 'Information Retrieval' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/deep_learning', label: 'Deep Learning' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/robotics', label: 'Robotics' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/human_computer_interaction', label: 'Human Computer Interaction' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/computer_networks', label: 'Computer Networks' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/cloud_computing', label: 'Cloud Computing' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/cyber_security', label: 'Cyber Security' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/big_data', label: 'Big Data' },
    { uri: 'https://cso.kmi.open.ac.uk/topics/bioinformatics', label: 'Bioinformatics' },
  ];

  // Fetch CSO Topics from GraphDB with static fallback
  const fetchCSOTopics = async (search: string) => {
    const term = (search || '').trim().toLowerCase();
    
    // Instant local filtering first so suggestions appear immediately
    const filteredStatic = STATIC_CSO_TOPICS.filter(t => !term || t.label.toLowerCase().includes(term));
    setCsoTopicsList(filteredStatic);

    if (term.length < 1) return;
    setIsFetchingCSO(true);

    const query = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT DISTINCT ?topic ?label WHERE {
        ?topic rdfs:label ?l .
        FILTER(CONTAINS(LOWER(STR(?l)), ${lit(term)}))
        BIND(STR(?l) AS ?label)
      } LIMIT 25
    `;

    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, infer: true })
      });
      const data = await response.json();
      if (data.results && data.results.bindings && data.results.bindings.length > 0) {
        const topics = data.results.bindings.map((b: any) => ({
          uri: b.topic.value,
          label: b.label.value
        }));
        // Combine static fallback with GraphDB query results without duplicates
        const existingUris = new Set(topics.map((t: any) => t.uri));
        const merged = [...topics, ...filteredStatic.filter(t => !existingUris.has(t.uri))];
        setCsoTopicsList(merged);
      }
    } catch (e) {
      console.error('Error al consultar tópicos CSO', e);
    } finally {
      setIsLoadingCatalog(false);
      setIsFetchingCSO(false);
    }
  };



  const canvasRef = useRef<HTMLDivElement>(null);

  // Fetch Global Catalog of Shareable Nodes (Conferences, Journals, Topics, Datasets, etc.)
  const fetchGlobalCatalog = async (targetType: string) => {
    setIsLoadingCatalog(true);
    let finalType = targetType;
    if (targetType === 'http://purl.org/ontology/bibo/Thesis#PhD' || targetType === 'http://purl.org/ontology/bibo/Thesis#Master') {
      finalType = 'http://purl.org/ontology/bibo/Thesis';
    }

    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX bibo: <http://purl.org/ontology/bibo/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX schema: <http://schema.org/>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>

      SELECT DISTINCT ?node ?label ?rank ?deadlineMonth ?subject ?externalUrl ?photoUrl WHERE {
        ?node rdf:type <${finalType}> .
        ?node rdfs:label ?label .
        OPTIONAL { ?node bibo:rank ?rank }
        OPTIONAL { ?node <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/submissionDeadlineMonth> ?deadlineMonth }
        OPTIONAL { ?node dcterms:subject ?subject }
        OPTIONAL { ?node schema:url ?url1 }
        OPTIONAL { ?node foaf:page ?url2 }
        OPTIONAL { ?node schema:image ?img1 }
        OPTIONAL { ?node foaf:depiction ?img2 }
        BIND(COALESCE(?url1, ?url2) AS ?externalUrl)
        BIND(COALESCE(?img1, ?img2) AS ?photoUrl)
        FILTER(STRSTARTS(STR(?node), "http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/") || STRSTARTS(STR(?node), "http://example.org/"))
      } LIMIT 1000
    `;

    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, infer: true })
      });
      const data = await response.json();
      if (data.results && data.results.bindings) {
        const catalogMap: { [uri: string]: { uri: string; label: string; type: string; rank?: string; deadlineMonth?: string; subject?: string; externalUrl?: string; photoUrl?: string } } = {};
        
        data.results.bindings.forEach((b: any) => {
          const uri = b.node.value;
          const label = b.label.value;
          const type = targetType;
          const rank = b.rank ? b.rank.value : undefined;
          const deadlineMonth = b.deadlineMonth ? b.deadlineMonth.value : undefined;
          const subject = b.subject ? b.subject.value : undefined;
          const externalUrl = b.externalUrl ? b.externalUrl.value : undefined;
          const photoUrl = b.photoUrl ? b.photoUrl.value : undefined;

          if (!catalogMap[uri]) {
            catalogMap[uri] = { uri, label, type, rank, deadlineMonth, subject, externalUrl, photoUrl };
          } else {
            // Prioritize specific values if present in multiple bindings
            if (rank) catalogMap[uri].rank = rank;
            if (deadlineMonth) catalogMap[uri].deadlineMonth = deadlineMonth;
            if (subject) {
              const currentSubjects = catalogMap[uri].subject ? catalogMap[uri].subject!.split(',').map(s => s.trim()) : [];
              if (!currentSubjects.includes(subject)) {
                catalogMap[uri].subject = [...currentSubjects, subject].join(', ');
              }
            }
            if (externalUrl) catalogMap[uri].externalUrl = externalUrl;
            if (photoUrl) catalogMap[uri].photoUrl = photoUrl;
          }
        });

        setGlobalCatalogNodes(Object.values(catalogMap).sort((a, b) => a.label.localeCompare(b.label, 'es')));
      }
    } catch (e) {
      console.error('Error al cargar catálogo global', e);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  // Load data from GraphDB
  const fetchGraphData = async () => {
    if (!user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX ex: <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      PREFIX schema: <http://schema.org/>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>

      SELECT DISTINCT ?node ?label ?type ?x ?y ?status ?thesisType ?mindmapContent ?externalUrl ?photoUrl WHERE {
        ?node rdf:type ?type .
        { ?node rfu:createdBy <${userUri}> } UNION { ?node rfu:inCanvasOf <${userUri}> }
        ?node rdfs:label ?label .
        OPTIONAL { ?node ex:posX ?x }
        OPTIONAL { ?node ex:posY ?y }
        OPTIONAL { ?node ex:status ?status }
        OPTIONAL { ?node ex:thesisType ?thesisType }
        OPTIONAL { ?node rfu:hasMindmap ?mindmapContent }
        OPTIONAL { 
          ?node schema:url ?url1 .
        }
        OPTIONAL {
          ?node foaf:page ?url2 .
        }
        OPTIONAL {
          ?node schema:image ?img1 .
        }
        OPTIONAL {
          ?node foaf:depiction ?img2 .
        }
        BIND(COALESCE(?url1, ?url2) AS ?externalUrl)
        BIND(COALESCE(?img1, ?img2) AS ?photoUrl)
        FILTER(STRSTARTS(STR(?node), "http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/") || STRSTARTS(STR(?node), "http://example.org/"))
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
        const loadedPhotos: { [uri: string]: string } = {};
        
        data.results.bindings.forEach((b: any) => {
          const uri = b.node.value;
          const type = b.type.value;
          if (b.photoUrl && b.photoUrl.value) {
            loadedPhotos[uri] = b.photoUrl.value;
          }
          
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
            if (b.externalUrl) nodeMap[uri].externalUrl = b.externalUrl.value;
            if (b.photoUrl) nodeMap[uri].photoUrl = b.photoUrl.value;
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
            photoUrl: b.photoUrl ? b.photoUrl.value : undefined,
            mindmapContent: b.mindmapContent ? b.mindmapContent.value : undefined,
            externalUrl: b.externalUrl ? b.externalUrl.value : undefined
          };
        });

        const loadedNodes = Object.values(nodeMap);
        setNodes(loadedNodes);
        setNodePhotos(prev => ({ ...prev, ...loadedPhotos }));
        
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

  const fetchActiveRuleset = async () => {
    try {
      const response = await fetchWithAuth('/api/graphdb/ruleset');
      if (!response.ok) return;
      const data = await response.json();
      if (data.ruleset === 'owl-max-optimized' || data.ruleset === 'rdfsplus-optimized') {
        setInferenceRuleset(data.ruleset);
      }
    } catch (e) {
      console.error("Error al consultar motor de inferencia activo en GraphDB:", e);
    }
  };

  const changeInferenceRuleset = async (newRuleset: 'rdfsplus-optimized' | 'owl-max-optimized') => {
    if (isSwitchingRuleset || newRuleset === inferenceRuleset) return;
    setIsSwitchingRuleset(true);
    setRulesetStatusMsg(null);
    try {
      const response = await fetchWithAuth('/api/graphdb/ruleset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleset: newRuleset })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al cambiar el motor de inferencia');
      }
      setInferenceRuleset(newRuleset);
      setRulesetStatusMsg(data.message || `Motor cambiado a ${newRuleset}`);
      if (useInference && user) {
        await fetchGraphData();
      }
    } catch (e: any) {
      setRulesetStatusMsg(`❌ ${e.message || 'No se pudo cambiar el motor de inferencia'}`);
    } finally {
      setIsSwitchingRuleset(false);
    }
  };

  const openMeetingLogModal = async (meetingNode: RDFNode) => {
    setActiveMeetingLogNode(meetingNode);
    setIsLoadingMeetingLog(true);
    try {
      const query = `
        PREFIX vivo: <http://vivoweb.org/ontology/core#>
        PREFIX rfu: <http://cientopolis.org/rfu/>

        SELECT ?participant ?session ?sDate ?sNotes ?sAttendee WHERE {
          BIND(<${meetingNode.uri}> AS ?meeting)
          OPTIONAL {
            { ?meeting rfu:hasParticipant ?participant }
            UNION
            { ?meeting vivo:hasMember ?participant }
            UNION
            { ?participant vivo:relatedBy ?meeting }
            UNION
            { ?meeting vivo:relatedBy ?participant }
          }
          OPTIONAL {
            ?meeting rfu:hasSession ?session .
            OPTIONAL { ?session rfu:sessionDate ?sDate }
            OPTIONAL { ?session rfu:sessionNotes ?sNotes }
            OPTIONAL { ?session rfu:attendedBy ?sAttendee }
          }
        }
      `;
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, infer: false })
      });
      const data = await res.json();
      const participantsSet = new Set<string>();
      // Also include any person connected to this meeting on the canvas
      connections.forEach(c => {
        if (c.from === meetingNode.uri) participantsSet.add(c.to);
        if (c.to === meetingNode.uri) participantsSet.add(c.from);
      });

      const sessionMap: Record<string, { uri: string; date: string; notes: string; attendees: string[] }> = {};
      if (data.results && data.results.bindings) {
        data.results.bindings.forEach((b: any) => {
          if (b.participant?.value) {
            participantsSet.add(b.participant.value);
          }
          if (b.session?.value) {
            const sUri = b.session.value;
            if (!sessionMap[sUri]) {
              sessionMap[sUri] = {
                uri: sUri,
                date: b.sDate?.value || '',
                notes: b.sNotes?.value || '',
                attendees: []
              };
            }
            if (b.sAttendee?.value && !sessionMap[sUri].attendees.includes(b.sAttendee.value)) {
              sessionMap[sUri].attendees.push(b.sAttendee.value);
            }
          }
        });
      }

      const participantsArr = Array.from(participantsSet);
      const sessionsArr = Object.values(sessionMap).sort((a, b) => b.date.localeCompare(a.date));
      setMeetingLogParticipants(participantsArr);
      setMeetingLogSessions(sessionsArr);
      setNewMeetingSessionForm({
        date: new Date().toISOString().split('T')[0],
        notes: '',
        attendees: [...participantsArr]
      });
    } catch (e) {
      console.error('Error al cargar notas y asistencia de la reunión:', e);
    } finally {
      setIsLoadingMeetingLog(false);
    }
  };

  const toggleMeetingLogAttendee = (uri: string) => {
    setNewMeetingSessionForm(prev => {
      const exists = prev.attendees.includes(uri);
      return {
        ...prev,
        attendees: exists ? prev.attendees.filter(u => u !== uri) : [...prev.attendees, uri]
      };
    });
  };

  const handleAddMeetingLogSession = async () => {
    if (!activeMeetingLogNode) return;
    if (!newMeetingSessionForm.date.trim() || !newMeetingSessionForm.notes.trim()) {
      alert('Por favor completa la fecha y el resumen/notas del encuentro.');
      return;
    }

    const sessionUri = `${activeMeetingLogNode.uri}_session_${Date.now()}`;

    let insertQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      INSERT DATA {
        <${activeMeetingLogNode.uri}> rfu:hasSession <${sessionUri}> .
        <${sessionUri}> rdf:type rfu:MeetingSession ;
                        rfu:sessionDate ${lit(newMeetingSessionForm.date)} ;
                        rfu:sessionNotes ${lit(newMeetingSessionForm.notes.trim())} .
    `;
    newMeetingSessionForm.attendees.forEach(aUri => {
      insertQuery += `<${sessionUri}> rfu:attendedBy <${aUri}> .\n`;
    });
    insertQuery += `}`;

    try {
      await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });
      await openMeetingLogModal(activeMeetingLogNode);
    } catch (e) {
      console.error('Error al guardar sesión en bitácora de reunión:', e);
    }
  };

  const fetchCatalogResearchers = async () => {
    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT DISTINCT ?node ?label WHERE {
        ?node rdf:type <http://vivoweb.org/ontology/core#FacultyMember> .
        ?node rdfs:label ?label .
      } LIMIT 1000
    `;
    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, infer: true })
      });
      const data = await response.json();
      if (data.results && data.results.bindings) {
        const map = new Map<string, { uri: string; label: string }>();
        data.results.bindings.forEach((b: any) => {
          map.set(b.node.value, { uri: b.node.value, label: b.label.value });
        });
        setCatalogResearchers(Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es')));
      }
    } catch (e) {
      console.error("Error al consultar investigadores del catálogo:", e);
    }
  };

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
    const alreadyInCanvas = nodes.some(n => n.uri === researcherUri);
    
    // First, delete any previous association
    const deleteQuery = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      DELETE WHERE {
        <${userUri}> rfu:associatedResearcher ?r .
      }
    `;
    const canvasTriples = alreadyInCanvas
      ? ''
      : `<${researcherUri}> rfu:inCanvasOf <${userUri}> ; <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/posX> "150" ; <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/posY> "150" .`;
    const insertQuery = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      INSERT DATA {
        <${userUri}> rfu:associatedResearcher <${researcherUri}> .
        ${canvasTriples}
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
      if (!alreadyInCanvas) {
        await fetchGraphData();
      }
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
    if (!isValidUriSuffix(cleanSuffix)) {
      alert("El sufijo de URI contiene caracteres no válidos. Usa solo letras, números, guiones o puntos.");
      return;
    }
    const nodeUri = `http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/${cleanSuffix}`;
    
    if (nodes.some(n => n.uri === nodeUri)) {
      alert("La URI del nodo ya existe. Por favor, elige otro sufijo.");
      return;
    }

    const photoTriple = user.photoURL
      ? `${iri(nodeUri)} <http://schema.org/image> ${lit(user.photoURL)} .`
      : '';

    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX ex: <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      INSERT DATA {
        ${iri(nodeUri)} rdf:type <http://vivoweb.org/ontology/core#FacultyMember> ;
                     rdfs:label ${lit(label.trim())} ;
                     rfu:createdBy <${userUri}> ;
                     ex:posX "150" ;
                     ex:posY "150" .
        ${photoTriple}
        <${userUri}> rfu:associatedResearcher ${iri(nodeUri)} .
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
      SELECT DISTINCT ?from ?predicate ?to WHERE {
        ?from ?predicate ?to .
        { ?from rfu:createdBy <${userUri}> } UNION { ?from rfu:inCanvasOf <${userUri}> }
        { ?to rfu:createdBy <${userUri}> } UNION { ?to rfu:inCanvasOf <${userUri}> }
        FILTER(isURI(?to) && (STRSTARTS(STR(?from), "http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/") || STRSTARTS(STR(?from), "http://example.org/")) && (STRSTARTS(STR(?to), "http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/") || STRSTARTS(STR(?to), "http://example.org/")))
        FILTER(?predicate != <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/posX> && ?predicate != <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/posY> && ?predicate != <http://example.org/resource/posX> && ?predicate != <http://example.org/resource/posY> && ?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> && ?predicate != <http://www.w3.org/2000/01/rdf-schema#label> && ?predicate != <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/status> && ?predicate != <http://example.org/resource/status>)
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
    if (typeURI.includes('DocumentDraft')) return DEFAULT_PROPERTIES_BY_TYPE['DocumentDraft'];
    if (typeURI.includes('AcademicArticle')) return DEFAULT_PROPERTIES_BY_TYPE['AcademicArticle'];
    if (typeURI.includes('Article')) return DEFAULT_PROPERTIES_BY_TYPE['Article'];
    if (typeURI.includes('Folder')) return DEFAULT_PROPERTIES_BY_TYPE['Folder'];
    if (typeURI.includes('ImageObject')) return DEFAULT_PROPERTIES_BY_TYPE['ImageObject'];
    if (typeURI.includes('Dataset')) return DEFAULT_PROPERTIES_BY_TYPE['Dataset'];
    if (typeURI.includes('MediaObject')) return DEFAULT_PROPERTIES_BY_TYPE['MediaObject'];
    if (typeURI.includes('Meeting')) return DEFAULT_PROPERTIES_BY_TYPE['Meeting'];
    if (typeURI.includes('Conference')) return DEFAULT_PROPERTIES_BY_TYPE['Conference'];
    if (typeURI.includes('Journal')) return DEFAULT_PROPERTIES_BY_TYPE['Journal'];
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
        FILTER(isLiteral(?value) || ?predicate IN (<http://schema.org/url>, <http://xmlns.com/foaf/0.1/page>, <http://schema.org/image>, <http://xmlns.com/foaf/0.1/depiction>))
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
        // Si hay schema:image o foaf:depiction, sincronizar con nodePhotos
        const photoVal = props['http://schema.org/image'] || props['http://xmlns.com/foaf/0.1/depiction'];
        if (photoVal) {
          props['http://schema.org/image'] = photoVal;
          setNodePhotos(prev => ({ ...prev, [nodeURI]: photoVal }));
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
        FILTER(?prop != <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/posX> && ?prop != <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/posY> && ?prop != <http://example.org/resource/posX> && ?prop != <http://example.org/resource/posY> && ?prop != <http://www.w3.org/2000/01/rdf-schema#label> && ?prop != <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/status> && ?prop != <http://example.org/resource/status>)
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

    let filterList = '';
    let insertTriples = '';
    try {
      filterList = predicatesToClear.map(p => iri(p)).join(', ');

      // Filter nodeDetails to only insert non-empty values
      insertTriples = Object.entries(nodeDetails)
        .filter(([_, val]) => val.trim() !== '')
        .map(([pred, val]) => `<${selectedNode.uri}> ${iri(pred)} ${lit(val)} .`)
        .join('\n        ');
    } catch (err: any) {
      alert(err?.message || 'Error en el formato de una propiedad.');
      return;
    }

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
        // Update local state label and photoUrl
        const newLabel = nodeDetails['http://www.w3.org/2000/01/rdf-schema#label'] || selectedNode.label;
        const newStatus = nodeDetails['http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/status'] || nodeDetails['http://example.org/resource/status'] || selectedNode.status;
        const newPhotoUrl = (nodeDetails['http://schema.org/image'] || '').trim() || undefined;
        setNodes(nodes.map(n => n.uri === selectedNode.uri ? { ...n, label: newLabel, status: newStatus, photoUrl: newPhotoUrl } : n));
        setNodePhotos(prev => {
          const next = { ...prev };
          if (newPhotoUrl) next[selectedNode.uri] = newPhotoUrl;
          else delete next[selectedNode.uri];
          return next;
        });
        
        setIsInspectorOpen(false);
        setSelectedNode(null);
        fetchGraphData();
      }
    } catch (e) {
      console.error("Error saving properties", e);
    }
  };

  const saveNodeMindmap = async (targetNode: RDFNode, markdownContent: string) => {
    const updateQuery = `
      PREFIX rfu: <http://cientopolis.org/rfu/>
      DELETE {
        <${targetNode.uri}> rfu:hasMindmap ?m .
      }
      INSERT {
        <${targetNode.uri}> rfu:hasMindmap ${lit(markdownContent)} .
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
      PREFIX ex: <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/>
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

  // Helper functions for SPARQL query result formatting
  const shortenUri = (uri: string): string => {
    if (!uri || typeof uri !== 'string') return '';
    const prefixes: [string, string][] = [
      ['http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf:'],
      ['http://www.w3.org/2000/01/rdf-schema#', 'rdfs:'],
      ['http://www.w3.org/2002/07/owl#', 'owl:'],
      ['http://www.w3.org/2001/XMLSchema#', 'xsd:'],
      ['http://purl.org/dc/terms/', 'dcterms:'],
      ['http://vivoweb.org/ontology/core#', 'vivo:'],
      ['https://dblp.org/rdf/schema#', 'dblp:'],
      ['http://cientopolis.org/rfu/', 'rfu:'],
      ['http://www.semanticdesktop.org/ontologies/2008/05/20/tmo#', 'tmo:'],
      ['http://schema.org/', 'schema:'],
    ];
    for (const [full, prefix] of prefixes) {
      if (uri.startsWith(full)) {
        return prefix + uri.slice(full.length);
      }
    }
    return uri;
  };

  const convertSparqlToCSV = (data: any): string => {
    if (!data || !data.results || !data.results.bindings) {
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data || '');
    }
    const vars: string[] = data.head?.vars || Object.keys(data.results.bindings[0] || {});
    const header = vars.map(v => `"${v.replace(/"/g, '""')}"`).join(',');
    const rows = data.results.bindings.map((b: any) =>
      vars.map(v => {
        const val = b[v]?.value ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    return [header, ...rows].join('\n');
  };

  const convertSparqlToTSV = (data: any): string => {
    if (!data || !data.results || !data.results.bindings) {
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data || '');
    }
    const vars: string[] = data.head?.vars || Object.keys(data.results.bindings[0] || {});
    const header = vars.map(v => `?${v}`).join('\t');
    const rows = data.results.bindings.map((b: any) =>
      vars.map(v => {
        const cell = b[v];
        if (!cell) return '';
        if (cell.type === 'uri') return `<${cell.value}>`;
        if (cell.type === 'literal') {
          let lit = `"${cell.value.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n')}"`;
          if (cell['xml:lang']) lit += `@${cell['xml:lang']}`;
          else if (cell.datatype) lit += `^^<${cell.datatype}>`;
          return lit;
        }
        return cell.value ?? '';
      }).join('\t')
    );
    return [header, ...rows].join('\n');
  };

  const copySparqlResult = () => {
    let text = '';
    if (sparqlResultFormat === 'table') {
      text = convertSparqlToTSV(sparqlRawData);
    } else if (sparqlResultFormat === 'csv') {
      text = convertSparqlToCSV(sparqlRawData);
    } else if (sparqlResultFormat === 'tsv') {
      text = convertSparqlToTSV(sparqlRawData);
    } else {
      text = sparqlRawData ? JSON.stringify(sparqlRawData, null, 2) : sparqlResult;
    }
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedFormat(true);
      setTimeout(() => setCopiedFormat(false), 2000);
    }
  };

  const renderTableCell = (cell: any) => {
    if (!cell) {
      return <span style={{ color: '#94a3b8' }}>-</span>;
    }
    if (cell.type === 'uri') {
      const shortened = shortenUri(cell.value);
      return (
        <span 
          title={cell.value} 
          style={{ 
            color: '#000000', 
            fontFamily: 'monospace',
            fontWeight: shortened !== cell.value ? 600 : 400 
          }}
        >
          {shortened}
        </span>
      );
    }
    if (cell.type === 'literal') {
      return (
        <span style={{ color: '#000000' }}>
          {cell.value}
          {cell['xml:lang'] && (
            <span style={{ fontSize: '0.7rem', color: '#475569', marginLeft: '4px' }}>
              @{cell['xml:lang']}
            </span>
          )}
          {cell.datatype && (
            <span style={{ fontSize: '0.7rem', color: '#475569', marginLeft: '4px' }}>
              ^^{shortenUri(cell.datatype)}
            </span>
          )}
        </span>
      );
    }
    return <span style={{ color: '#000000' }}>{cell.value}</span>;
  };

  // Run custom SPARQL Query
  const runCustomSPARQL = async () => {
    setSparqlLoading(true);
    setSparqlError(null);
    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sparqlQuery })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.details || errData.error || `Error HTTP ${response.status}`;
        setSparqlError(msg);
        setSparqlRawData(null);
        setSparqlResult("Error: " + msg);
        return;
      }
      const data = await response.json();
      setSparqlRawData(data);
      setSparqlResult(JSON.stringify(data, null, 2));
      if (data?.results?.bindings) {
        setSparqlResultFormat('table');
      } else {
        setSparqlResultFormat('json');
      }
    } catch (e: any) {
      const msg = e.message || 'Error desconocido';
      setSparqlError(msg);
      setSparqlRawData(null);
      setSparqlResult("Error: " + msg);
    } finally {
      setSparqlLoading(false);
    }
  };

  // Canvas Pan & Zoom Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      e.target === canvasRef.current || 
      (e.target as HTMLElement).classList.contains('canvas-viewport') ||
      (e.target as HTMLElement).classList.contains('canvas-connections')
    ) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedNode(null);
      setSelectedConnection(null);
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
          PREFIX ex: <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/>
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

  // Add an existing global catalog node to current user's canvas
  const addExistingNodeToCanvas = async (nodeUri: string) => {
    if (!user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    
    // Position at canvas center or offset if quick-connecting
    let x = Math.round((-pan.x + window.innerWidth / 2) / zoom);
    let y = Math.round((-pan.y + window.innerHeight / 2) / zoom);
    if (quickConnectSourceUri) {
      const srcNode = nodes.find(n => n.uri === quickConnectSourceUri);
      x = srcNode ? srcNode.x + 210 : x;
      y = srcNode ? srcNode.y : y;
    }

    const insertQuery = `
      PREFIX ex: <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/>
      PREFIX rfu: <http://cientopolis.org/rfu/>
      
      INSERT DATA {
        <${nodeUri}> rfu:inCanvasOf <${userUri}> ;
                     ex:posX ${x} ;
                     ex:posY ${y} .
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
        await fetchGraphData();
        if (quickConnectSourceUri) {
          openRelationModal(quickConnectSourceUri, nodeUri, 'http://vivoweb.org/ontology/core#publicationVenue');
        }
      }
    } catch (e) {
      console.error('Error al incorporar nodo existente al lienzo', e);
    }
  };

  // SuperAdmin update shared node properties in GraphDB
  const saveEditedCatalogNode = async () => {
    if (!editingCatalogNode || !isSuperAdmin) return;

    let updateTriples = '';
    try {
      updateTriples = `
        DELETE WHERE { <${editingCatalogNode.uri}> rdfs:label ?o . };
        DELETE WHERE { <${editingCatalogNode.uri}> <http://purl.org/ontology/bibo/rank> ?o . };
        DELETE WHERE { <${editingCatalogNode.uri}> <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/submissionDeadlineMonth> ?o . };
        DELETE WHERE { <${editingCatalogNode.uri}> <http://example.org/resource/submissionDeadlineMonth> ?o . };
        DELETE WHERE { <${editingCatalogNode.uri}> <http://purl.org/dc/terms/subject> ?o . };
        DELETE WHERE { <${editingCatalogNode.uri}> <http://schema.org/url> ?o . };
        
        INSERT DATA {
          <${editingCatalogNode.uri}> rdfs:label ${lit(editingCatalogNode.label)} .
      `;

      const isVenueType = editingCatalogNode.type === 'http://purl.org/ontology/bibo/Conference' || editingCatalogNode.type === 'http://purl.org/ontology/bibo/Journal';

      if (isVenueType) {
        if (editingCatalogNode.rank && editingCatalogNode.rank.trim()) {
          updateTriples += `\n<${editingCatalogNode.uri}> <http://purl.org/ontology/bibo/rank> ${lit(editingCatalogNode.rank.trim())} .`;
        }
        if (editingCatalogNode.deadlineMonth && editingCatalogNode.deadlineMonth.trim()) {
          updateTriples += `\n<${editingCatalogNode.uri}> <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/submissionDeadlineMonth> ${lit(editingCatalogNode.deadlineMonth.trim())} .`;
        }
      }
      if (editingCatalogNode.subject && editingCatalogNode.subject.trim()) {
        updateTriples += `\n<${editingCatalogNode.uri}> <http://purl.org/dc/terms/subject> ${lit(editingCatalogNode.subject.trim())} .`;
      }
      if (editingCatalogNode.externalUrl && editingCatalogNode.externalUrl.trim()) {
        updateTriples += `\n<${editingCatalogNode.uri}> <http://schema.org/url> ${httpIri(editingCatalogNode.externalUrl)} .`;
      }

      updateTriples += `\n}`;
    } catch (err: any) {
      alert(err?.message || 'Error en los datos del nodo.');
      return;
    }

    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: updateTriples })
      });
      const data = await res.json();
      if (data.success) {
        setEditingCatalogNode(null);
        fetchGlobalCatalog(newNodeData.type);
        fetchGraphData();
      }
    } catch (e) {
      console.error('Error al actualizar nodo del catálogo', e);
    }
  };

  // Create Node
  const createNode = async () => {
    if (!newNodeData.label || !newNodeData.uriSuffix) return;
    if (!user) return;
    const cleanSuffix = newNodeData.uriSuffix.trim();
    if (!isValidUriSuffix(cleanSuffix)) {
      alert("El sufijo de URI contiene caracteres no válidos. Usa solo letras, números, guiones o puntos.");
      return;
    }
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    
    const uri = `http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/${cleanSuffix}`;

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
    let insertQuery = '';
    try {
      const nodeIri = iri(uri);
      if (newNodeData.type === 'http://purl.org/ontology/bibo/Thesis#PhD') {
        finalType = 'http://purl.org/ontology/bibo/Thesis';
        extraTriples = `${nodeIri} <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/thesisType> "PhD Thesis" .`;
      } else if (newNodeData.type === 'http://purl.org/ontology/bibo/Thesis#Master') {
        finalType = 'http://purl.org/ontology/bibo/Thesis';
        extraTriples = `${nodeIri} <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/thesisType> "Magister" .`;
      }

      if (newNodeData.externalUrl && newNodeData.externalUrl.trim()) {
        extraTriples += `\n${nodeIri} <http://schema.org/url> ${httpIri(newNodeData.externalUrl)} .`;
      }

      if (newNodeData.photoUrl && newNodeData.photoUrl.trim()) {
        extraTriples += `\n${nodeIri} <http://schema.org/image> ${lit(newNodeData.photoUrl.trim())} .`;
      }

      if (newNodeData.type === 'http://purl.org/ontology/bibo/Conference' || newNodeData.type === 'http://purl.org/ontology/bibo/Journal') {
        if (newNodeData.rank && newNodeData.rank.trim()) {
          extraTriples += `\n${nodeIri} <http://purl.org/ontology/bibo/rank> ${lit(newNodeData.rank.trim())} .`;
        }
        if (newNodeData.deadlineMonth && newNodeData.deadlineMonth.trim()) {
          extraTriples += `\n${nodeIri} <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/submissionDeadlineMonth> ${lit(newNodeData.deadlineMonth.trim())} .`;
        }
        if (newNodeData.subject && newNodeData.subject.trim()) {
          extraTriples += `\n${nodeIri} <http://purl.org/dc/terms/subject> ${lit(newNodeData.subject.trim())} .`;
        }
      }

      insertQuery = `
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX ex: <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/>
        PREFIX rfu: <http://cientopolis.org/rfu/>
        PREFIX schema: <http://schema.org/>
        
        INSERT DATA {
          ${nodeIri} rdf:type ${iri(finalType)} ;
                   rdfs:label ${lit(newNodeData.label)} ;
                   ex:posX ${num(x)} ;
                   ex:posY ${num(y)} ;
                   rfu:createdBy <${userUri}> .
          ${extraTriples}
        }
      `;
    } catch (err: any) {
      alert(err?.message || 'Error en los datos del nuevo nodo.');
      return;
    }

    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: insertQuery })
      });
      const data = await res.json();
      if (data.success) {
        setShowNewNodeModal(false);
        setNewNodeData({ label: '', type: 'http://vivoweb.org/ontology/core#GraduateStudent', uriSuffix: '', externalUrl: '', photoUrl: '', rank: 'CORE A*', deadlineMonth: 'Marzo', subject: '' });
        await fetchGraphData();
        // If this was a quick-connect action, open relation picker
        if (quickConnectSourceUri) {
          const defaultPred = finalType === 'http://cientopolis.org/rfu/Mindmap'
            ? 'http://cientopolis.org/rfu/hasMindmap'
            : 'http://vivoweb.org/ontology/core#relatedBy';
          openRelationModal(quickConnectSourceUri, uri, defaultPred);
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

    // Check if connecting Person <-> Project (VIVO Role pattern)
    if ((isSourcePerson && isTargetProject) || (isSourceProject && isTargetPerson)) {
      const personNode = isSourcePerson ? sourceNode : targetNode;
      const projectNode = isSourceProject ? sourceNode : targetNode;
      const personUri = personNode.uri;
      const projectUri = projectNode.uri;
      
      const isFaculty = personNode.type.includes('FacultyMember');
      const roleClass = isFaculty ? 'vivo:PrincipalInvestigatorRole' : 'vivo:MemberRole';
      const roleLabel = isFaculty ? 'Principal Investigator Role' : 'Member Role';
      const roleIdPrefix = isFaculty ? 'pi_role_' : 'member_role_';

      // Position intermediate role node right in the middle between Person and Project
      const midX = Math.round((personNode.x + projectNode.x) / 2);
      const midY = Math.round((personNode.y + projectNode.y) / 2);

      const roleId = Math.random().toString(36).substring(2, 9);
      const roleUri = `http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/${roleIdPrefix}${roleId}`;
      const userUri = user ? `http://cientopolis.org/rfu/user/${user.uid}` : 'http://cientopolis.org/rfu/user/guest';

      insertQuery = `
        PREFIX vivo: <http://vivoweb.org/ontology/core#>
        PREFIX obo: <http://purl.obolibrary.org/obo/>
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX ex: <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/>
        PREFIX rfu: <http://cientopolis.org/rfu/>

        INSERT DATA {
          <${roleUri}> a ${roleClass} ;
                       rdfs:label ${lit(roleLabel)} ;
                       ex:posX ${lit(num(midX))} ;
                       ex:posY ${lit(num(midY))} ;
                       obo:RO_0000052 <${personUri}> ;
                       obo:BFO_0000054 <${projectUri}> ;
                       rfu:createdBy <${userUri}> .

          <${projectUri}> vivo:relates <${personUri}> ;
                          vivo:relates <${roleUri}> .

          <${roleUri}> obo:RO_0000052 <${personUri}> .
          <${roleUri}> obo:BFO_0000054 <${projectUri}> .
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
        closeRelationModal();
        fetchGraphData();
      }
    } catch (e) {
      console.error("Error creando relación", e);
    }
  };

  // Delete Node (Removes from user canvas for regular users, deletes globally only if SuperAdmin or personal node)
  const deleteNode = async () => {
    if (!nodeToDelete || !user) return;
    const userUri = `http://cientopolis.org/rfu/user/${user.uid}`;
    const isShareableNode = (
      nodeToDelete.type.includes('Conference') ||
      nodeToDelete.type.includes('Journal') ||
      nodeToDelete.type.includes('Topic') ||
      nodeToDelete.type.includes('Dataset') ||
      nodeToDelete.type.includes('MediaObject') ||
      nodeToDelete.type.includes('FacultyMember') ||
      nodeToDelete.type.includes('GraduateStudent') ||
      nodeToDelete.type.includes('UndergraduateStudent')
    );

    let query = '';

    if (isShareableNode && !isSuperAdmin) {
      // Non-admin user: Remove node ONLY from current user's canvas and clear their user-specific canvas triples
      query = `
        PREFIX rfu: <http://cientopolis.org/rfu/>
        PREFIX ex: <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/>

        DELETE DATA {
          <${nodeToDelete.uri}> rfu:inCanvasOf <${userUri}> .
          <${nodeToDelete.uri}> rfu:createdBy <${userUri}> .
          <${nodeToDelete.uri}> ex:posX ?x .
          <${nodeToDelete.uri}> ex:posY ?y .
        }
      `;
    } else {
      // SuperAdmin OR personal node: Delete node and all its triples globally from GraphDB
      query = `
        DELETE WHERE { <${nodeToDelete.uri}> ?p ?o . };
        DELETE WHERE { ?s ?p <${nodeToDelete.uri}> . }
      `;
    }

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

  // Delete an existing connection (relation) between two nodes
  const deleteConnection = async () => {
    if (!selectedConnection) return;
    setIsDeletingConnection(true);
    const deleteQuery = `
      DELETE DATA {
        <${selectedConnection.from}> <${selectedConnection.predicate}> <${selectedConnection.to}> .
      }
    `;
    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: deleteQuery })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConnection(null);
        setIsInspectorOpen(false);
        setEditingPredicate('');
        await fetchGraphData();
      }
    } catch (e) {
      console.error('Error al eliminar relación', e);
    } finally {
      setIsDeletingConnection(false);
    }
  };

  // Invert direction of an existing connection (Sujeto <-> Objeto)
  const invertConnectionDirection = async () => {
    if (!selectedConnection) return;
    setIsInvertingConnection(true);
    const invertQuery = `
      DELETE DATA {
        <${selectedConnection.from}> <${selectedConnection.predicate}> <${selectedConnection.to}> .
      } ;
      INSERT DATA {
        <${selectedConnection.to}> <${selectedConnection.predicate}> <${selectedConnection.from}> .
      }
    `;
    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: invertQuery })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConnection(null);
        setIsInspectorOpen(false);
        setEditingPredicate('');
        await fetchGraphData();
      }
    } catch (e) {
      console.error('Error al invertir dirección de la relación', e);
    } finally {
      setIsInvertingConnection(false);
    }
  };

  // Delete both directions if a reciprocal relation exists (A -> B and B -> A)
  const deleteBothDirections = async () => {
    if (!selectedConnection) return;
    setIsDeletingConnection(true);
    const deleteBothQuery = `
      DELETE DATA {
        <${selectedConnection.from}> <${selectedConnection.predicate}> <${selectedConnection.to}> .
        <${selectedConnection.to}> <${selectedConnection.predicate}> <${selectedConnection.from}> .
      }
    `;
    try {
      const res = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: deleteBothQuery })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConnection(null);
        setIsInspectorOpen(false);
        setEditingPredicate('');
        await fetchGraphData();
      }
    } catch (e) {
      console.error('Error al eliminar relación en ambos sentidos', e);
    } finally {
      setIsDeletingConnection(false);
    }
  };

  // Create Connection
  const createConnection = async (sourceURI: string, targetURI: string) => {
    const sourceNode = nodes.find(n => n.uri === sourceURI);
    const targetNode = nodes.find(n => n.uri === targetURI);
    if (!sourceNode || !targetNode) return;

    // Ontological Predicate Suggestion
    let suggestedPredicate = 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/relatedTo';
    
    if (sourceNode.type.includes('FacultyMember') && (targetNode.type.includes('GraduateStudent') || targetNode.type.includes('UndergraduateStudent'))) {
      suggestedPredicate = 'http://vivoweb.org/ontology/core#advisor';
    } else if ((sourceNode.type.includes('GraduateStudent') || sourceNode.type.includes('UndergraduateStudent')) && targetNode.type.includes('Project')) {
      suggestedPredicate = 'http://vivoweb.org/ontology/core#contributorTo';
    } else if ((sourceNode.type.includes('Article') || sourceNode.type.includes('Thesis')) && (targetNode.type.includes('GraduateStudent') || targetNode.type.includes('UndergraduateStudent'))) {
      suggestedPredicate = 'https://dblp.org/rdf/schema#authoredBy';
    } else if ((sourceNode.type.includes('DocumentDraft') || sourceNode.type.includes('AcademicArticle') || sourceNode.type.includes('Article')) && targetNode.type.includes('Conference')) {
      suggestedPredicate = 'http://purl.org/ontology/bibo/presentedAt';
    } else if ((sourceNode.type.includes('DocumentDraft') || sourceNode.type.includes('AcademicArticle') || sourceNode.type.includes('Article')) && targetNode.type.includes('Journal')) {
      suggestedPredicate = 'http://vivoweb.org/ontology/core#publicationVenue';
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
    if (uri.startsWith('http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/')) {
      return uri.replace('http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/', 'ex:');
    }
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
    if (typeURI.includes('PrincipalInvestigatorRole')) return 'Rol de Inv. Principal';
    if (typeURI.includes('MemberRole') || typeURI.includes('Role')) return 'Rol de Miembro';
    if (typeURI.includes('FacultyMember')) return 'Investigador';
    if (typeURI.includes('GraduateStudent')) return 'Estudiante de posgrado';
    if (typeURI.includes('UndergraduateStudent')) return 'Estudiante de grado';
    if (typeURI.includes('Project')) return 'Proyecto';
    if (typeURI.includes('DocumentDraft')) return 'Paper a escribir';
    if (typeURI.includes('AcademicArticle')) return 'Paper referencia';
    if (typeURI.includes('Article') || typeURI.includes('Publication')) return 'Paper';
    if (typeURI.includes('Folder')) return 'Carpeta en Nube';
    if (typeURI.includes('ImageObject')) return 'Diagrama';
    if (typeURI.includes('Dataset')) return 'Tabla / Datos';
    if (typeURI.includes('MediaObject')) return 'Archivo';
    if (typeURI.includes('Meeting')) return 'Reunión / Minuta';
    if (typeURI.includes('Conference')) return 'Conferencia';
    if (typeURI.includes('Journal')) return 'Revista / Journal';
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
    if (type.includes('Role')) return 'nodeRol';
    if (type.includes('FacultyMember')) return 'nodeInvestigador';
    if (type.includes('GraduateStudent')) return 'nodeTesistaPosgrado';
    if (type.includes('UndergraduateStudent')) return 'nodeTesistaDeGrado';
    if (type.includes('Project')) return 'nodeProyecto';
    if (type.includes('DocumentDraft')) return 'nodePaperEscribir';
    if (type.includes('AcademicArticle')) return 'nodePaperReferencia';
    if (type.includes('Folder')) return 'nodeCarpetaNube';
    if (type.includes('ImageObject')) return 'nodeDiagrama';
    if (type.includes('Dataset')) return 'nodeTabla';
    if (type.includes('MediaObject')) return 'nodeArchivo';
    if (type.includes('Meeting')) return 'nodeReunion';
    if (type.includes('Conference')) return 'nodeConferencia';
    if (type.includes('Journal')) return 'nodeRevista';
    if (type.includes('Thesis')) {
      if (thesisType === 'PhD Thesis') return 'nodeTesisDoctoral';
      if (thesisType === 'Magister') return 'nodeTesisMaestria';
      return 'nodePaper';
    }
    if (type.includes('InformationResource') || type.includes('Article') || type.includes('Publication')) return 'nodePaper';
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
        {/* Left Side: Title, View Switcher and Node Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em', color: 'var(--text-main)', cursor: 'pointer' }} onClick={() => setCurrentView('canvas')}>
            <span style={{ fontWeight: 700, color: 'var(--color-investigador)' }}>Dire</span>
            <span style={{ fontWeight: 400, color: 'var(--accent)' }}>Atento</span>
          </h1>

          {/* Navigation View Switcher Tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-mantle)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setCurrentView('canvas')}
              style={{
                background: currentView === 'canvas' ? 'var(--bg-surface)' : 'transparent',
                color: currentView === 'canvas' ? 'var(--text-main)' : 'var(--text-muted)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: currentView === 'canvas' ? 600 : 400,
                cursor: 'pointer',
                boxShadow: currentView === 'canvas' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              🎨 Lienzo de Investigación
            </button>
            <button
              onClick={() => setCurrentView('meetings')}
              style={{
                background: currentView === 'meetings' ? 'var(--bg-surface)' : 'transparent',
                color: currentView === 'meetings' ? 'var(--text-main)' : 'var(--text-muted)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: currentView === 'meetings' ? 600 : 400,
                cursor: 'pointer',
                boxShadow: currentView === 'meetings' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              📅 Agenda / Reuniones
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => setCurrentView('admin-catalog')}
                style={{
                  background: currentView === 'admin-catalog' ? 'var(--bg-surface)' : 'transparent',
                  color: currentView === 'admin-catalog' ? 'var(--color-investigador)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: currentView === 'admin-catalog' ? 700 : 400,
                  cursor: 'pointer',
                  boxShadow: currentView === 'admin-catalog' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                👑 Gestión del Catálogo (Admin)
              </button>
            )}
          </div>

          {currentView === 'canvas' && (
            <>
              <div style={{ position: 'relative' }}>
                {isDev && <span className="dev-tag-badge" style={{ top: '-18px' }}>#btnAgregarNodo</span>}
                <button className="btn btn-primary" onClick={() => {
                  setEditingCatalogNode(null);
                  setShowNewNodeModal(true);
                  fetchGlobalCatalog(newNodeData.type);
                }}>+ Agregar Nodo</button>
              </div>

              <div style={{ position: 'relative' }}>
                {isDev && <span className="dev-tag-badge" style={{ top: '-18px' }}>#btnModoFoco</span>}
                <button 
                  id="btnToggleModoFoco"
                  className={`btn ${focusMode ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    backgroundColor: focusMode ? 'var(--color-proyecto, #C17F59)' : 'var(--bg-surface)',
                    color: focusMode ? '#ffffff' : 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    fontWeight: 600,
                    boxShadow: focusMode ? '0 2px 8px rgba(193,127,89,0.25)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => {
                    const next = !focusMode;
                    setFocusMode(next);
                    localStorage.setItem('canvas_focus_mode', String(next));
                  }}
                  title={focusMode 
                    ? "Modo Foco activo: Las flechas se contraen al origen y se expanden al interactuar o pasar el mouse. Clic para mostrar todas." 
                    : "Modo Normal: Mostrando todas las flechas. Clic para activar el Modo Foco (contraer flechas al origen)."}
                >
                  <span>{focusMode ? '🎯 Modo Foco: Activo' : '🌐 Flechas: Todas'}</span>
                </button>
              </div>

              {/* Theme Selector (Alternativa 1: Presets Curados) */}
              <div className="theme-menu-container" style={{ position: 'relative' }}>
                {isDev && <span className="dev-tag-badge" style={{ top: '-18px' }}>#btnSelectorTema</span>}
                <button
                  id="btnSelectorTema"
                  className="btn btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                  title="Cambiar tema de color del lienzo"
                >
                  <span>{CANVAS_THEMES.find(t => t.id === canvasTheme)?.icon || '🎨'}</span>
                  <span>{CANVAS_THEMES.find(t => t.id === canvasTheme)?.name || 'Tema'}</span>
                  <span style={{ fontSize: '0.65rem', marginLeft: '2px', opacity: 0.7 }}>▼</span>
                </button>

                {isThemeMenuOpen && (
                  <div
                    id="dropdownMenuTemas"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      padding: '8px',
                      minWidth: '240px',
                      zIndex: 1000,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 8px 6px' }}>
                      Temas del Lienzo
                    </div>
                    {CANVAS_THEMES.map(t => {
                      const isActive = canvasTheme === t.id;
                      return (
                        <button
                          key={t.id}
                          className="theme-option-btn"
                          data-theme-id={t.id}
                          onClick={() => {
                            setCanvasTheme(t.id);
                            localStorage.setItem('canvas_theme', t.id);
                            setIsThemeMenuOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: isActive ? '1px solid var(--border-focus, #3B82F6)' : '1px solid transparent',
                            backgroundColor: isActive ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          {/* Color preview swatch dots */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: t.bgPreview, border: '1px solid rgba(0,0,0,0.2)', display: 'inline-block' }} />
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: t.primaryPreview, display: 'inline-block' }} />
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: t.accentPreview, display: 'inline-block' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: isActive ? 700 : 500, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{t.icon}</span>
                              <span>{t.name}</span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                              {t.subtitle}
                            </div>
                          </div>
                          {isActive && <span style={{ color: '#2563EB', fontWeight: 'bold' }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'canvas' && nodes.length === 0 && (
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
                    setRulesetStatusMsg(null);
                    fetchCatalogResearchers();
                    fetchActiveRuleset();
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

      {/* Main Content Area (Canvas / Meetings / Admin Catalog Panel & Sidebars) */}
      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden', height: 'calc(100vh - 64px)' }}>

      {/* Admin Shared Catalog Management View */}
      {currentView === 'admin-catalog' && isSuperAdmin ? (
        <AdminCatalogPanel
          fetchWithAuth={fetchWithAuth}
          STATIC_CSO_TOPICS={STATIC_CSO_TOPICS}
          fetchCSOTopics={fetchCSOTopics}
          csoTopicsList={csoTopicsList}
          isFetchingCSO={isFetchingCSO}
          onDatabaseReset={() => {
            setNodes([]);
            setConnections([]);
            setNodePhotos({});
            setAssociatedResearcher(null);
            setCatalogResearchers([]);
            setGlobalCatalogNodes([]);
          }}
        />
      ) : currentView === 'meetings' ? (
        <MeetingsPanel
          userUid={user.uid}
          fetchWithAuth={fetchWithAuth}
          canvasNodes={nodes.map(n => ({ uri: n.uri, label: n.label, type: n.type }))}
          onRefreshCanvas={fetchGraphData}
        />
      ) : (
        <>
        {/* Main Interactive Canvas */}
        <div 
          id="canvasMain" 
          ref={canvasRef}
          data-canvas-theme={canvasTheme}
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
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--canvas-arrow-color, #8c8fa1)" />
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

                // Focus Mode (Alternativa 4): Expand on demand if from or to is selected, hovered, pinned, or connection selected
                const isConnSelected = selectedConnection?.id === conn.id;
                const isFromActive = (selectedNode?.uri === conn.from) || (hoveredNodeUri === conn.from) || pinnedNodeUris.includes(conn.from);
                const isToActive = (selectedNode?.uri === conn.to) || (hoveredNodeUri === conn.to) || pinnedNodeUris.includes(conn.to);
                const isEdgeExpanded = !focusMode || isConnSelected || isFromActive || isToActive;

                if (!isEdgeExpanded) {
                  return null;
                }

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
                        fill={isSel ? 'var(--canvas-edge-selected, #1e66f5)' : 'var(--canvas-edge-badge-bg, #ffffff)'}
                        stroke={isSel ? 'var(--canvas-edge-selected, #1e66f5)' : 'var(--canvas-edge-badge-stroke, #cbd5e1)'}
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
                          fill: isSel ? '#ffffff' : 'var(--canvas-edge-badge-text, #334155)',
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

            // Outgoing connections calculation for Focus Mode Hub
            const outgoingConnections = connections.filter(c => c.from === node.uri);
            const outgoingCount = outgoingConnections.length;
            const isNodeHovered = hoveredNodeUri === node.uri;
            const isNodePinned = pinnedNodeUris.includes(node.uri);
            const isNodeActive = isSelected || isNodeHovered || isNodePinned;

            // Tinted Chips palette — Harmonized per Theme (Alternativa 1: Presets Curados)
            const currentChipPalette = THEME_PALETTES[canvasTheme] || THEME_PALETTES['classic'];
            const chip = currentChipPalette[nodeDomId] ?? currentChipPalette['default'];

            return (
              <div
                key={node.uri}
                ref={(el) => nodeRef(el, node.uri)}
                id={node.uri}
                className={`node-card ${isSelected ? 'selected' : ''}`}
                onMouseEnter={() => setHoveredNodeUri(node.uri)}
                onMouseLeave={() => setHoveredNodeUri(null)}
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
                  } else if (node.type.includes('Meeting')) {
                    e.stopPropagation();
                    openMeetingLogModal(node);
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

                {/* Connect with existing node button */}
                <button
                  title="Vincular con un nodo existente en el lienzo"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const otherNodes = nodes.filter(n => n.uri !== node.uri);
                    if (otherNodes.length === 0) {
                      alert('No hay otros nodos en el lienzo para conectar.');
                      return;
                    }
                    openRelationModal(node.uri, otherNodes[0].uri, 'http://vivoweb.org/ontology/core#relatedBy');
                  }}
                  style={{
                    position: 'absolute',
                    right: '-14px',
                    top: '18%',
                    transform: 'translateY(-50%)',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: 'var(--bg-surface)',
                    color: chip.chipColor,
                    border: `2px solid ${chip.chipColor}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    lineHeight: 1,
                    boxShadow: `0 2px 8px rgba(0,0,0,0.1)`,
                    zIndex: 20,
                    opacity: 0,
                    transition: 'opacity 0.15s ease, transform 0.15s ease',
                  }}
                  className="node-quick-connect-btn"
                >🔗</button>
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

                {/* External URL Button */}
                {node.externalUrl && (
                  <a
                    href={node.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: '6px',
                      padding: '4px 8px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: chip.chipColor,
                      background: 'rgba(255,255,255,0.75)',
                      border: `1px solid ${chip.chipColor}44`,
                      borderRadius: '6px',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      transition: 'all 0.15s ease'
                    }}
                    title={`Abrir sitio alojado: ${node.externalUrl}`}
                  >
                    🔗 Abrir sitio externo
                  </a>
                )}

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

                {/* Meeting specific trigger button: Notes & Attendance */}
                {node.type.includes('Meeting') && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMeetingLogModal(node);
                    }}
                    style={{
                      marginTop: '6px',
                      padding: '5px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: chip.titleColor,
                      background: 'rgba(193, 127, 89, 0.16)',
                      border: `1px solid ${chip.chipColor}66`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      boxShadow: '0 1px 4px rgba(124, 67, 36, 0.12)',
                      transition: 'all 0.15s ease'
                    }}
                    title="Visualizar las notas tomadas en la reunión y la asistencia"
                  >
                    📋 Ver Notas y Asistencia
                  </button>
                )}

                {/* Focus Mode Outgoing Hub Badge (Alternativa 4: contraer/expandir al origen) */}
                {focusMode && outgoingCount > 0 && (
                  <button
                    type="button"
                    className="node-edges-hub-badge"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPinnedNodeUris(prev => 
                        prev.includes(node.uri) 
                          ? prev.filter(u => u !== node.uri)
                          : [...prev, node.uri]
                      );
                    }}
                    title={isNodePinned 
                      ? `Desfijar flechas (${outgoingCount} relaciones). Clic para contraer al origen.`
                      : isNodeActive
                        ? `Fijar flechas desplegadas (${outgoingCount} relaciones).`
                        : `Expandir ${outgoingCount} flecha${outgoingCount === 1 ? '' : 's'} hacia sus destinos.`}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      bottom: '-11px',
                      zIndex: 15,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      background: isNodePinned 
                        ? 'var(--color-proyecto, #C17F59)' 
                        : isNodeActive 
                          ? 'var(--color-investigador, #1A2B48)' 
                          : 'var(--bg-surface, #ffffff)',
                      color: isNodePinned || isNodeActive ? '#ffffff' : 'var(--text-main, #1A2B48)',
                      border: `1.5px solid ${isNodePinned ? 'var(--color-proyecto, #C17F59)' : chip.chipColor}`,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      lineHeight: '1.2'
                    }}
                  >
                    <span>{isNodePinned ? '📌' : isNodeActive ? '👁️' : '↗'}</span>
                    <span>{outgoingCount} {outgoingCount === 1 ? 'relación' : 'relaciones'}</span>
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {/* Source selector buttons */}
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => setPhotoSourceMode('url')}
                                  style={{
                                    fontSize: '0.74rem',
                                    padding: '4px 10px',
                                    background: photoSourceMode === 'url' ? 'var(--color-investigador)' : 'var(--bg-surface)',
                                    color: photoSourceMode === 'url' ? '#fff' : 'var(--text-main)',
                                    border: '1px solid var(--border-color)'
                                  }}
                                >
                                  🌐 URL Web
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => setPhotoSourceMode('google')}
                                  style={{
                                    fontSize: '0.74rem',
                                    padding: '4px 10px',
                                    background: photoSourceMode === 'google' ? 'var(--color-investigador)' : 'var(--bg-surface)',
                                    color: photoSourceMode === 'google' ? '#fff' : 'var(--text-main)',
                                    border: '1px solid var(--border-color)'
                                  }}
                                >
                                  🔵 Cuenta Google
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => {
                                    setPhotoSourceMode('lifia');
                                    fetchLifiaMembers();
                                  }}
                                  style={{
                                    fontSize: '0.74rem',
                                    padding: '4px 10px',
                                    background: photoSourceMode === 'lifia' ? 'var(--color-investigador)' : 'var(--bg-surface)',
                                    color: photoSourceMode === 'lifia' ? '#fff' : 'var(--text-main)',
                                    border: '1px solid var(--border-color)'
                                  }}
                                >
                                  🏛️ Memorias@LIFIA
                                </button>
                              </div>

                              {/* Opción 1: URL en la Web */}
                              {photoSourceMode === 'url' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <input
                                    id="photoUrlInput"
                                    type="url"
                                    placeholder="https://ejemplo.org/foto-perfil.jpg"
                                    value={nodeDetails['http://schema.org/image'] || nodePhotos[selectedNode.uri] || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handlePropertyChange('http://schema.org/image', val, (v) => !v || /^https?:\/\/.+/i.test(v) ? null : 'Debe comenzar con http:// o https://');
                                      setNodePhotos(prev => {
                                        const next = { ...prev };
                                        if (val.trim()) next[selectedNode.uri] = val.trim();
                                        else delete next[selectedNode.uri];
                                        return next;
                                      });
                                      if (val.trim()) {
                                        setNodeIcons(prev => ({ ...prev, [selectedNode.uri]: null }));
                                      }
                                    }}
                                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                                  />
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                    Pegá la dirección web (URL) de una imagen alojada externamente. No se guardan archivos binarios en la base.
                                  </span>
                                </div>
                              )}

                              {/* Opción 2: Foto de perfil de Google */}
                              {photoSourceMode === 'google' && (
                                <div style={{
                                  display: 'flex', flexDirection: 'column', gap: '6px',
                                  padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-color)'
                                }}>
                                  {user?.photoURL ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <img
                                        src={user.photoURL}
                                        alt="Google Avatar"
                                        referrerPolicy="no-referrer"
                                        style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                                      />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                          {user.displayName || user.email}
                                        </div>
                                        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {user.photoURL}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-primary"
                                        onClick={() => {
                                          const gUrl = user.photoURL!;
                                          handlePropertyChange('http://schema.org/image', gUrl);
                                          setNodePhotos(prev => ({ ...prev, [selectedNode.uri]: gUrl }));
                                          setNodeIcons(prev => ({ ...prev, [selectedNode.uri]: null }));
                                        }}
                                        style={{ fontSize: '0.74rem', padding: '5px 10px' }}
                                      >
                                        Usar mi foto Google
                                      </button>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                      Tu sesión actual ({user?.email}) no posee una foto de perfil de Google asociada, o iniciaste sesión con email/contraseña. Podés iniciar sesión con el botón <strong>Continuar con Google</strong> o pegar la URL de Google Photos/Avatar en la pestaña URL Web.
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Opción 3: Perfil en Memorias@LIFIA (memorias.lifia.info.unlp.edu.ar/members) */}
                              {photoSourceMode === 'lifia' && (
                                <div style={{
                                  display: 'flex', flexDirection: 'column', gap: '6px',
                                  padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-color)'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                      Directorio memorias.lifia.info.unlp.edu.ar/members
                                    </span>
                                    <a
                                      href="https://memorias.lifia.info.unlp.edu.ar/members"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ fontSize: '0.68rem', color: 'var(--color-investigador)' }}
                                    >
                                      Abrir portal ↗
                                    </a>
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Buscar integrante del LIFIA por nombre (ej: Diego Torres, Rossi)..."
                                    value={lifiaSearchQuery}
                                    onChange={(e) => setLifiaSearchQuery(e.target.value)}
                                    style={{ fontSize: '0.78rem', padding: '5px 8px' }}
                                  />
                                  {isLoadingLifiaMembers && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                      ⏳ Consultando miembros en memorias.lifia.info.unlp.edu.ar/members...
                                    </span>
                                  )}
                                  {lifiaError && (
                                    <span style={{ fontSize: '0.72rem', color: '#d20f39' }}>
                                      ⚠️ {lifiaError}
                                    </span>
                                  )}
                                  {!isLoadingLifiaMembers && lifiaMembers.length > 0 && (
                                    <div style={{
                                      maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px',
                                      marginTop: '2px'
                                    }}>
                                      {lifiaMembers
                                        .filter(m => !lifiaSearchQuery.trim() || m.name.toLowerCase().includes(lifiaSearchQuery.toLowerCase().trim()))
                                        .map(member => (
                                          <div
                                            key={member.slug}
                                            onClick={() => {
                                              handlePropertyChange('http://schema.org/image', member.photoUrl);
                                              setNodePhotos(prev => ({ ...prev, [selectedNode.uri]: member.photoUrl }));
                                              setNodeIcons(prev => ({ ...prev, [selectedNode.uri]: null }));
                                            }}
                                            style={{
                                              display: 'flex', alignItems: 'center', gap: '8px',
                                              padding: '5px 8px', borderRadius: '6px', cursor: 'pointer',
                                              background: nodePhotos[selectedNode.uri] === member.photoUrl ? 'rgba(30, 102, 245, 0.12)' : 'var(--bg-mantle)',
                                              border: nodePhotos[selectedNode.uri] === member.photoUrl ? '1px solid #1e66f5' : '1px solid transparent'
                                            }}
                                          >
                                            <img
                                              src={member.photoUrl}
                                              alt={member.name}
                                              referrerPolicy="no-referrer"
                                              style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                            />
                                            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-main)', flex: 1 }}>
                                              {member.name}
                                            </span>
                                            <span style={{ fontSize: '0.68rem', color: '#1e66f5', fontWeight: 600 }}>
                                              Usar foto
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {(nodePhotos[selectedNode.uri] || nodeDetails['http://schema.org/image']) && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#d20f39', alignSelf: 'flex-start' }}
                                  onClick={() => {
                                    handlePropertyChange('http://schema.org/image', '');
                                    setNodePhotos(prev => {
                                      const next = { ...prev };
                                      delete next[selectedNode.uri];
                                      return next;
                                    });
                                  }}
                                >
                                  ✕ Quitar foto
                                </button>
                              )}
                              {!nodePhotos[selectedNode.uri] && !nodeDetails['http://schema.org/image'] && (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                  Sin foto. Se usa el avatar o ícono seleccionado. Recordá pulsar "Guardar Cambios" para persistir la URL en GraphDB.
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
                                        handlePropertyChange('http://schema.org/image', '');
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
                                      handlePropertyChange('http://schema.org/image', '');
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
                            // Ocultar labels, status predefinidos, posiciones (ex:posX / ex:posY), o propiedades sugeridas fijas
                            const isLabel = uri === 'http://www.w3.org/2000/01/rdf-schema#label';
                            const isPosition = uri === 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/posX' || uri === 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/posY' || uri === 'http://example.org/resource/posX' || uri === 'http://example.org/resource/posY';
                            const isPredefined = getPredefinedProperties(selectedNode.type).some(p => p.uri === uri);
                            return !isLabel && !isPosition && !isPredefined;
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
                                      resolvedURI = resolvedURI.replace('ex:', 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/');
                                    } else if (!resolvedURI.startsWith('http://') && !resolvedURI.startsWith('https://')) {
                                      resolvedURI = `http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/${resolvedURI}`;
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
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                      {selectedNode.type.includes('Meeting') && (
                        <button
                          className="btn"
                          style={{ color: '#7C4324', borderColor: '#C17F59', background: 'rgba(193, 127, 89, 0.12)' }}
                          onClick={() => {
                            const targetMeeting = selectedNode;
                            setSelectedNode(null);
                            setIsInspectorOpen(false);
                            openMeetingLogModal(targetMeeting);
                          }}
                        >
                          📋 Ver Notas y Asistencia
                        </button>
                      )}
                    </div>
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
                        <option value="http://cientopolis.org/rfu/hasParticipant">rfu:hasParticipant — Participa en reunión</option>
                        <option value="http://cientopolis.org/rfu/collaboratesWith">rfu:collaboratesWith — Colabora con</option>
                        <option value="http://cientopolis.org/rfu/supervises">rfu:supervises — Supervisa</option>
                        <option value="http://cientopolis.org/rfu/partOf">rfu:partOf — Parte de</option>
                        <option value="http://cientopolis.org/rfu/researchedIn">rfu:researchedIn — Investigado en</option>
                      </optgroup>
                      <optgroup label="Genérico">
                        <option value="http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/relatedTo">ex:relatedTo — Relacionado con</option>
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

                  {/* Advertencia si existe relación bidireccional recíproca */}
                  {connections.some(c => c.from === selectedConnection.to && c.to === selectedConnection.from && c.predicate === selectedConnection.predicate) && (
                    <div style={{
                      padding: '10px 12px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid #f59e0b',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      color: '#b45309',
                      marginTop: '6px'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: '2px' }}>⚠️ Relación bidireccional detectada</div>
                      <div>Esta propiedad también existe en el sentido contrario (<code>{getCleanLabel(selectedConnection.to)} → {getCleanLabel(selectedConnection.from)}</code>).</div>
                      <button
                        type="button"
                        id="btnEliminarAmbosSentidos"
                        className="btn btn-sm btn-secondary"
                        onClick={deleteBothDirections}
                        disabled={isDeletingConnection}
                        style={{ marginTop: '8px', fontSize: '0.72rem', padding: '4px 8px', color: '#b45309', borderColor: '#f59e0b' }}
                      >
                        🗑️ Eliminar en ambos sentidos
                      </button>
                    </div>
                  )}

                  <div className="flex-row flex-space" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        id="btnEliminarRelacion"
                        className="btn"
                        onClick={deleteConnection}
                        disabled={isDeletingConnection || isSavingPredicate || isInvertingConnection}
                        style={{ color: '#d20f39', borderColor: '#d20f39' }}
                      >
                        {isDeletingConnection ? '⏳ Eliminando...' : '🗑️ Eliminar Relación'}
                      </button>
                      <button
                        id="btnInvertirDireccion"
                        type="button"
                        className="btn btn-secondary"
                        onClick={invertConnectionDirection}
                        disabled={isInvertingConnection || isDeletingConnection || isSavingPredicate}
                        title="Intercambiar origen y destino (Sujeto ↔ Objeto)"
                        style={{ fontSize: '0.8rem' }}
                      >
                        {isInvertingConnection ? '⏳ Invirtiendo...' : '🔄 Invertir Dirección'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn" onClick={() => { setSelectedConnection(null); setIsInspectorOpen(false); setEditingPredicate(''); }}>Cancelar</button>
                      <button
                        id="btnGuardarPredicado"
                        className="btn btn-primary"
                        onClick={saveConnectionPredicate}
                        disabled={isSavingPredicate || isDeletingConnection || isInvertingConnection || editingPredicate === selectedConnection.predicate}
                        style={{ opacity: (isSavingPredicate || isDeletingConnection || isInvertingConnection || editingPredicate === selectedConnection.predicate) ? 0.55 : 1, transition: 'opacity 0.2s' }}
                      >
                        {isSavingPredicate ? '⏳ Guardando...' : '💾 Guardar Predicado'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* Modal Agregar Nodo */}
      {showNewNodeModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 500
        }}>
          <div style={{ background: 'var(--bg-mantle)', padding: '24px', borderRadius: '16px', width: '440px', maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-color)', boxShadow: '0 12px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Agregar Nodo</h2>
              <button className="btn btn-sm" onClick={() => setShowNewNodeModal(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Tipo Semántico</label>
              <select
                value={newNodeData.type}
                onChange={(e) => {
                  const newType = e.target.value;
                  setNewNodeData({ ...newNodeData, type: newType });
                  // Trigger catalog fetch if type is shareable
                  fetchGlobalCatalog(newType);
                }}
              >
                <option value="http://purl.org/ontology/bibo/Conference">🎤 Conferencia (bibo:Conference)</option>
                <option value="http://purl.org/ontology/bibo/Journal">📰 Revista / Journal (bibo:Journal)</option>
                <option value="http://cso.kmi.open.ac.uk/schema/cso#Topic">Tópico CSO (cso:Topic)</option>
                <option value="http://purl.org/ontology/bibo/DocumentDraft">📝 Paper a escribir (bibo:DocumentDraft)</option>
                <option value="http://purl.org/ontology/bibo/AcademicArticle">📚 Paper ya escrito / Referencia (bibo:AcademicArticle)</option>
                <option value="https://dblp.org/rdf/schema#Article">Paper (dblp:Article)</option>
                <option value="http://schema.org/Folder">📁 Carpeta en la nube (schema:Folder)</option>
                <option value="http://schema.org/ImageObject">📊 Diagrama (schema:ImageObject)</option>
                <option value="http://schema.org/Dataset">📋 Tabla / Datos (schema:Dataset)</option>
                <option value="http://schema.org/MediaObject">📄 Archivo (schema:MediaObject)</option>
                <option value="http://vivoweb.org/ontology/core#Meeting">📅 Reunión / Minutas (vivo:Meeting)</option>
                <option value="http://vivoweb.org/ontology/core#FacultyMember">Investigador (vivo:FacultyMember)</option>
                <option value="http://vivoweb.org/ontology/core#GraduateStudent">Tesista de Posgrado (vivo:GraduateStudent)</option>
                <option value="http://vivoweb.org/ontology/core#UndergraduateStudent">Tesista de Grado (vivo:UndergraduateStudent)</option>
                <option value="http://vivoweb.org/ontology/core#Project">Proyecto (vivo:Project)</option>
                <option value="http://purl.org/ontology/bibo/Thesis#PhD">Tesis Doctoral (PhD Thesis)</option>
                <option value="http://purl.org/ontology/bibo/Thesis#Master">Tesis de Maestría (Magister)</option>
                <option value="http://cientopolis.org/rfu/Mindmap">🧠 Mapa Mental (rfu:Mindmap)</option>
              </select>
            </div>

            {/* Tabs Selector: "Seleccionar del Catálogo del Sistema" vs "Crear Nuevo Nodo" */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <button
                className={`btn btn-sm ${nodeModeTab === 'catalog' ? 'btn-primary' : ''}`}
                onClick={() => {
                  setNodeModeTab('catalog');
                  fetchGlobalCatalog(newNodeData.type);
                }}
                style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
              >
                🔍 Catálogo del Sistema
              </button>
              <button
                className={`btn btn-sm ${nodeModeTab === 'new' ? 'btn-primary' : ''}`}
                onClick={() => setNodeModeTab('new')}
                style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
              >
                ➕ Crear Nuevo Nodo
              </button>
            </div>

            {/* TAB 1: Seleccionar del Catálogo Compartido del Sistema */}
            {nodeModeTab === 'catalog' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.78rem' }}>🔍 Buscar en el Banco General ({getCleanType(newNodeData.type)})</label>
                  <input
                    type="text"
                    placeholder={
                      newNodeData.type === 'http://purl.org/ontology/bibo/Conference' || newNodeData.type === 'http://purl.org/ontology/bibo/Journal'
                        ? "Filtrar por nombre, ranking (CORE A*, Q1, etc.) o palabras clave..."
                        : "Filtrar por nombre o palabras clave..."
                    }
                    value={catalogSearchQuery}
                    onChange={(e) => setCatalogSearchQuery(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', fontSize: '0.82rem' }}
                  />
                </div>

                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px', background: 'var(--bg-surface)' }}>
                  {isLoadingCatalog ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>⏳ Cargando catálogo general del sistema...</div>
                  ) : (() => {
                    // Exclude nodes already on user canvas
                    const canvasUris = new Set((nodes || []).map(n => n.uri));
                    const filtered = (globalCatalogNodes || []).filter(n => {
                      if (!n || !n.uri) return false;
                      if (canvasUris.has(n.uri)) return false;
                      const q = catalogSearchQuery.toLowerCase().trim();
                      if (!q) return true;
                      const labelMatch = (n.label || '').toLowerCase().includes(q);
                      const rankMatch = (n.rank || '').toLowerCase().includes(q);
                      const subjectMatch = (n.subject || '').toLowerCase().includes(q);
                      const urlMatch = (n.externalUrl || '').toLowerCase().includes(q);
                      return labelMatch || rankMatch || subjectMatch || urlMatch;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span>No se encontraron {getCleanType(newNodeData.type)} disponibles en el catálogo general.</span>
                          <button className="btn btn-sm btn-primary" onClick={() => setNodeModeTab('new')} style={{ alignSelf: 'center' }}>
                            ➕ Crear {getCleanType(newNodeData.type)} en el Sistema
                          </button>
                        </div>
                      );
                    }

                    return filtered.map((item) => (
                      <div
                        key={item.uri}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: 'var(--bg-mantle)',
                          border: '1px solid var(--border-color)',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            {item.photoUrl && (
                              <img
                                src={item.photoUrl}
                                alt={item.label}
                                referrerPolicy="no-referrer"
                                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                              />
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>{item.label}</span>
                              <div style={{ display: 'flex', gap: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                {(newNodeData.type === 'http://purl.org/ontology/bibo/Conference' || newNodeData.type === 'http://purl.org/ontology/bibo/Journal') && item.rank && (
                                  <span style={{ background: 'rgba(193,127,89,0.15)', color: '#C17F59', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>{item.rank}</span>
                                )}
                                {(newNodeData.type === 'http://purl.org/ontology/bibo/Conference' || newNodeData.type === 'http://purl.org/ontology/bibo/Journal') && item.deadlineMonth && (
                                  <span style={{ background: 'rgba(163,217,201,0.2)', color: '#1B5346', padding: '1px 5px', borderRadius: '4px' }}>📅 {item.deadlineMonth}</span>
                                )}
                                {item.subject && <span>{item.subject}</span>}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            {isSuperAdmin && (
                              <button
                                className="btn btn-sm"
                                onClick={() => setEditingCatalogNode(editingCatalogNode?.uri === item.uri ? null : { ...item })}
                                style={{ padding: '5px 8px', fontSize: '0.75rem' }}
                                title="Editar entidad compartida en GraphDB"
                              >
                                ✏️ Editar
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => addExistingNodeToCanvas(item.uri)}
                              style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                            >
                              ➕ Agregar a mi lienzo
                            </button>
                          </div>
                        </div>

                        {/* Inline Admin Editor for shared node */}
                        {isSuperAdmin && editingCatalogNode?.uri === item.uri && (
                          <div style={{
                            marginTop: '6px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)',
                            display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-surface)',
                            padding: '10px', borderRadius: '6px'
                          }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-investigador)' }}>✏️ Edición de Entidad en GraphDB (SuperAdmin)</span>
                            <div className="form-group">
                              <label style={{ fontSize: '0.72rem' }}>Nombre / Etiqueta</label>
                              <input
                                type="text"
                                value={editingCatalogNode?.label || ''}
                                onChange={(e) => editingCatalogNode && setEditingCatalogNode({ ...editingCatalogNode, label: e.target.value })}
                                style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                              />
                            </div>
                            {(newNodeData.type === 'http://purl.org/ontology/bibo/Conference' || newNodeData.type === 'http://purl.org/ontology/bibo/Journal') && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div className="form-group">
                                  <label style={{ fontSize: '0.72rem' }}>Ranking</label>
                                  <select
                                    value={editingCatalogNode?.rank || ''}
                                    onChange={(e) => editingCatalogNode && setEditingCatalogNode({ ...editingCatalogNode, rank: e.target.value })}
                                    style={{ fontSize: '0.78rem', padding: '4px 8px' }}
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
                                  <label style={{ fontSize: '0.72rem' }}>Mes de Deadline</label>
                                  <input
                                    type="text"
                                    value={editingCatalogNode?.deadlineMonth || ''}
                                    onChange={(e) => editingCatalogNode && setEditingCatalogNode({ ...editingCatalogNode, deadlineMonth: e.target.value })}
                                    placeholder="Ej: Marzo"
                                    style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                                  />
                                </div>
                              </div>
                            )}
                            <div className="form-group">
                              <label style={{ fontSize: '0.72rem' }}>URL Oficial</label>
                              <input
                                type="text"
                                value={editingCatalogNode?.externalUrl || ''}
                                onChange={(e) => editingCatalogNode && setEditingCatalogNode({ ...editingCatalogNode, externalUrl: e.target.value })}
                                placeholder="https://..."
                                style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                              />
                            </div>
                            <div className="form-group">
                              <label style={{ fontSize: '0.72rem' }}>Temáticas (CSO)</label>
                              <input
                                type="text"
                                value={editingCatalogNode?.subject || ''}
                                onChange={(e) => editingCatalogNode && setEditingCatalogNode({ ...editingCatalogNode, subject: e.target.value })}
                                placeholder="Semantic Web, Artificial Intelligence"
                                style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                              <button className="btn btn-sm" onClick={() => setEditingCatalogNode(null)} style={{ fontSize: '0.75rem' }}>Cancelar</button>
                              <button className="btn btn-sm btn-primary" onClick={saveEditedCatalogNode} style={{ fontSize: '0.75rem' }}>💾 Guardar en GraphDB</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* TAB 2: Crear Nuevo Nodo en la Base del Sistema */}
            {nodeModeTab === 'new' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label>Etiqueta / Nombre</label>
                  <input type="text" placeholder="Ej: IEEE ISWC 2026 o Journal of Web Semantics" value={newNodeData.label} onChange={(e) => setNewNodeData({ ...newNodeData, label: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Sufijo de URI</label>
                  <input type="text" placeholder="Ej: ISWC2026 o JWS" value={newNodeData.uriSuffix} onChange={(e) => setNewNodeData({ ...newNodeData, uriSuffix: e.target.value.replace(/\s+/g, '') })} />
                </div>

                {/* Campos específicos de Foto de Perfil para Personas */}
                {(newNodeData.type === 'http://vivoweb.org/ontology/core#FacultyMember' ||
                  newNodeData.type === 'http://vivoweb.org/ontology/core#GraduateStudent' ||
                  newNodeData.type === 'http://vivoweb.org/ontology/core#UndergraduateStudent') && (
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>📷 Foto de Perfil (solo URL externa)</label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setPhotoSourceMode('url')}
                        style={{
                          fontSize: '0.72rem', padding: '4px 8px',
                          background: photoSourceMode === 'url' ? 'var(--color-investigador)' : 'var(--bg-mantle)',
                          color: photoSourceMode === 'url' ? '#fff' : 'var(--text-main)'
                        }}
                      >
                        🌐 URL Web
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setPhotoSourceMode('google');
                          if (user?.photoURL) {
                            setNewNodeData(prev => ({ ...prev, photoUrl: user.photoURL! }));
                          }
                        }}
                        style={{
                          fontSize: '0.72rem', padding: '4px 8px',
                          background: photoSourceMode === 'google' ? 'var(--color-investigador)' : 'var(--bg-mantle)',
                          color: photoSourceMode === 'google' ? '#fff' : 'var(--text-main)'
                        }}
                      >
                        🔵 Cuenta Google
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setPhotoSourceMode('lifia');
                          fetchLifiaMembers();
                        }}
                        style={{
                          fontSize: '0.72rem', padding: '4px 8px',
                          background: photoSourceMode === 'lifia' ? 'var(--color-investigador)' : 'var(--bg-mantle)',
                          color: photoSourceMode === 'lifia' ? '#fff' : 'var(--text-main)'
                        }}
                      >
                        🏛️ Memorias@LIFIA
                      </button>
                    </div>

                    {photoSourceMode === 'lifia' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder="Buscar integrante en memorias.lifia.info.unlp.edu.ar/members..."
                          value={lifiaSearchQuery}
                          onChange={(e) => setLifiaSearchQuery(e.target.value)}
                          style={{ fontSize: '0.76rem', padding: '5px 8px' }}
                        />
                        {isLoadingLifiaMembers ? (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>⏳ Cargando miembros de Memorias@LIFIA...</span>
                        ) : (
                          <div style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {lifiaMembers
                              .filter(m => !lifiaSearchQuery.trim() || m.name.toLowerCase().includes(lifiaSearchQuery.toLowerCase().trim()))
                              .map(m => (
                                <div
                                  key={m.slug}
                                  onClick={() => {
                                    const autoSuffix = m.slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
                                    setNewNodeData(prev => ({
                                      ...prev,
                                      label: prev.label || m.name,
                                      uriSuffix: prev.uriSuffix || autoSuffix,
                                      photoUrl: m.photoUrl,
                                      externalUrl: prev.externalUrl || m.profileUrl
                                    }));
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px',
                                    borderRadius: '6px', cursor: 'pointer', background: 'var(--bg-mantle)'
                                  }}
                                >
                                  <img src={m.photoUrl} alt={m.name} referrerPolicy="no-referrer" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                                  <span style={{ fontSize: '0.76rem', flex: 1 }}>{m.name}</span>
                                  <span style={{ fontSize: '0.66rem', color: '#1e66f5', fontWeight: 600 }}>Elegir</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {newNodeData.photoUrl && (
                        <img
                          src={newNodeData.photoUrl}
                          alt="Preview"
                          referrerPolicy="no-referrer"
                          style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        />
                      )}
                      <input
                        type="url"
                        placeholder="https://... (URL de foto web, Google o Memorias@LIFIA)"
                        value={newNodeData.photoUrl || ''}
                        onChange={(e) => setNewNodeData({ ...newNodeData, photoUrl: e.target.value })}
                        style={{ flex: 1, fontSize: '0.78rem', padding: '6px 10px' }}
                      />
                    </div>
                  </div>
                )}

                {/* Campos específicos para Conferencia y Revista */}
                {(newNodeData.type === 'http://purl.org/ontology/bibo/Conference' || newNodeData.type === 'http://purl.org/ontology/bibo/Journal') && (
                  <>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>
                          {newNodeData.type === 'http://purl.org/ontology/bibo/Conference' ? '🏆 Ranking CORE' : '🏆 Cuartil'}
                        </label>
                        {newNodeData.type === 'http://purl.org/ontology/bibo/Conference' ? (
                          <select value={newNodeData.rank} onChange={(e) => setNewNodeData({ ...newNodeData, rank: e.target.value })}>
                            <option value="CORE A*">CORE A*</option>
                            <option value="CORE A">CORE A</option>
                            <option value="CORE B">CORE B</option>
                            <option value="CORE C">CORE C</option>
                            <option value="Unranked">Sin Rank (Unranked)</option>
                          </select>
                        ) : (
                          <select value={newNodeData.rank} onChange={(e) => setNewNodeData({ ...newNodeData, rank: e.target.value })}>
                            <option value="Q1">Q1</option>
                            <option value="Q2">Q2</option>
                            <option value="Q3">Q3</option>
                            <option value="Q4">Q4</option>
                            <option value="Sin Cuartil">Sin Cuartil</option>
                          </select>
                        )}
                      </div>

                      <div className="form-group" style={{ flex: 1 }}>
                        <label>📅 Mes Deadline</label>
                        <select value={newNodeData.deadlineMonth} onChange={(e) => setNewNodeData({ ...newNodeData, deadlineMonth: e.target.value })}>
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
                      <label>🔗 URL Externa / Sitio Web</label>
                      <input type="text" placeholder="Ej: https://iswc2026.semanticweb.org" value={newNodeData.externalUrl} onChange={(e) => setNewNodeData({ ...newNodeData, externalUrl: e.target.value })} />
                    </div>

                    <div className="form-group" style={{ position: 'relative' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>🏷️ Temáticas CSO (cso:Topic)</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Computer Science Ontology</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Escriba para autocompletar tópicos CSO (ej: semantic, machine, data)..."
                        value={csoSearchQuery}
                        onFocus={() => {
                          if (csoSearchQuery.trim().length >= 1) fetchCSOTopics(csoSearchQuery);
                          else fetchCSOTopics('a'); // Default suggestions
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCsoSearchQuery(val);
                          fetchCSOTopics(val);
                        }}
                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', fontSize: '0.82rem' }}
                      />

                      {isFetchingCSO && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>⏳ Buscando en la ontología CSO...</div>
                      )}

                      {/* Dropdown sugerencias CSO */}
                      {csoTopicsList.length > 0 && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, width: '100%',
                          maxHeight: '160px', overflowY: 'auto', background: 'var(--bg-mantle)',
                          border: '1px solid var(--border-color)', borderRadius: '8px',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 600, marginTop: '4px',
                          display: 'flex', flexDirection: 'column'
                        }}>
                          {csoTopicsList.map(topic => (
                            <div
                              key={topic.uri}
                              onClick={() => {
                                // Add topic tag if not already in subject
                                const currentSubjects = newNodeData.subject ? newNodeData.subject.split(',').map(s => s.trim()).filter(Boolean) : [];
                                if (!currentSubjects.includes(topic.label)) {
                                  const updated = [...currentSubjects, topic.label].join(', ');
                                  setNewNodeData({ ...newNodeData, subject: updated });
                                }
                                setCsoSearchQuery('');
                                setCsoTopicsList([]);
                              }}
                              style={{
                                padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem',
                                borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.15s',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{topic.label}</span>
                              <span style={{ fontSize: '0.65rem', color: '#1a2b48', background: 'rgba(26,43,72,0.1)', padding: '1px 6px', borderRadius: '4px' }}>➕ Añadir</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Chips / Tópicos CSO Seleccionados */}
                      {newNodeData.subject && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                          {newNodeData.subject.split(',').map(s => s.trim()).filter(Boolean).map(tag => (
                            <span
                              key={tag}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                background: 'rgba(163,217,201,0.25)', color: '#1B5346',
                                border: '1px solid rgba(45,138,117,0.3)', padding: '2px 8px',
                                borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600
                              }}
                            >
                              🏷️ {tag}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = newNodeData.subject.split(',').map(s => s.trim()).filter(t => t !== tag).join(', ');
                                  setNewNodeData({ ...newNodeData, subject: updated });
                                }}
                                style={{ background: 'none', border: 'none', color: '#1B5346', cursor: 'pointer', padding: 0, fontSize: '0.7rem', lineHeight: 1 }}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="flex-row flex-space" style={{ marginTop: '6px' }}>
                  <button className="btn" onClick={() => setShowNewNodeModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={createNode}>Crear y Registrar Nodo</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Selector de relación (quick-connect) con búsqueda interactiva */}
      {showRelationModal && quickConnectSourceUri && pendingConnectionTarget && (() => {
        const sourceNode = nodes.find(n => n.uri === quickConnectSourceUri);
        const availableTargetNodes = nodes.filter(n => n.uri !== quickConnectSourceUri);
        const selectedTargetNode = nodes.find(n => n.uri === pendingConnectionTarget);

        const filteredTargetNodes = availableTargetNodes.filter(n => {
          const q = relationTargetSearch.toLowerCase().trim();
          if (!q) return true;
          const label = (n.label || '').toLowerCase();
          const typeStr = getCleanType(n.type, n.thesisType).toLowerCase();
          const uri = (n.uri || '').toLowerCase();
          return label.includes(q) || typeStr.includes(q) || uri.includes(q);
        });

        return (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: 600, backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              background: 'var(--bg-mantle)', padding: '26px', borderRadius: '18px',
              width: '480px', maxWidth: '94vw', display: 'flex', flexDirection: 'column', gap: '18px',
              border: '1px solid var(--border-color)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
              maxHeight: '92vh',
              overflowY: 'visible',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>🔗 Elegir Relación</h2>
                  {isDev && <span className="dev-tag-badge">#modalElegirRelacion</span>}
                </div>
                <button className="btn" onClick={closeRelationModal} title="Cerrar ventana">✕</button>
              </div>

              {/* Resumen Origen & Selector Destino con Búsqueda */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '12px',
                background: 'rgba(0,0,0,0.04)', padding: '14px 16px', borderRadius: '12px',
                fontSize: '0.82rem', border: '1px solid var(--border-color)'
              }}>
                {/* Origen */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>Origen:</span>
                  <span style={{ fontSize: '0.95rem' }}>{getNodeTypeIcon(sourceNode?.type)}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                    {sourceNode?.label || '…'}
                  </span>
                  {sourceNode && (
                    <span style={{
                      fontSize: '0.68rem',
                      background: 'rgba(0,0,0,0.06)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      color: 'var(--text-muted)'
                    }}>
                      {getCleanType(sourceNode.type, sourceNode.thesisType)}
                    </span>
                  )}
                </div>

                {/* Destino con Búsqueda interactiva */}
                <div className="searchable-target-node-container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>
                      Destino (nodo con el que conectar):
                    </label>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {availableTargetNodes.length} {availableTargetNodes.length === 1 ? 'nodo' : 'nodos'}
                    </span>
                  </div>

                  {/* Botón trigger para expandir opciones */}
                  <button
                    type="button"
                    id="btnSelectPendingConnectionTarget"
                    aria-label="Destino"
                    onClick={() => {
                      setIsRelationTargetOpen(!isRelationTargetOpen);
                      setIsRelationPredicateOpen(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `1.5px solid ${isRelationTargetOpen ? 'var(--color-proyecto, #C17F59)' : 'var(--border-color)'}`,
                      background: 'var(--bg-surface)',
                      color: 'var(--text-main)',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      textAlign: 'left',
                      boxShadow: isRelationTargetOpen ? '0 0 0 2px rgba(193,127,89,0.2)' : 'none',
                      transition: 'all 0.2s ease',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      {selectedTargetNode ? (
                        <>
                          <span style={{ fontSize: '0.95rem' }}>{getNodeTypeIcon(selectedTargetNode.type)}</span>
                          <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedTargetNode.label}
                          </span>
                          <span style={{
                            fontSize: '0.68rem',
                            background: 'rgba(0,0,0,0.06)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            color: 'var(--text-muted)',
                            flexShrink: 0
                          }}>
                            {getCleanType(selectedTargetNode.type, selectedTargetNode.thesisType)}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Seleccionar nodo destino…</span>
                      )}
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '6px', flexShrink: 0 }}>
                      {isRelationTargetOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {/* Select nativo accesible sincronizado */}
                  <select
                    value={pendingConnectionTarget || ''}
                    onChange={(e) => setPendingConnectionTarget(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, width: 0 }}
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    {availableTargetNodes.map(n => (
                      <option key={n.uri} value={n.uri}>
                        {n.label} ({getCleanType(n.type, n.thesisType)})
                      </option>
                    ))}
                  </select>

                  {/* Menú desplegable con barra de búsqueda para filtrar nodos */}
                  {isRelationTargetOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      background: 'var(--bg-mantle, #ffffff)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
                      zIndex: 700,
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      {/* Input de búsqueda interactiva */}
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          id="inputSearchTargetNode"
                          autoFocus
                          placeholder="🔍 Buscar por nombre o tipo de nodo..."
                          value={relationTargetSearch}
                          onChange={(e) => setRelationTargetSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '100%',
                            padding: '7px 28px 7px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-main)',
                            fontSize: '0.8rem',
                            boxSizing: 'border-box',
                            outline: 'none'
                          }}
                        />
                        {relationTargetSearch && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRelationTargetSearch('');
                            }}
                            style={{
                              position: 'absolute',
                              right: '6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              fontSize: '0.75rem',
                              padding: '2px 4px'
                            }}
                            title="Limpiar búsqueda"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Lista scrollable de nodos filtrados */}
                      <div style={{
                        maxHeight: '180px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px'
                      }}>
                        {filteredTargetNodes.length === 0 ? (
                          <div style={{
                            padding: '14px 8px',
                            textAlign: 'center',
                            fontSize: '0.78rem',
                            color: 'var(--text-muted)'
                          }}>
                            No se encontraron nodos coincidentes con "{relationTargetSearch}"
                          </div>
                        ) : (
                          filteredTargetNodes.map(n => {
                            const isSelected = n.uri === pendingConnectionTarget;
                            return (
                              <div
                                key={n.uri}
                                className="searchable-node-option"
                                onClick={() => {
                                  setPendingConnectionTarget(n.uri);
                                  setIsRelationTargetOpen(false);
                                  setRelationTargetSearch('');
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '7px 10px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  background: isSelected ? 'rgba(193,127,89,0.14)' : 'transparent',
                                  color: 'var(--text-main)',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                  <span style={{ fontSize: '0.95rem' }}>{getNodeTypeIcon(n.type)}</span>
                                  <span style={{ fontWeight: isSelected ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {n.label}
                                  </span>
                                  <span style={{
                                    fontSize: '0.68rem',
                                    background: 'rgba(0,0,0,0.06)',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    color: 'var(--text-muted)',
                                    flexShrink: 0
                                  }}>
                                    {getCleanType(n.type, n.thesisType)}
                                  </span>
                                </div>
                                {isSelected && (
                                  <span style={{ color: 'var(--color-proyecto, #C17F59)', fontWeight: 700, marginLeft: '6px' }}>✓</span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Pie del menú con contadores */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        borderTop: '1px solid var(--border-color)',
                        paddingTop: '6px',
                        marginTop: '2px'
                      }}>
                        <span>Mostrando {filteredTargetNodes.length} de {availableTargetNodes.length} nodos</span>
                        {relationTargetSearch && (
                          <span 
                            onClick={() => setRelationTargetSearch('')}
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Limpiar filtro
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Selector de Tipo de Relación Semántica con Búsqueda */}
              <div className="searchable-relation-predicate-container form-group" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.82rem' }}>Tipo de relación semántica</label>
                </div>

                {/* Botón trigger para expandir opciones de predicados */}
                <button
                  type="button"
                  id="btnSelectRelationPredicate"
                  onClick={() => {
                    setIsRelationPredicateOpen(!isRelationPredicateOpen);
                    setIsRelationTargetOpen(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1.5px solid ${isRelationPredicateOpen ? 'var(--color-proyecto, #C17F59)' : 'var(--border-color)'}`,
                    background: 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: isRelationPredicateOpen ? '0 0 0 2px rgba(193,127,89,0.2)' : 'none',
                    transition: 'all 0.2s ease',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-proyecto, #C17F59)' }}>
                      {getPredicateDetails(selectedRelationPredicate).label}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      — {getPredicateDetails(selectedRelationPredicate).desc}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '6px', flexShrink: 0 }}>
                    {isRelationPredicateOpen ? '▲' : '▼'}
                  </span>
                </button>

                {/* Select nativo accesible sincronizado */}
                <select
                  value={selectedRelationPredicate}
                  onChange={(e) => setSelectedRelationPredicate(e.target.value)}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, width: 0 }}
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {RELATION_CATEGORIES.map(cat => (
                    <optgroup key={cat.category} label={cat.category}>
                      {cat.options.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} — {opt.desc}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {/* Menú desplegable con barra de búsqueda para filtrar relaciones */}
                {isRelationPredicateOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    background: 'var(--bg-mantle, #ffffff)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
                    zIndex: 700,
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {/* Input de búsqueda interactiva de relaciones */}
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        id="inputSearchRelationPredicate"
                        autoFocus
                        placeholder="🔍 Buscar relación (ej: advisor, venue, autor, mindmap)..."
                        value={relationPredicateSearch}
                        onChange={(e) => setRelationPredicateSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '7px 28px 7px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-surface)',
                          color: 'var(--text-main)',
                          fontSize: '0.8rem',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                      {relationPredicateSearch && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRelationPredicateSearch('');
                          }}
                          style={{
                            position: 'absolute',
                            right: '6px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            fontSize: '0.75rem',
                            padding: '2px 4px'
                          }}
                          title="Limpiar búsqueda"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Lista scrollable de relaciones agrupadas por categoría */}
                    <div style={{
                      maxHeight: '210px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      {(() => {
                        const q = relationPredicateSearch.toLowerCase().trim();
                        let matchCount = 0;
                        const renderedCategories = RELATION_CATEGORIES.map(cat => {
                          const matchingOpts = cat.options.filter(opt => {
                            if (!q) return true;
                            return opt.label.toLowerCase().includes(q) || 
                                   opt.desc.toLowerCase().includes(q) || 
                                   opt.value.toLowerCase().includes(q) ||
                                   cat.category.toLowerCase().includes(q);
                          });
                          if (matchingOpts.length === 0) return null;
                          matchCount += matchingOpts.length;

                          return (
                            <div key={cat.category} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                color: 'var(--text-muted)',
                                padding: '4px 6px 2px 6px'
                              }}>
                                {cat.category}
                              </span>
                              {matchingOpts.map(opt => {
                                const isSelected = opt.value === selectedRelationPredicate;
                                return (
                                  <div
                                    key={opt.value}
                                    className="searchable-predicate-option"
                                    onClick={() => {
                                      setSelectedRelationPredicate(opt.value);
                                      setIsRelationPredicateOpen(false);
                                      setRelationPredicateSearch('');
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '0.8rem',
                                      background: isSelected ? 'rgba(193,127,89,0.14)' : 'transparent',
                                      color: 'var(--text-main)',
                                      transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                      <span style={{ fontWeight: 600, color: 'var(--color-proyecto, #C17F59)' }}>
                                        {opt.label}
                                      </span>
                                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        {opt.desc}
                                      </span>
                                    </div>
                                    {isSelected && (
                                      <span style={{ color: 'var(--color-proyecto, #C17F59)', fontWeight: 700, marginLeft: '6px' }}>✓</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        });

                        if (matchCount === 0) {
                          return (
                            <div style={{
                              padding: '14px 8px',
                              textAlign: 'center',
                              fontSize: '0.78rem',
                              color: 'var(--text-muted)'
                            }}>
                              No se encontraron relaciones coincidentes con "{relationPredicateSearch}"
                            </div>
                          );
                        }

                        return renderedCategories;
                      })()}
                    </div>

                    {relationPredicateSearch && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        borderTop: '1px solid var(--border-color)',
                        paddingTop: '6px'
                      }}>
                        <span 
                          onClick={() => setRelationPredicateSearch('')}
                          style={{ cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Limpiar filtro
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button className="btn" onClick={closeRelationModal}>Omitir relación</button>
                <button className="btn btn-primary" onClick={createRelation}>
                  Conectar Nodos
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

              {/* Selector de Motor de Inferencia en GraphDB (RDFS-Plus vs OWL-DL) */}
              <div style={{
                marginTop: '6px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="graphdb-ruleset-select" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    ⚙️ Motor de Inferencia en GraphDB (Ruleset):
                  </label>
                  <span style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontWeight: 600,
                    background: inferenceRuleset === 'owl-max-optimized' ? 'rgba(114, 135, 253, 0.15)' : 'rgba(22, 163, 74, 0.12)',
                    color: inferenceRuleset === 'owl-max-optimized' ? 'var(--accent)' : '#15803d'
                  }}>
                    {inferenceRuleset === 'owl-max-optimized' ? 'OWL-DL Activo' : 'RDFS-Plus Activo'}
                  </span>
                </div>

                <select
                  id="graphdb-ruleset-select"
                  className="input-field"
                  value={inferenceRuleset}
                  disabled={isSwitchingRuleset}
                  onChange={(e) => changeInferenceRuleset(e.target.value as 'rdfsplus-optimized' | 'owl-max-optimized')}
                  style={{ width: '100%', fontSize: '0.82rem', cursor: isSwitchingRuleset ? 'wait' : 'pointer' }}
                >
                  <option value="rdfsplus-optimized">RDFS-Plus (Optimized) — Motor por defecto</option>
                  <option value="owl-max-optimized">OWL-DL / OWL-Max (Optimized) — Razonador OWL-DL</option>
                </select>

                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                  {inferenceRuleset === 'owl-max-optimized'
                    ? '🦉 OWL-DL (owl-max-optimized): Habilita razonamiento expresivo OWL-DL (clases equivalentes, restricciones de propiedad, simetría, transitividad e inversas completas).'
                    : '📐 RDFS-Plus (rdfsplus-optimized): Motor ligero por defecto con soporte para jerarquías RDFS, owl:inverseOf, owl:SymmetricProperty y owl:TransitiveProperty.'}
                </div>

                {isSwitchingRuleset && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                    ⏳ Cambiando motor de inferencia y re-infiriendo tripletas en GraphDB...
                  </div>
                )}

                {rulesetStatusMsg && !isSwitchingRuleset && (
                  <div style={{
                    fontSize: '0.73rem',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: rulesetStatusMsg.startsWith('❌') ? 'rgba(210, 15, 57, 0.1)' : 'rgba(22, 163, 74, 0.1)',
                    color: rulesetStatusMsg.startsWith('❌') ? '#d20f39' : '#15803d',
                    fontWeight: 500
                  }}>
                    {rulesetStatusMsg}
                  </div>
                )}
              </div>
            </div>

            {associatedResearcher ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'rgba(76, 79, 105, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-investigador)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-investigador)', fontWeight: 600, marginBottom: '6px' }}>ESTADO DE VINCULACIÓN</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      ✅ Vinculado a: <strong>{nodes.find(n => n.uri === associatedResearcher)?.label || catalogResearchers.find(r => r.uri === associatedResearcher)?.label || getCleanLabel(associatedResearcher)}</strong>
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
                      {(() => {
                        const map = new Map<string, string>();
                        nodes
                          .filter(n => n.type.includes('FacultyMember'))
                          .forEach(n => map.set(n.uri, n.label));
                        catalogResearchers.forEach(r => {
                          if (!map.has(r.uri)) map.set(r.uri, r.label);
                        });
                        return Array.from(map.entries())
                          .sort((a, b) => a[1].localeCompare(b[1], 'es'))
                          .map(([uri, label]) => (
                            <option key={uri} value={uri}>{label}</option>
                          ));
                      })()}
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
            {(() => {
              const isShareableNode = (
                nodeToDelete.type.includes('Conference') ||
                nodeToDelete.type.includes('Journal') ||
                nodeToDelete.type.includes('Topic') ||
                nodeToDelete.type.includes('Dataset') ||
                nodeToDelete.type.includes('MediaObject')
              );

              if (isShareableNode && !isSuperAdmin) {
                return (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                    ℹ️ Como usuario regular, este nodo <strong>se quitará únicamente de tu lienzo personal</strong>. La conferencia/revista seguirá guardada en el banco general del sistema para que otros investigadores puedan seguir utilizándola.
                  </p>
                );
              } else {
                return (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Esta acción eliminará el nodo y todas sus conexiones asociadas del Triplestore de forma permanente para todo el sistema. Esta acción no se puede deshacer.
                  </p>
                );
              }
            })()}
            <div className="flex-row flex-space" style={{ marginTop: '10px' }}>
              <button className="btn" onClick={() => setNodeToDelete(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-proyecto)', color: '#fff' }} onClick={deleteNode}>Aceptar</button>
            </div>
          </div>
        </div>
      )}

      {/* Semantic Sidebar */}
      <div 
        id="sidebarSemantic" 
        className={activeRightPanel === 'sparql' ? '' : 'collapsed'}
        style={{
          width: `${sidebarWidth}px`,
          maxWidth: '96vw',
          transition: isResizingSidebar ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div
          className={`sidebar-resize-handle ${isResizingSidebar ? 'active' : ''}`}
          onMouseDown={handleStartResize}
          title="Arrastrar para ajustar ancho de la barra"
        />
        {isDev && <span className="dev-tag-badge">#sidebarSemantic</span>}
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#000000' }}>Consola SPARQL</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({sidebarWidth}px)</span>
          </div>
          <button className="btn btn-sm" onClick={() => setActiveRightPanel('none')}>
            Ocultar
          </button>
        </div>
        <div className="sidebar-content">
          <div className="sparql-console">
            <textarea 
              className="sparql-input"
              value={sparqlQuery}
              onChange={(e) => setSparqlQuery(e.target.value)}
              placeholder="Escribe tu consulta SPARQL aquí..."
              spellCheck={false}
            />
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '6px' }} 
              onClick={runCustomSPARQL}
              disabled={sparqlLoading}
            >
              {sparqlLoading ? 'Ejecutando consulta...' : 'Ejecutar Consulta'}
            </button>
          </div>

          <div className="sparql-results-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', color: '#000000', fontWeight: 700 }}>RESULTADO</label>

              {/* Selector de formatos amigables con SPARQL */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button 
                  className={`btn btn-sm ${sparqlResultFormat === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSparqlResultFormat('table')}
                  style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                  title="Vista en tabla SPARQL interactiva"
                >
                  📊 Tabla
                </button>
                <button 
                  className={`btn btn-sm ${sparqlResultFormat === 'json' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSparqlResultFormat('json')}
                  style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                  title="Formato SPARQL JSON estándar"
                >
                  📄 JSON
                </button>
                <button 
                  className={`btn btn-sm ${sparqlResultFormat === 'csv' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSparqlResultFormat('csv')}
                  style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                  title="Valores separados por comas (CSV)"
                >
                  📑 CSV
                </button>
                <button 
                  className={`btn btn-sm ${sparqlResultFormat === 'tsv' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSparqlResultFormat('tsv')}
                  style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                  title="Formato W3C SPARQL TSV (Tab-separated)"
                >
                  📝 TSV
                </button>
                {(sparqlRawData || sparqlResult) && (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={copySparqlResult}
                    style={{ fontSize: '0.7rem', padding: '3px 7px', marginLeft: '4px' }}
                    title="Copiar resultado al portapapeles"
                  >
                    {copiedFormat ? '✓ ¡Copiado!' : '📋 Copiar'}
                  </button>
                )}
              </div>
            </div>

            {/* Salida de resultados */}
            {sparqlError ? (
              <div style={{
                padding: '12px', background: '#fee2e2', border: '1px solid #f87171',
                borderRadius: '8px', color: '#000000', fontSize: '0.8rem'
              }}>
                <div style={{ fontWeight: 'bold', color: '#dc2626', marginBottom: '4px' }}>Error en la ejecución SPARQL:</div>
                <div style={{ color: '#000000', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{sparqlError}</div>
              </div>
            ) : !sparqlRawData && !sparqlResult ? (
              <div style={{
                padding: '16px', background: '#ffffff', border: '1px solid #cbd5e1',
                borderRadius: '8px', color: '#000000', fontSize: '0.78rem'
              }}>
                No se han ejecutado consultas aún. Haz clic en "Ejecutar Consulta" para ver los resultados.
              </div>
            ) : sparqlResultFormat === 'table' && sparqlRawData?.results?.bindings ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ fontSize: '0.72rem', color: '#000000', fontWeight: 600, marginBottom: '4px' }}>
                  {sparqlRawData.results.bindings.length} {sparqlRawData.results.bindings.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                </div>
                {sparqlRawData.results.bindings.length === 0 ? (
                  <div style={{ padding: '16px', color: '#000000', background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}>
                    No se encontraron resultados (0 filas).
                  </div>
                ) : (
                  <div className="sparql-table-wrapper">
                    <table className="sparql-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                          {(sparqlRawData.head?.vars || Object.keys(sparqlRawData.results.bindings[0] || {})).map((v: string) => (
                            <th key={v}>?{v}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sparqlRawData.results.bindings.map((binding: any, idx: number) => {
                          const vars: string[] = sparqlRawData.head?.vars || Object.keys(sparqlRawData.results.bindings[0] || {});
                          return (
                            <tr key={idx}>
                              <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.7rem' }}>{idx + 1}</td>
                              {vars.map((v: string) => (
                                <td key={v}>
                                  {renderTableCell(binding[v])}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : sparqlResultFormat === 'table' && sparqlRawData?.boolean !== undefined ? (
              <div style={{
                padding: '16px', background: '#ffffff', border: '1px solid #cbd5e1',
                borderRadius: '8px', color: '#000000', fontSize: '0.85rem'
              }}>
                <strong>Resultado consulta ASK: </strong>
                <span style={{ color: sparqlRawData.boolean ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                  {sparqlRawData.boolean ? 'VERDADERO (true)' : 'FALSO (false)'}
                </span>
              </div>
            ) : sparqlResultFormat === 'table' && sparqlRawData?.success !== undefined ? (
              <div style={{
                padding: '16px', background: '#ffffff', border: '1px solid #cbd5e1',
                borderRadius: '8px', color: '#000000', fontSize: '0.82rem'
              }}>
                <div style={{ color: '#16a34a', fontWeight: 'bold' }}>✓ Actualización SPARQL completada</div>
                <div style={{ color: '#000000', marginTop: '4px' }}>{sparqlRawData.message || 'Operación exitosa.'}</div>
              </div>
            ) : sparqlResultFormat === 'csv' ? (
              <pre className="sparql-pre-output">
                {convertSparqlToCSV(sparqlRawData)}
              </pre>
            ) : sparqlResultFormat === 'tsv' ? (
              <pre className="sparql-pre-output">
                {convertSparqlToTSV(sparqlRawData)}
              </pre>
            ) : (
              <pre className="sparql-pre-output">
                {sparqlRawData ? JSON.stringify(sparqlRawData, null, 2) : sparqlResult}
              </pre>
            )}
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

      {/* Meeting Bitácora (Notes & Attendance) Modal on Canvas */}
      {activeMeetingLogNode && (
        <div
          style={{
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
          }}
          onClick={() => setActiveMeetingLogNode(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
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
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>
                  📋 Bitácora de Encuentros: {activeMeetingLogNode.label}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Visualizá y registrá las notas tomadas en la reunión y la asistencia de cada sesión.
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setActiveMeetingLogNode(null)}>✕</button>
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
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>➕ Registrar Nuevo Encuentro</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Fecha del Encuentro</label>
                  <input
                    type="date"
                    value={newMeetingSessionForm.date}
                    onChange={(e) => setNewMeetingSessionForm({ ...newMeetingSessionForm, date: e.target.value })}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px', color: 'var(--text-muted)' }}>
                    Asistentes presentes
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {meetingLogParticipants.length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Sin participantes vinculados aún.
                      </span>
                    ) : (
                      meetingLogParticipants.map(pUri => {
                        const attended = newMeetingSessionForm.attendees.includes(pUri);
                        const personLabel = nodes.find(n => n.uri === pUri)?.label || getCleanLabel(pUri);
                        return (
                          <button
                            key={pUri}
                            type="button"
                            onClick={() => toggleMeetingLogAttendee(pUri)}
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
                            {attended ? '✓ ' : ''}{personLabel}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem' }}>Acuerdos / Avances / Minuta del Encuentro</label>
                <textarea
                  rows={3}
                  placeholder="Ej: Se revisó el capítulo 2 del estado del arte. Próxima entrega: experimento inicial."
                  value={newMeetingSessionForm.notes}
                  onChange={(e) => setNewMeetingSessionForm({ ...newMeetingSessionForm, notes: e.target.value })}
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
                <button className="btn btn-sm btn-primary" onClick={handleAddMeetingLogSession}>
                  💾 Guardar Encuentro en Bitácora
                </button>
              </div>
            </div>

            {/* Sessions List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Historial de Sesiones ({meetingLogSessions.length})
              </div>
              {isLoadingMeetingLog ? (
                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', padding: '12px 0' }}>
                  ⏳ Cargando notas y asistencia...
                </div>
              ) : meetingLogSessions.length === 0 ? (
                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                  Todavía no hay encuentros registrados para esta reunión.
                </div>
              ) : (
                meetingLogSessions.map(sess => (
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-investigador)' }}>
                        🗓️ {sess.date}
                      </span>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {sess.attendees.map(aUri => {
                          const personLabel = nodes.find(n => n.uri === aUri)?.label || getCleanLabel(aUri);
                          return (
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
                              ✓ {personLabel}
                            </span>
                          );
                        })}
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
