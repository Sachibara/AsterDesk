const assert = require('node:assert/strict');
const test = require('node:test');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const template = readFileSync(require.resolve('../autopilot-template.txt'), 'utf8');

function fixture() {
  const values = new Map([['GEMINI_API_KEY','test']]);
  const triggers = [];
  const sent = [];
  const profile = {cv:'Developed automation pipelines',portfolio:'https://example.org/',hash:'123'};
  const site = 'Built a remote automation project';
  const response = {fit:true,cvQuote:profile.cv,portfolioQuote:site,subject:'Automation engineer'};
  const job = {url:'https://jobs.wordpress.net/job/sample/',title:'Automation engineer',company:'Example',to:'jobs@example.org'};
  const ctx = {
    console:{log(){},warn(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>values.get(k),setProperty:(k,v)=>values.set(k,v)})},
    ScriptApp:{
      getProjectTriggers:()=>triggers,
      newTrigger:handler=>({timeBased:()=>({everyMinutes:n=>({create(){assert.equal(n,15);triggers.push({getHandlerFunction:()=>handler});}})})}),
      deleteTrigger:t=>triggers.splice(triggers.indexOf(t),1)
    },
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    Utilities:{newBlob:()=>({getBytes:()=>[]})},
    MailApp:{getRemainingDailyQuota:()=>5,sendEmail:m=>sent.push(m)}
  };
  runInNewContext(template.replace('__ASTER_PROFILE__',JSON.stringify(profile)),ctx);
  Object.assign(ctx,{resume:()=>({}),readPortfolio:()=>site,wordpressLinks:()=>[job.url],
    posting:()=>job,digest:()=>profile.hash,requestModel:(_,input)=>input==='Connectivity check'?{ready:true}:response});
  return {ctx,triggers,sent,response,values};
}
test('setup sends nothing and failed preflight cannot schedule',()=>{
  const {ctx,triggers,sent}=fixture();
  ctx.checkAster();assert.equal(sent.length,0);
  ctx.requestModel=()=>{throw Error('Gemini unavailable');};
  assert.throws(()=>ctx.startAster(),/Gemini/);assert.equal(triggers.length,0);
});
test('start is repeatable, matching opening sends once, stop removes schedule',()=>{
  const {ctx,triggers,sent}=fixture();ctx.startAster();ctx.startAster();
  assert.equal(triggers.length,1);assert.equal(sent.length,1);
  assert.equal(sent[0].to,'jobs@example.org');assert.equal(sent[0].attachments.length,1);
  ctx.stopAster();assert.equal(triggers.length,0);
});
test('unsupported evidence remains retryable and an uncertain send is never repeated',()=>{
  const {ctx,response}=fixture();response.cvQuote='A claim absent from the CV';
  assert.throws(()=>ctx.huntJobs(),/assessments failed/);
  response.cvQuote='Developed automation pipelines';let attempts=0;
  ctx.MailApp.sendEmail=()=>{attempts++;throw Error('Unknown delivery result');};
  assert.throws(()=>ctx.huntJobs(),/Unknown delivery/);
  ctx.huntJobs();assert.equal(attempts,1);
});
test('a changed recipient during final recheck prevents sending',()=>{
  const {ctx,sent}=fixture();const original=ctx.posting;let calls=0;
  ctx.posting=()=>++calls===1?original():{...original(),to:'changed@example.org'};
  ctx.huntJobs();assert.equal(sent.length,0);
});
