# 💬 LBMessenger

Plataforma de mensajería privada para estudiantes del Liceo, con estilo visual inspirado en **MSN Messenger / Windows XP-7**. Conecta a estudiantes por intereses comunes (k-pop, programación, música, gaming, etc.) en un entorno simple, ligero y enfocado 100% en el chat.

---

## 1. 🧠 Arquitectura del sistema

```
┌─────────────────┐        HTTP (REST API)        ┌──────────────────┐
│   Frontend       │ ─────────────────────────────▶ │   Express.js      │
│ HTML/CSS/JS      │ ◀───────────────────────────── │   (server.js)     │
│ vanilla          │                                 │                    │
│                  │        WebSocket (Socket.io)    │  - Auth (JWT)      │
│                  │ ◀──────────────────────────────▶│  - Rutas REST      │
└─────────────────┘                                 │  - Sockets         │
                                                      └─────────┬──────────┘
                                                                │ Mongoose
                                                      ┌─────────▼──────────┐
                                                      │     MongoDB         │
                                                      │ Users, Chats,       │
                                                      │ Messages, Rooms,    │
                                                      │ FriendRequests,     │
                                                      │ Reports             │
                                                      └─────────────────────┘
```

**Flujo general:**

1. El usuario se registra con su correo `@educacionvillarrica.cl` → se crea el usuario **sin verificar** y se envía un código OTP por correo (Nodemailer).
2. El usuario ingresa el código OTP → se marca como `isVerified: true` y se entrega un **JWT**.
3. Con el JWT, el frontend:
   - Llama a la **API REST** para operaciones puntuales (cargar amigos, historial, perfil, reportes, admin).
   - Abre una **conexión Socket.io** (autenticada con el mismo JWT) para mensajería en tiempo real, indicadores de "escribiendo...", y estado online/ausente/offline.
4. Los mensajes privados pertenecen a un `Chat` (1 a 1). Los mensajes de salas pertenecen a un `Room`. Ambos se guardan como documentos `Message`.
5. Cualquier usuario puede reportar un mensaje ajeno → se crea un `Report`. Los admins solo ven los mensajes reportados (nunca el resto de las conversaciones privadas).
6. El panel `/admin.html` permite a `admin`/`superadmin` revisar reportes, eliminar mensajes y banear usuarios. Solo `superadmin` puede crear/eliminar salas y promover/degradar admins.

---

## 2. 🗂️ Estructura de carpetas

```
lbmessenger/
├── server.js                 # Punto de entrada (Express + Socket.io)
├── package.json
├── .env.example               # Variables de entorno de ejemplo
├── config/
│   └── db.js                  # Conexión a MongoDB
├── models/
│   ├── User.js
│   ├── Chat.js
│   ├── Message.js
│   ├── FriendRequest.js
│   ├── Report.js
│   └── Room.js
├── middleware/
│   ├── auth.js                # Verifica JWT
│   └── admin.js                # requireAdmin / requireSuperAdmin
├── utils/
│   ├── generateOTP.js
│   ├── mailer.js               # Envío de correos OTP (Nodemailer)
│   └── seed.js                 # Crea salas por defecto + superadmin al iniciar
├── routes/
│   ├── auth.js                 # registro, OTP, login
│   ├── users.js                 # perfil, avatares, búsqueda
│   ├── friends.js                # solicitudes y lista de amigos
│   ├── chats.js                   # conversaciones privadas + historial
│   ├── rooms.js                   # salas + historial
│   ├── reports.js                  # reportar mensajes
│   └── admin.js                     # panel de administración
├── sockets/
│   └── index.js                # Lógica de Socket.io (mensajes, typing, estado)
└── public/                     # Frontend estático
    ├── index.html               # Login / Registro / OTP
    ├── chat.html                  # App principal (3 columnas estilo MSN)
    ├── admin.html                  # Panel de administración
    ├── css/style.css
    └── js/
        ├── auth.js
        ├── chat.js
        ├── admin.js
        └── avatars.js
```

---

## 3. 🧱 Modelo de datos (MongoDB / Mongoose)

### User
| Campo | Tipo | Notas |
|---|---|---|
| email | String | único, dominio institucional validado |
| password | String | hash bcrypt |
| nickname | String | público, máx. 20 caracteres |
| avatar | String | uno de una lista fija de avatares |
| nameColor | String | hex color |
| status | enum | `online` / `away` / `offline` |
| role | enum | `user` / `admin` / `superadmin` |
| isVerified | Boolean | requiere OTP confirmado |
| isBanned | Boolean | flag de suspensión |
| otpCode / otpExpiresAt | String/Date | código temporal de verificación |
| friends | [ObjectId → User] | lista de amistades aceptadas |
| profilePhoto | String (Data URI) | foto de perfil real, JPEG o GIF |
| banner | String (Data URI) | banner/portada del perfil, JPEG o GIF |
| profileBackground | String (Data URI) | fondo personalizado de la página de perfil, imagen o GIF |
| bio | String | biografía corta, máx. 500 caracteres |
| links | [{ label, url }] | links personalizados, hasta 6 |
| videos | [{ url, videoId }] | videos de YouTube insertados por URL, hasta 6 |
| blog | { title, html, css, isPublic } | mini sitio personal estilo Neocities, renderizado en iframe sandbox |

### Chat (conversación 1 a 1)
| Campo | Tipo |
|---|---|
| participants | [ObjectId → User] (2) |
| lastMessage | ObjectId → Message |
| lastMessageAt | Date |

### Message
| Campo | Tipo | Notas |
|---|---|---|
| chat | ObjectId → Chat | si es mensaje privado |
| room | ObjectId → Room | si es mensaje de sala |
| sender | ObjectId → User | |
| content | String | máx. 1000 caracteres |
| isDeleted | Boolean | soft-delete (moderación) |
| deletedBy | ObjectId → User | admin que eliminó el mensaje |

### FriendRequest
| Campo | Tipo |
|---|---|
| from / to | ObjectId → User |
| status | `pending` / `accepted` / `rejected` |

### Report
| Campo | Tipo | Notas |
|---|---|---|
| message | ObjectId → Message |
| reportedBy | ObjectId → User |
| messageAuthor | ObjectId → User |
| reason | String |
| messageContentSnapshot | String | copia del contenido al momento del reporte |
| status | `pending` / `reviewed` / `dismissed` |

### Room
| Campo | Tipo |
|---|---|
| name / slug | String |
| description | String |
| icon | String (emoji) |
| isGlobal | Boolean (true solo para el chat general) |

---

## 4. 🔐 Autenticación

- **Registro:** valida que el correo termine en `@educacionvillarrica.cl`, hashea la contraseña con bcrypt, genera un OTP de 6 dígitos y lo envía por correo.
- **Verificación OTP:** compara código y expiración; al validar, marca `isVerified: true` y entrega un JWT.
- **Login:** valida credenciales, exige cuenta verificada y no suspendida, devuelve JWT.
- **JWT:** se envía en `Authorization: Bearer <token>` para la API REST y en `socket.handshake.auth.token` para Socket.io.

---

## 5. ⚙️ Instalación y ejecución

### Requisitos
- Node.js 18+
- MongoDB corriendo localmente o en Atlas
- Una cuenta SMTP (Gmail con "contraseña de aplicación", u otro proveedor) para el envío de OTP

### Pasos

```bash
# 1. Instalar dependencias
cd lbmessenger
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus credenciales de MongoDB y SMTP

# 3. Iniciar el servidor
npm start
# o en desarrollo con recarga automática:
npm run dev
```

Al iniciar, el servidor:
- Se conecta a MongoDB.
- Crea automáticamente las salas por defecto (General, K-pop, Programación, Música, Gaming).
- Asegura que exista el usuario `superadmin` definido en `.env`.

La app queda disponible en `http://localhost:3000`.

> ⚠️ El superadmin puede iniciar sesión directamente con el email/contraseña definidos en `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (no requiere OTP, se crea ya verificado).

---

## 6. 🎨 Diseño UI/UX

- Layout de **3 columnas** fijo: amigos/chats/salas (izquierda) → chat activo (centro) → perfil (derecha).
- Estética retro: barras de título azules tipo Windows, bordes definidos, colores planos, sin animaciones modernas ni scroll infinito.
- Indicadores de estado (online/ausente/offline) como puntos de color sobre el avatar, igual que en MSN.
- Avatares basados en emojis por defecto, con opción de subir foto de perfil, banner y fondo personalizado reales (JPEG/GIF).

---

## 7. 🚦 Reglas de moderación implementadas

- Cualquier usuario puede reportar un mensaje ajeno indicando un motivo obligatorio.
- Los admins **solo** pueden ver mensajes que han sido reportados — nunca tienen acceso de lectura a chats privados completos.
- Acciones de admin: eliminar mensaje reportado (soft-delete), descartar reporte, banear/reactivar usuario.
- Acciones exclusivas de superadmin: promover/degradar admins, crear/eliminar salas temáticas.

---

## 8. 🔌 Eventos de Socket.io

| Evento (cliente → servidor) | Payload | Descripción |
|---|---|---|
| `room:join` | `roomId` | Une al usuario a una sala |
| `room:leave` | `roomId` | Sale de una sala |
| `room:message` | `{ roomId, content }` | Envía mensaje a una sala |
| `chat:message` | `{ chatId, content }` | Envía mensaje privado |
| `chat:typing` | `{ chatId, toUserId }` | Notifica "escribiendo..." |
| `user:setStatus` | `'online' \| 'away'` | Cambia estado manualmente |

| Evento (servidor → cliente) | Payload |
|---|---|
| `room:message` | `{ roomId, message }` |
| `chat:message` | `{ chatId, message }` |
| `chat:typing` | `{ chatId, fromUserId, nickname }` |
| `friend:status` | `{ userId, status }` |

---

## 9. 🚀 Posibles mejoras futuras (no implementadas, fuera de alcance del MVP+)

- Colores/temas, tipografías y efectos personalizables en el perfil.
- Widgets embebibles adicionales (más allá de YouTube).
- Notificaciones push / sonidos estilo MSN ("nudge") persistentes fuera de la sesión activa.
- Creación de salas por parte de usuarios comunes (con aprobación de admin).
- Mensajes con archivos adjuntos.
- Búsqueda dentro del historial de mensajes.

### Perfil ampliado (implementado)

Cada usuario puede personalizar, desde el panel de perfil (`chat.html`):
foto de perfil, banner, fondo personalizado (imagen o GIF) para su página
pública, biografía, links personalizados y videos de YouTube (pegando el
enlace, se valida y se extrae el ID automáticamente). Todo se ve en
`public/profile.html?u=<apodo>`, una página de perfil dedicada a la que se
accede desde el botón "👤 Perfil" en cualquier chat 1 a 1, o desde
"Ver mi perfil público" en el panel propio. La página personal tipo blog
(HTML/CSS libre) sigue siendo una función aparte, accesible desde el botón
"🌐 Página" y enlazada también desde el perfil si está publicada.
