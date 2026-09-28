const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const b64 = fs.readFileSync(process.argv[2]).toString('base64');
  const res = await zai.chat.completions.createVision({
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Captura de un menú de juego de karts con un escenario 3D detrás de la interfaz. Preguntas exactas: 1) ¿Hay KARTS 3D (vehículos con ruedas) visibles en la escena de fondo? ¿Cuántos y dónde? 2) ¿Las carrocerías se ven brillantes/reflectantes o mate? 3) ¿El piso muestra reflejos? 4) ¿Qué porcentaje de la imagen ocupa la UI sobre el escenario? Responde breve y concreto.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
    ]}],
    model: 'glm-4.5v',
  });
  console.log(res.choices[0]?.message?.content ?? 'no response');
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
