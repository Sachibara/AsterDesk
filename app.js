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
function finish(){el('agentMode').disabled=false;el('brain').disabled=false;el('send').disabled=false;el('stop').hidden=true}
function stop(message){worker?.terminate();worker=null;finish();el('status').textContent=message;if(!el('input').value)el('input').value=pending;pending=''}
el('stop').onclick=()=>stop('Stopped.');
el('form').onsubmit=async e=>{
  e.preventDefault();const q=el('input').value.trim();if(!q||el('send').disabled)return;
  line('You',q);el('input').value='';el('status').textContent='';
  el('proposal').hidden=true;
  if(el('agentMode').checked){runAgent(q);return}
  if(/^teach:/i.test(q)){
    const parts=q.slice(6).split('='),question=parts.shift().trim(),answer=parts.join('=').trim();
    if(!question||!answer){line('Aster','Use Teach: question = answer');return}
    try{
      const next=lessons.filter(l=>normalizeLesson(l.question)!==normalizeLesson(question));
      writeLessons([...next,{question,answer}]);line('Aster','Lesson saved on this device.');
    }catch{line('Aster','Unable to save the lesson to browser storage.')}
    return;
  }
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
  const exact=lessons.find(l=>normalizeLesson(l.question)===normalizeLesson(q));
  if(exact){lessonReply(exact);return}
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
  pending=q;el('brain').disabled=true;el('send').disabled=true;el('stop').hidden=false;el('status').textContent='Starting local AI…';
  try{
    worker??=new Worker('./engine.js',{type:'module'});
    worker.onerror=()=>stop('The local model could not start. Check your connection and retry.');
    worker.onmessage=({data:m})=>{
      if(m.status){el('status').textContent=m.status;return}
      if(m.lesson){lessonReply(m.lesson);pending='';finish();el('status').textContent='Matched a saved lesson on this device.';return}
      if(m.error){stop('The model could not finish. Try a shorter question or free device memory.');return}
      line('Aster',m.reply);history.push({role:'user',content:q},{role:'assistant',content:m.reply});history=history.slice(-6);
      pending='';finish();el('status').textContent='Answered on this device.';
    };
    const context=JSON.stringify({tasks:data.tasks.slice(-10),memory:data.memory.slice(-10)}).slice(0,1800);
    worker.postMessage({brain:el('brain').value,lessons,messages:[{role:'system',content:'You are Aster, a concise personal assistant. Answer the question directly. You can discuss, plan and suggest. Only the interface can change saved items. Never claim external actions. User context: '+context},...history.slice(-4).map(m=>({...m,content:m.content.slice(0,700)})),{role:'user',content:q}]});
  }catch{stop('Local AI unavailable on this browser.')}
};
render();

function lessonReply(lesson){
  line('Aster',lesson.answer+'\nFrom your lesson: '+lesson.question);
  history.push({role:'user',content:lesson.question},{role:'assistant',content:lesson.answer});history=history.slice(-6);
}
function normalizeLesson(text){return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
let lessons=[];
try{
  const saved=JSON.parse(localStorage.getItem('aster-lessons-v1'));
  if(Array.isArray(saved)) lessons=saved.filter(l=>l&&typeof l.question==='string'&&typeof l.answer==='string');
}catch{}
function writeLessons(next){
  if(next.length>200)throw Error('Lesson capacity reached');
  localStorage.setItem('aster-lessons-v1',JSON.stringify(next));lessons=next;renderLessons();
}
function renderLessons(){
  const list=el('lessons');list.replaceChildren();
  for(const lesson of lessons){
    const row=document.createElement('li'),remove=document.createElement('button');
    row.append(lesson.question+' — '+lesson.answer+' ');remove.textContent='Forget';
    remove.onclick=()=>{try{writeLessons(lessons.filter(l=>l!==lesson))}catch{el('status').textContent='Could not update lessons.'}};
    row.append(remove);list.append(row);
  }
}
renderLessons();

el('brain').onchange=()=>{worker?.terminate();worker=null};
