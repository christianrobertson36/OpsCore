import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const ROOT = `${window.location.protocol}//${window.location.hostname}:5058`;
const API = `${ROOT}/api`;
const navGroups = [
  ['Service', ['Incidents','Requests','Problems','Changes','Knowledge']],
  ['Infrastructure', ['Sites','Server Rooms','Racks','Equipment']],
  ['Compliance', ['Audits','Inspections','Evidence']],
  ['Platform', ['Assets / CMDB','Reporting','Administration']]
];
const roles=['Administrator','Service Desk','Engineer','Infrastructure','Auditor','Read Only'];

function Badge({children, tone='blue'}) { return <span className={`badge ${tone}`}>{children}</span>; }

function App(){
  const [token,setToken]=useState(()=>localStorage.getItem('opscore_token')||'');
  const [user,setUser]=useState(null);
  const [authChecking,setAuthChecking]=useState(Boolean(token));
  const [loginError,setLoginError]=useState('');
  const [page,setPage]=useState('Dashboard');
  const [incidents,setIncidents]=useState([]);
  const [requests,setRequests]=useState([]);
  const [assets,setAssets]=useState([]);
  const [users,setUsers]=useState([]);
  const [dashboard,setDashboard]=useState({incidents:0,requests:0,assets:0,users:0,slaBreaches:0});
  const [search,setSearch]=useState('');
  const [incidentModal,setIncidentModal]=useState(false);
  const [assetModal,setAssetModal]=useState(false);
  const [userModal,setUserModal]=useState(false);
  const [toast,setToast]=useState('');
  const [loading,setLoading]=useState(false);
  const [apiState,setApiState]=useState('Connecting');

  const notify=text=>{setToast(text);window.setTimeout(()=>setToast(''),2400);};
  const canWriteIncidents=['Administrator','Service Desk','Engineer','Infrastructure'].includes(user?.role);
  const canWriteAssets=['Administrator','Engineer','Infrastructure'].includes(user?.role);
  const isAdmin=user?.role==='Administrator';

  async function request(url,options={}){
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    if(token) headers.Authorization=`Bearer ${token}`;
    const response=await fetch(url,{...options,headers});
    const body=await response.json().catch(()=>({}));
    if(response.status===401 && token){ logout(false); throw new Error('Session expired'); }
    if(!response.ok) throw new Error(body.error||`HTTP ${response.status}`);
    return body;
  }
  const json=(path,options={})=>request(`${API}${path}`,options);

  function logout(show=true){ localStorage.removeItem('opscore_token'); setToken(''); setUser(null); setUsers([]); if(show) notify('Signed out'); }

  async function login(e){
    e.preventDefault(); setLoginError('');
    const f=new FormData(e.currentTarget);
    try{
      const data=await request(`${ROOT}/auth/login`,{method:'POST',body:JSON.stringify({email:f.get('email'),password:f.get('password')})});
      localStorage.setItem('opscore_token',data.token); setToken(data.token); setUser(data.user); setPage('Dashboard');
    }catch(error){setLoginError(error.message);}
  }

  useEffect(()=>{
    if(!token){setAuthChecking(false);return;}
    (async()=>{try{const data=await request(`${ROOT}/auth/me`);setUser(data.user);}catch{}finally{setAuthChecking(false);}})();
  },[token]);

  async function refresh(){
    if(!token||!user)return;
    try{
      setLoading(true);
      const [d,i,r,a]=await Promise.all([json('/dashboard'),json('/incidents'),json('/requests'),json('/assets')]);
      setDashboard(d);setIncidents(i);setRequests(r);setAssets(a);setApiState('Healthy');
      if(isAdmin){ try{setUsers(await json('/users'));}catch{} }
    }catch(error){setApiState('Unavailable');notify(error.message);}finally{setLoading(false);}
  }
  useEffect(()=>{if(user)refresh();},[user]);

  const filteredIncidents=useMemo(()=>incidents.filter(i=>`${i.id} ${i.title} ${i.assignmentGroup} ${i.asset}`.toLowerCase().includes(search.toLowerCase())),[incidents,search]);

  async function createIncident(e){e.preventDefault();const f=new FormData(e.currentTarget);try{await json('/incidents',{method:'POST',body:JSON.stringify({title:f.get('title'),description:f.get('description'),priority:f.get('priority'),assignmentGroup:f.get('group'),caller:f.get('caller')||user.name,asset:f.get('asset')||'Unassigned'})});setIncidentModal(false);setPage('Incidents');await refresh();notify('Incident created');}catch(error){notify(error.message);}}
  async function createAsset(e){e.preventDefault();const f=new FormData(e.currentTarget);try{await json('/assets',{method:'POST',body:JSON.stringify({name:f.get('name'),type:f.get('type'),site:f.get('site'),owner:f.get('owner'),serialNumber:f.get('serialNumber'),model:f.get('model')})});setAssetModal(false);setPage('Assets / CMDB');await refresh();notify('Asset created');}catch(error){notify(error.message);}}
  async function createUser(e){e.preventDefault();const f=new FormData(e.currentTarget);try{await json('/users',{method:'POST',body:JSON.stringify({name:f.get('name'),email:f.get('email'),role:f.get('role'),password:f.get('password')})});setUserModal(false);await refresh();notify('User created');}catch(error){notify(error.message);}}
  async function closeIncident(id){try{await json(`/incidents/${id}`,{method:'PATCH',body:JSON.stringify({status:'Closed'})});await refresh();notify(`${id} closed`);}catch(error){notify(error.message);}}

  if(authChecking) return <div className="authScreen"><div className="authCard"><div className="logoMark big">O</div><h1>OpsCore</h1><p>Checking secure session…</p></div></div>;
  if(!token||!user) return <div className="authScreen"><form className="authCard" onSubmit={login}><div className="logoMark big">O</div><div><h1>OpsCore</h1><p>Enterprise Operations Platform</p></div><label>Email<input name="email" type="email" required autoFocus placeholder="admin@opscore.local"/></label><label>Password<input name="password" type="password" required/></label>{loginError&&<div className="authError">{loginError}</div>}<button className="primary authButton">Sign in</button><small>OpsCore v4 · Protected workspace</small></form></div>;

  function Dashboard(){const cards=[['Open Incidents',dashboard.incidents,'Incidents'],['Service Requests',dashboard.requests,'Requests'],['Managed Assets',dashboard.assets,'Assets / CMDB'],['Active Users',dashboard.users,'Administration']];return <><section className="cards">{cards.map(([t,v,target])=><button className="card" key={t} onClick={()=>setPage(target)}><span>{t}</span><strong>{loading?'…':v}</strong><small>Open workspace →</small></button>)}</section><section className="modules"><button className="module service" onClick={()=>setPage('Incidents')}><div className="moduleIcon">S</div><div><h3>OpsCore Service</h3><p>Secure incidents, requests and operational workflows.</p><Badge tone="green">Live</Badge></div></button><button className="module infra" onClick={()=>setPage('Server Rooms')}><div className="moduleIcon">I</div><div><h3>OpsCore Infrastructure</h3><p>Server Room Manager integration with shared identities and CMDB.</p><Badge>Integration ready</Badge></div></button><button className="module compliance" onClick={()=>setPage('Inspections')}><div className="moduleIcon">C</div><div><h3>OpsCore Compliance</h3><p>DCAM integration with shared permissions and assets.</p><Badge tone="purple">Integration ready</Badge></div></button></section><section className="grid2"><div className="panel"><div className="panelHead"><div><h2>Priority incidents</h2><p>Live from PostgreSQL</p></div><button className="linkBtn" onClick={()=>setPage('Incidents')}>View all</button></div>{incidents.slice(0,4).map(i=><div className="row" key={i.id}><span className="mono">{i.id}</span><strong>{i.title}</strong><Badge tone={i.priority==='P1'?'red':i.priority==='P2'?'amber':'blue'}>{i.priority}</Badge><span>{i.assignmentGroup}</span></div>)}</div><div className="panel"><div className="panelHead"><div><h2>Platform security</h2><p>Identity foundation</p></div></div><div className="health"><span><i className="ok"/>Authenticated session</span><b>{user.role}</b></div><div className="health"><span><i className={apiState==='Healthy'?'ok':'warn'}/>API</span><b>{apiState}</b></div><div className="health"><span><i className="ok"/>Database</span><b>PostgreSQL</b></div><div className="health"><span><i className="ok"/>Access control</span><b>Enabled</b></div></div></section></>}
  function Incidents(){return <section className="panel"><div className="toolbar"><div><h2>Incidents</h2><p>Role-protected Service Management records.</p></div><div className="toolbarActions"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search incidents"/>{canWriteIncidents&&<button className="primary" onClick={()=>setIncidentModal(true)}>+ New incident</button>}</div></div><div className="table"><div className="thead"><span>Number</span><span>Summary</span><span>Priority</span><span>Status</span><span>Assignment group</span><span>Action</span></div>{filteredIncidents.map(i=><div className="trow" key={i.id}><span className="mono">{i.id}</span><strong>{i.title}</strong><span><Badge tone={i.priority==='P1'?'red':i.priority==='P2'?'amber':'blue'}>{i.priority}</Badge></span><span>{i.status}</span><span>{i.assignmentGroup}</span><span>{canWriteIncidents&&i.status!=='Closed'?<button className="miniBtn" onClick={()=>closeIncident(i.id)}>Close</button>:<Badge tone={i.status==='Closed'?'green':'blue'}>{i.status}</Badge>}</span></div>)}</div></section>}
  function Requests(){return <section className="panel"><div className="panelHead"><div><h2>Service requests</h2><p>Shared request queue.</p></div></div>{requests.map(r=><div className="row request" key={r.id}><span className="mono">{r.id}</span><strong>{r.title}</strong><span>{r.requestedFor}</span><Badge>{r.status}</Badge></div>)}</section>}
  function Assets(){return <section className="panel"><div className="panelHead"><div><h2>Assets / CMDB</h2><p>Shared configuration items across all OpsCore modules.</p></div>{canWriteAssets&&<button className="primary" onClick={()=>setAssetModal(true)}>+ Add asset</button>}</div><div className="table assets"><div className="thead"><span>ID</span><span>Configuration item</span><span>Type</span><span>Site</span><span>Owner</span><span>State</span></div>{assets.map(a=><div className="trow" key={a.id}><span className="mono">{a.id}</span><strong>{a.name}</strong><span>{a.type}</span><span>{a.site}</span><span>{a.owner}</span><span><Badge tone="green">{a.state}</Badge></span></div>)}</div></section>}
  function Administration(){if(!isAdmin)return <section className="panel empty"><div className="emptyIcon">🔒</div><h2>Administration</h2><p>Your role does not have platform administration permission.</p></section>;return <section className="panel"><div className="panelHead"><div><h2>Users & access</h2><p>Manage local OpsCore accounts and roles.</p></div><button className="primary" onClick={()=>setUserModal(true)}>+ Add user</button></div><div className="table usersTable"><div className="thead"><span>Name</span><span>Email</span><span>Role</span><span>Status</span><span>Last login</span><span>Access</span></div>{users.map(u=><div className="trow" key={u.id}><strong>{u.name}</strong><span>{u.email}</span><span><Badge>{u.role}</Badge></span><span>{u.active?'Active':'Disabled'}</span><span>{u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString():'Never'}</span><span>{u.active?'Allowed':'Blocked'}</span></div>)}</div></section>}
  function Integration({type}){const infra=type==='Infrastructure';return <section className="panel heroPanel"><Badge tone={infra?'blue':'purple'}>{infra?'OpsCore Infrastructure':'OpsCore Compliance'}</Badge><h2>{page}</h2><p>{infra?'Server Room Manager will connect through the shared OpsCore identity, asset and site model.':'DCAM will connect through the same users, roles, sites, assets and audit identity.'}</p><div className="integrationMap"><div>OpsCore Identity</div><span>→</span><div>{infra?'Server Room Manager':'DCAM'}</div><span>→</span><div>Shared CMDB</div></div></section>}
  function Generic(){return <section className="panel empty"><div className="emptyIcon">◇</div><h2>{page}</h2><p>This workspace is wired into OpsCore navigation and ready for its next functional module.</p><button className="secondary" onClick={()=>setPage('Dashboard')}>Back to dashboard</button></section>}
  function Current(){if(page==='Dashboard')return <Dashboard/>;if(page==='Incidents')return <Incidents/>;if(page==='Requests')return <Requests/>;if(page==='Assets / CMDB')return <Assets/>;if(page==='Administration')return <Administration/>;if(['Sites','Server Rooms','Racks','Equipment'].includes(page))return <Integration type="Infrastructure"/>;if(['Audits','Inspections','Evidence'].includes(page))return <Integration type="Compliance"/>;return <Generic/>}

  return <div className="app"><aside><div className="logoRow"><div className="logoMark">O</div><div><div className="brand">OpsCore</div><div className="sub">Enterprise Operations</div></div></div><nav><button className={page==='Dashboard'?'active':''} onClick={()=>setPage('Dashboard')}>⌂ <span>Dashboard</span></button>{navGroups.map(([group,items])=><React.Fragment key={group}><h4>{group}</h4>{items.map(item=><button key={item} className={page===item?'active':''} onClick={()=>setPage(item)}><span>{item}</span></button>)}</React.Fragment>)}</nav><div className="asideFooter"><div className="avatar">{user.name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}</div><div><strong>{user.name}</strong><span>{user.role} · v4</span></div></div></aside><main><header><div><div className="eyebrow">OpsCore / {page}</div><h1>{page==='Dashboard'?'Operations Dashboard':page}</h1><p>{page==='Dashboard'?'Service, infrastructure and compliance in one secure workspace.':`OpsCore ${page} workspace`}</p></div><div className="headActions"><Badge tone="green">{user.role}</Badge><button className="iconBtn" onClick={refresh}>↻</button><button className="secondary" onClick={()=>logout()}>Sign out</button><span className="pill">v4</span></div></header><Current/></main>
  {incidentModal&&<div className="modalBack" onMouseDown={()=>setIncidentModal(false)}><form className="modal" onSubmit={createIncident} onMouseDown={e=>e.stopPropagation()}><div className="panelHead"><div><h2>New incident</h2><p>Saved to OpsCore PostgreSQL.</p></div><button type="button" className="close" onClick={()=>setIncidentModal(false)}>×</button></div><label>Summary<input name="title" required autoFocus/></label><label>Description<input name="description"/></label><div className="formGrid"><label>Priority<select name="priority"><option>P3</option><option>P4</option><option>P2</option><option>P1</option></select></label><label>Assignment group<select name="group"><option>Service Desk</option><option>Deskside</option><option>Infrastructure</option><option>Networks</option></select></label></div><div className="formGrid"><label>Caller<input name="caller" defaultValue={user.name}/></label><label>Asset / CI<input name="asset"/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>setIncidentModal(false)}>Cancel</button><button className="primary">Create incident</button></div></form></div>}
  {assetModal&&<div className="modalBack" onMouseDown={()=>setAssetModal(false)}><form className="modal" onSubmit={createAsset} onMouseDown={e=>e.stopPropagation()}><div className="panelHead"><div><h2>New asset</h2><p>Create a shared CMDB record.</p></div><button type="button" className="close" onClick={()=>setAssetModal(false)}>×</button></div><div className="formGrid"><label>Name<input name="name" required autoFocus/></label><label>Type<select name="type"><option>Server</option><option>Laptop</option><option>Network Switch</option><option>Printer</option><option>UPS</option><option>Other</option></select></label></div><div className="formGrid"><label>Site<input name="site"/></label><label>Owner<input name="owner"/></label></div><div className="formGrid"><label>Serial number<input name="serialNumber"/></label><label>Model<input name="model"/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>setAssetModal(false)}>Cancel</button><button className="primary">Create asset</button></div></form></div>}
  {userModal&&<div className="modalBack" onMouseDown={()=>setUserModal(false)}><form className="modal" onSubmit={createUser} onMouseDown={e=>e.stopPropagation()}><div className="panelHead"><div><h2>New OpsCore user</h2><p>Create a local account and assign its platform role.</p></div><button type="button" className="close" onClick={()=>setUserModal(false)}>×</button></div><div className="formGrid"><label>Name<input name="name" required autoFocus/></label><label>Email<input name="email" type="email" required/></label></div><div className="formGrid"><label>Role<select name="role">{roles.map(r=><option key={r}>{r}</option>)}</select></label><label>Temporary password<input name="password" type="password" minLength="10" required/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>setUserModal(false)}>Cancel</button><button className="primary">Create user</button></div></form></div>}
  {toast&&<div className="toast">{toast}</div>}</div>;
}

createRoot(document.getElementById('root')).render(<App/>);
