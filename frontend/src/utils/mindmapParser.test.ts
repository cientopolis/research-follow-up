import { describe, it, expect } from 'vitest';
import { mindmapToMarkdown, markdownToMindmap, MindmapNode } from './mindmapParser';

describe('mindmapParser', () => {
  it('should serialize a Mindmap tree to Markdown correctly', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Proyecto Investigación IA',
      children: [
        {
          id: 'n1',
          text: 'Marco Teórico',
          color: '#1e66f5',
          children: [
            { id: 'n11', text: 'Redes Neuronales', children: [] },
            { id: 'n12', text: 'Grafos de Conocimiento', children: [] }
          ]
        },
        {
          id: 'n2',
          text: 'Metodología',
          folded: true,
          children: [
            { id: 'n21', text: 'Experimentos GraphDB', children: [] }
          ]
        }
      ]
    };

    const md = mindmapToMarkdown(root);

    expect(md).toContain('# Proyecto Investigación IA');
    expect(md).toContain('- Marco Teórico <!-- color:#1e66f5 -->');
    expect(md).toContain('  - Redes Neuronales');
    expect(md).toContain('  - Grafos de Conocimiento');
    expect(md).toContain('- Metodología <!-- folded:true -->');
    expect(md).toContain('  - Experimentos GraphDB');
  });

  it('should parse Markdown string back to Mindmap tree correctly', () => {
    const md = `# Sistema Cientópolis
- Investigadores <!-- color:#1e66f5 -->
  - Dr. Torres
  - Lic. Ana Gómez
- Proyectos <!-- folded:true -->
  - Spatial Semantic Canvas
`;

    const tree = markdownToMindmap(md);

    expect(tree.text).toBe('Sistema Cientópolis');
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].text).toBe('Investigadores');
    expect(tree.children[0].color).toBe('#1e66f5');
    expect(tree.children[0].children).toHaveLength(2);
    expect(tree.children[0].children[0].text).toBe('Dr. Torres');
    expect(tree.children[0].children[1].text).toBe('Lic. Ana Gómez');
    expect(tree.children[1].text).toBe('Proyectos');
    expect(tree.children[1].folded).toBe(true);
    expect(tree.children[1].children[0].text).toBe('Spatial Semantic Canvas');
  });

  it('should handle round-trip serialization and parsing without data loss', () => {
    const original: MindmapNode = {
      id: 'root',
      text: 'Mapa de Prueba',
      children: [
        {
          id: 'n1',
          text: 'Rama A',
          color: '#16a34a',
          children: [{ id: 'n11', text: 'Sub A1', children: [] }]
        }
      ]
    };

    const md = mindmapToMarkdown(original);
    const parsed = markdownToMindmap(md);

    expect(parsed.text).toBe(original.text);
    expect(parsed.children[0].text).toBe(original.children[0].text);
    expect(parsed.children[0].color).toBe(original.children[0].color);
    expect(parsed.children[0].children[0].text).toBe(original.children[0].children[0].text);
  });
});
