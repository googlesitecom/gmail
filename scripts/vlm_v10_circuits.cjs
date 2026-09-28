const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const content = [{
    type: 'text', text: `Three screenshots from a Mario-Kart-style 3D racing game:

IMG1 = the start/finish straight of a new circuit: beside the straight there should be a PIT LANE with 3 garage bays, a low white/red pit wall, and ANIMATED pit crew members (small figures with caps) plus a kart parked in each bay and a lollipop sign. Describe what you see: is the pit lane visible? are the crew figures visible? does the scene look like a race paddock?

IMG2 = action shot of another new circuit (an F1-style track with green grass runoff and red/white kerbs): describe the track, scenery, and whether it looks like a proper race circuit.

IMG3 = the stadium section of the Mexico track (should be a COVERED tunnel-like bowl with ceiling lights = an F1 stadium at night): describe what you see.

Answer EXACTLY:
IMG1: [PIT_LANE si/no] [CREW_FIGURES si/no] [GARAGES si/no] + 1 sentence
IMG2: [CIRCUIT_LOOK si/no] [KERBS si/no] + 1 sentence
IMG3: [TUNNEL_BOWL si/no] [CEILING_LIGHTS si/no] + 1 sentence
WEAKEST: the single weakest visual element across the three + 1 sentence`
  }];
  for (const p of process.argv.slice(2)) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }] });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('VLM error:', e.message); process.exit(1); });
