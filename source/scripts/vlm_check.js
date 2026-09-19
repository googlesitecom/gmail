const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');

async function main() {
  const zai = await ZAI.create();
  const imgs = process.argv.slice(2);
  const content = [{ type: 'text', text: 'Analiza estas capturas de un juego de karts 3D. Describe: 1) Calidad visual de los PERSONAJES (corredores en los karts): ¿se ven bien o mal y por qué? 2) Las CAJAS DE OBJETOS (cubos flotantes): ¿cómo se ven y cómo están colocadas? 3) El HUD (interfaz de carrera): ¿qué elementos se ven y qué tan genéricos son? 4) El MENÚ en la primera imagen si existe. Sé específico y crítico.' }];
  for (const p of imgs) {
    const b64 = fs.readFileSync(p).toString('base64');
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
  }
  const res = await zai.chat.completions.create({
    messages: [{ role: 'user', content }],
    model: 'glm-4.5v',
  });
  console.log(res.choices[0]?.message?.content ?? 'no response');
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
