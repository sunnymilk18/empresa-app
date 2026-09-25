# empresa-app

Proyecto demo de una empresa ficticia que **consume** `auth-2fa-api-go` como
cliente externo — no reimplementa su lógica de autenticación ni su base de
datos. Incluye un flujo real de registro/login/2FA por correo y un CRUD de
negocio (`clientes`) con roles propios (`admin` / `user`).

## Estructura

```
empresa-app/
├── backend/          # Node + Express + SQLite (empresa-backend)
│   ├── src/
│   │   ├── server.js
│   │   ├── config.js
│   │   ├── db.js               # esquema SQLite propio de la empresa
│   │   ├── middleware/auth.js  # verifica el JWT de la auth-api (JWKS)
│   │   ├── lib/localUsers.js   # roles locales (admin/user)
│   │   └── routes/
│   │       ├── auth.js         # proxy hacia la auth-api (oculta la API key)
│   │       ├── me.js           # perfil + administración de roles
│   │       └── clientes.js     # CRUD protegido
│   └── .env.example
└── frontend/         # React + Vite
    ├── src/
    │   ├── auth/                # AuthContext, ProtectedRoute
    │   ├── pages/                # Register, VerifyEmail, Login, VerifyOtp, Dashboard, Clientes
    │   └── api.js                # cliente HTTP hacia empresa-backend
    └── .env.example
```

`auth-2fa-api-go` **no está en este repo** — ya está desplegada por separado
y este proyecto solo le hace peticiones HTTP.

## Arquitectura del flujo de autenticación

```
Frontend (React)  →  empresa-backend (Node)  →  auth-2fa-api-go (externa)
                         │
                         └──  base SQLite propia (roles + clientes)
```

El **frontend nunca habla directo con la auth-api** ni conoce su API key.
Todo pasa por `empresa-backend`, que:

1. Agrega el header `X-API-Key` del lado del servidor al llamar a la auth-api.
2. Verifica localmente el `access_token` (JWT RS256) que la auth-api emite,
   usando la clave pública publicada en `/.well-known/jwks.json` — **sin**
   volver a implementar el login ni el OTP, solo validando la firma.
3. Resuelve (o crea) el rol de negocio (`admin`/`user`) de esa cuenta en su
   propia base SQLite, separada por completo de la base de la auth-api.

### Endpoints de la auth-api que se usan

| Método | Endpoint (auth-api)              | Para qué |
|---|---|---|
| POST | `/auth/register`                 | Crear la cuenta (email, password, username, rut) |
| POST | `/auth/verify-email/confirm`     | Confirmar el correo con el código recibido |
| POST | `/auth/verify-email/resend`      | Reenviar el código de confirmación |
| POST | `/auth/login`                    | Paso 1: valida credenciales, devuelve `login_token` |
| POST | `/auth/login/send-email-code`    | Solo si el login devuelve `needs_2fa_setup: true` |
| POST | `/auth/verify-otp`               | Paso 2: valida el código OTP, devuelve `access_token` + `refresh_token` |
| POST | `/auth/refresh`                  | Renovar el par de tokens |
| POST | `/auth/logout`                   | Revocar el `refresh_token` |
| GET  | `/.well-known/jwks.json`         | Clave pública para verificar el JWT localmente |
| GET  | `/me`                             | Enriquecer el perfil (username, rut) con el `access_token` |
| POST | `/auth/password-reset/request`   | Pedir código para restablecer contraseña |
| POST | `/auth/password-reset/confirm`   | Confirmar código + nueva contraseña |
| POST | `/auth/totp/enroll`              | Iniciar activación de app autenticadora (solo backend, sin UI) |
| POST | `/auth/totp/confirm`             | Confirmar activación de app autenticadora (solo backend, sin UI) |
| POST | `/auth/totp/disable`             | Desactivar app autenticadora (solo backend, sin UI) |

Todas las llamadas `/auth/*` requieren el header `X-API-Key` (lo agrega
`empresa-backend`, nunca el frontend).

### Roles dentro de la empresa (no en la auth-api)

`auth-2fa-api-go` no sabe nada de roles de negocio — solo autentica
personas. Los roles viven **en `empresa-backend`**, en la tabla
`local_users` (SQLite), enlazados a la cuenta de la auth-api por su id
(`sub` del JWT):

- La **primera cuenta que se registra en toda la demo** queda como `admin`
  automáticamente (para poder probar los dos roles sin tocar la base a
  mano).
- Todas las cuentas siguientes entran como `user`.
- Un `admin` puede promover/degradar a otras cuentas desde
  `PUT /api/local-users/:authUserId/role`.

Permisos del CRUD de `clientes` en esta demo:

| Acción | admin | user |
|---|---|---|
| Ver lista / detalle | ✅ | ✅ |
| Crear | ✅ | ❌ |
| Editar | ✅ | ❌ |
| Eliminar | ✅ | ❌ |

## Requisitos previos

- Node.js 18 o superior (usa `fetch` nativo)
- La auth-api ya desplegada y accesible, con una API key válida (`X-API-Key`)

## Instalación y uso local

### 1. Backend

```bash
cd backend
cp .env.example .env
# completa AUTH_API_URL y AUTH_API_KEY con tus valores reales
npm install
npm run dev
```

Queda escuchando en `http://localhost:4000`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Queda escuchando en `http://localhost:5173`.

### 3. Probar el flujo

1. Abre `http://localhost:5173/register` y crea una cuenta (email,
   usuario, rut, contraseña).
2. Revisa el correo y confirma el código en `/verify-email`.
3. Inicia sesión en `/login` con email/usuario/rut + contraseña.
4. Ingresa el código OTP que llega por correo en `/verify-otp`.
5. Ya en `/dashboard` verás tu perfil (traído de la auth-api) y tu rol
   local. La **primera cuenta creada es `admin`**; regístrate con una
   segunda cuenta para ver la vista de `user` (solo lectura) en
   `/clientes`.

## Seguridad

- **La API key de la auth-api (`AUTH_API_KEY`) vive solo en
  `backend/.env`**, nunca en el frontend ni en el navegador. En esta demo
  local está en un `.env` plano por simplicidad; en producción debería
  venir de un secret manager (Vault, AWS Secrets Manager, variables de
  entorno del hosting, etc.), nunca commiteado ni servido al cliente.
- El `access_token` se verifica **localmente** vía JWKS (no reimplementa
  la lógica de la auth-api, solo valida la firma RS256 que ella ya emitió).
- Para esta demo, el frontend guarda `access_token`/`refresh_token` en
  `localStorage` (simple de levantar en local). En una app de producción
  real, lo más seguro es que el `refresh_token` viva en una cookie
  `httpOnly` puesta por `empresa-backend`, no accesible desde JavaScript.
- La base de datos de `empresa-backend` (SQLite) es completamente
  independiente de la base de datos de la auth-api — no se comparte ni se
  accede directamente a ella.

## Estado actual de validación de la API key

Durante la validación local de la demo, la API key de `auth-2fa-api-go`
funcionó inicialmente, pero después dejó de validarse y la auth-api respondió
con errores `401` al intentar autenticar. Este bloqueo afecta el flujo real de
registro/login/OTP, aunque la arquitectura del proyecto y la integración con el
backend quedan correctas.

La causa más probable es que la clave haya sido invalidada, rota o rotada por la
API externa, o que la cabecera `X-API-Key` deje de ser aceptada por el servicio.
En ese caso, la solución es regenerar la API key en el proveedor, actualizar el
valor en `backend/.env` y probar nuevamente el flujo completo desde el backend.

> El frontend nunca debe contener la API key. La validación debe seguir existiendo
> solo del lado del backend, y la clave debe renovarse si el servicio externo la
> invalida.

## Notas

- El backend ya sabe proxyar `password-reset` (con UI en `/forgot-password`)
  y `TOTP` (`enroll`/`confirm`/`disable`, sin UI — requiere que la auth-api
  tenga `TOTP_ENCRYPTION_KEY` configurada; si no, esos endpoints devuelven
  404 tal cual la auth-api).
- `auth-2fa-api-go` puede tener habilitados otros métodos de 2FA
  (notificación push) o dispositivos de confianza, que quedan fuera del
  alcance de esta demo.
- Si tu API key fue compartida por accidente en algún lugar público,
  rótala antes de usar este proyecto en algo real.
