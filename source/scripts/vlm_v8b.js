const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const content = [{
    type: 'text', text: `Tres capturas de un juego de karts 3D. Evalúa EXACTAMENTE esto:

IMAGEN 1 (carrera en pradera): ¿La luz se ve cálida tipo "tarde/hora dorada" (tono amarillo-naranja, sombras largas direccionales) o fría/plana de mediodía? ¿La carretera tiene brillo especular? ¿Se ven sombras proyectadas por los karts/árboles?

IMAGEN 2 (mismo juego, cámara trasera cerca de un kart): ¿La CARROCERÍA del kart (capó/alerones) muestra reflejos especulares/brillo de pintura automotriz? ¿Se ve una sombra suave/oscura bajo el kart (sombra de contacto)? ¿Las ruedas se ven de goma mate?

IMAGEN 3 (menú principal): ¿Hay KARTS 3D visibles en el fondo (aunque estén parcialmente detrás de los botones)? ¿En qué zona de la pantalla (izquierda/centro/derecha)? ¿El piso del escenario refleja?

Formato:
IMG1: [CALIDA si/no] [ESPECULAR si/no] [SOMBRAS si/no] + 1 frase
IMG2: [PINTURA_BRILLANTE si/no] [SOMBRA_CONTACTO si/no] [GOMA_MATE si/no] + 1 frase
IMG3: [KARTS si/no] [ZONA: ...] [PISO_REFLEJA si/no] + 1 frase`
  }];
  for (const p of process.argv.slice(2)) {
    const b64 = fs.readFileSync(p).toString('base64');
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }], model: 'glm-4.5v' });
  console.log(res.choices[0]?.message?.content ?? 'no response');
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
