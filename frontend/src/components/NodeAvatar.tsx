import React, { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import * as PhosphorIcons from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import {
  Briefcase,
  FileText,
  Medal,
  Certificate,
  Tag,
  Hexagon,
} from '@phosphor-icons/react';

export interface NodeAvatarProps {
  nodeType: string;      // e.g. 'nodeInvestigador', 'nodePaper', …
  seed: string;          // URI or label — used for deterministic DiceBear generation
  photoUrl?: string;     // Optional user-uploaded photo (data URL or remote URL)
  iconName?: string | null; // Optional Phosphor icon name chosen from the picker
  size?: number;         // px — default 40
  chipColor: string;     // Accent colour from the card palette
}

/** Returns true for node types that represent people */
function isPerson(nodeType: string) {
  return (
    nodeType === 'nodeInvestigador' ||
    nodeType === 'nodeTesistaPosgrado' ||
    nodeType === 'nodeTesistaDeGrado'
  );
}

/** Resolve a Phosphor icon component by its string name */
function getPhosphorIcon(name: string): PhosphorIcon | null {
  const icon = (PhosphorIcons as Record<string, unknown>)[name];
  return icon ? (icon as PhosphorIcon) : null;
}

/** Default Phosphor icon per concept node type (duotone) */
function DefaultConceptIcon({ nodeType, size, color }: { nodeType: string; size: number; color: string }) {
  const props = { size: Math.round(size * 0.6), color, weight: 'duotone' as const };
  switch (nodeType) {
    case 'nodeProyecto':       return <Briefcase   {...props} />;
    case 'nodePaper':          return <FileText     {...props} />;
    case 'nodeTesisDoctoral':  return <Medal        {...props} />;
    case 'nodeTesisMaestria':  return <Certificate  {...props} />;
    case 'nodeTopicCSO':       return <Tag          {...props} />;
    default:                   return <Hexagon      {...props} />;
  }
}

export function NodeAvatar({ nodeType, seed, photoUrl, iconName, size = 40, chipColor }: NodeAvatarProps) {
  // Generate DiceBear SVG — only for person nodes with no overrides
  const dicebearSvg = useMemo(() => {
    if (!isPerson(nodeType) || photoUrl || iconName) return null;
    try {
      return createAvatar(avataaars, {
        seed,
        backgroundColor: ['transparent'],
        style: ['circle'],
      }).toString();
    } catch {
      return null;
    }
  }, [nodeType, seed, photoUrl, iconName]);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: photoUrl || dicebearSvg ? 'transparent' : chipColor,
    boxShadow: `0 2px 6px ${chipColor}55`,
    border: photoUrl ? `2px solid ${chipColor}` : 'none',
  };

  // 1. User-uploaded photo — highest priority
  if (photoUrl) {
    return (
      <div style={containerStyle}>
        <img src={photoUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  // 2. Custom Phosphor icon chosen from the picker
  if (iconName) {
    const IconComp = getPhosphorIcon(iconName);
    if (IconComp) {
      return (
        <div style={containerStyle}>
          <IconComp size={Math.round(size * 0.58)} color="#fff" weight="duotone" />
        </div>
      );
    }
  }

  // 3. DiceBear avataaars for person nodes (no custom overrides)
  if (dicebearSvg) {
    return (
      <div style={containerStyle} dangerouslySetInnerHTML={{ __html: dicebearSvg }} />
    );
  }

  // 4. Default semantic Phosphor icon for concept nodes
  return (
    <div style={containerStyle}>
      <DefaultConceptIcon nodeType={nodeType} size={size} color="#fff" />
    </div>
  );
}
