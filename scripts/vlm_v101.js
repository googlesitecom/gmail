// APEX GP v10.1 — VLM visual check: start integrity + clean launch + race action.
const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');

async function main() {
  const zai = await ZAI.create();
  const imgs = process.argv.slice(2);
  const content = [{
    type: 'text', text: `Analiza estas capturas de un simulador de Fórmula 1 3D (APEX GP):

1) IMG1 (parrilla con 20 coches antes de la salida): ¿los coches están correctamente colocados en filas escalonadas de una parrilla de F1, SIN solaparse ni atravesarse unos a otros? ¿Se ven las marcas de parrilla pintadas en el asfalto?

2) IMG2 (lanzamiento a ~2 s de las luces fuera): ¿la parrilla avanza ordenada, con separación entre coches, sin coches montados unos encima de otros ni atravesados?

3) IMG3 (carrera con el pelotón en acción): ¿los coches corren por la pista sin interpenetrarse? ¿El HUD (torre de posiciones, telemetría, minimapa) se ve correcto?

Responde EXACTAMENTE en este formato:
IMG1: [PARRILLA_CORRECTA si/no] [SOLAPAMIENTO si/no] + 1 frase
IMG2: [LANZAMIENTO_ORDENADO si/no] [COCHES_ATRAVESADOS si/no] + 1 frase
IMG3: [CARRERA_LIMPIA si/no] [HUD_CORRECTO si/no] + 1 frase
PROBLEMAS: lista de glitches visuales graves (pantalla negra, geometría rota, coches atravesados, texto ilegible) o "ninguno"`
  }];
  for (const p of imgs) {
    const b64 = fs.readFileSync(p).toString('base64');
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }] });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('VLM error:', e.message); process.exit(1); });
