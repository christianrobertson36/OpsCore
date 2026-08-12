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
  const prepare=()=>{
   const headings=[...nav.querySelectorAll('h4')];
   headings.forEach((heading,index)=>{
    heading.setAttribute('role','button');
    heading.tabIndex=0;
    const raw=(heading.textContent||'').trim();
    heading.dataset.menuGroup=raw.toLowerCase().replace(/\s+/g,'-');
    if(index===0&&!headings.some(h=>h.classList.contains('menuOpen')))heading.classList.add('menuOpen');
   });
   applyGroups(nav);
  };
  const toggle=heading=>{
    const open=heading.classList.contains('menuOpen');
    nav.querySelectorAll('h4').forEach(h=>h.classList.remove('menuOpen'));
    if(!open)heading.classList.add('menuOpen');
    applyGroups(nav);
  };
  nav.addEventListener('click',event=>{const heading=event.target.closest('h4');if(heading&&nav.contains(heading))toggle(heading)});
  nav.addEventListener('keydown',event=>{const heading=event.target.closest('h4');if(heading&&(event.key==='Enter'||event.key===' ')){event.preventDefault();toggle(heading)}});
  prepare();
  const observer=new MutationObserver(prepare);
  observer.observe(nav,{childList:true});
}

function bootNavigation(){const nav=document.querySelector('.app aside nav');if(nav){setupCompactMenu(nav);return true}return false}
if(!bootNavigation()){
  const root=document.getElementById('root');
  if(root){const observer=new MutationObserver(()=>{if(bootNavigation())observer.disconnect()});observer.observe(root,{childList:true,subtree:true})}
}
window.addEventListener('coreops:language-changed',()=>{const nav=document.querySelector('.app aside nav');if(nav)applyGroups(nav)});
