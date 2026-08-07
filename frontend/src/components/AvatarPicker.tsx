import React, { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import { AVATAR_PRESETS } from './avatarPresets';

interface AvatarPickerProps {
  currentSeed: string;        // The URI-based seed currently in use
  selectedPreset: string | null; // Currently selected preset seed (null = use URI)
  onSelect: (presetSeed: string | null) => void;
  chipColor?: string;
}

function PresetTile({
  seed,
  label,
  isSelected,
  onClick,
  chipColor,
}: {
  seed: string;
  label: string;
  isSelected: boolean;
  onClick: () => void;
  chipColor: string;
}) {
  const svgString = useMemo(() => {
    try {
      return createAvatar(avataaars, {
        seed,
        backgroundColor: ['b6e3f4', 'c0aede', 'ffdfbf', 'ffd5dc', 'd1f0c2'],
        style: ['circle'],
      }).toString();
    } catch {
      return null;
    }
  }, [seed]);

  return (
    <button
      title={label}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        padding: '5px',
        borderRadius: '10px',
        border: isSelected ? `2.5px solid ${chipColor}` : '1.5px solid var(--border-color)',
        background: isSelected ? `${chipColor}15` : 'var(--bg-surface)',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          overflow: 'hidden',
          border: isSelected ? `2px solid ${chipColor}` : '2px solid transparent',
        }}
        dangerouslySetInnerHTML={{ __html: svgString || '<svg/>' }}
      />
      <span style={{
        fontSize: '0.52rem',
        color: isSelected ? chipColor : 'var(--text-muted)',
        maxWidth: 56,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: isSelected ? 700 : 400,
      }}>
        {label}
      </span>
    </button>
  );
}

export function AvatarPicker({ currentSeed, selectedPreset, onSelect, chipColor = '#6c6f85' }: AvatarPickerProps) {
  // "Auto" tile — renders the avatar derived from the node's own URI
  const autoSvg = useMemo(() => {
    try {
      return createAvatar(avataaars, {
        seed: currentSeed,
        backgroundColor: ['b6e3f4', 'c0aede', 'ffdfbf', 'ffd5dc', 'd1f0c2'],
        style: ['circle'],
      }).toString();
    } catch {
      return null;
    }
  }, [currentSeed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        Elegí un avatar — o usá el generado automáticamente a partir del nombre del nodo.
      </span>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(66px, 1fr))',
        gap: '6px',
        maxHeight: '240px',
        overflowY: 'auto',
        padding: '4px 2px',
      }}>
        {/* "Auto" tile */}
        <button
          title="Usar avatar automático del nodo"
          onClick={() => onSelect(null)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            padding: '5px',
            borderRadius: '10px',
            border: selectedPreset === null ? `2.5px solid ${chipColor}` : '1.5px solid var(--border-color)',
            background: selectedPreset === null ? `${chipColor}15` : 'var(--bg-surface)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              overflow: 'hidden',
              border: selectedPreset === null ? `2px solid ${chipColor}` : '2px solid transparent',
              opacity: 0.7,
            }}
            dangerouslySetInnerHTML={{ __html: autoSvg || '<svg/>' }}
          />
          <span style={{
            fontSize: '0.52rem',
            color: selectedPreset === null ? chipColor : 'var(--text-muted)',
            fontWeight: selectedPreset === null ? 700 : 400,
          }}>
            Auto ✦
          </span>
        </button>

        {/* Preset tiles */}
        {AVATAR_PRESETS.map(preset => (
          <PresetTile
            key={preset.seed}
            seed={preset.seed}
            label={preset.label}
            isSelected={selectedPreset === preset.seed}
            onClick={() => onSelect(preset.seed)}
            chipColor={chipColor}
          />
        ))}
      </div>
    </div>
  );
}
