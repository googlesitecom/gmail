# 🏁 APEX KART — Turbo Party

Juego de karts 3D estilo party-racer, **100 % original y jugable en el navegador**. Corre directamente desde GitHub Pages: sin instalar nada.

## 🎮 Jugar

**👉 https://googlesitecom.github.io/gmail/**

- 1 jugador contra 11 bots con IA (línea de carrera real, frenadas, derrapes y tácticas de objetos): tiros alineados, turbos guardados para rectas, recolección de monedas por línea, esquiva de trampas y salidas con turbo
- **Salas online P2P** (hasta 8 pilotos): crea una sala, comparte el código de 4 letras (o el enlace directo `?sala=CODIGO`) y compite con tus amigos — sin servidor, conexión directa entre navegadores (WebRTC + relé TURN para redes distintas)
- **Los puestos libres de la sala se rellenan con CPU**: la parrilla siempre es de 12 corredores (el anfitrión simula los CPU y los transmite a todos)

## ✨ Qué tiene

| | |
|---|---|
| 🕹️ **Modos** | Gran Premio (4 copas), Contrarreloj (con fantasma), Carrera VS, Batalla por equipos |
| 🏎️ **Corredores** | 9 personajes originales en 5 clases (Pluma → Titán) con **habilidad pasiva única** por clase |
| 🗺️ **Pistas** | 12 circuitos temáticos EXTRA ANCHOS con túneles, saltos, atajos, obstáculos y modo espejo |
| 🛣️ **Texturas** | Asfalto, bordes de pista, pasto y 6 superficies temáticas (arena, hielo, tecno, tierra…) — fotos reales del dueño del repo |
| 🏆 **Kart GLB** | Chasis de kart fotorrealista "Go Kart" (modelo 3D original integrado) + pilotos con casco y visera |
| ⚡ **Cilindradas** | 50 / 100 / 150 / **200cc extremo** |
| 🎯 **Objetos** | 13 ítems originales (proyectiles, trampas, cazador, imán, tormenta, escudo orbital…) |
| 💥 **Choques** | Puedes estrellarte contra los rivales: embestidas fuertes los hacen trompear, los medios los sacan de la trayectoria, y los pesados empujan más fuerte (chispas incluidas) |
| 🧱 **Muros** | Los golpes contra el guardarraíl rebotan, frenan y echan chispas |
| 🪙 **Monedas** | Hasta 10 monedas por vuelta: más velocidad punta; las pierdes al recibir golpes |
| 🔵 **Derrape MK** | Mini-turbo de 3 niveles (chispas azules → naranjas → púrpura) |
| 🛡️ **Ítem defensivo** | Mantén pulsado el botón de objeto: queda flotando detrás como escudo trasero; suéltalo para disparar |
| 🎁 **Cajas dobles** | En 150cc+ las cajas doradas dan **2 objetos** (ranura de reserva) |
| 🪂 **Trucos aéreos** | Pulsa derrape en el aire: caballo de mar o vuelta de campana = turbo al aterrizar |
| 💨 **Estela** | Ponte detrás de un rival para cargar el rebufo |

### 🧬 Habilidades pasivas por clase

| Clase | Habilidad | Efecto |
|---|---|---|
| Pluma | Derrape Chispa | Carga mini-turbos un 20 % más rápido |
| Ligera | Aspiradora | Corriente de aire un 35 % más potente |
| Media | Todo Terreno | Pierde mucha menos velocidad fuera de pista |
| Pesada | Ariete | Sus embestidas empujan un 35 % más fuerte |
| Titán | Roca Sólida | Recibe 45 % menos empujones y gira menos tiempo |

## ⌨️ Controles

| Acción | Teclado | Mando |
|---|---|---|
| Acelerar | `W` / `↑` | A / gatillo derecho |
| Frenar / atrás | `S` / `↓` | B |
| Girar | `A` `D` / `←` `→` | stick izq. |
| Derrapar / truco aéreo | `ESPACIO` (mantener) | RB |
| Objeto (mantener = escudo) | `E` | LB |
| Mirar atrás / lanzar hacia atrás | `Q` (con objeto) | Y |
| Pausa | `ESC` | Start |

Todos los controles se pueden remapear en **Opciones**.

## 🌐 Salas online

1. Menú principal → **MULTIJUGADOR ONLINE**
2. El anfitrión pulsa **CREAR SALA** y comparte el código (ej. `7K2M`) o copia el **enlace de invitación** (`...?sala=7K2M`) — quien lo abre entra directo
3. Los demás entran con **UNIRSE** + código
4. El anfitrión elige pista, vueltas, cilindrada (50–200cc) y objetos
5. ¡A correr! **Los puestos vacíos se rellenan con CPU hasta completar 12 corredores** (los simula el anfitrión: todos ven los mismos bots)
6. El anfitrión debe mantener la pestaña abierta (la sala vive en su navegador)

> Funciona desde cualquier hosting estático (GitHub Pages incluido): los jugadores se conectan directamente entre sí (P2P vía WebRTC). Si la red bloquea la conexión directa, un relé **TURN** gratuito (OpenRelay) abre la ruta automáticamente. Un latido cada 5 s mantiene viva la sala durante el lobby y detecta pilotos desconectados.

## 📁 Estructura del repo

```
├── index.html, _next/     ← el juego compilado (GitHub Pages sirve esto)
├── models/                ← texturas de superficie + kart GLB usados por el juego
│   ├── road_asfalto.jpg, borde.jpg, pasto.jpg   ← asfalto, bordillo y pasto reales
│   ├── pista2..7.jpg                              ← superficies temáticas (tierra, noche, arena, tecno, hielo, musgo)
│   └── go_kart.glb                                ← chasis de kart (ver créditos)
├── source/                ← código fuente completo (Next.js + TypeScript + Three.js)
└── README.md
```

### Recompilar desde el código

```bash
cd source
npm install
npm run dev            # desarrollo en localhost:3000
npm run build:static   # genera ../ con el sitio estático para Pages
```

## 🎨 Créditos y nota de propiedad

- Todo el arte del juego (personajes, pilotos con casco, pistas, decorados, interfaz) es **procedural y original**, generado con Three.js.
- **Kart GLB**: "Go Kart" de **GRIP420** (https://sketchfab.com/GRIP420), licencia **CC-BY-NC-ND-4.0** (https://sketchfab.com/3d-models/go-kart-db54b705c0e546229fb43c55d7e7ad3f). Usado tal cual, sin modificaciones, como chasis compartido de todos los corredores.
- **Texturas de superficie**: fotos propias del dueño del repo (asfalto, bordillo de pista, pasto y superficies Pista 2–7).
- Los modelos GLB de personajes de Mario Kart 8 que estaban en este repo fueron **eliminados**: son propiedad de Nintendo y no pueden distribuirse ni usarse.
- Personajes 100 % originales: Zippy Zot, Mimi Pétalo, Bolt Guau, Rex Talon, Nova Nova, Tiki Magma, Bruiser, Magnus Acero y Gigi Colmillo.
