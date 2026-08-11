import './branding-v27.css';

document.documentElement.classList.remove('coreopsV22');
document.documentElement.classList.add('coreopsV27');
document.title='Core Ops Workflow';

function applyGroups(nav){
  if(!nav)return;
  let current=null;
  [...nav.children].forEach(el=>{
    if(el.tagName==='H4'){current=el;return}
    if(el.tagName==='BUTTON'&&current)el.classList.toggle('compactHidden',!current.classList.contains('menuOpen'));
  });
}

function setupCompactMenu(nav){
  if(!nav||nav.dataset.compactMenu==='27')return;
  nav.dataset.compactMenu='27';
  const headings=[...nav.querySelectorAll('h4')];
  headings.forEach((heading,index)=>{
    heading.setAttribute('role','button');
    heading.tabIndex=0;
    const raw=(heading.textContent||'').trim();
    heading.dataset.menuGroup=raw.toLowerCase().replace(/\s+/g,'-');
    const toggle=()=>{
      const open=heading.classList.contains('menuOpen');
      headings.forEach(h=>h.classList.remove('menuOpen'));
      if(!open)heading.classList.add('menuOpen');
      applyGroups(nav);
    };
    heading.addEventListener('click',toggle);
    heading.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
    if(index===0)heading.classList.add('menuOpen');
  });
  applyGroups(nav);
  const observer=new MutationObserver(()=>applyGroups(nav));
  observer.observe(nav,{childList:true});
}

function bootNavigation(){const nav=document.querySelector('.app aside nav');if(nav){setupCompactMenu(nav);return true}return false}
if(!bootNavigation()){
  const root=document.getElementById('root');
  if(root){const observer=new MutationObserver(()=>{if(bootNavigation())observer.disconnect()});observer.observe(root,{childList:true,subtree:true})}
}
window.addEventListener('coreops:language-changed',()=>{const nav=document.querySelector('.app aside nav');if(!nav)return;nav.dataset.compactMenu='';setupCompactMenu(nav)});
