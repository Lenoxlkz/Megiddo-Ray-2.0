const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function run() {
  const url = 'https://www.facebook.com/100088210414708/posts/1065979779685693';
  
  // 1. Fetch with FB_BOT
  const resFb = await fetch(url, {
    headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' }
  });
  const htmlFb = await resFb.text();
  console.log('FB_BOT HTML length:', htmlFb.length);
  
  // Search for any image links or scontent in htmlFb
  const matches1 = htmlFb.match(/https:[^"'\s<>\\]+fbcdn\.net[^"'\s<>\\]+/gi) || [];
  console.log('fbcdn.net matches in FB_BOT:', matches1.length);
  matches1.slice(0, 5).forEach(m => console.log(' ->', m));

  const lookasides = htmlFb.match(/https:[^"'\s<>\\]+fbsbx\.com[^"'\s<>\\]+/gi) || [];
  console.log('fbsbx.com matches in FB_BOT:', lookasides.length);
  lookasides.slice(0, 5).forEach(m => console.log(' ->', m));

  // 2. Fetch with Twitterbot
  const resTw = await fetch(url, {
    headers: { 'User-Agent': 'Twitterbot/1.0' }
  });
  const htmlTw = await resTw.text();
  console.log('\nTwitterbot HTML length:', htmlTw.length);
  const matchesTw = htmlTw.match(/https:[^"'\s<>\\]+fbcdn\.net[^"'\s<>\\]+/gi) || [];
  console.log('fbcdn.net matches in Twitterbot:', matchesTw.length);
  matchesTw.slice(0, 5).forEach(m => console.log(' ->', m));
}
run();
