/**
 * Mindmap Node Data Model
 */
export interface MindmapNode {
  id: string;
  text: string;
  color?: string;
  folded?: boolean;
  children: MindmapNode[];
}

/**
 * Converts a MindmapNode tree hierarchy into a clean Markdown string using indented bullet lists.
 * Example output:
 * # Central Topic
 * - Branch 1
 *   - Sub-branch 1.1
 *   - Sub-branch 1.2
 * - Branch 2
 */
export function mindmapToMarkdown(root: MindmapNode): string {
  const lines: string[] = [];

  // Root node as Level 1 Heading if not empty, otherwise bullet
  lines.push(`# ${root.text || 'Mapa Mental'}`);

  function serializeChildren(nodes: MindmapNode[], depth: number) {
    const indent = '  '.repeat(depth);
    for (const node of nodes) {
      let metaStr = '';
      if (node.color) metaStr += ` <!-- color:${node.color} -->`;
      if (node.folded) metaStr += ` <!-- folded:true -->`;

      lines.push(`${indent}- ${node.text || 'Nuevo nodo'}${metaStr}`);

      if (node.children && node.children.length > 0) {
        serializeChildren(node.children, depth + 1);
      }
    }
  }

  serializeChildren(root.children, 0);
  return lines.join('\n');
}

/**
 * Parses a Markdown string (headings and indented bullet lists) into a MindmapNode tree.
 */
export function markdownToMindmap(markdown: string): MindmapNode {
  const lines = markdown.split('\n');

  let rootText = 'Mapa Mental';
  const rawListLines: { indentLevel: number; text: string; color?: string; folded?: boolean }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    // Check for H1 header `# Central Topic`
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      rootText = h1Match[1].trim();
      continue;
    }

    // Match indented list item: e.g. "  - Subtopic <!-- color:#ff0000 -->"
    const listMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (listMatch) {
      const leadingSpaces = listMatch[1].replace(/\t/g, '  ').length;
      const indentLevel = Math.floor(leadingSpaces / 2);
      let content = listMatch[2];

      // Extract metadata comments if present
      let color: string | undefined = undefined;
      let folded: boolean | undefined = undefined;

      const colorMatch = content.match(/<!--\s*color:([\s\S]*?)\s*-->/);
      if (colorMatch) {
        color = colorMatch[1].trim();
        content = content.replace(colorMatch[0], '');
      }

      const foldedMatch = content.match(/<!--\s*folded:(true|false)\s*-->/);
      if (foldedMatch) {
        folded = foldedMatch[1].trim() === 'true';
        content = content.replace(foldedMatch[0], '');
      }

      rawListLines.push({
        indentLevel,
        text: content.trim(),
        color,
        folded
      });
    }
  }

  const rootNode: MindmapNode = {
    id: 'root',
    text: rootText,
    children: []
  };

  // Stack to track parent nodes at each depth level
  // index 0 is rootNode
  const stack: { node: MindmapNode; depth: number }[] = [{ node: rootNode, depth: -1 }];

  let nodeCounter = 1;

  for (const item of rawListLines) {
    const newNode: MindmapNode = {
      id: `node-${nodeCounter++}`,
      text: item.text,
      color: item.color,
      folded: item.folded,
      children: []
    };

    // Pop stack until we find a parent whose depth is less than item.indentLevel
    while (stack.length > 1 && stack[stack.length - 1].depth >= item.indentLevel) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;
    parent.children.push(newNode);

    stack.push({ node: newNode, depth: item.indentLevel });
  }

  return rootNode;
}
