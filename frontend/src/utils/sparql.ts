export class SparqlInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SparqlInputError';
  }
}

const ECHAR: Record<string, string> = {
  '\\': '\\\\',
  '"': '\\"',
  "'": "\\'",
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
};

/**
 * Escapes characters inside a SPARQL string literal according to SPARQL 1.1 ECHAR rules.
 */
export const escapeSparqlString = (value: string): string =>
  value.replace(/[\\"'\n\r\t\b\f]/g, (c) => ECHAR[c]);

const IRI_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>"{}|^`\\]*$/;

/**
 * Checks whether a string is a valid SPARQL IRI reference (no spaces or forbidden chars).
 */
export const isValidIri = (value: string): boolean => IRI_RE.test(value);

/**
 * Formats an IRI enclosed in `<...>`. Throws SparqlInputError if invalid.
 */
export const iri = (value: string): string => {
  if (!isValidIri(value)) {
    throw new SparqlInputError(`IRI inválido: ${value}`);
  }
  return `<${value}>`;
};

/**
 * Formats an HTTP(S) URL entered by a user as an IRI `<https://...>`.
 */
export const httpIri = (value: string): string => {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) {
    throw new SparqlInputError('La URL debe comenzar con http:// o https://');
  }
  return iri(v);
};

/**
 * Formats a SPARQL string literal `"..."`, optionally with `@lang` or `^^<datatype>`.
 */
export const lit = (
  value: string | number,
  opts: { lang?: string; datatype?: string } = {}
): string => {
  const base = `"${escapeSparqlString(String(value))}"`;
  if (opts.lang) {
    if (!/^[a-zA-Z]+(-[a-zA-Z0-9]+)*$/.test(opts.lang)) {
      throw new SparqlInputError(`Etiqueta de idioma inválida: ${opts.lang}`);
    }
    return `${base}@${opts.lang}`;
  }
  return opts.datatype ? `${base}^^${iri(opts.datatype)}` : base;
};

/**
 * Validates that a value is a finite number and returns its canonical string representation.
 */
export const num = (value: unknown): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new SparqlInputError(`Número inválido: ${value}`);
  }
  return String(n);
};

/**
 * Validates that a resource URI suffix contains only safe URI unreserved characters.
 */
export const isValidUriSuffix = (s: string): boolean => /^[A-Za-z0-9._~-]+$/.test(s);
