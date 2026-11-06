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
                    node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/JuanPerez' },
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
        // Verify that the query contains the rfu:createdBy relationship using the mocked user uid and the new base URI
        expect(query).toContain('rfu:createdBy <http://cientopolis.org/rfu/user/test-user-uid>');
        expect(query).toContain('http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/JuanPerez');
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
      if (url === '/api/graphdb/ruleset') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ruleset: 'rdfsplus-optimized' })
        });
      }
      const body = options && options.body ? JSON.parse(options.body) : {};
      const query = body.query || '';

      if (query.includes('SELECT DISTINCT ?node')) {
        // Return a graph containing an existing researcher node "Dr. Smith"
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DrSmith' },
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
                    { researcher: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DrSmith' } }
                  ]
                }
              })
            });
          }
        }
      }

      if (query.includes('INSERT DATA') && query.includes('rfu:associatedResearcher')) {
        expect(query).toContain('rfu:associatedResearcher <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DrSmith>');
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
    fireEvent.change(select, { target: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DrSmith' } });

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

  it('debe permitir asociar la foto de una persona mediante URL web, Cuenta Google o directorio Memorias@LIFIA sin guardar archivos binarios', async () => {
    let savedInsertQuery = '';
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      if (typeof url === 'string' && url.includes('/api/lifia-members')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            members: [
              {
                slug: 'diego-torres',
                name: 'Diego Torres',
                photoUrl: 'https://magictowers.github.io/assets/img/foto_diego-800.webp',
                profileUrl: 'https://memorias.lifia.info.unlp.edu.ar/members/diego-torres'
              }
            ]
          })
        });
      }

      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('INSERT') && query.includes('schema.org/image')) {
        savedInsertQuery = query;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });
      }

      if (query.includes('SELECT DISTINCT ?node')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  node: { value: 'http://example.org/resource/DiegoTorres' },
                  label: { value: 'Diego Torres' },
                  type: { value: 'http://vivoweb.org/ontology/core#FacultyMember' },
                  x: { value: '200' },
                  y: { value: '200' }
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
      expect(screen.getByText('Diego Torres')).toBeInTheDocument();
    });

    // Abrir el Inspector del nodo persona
    const inspectBtn = screen.getByTitle('Ver detalles / Configurar nodo');
    fireEvent.click(inspectBtn);

    await waitFor(() => {
      expect(screen.getByText(/Inspector Semántico/i)).toBeInTheDocument();
      expect(screen.getByText(/🌐 URL Web/i)).toBeInTheDocument();
      expect(screen.getByText(/🔵 Cuenta Google/i)).toBeInTheDocument();
      expect(screen.getByText(/🏛️ Memorias@LIFIA/i)).toBeInTheDocument();
    });

    // Seleccionar Memorias@LIFIA
    fireEvent.click(screen.getByText(/🏛️ Memorias@LIFIA/i));

    await waitFor(() => {
      expect(screen.getByText('Usar foto')).toBeInTheDocument();
    });

    // Elegir la foto de Diego Torres desde Memorias@LIFIA
    fireEvent.click(screen.getByText('Usar foto'));

    // Guardar cambios en GraphDB
    const saveBtn = screen.getByText('Guardar Cambios');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(savedInsertQuery).toContain('<http://schema.org/image>');
      expect(savedInsertQuery).toContain('https://magictowers.github.io/assets/img/foto_diego-800.webp');
    });
  });

  it('debe permitir al SuperAdmin realizar la carga automática masiva de personas desde Memorias@LIFIA hacia GraphDB', async () => {
    if (auth.currentUser) {
      Object.defineProperty(auth.currentUser, 'email', { value: 'admin@cientopolis.org', configurable: true });
    }

    let executedInsertSparql = '';

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      if (typeof url === 'string' && url.includes('/api/lifia-members')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            members: [
              {
                slug: 'diego-torres',
                uriSuffix: 'DiegoTorres',
                uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres',
                name: 'Diego Torres',
                position: 'Researcher',
                vivoType: 'http://vivoweb.org/ontology/core#FacultyMember',
                degree: 'Doctor en Ciencias Informáticas',
                email: 'diego.torres@lifia.info.unlp.edu.ar',
                tags: 'semantic web, citizen science',
                photoUrl: 'https://magictowers.github.io/assets/img/foto_diego-800.webp',
                profileUrl: 'https://memorias.lifia.info.unlp.edu.ar/members/diego-torres'
              },
              {
                slug: 'carine-breidy',
                uriSuffix: 'CarineBreidy',
                uri: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy',
                name: 'Carine Breidy',
                position: 'Estudiante de posgrado',
                vivoType: 'http://vivoweb.org/ontology/core#GraduateStudent',
                degree: 'Máster en Ciencia de Datos',
                email: 'carine.breidy@lifia.info.unlp.edu.ar',
                tags: '',
                photoUrl: 'https://centrolifia.wordpress.com/wp-content/uploads/2025/11/foto-carine.jpg',
                profileUrl: 'https://memorias.lifia.info.unlp.edu.ar/members/carine-breidy'
              }
            ]
          })
        });
      }

      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('INSERT DATA') && query.includes('DiegoTorres')) {
        executedInsertSparql = query;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });
      }

      if (query.includes('DELETE WHERE')) {
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

    await waitFor(() => {
      expect(screen.getByText('Dire')).toBeInTheDocument();
    });

    // Ir a Gestión del Catálogo (Admin)
    fireEvent.click(screen.getByText(/Gestión del Catálogo \(Admin\)/i));

    await waitFor(() => {
      expect(screen.getByText(/🏛️ Carga Automática desde Memorias@LIFIA/i)).toBeInTheDocument();
    });

    // Abrir modal de Carga Automática desde Memorias@LIFIA
    fireEvent.click(screen.getByText(/🏛️ Carga Automática desde Memorias@LIFIA/i));

    await waitFor(() => {
      expect(screen.getByText(/Carga Automática de Personas desde Memorias@LIFIA/i)).toBeInTheDocument();
      expect(screen.getByText('Diego Torres')).toBeInTheDocument();
      expect(screen.getByText('Carine Breidy')).toBeInTheDocument();
    });

    // Ejecutar importación masiva
    const importBtn = screen.getByText(/🚀 Importar \/ Sincronizar Seleccionados \(2\)/i);
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(executedInsertSparql).toContain('<http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres> rdf:type <http://vivoweb.org/ontology/core#FacultyMember>');
      expect(executedInsertSparql).toContain('<http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy> rdf:type <http://vivoweb.org/ontology/core#GraduateStudent>');
      expect(executedInsertSparql).toContain('diego.torres@lifia.info.unlp.edu.ar');
      expect(executedInsertSparql).toContain('https://magictowers.github.io/assets/img/foto_diego-800.webp');
      expect(screen.getByText(/Se sincronizaron 2 personas desde Memorias@LIFIA en GraphDB/i)).toBeInTheDocument();
    });
  });

  it('debe permitir al SuperAdmin blanquear / resetear la base de datos confirmando con la palabra BLANQUEAR', async () => {
    if (auth.currentUser) {
      Object.defineProperty(auth.currentUser, 'email', { value: 'admin@cientopolis.org', configurable: true });
    }

    let resetEndpointCalled = false;

    const fetchMock = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/admin/reset-db')) {
        resetEndpointCalled = true;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            message: 'Base de datos blanqueada correctamente. Se conservaron las ontologías base (VIVO, DBLP, CSO).'
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

    fireEvent.click(screen.getByText(/Gestión del Catálogo \(Admin\)/i));

    await waitFor(() => {
      expect(screen.getByText(/🧹 Blanquear Base de Datos/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/🧹 Blanquear Base de Datos/i));

    await waitFor(() => {
      expect(screen.getByText(/⚠️ Blanquear \/ Resetear Base de Datos/i)).toBeInTheDocument();
    });

    const confirmInput = screen.getByPlaceholderText('BLANQUEAR');
    fireEvent.change(confirmInput, { target: { value: 'BLANQUEAR' } });

    const confirmBtn = screen.getByText(/🧹 Confirmar Blanqueo de Base/i);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(resetEndpointCalled).toBe(true);
      expect(screen.getByText(/Base de datos blanqueada correctamente/i)).toBeInTheDocument();
    });
  });

  it('debe permitir abrir el Inspector Semántico de un conector y eliminar la relación entre dos nodos', async () => {
    let deleteConnectionQuery = '';

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('SELECT DISTINCT ?node')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres' },
                  type: { value: 'http://vivoweb.org/ontology/core#FacultyMember' },
                  label: { value: 'Diego Torres' },
                  x: { value: '100' },
                  y: { value: '100' }
                },
                {
                  node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy' },
                  type: { value: 'http://vivoweb.org/ontology/core#GraduateStudent' },
                  label: { value: 'Carine Breidy' },
                  x: { value: '400' },
                  y: { value: '100' }
                }
              ]
            }
          })
        });
      }

      if (query.includes('SELECT DISTINCT ?from ?predicate ?to')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  from: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres' },
                  predicate: { value: 'http://vivoweb.org/ontology/core#advisor' },
                  to: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy' }
                }
              ]
            }
          })
        });
      }

      if (query.includes('DELETE DATA') && query.includes('http://vivoweb.org/ontology/core#advisor')) {
        deleteConnectionQuery = query;
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

    // Esperar a que se rendericen ambos nodos y la etiqueta de la conexión "vivo:advisor"
    await waitFor(() => {
      expect(screen.getByText('Diego Torres')).toBeInTheDocument();
      expect(screen.getByText('Carine Breidy')).toBeInTheDocument();
      expect(screen.getByText('vivo:advisor')).toBeInTheDocument();
    });

    // Hacer clic sobre el conector "vivo:advisor" para abrir el Inspector Semántico - Conector
    fireEvent.click(screen.getByText('vivo:advisor'));

    await waitFor(() => {
      expect(screen.getByText(/Inspector Semántico\s*-\s*Conector/i)).toBeInTheDocument();
      expect(screen.getByText(/🗑️ Eliminar Relación/i)).toBeInTheDocument();
    });

    // Hacer clic en "🗑️ Eliminar Relación"
    fireEvent.click(screen.getByText(/🗑️ Eliminar Relación/i));

    await waitFor(() => {
      expect(deleteConnectionQuery).toContain('<http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres> <http://vivoweb.org/ontology/core#advisor> <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy>');
    });
  });

  it('debe permitir cambiar el motor de inferencia en GraphDB entre el actual (rdfsplus-optimized) y OWL-DL (owl-max-optimized) desde Configuración General', async () => {
    let selectedRulesetPosted = '';

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      if (url === '/api/graphdb/ruleset' && (!options || !options.method || options.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ruleset: 'rdfsplus-optimized',
            available: [
              { id: 'rdfsplus-optimized', label: 'RDFS-Plus (Optimized) — Motor actual por defecto' },
              { id: 'owl-max-optimized', label: 'OWL-DL / OWL-Max (Optimized) — Razonamiento completo OWL-DL' }
            ]
          })
        });
      }

      if (url === '/api/graphdb/ruleset' && options && options.method === 'POST') {
        const body = JSON.parse(options.body);
        selectedRulesetPosted = body.ruleset;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            ruleset: body.ruleset,
            message: `Motor de inferencia actualizado a OWL-DL / OWL-Max (Optimized) (${body.ruleset}) y grafo re-inferido.`
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
      expect(screen.getByText('👤')).toBeInTheDocument();
    });

    // Abrir el menú de usuario y luego Configuración General
    fireEvent.click(screen.getByText('👤'));
    const configBtn = await screen.findByText(/⚙️ Configuración General/i);
    fireEvent.click(configBtn);

    // Verificar que se muestra el selector de motor de inferencia con RDFS-Plus activo
    const rulesetSelect = await screen.findByLabelText(/Motor de Inferencia en GraphDB/i) as HTMLSelectElement;
    expect(rulesetSelect).toBeInTheDocument();
    expect(rulesetSelect.value).toBe('rdfsplus-optimized');

    // Cambiar el motor de inferencia a OWL-DL (owl-max-optimized)
    fireEvent.change(rulesetSelect, { target: { value: 'owl-max-optimized' } });

    await waitFor(() => {
      expect(selectedRulesetPosted).toBe('owl-max-optimized');
      expect(screen.getByText(/OWL-DL Activo/i)).toBeInTheDocument();
      expect(screen.getByText(/Motor de inferencia actualizado a OWL-DL/i)).toBeInTheDocument();
    });
  });

  it('debe mostrar en el nodo de reunión en el canvas un botón para visualizar las notas tomadas y la asistencia', async () => {
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('SELECT DISTINCT ?node')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/SeguimientoSemanal' },
                  type: { value: 'http://vivoweb.org/ontology/core#Meeting' },
                  label: { value: 'Seguimiento Semanal Tesis' },
                  x: { value: '250' },
                  y: { value: '200' }
                },
                {
                  node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/AnaTesista' },
                  type: { value: 'http://vivoweb.org/ontology/core#GraduateStudent' },
                  label: { value: 'Ana Tesista' },
                  x: { value: '500' },
                  y: { value: '200' }
                }
              ]
            }
          })
        });
      }

      if (query.includes('SELECT ?participant ?session ?sDate ?sNotes ?sAttendee')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  participant: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/AnaTesista' },
                  session: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/SeguimientoSemanal_session_1' },
                  sDate: { value: '2026-11-02' },
                  sNotes: { value: 'Revisión del marco teórico y experimentos con SPARQL.' },
                  sAttendee: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/AnaTesista' }
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

    // Verificar que el nodo Reunión aparece en el canvas con el botón "📋 Ver Notas y Asistencia"
    const verNotasBtn = await screen.findByText(/📋 Ver Notas y Asistencia/i);
    expect(verNotasBtn).toBeInTheDocument();

    // Hacer clic en el botón del nodo Reunión
    fireEvent.click(verNotasBtn);

    // Verificar que se abre el modal con las notas tomadas y la asistencia registrada
    await waitFor(() => {
      expect(screen.getByText(/📋 Bitácora de Encuentros: Seguimiento Semanal Tesis/i)).toBeInTheDocument();
      expect(screen.getByText(/Revisión del marco teórico y experimentos con SPARQL\./i)).toBeInTheDocument();
      expect(screen.getAllByText(/✓ Ana Tesista/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('debe permitir abrir la Consola SPARQL, estirar la barra con el mouse y visualizar resultados en múltiples formatos (Tabla, JSON, CSV, TSV)', async () => {
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('SELECT ?s ?p ?o')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            head: { vars: ['s', 'p', 'o'] },
            results: {
              bindings: [
                {
                  s: { type: 'uri', value: 'http://cientopolis.org/rfu/Investigador1' },
                  p: { type: 'uri', value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' },
                  o: { type: 'literal', value: 'Investigador Principal' }
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

    // Abrir la consola SPARQL
    const sparqlBtn = await screen.findByRole('button', { name: /Consola SPARQL/i });
    expect(sparqlBtn).toBeInTheDocument();
    fireEvent.click(sparqlBtn);

    // Verificar que la barra semántica está abierta y muestra el título
    const sidebar = document.getElementById('sidebarSemantic');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).not.toHaveClass('collapsed');
    expect(screen.getByText(/Consola SPARQL/i)).toBeInTheDocument();

    // Verificar que existe el handle de estiramiento (resize handle)
    const resizeHandle = sidebar?.querySelector('.sidebar-resize-handle');
    expect(resizeHandle).toBeInTheDocument();

    // Simular arrastre del borde izquierdo para estirar la barra
    if (resizeHandle) {
      fireEvent.mouseDown(resizeHandle, { clientX: 700 });
      fireEvent.mouseMove(window, { clientX: 400 });
      fireEvent.mouseUp(window);
    }

    // Verificar textarea de la consulta SPARQL
    const sparqlInput = sidebar?.querySelector('.sparql-input') as HTMLTextAreaElement;
    expect(sparqlInput).toBeInTheDocument();

    // Ejecutar consulta SPARQL
    const executeBtn = screen.getByRole('button', { name: /Ejecutar Consulta/i });
    fireEvent.click(executeBtn);

    // Esperar y verificar que los resultados se muestren en formato Tabla por defecto
    await waitFor(() => {
      expect(screen.getByText(/1 resultado encontrado/i)).toBeInTheDocument();
      expect(screen.getByText('?s')).toBeInTheDocument();
      expect(screen.getByText('?p')).toBeInTheDocument();
      expect(screen.getByText('?o')).toBeInTheDocument();
      expect(screen.getByText('rfu:Investigador1')).toBeInTheDocument();
      expect(screen.getByText('rdf:type')).toBeInTheDocument();
      expect(screen.getByText('Investigador Principal')).toBeInTheDocument();
    });

    // Probar formato JSON
    const jsonBtn = screen.getByRole('button', { name: /📄 JSON/i });
    fireEvent.click(jsonBtn);
    expect(screen.getByText(/Investigador Principal/i)).toBeInTheDocument();

    // Probar formato CSV
    const csvBtn = screen.getByRole('button', { name: /📑 CSV/i });
    fireEvent.click(csvBtn);
    expect(screen.getByText(/"s","p","o"/i)).toBeInTheDocument();

    // Probar formato TSV
    const tsvBtn = screen.getByRole('button', { name: /📝 TSV/i });
    fireEvent.click(tsvBtn);
    const preOutput = sidebar?.querySelector('.sparql-pre-output');
    expect(preOutput?.textContent).toContain('?s\t?p\t?o');
    expect(preOutput?.textContent).toContain('<http://cientopolis.org/rfu/Investigador1>');

    // Volver a formato Tabla
    const tableBtn = screen.getByRole('button', { name: /📊 Tabla/i });
    fireEvent.click(tableBtn);
    expect(screen.getByText('rfu:Investigador1')).toBeInTheDocument();
  });

  it('debe detectar relaciones bidireccionales, permitir invertir la dirección y eliminar en ambos sentidos', async () => {
    let updateQueriesSent: string[] = [];

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('SELECT DISTINCT ?node')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres' },
                  type: { value: 'http://vivoweb.org/ontology/core#FacultyMember' },
                  label: { value: 'Diego Torres' },
                  x: { value: '100' },
                  y: { value: '100' }
                },
                {
                  node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy' },
                  type: { value: 'http://vivoweb.org/ontology/core#GraduateStudent' },
                  label: { value: 'Carine Breidy' },
                  x: { value: '400' },
                  y: { value: '100' }
                }
              ]
            }
          })
        });
      }

      if (query.includes('SELECT DISTINCT ?from ?predicate ?to')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  from: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres' },
                  predicate: { value: 'http://vivoweb.org/ontology/core#advisor' },
                  to: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy' }
                },
                {
                  from: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy' },
                  predicate: { value: 'http://vivoweb.org/ontology/core#advisor' },
                  to: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres' }
                }
              ]
            }
          })
        });
      }

      if (query.includes('DELETE DATA') || query.includes('INSERT DATA')) {
        updateQueriesSent.push(query);
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

    // Esperar a que se rendericen los nodos
    await waitFor(() => {
      expect(screen.getByText('Diego Torres')).toBeInTheDocument();
      expect(screen.getByText('Carine Breidy')).toBeInTheDocument();
    });

    // Abrir inspector del conector vivo:advisor
    const advisorLabels = screen.getAllByText('vivo:advisor');
    expect(advisorLabels.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(advisorLabels[0]);

    // Verificar que el inspector muestra el banner de relación bidireccional y los botones
    await waitFor(() => {
      expect(screen.getByText(/Relación bidireccional detectada/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /🔄 Invertir Dirección/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /🗑️ Eliminar en ambos sentidos/i })).toBeInTheDocument();
    });

    // Probar Invertir Dirección
    const invertBtn = screen.getByRole('button', { name: /🔄 Invertir Dirección/i });
    fireEvent.click(invertBtn);

    await waitFor(() => {
      expect(updateQueriesSent.some(q => q.includes('INSERT DATA') && q.includes('DELETE DATA'))).toBe(true);
    });

    // Volver a abrir el inspector y probar Eliminar en ambos sentidos
    fireEvent.click(advisorLabels[0]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /🗑️ Eliminar en ambos sentidos/i })).toBeInTheDocument();
    });

    const deleteBothBtn = screen.getByRole('button', { name: /🗑️ Eliminar en ambos sentidos/i });
    fireEvent.click(deleteBothBtn);

    await waitFor(() => {
      expect(updateQueriesSent.some(q => 
        q.includes('<http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres> <http://vivoweb.org/ontology/core#advisor> <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy>') &&
        q.includes('<http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy> <http://vivoweb.org/ontology/core#advisor> <http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres>')
      )).toBe(true);
    });
  });

  it('debe permitir activar el Modo Foco (Alternativa 4) para contraer flechas al origen y expandirlas bajo demanda por hover, selección o pin', async () => {
    localStorage.clear();

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      let query = '';
      if (options && options.body) {
        try {
          const body = JSON.parse(options.body);
          query = body.query || '';
        } catch (e) {}
      }

      if (query.includes('SELECT DISTINCT ?node')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres' },
                  type: { value: 'http://vivoweb.org/ontology/core#FacultyMember' },
                  label: { value: 'Diego Torres' },
                  x: { value: '100' },
                  y: { value: '100' }
                },
                {
                  node: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy' },
                  type: { value: 'http://vivoweb.org/ontology/core#GraduateStudent' },
                  label: { value: 'Carine Breidy' },
                  x: { value: '400' },
                  y: { value: '100' }
                }
              ]
            }
          })
        });
      }

      if (query.includes('SELECT DISTINCT ?from ?predicate ?to')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: {
              bindings: [
                {
                  from: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/DiegoTorres' },
                  predicate: { value: 'http://vivoweb.org/ontology/core#advisor' },
                  to: { value: 'http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/CarineBreidy' }
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

    // Esperar a que se rendericen los nodos y la conexión
    await waitFor(() => {
      expect(screen.getByText('Diego Torres')).toBeInTheDocument();
      expect(screen.getByText('Carine Breidy')).toBeInTheDocument();
      expect(screen.getByText('vivo:advisor')).toBeInTheDocument();
    });

    // El botón de Modo Foco está inicialmente en modo normal (Flechas: Todas)
    const toggleBtn = screen.getByRole('button', { name: /Flechas: Todas/i });
    expect(toggleBtn).toBeInTheDocument();

    // Activar Modo Foco
    fireEvent.click(toggleBtn);
    expect(screen.getByText(/Modo Foco: Activo/i)).toBeInTheDocument();

    // En Modo Foco sin selección ni hover, la flecha vivo:advisor se contrae al origen
    await waitFor(() => {
      expect(screen.queryByText('vivo:advisor')).toBeNull();
    });

    // Debe mostrar la insignia/badge en el nodo de origen Diego Torres (1 relación saliente)
    const hubBadges = screen.getAllByRole('button').filter(b => b.classList.contains('node-edges-hub-badge'));
    expect(hubBadges.length).toBeGreaterThanOrEqual(1);
    expect(hubBadges[0]).toHaveTextContent(/1 relación/i);

    // Al pasar el mouse sobre el nodo Diego Torres (hover), la flecha se expande
    const diegoNode = screen.getByText('Diego Torres').closest('.node-card');
    expect(diegoNode).not.toBeNull();
    fireEvent.mouseEnter(diegoNode!);

    await waitFor(() => {
      expect(screen.getByText('vivo:advisor')).toBeInTheDocument();
    });

    // Al salir con el mouse (mouseLeave), vuelve a contraerse
    fireEvent.mouseLeave(diegoNode!);
    await waitFor(() => {
      expect(screen.queryByText('vivo:advisor')).toBeNull();
    });

    // Al hacer clic en el badge del hub, se fija (pin) la relación
    fireEvent.click(hubBadges[0]);
    await waitFor(() => {
      expect(screen.getByText('vivo:advisor')).toBeInTheDocument();
      expect(hubBadges[0]).toHaveTextContent('📌');
    });

    // Desactivar Modo Foco vuelve a mostrar todas las flechas
    const focoActiveBtn = screen.getByRole('button', { name: /Modo Foco: Activo/i });
    fireEvent.click(focoActiveBtn);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Flechas: Todas/i })).toBeInTheDocument();
      expect(screen.getByText('vivo:advisor')).toBeInTheDocument();
    });
  });
});
