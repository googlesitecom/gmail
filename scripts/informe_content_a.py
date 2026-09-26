# -*- coding: utf-8 -*-
"""Contenido del informe APEX KART — Parte A (capítulos 1 a 3).
Formato de bloques: ('h1'|'h2'|'h3'|'body'|'bullet'|'callouts'|'table'|'chart'|'quote', ...)
"""

A = []

# ============================================================ CAP 1 =========
A += [
    ('h1', '1. Resumen Ejecutivo'),
    ('body',
     'APEX KART es hoy un juego funcionalmente maduro: 12 pistas temáticas únicas de entre '
     '1.450 y 1.750 metros, 12 personajes con estadísticas diferenciadas por clase de peso, '
     '13 objetos con economía por posición, 4 modos de juego, multijugador online P2P con bots '
     'que rellenan las vacantes, y una capa de audio sintetizada que ya imita los cimientos '
     'sonoros de un kart de fiesta: motor continuo con pitch por velocidad, chirrido de '
     'derrape, mini-turbo por niveles, y música que se acelera un 6% en la última vuelta. La '
     'ingeniería también es sólida: física de paso fijo a 60 Hz con modelo de ángulo de '
     'deslizamiento, validación de vuelta por 12 sectores anti-atajo, y una suite de QA '
     'headless que simula 12 bots en las 12 pistas antes de cada despliegue. El veredicto de '
     'esta consultoría es claro: el problema no es de contenido ni de estabilidad, es de '
     'diseño sensorial.'),
    ('body',
     'La percepción de que el juego no se siente como Mario Kart se explica por dos brechas '
     'medibles. La primera es de game feel: seis decisiones concretas de ajuste se desvían del '
     'estándar de la franquicia. El derrape entra sin salto previo, la dirección es binaria y '
     'sin modelado de entrada, el mini-turbo tarda demasiado en cargarse y su nivel no se lee '
     'en la carrocería, la salida turbo tiene una ventana de éxito de 1,77 segundos que '
     'elimina toda tensión, el feedback de velocidad no completa la cadena (faltan líneas de '
     'velocidad, balanceo de cámara y encadenado de impulsos), y el ritmo de carrera '
     'infrautiliza el slipstream y los atajos de la IA. La segunda brecha es visual: el stack '
     'de materiales es deliberadamente antirrealista. El chasis usa Lambert, los personajes '
     'usan Toon con gradiente de cel-shading, y no existe ni un solo material PBR, mapa de '
     'entorno o textura de rugosidad en el pipeline procedural. Es exactamente lo contrario de '
     'la dirección realista que el proyecto solicita ahora.'),
    ('body',
     'La buena noticia es que ninguna de las dos brechas exige reescribir el motor. El tone '
     'mapping ACES, la exposición por tema, la niebla, el bloom calibrado por familia de '
     'pista y la iluminación solar temática ya existen y funcionan: la conversión realista es '
     'una refactorización de materiales e iluminación, no un cambio de arquitectura. La '
     'prioridad recomendada es ejecutar primero la Fase 1 (núcleo de game feel) y la Fase 2 '
     '(base visual PBR): ambas concentran alrededor del 80% del valor percibido con menos de '
     'la mitad del esfuerzo total de la hoja de ruta. Las Fases 3 y 4, sistemas competitivos '
     'y pulido premium, consolidan el resultado después. Este documento detalla cada '
     'hallazgo con los valores actuales extraídos del código fuente, el parámetro objetivo '
     'propuesto y los criterios de aceptación para validar cada cambio.'),
    ('callouts', [
        ('6', 'hallazgos de game feel, cada uno con valor actual y objetivo'),
        ('0', 'materiales PBR en el pipeline procedural actual'),
        ('24', 'ajustes concretos con parámetro objetivo definido'),
        ('60 fps', 'objetivo de rendimiento en hardware medio tras el cambio visual'),
    ]),
]

# ============================================================ CAP 2 =========
A += [
    ('h1', '2. Marco de Referencia: el ADN del Game Feel de Mario Kart'),
    ('body',
     'Cuando un jugador dice que un juego se siente como Mario Kart, está describiendo un '
     'conjunto reproducible de sensaciones que la franquicia ha refinado desde 1992. Esas '
     'sensaciones no son magia: son sistemas medibles. Este capítulo define los seis pilares '
     'que esta consultoría usa como vara de medir, de modo que cada hallazgo del capítulo 3 '
     'tenga una referencia objetiva y no una impresión subjetiva. La regla transversal que '
     'gobierna todo: la cadena acción, respuesta visual, respuesta sonora y recompensa debe '
     'cerrar en menos de 300 milisegundos. Cualquier eslabón lento, invisible o inaudible se '
     'experimenta exactamente como el síntoma reportado: algo no se siente como Mario Kart.'),
    ('h2', '2.1 Pilar 1 — El bucle salto-derrape-mini-turbo'),
    ('body',
     'Es el corazón de la franquicia desde la entrega de Nintendo 64. El botón de derrape '
     'ejecuta primero un pequeño salto (hop); el kart aterriza girado hacia el lado elegido y '
     'entra en deslizamiento; las chispas cargan el mini-turbo en niveles visibles, con el '
     'azul apareciendo alrededor de 0,6 segundos, el naranja alrededor de 1,3 y el púrpura '
     'alrededor de 2,3; y al soltar el botón, el kart recibe un impulso proporcional al nivel '
     'conseguido. El hop hace tres trabajos a la vez: es el gesto de compromiso, porque '
     'decides derrapar antes de girar el volante; es el latigazo visual que abre el '
     'deslizamiento; y es una herramienta expresiva en el aire, que permite saltar objetos y '
     'ajustar la trazada. Sin hop, el derrape se percibe como un interruptor que se enciende, '
     'no como una maniobra que se ejecuta.'),
    ('h2', '2.2 Pilar 2 — Dirección con intención'),
    ('body',
     'En Mario Kart el kart responde a la intención casi en el instante, pero la entrada '
     'siempre está moldeada. En mando analógico la respuesta es una curva suave, no una línea '
     'recta; incluso con botón digital, la dirección alcanza el tope en un intervalo de 120 a '
     '180 milisegundos en lugar de en un solo frame. El agarre además es dual: fuera del '
     'derrape el kart sigue la orden, y dentro del derrape el morro apunta más hacia el '
     'interior de la curva que el vector de velocidad. Esa diferencia entre dónde mira el '
     'kart y hacia dónde viaja es literalmente lo que el ojo del jugador lee como está '
     'deslizando. Una dirección sin modelado de entrada produce dos síntomas opuestos y '
     'igualmente indeseables: nerviosismo a baja velocidad y esterilidad a alta velocidad.'),
    ('h2', '2.3 Pilar 3 — Sensación de velocidad por encima de la velocidad real'),
    ('body',
     'Un kart de Mario Kart 8 ronda velocidades efectivas modestas, pero se percibe el doble '
     'de rápido. La receta es acumulativa: campo de visión que se abre con la velocidad y se '
     'dispara con el turbo, cámara que se aleja ligeramente al boostar, líneas de velocidad '
     'en los bordes de la pantalla, pitch del motor que sube, micro-sacudidas en los '
     'aterrizajes, y un encadenado de impulsos que permite surfear de turbo en turbo. La '
     'regla profesional de la industria: cada estado del vehículo (acelerando, boostando, '
     'deslizando, volando) debe verse, oírse y sentirse distinto del anterior en menos de '
     '100 milisegundos. Si dos estados se ven iguales, uno de los dos está desperdiciado.'),
    ('h2', '2.4 Pilar 4 — Tensión en los umbrales'),
    ('body',
     'Los momentos de riesgo y recompensa son los que producen las anécdotas. La salida es un '
     'mini-juego de reflejos: revolucionar durante el 2 y soltar en el instante exacto '
     'produce el turbo perfecto, mientras que acelerar antes de tiempo hace patinar las '
     'ruedas. La decisión de soltar un derrape en nivel 1 o arriesgarse a mantenerlo hasta el '
     'nivel 3 es una apuesta constante contra la geometría de la pista. El encadenado de '
     'champiñones convierte una recta en una secuencia de timing. La condición sin negociación '
     'es que la ventana de éxito sea estrecha y visible: si la ventana mide casi dos segundos '
     'como en el build actual, no hay tensión, solo rutina.'),
    ('h2', '2.5 Pilar 5 — Economía de objetos por posición'),
    ('body',
     'El líder recibe ítems defensivos (cáscaras, escudos); quien va último recibe '
     'herramientas de remontada (champiñones triples, estrellas, rayos). Los impactos tienen '
     'una reacción estandarizada que todos los jugadores aprenden: girar sobre sí mismo poco '
     'más de un segundo, perder monedas, invulnerabilidad breve para evitar el castigo '
     'doble. La ruleta de casi un segundo con ticks sonoros es un momento de anticipación '
     'que regula el ritmo emocional de la carrera. Este pilar es, como se verá en la '
     'auditoría, el punto más fuerte del juego actual: las tablas de probabilidad por '
     'posición ya existen y están bien calibradas.'),
    ('h2', '2.6 Pilar 6 — Rubber-banding invisible y ritmo de paquete'),
    ('body',
     'El ajuste sutil de ritmo mantiene al paquete junto y a la carrera legible durante las '
     'tres vueltas. En los buenos party racers el rubber-banding es casi imperceptible: '
     'quien va atrás siente que puede volver y quien va adelante siente que debe apurar, pero '
     'nadie ve la mano del diseñador. Los ingredientes complementarios son el slipstream '
     '(rebufo) como mecánica de persecución visible, y los atajos que la IA también sabe '
     'usar, que rompen la procesión. La regla de los 30 segundos resume el ritmo: cada '
     'tramo de treinta segundos de carrera contiene al menos un evento: secuencia de curvas, '
     'fila de cajas, salto con truco, atajo o pad de turbo. Si un tramo no tiene ninguno, '
     'es terreno muerto.'),
]

# ============================================================ CAP 3 =========
A += [
    ('h1', '3. Diagnóstico de Game Feel: Seis Hallazgos y Ajustes Concretos'),
    ('body',
     'La auditoría extrajo los valores reales del código fuente (los módulos de '
     'configuración central, el controlador del kart, las estadísticas por personaje, la '
     'cámara, el piloto automático y las tablas de objetos) y los contrastó con el '
     'comportamiento de referencia de Mario Kart 8, obtenido de análisis de frames públicos '
     'de la comunidad. Cada hallazgo sigue la misma estructura: estado actual con cifras, '
     'por qué rompe la sensación de kart de fiesta, y ajuste concreto con tabla de parámetros '
     'objetivo. La puntuación global por pilar se resume en la Figura 1: la economía de '
     'objetios ya alcanza el estándar, mientras que la tensión en umbrales es hoy el punto '
     'más débil de la experiencia.'),
    ('chart', ('fig1_radar.png',
               'Figura 1. Auditoría de game feel por pilar: estado actual frente al objetivo '
               'tras las Fases 1 a 3 (escala 0-10).', 330)),
    ('h2', '3.1 Hallazgo 1 — El derrape entra sin salto'),
    ('body',
     'Estado actual. Pulsar ESPACIO sobre el asfalto activa el deslizamiento de inmediato; el '
     'propio código fuente documenta que el salto de entrada se eliminó a propósito porque '
     'se sentía como conejo saltando, y el único gesto que queda es una compresión visual de '
     'suspensión de 0,16 segundos. La entrada exige una velocidad mínima de 8,5 m/s y la '
     'carga del mini-turbo corre en paralelo al deslizamiento. El sistema es funcional y '
     'estable, con lógica anti-traba probada (re-enganche a 0,45 s, pago del turbo al salir '
     'volando de una rampa), pero carece del gesto de apertura.'),
    ('body',
     'Por qué rompe la sensación. Sin hop no hay gesto de compromiso: el jugador siente que '
     'activa un modo, no que ejecuta una maniobra. Se pierde el latigazo visual hacia el '
     'deslizamiento que enseña al ojo que el kart cambió de estado, y el aire pierde una '
     'herramienta expresiva completa. Es la diferencia gramatical entre un kart que se '
     'desliza y un kart al que le pasa algo.'),
    ('body',
     'Ajuste recomendado. Reintroducir el hop como puerta de entrada al derrape, no como '
     'salto independiente: un brinco corto con dirección preseleccionada en el aire, donde el '
     'deslizamiento solo se arma si al aterrizar se mantiene dirección y botón. Un hop neutro '
     'sin dirección no hace nada, lo que elimina de raíz el spam de saltos que motivó su '
     'eliminación. La lógica anti-traba existente se conserva intacta.'),
    ('table', {
        'caption': 'Tabla 1. Parámetros del hop como entrada de derrape (propuesta).',
        'header': ['Parámetro', 'Actual', 'Objetivo', 'Notas'],
        'ratios': [0.28, 0.16, 0.16, 0.40],
        'rows': [
            ['Velocidad vertical del hop', 'No existe', '2,6 m/s', 'Altura de ~13 cm; no saltea obstáculos'],
            ['Duración en el aire', 'No existe', '0,18 s', 'Bastante más corto que un salto de rampa'],
            ['Ventana de armado al aterrizar', 'No existe', '0,12 s', 'Dirección + botón mantenidos'],
            ['Velocidad mínima de derrape', '8,5 m/s', '8,5 m/s', 'Se conserva'],
            ['Re-enganche anti-traba', '0,45 s', '0,45 s', 'Se conserva'],
        ],
    }),
    ('h2', '3.2 Hallazgo 2 — Dirección binaria sin modelado de entrada'),
    ('body',
     'Estado actual. Con teclado, la dirección vale -1, 0 o +1 desde el primer frame: el tope '
     'de giro de 2,35 radianes por segundo se aplica instantáneamente. Con mando solo existe '
     'una zona muerta de 0,12. La autoridad de giro cae con la velocidad (hasta un 42% de la '
     'máxima en velocidad punta), pero la respuesta sigue siendo instantánea y lineal en '
     'cualquier régimen. No hay rampa de ataque ni curva de sensibilidad.'),
    ('body',
     'Por qué rompe la sensación. A baja velocidad el kart es nervioso, porque un frame de '
     'tecla ya es giro total; a alta velocidad es estable pero estéril, porque la corrección '
     'entra como un latigazo en lugar de como una caricia. En Mario Kart la dirección se '
     'siente orgánica precisamente porque la entrada está moldeada: la corrección fina es '
     'fácil y el giro completo exige insistir unos milisegundos. Es la diferencia entre un '
     'volante y un interruptor.'),
    ('body',
     'Ajuste recomendado. Introducir una capa de modelado de entrada entre el input y la '
     'física: el objetivo de dirección persigue al valor bruto con una tasa de subida de 8 '
     'por segundo y una tasa de retorno de 12 por segundo, de modo que la corrección suelta '
     'sea más rápida que el ataque. En mando analógico se añade una curva exponencial suave '
     'que da precisión en el centro y contundencia en los extremos.'),
    ('table', {
        'caption': 'Tabla 2. Modelado de entrada de dirección (propuesta).',
        'header': ['Parámetro', 'Actual', 'Objetivo'],
        'ratios': [0.40, 0.28, 0.32],
        'rows': [
            ['Respuesta de teclado', 'Tope en 1 frame', 'Rampa: subida 8/s, retorno 12/s'],
            ['Curva en mando', 'Lineal (zona muerta 0,12)', 'Exponente 1,6, zona muerta 0,12'],
            ['Autoridad por velocidad', '42% a 100% (se conserva)', 'Sin cambios'],
            ['Autoridad en el aire', '0,55 (se conserva)', 'Sin cambios'],
        ],
    }),
    ('h2', '3.3 Hallazgo 3 — Mini-turbo lento y poco legible'),
    ('body',
     'Estado actual. Los umbrales de carga del mini-turbo están en 0,85, 2,10 y 3,40 '
     'segundos acumulados. Además, la velocidad de carga depende de esterzar hacia el '
     'interior del deslizamiento (un factor de 0,8 a 1,5), una mecánica de habilidad '
     'genuinamente buena pero completamente invisible: no aparece en ninguna interfaz ni '
     'efecto, así que solo la conoce quien lea el código fuente. El nivel alcanzado se '
     'comunica únicamente con partículas en las ruedas traseras y una escala de audio; la '
     'carrocería no cambia en absoluto.'),
    ('body',
     'Por qué rompe la sensación. El nivel 3 exige 3,4 segundos de deslizamiento sostenido, '
     'más de lo que duran casi todas las curvas de las 12 pistas, de modo que la mayoría de '
     'los derrapes pagan nivel 1 y la recompensa se siente tibia. En la referencia de la '
     'franquicia, el azul llega alrededor de 0,6 segundos y el púrpura alrededor de 2,3: el '
     'ciclo completa varias veces por curva y el jugador siempre está decidiendo entre soltar '
     'o insistir. Sin legibilidad en la carrocería, además, el espectáculo de las chispas '
     'queda en los talones en lugar de envolver al kart.'),
    ('body',
     'Ajuste recomendado. Re-timing de los umbrales a 0,65, 1,50 y 2,60 segundos para igualar '
     'el ritmo de decisión de la referencia; hacer visible el bono de esterzado (la '
     'intensidad de las chispas escala con la tasa de carga en tiempo real); y llevar el '
     'color del nivel al propio kart con neumáticos emisivos y un resplandor inferior azul, '
     'naranja o púrpura, además de pips de progreso en el HUD que ya existen. La Figura 2 '
     'compara los tiempos actuales con la referencia.'),
    ('chart', ('fig2_miniturbo.png',
               'Figura 2. Mini-turbo: tiempo de carga y duración del impulso por nivel, '
               'valores actuales frente a la referencia de Mario Kart 8 (aproximada).', 300)),
    ('h2', '3.4 Hallazgo 4 — La salida turbo no tiene tensión'),
    ('body',
     'Estado actual. Mantener el acelerador entre 350 y 2.120 milisegundos en el momento del '
     '¡YA! paga un turbo de 1,35 segundos con potencia 1,50. El castigo por quemar salida '
     'solo llega si se mantiene pulsado más de 2,5 segundos. La ventana efectiva de éxito es '
     'de 1,77 segundos, casi nueve veces más ancha que la ventana de 0 a 260 milisegundos '
     'que usa la propia IA para sus salidas. En la práctica, cualquier jugador que mantenga '
     'acelerador desde el 2 recibe el turbo perfecto sin ningún riesgo.'),
    ('body',
     'Por qué rompe la sensación. La salida de Mario Kart es un mini-juego de reflejos que '
     'ordena el paquete en los primeros tres segundos y regala una micro-victoria a quien la '
     'clava. Sin riesgo no hay momento: la salida se convierte en un trámite y el primer '
     'sprint pierde su drama. El diseño actual de la IA demuestra que el equipo ya sabe '
     'modelar esta ventana; solo hace falta alinear al jugador con esa misma escala.'),
    ('body',
     'Ajuste recomendado. Ventana perfecta de 250 milisegundos centrada en la transición del '
     '2 al 1 (revolucionar durante el 2 y soltar con precisión, al estilo de la octava '
     'entrega), que paga el turbo completo; ventana parcial de 650 milisegundos a potencia '
     '1,35; y quemar la salida antes de tiempo produce un patinazo de 1,2 segundos con humo '
     'en las ruedas. El anuncio sonoro del 2 debe marcar claramente el inicio del minijuego '
     'para que la ventana se aprenda en dos o tres carreras.'),
    ('table', {
        'caption': 'Tabla 3. Salida turbo: ventanas y recompensas (propuesta).',
        'header': ['Resultado', 'Condición (actual)', 'Condición (objetivo)', 'Recompensa'],
        'ratios': [0.22, 0.28, 0.28, 0.22],
        'rows': [
            ['Turbo perfecto', '350-2.120 ms', '±125 ms del punto exacto', '1,35 s × 1,50'],
            ['Turbo parcial', '(incluido arriba)', '±325 ms', '1,0 s × 1,35'],
            ['Patinazo', '>2.500 ms', 'Acelerar antes del 2', '1,2 s sin control'],
        ],
    }),
    ('h2', '3.5 Hallazgo 5 — Feedback de velocidad incompleto'),
    ('body',
     'Estado actual. El campo de visión salta de 64 a 80 grados de forma binaria cuando hay '
     'turbo o estrella activos, y suma hasta 6 grados adicionales con la velocidad. La cámara '
     'se desplaza 1,4 metros hacia el exterior del derrape, un recurso excelente que ya '
     'existe. Las sacudidas solo ocurren en eventos discretos (golpes, aterrizajes, muros), '
     'sin micro-vibración continua. El sistema de impulsos conserva el máximo: dos turbinas '
     'encadenadas no suman ni refrescan, la segunda reemplaza a la primera. No existen líneas '
     'de velocidad ni balanceo de cámara.'),
    ('body',
     'Por qué rompe la sensación. La diferencia entre circular a 23 y a 33 metros por segundo '
     'apenas se distingue si el campo de visión no cambia y la pantalla no tiene textura de '
     'velocidad. El turbo es el clímax del juego y hoy no empuja: entra como un cambio de '
     'estado silencioso que dura poco. En la referencia, el boost es un evento multisensorial '
     'que combina apertura de lente, estelas, pitch del motor y una leve pérdida de control '
     'ficticia que obliga a sujetar el volante.'),
    ('body',
     'Ajuste recomendado. Campo de visión continuo: 64 grados base, más 8 grados proporcionales '
     'a la velocidad sobre el máximo, más 8 grados durante el turbo, con interpolación a 6 '
     'por segundo. Shader de líneas radiales en los bordes de la pantalla cuya opacidad crece '
     'por encima del 75% de la velocidad máxima. Balanceo de cámara de 2,5 grados hacia el '
     'interior del derrape. Y encadenado limitado de impulsos: un segundo turbo durante uno '
     'activo refresca duración y potencia, con tope de dos encadenados, lo que devuelve el '
     'juego de timing de la pila turbo triple.'),
    ('table', {
        'caption': 'Tabla 4. Cadena de feedback por estado del vehículo (propuesta).',
        'header': ['Estado', 'Visual', 'Audio', 'Cámara'],
        'ratios': [0.16, 0.32, 0.26, 0.26],
        'rows': [
            ['Turbo', 'FOV +8°, líneas radiales, llamas', 'Whoosh + pitch ×1,24 (ya existe)', 'Alejamiento 0,4 m'],
            ['Derrape', 'Chispas por nivel, neumáticos emisivos', 'Chirrido continuo (ya existe)', 'Roll 2,5° + offset 1,4 m'],
            ['Aterrizaje', 'Compresión de suspensión', 'Golpe seco (ya existe)', 'Kick 0,15'],
            ['Velocidad punta', 'Líneas tenues, FOV +8°', 'Pitch máximo', 'Micro-vibración 0,02'],
        ],
    }),
    ('h2', '3.6 Hallazgo 6 — Ritmo, slipstream y rubber-banding'),
    ('body',
     'Estado actual. El slipstream exige 1,0 segundo de carga detrás de un rival para recibir '
     '0,9 segundos de ventaja del 22%, sin ninguna seña visual de que se está cargando: el '
     'jugador descubre la mecánica por accidente. Los atajos están configurados con '
     'probabilidad cero para toda la IA (agresivo 0,25 y temerario 0,75 existen en la '
     'configuración pero el piloto automático los ignora), así que son un privilegio exclusivo '
     'del jugador humano. El rubber-banding es deliberadamente sutil: un 4,5% de ajuste en '
     'los valores por defecto. Y la marcha atrás alcanza 9 m/s, es decir 32 km/h marcha atrás, '
     'casi el ritmo de carrera de un kart real.'),
    ('body',
     'Por qué rompe la sensación. El slipstream invisible es una mecánica muerta: nadie '
     'persigue a nadie porque nadie sabe que la persecución paga. Sin atajos de IA, las '
     'carreras se convierten en procesiones donde el paquete se estira y las posiciones se '
     'congelan. Y una marcha atrás tan rápida convierte cada error en un torneo de dar '
     'marcha atrás a toda velocidad, un comportamiento ajeno al género que resta peso a la '
     'conducción.'),
    ('body',
     'Ajuste recomendado. Potenciar el slipstream a 0,8 segundos de carga por 1,2 segundos de '
     'ventaja del 25%, con estelas de viento sobre el kart y una barra de carga visible junto '
     'al velocímetro. Activar los atajos de la IA con las probabilidades ya configuradas, '
     'condicionadas a ir por detrás del jugador para que funcionen como mecanismo de '
     'remontada y no de fuga. Limitar la marcha atrás a 4,5 m/s. Y elevar el valor por '
     'defecto del deslizador de rubber-banding a 0,65 en 100cc, manteniendo el modo '
     'contrarreloj limpio como ya está. La nota positiva del capítulo: la economía de objetos '
     'por posición, la ruleta de 1,4 segundos, el giro de 1,15 segundos tras el impacto, la '
     'pérdida de tres monedas y la invulnerabilidad de 1,55 segundos ya están alineadas con '
     'el estándar de la franquicia; es el sistema más maduro del juego y no requiere cambios.'),
]
