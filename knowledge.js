const libraryKey='asterdesk-documents-v1';
const libraryWorker=new Worker('./library-worker.js');
let requestNumber=0;
const requests=new Map();
libraryWorker.onmessage=({data})=>{
  const pending=requests.get(data.id);if(!pending)return;
  requests.delete(data.id);
  if(data.error)pending.reject(Error(data.error));else pending.resolve(data.value);
};
function libraryRequest(op,args={}){
  const id=++requestNumber;
  return new Promise((resolve,reject)=>{requests.set(id,{resolve,reject});libraryWorker.postMessage({id,op,...args})});
}
async function refreshLibrary(){
  const names=await libraryRequest('names'),list=document.getElementById('documents');list.replaceChildren();
  for(const name of names){
    const li=document.createElement('li'),remove=document.createElement('button');
    li.append(name);remove.textContent='Remove';
    remove.onclick=async()=>{try{await libraryRequest('remove',{name});await refreshLibrary()}catch(e){document.getElementById('libraryStatus').textContent=e.message}};
    li.append(remove);list.append(li);
  }
}
const libraryReady=(async()=>{
  const legacy=localStorage.getItem(libraryKey);
  if(legacy){
    for(const doc of JSON.parse(legacy))if(typeof doc?.text==='string'&&typeof doc.name==='string'){
      await libraryRequest('migrate',{doc:{...doc,bytes:new Blob([doc.text]).size}});
    }
    localStorage.removeItem(libraryKey);
  }
  await refreshLibrary();
})();
libraryReady.catch(()=>{document.getElementById('libraryStatus').textContent='Document storage unavailable in this browser.'});
async function extractDocument(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(file.size>50000000)throw Error('file exceeds 50 MB');
  if(['txt','md','markdown'].includes(ext))return file.text();
  if(ext==='docx'){
    const {unzipSync,strFromU8}=await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
    const entry='word/document.xml';
    const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:f=>f.name===entry&&f.originalSize<=100000000});
    if(!files[entry])throw Error('unable to read Word document or document too large');
    const xml=new DOMParser().parseFromString(strFromU8(files[entry]),'application/xml');
    return Array.from(xml.getElementsByTagNameNS('*','p'),p=>Array.from(p.getElementsByTagNameNS('*','t'),t=>t.textContent).join('')).join('\n');
  }
  if(ext==='pdf'){
    const pdf=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdf.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const doc=await pdf.getDocument({data:await file.arrayBuffer(),isEvalSupported:false}).promise;
    const pages=[];let size=0;
    try{
      for(let i=1;i<=doc.numPages;i++){
        const page=await doc.getPage(i),content=await page.getTextContent();
        const text=content.items.map(item=>item.str||'').join(' ');
        size+=text.length;if(size>50000000)throw Error('extracted text exceeds 50 MB');
        pages.push(text);page.cleanup();
      }
    }finally{await doc.destroy()}
    return pages.join('\n');
  }
  throw Error('unsupported file type');
}
document.getElementById('files').onchange=async e=>{
  const input=e.target;input.disabled=true;
  const messages=[];
  const batch=Array.from(input.files);
  for(const [i,file] of batch.entries()){
    try{
      document.getElementById('libraryStatus').textContent='Reading '+(i+1)+' of '+batch.length+' · '+file.name+'…';
      const text=(await extractDocument(file)).trim();
      if(!text)throw Error('no readable text found; scanned pages need OCR first');
      const bytes=new Blob([text]).size;if(bytes>50000000)throw Error('extracted text exceeds 50 MB');
      await libraryReady;await libraryRequest('save',{doc:{name:file.name,text,bytes}});await refreshLibrary();
      messages.push('Saved '+file.name);
    }catch(error){messages.push(file.name+' — '+error.message)}
  }
  input.value='';input.disabled=false;document.getElementById('libraryStatus').textContent=messages.join('. ');
};
const stopWords=new Set('a an the and or is are was were have has in on about what where why how who does do did of to my our me tell please from for can i with that it which explain according notes file files reference references'.split(' '));
function terms(text){return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>!stopWords.has(t)))}
async function findReferences(question){await libraryReady;return libraryRequest('search',{question})}
async function lookupWiki(question){
  const topic=question.replace(/^(?:what (?:is|are)|who (?:is|was)|tell me about|explain)\s+/i,'').replace(/\?$/,'').trim()||question;
  const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'search',gsrsearch:topic,gsrlimit:'2',prop:'extracts',exintro:'1',explaintext:'1',exsentences:'2',origin:'*'});
  const res=await fetch('https://en.wikipedia.org/w/api.php?'+params,{signal:AbortSignal.timeout(15000),credentials:'omit'});
  if(!res.ok)throw Error();const data=await res.json();if(data.error)throw Error();
  return (data.query?.pages||[]).filter(p=>p.extract).sort((a,b)=>a.index-b.index);
}
