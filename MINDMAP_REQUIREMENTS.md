# Requerimientos: Funcionalidad Mindmap

**Rama Activa:** `feature/mindmap`  
**Arquitectura Elegida:** Motor Árbol Jerárquico en React + Serializador/Deserializador Markdown.

---

## 📐 Especificación de Arquitectura

- **Estructura Interna:** Árbol de nodos en estado React (`{ id, text, color, folded, children: [] }`).
- **Persistencia y Estándar:** Serialización bidireccional continua con formato **Markdown** (listas anidadas `-` e indización tabulada `\t`).
- **Interacción Estilo FreeMind:**
  - `Tab`: Crear subrama hijo.
  - `Enter`: Crear rama hermana al mismo nivel.
  - `Espacio / Clic`: Editar texto in-situ.
  - Drag & Drop de nodos/subramas.
  - Colores por rama/nivel y nodos colapsables/expandibles (`folded`).

---

## 📋 Hoja de Ruta Paso a Paso

- [x] **Paso 1:** Crear el conversor/parser bidireccional **JSON ↔ Markdown** (`mindmapParser.ts`) y sus pruebas unitarias.
- [x] **Paso 2:** Crear el componente del Lienzo Mindmap (`MindmapCanvas.tsx`) con renderizado de nodos recursivos, líneas conectoras curvas (Bézier) y navegación por teclado (`Tab`, `Enter`, `Delete`, flechas).
- [x] **Paso 3:** Agregar selector de color por nodo/rama, colapso de subramas (`+` / `-`) y edición directa in-situ.
- [x] **Paso 4:** Integrar el modal / panel vista Mindmap en la interfaz general (`App.tsx`) con barra de herramientas (Exportar/Importar `.md`, Descargar imagen/SVG).
- [x] **Paso 5:** Guardar y sincronizar los mapas mentales en formato estándar Markdown de forma liviana.
