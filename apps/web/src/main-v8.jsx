import './main-v7.jsx';

function applyV8Marker(){
  const pill=document.querySelector('.pill');
  if(pill)pill.textContent='v8';
  const footer=document.querySelector('.asideFooter span');
  if(footer&&footer.textContent?.includes('v7'))footer.textContent=footer.textContent.replace('v7','v8');
  document.querySelectorAll('.authCard small').forEach(el=>{if(el.textContent?.includes('v7'))el.textContent=el.textContent.replace('v7','v8')});
}

applyV8Marker();
const observer=new MutationObserver(applyV8Marker);
observer.observe(document.getElementById('root'),{childList:true,subtree:true});
