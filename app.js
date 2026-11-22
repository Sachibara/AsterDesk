const el=id=>document.getElementById(id);
const key='asterdesk-v1';
let data={tasks:[],memory:[]},history=[],worker=null,pending='';
try{
  const saved=JSON.parse(localStorage.getItem(key));
  if(saved&&['tasks','memory'].every(k=>Array.isArray(saved[k])&&saved[k].every(x=>typeof x==='string')))data=saved;
}catch{}
function render(){
  for(const k of ['tasks','memory']){
    const list=el(k);list.replaceChildren();
    data[k].forEach((item,i)=>{
      const li=document.createElement('li'),b=document.createElement('button');li.append(item);b.textContent=k==='tasks'?'Done':'Forget';b.setAttribute('aria-label',b.textContent+' '+item);
      b.onclick=()=>{data[k].splice(i,1);persist();render()};li.append(b);list.append(li);
    });
  }
}
function persist(){try{localStorage.setItem(key,JSON.stringify(data))}catch{el('status').textContent='Storage unavailable. Changes last for this tab.'}}
function line(who,text,source){
  const p=document.createElement('p'),b=document.createElement('strong');b.textContent=who;p.append(b,text);
  if(source){const a=document.createElement('a');a.href=source;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Read on Wikipedia';p.append(document.createElement('br'),a)}
  el('log').append(p);el('log').scrollTop=el('log').scrollHeight;
  if(who==='Aster'&&el('speak').checked&&window.speechSynthesis){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(text))}
}
function finish(){el('send').disabled=false;el('stop').hidden=true}
function stop(message){worker?.terminate();worker=null;finish();el('status').textContent=message;if(!el('input').value)el('input').value=pending;pending=''}
el('stop').onclick=()=>stop('Stopped.');
el('form').onsubmit=async e=>{
  e.preventDefault();const q=el('input').value.trim();if(!q||el('send').disabled)return;
  line('You',q);el('input').value='';el('status').textContent='';
  if(el('online').checked){
    el('online').checked=false;el('send').disabled=true;el('status').textContent='Searching Wikipedia…';
    try{
      const articles=await lookupWiki(q);
      if(!articles.length)line('Aster','No article summary found. Try a shorter topic.');
      for(const a of articles)line('Aster',a.title+' — '+a.extract,'https://en.wikipedia.org/?curid='+a.pageid);
      history.push({role:'user',content:q},{role:'assistant',content:articles.map(a=>a.title+': '+a.extract).join(' ').slice(0,1300)});history=history.slice(-6);
      el('status').textContent='Wikipedia lookup complete.';
    }catch{el('status').textContent='Wikipedia is unavailable. You can retry the lookup.';if(!el('input').value)el('input').value=q}
    finally{finish()}return;
  }
  const match=q.match(/^(add (?:a )?task|remember)\s*[:\s]\s*(.+)$/is);
  if(match){
    const k=match[1].toLowerCase()==='remember'?'memory':'tasks',item=match[2].trim();
    if(item&&!data[k].includes(item))data[k].push(item);
    persist();render();line('Aster',k==='memory'?'Remembered: '+item:'Task on your list: '+item);return;
  }
  if(/^(?:list|show)(?: my)? (tasks|memories)[.!?]?$/i.test(q)){
    const items=/tasks/i.test(q)?data.tasks:data.memory;line('Aster',items.join('\n')||'Your list is empty.');return;
  }
  if(/^(what|which|when|where|who|do you remember)\b/i.test(q)&&/\b(my|I|remember)\b/i.test(q)){
    const ignored=new Set('what which when where who the name does remember called have with from about'.split(' '));
    const terms=q.toLowerCase().match(/[a-z]{3,}/g)?.filter(w=>!ignored.has(w))||[];
    const matches=data.memory.filter(note=>terms.some(w=>note.toLowerCase().match(/[a-z]+/g)?.includes(w)));
    if(matches.length){line('Aster','From your saved memory: '+matches.join(' · '));return}
  }
  const excerpts=findReferences(q);
  if(excerpts.length){
    const answer=excerpts.map(r=>r.name+' · passage '+r.number+'\n'+r.body).join('\n\n');
    line('Aster','From your references:\n'+answer);history.push({role:'user',content:q},{role:'assistant',content:answer});history=history.slice(-6);return;
  }
  pending=q;el('send').disabled=true;el('stop').hidden=false;el('status').textContent='Starting local AI…';
  try{
    worker??=new Worker('./engine.js',{type:'module'});
    worker.onerror=()=>stop('The local model could not start. Check your connection and retry.');
    worker.onmessage=({data:m})=>{
      if(m.status){el('status').textContent=m.status;return}
      if(m.error){stop('The model could not finish. Try a shorter question or free device memory.');return}
      line('Aster',m.reply);history.push({role:'user',content:q},{role:'assistant',content:m.reply});history=history.slice(-6);
      pending='';finish();el('status').textContent='Answered on this device.';
    };
    const context=JSON.stringify({tasks:data.tasks.slice(-10),memory:data.memory.slice(-10)}).slice(0,1800);
    worker.postMessage([{role:'system',content:'You are Aster, a concise personal assistant. Answer the question directly. You can discuss, plan and suggest. Only the interface can change saved items. Never claim external actions. User context: '+context},...history.slice(-4).map(m=>({...m,content:m.content.slice(0,700)})),{role:'user',content:q}]);
  }catch{stop('Local AI unavailable on this browser.')}
};
render();
