(()=>{
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmt=v=>v?new Date(v).toLocaleString('en-GB'):'—';
  const date=v=>v?new Date(v).toLocaleDateString('en-GB'):'—';
  let cache={customers:[],licences:[],installations:[],audit:[]};

  async function api(path,options={}){
    const r=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const b=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);
    return b;
  }

  async function refreshCache(){
    try{
      const [customers,licences,installations,audit]=await Promise.all([
        api('/api/admin/customers'),api('/api/admin/licences'),api('/api/admin/installations'),api('/api/admin/audit')
      ]);
      cache={customers,licences,installations,audit};
      decorate();
    }catch{}
  }

  function toast(msg){
    const root=q('#toastRoot'); if(!root)return;
    const el=document.createElement('div');el.className='toast';el.textContent=msg;root.appendChild(el);setTimeout(()=>el.remove(),2400);
  }

  function close(){const r=q('#modalRoot');if(r)r.innerHTML=''}
  function open(html){const r=q('#modalRoot');if(r){r.innerHTML=html;r.querySelectorAll('[data-v6-close]').forEach(b=>b.onclick=close)}}
  const status=v=>`<span class="status ${esc(v)}">${esc(v)}</span>`;

  function customerDetail(id){
    const c=cache.customers.find(x=>String(x.id)===String(id)); if(!c)return;
    const licences=cache.licences.filter(l=>String(l.customer_id)===String(c.id));
    const licenceIds=new Set(licences.map(l=>String(l.id)));
    const installs=cache.installations.filter(i=>licenceIds.has(String(i.licence_id)));
    open(`<div class="modalBack"><section class="modal v6detail">
      <div class="modalHead"><div class="v6title"><div><h2>${esc(c.name)}</h2><p>${esc(c.customer_code)} · ${esc(c.contact_email||'No contact email')}</p></div>${status(c.status)}</div></div>
      <div class="modalBody">
        <div class="v6stats"><div><span>Licences</span><b>${licences.length}</b></div><div><span>Installations</span><b>${installs.length}</b></div><div><span>Updated</span><b class="smallValue">${date(c.updated_at)}</b></div></div>
        <div class="v6section"><h3>Notes</h3><p>${esc(c.notes||'No customer notes.')}</p></div>
        <div class="v6section"><h3>Licences</h3>${licences.length?licences.map(l=>`<button class="v6row" data-v6-licence="${l.id}"><span><strong>${esc(l.plan_name)}</strong><small>${esc(l.licence_key)}</small></span><span>${status(l.status)}</span></button>`).join(''):'<div class="empty">No licences for this customer.</div>'}</div>
        <div class="v6section"><h3>Installations</h3>${installs.length?installs.map(i=>`<div class="v6row static"><span><strong>${esc(i.installation_id)}</strong><small>${esc(i.hostname||'Unknown host')} · ${esc(i.app_version||'—')}</small></span><span><small>Last seen</small><strong>${fmt(i.last_seen_at)}</strong></span></div>`).join(''):'<div class="empty">No installations registered.</div>'}</div>
      </div><div class="modalActions"><button class="secondary" data-v6-close>Close</button></div>
    </section></div>`);
    qa('[data-v6-licence]').forEach(b=>b.onclick=()=>licenceDetail(b.dataset.v6Licence));
  }

  function licenceDetail(id){
    const l=cache.licences.find(x=>String(x.id)===String(id)); if(!l)return;
    const installs=cache.installations.filter(i=>String(i.licence_id)===String(l.id));
    const audit=cache.audit.filter(a=>String(a.licence_id)===String(l.id)).slice(0,10);
    const e=l.entitlements||{};
    const usage=installs.reduce((a,i)=>{const u=i?.metadata?.usage||i?.metadata?.metadata?.usage||{};a.users=Math.max(a.users,Number(u.users||0));a.sites=Math.max(a.sites,Number(u.sites||0));a.assets=Math.max(a.assets,Number(u.assets||0));return a},{users:0,sites:0,assets:0});
    const action=l.status==='Active'?'<button class="danger" data-v6-action="Suspended">Suspend licence</button>':'<button class="primary" data-v6-action="Active">Reactivate</button>';
    open(`<div class="modalBack"><section class="modal v6detail">
      <div class="modalHead"><div class="v6title"><div><h2>${esc(l.plan_name)}</h2><p>${esc(l.customer_name)} · <span class="mono">${esc(l.licence_key)}</span></p></div>${status(l.status)}</div></div>
      <div class="modalBody">
        <div class="v6stats"><div><span>Type</span><b>${esc(l.licence_type)}</b></div><div><span>Installations</span><b>${installs.length}</b></div><div><span>Trial end</span><b class="smallValue">${date(l.trial_ends_at)}</b></div><div><span>Expiry</span><b class="smallValue">${date(l.expires_at)}</b></div></div>
        <div class="v6section"><h3>Product entitlements</h3><div class="v6chips"><span class="${e.OPSCORE?'on':'off'}">Core Ops Workflow</span><span class="${e.DCAM?'on':'off'}">DCAM</span><span class="${e.SERVER_MANAGER?'on':'off'}">Server Manager</span></div></div>
        <div class="v6section"><h3>Limits & current reported usage</h3><div class="v6limits"><div><span>Users</span><b>${usage.users} / ${l.max_users}</b></div><div><span>Sites</span><b>${usage.sites} / ${l.max_sites}</b></div><div><span>Assets</span><b>${usage.assets} / ${l.max_assets}</b></div></div></div>
        <div class="v6section"><h3>Recent installations</h3>${installs.length?installs.map(i=>`<div class="v6row static"><span><strong>${esc(i.installation_id)}</strong><small>${esc(i.hostname||'Unknown host')} · ${esc(i.app_version||'—')}</small></span><span><small>Last seen</small><strong>${fmt(i.last_seen_at)}</strong></span></div>`).join(''):'<div class="empty">No installations registered.</div>'}</div>
        <div class="v6section"><h3>Recent audit</h3>${audit.length?audit.map(a=>`<div class="v6audit"><span>${fmt(a.created_at)}</span><strong>${esc(a.action)}</strong><p>${esc(a.detail||'')}</p></div>`).join(''):'<div class="empty">No audit entries yet.</div>'}</div>
      </div>
      <div class="modalActions"><button class="secondary" data-v6-close>Close</button>${action}${l.status!=='Revoked'?'<button class="danger v6revoke" data-v6-action="Revoked">Revoke</button>':''}</div>
    </section></div>`);
    qa('[data-v6-action]').forEach(b=>b.onclick=async()=>{
      const next=b.dataset.v6Action;
      const verb=next==='Revoked'?'revoke':next==='Suspended'?'suspend':'reactivate';
      if(!confirm(`Are you sure you want to ${verb} this licence?`))return;
      try{
        await api(`/api/admin/licences/${l.id}`,{method:'PATCH',body:JSON.stringify({status:next})});
        toast(`Licence ${next.toLowerCase()}`);close();await refreshCache();q('#refreshBtn')?.click();
      }catch(err){toast(err.message)}
    });
  }

  function decorate(){
    qa('[data-editcustomer]').forEach(edit=>{
      if(edit.parentElement?.querySelector('[data-v6-customer]'))return;
      const b=document.createElement('button');b.className='ghost';b.textContent='Details';b.dataset.v6Customer=edit.dataset.editcustomer;b.onclick=()=>customerDetail(b.dataset.v6Customer);edit.before(b);
    });
    qa('[data-editlicence]').forEach(edit=>{
      if(edit.parentElement?.querySelector('[data-v6-licence-detail]'))return;
      const b=document.createElement('button');b.className='ghost';b.textContent='Details';b.dataset.v6LicenceDetail=edit.dataset.editlicence;b.onclick=()=>licenceDetail(b.dataset.v6LicenceDetail);edit.before(b);
    });
  }

  const observer=new MutationObserver(()=>decorate());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('#refreshBtn'))setTimeout(refreshCache,250)});
  window.addEventListener('load',()=>setTimeout(refreshCache,350));
})();
