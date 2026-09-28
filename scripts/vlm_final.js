const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
async function main() {
  const zai = await ZAI.create();
  const content = [{
    type: 'text', text: `Rate these 7 screenshots from a browser F1 racing game (APEX GP):

IMG1 clear day race · IMG2 cloudy · IMG3 rain · IMG4 night · IMG5 alpine circuit · IMG6 COCKPIT camera (inside the car) · IMG7 main menu

For each: is it visually coherent and glitch-free? Then overall:
Answer EXACTLY:
IMG1..IMG5: one line each — [OK/glitch] + quality 1-10 + 5-word vibe
IMG6: [COCKPIT_VIEW si/no] [HALO/VISOR visible si/no] [OK/glitch] + 1 sentence
IMG7: [MENU_ENGLISH si/no] [CLEAN_UI si/no] + 1 sentence
OVERALL: X/10 + the 2 strongest improvements this build shows + the 1 remaining weakness`
  }];
  for (const p of process.argv.slice(2)) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` } });
  }
  const res = await zai.chat.completions.createVision({ messages: [{ role: 'user', content }] });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('VLM error:', e.message); process.exit(1); });
