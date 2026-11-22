(() => {
  const el=id=>document.getElementById(id);
  const form=el('huntForm'),list=el('huntList'),status=el('huntStatus'),send=el('huntSend');
  const skills='salesforce,apex,lwc,python,javascript,typescript,react,sql,automation,network,security,software,engineering,support,developer,devops,systems,cloud,data,marketing,operations,technical,ai'.split(',');
  const words=text=>new Set(text.toLowerCase().match(/[a-z0-9]+/g)||[]);
  const home='https://jimcamus.vercel.app/';
  let match,revision=0;
  function reset(){revision++;match=null;el('huntApply').hidden=true;list.replaceChildren();status.textContent='';}
  form.addEventListener('input',reset);
  async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Job source unavailable. Try again later.');return r.json();}
  function loadGoogle(){
    if(window.google?.accounts?.oauth2)return Promise.resolve();
    return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.onload=resolve;s.onerror=()=>reject(Error('Google sign-in could not load.'));document.head.append(s);});
  }
  form.onsubmit=async event=>{
    event.preventDefault();reset();const run=revision;
    status.textContent='Reading CV and checking employer listings…';
    try{
      const file=el('huntCV').files[0],url=new URL(el('huntURL').value);
      if(url.protocol!=='https:'||url.username||url.password)throw Error('Enter an HTTPS portfolio URL.');
      const [cv,data]=await Promise.all([extractDocument(file),get('/api/hunt')]);
      if(run!==revision)return;
      if(!cv.trim())throw Error('The CV has no readable text. Upload a text-based copy.');
      const project=el('huntProject').value.trim(),cvWords=words(cv);
      const site=url.href===home?data.portfolio:'';
      const evidence=words(cv+' '+site+' '+project);
      const locations=el('huntLocation').value.toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
      const results=data.jobs.map(job=>{
        const terms=words(job.title+' '+(job.skills||[]).join(' '));
        const hits=skills.filter(k=>evidence.has(k)&&terms.has(k));
        return {job,hits};
      }).filter(({job,hits})=>hits.length&&(!locations.length||locations.some(l=>job.location.toLowerCase().includes(l)))).sort((a,b)=>b.hits.length-a.hits.length);
      for(const {job,hits} of results.slice(0,40)){
        const li=document.createElement('li'),a=document.createElement('a');a.href=job.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=job.title;
        li.append(a,' · '+job.company+' · '+job.location+' · '+hits.join(', '));list.append(li);
      }
      status.textContent=results.length+' matching listings. Showing up to 40. Verify location eligibility in the posting.'+(data.unavailable.length?' Unavailable: '+data.unavailable.join(', ')+'.':'')+(!site?' Portfolio matching uses your project highlight.':'');
      const eligible=results.find(({job})=>job.recipient&&job.skills.every(k=>cvWords.has(k)));
      if(eligible&&project&&file.size<=10000000){
        match={job:eligible.job,file,url:url.href,project};
        el('huntClient').value=data.clientId||el('huntClient').value;el('huntApply').hidden=false;
        try{await loadGoogle();}catch(e){if(run===revision)status.textContent+=' '+e.message;}
      }else status.textContent+=' Email submission requires a listed email-enabled match, its three core skills in your CV, a project highlight and a CV under 10 MB.';
    }catch(e){if(run===revision)status.textContent=e.message;}
  };
  function base64(bytes){
    let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);
  }
  send.onclick=async()=>{
    const application=match,id=el('huntClient').value.trim();
    if(!application)return;
    if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)||!window.google?.accounts?.oauth2){status.textContent='Configure a Google web client and enable Google sign-in first.';return;}
    send.disabled=true;
    try{
      const token=await new Promise((resolve,reject)=>google.accounts.oauth2.initTokenClient({client_id:id,scope:'https://www.googleapis.com/auth/gmail.send',callback:r=>r.access_token?resolve(r.access_token):reject(Error('Gmail permission unavailable.')),error_callback:()=>reject(Error('Gmail connection cancelled.'))}).requestAccessToken());
      const {jobs}=await get('/api/hunt?verify=email');
      const {job,file,url,project}=application;
      if(match!==application||!jobs.some(j=>j.url===job.url&&j.recipient===job.recipient&&j.subject===job.subject))throw Error('The selection changed or the employer could not be verified.');
      const key='aster-application:'+job.url;
      const boundary='aster-'+crypto.randomUUID(),enc=new TextEncoder();
      const body='Hello Sliick hiring team,\n\nI am applying for the '+job.title+' position. '+project+'\n\nMy portfolio: '+url+'\nMy CV is attached. Thank you for considering my application.';
      const name=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const attachment=base64(new Uint8Array(await file.arrayBuffer())).match(/.{1,76}/g)?.join('\r\n')||'';
      const mime=['To: '+job.recipient,'Subject: '+job.subject,'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(enc.encode(body)),'--'+boundary,'Content-Type: application/octet-stream','Content-Disposition: attachment; filename="'+name+'"','Content-Transfer-Encoding: base64','',attachment,'--'+boundary+'--',''].join('\r\n');
      const raw=base64(enc.encode(mime)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      await navigator.locks.request(key,async()=>{
        if(match!==application)throw Error('Selection changed.');
        if(localStorage.getItem(key))throw Error('Already attempted from this browser. Check Gmail Sent before following up.');
        localStorage.setItem(key,'pending');
        const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw})});
        if(!r.ok){if([400,401,403,413,429].includes(r.status))localStorage.removeItem(key);throw Error('Gmail did not confirm delivery. Check Sent before retrying.');}
        const receipt=await r.json();localStorage.setItem(key,receipt.id||'accepted');status.textContent='Gmail accepted your application to '+job.company+'. Check Sent for the message.';
      });
    }catch(e){status.textContent=e.message;}finally{send.disabled=false;}
  };
})();
