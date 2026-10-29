# ==============================================================================
# STAGE 1: Compilación del Frontend (Vite + React + TypeScript)
# ==============================================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Copiar manifiestos del frontend e instalar dependencias
COPY frontend/package*.json ./
RUN npm ci

# Copiar código fuente del frontend
COPY frontend/ ./

# Variables de entorno requeridas en tiempo de compilación por Vite
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_USE_FIREBASE_EMULATOR=false

ENV VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}
ENV VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}
ENV VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}
ENV VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}
ENV VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}
ENV VITE_USE_FIREBASE_EMULATOR=${VITE_USE_FIREBASE_EMULATOR}

# Compilar bundle estático de producción en /app/frontend/dist
RUN npm run build

# ==============================================================================
# STAGE 2: Servidor de Producción (Node.js + Express + Frontend estático)
# ==============================================================================
FROM node:22-alpine AS production

WORKDIR /app

# Instalar únicamente dependencias de producción del backend
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar servidor Express y scripts auxiliares
COPY server.js ./
COPY import_ontologies.py ./
COPY ontologies/ ./ontologies/

# Copiar el frontend compilado desde el Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck automático para despliegues sin caída (Zero-Downtime / Rolling updates)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
