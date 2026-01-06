import hmac
import hashlib
from ..db.session import SessionLocal
from ..db import models
from ..core.settings import settings

def pseudonymize(value: str | None, prefix: str = "") -> str | None:
    """
    Genera un pseudónimo HMAC-SHA256 truncado para un valor.
    El mismo valor siempre produce el mismo pseudónimo (permite correlación).
    Pero no se puede revertir al valor original sin la clave maestra.
    """
    if not value:
        return None
    data = f"{prefix}:{value}".encode("utf-8")
    h = hmac.new(settings.app_master_key.encode("utf-8"), data, hashlib.sha256)
    return h.hexdigest()[:16].upper()  # 16 chars hex = 64 bits, suficiente para pseudónimo

def log_event(actor: str | None, role: str | None, action: str, target: str | None = None,
              ip: str | None = None, success: bool = True, details: str | None = None):
    """
    Registra un evento de auditoría con datos pseudonimizados.
    - actor_pseudo: HMAC del username (para correlación sin revelar identidad)
    - target_pseudo: HMAC del target (caso, resolución, etc.)
    - Los datos reales (actor, target, details) se guardan cifrados o redactados
      dependiendo del nivel de seguridad requerido.
    """
    db = SessionLocal()
    try:
        # Generar pseudónimos para correlación anónima
        actor_pseudo = pseudonymize(actor, "actor")
        target_pseudo = pseudonymize(target, "target") if target else None
        
        # Redactar details para quitar info sensible (números de caso, IDs, usernames)
        safe_details = redact_sensitive_details(details) if details else None
        
        db.add(models.AuditEvent(
            actor=actor,                    # Dato real (solo visible con privilegios especiales)
            actor_pseudo=actor_pseudo,      # Pseudónimo (visible para auditor)
            role=role,                      # Rol genérico (juez, secretario, etc.)
            action=action,
            target=target,                  # Dato real
            target_pseudo=target_pseudo,    # Pseudónimo
            ip=mask_ip(ip),                 # IP parcialmente enmascarada
            success=success,
            details=safe_details            # Details redactados
        ))
        db.commit()
    finally:
        db.close()

def redact_sensitive_details(details: str) -> str:
    """
    Redacta información sensible de los detalles del log.
    Remueve: case_id=X, user=X, username=X, id=X, etc.
    """
    import re
    # Patrones a redactar
    patterns = [
        (r'case_id=\d+', 'case_id=[REDACTED]'),
        (r'user_id=[\w-]+', 'user_id=[REDACTED]'),
        (r'username=\w+', 'username=[REDACTED]'),
        (r'resolution_id=\d+', 'resolution_id=[REDACTED]'),
        (r'request_id=\d+', 'request_id=[REDACTED]'),
        (r'hash=[\w]+', 'hash=[PRESENT]'),
        (r'sig=[\w]+\.\.\.', 'sig=[PRESENT]'),
    ]
    result = details
    for pattern, replacement in patterns:
        result = re.sub(pattern, replacement, result)
    return result

def mask_ip(ip: str | None) -> str | None:
    """
    Enmascara parcialmente la IP para privacidad.
    IPv4: 192.168.1.100 -> 192.168.x.x
    """
    if not ip:
        return None
    parts = ip.split('.')
    if len(parts) == 4:
        return f"{parts[0]}.{parts[1]}.x.x"
    return ip[:len(ip)//2] + "..."  # Para IPv6 u otros formatos
