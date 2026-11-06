// Rol SuperAdmin: únicamente por custom claims verificados en el ID token
export const isSuperAdminToken = (decoded) =>
  !!decoded && (decoded.admin === true || decoded.superadmin === true);

// Detecta si un texto SPARQL es un UPDATE ignorando comentarios, literales e IRIs
export const isSparqlUpdate = (query) => {
  if (typeof query !== 'string') return false;
  const stripped = query
    // literales largos y cortos ("""…""", '''…''', "…", '…') respetando escapes
    .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""')
    // IRIs <…> (sin espacios, para no comerse comparaciones `?a < ?b`)
    .replace(/<[^<>"{}|^`\\\s]*>/g, '<>')
    // comentarios
    .replace(/#[^\n]*/g, ' ');
  // quitar prólogo PREFIX/BASE y mirar la primera palabra clave
  const body = stripped.replace(/^\s*((PREFIX\s+[\w-]*:\s*<>|BASE\s+<>)\s*)*/i, '');
  return !/^\s*(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/i.test(body);
};

export const parseCorsOrigins = (raw) =>
  (raw || '').split(',').map(s => s.trim()).filter(Boolean);

export const isWeakSuperAdminPassword = (pwd) =>
  !pwd || pwd === 'admin123456' || pwd.length < 12;
