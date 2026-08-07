# 🚀 Guía de Arranque para Desarrollo

Documento de referencia rápida para levantar **todos los servicios** necesarios para trabajar en el proyecto `research-follow-up` en modo desarrollo.

---

## Arquitectura de Servicios

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                    │
│                  http://127.0.0.1:5173                  │
│              [3] Frontend — Vite + React                │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP (fetch /api/sparql)
                           │ + Bearer Token (Firebase)
┌──────────────────────────▼──────────────────────────────┐
│              [2] Backend — Express Node.js               │
│                    http://localhost:3000                 │
│     Verifica token con Firebase Auth Emulator           │
│     Reenvía queries SPARQL a GraphDB                    │
└──────────┬───────────────────────────┬──────────────────┘
           │                           │
           ▼                           ▼
┌──────────────────┐       ┌───────────────────────────┐
│  [1] GraphDB     │       │  [1] Firebase Auth         │
│  localhost:7200  │       │  Emulator localhost:9099   │
│  (externo/local) │       │  (debe arrancarse primero) │
└──────────────────┘       └───────────────────────────┘
```

---

## ✅ Orden de Arranque

> **Importante:** Respetar el orden. El backend verifica tokens contra el emulador de Firebase, y el frontend no puede cargar nodos si el backend no está disponible.

### [1a] GraphDB — Triplestore RDF

GraphDB debe estar corriendo **antes** de todo. Es un proceso externo al proyecto.

- **URL:** `http://localhost:7200`
- **Repositorio:** `researcherDB`
- **Credenciales:** `dtorres / dtorres` (ver `.env.local`)

Verificar que está activo:
```bash
curl -s -u dtorres:dtorres "http://localhost:7200/repositories/researcherDB?query=ASK+%7B+%7D" -H "Accept: application/sparql-results+json"
# Debe retornar: {"boolean":true}
```

---

### [1b] Firebase Auth Emulator — Autenticación local

Levantar en la **raíz del proyecto** (Terminal 1):

```bash
cd /Users/dtorres/development/research-follow-up
npx -y firebase-tools@latest emulators:start --only auth --project demo-no-project
```

- **Auth API:** `http://127.0.0.1:9099`
- **Emulator UI:** `http://127.0.0.1:4000/auth`

> ⚠️ El emulador **arranca sin usuarios**. Hay que crear el usuario de desarrollo cada vez que se reinicia (ver sección [Credenciales de Desarrollo](#-credenciales-de-desarrollo)).

---

### [2] Backend — Express + SPARQL Proxy

Levantar en la **raíz del proyecto** (Terminal 2):

```bash
cd /Users/dtorres/development/research-follow-up
npm run dev
```

- **Puerto:** `http://localhost:3000`
- **Endpoint SPARQL:** `POST /api/sparql`
- **Variables de entorno:** cargadas desde `.env.local` y `.env`

Las variables clave que el backend consume:

| Variable                      | Valor                    |
|-------------------------------|--------------------------|
| `GRAPHDB_URL`                 | `http://localhost:7200`  |
| `GRAPHDB_REPOSITORY`          | `researcherDB`           |
| `GRAPHDB_USER`                | `dtorres`                |
| `GRAPHDB_PASSWORD`            | `dtorres`                |
| `FIREBASE_PROJECT_ID`         | `demo-no-project`        |
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099`         |
| `PORT`                        | `3000`                   |

---

### [3] Frontend — Vite + React

Levantar en la carpeta `frontend/` (Terminal 3):

```bash
cd /Users/dtorres/development/research-follow-up/frontend
npm run dev
```

- **URL:** `http://127.0.0.1:5173`
- **HMR:** activo (cambios reflejados en tiempo real)

---

## 🔑 Credenciales de Desarrollo

### Crear usuario en el Emulador de Firebase

El emulador pierde el estado al reiniciarse. Ejecutar este comando **después de levantar el emulador** (una sola vez por sesión):

```bash
curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-no-project/accounts" \
  -H "Authorization: Bearer owner" \
  -H "Content-Type: application/json" \
  -d '{
    "localId": "1REsTTXu64bzf5Ju80RtcuFGdUgh",
    "email": "dtorres@cientopolis.org",
    "password": "dtorres123",
    "emailVerified": true
  }'
```

> **¿Por qué este UID específico?**
> Los nodos almacenados en GraphDB tienen el triple:
> `?nodo rfu:createdBy <http://cientopolis.org/rfu/user/1REsTTXu64bzf5Ju80RtcuFGdUgh>`
> Si el UID del usuario logueado no coincide, la query de carga no retorna ningún nodo y el canvas aparece vacío.

### Login en el Frontend

| Campo      | Valor                     |
|------------|---------------------------|
| Email      | `dtorres@cientopolis.org` |
| Contraseña | `dtorres123`              |

---

## 📋 Resumen Rápido — 3 terminales

```bash
# ── Terminal 1: Firebase Auth Emulator ──────────────────────
cd /Users/dtorres/development/research-follow-up
npx -y firebase-tools@latest emulators:start --only auth --project demo-no-project

# ── Una vez que el emulador esté listo: crear usuario de dev ─
curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-no-project/accounts" \
  -H "Authorization: Bearer owner" \
  -H "Content-Type: application/json" \
  -d '{"localId":"1REsTTXu64bzf5Ju80RtcuFGdUgh","email":"dtorres@cientopolis.org","password":"dtorres123","emailVerified":true}'

# ── Terminal 2: Backend Express ──────────────────────────────
cd /Users/dtorres/development/research-follow-up
npm run dev

# ── Terminal 3: Frontend Vite ────────────────────────────────
cd /Users/dtorres/development/research-follow-up/frontend
npm run dev
```

Abrir en el browser: **http://127.0.0.1:5173**

---

## 🔍 Troubleshooting

### El canvas aparece vacío (nodos no se muestran)

**Causa más común:** el UID del usuario logueado no coincide con el `rfu:createdBy` en GraphDB.

1. Verificar los UIDs almacenados en GraphDB:
   ```bash
   curl -s -u dtorres:dtorres "http://localhost:7200/repositories/researcherDB" \
     -G --data-urlencode \
     "query=PREFIX rfu: <http://cientopolis.org/rfu/> SELECT DISTINCT ?createdBy WHERE { ?s rfu:createdBy ?createdBy . } LIMIT 10" \
     -H "Accept: application/sparql-results+json"
   ```
2. Asegurarse de que el usuario del emulador fue creado con ese mismo UID (ver sección Credenciales).

---

### El backend rechaza el token (401 / 403)

**Causa:** el backend arrancó antes que el emulador de Firebase, o el emulador se cayó.

- Reiniciar el backend **después** de tener el emulador corriendo y el usuario creado.

---

### El emulador no inicia (puerto 9099 ocupado)

```bash
lsof -ti :9099 | xargs kill -9
```

---

### GraphDB no responde

- Verificar que la instancia de GraphDB está corriendo (desde la app de escritorio de Ontotext o como servicio).
- URL de administración: `http://localhost:7200`

---

## 📁 Archivos de Configuración Relevantes

| Archivo                       | Propósito                                               |
|-------------------------------|---------------------------------------------------------|
| `/.env`                       | Firebase project ID + emulador host (para el backend)   |
| `/.env.local`                 | Credenciales GraphDB + Puerto (sobreescribe `.env`)     |
| `/firebase.json`              | Configuración de puertos del emulador                   |
| `/frontend/.env`              | Variables Vite (Firebase client SDK + flag emulador)    |
| `/frontend/src/firebase.ts`   | Inicialización Firebase + conexión al emulador          |

