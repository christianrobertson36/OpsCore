import './branding-safe-v11.css';

document.documentElement.classList.add('coreopsSafe');
document.title='Core Ops Workflow';

function setupCompactMenu(){
  const nav=document.querySelector('.app aside nav');
  if(!nav||nav.dataset.compactMenu==='1')return;
  nav.dataset.compactMenu='1';
  const headings=[...nav.querySelectorAll('h4')];
  headings.forEach((heading,index)=>{
    heading.setAttribute('role','button');
    heading.tabIndex=0;
    const key=(heading.textContent||'').trim().toLowerCase().replace(/\s+/g,'-');
    heading.dataset.menuGroup=key;
    const toggle=()=>{
      const open=heading.classList.contains('menuOpen');
      headings.forEach(h=>h.classList.remove('menuOpen'));
      if(!open)heading.classList.add('menuOpen');
      applyGroups();
    };
    heading.addEventListener('click',toggle);
    heading.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
    if(index===0)heading.classList.add('menuOpen');
  });
  applyGroups();
}

function applyGroups(){
  const nav=document.querySelector('.app aside nav');if(!nav)return;
  let current=null;
  [...nav.children].forEach(el=>{
    if(el.tagName==='H4'){current=el;return}
    if(el.tagName==='BUTTON'&&current){el.classList.toggle('compactHidden',!current.classList.contains('menuOpen'))}
  });
}

function tick(){setupCompactMenu();applyGroups()}
setInterval(tick,1000);
tick();
