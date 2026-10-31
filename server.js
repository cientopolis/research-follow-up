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

// Healthcheck endpoint para Docker y monitoreo
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cache en memoria para perfiles de Memorias@LIFIA (evita peticiones repetidas)
let lifiaMembersCache = {
  data: null,
  fetchedAt: 0
};
const LIFIA_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hora

// Endpoint para obtener miembros, cargos, emails y fotos desde memorias.lifia.info.unlp.edu.ar/members
app.get('/api/lifia-members', checkAuth, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();
    if (!forceRefresh && lifiaMembersCache.data && (now - lifiaMembersCache.fetchedAt) < LIFIA_CACHE_TTL_MS) {
      return res.json({ members: lifiaMembersCache.data, cached: true });
    }

    // Consultamos memorias.lifia.info.unlp.edu.ar/members (y su redirección oficial memorias.lifia.ar/members)
    const targetUrls = [
      'https://memorias.lifia.ar/members?limit=200&page=1',
      'https://memorias.lifia.info.unlp.edu.ar/members?limit=200&page=1'
    ];

    let html = '';
    for (const url of targetUrls) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'ResearchFollowUp/1.0 (+https://lifia.info.unlp.edu.ar)' }
        });
        if (response.ok) {
          const text = await response.text();
          if (text.includes('/members/')) {
            html = text;
            break;
          }
        }
      } catch (fetchErr) {
        console.warn(`[LIFIA Members] Intento fallido en ${url}:`, fetchErr.message);
      }
    }

    if (!html) {
      return res.status(502).json({ error: 'No se pudo obtener el listado de miembros desde Memorias@LIFIA.' });
    }

    const mapPositionToVivoType = (pos) => {
      const p = (pos || '').toLowerCase().trim();
      if (p.includes('posgrado') || p.includes('phd') || p.includes('doctorando') || p.includes('maestr')) {
        return 'http://vivoweb.org/ontology/core#GraduateStudent';
      }
      if (p.includes('grado') || p.includes('undergraduate') || p.includes('becario de entrenamiento') || p.includes('tesista de grado')) {
        return 'http://vivoweb.org/ontology/core#UndergraduateStudent';
      }
      return 'http://vivoweb.org/ontology/core#FacultyMember';
    };

    const membersMap = new Map();
    const cardRegex = /<a[^>]+href="(\/members\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = cardRegex.exec(html)) !== null) {
      const relativeUrl = match[1];
      const cardHtml = match[2];

      const imgMatch = cardHtml.match(/<img[^>]+alt="([^"]*)"[^>]+src="([^"]+)"/i) ||
                       cardHtml.match(/<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"/i);
      const h3Match = cardHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>(?:\s*<span[^>]*>([\s\S]*?)<\/span>)?/i);

      let rawName = '';
      let photoUrl = '';
      let position = '';

      if (imgMatch) {
        if (cardHtml.indexOf('alt=') < cardHtml.indexOf('src=')) {
          rawName = imgMatch[1];
          photoUrl = imgMatch[2];
        } else {
          photoUrl = imgMatch[1];
          rawName = imgMatch[2];
        }
      }

      if (h3Match) {
        const cleanH3 = h3Match[1].replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanH3) rawName = cleanH3;
        if (h3Match[2]) {
          position = h3Match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      } else if (rawName) {
        rawName = rawName.replace(/\s+/g, ' ').trim();
      }

      const degreeMatch = cardHtml.match(/Degree:<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
      const emailMatch = cardHtml.match(/Email:<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
      const degree = degreeMatch ? degreeMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const email = emailMatch ? emailMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      const tagMatches = [...cardHtml.matchAll(/<span class="MuiChip-label[^"]*">#?([^<]+)<\/span>/gi)];
      const tags = tagMatches.map(m => m[1].trim()).filter(Boolean).join(', ');

      if (rawName) {
        const slug = relativeUrl.replace('/members/', '');
        const uriSuffix = slug.split('-').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
        membersMap.set(slug, {
          slug,
          uriSuffix,
          uri: `http://example.org/resource/${uriSuffix}`,
          name: rawName,
          position: position || 'Investigador',
          vivoType: mapPositionToVivoType(position),
          degree,
          email,
          tags,
          photoUrl: photoUrl || '',
          profileUrl: `https://memorias.lifia.info.unlp.edu.ar${relativeUrl}`
        });
      }
    }

    const members = Array.from(membersMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    lifiaMembersCache = { data: members, fetchedAt: now };

    return res.json({ members, cached: false });
  } catch (error) {
    console.error('[LIFIA Members API] Error:', error);
    return res.status(500).json({ error: 'Error al consultar miembros de Memorias@LIFIA', details: error.message });
  }
});

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
