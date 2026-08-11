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
  Brain,
  UserCheck,
} from '@phosphor-icons/react';

export interface NodeAvatarProps {
  nodeType: string;         // e.g. 'nodeInvestigador', 'nodePaper', …
  seed: string;             // URI or label — used for deterministic DiceBear generation
  photoUrl?: string;        // Optional user-uploaded photo (data URL or remote URL)
  iconName?: string | null;    // Optional Phosphor icon name chosen from the picker
  iconBgColor?: string | null; // Optional custom background color for the icon avatar
  size?: number;            // px — default 40
  chipColor: string;        // Accent colour from the card palette
}

/** Color palette map to get matching icon contrast color */
const ICON_COLOR_MAP: Record<string, string> = {
  '#e6f9f0': '#0d9488',
  '#e0f2fe': '#0284c7',
  '#e0e7ff': '#4f46e5',
  '#f3e8ff': '#9333ea',
  '#ffe4e6': '#e11d48',
  '#ffedd5': '#ea580c',
  '#fef3c7': '#d97706',
  '#f1f5f9': '#475569',
};

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
  const props = { size: Math.round(size * 0.58), color, weight: 'duotone' as const };
  switch (nodeType) {
    case 'nodeProyecto':       return <Briefcase   {...props} />;
    case 'nodePaper':          return <FileText     {...props} />;
    case 'nodeTesisDoctoral':  return <Medal        {...props} />;
    case 'nodeTesisMaestria':  return <Certificate  {...props} />;
    case 'nodeTopicCSO':       return <Tag          {...props} />;
    case 'nodeMindmap':        return <Brain        {...props} />;
    case 'nodeRol':            return <UserCheck    {...props} />;
    default:                   return <Hexagon      {...props} />;
  }
}

export function NodeAvatar({ nodeType, seed, photoUrl, iconName, iconBgColor, size = 40, chipColor }: NodeAvatarProps) {
  const isPersonNode = isPerson(nodeType);

  // Generate DiceBear SVG — for person nodes (uses custom preset seed if provided, or default seed)
  const dicebearSvg = useMemo(() => {
    if (!isPersonNode || photoUrl) return null;
    const effectiveSeed = iconName || seed;
    try {
      return createAvatar(avataaars, {
        seed: effectiveSeed,
        backgroundColor: ['transparent'],
        style: ['circle'],
      }).toString();
    } catch {
      return null;
    }
  }, [isPersonNode, seed, photoUrl, iconName]);

  const effectiveBg = iconBgColor || (photoUrl || dicebearSvg ? 'transparent' : chipColor);
  const iconColor = iconBgColor && ICON_COLOR_MAP[iconBgColor] ? ICON_COLOR_MAP[iconBgColor] : '#fff';

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: effectiveBg,
    boxShadow: `0 2px 6px ${iconBgColor || chipColor}44`,
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

  // 2. Person nodes: render DiceBear face (custom preset or auto seed)
  if (isPersonNode && dicebearSvg) {
    return (
      <div style={containerStyle} dangerouslySetInnerHTML={{ __html: dicebearSvg }} />
    );
  }

  // 3. Custom Phosphor icon chosen from picker (concept nodes)
  if (iconName) {
    const IconComp = getPhosphorIcon(iconName);
    if (IconComp) {
      return (
        <div style={containerStyle}>
          <IconComp size={Math.round(size * 0.58)} color={iconColor} weight="duotone" />
        </div>
      );
    }
  }

  // 4. Default semantic Phosphor icon for concept nodes
  return (
    <div style={containerStyle}>
      <DefaultConceptIcon nodeType={nodeType} size={size} color={iconColor} />
    </div>
  );
}
