async function inspect() {
  const url = "https://www.facebook.com/share/v/1J9AyVgZAz/";
  
  // Follow redirect first to get real reel / video URL
  const rRes = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    redirect: "follow"
  });
  console.log("Redirected URL:", rRes.url);
  const html = await rRes.text();
  console.log("HTML len:", html.length);

  // Search for browser_native_hd_url, playable_url, playback_url, etc.
  const regexes = [
    /"browser_native_hd_url"\s*:\s*"([^"]+)"/i,
    /"browser_native_sd_url"\s*:\s*"([^"]+)"/i,
    /"playable_url_quality_hd"\s*:\s*"([^"]+)"/i,
    /"playable_url"\s*:\s*"([^"]+)"/i,
    /"playback_url"\s*:\s*"([^"]+)"/i,
    /"hd_src"\s*:\s*"([^"]+)"/i,
    /"sd_src"\s*:\s*"([^"]+)"/i,
    /"video_url"\s*:\s*"([^"]+)"/i,
    /"base_url"\s*:\s*"([^"]+)"/i
  ];

  for (const r of regexes) {
    const m = html.match(r);
    if (m) {
      const clean = m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
      console.log(`Matched ${r}:`, clean.slice(0, 100));
    }
  }

  // Also check btch.fbdown on the redirected URL
  try {
    const btch = require("btch-downloader");
    const btchRes = await btch.fbdown(rRes.url);
    console.log("btch.fbdown result:", btchRes);
  } catch (e) {
    console.log("btch error:", e.message);
  }

  // Also test Instagram downloaders for Instagram videos
  try {
    const igTestUrl = "https://www.instagram.com/reel/C8q8q8q/";
    console.log("\n=== Testing IG via btch.aio ===");
    const btch = require("btch-downloader");
    if (btch.aio) {
      const aioRes = await btch.aio(igTestUrl);
      console.log("btch.aio:", aioRes);
    }
  } catch(e) {
    console.log("btch aio err:", e.message);
  }
}

inspect();
