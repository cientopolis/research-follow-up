import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSuperAdminToken,
  isSparqlUpdate,
  parseCorsOrigins,
  isWeakSuperAdminPassword,
} from './security.js';

describe('server/security', () => {
  describe('isSuperAdminToken', () => {
    it('rechaza tokens nulos o sin claims de admin aunque tengan email admin@', () => {
      assert.equal(isSuperAdminToken(null), false);
      assert.equal(isSuperAdminToken(undefined), false);
      assert.equal(isSuperAdminToken({ email: 'admin@gmail.com' }), false);
      assert.equal(isSuperAdminToken({ email: 'superadmin@cientopolis.org' }), false);
      assert.equal(isSuperAdminToken({ email: 'admin@cientopolis.org', admin: false }), false);
    });

    it('acepta tokens con custom claims admin: true, superadmin: true o email exacto de SUPERADMIN_EMAIL', () => {
      assert.equal(isSuperAdminToken({ uid: '123', admin: true }), true);
      assert.equal(isSuperAdminToken({ uid: '123', superadmin: true }), true);
      assert.equal(
        isSuperAdminToken({ uid: '123', email: 'Director@lifia.info.unlp.edu.ar' }, 'director@lifia.info.unlp.edu.ar'),
        true
      );
      assert.equal(
        isSuperAdminToken({ uid: '123', email: 'admin@gmail.com' }, 'director@lifia.info.unlp.edu.ar'),
        false
      );
    });
  });

  describe('isSparqlUpdate', () => {
    it('identifica SELECT con palabras reservadas dentro de literales o comentarios como lectura (false)', () => {
      assert.equal(
        isSparqlUpdate('SELECT * WHERE { ?s rdfs:label "delete me" }'),
        false
      );
      assert.equal(
        isSparqlUpdate('SELECT * WHERE { ?s rdfs:label "work with data" } ORDER BY ?s'),
        false
      );
      assert.equal(
        isSparqlUpdate('# insert comment here\nPREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\nSELECT ?s WHERE { ?s ?p ?o }'),
        false
      );
      assert.equal(
        isSparqlUpdate('SELECT ?a ?b WHERE { ?a ?p ?b . FILTER(?a < 10 && ?b > 2) }'),
        false
      );
    });

    it('identifica ASK, CONSTRUCT y DESCRIBE como lectura (false)', () => {
      assert.equal(isSparqlUpdate('ASK WHERE { ?s ?p ?o }'), false);
      assert.equal(isSparqlUpdate('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }'), false);
      assert.equal(isSparqlUpdate('DESCRIBE <http://example.org/res>'), false);
    });

    it('identifica INSERT, DELETE, WITH, CLEAR y DROP como escritura (true)', () => {
      assert.equal(
        isSparqlUpdate('PREFIX ex: <http://example.org/> INSERT DATA { <http://example.org/a> ex:p "1" }'),
        true
      );
      assert.equal(
        isSparqlUpdate('DELETE WHERE { <http://example.org/a> ?p ?o }'),
        true
      );
      assert.equal(
        isSparqlUpdate('WITH <http://example.org/g> DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }'),
        true
      );
      assert.equal(isSparqlUpdate('CLEAR ALL'), true);
      assert.equal(isSparqlUpdate('DROP GRAPH <http://example.org/g>'), true);
    });
  });

  describe('parseCorsOrigins', () => {
    it('devuelve lista vacía si no hay orígenes configurados', () => {
      assert.deepEqual(parseCorsOrigins(''), []);
      assert.deepEqual(parseCorsOrigins(undefined), []);
    });

    it('separa y limpia múltiples orígenes', () => {
      assert.deepEqual(
        parseCorsOrigins(' https://app.example.com , http://localhost:5173 '),
        ['https://app.example.com', 'http://localhost:5173']
      );
    });
  });

  describe('isWeakSuperAdminPassword', () => {
    it('detecta contraseñas vacías, por defecto o cortas', () => {
      assert.equal(isWeakSuperAdminPassword(''), true);
      assert.equal(isWeakSuperAdminPassword(undefined), true);
      assert.equal(isWeakSuperAdminPassword('admin123456'), true);
      assert.equal(isWeakSuperAdminPassword('short123'), true);
      assert.equal(isWeakSuperAdminPassword('StrongPassword#2026!'), false);
    });
  });
});
