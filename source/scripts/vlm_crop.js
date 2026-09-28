const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const [file, question] = process.argv.slice(2);
  const b64 = fs.readFileSync(file).toString('base64');
  const res = await zai.chat.completions.createVision({
    messages: [{ role: 'user', content: [
      { type: 'text', text: question || 'Describe exactamente qué objetos 3D se ven en este recorte de un videojuego (vehículos, cajas, piso, luces). ¿Hay algún KART o vehículo con ruedas? ¿De qué color?' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
    ]}],
    model: 'glm-4.5v',
  });
  console.log(res.choices[0]?.message?.content ?? 'no response');
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
