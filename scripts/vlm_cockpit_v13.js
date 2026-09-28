// VLM check for the v13 cockpit T-cam view
const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const content = [{
    type: 'text', text: `This is a screenshot from an F1 racing game, taken from the COCKPIT / onboard camera position (a camera mounted above and behind the driver, like real F1 broadcast onboard footage). Describe it concretely:
1) Can you see the TRACK ahead (asphalt, kerbs, the racing line)? How much of the frame does it fill?
2) Is the camera INSIDE any car geometry (grey/black walls, blocked view, clipping) or is the view clean?
3) What car parts are visible in the foreground (nose, front wing, halo, driver helmet)?
4) Does it look like a proper F1 onboard/T-cam view? Score 1-10 for realism and usability for driving.
Be honest and concrete, 6-8 sentences.`
  }];
  for (const p of process.argv.slice(2)) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }] });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('VLM error:', e.message); process.exit(1); });
