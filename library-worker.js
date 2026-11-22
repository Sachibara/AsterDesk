const stopWords=new Set('a an the and or is are was were have has in on about what where why how who does do did of to my our me tell please from for can i with that it which explain according notes file files reference references'.split(' '));
function terms(text){return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>!stopWords.has(t)))}
const ready=new Promise((resolve,reject)=>{
  const req=indexedDB.open('aster-reference-library',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('docs',{keyPath:'name'});
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
async function run({op,doc,name,question}){
  const db=await ready;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('docs',['save','remove','migrate'].includes(op)?'readwrite':'readonly'),s=tx.objectStore('docs');
    let result,error;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error||tx.error||Error('Storage operation failed'));
    if(op==='names'){const r=s.getAllKeys();r.onsuccess=()=>result=r.result;return}
    if(op==='remove'){s.delete(name);return}
    if(op==='migrate'){const r=s.getKey(doc.name);r.onsuccess=()=>{if(r.result===undefined)s.put(doc)};return}
    if(op==='save'){
      let total=doc.bytes;const cursor=s.openCursor();
      cursor.onsuccess=()=>{const row=cursor.result;if(row){if(row.key!==doc.name)total+=row.value.bytes;row.continue();return}
        if(total>250000000){error=Error('250 MB text library is full');tx.abort()}else s.put(doc)
      };return;
    }
    const query=terms(question);result=[];if(!query.size)return;
    const cursor=s.openCursor();
    cursor.onsuccess=()=>{
      const row=cursor.result;if(!row)return;
      const {name,text}=row.value;let number=0;
      for(const match of text.matchAll(/[^\n]{1,600}(?:\s|$)|[^\n]{1,600}/g)){
        const body=match[0].trim();number++;
        const words=terms(body),count=[...query].filter(t=>words.has(t)).length;
        if(count&&count/query.size>=.5){
          const score=count/Math.sqrt(words.size);
          if(result.length<2||score>result[1].score){
            result.push({name,number,body,score});result.sort((a,b)=>b.score-a.score);result.length=Math.min(2,result.length);
          }
        }
      }row.continue();
    };
  });
}
self.onmessage=async({data})=>{try{self.postMessage({id:data.id,value:await run(data)})}catch(e){self.postMessage({id:data.id,error:e.message})}};
