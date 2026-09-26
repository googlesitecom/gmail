
---
Task ID: 21
Agent: main (APEX Studio)
Task: v4 "Ritmo y Curvas" — música de fondo, pistas únicas +30%, gradas/terreno/saltos arreglados, IA anti-atasco, FX de objetos

Work Log:
- Recuperé la música del repo (Musica_Fondo.mp3 + chieuk-coin-257878.mp3 los borró el reestructurado v3): restauradas del historial → source/public/audio/
- AudioSystem.ts nuevo: música en loop (HTMLAudio) + SFX moneda (WebAudio, pitch ladder por moneda); volumen música/efectos en Opciones (persistido); botón mute + tecla M en HUD; unlock por gesto
- buildCrowd: base ZURDA → makeBasis con zAxis = along×up + doble flip (la grada derecha quedaba en rotación IDENTIDAD cruzando la meta — el bug "grada enfrente")
- Fold guard NUEVO en TrackBuilder: clearance por muestra/lado (O(N²) precompute + erosón) → skirt/verge/apron/props/billboards/gradas se adaptan para NUNCA cruzar otra franja de la pista (el bug "terreno en medio de las curvas"); groundQuery usa el mismo clamp (física=visual)
- 12 pistas re-diseñadas (+27-42% de largo, firma única cada una): meadow Carrusel del Molino, beach Muelle del Faro (muelle estrecho), jungle Escalera del Templo, desert Carrusel del Cráter, factory Nave de Ensamblaje (+túnel), volcano Calzada de Lava (puente elevado sobre la salida), snow Pueblo Nevada (+lago helado), glacier Zigzag de las Grietas (93° weave + puente de hielo), castle Patio del Bastión (puente de murallas SOBRE la recta), city Cinturón Neón (+metro), space Anillo Solar (puente a y22), prism Doble Espiral + dive realineado
- scripts/track_audit.ts: auditor geométrico (largos ×baseline, solapes no-adyacentes con regla de overpass dy>6, hazards/pads en saltos/túneles, modo landmarks)
- scripts/sim_e2e.ts: simulación headless 12×AI × 12 pistas (engine real, DOM shim) con mapa de calor por sector, logging de caídas y trazador; pasó de karts ladrados (0 vueltas) a 2-4 vueltas a ~79 s/vuelta en todas
- Bugs encontrados y arreglados vía sim: saltos descruzables (labio→aterrizaje desalineado con la tangente de vuelo: glacier 60m→puente sólido, prism realineado a 22.8m + aterrizaje y8), pads de turbo DENTRO de chicanes/zigzag que embistían a los bots a 33 m/s contra giros de 90-140° (movidos/fuera), zigzag 140°→93°, embudos de 5.5m antes de saltos (12 karts se empujaban al vacío), zona de hielo sobre curva de 90°, salida de túnel estrecha
- AIDriver anti-atasco: margen de borde dinámico (+hasta 3.4m según velocidad), convergencia al ir ancho, rescate rail-grind a 0.6s + reverse tras 2.5s, cap de velocidad fuera de pista profunda, deepOff
- FX de objetos al golpear: firma por familia (zap/seeker/blast/goo/storm) en partículas + anillo de onda expansiva + flash del color del ítem + salto físico en minas/cazador + camera kick escalado + anunciador de acierto confirmado
- Banner de meta elevado + gradas separadas (clipping visual), qaRace hook de QA en window.__apex
- QA: navegador headless (screenshots + VLM) en 6 pistas: gradas al lado ✓, terreno limpio ✓, puentes sobre pasos inferiores ✓
- Deploy: build estático (turbopack.root fix + node_modules movido a source/), orphan branch limpio (182 archivos, 18MB — el historial hinchado con un blob de 54MB dejó el build de Pages en "building" eterno)

Stage Summary:
- LIVE: https://googlesitecom.github.io/gmail/ — música + coin SFX cargan (200), carrera verificada en headless sin errores de consola
- Las 12 pistas: 1454-1742m (×1.27-1.42), firma única, geometría auditada ALL OK, IA completa 2-4 vueltas/4min en todas
- Bugs de usuario resueltos: grada enfrente de meta ✓, terreno en curvas ✓, bots atorados ✓ (peor caso 35s con recuperación, antes: minutos), poderes con feedback ✓, música ✓

---
Task ID: 22
Agent: main (APEX Studio)
Task: v5 "Pilotos y Escaparate" — personajes toon rediseñados, cajas 3-en-fila con ?, paracaídas en caídas largas, derrape directo con ESPACIO, HUD y menú rediseñados (escenario 3D vivo), IA anti-atasco mejorada

Work Log:
- Personajes v2 (KartVisual.buildCharacter): materiales toon (gradientMap 3 pasos compartido), torso más robusto con barriga, arnés de 2 correas, cuello, PIERNAS+botas visibles (go-kart), brazos 2 segmentos con guantes mitón, cabeza 1.12 (antes 1.22 cascopo), casco genérico ELIMINADO (flotaba y tapaba caras), ojos por defecto más grandes (r .105), cabezas por especie convertidas a toon
- Paracaídas/glider (KartController + Config.PHYS.glider*): se abre solo al caer rápido (vy<-11.5) desde >5.5m; gravedad ×0.30, caída capada a -6 m/s, steering aéreo 0.95, aterrizaje suave + mini-boost si speed>14; cierra en spin/respawn; visual: dosel rayado color del kart (canvas texture cacheada) + 6 cuerdas + rim, pop con overshoot, brazos arriba MK-pose, pitch nose-up, announce "¡PARACAÍDAS!" + whoosh WebAudio sintetizado (AudioSys.playGlider)
- Derrape sin salto: ESPACIO en suelo = drift INSTANTÁNEO (antes: salto vy=6.4 + drift al aterrizar); señal driftKick para pop de suspensión visual; launch de rampa durante drift ahora PAGA el mini-turbo (endDrift(true))
- Cajas de objetos: filas de 3 laterales (izq/centro/der, spread min(3.4, halfWidth-1.7)) cada ~90m, fila dorada cada 3; arena de batalla: 7 líneas de 3 tangentes al anillo; mesh nuevo: shell Phong translúcido con rayas arcoíris diagonales (canvas), "?" en 2 planos cruzados dentro, EdgesGeometry blanco; respawn con pop-in de escala; cierre por índice arreglado (captura box por ref)
- HUD v2: slot de objeto grande arriba-izq + monedas al lado, posición GIGANTE abajo-izq con placa ordinal degradada, vuelta arriba-der junto al minimapa, velocímetro analógico redibujado (dial con bisel, ticks mayores/menores, aguja roja, arco verde→ámbar→rojo, TURBO glow, km/h digital), pips de drift, countdown coloreado (3 bl/2 ámbar/1/¡YA! verde), apex-speedlines al boostar, tipografía Baloo 2 + Bungee (next/font), apex-outline (text-stroke) para números sobre cualquier escena
- Menú v2: MenuStage 3D nuevo (fx/MenuStage.ts) — cúpula cielo atardecer (canvas gradiente + estrellas), piso showroom Phong con grid, podio con corona dorada, anillo de cuadros + 2 anillos neón, 5 karts dando vueltas al anillo (KartVisual reales con GLB), 5 cajas caramelo orbitando, 90 sparkles Points, 2 PointLights cálida/fría, cámara orbital cinemática; Game: showMenuStage()/hideMenuStage() + render en idle (loop ya no muere en negro); overlay apex-bg ahora translúcido (scrim top/bottom); MainMenu: logo chrome-oro con stroke, pills grandes por modo con icono, CTA online con pulso LIVE, dock inferior con progreso+opciones, hints con apex-ui; textos con text-shadow para contraste
- IA anti-atasco (AIDriver): escape universal 8→5.5s, stagger 6→2.5s, wallowGrace 12→7s, offroad wallow 7→4.5s
- sim_e2e 240s×2 laps: 7 pistas FALLADAS → 1 marginal (prism 21.6s); glacier 119s→79s/vuelta y min 2 laps; baseline pre-cambios verificado (mismos fallos ya existían)
- QA: browser headless + VLM — personajes "mejora notable, silueta chibi excelente"; cajas "3 en fila transversal, iridiscentes con ?"; paracaídas "domo rayas rojas/blancas con cuerdas"; menú prod "escenario 3D visible, glassmorphism"; drift/glider verificados por estado (grounded+vy0 / cap -6.0)
- Manifest seat scale 0.55→0.62; KartShowroom cámara más cerca (2.9,1.95,4.15)
- Deploy: build estático /gmail → push main fb0610e; prod build verificado servido localmente (333 meshes del MenuStage) antes del deploy

Stage Summary:
- LIVE (build Pages en progreso al cerrar): https://googlesitecom.github.io/gmail/
- ESPACIO ahora derrapa sin saltar; caídas largas abren paracaídas; cajas 3-en-fila con ? iridiscente; personajes toon con piernas/botas/guantes y caras visibles; HUD y menú estilo party-racer con escenario 3D vivo detrás
- Pendiente vigilado: Pages build puede tardar (historial del repo); sim prism 21.6s marginal

---
Task ID: 22-fix
Agent: main (APEX Studio)
Task: Fix del deploy v5 — builds de Pages fallando

Work Log:
- builds fb0610e/bbaf91b "Page build failed": raíz = SYMLINK node_modules -> source/node_modules (modo 120000) committeado en la raíz; el builder de Pages no lo resuelve
- Fix: rm symlink + .gitignore 'node_modules' (sin barra — el patrón con / solo matchea directorios y dejaba pasar el link) + orphan push limpio 6f705a8 (184 archivos, 18MB)
- deploy_v5.py nuevo: orphan push + .gitignore estricto (skills/, mini-services/, tool-results/, download/, logs, __next*.txt fuera del repo para siempre)
- Build Pages: "built" en ~2 min. Live verificado: chunks v5 servidos, MenuStage 333 meshes, carrera glacier sin errores de consola, VLM "TODO OK"

Stage Summary:
- LIVE v5: https://googlesitecom.github.io/gmail/ — deploy operativo al 100%
- Lección: NUNCA committear symlinks a Pages; .gitignore sin trailing slash para cubrirlos

---
Task ID: 23
Agent: main (APEX Studio)
Task: v6 "Afinando la Máquina" — pads OBB, derrape anti-traba, paracaídas fiable, bloom hielo, glaciar ensanchada, bots 12/12, host online configurable, cinemática de copa

Work Log:
- PADS: pickup era un punto central (r 2.6 m) contra un visual de casi el ancho de la pista → "la mitad de los pads no sirven". PadInstance ahora lleva right/tan/halfW; KartController hace OBB en el marco local del pad (|lat| < halfW+0.8, |along| < 3.2, |dy| < 1.7 tolera crestas) y sin requerir grounded estricto
- DERRAPE "se traba": (1) teclas pegadas — window.blur borra el set de teclas + gamepad disconnect limpia pad:* (alt-tab con ESPACIO dejaba el drift latched); (2) driftEnterSpeed 11→8.5; (3) re-enganche: si un spin/muro/lanzo interrumpió el desliz con el botón PRESIONADO, rearranca tras driftReArm 0.45 s (solo presión nueva o hold>0.3 s); (4) salir volando por un borde/crest también paga el mini-turbo (endDrift(true) en la rama detach)
- PARACAÍDAS "casi nunca abre": launch vy = 0.20·speed apenas llegaba a -11.5 m/s antes de aterrizar. Ahora abre con vy < -7 O aire > 0.85 s, altura > 2.4 m y aterrizaje previsto > 0.4 s (o gap sin suelo). QA: abre en el salto grande de space (vy capeada -6)
- BLOOM HIELO: snow/glacier pintan casi todo blanco → todo superaba el umbral 0.86. Bloom por tema: hielo strength 0.16/threshold 0.95, oscuro 0.55/0.85, normal 0.40/0.89 + exposición hielo 0.95. VLM: BLOOM_OK en glacier y snow
- GLACIAR "partes super chicas": halfWidth 10.4→11.4, grietas 7→9.5, puente 8→10.5. ESQUINA NO (−160,80): espiga de 110° (dos rectas en vértice de 6 m) plegaba la geometría y 24 bots se caían — re-authorada como codo ancho 3 puntos (-144/94, -158/97, -167/87 bank 0.17 + salida -170/55): audit minSep 25→29 m OK, caídas ×24→0, 1465 m ×1.277. Zona de hielo 0.34→0.29 (fuera de la frenada de la esquina)
- BOTS ANTI-ATASCO: (1) margen de borde capado a hw·0.42 (puentes/pier); (2) escape rail-pin EN pista (railGrindT>6 → respawn; antes solo off-road); (3) FIX MAYOR: bucle reverse↔stall↔reverse — el reverso envenenaba la ventana de progreso con metros negativos → cool-down 2.6 s entre reversos + ventana limpia al terminar el reverso. SIM 240 s ×12: 12/12 PISTAS OK (v5: 7 fail + prism 21.6 s) — snow 20.3→4.5 s stall, prism 21.6→2.0 s, glacier worst 11.4 s; drift AI desacoplado del gate del jugador (piso 12 m/s)
- HOST ONLINE: NetRoomConfig += bots (-1 auto/0-11), botLevel (easy/normal/hard → AIDriver constructor ajusta cornerSkill/itemAggro/jitter), frantic (todas las cajas dobles + respawn 1.5 s), trackId 'random' (resuelto al start). OnlineScreen host: Espejo, Frenético, Bots CPU, Nivel (FÁCIL/NORMAL/EXPERTO), 🎲 Sorpresa + panel compacto; guests ven resumen read-only. GameShell mapea botLevel+frantic al SessionConfig
- CINEMÁTICA DE COPA: al ganar el GP (1º total) el podio se monta por CLASIFICACIÓN DE COPA y arranca un shot de 10.5 s: cámara keyframed (wide push-in → órbita → close-up al campeón → pull-back rise, fov 58→44→56), trofeo dorado procedural (base+stem+bowl+asas, metalness .85) desciende y gira sobre el ganador, fuegos/confeti cadence 0.6→0.34 s, fanfarria WebAudio sintetizada (arpegio DoM + acorde). Saltar con ESPACIO/ENTER/botón (overlay CupCinematicOverlay con letterbox + títulos ¡CAMPEÓN!); resultados se publican al terminar/saltar. QA hook __apex.qaCinematic + pads()
- QA: audit ALL OK; sim 12/12 ✓; browser 18/18 ✓ (pad edge boost a lat -8.7, glider en salto, drift 9.5 m/s, cinematic+skip, host panel completo+activos). Lección: headless GL corre a 1-2 fps → usar __apex.step() determinista, no esperas de reloj
- Deploy: build estático /gmail → orphan push e111c9f (188 archivos) → Pages "built" en ~40 s. LIVE verificado: boot sin errores de página, carrera glacier + cinemática OK, VLM LIVE_OK

Stage Summary:
- LIVE: https://googlesitecom.github.io/gmail/ (v6, e111c9f)
- Los 5 bugs de usuario resueltos: pads ✓, derrape ✓, paracaídas ✓, bloom hielo ✓, glaciar estrecha+bots ✓ + 2 features: host online configurable y cinemática de victoria de copa
- Sim AI primera corrida 12/12 verde de la historia del proyecto

---
Task ID: 24
Agent: main (APEX Studio)
Task: v7 "Red Sólida + Alma MK" — 5 bugs de bots online + feel Mario Kart (audio dinámico, fantasmas MK8)

Work Log:
- BUG 1 (mayor): items de bots online salían del kart del HOST en todos los invitados — onItemEvent broadcasteaba con id=this.myId (peer del host) y los guests resolvían el puppet por ese id. NetClient.sendEventFor(actorId, ev) nuevo + Game.onItemEvent usa el id del kart actor para bots del host
- BUG 2 (mayor): los ítems de los invitados NO afectaban a los bots del host — handleNetEvent 'hit' solo aplicaba spin si victim.remoteDriven; en el host los bots NO son puppets → el hit se ignoraba y el bot seguía a toda velocidad. Ahora también aplica a karts isNetAuthority (host bots) con burst visual
- BUG 3: bots CONGELADOS al terminar — el stream cortaba antes de enviar f:1 (`!k.finished` gate) → en guests los bots quedaban tiesos junto a la meta como muros inamovibles. Fix: stream continúa tras terminar; karts terminados SIGUEN CORRIENDO como fantasmas MK8 (autopiloto look-ahead a la línea de carrera, sin ítems ni colisiones), ghost visual semitransparente (KartVisual.setGhost con restore de opacidad para el podio), rescate de vacío para fantasmas, jugador terminado también auto-pilota (antes frenaba en seco en plena pista)
- BUG 4: host con pestaña oculta → rAF pausado por el navegador → TODOS los bots congelados para todos los invitados. visibilitychange + setInterval keep-alive (33 ms, fixedStep con accumulator clamp, cleanup al volver/ver dispose), motor de audio silenciado al ocultar
- BUG 5: online tenía aiRubberBand: 0 (sin comeback) → GameShell online usa 0.55
- RemoteDriver MAX_AGE 2500→4000 ms (resiliencia a micro-cortes del host)
- FEEL MK — AudioSystem v2 (todo WebAudio sintetizado): motor continuo (saw+sub-square→lowpass, pitch por velocidad, carga por throttle, brillo por boost), chirrido de derrape (ruido→bandpass, freq por velocidad), mini-turbo por nivel (zip con glissando ascendente 1/2/3), whoosh de turbo (barrido de ruido 420→2900 Hz), beeps 3-2-1 (560) + ¡YA! (940) + zip en salida turbo, ticks de ruleta de ítems (86 ms, blip al resolver), pop de caja, golpe (buzz descendente + thud), posición ganada/perdida, jingle de vuelta y ¡ÚLTIMA VUELTA! + MÚSICA A 1.06x (playbackRate, MK8-style, reset por carrera), jingle de estrella, aterrizaje, fanfarria existente; volumen SFX 0 silencia loops; pausa silencia motor+ruleta
- Hooks: onAnnounce (countdown/go/position/lap/lastlap/finish), updateVisuals (transiciones boost/derrape/ruleta/landing + engine por frame), pickupBoxes, onItemEvent (hit/star), announceCrash
- QA v7 (scripts/qa_v7.mjs, 16/16 OK): flujo fantasma completo offline (jugador termina → autopiloto 25 m/s → visual 0.42 → carrera cierra → podio restaura solidez → posiciones 1..4), online host-shape (4 karts, 3 bots con AIDriver, netBotIds, localKartIds), guest-shape (3 puppets, name tags, items locales solo player), item de bot spawnea DESDE el puppet del bot (fix 1), hit de guest aplica al bot del host (fix 2), hit al player local funciona, keep-alive arms/disarms, 0 page errors con audio activo; VLM: carrera HUD completa sin glitches
- Deploy: build estático → deploy_v7.py orphan push 098f1fb (191 archivos) → Pages "built" ~100 s → LIVE smoke 4/4 (boot, código v7, ghost finish, 0 errores)

Stage Summary:
- LIVE v7: https://googlesitecom.github.io/gmail/
- 5 bugs de bots online resueltos (items con actor correcto, hits cruzados, fantasmas en vez de muros congelados, host en background, rubber-band online)
- Feel MK: el juego ahora SUENA como kart (motor+derrape+mini-turbo+salida+ruleta) y la última vuelta acelera la música; karts terminados = fantasmas MK8 que siguen corriendo
- Pendiente vigilado: QA de dos pestañas reales con PeerJS (broker público) no ejecutado en sandbox — la plomería de eventos se validó con sesiones online-shape in-page

---
Task ID: 25
Agent: main (APEX Studio)
Task: Consultoría de diseño — informe de diagnóstico de game feel (estándar Mario Kart) + dirección visual realista, a partir de auditoría del código real

Work Log:
- Auditoría técnica exhaustiva (agente Explore) de KartController/Config/KartStats/CameraController/AIDriver/ItemData/Textures/Game/TrackBuilder con valores citables: steering lineal sin ramp (2.35 rad/s en 1 frame), drift sin hop (eliminado a propósito), mini-turbo 0.85/2.1/3.4 s, salida turbo ventana 1.77 s, FOV 64→80 binario, applyBoost max-stack, slipstream 1.0s→0.9s×1.22 invisible, shortcutChance IA=0, reverse 9 m/s; render: Lambert/Toon, 0 PBR/envMap/PMREM, PCF 2048 ±55 m, ACES ya presente
- Informe PDF (skill pdf, ruta Report/ReportLab): 17 páginas, 7 capítulos, 10 tablas de parámetros, 3 gráficos matplotlib (radar auditoría 6 pilares, barras mini-turbo vs MK8, matriz impacto-esfuerzo), 4 callouts, TOC automático clicable
- Portada Template 07 Crystal Blue (HTML→html2poster.js 794px, marco 4 líneas, validado con poster_validate + cover_validate sin colisiones), fusionada con pypdf normalizada a A4 exacta
- Fixes de QA: normalización de portada 595.9→595.3pt, rayas espaciadas/placeholders '—' eliminados, body_start_page por pasada (handle_documentBegin + flag primer bookmark) para folios romanos/arábigos coherentes con el TOC, TOC compactado a 1 página
- QA final: pdf_qa PASS (12/12), font.check 0 issues, pages.clean 0, toc coherente (cap.1 = pág. 1), 3 figuras incrustadas verificadas
- Entregables: download/Informe_Consultoria_APEX_KART.pdf (592 KB) + portada HTML; scripts persistidos en scripts/informe_*.py

Stage Summary:
- Diagnóstico: 6 hallazgos de game feel con valor actual vs objetivo (hop de entrada, ramp de dirección 8/12 por segundo + expo 1.6, mini-turbo 0.65/1.5/2.6 s + legibilidad en carrocería, salida turbo ±125 ms, FOV continuo + líneas + roll + encadenado, slipstream visible/atajos IA) y especificación visual realista completa (MeshPhysical+clearcoat por pieza, PMREM del cielo, sombras suaves+blob, asfalto PBR+surco+charcos, hora dorada por pista, presets 60 fps)
- Hoja de ruta en 4 fases con criterios de aceptación y 7 KPIs verificables con el pipeline QA existente (sim_e2e, VLM, telemetría __apex)
- El juego NO se modificó en esta tarea: solo análisis y documento; la implementación de las fases queda como siguiente paso

---
Task ID: 26
Agent: main (APEX Studio)
Task: v8 "Realismo + Feeling de Campeonato" — implementación de las fases 1-2 del informe de consultoría (Task 25): game feel MK8 + dirección visual realista + hitboxes de ítems

Work Log:
- GAME FEEL — KartController: (1) STEERING RAMP+EXPO: steerSm (estado rampado, PHYS.steerRampIn 9/s ataque, steerRampOut 14/s recentrado, expo 1.5 solo jugador) — el teclado ya no pasa 0→full-lock en 1 frame (0.125 s a tope); dirección de drift y selección de truco leen el input CRUDO (respuesta instantánea); ruedas/roll visuales siguen steerSm. (2) HOP MK8: ESPACIO en suelo = salto corto (hopImpulse 4.35, 0.33 s) Y el drift compromete EN EL PRESS (dirección fijada por el steer); el desliz vive en el aire y aterriza cavando (flag fromHop evita endDrift en el detach del hop; saltos de borde/rampa siguen pagando mini-turbo); sin steer = hop puro (esquivar trampas); truco aéreo deshabilitado durante fromHop (no double-tap accidental). (3) MINI-TURBO retune: driftChargeTime 0.85/2.1/3.4 → 0.65/1.5/2.6 (MK8: azul 0.43 s de compromiso pleno, naranja 1.0, morado 1.73)
- GAME FEEL — RaceManager.evaluateTurboStart graduada: ≤150 ms = SUPER (1.5 s ×1.55 + "¡SALIDA TURBO!"), ≤500 ms = buena (0.9 ×1.35), >1400 ms = wheelspin corto, >2300 ms = donuts (la ventana plana de 1.77 s hacía que TODA salida fuera turbo)
- GAME FEEL — colisiones: crashWobbleClosing 8→6.5, crashSpinClosing 15→11.5 (los T-bone y embestidas duras ahora hacen girar a la víctima — antes casi nada giraba); verificado: bot a 20 m/s contra jugador parado → spinT 1.15
- GAME FEEL — CameraController: roll de derrape (rollDrift 0.055 rad ≈ 3.2°, damp 5/s, se anula en podio/snap); hop: playHop (pop sintetizado) al lanzar + camera.kick(0.22) al aterrizar (hopLanded); REBUFO: ParticleSystem.slipstreamStreak (estelas blancas laterales, carga tenue / activo brillante), whoosh playSlipstream + "¡REBUFO!" con cooldown 5 s
- VISUAL — PMREM: Game.applyEnvironment(theme) hornea mini-escena (buildSky escalado ×0.1 + sol HDR valor 12 + disco de suelo) → scene.environment por tema (1.0/1.2 dark); el showroom del menú usa env 'beach' (atardecer). TODO material PBR ahora refleja el cielo real de la pista
- VISUAL — asfalto: MeshStandardMaterial + roadRoughnessTexture() (grano de agregado, 2 surros de carrera pulidos, parches, y en glacier/snow/city CHARCOS + base brillante = "asfalto mojado") envMapIntensity mojado 1.25 vs seco 0.5, metalness 0.06; kerbs MeshStandard semi-gloss
- VISUAL — karts: procedural = MeshPhysical clearcoat 1.0 (chasis/acento) + carbono satin (dark metalness 0.55) + llantas metal 0.9 + goma mate 0.94; GLB go_kart.glb traía metalness=1/roughness=1 (export perezoso = plástico mate) → rebuild como pintura automotriz (metal 0.25, rough 0.42, clearcoat 0.95, env 1.25) con remap de tintables (¡el .copy() cross-familia revienta por sheenColor — construidos a mano!); bug PREEXISTENTE descubierto: los karts del menú renderizaban detrás de la columna de botones (confirmado en LIVE v7) → lookAt(-8,1.5,0) empuja el anillo al tercio derecho visible
- VISUAL — luz: PCFSoftShadowMap (el comentario "r186 removed PCFSoft" era FALSO), normalBias 0.06 + bias -0.0004 (adiós acné), sol más bajo en temas claros (52,34,22) = sombras largas, hora dorada: sun lerp 45% ámbar 0xffb46a, hemi ×0.75 + cálido, fog lerp 30%, CIELO del dome recalentado (horizonte 32% 0xffc98a, cénit 22%) ANTES de hornear el env; snow/glacier siguen fríos
- VISUAL — blob shadow: plano radial bajo cada kart (3.4×4.4) que se queda a nivel del suelo en el aire y se desvanece con la altura (groundGap en VisualState); suelo del showroom MeshStandard roughness 0.16 (piso pulido) + podio Physical
- ÍTEMS: radios generosos MK (seeker 1.6→2.0, hunter 2.2→2.6, dardo/seeker 1.9→2.4, magnet 1.8→2.2, goo 1.6→2.0, mina 2.1→2.5, ventana vertical 1.5→1.8)
- QA: qa_v8.mjs 27/27 (PMREM, road Standard+roughmap, clearcoat/blob, rampa de dirección 0.15@1frame→lock@130ms, hop vivo-en-el-aire-aterriza-derrapando, mini-turbo L1/L2/L3 timings + pago, roll de cámara -2.9°, salida graduada 5 niveles, T-bone spin, rebufo catch, glacier env 1.25); regresión v6 18/18 (fix: selector ONLINE→MULTIJUGADOR + click DOM — Playwright entra en retry-loop cuando el click desmonta el menú) y v7 16/16 (fix: ghost check determinista — el render headless v8 más pesado excedía la ventana de 5.5 s de reloj entre evaluates y montaba el podio antes del check); sim_e2e 240 s 12/12 pistas OK con bots haciendo hop; VLM: glaciar MOJADO+REFLEJOS+SOMBRAS SUAVES ✓, derrape CHISPAS+INCLINACIÓN+SOMBRA DE CONTACTO ✓, menú karts visibles derecha ✓
- Deploy: deploy_v8.py orphan push e01f5b3 (403 archivos) → Pages "built" ~45 s → LIVE smoke: boot, 12 karts, env=true, road MeshStandard, hop controlado (press→airborne+drift inmediato), 0 page errors

Stage Summary:
- LIVE v8: https://googlesitecom.github.io/gmail/
- El juego ahora SE SIENTE MK: hop→drift con compromiso instantáneo, dirección con curva, mini-turbos alcanzables (morado en 1.7 s), salida turbo con maestría, contacto que duele, rebufo visible
- Y SE VE realista: asfalto PBR mojado con reflejos del cielo en hielo, carrocerías lacadas clearcoat, sombras suaves + blob, hora dorada por tema
- Pendiente para v9+: música de fondo durante carrera (solo suena a 1.06x en última vuelta), pistas 30% más largas, habilidades de personaje únicas en carrera, QA PeerJS de dos pestañas reales

---
Task ID: 27
Agent: main (APEX Studio)
Task: v9 "Red de Seda" — fix bots/jugadores online trabados + quitar el bloom feo (realismo y sombras en su lugar); PeerJS ya era el transporte (verificado en chunk desplegado), el problema era la interpolación

Work Log:
- DIAGNÓSTICO del "trabado": (1) RemoteDriver interpolaba sobre RELOJ DE LLEGADA con delay fijo 120 ms a 15 Hz → solo 53 ms de tolerancia a jitter; cada micro-rafaga de WebRTC secaba el buffer → clamp = congelado 2-3 frames → snap al llegar la ráfaga. (2) El host mandaba los 11 bots como 11 MENSAJES separados por tick (ráfaga por invitado). (3) BUG en v2.0 propia: bracket a===b al pasar el frame más nuevo → span 0.001 → clamp al punto (congelado) en vez de extrapolar
- REMOTEDRIVER v2.1 (owner timeline): cada estado lleva el reloj del dueño (NetKartState.t) → interpolación sobre la línea de tiempo del OWNER con offset min-filtrado (tipo NTP: baja rápido, sube al 1%/muestra) → los paquetes con retraso variable se insertan en SU sitio temporal y NADA retrocede; Hermite cúbica C1 con la velocidad del dueño en ambos extremos; extrapolación por velocidad ≤300 ms con ease-out; follower de corrección 18/s (absorva residuos, snap >8 m en respawn); delay adaptativo (piso 2×intervalo+1.5×gapDev del owner, aprende de los secados hasta 250 ms, recupera 0.8 ms/paso); buffer 48 ordenado por t; vy para arcos de hop
- NET: stream 15→20 Hz (netTick%3, jugador y bots), sendBotStates() manda TODO el roster CPU en UN mensaje {t:'bots',rows} por tick por invitado (antes 11), handler en guest al mismo sink onPeerState; buildNetState(k, nowMs) sella con t
- VISUAL "bloom muy feo": strength 0.40/0.55 inundaba el frame → temas día/hielo bloom OFF (realismo = ACES+PMREM+sombras), neón (city/space) 0.26@0.93 solo emisivos, brasa (volcano/prism) 0.30@0.90, menú escaparate 0.24@0.92; bloomWanted + updateBloomEnabled() respeta calidad
- SOMBRAS: descubrimiento — three r186 ELIMINÓ PCFSoftShadowMap (se auto-normaliza a PCF con warning; la nota v8 "no lo removió" era FALSA) → PCFShadowMap explícito (r186 PCF ya es suave: 5 taps Vogel×PCF hardware ≈20 taps) + shadow.radius 4 (penumbra) + frustum ±55→±42 m (26% más nítido donde mira la cámara, sigue al jugador) + updateProjectionMatrix
- QA qa_v9.mjs 17/17: puppet lab determinista (reloj sintético + reloj del dueño desfasado 5000 ms + jitter 0-45 ms + spikes 120-250 ms): minV 11.93 m/s (antes ~0), maxV 18.51 (antes 40+), 100% en banda ±0.8 m, lag total 164 ms, offset aprendido; batch 1 mensaje/tick (103 lotes/5 s, 3 filas), vy+t en el 100% de estados, decode 'bots', bloom por tema, sombras; regresión qa_v8 27/27 + 0 page errors; VLM: meadow SIN glow lechoso + sombras nítidas + natural, volcano glow SOLO en lava + elegante
- E2E PeerJS REAL (peer_e2e_run.mjs + peer_e2e_page.js ampliado, broker público + WebRTC): E2E OK — sala, config, race:start, estados bidireccionales, batch v9 de bots con t+vy intactos, eventos, race:over (fix del test: bots:0 para no esperar el timeout de 30 s), lobby, heartbeat 8 s, kick del host. Era el pendiente "QA dos pestañas reales" de v7
- Deploy: deploy_v9.py orphan push 32c4ccf (392 archivos) → Pages built → LIVE smoke: boot con qaRemote, menú 0.24, meadow bloom OFF + PCF radius 4 + frustum ±42, 0 page errors; VLM LIVE OK
- Entorno: node_modules se perdió (contenedor nuevo) → bun install (859 pkgs); live scripts v9 con NODE_PATH

Stage Summary:
- LIVE v9: https://googlesitecom.github.io/gmail/
- Online: bots y rivales ya se ven sedosos — interpolación sobre el reloj del dueño + extrapolación + follower; 20 Hz; 1 mensaje por tick para todo el roster CPU; PeerJS sigue siendo el transporte (era correcto)
- Visual: bloom feo eliminado (día = realismo puro con sombras PCF suaves y nítidas radius 4 ±42 m; neón/brasa solo emisivos sutiles)
- Pendiente para v10+: música durante la carrera, pistas más largas, habilidades únicas por personaje

---
Task ID: 28
Agent: main (APEX Studio)
Task: v10 "APEX GP" — RECONSTRUCCIÓN TOTAL como simulador de Fórmula 1 realista (no arcade). "Cambia todo, usa lo que tenemos como base". Sin deploy a GitHub (pendiente).

Work Log:
- APROVECHADO DE LA BASE: Spline.ts (Catmull-Rom arc-length), RemoteDriver v2.1 (interpolación owner-timeline — intacto), NetClient PeerJS (host-autoritario, adaptado a teamId/circuitId), pipeline render (ACES+PMREM+PCF shadows, sin bloom — lección v9), arquitectura Next.js/GameBridge/persistencia
- NUEVO MOTOR FÍSICO F1Car.ts (120 Hz): modelo bicicleta con Pacejka-lite por eje, transferencia de masa, aerodinámica v² (ClA 4.35/CdA 1.42, DRS −24% drag), 8 marchas (26..93 m/s), curva de potencia ICE 585 kW + MGU-K 120 kW (ERS con harvest/deploy), frenos carbono 46 kN con CONTROLADOR INTELIGENTE (la trasera nunca satura >84% — brake-by-wire), TC al 93% del límite (cabalga sin pasar), compuestos S/M/H con desgaste ~2%/vuelta, superficies road/kerb/runoff/grass/gravel, watchdog NaN
- BUGS RAÍZ ENCONTRADOS Y CORREGIDOS (via probe instrumental en Playwright): (1) loadSensitivity lineal → agarre NEGATIVO bajo carga aero (¡cada curva rápida patinaba!) — ahora relativo 0.06; (2) TC aplicaba grip×1.27 → elipse mataba el agarre lateral trasero en cada salida; (3) wallConstrain teletransportaba cientos de metros coches en el infield (proyección a sección lejana) — ventana de clamp 35 m; (4) línea de carrera era no-op (promediar lat=0 es punto fijo) — reescrita con acortamiento en espacio-mundo (corta ápices real); (5) dirección IA P-D saturada → fishtail — pure pursuit con curvatura κ=2sin(α)/L_d; (6) circuitos con z no-monótono en el wrap (Catmull-Rom overshoot) — corregidos los 3; (7) detección de atasco disparaba en la parrilla — solo off-road; (8) vueltas fantasma — guard de 25 s
- CIRCUITOS (3, ~2.4-3 km): Velocità (templo de velocidad, chicane rápida tipo Pouhon, Lesmos, Ascari, Parabolica), Bahía (urbano, muros, horquilla marina), Alpino (desnivel 19 m, esses, horquilla summit). Todos: parrilla 20 escalonada pintada, línea de meta a cuadros, sectores, 2 zonas DRS con carteles, marcas de frenada 100/50, kerbs por curvatura, runoffs asfalto/grava anti-pliegue, barreras hormigón/neumático, gantry 5 luces rojas animadas, edificio boxes, gradas con público, árboles, fondo montañas/mar
- IA F1AI: línea física (perfil vTarget con aero-grip + pasada atrás de frenada con 55% del pico + buffer 30 m), ritmo por nivel y por piloto, adelantamientos con rebufo, defensa, errores raros, detección dirección invertida → recuperación (antes bucles infinitos)
- COCHE VISUAL F1Visual: procedural 2022 (morro hexagonal, alerón delantero biplano, halo, pontones, aleta, DRS animado, difusor, suspensiones por barras, 5 radios, discos que brillan al frenar, franja de compuesto, dorsal en canvas, pintura clearcoat PBR)
- CARRERA F1RaceManager: parrilla → 5 luces (hold aleatorio) → salidas en falsa +5 s, sectores 3 con verde/morado, vuelta rápida oficial, DRS por detección (≤1 s) y ventana, límites de pista 4 avisos → +5 s, bandera azul, clasificación con huecos, puntos 25-18-15…
- AUDIO AudioSystem: V6 turbo-híbrido sintetizado (frecuencia de encendido rpm/60×3 + armónicos + waveshaper, turbo 2.2-8 kHz, MGU-K, chirrido de cambio), crujidos de downshift, chirrido de bloqueo, viento, kerb 34 Hz, grava, multitud; shift beeps, luces
- CÁMARAS: chase (FOV velocidad, roll G), cabina (halo visible, head-G), morro, TV (cadena de 16 cámaras con zoom por distancia — corte de director)
- HUD F1 TV: torre de posiciones (colores equipo, huecos, DRS), telemetría inferior (marcha gigante, velocímetro, 15 LEDs rpm, DRS/ERS, gasolina+vueltas, neumático con desgaste, pedales), panel de tiempos S1-S3, minimapa, luces de salida, banderas
- MENÚS: MainMenu carbono/rojo, TeamSelect (10 escuderías ×2 pilotos con barras potencia/aero), SetupScreen (ala 1-5, reparto de freno, compuesto, cambio auto/manual → TODO afecta la física), CircuitSelect con SVG en vivo, OnlineScreen PeerJS con lobby por equipos
- ONLINE: NetClient adaptado (FIELD_SIZE 20, bots = pilotos reales del pool), stream 20 Hz con reloj del dueño, roster CPU en 1 mensaje/tick, eventos hit
- QA qa_f1.mjs 43/43 (boot, grid, luces, lanzamiento 154 km/h/4 s @1 g tracción, 253 km/h punta, frenada carbono, ERS 78%, superficies, recuperación, IA 9 coches + vueltas legítimas sin NaN, 4 cámaras, HUD completo, contrarreloj, Alpino desnivel, retorno menú, 0 page errors) + VLM: coche F1 2022 ✓ circuito F1 ✓ HUD broadcast ✓
- Lección CRÍTICA: el dev server servía bundle obsoleto tras varias ediciones — los tests repetían resultados idénticos; verificar SIEMPRE la geometría viva desde la página antes de iterar sobre fixes

Stage Summary:
- APEX GP v10 funcional en http://localhost:3000 — simulador F1 completo: física de bicicleta con aero+neumáticos, ERS/DRS, 20 coches, 3 circuitos, luz roja, IA que corre y recupera, HUD TV, PeerJS online, contrarreloj con fantasma
- NO subido a GitHub (pendiente a petición del usuario)
- Pendiente v11: ritmo IA más fino en chicanes lentas (ahora recupera tras errores — estilo piloto humano), pit stops, clasificación, safety car, daño, retoque visual del entorno (montañas low-poly), música de menú

---
Task ID: 29
Agent: main (APEX Studio)
Task: v10.1 "Parrilla Limpia" — bugs reportados por el usuario: (1) inicio de carrera con muchos bugs, (2) bugs en los bots, (3) atraviesas a los demás a alta velocidad. Sin deploy a GitHub (sigue pendiente a petición).

Work Log:
- DIAGNÓSTICO (lectura de código + sondas Playwright en vivo):
  * ATRAVESAR COCHES: carCollisions usaba 4 círculos (±1.5 m, R=0.85) comparando distancia contra UN radio en vez de la SUMA (1.7) — contacto solo a mitad de distancia real, con agujeros geométricos entre círculos (lateral: 1.15 m de solape libre; nariz-nariz: 1.55 m) → a alta velocidad cruzabas el shell entre steps y pasabas a través. Además los coches terminados eran fantasmas totales (skip en el bucle).
  * INICIO: totalM = lap*len + wrapped*len se DESPLOMABA ~2.4 km al primer cruce de línea (0.99→0.001) — el líder caía a último en la torre segundos, gaps negativos, DRS ciego, IA ciega al tráfico; todos los coches rank=1 pre-salida (torre aleatoria); la IA entraba en MODO ATAQUE en la parrilla (cualquier coche <18 m delante = todo el grid, filas de 8.5 m) → swerveo ±2.6 m masivo en la salida.
  * BOTS: trompos en cadena en T1/horquilla (cushion de cola +12 m/s sobre coches que frenan), coches aparcados marcha-atrás en el asfalto JAMÁS se recuperaban (wrongWay exigía >2 m/s), el "donut" del spin dejaba los coches mirando atrás (rotación neta ~170°), leader bloqueado tras tráfico (ataque con gate de carril demasiado estrecho + bias alongside que empujaba fuera del carril de ataque), sin ceder bandera azul, defensa one-move declarada pero muerta.
  * RITMO IA (descubierto mid-QA): autopiloto SOLO promediaba 24 m/s vs perfil de 54 m/s — el TC plano (gripR*0.93 longitudinal DENTRO de curvas) dejaba ~37% lateral cuando la curva pedía 85% → snap oversteer en cada chicane → tank-slapper del pure-pursuit (full lock alternado) → coche casi parado (1-12 km/h) repetidamente. Era EL bug de "los bots" (v10 ya lo sufría: solo 4/9 bots >60 km/h).
  * HARNESS: qaStep re-anclaba su reloj sintético a performance.now() en CADA llamada → 58 s de sim en 200 ms reales → nowMs-lapStartMs jamás superaba el guard de 25 s → las vueltas nunca contaban en fast-forward (en juego real el reloj RAF es monótono y funcionaba). Lección v10 repetida: verificado con sonda de relojes (lapStart-goAt=208ms vs perfNow-goAt=8.5s).
- COLISIONES REESCRITAS (Game.ts): OBB SAT 2D (rectángulos 5.4×2.0 exactos al coche visual) con MTV + normal real, impulso con masa y restitución 0.2, separación split por masa inversa (puppets inmóviles), clasificación de contacto (nariz-cola / nariz-nariz / lateral), barrido CCD al punto medio contra túnel, coches terminados sólidos (obstáculos con totalM acumulándose en cool-down), consecuencias: >13.5 m/s cierra = trompo víctima + scrub atacante 0.86; 4-13.5 = wobble yawRate; lateral = empujón + roce. obbContact() helper SAT correcto.
- SALIDA LIMPIA: totalM ACUMULATIVO continuo (init = offset negativo de parrilla, pole −16 m / P20 −92.5 m; acumula delta adelante/atrás, nunca colapsa en la línea); GridSlot.s nuevo (progreso real de slot); car.rank = i+1 en parrilla (torre correcta pre-carrera); RaceManager construye posiciones/lastS desde el grid real; car.lap sincronizado al cruzar.
- IA — SALIDA: launchHoldS 3.4 s de disciplina single-file (sin ataques, sin bias), sin swerveo de parrilla; cushion de cola escalado con distancia PERO colapsa a 3.2 cuando el de delante frena (memoria lastAheadId/lastAheadSpeed); gate de carril ensanchado a 6 m en zonas de frenada (una horquilla encolada a 4 m lateral sigue siendo obstáculo).
- IA — CONDUCCIÓN (el gran fix): TC CONSCIENTE DE LA ELIPSE en F1Car (budget tractivo = gripR*sqrt(1-latDemand²) con rearLatDemand del step anterior — potencia completa solo en recta); asistencia IA 0.45→0.65; margen de curva brakeUse 0.94→0.905; atenuación de gas vs carga de volante a TODAS las velocidades (antes solo <30 m/s); RECUPERACIÓN DE DERRAPE con histéresis (entra >0.34, sale <0.16) — alinear ruedas con el vector velocidad (signo automático por fórmula) al 65% y cap ±0.75 (full lock alimentaba el tank-slapper), gas 0.15× durante el save; lookM floor 12→8 (re-apunta rápido tras errores); buffer de frenada escalado con velocidad (4-30 m, antes 30 fijo = ciego en chicanes).
- IA — TRÁFICO/RACECRAFT: obstáculo lento (<15 m/s) = chicane móvil → esquivar por el lado abierto SIN cap de velocidad; seguimiento de rodadas del coche de delante en curvas (proyección spline con hint) — evita el contacto nariz-cruz-lateral de vuelta 1; gate de ataque sin divebombs (no iniciar en zona de frenada); defensa ONE-MOVE implementada (campos muertos revividos: blockeo del lado del perseguidor 1.5 s, cooldown 5.5 s, rng defendBias); BANDERA AZUL: coche con vuelta a favor ≤45 m detrás → apartarse 2.4 m de la línea + levantar 10%; coches terminados visibles al tráfico (chicane de cool-down con distancia forward-frame).
- RECUPERACIÓN ANTI-VARADO (F1Car): parkedWrongWay (parado mirando atrás → respawn 1.4 s), parkedStuck (parado contra muro/coche a <1.8 m/s → respawn 1.8 s — el wall-wedge era eterno), spin script re-escrito (rotación neta ~70-90°, ya no estaciona víctimas marcha-atrás).
- QA qa_f1_v11.mjs 27/27: parrilla 20 íntegra (ranks 1..20 únicos, totalM monótono, 0 solape), salida sin caos (0 trompos/0 off-track/0 solape >0.25 m primeros 3 s), T1 acotado (0 trompos), orden estable al cruzar línea (pérdida máx 5 m vs 2.4 km del bug), NO atravesar: rear-end a ~85 m/s registra contacto (impulso/trompo/scrub, pen máx 0.000 m, sin pase limpio), roce lateral separa (sep 1.0→2.0 m, sin agujero lateral), carrera 20 coches limpia (0 varados, 0 colas, líder vuelta 1 a ~105 s sin bloqueos, 17/20 cambian posición, 0 trompos simultáneos), bandera azul cede y no bloquea, 0 page errors.
- REGRESIÓN qa_f1.mjs 43/43 (con versión v10.1): mejora visible — AI racing 9/9 >76 km/h (antes 4/9), vueltas 1 para los 10 coches @~110 s (antes máx 0-1), líder 4499 m @110 s (antes ~1500 m), ERS/frenadas/cámaras/HUD/contrarreloj/Alpino todo verde.
- VLM (vlm_v101.js): parrilla correcta sin solapamiento ✓, lanzamiento ordenado sin coches atravesados ✓, HUD correcto ✓ (nota: autopiloto con una excursión a hierba puntual en una captura, recuperada).
- Entorno: bun install 859 pkgs (contenedor nuevo otra vez); dev server dentro de la misma invocación bash que el QA (el sandbox mata procesos al cerrar cada comando) — runner qa_f1_v11_run.sh reutilizable.

Stage Summary:
- v10.1 en http://localhost:3000: colisiones OBB SAT reales (imposible atravesar coches, con CCD), salida de carrera limpia (parrilla ordenada, sin swerveos, clasificación continua al cruzar la línea), bots rápidos y estables (TC con elipse de fricción + recuperación de derrape: media 24→34 m/s, vueltas de ~74 s, 0 varados), racecraft completo (esquiva obstáculos, sigue rodadas en curvas, defensa one-move, bandera azul)
- NO subido a GitHub (pendiente a petición)
- Pendiente v10.2+: pit stops, clasificación, safety car, daño aerodinámico, ritmo fino por piloto (pace map estilo 2024), música de menú

---
Task ID: 22
Agent: main
Task: "No me sale el preview" — diagnóstico y arreglo del preview caído

Work Log:
- Contenedor NUEVO reiniciado a las 22:33 (otra vez): procesos muertos + node_modules borrado → el preview no mostraba nada
- bun install: 859 paquetes reinstalados (8.6 s)
- Dev server arrancado DETACHED (setsid + nohup, bun run dev > dev.log) — verificado que SOBREVIVE entre comandos bash separados (ps + curl 200 en invocaciones distintas)
- Caddy interno :81 → :3000 verificado (200)
- URLs externas preview-*.space-z.ai probadas con varios IDs candidatos (container ID, FC_FUNCTION_NAME, session_id): gateway responde 404 con header Abc — el dominio público no enruta a este contenedor; el acceso correcto para el usuario es el Preview Panel del interfaz web
- QA con agent-browser: página carga sin errores de página ni de consola (solo React DevTools + HMR), menú APEXGP completo (GRAN PREMIO / CONTRARRELOJ / MULTIJUGADOR / OPCIONES), screenshot guardado en tool-results/preview_check.png

Stage Summary:
- Preview restaurado: el problema era el reinicio del contenedor (servidor muerto + dependencias borradas), NO un bug del juego
- v10.1 intacto y funcionando en :3000; servidor ahora persistente entre comandos
- Para futuros reinicios de contenedor: reinstalar (bun install) + relanzar con setsid/nohup, ver Task ID 22

---
Task ID: 23
Agent: main
Task: Integrar assets reales del usuario (repo googlesitecom/googleslides): modelo F1 GLB + 3 texturas foto

Work Log:
- Descargados con token GitHub: f1_dallara_gp208.glb (8.3 MB, Sketchfab, Dallara GP2/08, 53 mallas, 4 materiales con texturas embebidas) + AsfaltoF1.jpg/Borde_PistaF1.jpg/PastoF1.jpg (768×768) → source/public/models/f1/ y source/public/textures/f1/
- Análisis Python del GLB (scripts/inspect_glb*.py, analyze_assets.py, extract_glb_textures.py, analyze_livery.py): aplicando matrices de nodo → coche 2.11×1.28×5.66 m, FRENTE = −Z (rotar 180°), ruedas radio 0.36 (= PHYS.tireRadius), cada eje es UNA malla (ambas ruedas) → imposible animar por rueda; libreo 64% azul (Renault)
- VLM sobre texturas: asfalto desgastado uniforme, kerb rojo/blanco franjas diagonales 45°, pasto denso con fibras — las 3 seamless
- NUEVO src/game/f1/F1Assets.ts: carga idempotente GLB+3 JPGs en paralelo (nunca falla, fallback procedural), plantilla normalizada (rot.y=π, escala 0.95 → huella 2.00×5.38 = OBB físico, lift 0.05, z-shift 0.28, 6 meshes de ruedas ocultos), getLivery(color): re-mapea píxeles azules de la librea al color de equipo conservando luminancia (decals blancos/negros intactos), cache por color
- F1Visual.ts dual-mode: modo GLB (clon de plantilla + TODOS los materiales clonados por coche para ghost-safe + livery de equipo + ruedas procedurales ANIMADAS en las posiciones exactas de los pasos de rueda del GLB (x=±0.82, z=+1.72/−0.78) + casco esférico con visera + placa de dorsal en el morro + DRS rotando el nodo Spoiler_Top_low) y fallback procedural intacto; buildWheels/addNumberPlate compartidos; dispose no toca recursos compartidos de la plantilla
- F1TrackBuilder.ts: AsfaltoF1→carretera (con multiplicador 0xb4b6ba hacia goma de carrera + roughnessMap procedural de rodada), Borde_PistaF1→kerbs, PastoF1→franjas de pasto + plano lejano (clon con repeat 200²); texturas foto compartidas NUNCA se disponen (flag userData.isPhoto)
- Game.ts: F1Assets.load() en constructor → al resolver pre-hornea las 10 liveries de TEAMS (coste cero al iniciar sesión) y hace hot-swap del coche del menú; startSession ahora async (await assets, guard startingSession anti doble-click); versión → apexgp-v10.2
- BUG DRS arreglado en vivo: base del alerón −90°, el delta inicial −0.42 lo hundía (VLM: "volcado"); corregido a +0.87 (−1.571 → −0.701 = plano) verificado por VLM ✓

Stage Summary:
- QA regresión: qa_f1_v11 27/27 OK (una vez; otras corridas 26/27 con checks estocásticos borderline rotando — early-leader/train-jams, no estructurales, pageErrors=0 siempre), qa_f1 43/43 OK
- Verificaciones VLM: showroom GLB limpio (ruedas asentadas, sin glitches) ✓, parrilla 20 coches con liveries por equipo ✓, DRS plano abierto ✓
- renderer: ~2200 mallas visibles (≈ igual que procedural ~40/coche); FPS 1 en headless = throttle de tab background, no regresión
- NO subido a GitHub (sigue pendiente a petición)
- Assets del usuario en producción: coche Dallara real + asfalto/kerb/pasto fotográficos con fallback procedural

---
Task ID: 30
Agent: main (APEX Studio)
Task: v11 "Inmersión + ULTRA" — complete the weather system wiring, LOCK graphics at maximum quality, 10x visual upgrade (mountains/trees/wet road/cockpit), full English conversion. User: "haz que los graficos altos esten fijos. y mejoralos, 10 veces mas estan malisimos"

Work Log:
- WEATHER WIRED (was written but never connected): Game.startSessionNow now passes cfg.weather to F1CircuitWorld → resolveWeather() layers the env style → makeSkyDomeV2 (gradient + sun disk/glow + horizon haze + stars/moon at night) replaces the old flat dome; fog/lights/exposure from the WeatherStyle; drifting billboard cloud layer (all but night); rain = makeRainSystem (750 camera-following streak lines + 150-sprite rooster-tail spray pool behind fast cars); night = 2 follow spotlights + 6 mast point fills from world.floodHeads; wetGripScale 0.86 applied to EVERY car (AI line already used rainLineMu); vignette per condition (night 0.5 / rain 0.42 / clear 0.32)
- PMREM weather-aware: bakeEnvironment(style, weather) bakes the ACTUAL sky v2 + sun with per-condition power (clear 12 / cloudy 4.5 / rain 5.2 bright overcast so wet asphalt has something to mirror / night 3.2 moon); scene.environmentIntensity rain 1.2 / night 0.85
- ULTRA LOCKED (user request): applyQuality() ignores its argument — full devicePixelRatio (cap 2) + shadows always on; shadow map 2048→4096 radius 5; VIDEO.quality low/medium/high ALL resolve to the same ULTRA values (save-file compat); SaveData default 'high'; OptionsPanel quality selector REMOVED → "ULTRA — LOCKED" badge; decor/crowd always 1.0
- VISUAL 10x (VLM-guided iterations, 5/10 → 6.5-8/10 per shot):
  * Mountains: lone 7-seg pyramids → (a) FAR: two 240-segment RIDGE SILHOUETTE strips (broad massif waves + fine serrated crest, radius noise ±140 m) at maxR+460/+720, (b) NEAR: 12 noise-displaced flattened hemisphere ROLLING HILLS, (c) alpine only: 5 snow-capped noise-displaced peaks; fogFar extended 950-1200 → 1500-1650 so the ranges layer in atmospheric haze
  * Sky: horizon haze band 0.18·pow6 → 0.34·pow4 (melts into fogged terrain — no sharp sky/ground cut)
  * Trees: single cones → mixed woodland: 60% 3-tier flat-shaded conifers + 40% noise-blob deciduous, 6 green tones, shared foliage noise texture (clumping speckle)
  * Wet road (rain): MeshStandard metal 0.14 (dark tinted reflection = matte) → MeshPhysical DIELECTRIC film: roughness 0.2, metalness 0.02, env 2.3, CLEARCOAT 0.8/0.12 + asphaltRoughnessWet() with 26 mirror PUDDLE blobs + soaked racing groove — VLM now reads "dark and reflective, mirroring the grey sky"
  * Clouds: invisible (239 m altitude above a 35° FOV that looks down) → wide flat banks (260-600 m) at 55-115 m altitude in the visible horizon band
  * COCKPIT CAM FIX: eye (0, 0.86, -0.18) was INSIDE the Dallara GLB airbox (grey void) → eye at the helmet (0, 0.7, 0.16), helmet falls inside the near plane (invisible like real onboard), nose/wheels/suspension visible ahead — VLM: "COCKPIT_VIEW si, good sense of speed"
- ENGLISH EVERYTHING: MainMenu, OptionsPanel (rewritten), HUD (LAP/LEADER/BLUE FLAG/TRACK LIMITS/WHEEL LOCKUP/CHEQUERED FLAG…), PauseMenu, ResultsScreen, SetupScreen, TeamSelect, CircuitSelect, OnlineScreen, GameShell, Game.ts CAM_NAMES (CHASE/COCKPIT/TV/NOSE) + announcer, F1RaceManager (LIGHTS OUT! / FASTEST LAP / FINAL LAP! / JUMP START / TRACK LIMITS), InputManager labels, NetClient errors; proper nouns (Velocità, Cóndor) kept as names
- UI: weather selector added to CircuitSelect (CLEAR/CLOUDY/RAIN/NIGHT cards with glowing dots); AI buttons EASY/MEDIUM/HARD/EXPERT
- QA: NEW qa_f1_v11_weather.mjs 45/45 (ULTRA lock pixelRatio 2.0 @DPR2 + 4096 map, per-weather sky/clouds/750-rain-streaks/8-night-lights/grip 0.86/wet clearcoat material/autopilot race all 4 conditions, English menu sweep, weather chips present, 0 page errors); qa_f1.mjs 43/43 (version bump v11.0 + cockpit still green); qa_f1_v11.mjs 26/27 — the 1 fail (blue flag yields) verified IDENTICAL on stashed pre-change code via git stash A/B (pre-existing test artifact: the QA autopilot follows the backmarker instead of forcing the approach; probe_blueflag shows the yield logic alive); VLM: all 4 conditions OK, alpine 8/10, cockpit fixed, menu "sleek professional"
- Ops lessons: dev server DIED between commands repeatedly → run_vista.sh pattern (server+probe+VLM in ONE bash session); STALE BUNDLE after edits → pkill + rm .next/dev + fresh boot before visual QA; git stash pop conflicts on QA-regenerated PNGs → checkout the artifacts first
- NOT deployed to GitHub (still pending per user)

Stage Summary:
- v11 live on :3000 — graphics LOCKED at ULTRA (full DPR, 4K shadows, full decor), 4 selectable weather conditions fully wired (sky/lighting/physics/particles), cockpit camera fixed, 100% English UI
- Visual quality roughly doubled per VLM (pyramid mountains → layered ridges+hills+haze; matte rain → glossy puddled clearcoat; invisible clouds → horizon banks; 5/10 → 6.5-8/10 per shot)
- Pendiente v12: deploy to GitHub Pages, real texture atlases for trees/mountains (photoscanned), pit stops, safety car
---
Task ID: 31
Agent: main (VELOCITY GP)
Task: v12 "SPECTACLE" — rebrand + new logo, F1 motion-graphics intro, ARCADE handling, car-collisions removed, 10x visual pass (MSAA+bloom+LUT+FXAA+speed-blur), menu music (repo MP3 full volume, silent in race), richer engine sound, camera overhaul. User: "Cambia el nombre de la pagina web y el logo... mas facil y arcade. Quita las colisiones entre coches. haz una intro del juego super animada graphic motion como f1. Añadi una musica dde fondo al repo que al iniciar eel juego suena a todo volumen y ya en la carrera no. tambien añadi un sonido de motor para que jueges con el y suene bien"

Work Log:
- REBRAND: APEX GP → VELOCITY GP (Formula Racing Simulator). New speed-mark logo (public/logo.svg: italic V from racing lines + red streaks). layout.tsx rewritten (lang=en, English metadata, /logo.svg favicon, Viewport themeColor), page.tsx loading splash, MainMenu rebuilt with VgpMark + ambient speed-streak CSS animation, globals.css font stacks fixed (removed dead --font-display/--font-body vars → system heavy stack). window.__apex QA handle kept (script compat).
- ARCADE HANDLING (F1Car.ts): new `arcade` flag (player only; AI stays on the sim bicycle model). Grip-capped kinematic steering: yawTarget = clamp(Ackermann + low-speed pivot, ±latMax/v); latMax = μ·g·gripBoost(1.32) + v²·aeroLat(0.0072); vLat glued to a whisper of drift; overspeed cornering scrubs speed (excess·0.06) instead of spinning — the car PHYSICALLY CANNOT spin from steering. Slower steering ramp (4.6 in / expo 1.34 / falloff 0.5). Low-speed pivot (<14 m/s, blend to 1.35 rad/s) so the pursuit can tighten onto hairpins. arcadeCrawl recovery (<4.5 m/s on-road 2.4 s → respawn) as safety net. QA autopilot (qaAuto) drives the SIM model (it was tuned for it); real input always gets arcade.
- COLLISIONS REMOVED: carCollisions() no longer called (OBB SAT code kept for online hit events). Player ghosts through the field. NEW softSeparation(): AI-only gentle repulsion (3 m target, position nudge only, no impulses) — without it packs MERGE into single points and mutually deadlock their obstacle logic (the alpino hairpin jam: 0.9 m pairs, whole field at 13 km/h).
- RACING LINE FIX (RacingLine.ts): the shortening pass snapped the line across hairpin apexes → fake sub-1 m-radius kinks → ~4 m/s pockets in vTarget → field-wide crawls. KINK CLAMP (κ ≤ 0.16 = 6.25 m min radius) + vTarget floor 9.5 m/s. This was the root cause of the alpino total jam (all 10 cars ≤ 13 km/h) — and the reason v11 passed only by timing luck.
- POST STACK (Game.ts): MSAA 4x HalfFloat composer RT → UnrealBloom 0.22/0.55/0.88 (sun & specular glare only) → OutputPass (ACES) → BROADCAST GRADE *after* tonemap (contrast 1.13, saturation 1.22, crushed blacks −0.012, teal-shadow/warm-highlight split-tone, vignette, radial SPEED BLUR + chromatic fringe scaled by velocity) → FXAA (auto-off at DPR ≥ 1.5). Grading AFTER OutputPass was the key: grading before it got washed out by the tonemap curve. Asphalt bumpMap added (bump 0.045 dry / 0.02 wet), photo textures anisotropy 8→16.
- CAMERA (Config + CameraController): chase 10.2/2.7/58°/lerp7.5 → 8.1 m / 2.0 m / 63°+17 / lerp 11.5 with lookLerp 20 — low, tight, snappy F1-game feel + steer-biased corner PEEK (7 m) + high-speed rumble floor. Speed blur onset 20 m/s (cockpit/nose 1.5x).
- INTRO (Intro.tsx): gate ("click to start" — unlocks audio) → 5 red start lights with beeps → lights-out white flash → red/white SPEED-STREAK wipe → VELOCITY GP slam-in (motion blur, staggered L/R) → tagline letter-spacing reveal → "click to continue" → menu. Skip button + Escape. QA escapes: window.__vgpIntro.skip() + auto-dismiss when a session starts (online race:start safe).
- MUSIC (AudioSystem.ts): the repo's own Musica_Fondo.mp3 (134.9 s, 48 kHz — user-provided!) plays FULL VOLUME (0.9 default, was 0.55) looping at menu; PAUSES THE INSTANT a session starts (immediate pause — a setInterval fade starved behind the ~4 s session build and bled music into races: fixed after a canary-timer trace proved main-thread starvation); resumes on quitToMenu. basePath-aware URL (/gmail/). Procedural anthem engine (126 BPM Am-F-C-G: kick/snare/hats/bass/supersaw stabs/pad/arp+delay/riser) kept as silent fallback if the file 404s. Music defaults 0.55→0.9, sfx 0.8→0.85.
- ENGINE SOUND: +2 harmonic voices (4th/5th, the 12k-rpm scream), intake-roar noise band (throttle+rpm-driven bellow), base gain 0.16→0.30 (the player's instrument dominates), brighter filter sweep, sfx bus glue compressor + master limiter (nothing clips).
- BLOB CONTACT SHADOWS (F1Visual): radial-gradient quad under every car (0.78 alpha core) — cars are grounded even when sun shadows go soft at speed.
- QA: qa_f1.mjs 43/43 (alpino elevation check now samples the SPLINE's y-range — the old car-snapshot check was bunching-timing-fragile). qa_f1_v11.mjs rewritten for v12 semantics: ghost-through tests (player rams bot at 85 m/s → no spin/no scrub/clean pass), side overlap persists (no SAT), ARCADE STABILITY (full-lock pulses at 30/55/80 m/s on the straight: maxYaw 1.05/0.86/0.86 rad/s, |vLat| 0.4-0.5 m/s, ZERO spins at any speed), launch/grid overlap bounds relaxed for ghosting, train-jam metric now requires BOTH cars slow (fast draft trains are healthy). 31/31. qa_f1_v11_weather.mjs 45/45 (screenshots hardened with 90 s timeouts — headless RAF stalls).
- OPS LESSONS: (1) `bun run build` (static) CLOBBERS .next while the dev server lives → stale/inconsistent dev chunks → hard-restart + rm -rf .next before trusting local probes. (2) A canary setInterval proved the session build blocks the main thread ~4 s (headless) — never put gameplay-critical timing on setInterval during transitions. (3) VLM zoom-crop criticism can be an artifact of my own LANCZOS upscale — always verify aliasing with 1:1 pixel-gradient analysis (result: 0 hard single-pixel jumps on kerbs; MSAA verified working).
- DEPLOYED: static export (BUILD_STATIC=1, basePath /gmail, publicAsset() fixed for GLB/textures/music paths) → orphan push 8418393 (460 files) → LIVE VERIFIED: boot, intro gate, v12.0, 20-car race, music full-volume@menu → PAUSED@race → resumed@menu-return, 0 page errors. https://googlesitecom.github.io/gmail/

Stage Summary:
- LIVE v12: https://googlesitecom.github.io/gmail/ — VELOCITY GP: rebranded + logo, F1 intro motion graphics, arcade handling (cannot spin), no car collisions (AI soft separation), MSAA+bloom+broadcast-LUT+FXAA+speed-blur, menu music full volume / silent in race, richer V6 engine, low-tight-snappy chase cam with corner peek
- QA: 43/43 + 31/31 + 45/45, LIVE smoke green
- VLM visual scores this session: race 2/10 → 4.5/10 (color grade 6/10, grounding 7/10 after LUT reorder + contact shadows), menu 7.5/10 — the remaining gap is asset-level (768 px textures, low-poly trees) not pipeline
- Pendiente v13: photoscanned/higher-res track & environment assets, pit stops, qualifying, safety car, damage
