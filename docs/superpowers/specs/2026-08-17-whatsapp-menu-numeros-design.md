# Insumos Pereira — menú numerado del bot WhatsApp

**Fecha:** 2026-08-17  
**Producto:** Navegación por números (1, 2, 3…) en el bot de consulta, sin perder texto libre ni el transporte WAHA / Meta Cloud API.  
**Issue padre:** https://github.com/wWordDevw/acopio-pereira/issues/1  
**Extiende:** `2026-08-17-whatsapp-bot-design.md` (diálogo, inventario, zonas) y `2026-08-17-whatsapp-providers-design.md` (puerto `messaging`).  
**Estado:** spec de brainstorming; pendiente de aprobación del archivo escrito.

---

## Contexto

El bot ya responde en 1:1: interpreta texto (`parseVoz` + zonas + MiniMax si hace falta), consulta `GET /api/consultar` y manda una plantilla (máx. 3 puntos). El transporte es intercambiable (`WHATSAPP_PROVIDER=waha|meta`) vía `bot/src/messaging/`. El diálogo solo ve `{ from, messageId, text, hasMedia, fromMe, isGroup }` y responde `{ send, text }`.

Hoy, si la persona no sabe qué escribir, recibe un párrafo («¿Qué buscas? Comida, medicinas…»). En la calle, en el celular, es más fácil pulsar **1** que inventar la frase.

Meta Cloud API ya está implementada como adaptador (`messaging/meta.js`). Esta entrega **no** vuelve a construir Cloud API. Tiene que **seguir funcionando** igual que WAHA: el menú es texto de sesión, no botones ni listas interactivas.

---

## Decisiones

| Tema | Decisión |
|------|----------|
| Modelo | **Híbrido.** «cobijas en Cuba» y «pañales» siguen contestando como hoy. `hola` / `menú` / `0` / no se entiende → menú numerado. |
| Tras categoría | Zona **opcional**: 1 ver todos (top 3 ciudad por stock), 2 lista numerada de barrios, o escribir el barrio. |
| Tras resultados | La lista de puntos es informativa (Cómo llegar + ficha). **0** vuelve al menú. Pueden escribir otra consulta. No se elige el punto 1/2/3. |
| Implementación | Máquina de pantallas en `bot/src/menu.js`. `dialog.js` orquesta; no se infla con el árbol. |
| Transporte | **Agnóstico.** Solo `sendText` del puerto actual. Cero cambios de contrato en `messaging/port.js`, `waha.js`, `meta.js`. |
| Compatibilidad Meta | Obligatoria. Mismos textos, mismos números, mismo `IncomingMessage`. Sin `type: interactive` de Graph, sin botones/listas de WAHA. |
| 0 | Siempre vuelve a la pantalla **inicio**. No gasta el cupo de 3 turnos de «no entendí». |
| 3 turnos | Solo texto libre que no cierra (pedir dato / no entendí). Navegar con números no cuenta. |
| Tono | Español corto, emergencia. Sin emojis de relleno. |

---

## Fuera de alcance

- Botones, listas o plantillas interactivas de WAHA o de Cloud API (`interactive`, HSM).
- Elegir un punto de la lista por número para ver más ficha.
- Registrar stock por WhatsApp.
- STT / audio útil.
- Cambiar el puerto `messaging`, el factory, o las env `META_*` / `WAHA_*`.
- Dos proveedores vivos a la vez, failover, o iniciar conversación fuera de la ventana de 24 h.
- Nuevo path de webhook o cambios en Traefik / PWA / API de inventario.

Si más adelante se quieren botones de Meta, sería otra entrega: ampliar el puerto (`sendInteractive`) en **ambos** adaptadores. No se hace aquí.

---

## Pantallas (lo que ve la persona)

Todas son mensajes de texto. Pie común cuando hay menú: `0 Menú`.

### Inicio

Se muestra cuando:

- `hola`, `hi`, `buenas`, `ayuda`, `menu`, `menú`, `start`
- el texto es exactamente `0`
- no se entiende (reglas + LLM fallan)
- se pide categoría y no hay una en curso

```
Puedo decirte qué hay y a dónde ir.
Escribe el número o el insumo y el barrio (ej: cobijas en Cuba).

1 Comida
2 Medicinas
3 Higiene
4 Niños
5 Cobijas
6 Agua
7 Ropa
8 Mascotas
9 Mapa
0 Menú
```

`9` responde con el link de `PUBLIC_WEB` (`https://insumos.vowtech.lat`) y **deja** la pantalla en inicio (pueden seguir eligiendo 1–8).

Orden de 1–8 = orden de `CATEGORIAS` sin `otro`. No se ofrece `otro`.

### Zona (después de elegir 1–8)

```
Cobijas — ¿dónde?

1 Ver todos
2 Elegir barrio
0 Menú

También puedes escribir el barrio (ej: Cuba).
```

`1` consulta sin zona (top 3 por stock, igual que hoy).  
`2` pasa a la pantalla **barrios**.  
Texto que matchea una zona V1 → consulta con esa zona.

### Barrios

Lista numerada de `ZONAS` en el orden actual del archivo (`centro`, `cuba`, `boston`, `el-poblado`, `consota`, `circunvalar`, `dosquebradas`, `la-virginia`, `expofuturo`, `utp`, `alamos`):

```
Elige el barrio:

1 Centro
2 Cuba
…
11 Álamos
0 Menú
```

Un número válido consulta con esa zona + la categoría ya elegida. Texto que matchea `matchZona` también vale.

### Resultados

Misma plantilla de inventario de hoy (`textoRespuesta`: header, 1–3 puntos, Cómo llegar, ficha). Si no hay stock o cae la API, mismos textos de hoy.

Al pie de **todas** las respuestas de consulta, error de API, sin stock y rate limit se añade:

```
0 Menú
```

Así, tras ver puntos, `0` vuelve al inicio. Una frase nueva («agua en Boston») arranca otra consulta.

### Fuera de rango / basura en una pantalla de menú

Si la pantalla es `inicio` | `zona` | `barrios` y el texto es un número que no es opción, se **reenvía la misma pantalla** (no se llama al LLM, no se gasta turno de «no entendí»).

Si el texto no es número, se intenta texto libre (`interpretar`). Semántica **igual que hoy**:

- «cobijas en Cuba» o solo «pañales» → consulta al toque (ciudad si no hay zona). **No** se interpone el menú de zona.
- «necesito agua cerca» → pantalla **zona** (categoría ya puesta).
- No entiende → pantalla inicio.

El menú de zona opcional (1 ver todos / 2 barrios) **solo** aparece al elegir 1–8 por número, o cuando el texto libre pide zona («cerca») y ya hay categoría.

### Audio / foto / sticker

Igual que hoy: pedir texto. Si había una pantalla de menú, se **conserva** (el siguiente «4» sigue valiendo).

---

## Estado

Misma clave: id de WhatsApp canónico (`from` en dígitos, ya normalizado por el adaptador). TTL 15 min. No se guarda en SQLite.

```
{
  pantalla: "inicio" | "zona" | "barrios" | "resultados",
  categoria: string | null,   // slug de CATEGORIAS, nunca "otro"
  zona: object | null,        // matchZona o null
  turno: number,              // solo texto libre que no cierra
  actualizadoAt: number
}
```

Tras una consulta exitosa o «no hay stock» / API caída: `pantalla = "resultados"`, `categoria` y `zona` en `null` (la próxima consulta no hereda).  
En `resultados`, solo `0` / `menú` / `hola` son navegación. Un `4` suelto **no** elige categoría: pasa a `interpretar` y, si no entiende, a inicio.  
`0` / `menú` / `hola`: `pantalla = "inicio"`, se limpia categoría/zona, `turno` no incrementa.

Rate limit (20/hora) e idempotencia (`messageId`) no cambian. El `from` ya es dígitos en ambos proveedores; el menú no debe asumir `@c.us`.

---

## Orden al llegar un mensaje

El diálogo **no** importa WAHA ni Meta.

1. Ignorar `fromMe` / grupos. Idempotencia. Rate limit. Media sin texto → pedir texto.
2. Si el texto (folded) es `0` / `menu` / `menú` / `hola` / `hi` / `buenas` / `ayuda` / `start` → mostrar **inicio**.
3. Si hay `pantalla` de menú (`inicio` | `zona` | `barrios`) y el texto es un entero 0–N → `menu.resolve(pantalla, n, estado)`:
   - `inicio` 1–8 → ir a **zona** con esa categoría
   - `inicio` 9 → texto del mapa; quedarse en inicio
   - `zona` 1 → consultar sin zona
   - `zona` 2 → **barrios**
   - `barrios` 1–N → consultar con `ZONAS[n-1]`
   - fuera de rango → reenviar pantalla
4. Si no: `interpretar(texto)` + LLM fallback como hoy.
   - Si sale consulta completa → consultar.
   - Si hay categoría y falta zona (dijeron «cerca») → pantalla **zona** (ya no el párrafo suelto «¿en qué barrio?»).
   - Si no hay categoría / no entiende → **inicio** (ya no `textoPedirCategoria` / `textoNoEntendi` sueltos).
5. `GET /api/consultar` + `textoRespuesta`. Pie `0 Menú`.

`menu.js` es puro: entrada `{ pantalla, n, categoria }` + lista de zonas → `{ next, categoria, zona, consultar, text }`. Sin `fetch`, sin LLM, sin messaging.

Al llegar a `MAX_TURNS` (3) de texto libre que no cierra: se muestra **inicio** y se resetea `turno`. Ya no se manda el párrafo suelto `textoNoEntendi`. Así no quedan atrapados sin el menú.

Las plantillas de menú viven en `plantilla.js` (`textoMenuInicio`, `textoMenuZona`, `textoMenuBarrios`, `textoMapa`, helper `conPieMenu`). `textoAyuda` pasa a ser el menú de inicio (un solo texto; los tests que buscan «cobijas en Cuba» siguen pasando).

---

## Compatibilidad Meta / WAHA (obligatoria)

El anillo de dominio no conoce el proveedor.

```
WhatsApp (WAHA o Cloud API)
        │  POST /wa-hook
        ▼
  messaging.parseIncoming     ← sin cambios
        │  IncomingMessage (from = dígitos, text)
        ▼
  dialog + menu + plantilla   ← solo esta entrega
        │  { send, text }
        ▼
  messaging.sendText          ← type: text en Graph; sendText en WAHA
```

Reglas:

- No añadir campos al `IncomingMessage` ni a `sendText`.
- No ramificar `if (provider === "meta")` en diálogo ni menú.
- Los números van **dentro del cuerpo** (`"4"`, `"0"`). Cloud API y WAHA entregan eso en `text`.
- Tests del menú usan `handleIncoming` con mensajes canónicos; no fixtures Graph ni WAHA.
- Tests existentes de `messaging-meta`, `messaging-waha`, `messaging-create` y `webhook` deben seguir verdes **sin** editar adaptadores salvo que un test de contrato se rompa por un cambio accidental (entonces revertir el adaptador).
- Límite práctico: Cloud API acepta texto de sesión hasta 4096 caracteres. Las pantallas de este spec caben de sobra. No se parte el menú de barrios.

Ventana de 24 h de Meta: el usuario escribe primero (número o frase). `sendText` de sesión sigue siendo válido. No se necesitan plantillas HSM para el menú.

---

## Errores

| Situación | Qué ve la persona |
|-----------|-------------------|
| Número fuera de rango | La misma pantalla otra vez. |
| No entiende texto libre | Menú inicio. |
| Media | Pedir texto; menú en curso se conserva. |
| Sin stock | Plantilla actual + `0 Menú`. |
| API caída | Plantilla actual + `0 Menú`. |
| Rate limit | Plantilla actual + `0 Menú`. |
| MiniMax caído | Menú inicio (no se cae el bot). |
| `sendText` falla (WAHA o Graph) | Igual que hoy: log, webhook 200. El menú no reintenta. |

---

## Pruebas (sin WhatsApp real, sin Graph)

| Capa | Qué |
|------|-----|
| `menu` | `inicio`+5 → zona/cobijas; `zona`+1 → consultar sin zona; `zona`+2 → barrios; `barrios`+2 → Cuba; `0` → inicio; `99` → misma pantalla. |
| `plantilla` | Inicio lista 1–9 y «cobijas en Cuba»; zona nombra la categoría; barrios recorre `ZONAS`; `textoRespuesta` sigue ≤ 3 puntos y ahora termina en `0 Menú`. |
| `dialog` híbrido | «dónde hay pañales» sigue consultando `ninos`. «necesito agua cerca» + «Cuba» sigue usando lat/lng de Cuba. |
| `dialog` menú | `hola` → menú numerado. `5` → menú zona cobijas. `1` → consulta cobijas sin zona. Tras resultados, `0` → inicio. |
| `dialog` barrios | `hola` → `5` → `2` → `2` consulta Cuba + cobijas. |
| Texto en pantalla zona | Tras elegir categoría, «Boston» consulta con Boston. |
| Fuera de rango | En inicio, `99` reenvía inicio; no llama LLM ni API. |
| Media | Conserva pantalla. |
| Rate / idempotencia / API 500 | Siguen; pie `0 Menú` en 500 y rate. |
| `interpretar` | `0` y `menú` son ayuda (o se tratan en diálogo antes). «hola» no cambia. |
| Messaging | Suite actual de Meta y WAHA **sin cambios de expectativa**. |

No hay prueba E2E contra Graph ni contra el chip. Criterio manual (cuando haya número): con `WHATSAPP_PROVIDER=waha` **y**, si hay credenciales, `=meta`, escribir `hola` → menú → `6` → `1` y recibir agua.

---

## Archivos

```
bot/src/menu.js                         # nuevo: resolve + constantes de opciones
bot/src/plantilla.js                    # textos de menú + pie 0 Menú
bot/src/dialog.js                       # orquesta pantallas; pending.pantalla
bot/src/interpretar.js                  # solo si hace falta reconocer 0 / menú
bot/test/menu.test.js                   # nuevo
bot/test/dialog.test.js                 # casos menú + regresiones
bot/test/plantilla.test.js              # menús + pie
bot/test/interpretar.test.js            # si cambia 0 / menú
docs/superpowers/specs/2026-08-17-whatsapp-menu-numeros-design.md
```

No tocar: `bot/src/messaging/**`, `api/src`, `public/`, compose, volúmenes, Dokploy WAHA.

---

## Criterio de listo

- [ ] `cd bot && npm test` verde (incluye tests Meta/WAHA existentes).
- [ ] Híbrido: una frase con insumo+barrio sigue resolviendo en un turno.
- [ ] `hola` / `0` / no entendido muestran el menú 1–9.
- [ ] 1–8 → zona opcional → resultados ≤ 3 + `0 Menú`.
- [ ] Lista de barrios usa `ZONAS` (no hardcode distinto).
- [ ] Cero imports de `messaging` desde `menu.js` / `plantilla.js`.
- [ ] Cero payloads `interactive` / botones. Solo texto.
- [ ] Issue #1 no se cierra solo con esto (falta el bot vivo en prod); esta entrega no lo bloquea ni lo sustituye.

---

## Future

1. Botones de respuesta rápida en Cloud API **y** equivalente WAHA, detrás de un `sendInteractive` en el puerto (ambos adaptadores o no se hace).
2. Elegir punto 1/2/3 para ficha larga.
3. Acortar la lista de barrios a «los más usados» si el menú se siente largo.
4. STT: el texto transcrito entra al mismo `handleIncoming` (números incluidos).
