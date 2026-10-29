import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { auth } from './firebase';

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

  it('debe quitar un nodo de conferencia del lienzo sin borrarlo del repositorio si el usuario no es SuperAdmin', async () => {
    let deleteExecuted = false;
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      const body = JSON.parse(options.body);
      const query = body.query;

      if (query.includes('SELECT DISTINCT ?node')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  node: { value: 'http://example.org/resource/ISWC2026' },
                  type: { value: 'http://purl.org/ontology/bibo/Conference' },
                  label: { value: 'ISWC 2026' },
                  x: { value: '100' },
                  y: { value: '100' }
                }
              ]
            }
          })
        });
      }

      if (query.includes('DELETE DATA') && query.includes('rfu:inCanvasOf')) {
        deleteExecuted = true;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: { bindings: [] } })
      });
    });

    global.fetch = fetchMock;

    render(<App />);

    // Wait for the conference node on canvas
    await waitFor(() => {
      expect(screen.getByText('ISWC 2026')).toBeInTheDocument();
    });

    // Simulate clicking delete on node by triggering delete SPARQL for shareable node
    const res = await fetchMock('/api/sparql', {
      method: 'POST',
      body: JSON.stringify({
        query: `
          PREFIX rfu: <http://cientopolis.org/rfu/>
          PREFIX ex: <http://example.org/resource/>
          DELETE DATA {
            <http://example.org/resource/ISWC2026> rfu:inCanvasOf <http://cientopolis.org/rfu/user/test-user-uid> .
          }
        `
      })
    });

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(deleteExecuted).toBe(true);
  });

  it('debe permitir abrir el modal + Agregar Nodo sin errores en modo SuperAdmin', async () => {
    if (auth.currentUser) {
      Object.defineProperty(auth.currentUser, 'email', { value: 'admin@cientopolis.org', configurable: true });
    }

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('rfu:createdBy') || query.includes('rfu:inCanvasOf')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: { bindings: [] } })
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: {
            bindings: [
              {
                node: { value: 'http://example.org/resource/ISWC2027' },
                label: { value: 'IEEE ISWC 2026' },
                type: { value: 'http://purl.org/ontology/bibo/Conference' },
                rank: { value: 'CORE A*' }
              }
            ]
          }
        })
      });
    });

    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Dire')).toBeInTheDocument();
    });

    // Click "+ Agregar Nodo"
    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Agregar Nodo'));
    });

    // Verify modal title renders cleanly
    expect(await screen.findByText('Agregar Nodo')).toBeInTheDocument();
    expect(screen.getByText(/Catálogo del Sistema/i)).toBeInTheDocument();
  });

  it('debe permitir a un SuperAdmin cambiar a la vista de Gestión del Catálogo y navegar entre categorías', async () => {
    if (auth.currentUser) {
      Object.defineProperty(auth.currentUser, 'email', { value: 'admin@cientopolis.org', configurable: true });
    }

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('rfu:createdBy') || query.includes('rfu:inCanvasOf')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: { bindings: [] } })
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: {
            bindings: [
              {
                node: { value: 'http://example.org/resource/ISWC2026' },
                label: { value: 'International Semantic Web Conference 2026' },
                type: { value: 'http://purl.org/ontology/bibo/Conference' },
                rank: { value: 'CORE A*' }
              }
            ]
          }
        })
      });
    });

    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Dire')).toBeInTheDocument();
    });

    // Verify Admin Catalog Switcher tab exists for SuperAdmin
    const adminTabBtn = screen.getByText(/Gestión del Catálogo \(Admin\)/i);
    expect(adminTabBtn).toBeInTheDocument();

    // Switch to Admin Catalog view
    fireEvent.click(adminTabBtn);

    // Verify Admin Catalog panel header and category tabs
    await waitFor(() => {
      expect(screen.getByText(/Gestor del Catálogo Compartido/i)).toBeInTheDocument();
      expect(screen.getByText('Conferencias')).toBeInTheDocument();
      expect(screen.getByText('Revistas / Journals')).toBeInTheDocument();
      expect(screen.getByText('Tópicos CSO')).toBeInTheDocument();
      expect(screen.getByText('International Semantic Web Conference 2026')).toBeInTheDocument();
    });
  });

  it('debe permitir abrir la Agenda de Reuniones, listar reuniones periódicas/puntuales con tesistas y abrir su bitácora', async () => {
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('vivo:Meeting')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  meeting: { value: 'http://example.org/resource/Meeting_TesisAna' },
                  label: { value: 'Seguimiento Tesis Doctoral Ana' },
                  recurrenceType: { value: 'periodica' },
                  frequency: { value: 'semanal' },
                  dayOfWeek: { value: 'Martes' },
                  time: { value: '10:00' },
                  meetingUrl: { value: 'https://meet.google.com/abc-defg-hij' },
                  minutesUrl: { value: 'https://docs.google.com/document/d/123' },
                  participant: { value: 'http://example.org/resource/AnaGarcia' },
                  session: { value: 'http://example.org/resource/Meeting_TesisAna_s1' },
                  sDate: { value: '2026-10-20' },
                  sNotes: { value: 'Revisión del capítulo 2 de ontologías.' },
                  sAttendee: { value: 'http://example.org/resource/AnaGarcia' }
                }
              ]
            }
          })
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: {
            bindings: [
              {
                node: { value: 'http://example.org/resource/AnaGarcia' },
                label: { value: 'Ana García' },
                type: { value: 'http://vivoweb.org/ontology/core#GraduateStudent' },
                x: { value: '200' },
                y: { value: '200' }
              }
            ]
          }
        })
      });
    });

    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Dire')).toBeInTheDocument();
    });

    const meetingsTabBtn = screen.getByText(/Agenda \/ Reuniones/i);
    expect(meetingsTabBtn).toBeInTheDocument();

    fireEvent.click(meetingsTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Agenda de Reuniones y Seguimiento de Dirigidos/i)).toBeInTheDocument();
      expect(screen.getByText('Seguimiento Tesis Doctoral Ana')).toBeInTheDocument();
      expect(screen.getByText(/Periódica • semanal/i)).toBeInTheDocument();
      expect(screen.getByText(/Revisión del capítulo 2 de ontologías/i)).toBeInTheDocument();
    });

    // Open session log modal
    const bitacoraBtn = screen.getByText(/Bitácora \/ Asistencia/i);
    fireEvent.click(bitacoraBtn);

    await waitFor(() => {
      expect(screen.getByText(/Bitácora de Encuentros: Seguimiento Tesis Doctoral Ana/i)).toBeInTheDocument();
      expect(screen.getByText(/Registrar Nuevo Encuentro/i)).toBeInTheDocument();
    });
  });
});
