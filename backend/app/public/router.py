"""
PUBLIC API ROUTER - Secure Public Case Search
==============================================

PROPÓSITO:
----------
Este módulo expone una API REST pública (sin autenticación) que permite a cualquier
usuario consultar casos judiciales y sus resoluciones firmadas. Es la única parte
del sistema accesible sin credenciales.

CONSIDERACIONES DE SEGURIDAD CRÍTICAS:
---------------------------------------
1. NO AUTENTICACIÓN REQUERIDA:
   - Cualquier persona puede acceder a estos endpoints
   - No se requiere cookie de sesión ni CSRF token
   
2. SANITIZACIÓN OBLIGATORIA:
   - NUNCA exponer IDs internos de usuarios (created_by, assigned_judge)
   - NUNCA exponer nombres de jueces, secretarios o custodios
   - NUNCA exponer detalles de la firma digital (signature field)
   - Solo exponer: número de caso, título, estado público, texto de resolución, hash
   
3. PREVENCIÓN DE ATAQUES:
   - Rate limiting (10 req/s) implementado en nginx
   - Validación estricta de inputs (Pydantic)
   - Paginación limitada (max 50 items por página)
   - Queries parametrizadas vía ORM (previene SQL injection)
   
4. VERIFICACIÓN PÚBLICA:
   - Hash SHA256 es seguro de exponer (unidireccional)
   - Permite verificar autenticidad sin revelar firmante
   - No se puede revertir un hash a su contenido original

ARQUITECTURA:
-------------
nginx (rate limit) → FastAPI router → PostgreSQL
                   ↓
           Sanitization Layer
                   ↓
              Public JSON

FLUJO TÍPICO:
-------------
1. Usuario ingresa término de búsqueda
2. Frontend hace GET /api/public/cases?q=término
3. Backend consulta BD y sanitiza resultados
4. Retorna solo datos públicos (sin info de funcionarios)
5. Frontend muestra casos en tabla
6. Usuario click en "Ver detalles" → GET /api/public/cases/{case_number}
7. Frontend muestra modal con resolución (si existe y está firmada)
8. Usuario puede verificar hash → GET /api/public/verify/{case_number}?hash=...

DEPENDENCIAS:
-------------
- fastapi: Framework web async
- pydantic: Validación de datos
- sqlalchemy: ORM para consultas seguras
- typing: Type hints para mejor mantenibilidad

CHANGELOG:
----------
2026-01-08: Creación inicial del módulo de API pública
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from ..db.session import SessionSecretaria, SessionJueces  # BD Secretaría + BD Jueces
from ..db import models
from ..audit.logger import log_event

# Crear router con prefijo /public
# Importante: Este router NO se incluye en require_roles_csrf
router = APIRouter(prefix="/public", tags=["public"])


class PublicCaseStatus(str, Enum):
    """
    Enum de estados sanitizados para consumo público.
    
    Mapea los estados internos del workflow a versiones
    amigables que no revelan información del proceso interno.
    
    MAPEO:
    ------
    Estados internos         → Estado público
    CREATED, ASSIGNED        → EN PROCESO
    DRAFT_RESOLUTION         → EN PROCESO  
    RESOLUTION_SIGNED,CLOSED → RESUELTO
    
    RAZÓN: Los estados internos revelan información sobre el workflow
    (quién está trabajando, en qué etapa), lo cual no es público.
    """
    PENDING = "EN PROCESO"  # Caso abierto, aún sin resolución final
    RESOLVED = "RESUELTO"   # Resolución firmada y publicada


def _sanitize_status(internal_status: str) -> str:
    """
    Mapea un estado interno a su versión pública.
    
    Esta función es crítica para seguridad porque evita que
    se filtre información sobre el workflow interno del sistema.
    
    Args:
        internal_status: Estado del modelo Case.status en BD
                        Ejemplos: "CREATED", "RESOLUTION_SIGNED", etc.
    
    Returns:
        Estado sanitizado: "EN PROCESO" o "RESUELTO"
    
    Ejemplo:
        >>> _sanitize_status("RESOLUTION_SIGNED")
        "RESUELTO"
        >>> _sanitize_status("CREATED")
        "EN PROCESO"
    
    SEGURIDAD:
    ----------
    - Nunca retorna estados internos
    - Mapeo consistente (mismo input → mismo output)
    - No permite inferir quién está trabajando en el caso
    """
    # Estados que indican que el caso fue resuelto
    resolved_statuses = ["RESOLUTION_SIGNED", "CLOSED"]
    
    if internal_status in resolved_statuses:
        return PublicCaseStatus.RESOLVED.value
    
    # Cualquier otro estado se considera "en proceso"
    return PublicCaseStatus.PENDING.value


def _sanitize_case_for_public(
    case: models.Case, 
    resolution: Optional[models.Resolution] = None
) -> dict:
    """
    Crea un objeto de caso sanitizado para consumo público.
    
    Esta es LA FUNCIÓN MÁS IMPORTANTE del módulo de seguridad.
    Aquí se decide qué datos se exponen al público.
    
    PRINCIPIO: "Default Deny" - Solo incluir explícitamente lo necesario.
    
    Args:
        case: Objeto Case de SQLAlchemy (tiene TODOS los campos)
        resolution: Objeto Resolution opcional (puede ser None)
    
    Returns:
        Diccionario con SOLO datos públicos:
        {
            "case_number": str,      # Identificador público
            "title": str,            # Título del caso
            "status": str,           # Estado sanitizado
            "has_resolution": bool,  # Si tiene resolución
            "resolution": {          # Solo si está firmada
                "content": str,      # Texto de la resolución
                "signed_date": str,  # Fecha DD-MM-AAAA
                "document_hash": str # SHA256 para verificación
            } or None
        }
    
    CAMPOS EXPLÍCITAMENTE EXCLUIDOS (CRÍTICO):
    -------------------------------------------
    - case.id (int)                    # ID interno secuencial
    - case.created_by (str)            # UUID del secretario
    - case.assigned_judge (str)        # UUID del juez
    - case.created_at (datetime)       # Timestamp creación
    - resolution.id (int)              # ID interno
    - resolution.created_by (str)      # UUID del juez firmante
    - resolution.signature (str)       # Firma digital interna
    - resolution.status (str)          # Estado interno
    
    RAZÓN DE EXCLUSIÓN:
    -------------------
    - IDs: Permiten enumerar registros o inferir volumen
    - UUIDs: Identifican a funcionarios específicos
    - Timestamps detallados: Permiten análisis de patrones de trabajo
    - Firma digital: Contiene metadata que puede identificar al firmante
    
    INCLUIDO Y SEGURO:
    ------------------
    - case_number: Diseñado para ser público (ej: "CASO-2026-001")
    - title: Es información pública del proceso
    - content: El texto de la resolución ES público una vez firmado
    - document_hash: SHA256 es unidireccional, permite verificación
    - signed_date: Solo fecha (sin hora exacta)
    """
    # Crear estructura base con datos seguros
    result = {
        "case_number": case.case_number,  # Identificador público
        "title": case.title,              # Título es público
        "status": _sanitize_status(case.status),  # Sanitizado
        "has_resolution": False,           # Asumimos false
        "resolution": None                 # Asumimos None
    }
    
    # Solo incluir resolución si:
    # 1. Existe (resolution is not None)
    # 2. Está firmada (status == "SIGNED")
    # 
    # Resoluciones en DRAFT no son públicas
    if resolution and resolution.status == "SIGNED":
        result["has_resolution"] = True
        result["resolution"] = {
            # Contenido completo de la resolución
            # Es público una vez firmado
            "content": resolution.content,
            
            # Fecha de firma (sin hora exacta)
            # Format: "YYYY-MM-DD" (estándar ISO)
            # Ejemplo: "2026-01-08"
            "signed_date": (
                resolution.signed_at.strftime("%Y-%m-%d") 
                if resolution.signed_at 
                else None
            ),
            
            # Hash SHA256 del documento
            # Permite verificación pública sin exponer firmante
            # Es un string hexadecimal de 64 caracteres
            # Ejemplo: "b3f58b09b071314ba6da982648300decf1a435a9461c989c77fdbc80dd2d44c5"
            "document_hash": resolution.doc_hash,
            
            # CAMPOS EXPLÍCITAMENTE NO INCLUIDOS:
            # - resolution.signature: Firma grupal interna
            # - resolution.created_by: UUID del juez
            # - resolution.id: ID secuencial interno
        }
    
    return result


class PublicSearchParams(BaseModel):
    """
    Modelo Pydantic para validar parámetros de búsqueda.
    
    Pydantic valida automáticamente:
    - Tipos de datos
    - Longitudes mínimas/máximas
    - Rangos de valores
    - Patrones regex
    
    Si la validación falla, FastAPI retorna 422 automáticamente.
    
    SEGURIDAD:
    ----------
    - max_length: Previene ataques de buffer overflow
    - ge/le: Previene valores absurdos (ej: page=-1)
    - pattern: Previene caracteres maliciosos
    
    Attributes:
        query: Término de búsqueda (max 100 chars)
        status_filter: Filtro opcional por estado público
        page: Número de página (1-100)
        page_size: Items por página (1-50)
    """
    query: str = Field(
        default="",
        max_length=100,
        description="Término de búsqueda para número de caso o título"
    )
    status_filter: Optional[str] = Field(
        default=None,
        pattern="^(EN PROCESO|RESUELTO)?$",  # Solo valores válidos
        description="Filtro por estado público"
    )
    page: int = Field(
        default=1,
        ge=1,      # Mayor o igual a 1
        le=100,    # Menor o igual a 100
        description="Número de página"
    )
    page_size: int = Field(
        default=10,
        ge=1,      # Mínimo 1 item
        le=50,     # Máximo 50 items (previene data dumping)
        description="Items por página"
    )


@router.get("/cases")
def search_public_cases(
    # Query parameters con validación automática
    q: str = Query(
        default="", 
        max_length=100, 
        description="Término de búsqueda"
    ),
    status: Optional[str] = Query(
        default=None, 
        regex="^(EN PROCESO|RESUELTO)?$",
        description="Filtro de estado"
    ),
    page: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=10, ge=1, le=50)
):
    """
    Endpoint público para buscar casos.
    
    ACCESO: Público (sin autenticación)
    MÉTODO: GET
    RUTA: /api/public/cases
    
    Query Parameters:
        q (str, opcional): Término de búsqueda. Busca en case_number y title.
                          Ejemplo: ?q=Caso
        status (str, opcional): Filtro por estado. Valores: "EN PROCESO", "RESUELTO"
                               Ejemplo: ?status=RESUELTO
        page (int, opcional): Número de página (default: 1, max: 100)
        page_size (int, opcional): Items por página (default: 10, max: 50)
    
    Returns:
        JSON:
        {
            "cases": [
                {
                    "case_number": "CASO-001",
                    "title": "Título del caso",
                    "status": "RESUELTO",
                    "has_resolution": true,
                    "resolution": {
                        "content": "Texto...",
                        "signed_date": "2026-01-08",
                        "document_hash": "b3f58b..."
                    }
                },
                ...
            ],
            "pagination": {
                "page": 1,
                "page_size": 10,
                "total": 42,
                "total_pages": 5
            }
        }
    
    GARANTÍAS DE SEGURIDAD:
    -----------------------
    1. No requiere autenticación
    2. Solo retorna datos sanitizados
    3. Nunca expone información de usuarios (jueces, secretarios)
    4. Paginación limitada (previene data dumping completo)
    5. Input validation previene injection attacks
    6. Rate limiting en nginx (10 req/s)
    
    EJEMPLOS DE USO:
    ----------------
    # Buscar todos
    GET /api/public/cases
    
    # Buscar por término
    GET /api/public/cases?q=homicidio
    
    # Filtrar resueltos
    GET /api/public/cases?status=RESUELTO
    
    # Paginación
    GET /api/public/cases?page=2&page_size=20
    
    # Combinado
    GET /api/public/cases?q=robo&status=RESUELTO&page=1
    """
    # Crear sesión de BD
    # Nota: Cada request crea su propia sesión (thread-safe)
    db_secretaria = SessionSecretaria()  # Casos en BD Secretaría
    db_jueces = SessionJueces()  # Resoluciones en BD Jueces
    
    try:
        # Construir query base
        # db.query(models.Case) retorna un objeto Query de SQLAlchemy
        query = db_secretaria.query(models.Case)
        
        # Aplicar filtro de búsqueda si se proporciona
        if q:
            # IMPORTANTE: Usar .ilike() para búsqueda case-insensitive
            # f"%{q}%" permite búsqueda con wildcard (matches en cualquier parte)
            # Ejemplos:
            #   q="Caso" matches "Caso 001", "Resolución del Caso", "CASO-2026"
            #   q="homicidio" matches "Caso de homicidio", "HOMICIDIO CULPOSO"
            search_term = f"%{q}%"
            query = query.filter(
                # Operador | es OR en SQLAlchemy
                # Busca en case_number O en title
                (models.Case.case_number.ilike(search_term)) |
                (models.Case.title.ilike(search_term))
            )
        
        # Aplicar filtro de estado público si se proporciona
        if status == "RESUELTO":
            # Mapear estado público a estados internos
            # Un caso está "resuelto" si tiene resolución firmada o está cerrado
            query = query.filter(
                models.Case.status.in_(["RESOLUTION_SIGNED", "CLOSED"])
            )
        elif status == "EN PROCESO":
            # Cualquier estado que NO sea resuelto
            # Operador ~ es NOT en SQLAlchemy
            query = query.filter(
                ~models.Case.status.in_(["RESOLUTION_SIGNED", "CLOSED"])
            )
        
        # Obtener total de resultados ANTES de paginar
        # Necesario para calcular total_pages
        total = query.count()
        
        # Aplicar paginación
        # offset = (page - 1) * page_size
        # Ejemplo: page=2, page_size=10 → offset=10 (salta primeros 10)
        offset = (page - 1) * page_size
        
        # IMPORTANTE: Ordenar ANTES de paginar
        # Sin ordenar, la paginación puede devolver resultados inconsistentes
        # Ordenamos por case_number alfabéticamente
        cases = query.order_by(
            models.Case.case_number.asc()
        ).offset(offset).limit(page_size).all()
        
        # Construir respuesta sanitizada
        results = []
        for case in cases:
            # Para cada caso, buscar su resolución firmada (si existe)
            # IMPORTANTE: Solo buscar resoluciones con status='SIGNED'
            # Resoluciones en borrador (DRAFT) no son públicas
            resolution = db_jueces.query(models.Resolution).filter(
                models.Resolution.case_id == case.id,
                models.Resolution.status == "SIGNED"
            ).first()  # .first() retorna None si no hay match
            
            # Sanitizar y agregar a resultados
            results.append(_sanitize_case_for_public(case, resolution))
        
        # Calcular total de páginas
        # Redondeo hacia arriba: (total + page_size - 1) // page_size
        # Ejemplo: total=42, page_size=10 → total_pages=5
        total_pages = (total + page_size - 1) // page_size
        
        # Retornar JSON
        # FastAPI serializa automáticamente a JSON
        return {
            "cases": results,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages
            }
        }
    
    finally:
        # CRÍTICO: Siempre cerrar la sesión de BD
        # finally se ejecuta incluso si hay exception
        # Evita conexiones huérfanas que agotan el pool
        db_secretaria.close()
        db_jueces.close()


@router.get("/cases/{case_number}")
def get_public_case(case_number: str):
    """
    Obtener un caso específico por su número.
    
    ACCESO: Público (sin autenticación)
    MÉTODO: GET
    RUTA: /api/public/cases/{case_number}
    
    Path Parameters:
        case_number (str): Número público del caso
                          Ejemplo: "CASO-2026-001"
    
    Returns:
        JSON con estructura idéntica a search_public_cases
        pero solo un objeto (no array)
    
    Raises:
        HTTPException 404: Si el caso no existe
    
    SEGURIDAD:
    ----------
    - Solo expone datos sanitizados
    - NUNCA expone IDs internos o información de usuarios
    - Solo resoluciones firmadas son visibles
    
    EJEMPLOS:
    ---------
    GET /api/public/cases/CASO-2026-001
    
    Response 200:
    {
        "case_number": "CASO-2026-001",
        "title": "Caso de ejemplo",
        "status": "RESUELTO",
        "has_resolution": true,
        "resolution": {
            "content": "...",
            "signed_date": "2026-01-08",
            "document_hash": "b3f58b..."
        }
    }
    
    Response 404:
    {
        "detail": "Caso no encontrado"
    }
    """
    db_secretaria = SessionSecretaria()  # Casos
    db_jueces = SessionJueces()  # Resoluciones
    
    try:
        # Buscar caso por case_number (que es UNIQUE en BD)
        # .filter() retorna Query, .first() ejecuta y retorna primer resultado o None
        case = db_secretaria.query(models.Case).filter(
            models.Case.case_number == case_number
        ).first()
        
        # Si no existe, retornar 404
        if not case:
            raise HTTPException(
                status_code=404, 
                detail="Caso no encontrado"
            )
        
        # Buscar resolución firmada (si existe) en BD Jueces
        resolution = db_jueces.query(models.Resolution).filter(
            models.Resolution.case_id == case.id,
            models.Resolution.status == "SIGNED"
        ).first()
        
        # Sanitizar y retornar
        return _sanitize_case_for_public(case, resolution)
    
    finally:
        db_secretaria.close()
        db_jueces.close()


@router.get("/verify/{case_number}")
def verify_resolution(
    case_number: str, 
    document_hash: str = Query(..., min_length=64, max_length=64)
):
    """
    Verificar la autenticidad de una resolución por su hash.
    
    ACCESO: Público (sin autenticación)
    MÉTODO: GET
    RUTA: /api/public/verify/{case_number}
    
    Este endpoint permite a cualquier persona verificar que una resolución
    es auténtica y no ha sido alterada, sin necesidad de conocer al firmante.
    
    CONCEPTO: Verificación por hash SHA256
    ---------------------------------------
    1. Cuando un juez firma, se calcula SHA256(contenido)
    2. Este hash se guarda en BD (doc_hash)
    3. El hash se muestra públicamente
    4. Cualquiera puede verificar:
       - Obtener el texto de la resolución
       - Calcular SHA256(texto)
       - Comparar con el hash oficial
       - Si coinciden → documento auténtico
       - Si no coinciden → documento alterado
    
    SEGURIDAD:
    ----------
    - Hash SHA256 es unidireccional (no se puede revertir)
    - No expone quién firmó (solo confirma autenticidad)
    - No se puede falsificar un hash sin alterar el documento
    - Cambiar 1 bit del documento → hash completamente diferente
    
    Path Parameters:
        case_number (str): Número del caso
    
    Query Parameters:
        document_hash (str): Hash SHA256 a verificar (64 caracteres hex)
    
    Returns:
        JSON:
        {
            "verified": true,               # Si el hash coincide
            "case_number": "CASO-001",
            "message": "La resolución es auténtica...",
            "signed_date": "2026-01-08"     # Fecha de firma
        }
        
        o
        
        {
            "verified": false,
            "case_number": "CASO-001",
            "message": "No se encontró una resolución firmada con ese hash."
        }
    
    Raises:
        HTTPException 404: Si el caso no existe
    
    EJEMPLO DE USO:
    ---------------
    # Hash correcto
    GET /api/public/verify/CASO-001?document_hash=b3f58b09b071314ba6da982648300decf1a435a9461c989c77fdbc80dd2d44c5
    
    Response 200:
    {
        "verified": true,
        "case_number": "CASO-001",
        "message": "La resolución es auténtica y ha sido firmada digitalmente.",
        "signed_date": "2026-01-08"
    }
    
    # Hash incorrecto
    GET /api/public/verify/CASO-001?document_hash=0000000000000000000000000000000000000000000000000000000000000000
    
    Response 200:
    {
        "verified": false,
        "case_number": "CASO-001",
        "message": "No se encontró una resolución firmada con ese hash."
    }
    """
    db_secretaria = SessionSecretaria()  # Casos
    db_jueces = SessionJueces()  # Resoluciones
    
    try:
        # Buscar el caso
        case = db_secretaria.query(models.Case).filter(
            models.Case.case_number == case_number
        ).first()
        
        if not case:
            raise HTTPException(
                status_code=404, 
                detail="Caso no encontrado"
            )
        
        # Buscar resolución firmada con ese hash específico en BD Jueces
        # Tres condiciones:
        # 1. case_id coincide
        # 2. status == 'SIGNED' (solo firmadas)
        # 3. doc_hash coincide con el proporcionado
        resolution = db_jueces.query(models.Resolution).filter(
            models.Resolution.case_id == case.id,
            models.Resolution.status == "SIGNED",
            models.Resolution.doc_hash == document_hash
        ).first()
        
        # Si encontramos match → verificado
        if resolution:
            return {
                "verified": True,
                "case_number": case_number,
                "message": "La resolución es auténtica y ha sido firmada digitalmente.",
                "signed_date": (
                    resolution.signed_at.strftime("%Y-%m-%d") 
                    if resolution.signed_at 
                    else None
                )
            }
        else:
            # No hay match → hash incorrecto o no existe resolución
            return {
                "verified": False,
                "case_number": case_number,
                "message": "No se encontró una resolución firmada con ese hash."
            }
    
    finally:
        db_secretaria.close()
        db_jueces.close()
