# Spatial Semantic Canvas (Seguimiento de Actividades de Investigación)

Un lienzo interactivo y visual (**Spatial Canvas**) maquetado sobre un backend semántico gobernado por ontologías OWL y almacenado en un Triplestore RDF (**Ontotext GraphDB**). Diseñado específicamente para que directores e investigadores sigan y gestionen su pipeline académico, tesistas, proyectos y publicaciones de forma estructurada.

---

## 🏗️ Arquitectura del Sistema

El sistema cuenta con una arquitectura de 3 capas modulares:

1.  **Frontend Visual (Vite + React + TS)**: Interfaz gráfica libre tipo mindmap/pizarra interactiva. Soporta arrastrar y soltar (drag & drop) nodos, zoom/paneo del lienzo y trazado dinámico de líneas conectoras SVG.
2.  **UI Tagging (Modularidad CSS/JS)**: Cada componente visual posee identificadores unívocos (`#canvasMain`, `#nodeInvestigador`, `#nodeTesista`, `#nodeProyecto`, `#nodePaper`, `#nodeTopicCSO`, `#inspectorSemantico`, `#sidebarSemantic`) para modificaciones directas de maquetación y estilos. En modo desarrollo (`npm run dev`), los IDs de estos componentes se muestran flotantes sobre cada elemento.
3.  **Backend Semántico (Express Proxy + GraphDB)**: Servidor en Node.js que expone un proxy SPARQL transparente. Encarrila de forma automática las consultas (`SELECT`/`ASK`) y las mutaciones (`INSERT`/`DELETE`) hacia Ontotext GraphDB, manteniendo la consistencia e integridad referencial del grafo.

---

## 📂 Estructura del Proyecto

```text
research-follow-up/
├── ontologies/                # Ontologías OWL/TTL del dominio académico
│   ├── vivo.owl               # Core de investigadores, tesistas, filiaciones
│   ├── dblp-schema.ttl        # Estructura de publicaciones y venues
│   └── CSO.3.5.ttl            # Vocabulario de Ciencias de la Computación
├── frontend/                  # Aplicación de cliente (SPA React + Vite)
│   ├── src/
│   │   ├── App.tsx            # Lógica interactiva del canvas y SVG overlays
│   │   ├── index.css          # Estilos premium claros (light theme)
│   │   └── main.tsx           # Punto de entrada de React
│   ├── vite.config.ts         # Configuración del servidor de desarrollo y proxy API
│   └── package.json           # Dependencias de frontend
├── server.js                  # Servidor backend Express (Proxy SPARQL)
├── import_ontologies.py       # Script autónomo en Python para subir ontologías a GraphDB
├── package.json               # Dependencias de backend
├── .env.example               # Plantilla de variables de entorno
└── .env.local                 # Configuración de credenciales locales (excluido de Git)
```

---

## 🚀 Requisitos e Instalación

### Prerrequisitos
*   **Node.js**: v18 o superior (se recomienda v26.6.0).
*   **Python**: v3.9 o superior (para el script de carga de ontologías).
*   **GraphDB**: Instancia de Ontotext GraphDB activa localmente (generalmente en `http://localhost:7200`) con un repositorio llamado `researcherDB` (u otro especificado en la configuración).

### Paso 1: Configurar Variables de Entorno
Copia la plantilla `.env.example` y renómbrala a `.env.local` en la raíz del proyecto:
```bash
cp .env.example .env.local
```
Edita `.env.local` con las credenciales de tu GraphDB local:
```env
GRAPHDB_URL=http://localhost:7200
GRAPHDB_REPOSITORY=researcherDB
GRAPHDB_USER=tu_usuario
GRAPHDB_PASSWORD=tu_clave
```

### Paso 2: Instalar Dependencias
Instala los paquetes en el backend y el frontend:
```bash
# Instalar en backend (raíz del proyecto)
npm install

# Instalar en frontend
cd frontend
npm install
cd ..
```

### Paso 3: Cargar Ontologías en GraphDB
Ejecuta el script de carga en Python para subir los esquemas `VIVO`, `DBLP` y `CSO` directamente a tu base de datos:
```bash
python3 import_ontologies.py
```
*Si las credenciales y el servidor están corriendo, verás el mensaje de conexión exitosa e importación correcta (HTTP 204).*

---

## 💻 Ejecución en Modo Desarrollo

Levanta ambos servidores para disfrutar del Hot Module Replacement (HMR) y desarrollo ágil:

1.  **Iniciar Servidor Backend (API)**:
    En la raíz del proyecto, ejecuta:
    ```bash
    npm run dev
    ```
    El servidor Express arrancará en `http://localhost:3000` redirigiendo peticiones SPARQL a GraphDB.

2.  **Iniciar Servidor Frontend (Vite)**:
    En otra terminal, ve a la carpeta `frontend/` y ejecuta:
    ```bash
    cd frontend
    npm run dev
    ```
    La aplicación web se abrirá automáticamente en:
    ```text
    http://localhost:5173
    ```

---

## 🎨 Funcionalidades Destacadas del Canvas

*   **Lienzo Infinito Claro (Light Mode)**: Diseño premium basado en el esquema *Catppuccin Latte*, optimizado para contraste en entornos iluminados con una grilla de puntos interactiva.
*   **Deduplicación Semántica**: Si un recurso del Triplestore posee múltiples tipos RDF redundantes, el canvas renderiza una **única tarjeta unificada** priorizando los tipos de la ontología `VIVO`.
*   **Interacción de Conexión Inteligente**: Al hacer clic en "Conectar Nodos", el sistema sugiere los predicados correctos basándose en las clases origen y destino:
    *   `Investigador` $\rightarrow$ `Tesista`: sugiere `vivo:advisor`.
    *   `Tesista` $\rightarrow$ `Proyecto`: sugiere `vivo:contributorTo`.
    *   `Paper` $\rightarrow$ `Tesista`: sugiere `dblp:authoredBy`.
    *   `Paper` $\rightarrow$ `Tópico CSO`: sugiere `dct:subject`.
*   **Persistencia de Coordenadas**: Al arrastrar nodos, sus nuevas posiciones se actualizan en GraphDB usando los predicados auxiliares `ex:posX` y `ex:posY`.
*   **Eliminación Segura**: Un botón con cruz roja (`❌`) permite remover cualquier nodo del canvas, ejecutando un query `DELETE WHERE` en GraphDB que remueve el recurso y todas sus aristas conectadas para evitar referencias rotas en el grafo.
*   **Inspector Semántico Modal Avanzado (`#inspectorSemantico`)**:
    *   **Layout Centrado con Backdrop**: Oclusión traslúcida y difuminada (`backdrop-filter`) que aísla visualmente el canvas al abrir las propiedades para concentrarse en la edición.
    *   **Organización Colapsable**: Paneles plegables divididos en *Datos Básicos* (label editable), *Propiedades de la Ontología* (campos específicos y dinámicos) e *Metadatos del Sistema* (URIs y tipo RDF de sólo lectura con opción de copiado al portapapeles).
    *   **Edición Dinámica Híbrida**: Muestra de forma inteligente propiedades sugeridas según la clase (ej. correos para tesistas, DOIs para papers, etc.) y ofrece un selector asíncrono para añadir otras propiedades datatype encontradas en GraphDB o personalizables por URI.
    *   **Validadores y Prevención de Errores**: Filtros RegExp en tiempo real y al guardar para formatos de correo electrónico, números enteros de año, fechas YYYY-MM-DD y DOIs normalizados.
    *   **Persistencia Semántica Limpia**: Operación transaccional `DELETE/INSERT` que actualiza los triples modificados y depura propiedades vacías en el triplestore.
*   **Integración de Tesis Semánticas (PhD Thesis & Magister)**:
    *   **Modelado Semántico**: Ambos tipos de tesis se asocian bajo la clase estándar de VIVO `bibo:Thesis` y se diferencian semánticamente en el triplestore mediante el atributo `<http://example.org/resource/thesisType>` con valor `"PhD Thesis"` o `"Magister"`.
    *   **Estilos Diferenciados**:
        *   Tesis Doctoral (`#nodeTesisDoctoral`): Tarjeta visual con borde naranja melocotón (`#fe640b`).
        *   Tesis de Maestría (`#nodeTesisMaestria`): Tarjeta visual con borde amarillo ámbar (`#df8e1d`).
    *   **Regla de Conectores**: Al vincular la Tesis con un Alumno en el Canvas, el sistema sugiere y graba automáticamente la relación `dblp:authoredBy` (Tesis $\rightarrow$ `authoredBy` $\rightarrow$ Alumno).
*   **Temporizador Pomodoro Avanzado (`#sidebarPomodoro`)**:
    *   **Interfaz de Alta Fidelidad (UX)**: Panel deslizable en la parte derecha con un arco circular dinámico SVG que se reduce y cambia de color en tiempo real (rojo para Trabajo, verde para Recreo).
    *   **Sonido de Foco (Tic-Tac)**: Sonido opcional y alternado (Tic/Tac en segundos pares/impares) sintetizado nativamente en tres alternativas: *Clásico (Seno)*, *Madera (Woodblock)* y *Moderno (Cepillo)*.
    *   **Alertas y Notificaciones**: Generación de alarmas sonoras e integración de notificaciones nativas de escritorio (Push) del sistema operativo al concluir los ciclos.
    *   **Flujo Inteligente**: Opciones de inicio automático de descansos o trabajo consecutivo y almacenamiento persistente del contexto de audio para prevenir desconexiones y asegurar un funcionamiento continuo de alta fidelidad.

---

## 🔍 Consultas SPARQL
Para conocer en detalle todas las consultas y mutaciones SPARQL que el sistema utiliza para interactuar con GraphDB (nodos, aristas, inspector semántico y tareas del Pomodoro), consulta la [**Documentación de Consultas SPARQL**](SPARQL_QUERIES.md).
