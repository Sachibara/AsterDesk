const canvas=document.getElementById('core');
const ctx=canvas.getContext('2d');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const send=document.getElementById('send');
const activity=document.getElementById('activity');
const status=document.getElementById('status');
let angle=0,last=0,frame;
function draw(time){
  if(!ctx)return;
  if(!last||time-last>=32||motion.matches){
    const busy=send.disabled;
    angle+=motion.matches?0:Math.min(time-last,80)*(busy?.00055:.00016);
    last=time;ctx.clearRect(0,0,520,520);
    for(let lat=-12;lat<=12;lat++){
      const a=lat*Math.PI/26;
      for(let lon=0;lon<64;lon++){
        const b=lon*Math.PI/32+angle;
        const x=Math.cos(a)*Math.cos(b),y=Math.sin(a),z=Math.cos(a)*Math.sin(b);
        const depth=(z+1)/2;
        ctx.fillStyle='rgba(116,241,255,'+(.12+.78*depth)+')';
        ctx.beginPath();ctx.arc(260+205*(x*.94-y*.34),260+205*(x*.34+y*.94),1+depth*1.9,0,Math.PI*2);ctx.fill();
      }
    }
  }
  if(!motion.matches&&!document.hidden)frame=requestAnimationFrame(draw);
}
function restart(){cancelAnimationFrame(frame);last=0;draw(performance.now())}
function sync(){activity.textContent=send.disabled?(/load|start/i.test(status.textContent)?'Loading model':'Processing'):'Ready for input'}
new MutationObserver(sync).observe(status,{childList:true,subtree:true,characterData:true});
new MutationObserver(sync).observe(send,{attributes:true,attributeFilter:['disabled']});
motion.addEventListener('change',restart);document.addEventListener('visibilitychange',restart);restart();

const controls=document.querySelectorAll('[data-open]');
for(const button of controls){
  button.addEventListener('click',()=>{
    const opening=button.getAttribute('aria-expanded')==='false';
    for(const control of controls){
      const selected=opening&&control===button;
      control.setAttribute('aria-expanded',String(selected));
      document.getElementById(control.dataset.open).hidden=!selected;
    }
    if(opening){
      const pane=document.getElementById(button.dataset.open);
      pane.scrollIntoView({block:'nearest',behavior:motion.matches?'instant':'smooth'});
      if(button.dataset.open==='chat')document.getElementById('input').focus({preventScroll:true});
    }
  });
}
