# Frontend — DireAtento Spatial Semantic Canvas

Aplicación SPA construida con **React 18**, **TypeScript** y **Vite**. Ofrece una interfaz espacial interactiva tipo pizarra / mindmap para la gestión y seguimiento atento de investigaciones, tesistas, papers, reuniones y proyectos académicos vinculados a un Triplestore semántico (Ontotext GraphDB).

---

## 🚀 Scripts Disponibles

En este directorio (`frontend/`):

```bash
# Iniciar servidor de desarrollo con HMR
npm run dev

# Ejecutar la suite completa de pruebas unitarias con Vitest
npm test

# Ejecutar pruebas en modo de una sola pasada (CI)
npm test -- --watch=false

# Compilar para producción (genera frontend/dist)
npm run build

# Previsualizar el build de producción localmente
npm run preview
```

---

## 🧩 Componentes Principales

```
frontend/src/
├── App.tsx                     # Componente raíz: Canvas espacial, drag & drop, overlays SVG y modales
├── index.css                   # Sistema de diseño DireAtento (paleta Azul Noche, Cobre, Menta)
├── main.tsx                    # Punto de entrada de React y montaje de DOM
├── firebase.ts                 # Inicialización y emulador de Firebase Auth
├── components/
│   ├── AdminCatalogPanel.tsx   # Panel SuperAdmin de gestión del catálogo compartido y sync LIFIA
│   ├── AdminUsersModal.tsx     # Gestión de usuarios y asignación de roles de administración
│   ├── AuthScreen.tsx          # Pantalla de autenticación (Google Sign-In / Email)
│   ├── AvatarPicker.tsx        # Selector de avatares fotográficos e institucionales
│   ├── IconPicker.tsx          # Selector de íconos temáticos para entidades
│   ├── MeetingsPanel.tsx       # Agenda de reuniones periódicas/puntuales y bitácoras de avance
│   ├── MindmapCanvas.tsx       # Visualizador y editor de mapas mentales asociados a nodos
│   ├── NodeAvatar.tsx          # Renderizado de fotos circulares con fallback por iniciales
│   └── PomodoroTimer.tsx       # Temporizador Pomodoro con tictac mecánico y vinculación con tareas
└── utils/
    └── mindmapParser.ts        # Parseo y serialización de árboles Markdown a mapas mentales
```

---

## 🎨 Características de la Interfaz

1. **Lienzo Espacial (Spatial Semantic Canvas)**:
   - Coordenadas continuas con soporte de paneo (`drag`) y zoom (`wheel`).
   - Trazado dinámico de aristas curvas en SVG con etiquetas de predicados centradas.
   - **Modo Foco (`#btnModoFoco`)**: Contrae las flechas no activas a insignias de origen (`↗ X relaciones`) y las despliega bajo demanda por `hover` o selección, con opción de fijación (`📌`).

2. **Ventana "Elegir Relación" con Búsqueda Interactiva (`#modalElegirRelacion`)**:
   - Menú desplegable con barra de búsqueda para filtrar nodos destino por nombre, tipo o URI.
   - Buscador de tipos de relaciones semánticas agrupadas por ontología (`VIVO`, `DBLP`, `RFU`).

3. **Consola SPARQL Redimensionable (`#sidebarSemantic`)**:
   - Barra lateral con tirador de arrastre para modificar su ancho con el mouse.
   - Editor y resultados en tipografía negra de alto contraste.
   - Vistas en **Tabla**, **JSON**, **CSV** y **TSV**.

4. **Inspector Semántico (`#inspectorSemantico`)**:
   - Edición en caliente de propiedades ontológicas con validación RegExp.
   - Detección de aristas bidireccionales con botones de `Invertir Dirección` y `Eliminar en ambos sentidos`.

5. **Pomodoro Timer con Tic-Tac Mecánico (`#sidebarPomodoro`)**:
   - Emulación de reloj analógico / temporizador de cocina mecánico.
   - Vinculación semántica con tareas y sesiones grabadas en GraphDB (`tmo:Task`, `rfu:hasPomodoro`).

---

## 🧪 Pruebas Automatizadas

La aplicación cuenta con una suite completa de pruebas unitarias e integración en Vitest y React Testing Library:
- `App.test.tsx`: Cobertura del lienzo, drag & drop, inspectores, modo foco, relaciones y consola SPARQL.
- `PomodoroTimer.test.tsx`: Validaciones de temporización, controles de audio y gestión de tareas.
- `MindmapCanvas.test.tsx`: Renderizado y navegación en mapas mentales.
- `mindmapParser.test.ts`: Conversión bidireccional entre texto indentado y estructuras de árbol.
