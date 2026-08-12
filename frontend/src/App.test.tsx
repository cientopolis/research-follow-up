import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

describe('App Canvas Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('debe permitir crear un nodo estando logueado, guardarlo en la base y visualizarlo en el canvas', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      // Mock different responses depending on the SPARQL query
      const body = JSON.parse(options.body);
      const query = body.query;

      if (query.includes('SELECT DISTINCT ?node')) {
        callCount++;
        if (callCount === 1) {
          // First fetch: return empty graph
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ results: { bindings: [] } })
          });
        } else {
          // Subsequent fetch after node creation: return the newly created node
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: {
                bindings: [
                  {
                    node: { value: 'http://example.org/resource/JuanPerez' },
                    type: { value: 'http://vivoweb.org/ontology/core#FacultyMember' },
                    label: { value: 'Juan Perez' },
                    x: { value: '150' },
                    y: { value: '150' }
                  }
                ]
              }
            })
          });
        }
      }

      if (query.includes('INSERT DATA')) {
        // Verify that the query contains the rfu:createdBy relationship using the mocked user uid
        expect(query).toContain('rfu:createdBy <http://cientopolis.org/rfu/user/test-user-uid>');
        expect(query).toContain('JuanPerez');
        expect(query).toContain('Juan Perez');
        
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });
      }

      // Default fallback
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: { bindings: [] } })
      });
    });

    global.fetch = fetchMock;

    render(<App />);

    // Wait for the loader/App to render the main Canvas screen
    await waitFor(() => {
      expect(screen.getByText('Dire')).toBeInTheDocument();
      expect(screen.getByText('Atento')).toBeInTheDocument();
    });

    // Click "+ Agregar Nodo" button
    const addButton = screen.getByText('+ Agregar Nodo');
    fireEvent.click(addButton);

    // Verify modal is open
    expect(screen.getByText('Agregar Nodo')).toBeInTheDocument();

    // Switch to "Crear Nuevo Nodo" tab
    const createTab = screen.getByText('➕ Crear Nuevo Nodo');
    fireEvent.click(createTab);

    // Fill in form inputs
    const labelInput = screen.getByPlaceholderText('Ej: IEEE ISWC 2026 o Journal of Web Semantics');
    const suffixInput = screen.getByPlaceholderText('Ej: ISWC2026 o JWS');

    fireEvent.change(labelInput, { target: { value: 'Juan Perez' } });
    fireEvent.change(suffixInput, { target: { value: 'JuanPerez' } });

    // Click "Crear y Registrar Nodo" button inside modal
    const createButton = screen.getByText('Crear y Registrar Nodo');
    fireEvent.click(createButton);

    // Verify the modal closes and the new node is fetched and rendered in the canvas
    await waitFor(() => {
      expect(screen.queryByText('Agregar Nodo')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });

    // Verify the SPARQL INSERT DATA query was indeed called
    const insertCalls = fetchMock.mock.calls.filter(call => {
      const body = JSON.parse(call[1].body);
      return body.query.includes('INSERT DATA');
    });
    expect(insertCalls.length).toBe(1);
  });

  it('debe permitir vincular la cuenta a un investigador existente en Configuración General y destacarlo en el canvas', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      const body = JSON.parse(options.body);
      const query = body.query;

      if (query.includes('SELECT DISTINCT ?node')) {
        // Return a graph containing an existing researcher node "Dr. Smith"
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  node: { value: 'http://example.org/resource/DrSmith' },
                  type: { value: 'http://vivoweb.org/ontology/core#FacultyMember' },
                  label: { value: 'Dr. Smith' },
                  x: { value: '200' },
                  y: { value: '200' }
                }
              ]
            }
          })
        });
      }

      if (query.includes('associatedResearcher')) {
        callCount++;
        if (query.includes('SELECT')) {
          if (callCount === 1) {
            // Initially not associated
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ results: { bindings: [] } })
            });
          } else {
            // Associated after link
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                results: {
                  bindings: [
                    { researcher: { value: 'http://example.org/resource/DrSmith' } }
                  ]
                }
              })
            });
          }
        }
      }

      if (query.includes('INSERT DATA') && query.includes('rfu:associatedResearcher')) {
        expect(query).toContain('rfu:associatedResearcher <http://example.org/resource/DrSmith>');
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });
      }

      // Default fallback
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: { bindings: [] } })
      });
    });

    global.fetch = fetchMock;

    render(<App />);

    // Wait for the main canvas screen
    await waitFor(() => {
      expect(screen.getByText('Dire')).toBeInTheDocument();
      expect(screen.getByText('Atento')).toBeInTheDocument();
    });

    // Click User menu to open it
    const userMenuTrigger = screen.getByText('test@example.com');
    fireEvent.click(userMenuTrigger);

    // Click "Configuración General" button
    const configBtn = screen.getByText('⚙️ Configuración General');
    fireEvent.click(configBtn);

    // Verify modal is open
    expect(screen.getByText('Opción A: Vincular a un Investigador Existente')).toBeInTheDocument();

    // Select "Dr. Smith" and link it
    const select = screen.getByDisplayValue('-- Seleccionar investigador --');
    fireEvent.change(select, { target: { value: 'http://example.org/resource/DrSmith' } });

    const linkBtn = screen.getByText('Vincular');
    fireEvent.click(linkBtn);

    // Verify that the linked node has the glow highlight tag "Este sos vos" on the canvas
    await waitFor(() => {
      expect(screen.getByText('Este sos vos')).toBeInTheDocument();
    });
  });

  it('debe permitir buscar y autocompletar tópicos CSO desplegando sugerencias', async () => {
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      const body = JSON.parse(options.body);
      const query = body.query;

      if (query.includes('rdfs:label') && query.includes('CONTAINS')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  topic: { value: 'https://cso.kmi.open.ac.uk/topics/semantic_web' },
                  label: { value: 'Semantic Web' }
                },
                {
                  topic: { value: 'https://cso.kmi.open.ac.uk/topics/semantic_data' },
                  label: { value: 'Semantic Data' }
                }
              ]
            }
          })
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: { bindings: [] } })
      });
    });

    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Dire')).toBeInTheDocument();
    });

    // Open "+ Agregar Nodo" modal
    fireEvent.click(screen.getByText('+ Agregar Nodo'));

    // Switch to "➕ Crear Nuevo Nodo" tab
    fireEvent.click(screen.getByText('➕ Crear Nuevo Nodo'));

    // Type "semantic" into CSO Topics input
    const csoInput = screen.getByPlaceholderText(/Escriba para autocompletar tópicos CSO/i);
    fireEvent.change(csoInput, { target: { value: 'semantic' } });

    // Verify recommendations dropdown renders
    await waitFor(() => {
      expect(screen.getByText('Semantic Web')).toBeInTheDocument();
      expect(screen.getByText('Semantic Data')).toBeInTheDocument();
    });

    // Click to select suggestion
    fireEvent.click(screen.getByText('Semantic Web'));

    // Verify chip is rendered
    expect(screen.getByText('🏷️ Semantic Web')).toBeInTheDocument();
  });
});
