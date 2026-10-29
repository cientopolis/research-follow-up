#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " 🚀 DireAtento — Despliegue Gradual en Producción (Docker)"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -f "$SCRIPT_DIR/.env.production" ]; then
  echo "❌ Error: No se encontró el archivo docker/.env.production"
  echo "   Copiá la plantilla primero:"
  echo "   cp docker/.env.production.example docker/.env.production"
  exit 1
fi

echo "1️⃣  Actualizando código desde el repositorio Git..."
cd "$PROJECT_ROOT"
git pull

echo "2️⃣  Reconstruyendo únicamente la imagen de la aplicación (app)..."
cd "$SCRIPT_DIR"
docker compose --env-file .env.production build app

echo "3️⃣  Reemplazando el contenedor 'app' sin reiniciar GraphDB..."
docker compose --env-file .env.production up -d --no-deps app

echo "4️⃣  Limpiando imágenes antiguas huérfanas..."
docker image prune -f

echo "✅ ¡Despliegue completado con éxito!"
docker compose ps
