// VLM check for v13 race visuals: sun realism + shadows everywhere (no bloom)
const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const content = [{
    type: 'text', text: `Screenshot from an F1 racing game (chase camera behind the car). Judge the LIGHTING specifically:
1) Does the sunlight look natural and realistic (warm directional light, not artificial glow)?
2) SHADOWS: do you see cast shadows on the ground — from trees, barriers, grandstands, the car itself? Are there many or few?
3) Any ugly artificial BLOOM / glow halos around the sun or bright areas? (bloom = milky glow that bleeds over edges)
4) Overall visual quality score 1-10 for a web racing game, and one concrete thing that would most improve realism.
Be honest and concrete, 6-8 sentences.`
  }];
  for (const p of process.argv.slice(2)) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }] });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('VLM error:', e.message); process.exit(1); });
