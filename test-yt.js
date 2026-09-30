const { extractYoutubeMedia } = require('./lib/mediaExtractor.ts');
extractYoutubeMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ').then(res => {
  console.log('Result:', res);
}).catch(console.error);
