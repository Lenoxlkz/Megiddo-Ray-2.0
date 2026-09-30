const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function run() {
  const scontentUrl = 'https://scontent-yyz1-1.xx.fbcdn.net/v/t39.99422-6/789060363_1064016103079968_4637122539015233485_n.png?stp=dst-jpg_tt6&cstp=mx1640x2048&ctp=p600x600&_nc_cat=1&ccb=1-7&_nc_sid=b96d88&_nc_ohc=M8fJuWcnMxYQ7kNvwE86jBA&_nc_oc=AdoS9k4Y_yFfJA3v2rAsM9bORrEQ4EB1M6cmhalr2UNFiNOsQZWL8rLNNsY1uRdFxMMZf6HL972Pa0Ic-o2NgDIr&_nc_zt=14&_nc_ht=scontent-yyz1-1.xx&_nc_gid=M4gIZOXA-br3CSBMc_42-g&_nc_ss=7320f&oh=00_AQJLE4_RpOQBlDm6OCLEkcRWXlheh0SfrfSvGdO85KrNRg&oe=6A9A7D8D';
  const lookasideUrl = 'https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=1065974623019542';

  // 1. Test direct fetch of scontent
  console.log('1. Direct fetch scontent with Chrome UA:');
  const res1 = await fetch(scontentUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  console.log('Status:', res1.status, 'Content-Type:', res1.headers.get('content-type'), 'Size:', (await res1.buffer()).length);

  // 2. Test direct fetch of lookaside
  console.log('\n2. Direct fetch lookaside with Chrome UA:');
  const res2 = await fetch(lookasideUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  console.log('Status:', res2.status, 'Content-Type:', res2.headers.get('content-type'), 'Size:', (await res2.buffer()).length);

  // 3. Test through our proxy-image
  console.log('\n3. Fetch scontent through local proxy-image:');
  const res3 = await fetch(`http://localhost:3000/api/proxy-image?url=${encodeURIComponent(scontentUrl)}`);
  console.log('Proxy status scontent:', res3.status, 'Content-Type:', res3.headers.get('content-type'), 'Size:', (await res3.buffer()).length);

  console.log('\n4. Fetch lookaside through local proxy-image:');
  const res4 = await fetch(`http://localhost:3000/api/proxy-image?url=${encodeURIComponent(lookasideUrl)}`);
  console.log('Proxy status lookaside:', res4.status, 'Content-Type:', res4.headers.get('content-type'), 'Size:', (await res4.buffer()).length);
}
run();
