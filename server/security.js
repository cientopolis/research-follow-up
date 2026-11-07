// Rol SuperAdmin: por custom claims verificados en el ID token o coincidencia exacta con SUPERADMIN_EMAIL del servidor
export const isSuperAdminToken = (decoded, superAdminEmail = '') => {
  if (!decoded) return false;
  if (decoded.admin === true || decoded.superadmin === true) return true;
  const configured = (superAdminEmail || '').trim().toLowerCase();
  const tokenEmail = (decoded.email || '').trim().toLowerCase();
  if (configured && tokenEmail && tokenEmail === configured) {
    return true;
  }
  return false;
};

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

export const mapLifiaPositionToVivoType = (pos) => {
  const p = (pos || '').toLowerCase().trim();
  if (p.includes('posgrado') || p.includes('phd') || p.includes('doctorando') || p.includes('maestr')) {
    return 'http://vivoweb.org/ontology/core#GraduateStudent';
  }
  if (p.includes('grado') || p.includes('undergraduate') || p.includes('becario de entrenamiento') || p.includes('tesista de grado')) {
    return 'http://vivoweb.org/ontology/core#UndergraduateStudent';
  }
  return 'http://vivoweb.org/ontology/core#FacultyMember';
};

// Parsea el HTML de https://memorias.lifia.ar/members extrayendo cada tarjeta de miembro completa
export const parseLifiaMembersHtml = (html, baseUrl = 'https://memorias.lifia.ar') => {
  if (typeof html !== 'string' || !html) return [];
  const membersMap = new Map();
  const parts = html.split(/<a[^>]+href="(\/members\/[^"]+)"[^>]*>/i);

  for (let i = 1; i < parts.length; i += 2) {
    const relativeUrl = parts[i];
    const nextChunk = parts[i + 1] || '';
    const cardEndIdx = nextChunk.indexOf('</div></a></div>');
    const cardHtml = cardEndIdx !== -1 ? nextChunk.slice(0, cardEndIdx) : nextChunk;

    const imgMatch =
      cardHtml.match(/<img[^>]+alt="([^"]*)"[^>]+src="([^"]+)"/i) ||
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
      const cleanH3 = h3Match[1]
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
      const uriSuffix = slug
        .split('-')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      membersMap.set(slug, {
        slug,
        uriSuffix,
        uri: `http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/${uriSuffix}`,
        name: rawName,
        position: position || 'Investigador',
        vivoType: mapLifiaPositionToVivoType(position),
        degree,
        email,
        tags,
        photoUrl: photoUrl || '',
        profileUrl: `${baseUrl.replace(/\/$/, '')}${relativeUrl}`,
      });
    }
  }

  return Array.from(membersMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
};
