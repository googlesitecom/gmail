# -*- coding: utf-8 -*-
"""Contenido del informe APEX KART — Parte B (capítulos 4 a 7)."""

B = []

# ============================================================ CAP 4 =========
B += [
    ('h1', '4. Dirección Visual Realista: Diagnóstico del Pipeline'),
    ('body',
     'El apartado gráfico actual combina una base técnica correcta con una capa de materiales '
     'que apunta exactamente en dirección contraria al realismo solicitado. Es importante '
     'separar las dos cosas, porque el diagnóstico cambia por completo la estimación de '
     'esfuerzo: lo que ya está bien no hay que tocarlo, y lo que falta es más barato de lo '
     'que parece.'),
    ('h2', '4.1 Lo que ya está bien'),
    ('body',
     'El renderizador usa tone mapping ACES con exposición 1,05 ajustada por tema (0,95 en '
     'pistas de hielo, 1,3 en temas oscuros) y salida sRGB: el esqueleto de un pipeline '
     'moderno ya está montado. Cada pista define su propia luz solar, hemisférica y '
     'ambiente, con niebla por tema y un bloom calibrado por familia de pista (en hielo baja '
     'a 0,16 de intensidad con umbral 0,95 para no quemar la nieve; en temas oscuros sube a '
     '0,55 con umbral 0,85 para que brillen los neones). Las sombras existen: un mapa de '
     '2048 píxeles que sigue al jugador en una caja de ±55 metros. Y la textura del asfalto '
     'ya usa fotografía real. Este inventario importa porque significa que la conversión '
     'realista no empieza de cero: es una sustitución de materiales sobre una base sana.'),
    ('h2', '4.2 Lo que impide el realismo'),
    ('body',
     'El chasis del kart usa Lambert y los personajes usan Toon con un gradiente de cuatro '
     'pasos: cel-shading deliberado. La pista es Lambert con la fotografía de asfalto '
     'aplicada sin mapa de rugosidad, sin mapa de normales y sin respuesta especular de '
     'ningún tipo. No existe ni un solo mapa de entorno, generador PMREM o material '
     'Standard/Physical en el pipeline procedural, y el cielo es un domo de gradiente '
     'programado, no un entorno que ilumine. La consecuencia práctica es determinante: '
     'ninguna superficie del juego puede reflejar nada, ningún metal puede parecer metal, y '
     'ninguna carrocería puede tener el barniz de pintura automotriz. El render es plano por '
     'construcción, no por error de ejecución. La Tabla 5 resume componente a componente la '
     'distancia entre el estado actual y el objetivo realista.'),
    ('table', {
        'caption': 'Tabla 5. Stack de render: estado actual frente a objetivo realista.',
        'header': ['Componente', 'Actual', 'Implicación', 'Objetivo'],
        'ratios': [0.20, 0.26, 0.26, 0.28],
        'rows': [
            ['Carrocería', 'MeshLambertMaterial', 'Cero especular, cero reflejos',
             'MeshPhysicalMaterial + clearcoat'],
            ['Personajes', 'MeshToonMaterial (4 pasos)', 'Cel-shading completo',
             'PBR conservando siluetas'],
            ['Asfalto', 'Lambert + foto', 'Rugosidad uniforme, sin relieve',
             'Standard + normalMap + roughnessMap'],
            ['Ambiente', 'Solo luz hemisférica', 'Sin iluminación de imagen (IBL)',
             'PMREM del cielo → environment'],
            ['Sombras', 'PCF 2048, ±55 m', 'Bordes duros al alejarse',
             'Suaves + sombra de contacto'],
            ['Cielo', 'Domo de gradiente', 'No ilumina los materiales',
             'Fuente de IBL (misma geometría)'],
            ['Post-proceso', 'Bloom por tema + viñeta', 'Ya calibrado (no tocar)',
             'Añadir aberración cromática leve'],
        ],
    }),
    ('h2', '4.3 Dirección de arte recomendada: realismo de arcade'),
    ('body',
     'La recomendación profesional no es fotorrealismo puro, sino realismo de arcade: '
     'materiales y luz físicamente plausibles sobre siluetas y colores legibles de party '
     'racer. La propia referencia de la franquicia demuestra que el realismo de materiales '
     'no pelea con la legibilidad: carrocerías con barniz brillante, asfalto que refleja el '
     'cielo tras la lluvia, pero bordillos saturados y paleta alta. Para APEX KART esto '
     'significa conservar las proporciones y el color de los personajes mientras se '
     'reemplaza el sombreado completo: el juego ganará profundidad y peso sin perder lectura '
     'de pista a velocidad máxima. La regla de oro que gobierna todo el capítulo 5: ningún '
     'cambio visual puede costar ni un frame de reacción del jugador.'),
]

# ============================================================ CAP 5 =========
B += [
    ('h1', '5. Dirección Visual Realista: Especificación Técnica'),
    ('body',
     'Este capítulo traduce el diagnóstico en una especificación implementable sobre Three.js '
     'con valores concretos. El orden de las secciones es también el orden recomendado de '
     'implementación: primero los materiales de la carrocería porque son el primer plano del '
     'jugador, después la iluminación de imagen que los alimenta, luego las sombras, el '
     'asfalto y finalmente el post-proceso y el presupuesto de rendimiento.'),
    ('h2', '5.1 Carrocería con reflejos realistas'),
    ('body',
     'El material de firma del realismo automotriz es el barniz: una capa de pintura metálica '
     'bajo un clearcoat brillante. En Three.js se consigue con MeshPhysicalMaterial: '
     'metalness 0,75, roughness 0,32, clearcoat 1,0 y clearcoatRoughness 0,06 para el chasis '
     'pintado con el color de cada personaje. Las piezas se diferencian por material, porque '
     'el ojo lee el contraste: neumáticos de caucho mate casi sin reflejo, llantas y escape '
     'de cromo especular, asiento de tela rugosa, casco con barniz. El sobrecoste de '
     'MeshPhysical frente a Lambert es aproximadamente un 50% por malla, pero con los 10 '
     'draw calls por kart que ya existen y 12 karts en pista, el impacto total queda por '
     'debajo de un milisegundo por frame.'),
    ('table', {
        'caption': 'Tabla 6. Materiales por pieza del kart (MeshPhysicalMaterial).',
        'header': ['Pieza', 'Metalness', 'Roughness', 'Clearcoat', 'Lectura visual'],
        'ratios': [0.24, 0.15, 0.15, 0.15, 0.31],
        'rows': [
            ['Chasis pintado', '0,75', '0,32', '1,0 / 0,06', 'Pintura automotriz del color del piloto'],
            ['Neumáticos', '0,00', '0,92', 'n/a', 'Caucho mate absorbe luz'],
            ['Llantas', '1,00', '0,18', 'n/a', 'Cromo con reflejo nítido'],
            ['Escape', '1,00', '0,22', 'n/a', 'Metal mecanizado'],
            ['Asiento / tela', '0,00', '0,85', 'n/a', 'Tela rugosa difusa'],
            ['Casco del piloto', '0,20', '0,30', '0,8 / 0,10', 'Barniz brillante secundario'],
        ],
    }),
    ('h2', '5.2 Iluminación de imagen (IBL)'),
    ('body',
     'Un material físico sin entorno que reflejar es un traje sin espejo. La solución de '
     'menor coste y mayor coherencia: generar el mapa de entorno desde el propio domo de '
     'cielo de cada pista con PMREMGenerator y asignarlo a scene.environment. Ese único '
     'cambio regala a todos los materiales PBR reflejos ambientales coherentes con la pista: '
     'atardecer dorado en el desierto, mediodía azul en el glaciar, neón en la ciudad. El '
     'coste es único al cargar la pista (1 a 2 milisegundos) y cero por frame. Recomendación '
     'de dirección: añadir un disco solar brillante al domo, de modo que los clearcoat '
     'tengan un punto caliente que recorra la carrocería cuando el kart gira: ese destello '
     'errante es la señal número uno que el ojo humano usa para leer una pintura brillante.'),
    ('h2', '5.3 Sombras bien definidas'),
    ('body',
     'Tres ajustes y una adición. Primero, suavizar el filtro: PCFSoftShadowMap si la '
     'revisión del motor lo mantiene disponible, o VSM con 8 muestras de desenfoque si no. '
     'Segundo, ajustar la resolución y el encuadre: 2048 en calidad media y 4096 en alta, '
     'con la caja ortogonal reducida a ±45 metros alrededor del jugador para concentrar los '
     'texels donde la cámara mira. Tercero, normalBias de 0,02 a 0,05 para eliminar el acné '
     'de sombra sobre las superficies curvas de la carrocería. La adición: una sombra de '
     'contacto (blob) bajo cada kart, un plano de 2,4 metros con gradiente radial al 35% de '
     'opacidad. Es barata, siempre correcta incluso cuando el mapa de sombras no alcanza, y '
     'sobre todo ancla visualmente el kart al asfalto, el síntoma más común de flotación en '
     'juegos con cámaras de persecución.'),
    ('h2', '5.4 Asfalto pulido y mojado'),
    ('body',
     'La pista es donde el realismo se gana por metros cuadrados, y la buena noticia es que '
     'la fotografía de asfalto actual sirve como mapa de albedo. La especificación completa '
     'por capas: un mapa de normales de grano generado por canvas (ruido de alta frecuencia '
     'convertido a normal, repetición de 8 a 16 veces) para el micro-relieve; un mapa de '
     'rugosidad con parches de 0,55 a 0,85 para que la luz viaje de forma irregular como en '
     'el asfalto real; y el detalle estrella, el surco de carrera: una franja sobre la trazada '
     'ideal ligeramente más oscura y con rugosidad 0,35, más brillante que el resto. Ese '
     'pulido acumulado por miles de neumáticos es el rasgo que más circuito real transmite '
     'en la percepción del jugador. Para las zonas mojadas, la rugosidad cae a 0,08-0,15 con '
     'intensidad de entorno 1,6: el asfalto empieza a espejar el cielo. Los charcos '
     'puntuales usan planos Reflector a media resolución con normal de rizado, limitados a '
     '6 u 8 visibles por pista. Los bordillos ganan un bisel en la normal y clearcoat '
     'superior: pintura fresca que brilla al sol rasante.'),
    ('h2', '5.5 Iluminación dinámica por pista'),
    ('body',
     'Cada pista debe tener su hora del día reconocible, lo que en la práctica significa '
     'configurar color, intensidad y elevación del sol por tema. La Tabla 7 propone el '
     'reparto. La infraestructura temática de luces ya existe, así que este ajuste es de '
     'datos, no de código: color e intensidad del sol, color del cielo y del suelo en la luz '
     'hemisférica, y coherencia con la niebla existente. La elevación baja del atardecer '
     'multiplica el drama de las sombras largas y alimenta los clearcoat con luz rasante, '
     'que es donde el barniz luce más.'),
    ('table', {
        'caption': 'Tabla 7. Hora del día por pista (propuesta de valores de sol).',
        'header': ['Pista', 'Hora del día', 'Color del sol', 'Intensidad', 'Elevación'],
        'ratios': [0.24, 0.22, 0.20, 0.15, 0.19],
        'rows': [
            ['Desierto', 'Hora dorada', '#FFD9A0', '2,8', '18°'],
            ['Hielo / Glaciar', 'Mediodía azul', '#EAF4FF', '3,2', '65°'],
            ['Ciudad', 'Crepúsculo', '#FF9E6B', '2,2', '8°'],
            ['Volcán', 'Contraluz', '#FF7A45', '2,4', '12°'],
            ['Pradera / Playa', 'Media tarde', '#FFF2D5', '2,6', '35°'],
            ['Espacio / Prisma', 'Noche fría', '#9FB8FF', '1,8', '40°'],
        ],
    }),
    ('h2', '5.6 Post-proceso calibrado'),
    ('body',
     'El bloom por tema se mantiene exactamente como está: fue calibrado en la iteración '
     'anterior y no debe tocarse. Las adiciones son quirúrgicas: una aberración cromática '
     'muy leve (0,0008) que solo actúa por encima del 85% de la velocidad máxima para '
     'vender velocidad sin ensuciar la imagen en conducción normal; la viñeta existente al '
     '0,55 se conserva; y el antialiasing FXAA se mantiene activo en todas las calidades. '
     'Como opción de calidad alta, una oclusión ambiental de pantalla (SAO) aporta '
     'profundidad de esquinas en gradas y túneles por unos 2 milisegundos. La regla: cada '
     'pase adicional debe pagarse a sí mismo en legibilidad o en drama, no en decoración.'),
    ('h2', '5.7 Presupuesto de rendimiento'),
    ('body',
     'El objetivo operativo es sostener 60 fps en hardware medio (una GTX 1650 o un Apple '
     'M1) en calidad media. El presupuesto de referencia: menos de 300 draw calls visibles '
     '(las gradas y la vegetación ya usan instancing), menos de 256 MB de memoria de '
     'texturas, sombras solo del sol actualizadas por frame, y reflectores limitados. La '
     'Tabla 8 define los tres presets. La disciplina de presupuesto es la que permite al '
     'resto del capítulo ser ambicioso sin matar la jugabilidad en máquinas modestas, que '
     'siguen siendo la mayoría de la audiencia de un juego de navegador.'),
    ('table', {
        'caption': 'Tabla 8. Presets de calidad (propuesta).',
        'header': ['Característica', 'Bajo', 'Medio', 'Alto'],
        'ratios': [0.37, 0.21, 0.21, 0.21],
        'rows': [
            ['Sombras', 'Solo blob de contacto', 'Suaves 2048', 'Suaves 4096'],
            ['Iluminación de imagen', 'Intensidad 0,5', 'Completa', 'Completa'],
            ['Asfalto PBR', 'Sin normal map', 'Completo', 'Completo'],
            ['Charcos Reflector', 'No', 'No', 'Sí (máx. 8)'],
            ['Oclusión ambiental', 'No', 'No', 'Sí'],
            ['Pixel ratio', '0,75', '1,0', '1,5'],
        ],
    }),
    ('h2', '5.8 Detalles que venden el realismo'),
    ('body',
     'Los últimos gramos de percepción los dan los efectos de superficie: marcas de derrape '
     'persistentes sobre el asfalto que se desvanecen a los 20 segundos, distorsión de calor '
     'sobre el escape durante el turbo, spray de agua tras las ruedas en zonas mojadas, '
     'chispas de derrape con un flash breve de luz puntual (una por kart como máximo), y '
     'polvo al circular fuera de pista. Ninguno exige tecnología nueva: el sistema de '
     'partículas actual ya domina todas estas emisiones, y el de decals de derrape es el '
     'único componente genuinamente nuevo, resoluble con una cinta de quads sobre la '
     'trayectoria de las ruedas traseras.'),
]

# ============================================================ CAP 6 =========
B += [
    ('h1', '6. Hoja de Ruta Priorizada'),
    ('body',
     'La hoja de ruta ordena los 24 ajustes de los capítulos 3 y 5 en cuatro fases por '
     'relación impacto-esfuerzo. La Figura 3 muestra la matriz: las iniciativas de game feel '
     'concentran el mayor impacto con el menor esfuerzo, y por eso abren el plan; la '
     'conversión visual base llega segunda porque su impacto es alto pero exige más '
     'integración; el pulido premium cierra porque su valor depende de que la base ya '
     'exista. Cada fase tiene criterios de aceptación verificables con la infraestructura de '
     'QA que el proyecto ya posee.'),
    ('chart', ('fig3_roadmap.png',
               'Figura 3. Matriz impacto-esfuerzo de las ocho iniciativas principales.', 320)),
    ('table', {
        'caption': 'Tabla 9. Fases, iniciativas y criterios de aceptación.',
        'header': ['Fase', 'Duración', 'Iniciativas', 'Criterio de aceptación'],
        'ratios': [0.17, 0.13, 0.38, 0.32],
        'rows': [
            ['1. Core Feel', '1-2 semanas',
             'Hop de entrada, rampa de dirección, mini-turbo re-timed y legible, '
             'salida turbo con tensión, FOV continuo + líneas + roll',
             'Radar de la Figura 1 con 4 o más pilares en 8+; test del sorbo superado'],
            ['2. Visual Base', '2-3 semanas',
             'Materiales Physical + clearcoat, IBL con PMREM, sombras suaves + blob, '
             'asfalto PBR con surco de carrera',
             'Reflejo del cielo visible en el capó en las 12 pistas; 60 fps en medio'],
            ['3. Sistemas Competitivos', '1-2 semanas',
             'Slipstream visible y potenciado, atajos de IA activos, encadenado de '
             'impulsos, tope de marcha atrás, rubber-band 0,65',
             'Simulación 12/12 sin regresiones; paquete a menos de 8 s del líder'],
            ['4. Pulido Premium', '2-4 semanas',
             'Charcos Reflector, variantes mojadas, decals de derrape, spray y calor, '
             'SAO, hora dorada por pista',
             'QA visual con VLM 12/12; 0 errores de consola en navegador headless'],
        ],
    }),
    ('body',
     'La regla de gobierno del plan: cada fase se valida antes de pasar a la siguiente, '
     'usando el pipeline existente de simulación headless de 12 bots en 12 pistas, las '
     'capturas verificadas con el modelo de visión y el gancho de depuración determinista '
     'que ya permite avanzar la simulación frame a frame. Ningún cambio de game feel entra '
     'sin una comparación de repeticiones antes y después sobre tres pistas de referencia '
     'con la misma semilla de entrada. Esta disciplina cuesta horas y ahorra semanas: la '
     'historia del proyecto ya demostró que un tuning de física sin simulación de regresión '
     'rompe pistas enteras sin que nadie lo note hasta producción.'),
]

# ============================================================ CAP 7 =========
B += [
    ('h1', '7. Métricas de Éxito y Validación'),
    ('body',
     '¿Cómo saber que el juego ya se siente como Mario Kart sin pedirle opinión a un '
     'diseñador legendario? Con métricas verificables. La siguiente tabla define los '
     'indicadores de las dos brechas y su umbral de aprobación. Se combinan tres tipos de '
     'medida: telemetría objetiva del propio motor (que ya expone un gancho de '
     'depuración), pruebas de rendimiento reproducibles, y una pequeña encuesta de '
     'percepción con cinco jugadores tras cada fase, porque la sensación final es un dato '
     'humano que la telemetría no captura sola.'),
    ('table', {
        'caption': 'Tabla 10. Indicadores y umbrales de aprobación.',
        'header': ['Indicador', 'Método', 'Umbral'],
        'ratios': [0.38, 0.36, 0.26],
        'rows': [
            ['Test del sorbo: primer mini-turbo nivel 2 sin tutorial',
             'Observación de jugador nuevo', 'En menos de 30 s'],
            ['Derrapes con turbo por vuelta',
             'Telemetría del motor', '8 o más'],
            ['Percepción de velocidad',
             'Encuesta Likert de 5 jugadores', '4 de 5 o más'],
            ['Fotogramas por segundo en hardware medio',
             'Prueba en GTX 1650 / M1, calidad media', '60 sostenidos'],
            ['Lectura de trazada a velocidad punta',
             'QA visual en las 12 pistas', '0 confusiones'],
            ['Reflejo de cielo en capó y sombra de contacto',
             'Capturas verificadas en 12 pistas', '100% de karts'],
            ['Regresiones de simulación',
             'Simulación headless 12 bots × 12 pistas', '0 fallos, 0 errores de consola'],
        ],
    }),
    ('body',
     'El protocolo de validación opera en tres capas. La primera es la simulación '
     'determinista: cada cambio de física corre en las 12 pistas con 12 bots y debe terminar '
     'las vueltas sin atascos ni caídas, con el registro de sector que ya existe. La segunda '
     'es la verificación visual automatizada: capturas a velocidad punta, con derrape de '
     'nivel 3 activo y en zona mojada, analizadas por el modelo de visión para detectar '
     'glitches de render, solapes de interfaz y regresiones de bloom. La tercera es la '
     'prueba humana: repeticiones comparativas antes y después de cada fase sobre las mismas '
     'pistas y la misma semilla, seguidas de la encuesta de percepción de velocidad y '
     'control. Un cambio que mejora la telemetría pero empeora la encuesta se rechaza: la '
     'métrica final de un party racer es la sonrisa del jugador en la segunda vuelta, y esa '
     'sonrisa se mide mejor con una mezcla de números y personas que con cualquiera de las '
     'dos cosas por separado.'),
]
