/**
 * SYSTEM_ICONS — curated catalogue of Phosphor icons available for node customization.
 * Each entry: { name: string (Phosphor component name), label: string, category: string }
 */
export interface SystemIcon {
  name: string;
  label: string;
  category: string;
}

export const SYSTEM_ICONS: SystemIcon[] = [
  // ── Personas ────────────────────────────────────────────────────
  { name: 'UserCircle',         label: 'Usuario',             category: 'Personas' },
  { name: 'User',               label: 'Persona',             category: 'Personas' },
  { name: 'UserFocus',          label: 'Perfil',              category: 'Personas' },
  { name: 'Users',              label: 'Grupo',               category: 'Personas' },
  { name: 'Smiley',             label: 'Cara feliz',          category: 'Personas' },
  { name: 'PersonSimpleWalk',   label: 'Persona caminando',   category: 'Personas' },
  { name: 'Student',            label: 'Estudiante',          category: 'Personas' },
  { name: 'ChalkboardTeacher',  label: 'Docente',             category: 'Personas' },

  // ── Académico ────────────────────────────────────────────────────
  { name: 'GraduationCap',      label: 'Graduación',          category: 'Académico' },
  { name: 'Books',              label: 'Libros',              category: 'Académico' },
  { name: 'BookOpen',           label: 'Libro abierto',       category: 'Académico' },
  { name: 'BookBookmark',       label: 'Libro marcado',       category: 'Académico' },
  { name: 'Notebook',           label: 'Cuaderno',            category: 'Académico' },
  { name: 'PenNib',             label: 'Pluma',               category: 'Académico' },
  { name: 'Certificate',        label: 'Certificado',         category: 'Académico' },
  { name: 'Medal',              label: 'Medalla',             category: 'Académico' },
  { name: 'Scroll',             label: 'Pergamino',           category: 'Académico' },
  { name: 'Trophy',             label: 'Trofeo',              category: 'Académico' },

  // ── Investigación ────────────────────────────────────────────────
  { name: 'Brain',              label: 'Cerebro',             category: 'Investigación' },
  { name: 'Lightbulb',         label: 'Idea',                category: 'Investigación' },
  { name: 'Atom',              label: 'Átomo',               category: 'Investigación' },
  { name: 'Flask',             label: 'Frasco',              category: 'Investigación' },
  { name: 'TestTube',          label: 'Tubo de ensayo',      category: 'Investigación' },
  { name: 'Microscope',        label: 'Microscopio',         category: 'Investigación' },
  { name: 'Dna',               label: 'ADN',                 category: 'Investigación' },
  { name: 'ChartBar',          label: 'Gráfico de barras',   category: 'Investigación' },
  { name: 'ChartLine',         label: 'Gráfico de línea',    category: 'Investigación' },
  { name: 'MagnifyingGlass',   label: 'Lupa',                category: 'Investigación' },
  { name: 'Graph',             label: 'Grafo',               category: 'Investigación' },

  // ── Proyectos ─────────────────────────────────────────────────────
  { name: 'Briefcase',         label: 'Maletín',             category: 'Proyectos' },
  { name: 'FolderOpen',        label: 'Carpeta abierta',     category: 'Proyectos' },
  { name: 'Rocket',            label: 'Cohete',              category: 'Proyectos' },
  { name: 'Target',            label: 'Objetivo',            category: 'Proyectos' },
  { name: 'Flag',              label: 'Bandera',             category: 'Proyectos' },
  { name: 'Gear',              label: 'Engranaje',           category: 'Proyectos' },
  { name: 'Buildings',         label: 'Institución',         category: 'Proyectos' },
  { name: 'TreeStructure',     label: 'Estructura',          category: 'Proyectos' },

  // ── Publicaciones ─────────────────────────────────────────────────
  { name: 'FileText',          label: 'Documento',           category: 'Publicaciones' },
  { name: 'Article',           label: 'Artículo',            category: 'Publicaciones' },
  { name: 'NewspaperClipping', label: 'Recorte',             category: 'Publicaciones' },
  { name: 'FilePdf',           label: 'PDF',                 category: 'Publicaciones' },
  { name: 'PaperPlaneTilt',    label: 'Envío',               category: 'Publicaciones' },
  { name: 'Quotes',            label: 'Cita',                category: 'Publicaciones' },
  { name: 'ReadCvLogo',        label: 'CV',                  category: 'Publicaciones' },

  // ── Tópicos / Conceptos ───────────────────────────────────────────
  { name: 'Tag',               label: 'Etiqueta',            category: 'Tópicos' },
  { name: 'Hash',              label: 'Hash',                category: 'Tópicos' },
  { name: 'PuzzlePiece',       label: 'Pieza',               category: 'Tópicos' },
  { name: 'LinkSimple',        label: 'Enlace',              category: 'Tópicos' },
  { name: 'Intersect',         label: 'Intersección',        category: 'Tópicos' },
  { name: 'Network',           label: 'Red',                 category: 'Tópicos' },
  { name: 'Hexagon',           label: 'Hexágono',            category: 'Tópicos' },
  { name: 'Diamond',           label: 'Diamante',            category: 'Tópicos' },
  { name: 'Star',              label: 'Estrella',            category: 'Tópicos' },
  { name: 'Globe',             label: 'Globo',               category: 'Tópicos' },
];

export const ICON_CATEGORIES = [...new Set(SYSTEM_ICONS.map(i => i.category))];
