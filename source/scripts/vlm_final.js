const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const content = [{ type: 'text', text: `Cuatro capturas de un juego de karts. Responde EXACTAMENTE:

IMG1 (menú principal): ¿Se ven karts 3D de fondo (aunque sea parcialmente detrás de los botones)? ¿En qué zona?
IMG2 (carrera pradera): ¿La escena se ve CÁLIDA (ámbar/atardecer) o FRÍA (mediodía azul)? ¿Hay sombras largas visibles? ¿La carrocería del kart brilla?
IMG3 (derrape en pradera): ¿Se ven chispas de derrape de colores? ¿El kart está inclinado derrapando? ¿Hay sombra de contacto bajo el kart?
IMG4 (glaciar): ¿El asfalto se ve mojado/reflectante (reflejos del cielo)? ¿Sombras suaves?

IMG1: [KARTS si/no + zona] | IMG2: [CALIDA/FRÍA] [SOMBRAS si/no] [BRILLO_KART si/no] | IMG3: [CHISPAS si/no] [DERRAPE si/no] [SOMBRA si/no] | IMG4: [MOJADO si/no] [REFLEJOS si/no] [SOMBRAS si/no] + 1 frase final de conjunto` }];
  for (const p of process.argv.slice(2)) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }], model: 'glm-4.5v' });
  console.log(res.choices[0]?.message?.content ?? 'no response');
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
