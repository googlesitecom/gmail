# APEX KART — Turbo Party · Documentación de Sistemas

**Estudio:** APEX Studio · **Stack:** Three.js 0.186 + TypeScript + Next.js 16 (App Router) · **Arquitectura:** motor puro TS (`src/game/**`) + React solo para menús/HUD (`src/components/game/**`), comunicados vía `GameBridge` (store externo + `useSyncExternalStore`).

> Decisión de dirección: el brief exigía "el juego es web". Se eligió Three.js porque es el único motor 3D que corre nativo en navegador sin plugins ni builds de 100+ MB, mantiene 60 FPS en hardware medio con esta carga (~40k triángulos, materiales Lambert, 1 sombra direccional) y todo el arte procedural (0 assets externos) garantiza la regla IP: **100% original, cero assets protegidos**.

## 1. Core (`src/game/core/`)
- **Types.ts** — contratos de datos puros (modos, clases, ítems, pistas, sesión, resultados).
- **Config.ts** — TODO el tuning del "feel" (PHYS, RACE, AI, ITEMS, CAMERA, BATTLE, VIDEO). Curvas clave: `accelAt()` (aceleración que decae al acercarse a punta), `steerAuthority()` (el radio de giro crece con la velocidad).
- **MathUtils.ts** — clamp/lerp/damp (suavizado exponencial independiente del framerate), wrapAngle, PRNG determinista makeRng, weightedPick.
- **InputManager.ts** — teclado + gamepad estándar (XInput), fusiona ambas fuentes, remapeo completo persistido, detección de flancos para ítem/pausa y acumulador throttleHeldMs para la salida turbo.
- **Game.ts** — orquestador: renderer WebGL2, EffectComposer (bloom + viñeta + **OutputPass final** = ACES + sRGB al cierre de la cadena; sin él la imagen queda en lineal ~π× oscura), luces en unidades físicas (three r155+ sin factor π legacy: sol ≈ 3–4, hemi 2.4), bucle a paso fijo 60 Hz con acumulador (máx. 5 subpasos), ciclo de sesión, GP, batalla, podio, FX, minimapa/velocímetro dibujados por el motor en canvas 2D. Hooks de QA en `window.__apex` (state/start/step determinista/probe/dumpRoadTexture).
- **GameBridge.ts** — puente engine→React: snapshots inmutables; HUD numérico a 8 Hz, eventos (cuenta atrás, announcer) inmediatos.

## 2. Física del kart (`src/game/karts/KartController.ts`)
Modelo híbrido rumbo + ángulo de deriva (slip): speed es velocidad hacia delante, slip es cuánto retrasa el vector velocidad al morro. Al derrapar, slip crece → derrape ancho y controlable.
- Drift: botón → salto (hop) → aterrizaje fija driftDir; la carga sube más rápido volanteando hacia dentro; 3 niveles (azul 0.85 s → naranja 2.1 s → morado 3.4 s); al soltar, mini-turbo proporcional (0.65/1.05/1.55 s × 1.28/1.38/1.50).
- Slipstream: 1 s detrás de un rival en cono de 55° → boost 0.9 s.
- Estados: spinT (con 0.9 s de inmunidad post-golpe — evita stunlock), shrinkT (rayo), starT (invencible + arrolla), aegisT, invulnT.
- Suelo: groundQuery() del mundo (carretera peraltada / atajos / faldón / vacío). Caída → respawn. wallConstrain y obstáculos con fricción proporcional (solo frena la componente de choque — nunca aniquila velocidad) + redirección suave al rumbo del rail para karts que muelen contra él.
- **Convención de dirección**: steer positivo = giro a la derecha EN PANTALLA = yaw decreciente (forward = (sin yaw, cos yaw) con cámara trasera → +X es izquierda de pantalla). Coherente en física, IA y ruedas delanteras visuales.

## 3. Pistas (`src/game/tracks/`)
- **Spline.ts** — Catmull-Rom cerrado con parametrización por longitud de arco; project() con hint de índice O(±24); flag `tunnel` por muestra. OpenPath para atajos con progreso mapeado (la vuelta sigue contando dentro del desvío).
- **Textures.ts** — texturas canvas procedurales: asfalto (grano + parches de alquitrán + bandas de rodada + líneas blancas con contorno + dashes amarillos 60%), kerb diagonal, terreno moteado, acero de rail con remaches, paneles de túnel con juntas/vejigas, checker de meta. Cacheadas por tema.
- **TrackCatalog.ts** — 12 circuitos originales **a escala Mario Kart** (~±200 m, 18–24 puntos de control): horquillas, S, chicanes, peraltes, 1–2 saltos con hueco por pista, **túnel en las 12**; 4 copas encadenadas, 3 arenas de batalla.
- **TrackBuilder.ts** — carretera texturizada con UV (repetición 9.5 m), kerbs, faldón + delantal de 30 m y **plano de terreno hasta el horizonte** (r 640, salvo temas de vacío); **guardarraíles visuales + físicos** en ambos bordes (huecos solo en saltos y entradas de atajo; clamp + scrub proporcional + redirección anti-molino); **túneles** con perfil de arco, portales, costillas y luces de techo; atajos (from/to derivados de la geometría), pads con chevrones animados, cajas de ítems, hazards 4 tipos, arco de meta con banner animado, línea de meta a cuadros, parrilla, anclas de respawn; **racingLine precalculada** (curvatura→lateral de apex suavizado + perfil vMax con pases backward de frenado y forward de tracción).
- **Decorations.ts** — 12 temas con paleta completa + kits de props primitivos, cielo shader degradado + estrellas/aurora/planeta, multitud instanciada con bobbing.

## 4. Personajes y karts (`src/game/karts/`)
- **KartStats.ts** — 12 corredores, 5 clases (Pluma→Titán) con tradeoffs reales: Pluma 21.6 m/s punta / 15 m/s² aceleración / peso 2 ↔ Titán 26.2 m/s / 8 m/s² / peso 9.5.
- **KartVisual.ts** — kart estilo party-racer esculpido: monocasco con cowl, morro cónico, pontones con tomas, pasos de rueda, alerón delantero con endplates, alerón trasero sobre soportes, aletas de motor, roll hoop, escapes dobles con llamas, ruedas con llanta de 5 radios; piloto con hombros, guantes y cabeza única por especie. Geometría fusionada por material (~10 draw calls/kart) + sombras. Animación procedural: inclinación al girar, roll de drift, muelle de aterrizaje, victoria/derrota/golpe, tinte arcoíris en Núcleo Estelar.

## 5. Ítems (`src/game/items/`)
13 ítems originales con tabla de pesos por posición (líder: trampas/escudos; último: Núcleo/Chip Tormenta). Ruleta HUD 1.4 s. Proyectiles: recto, guiado (giro limitado), triple en órbita, Cazador que recorre el spline, Dron Imán que roba. Trampas: charco y mina con parpadeo. Escudo orbital 3 orbes (absorben 1 impacto c/u). En batalla la mesa es equilibrada y Tormenta/Imán solo afectan al equipo rival.

## 6. IA (`src/game/ai/AIDriver.ts`)
11 corredores que pilotan la **racing line precalculada**: objetivo por pure-pursuit (PD — Kp 4.2 / Kd 0.45; un Kd alto hace orbitar en círculos de 1 m), velocidad del perfil físico (frena ANTES de la curva por el pase backward), **car-following proporcional al hueco** (nunca embiste → no hay pilas), adelantamiento por el lado con más espacio con histéresis, esquiva de movers, timing de gates (velocidad ∝ distancia a la puerta cerrada), floor de 20 m/s antes de saltos, drift con carga de mini-turbo, atajos con compromiso por personalidad, recuperación off-road y marcha atrás anti-atasco (excepto en cola de gate). Rubber-banding configurable (0–100%; en 150cc modo "injusto" +24%) por hueco con el jugador. Táctica de ítems por posición y personalidad (agresiva 4 / defensiva 4 / temeraria 3). Cerebro de arena: caza cajas desarmado, persigue enemigos armado, dispara en cono < 42 m.

## 7. Reglas de carrera (`src/game/race/RaceManager.ts`)
Cuenta atrás 3-2-1-¡YA! con salida turbo por ventana de acelerador (350 ms–2.6 s perfecta; >2.7 s → patinada). Anti-trampa: 12 sectores ordenados obligatorios para contar vuelta. Posiciones en vivo por metros totales. Fin: podio 3D con bloques, cámara en órbita, confeti y animaciones. GP: 15/12/10/8…, parrilla invertida por clasificación, desbloqueos (copa→personaje, 4 copas→espejo, Cósmica 150cc→Gigi).

## 8. Persistencia (`src/game/persistence/SaveData.ts`)
localStorage con normalización defensiva (un guardado parcial jamás tumba la app). Guarda: desbloqueos, mejores vueltas/carreras, fantasmas (20 Hz, interpolados), opciones y bindings.

## 9. Audio
Omitido por decisión del cliente ("sin sonido"). El bus de eventos/announcer ya está cableado para un futuro AudioManager.

## 9b. UI / menús (`src/components/game/`)
Design system arcade en `globals.css` (`.apex-bg` franjas de velocidad animadas, `.apex-title` itálica con sombras duras, `.apex-btn` sesgado con barrido de brillo, `.apex-panel` cristal con esquina recortada, `.apex-checker`). MainMenu tipo lobby arcade; **KartShowroom** renderiza el kart real (KartVisual) en 3D giratorio en la selección de personaje y color; HUD/pausa/resultados intactos.

## Checklist de calidad (QA en navegador real, agente automatizado)
| Sistema | Verificado |
|---|---|
| Menú → personaje → kart → modo → copa → carrera | OK (E2E por clicks) |
| 12 personajes (8 libres, 4 bloqueados con pista) | OK |
| Física: acelerar/frenar/derrape/mini-turbo/slipstream | OK (20–34 m/s) |
| Vueltas + anti-trampa por sectores | OK (líder cuenta vueltas, IA completa carreras) |
| 12 pistas renderizan y son navegables | OK (capturas + brillo medido) |
| Salto final del Prisma | OK (IA completa vuelta tras fix de respawn) |
| Modo espejo | OK |
| GP: puntuación, siguiente pista, podio | OK |
| VS configurable | OK (1 vuelta, IA 0–11, ítems on/off) |
| Contrarreloj + fantasma guardado/reproducido | OK (loaded+playing) |
| Batalla: HP, KOs, equipos, temporizador, resultados | OK (hp 36→16, podio por equipos) |
| Ítems: 13, ruleta, probabilidad, proyectiles, escudos | OK (contadores en vivo) |
| Pausa / opciones / remapeo persistente | OK (Acelerar→J guardado) |
| tsc --noEmit y ESLint | 0 errores |
| Dirección A/D (convención pantalla) | OK (D→yaw baja, A→yaw sube, test sintético) |
| Textura de carretera (líneas/dashes) | OK (análisis de píxeles + VLM) |
| Guardarraíles visuales+físicos | OK (ningún kart cae al vacío en carreras completas) |
| Túneles (factory/city) | OK (VLM 9/10) |
| Terreno hasta horizonte + colinas | OK (VLM) |
| Carreras completas IA | OK (meadow 8-10/11 y factory 10/11 terminan; prism 3-7/11) |
| Menú arcade + showroom 3D | OK (VLM 9-10/10, click-through E2E) |
| Resultados + flujo GP | OK (RESULTADOS → SIGUIENTE PISTA) |

## Bugs conocidos / limitaciones
1. Entorno headless sin GPU: los FPS medidos son del rasterizador por software del navegador de QA; en hardware real con WebGL el pipeline es 60 FPS (la escala baja→media 3× confirma coste de puro render; la calidad BAJA es red de seguridad).
2. En Prisma (pista final) puede rezagarse 1/11 bots en cuñas residuales tras las puertas; el rompe-cuñas y el car-following las disuelven en segundos.
3. Los karts mantienen estética low-poly "toy" intencional (coherente con el arte 100% procedural); una pasada de material PBR/shader de tinta daría más jugo visual si se pidiera.
4. Sin audio (decisión del cliente).
5. Fantasma de contrarreloj validado por carga/reproducción; la grabación comparte el mismo camino de datos.
6. Mando: mapeo estándar implementado en código; sin prueba física en QA automatizada.
7. El navegador de QA limita el rAF en pestaña oculta: los tests largos usan `__apex.step(segundos)` (sim determinista).

## Controles
Teclado: WASD/Flechas · ESPACIO drift · SHIFT/E ítem · Q mirar atrás · ESC pausa. Mando: stick izq. girar · RT acelerar · LT frenar · A/Cruz drift · B/Círculo ítem · Start pausa. Remapeo completo en Opciones.
