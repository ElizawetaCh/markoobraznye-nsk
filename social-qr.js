(() => {
'use strict';
// QR matrices are generated at build time for the club's three exact URLs.
// Each row is stored as packed hex bits. Rendering is local: no QR API or third-party dependency.
const codes = {
  telegram: {size:29, hex:'fe6cf3f8822f0a08ba54fae8ba6722e8ba26e2e882e61208feaaabf8007a480096811500f9136748e2b0d7f0945b2b30f2a0fa5860396c002b99e8f8d1a6ead0b3d794102d01454893e406182925f8989a5adfa000bdd8b8fe070a90829488f8ba538f90baf3c7e8ba4a6de882197f10feedc990'},
  vk: {size:29, hex:'fec023f88248ba08ba15f2e8baa3aae8bacec2e882977a08feaaabf800fa50008bafdfc869d047f8ae0f0b889065db589b9449105c3ee3f8ca38a9e890a25898df4f4c10b19062d82a37a8a8219cf398ce0c4fc800f79888fee13ae88273d898bae75fc0ba5df408ba772478824affd8fed2cd90'},
  instagram: {size:37, hex:'fef2aabbf882b99b8208ba690842e8babf58fae8ba4b54bae8826614a208feaaaaabf8009e7c9000b72b996a5879f3802d50b65f46290000fd31f660bfd6c3ffb8356b30bbc8cea07a8ab03cf6ff8b903f19f958e80d9cdc56389ac3f6f738ac22530ad0b6dc243d88b4e9996c50f3fac7491024adafeae02bc63f26b8750aa83ff86a9bfa8430a00a879d982bbd2e5fb000d94908b8fe9dcc6aa882931b9880ba6c236fd0baa36f3aa8baeabd3ea0823c8a65a0feffd3e2b8'}
};
const NS='http://www.w3.org/2000/svg', padding=4;
for(const target of document.querySelectorAll('[data-qr]')){
  const qr=codes[target.dataset.qr];if(!qr)continue;
  const rowWidth=Math.ceil(qr.size/8)*2;
  if(qr.hex.length!==rowWidth*qr.size){target.textContent='QR недоступен';continue}
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox',`0 0 ${qr.size+padding*2} ${qr.size+padding*2}`);
  svg.setAttribute('aria-hidden','true');
  const bg=document.createElementNS(NS,'rect');bg.setAttribute('width','100%');bg.setAttribute('height','100%');bg.setAttribute('fill','#fff');svg.append(bg);
  let commands='';
  for(let y=0;y<qr.size;y++){
    const row=qr.hex.slice(y*rowWidth,(y+1)*rowWidth);
    for(let x=0;x<qr.size;x++){
      const byte=parseInt(row.slice((x>>3)*2,(x>>3)*2+2),16);
      if(byte & (1<<(7-(x%8)))) commands+=`M${x+padding} ${y+padding}h1v1h-1z`;
    }
  }
  const dots=document.createElementNS(NS,'path');dots.setAttribute('d',commands);dots.setAttribute('fill','#070707');svg.append(dots);
  target.replaceChildren(svg);
}
})();
