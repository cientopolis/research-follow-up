import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';

// Cargar variables de entorno locales (.env.local tiene prioridad)
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Initialize Firebase Admin using Project ID (from env)
// It automatically detects FIREBASE_AUTH_EMULATOR_HOST if present in env
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || 'placeholder-project-id';
admin.initializeApp({
  projectId: firebaseProjectId
});

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

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@cientopolis.org';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'admin123456';

// Auto-provision SuperAdmin user in Firebase Auth on startup if needed
const ensureSuperAdminUser = async () => {
  try {
    const authService = getAuth();
    let superAdminUser;
    try {
      superAdminUser = await authService.getUserByEmail(SUPERADMIN_EMAIL);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        superAdminUser = await authService.createUser({
          email: SUPERADMIN_EMAIL,
          password: SUPERADMIN_PASSWORD,
          displayName: 'Super Admin',
        });
        console.log(`[SuperAdmin Init] Usuario ${SUPERADMIN_EMAIL} creado exitosamente.`);
      } else {
        throw err;
      }
    }
    if (superAdminUser) {
      await authService.setCustomUserClaims(superAdminUser.uid, { admin: true, superadmin: true });
    }
  } catch (error) {
    console.error('[SuperAdmin Init] Error al verificar/crear usuario SuperAdmin:', error.message);
  }
};
ensureSuperAdminUser();

// Auth Middleware
const checkAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token no provisto.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Error de verificación de token:', error);
    return res.status(403).json({ error: 'Token inválido o expirado.', details: error.message });
  }
};

// SuperAdmin Middleware (Checks custom claim `admin: true` OR `superadmin: true` OR email fallback)
const checkSuperAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Acceso no autorizado.' });
  }
  const isSuperAdminClaim = req.user.admin === true || req.user.superadmin === true;
  const isSuperAdminEmail = req.user.email && (
    req.user.email === SUPERADMIN_EMAIL ||
    req.user.email === 'admin@cientopolis.org' ||
    req.user.email.startsWith('superadmin@') ||
    req.user.email.startsWith('admin@')
  );

  if (isSuperAdminClaim || isSuperAdminEmail) {
    return next();
  }
  return res.status(403).json({ error: 'Acceso denegado: Se requiere rol de Super Usuario.' });
};

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

// Endpoint unificado Proxy SPARQL (Protegido por checkAuth)
app.post('/api/sparql', checkAuth, async (req, res) => {
  const { query, infer } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Falta el parámetro "query" en el cuerpo de la solicitud.' });
  }

  const isUpdate = /\b(insert|delete|clear|load|drop|create|with)\b/i.test(query);
  let endpoint = '';
  let body = '';
  let headers = {};

  try {
    if (isUpdate) {
      // Endpoint de actualización (statements)
      endpoint = `${GRAPHDB_URL}/repositories/${REPO}/statements`;
      headers = getGraphDBHeaders('application/x-www-form-urlencoded');
      const params = { update: query };
      if (infer === false) params.infer = 'false';
      body = new URLSearchParams(params).toString();
    } else {
      // Endpoint de consulta (SPARQL query)
      const params = { query };
      if (infer === false) params.infer = 'false';
      endpoint = `${GRAPHDB_URL}/repositories/${REPO}?${new URLSearchParams(params).toString()}`;
      headers = getGraphDBHeaders('application/x-www-form-urlencoded');
      body = new URLSearchParams(params).toString();
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

// ==================================================
// SUPER ADMIN MANAGEMENT ENDPOINTS
// ==================================================

// 1. Obtener lista de todos los usuarios
app.get('/api/admin/users', checkAuth, checkSuperAdmin, async (req, res) => {
  try {
    const listUsersResult = await getAuth().listUsers(1000);
    const users = listUsersResult.users.map(u => ({
      uid: u.uid,
      email: u.email,
      disabled: u.disabled,
      customClaims: u.customClaims || {},
      metadata: u.metadata
    }));
    return res.json({ users });
  } catch (error) {
    console.error('[Admin API] Error al listar usuarios:', error);
    return res.status(500).json({ error: 'Error al obtener usuarios', details: error.message });
  }
});

// 2. Eliminar un usuario por UID
app.delete('/api/admin/users/:uid', checkAuth, checkSuperAdmin, async (req, res) => {
  const { uid } = req.params;
  try {
    if (req.user.uid === uid) {
      return res.status(400).json({ error: 'No podés eliminar tu propia cuenta de Super Usuario activa.' });
    }
    await getAuth().deleteUser(uid);
    return res.json({ success: true, message: `Usuario ${uid} eliminado correctamente.` });
  } catch (error) {
    console.error(`[Admin API] Error al eliminar usuario ${uid}:`, error);
    return res.status(500).json({ error: 'Error al eliminar usuario', details: error.message });
  }
});

// 3. Blanquear / Resetear contraseña de un usuario
app.post('/api/admin/users/:uid/reset-password', checkAuth, checkSuperAdmin, async (req, res) => {
  const { uid } = req.params;
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    await getAuth().updateUser(uid, { password: newPassword });
    return res.json({ success: true, message: `Contraseña blanqueada con éxito para el usuario.` });
  } catch (error) {
    console.error(`[Admin API] Error al blanquear contraseña de usuario ${uid}:`, error);
    return res.status(500).json({ error: 'Error al blanquear contraseña', details: error.message });
  }
});

// 4. Asignar / Quitar rol de SuperAdmin (Custom Claim)
app.post('/api/admin/users/:uid/role', checkAuth, checkSuperAdmin, async (req, res) => {
  const { uid } = req.params;
  const { isAdmin } = req.body;

  try {
    await getAuth().setCustomUserClaims(uid, { admin: !!isAdmin, superadmin: !!isAdmin });
    return res.json({ success: true, message: `Rol actualizado correctamente.` });
  } catch (error) {
    console.error(`[Admin API] Error al actualizar rol de usuario ${uid}:`, error);
    return res.status(500).json({ error: 'Error al actualizar rol', details: error.message });
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
