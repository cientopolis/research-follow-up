import React, { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import {
  UserCircle,
  GraduationCap,
  Books,
  Briefcase,
  FileText,
  Medal,
  Certificate,
  Tag,
  Hexagon,
} from '@phosphor-icons/react';

interface NodeAvatarProps {
  nodeType: string;    // e.g. 'nodeInvestigador', 'nodePaper', …
  seed: string;        // URI or label — used for deterministic DiceBear generation
  photoUrl?: string;   // Optional user-uploaded photo URL (data URL or remote URL)
  size?: number;       // px — default 40
  chipColor: string;   // Accent color from the card palette
}

/** Returns true for node types that represent people */
function isPerson(nodeType: string) {
  return (
    nodeType === 'nodeInvestigador' ||
    nodeType === 'nodeTesistaPosgrado' ||
    nodeType === 'nodeTesistaDeGrado'
  );
}

/** Phosphor icon component per concept node type */
function ConceptIcon({ nodeType, size, color }: { nodeType: string; size: number; color: string }) {
  const props = { size: Math.round(size * 0.6), color, weight: 'duotone' as const };
  switch (nodeType) {
    case 'nodeProyecto':        return <Briefcase   {...props} />;
    case 'nodePaper':           return <FileText     {...props} />;
    case 'nodeTesisDoctoral':   return <Medal        {...props} />;
    case 'nodeTesisMaestria':   return <Certificate  {...props} />;
    case 'nodeTopicCSO':        return <Tag          {...props} />;
    default:                    return <Hexagon      {...props} />;
  }
}

export function NodeAvatar({ nodeType, seed, photoUrl, size = 40, chipColor }: NodeAvatarProps) {
  // Generate DiceBear SVG string (memoised — only re-runs when seed changes)
  const dicebearSvg = useMemo(() => {
    if (!isPerson(nodeType) || photoUrl) return null;
    try {
      return createAvatar(avataaars, {
        seed,
        // Style options that look great for academic contexts
        backgroundColor: ['transparent'],
        style: ['circle'],
      }).toString();
    } catch {
      return null;
    }
  }, [nodeType, seed, photoUrl]);

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

  // 1. User-uploaded photo takes priority
  if (photoUrl) {
    return (
      <div style={containerStyle}>
        <img
          src={photoUrl}
          alt="Avatar"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  // 2. DiceBear avatar for person nodes
  if (dicebearSvg) {
    return (
      <div
        style={containerStyle}
        dangerouslySetInnerHTML={{ __html: dicebearSvg }}
      />
    );
  }

  // 3. Phosphor icon for concept nodes
  return (
    <div style={containerStyle}>
      <ConceptIcon nodeType={nodeType} size={size} color="#fff" />
    </div>
  );
}
