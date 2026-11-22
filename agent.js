const agentMode=el('agentMode');
agentMode.onchange=()=>{
  el('online').disabled=agentMode.checked;
  if(agentMode.checked)el('online').checked=false;
  el('send').textContent=agentMode.checked?'Run agent':'Send';
  el('proposal').hidden=true;
};
function relevant(items,textOf,goal){
  const wanted=terms(goal);
  return items.map(item=>({item,score:[...terms(textOf(item))].filter(t=>wanted.has(t)).length}))
    .filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score).slice(0,4).map(hit=>textOf(hit.item).slice(0,350));
}
function parseSteps(reply){
  return reply.split(/\n+/).map(s=>s.trim()).filter(s=>/^(?:[-*•]|\d+[.)])\s+/.test(s))
    .map(s=>s.replace(/^(?:[-*•]|\d+[.)])\s+/,'').trim()).filter(Boolean).slice(0,5);
}
async function runAgent(goal){
  pending=goal;agentMode.disabled=true;el('send').disabled=true;el('brain').disabled=true;el('stop').hidden=false;
  const passages=(await findReferences(goal).catch(()=>[])).map(r=>r.name+' #'+r.number+': '+r.body.slice(0,280));
  if(pending!==goal||!el('send').disabled)return;
  const facts=relevant(lessons,l=>l.question+' '+l.answer,goal);
  const tasks=relevant(data.tasks,t=>t,goal);
  line('Agent','Checked local sources: '+passages.length+' matching passages, '+facts.length+' lessons, '+tasks.length+' existing tasks.');
  const context=[...passages,...facts,...tasks].join('\n').slice(0,1500);
  try{
    worker??=new Worker('./engine.js',{type:'module'});
    worker.onerror=()=>stop('The planning model could not start. Retry or use the compact model.');
    worker.onmessage=({data:m})=>{
      if(m.status){el('status').textContent=m.status;return}
      if(m.error||!m.reply){stop('Could not generate a plan. Try a shorter goal.');return}
      const steps=parseSteps(m.reply);
      if(!steps.length){line('Aster',m.reply);stop('No checklist detected. Try asking for numbered steps.');return}
      el('steps').value=steps.join('\n');el('proposal').hidden=false;
      finish();pending='';el('status').textContent='Plan ready for review.';
    };
    worker.postMessage({brain:el('brain').value,lessons:[],messages:[
      {role:'system',content:'You are a task planner. Write 2 to 4 concrete next actions for the goal. Output only a numbered list, one action per line. Start each action with a verb. Use supplied context if relevant.'},
      {role:'user',content:'Goal: '+goal+(context?'\nLocal context:\n'+context:'')+'\nGive the numbered checklist.'}
    ]});
  }catch{stop('Local planning is unavailable.')}
}
el('discard').onclick=()=>{el('proposal').hidden=true;el('status').textContent='Plan discarded.'};
el('apply').onclick=()=>{
  const proposed=el('steps').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!proposed.length){el('status').textContent='Enter at least one task.';return}
  const norm=s=>s.toLowerCase().replace(/[.!?]+$/,'').trim();
  const seen=new Set(data.tasks.map(norm)),added=[];
  for(const item of proposed)if(!seen.has(norm(item))){added.push(item);seen.add(norm(item))}
  const next={...data,tasks:[...data.tasks,...added]};
  try{localStorage.setItem(key,JSON.stringify(next))}
  catch{el('status').textContent='Unable to save. Your reviewed tasks are still here.';return}
  data=next;render();el('proposal').hidden=true;
  line('Agent','Saved '+added.length+' new tasks. Skipped '+(proposed.length-added.length)+' duplicates.');
};
