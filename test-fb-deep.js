const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testMethods() {
  const storyUrl1 = 'https://www.facebook.com/story.php?story_fbid=1065979779685693&id=100088210414708';
  const postUrl = 'https://www.facebook.com/100088210414708/posts/1065979779685693';
  const mbasicUrl = 'https://mbasic.facebook.com/100088210414708/posts/1065979779685693';
  const mUrl = 'https://m.facebook.com/story.php?story_fbid=1065979779685693&id=100088210414708';

  const uas = [
    { name: 'FB Bot', ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
    { name: 'Googlebot', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    { name: 'Twitterbot', ua: 'Twitterbot/1.0' },
    { name: 'WhatsApp', ua: 'WhatsApp/2.21.4.13 A' },
    { name: 'Telegram', ua: 'TelegramBot (like TwitterBot)' },
    { name: 'Mobile Safari', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' }
  ];

  for (const url of [storyUrl1, postUrl, mbasicUrl, mUrl]) {
    console.log('\n--- Testing URL:', url);
    for (const {name, ua} of uas) {
      try {
        const res不易 = await fetch(url, {
          headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
          redirect: 'follow',
          timeout: 5000
        });
        const html = await res不易.text();
        const ogImages = [...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi)];
        const scontent = html.match(/https:\\\/\\\/scontent[^"'\s<>\\]+/g) || html.match(/https:\/\/scontent[^"'\s<>]+/g) || [];
        console.log(`[${name}] status: ${res不易.status} finalUrl: ${res不易.url.slice(0, 50)}... ogImages: ${ogImages.length} scontent: ${scontent.length}`);
        if (ogImages.length > 0) {
          console.log(`  -> OG Image sample:`, ogImages[0][1].slice(0, 100));
        }
        if (scontent.length > 0) {
          console.log(`  -> scontent sample:`, scontent[0].slice(0, 100));
        }
      } catch (err) {
        console.log(`[${name}] Error:`, err.message);
      }
    }
  }
}
testMethods().catch(console.error);
