# 🐳 Guía de Dockerización y Despliegue Gradual en Producción

Todos los archivos de contenedorización están aislados en esta carpeta (`docker/`) para no ensuciar la raíz del proyecto.

## 📁 Archivos en esta carpeta

- `Dockerfile`: Imagen **multi-etapa** (Stage 1 compila el frontend React/Vite en `dist/`; Stage 2 levanta el servidor Express junto con el bundle estático).
- `docker-compose.yml`: Orquesta los dos servicios principales:
  1. `graphdb`: Contenedor oficial de Ontotext GraphDB 10.7 con volumen persistente (`direatento_graphdb_data`).
  2. `app`: Servidor Node.js + Frontend React en el puerto `3000`.
- `.env.production.example`: Plantilla de variables de entorno para producción.
- `deploy.sh`: Script automatizado para actualizar la aplicación en caliente sin tocar ni reiniciar la base de datos GraphDB.

---

## 🔐 ¿Qué hacer con Firebase Authentication en Producción? (Recomendación)

Tenés dos caminos posibles, pero **la Opción A es la recomendada para producción**:

### ✅ Opción A (Recomendada): Firebase Authentication Cloud (Plan Spark Gratuito)
- **Por qué conviene:**
  - Es **100% gratuito** hasta **50.000 usuarios activos mensuales** (para un grupo de investigación o facultad sobra ampliamente).
  - Tus usuarios e investigadores **no se pierden nunca** si se reinicia el servidor.
  - Incluye envío real de correos para recuperación de contraseñas, tokens firmados criptográficamente con rotación de claves de Google y consola web oficial.
- **Cómo configurarlo en 3 minutos:**
  1. Entrá a [console.firebase.google.com](https://console.firebase.google.com/) y creá un proyecto (ej. `direatento-prod`).
  2. En **Authentication → Sign-in method**, habilitá **Correo electrónico/contraseña**.
  3. En **Configuración del proyecto → Tus apps (Web)**, copiá los valores `apiKey`, `authDomain`, `projectId`, etc. y pegalos en `docker/.env.production` con `VITE_USE_FIREBASE_EMULATOR=false`.

### 🧪 Opción B (Solo para Intranet sin salida a Internet): Emulador Dockerizado
- Si el servidor de producción está en una red cerrada sin acceso a internet, podés usar el emulador agregando el flag `--import=/data --export-on-exit=/data` para que guarde los usuarios en disco. Sin embargo, no envía mails reales ni firma tokens con claves privadas.

---

## 🚀 1. Primera Puesta en Producción (Paso a Paso)

### Paso 1: Crear el archivo `.env.production`
```bash
cp docker/.env.production.example docker/.env.production
```
Editá `docker/.env.production` con tus claves de GraphDB y Firebase.

### Paso 2: Construir y levantar los contenedores
```bash
cd docker
docker compose --env-file .env.production up -d --build
```
- La aplicación estará disponible en: `http://localhost:3000`
- El panel de GraphDB estará en: `http://localhost:7200`

### Paso 3: Crear el repositorio e importar las ontologías (una sola vez)
1. Entrá a `http://localhost:7200` y creá un repositorio llamado **`researcherDB`** (ruleset: *RDFS-Plus (Optimized)*).
2. Desde tu máquina o dentro del contenedor, cargá las ontologías base (`VIVO`, `DBLP`, `CSO`):
   ```bash
   python3 ../import_ontologies.py
   ```

---

## 🔄 2.Cómo Actualizar la Aplicación en Forma Gradual (Sin Caídas)

Cada vez que desarrolles una nueva funcionalidad (como el panel de reuniones o mejoras en el canvas), la pruebes con `npm test` y la subas a GitHub:

En el servidor de producción simplemente ejecutá:
```bash
./docker/deploy.sh
```

### ¿Qué hace internamente `deploy.sh`?
1. Ejecuta `git pull` para descargar los últimos cambios del repositorio.
2. Ejecuta `docker compose --env-file .env.production build app` (compila el nuevo frontend y backend mientras la versión anterior sigue corriendo).
3. Ejecuta `docker compose --env-file .env.production up -d --no-deps app`:
   - Reemplaza **únicamente** el contenedor `app` en ~2 segundos.
   - **GraphDB (`direatento-graphdb`) no se detiene ni se reinicia**, conservando todos los nodos, reuniones y conexiones intactos.
4. Limpia las imágenes viejas con `docker image prune -f`.

---

## ⏪ 3. Cómo hacer Rollback (Volver a una versión anterior)

Si detectás algún inconveniente luego de actualizar:
```bash
# 1. Volver al commit o tag anterior estable
git checkout <commit-o-tag-anterior>

# 2. Reconstruir y levantar solo el contenedor app
cd docker
docker compose --env-file .env.production up -d --build --no-deps app
```
