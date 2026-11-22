import {pipeline,env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
let generator,encoder;
const cached=new Map();
async function matchLesson(prompt,lessons){
  if(!lessons.length)return;
  self.postMessage({status:'Searching saved lessons by meaning…'});
  encoder??=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8',device:'wasm'});
  const questions=new Set(lessons.map(l=>l.question));
  for(const key of cached.keys())if(!questions.has(key))cached.delete(key);
  const missing=[...questions].filter(q=>!cached.has(q)),options={pooling:'mean',normalize:true};
  for(let i=0;i<missing.length;i+=8){
    const batch=missing.slice(i,i+8),vectors=(await encoder(batch,options)).tolist();
    batch.forEach((q,j)=>cached.set(q,vectors[j]));
  }
  const [v]=(await encoder([prompt],options)).tolist();
  const ranked=lessons.map(lesson=>({lesson,score:cached.get(lesson.question).reduce((sum,x,i)=>sum+x*v[i],0)})).sort((a,b)=>b.score-a.score);
  if(ranked[0].score>=0.68&&ranked[0].score-(ranked[1]?.score||0)>=0.04)return ranked[0].lesson;
}
self.onmessage=async ({data})=>{
  try{
    let lesson;
    try{lesson=await matchLesson(data.messages.at(-1).content,data.lessons)}catch{}
    if(lesson){self.postMessage({lesson});return}
    if(!generator){
      self.postMessage({status:'Downloading the model for this device…'});
      generator=await pipeline('text-generation',data.brain==='large'?'onnx-community/Qwen2.5-1.5B-Instruct':'HuggingFaceTB/SmolLM2-360M-Instruct',{device:'wasm',dtype:'q4',progress_callback:p=>{
        if(p.status==='progress'&&p.file?.endsWith('.onnx'))self.postMessage({status:'Loading model · '+Math.round(p.progress)+'%'});
      }});
    }
    self.postMessage({status:'Thinking…'});
    const [result]=await generator(data.messages,{max_new_tokens:128,do_sample:false,return_full_text:false});
    const output=result.generated_text;
    const reply=typeof output==='string'?output:output.at(-1)?.content;
    if(!reply?.trim())throw Error();
    self.postMessage({reply:reply.trim()});
  }catch{self.postMessage({error:true})}
};
