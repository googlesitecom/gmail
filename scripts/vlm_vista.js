const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const content = [{
    type: 'text', text: `Two screenshots from a 3D Formula 1 simulator:

IMG1 = vista view over a race circuit on a clear day: Describe the MOUNTAINS on the horizon — do they look like realistic rocky ridges with irregular silhouettes, or like simple geometric pyramids/cones? Are there visible clouds in the sky? How is the overall scene composition (track, kerbs, grass, grandstands, trees)?

IMG2 = low chase view on a rainy day: Does the wet asphalt look GLOSSY/reflective (mirroring the sky/cars), or matte? Can you see rain streaks and spray?

Answer EXACTLY:
IMG1: [MOUNTAINS_REALISTIC si/no] [PYRAMID_LOOK si/no] [CLOUDS si/no] + 1 sentence
IMG2: [GLOSSY_ROAD si/no] [RAIN_FX si/no] + 1 sentence
WEAKEST: the single weakest visual element + 1 sentence`
  }];
  for (const p of process.argv.slice(2)) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }] });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('VLM error:', e.message); process.exit(1); });
