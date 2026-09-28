// APEX GP v11 — VLM visual check of the four weather conditions.
const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');

async function main() {
  const zai = await ZAI.create();
  const imgs = process.argv.slice(2);
  const content = [{
    type: 'text', text: `Analyze these 4 screenshots from a 3D Formula 1 racing simulator (APEX GP), each a different weather condition:

IMG1 = CLEAR (sunny): Does the scene have a blue gradient sky with a visible sun disk, drifting clouds, realistic soft shadows under the cars, and a race track with red/white kerbs, grandstands and green grass beside the track?

IMG2 = CLOUDY (overcast): Is the sky grey/overcast with many clouds, softer flatter light, and the circuit still clearly visible?

IMG3 = RAIN (wet): Is the sky dark grey, the asphalt visibly WET/glossy with reflections, and can you see rain streaks or spray? Is visibility reduced by fog?

IMG4 = NIGHT: Is the scene dark with stars/moon in the sky, floodlight masts glowing around the circuit, and the track + cars clearly lit?

Answer EXACTLY in this format:
IMG1: [SKY_OK si/no] [CLOUDS si/no] [SHADOWS si/no] [TRACK_OK si/no] + 1 sentence
IMG2: [OVERCAST si/no] [SCENE_OK si/no] + 1 sentence
IMG3: [WET_ROAD si/no] [RAIN_FX si/no] [DARK_SKY si/no] + 1 sentence
IMG4: [NIGHT si/no] [FLOODLIGHTS si/no] [TRACK_LIT si/no] + 1 sentence
PROBLEMS: list any serious visual glitches (black screen, broken geometry, cars clipping through track, unreadable HUD, z-fighting stripes, missing track) or "none"
QUALITY: 1-10 overall visual quality rating + 1 sentence on the single biggest visual weakness`
  }];
  for (const p of imgs) {
    const b64 = fs.readFileSync(p).toString('base64');
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }] });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('VLM error:', e.message); process.exit(1); });
