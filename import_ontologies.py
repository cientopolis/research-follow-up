#!/usr/bin/env python3
import os
import urllib.request
import urllib.error
import urllib.parse
import base64
import sys

def parse_env_file(filepath):
    config = {}
    if not os.path.exists(filepath):
        return config
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, val = line.split('=', 1)
                config[key.strip()] = val.strip().strip('"').strip("'")
    return config

def main():
    print("=== Inicializando conexión y carga en GraphDB ===")
    
    # Cargar variables desde .env.local o docker/.env.production si existen, o desde variables de entorno del sistema
    base_dir = os.path.dirname(os.path.abspath(__file__))
    env_local_path = os.path.join(base_dir, '.env.local')
    env_prod_path = os.path.join(base_dir, 'docker', '.env.production')
    
    config = {}
    if os.path.exists(env_prod_path):
        config.update(parse_env_file(env_prod_path))
    if os.path.exists(env_local_path):
        config.update(parse_env_file(env_local_path))
    
    url = os.environ.get('GRAPHDB_URL') or config.get('GRAPHDB_URL') or 'http://localhost:7200'
    # Si en docker/.env.production figura http://graphdb:7200 y el script se corre desde el host Linux, usar localhost:7200
    if '://graphdb:' in url and not os.path.exists('/.dockerenv'):
        url = url.replace('://graphdb:', '://localhost:')
    repo = os.environ.get('GRAPHDB_REPOSITORY') or config.get('GRAPHDB_REPOSITORY') or 'researcherDB'
    user = os.environ.get('GRAPHDB_USER') if 'GRAPHDB_USER' in os.environ else config.get('GRAPHDB_USER')
    password = os.environ.get('GRAPHDB_PASSWORD') if 'GRAPHDB_PASSWORD' in os.environ else config.get('GRAPHDB_PASSWORD')
    
    # Archivos a importar y sus Content-Types
    ontologies = [
        ('VIVO', config.get('PATH_ONTOLOGY_VIVO', './ontologies/vivo.owl'), 'application/rdf+xml'),
        ('DBLP', config.get('PATH_ONTOLOGY_DBLP', './ontologies/dblp-schema.ttl'), 'text/turtle'),
        ('CSO', config.get('PATH_ONTOLOGY_CSO', './ontologies/CSO.3.5.ttl'), 'text/turtle')
    ]
    
    # Endpoint para subir enunciados (statements)
    statements_endpoint = f"{url.rstrip('/')}/repositories/{repo}/statements"
    print(f"Target Endpoint: {statements_endpoint}")
    
    # Crear cabecera de autenticación
    headers = {}
    if user and password:
        auth_str = f"{user}:{password}"
        auth_b64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
        headers['Authorization'] = f"Basic {auth_b64}"
        print(f"Autenticación configurada para el usuario: {user}")
    
    # Probar conexión al repositorio haciendo una consulta ASK básica (SPARQL)
    repo_url = f"{url.rstrip('/')}/repositories/{repo}?query=ASK+WHERE+%7B+%3Fs+%3Fp+%3Fo+%7D"
    print(f"Probando conexión a {url.rstrip('/')}/repositories/{repo}...")
    
    req = urllib.request.Request(repo_url, headers=headers, method='GET')
    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                print("¡Conexión exitosa a GraphDB!")
    except urllib.error.URLError as e:
        print(f"Error al conectar a GraphDB: {e}")
        print("Asegúrate de que GraphDB esté corriendo y de que el repositorio exista.")
        sys.exit(1)

    # Si se pasa el argumento --reset o --clear, blanquear todos los statements del repositorio antes de recargar las ontologías
    if '--reset' in sys.argv or '--clear' in sys.argv:
        print(f"🧹 Blanqueando / reseteando todos los datos del repositorio '{repo}'...")
        reset_req = urllib.request.Request(statements_endpoint, headers=headers, method='DELETE')
        try:
            with urllib.request.urlopen(reset_req) as response:
                print(f"-> Repositorio '{repo}' blanqueado exitosamente (HTTP {response.status}).")
        except urllib.error.HTTPError as e:
            print(f"Error de HTTP al blanquear el repositorio: {e.code} - {e.read().decode('utf-8', errors='ignore')}")
            sys.exit(1)
        except Exception as e:
            print(f"Error inesperado al blanquear el repositorio: {e}")
            sys.exit(1)
        
    # Cargar cada ontología
    for name, path, content_type in ontologies:
        if not os.path.exists(path):
            print(f"Advertencia: No se encontró el archivo de ontología {path}. Omitiendo {name}.")
            continue
            
        print(f"Cargando ontología {name} ({path}) como {content_type}...")
        
        try:
            with open(path, 'rb') as f:
                data = f.read()
                
            req_headers = headers.copy()
            req_headers['Content-Type'] = content_type
            
            # PUT para reemplazar el grafo o POST para añadir
            # Usamos POST para añadir sentencias al repositorio
            upload_req = urllib.request.Request(
                statements_endpoint,
                data=data,
                headers=req_headers,
                method='POST'
            )
            
            with urllib.request.urlopen(upload_req) as response:
                print(f"-> {name} cargada correctamente. Código de respuesta: {response.status}")
                
        except urllib.error.HTTPError as e:
            print(f"Error de HTTP cargando {name}: {e.code} - {e.read().decode('utf-8', errors='ignore')}")
        except Exception as e:
            print(f"Error inesperado cargando {name}: {e}")

    # Configurar motor de inferencia (ruleset) si se indica por CLI (--ruleset=...) o en GRAPHDB_RULESET
    target_ruleset = os.environ.get('GRAPHDB_RULESET') or config.get('GRAPHDB_RULESET')
    for arg in sys.argv[1:]:
        if arg.startswith('--ruleset='):
            target_ruleset = arg.split('=', 1)[1].strip()
        elif arg == '--owl-dl':
            target_ruleset = 'owl-max-optimized'

    if target_ruleset:
        if target_ruleset == 'owl-dl':
            target_ruleset = 'owl-max-optimized'
        print(f"⚙️ Configurando motor de inferencia en GraphDB a '{target_ruleset}'...")
        sys_updates = [
            f'PREFIX sys: <http://www.ontotext.com/owlim/system#> INSERT DATA {{ _:b sys:addRuleset "{target_ruleset}" }}',
            f'PREFIX sys: <http://www.ontotext.com/owlim/system#> INSERT DATA {{ _:b sys:defaultRuleset "{target_ruleset}" }}',
            f'PREFIX sys: <http://www.ontotext.com/owlim/system#> INSERT DATA {{ _:b sys:reinfer [] }}'
        ]
        for sparql_update in sys_updates:
            try:
                body = urllib.parse.urlencode({'update': sparql_update}).encode('utf-8')
                req_headers = headers.copy()
                req_headers['Content-Type'] = 'application/x-www-form-urlencoded'
                sys_req = urllib.request.Request(statements_endpoint, data=body, headers=req_headers, method='POST')
                with urllib.request.urlopen(sys_req):
                    pass
            except Exception as e:
                print(f"Advertencia al aplicar ruleset '{target_ruleset}': {e}")
        print(f"-> Motor de inferencia '{target_ruleset}' activo y grafo re-inferido.")

if __name__ == '__main__':
    main()
