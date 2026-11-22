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
document.getElementById('files').onchange=async e=>{
  const input=e.target;input.disabled=true;
  const messages=[];
  for(const file of input.files){
    try{
      if(!/\.(txt|md|markdown)$/i.test(file.name)||file.size>250000)throw Error('use a text or Markdown file under 250 KB');
      const text=(await file.text()).trim();
      if(!text)throw Error('file is empty');
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
