import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MindmapCanvas } from './MindmapCanvas';

describe('MindmapCanvas', () => {
  it('renders root node interactively', () => {
    render(<MindmapCanvas />);

    expect(screen.getByText('Idea Central / Nuevo Mapa')).toBeDefined();
  });

  it('renders initial custom markdown content', () => {
    const md = `# Proyecto Investigación
- Tesis Doctoral
  - Metodología
`;
    render(<MindmapCanvas initialMarkdown={md} />);

    expect(screen.getByText('Proyecto Investigación')).toBeDefined();
    expect(screen.getByText('Tesis Doctoral')).toBeDefined();
    expect(screen.getByText('Metodología')).toBeDefined();
  });

  it('triggers onChange callback when content updates', () => {
    const handleChange = vi.fn();
    render(<MindmapCanvas onChange={handleChange} />);

    // Double click root node to edit text
    const rootEl = screen.getByText('Idea Central / Nuevo Mapa');
    fireEvent.doubleClick(rootEl);

    const inputEl = screen.getByDisplayValue('Idea Central / Nuevo Mapa');
    fireEvent.change(inputEl, { target: { value: 'Nuevo Título Mapa' } });
    fireEvent.blur(inputEl);

    expect(handleChange).toHaveBeenCalled();
  });
});
