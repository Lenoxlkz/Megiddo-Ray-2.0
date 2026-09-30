const fetch = require('node-fetch');

async function run() {
  const tkRes = await fetch('https://www.tikwm.com/api/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `url=https%3A%2F%2Fvt.tiktok.com%2FZSVvnxbeo%2F&hd=1`
  });
  const tkJson = await tkRes.json();
  console.log(tkJson.data.images?.length);
}
run();
