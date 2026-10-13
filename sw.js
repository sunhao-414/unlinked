// build-offline.mjs replaces versions with content fingerprints. Never cache user files.
const VERSION = '640ad1bfd170e8ef';
const OCR_VERSION = '8dba7af41154b80e';
const ROOT = new URL('./',self.location.href).href;
const PREFIX = 'shiti-offline:' + ROOT;
const SHELL = PREFIX + ':shell:' + VERSION, OCR = PREFIX + ':ocr:' + OCR_VERSION;
const files = ['index.html','styles.css','app.js','store.js','ocr.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','ocr-assets.json'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL);await cache.addAll(files.map(f=>new URL(f,ROOT).href));})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith(PREFIX+':')&&![SHELL,OCR].includes(name))await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(event.request.method!=='GET'||!url.href.startsWith(ROOT))return;
  const relative=url.href.slice(ROOT.length).split('?')[0];
  if(event.request.mode==='navigate') {event.respondWith((async()=>await (await caches.open(SHELL)).match(new URL('index.html',ROOT).href)||fetch(event.request))());return;}
  if(files.includes(relative)||relative.startsWith('vendor/ocr/')) event.respondWith((async()=>{
    const cache=await caches.open(relative.startsWith('vendor/ocr/')?OCR:SHELL);
    const canonical=new URL(relative,ROOT).href;
    const cached=await cache.match(canonical);if(cached)return cached;
    // Model files are only cached by the explicit complete-pack download below.
    return fetch(event.request);
  })());
});
let downloading;
self.addEventListener('message',event=>{
  const port=event.ports[0];if(!port)return;
  const send=value=>port.postMessage(value);
  event.waitUntil((async()=>{try{
    if(event.data.type==='STATUS'){
      const manifest=await (await caches.open(SHELL)).match(new URL('ocr-assets.json',ROOT).href);
      const list=await manifest.json(),cache=await caches.open(OCR);let ready=0;
      for(const item of list)if(await cache.match(new URL(item.path,ROOT).href))ready++;
      send({done:true,ready:ready===list.length,total:list.length,count:ready});
    }else if(event.data.type==='DOWNLOAD_OCR'){
      if(downloading){send({done:true,error:'另一个页面正在下载，请稍后检查下载状态。'});return;}
      downloading=true;
      try{const manifest=await (await caches.open(SHELL)).match(new URL('ocr-assets.json',ROOT).href),list=await manifest.json(),cache=await caches.open(OCR);let count=0;
        for(const item of list){const url=new URL(item.path,ROOT).href;
          if(!await cache.match(url)){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('离线识别包下载失败，请联网重试。');const bytes=await response.arrayBuffer();if(bytes.byteLength!==item.size)throw new Error('识别文件不完整，请重新下载。');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==item.sha256)throw new Error('识别文件校验失败，请刷新后重试。');await cache.put(url,new Response(bytes,{status:200,headers:response.headers}));}
          send({progress:++count/list.length,count,total:list.length});
        }send({done:true,ready:true});
      }finally{downloading=false;}
    }
  }catch(error){send({done:true,error:error.name==='QuotaExceededError'?'设备空间不足，识别包未下载完成。':error.message});}})());
});
