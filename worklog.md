
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
