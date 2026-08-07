import React, { useState, useMemo } from 'react';
import * as PhosphorIcons from '@phosphor-icons/react';
import { SYSTEM_ICONS, ICON_CATEGORIES } from './systemIcons';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

interface IconPickerProps {
  selectedIcon: string | null;
  onSelect: (iconName: string | null) => void;
  chipColor?: string;
}

/** Resolve a Phosphor icon component by name string */
function getPhosphorIcon(name: string): PhosphorIcon | null {
  const icon = (PhosphorIcons as Record<string, unknown>)[name];
  return icon ? (icon as PhosphorIcon) : null;
}

export function IconPicker({ selectedIcon, onSelect, chipColor = '#6c6f85' }: IconPickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Todos');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return SYSTEM_ICONS.filter(icon => {
      const matchesSearch = !q || icon.label.toLowerCase().includes(q) || icon.name.toLowerCase().includes(q);
      const matchesCat = activeCategory === 'Todos' || icon.category === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [search, activeCategory]);

  const categories = ['Todos', ...ICON_CATEGORIES];

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
            {cat}
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
        {/* "Sin ícono" tile — restores automatic avatar */}
        <button
          title="Automático (avatar generado)"
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
