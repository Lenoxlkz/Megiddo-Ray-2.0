const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function run() {
  const targetUrl = 'https://www.facebook.com/share/p/1Kb8qKzR12/';
  const FB_BOT_HEADERS = {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const res = await fetch(targetUrl, {
    headers: FB_BOT_HEADERS,
    redirect: 'follow'
  });
  console.log('Status:', res.status, 'Final URL:', res.url);
  const html = await res.text();
  console.log('HTML length:', html.length);
  
  const ogImages = [...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi)];
  console.log('OG images found:', ogImages.map(m => m[1]));

  const scontent = html.match(/https:\\\/\\\/scontent[^"'\s<>\\]+/g) || html.match(/https:\/\/scontent[^"'\s<>]+/g) || [];
  console.log('scontent matches count:', scontent.length);
  if (scontent.length > 0) {
    console.log('Sample scontent:', scontent.slice(0, 3));
  }

  // Let's test fetching one of the found images
  if (ogImages.length > 0) {
    let imgUrl = ogImages[0][1].replace(/&amp;/g, '&');
    console.log('Testing fetch of OG image:', imgUrl);
    const imgRes = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': '*/*'
      }
    });
    console.log('Image fetch with FB bot UA status:', imgRes.status, 'Content-Type:', imgRes.headers.get('content-type'), 'Length:', (await imgRes.buffer()).length);

    const imgResBrowser = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      }
    });
    console.log('Image fetch with Chrome UA status:', imgResBrowser.status, 'Content-Type:', imgResBrowser.headers.get('content-type'));
  }
}
run().catch(console.error);
