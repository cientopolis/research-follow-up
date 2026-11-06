import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import {
  isSuperAdminToken,
  isSparqlUpdate,
  parseCorsOrigins,
  isWeakSuperAdminPassword,
} from './server/security.js';

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
const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins }));
}
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;
const GRAPHDB_URL = process.env.GRAPHDB_URL || 'http://localhost:7200';
const REPO = process.env.GRAPHDB_REPOSITORY || 'researcherDB';
const USER = process.env.GRAPHDB_USER;
const PASSWORD = process.env.GRAPHDB_PASSWORD;
const INITIAL_RULESET = process.env.GRAPHDB_RULESET; // 'rdfsplus-optimized' o 'owl-max-optimized' (OWL-DL)

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
        if (process.env.NODE_ENV === 'production' && isWeakSuperAdminPassword(SUPERADMIN_PASSWORD)) {
          console.warn('[SuperAdmin Init] SUPERADMIN_PASSWORD ausente o débil (< 12 caracteres o valor por defecto): no se crea el usuario automáticamente en producción.');
          return;
        }
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

// SuperAdmin Middleware (Checks verified custom claims or exact SUPERADMIN_EMAIL configured on server)
const checkSuperAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Acceso no autorizado.' });
  }
  if (isSuperAdminToken(req.user, SUPERADMIN_EMAIL)) {
    return next();
  }
  return res.status(403).json({ error: 'Acceso denegado: Se requiere rol de Super Usuario.' });
};

// Endpoint para consultar perfil y rol del usuario autenticado (permite validar SUPERADMIN_EMAIL desde el servidor)
app.get('/api/auth/me', checkAuth, (req, res) => {
  return res.json({
    uid: req.user.uid,
    email: req.user.email || '',
    isSuperAdmin: isSuperAdminToken(req.user, SUPERADMIN_EMAIL),
  });
});

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
          uri: `http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/${uriSuffix}`,
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
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Falta el parámetro "query" válido en el cuerpo de la solicitud.' });
  }

  const isUpdate = isSparqlUpdate(query);
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

// 5. Blanquear / Resetear la Base de Datos de GraphDB (elimina recursos de aplicación y usuarios conservando ontologías VIVO, DBLP y CSO)
app.post('/api/admin/reset-db', checkAuth, checkSuperAdmin, async (req, res) => {
  const resetQuery = `
    DELETE { ?s ?p ?o }
    WHERE {
      ?s ?p ?o .
      FILTER(
        STRSTARTS(STR(?s), "http://cientopolis.lifia.info.unlp.edu.ar/rfu/") ||
        STRSTARTS(STR(?s), "http://cientopolis.org/rfu/") ||
        STRSTARTS(STR(?s), "http://example.org/") ||
        STRSTARTS(STR(?p), "http://cientopolis.lifia.info.unlp.edu.ar/rfu/") ||
        STRSTARTS(STR(?p), "http://cientopolis.org/rfu/") ||
        STRSTARTS(STR(?p), "http://example.org/") ||
        (isURI(?o) && (
          STRSTARTS(STR(?o), "http://cientopolis.lifia.info.unlp.edu.ar/rfu/") ||
          STRSTARTS(STR(?o), "http://cientopolis.org/rfu/") ||
          STRSTARTS(STR(?o), "http://example.org/")
        ))
      )
    }
  `;

  try {
    const endpoint = `${GRAPHDB_URL}/repositories/${REPO}/statements`;
    const headers = getGraphDBHeaders('application/x-www-form-urlencoded');
    const body = new URLSearchParams({ update: resetQuery }).toString();

    console.log(`[Admin API] Ejecutando blanqueo/reset de base de datos en ${endpoint}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Admin API] Error en GraphDB al blanquear base: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'Error al blanquear la base de datos en GraphDB',
        details: errorText
      });
    }

    // Invalidar caché de miembros de LIFIA por si hay recargas inmediatas
    lifiaMembersCache = { data: null, fetchedAt: 0 };

    return res.status(200).json({
      success: true,
      message: 'Base de datos blanqueada correctamente. Se conservaron las ontologías base (VIVO, DBLP, CSO).'
    });
  } catch (error) {
    console.error('[Admin API] Error al blanquear la base de datos:', error);
    return res.status(500).json({
      error: 'Error al conectar con GraphDB para blanquear la base',
      details: error.message
    });
  }
});

// 6. Consultar el motor de inferencia (ruleset) activo en GraphDB
app.get('/api/graphdb/ruleset', checkAuth, async (req, res) => {
  const query = `
    PREFIX sys: <http://www.ontotext.com/owlim/system#>
    SELECT ?ruleset WHERE {
      _:s sys:defaultRuleset ?ruleset
    }
  `;
  try {
    const params = { query };
    const endpoint = `${GRAPHDB_URL}/repositories/${REPO}?${new URLSearchParams(params).toString()}`;
    const headers = getGraphDBHeaders('application/x-www-form-urlencoded');
    const response = await fetch(endpoint, { method: 'GET', headers });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: 'Error al consultar ruleset en GraphDB', details: errorText });
    }

    const data = await response.json();
    const activeRuleset = data?.results?.bindings?.[0]?.ruleset?.value || 'rdfsplus-optimized';
    return res.status(200).json({
      ruleset: activeRuleset,
      available: [
        { id: 'rdfsplus-optimized', label: 'RDFS-Plus (Optimized) — Motor actual por defecto' },
        { id: 'owl-max-optimized', label: 'OWL-DL / OWL-Max (Optimized) — Razonamiento completo OWL-DL' }
      ]
    });
  } catch (error) {
    console.error('[GraphDB Ruleset API] Error al obtener ruleset:', error);
    return res.status(500).json({ error: 'Error al obtener motor de inferencia de GraphDB', details: error.message });
  }
});

// 7. Cambiar el motor de inferencia (ruleset) en GraphDB entre el actual (rdfsplus-optimized) y OWL-DL (owl-max-optimized)
app.post('/api/graphdb/ruleset', checkAuth, checkSuperAdmin, async (req, res) => {
  const { ruleset } = req.body;
  const ALLOWED_RULESETS = {
    'rdfsplus-optimized': 'RDFS-Plus (Optimized)',
    'owl-max-optimized': 'OWL-DL / OWL-Max (Optimized)',
    'owl-dl': 'OWL-DL / OWL-Max (Optimized)'
  };

  if (!ruleset || !ALLOWED_RULESETS[ruleset]) {
    return res.status(400).json({
      error: 'Motor de inferencia no válido. Use "rdfsplus-optimized" o "owl-max-optimized" (OWL-DL).'
    });
  }

  const targetRuleset = ruleset === 'owl-dl' ? 'owl-max-optimized' : ruleset;
  const endpoint = `${GRAPHDB_URL}/repositories/${REPO}/statements`;
  const headers = getGraphDBHeaders('application/x-www-form-urlencoded');

  const runSysUpdate = async (sparqlUpdate) => {
    const body = new URLSearchParams({ update: sparqlUpdate }).toString();
    const resp = await fetch(endpoint, { method: 'POST', headers, body });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`GraphDB ${resp.status}: ${errText}`);
    }
  };

  try {
    console.log(`[GraphDB Ruleset API] Cambiando motor de inferencia a '${targetRuleset}' en repositorio ${REPO}...`);
    // 1. Verificar si el ruleset ya está registrado en el repositorio para evitar recompilación innecesaria
    const listQuery = `PREFIX sys: <http://www.ontotext.com/owlim/system#> SELECT ?r WHERE { _:s sys:listRulesets ?r }`;
    const listUrl = `${GRAPHDB_URL}/repositories/${REPO}?${new URLSearchParams({ query: listQuery }).toString()}`;
    const listResp = await fetch(listUrl, { method: 'GET', headers });
    let loadedRulesets = [];
    if (listResp.ok) {
      const listData = await listResp.json();
      loadedRulesets = (listData?.results?.bindings || []).map(b => b.r?.value);
    }

    if (!loadedRulesets.includes(targetRuleset)) {
      await runSysUpdate(`PREFIX sys: <http://www.ontotext.com/owlim/system#> INSERT DATA { _:b sys:addRuleset "${targetRuleset}" }`);
    }
    // 2. Establecerlo como ruleset por defecto
    await runSysUpdate(`PREFIX sys: <http://www.ontotext.com/owlim/system#> INSERT DATA { _:b sys:defaultRuleset "${targetRuleset}" }`);
    // 3. Re-ejecutar inferencia sobre los enunciados existentes
    await runSysUpdate(`PREFIX sys: <http://www.ontotext.com/owlim/system#> INSERT DATA { _:b sys:reinfer [] }`);

    return res.status(200).json({
      success: true,
      ruleset: targetRuleset,
      label: ALLOWED_RULESETS[targetRuleset],
      message: `Motor de inferencia actualizado a ${ALLOWED_RULESETS[targetRuleset]} (${targetRuleset}) y grafo re-inferido.`
    });
  } catch (error) {
    console.error('[GraphDB Ruleset API] Error cambiando motor de inferencia:', error);
    return res.status(500).json({
      error: 'Error al cambiar el motor de inferencia en GraphDB',
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

app.listen(PORT, async () => {
  console.log(`==================================================`);
  console.log(` Servidor backend escuchando en puerto ${PORT}`);
  console.log(` Conectado a GraphDB en: ${GRAPHDB_URL}`);
  console.log(` Repositorio activo: ${REPO}`);
  console.log(`==================================================`);

  if (INITIAL_RULESET) {
    const target = INITIAL_RULESET === 'owl-dl' ? 'owl-max-optimized' : INITIAL_RULESET;
    if (target === 'rdfsplus-optimized' || target === 'owl-max-optimized') {
      try {
        const headers = getGraphDBHeaders('application/x-www-form-urlencoded');
        const checkQuery = `PREFIX sys: <http://www.ontotext.com/owlim/system#> SELECT ?r WHERE { _:s sys:defaultRuleset ?r }`;
        const checkResp = await fetch(`${GRAPHDB_URL}/repositories/${REPO}?${new URLSearchParams({ query: checkQuery }).toString()}`, { method: 'GET', headers });
        if (checkResp.ok) {
          const checkData = await checkResp.json();
          const current = checkData?.results?.bindings?.[0]?.r?.value;
          if (current && current !== target) {
            console.log(`[GraphDB Init] Aplicando GRAPHDB_RULESET='${target}' (actual: '${current}')...`);
            const statementsUrl = `${GRAPHDB_URL}/repositories/${REPO}/statements`;
            for (const q of [
              `PREFIX sys: <http://www.ontotext.com/owlim/system#> INSERT DATA { _:b sys:addRuleset "${target}" }`,
              `PREFIX sys: <http://www.ontotext.com/owlim/system#> INSERT DATA { _:b sys:defaultRuleset "${target}" }`,
              `PREFIX sys: <http://www.ontotext.com/owlim/system#> INSERT DATA { _:b sys:reinfer [] }`
            ]) {
              await fetch(statementsUrl, { method: 'POST', headers, body: new URLSearchParams({ update: q }).toString() });
            }
            console.log(`[GraphDB Init] Motor de inferencia establecido en '${target}'.`);
          }
        }
      } catch (e) {
        console.warn(`[GraphDB Init] No se pudo verificar/aplicar GRAPHDB_RULESET al iniciar: ${e.message}`);
      }
    }
  }
});
