const url = "https://p16-common-sign.tiktokcdn-us.com/tos-alisg-i-photomode-sg/ae748f8dedb44d799cc9684d4697ed6c~tplv-photomode-image.jpeg?dr=9616&x-expires=1788300000&x-signature=qAySuorMOdoDpWi6JAusYiPLl58%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=9b759fb9&idc=useast8&ftpl=1";
const isDirectImage = url.match(/\.(jpeg|jpg|png|webp|gif|avif)($|\?)/i) || url.includes('tiktokcdn');
console.log(isDirectImage !== null);
