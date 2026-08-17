# Numbered WhatsApp menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menú numerado híbrido en el bot de consulta (1–9 + 0) sin romper texto libre ni el transporte WAHA / Meta Cloud API.

**Architecture:** `menu.js` resuelve pantallas (`inicio` | `zona` | `barrios`) de forma pura. `plantilla.js` emite los textos y el pie `0 Menú`. `dialog.js` orquesta: trigger de inicio → número de menú → texto libre (`interpretar` + LLM) → `GET /api/consultar`. El anillo `messaging/` no se toca: solo `sendText`.

**Tech Stack:** Node 22, ESM, `node:test`, `node:assert/strict`. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-17-whatsapp-menu-numeros-design.md`

**Worktree:** `/home/alore/projects/acopio-pereira/.worktrees/wa-menu-numeros` en `feat/wa-menu-numeros`.

## Global Constraints

- Híbrido: «cobijas en Cuba» / «pañales» consultan al toque. El menú de zona opcional solo al elegir 1–8 por número, o si el texto libre pide zona («cerca»).
- `hola` / `hi` / `buenas` / `ayuda` / `menu` / `menú` / `start` / `0` → pantalla inicio (no gasta `turno`).
- Categorías 1–8 = `CATEGORIAS` sin `otro` (1 Comida … 8 Mascotas). `9` = mapa `PUBLIC_WEB`. `0` = siempre inicio.
- Tras 1–8: menú zona (`1 Ver todos`, `2 Elegir barrio`, o escribir barrio). Barrios = `ZONAS` en orden del archivo.
- Tras resultados no se elige punto 1/2/3. `0` vuelve al menú. Un número suelto en `resultados` va a `interpretar`.
- Pie `0 Menú` en consulta, sin stock, API caída y rate limit.
- `MAX_TURNS` (3) solo para texto libre que no cierra. Al tope: mostrar inicio y resetear `turno`. Números no incrementan `turno`.
- Media sin texto: pedir texto y **conservar** la pantalla de menú.
- Transporte agnóstico. **No editar** `bot/src/messaging/**`. Cero `interactive` / botones. Cero `if (provider === "meta")`.
- No persistir chats. Estado 15 min en memoria. Rate 20/h. Idempotencia por `messageId`. Máx. 3 puntos.
- Importar `CATEGORIAS` / `ETIQUETAS` de `api/src/categorias.js`. No reimplementar el diccionario.
- Tests: `cd bot && npm test` (`node --test test/*.test.js`). Conventional commits.
- Sin estilos inline. Tailwind no aplica (bot es texto).
- `from` es opaco (dígitos en prod; los tests actuales pueden seguir usando `573001112233@c.us`).

### File map

| Path | Responsibility |
|------|----------------|
| `bot/src/plantilla.js` | Textos de menú + `conPieMenu` + pie en respuestas |
| `bot/src/menu.js` | `parseMenuNumber`, `isMenuHomeTrigger`, `resolveMenu` |
| `bot/src/dialog.js` | Orquesta pantallas + texto libre + consultar |
| `bot/src/interpretar.js` | `0` / `menú` → `ayuda` (mismo set que hola) |
| `bot/test/plantilla.test.js` | Menús y pie |
| `bot/test/menu.test.js` | Máquina de pantallas |
| `bot/test/dialog.test.js` | Híbrido + menú + regresiones |
| `bot/test/interpretar.test.js` | `0` y `menú` |
| `bot/src/messaging/**` | **No tocar** |

---

### Task 1: Plantillas de menú y pie `0 Menú`

**Files:**
- Modify: `bot/src/plantilla.js`
- Test: `bot/test/plantilla.test.js`

**Interfaces:**
- Consumes: `ETIQUETAS` from `api/src/categorias.js`; `ZONAS` from `bot/src/zonas.js`; existing `PUBLIC_WEB`
- Produces:
  - `conPieMenu(text: string): string` — appends `\n\n0 Menú` unless the trimmed text already ends with `0 Menú`
  - `textoMenuInicio(): string` — numbered 1–9 + example `cobijas en Cuba` + `0 Menú`
  - `textoMenuZona(categoria: string): string` — `{Etiqueta} — ¿dónde?` + `1 Ver todos` / `2 Elegir barrio` / `0 Menú` + hint de escribir barrio
  - `textoMenuBarrios(): string` — `Elige el barrio:` + `i+1. ZONAS[i].nombre` + `0 Menú`
  - `textoMapa(publicWeb?: string): string` — `Mira el mapa: {base}` + pie
  - `textoAyuda()` — **alias** de `textoMenuInicio()` (un solo texto)
  - `textoRespuesta`, `textoApiCaida`, `textoRateLimit` — same body as today, then `conPieMenu`
  - `textoPedirTexto` — unchanged (media prompt; no pie required)
  - `textoPedirCategoria` / `textoPedirZona` / `textoNoEntendi` — may remain exported for now but dialog will stop using them in Task 3; do not delete in this task

- [ ] **Step 1: Write the failing tests**

Append to `bot/test/plantilla.test.js` (keep existing tests; update the ones that break because of the pie):

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ZONAS } from "../src/zonas.js";
import {
  textoAyuda,
  textoPedirTexto,
  textoRespuesta,
  textoMenuInicio,
  textoMenuZona,
  textoMenuBarrios,
  textoMapa,
  textoRateLimit,
  textoApiCaida,
  conPieMenu,
} from "../src/plantilla.js";

describe("plantilla", () => {
  it("ayuda includes the example", () => {
    assert.match(textoAyuda(), /cobijas en Cuba/);
  });

  it("ayuda is the numbered start menu", () => {
    const t = textoAyuda();
    assert.equal(t, textoMenuInicio());
    assert.match(t, /^1 Comida$/m);
    assert.match(t, /^2 Medicinas$/m);
    assert.match(t, /^3 Higiene$/m);
    assert.match(t, /^4 Niños$/m);
    assert.match(t, /^5 Cobijas$/m);
    assert.match(t, /^6 Agua$/m);
    assert.match(t, /^7 Ropa$/m);
    assert.match(t, /^8 Mascotas$/m);
    assert.match(t, /^9 Mapa$/m);
    assert.match(t, /^0 Menú$/m);
    assert.doesNotMatch(t, /otro/i);
  });

  it("asks for text when media arrives", () => {
    assert.match(textoPedirTexto(), /Escríbeme qué necesitas/);
  });

  it("zero stock points to the map and menu footer", () => {
    const t = textoRespuesta({
      categoria: "cobijas",
      zonaNombre: "Cuba",
      puntos: [],
      publicWeb: "https://insumos.vowtech.lat",
    });
    assert.match(t, /No hay/i);
    assert.match(t, /Cuba/);
    assert.match(t, /insumos\.vowtech\.lat/);
    assert.match(t, /\n\n0 Menú$/);
  });

  it("one point has maps and ficha links and menu footer", () => {
    const t = textoRespuesta({
      categoria: "cobijas",
      zonaNombre: "Cuba",
      publicWeb: "https://insumos.vowtech.lat",
      puntos: [
        {
          id: "abc",
          nombre: "Albergue X",
          lat: 4.8,
          lng: -75.7,
          inventario: [{ categoria: "cobijas", stock: 40 }],
        },
      ],
    });
    assert.match(t, /Albergue X — 40/);
    assert.match(t, /google\.com\/maps\?q=4\.8,-75\.7/);
    assert.match(t, /punto\.html\?id=abc/);
    assert.match(t, /\n\n0 Menú$/);
  });

  it("zona menu names the category", () => {
    const t = textoMenuZona("cobijas");
    assert.match(t, /Cobijas — ¿dónde\?/);
    assert.match(t, /^1 Ver todos$/m);
    assert.match(t, /^2 Elegir barrio$/m);
    assert.match(t, /escribir el barrio/i);
    assert.match(t, /^0 Menú$/m);
  });

  it("barrios menu lists every ZONAS name in order", () => {
    const t = textoMenuBarrios();
    for (const [i, z] of ZONAS.entries()) {
      assert.match(t, new RegExp(`^${i + 1} ${z.nombre}$`, "m"));
    }
    assert.match(t, /^0 Menú$/m);
  });

  it("mapa includes public web and footer", () => {
    const t = textoMapa("https://insumos.vowtech.lat");
    assert.match(t, /insumos\.vowtech\.lat/);
    assert.match(t, /\n\n0 Menú$/);
  });

  it("rate limit and api down include menu footer", () => {
    assert.match(textoRateLimit(), /\n\n0 Menú$/);
    assert.match(textoApiCaida("https://insumos.vowtech.lat"), /\n\n0 Menú$/);
    assert.match(textoApiCaida("https://insumos.vowtech.lat"), /insumos\.vowtech\.lat/);
  });

  it("conPieMenu is idempotent", () => {
    assert.equal(conPieMenu("Hola\n\n0 Menú"), "Hola\n\n0 Menú");
    assert.equal(conPieMenu("Hola"), "Hola\n\n0 Menú");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/alore/projects/acopio-pereira/.worktrees/wa-menu-numeros/bot && node --test test/plantilla.test.js`

Expected: FAIL — `textoMenuInicio` / `conPieMenu` not exported.

- [ ] **Step 3: Implement plantilla helpers**

In `bot/src/plantilla.js`:

- Import `ZONAS` from `./zonas.js`.
- Add:

```js
export function conPieMenu(text) {
  const body = String(text ?? "").replace(/\s+$/u, "");
  if (/(?:^|\n)0 Menú$/u.test(body)) return body;
  return `${body}\n\n0 Menú`;
}

export function textoMenuInicio() {
  return (
    "Puedo decirte qué hay y a dónde ir.\n" +
    "Escribe el número o el insumo y el barrio (ej: cobijas en Cuba).\n" +
    "\n" +
    "1 Comida\n" +
    "2 Medicinas\n" +
    "3 Higiene\n" +
    "4 Niños\n" +
    "5 Cobijas\n" +
    "6 Agua\n" +
    "7 Ropa\n" +
    "8 Mascotas\n" +
    "9 Mapa\n" +
    "0 Menú"
  );
}

export function textoAyuda() {
  return textoMenuInicio();
}

export function textoMenuZona(categoria) {
  const etiq = etiqueta(categoria);
  return (
    `${etiq} — ¿dónde?\n` +
    "\n" +
    "1 Ver todos\n" +
    "2 Elegir barrio\n" +
    "0 Menú\n" +
    "\n" +
    "También puedes escribir el barrio (ej: Cuba)."
  );
}

export function textoMenuBarrios() {
  const lineas = ZONAS.map((z, i) => `${i + 1} ${z.nombre}`);
  return ["Elige el barrio:", "", ...lineas, "0 Menú"].join("\n");
}

export function textoMapa(publicWeb) {
  return conPieMenu(`Mira el mapa: ${webBase(publicWeb)}`);
}
```

- Change `textoRateLimit` to `return conPieMenu("Demasiadas consultas. Prueba en un rato o mira el mapa.");`
- Change `textoApiCaida` to wrap its current sentence with `conPieMenu(...)`.
- At the end of `textoRespuesta`, `return conPieMenu([header, "", ...lineas].join("\n"))` (and the empty-puntos branch too).

Exact menu copy must match the spec (no emojis). `textoPedirTexto` stays as-is.

- [ ] **Step 4: Run plantilla tests**

Run: `cd /home/alore/projects/acopio-pereira/.worktrees/wa-menu-numeros/bot && node --test test/plantilla.test.js`

Expected: PASS. Existing `dialog.test.js` may now fail on exact `textoRateLimit` / `textoApiCaida` equality — that is Task 3. Do not "fix" by removing the pie.

- [ ] **Step 5: Commit**

```bash
git add bot/src/plantilla.js bot/test/plantilla.test.js
git commit -m "feat(bot): numbered menu copy and 0 Menú footer"
```

---

### Task 2: Máquina de pantallas `menu.js`

**Files:**
- Create: `bot/src/menu.js`
- Test: `bot/test/menu.test.js`

**Interfaces:**
- Consumes: `CATEGORIAS` from `api/src/categorias.js`; `ZONAS` from `./zonas.js`; `textoMenuInicio`, `textoMenuZona`, `textoMenuBarrios`, `textoMapa` from `./plantilla.js`
- Produces:
  - `MENU_CATEGORIAS: string[]` — `CATEGORIAS.filter((c) => c !== "otro")` (length 8, index 0 = comida … 7 = mascotas)
  - `parseMenuNumber(text: string): number | null` — trim; only if the whole string is digits (`/^\d+$/`); else `null`. `"04"` is `4`. `""`, `"1a"`, `"  "` → `null`
  - `isMenuHomeTrigger(text: string): boolean` — fold (NFD + strip marks + lower): one of `0`, `menu`, `hola`, `hi`, `buenas`, `ayuda`, `start`
  - `resolveMenu({ pantalla, n, categoria, publicWeb }): { kind: "show"|"consultar"|"stay", next: "inicio"|"zona"|"barrios"|"resultados", categoria: string|null, zona: { id, nombre, lat, lng, radioKm }|null, text: string|null }`
    - `n === 0` → `{ kind: "show", next: "inicio", categoria: null, zona: null, text: textoMenuInicio() }` (any pantalla)
    - `pantalla === "inicio"` + `n` 1–8 → `{ kind: "show", next: "zona", categoria: MENU_CATEGORIAS[n-1], zona: null, text: textoMenuZona(cat) }`
    - `pantalla === "inicio"` + `n === 9` → `{ kind: "stay", next: "inicio", categoria: null, zona: null, text: textoMapa(publicWeb) }`
    - `pantalla === "inicio"` + other n → `{ kind: "show", next: "inicio", categoria: null, zona: null, text: textoMenuInicio() }`
    - `pantalla === "zona"` + `n === 1` → `{ kind: "consultar", next: "resultados", categoria, zona: null, text: null }`
    - `pantalla === "zona"` + `n === 2` → `{ kind: "show", next: "barrios", categoria, zona: null, text: textoMenuBarrios() }`
    - `pantalla === "zona"` + other n → `{ kind: "show", next: "zona", categoria, zona: null, text: textoMenuZona(categoria) }`
    - `pantalla === "barrios"` + `n` 1..`ZONAS.length` → `{ kind: "consultar", next: "resultados", categoria, zona: pick of ZONAS[n-1] as `{ id, nombre, lat, lng, radioKm }` (no aliases), text: null }`
    - `pantalla === "barrios"` + other n → `{ kind: "show", next: "barrios", categoria, zona: null, text: textoMenuBarrios() }`
    - any other `pantalla` → `{ kind: "show", next: "inicio", categoria: null, zona: null, text: textoMenuInicio() }`

- [ ] **Step 1: Write the failing test**

Create `bot/test/menu.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ZONAS } from "../src/zonas.js";
import {
  MENU_CATEGORIAS,
  parseMenuNumber,
  isMenuHomeTrigger,
  resolveMenu,
} from "../src/menu.js";

describe("menu", () => {
  it("MENU_CATEGORIAS is eight slugs without otro", () => {
    assert.deepEqual(MENU_CATEGORIAS, [
      "comida",
      "medicinas",
      "higiene",
      "ninos",
      "cobijas",
      "agua",
      "ropa",
      "mascotas",
    ]);
  });

  it("parseMenuNumber accepts only whole digit strings", () => {
    assert.equal(parseMenuNumber("5"), 5);
    assert.equal(parseMenuNumber(" 09 "), 9);
    assert.equal(parseMenuNumber("0"), 0);
    assert.equal(parseMenuNumber("1a"), null);
    assert.equal(parseMenuNumber("hola"), null);
    assert.equal(parseMenuNumber(""), null);
  });

  it("home triggers include 0, menu with accent, and hola", () => {
    assert.equal(isMenuHomeTrigger("0"), true);
    assert.equal(isMenuHomeTrigger("Menú"), true);
    assert.equal(isMenuHomeTrigger("hola"), true);
    assert.equal(isMenuHomeTrigger("5"), false);
    assert.equal(isMenuHomeTrigger("cobijas"), false);
  });

  it("inicio 5 goes to zona cobijas", () => {
    const r = resolveMenu({ pantalla: "inicio", n: 5, categoria: null });
    assert.equal(r.kind, "show");
    assert.equal(r.next, "zona");
    assert.equal(r.categoria, "cobijas");
    assert.match(r.text, /Cobijas — ¿dónde\?/);
  });

  it("inicio 9 stays on inicio with mapa", () => {
    const r = resolveMenu({
      pantalla: "inicio",
      n: 9,
      categoria: null,
      publicWeb: "https://insumos.vowtech.lat",
    });
    assert.equal(r.kind, "stay");
    assert.equal(r.next, "inicio");
    assert.match(r.text, /insumos\.vowtech\.lat/);
  });

  it("inicio 99 re-shows inicio", () => {
    const r = resolveMenu({ pantalla: "inicio", n: 99, categoria: null });
    assert.equal(r.kind, "show");
    assert.equal(r.next, "inicio");
    assert.match(r.text, /^1 Comida$/m);
  });

  it("zona 1 consults without zone", () => {
    const r = resolveMenu({ pantalla: "zona", n: 1, categoria: "cobijas" });
    assert.equal(r.kind, "consultar");
    assert.equal(r.next, "resultados");
    assert.equal(r.categoria, "cobijas");
    assert.equal(r.zona, null);
  });

  it("zona 2 lists barrios", () => {
    const r = resolveMenu({ pantalla: "zona", n: 2, categoria: "cobijas" });
    assert.equal(r.kind, "show");
    assert.equal(r.next, "barrios");
    assert.match(r.text, /2 Cuba/);
  });

  it("barrios 2 is Cuba", () => {
    const r = resolveMenu({ pantalla: "barrios", n: 2, categoria: "cobijas" });
    assert.equal(r.kind, "consultar");
    assert.equal(r.zona.id, "cuba");
    assert.equal(r.zona.nombre, ZONAS[1].nombre);
    assert.equal(r.zona.lat, ZONAS[1].lat);
    assert.equal(r.categoria, "cobijas");
  });

  it("0 from any screen returns inicio", () => {
    const r = resolveMenu({ pantalla: "barrios", n: 0, categoria: "agua" });
    assert.equal(r.next, "inicio");
    assert.equal(r.categoria, null);
    assert.match(r.text, /^1 Comida$/m);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/alore/projects/acopio-pereira/.worktrees/wa-menu-numeros/bot && node --test test/menu.test.js`

Expected: FAIL — cannot find module `../src/menu.js`.

- [ ] **Step 3: Implement `bot/src/menu.js`**

```js
import { CATEGORIAS } from "../../api/src/categorias.js";
import { ZONAS } from "./zonas.js";
import {
  textoMenuInicio,
  textoMenuZona,
  textoMenuBarrios,
  textoMapa,
} from "./plantilla.js";

export const MENU_CATEGORIAS = CATEGORIAS.filter((c) => c !== "otro");

function fold(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

export function parseMenuNumber(text) {
  const t = String(text ?? "").trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

const HOME = new Set(["0", "menu", "hola", "hi", "buenas", "ayuda", "start"]);

export function isMenuHomeTrigger(text) {
  return HOME.has(fold(text));
}

function zonaPublica(z) {
  return {
    id: z.id,
    nombre: z.nombre,
    lat: z.lat,
    lng: z.lng,
    radioKm: z.radioKm,
  };
}

/**
 * @param {{
 *   pantalla: string,
 *   n: number,
 *   categoria?: string|null,
 *   publicWeb?: string,
 * }} opts
 */
export function resolveMenu({ pantalla, n, categoria = null, publicWeb }) {
  if (n === 0) {
    return {
      kind: "show",
      next: "inicio",
      categoria: null,
      zona: null,
      text: textoMenuInicio(),
    };
  }
  if (pantalla === "inicio") {
    if (n >= 1 && n <= MENU_CATEGORIAS.length) {
      const cat = MENU_CATEGORIAS[n - 1];
      return {
        kind: "show",
        next: "zona",
        categoria: cat,
        zona: null,
        text: textoMenuZona(cat),
      };
    }
    if (n === 9) {
      return {
        kind: "stay",
        next: "inicio",
        categoria: null,
        zona: null,
        text: textoMapa(publicWeb),
      };
    }
    return {
      kind: "show",
      next: "inicio",
      categoria: null,
      zona: null,
      text: textoMenuInicio(),
    };
  }
  if (pantalla === "zona") {
    if (n === 1) {
      return {
        kind: "consultar",
        next: "resultados",
        categoria,
        zona: null,
        text: null,
      };
    }
    if (n === 2) {
      return {
        kind: "show",
        next: "barrios",
        categoria,
        zona: null,
        text: textoMenuBarrios(),
      };
    }
    return {
      kind: "show",
      next: "zona",
      categoria,
      zona: null,
      text: textoMenuZona(categoria),
    };
  }
  if (pantalla === "barrios") {
    if (n >= 1 && n <= ZONAS.length) {
      return {
        kind: "consultar",
        next: "resultados",
        categoria,
        zona: zonaPublica(ZONAS[n - 1]),
        text: null,
      };
    }
    return {
      kind: "show",
      next: "barrios",
      categoria,
      zona: null,
      text: textoMenuBarrios(),
    };
  }
  return {
    kind: "show",
    next: "inicio",
    categoria: null,
    zona: null,
    text: textoMenuInicio(),
  };
}
```

No imports from `messaging/`.

- [ ] **Step 4: Run menu tests**

Run: `cd /home/alore/projects/acopio-pereira/.worktrees/wa-menu-numeros/bot && node --test test/menu.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bot/src/menu.js bot/test/menu.test.js
git commit -m "feat(bot): resolve numbered WhatsApp menu screens"
```

---

### Task 3: Diálogo híbrido (números + texto libre)

**Files:**
- Modify: `bot/src/dialog.js`
- Modify: `bot/src/interpretar.js` (add `0` and `menu`/`menú` to `AYUDA`)
- Modify: `bot/test/dialog.test.js`
- Modify: `bot/test/interpretar.test.js`

**Interfaces:**
- Consumes: `isMenuHomeTrigger`, `parseMenuNumber`, `resolveMenu` from `./menu.js`; `textoMenuInicio`, `textoMenuZona`, `textoAyuda`, existing consultar/plantilla helpers
- Produces: same `createDialog(...).handleIncoming` contract `{ send, text }`. Pending shape:

```
{ pantalla: "inicio"|"zona"|"barrios"|"resultados", categoria: string|null, zona: object|null, turno: number, actualizadoAt: number }
```

**Dialog order (must match spec):**

1. Ignore `fromMe` / groups. Idempotency. Rate limit → `textoRateLimit()` (already has pie). Media without text → `textoPedirTexto()` and **do not** clear pending.
2. If `isMenuHomeTrigger(raw)` → set pending `{ pantalla: "inicio", categoria: null, zona: null, turno: st?.turno ?? 0, actualizadoAt }` (do not increment turno) → `{ send: true, text: textoMenuInicio() }`.
3. If pending `pantalla` is `inicio` | `zona` | `barrios` **and** `parseMenuNumber(raw) !== null` → `resolveMenu`. Apply:
   - `kind === "consultar"` → run existing consultar/sort/slice/textoRespuesta path with `resolved.categoria` + `resolved.zona`; then pending = `{ pantalla: "resultados", categoria: null, zona: null, turno: 0, actualizadoAt }`.
   - else → set pending `{ pantalla: resolved.next, categoria: resolved.categoria, zona: resolved.zona, turno: st.turno, actualizadoAt }` → `{ send: true, text: resolved.text }`.
   - Do **not** increment `turno`. Do **not** call LLM.
4. Else `interpretar(raw)` + existing LLM fallback.
   - If `intencion === "ayuda"` → same as step 2 (inicio).
   - If pending has `categoria` and parsed has no categoria but `matchZona(raw)` hits → merge (same as today) and consult.
   - If `necesitaZona` and categoria known → show `textoMenuZona(categoria)`, pending `pantalla: "zona"` (do increment turno; if `turno >= 3` after increment, show inicio and reset turno to 0 instead of `textoNoEntendi`).
   - If no categoria / no entiende after LLM → show `textoMenuInicio()`, pending `pantalla: "inicio"` (increment turno; at MAX_TURNS show inicio and reset).
   - Complete consult → `textoRespuesta` + pending `resultados` with categoria/zona null.
5. Never import messaging.

Update existing dialog test «necesito agua cerca»: first reply must match `/¿dónde\?/` or `/Ver todos/` (not `/barrio o zona/i`). Rate-limit and API-down exact equality still works because they compare to `textoRateLimit()` / `textoApiCaida()` (now with pie).

- [ ] **Step 1: Write / extend failing tests**

Add to `bot/test/interpretar.test.js`:

```js
  it("ayuda on 0 and menú", () => {
    assert.equal(interpretar("0").intencion, "ayuda");
    assert.equal(interpretar("menú").intencion, "ayuda");
  });
```

Add to `bot/test/dialog.test.js` (keep helpers). Change the cerca assertion as above. Add:

```js
  it("hola is numbered start menu", async () => {
    const { handleIncoming } = makeDialog();
    const r = await handleIncoming(incoming({ text: "hola", messageId: "hola-1" }));
    assert.equal(r.send, true);
    assert.match(r.text, /^1 Comida$/m);
    assert.match(r.text, /cobijas en Cuba/);
  });

  it("menu path hola → 5 → 1 consults cobijas without zone", async () => {
    const urls = [];
    const { handleIncoming } = makeDialog({ fetchImpl: fakeConsultar({ urls }) });
    await handleIncoming(incoming({ text: "hola", messageId: "m-h" }));
    const zona = await handleIncoming(incoming({ text: "5", messageId: "m-5" }));
    assert.match(zona.text, /Cobijas — ¿dónde\?/);
    const r = await handleIncoming(incoming({ text: "1", messageId: "m-1" }));
    assert.ok(urls.some((u) => u.includes("categoria=cobijas")));
    assert.ok(!urls.some((u) => /lat=/.test(u)));
    assert.match(r.text, /Albergue X/);
    assert.match(r.text, /\n\n0 Menú$/);
  });

  it("hola → 5 → 2 → 2 consults Cuba cobijas", async () => {
    const urls = [];
    const { handleIncoming } = makeDialog({ fetchImpl: fakeConsultar({ urls }) });
    await handleIncoming(incoming({ text: "hola", messageId: "b-h" }));
    await handleIncoming(incoming({ text: "5", messageId: "b-5" }));
    await handleIncoming(incoming({ text: "2", messageId: "b-2" }));
    const r = await handleIncoming(incoming({ text: "2", messageId: "b-cuba" }));
    const consult = urls.find((u) => u.includes("/api/consultar"));
    assert.match(consult, /categoria=cobijas/);
    assert.match(consult, /lat=4\.796/);
    assert.match(r.text, /Albergue X/);
  });

  it("after results 0 returns start menu", async () => {
    const { handleIncoming } = makeDialog();
    await handleIncoming(incoming({ text: "dónde hay pañales", messageId: "r1" }));
    const r = await handleIncoming(incoming({ text: "0", messageId: "r0" }));
    assert.match(r.text, /^1 Comida$/m);
  });

  it("out-of-range number on inicio does not call API or LLM", async () => {
    let llmCalls = 0;
    const urls = [];
    const llm = {
      complete: async () => {
        llmCalls += 1;
        return { text: "{}" };
      },
    };
    const { handleIncoming } = makeDialog({
      llm,
      fetchImpl: fakeConsultar({ urls }),
    });
    await handleIncoming(incoming({ text: "hola", messageId: "o1" }));
    const r = await handleIncoming(incoming({ text: "99", messageId: "o2" }));
    assert.equal(llmCalls, 0);
    assert.equal(urls.length, 0);
    assert.match(r.text, /^1 Comida$/m);
  });

  it("zona screen accepts typed barrio Boston", async () => {
    const urls = [];
    const { handleIncoming } = makeDialog({ fetchImpl: fakeConsultar({ urls }) });
    await handleIncoming(incoming({ text: "hola", messageId: "z1" }));
    await handleIncoming(incoming({ text: "6", messageId: "z2" }));
    const r = await handleIncoming(incoming({ text: "Boston", messageId: "z3" }));
    const consult = urls.find((u) => u.includes("/api/consultar"));
    assert.match(consult, /categoria=agua/);
    assert.match(consult, /lat=4\.808/);
    assert.match(r.text, /Albergue X/);
  });

  it("media keeps pending menu so 4 still works", async () => {
    const { handleIncoming } = makeDialog();
    await handleIncoming(incoming({ text: "hola", messageId: "md1" }));
    const media = await handleIncoming(
      incoming({ hasMedia: true, text: "", messageId: "md2" }),
    );
    assert.equal(media.text, textoPedirTexto());
    const zona = await handleIncoming(incoming({ text: "4", messageId: "md3" }));
    assert.match(zona.text, /Niños — ¿dónde\?/);
  });
```

Keep the existing «hola contains cobijas en Cuba» test **or** replace it with «hola is numbered start menu» — do not duplicate the same `messageId: "hola-1"` (idempotency would skip the second). Prefer replacing that one test.

- [ ] **Step 2: Run dialog + interpretar tests to see them fail**

Run: `cd /home/alore/projects/acopio-pereira/.worktrees/wa-menu-numeros/bot && node --test test/dialog.test.js test/interpretar.test.js`

Expected: FAIL on new cases (`99` still goes to LLM; `5` is not a menu).

- [ ] **Step 3: Implement dialog + interpretar**

`interpretar.js`: add `"0"` and `"menu"` to `AYUDA` (fold already turns `menú` → `menu`).

`dialog.js` — add imports from `./menu.js` and `textoMenuInicio`, `textoMenuZona`. Change pending JSDoc to include `pantalla`. Replace `replyAsk` so the fallback text is `textoMenuInicio()` (or `textoMenuZona` when categoria is set and we are asking zona) and pending includes `pantalla`. At `turno >= MAX_TURNS`, do **not** send `textoNoEntendi`; send `textoMenuInicio()`, set pending to inicio with `turno: 0`.

Sketch of the new early path inside `handleIncoming` after media check (keep rate/idempotency as-is):

```js
    const raw = usableText(text) ? String(text) : "";
    const st = getPending(from, t);

    if (isMenuHomeTrigger(raw)) {
      pending.set(from, {
        pantalla: "inicio",
        categoria: null,
        zona: null,
        turno: st?.turno ?? 0,
        actualizadoAt: t,
      });
      return { send: true, text: textoMenuInicio() };
    }

    const n = parseMenuNumber(raw);
    const menuScreen =
      st?.pantalla === "inicio" ||
      st?.pantalla === "zona" ||
      st?.pantalla === "barrios";
    if (menuScreen && n !== null) {
      const resolved = resolveMenu({
        pantalla: st.pantalla,
        n,
        categoria: st.categoria,
        publicWeb,
      });
      if (resolved.kind === "consultar") {
        return consultarYResponder(from, t, {
          categoria: resolved.categoria,
          zona: resolved.zona,
          zonaTexto: resolved.zona?.nombre ?? null,
        });
      }
      pending.set(from, {
        pantalla: resolved.next,
        categoria: resolved.categoria ?? null,
        zona: resolved.zona ?? null,
        turno: st.turno,
        actualizadoAt: t,
      });
      return { send: true, text: resolved.text };
    }

    let parsed = interpretar(raw);
    // ... existing LLM / merge-zona logic ...
    // when asking for zona: textoMenuZona(cat), pantalla: "zona"
    // when asking for categoria / no entiende: textoMenuInicio(), pantalla: "inicio"
    // on successful consult: extract helper that sets pantalla resultados
```

Extract `consultarYResponder` as an inner function that contains the current try/consultar/sort/slice/`textoRespuesta` / api_error block, then:

```js
      pending.set(from, {
        pantalla: "resultados",
        categoria: null,
        zona: null,
        turno: 0,
        actualizadoAt: t,
      });
```

instead of `pending.delete(from)` after a successful or empty consult **and** after API down (so `0` still works). Rate-limit path does not need pending.

On zona screen, typed barrio: existing `st?.categoria && !parsed.categoria` + `matchZona(raw)` already covers «Boston» after choosing agua.

- [ ] **Step 4: Run targeted tests**

Run: `cd /home/alore/projects/acopio-pereira/.worktrees/wa-menu-numeros/bot && node --test test/dialog.test.js test/interpretar.test.js test/menu.test.js test/plantilla.test.js`

Expected: PASS. All previous hybrid cases still pass (`pañales`, cerca+Cuba, LLM cobijas, idempotency, rate limit, API 500).

- [ ] **Step 5: Commit**

```bash
git add bot/src/dialog.js bot/src/interpretar.js bot/test/dialog.test.js bot/test/interpretar.test.js
git commit -m "feat(bot): hybrid numbered menu in WhatsApp dialog"
```

---

### Task 4: Suite completa y messaging intacto

**Files:**
- None expected. Only fix if Task 3 left a red test in another file (do not edit `bot/src/messaging/**`).

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: green `cd bot && npm test`; `git diff origin/main -- bot/src/messaging` empty (relative to this branch's messaging files — they must match `origin/main`)

- [ ] **Step 1: Confirm messaging is untouched**

Run:

```bash
cd /home/alore/projects/acopio-pereira/.worktrees/wa-menu-numeros
git diff origin/main -- bot/src/messaging bot/test/messaging-meta.test.js bot/test/messaging-waha.test.js bot/test/messaging-create.test.js bot/test/webhook.test.js
```

Expected: empty. If not empty, revert those files.

- [ ] **Step 2: Run the full bot suite**

Run: `cd /home/alore/projects/acopio-pereira/.worktrees/wa-menu-numeros/bot && npm test`

Expected: all tests PASS, including `messaging-*.test.js` and `webhook.test.js`.

- [ ] **Step 3: Commit only if you had to fix a non-messaging regression**

If the suite was already green and messaging clean, no commit. If you fixed a test outside messaging:

```bash
git add bot/test
git commit -m "test(bot): keep full suite green after numbered menu"
```

Do not add a commit that only says "chore" with no file changes.
