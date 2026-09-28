// APEX KART v9 — VLM visual check: day theme must have NO milky bloom glow
// (realism from shadows/PBR instead), ember theme keeps subtle emissive glow.
const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');

async function main() {
  const zai = await ZAI.create();
  const imgs = process.argv.slice(2);
  const content = [{
    type: 'text', text: `Analiza estas 2 capturas de un juego de karts 3D con dirección visual REALISTA:

1) IMG1 (meadow, tema día): el juego ELIMINÓ el filtro bloom en temas diurnos para verse realista. Evalúa: ¿hay un "glow"/resplandor lechoso generalizado sobre la imagen? ¿Las sombras de los karts/objetos se ven nítidas y definidas (no lavadas)? ¿La iluminación se ve natural?

2) IMG2 (volcano, tema volcán): aquí SÍ hay un bloom MUY sutil (strength 0.30, umbral alto) pensado solo para la lava emisiva. Evalúa: ¿el resplandor se limita a la lava/elementos brillantes o inunda toda la imagen? ¿Se ve elegante o feo/arte hecho?

Responde EXACTAMENTE en este formato:
IMG1: [GLOW_LECHOSO si/no] [SOMBRAS_NITIDAS si/no] [NATURAL si/no] + 1 frase
IMG2: [GLOW_LIMITADO_A_LAVA si/no] [INUNDA_TODO si/no] [ELEGANTE si/no] + 1 frase
PROBLEMAS: lista de glitches visuales graves (pantalla negra, geometría rota, texto ilegible) o "ninguno"`
  }];
  for (const p of imgs) {
    const b64 = fs.readFileSync(p).toString('base64');
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
  }
  const res = await zai.chat.completions.createVision({
    messages: [{ role: 'user', content }],
    model: 'glm-4.5v',
  });
  console.log(res.choices[0]?.message?.content ?? 'no response');
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
