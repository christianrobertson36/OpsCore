const VERSION_FALLBACK={api:'v44',web:'v65'};

async function loadRuntimeVersions(){
  let versions=VERSION_FALLBACK;
  try{
    const response=await fetch('/health',{cache:'no-store'});
    const body=await response.json();
    versions={api:body.apiVersion||VERSION_FALLBACK.api,web:body.webVersion||body.version||VERSION_FALLBACK.web};
  }catch{}
  document.documentElement.dataset.apiVersion=versions.api;
  document.documentElement.dataset.webVersion=versions.web;
  document.querySelectorAll('.headActions .pill').forEach(node=>{if(node.textContent!==versions.web)node.textContent=versions.web});
  document.querySelectorAll('.asideFooter span').forEach(node=>{
    const role=(node.textContent||'').split('·')[0].trim();
    const value=`${role} · ${versions.web}`;if(node.textContent!==value)node.textContent=value;
  });
  document.querySelectorAll('.authCard small').forEach(node=>{const value=`Core Ops Workflow ${versions.web} · Protected workspace`;if(node.textContent!==value)node.textContent=value});
  window.CoreOpsVersions=versions;
  window.dispatchEvent(new CustomEvent('coreops:versions-ready',{detail:versions}));
}

let versionTimer;
const versionObserver=new MutationObserver(()=>{clearTimeout(versionTimer);versionTimer=setTimeout(loadRuntimeVersions,100)});
versionObserver.observe(document.getElementById('root'),{childList:true,subtree:true});
loadRuntimeVersions();
