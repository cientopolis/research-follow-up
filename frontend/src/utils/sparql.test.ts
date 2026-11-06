import { describe, it, expect } from 'vitest';
import {
  SparqlInputError,
  escapeSparqlString,
  lit,
  iri,
  httpIri,
  num,
  isValidIri,
  isValidUriSuffix,
} from './sparql';

// Gramática SPARQL 1.1: STRING_LITERAL_QUOTE ::= '"' ( ([^#x22#x5C#xA#xD]) | ECHAR )* '"'
const SPARQL_STRING_LITERAL_RE = /^"(?:[^"\\\n\r]|\\[tbnrf\\"'])*"$/;

describe('utils/sparql', () => {
  describe('escapeSparqlString & lit', () => {
    it('escapa barras invertidas y comillas evitando el bypass \\"', () => {
      const payload = 'Ana \\" ; DROP ALL ; #';
      const formatted = lit(payload);
      expect(formatted).toBe('"Ana \\\\\\" ; DROP ALL ; #"');
      expect(SPARQL_STRING_LITERAL_RE.test(formatted)).toBe(true);
    });

    it('escapa saltos de línea, retornos de carro, tabs y comillas simples', () => {
      const formatted = lit("Línea 1\nLínea 2\r\t'fin'");
      expect(formatted).toBe('"Línea 1\\nLínea 2\\r\\t\\\'fin\\\'"');
      expect(SPARQL_STRING_LITERAL_RE.test(formatted)).toBe(true);
    });

    it('soporta etiquetas de idioma válidas y rechaza las inválidas', () => {
      expect(lit('Investigación', { lang: 'es-AR' })).toBe('"Investigación"@es-AR');
      expect(() => lit('x', { lang: 'es" ; DROP' })).toThrow(SparqlInputError);
    });

    it('soporta tipos de datos (datatype IRI)', () => {
      expect(
        lit('2026-11-06T12:00:00Z', { datatype: 'http://www.w3.org/2001/XMLSchema#dateTime' })
      ).toBe('"2026-11-06T12:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>');
    });

    it('valida ida y vuelta sobre múltiples entradas arbitrarias contra STRING_LITERAL_QUOTE', () => {
      const samples = [
        '',
        'simple',
        'con "comillas" dobles',
        'C:\\Users\\nuevo\\archivo.txt',
        '\\',
        '\\"',
        'multi\nlínea\r\ncon\ttabs\b\f',
      ];
      for (const s of samples) {
        const out = lit(s);
        expect(SPARQL_STRING_LITERAL_RE.test(out)).toBe(true);
      }
      expect(escapeSparqlString('a\\"b')).toBe('a\\\\\\"b');
    });
  });

  describe('iri & httpIri', () => {
    it('acepta IRIs válidos y los envuelve en ángulos', () => {
      expect(iri('http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/Node1')).toBe(
        '<http://cientopolis.lifia.info.unlp.edu.ar/rfu/resource/Node1>'
      );
      expect(isValidIri('http://xmlns.com/foaf/0.1/Person')).toBe(true);
    });

    it('rechaza IRIs con >, espacios, comillas o sin esquema', () => {
      expect(() => iri('http://example.org/a>b')).toThrow(SparqlInputError);
      expect(() => iri('http://example.org/a b')).toThrow(SparqlInputError);
      expect(() => iri('http://example.org/a"b')).toThrow(SparqlInputError);
      expect(() => iri('sin-esquema')).toThrow(SparqlInputError);
    });

    it('httpIri exige esquema http o https', () => {
      expect(httpIri('  https://lifia.info.unlp.edu.ar/paper.pdf ')).toBe(
        '<https://lifia.info.unlp.edu.ar/paper.pdf>'
      );
      expect(() => httpIri('ftp://server/file')).toThrow(SparqlInputError);
      expect(() => httpIri('javascript:alert(1)')).toThrow(SparqlInputError);
    });
  });

  describe('num & isValidUriSuffix', () => {
    it('acepta números finitos y rechaza NaN o inyecciones', () => {
      expect(num(120)).toBe('120');
      expect(num('-45.5')).toBe('-45.5');
      expect(() => num('100" ; DROP ALL')).toThrow(SparqlInputError);
      expect(() => num(NaN)).toThrow(SparqlInputError);
    });

    it('valida sufijos de URI seguros', () => {
      expect(isValidUriSuffix('DiegoTorres_2026-A.1')).toBe(true);
      expect(isValidUriSuffix('foo>bar')).toBe(false);
      expect(isValidUriSuffix('con espacio')).toBe(false);
      expect(isValidUriSuffix('')).toBe(false);
    });
  });
});
