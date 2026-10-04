# empresa-app

Sistema de administración de una empresa ficticia que **consume**
`auth-2fa-api-go` como cliente externo: no reimplementa su lógica de
autenticación ni accede a su base de datos. Incluye el flujo real de
registro, login y segundo factor (código por correo, app autenticadora o
aprobación por notificación push desde `auth-2fa-app`), y un panel para un
**superadmin**: usuarios, roles, bloqueos, historial de inicios de sesión,
registro de actividad y un resumen del sistema. El mismo panel está disponible
en el celular desde `auth-2fa-app`.

## Estructura

```
empresa-app/
├── backend/          # Node + Express + PostgreSQL (empresa-backend)
│   ├── src/
│   │   ├── server.js
│   │   ├── config.js
│   │   ├── db.js                 # conexión, esquema y migraciones de la base propia
│   │   ├── middleware/auth.js    # verifica el JWT de la auth-api (JWKS) + bloqueo
│   │   ├── lib/
│   │   │   ├── authApi.js        # cliente HTTP hacia la auth-api (timeout, errores)
│   │   │   ├── localUsers.js     # usuarios locales: roles, bloqueo, búsqueda
│   │   │   ├── audit.js          # registro de actividad
│   │   │   ├── loginHistory.js   # historial de inicios de sesión
│   │   │   ├── stats.js          # resumen del dashboard
│   │   │   ├── blocked.js        # respuesta para cuentas bloqueadas
│   │   │   ├── retention.js      # limpieza automática de historial y actividad
│   │   │   └── asyncHandler.js   # errores de handlers async -> middleware de errores
│   │   └── routes/
│   │       ├── auth.js           # proxy hacia la auth-api (oculta la API key, pone el refresh_token en cookie httpOnly)
│   │       └── me.js             # perfil + panel del superadmin
│   └── .env.example
└── frontend/         # React + Vite
    ├── src/
    │   ├── auth/                 # AuthContext (sesión y renovación), ProtectedRoute
    │   ├── components/           # Navbar, AdminSummary, SecurityCard, TotpSetup, UserSecurityActions
    │   ├── pages/                # registro y confirmación de correo, login (+ push), recuperar contraseña,
    │   │                         # segundo factor, dashboard, usuarios (+ detalle), actividad, cuentas registradas
    │   ├── utils/                # formato de RUT e IP, descripción del navegador
    │   └── api.js                # cliente HTTP hacia empresa-backend
    └── .env.example
```

`auth-2fa-api-go` **no está en este repo**: está desplegada por separado y
este proyecto solo le hace peticiones HTTP.

## Arquitectura

```
Frontend (React)  →  empresa-backend (Node)  →  auth-2fa-api-go (externa)
                         │
                         └──  base Postgres propia (usuarios locales, actividad, historial)
```

El **frontend nunca habla directo con la auth-api** ni conoce su API key.
Todo pasa por `empresa-backend`, que:

1. Agrega el header `X-API-Key` del lado del servidor al llamar a la auth-api.
2. Verifica localmente el `access_token` (JWT RS256) que emite la auth-api,
   usando la clave pública publicada en `/.well-known/jwks.json`. No
   reimplementa el login ni el OTP: solo valida la firma.
3. Resuelve (o crea) el usuario local de esa cuenta, con su rol y su estado
   (activo/bloqueado), en su propia base Postgres, separada por completo de
   la base de la auth-api.

## Flujo de autenticación

1. **Registro** (`/register`): email, usuario, RUT y contraseña.
2. **Confirmar correo** (`/verify-email`): código que llega por correo.
3. **Login** (`/login`): email, usuario o RUT + contraseña.
4. **Elegir segundo factor** (`/elegir-metodo`), **solo en el primer login**
   de cada cuenta:
   - **Código por correo**: se envía el código y sigue a `/verify-otp`.
   - **App autenticadora** (`/configurar-app`): se muestra un código QR (y
     la clave en texto), la persona lo escanea con Google Authenticator,
     Microsoft Authenticator o similar, e ingresa el código de 6 dígitos.
     Al confirmarlo entra directo.

   La elección se guarda en la auth-api recién cuando se completa: si la
   persona abandona a medias, en el próximo login vuelve a ver esta
   pantalla. Tiene 5 minutos para completarla (valor por defecto de la
   auth-api, `OTP_TTL`).
5. **Siguientes logins**: después de la contraseña va directo a
   `/verify-otp` (código del correo o de la app). Si es por correo, puede
   pedir que se reenvíe. **Excepción:** si la cuenta ya emparejó un celular
   con `auth-2fa-app` y activó ahí la aprobación por notificación push, en
   vez del código va a `/aprobar-celular`: espera a que se apruebe desde el
   teléfono (con un número de dos dígitos a confirmar, para evitar que se
   apruebe "a ciegas"), con la opción de caer al código por correo si no se
   puede usar el celular.
6. **Desde el dashboard**, cualquier persona puede activar o desactivar la
   app autenticadora en la tarjeta **Seguridad**.

La sesión se **renueva sola**: el `access_token` dura poco (15 minutos por
defecto en la auth-api) y, cuando vence, el frontend le pide uno nuevo a
`empresa-backend`, que renueva contra la auth-api usando el `refresh_token`
(7 días por defecto) que guarda en una cookie `httpOnly` — nunca lo ve el
navegador (ver "Seguridad"). Las pestañas abiertas se mantienen
sincronizadas. Solo hay que volver a iniciar sesión cuando vence el
`refresh_token` o al presionar "Salir".

### Endpoints de la auth-api que se usan

| Método | Endpoint (auth-api) | Para qué |
|---|---|---|
| POST | `/auth/register` | Crear la cuenta (email, password, username, rut) |
| POST | `/auth/verify-email/confirm` | Confirmar el correo con el código recibido |
| POST | `/auth/verify-email/resend` | Reenviar el código de confirmación |
| POST | `/auth/login` | Valida credenciales, devuelve `login_token` (y `needs_2fa_setup` en el primer login) |
| POST | `/auth/login/send-email-code` | Primer login: elegir código por correo |
| POST | `/auth/login/resend-code` | Reenviar el código de login por correo |
| GET  | `/auth/login/push-status` | Consulta (polling) si el celular ya aprobó el login; en `approved` devuelve `access_token` + `refresh_token` |
| POST | `/auth/login/request-email-code` | Respaldo por correo cuando el login solo ofreció push |
| POST | `/auth/verify-otp` | Valida el código (correo o app), devuelve `access_token` + `refresh_token` |
| POST | `/auth/totp/enroll` | Iniciar la activación de la app autenticadora (devuelve el `otpauth_url` del QR) |
| POST | `/auth/totp/confirm` | Confirmar la activación con el primer código de la app |
| POST | `/auth/totp/disable` | Desactivar la app autenticadora (vuelve el código por correo) |
| POST | `/auth/refresh` | Renovar el par de tokens |
| POST | `/auth/logout` | Revocar el `refresh_token` |
| POST | `/auth/password-reset/request` | Pedir código para restablecer contraseña |
| POST | `/auth/password-reset/confirm` | Confirmar código + nueva contraseña |
| GET  | `/.well-known/jwks.json` | Clave pública para verificar el JWT localmente |
| GET  | `/me` | Perfil (username, rut, método de segundo factor) con el `access_token` |
| GET  | `/system-admin/users?page=&page_size=&q=` | Listar todas las cuentas registradas de este sistema, incluidas las que nunca completaron su primer login. `q` busca por email, usuario o rut |
| POST | `/system-admin/users/{id}/ban` · `/unban` | Bloquear / desbloquear la cuenta (el ban también cierra sus sesiones) |
| POST | `/system-admin/users/{id}/revoke-sessions` | Cerrar todas las sesiones de la cuenta |
| POST | `/system-admin/users/{id}/disable-totp` | Desactivar la app autenticadora de la cuenta |

Todas las llamadas `/auth/*` requieren el header `X-API-Key` (lo agrega
`empresa-backend`, nunca el frontend). `/auth/totp/*` requiere que la
auth-api tenga la app autenticadora habilitada (`TOTP_ENCRYPTION_KEY`). Si
no la tiene, el primer login no pregunta el método (siempre se usa el
correo) y, al intentar activarla desde la tarjeta Seguridad, se muestra el
error que devuelve la auth-api.

Las rutas `/system-admin/*` usan otra credencial, `X-System-Admin-Token`
(`AUTH_API_SYSTEM_ADMIN_TOKEN` en el `.env` del backend): solo sirve para
administrar las cuentas **de este sistema**, y con una cuenta de otro
sistema la auth-api responde 404. Es opcional: sin ella, el panel bloquea
solo localmente y no ofrece cerrar sesiones ni desactivar la app
autenticadora.

## Roles y permisos (en empresa-app, no en la auth-api)

`auth-2fa-api-go` no sabe nada de roles de negocio: solo autentica personas.
Los roles viven **en `empresa-backend`**, en la tabla `local_users`,
enlazados a la cuenta de la auth-api por su id (`sub` del JWT).

- La **primera cuenta de todo el sistema** queda como `superadmin`; todas las
  siguientes entran como `user`.
- Una persona aparece en `local_users` recién cuando **completa su primer
  login** (correo verificado + segundo factor).
- **Siempre queda al menos un superadmin activo**: nadie puede cambiar su
  propio rol ni bloquearse a sí mismo, y si dos superadmin actúan al mismo
  tiempo uno sobre el otro, solo se aplica el primer cambio.

| Acción | superadmin | admin | user |
|---|---|---|---|
| Dashboard con su perfil y tarjeta Seguridad | ✅ | ✅ | ✅ |
| Resumen del sistema en el dashboard | ✅ | ❌ | ❌ |
| Ver usuarios, buscar y filtrar | ✅ | ❌ | ❌ |
| Cambiar roles de otros | ✅ | ❌ | ❌ |
| Bloquear / desbloquear cuentas | ✅ | ❌ | ❌ |
| Ver historial de inicios de sesión | ✅ | ❌ | ❌ |
| Ver registro de actividad | ✅ | ❌ | ❌ |
| Ver todas las cuentas registradas | ✅ | ❌ | ❌ |

> Hoy el rol `admin` no tiene permisos distintos a `user`. Está reservado
> para las funciones que se agreguen más adelante.

## Panel del superadmin

- **Resumen** (en `/dashboard`): total de usuarios, cuántos hay por rol,
  bloqueados, nuevos y activos en los últimos 7 días, inicios de sesión
  exitosos e intentos de cuentas bloqueadas en los últimos 7 días, y los 5
  inicios de sesión más recientes. Las tarjetas de usuarios, bloqueados y
  cada rol llevan a la lista de usuarios ya filtrada.
- **Usuarios** (`/usuarios`): muestra la IP del último ingreso exitoso de
  cada persona. Búsqueda por email, usuario, RUT (con o sin puntos y guion)
  o **IP**: al buscar una IP aparecen todas las cuentas que iniciaron sesión
  desde ella dentro del historial guardado, no solo en su último login. Filtros por rol y estado, y
  paginación de 20 en 20. Los filtros quedan en la URL, así se conservan al
  recargar o al volver desde el detalle.
- **Detalle de un usuario** (`/usuarios/:id`): sus datos, su historial de
  inicios de sesión (fecha, resultado, método, IP y navegador) y la sección
  **Acciones de seguridad**: bloquear/desbloquear, **cerrar todas sus
  sesiones** (si sospechas que alguien más usa la cuenta) y **desactivar su
  app autenticadora** (si perdió el celular; vuelve al código por correo).
  Las dos últimas requieren `AUTH_API_SYSTEM_ADMIN_TOKEN`. Ninguna se puede
  usar sobre la propia cuenta.
- **Bloqueo de cuentas**: una cuenta bloqueada no puede usar empresa-app
  aunque su contraseña y su código sean correctos. Con
  `AUTH_API_SYSTEM_ADMIN_TOKEN` configurado, bloquear también **banea la
  cuenta en la auth-api**, que cierra todas sus sesiones y le impide iniciar
  sesión; desbloquear revierte ambas cosas. Si la auth-api no responde (o
  rechaza la credencial), el bloqueo local se aplica igual y la cuenta queda
  marcada con **"⚠ Reintentar"** en Usuarios hasta que se complete. Sin la
  credencial, el bloqueo es solo local: si la cuenta intenta iniciar
  sesión, la sesión que le entrega la auth-api se revoca en el acto, y si ya
  tenía una abierta, se le rechaza en su siguiente acción.
- **Actividad** (`/actividad`): registro de quién hizo qué, a quién, cuándo
  y desde qué IP. Incluye cambios de rol, bloqueos y desbloqueos (y si se
  aplicaron también en la auth-api), sesiones cerradas y apps
  autenticadoras desactivadas por un superadmin, y cuando alguien activa o
  desactiva su propia app autenticadora. Bloquear/desbloquear y cambiar un
  rol piden un **motivo obligatorio** (máx. 500 caracteres), que queda
  guardado junto a la acción; uno largo se corta en la tabla con un enlace
  "ver completo". Se puede filtrar por quién hizo la acción (email, usuario,
  RUT o IP), a quién le pasó (email, usuario o RUT), tipo de acción y rango
  de fechas. No se puede editar ni borrar desde la app.
- **Cuentas registradas** (`/cuentas-registradas`): todas las cuentas de
  este sistema en la auth-api, incluidas las que nunca completaron su
  primer login (por eso no aparecen en Usuarios) — con su correo, si
  verificaron el correo, si ya eligieron segundo factor y si están
  baneadas. Solo lectura, paginada, con búsqueda por email, usuario o RUT
  (se resuelve en la auth-api, no solo en lo ya cargado, así que funciona
  sin importar cuántas páginas haya). Requiere `AUTH_API_SYSTEM_ADMIN_TOKEN`;
  sin esa credencial no aparece el enlace en el menú.
- **Limpieza automática**: al arrancar el backend y luego una vez al día se
  borran los inicios de sesión de más de **1 año** y la actividad de más de
  **3 años** (configurable con `LOGIN_HISTORY_RETENTION_DAYS` y
  `AUDIT_LOG_RETENTION_DAYS`; `0` = no borrar nunca). Se borra por tandas y,
  si hay varias copias del backend, solo una limpia. La "Última IP" de cada
  persona se guarda en su ficha, así que no se pierde con la limpieza.

## Endpoints propios de empresa-backend

| Método | Endpoint | Quién | Para qué |
|---|---|---|---|
| GET | `/health` | público | Estado del backend |
| POST | `/api/auth/*` | público* | Proxy hacia la auth-api (register, login, verify-otp, totp, etc.) |
| GET | `/api/me` | con sesión | Perfil + rol local |
| GET | `/api/stats` | superadmin | Resumen del dashboard |
| GET | `/api/local-users?q=&role=&status=&page=&pageSize=` | superadmin | Lista de usuarios con búsqueda, filtros y paginación (20 por página, máx. 100) |
| PUT | `/api/local-users/:authUserId/role` | superadmin | Cambiar rol |
| PUT | `/api/local-users/:authUserId/blocked` | superadmin | Bloquear / desbloquear (aquí y en la auth-api; repetirlo reintenta lo pendiente) |
| POST | `/api/local-users/:authUserId/revoke-sessions` | superadmin | Cerrar todas sus sesiones (requiere `AUTH_API_SYSTEM_ADMIN_TOKEN`) |
| POST | `/api/local-users/:authUserId/disable-totp` | superadmin | Desactivar su app autenticadora (requiere `AUTH_API_SYSTEM_ADMIN_TOKEN`) |
| POST | `/api/local-users/:authUserId/reset-pin` | superadmin | Borrar el PIN de otra persona (la auth-api también revoca sus dispositivos y sesiones; crea uno nuevo al volver a entrar). Requiere `AUTH_API_SYSTEM_ADMIN_TOKEN` |
| PUT | `/api/auth/pin` | con sesión | Crear (`pin`) o cambiar (`pin` + `current_pin`) el PIN de la propia cuenta |
| GET | `/api/local-users/:authUserId/logins?before=` | superadmin | Datos + historial de inicios de sesión (de a 50) |
| GET | `/api/audit-log?before=` | superadmin | Registro de actividad (de a 50) |
| GET | `/api/auth-users?page=&page_size=&q=` | superadmin | Todas las cuentas registradas en la auth-api, incluidas las que nunca completaron su primer login. `q` busca por email, usuario o rut (requiere `AUTH_API_SYSTEM_ADMIN_TOKEN`) |
| GET | `/api/auth/login/push-status?login_token=` | público* | Polling de la aprobación por push (ver Flujo de autenticación); `/auth/login/request-email-code`, el respaldo por correo, ya entra en el proxy `POST /api/auth/*` de arriba |

\* Excepto activar o desactivar la app autenticadora desde el perfil
(`/api/auth/totp/*` sin `login_token`), que requiere sesión.

### Cliente móvil (`auth-2fa-app`)

La app Flutter habla solo con este backend, nunca directo con la auth-api, así
que no lleva ninguna API key. Dos diferencias con la web:

- **`refresh_token` en el JSON.** Con el header `X-Client-Platform: mobile`, las
  respuestas de login, `verify-otp`, `totp/confirm`, `devices/login` y `refresh`
  traen el `refresh_token` en el cuerpo en vez de una cookie `httpOnly` (una app
  nativa no tiene cookies; lo guarda en Android Keystore). `POST
  /api/auth/refresh` y `/logout` lo leen del cuerpo. Sin el header todo
  funciona como antes.
- **Rutas solo móviles** (dispositivos de confianza, PIN y aprobación por push):

| Método | Endpoint | Quién | Para qué |
|---|---|---|---|
| POST | `/api/auth/devices/login` | público | Entrar con PIN. Pasa por el mismo control que un login normal: una cuenta bloqueada no recibe tokens y el intento queda en el historial (con el método de la cuenta: el historial solo distingue `otp` y `totp`) |
| POST | `/api/auth/devices/register` | con sesión | Marcar el dispositivo como de confianza (PIN) |
| GET | `/api/auth/devices` | con sesión | Dispositivos de confianza de la cuenta |
| DELETE | `/api/auth/devices/:id` | con sesión | Revocar un dispositivo |
| POST / DELETE | `/api/auth/devices/:id/push` | con sesión | Activar / desactivar la aprobación por push en ese dispositivo |
| POST | `/api/auth/login/push-answer` | con sesión | Responder desde el celular a un login pendiente de otro dispositivo |

### PIN de la cuenta y acciones destructivas

Cada cuenta tiene **un solo PIN de 6 dígitos**, guardado y verificado por la
auth-api (con bloqueo por intentos fallidos). Desbloquea los dispositivos de
confianza de la app móvil y confirma las acciones destructivas del superadmin:
cambiar un rol, bloquear/desbloquear, cerrar sesiones, desactivar la app
autenticadora y resetear el PIN de otra persona.

Con `ADMIN_PIN_ENFORCED=true`, esas rutas exigen el campo `pin` en el cuerpo y
lo verifican en el servidor (`POST /auth/pin/verify`, con la sesión de quien
actúa), así que un token robado no basta para saltarse el control. Errores, todos
con `code`:

| Status | `code` | Cuándo |
|---|---|---|
| 403 | `pin_required` | no mandó el PIN |
| 400 | `pin_invalid_format` | no son 6 dígitos (no gasta un intento) |
| 403 | `pin_invalid` | incorrecto; trae `attempts_left` |
| 423 | `pin_locked` | bloqueado; trae `retry_after_seconds` |
| 409 | `pin_not_set` | la cuenta aún no tiene PIN: debe crearlo con `PUT /api/auth/pin` |

`GET /api/me` trae `features.adminPin` (si se exige) y `pin_set`. Está apagado
por defecto para poder desplegar el backend antes que las apps y encenderlo
cuando ya envíen el PIN. Crear y cambiar el PIN, y el reset por otro superadmin,
quedan en Actividad (`pin_set`, `pin_changed`, `pin_reset`).

**En la web**, con `features.adminPin` activo: cada acción destructiva se
confirma en un diálogo que pide el PIN (y el motivo, en bloqueos y cambios de
rol); un PIN incorrecto deja el diálogo abierto y muestra los intentos que
quedan. Un superadmin sin PIN ve un aviso obligatorio para crearlo al entrar
("Crea tu PIN"), y puede cambiarlo desde la tarjeta Seguridad. En el detalle de
un usuario hay un botón "Resetear PIN". Con la exigencia apagada, la web no
muestra ningún campo de PIN.

Los tests del middleware corren con `npm test` en `backend/`.

## Requisitos previos

- Node.js 20 o superior. El frontend lo exige (React Router 7); el backend
  por sí solo funciona desde Node 18.11 (usa `fetch` nativo y `npm run dev`
  usa `node --watch`).
- PostgreSQL 9.6 o superior, local o gestionado (p. ej. Neon). Las tablas se
  crean y actualizan solas al arrancar el backend; solo hay que crear la
  base vacía.
- La auth-api desplegada y accesible, con una API key válida (`X-API-Key`)

## Instalación y uso local

### 1. Base de datos

Crea una base vacía (el nombre es a elección, p. ej. `empresa_db`):

```bash
createdb -U postgres -h localhost empresa_db
```

En Windows, `createdb` no suele estar en el PATH: se usa con su ruta
completa, p. ej. `"C:\Program Files\PostgreSQL\18\bin\createdb.exe"` (cambia
`18` por tu versión). También se puede crear desde pgAdmin.

### 2. Backend

```bash
cd backend
cp .env.example .env
# completa AUTH_API_URL, AUTH_API_KEY y DATABASE_URL con tus valores reales
npm install
npm run dev
```

Queda escuchando en `http://localhost:4000`.

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Queda escuchando en `http://localhost:5173`.

### 4. Probar el flujo

1. Abre `http://localhost:5173/register` y crea una cuenta.
2. Confirma el código que llega por correo en `/verify-email`.
3. Inicia sesión en `/login` y elige tu segundo factor (correo o app).
4. En `/dashboard` verás tu perfil, tu rol y la tarjeta Seguridad. La
   **primera cuenta es `superadmin`**: verás también el resumen y los
   enlaces a **Usuarios** y **Actividad**.
5. Registra una segunda cuenta y completa su login: aparecerá en
   **Usuarios** como `user`, y podrás cambiarle el rol o bloquearla.

## Resistencia a fallas

- Si la auth-api **no responde, tarda más de 10 s (configurable con
  `AUTH_API_TIMEOUT_MS`) o responde algo inválido** (p. ej. una página de
  error de un proxy), el backend **no se cae**:
  responde `503` con un mensaje claro y el frontend **conserva la sesión**
  para que, al volver el servicio, baste con recargar.
- Mientras la auth-api está caída, las sesiones abiertas siguen funcionando
  si el backend ya tenía guardada su clave pública, y `/api/me` usa el
  usuario y RUT guardados en la base propia.
- Pueden arrancar **varias copias del backend a la vez** contra la misma
  base: la puesta al día de la base se hace por turnos.

## Seguridad

- **La API key de la auth-api (`AUTH_API_KEY`) vive solo en
  `backend/.env`**, nunca en el frontend ni en el navegador. En esta demo
  local está en un `.env` plano por simplicidad; en producción debería
  venir de un gestor de secretos (Vault, AWS Secrets Manager, variables de
  entorno del hosting, etc.), nunca commiteada ni servida al cliente. Lo
  mismo aplica a la contraseña de la base en `DATABASE_URL`.
- El `access_token` se verifica **localmente** vía JWKS (no reimplementa la
  lógica de la auth-api, solo valida la firma RS256 que ella ya emitió).
- El **código QR** de la app autenticadora se genera **dentro del
  navegador**: la clave secreta nunca se envía a servicios externos.
- El frontend guarda solo el `access_token` (dura 15 min) en `localStorage`.
  El `refresh_token` nunca llega al navegador como JSON: `empresa-backend`
  lo deja en una cookie `httpOnly`, `SameSite=Lax` y `Secure` por defecto (así
  que solo viaja por HTTPS) — invisible para JavaScript, un ataque de XSS no
  puede robarlo. En desarrollo local por HTTP, poné `COOKIE_SECURE=false` en
  el `.env` del backend.
- La base de datos de `empresa-backend` es completamente independiente de
  la base de la auth-api: no se comparte ni se accede directamente a ella.
- **Detrás de un proxy** (Nginx, Cloudflare, etc.) hay que configurar
  `trust proxy` en Express; si no, el historial y la actividad guardan la
  IP del proxy en vez de la de cada persona.

## Limitaciones conocidas

- **Si alguien pierde el celular con la app autenticadora activa**, no puede
  entrar por su cuenta: la auth-api no ofrece códigos de respaldo. Un
  superadmin puede desactivarle la app desde el detalle del usuario (requiere
  `AUTH_API_SYSTEM_ADMIN_TOKEN`); después entra con el código por correo.
- Un superadmin que desbloquea una cuenta también le quita el ban en la
  auth-api, aunque ese ban lo hubiera puesto el operador de la auth-api por
  otro motivo (ambos usan el mismo ban).
- En la pantalla del código, la auth-api no indica si la cuenta usa correo
  o app, por eso el texto menciona ambos.
- La búsqueda por IP solo encuentra IPs dentro del plazo que se guarda el
  historial (1 año por defecto).
- No se registran los intentos con contraseña incorrecta (en ese punto no se
  sabe con certeza de qué cuenta son); de eso se encarga la auth-api con su
  bloqueo temporal por intentos fallidos.
- La aprobación por notificación push (ver "Flujo de autenticación") solo
  funciona si la cuenta ya emparejó un celular y activó el push desde
  `auth-2fa-app` — eso se hace en esa app, no en empresa-app. El resto de la
  gestión de dispositivos de confianza (registrar, listar, revocar) también
  vive solo en `auth-2fa-app`.
- Si tu API key fue compartida por accidente en algún lugar público,
  rótala antes de usar este proyecto en algo real.
