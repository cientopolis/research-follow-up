import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MindmapCanvas } from './MindmapCanvas';

describe('MindmapCanvas', () => {
  it('renders root node and default initial branches', () => {
    render(<MindmapCanvas />);

    expect(screen.getByText('Mapa Mental')).toBeDefined();
    expect(screen.getByText('Rama Principal 1')).toBeDefined();
    expect(screen.getByText('Rama Principal 2')).toBeDefined();
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
    const rootEl = screen.getByText('Mapa Mental');
    fireEvent.doubleClick(rootEl);

    const inputEl = screen.getByDisplayValue('Mapa Mental');
    fireEvent.change(inputEl, { target: { value: 'Nuevo Título Mapa' } });
    fireEvent.blur(inputEl);

    expect(handleChange).toHaveBeenCalled();
  });
});
