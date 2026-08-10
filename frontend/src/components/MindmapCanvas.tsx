import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { MindmapNode } from '../utils/mindmapParser';
import { mindmapToMarkdown, markdownToMindmap } from '../utils/mindmapParser';

interface MindmapCanvasProps {
  initialMarkdown?: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
}

const PALETTE = [
  '#1e66f5', // Azul VIVO
  '#16a34a', // Verde Tesista
  '#ea580c', // Naranja Tesis
  '#7c3aed', // Púrpura Paper
  '#dc2626', // Rojo Proyecto
  '#0d9488', // Teal Tópico
  '#475569', // Grafito
];

// Helper to layout tree nodes horizontally with X/Y positions
interface PositionedNode {
  node: MindmapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  parentId?: string;
  color: string;
}

export function MindmapCanvas({ initialMarkdown, onChange, readOnly = false }: MindmapCanvasProps) {
  const [root, setRoot] = useState<MindmapNode>(() => {
    if (initialMarkdown) {
      try {
        return markdownToMindmap(initialMarkdown);
      } catch {
        // Fallback
      }
    }
    return {
      id: 'root',
      text: 'Título',
      children: []
    };
  });

  const [selectedId, setSelectedId] = useState<string>('root');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');

  // Pan & Zoom state — Initialized to centered position
  const [pan, setPan] = useState({ x: 300, y: 200 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Auto-center root bubble on container mount & resize
  const centerCanvas = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setPan({
          x: Math.round(rect.width / 2 - 90),
          y: Math.round(rect.height / 2 - 24)
        });
      }
    }
  }, []);

  useEffect(() => {
    // Initial centering after render
    const timer = setTimeout(centerCanvas, 50);
    window.addEventListener('resize', centerCanvas);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', centerCanvas);
    };
  }, [centerCanvas]);

  // Notify parent on change
  const notifyChange = useCallback((newRoot: MindmapNode) => {
    if (onChange) {
      onChange(mindmapToMarkdown(newRoot));
    }
  }, [onChange]);

  // Focus input when starting inline edit
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Helper functions for immutable tree updates
  const updateNodeInTree = useCallback((tree: MindmapNode, targetId: string, updater: (n: MindmapNode) => MindmapNode): MindmapNode => {
    if (tree.id === targetId) {
      return updater(tree);
    }
    return {
      ...tree,
      children: tree.children.map(c => updateNodeInTree(c, targetId, updater))
    };
  }, []);

  const addChildNode = useCallback((tree: MindmapNode, parentId: string): { newTree: MindmapNode; newId: string } => {
    const newId = `node-${Date.now()}`;
    const newNode: MindmapNode = { id: newId, text: 'Nueva Rama', children: [] };

    const insert = (n: MindmapNode): MindmapNode => {
      if (n.id === parentId) {
        return { ...n, folded: false, children: [...n.children, newNode] };
      }
      return { ...n, children: n.children.map(insert) };
    };

    return { newTree: insert(tree), newId };
  }, []);

  const addSiblingNode = useCallback((tree: MindmapNode, targetId: string): { newTree: MindmapNode; newId: string } | null => {
    if (tree.id === targetId) return null; // Root cannot have sibling

    const newId = `node-${Date.now()}`;
    const newNode: MindmapNode = { id: newId, text: 'Nueva Rama', children: [] };

    const insertSibling = (parent: MindmapNode): MindmapNode => {
      const idx = parent.children.findIndex(c => c.id === targetId);
      if (idx !== -1) {
        const nextChildren = [...parent.children];
        nextChildren.splice(idx + 1, 0, newNode);
        return { ...parent, children: nextChildren };
      }
      return { ...parent, children: parent.children.map(insertSibling) };
    };

    return { newTree: insertSibling(tree), newId };
  }, []);

  const deleteNodeFromTree = useCallback((tree: MindmapNode, targetId: string): MindmapNode => {
    if (tree.id === targetId) return tree; // Cannot delete root
    return {
      ...tree,
      children: tree.children.filter(c => c.id !== targetId).map(c => deleteNodeFromTree(c, targetId))
    };
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editingId) return; // Do not trigger shortcuts while typing inside input

    if (e.key === 'Tab') {
      e.preventDefault();
      const { newTree, newId } = addChildNode(root, selectedId);
      setRoot(newTree);
      setSelectedId(newId);
      setEditingId(newId);
      const node = findNode(newTree, newId);
      setEditText(node?.text || '');
      notifyChange(newTree);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = addSiblingNode(root, selectedId);
      if (result) {
        setRoot(result.newTree);
        setSelectedId(result.newId);
        setEditingId(result.newId);
        const node = findNode(result.newTree, result.newId);
        setEditText(node?.text || '');
        notifyChange(result.newTree);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedId !== 'root') {
        e.preventDefault();
        const newTree = deleteNodeFromTree(root, selectedId);
        setRoot(newTree);
        setSelectedId('root');
        notifyChange(newTree);
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      const node = findNode(root, selectedId);
      if (node) {
        setEditingId(node.id);
        setEditText(node.text);
      }
    }
  }, [editingId, selectedId, root, addChildNode, addSiblingNode, deleteNodeFromTree, notifyChange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Layout calculation for tree positioning
  const layoutNodes = useCallback((): { positioned: PositionedNode[]; connections: { x1: number; y1: number; x2: number; y2: number; color: string }[] } => {
    const positioned: PositionedNode[] = [];
    const connections: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];

    const NODE_HEIGHT = 40;
    const NODE_H_GAP = 180;
    const NODE_V_GAP = 16;

    // Calculate vertical subtree height
    function getSubtreeHeight(node: MindmapNode): number {
      if (node.folded || !node.children || node.children.length === 0) {
        return NODE_HEIGHT;
      }
      const childrenH = node.children.reduce((acc, c) => acc + getSubtreeHeight(c), 0);
      const gapsH = (node.children.length - 1) * NODE_V_GAP;
      return Math.max(NODE_HEIGHT, childrenH + gapsH);
    }

    function positionSubtree(node: MindmapNode, x: number, startY: number, depth: number, parentId?: string, branchColor?: string) {
      const color = node.color || branchColor || PALETTE[depth % PALETTE.length];
      const nodeH = getSubtreeHeight(node);
      const nodeY = startY + nodeH / 2 - NODE_HEIGHT / 2;

      positioned.push({
        node,
        x,
        y: nodeY,
        width: 140,
        height: NODE_HEIGHT,
        depth,
        parentId,
        color
      });

      if (!node.folded && node.children && node.children.length > 0) {
        let currentY = startY;
        node.children.forEach((child, idx) => {
          const childH = getSubtreeHeight(child);
          const childColor = child.color || (depth === 0 ? PALETTE[idx % PALETTE.length] : color);

          // Connection coordinates (from right edge of parent to left edge of child)
          const x1 = x + 140;
          const y1 = nodeY + NODE_HEIGHT / 2;
          const x2 = x + NODE_H_GAP;
          const y2 = currentY + childH / 2;

          connections.push({ x1, y1, x2, y2, color: childColor });

          positionSubtree(child, x + NODE_H_GAP, currentY, depth + 1, node.id, childColor);
          currentY += childH + NODE_V_GAP;
        });
      }
    }

    positionSubtree(root, 0, 0, 0);
    return { positioned, connections };
  }, [root]);

  const { positioned, connections } = layoutNodes();

  // Canvas Mouse Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const finishEdit = () => {
    if (editingId) {
      const newTree = updateNodeInTree(root, editingId, n => ({ ...n, text: editText.trim() || 'Rama' }));
      setRoot(newTree);
      setEditingId(null);
      notifyChange(newTree);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-crust)',
        cursor: isPanning ? 'grabbing' : 'default',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={(e) => {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom(prev => Math.min(Math.max(0.3, prev * zoomDelta), 2.5));
      }}
    >
      {/* Floating Toolbar for Selected Node */}
      {selectedId && (
        <div style={{
          position: 'absolute', top: 14, right: 14, zIndex: 10,
          background: 'var(--bg-mantle)', padding: '8px 12px', borderRadius: '10px',
          border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Color:</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => {
                  const newTree = updateNodeInTree(root, selectedId, n => ({ ...n, color: c }));
                  setRoot(newTree);
                  notifyChange(newTree);
                }}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c, border: 'none',
                  cursor: 'pointer', outline: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                }}
              />
            ))}
            <button
              onClick={() => {
                const newTree = updateNodeInTree(root, selectedId, n => ({ ...n, color: undefined }));
                setRoot(newTree);
                notifyChange(newTree);
              }}
              title="Restablecer color por defecto"
              style={{
                fontSize: '0.7rem', padding: '2px 6px', background: 'transparent', border: '1px solid var(--border-color)',
                borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)'
              }}
            >
              Auto
            </button>
          </div>
        </div>
      )}

      {/* Instructions Overlay */}
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 10,
        background: 'var(--bg-mantle)', padding: '8px 14px', borderRadius: '10px',
        border: '1px solid var(--border-color)', fontSize: '0.74rem', color: 'var(--text-muted)',
        display: 'flex', gap: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        <span><code>Tab</code> Rama Hijo</span>
        <span><code>Enter</code> Rama Hermana</span>
        <span><code>Espacio</code> Editar</span>
        <span><code>Del</code> Eliminar</span>
      </div>

      {/* Zoom Controls */}
      <div style={{
        position: 'absolute', bottom: 14, right: 14, zIndex: 10,
        display: 'flex', gap: '6px', background: 'var(--bg-mantle)', padding: '4px 8px', borderRadius: '8px',
        border: '1px solid var(--border-color)'
      }}>
        <button className="btn" style={{ padding: '2px 8px' }} onClick={() => setZoom(z => Math.min(2.5, z * 1.15))}>+</button>
        <span style={{ fontSize: '0.75rem', alignSelf: 'center', color: 'var(--text-muted)' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn" style={{ padding: '2px 8px' }} onClick={() => setZoom(z => Math.max(0.3, z / 1.15))}>-</button>
        <button className="btn" style={{ padding: '2px 8px' }} onClick={() => {
          setZoom(1);
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPan({ x: Math.round(rect.width / 2 - 90), y: Math.round(rect.height / 2 - 24) });
          } else {
            setPan({ x: 350, y: 250 });
          }
        }}>Recentrar</button>
      </div>

      {/* Transform Viewport */}
      <div style={{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none'
      }}>
        {/* SVG Bezier Connections */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <g>
            {connections.map((c, i) => {
              const dx = (c.x2 - c.x1) / 2;
              const path = `M ${c.x1} ${c.y1} C ${c.x1 + dx} ${c.y1}, ${c.x2 - dx} ${c.y2}, ${c.x2} ${c.y2}`;
              return (
                <path
                  key={i}
                  d={path}
                  fill="none"
                  stroke={c.color}
                  strokeWidth={2.5}
                  strokeOpacity={0.7}
                />
              );
            })}
          </g>
        </svg>

        {/* Nodes */}
        <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'auto' }}>
          {positioned.map(({ node, x, y, width, height, color }) => {
            const isSelected = selectedId === node.id;
            const isEditing = editingId === node.id;
            const isRoot = node.id === 'root';

            return (
              <div
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(node.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(node.id);
                  setEditingId(node.id);
                  setEditText(node.text);
                }}
                style={{
                  position: 'absolute',
                  transform: `translate(${x}px, ${y}px)`,
                  width: isRoot ? 180 : width,
                  minHeight: isRoot ? 48 : height,
                  background: isRoot ? `linear-gradient(135deg, ${color}, #3b82f6)` : 'var(--bg-surface)',
                  color: isRoot ? '#fff' : 'var(--text-main)',
                  border: isSelected ? `3px solid ${isRoot ? '#ffffff' : color}` : `2px solid ${color}88`,
                  borderRadius: isRoot ? '24px' : '10px',
                  padding: isRoot ? '8px 16px' : '6px 12px',
                  boxShadow: isRoot
                    ? `0 0 20px ${color}55, 0 6px 16px rgba(0,0,0,0.15)`
                    : isSelected ? `0 0 0 3px ${color}33, 0 4px 14px rgba(0,0,0,0.12)` : '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Node Accent Left Bar */}
                {!isRoot && (
                  <div style={{ width: 4, height: '70%', borderRadius: 2, background: color, flexShrink: 0 }} />
                )}

                {/* Inline Edit Input or Text Label */}
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={finishEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: isRoot ? '#fff' : 'var(--text-main)',
                      fontSize: isRoot ? '0.9rem' : '0.82rem',
                      fontWeight: 600,
                    }}
                  />
                ) : (
                  <span style={{
                    fontSize: isRoot ? '0.9rem' : '0.82rem',
                    fontWeight: isRoot ? 700 : 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {node.text}
                  </span>
                )}

                {/* Fold/Unfold Toggle Button if has children */}
                {node.children && node.children.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newTree = updateNodeInTree(root, node.id, n => ({ ...n, folded: !n.folded }));
                      setRoot(newTree);
                      notifyChange(newTree);
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: 'none',
                      background: color,
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      lineHeight: 1,
                    }}
                    title={node.folded ? 'Expandir subrama' : 'Colapsar subrama'}
                  >
                    {node.folded ? '+' : '−'}
                  </button>
                )}

                {/* Quick Add Sub-branch "+" Button on Right Border */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const { newTree, newId } = addChildNode(root, node.id);
                    setRoot(newTree);
                    setSelectedId(newId);
                    setEditingId(newId);
                    setEditText('Nueva Rama');
                    notifyChange(newTree);
                  }}
                  style={{
                    position: 'absolute',
                    right: '-12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: color,
                    color: '#fff',
                    border: '2px solid #fff',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 2px 6px ${color}66`,
                    zIndex: 5,
                    lineHeight: 1
                  }}
                  title="Agregar subrama (Tab)"
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function findNode(tree: MindmapNode, targetId: string): MindmapNode | null {
  if (tree.id === targetId) return tree;
  for (const child of tree.children) {
    const found = findNode(child, targetId);
    if (found) return found;
  }
  return null;
}
