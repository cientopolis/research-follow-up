# 🐳 Guía Completa de Dockerización y Despliegue en un Servidor Linux Limpio

Todos los archivos de contenedorización están aislados en esta carpeta (`docker/`) para no ensuciar la raíz del proyecto.

---

## 📁 Archivos en esta carpeta

- `Dockerfile`: Imagen **multi-etapa** (Stage 1 compila el frontend React/Vite en `dist/`; Stage 2 levanta el servidor Express junto con el bundle estático en el puerto interno `3000`).
- `Dockerfile.dockerignore`: Exclusión de archivos locales (`node_modules`, `.git`, `.env*`, etc.) durante el build de Docker.
- `docker-compose.yml`: Orquesta los dos servicios principales:
  1. `graphdb`: Contenedor oficial de Ontotext GraphDB 10.7 con volumen persistente (`direatento_graphdb_data`).
  2. `app`: Servidor Node.js + Frontend React publicado hacia afuera en el puerto definido por `PORT` (por defecto **`8080`**).
- `.env.production.example`: Plantilla de variables de entorno para producción.
- `deploy.sh`: Script automatizado para actualizar la aplicación en caliente sin tocar ni reiniciar la base de datos GraphDB.

---

## 🛠️ Etapa 1: Preparar una Computadora con Linux Limpio (Ubuntu/Debian)

Abrí una terminal en la computadora Linux donde vas a instalar el sistema y ejecutá los siguientes pasos:

### 1.1. Actualizar paquetes base e instalar `git`, `curl` y `python3`
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates python3
```

### 1.2. Instalar Docker Engine y Docker Compose (método oficial)
```bash
curl -fsSL https://get.docker.com | sudo sh
```

### 1.3. Habilitar tu usuario para usar Docker sin `sudo`
```bash
sudo usermod -aG docker $USER
newgrp docker
```
Verificá la instalación:
```bash
docker --version
docker compose version
```

---

## 📥 Etapa 2: Clonar el Repositorio

```bash
git clone https://github.com/cientopolis/research-follow-up.git
cd research-follow-up
```

---

## 🔐 Etapa 3: Configurar Firebase Authentication y `docker/.env.production`

### 3.1. Crear y configurar el proyecto en Firebase Console (Plan Spark Gratuito)
1. Entrá a [console.firebase.google.com](https://console.firebase.google.com/) y creá un proyecto (ej. `dire-atento`).
2. **Habilitar métodos de acceso (Correo y Google / Gmail):**
   - En el menú izquierdo, entrá a **Compilación → Authentication → Comenzar → Sign-in method (Método de acceso)**.
   - Elegí **Correo electrónico/contraseña**, habilitalo y guardá.
   - Si querés permitir inicio de sesión con cuentas de **Gmail / Google**: hacé clic en **Agregar nuevo proveedor** → **Google**, activá el interruptor **Habilitar**, seleccioná tu correo en *Correo electrónico de asistencia del proyecto* (o configuralo en ⚙️ *Configuración del proyecto → General*) y presioná **Guardar**.
3. **Autorizar la IP o dominio de tu servidor Linux:**
   - En **Authentication → Settings (Configuración) → Dominios autorizados**, hacé clic en **Agregar dominio** y agregá la IP o el dominio público de tu servidor Linux.
4. **Obtener las credenciales `firebaseConfig` de la Web App:**
   - Hacé clic en la casita 🏠 **"Descripción general del proyecto"** (*Project Overview*) arriba a la izquierda (o en el engranaje ⚙️ → **Configuración del proyecto** → sección **Tus apps** abajo de todo).
   - Hacé clic en el ícono Web **`</>`**, poné un nombre (ej. `direatento-web`) y presioná **Registrar app**.
   - Firebase te mostrará un bloque JavaScript `const firebaseConfig = { ... };`.

### 3.2.Cómo pasar el `firebaseConfig` de Firebase al archivo `docker/.env.production`

En la terminal de Linux, creá el archivo a partir de la plantilla:
```bash
cp docker/.env.production.example docker/.env.production
nano docker/.env.production
```

Copiá cada valor del objeto `firebaseConfig` de Firebase (sin comillas ni comas) en su variable correspondiente. Nota que `projectId` se coloca tanto en `FIREBASE_PROJECT_ID` como en `VITE_FIREBASE_PROJECT_ID`:

| Propiedad en `firebaseConfig` (JS) | Variable en `docker/.env.production` |
| :--- | :--- |
| `projectId` | `FIREBASE_PROJECT_ID=` y `VITE_FIREBASE_PROJECT_ID=` |
| `apiKey` | `VITE_FIREBASE_API_KEY=` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN=` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET=` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID=` |
| `appId` | `VITE_FIREBASE_APP_ID=` |

Ejemplo completo de `docker/.env.production` (sin necesidad de guardar contraseñas en texto plano):

```env
# --- Configuración de Puerto Público y GraphDB ---
# PORT define el puerto externo del servidor Linux (8080 o 80 suelen estar abiertos)
PORT=8080
GRAPHDB_URL=http://graphdb:7200
GRAPHDB_REPOSITORY=researcherDB
GRAPHDB_USER=
GRAPHDB_PASSWORD=

# --- Email de SuperAdmin ---
SUPERADMIN_EMAIL=admin@cientopolis.org

# --- Identificadores públicos del proyecto Web de Firebase ---
FIREBASE_PROJECT_ID=dire-atento
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=dire-atento.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dire-atento
VITE_FIREBASE_STORAGE_BUCKET=dire-atento.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=568655339438
VITE_FIREBASE_APP_ID=1:568655339438:web:eae6c470b09496f592723f
VITE_USE_FIREBASE_EMULATOR=false
```

> 🔒 **Sobre la seguridad y las claves:**
> - Los valores `VITE_FIREBASE_*` son identificadores públicos del cliente web de Firebase (no son secretos privados).
> - No necesitás poner `SUPERADMIN_PASSWORD` ni `GRAPHDB_PASSWORD` en texto plano: GraphDB se comunica por la red interna de Docker (`direatento-net`) y la contraseña de tu usuario administrador se gestiona directamente en Firebase Authentication.

---

## 🐳 Etapa 4: Construir y Levantar los Contenedores

```bash
cd docker
docker compose --env-file .env.production up -d --build
```

Verificá que ambos contenedores (`direatento-graphdb` y `direatento-app`) estén corriendo:
```bash
docker compose ps
```

- **Aplicación Web DireAtento:** `http://<IP-DEL-SERVIDOR>:8080` *(o el puerto que hayas configurado en `PORT=`)*
- **Consola de GraphDB:** `http://<IP-DEL-SERVIDOR>:7200`

### 💡 ¿Cómo cambiar el puerto público más adelante (ej. de `8080` a `80`)?
1. Editá `PORT=80` en `docker/.env.production`.
2. Ejecutá `docker compose --env-file .env.production up -d --no-deps app` (aplica el nuevo puerto en 1 segundo sin recompilar ni tocar GraphDB).

---

## 🗄️ Etapa 5: Crear el Repositorio en GraphDB y Cargar las Ontologías (Una sola vez)

1. Abrí `http://<IP-DEL-SERVIDOR>:7200` (o `http://localhost:7200` desde el servidor).
2. Andá a **Setup → Repositories → Create new repository → GraphDB Repository**.
3. En **Repository ID**, escribí exactamente: **`researcherDB`**
4. En **Ruleset**, elegí **`RDFS-Plus (Optimized)`** y hacé clic en **Create**.
5. Volvé a la raíz del proyecto en la terminal de Linux y ejecutá el script de carga de ontologías (`VIVO`, `DBLP`, `CSO`):
   ```bash
   cd ~/research-follow-up
   python3 import_ontologies.py
   ```
   *(El script lee automáticamente `docker/.env.production`, usa librerías nativas de Python sin requerir `pip install`, y verás el mensaje `Código de respuesta: 204` para cada ontología).*

---

## 👑 Etapa 6: Cómo Ingresar como SuperAdmin por Primera Vez

El sistema otorga permisos de **SuperAdmin** automáticamente al correo definido en `SUPERADMIN_EMAIL` (por defecto **`admin@cientopolis.org`** o cualquier correo que empiece con `admin@`). Podés darlo de alta de cualquiera de estas dos maneras:

- **Opción A (Desde la pantalla de login de DireAtento):**
  1. Entrá a `http://<IP-DEL-SERVIDOR>:8080`.
  2. Hacé clic en **"¿No tienes cuenta? Regístrate"**.
  3. Registrate con el correo **`admin@cientopolis.org`** y la contraseña que elijas. Ingresarás directamente con el rol de SuperAdmin activo (`👑 Gestión del Catálogo (Admin)`).
- **Opción B (Desde Firebase Console):**
  1. En Firebase Console → **Authentication → Users (Usuarios)** → **Agregar usuario**, creá la cuenta `admin@cientopolis.org` y luego iniciá sesión en la aplicación.

---

## 🔄 Etapa 7: Cómo Actualizar la Aplicación en Forma Gradual (Sin Caídas)

Cada vez que se suban mejoras nuevas al repositorio de GitHub, en el servidor Linux solo tenés que ejecutar:

```bash
cd ~/research-follow-up
./docker/deploy.sh
```

### ¿Qué hace internamente `deploy.sh`?
1. Ejecuta `git pull` para descargar los últimos cambios del repositorio.
2. Ejecuta `docker compose --env-file .env.production build app` (compila el nuevo frontend y backend mientras la versión anterior sigue corriendo).
3. Ejecuta `docker compose --env-file .env.production up -d --no-deps app`:
   - Reemplaza **únicamente** el contenedor `app` en ~2 segundos.
   - **GraphDB (`direatento-graphdb`) no se detiene ni se reinicia**, conservando todos los nodos, reuniones y conexiones intactos.
4. Limpia las imágenes antiguas con `docker image prune -f`.

---

## ⏪ Etapa 8: Cómo hacer Rollback (Volver a una versión anterior)

Si detectás algún inconveniente luego de actualizar:
```bash
cd ~/research-follow-up
git checkout <commit-o-tag-anterior>
cd docker
docker compose --env-file .env.production up -d --build --no-deps app
```
