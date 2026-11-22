import {pipeline,env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
let generator;
self.onmessage=async ({data})=>{
  try{
    if(!generator){
      self.postMessage({status:'Downloading the model for this device…'});
      generator=await pipeline('text-generation','HuggingFaceTB/SmolLM2-360M-Instruct',{device:'wasm',dtype:'q4',progress_callback:p=>{
        if(p.status==='progress'&&p.file?.endsWith('.onnx'))self.postMessage({status:'Loading model · '+Math.round(p.progress)+'%'});
      }});
    }
    self.postMessage({status:'Thinking…'});
    const [result]=await generator(data,{max_new_tokens:128,do_sample:false,return_full_text:false});
    const output=result.generated_text;
    const reply=typeof output==='string'?output:output.at(-1)?.content;
    if(!reply?.trim())throw Error();
    self.postMessage({reply:reply.trim()});
  }catch{self.postMessage({error:true})}
};
