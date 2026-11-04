// Same full-quality scene data as the tested build, packaged for static hosting.
(async () => {
  const base = new URL('../', document.currentScript.src);
  const script = path => new Promise((resolve,reject) => {
    const el=document.createElement('script');el.src=new URL(path,base);el.onload=resolve;el.onerror=()=>reject(new Error(`Unable to load ${path}`));document.head.appendChild(el);
  });
  let fallback;
  const get = async (name, mode='json') => {
    const response=await fetch(new URL(name,base));
    if(!response.ok)throw new Error(`Unable to load ${name} (${response.status})`);
    if(mode==='json')return response.json();
    const bytes=await response.arrayBuffer();
    if(!name.endsWith('.gz')||!bytes.byteLength)return bytes;
    // Fetch may already have decoded an explicit Content-Encoding from a host.
    const magic=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));
    if(magic[0]!==31||magic[1]!==139)return bytes;
    if(typeof DecompressionStream!=='undefined')return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    fallback ||= script(manifest.inflate);await fallback;
    return window.fflate.gunzipSync(new Uint8Array(bytes)).buffer;
  };
  const join=chunks=>{const result=new Uint8Array(chunks.reduce((n,b)=>n+b.byteLength,0));let offset=0;for(const b of chunks){result.set(new Uint8Array(b),offset);offset+=b.byteLength;}return result.buffer;};
  const revive=(value,buffer)=>{
    if(value&&value.__numbers)return new Float64Array(buffer,value.__numbers[0],value.__numbers[1]);
    if(Array.isArray(value))return value.map(v=>revive(v,buffer));
    if(value&&typeof value==='object')for(const k of Object.keys(value))value[k]=revive(value[k],buffer);
    return value;
  };
  let manifest;
  try{
    manifest=await get('manifest.json');
    const [world,people,numbers,roads]=await Promise.all([
      get(manifest.world),get(manifest.people),Promise.all(manifest.numbers.map(n=>get(n,'binary'))).then(join),get(manifest.roads,'binary'),
      (async()=>{await script(manifest.three);await script(manifest.skeleton);})()
    ]);
    window.KERAI_WORLD=world;window.KERAI_NATIVE_PEOPLE=revive(people,numbers);window.KERAI_ROADS=roads;
    window.KERAI_PEOPLE=Object.fromEntries(Object.entries(manifest.textures).map(([k,v])=>[k,new URL(v,base).href]));
    window.KERAI_TILES=Object.fromEntries(Object.entries(manifest.tiles).map(([k,v])=>[k,new URL(v,base).href]));
    window.KERAI_WS_URL=new URL('ws',base).href.replace(/^http/,'ws');
    await script(manifest.game);
  }catch(error){console.error(error);const p=document.querySelector('#loading p');if(p)p.textContent='The game could not load. Please reload to try again.';}
})();
