import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cargar variables de entorno locales (.env.local tiene prioridad)
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GRAPHDB_URL = process.env.GRAPHDB_URL || 'http://localhost:7200';
const REPO = process.env.GRAPHDB_REPOSITORY || 'researcherDB';
const USER = process.env.GRAPHDB_USER;
const PASSWORD = process.env.GRAPHDB_PASSWORD;

// Configurar cabeceras de autenticación para GraphDB
const getGraphDBHeaders = (contentType = 'application/json') => {
  const headers = {
    'Accept': 'application/sparql-results+json, application/rdf+json, text/boolean, */*',
  };
  
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  if (USER && PASSWORD) {
    const credentials = Buffer.from(`${USER}:${PASSWORD}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }
  
  return headers;
};

// Endpoint unificado Proxy SPARQL
app.post('/api/sparql', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Falta el parámetro "query" en el cuerpo de la solicitud.' });
  }

  const isUpdate = /insert|delete|clear|load|drop|create/i.test(query);
  let endpoint = '';
  let body = '';
  let headers = {};

  try {
    if (isUpdate) {
      // Endpoint de actualización (statements)
      endpoint = `${GRAPHDB_URL}/repositories/${REPO}/statements`;
      headers = getGraphDBHeaders('application/x-www-form-urlencoded');
      body = new URLSearchParams({ update: query }).toString();
    } else {
      // Endpoint de consulta (SPARQL query)
      endpoint = `${GRAPHDB_URL}/repositories/${REPO}`;
      headers = getGraphDBHeaders('application/x-www-form-urlencoded');
      body = new URLSearchParams({ query }).toString();
    }

    console.log(`[SPARQL Proxy] Enviando petición a GraphDB (${isUpdate ? 'UPDATE' : 'QUERY'}): ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SPARQL Proxy] Error en GraphDB: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'Error de respuesta de GraphDB',
        details: errorText
      });
    }

    // Retornar éxito estructurado para cualquier operación de actualización (UPDATE) exitosa
    if (isUpdate) {
      return res.status(200).json({ success: true, message: 'Actualización semántica exitosa.' });
    }

    // Parsear respuesta según el tipo (JSON, XML, o texto)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/sparql-results+json')) {
      const data = await response.json();
      return res.json(data);
    } else {
      const text = await response.text();
      return res.send(text);
    }

  } catch (error) {
    console.error('[SPARQL Proxy] Error en la conexión:', error);
    return res.status(500).json({
      error: 'Error al conectar con la base de datos GraphDB',
      details: error.message
    });
  }
});

// Servir frontend en producción
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` Servidor backend escuchando en puerto ${PORT}`);
  console.log(` Conectado a GraphDB en: ${GRAPHDB_URL}`);
  console.log(` Repositorio activo: ${REPO}`);
  console.log(`==================================================`);
});
