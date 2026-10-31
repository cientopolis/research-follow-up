# Documentación de Consultas SPARQL

Este documento contiene y describe todas las consultas y mutaciones SPARQL utilizadas en la aplicación **Spatial Semantic Canvas** para interactuar con la base de datos de grafos **Ontotext GraphDB**.

## Índice
- [1. Consultas del Canvas y Nodos](#1-consultas-del-canvas-y-nodos)
  - [1.1 Obtener todos los nodos](#11-obtener-todos-los-nodos)
  - [1.2 Obtener todas las conexiones](#12-obtener-todas-las-conexiones)
  - [1.3 Crear un nuevo nodo](#13-crear-un-nuevo-nodo)
  - [1.4 Actualizar la posición de un nodo](#14-actualizar-la-posición-de-un-nodo)
  - [1.5 Eliminar un nodo](#15-eliminar-un-nodo)
- [2. Consultas del Inspector Semántico](#2-consultas-del-inspector-semántico)
  - [2.1 Obtener detalles de un nodo](#21-obtener-detalles-de-un-nodo)
  - [2.2 Obtener propiedades disponibles](#22-obtener-propiedades-disponibles)
  - [2.3 Actualizar detalles de un nodo](#23-actualizar-detalles-de-un-nodo)
  - [2.4 Crear una conexión entre nodos](#24-crear-una-conexión-entre-nodos)
- [3. Consultas de la Funcionalidad Pomodoro](#3-consultas-de-la-funcionalidad-pomodoro)
  - [3.1 Obtener tareas del Pomodoro](#31-obtener-tareas-del-pomodoro)
  - [3.2 Crear una tarea en GraphDB](#32-crear-una-tarea-en-graphdb)
  - [3.3 Finalizar/Completar una tarea](#33-finalizarcompletar-una-tarea)
  - [3.4 Registrar realización de Pomodoro](#34-registrar-realización-de-pomodoro)
- [4. Catálogo Compartido y Sincronización desde Memorias@LIFIA](#4-catálogo-compartido-y-sincronización-desde-memoriaslifia)
  - [4.1 Consultar entidades del catálogo por categoría](#41-consultar-entidades-del-catálogo-por-categoría)
  - [4.2 Importación / Sincronización masiva de personas desde Memorias@LIFIA](#42-importación--sincronización-masiva-de-personas-desde-memoriaslifia)
- [5. Agenda de Reuniones y Bitácora de Encuentros (`MeetingsPanel.tsx`)](#5-agenda-de-reuniones-y-bitácora-de-encuentros-meetingspaneltsx)

---

## 1. Consultas del Canvas y Nodos

### 1.1 Obtener todos los nodos
Obtiene todos los recursos del grafo que se originan bajo `http://example.org/` junto con su tipo, etiqueta (nombre), coordenadas cartesianas (posición en el canvas), estado y tipo de tesis si aplica.
*   **Archivo origen**: [App.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/App.tsx#L126)
*   **Query**:
    ```sparql
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX ex: <http://example.org/resource/>

    SELECT DISTINCT ?node ?label ?type ?x ?y ?status ?thesisType ?mindmapContent ?externalUrl ?photoUrl WHERE {
      ?node rdf:type ?type .
      { ?node rfu:createdBy <${userUri}> } UNION { ?node rfu:inCanvasOf <${userUri}> }
      ?node rdfs:label ?label .
      OPTIONAL { ?node ex:posX ?x }
      OPTIONAL { ?node ex:posY ?y }
      OPTIONAL { ?node ex:status ?status }
      OPTIONAL { ?node ex:thesisType ?thesisType }
      OPTIONAL { ?node rfu:hasMindmap ?mindmapContent }
      OPTIONAL { ?node schema:url ?url1 }
      OPTIONAL { ?node foaf:page ?url2 }
      OPTIONAL { ?node schema:image ?img1 }
      OPTIONAL { ?node foaf:depiction ?img2 }
      BIND(COALESCE(?url1, ?url2) AS ?externalUrl)
      BIND(COALESCE(?img1, ?img2) AS ?photoUrl)
      FILTER(STRSTARTS(STR(?node), "http://example.org/"))
    }
    ```

### 1.2 Obtener todas las conexiones
Extrae las aristas semánticas dirigidas entre nodos del canvas, omitiendo relaciones de metadatos del canvas (como coordenadas, etiquetas o tipos RDF).
*   **Archivo origen**: [App.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/App.tsx#L195)
*   **Query**:
    ```sparql
    SELECT ?from ?predicate ?to WHERE {
      ?from ?predicate ?to .
      FILTER(STRSTARTS(STR(?from), "http://example.org/") && STRSTARTS(STR(?to), "http://example.org/"))
      FILTER(?predicate != <http://example.org/resource/posX> && 
             ?predicate != <http://example.org/resource/posY> && 
             ?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> && 
             ?predicate != <http://www.w3.org/2000/01/rdf-schema#label> && 
             ?predicate != <http://example.org/resource/status>)
    }
    ```

### 1.3 Crear un nuevo nodo
Inserta en el triplestore los metadatos y coordenadas de un nuevo nodo.
*   **Archivo origen**: [App.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/App.tsx#L439)
*   **Query**:
    ```sparql
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX ex: <http://example.org/resource/>

    INSERT DATA {
      <${uri}> rdf:type <${type}> ;
               rdfs:label "${label}" ;
               ex:posX ${x} ;
               ex:posY ${y} .
      # Opcional (si posee estatus o tipo de tesis):
      # <${uri}> ex:status "${status}" .
      # <${uri}> ex:thesisType "${thesisType}" .
    }
    ```

### 1.4 Actualizar la posición de un nodo
Actualiza las coordenadas de un nodo en el canvas tras una acción de arrastrar y soltar (Drag & Drop).
*   **Archivo origen**: [App.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/App.tsx#L539)
*   **Query**:
    ```sparql
    PREFIX ex: <http://example.org/resource/>

    DELETE {
      <${draggingNodeId}> ex:posX ?oldX ;
                          ex:posY ?oldY .
    } INSERT {
      <${draggingNodeId}> ex:posX ${newX} ;
                          ex:posY ${newY} .
    } WHERE {
      OPTIONAL { <${draggingNodeId}> ex:posX ?oldX }
      OPTIONAL { <${draggingNodeId}> ex:posY ?oldY }
    }
    ```

### 1.5 Eliminar un nodo
Elimina permanentemente el recurso del nodo y todas las aristas entrantes y salientes para garantizar la integridad referencial.
*   **Archivo origen**: [App.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/App.tsx#L647)
*   **Queries** (ejecutadas en secuencia):
    ```sparql
    # Eliminar triples salientes
    DELETE WHERE { <${nodeUri}> ?p ?o . };
    ```
    ```sparql
    # Eliminar triples entrantes
    DELETE WHERE { ?s ?p <${nodeUri}> . }
    ```

---

## 2. Consultas del Inspector Semántico

### 2.1 Obtener detalles de un nodo
Obtiene todos los predicados y sus valores para una URI seleccionada.
*   **Archivo origen**: [App.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/App.tsx#L266)
*   **Query**:
    ```sparql
    SELECT ?predicate ?value WHERE {
      <${selectedNode.uri}> ?predicate ?value .
    }
    ```

### 2.2 Obtener propiedades disponibles
Lista todos los predicados (propiedades de objeto o datos) que están definidos en las ontologías cargadas o aserciones actuales del grafo, excluyendo los del sistema RDF/RDFS básico y de posicionamiento.
*   **Archivo origen**: [App.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/App.tsx#L297)
*   **Query**:
    ```sparql
    SELECT DISTINCT ?prop WHERE {
      ?s ?prop ?o .
      FILTER(?prop != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> && 
             ?prop != <http://www.w3.org/2000/01/rdf-schema#label> && 
             ?prop != <http://example.org/resource/posX> && 
             ?prop != <http://example.org/resource/posY>)
    } LIMIT 100
    ```

### 2.3 Actualizar detalles de un nodo
Elimina los triples antiguos e inserta los nuevos valores ingresados en el formulario de inspección semántica del nodo.
*   **Archivo origen**: [App.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/App.tsx#L392)
*   **Query**:
    ```sparql
    # Elimina los triples viejos de los predicados editados
    DELETE {
      <${nodeUri}> ?p ?o .
    }
    # Inserta los nuevos triples detallados
    INSERT {
      <${nodeUri}> ?p ?newValue .
    }
    WHERE {
      # Mapea dinámicamente cada relación modificada
    }
    ```

### 2.4 Crear una conexión entre nodos
Crea un enlace semántico directo (arista) entre dos recursos existentes usando una propiedad seleccionada (e.g., `vivo:relates` o `vivo:hasAdvisor`).
*   **Archivo origen**: [App.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/App.tsx#L616)
*   **Query**:
    ```sparql
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX ex: <http://example.org/resource/>

    INSERT DATA {
      <${sourceURI}> <${predicate}> <${targetURI}> .
    }
    ```

---

## 3. Consultas de la Funcionalidad Pomodoro

### 3.1 Obtener tareas del Pomodoro
Busca todos los recursos que son de clase `tmo:Task` y extrae sus propiedades (título, descripción, estado, nodos del grafo vinculados y las sesiones de pomodoros completadas).
*   **Archivo origen**: [PomodoroTimer.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/components/PomodoroTimer.tsx#L253)
*   **Query**:
    ```sparql
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX tmo: <http://www.semanticdesktop.org/ontologies/2008/05/20/tmo#>
    PREFIX rfu: <http://cientopolis.org/rfu/>

    SELECT ?task ?title ?description ?status ?involvedNode ?pomodoro ?pStart ?pEnd WHERE {
      ?task rdf:type tmo:Task .
      OPTIONAL { ?task dcterms:title ?title }
      OPTIONAL { ?task dcterms:description ?description }
      OPTIONAL { ?task rfu:taskStatus ?status }
      OPTIONAL { ?task rfu:involvesNode ?involvedNode }
      OPTIONAL { 
        ?task rfu:hasPomodoro ?pomodoro .
        ?pomodoro rfu:startTime ?pStart .
        ?pomodoro rfu:endTime ?pEnd .
      }
    }
    ```

### 3.2 Crear una tarea en GraphDB
Registra una tarea del Pomodoro con su título, descripción, estatus `"pending"` y las conexiones con todos los URIs de nodos del canvas que fueron seleccionados.
*   **Archivo origen**: [PomodoroTimer.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/components/PomodoroTimer.tsx#L316)
*   **Query**:
    ```sparql
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX tmo: <http://www.semanticdesktop.org/ontologies/2008/05/20/tmo#>
    PREFIX rfu: <http://cientopolis.org/rfu/>

    INSERT DATA {
      <${taskUri}> rdf:type tmo:Task ;
        dcterms:title "${title}" ;
        dcterms:description "${description}" ;
        rfu:taskStatus "pending" ;
        
        # Una o más sentencias por cada nodo involucrado:
        # rfu:involvesNode <${nodeUri}> ;
        
        rdf:type tmo:Task .
    }
    ```

### 3.3 Finalizar/Completar una tarea
Actualiza el estatus de la tarea de `"pending"` a `"completed"` en GraphDB.
*   **Archivo origen**: [PomodoroTimer.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/components/PomodoroTimer.tsx#L360)
*   **Query**:
    ```sparql
    PREFIX rfu: <http://cientopolis.org/rfu/>

    DELETE {
      <${taskUri}> rfu:taskStatus ?status .
    }
    INSERT {
      <${taskUri}> rfu:taskStatus "completed" .
    }
    WHERE {
      <${taskUri}> rfu:taskStatus ?status .
    }
    ```

### 3.4 Registrar realización de Pomodoro
Registra una sesión de intervalo de tiempo de enfoque (`rfu:PomodoroSession`) con su fecha/hora de inicio y fin en tipo `xsd:dateTime`, y la enlaza a la tarea activa en GraphDB.
*   **Archivo origen**: [PomodoroTimer.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/components/PomodoroTimer.tsx#L379)
*   **Query**:
    ```sparql
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX rfu: <http://cientopolis.org/rfu/>

    INSERT {
      <${pomodoroUri}> rdf:type rfu:PomodoroSession ;
        rfu:startTime "${startIso}"^^xsd:dateTime ;
        rfu:endTime "${endIso}"^^xsd:dateTime .

      <${taskUri}> rfu:hasPomodoro <${pomodoroUri}> .
    }
    WHERE {
      FILTER NOT EXISTS {
        <${taskUri}> rfu:hasPomodoro ?existingPomodoro .
        ?existingPomodoro rfu:startTime "${startIso}"^^xsd:dateTime ;
                          rfu:endTime "${endIso}"^^xsd:dateTime .
      }
    }
    ```

---

## 4. Catálogo Compartido y Sincronización desde Memorias@LIFIA

### 4.1 Consultar entidades del catálogo por categoría
Obtiene todos los recursos globales de una categoría (`vivo:FacultyMember`, `vivo:GraduateStudent`, `vivo:UndergraduateStudent`, `bibo:Conference`, `bibo:Journal`, etc.) incluyendo foto (`schema:image`), correo (`vivo:email`), enlace oficial (`schema:url`) y tópicos (`dcterms:subject`), sin explosión cartesiana de `rdf:type`.
*   **Archivo origen**: [AdminCatalogPanel.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/components/AdminCatalogPanel.tsx#L240)
*   **Query**:
    ```sparql
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX bibo: <http://purl.org/ontology/bibo/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX vivo: <http://vivoweb.org/ontology/core#>

    SELECT DISTINCT ?node ?label ?rank ?deadlineMonth ?subject ?externalUrl ?photoUrl ?email WHERE {
      ?node rdf:type <${typeUri}> .
      ?node rdfs:label ?label .
      OPTIONAL { ?node bibo:rank ?rank }
      OPTIONAL { ?node <http://example.org/resource/submissionDeadlineMonth> ?deadlineMonth }
      OPTIONAL { ?node dcterms:subject ?subject }
      OPTIONAL { ?node schema:url ?url1 }
      OPTIONAL { ?node foaf:page ?url2 }
      OPTIONAL { ?node schema:image ?img1 }
      OPTIONAL { ?node foaf:depiction ?img2 }
      OPTIONAL { ?node vivo:email ?email }
      BIND(COALESCE(?url1, ?url2) AS ?externalUrl)
      BIND(COALESCE(?img1, ?img2) AS ?photoUrl)
    } LIMIT 1000
    ```

### 4.2 Importación / Sincronización masiva de personas desde Memorias@LIFIA
Actualiza o inserta en lote investigadores y tesistas obtenidos desde `https://memorias.lifia.info.unlp.edu.ar/members`, almacenando únicamente URLs externas (`schema:image`, `schema:url`).
*   **Archivo origen**: [AdminCatalogPanel.tsx](file:///Users/dtorres/development/research-follow-up/frontend/src/components/AdminCatalogPanel.tsx#L144)
*   **Queries**:
    ```sparql
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX vivo: <http://vivoweb.org/ontology/core#>
    PREFIX schema: <http://schema.org/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX ex: <http://example.org/resource/>

    DELETE WHERE { <${targetUri}> rdf:type vivo:FacultyMember . };
    DELETE WHERE { <${targetUri}> rdf:type vivo:GraduateStudent . };
    DELETE WHERE { <${targetUri}> rdf:type vivo:UndergraduateStudent . };
    DELETE WHERE { <${targetUri}> rdfs:label ?l . };
    DELETE WHERE { <${targetUri}> schema:image ?img . };
    DELETE WHERE { <${targetUri}> schema:url ?u . };
    DELETE WHERE { <${targetUri}> vivo:email ?em . };
    DELETE WHERE { <${targetUri}> ex:status ?st . };
    DELETE WHERE { <${targetUri}> dcterms:subject ?sub . };
    ```
    ```sparql
    INSERT DATA {
      <${targetUri}> rdf:type <${targetType}> ;
                     rdfs:label "${name}" ;
                     schema:image "${photoUrl}" ;
                     schema:url <${profileUrl}> ;
                     vivo:email "${email}" ;
                     ex:status "${position}" ;
                     dcterms:subject "${tag}" .
    }
    ```

---

## 5. Agenda de Reuniones y Bitácora de Encuentros (`MeetingsPanel.tsx`)

### 5.1. Consultar Reuniones Puntuales/Periódicas, Participantes e Historial de Sesiones
Obtiene todas las reuniones (`vivo:Meeting`) del usuario junto con su configuración de recurrencia, dirigidos participantes (`rfu:hasParticipant`) y sesiones registradas (`rfu:hasSession`).

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX vivo: <http://vivoweb.org/ontology/core#>
PREFIX rfu: <http://cientopolis.org/rfu/>
PREFIX schema: <http://schema.org/>
PREFIX ex: <http://example.org/resource/>

SELECT ?meeting ?label ?recurrenceType ?frequency ?dayOfWeek ?date ?time ?meetingUrl ?minutesUrl ?location ?posX ?posY ?participant ?session ?sDate ?sNotes ?sAttendee WHERE {
  ?meeting rdf:type vivo:Meeting .
  { ?meeting rfu:createdBy <${userUri}> } UNION { ?meeting rfu:inCanvasOf <${userUri}> }
  ?meeting rdfs:label ?label .
  OPTIONAL { ?meeting rfu:recurrenceType ?recurrenceType }
  OPTIONAL { ?meeting rfu:frequency ?frequency }
  OPTIONAL { ?meeting rfu:dayOfWeek ?dayOfWeek }
  OPTIONAL { ?meeting ex:startDate ?date }
  OPTIONAL { ?meeting rfu:meetingTime ?time }
  OPTIONAL { ?meeting schema:url ?meetingUrl }
  OPTIONAL { ?meeting rfu:minutesUrl ?minutesUrl }
  OPTIONAL { ?meeting rfu:location ?location }
  OPTIONAL { ?meeting ex:posX ?posX }
  OPTIONAL { ?meeting ex:posY ?posY }
  OPTIONAL {
    { ?meeting rfu:hasParticipant ?participant }
    UNION
    { ?meeting vivo:hasMember ?participant }
  }
  OPTIONAL {
    ?meeting rfu:hasSession ?session .
    OPTIONAL { ?session rfu:sessionDate ?sDate }
    OPTIONAL { ?session rfu:sessionNotes ?sNotes }
    OPTIONAL { ?session rfu:attendedBy ?sAttendee }
  }
}
```

### 5.2. Registrar Encuentro y Asistencia en la Bitácora (`rfu:MeetingSession`)
Almacena un encuentro realizado para una reunión periódica o puntual, vinculando los asistentes presentes (`rfu:attendedBy`).

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rfu: <http://cientopolis.org/rfu/>

INSERT DATA {
  <${meetingUri}> rfu:hasSession <${sessionUri}> .
  <${sessionUri}> rdf:type rfu:MeetingSession ;
                  rfu:sessionDate "${date}" ;
                  rfu:sessionNotes "${notes}" ;
                  rfu:attendedBy <${participantUri}> .
}
```


