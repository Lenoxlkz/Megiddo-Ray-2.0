const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function run() {
  const postUrl = 'https://www.facebook.com/100088210414708/posts/1065979779685693';
  const res = await fetch(postUrl, {
    headers: {
      'User-Agent': 'Twitterbot/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  const html = await res.text();
  console.log('Twitterbot HTML length:', html.length);

  // Look for og:image
  const ogImages = [...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi)];
  console.log('OG images:', ogImages.map(m => m[1]));

  // Look for all scontent images
  const allScontent = html.match(/https:\\\/\\\/scontent[^"'\s<>\\]+/g) || html.match(/https:\/\/scontent[^"'\s<>]+/g) || [];
  console.log('All scontent:', allScontent.length);
  for (const s of allScontent) {
    const clean = s.replace(/\\\/|\//g, '/').replace(/&amp;/g, '&');
    console.log('Clean scontent:', clean);
  }

  // Also test with WhatsApp
  const resWa = await fetch(postUrl, {
    headers: {
      'User-Agent': 'WhatsApp/2.21.4.13 A',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  const htmlWa = await resWa.text();
  const ogImagesWa = [...htmlWa.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi)];
  console.log('\nWhatsApp OG images:', ogImagesWa.map(m => m[1]));

  // Test Mobile Safari UA on mbasic
  const resMb = await fetch('https://mbasic.facebook.com/100088210414708/posts/1065979779685693', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  const htmlMb = await resMb.text();
  console.log('\nmbasic HTML length:', htmlMb.length);
}
run();
