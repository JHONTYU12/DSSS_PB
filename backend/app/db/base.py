"""
Bases declarativas para cada dominio de datos según arquitectura C4.

Cada base de datos tiene su propia clase Base para garantizar
que las tablas se creen en la base de datos correcta.
"""

from sqlalchemy.orm import DeclarativeBase


class BaseIdentidad(DeclarativeBase):
    """Base para BD Identidades y Acceso (usuarios, sesiones)"""
    pass


class BaseSecretaria(DeclarativeBase):
    """Base para BD Secretaría (casos, expedientes)"""
    pass


class BaseJueces(DeclarativeBase):
    """Base para BD Jueces (resoluciones, firmas, aperturas)"""
    pass


class BaseAuditoria(DeclarativeBase):
    """Base para BD Logs y Auditoría (eventos de seguridad)"""
    pass


# Alias de compatibilidad
Base = BaseIdentidad
