# LexSecure SFAS (MVP seguro) — Docker

## Levantar (1 comando)
```bash
docker compose up -d --build
```

## URLs
- Frontend (React): http://localhost/
- API (FastAPI): http://localhost/api
- Swagger: http://localhost/api/docs

## Flujo de login (MFA TOTP)
1) Entra al Frontend -> Login con usuario/clave
2) Ingresa el OTP del Google Authenticator
3) El sistema crea sesión segura (cookie HttpOnly) y un token CSRF (cookie no-HttpOnly)
4) La UI ya puede operar por rol

## Usuarios demo (se imprimen UNA sola vez en logs si la BD está vacía)
- admin / Admin!2026_SFAS
- juez1 / Juez!2026_SFAS
- secret1 / Secret!2026_SFAS
- cust1 / Cust!2026_SFAS
- cust2 / Cust!2026_SFAS
- audit1 / Audit!2026_SFAS

Ver logs:
```bash
docker logs sfas_backend --tail 200
```
