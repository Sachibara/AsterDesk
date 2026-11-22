const libraryKey='asterdesk-documents-v1';
let documents=[];
try{
  const saved=JSON.parse(localStorage.getItem(libraryKey));
  if(Array.isArray(saved))documents=saved.filter(d=>d&&typeof d.name==='string'&&typeof d.text==='string');
}catch{}
function saveLibrary(next){
  localStorage.setItem(libraryKey,JSON.stringify(next));
  documents=next;showLibrary();
}
function showLibrary(){
  const list=document.getElementById('documents');list.replaceChildren();
  for(const doc of documents){
    const li=document.createElement('li'),remove=document.createElement('button');
    li.append(doc.name);remove.textContent='Remove';remove.onclick=()=>{
      try{saveLibrary(documents.filter(d=>d!==doc));document.getElementById('libraryStatus').textContent='Removed '+doc.name}
      catch{document.getElementById('libraryStatus').textContent='Could not update browser storage.'}
    };li.append(remove);list.append(li);
  }
}
async function extractDocument(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(file.size>10000000)throw Error('file exceeds 10 MB');
  if(['txt','md','markdown'].includes(ext))return file.text();
  if(ext==='docx'){
    const {unzipSync,strFromU8}=await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
    const entry='word/document.xml';
    const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:f=>f.name===entry&&f.originalSize<=8000000});
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
        size+=text.length;if(size>1000000)throw Error('extracted text exceeds the library limit');
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
  for(const file of input.files){
    try{
      document.getElementById('libraryStatus').textContent='Reading '+file.name+'…';
      const text=(await extractDocument(file)).trim();
      if(!text)throw Error('no readable text found; scanned pages need OCR first');
      const next=[...documents.filter(d=>d.name!==file.name),{name:file.name,text}];
      if(new Blob(next.map(d=>d.text)).size>1000000)throw Error('library is full');
      saveLibrary(next);messages.push('Saved '+file.name);
    }catch(error){messages.push(file.name+' — '+error.message)}
  }
  input.value='';input.disabled=false;document.getElementById('libraryStatus').textContent=messages.join('. ');
};
const stopWords=new Set('a an the and or is are was were have has in on about what where why how who does do did of to my our me tell please from for can i with that it which explain according notes file files reference references'.split(' '));
function terms(text){return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>!stopWords.has(t)))}
function findReferences(question){
  const query=terms(question);if(!query.size)return [];
  const hits=[];
  for(const doc of documents){
    const passages=doc.text.match(/[^\n]{1,600}(?:\s|$)|[^\n]{1,600}/g)||[];
    passages.forEach((body,i)=>{
      const words=terms(body),matches=[...query].filter(t=>words.has(t)).length;
      if(matches&&matches/query.size>=.5)hits.push({name:doc.name,number:i+1,body:body.trim(),score:matches/Math.sqrt(words.size||1)});
    });
  }
  return hits.sort((a,b)=>b.score-a.score).slice(0,2);
}
async function lookupWiki(question){
  const topic=question.replace(/^(?:what (?:is|are)|who (?:is|was)|tell me about|explain)\s+/i,'').replace(/\?$/,'').trim()||question;
  const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'search',gsrsearch:topic,gsrlimit:'2',prop:'extracts',exintro:'1',explaintext:'1',exsentences:'2',origin:'*'});
  const res=await fetch('https://en.wikipedia.org/w/api.php?'+params,{signal:AbortSignal.timeout(15000),credentials:'omit'});
  if(!res.ok)throw Error();const data=await res.json();if(data.error)throw Error();
  return (data.query?.pages||[]).filter(p=>p.extract).sort((a,b)=>a.index-b.index);
}
showLibrary();
