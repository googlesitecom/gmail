const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const content = [{
    type: 'text', text: `Describe this screenshot from a 3D F1 racing game in detail, top to bottom (sky, horizon, terrain, track, objects). Specifically: 1) What does the HORIZON line look like — flat, hilly, jagged mountains? 2) Are the distant landforms cones/pyramids or irregular ridges/hills? 3) How do the trees look? 4) Overall, would a casual player call these graphics "acceptable for a web game" or "bad"? Be concrete and honest, 8-10 sentences.`
  }];
  for (const p of process.argv.slice(2)) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }] });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('VLM error:', e.message); process.exit(1); });
