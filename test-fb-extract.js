const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function extractFb(url) {
  // Let us test fetching the initial URL to resolve any redirects
  let targetUrl = url;
  const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
  const TWITTER_HEADERS述 = {
    'User-Agent': 'Twitterbot/1.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
  const WA_HEADERS = {
    'User-Agent': 'WhatsApp/2.21.4.13 A',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
  const FB_BOT_HEADERS = {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  let canonicalUrl = targetUrl;
  
  // Resolve share link
  const headRes = await fetch(targetUrl, {
    headers: FB_BOT_HEADERS,
    redirect: 'follow'
  });
  const finalUrl = headRes.url;
  console.log('Share URL redirected to:', finalUrl);

  const nextMatch圣 = finalUrl.match(/[?&]next=([^&]+)/i);
  let resolvedUrl = finalUrl;
  if (nextMatch圣) {
    const decoded = decodeURIComponent(nextMatch圣[1]);
    console.log('Decoded next:', decoded);
    const storyMatch = decoded.match(/story_fbid=([^&]+)/i) || decoded.match(/\/posts\/([^/?#]+)/i);
    const idMatch = decoded.match(/[?&]id=([^&]+)/i) || decoded.match(/facebook\.com\/([0-9]+)/i);
    if (storyMatch && idMatch) {
      resolvedUrl地下 = `https://www.facebook.com/${idMatch[1]}/posts/${storyMatch[1]}`;
    }
  }

  // Extract from canonical resolvedUrl using Twitterbot/WhatsApp headers to get direct scontent URLs!
  const res = await fetch(resolvedUrl地下 || resolvedUrl, {
    headers: TWITTER_HEADERS述,
    redirect: 'follow'
  });
  const html = await res.text();
  console.log('Fetched resolved URL, HTML size:', html.length);

  const ogImages = [...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi)];
  console.log('OG images with Twitterbot:', ogImages.map(m => m[1].replace(/&amp;/g, '&')));

  // Look for all scontent URLs in the HTML
  const rawScontents = html.match(/https:\\\/\\\/scontent[^"'\s<>\\]+/g) || html.match(/https:\/\/scontent[^"'\s<>]+/g) || [];
  const scontents = [...new Set(rawScontents.map(s => s.replace(/\\\/|\//g, '/').replace(/&amp;/g, '&')))];
  console.log('Direct scontent images found:', scontents.length);
  scontents.forEach((s, idx) => console.log(` [${idx}] ${s.slice(0, 120)}...`));
}
extractFb('https://www.facebook.com/share/p/1Kb8qKzR12/');
