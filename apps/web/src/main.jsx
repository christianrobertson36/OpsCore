import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = `${window.location.protocol}//${window.location.hostname}:5058/api`;
const navGroups = [
  ['Service', ['Incidents','Requests','Problems','Changes','Knowledge']],
  ['Infrastructure', ['Sites','Server Rooms','Racks','Equipment']],
  ['Compliance', ['Audits','Inspections','Evidence']],
  ['Platform', ['Assets / CMDB','Reporting','Administration']]
];

function Badge({children, tone='blue'}) { return <span className={`badge ${tone}`}>{children}</span>; }

function App(){
  const [page,setPage] = useState('Dashboard');
  const [incidents,setIncidents] = useState([]);
  const [requests,setRequests] = useState([]);
  const [assets,setAssets] = useState([]);
  const [dashboard,setDashboard] = useState({incidents:0,requests:0,assets:0,slaBreaches:0});
  const [search,setSearch] = useState('');
  const [incidentModal,setIncidentModal] = useState(false);
  const [assetModal,setAssetModal] = useState(false);
  const [toast,setToast] = useState('');
  const [loading,setLoading] = useState(true);
  const [apiState,setApiState] = useState('Connecting');

  const notify = text => { setToast(text); window.setTimeout(()=>setToast(''),2200); };
  const json = async (path, options={}) => {
    const response = await fetch(`${API}${path}`, { headers:{'Content-Type':'application/json',...(options.headers||{})}, ...options });
    if(!response.ok) throw new Error((await response.json().catch(()=>({}))).error || `HTTP ${response.status}`);
    return response.json();
  };

  async function refresh(){
    try{
      setLoading(true);
      const [d,i,r,a] = await Promise.all([json('/dashboard'),json('/incidents'),json('/requests'),json('/assets')]);
      setDashboard(d); setIncidents(i); setRequests(r); setAssets(a); setApiState('Healthy');
    }catch(error){ setApiState('Unavailable'); notify(`API error: ${error.message}`); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ refresh(); },[]);

  const filteredIncidents = useMemo(() => incidents.filter(i => `${i.id} ${i.title} ${i.assignmentGroup} ${i.asset}`.toLowerCase().includes(search.toLowerCase())), [incidents,search]);

  async function createIncident(e){
    e.preventDefault(); const f=new FormData(e.currentTarget);
    try{
      await json('/incidents',{method:'POST',body:JSON.stringify({title:f.get('title'),description:f.get('description'),priority:f.get('priority'),assignmentGroup:f.get('group'),caller:f.get('caller')||'Portal User',asset:f.get('asset')||'Unassigned'})});
      setIncidentModal(false); setPage('Incidents'); await refresh(); notify('Incident created and saved');
    }catch(error){ notify(error.message); }
  }

  async function createAsset(e){
    e.preventDefault(); const f=new FormData(e.currentTarget);
    try{
      await json('/assets',{method:'POST',body:JSON.stringify({name:f.get('name'),type:f.get('type'),site:f.get('site'),owner:f.get('owner'),serialNumber:f.get('serialNumber'),model:f.get('model')})});
      setAssetModal(false); setPage('Assets / CMDB'); await refresh(); notify('Asset created and saved');
    }catch(error){ notify(error.message); }
  }

  async function closeIncident(id){
    try{ await json(`/incidents/${id}`,{method:'PATCH',body:JSON.stringify({status:'Closed'})}); await refresh(); notify(`${id} closed`); }
    catch(error){ notify(error.message); }
  }

  function Dashboard(){
    const cards=[['Open Incidents',dashboard.incidents,'Incidents'],['Service Requests',dashboard.requests,'Requests'],['Managed Assets',dashboard.assets,'Assets / CMDB'],['SLA Breaches',dashboard.slaBreaches,'Reporting']];
    return <>
      <section className="cards">{cards.map(([t,v,target])=><button className="card" key={t} onClick={()=>setPage(target)}><span>{t}</span><strong>{loading?'…':v}</strong><small>Open workspace →</small></button>)}</section>
      <section className="modules">
        <button className="module service" onClick={()=>setPage('Incidents')}><div className="moduleIcon">S</div><div><h3>OpsCore Service</h3><p>Database-backed incidents, requests and service operations.</p><Badge tone="green">Live</Badge></div></button>
        <button className="module infra" onClick={()=>setPage('Server Rooms')}><div className="moduleIcon">I</div><div><h3>OpsCore Infrastructure</h3><p>Server Room Manager integration boundary and shared CMDB.</p><Badge>Integration ready</Badge></div></button>
        <button className="module compliance" onClick={()=>setPage('Inspections')}><div className="moduleIcon">C</div><div><h3>OpsCore Compliance</h3><p>DCAM integration boundary for audits, inspections and evidence.</p><Badge tone="purple">Integration ready</Badge></div></button>
      </section>
      <section className="grid2">
        <div className="panel"><div className="panelHead"><div><h2>Priority incidents</h2><p>Live from PostgreSQL</p></div><button className="linkBtn" onClick={()=>setPage('Incidents')}>View all</button></div>{incidents.slice(0,4).map(i=><div className="row" key={i.id}><span className="mono">{i.id}</span><strong>{i.title}</strong><Badge tone={i.priority==='P1'?'red':i.priority==='P2'?'amber':'blue'}>{i.priority}</Badge><span>{i.assignmentGroup}</span></div>)}</div>
        <div className="panel"><div className="panelHead"><div><h2>Platform health</h2><p>OpsCore shared services</p></div></div><div className="health"><span><i className={apiState==='Healthy'?'ok':'warn'}/>API</span><b>{apiState}</b></div><div className="health"><span><i className="ok"/>Database</span><b>PostgreSQL</b></div><div className="health"><span><i className="ok"/>Web workspace</span><b>v3</b></div><div className="health"><span><i className="warn"/>Identity / SSO</span><b>Next foundation</b></div></div>
      </section>
    </>;
  }

  function Incidents(){ return <section className="panel"><div className="toolbar"><div><h2>Incidents</h2><p>Persistent Service Management records.</p></div><div className="toolbarActions"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search incidents"/><button className="primary" onClick={()=>setIncidentModal(true)}>+ New incident</button></div></div><div className="table"><div className="thead"><span>Number</span><span>Summary</span><span>Priority</span><span>Status</span><span>Assignment group</span><span>Action</span></div>{filteredIncidents.map(i=><div className="trow" key={i.id}><span className="mono">{i.id}</span><strong>{i.title}</strong><span><Badge tone={i.priority==='P1'?'red':i.priority==='P2'?'amber':'blue'}>{i.priority}</Badge></span><span>{i.status}</span><span>{i.assignmentGroup}</span><span>{i.status!=='Closed'?<button className="miniBtn" onClick={()=>closeIncident(i.id)}>Close</button>:<Badge tone="green">Closed</Badge>}</span></div>)}</div></section>; }
  function Requests(){ return <section className="panel"><div className="panelHead"><div><h2>Service requests</h2><p>Persistent request records.</p></div></div>{requests.map(r=><div className="row request" key={r.id}><span className="mono">{r.id}</span><strong>{r.title}</strong><span>{r.requestedFor}</span><Badge>{r.status}</Badge></div>)}</section>; }
  function Assets(){ return <section className="panel"><div className="panelHead"><div><h2>Assets / CMDB</h2><p>Shared configuration items across all OpsCore modules.</p></div><button className="primary" onClick={()=>setAssetModal(true)}>+ Add asset</button></div><div className="table assets"><div className="thead"><span>ID</span><span>Configuration item</span><span>Type</span><span>Site</span><span>Owner</span><span>State</span></div>{assets.map(a=><div className="trow" key={a.id}><span className="mono">{a.id}</span><strong>{a.name}</strong><span>{a.type}</span><span>{a.site}</span><span>{a.owner}</span><span><Badge tone="green">{a.state}</Badge></span></div>)}</div></section>; }
  function Integration({type}){ const infra=type==='Infrastructure'; return <section className="panel heroPanel"><Badge tone={infra?'blue':'purple'}>{infra?'OpsCore Infrastructure':'OpsCore Compliance'}</Badge><h2>{page}</h2><p>{infra?'Server Room Manager will connect here using the shared OpsCore asset and site IDs.':'DCAM will connect here using the same organisations, sites, assets and audit identities.'}</p><div className="integrationMap"><div>OpsCore Core</div><span>→</span><div>{infra?'Server Room Manager':'DCAM'}</div><span>→</span><div>Shared CMDB</div></div></section>; }
  function Generic(){ return <section className="panel empty"><div className="emptyIcon">◇</div><h2>{page}</h2><p>This workspace is wired into OpsCore navigation and ready for the next functional module.</p><button className="secondary" onClick={()=>setPage('Dashboard')}>Back to dashboard</button></section>; }
  function Current(){ if(page==='Dashboard')return <Dashboard/>; if(page==='Incidents')return <Incidents/>; if(page==='Requests')return <Requests/>; if(page==='Assets / CMDB')return <Assets/>; if(['Sites','Server Rooms','Racks','Equipment'].includes(page))return <Integration type="Infrastructure"/>; if(['Audits','Inspections','Evidence'].includes(page))return <Integration type="Compliance"/>; return <Generic/>; }

  return <div className="app">
    <aside><div className="logoRow"><div className="logoMark">O</div><div><div className="brand">OpsCore</div><div className="sub">Enterprise Operations</div></div></div><nav><button className={page==='Dashboard'?'active':''} onClick={()=>setPage('Dashboard')}>⌂ <span>Dashboard</span></button>{navGroups.map(([group,items])=><React.Fragment key={group}><h4>{group}</h4>{items.map(item=><button key={item} className={page===item?'active':''} onClick={()=>setPage(item)}><span>{item}</span></button>)}</React.Fragment>)}</nav><div className="asideFooter"><div className="avatar">PA</div><div><strong>Platform Admin</strong><span>OpsCore v3</span></div></div></aside>
    <main><header><div><div className="eyebrow">OpsCore / {page}</div><h1>{page==='Dashboard'?'Operations Dashboard':page}</h1><p>{page==='Dashboard'?'Service, infrastructure and compliance in one workspace.':`OpsCore ${page} workspace`}</p></div><div className="headActions"><button className="iconBtn" onClick={refresh}>↻</button><span className="pill">v3</span></div></header><Current/></main>
    {incidentModal&&<div className="modalBack" onMouseDown={()=>setIncidentModal(false)}><form className="modal" onSubmit={createIncident} onMouseDown={e=>e.stopPropagation()}><div className="panelHead"><div><h2>New incident</h2><p>Saved directly to OpsCore PostgreSQL.</p></div><button type="button" className="close" onClick={()=>setIncidentModal(false)}>×</button></div><label>Summary<input name="title" required autoFocus/></label><label>Description<input name="description" placeholder="Additional details"/></label><div className="formGrid"><label>Priority<select name="priority"><option>P3</option><option>P4</option><option>P2</option><option>P1</option></select></label><label>Assignment group<select name="group"><option>Service Desk</option><option>Deskside</option><option>Infrastructure</option><option>Networks</option></select></label></div><div className="formGrid"><label>Caller<input name="caller"/></label><label>Asset / CI<input name="asset"/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>setIncidentModal(false)}>Cancel</button><button className="primary">Create incident</button></div></form></div>}
    {assetModal&&<div className="modalBack" onMouseDown={()=>setAssetModal(false)}><form className="modal" onSubmit={createAsset} onMouseDown={e=>e.stopPropagation()}><div className="panelHead"><div><h2>New asset</h2><p>Create a shared CMDB record.</p></div><button type="button" className="close" onClick={()=>setAssetModal(false)}>×</button></div><div className="formGrid"><label>Name<input name="name" required autoFocus/></label><label>Type<select name="type"><option>Server</option><option>Laptop</option><option>Network Switch</option><option>Printer</option><option>UPS</option><option>Other</option></select></label></div><div className="formGrid"><label>Site<input name="site"/></label><label>Owner<input name="owner"/></label></div><div className="formGrid"><label>Serial number<input name="serialNumber"/></label><label>Model<input name="model"/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>setAssetModal(false)}>Cancel</button><button className="primary">Create asset</button></div></form></div>}
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
