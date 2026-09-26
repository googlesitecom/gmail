const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');

async function main() {
  const zai = await ZAI.create();
  const imgs = process.argv.slice(2);
  const content = [{
    type: 'text', text: `Analiza estas 4 capturas de un juego de karts 3D estilo party-racer con dirección visual REALISTA (PBR). Evalúa cada una concretamente:

1) glacier-wet (primera imagen): ¿el ASFALTO se ve MOJADO/reflectante? ¿Se ven REFLEJOS del cielo en la pista? ¿Las sombras se ven suaves y definidas?
2) meadow-golden (segunda): ¿la iluminación se lee como "hora dorada" (sombras largas, luz cálida)? ¿La carrocería del kart refleja el entorno?
3) meadow-drift (tercera): ¿se ven CHISPAS de derrape (azules/naranjas/moradas)? ¿El kart está inclinado derrapando? ¿Hay sombra de contacto bajo el kart?
4) menu-showroom (cuarta): ¿los karts del escaparate se ven con pintura brillante (clearcoat/reflejos)? ¿El piso del showroom refleja?

Responde en formato:
IMG1: [MOJADO si/no] [REFLEJOS si/no] [SOMBRAS suaves si/no] + 1 frase
IMG2: [HORA_DORADA si/no] [REFLEJO_Carroceria si/no] + 1 frase
IMG3: [CHISPAS si/no] [DERRAPE si/no] [SOMBRA_CONTACTO si/no] + 1 frase
IMG4: [CLEARCOAT si/no] [PISO_REFLEJA si/no] + 1 frase
Luego: PROBLEMAS: lista de glitchas visuales graves si existen (texto sobre elementos, geometría rota, negro total, etc.)`
  }];
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
