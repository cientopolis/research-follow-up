import React, { useState, useMemo } from 'react';
import * as PhosphorIcons from '@phosphor-icons/react';
import { SYSTEM_ICONS, ICON_CATEGORIES } from './systemIcons';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

interface IconPickerProps {
  nodeType?: string; // e.g. 'nodeProyecto', 'nodePaper', 'nodeTesisDoctoral', etc.
  selectedIcon: string | null;
  onSelect: (iconName: string | null) => void;
  chipColor?: string;
}

/** Map node types to suggested category */
function getDefaultCategory(nodeType?: string): string {
  switch (nodeType) {
    case 'nodeProyecto':       return 'Proyectos';
    case 'nodePaper':          return 'Publicaciones';
    case 'nodeTesisDoctoral':
    case 'nodeTesisMaestria':  return 'Académico';
    case 'nodeTopicCSO':       return 'Tópicos';
    default:                   return 'Sugeridos';
  }
}

/** Map node types to specific recommended icon names */
function getSuggestedIconNames(nodeType?: string): string[] {
  switch (nodeType) {
    case 'nodeProyecto':
      return ['Briefcase', 'FolderOpen', 'Rocket', 'Target', 'Flag', 'Gear', 'Buildings', 'TreeStructure', 'Kanban', 'Graph'];
    case 'nodePaper':
      return ['FileText', 'Article', 'NewspaperClipping', 'FilePdf', 'Quotes', 'ReadCvLogo', 'BookOpen', 'Notebook', 'Scroll'];
    case 'nodeTesisDoctoral':
    case 'nodeTesisMaestria':
      return ['GraduationCap', 'Medal', 'Certificate', 'Scroll', 'Trophy', 'Books', 'BookBookmark', 'PenNib'];
    case 'nodeTopicCSO':
      return ['Tag', 'Hash', 'PuzzlePiece', 'LinkSimple', 'Intersect', 'Network', 'Hexagon', 'Diamond', 'Brain', 'Atom'];
    default:
      return ['Briefcase', 'FileText', 'GraduationCap', 'Tag', 'Brain', 'Rocket', 'FolderOpen', 'Atom'];
  }
}

/** Resolve a Phosphor icon component by name string */
function getPhosphorIcon(name: string): PhosphorIcon | null {
  const icon = (PhosphorIcons as Record<string, unknown>)[name];
  return icon ? (icon as PhosphorIcon) : null;
}

export function IconPicker({ nodeType, selectedIcon, onSelect, chipColor = '#6c6f85' }: IconPickerProps) {
  const [search, setSearch] = useState('');
  
  // Set default category according to nodeType, defaulting to 'Sugeridos'
  const initialCategory = useMemo(() => getDefaultCategory(nodeType), [nodeType]);
  const [activeCategory, setActiveCategory] = useState<string>(initialCategory);

  const suggestedNames = useMemo(() => getSuggestedIconNames(nodeType), [nodeType]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return SYSTEM_ICONS.filter(icon => {
      const matchesSearch = !q || icon.label.toLowerCase().includes(q) || icon.name.toLowerCase().includes(q);
      
      let matchesCat = false;
      if (activeCategory === 'Todos') {
        matchesCat = true;
      } else if (activeCategory === 'Sugeridos') {
        matchesCat = suggestedNames.includes(icon.name);
      } else {
        matchesCat = icon.category === activeCategory;
      }

      return matchesSearch && matchesCat;
    });
  }, [search, activeCategory, suggestedNames]);

  const categories = ['Sugeridos', 'Todos', ...ICON_CATEGORIES];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Search */}
      <input
        type="text"
        placeholder="Buscar ícono..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: '7px 10px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-surface)',
          color: 'var(--text-main)',
          fontSize: '0.82rem',
          boxSizing: 'border-box',
        }}
      />

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '3px 9px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: 600,
              background: activeCategory === cat ? chipColor : 'var(--bg-surface)',
              color: activeCategory === cat ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {cat === 'Sugeridos' ? '★ Sugeridos' : cat}
          </button>
        ))}
      </div>

      {/* Icon grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))',
          gap: '6px',
          maxHeight: '200px',
          overflowY: 'auto',
          padding: '4px 2px',
        }}
      >
        {/* "Sin ícono" tile — restores automatic default icon */}
        <button
          title="Automático (por defecto del tipo de nodo)"
          onClick={() => onSelect(null)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            padding: '6px 4px',
            borderRadius: '8px',
            border: selectedIcon === null ? `2px solid ${chipColor}` : '1.5px solid var(--border-color)',
            background: selectedIcon === null ? `${chipColor}18` : 'var(--bg-surface)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: '1.1rem', opacity: 0.5 }}>✦</span>
          <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', lineHeight: 1.2, textAlign: 'center' }}>Auto</span>
        </button>

        {filtered.map(icon => {
          const IconComp = getPhosphorIcon(icon.name);
          if (!IconComp) return null;
          const isSelected = selectedIcon === icon.name;
          return (
            <button
              key={icon.name}
              title={icon.label}
              onClick={() => onSelect(icon.name)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                padding: '6px 4px',
                borderRadius: '8px',
                border: isSelected ? `2px solid ${chipColor}` : '1.5px solid var(--border-color)',
                background: isSelected ? `${chipColor}18` : 'var(--bg-surface)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <IconComp
                size={20}
                weight={isSelected ? 'fill' : 'regular'}
                color={isSelected ? chipColor : 'var(--text-muted)'}
              />
              <span
                style={{
                  fontSize: '0.52rem',
                  color: isSelected ? chipColor : 'var(--text-muted)',
                  lineHeight: 1.2,
                  textAlign: 'center',
                  maxWidth: '48px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {icon.label}
              </span>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '20px',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
          }}>
            No se encontraron íconos para "{search}"
          </div>
        )}
      </div>
    </div>
  );
}
