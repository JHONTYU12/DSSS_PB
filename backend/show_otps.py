#!/usr/bin/env python3
"""
Script para mostrar códigos TOTP actuales de usuarios demo.
Ejecutar dentro del contenedor backend.
"""

from app.db.session import SessionIdentidad
from app.db import models
import pyotp

def show_current_otps():
    db = SessionIdentidad()
    try:
        users = db.query(models.User).all()
        print("Códigos TOTP actuales para usuarios de demostración:")
        print("=" * 60)
        for u in users:
            totp = pyotp.TOTP(u.totp_secret)
            current_code = totp.now()
            print(f"Usuario: {u.username}")
            print(f"Rol: {u.role}")
            print(f"Código OTP actual: {current_code}")
            print(f"Secret (para configurar app): {u.totp_secret}")
            print("-" * 40)
    finally:
        db.close()

if __name__ == "__main__":
    show_current_otps()