/* ============================================================
   BYP Dashboard — Application Logic
   Backyard Pod Accounting Dashboard
   ============================================================ */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// DATA — injected automatically by n8n WF-1 on every Plaid sync + Netlify deploy.
// DO NOT edit between DATA markers manually.
// Source of truth: Google Sheets "Chase CC Dashboard — Master"
//
// H field names (must match WF-1 Code: Build HTML Data Payload output):
//   init (initials), col (color), bg, name, role
//
// TX field names (must match WF-1 Code: Build HTML Data Payload output):
//   id, c (card_last4), dt (date), tm (time), m (merchant),
//   a (amount), st (status), pu (purpose), pr (project),
//   ac (account_category), rc (receipt bool), rc_url (receipt URL),
//   no (notes), sl (slack thread)
//
// See SETUP_CHECKLIST.md Step 12 for required WF-1 Code node changes.
// ═══════════════════════════════════════════════════════════════════════════

// ── Cardholder map  card_last4 → { name, init, col, bg, role } ─────────────
// DATA:CARDHOLDERS:START
let H = {};
// DATA:CARDHOLDERS:END

// ── System status (injected by WF-1; determines live indicator states) ───────
// DATA:SYS_STATUS:START
let SYS_STATUS = {n8n:'off',plaid:'off',sheets:'off',slack:'off',qb:'off',txnCount:0,cardCount:0,syncTs:''};
// DATA:SYS_STATUS:END

// ── Transaction array (last 60 days, newest first) ──────────────────────────
// DATA:TRANSACTIONS:START
let TX = [];
// DATA:TRANSACTIONS:END

// ── Project list (synced from Google Sheets "Projects" tab) ─────────────────
// Each project: { name, code, active, created_at }
// DATA:PROJECTS:START
let PROJECTS = [];
// DATA:PROJECTS:END

// ── Chart of Accounts — two categories: Accounts (expenses) + Products & Services ──
// Source of truth: ChartOfAccounts tab in BYP Projects spreadsheet.
// Update here if the chart of accounts changes, then redeploy.
const CHART_OF_ACCOUNTS = [
  // Accounts (Expenses)
  '7010 Advertising:Advertising - Meta/Facebook',
  '7020 Advertising:Advertising - Google',
  '7030 Advertising:Advertising - Other',
  '7210 Rent & Lease:Rent & Lease - Warehouse / Office',
  '7220 Utilities:Utilities - Warehouse / Office',
  '7230 Repairs & Maintenance:Repairs & Maintenance - Building',
  '7240 Warehouse Supplies / Small Equipment',
  '7340 Vehicle Stipends / Allowances',
  '7360 Travel:Travel and Lodging',
  '7370 Travel:Travel - Meals',
  '7380 Mileage Reimbursement',
  '7410 Office Supplies',
  '7420 Software & Subscriptions',
  '7430 Insurance:Insurance - General Liability / Umbrella',
  '7440 Professional Fees:Professional Fees - Accounting / Bookkeeping',
  '7450 Professional Fees:Professional Fees - Legal',
  '7460 Professional Fees:Professional Fees - Other Consulting',
  '7470 HR / Recruiting / Training',
  '7480 Taxes & Licenses',
  '7490 Bank Fees',
  '7495 Merchant Fees (Stripe/QB Payments)',
  '7610 Customer Gifts',
  '7620 Employee Recognition',
  '7630 Meals & Entertainment (non-travel)',
  '7640 Uncategorized Expenses (Temp)',
  '7250 Rent & Lease Forklift',
  '7300 Vehicles, Travel, and Field Support',
  '7310 Fuel',
  '7320 Vehicle Repairs & Maintenance',
  '7330 Vehicle Insurance & Registration',
  '7350 Tolls / Parking',
  // Products & Services (COGS)
  '5010 COGS (Parent):COGS Direct Labor – Primary Installer / Turnkey Residential Essentials',
  '5011 COGS (Parent):COGS Direct Labor – Primary Installer / Turnkey Residential Living and Villas',
  '5020 COGS (Parent):COGS Direct Labor – Primary Installer / Turnkey Commercial',
  '5030 COGS:COGS Direct Labor – Overtime / Premium Pay',
  '5110 COGS:COGS Residential Subcontractors – Electrical - Essentials',
  '5111 COGS:COGS Residential Subcontractors – Electrical - Living/Villas',
  '5120 COGS:COGS Residential Subcontractors – Plumbing',
  '5130 COGS:COGS Residential Subcontractors – HVAC',
  '5140 COGS:COGS Residential Subcontractors – Concrete / Foundation',
  '5150 COGS:COGS Residential Subcontractors – Excavation / Trenching',
  '5160 COGS:COGS Residential Subcontractors – Landscaping / Flatwork / Yard',
  '5170 COGS:COGS Residential Subcontractors – Cleaning / Final Clean',
  '5180 COGS:COGS Residential Subcontractors – Other Trades',
  '5190 COGS (Parent):COGS Commercial Subcontractors – All',
  '5210 COGS:COGS Materials – Pod Build Materials - Residential Essentials',
  '5211 COGS:COGS Materials – Pod Build Materials - Residential Living and Villas',
  '5220 COGS:COGS Materials – Pod Build Materials - Commercial',
  '5310 COGS:COGS Permit Fees',
  '5320 COGS:COGS Engineering',
  '5330 COGS:COGS Architecture / Drafting (job-specific)',
  '5340 COGS:COGS Survey / Soil / Testing',
  '5410 COGS:COGS Equipment Rental (jobsite)',
  '5420 COGS:COGS Dump / Hauling / Disposal',
  '5430 COGS:COGS Porta Potty / Jobsite Services',
  '5440 COGS:COGS Temporary Power / Water / Site Utilities',
  '5450 COGS:COGS Small Tools & Consumables (jobsite)',
  '5460 COGS:COGS Warranty & Callbacks',
];

// ── Last sync timestamp (injected by WF-1; used for auto-refresh polling) ───
// DATA:SYNC_TS:START
const SYNC_TS = '';
// DATA:SYNC_TS:END

// ── Runtime config injected at Netlify build time by inject_secrets.js ───────
// QB_PUSH_URL          — QB push webhook URL + secret (never stored in git)
// SHEETS_URL           — Google Sheets master URL for "Open in Sheets"
// PROJECTS_WEBHOOK_URL — n8n WF-6 webhook URL for add/remove project actions
// PROJECTS_SHEET_URL   — Direct link to the Projects tab in Google Sheets
// REMIND_WEBHOOK_URL   — n8n WF-2b webhook URL for accountant-triggered reminders
// REMIND_WEBHOOK_SECRET— shared secret for WF-2b remind endpoint
// DATA:WEBHOOK:START
// ── Runtime configuration — injected at build time by inject_secrets.js ──────
// These PLACEHOLDER tokens are replaced with real values from .env.
// Never commit real secrets to source control.
// URLs only — no secrets. Secrets live in the Cloudflare Worker env vars.
const QB_PUSH_URL          = 'https://n8n-space.byp-app.workers.dev/webhook/qb-push';
const SHEETS_URL           = 'https://docs.google.com/spreadsheets/d/1lM3WMabIbzWc9s5pWv9qkMBn5SVaCPe8AYKeHwxegUg/edit';
const PROJECTS_WEBHOOK_URL = 'https://n8n-space.byp-app.workers.dev/webhook/projects';
const PROJECTS_SHEET_URL   = 'https://docs.google.com/spreadsheets/d/1SPZEQUF18LhImIuulvayb40XaG-yy2PTOZ-hZbR6L4Y/edit?gid=0#gid=0';
const N8N_STATUS_URL       = 'https://n8n-space.byp-app.workers.dev/workflow-status';
const DASHBOARD_DATA_URL   = 'https://n8n-space.byp-app.workers.dev/dashboard-data';
const REMIND_WEBHOOK_URL   = 'https://n8n-space.byp-app.workers.dev/webhook/remind-cardholder';
const GOOGLE_CLIENT_ID     = '1058432089421-s8dgqcje9jj6un5ms9tfe7qsts99dc3u.apps.googleusercontent.com';
// DATA:WEBHOOK:END

/* ── AUTH ──────────────────────────────────────────────────────────────────── */
// Stores the Google ID token for the current session (memory + sessionStorage).
// Token expires after 1 hour — user is prompted to re-sign-in automatically.

function _getToken() {
  try { return sessionStorage.getItem('byp_g_token') || null; } catch { return null; }
}
function _setToken(t) {
  try { sessionStorage.setItem('byp_g_token', t); } catch {}
}
function _clearToken() {
  try { sessionStorage.removeItem('byp_g_token'); } catch {}
}

// authFetch — drop-in replacement for fetch() that attaches the Bearer token.
// On 401, clears the session and shows the login overlay.
async function authFetch(url, options = {}) {
  const token = _getToken();
  if (!token) { showLoginOverlay(); throw new Error('Not authenticated'); }
  const headers = { ...(options.headers || {}), 'Authorization': `Bearer ${token}` };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    _clearToken();
    showLoginOverlay();
    toast('Session expired', 'Please sign in again.', 'warn');
    throw new Error('Session expired');
  }
  return res;
}

function showLoginOverlay() {
  const el = document.getElementById('login-overlay');
  if (el) el.style.display = 'flex';
  const shell = document.querySelector('.shell');
  if (shell) shell.style.visibility = 'hidden';
}
function hideLoginOverlay() {
  const el = document.getElementById('login-overlay');
  if (el) el.style.display = 'none';
  const shell = document.querySelector('.shell');
  if (shell) shell.style.visibility = '';
}

// Called by Google Identity Services after successful sign-in.
function handleGoogleSignIn(response) {
  _setToken(response.credential);
  hideLoginOverlay();
  initApp();
}

function signOut() {
  _clearToken();
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  showLoginOverlay();
  // Re-render the sign-in button
  if (window.google && GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('%%')) {
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleSignIn });
    google.accounts.id.renderButton(document.getElementById('google-signin-btn'),
      { theme: 'outline', size: 'large', shape: 'pill' });
    google.accounts.id.prompt();
  }
}

function initAuth() {
  // If Google Client ID not configured, skip auth and init directly.
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('%%')) {
    hideLoginOverlay(); initApp(); return;
  }
  showLoginOverlay();
  // If we already have a token, try using it — worker will 401 if expired.
  if (_getToken()) { hideLoginOverlay(); initApp(); return; }
  // Initialize Google Identity Services.
  // GIS may not be loaded yet if the async script is still fetching.
  function _initGIS() {
    google.accounts.id.initialize({
      client_id:   GOOGLE_CLIENT_ID,
      callback:    handleGoogleSignIn,
      auto_select: true,
      context:     'signin',
    });
    google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      { theme: 'outline', size: 'large', type: 'standard', shape: 'pill' }
    );
    google.accounts.id.prompt();
  }
  if (window.google && google.accounts) {
    _initGIS();
  } else {
    // GIS script still loading — poll until ready.
    const t = setInterval(() => {
      if (window.google && google.accounts) { clearInterval(t); _initGIS(); }
    }, 100);
  }
}

/* ── THEME ─────────────────────────────────── */
function toggleTheme(){
  const isLight=document.body.classList.toggle('light-mode');
  document.getElementById('theme-icon').className=isLight?'ti ti-moon':'ti ti-sun';
  try{localStorage.setItem('byp-theme',isLight?'light':'dark');}catch(e){}
}
(function initTheme(){
  try{
    if(localStorage.getItem('byp-theme')==='light'){
      document.body.classList.add('light-mode');
      const ic=document.getElementById('theme-icon');
      if(ic) ic.className='ti ti-moon';
    }
  }catch(e){}
})();

let selId=null, cfilt='ALL', sFilter='ALL';
let dateFrom='', dateTo='', activeDateQuick='all';
// Live Feed date filter — separate state, defaults to current month
const _toISO=d=>d.toISOString().slice(0,10);
const _now=new Date();
let feedDateFrom=_toISO(new Date(_now.getFullYear(),_now.getMonth(),1));
let feedDateTo=_toISO(_now);
let feedActiveDateQuick='month';

// ─── HELPERS ───────────────────────────────────────────────────────────────
// Safe cardholder lookup — never crashes if card missing from H
const ch  = card => H[card] || {name:'Unknown',init:'??',col:'#8B9CB8',bg:'#18202E',role:'Cardholder'};
const fmt = n => '$'+parseFloat((n||0).toString().replace(/[^0-9.-]/g,'')||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = d => { const m=d&&d.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[2]}/${m[3]}/${m[1].slice(2)}`:(d||''); };
const fmtTime = t => { const m=t&&t.match(/^(\d{1,2}):(\d{2})/); if(!m)return t||''; let h=parseInt(m[1],10); const ap=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${m[2]} ${ap}`; };
const comp= t => [t.pu, t.pr, t.ac, (t.rc||t.rc_url), t.no].filter(Boolean).length;
const COMP_TOTAL = 5; // purpose, project, account_category, receipt, notes
const av  = (card,sz=36) => {
  const h=ch(card);
  return `<div class="av" style="width:${sz}px;height:${sz}px;background:${h.bg};color:${h.col};font-size:${Math.round(sz*.31)}px" aria-hidden="true">${h.init}</div>`;
};
const badge = s => {
  const map={complete:['badge-complete','Complete'],pushed:['badge-pushed','Pushed'],
             partial:['badge-partial','Partial'],notified:['badge-notified','Notified'],
             pending:['badge-pending','Pending']};
  const [cls,lbl]=map[s]||['badge-pending',s||'Pending'];
  return `<span class="badge ${cls}">${lbl}</span>`;
};
const ci = v => v
  ? '<i class="ti ti-circle-check" style="color:var(--teal);font-size:16px" aria-label="Yes"></i>'
  : '<i class="ti ti-circle" style="color:var(--t3);font-size:16px" aria-label="No"></i>';
const pcolor = p => p===100?'var(--teal)':p>=50?'var(--amber)':'var(--blue)';
// Escape a value for safe embedding inside an HTML attribute (double-quoted)
const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// Effective display status: if sheet says pending/notified but some fields are filled → Partial
const effectiveSt = t => {
  if(t.st==='complete'||t.st==='pushed'||t.st==='partial') return t.st;
  const c=comp(t);
  if(c>0 && c<COMP_TOTAL) return 'partial';
  return t.st||'pending';
};

// ─── STATS ─────────────────────────────────────────────────────────────────
function updStats(){
  const tot  = TX.reduce((a,t)=>a+parseFloat(t.a||0),0);
  const pend = TX.filter(t=>t.st==='pending'||t.st==='notified').length;
  const done = TX.filter(t=>t.st==='complete'||t.st==='pushed').length;
  const cards= Object.keys(H).length;
  document.getElementById('s-total').textContent   = TX.length||'—';
  document.getElementById('s-pending').textContent  = pend||'—';
  document.getElementById('s-complete').textContent = done||'—';
  document.getElementById('s-amount').textContent   = TX.length?'$'+Math.round(tot).toLocaleString():'—';
  const sub=document.getElementById('s-cards-sub');
  if(sub) sub.textContent=cards?`across ${cards} card${cards!==1?'s':''}`:TX.length?'syncing…':'—';
  const pb=document.getElementById('nav-pending-badge');
  if(pb){pb.textContent=pend;pb.style.display=pend?'':'none';}
  const sf=document.getElementById('sheetfooter');
  if(sf) sf.textContent=`${done} of ${TX.length} transactions complete and ready to sync`;
  const qrEl=document.getElementById('qb-ready');
  const readyToSync=TX.filter(t=>t.st==='complete').length;
  if(qrEl) qrEl.textContent=`${readyToSync} transaction${readyToSync!==1?'s':''}`;

  // Workflow card stats derived from TX data
  const today=new Date().toISOString().slice(0,10);
  const todayTx=TX.filter(t=>t.dt===today);
  const notified=TX.filter(t=>t.st!=='pending');
  const pushed=TX.filter(t=>t.st==='pushed').length;

  const wf1=document.getElementById('wf1exec');   if(wf1) wf1.textContent=todayTx.length;
  const wf2=document.getElementById('wf2sent');   if(wf2) wf2.textContent=notified.length+' total';
  const wf2c=document.getElementById('wf2cards'); if(wf2c) wf2c.textContent=cards+' cards mapped';
  const wf3r=document.getElementById('wf3resp');  if(wf3r) wf3r.textContent=done+' responded';
  const wf3u=document.getElementById('wf3updates');if(wf3u) wf3u.textContent=done+' sheet updates';
  const wf5t=document.getElementById('wf5-totalsynced');if(wf5t) wf5t.textContent=pushed;
  const wf6p=document.getElementById('wf6projects');if(wf6p) wf6p.textContent=PROJECTS.length+' active';
}

// ─── NAV ────────────────────────────────────────────────────────────────────
const VALID_PAGES = ['overview','feed','sheet','cardholders','projects','workflow'];

function openMobNav(){
  document.getElementById('sidebar').classList.add('mob-open');
  document.getElementById('mob-backdrop').classList.add('open');
  document.getElementById('mob-hamburger-btn').setAttribute('aria-expanded','true');
  document.body.style.overflow='hidden';
}
function closeMobNav(){
  document.getElementById('sidebar').classList.remove('mob-open');
  document.getElementById('mob-backdrop').classList.remove('open');
  document.getElementById('mob-hamburger-btn').setAttribute('aria-expanded','false');
  document.body.style.overflow='';
}
function go(page, skipHistory){
  if(!VALID_PAGES.includes(page)) page='overview';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.navitem').forEach(n=>{n.classList.remove('active');n.removeAttribute('aria-current');});
  document.getElementById('page-'+page).classList.add('active');
  const ni=document.getElementById('nav-'+page);if(ni){ni.classList.add('active');ni.setAttribute('aria-current','page');}
  closeMobNav();
  if(window.innerWidth>768) document.getElementById('main').scrollTop=0;
  else window.scrollTo(0,0);
  if(page==='sheet')buildSheet();
  if(page==='cardholders')buildHolders();
  if(page==='overview'){buildRecent();buildAttention();}
  if(page==='projects')buildProjects();
  // Update URL hash — try/catch silences Claude's sandboxed iframe SecurityError
  if(!skipHistory) try{ history.pushState(null,'','#'+page); }catch(e){}
}

// Restore tab from URL hash on load; handle browser back/forward
function resolveHash(){
  const hash=location.hash.replace('#','');
  go(VALID_PAGES.includes(hash)?hash:'overview', true);
}
window.addEventListener('hashchange', resolveHash);
resolveHash();
document.querySelectorAll('.navitem').forEach(n=>n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click();}}));
document.querySelectorAll('.chip').forEach(c=>c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();c.click();}}));

// ─── PROJECTS ────────────────────────────────────────────────────────────────
let _pendingRemoveName = null;

function buildProjects(){
  const grid  = document.getElementById('proj-grid');
  const count = document.getElementById('proj-count');
  if(!grid) return;

  const active = PROJECTS.filter(p => p.active !== false);
  if(count) count.textContent = `${active.length} project${active.length!==1?'s':''}`;

  if(!active.length){
    grid.innerHTML=`
      <div class="dempty" style="grid-column:1/-1;padding:50px 20px">
        <i class="ti ti-folder-off" aria-hidden="true"></i>
        <span>No projects yet.<br>Add one above or edit the Projects sheet directly.</span>
      </div>`;
    return;
  }

  grid.innerHTML = active.map(p => `
    <div class="projcard" id="projcard-${CSS.escape(p.name)}">
      ${p.code ? `<div class="projcode">${p.code}</div>` : ''}
      <div style="flex:1;min-width:0">
        <div class="projname">${p.name}</div>
        <div class="projdate">${p.created_at ? 'Added '+p.created_at : 'Added manually'}</div>
      </div>
      <button class="proj-remove" onclick="askRemove('${p.name.replace(/'/g,"\\'")}','${(p.code||'').replace(/'/g,"\\'")}')"
        aria-label="Remove ${p.name}" title="Remove project">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>`).join('');
}

function toggleAddForm(){
  const form = document.getElementById('proj-add-form');
  const isOpen = form.classList.toggle('open');
  if(isOpen){
    setTimeout(()=>document.getElementById('proj-name-input').focus(), 50);
    // Hide confirm panel if open
    document.getElementById('proj-confirm').style.display='none';
    _pendingRemoveName = null;
  } else {
    document.getElementById('proj-name-input').value='';
    document.getElementById('proj-code-input').value='';
  }
}

function submitAddProject(){
  const nameEl = document.getElementById('proj-name-input');
  const codeEl = document.getElementById('proj-code-input');
  const name   = nameEl.value.trim();
  const code   = codeEl.value.trim().toUpperCase();

  if(!name){ nameEl.focus(); toast('Required','Project name cannot be empty','info'); return; }
  if(PROJECTS.some(p=>p.name.toLowerCase()===name.toLowerCase())){
    nameEl.focus();
    toast('Duplicate','A project with that name already exists','info');
    return;
  }

  const newProject = { name, code, active: true, created_at: new Date().toISOString().slice(0,10) };

  // Optimistic local update
  PROJECTS.push(newProject);
  buildProjects();
  toggleAddForm();
  setSyncStatus('syncing');
  toast('Project added',`"${name}" added locally — syncing to Google Sheets…`,'success');

  // POST to n8n WF-6
  _syncProjectAction('add', newProject);
}

function askRemove(name, code){
  _pendingRemoveName = name;
  document.getElementById('proj-confirm-name').textContent = name;
  const panel = document.getElementById('proj-confirm');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
  // Close add form if open
  document.getElementById('proj-add-form').classList.remove('open');
}

function cancelRemove(){
  _pendingRemoveName = null;
  document.getElementById('proj-confirm').style.display = 'none';
}

function confirmRemove(){
  if(!_pendingRemoveName) return;
  const name = _pendingRemoveName;
  cancelRemove();

  // Optimistic local update — mark inactive + animate out
  const proj = PROJECTS.find(p=>p.name===name);
  if(proj) proj.active = false;

  const card = document.getElementById('projcard-'+CSS.escape(name));
  if(card){
    card.classList.add('removing');
    setTimeout(()=>buildProjects(), 320);
  } else {
    buildProjects();
  }

  setSyncStatus('syncing');
  toast('Project removed',`"${name}" removed — syncing to Google Sheets…`,'success');

  // POST to n8n WF-6
  _syncProjectAction('remove', { name });
}

async function _syncProjectAction(action, project){
  if(!PROJECTS_WEBHOOK_URL || PROJECTS_WEBHOOK_URL==='https://n8n-space.byp-app.workers.dev/webhook/projects'){
    setSyncStatus('disconnected');
    showUnsavedBadge(true);
    toast('Not connected','PROJECTS_WEBHOOK_URL not set — change saved locally only. Set up n8n WF-6 to enable full sync.','info');
    return;
  }
  try{
    const res = await authFetch(PROJECTS_WEBHOOK_URL, {
      method:  'POST',
      headers: {'Content-Type':'application/json'},
      body:    JSON.stringify({ action, project, ts: Date.now() })
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setSyncStatus('synced');
    showUnsavedBadge(false);
    toast('Synced',`Project "${project.name}" ${action==='add'?'added to':'removed from'} Google Sheets. Dashboard will rebuild shortly.`,'success');
  } catch(err){
    setSyncStatus('error');
    showUnsavedBadge(true);
    toast('Sync failed',err.message+' — change saved locally, will retry on next load','info');
    console.error('[Projects sync]', err);
  }
}

function setSyncStatus(state){
  const dot = document.getElementById('proj-sync-dot');
  const lbl = document.getElementById('proj-sync-lbl');
  if(!dot||!lbl) return;
  const map = {
    disconnected: { cls:'off',     text:'Not connected — complete setup to enable sync' },
    syncing:      { cls:'warn',    text:'Syncing to Google Sheets…' },
    synced:       { cls:'on',      text:'Synced · '+new Date().toLocaleTimeString() },
    error:        { cls:'off',     text:'Sync error — check n8n WF-6 logs' }
  };
  const s = map[state] || map.disconnected;
  dot.className = `sysdot ${s.cls}`;
  lbl.textContent = s.text;
}

function showUnsavedBadge(show){
  const b = document.getElementById('proj-unsaved');
  if(b) b.style.display = show ? '' : 'none';
}

async function syncProjectsFromSheets(){
  const btn=document.getElementById('proj-sync-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader spin" aria-hidden="true"></i> Syncing…';}
  const urls=[];
  if(DASHBOARD_DATA_URL&&!DASHBOARD_DATA_URL.startsWith('%%'))
    urls.push(DASHBOARD_DATA_URL.replace(/\/dashboard-data$/, '') + '/projects');
  if(PROJECTS_WEBHOOK_URL&&!PROJECTS_WEBHOOK_URL.startsWith('%%'))
    urls.push(PROJECTS_WEBHOOK_URL);
  if(!urls.length){
    toast('Not configured','Neither DASHBOARD_DATA_URL nor PROJECTS_WEBHOOK_URL set — deploy first','info');
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-refresh" aria-hidden="true"></i> Sync from Sheets';}
    return;
  }
  let loaded=false;
  for(const url of urls){
    try{
      const sep=url.includes('?')?'&':'?';
      const r=await authFetch(url+sep+'_nc='+Date.now(),{cache:'no-store'});
      if(!r.ok) continue;
      const d=await r.json();
      if(d.error) continue;
      const list=d.projects||d.data||d;
      if(Array.isArray(list)){
        PROJECTS=list.map(p=>typeof p==='string'?{name:p,active:true}:p);
        buildProjects();
        if(selId) buildDetail();
        toast('Projects synced',`${PROJECTS.length} project${PROJECTS.length!==1?'s':''} loaded`,'success');
        loaded=true;
        break;
      }
    }catch(e){}
  }
  if(!loaded) toast('Sync failed','No project data returned — check n8n WF-6 and Worker /projects route','error');
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-refresh" aria-hidden="true"></i> Sync from Sheets';}
}

function openProjectsSheet(){
  if(PROJECTS_SHEET_URL && PROJECTS_SHEET_URL!=='https://docs.google.com/spreadsheets/d/1SPZEQUF18LhImIuulvayb40XaG-yy2PTOZ-hZbR6L4Y/edit?gid=0#gid=0'){
    window.open(PROJECTS_SHEET_URL, '_blank');
  } else {
    toast('Not configured','PROJECTS_SHEET_URL not set in Netlify env vars','info');
  }
}

// ─── CLOCK ─────────────────────────────────────────────────────────────────
function tick(){
  const d=new Date(),h=d.getHours(),m=d.getMinutes(),s=d.getSeconds(),ap=h>=12?'PM':'AM',hr=h%12||12;
  document.getElementById('clock').textContent=`${String(hr).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${ap}`;
  document.getElementById('datestr').textContent=d.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
}

// ─── TRANSACTION LIST ────────────────────────────────────────────────────────
function buildList(){
  const el=document.getElementById('txnlist');
  const rows=TX
    .filter(t=>cfilt==='ALL'||t.c===cfilt)
    .filter(t=>sFilter==='ALL'||effectiveSt(t)===sFilter)
    .filter(t=>inFeedDateRange(t.dt));
  const cl=document.getElementById('txn-count-lbl');
  if(cl){
    const countTxt=`${rows.length} transaction${rows.length!==1?'s':''}`;
    const badgeHtml=sFilter!=='ALL'?badge(sFilter):'';
    const dateCtx=feedActiveDateQuick==='all'?'':feedActiveDateQuick==='month'?' · This Month':feedActiveDateQuick==='prev-month'?' · Last Month':feedActiveDateQuick==='week'?' · This Week':feedActiveDateQuick==='today'?' · Today':feedDateFrom?' · Custom':'';
    cl.innerHTML=(badgeHtml?`${countTxt} — ${badgeHtml}`:countTxt)+`<span style="color:var(--t3)">${dateCtx}</span>`;
  }
  if(!rows.length){
    const msg=TX.length
      ? (sFilter!=='ALL'?`No ${sFilter} transactions for this period`:'No transactions for this period')
      : 'Waiting for live data from Plaid…';
    el.innerHTML=`<div class="dempty"><i class="ti ti-inbox" aria-hidden="true"></i><span>${msg}</span></div>`;
    return;
  }
  el.innerHTML=rows.map(t=>`
    <div class="txnitem${selId===t.id?' sel':''}" data-txn-id="${esc(t.id)}" onclick="sel(this.dataset.txnId)" role="listitem button" tabindex="0" aria-selected="${selId===t.id}">
      ${av(t.c,36)}
      <div>
        <div class="merchant">${t.m}</div>
        <div class="txnmeta">••••${t.c} · ${ch(t.c).name}${t.tm?' · '+fmtTime(t.tm):''}</div>
      </div>
      <div><div class="amount">${fmt(t.a)}</div><div class="txndate">${fmtDate(t.dt)}</div></div>
      <div>${badge(effectiveSt(t))}</div>
    </div>`).join('');
  el.querySelectorAll('.txnitem').forEach(r=>r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();r.click();}}));
}

// ─── DETAIL ─────────────────────────────────────────────────────────────────
function sel(id){selId=id;buildList();buildDetail();}
function buildDetail(){
  const de=document.getElementById('detail');
  if(!selId){de.innerHTML='<div class="dempty"><i class="ti ti-cursor-text"></i><span>Select a transaction</span></div>';return;}
  const t=TX.find(x=>x.id===selId);
  if(!t){de.innerHTML='';return;}
  const h=ch(t.c), c=comp(t), p=Math.round(c/COMP_TOTAL*100);
  const hasRc = !!(t.rc||t.rc_url);
  const rcVal = t.rc_url
    ? (t.rc_url.startsWith('data:')
        ? `<a href="${t.rc_url}" download="receipt_${t.id}" style="color:var(--teal);text-decoration:none;font-size:12px"><i class="ti ti-download" style="font-size:11px"></i> Download</a>`
        : `<a href="${t.rc_url}" target="_blank" rel="noopener" style="color:var(--teal);text-decoration:none;font-size:12px"><i class="ti ti-external-link" style="font-size:11px"></i> View receipt</a>`)
    : (hasRc ? '<span style="font-size:12px;color:var(--teal)">Uploaded ✓</span>' : '');
  const isPushed = effectiveSt(t)==='pushed';
  // Build project options for dropdown
  const projOpts = PROJECTS.filter(p=>p.active!==false).map(p=>
    `<option value="${p.name}"${t.pr===p.name?' selected':''}>${p.name}</option>`).join('');
  // Build account category options — grouped to match Slack modal
  const acOptsAccounts = CHART_OF_ACCOUNTS
    .filter(a=>/^7\d{3}/.test(a))
    .map(a=>`<option value="${a}"${t.ac===a?' selected':''}>${a}</option>`).join('');
  const acOptsCOGS = CHART_OF_ACCOUNTS
    .filter(a=>/^5\d{3}/.test(a))
    .map(a=>`<option value="${a}"${t.ac===a?' selected':''}>${a}</option>`).join('');
  const acOpts = `<optgroup label="Accounts">${acOptsAccounts}</optgroup><optgroup label="Products &amp; Services">${acOptsCOGS}</optgroup>`;
  de.innerHTML=`
  <div class="dsec">
    <div style="display:flex;align-items:center;gap:12px">
      ${av(t.c,44)}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="font-size:15px;font-weight:700">${h.name}</div>
          ${badge(effectiveSt(t))}
        </div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${h.role} · Card ••••${t.c} · <span style="font-size:10px;opacity:.6">${t.id}</span></div>
      </div>
    </div>
  </div>
  <div class="dsec">
    <div class="dlbl">Transaction details</div>
    <div class="dgrid2">
      <div><div style="font-size:10px;color:var(--t3);margin-bottom:3px">Merchant</div><div style="font-weight:600;font-size:13px">${t.m}</div></div>
      <div><div style="font-size:10px;color:var(--t3);margin-bottom:3px">Amount</div><div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;color:var(--amber)">${fmt(t.a)}</div></div>
      <div><div style="font-size:10px;color:var(--t3);margin-bottom:3px">Date &amp; Time</div><div style="font-size:12px">${fmtDate(t.dt)}${t.tm?' · '+fmtTime(t.tm):''}</div></div>
      <div><div style="font-size:10px;color:var(--t3);margin-bottom:3px">Filing progress</div><div style="font-size:12px;font-weight:600">${c}/${COMP_TOTAL} fields</div><div class="prog"><div class="progfill" style="width:${p}%;background:${pcolor(p)}"></div></div></div>
    </div>
  </div>
  <div class="dsec">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="dlbl" style="margin-bottom:0">Cardholder responses</div>
      <span style="font-size:11px;color:var(--t3)">Editable — saves to Google Sheets</span>
    </div>
    <div style="background:var(--s2);border-radius:8px;overflow:hidden">
      <!-- PURPOSE row -->
      <div style="display:grid;grid-template-columns:90px 1fr 28px;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--t3);font-weight:500">Purpose</div>
        <input id="dr-purpose" type="text" value="${t.pu||''}" placeholder="e.g. Roof materials, Lumber…"
          class="dr-input" style="margin:0"
          onblur="saveField('${t.id}','purpose',this.value,'pu')">
        <div style="display:flex;justify-content:center">
          ${t.pu
            ? `<i class="ti ti-circle-check" style="color:var(--teal);font-size:18px" aria-label="Filled"></i>`
            : `<i class="ti ti-circle" style="color:var(--t3);font-size:18px;opacity:.5" aria-label="Empty"></i>`}
        </div>
      </div>
      <!-- PROJECT row -->
      <div style="display:grid;grid-template-columns:90px 1fr 28px;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--t3);font-weight:500">Project</div>
        <select id="dr-project" class="dr-input" style="color-scheme:dark;margin:0"
          onchange="saveField('${t.id}','project',this.value,'pr')">
          <option value="">— Select project —</option>
          ${projOpts}
        </select>
        <div style="display:flex;justify-content:center">
          ${t.pr
            ? `<i class="ti ti-circle-check" style="color:var(--teal);font-size:18px" aria-label="Filled"></i>`
            : `<i class="ti ti-circle" style="color:var(--t3);font-size:18px;opacity:.5" aria-label="Empty"></i>`}
        </div>
      </div>
      <!-- ACCOUNT CATEGORY row -->
      <div style="display:grid;grid-template-columns:90px 1fr 28px;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--t3);font-weight:500">Account</div>
        <select id="dr-accat" class="dr-input" style="color-scheme:dark;margin:0"
          onchange="saveField('${t.id}','account_category',this.value,'ac')">
          <option value="">— Select account category —</option>
          ${acOpts}
        </select>
        <div style="display:flex;justify-content:center">
          ${t.ac
            ? `<i class="ti ti-circle-check" style="color:var(--teal);font-size:18px" aria-label="Filled"></i>`
            : `<i class="ti ti-circle" style="color:var(--t3);font-size:18px;opacity:.5" aria-label="Empty"></i>`}
        </div>
      </div>
      <!-- RECEIPT row -->
      <div style="display:grid;grid-template-columns:90px 1fr 28px;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--t3);font-weight:500">Receipt</div>
        <div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap">
          ${hasRc
            ? rcVal
            : `<span style="font-size:12px;color:var(--t3)">Awaiting…</span>`}
          <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;color:var(--blue);border:1px solid rgba(96,165,250,.3);border-radius:5px;padding:2px 7px;background:rgba(96,165,250,.07);white-space:nowrap;flex-shrink:0" title="Upload receipt">
            <i class="ti ti-upload" style="font-size:12px" aria-hidden="true"></i> Upload
            <input type="file" accept="image/*,application/pdf" style="display:none" data-txn-id="${esc(t.id)}" onchange="uploadReceipt(this.dataset.txnId,this)">
          </label>
          ${hasRc?`<button class="btn btn-sm" style="color:var(--red);border-color:rgba(239,68,68,.3);padding:2px 7px;font-size:11px" data-txn-id="${esc(t.id)}" onclick="removeReceipt(this.dataset.txnId)" title="Remove receipt"><i class="ti ti-trash" style="font-size:11px"></i></button>`:''}
        </div>
        <div style="display:flex;justify-content:center">
          ${hasRc
            ? `<i class="ti ti-circle-check" style="color:var(--teal);font-size:18px" aria-label="Filled"></i>`
            : `<i class="ti ti-circle" style="color:var(--t3);font-size:18px;opacity:.5" aria-label="Empty"></i>`}
        </div>
      </div>
      <!-- NOTES row -->
      <div style="display:grid;grid-template-columns:90px 1fr 28px;align-items:start;gap:8px;padding:9px 12px">
        <div style="font-size:11px;color:var(--t3);font-weight:500;padding-top:4px">Notes</div>
        <textarea id="dr-notes" rows="2" placeholder="Any additional context…"
          class="dr-input" style="resize:vertical;margin:0"
          onblur="saveField('${t.id}','notes',this.value,'no')">${t.no||''}</textarea>
        <div style="display:flex;justify-content:center;padding-top:4px">
          ${t.no
            ? `<i class="ti ti-circle-check" style="color:var(--teal);font-size:18px" aria-label="Filled"></i>`
            : `<i class="ti ti-circle" style="color:var(--t3);font-size:18px;opacity:.5" aria-label="Empty"></i>`}
        </div>
      </div>
    </div>
  </div>
  ${effectiveSt(t)!=='complete' ? `
  <div class="dsec">
    <div class="dlbl">Slack thread</div>
    <div class="slackthread">
      <div style="font-size:11px;color:var(--t3);text-align:center;padding:8px;font-style:italic">Loading thread…</div>
    </div>
  </div>` : ''}
  <div class="dsec" style="display:flex;gap:8px;flex-wrap:wrap">
    ${effectiveSt(t)!=='complete'&&!isPushed ? `<button class="btn btn-sm${t.st==='pending'?' btn-amber':''}" data-txn-id="${esc(t.id)}" onclick="resend(this.dataset.txnId)"><i class="ti ti-brand-slack" aria-hidden="true"></i> ${t.st==='pending'?'Notify via Slack':'Resend to Slack'}</button>` : ''}
    ${!isPushed
      ? (effectiveSt(t)==='complete'
          ? `<button class="btn btn-sm" style="color:var(--amber);border-color:var(--amberRing)" data-txn-id="${esc(t.id)}" onclick="markPending(this.dataset.txnId)"><i class="ti ti-rotate-clockwise-2" aria-hidden="true"></i> Mark pending</button>`
          : `<button class="btn btn-sm" style="color:var(--teal);border-color:rgba(16,185,129,.3)" data-txn-id="${esc(t.id)}" onclick="markDone(this.dataset.txnId)"><i class="ti ti-check" aria-hidden="true"></i> Mark complete</button>`)
      : ''}
    ${isPushed?`<span style="font-size:12px;color:var(--t3);display:flex;align-items:center;gap:5px"><i class="ti ti-brand-quickbooks" style="color:var(--teal)"></i> Pushed to QuickBooks</span>`:''}
  </div>`;
  // ── Fetch live Slack thread (only while pending/partial — hides when complete) ─
  if (effectiveSt(t)!=='complete' && t.sc && t.sts && DASHBOARD_DATA_URL && !DASHBOARD_DATA_URL.startsWith('%%')) {
    const threadDiv = de.querySelector('.slackthread');
    if (threadDiv) {
      const workerBase = DASHBOARD_DATA_URL.replace(/\/dashboard-data$/, '');
      authFetch(`${workerBase}/slack-thread?channel=${encodeURIComponent(t.sc)}&ts=${encodeURIComponent(t.sts)}&txn_id=${encodeURIComponent(t.id)}`, {
      })
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !data.thread || !data.thread.length) {
          threadDiv.innerHTML = '<div style="font-size:11px;color:var(--t3);text-align:center;padding:8px;font-style:italic">No thread messages yet.</div>';
          return;
        }
        threadDiv.innerHTML = data.thread.map(m => `
          <div class="slackmsg">
            <div class="av" style="width:26px;height:26px;flex-shrink:0;background:${m.f==='b'?'#1B3A5C':h.bg};color:${m.f==='b'?'#93C5FD':h.col};font-size:10px;font-weight:700" aria-hidden="true">${m.f==='b'?'⚡':h.init}</div>
            <div class="slackbubble">${m.t||''}</div>
          </div>`).join('');
      })
      .catch(() => {
        threadDiv.innerHTML = '<div style="font-size:11px;color:var(--red);text-align:center;padding:8px">Could not load thread.</div>';
      });
    }
  }
}
async function resend(id){
  const t=TX.find(x=>x.id===id);
  if(!t) return;
  const isFirst = t.st==='pending'; // first-ever notification
  if(!REMIND_WEBHOOK_URL||REMIND_WEBHOOK_URL.startsWith('%%')){
    toast('Config missing','REMIND_WEBHOOK_URL not set in deploy env','error'); return;
  }
  const btn=document.querySelector('.btn[data-txn-id="'+id+'"]');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2 spin"></i> Sending...';}
  let success=false;
  try{
    const r=await authFetch(REMIND_WEBHOOK_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({txn_id:t.id,card_last4:t.c,merchant:t.m,amount:t.a})
    });
    let d={};
    try{ d=await r.json(); } catch(_){ /* non-JSON body — treat as ok if status 200 */ }
    if(!r.ok||d.error) throw new Error(d.error||`Webhook responded ${r.status}`);
    success=true;
    if(isFirst){
      t.st='notified';
      // PATCH GSheets asynchronously — don't block the UI
      if(DASHBOARD_DATA_URL&&!DASHBOARD_DATA_URL.startsWith('%%')){
        authFetch(DASHBOARD_DATA_URL,{
          method:'PATCH',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({txn_id:t.id,field:'status',value:'notified'})
        }).catch(()=>{});
      }
    }
    toast('Slack',isFirst?'Notification sent to '+ch(t.c).name:'Reminder sent to '+ch(t.c).name,'info');
  }catch(e){
    toast('Send failed',e.message,'error');
  }finally{
    if(success){
      // Rebuild UI so button re-renders correctly from updated t.st
      updStats();buildList();buildDetail();buildSheet();buildRecent();buildAttention();
    } else {
      if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-brand-slack" aria-hidden="true"></i> '+(isFirst?'Notify via Slack':'Resend to Slack');}
    }
  }
}

async function markPending(id){
  const t=TX.find(x=>x.id===id);
  if(!t||t.st==='pushed') return;
  const prev=t.st;
  t.st='pending';
  updStats();buildList();buildDetail();buildSheet();buildRecent();buildAttention();
  if(!DASHBOARD_DATA_URL||DASHBOARD_DATA_URL.startsWith('%%')) return;
  try{
    const r=await authFetch(DASHBOARD_DATA_URL,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({txn_id:t.id,field:'status',value:'pending'})
    });
    const d=await r.json();
    if(!r.ok||d.error){
      t.st=prev;
      updStats();buildList();buildDetail();buildSheet();buildRecent();buildAttention();
      toast('Sync failed',d.error||'Could not update sheet — try again','error');
    } else {
      toast('Reverted',t.m+' marked pending','info');
    }
  }catch(e){
    t.st=prev;
    updStats();buildList();buildDetail();buildSheet();buildRecent();buildAttention();
    toast('Sync failed','Network error — '+e.message,'error');
  }
}

// ─── RECEIPT UPLOAD ──────────────────────────────────────────────────────────
// Pending upload state — held while duplicate modal is open
let _pendingUpload = null;

async function uploadReceipt(txnId, input) {
  const file = input.files[0];
  if (!file) return;
  // Reset input so the same file can be re-selected after cancel
  input.value = '';

  const t = TX.find(x => x.id === txnId);
  if (!t) return;

  if (!DASHBOARD_DATA_URL || DASHBOARD_DATA_URL.startsWith('%%')) {
    toast('Not configured', 'DASHBOARD_DATA_URL not set — cannot upload receipt', 'error');
    return;
  }

  const uploadUrl = DASHBOARD_DATA_URL.replace(/\/dashboard-data$/, '') + '/upload-receipt';

  // Convert file to base64
  const b64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = () => rej(new Error('File read failed'));
    r.readAsDataURL(file);
  });

  // Sanitize filename: receipt_{txn_id}.{ext}
  const ext      = file.name.split('.').pop().toLowerCase() || 'jpg';
  const filename = `receipt_${txnId}.${ext}`;

  // Check for existing Drive file before uploading
  toast('Checking…', 'Looking for existing receipt in Drive…', 'info');
  let existing = [];
  try {
    const checkRes = await authFetch(
      `${uploadUrl}?txn_id=${encodeURIComponent(txnId)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (checkRes.ok) {
      const cd = await checkRes.json();
      existing = cd.files || [];
    }
  } catch (_) {}

  if (existing.length > 0) {
    // Show duplicate modal — pause upload until user decides
    _pendingUpload = { txnId, filename, mime: file.type, b64, uploadUrl, existingFile: existing[0] };
    showReceiptDupeModal(existing[0], b64, file.name);
    return;
  }

  await _doReceiptUpload(txnId, filename, file.type, b64, uploadUrl, null);
}

async function _doReceiptUpload(txnId, filename, mimeType, b64, uploadUrl, replaceFileId) {
  const t = TX.find(x => x.id === txnId);
  if (!t) return;

  toast('Uploading…', 'Sending receipt to Google Drive…', 'info');
  try {
    const res = await authFetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txn_id: txnId, filename, mime_type: mimeType, data: b64, replace_file_id: replaceFileId || undefined }),
    });
    const d = await res.json();
    console.error('[receipt POST]', res.status, JSON.stringify(d));
    if (!res.ok || d.error) throw new Error(d.error || 'Upload failed');
    t.rc = true;
    t.rc_url = d.drive_url;
    updStats(); buildList(); buildDetail(); buildSheet(); buildRecent(); buildAttention();
    toast('Receipt saved', 'Uploaded to Drive and linked in sheet', 'success');
  } catch (err) {
    toast('Upload failed', err.message, 'error');
  }
}

// ─── RECEIPT DUPLICATE MODAL ─────────────────────────────────────────────────
function showReceiptDupeModal(existingFile, newB64, newOrigName) {
  const existing = document.getElementById('rcdup-modal');
  if (existing) existing.remove();

  const existThumb = existingFile.thumbnailLink
    ? `<img src="${existingFile.thumbnailLink}" style="max-width:100%;max-height:220px;border-radius:6px;object-fit:contain">`
    : `<div style="height:140px;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:12px;flex-direction:column;gap:6px"><i class="ti ti-file" style="font-size:32px"></i>No preview available</div>`;
  const newThumb = newB64.startsWith('data:image')
    ? `<img src="${newB64}" style="max-width:100%;max-height:220px;border-radius:6px;object-fit:contain">`
    : `<div style="height:140px;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:12px;flex-direction:column;gap:6px"><i class="ti ti-file" style="font-size:32px"></i>${newOrigName}</div>`;

  const mod = document.createElement('div');
  mod.id = 'rcdup-modal';
  mod.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  mod.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:12px;width:min(700px,100%);padding:24px;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:15px;font-weight:600;color:var(--t1)"><i class="ti ti-copy" style="color:var(--amber);margin-right:6px"></i>Duplicate Receipt Detected</div>
        <button onclick="closeReceiptDupeModal()" style="background:none;border:none;color:var(--t3);font-size:20px;cursor:pointer;padding:2px 6px;border-radius:4px">&times;</button>
      </div>
      <div style="font-size:12px;color:var(--t3)">A receipt for this transaction already exists in Google Drive. Choose how to proceed:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div style="background:var(--s2);border:1px solid var(--bdr);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px">
          <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.05em">Existing in Drive</div>
          <div style="background:var(--s3);border-radius:6px;padding:8px;min-height:140px;display:flex;align-items:center;justify-content:center">${existThumb}</div>
          <div style="font-size:11px;color:var(--t3)">${existingFile.name}</div>
          ${existingFile.modifiedTime?`<div style="font-size:10px;color:var(--t3)">Modified: ${new Date(existingFile.modifiedTime).toLocaleString()}</div>`:''}
          <a href="${existingFile.webViewLink}" target="_blank" rel="noopener" style="font-size:11px;color:var(--blue)"><i class="ti ti-external-link" style="font-size:10px"></i> Open in Drive</a>
        </div>
        <div style="background:var(--s2);border:1px solid var(--bdr);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px">
          <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.05em">New File</div>
          <div style="background:var(--s3);border-radius:6px;padding:8px;min-height:140px;display:flex;align-items:center;justify-content:center">${newThumb}</div>
          <div style="font-size:11px;color:var(--t3)">${newOrigName}</div>
          <div style="font-size:10px;color:var(--t3)">Ready to upload</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn" onclick="closeReceiptDupeModal()" style="color:var(--t2)">Cancel</button>
        <button class="btn" onclick="receiptDupeRename()" style="color:var(--blue);border-color:rgba(96,165,250,.35)"><i class="ti ti-file-plus"></i> Upload as new file</button>
        <button class="btn" onclick="receiptDupeReplace()" style="color:var(--amber);border-color:var(--amberRing)"><i class="ti ti-replace"></i> Replace existing</button>
      </div>
    </div>`;
  document.body.appendChild(mod);
  mod.addEventListener('click', e => { if (e.target === mod) closeReceiptDupeModal(); });
}

function closeReceiptDupeModal() {
  const m = document.getElementById('rcdup-modal');
  if (m) m.remove();
  _pendingUpload = null;
}

async function receiptDupeReplace() {
  if (!_pendingUpload) return;
  const { txnId, filename, mime, b64, uploadUrl, existingFile } = _pendingUpload;
  closeReceiptDupeModal();
  await _doReceiptUpload(txnId, filename, mime, b64, uploadUrl, existingFile.id);
}

async function receiptDupeRename() {
  if (!_pendingUpload) return;
  const { txnId, filename, mime, b64, uploadUrl } = _pendingUpload;
  // Append timestamp suffix to avoid collision: receipt_txnId_1748000000.ext
  const parts   = filename.split('.');
  const ext     = parts.pop();
  const newName = `${parts.join('.')}_${Math.floor(Date.now()/1000)}.${ext}`;
  closeReceiptDupeModal();
  await _doReceiptUpload(txnId, newName, mime, b64, uploadUrl, null);
}

// ─── RECEIPT REMOVE ──────────────────────────────────────────────────────────
async function removeReceipt(txnId) {
  const t = TX.find(x => x.id === txnId);
  if (!t) return;
  const prevRc = t.rc, prevUrl = t.rc_url;
  t.rc = false; t.rc_url = '';
  updStats(); buildList(); buildDetail(); buildSheet(); buildRecent(); buildAttention();

  if (!DASHBOARD_DATA_URL || DASHBOARD_DATA_URL.startsWith('%%')) return;
  const uploadUrl = DASHBOARD_DATA_URL.replace(/\/dashboard-data$/, '') + '/upload-receipt';
  try {
    const r = await authFetch(uploadUrl, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txn_id: txnId }),
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      t.rc = prevRc; t.rc_url = prevUrl;
      updStats(); buildList(); buildDetail(); buildSheet();
      toast('Sync failed', 'Could not clear receipt from sheet: ' + (d.error || ''), 'error');
    } else {
      toast('Receipt removed', 'Link cleared from sheet. File remains in Drive.', 'info');
    }
  } catch (e) {
    t.rc = prevRc; t.rc_url = prevUrl;
    updStats(); buildList(); buildDetail(); buildSheet();
    toast('Sync failed', 'Network error: ' + e.message, 'error');
  }
}

async function saveField(txnId, field, value, txField){
  const t=TX.find(x=>x.id===txnId);
  if(!t) return;
  const prev=t[txField];
  if(value===prev||(value===''&&!prev)) return; // no change
  const prevSt=t.st;
  t[txField]=value;
  // Sync effective status change to partial if applicable
  const eSt=effectiveSt(t);
  if((prevSt==='pending'||prevSt==='notified')&&eSt==='partial') t.st='partial';
  updStats();buildList();buildDetail();buildSheet();buildRecent();buildAttention();
  if(!DASHBOARD_DATA_URL||DASHBOARD_DATA_URL.startsWith('%%')) return;
  try{
    const patches=[{txn_id:txnId, field, value}];
    if(t.st!==prevSt) patches.push({txn_id:txnId, field:'status', value:t.st});
    for(const p of patches){
      const r=await authFetch(DASHBOARD_DATA_URL,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(p)
      });
      const d=await r.json();
      if(!r.ok||d.error) throw new Error(d.error||'HTTP '+r.status);
    }
    toast('Saved',`${field.replace(/_/g,' ')} updated`,'success');
  }catch(e){
    t[txField]=prev; t.st=prevSt;
    updStats();buildList();buildDetail();buildSheet();buildRecent();buildAttention();
    toast('Sync failed',e.message||'Network error','error');
  }
}

async function markDone(id){
  const t=TX.find(x=>x.id===id);
  if(!t||t.st==='pushed') return;

  // Optimistic local update — revert on failure
  const prev=t.st;
  t.st='complete';
  updStats();buildList();buildDetail();buildSheet();buildRecent();buildAttention();
  toast('Filing…',t.m+' — syncing to sheet…','info');

  // Write back to Google Sheets via Worker PATCH
  if(!DASHBOARD_DATA_URL||DASHBOARD_DATA_URL.startsWith('%%')) return;
  try{
    const r=await authFetch(DASHBOARD_DATA_URL,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({txn_id:t.id, field:'status', value:'complete'})
    });
    const d=await r.json();
    if(!r.ok||d.error){
      // Revert on failure
      t.st=prev;
      updStats();buildList();buildDetail();buildSheet();buildRecent();buildAttention();
      toast('Sync failed',d.error||'Could not update sheet — try again','error');
      return;
    }
    toast('Filed',t.m+' marked complete and synced to sheet','success');
  }catch(e){
    // Revert on network error
    t.st=prev;
    updStats();buildList();buildDetail();buildSheet();buildRecent();buildAttention();
    toast('Sync failed','Network error — '+e.message,'error');
  }
}

// ─── CARD FILTER CHIPS ───────────────────────────────────────────────────────
function buildChips(){
  const container=document.querySelector('.chips');
  if(!container) return;
  // Remove all chips except the static "All cards" one
  container.querySelectorAll('.chip[data-card]').forEach(c=>c.remove());
  Object.entries(H).forEach(([card,h])=>{
    const btn=document.createElement('button');
    btn.className='chip'+(cfilt===card?' on':'');
    btn.dataset.card=card;
    const np=h.name.trim().split(' ');
    const abbr=np.length>1?np[0][0]+'.'+np[np.length-1]:h.name;
    btn.textContent=`••••${card} ${abbr}`;
    btn.onclick=()=>filt(card,btn);
    btn.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();btn.click();}});
    container.appendChild(btn);
  });
  // Re-sync "All cards" chip active state
  const allBtn=container.querySelector('.chip:not([data-card])');
  if(allBtn) allBtn.classList.toggle('on',cfilt==='ALL');
}

// ─── FILTER ─────────────────────────────────────────────────────────────────
function filt(card,btn){
  cfilt=card;
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  if(btn) btn.classList.add('on');
  else {
    // Called from code (not a click), sync the right chip
    const target=cfilt==='ALL'
      ? document.querySelector('.chip:not([data-card])')
      : document.querySelector(`.chip[data-card="${cfilt}"]`);
    if(target) target.classList.add('on');
  }
  buildList();
}

// ─── STATUS SHEET ────────────────────────────────────────────────────────────
// txnInDateRange — shared helper used by buildSheet, openQB, doQBPush
function txnInDateRange(t){
  if(!dateFrom && !dateTo) return true;
  const d = t.dt || '';
  if(dateFrom && d < dateFrom) return false;
  if(dateTo   && d > dateTo)   return false;
  return true;
}

function buildSheet(){
  const tb=document.getElementById('sheetbody');if(!tb)return;
  const rows=TX.filter(txnInDateRange);
  const done=rows.filter(t=>t.st==='complete'||t.st==='pushed').length;

  tb.innerHTML=rows.length ? rows.map(t=>{
    const h=ch(t.c), c=comp(t);
    const hasRc=!!(t.rc||t.rc_url);
    const rcCell=t.rc_url
      ? `<a href="${t.rc_url}" target="_blank" rel="noopener" style="color:var(--teal);text-decoration:none">View ↗</a>`
      : ci(hasRc);
    const rb=effectiveSt(t)==='pushed'?'rgba(16,185,129,.03)':effectiveSt(t)==='complete'?'rgba(16,185,129,.05)':effectiveSt(t)==='partial'?'rgba(245,158,11,.04)':'';
    const pct=Math.round(c/COMP_TOTAL*100);
    return `<tr style="${rb?'background:'+rb:''}">
      <td class="mono" style="font-size:11px;white-space:nowrap">${fmtDate(t.dt)}</td>
      <td><div style="display:flex;align-items:center;gap:8px">${av(t.c,24)}<span>${h.name}</span></div></td>
      <td class="mono" style="font-size:11px;color:var(--t3)">••••${t.c}</td>
      <td style="max-width:130px;font-size:12px">${t.m}</td>
      <td class="mono" style="text-align:right;font-weight:700">${fmt(t.a)}</td>
      <td style="color:${t.pu?'var(--t1)':'var(--t3)'};">${t.pu||'—'}</td>
      <td style="color:${t.pr?'var(--t1)':'var(--t3)'};">${t.pr||'—'}</td>
      <td style="color:${t.ac?'var(--t1)':'var(--t3)'};">${t.ac||'—'}</td>
      <td style="text-align:center">${rcCell}</td>
      <td style="text-align:center">${ci(t.no)}</td>
      <td>${badge(effectiveSt(t))}</td>
      <td style="min-width:90px">
        <div style="font-size:10px;color:var(--t3);margin-bottom:3px">${c}/${COMP_TOTAL}</div>
        <div class="prog"><div class="progfill" style="width:${pct}%;background:${pcolor(pct)}"></div></div>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="12" style="text-align:center;padding:28px;color:var(--t3);font-size:12px">No transactions for the selected date range</td></tr>`;

  // Footer — show date range context when active
  const sf=document.getElementById('sheetfooter');
  if(sf){
    const rangeText=(dateFrom||dateTo)
      ? ` · ${dateFrom&&dateTo&&dateFrom===dateTo?dateFrom:(dateFrom||'…')+' → '+(dateTo||'…')}`
      : '';
    sf.textContent=`${done} of ${rows.length} transactions complete${rangeText}`;
  }
}

// ─── QB MODAL ────────────────────────────────────────────────────────────────
function openQB(){
  const eligible=TX.filter(t=>t.st==='complete'&&txnInDateRange(t));
  const hasRange=dateFrom||dateTo;
  const rangeLabel=hasRange
    ? (dateFrom===dateTo?dateFrom:(dateFrom||'…')+' → '+(dateTo||'…'))
    : '';

  document.getElementById('qb-list').innerHTML=eligible.length
    ? eligible.map(t=>`
      <div class="modal-listrow">
        <div style="display:flex;align-items:center;gap:10px">${av(t.c,28)}<span style="font-weight:500">${t.m}</span></div>
        <div style="text-align:right">
          <div style="font-family:'JetBrains Mono',monospace;font-weight:700">${fmt(t.a)}</div>
          <div style="font-size:11px;color:var(--t3)">${fmtDate(t.dt)}${t.pr?' · '+t.pr:''}</div>
        </div>
      </div>`).join('')
    : `<div style="padding:16px;text-align:center;color:var(--t3);font-size:13px">No complete transactions${hasRange?' for the selected dates':''}</div>`;

  // Update modal sub-text to show date context
  const sub=document.querySelector('#qboverlay .modal-sub');
  if(sub){
    sub.textContent=hasRange
      ? `Pushing ${eligible.length} complete transaction${eligible.length!==1?'s':''} for ${rangeLabel}.`
      : `Pushing all ${eligible.length} complete, unsynced transaction${eligible.length!==1?'s':''}.`;
  }

  document.getElementById('qboverlay').classList.add('open');
  document.getElementById('qb-confirm').focus();
}
function closeQB(){document.getElementById('qboverlay').classList.remove('open');}

// doQBPush — real async fetch to n8n WF-5 via secure webhook injected at build time
let qbRunning=false;
async function doQBPush(){
  if(qbRunning)return;
  if(!QB_PUSH_URL||QB_PUSH_URL==='https://n8n-space.byp-app.workers.dev/webhook/qb-push'){
    closeQB();
    toast('Not configured','QB_PUSH_URL not set — run a Netlify deploy first','info');
    return;
  }
  qbRunning=true;
  const btn=document.getElementById('qb-confirm');
  btn.disabled=true;
  btn.innerHTML='<i class="ti ti-loader spin" aria-hidden="true"></i> Pushing…';
  try{
    const res=await authFetch(QB_PUSH_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        triggered_by:'dashboard',
        ts:Date.now(),
        date_from: dateFrom||null,
        date_to:   dateTo||null
      })
    });
    if(!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
    const data=await res.json();
    closeQB();
    if(data.status==='ok'){
      // Optimistically mark the pushed transactions locally
      TX.filter(t=>t.st==='complete'&&txnInDateRange(t)).forEach(t=>t.st='pushed');
      updStats();buildList();buildSheet();buildRecent();buildAttention();
      toast('QuickBooks Sync',`${data.pushed} transaction${data.pushed!==1?'s':''} pushed to QBO successfully`,'success');
    } else {
      throw new Error(data.message||'Push returned unexpected response');
    }
  } catch(err){
    toast('Push failed',err.message,'info');
    console.error('[QB Push]',err);
  } finally {
    btn.disabled=false;
    btn.innerHTML='<i class="ti ti-send" aria-hidden="true"></i> Confirm &amp; Push';
    qbRunning=false;
  }
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeQB();});

// ─── CARDHOLDERS ─────────────────────────────────────────────────────────────
function buildHolders(){
  const g=document.getElementById('holdergrid');if(!g)return;
  if(!Object.keys(H).length){
    g.innerHTML='<div class="dempty" style="grid-column:span 2"><i class="ti ti-inbox"></i><span>Waiting for cardholder data from Google Sheets…</span></div>';
    return;
  }
  g.innerHTML=Object.entries(H).map(([card,h])=>{
    const mine=TX.filter(t=>t.c===card);
    const done=mine.filter(t=>t.st==='complete'||t.st==='pushed').length;
    const pend=mine.filter(t=>t.st==='pending'||t.st==='notified').length;
    const spend=mine.reduce((a,t)=>a+parseFloat(t.a||0),0);
    const rate=mine.length?Math.round(done/mine.length*100):0;
    return `<div class="holdercard">
      <div class="holderhdr">
        ${av(card,46)}
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700">${h.name}</div>
          <div style="font-size:12px;color:var(--t3)">${h.role||'Cardholder'} · Card ••••${card}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${rate===100?'var(--teal)':rate>=50?'var(--amber)':'var(--blue)'}">${rate}%</div>
          <div style="font-size:10px;color:var(--t3)">filed</div>
        </div>
      </div>
      <div class="holderstats">
        <div><div class="hstatval">${mine.length}</div><div class="hstatlbl">Total</div></div>
        <div><div class="hstatval" style="color:var(--teal)">${done}</div><div class="hstatlbl">Complete</div></div>
        <div><div class="hstatval" style="color:${pend>0?'var(--blue)':'var(--t3)'}">${pend}</div><div class="hstatlbl">Pending</div></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span style="font-size:12px;color:var(--t3)">Total spend</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;color:var(--amber)">${fmt(spend)}</span>
      </div>
      <div class="prog" style="height:5px;margin-bottom:14px"><div class="progfill" style="width:${rate}%;background:${rate===100?'var(--teal)':rate>=50?'var(--amber)':'var(--blue)'}"></div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" style="flex:1;justify-content:center" onclick="filt('${card}',null);go('feed');">View txns</button>
        ${pend>0?`<button class="btn btn-sm" style="color:var(--amber);border-color:var(--amberRing)" onclick="toast('Slack','Reminder sent to ${h.name} for ${pend} pending txn${pend>1?'s':''}','info')">Remind</button>`:''}
      </div>
    </div>`;
  }).join('');
}

// ─── OVERVIEW: RECENT + ATTENTION ────────────────────────────────────────────
function buildRecent(){
  const el=document.getElementById('ov-recent');if(!el)return;
  const recent=TX.slice(0,5);
  if(!recent.length){el.innerHTML='<div class="dempty"><i class="ti ti-inbox"></i><span>No transactions yet</span></div>';return;}
  el.innerHTML=recent.map(t=>`
    <div class="txnitem" data-txn-id="${esc(t.id)}" onclick="go('feed');sel(this.dataset.txnId)" role="button" tabindex="0" style="cursor:pointer">
      ${av(t.c,32)}
      <div><div class="merchant">${t.m}</div><div class="txnmeta">${ch(t.c).name}${t.tm?' · '+fmtTime(t.tm):''}</div></div>
      <div><div class="amount">${fmt(t.a)}</div><div class="txndate">${fmtDate(t.dt)}</div></div>
      <div>${badge(effectiveSt(t))}</div>
    </div>`).join('');
}
function buildAttention(){
  const el=document.getElementById('ov-attention');if(!el)return;
  const pend=TX.filter(t=>t.st==='pending'||t.st==='notified');
  const cb=document.getElementById('attention-count-badge');
  if(cb){if(pend.length){cb.textContent=pend.length+' pending';cb.style.display='';}else{cb.style.display='none';}}
  if(!pend.length){el.innerHTML='<div style="padding:24px 16px;text-align:center;color:var(--t3);font-size:13px"><i class="ti ti-circle-check" style="color:var(--teal);font-size:28px;display:block;margin-bottom:8px"></i>All caught up!</div>';return;}
  el.innerHTML=pend.slice(0,6).map(t=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--bdr);cursor:pointer" data-txn-id="${esc(t.id)}" onclick="go('feed');sel(this.dataset.txnId)" role="button" tabindex="0">
      ${av(t.c,28)}
      <div style="flex:1"><div style="font-size:12px;font-weight:600">${t.m}</div><div style="font-size:11px;color:var(--t3)">${ch(t.c).name} · ${fmt(t.a)}</div></div>
      ${badge(effectiveSt(t))}
    </div>`).join('');
}

// ─── EXPORT (real CSV download) ───────────────────────────────────────────────
function doExport(){
  const btn=document.getElementById('export-btn');
  const headers=['Date','Cardholder','Card','Merchant','Amount','Purpose','Project','Account Category','Receipt','Receipt URL','Notes','Status'];
  const rows=TX.map(t=>{
    const h=ch(t.c);
    return [t.dt,h.name,'••••'+t.c,t.m,parseFloat(t.a||0).toFixed(2),
            t.pu||'',t.pr||'',t.ac||'',(t.rc||t.rc_url)?'Yes':'No',
            t.rc_url||'',t.no||'',t.st];
  });
  const csv=[headers,...rows].map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download='chase_transactions_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  btn.innerHTML='<i class="ti ti-check" aria-hidden="true"></i> Exported!';
  btn.classList.add('btn-teal');
  setTimeout(()=>{btn.innerHTML='<i class="ti ti-download" aria-hidden="true"></i> Export CSV';btn.classList.remove('btn-teal');},2500);
  toast('Export',`CSV downloaded — ${TX.length} transaction${TX.length!==1?'s':''}  `,'success');
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function toast(title,msg,type='info'){
  const icons={success:'ti-circle-check','new-txn':'ti-bolt',info:'ti-info-circle'};
  const colors={success:'var(--teal)','new-txn':'var(--amber)',info:'var(--blue)'};
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<i class="ti ${icons[type]||'ti-info-circle'}" style="color:${colors[type]||'var(--blue)'}" aria-hidden="true"></i><div><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>`;
  const container=document.getElementById('toasts');
  container.appendChild(el);
  setTimeout(()=>el.remove(),5500);
}

// ─── NEW TRANSACTION CARD ────────────────────────────────────────────────────
let _newTxnQueue=[];
let _newTxnTimer=null;

function _showNextTxnCard(){
  if(!_newTxnQueue.length){ dismissNewTxnCard(); return; }
  const msg=_newTxnQueue.shift();
  const card=document.getElementById('new-txn-card');
  const msgEl=document.getElementById('new-txn-card-msg');
  if(!card||!msgEl) return;
  msgEl.textContent=msg;
  card.style.display='block';
  card.style.animation='none';
  void card.offsetWidth;
  card.style.animation='toastIn .3s ease-out';
  if(_newTxnTimer) clearTimeout(_newTxnTimer);
  _newTxnTimer=setTimeout(_showNextTxnCard, 6000);
}
function showNewTxnCard(msgs){
  const arr=Array.isArray(msgs)?msgs:[msgs];
  _newTxnQueue=arr.slice();
  _showNextTxnCard();
}
function dismissNewTxnCard(){
  const card=document.getElementById('new-txn-card');
  if(card) card.style.display='none';
  if(_newTxnTimer){ clearTimeout(_newTxnTimer); _newTxnTimer=null; }
  _newTxnQueue=[];
}

// ─── CHARTS ──────────────────────────────────────────────────────────────────
function initCharts(){
  Chart.defaults.color='#4F6285';
  Chart.defaults.borderColor='rgba(255,255,255,0.06)';
  Chart.defaults.font.family="'Inter',system-ui,sans-serif";
  Chart.defaults.font.size=11;

  // Build last-7-days labels from real dates (no hardcoded demo data)
  const days=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    days.push({
      label: i===0?'Today':d.toLocaleDateString('en-US',{weekday:'short'}),
      iso:   d.toISOString().slice(0,10)
    });
  }

  // Collect unique projects from real TX data
  const projects=[...new Set(TX.map(t=>t.pr).filter(Boolean))].slice(0,5);
  const projectColors=['rgba(245,158,11,.7)','rgba(96,165,250,.7)','rgba(16,185,129,.7)','rgba(167,139,250,.7)','rgba(248,113,113,.7)'];

  const datasets = projects.length
    ? projects.map((proj,i)=>({
        label: proj,
        data:  days.map(d=>TX.filter(t=>t.pr===proj&&t.dt===d.iso).reduce((a,t)=>a+parseFloat(t.a||0),0)),
        backgroundColor: projectColors[i%projectColors.length],
        borderRadius:4, barPercentage:.7
      }))
    : [{
        label:'No data yet',
        data: days.map(()=>0),
        backgroundColor:'rgba(255,255,255,0.04)',
        borderRadius:4, barPercentage:.7
      }];

  const _cp=Chart.getChart(document.getElementById('chartProject')); if(_cp) _cp.destroy();
  new Chart(document.getElementById('chartProject'),{
    type:'bar',
    data:{ labels:days.map(d=>d.label), datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:projects.length>0, labels:{boxWidth:11,boxHeight:11,borderRadius:3,padding:16,color:'#8B9CB8',usePointStyle:true}},
        ...(projects.length===0 && { annotation:{} })
      },
      scales:{
        x:{stacked:true,grid:{display:false},ticks:{color:'#4F6285'}},
        y:{stacked:true,grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4F6285',callback:v=>'$'+v.toLocaleString()},min:0}
      }
    }
  });

  // Donut — only render when real cardholder + spend data exists
  const cardSpend=Object.entries(H).map(([card,h])=>({
    label:h.name,
    val:TX.filter(t=>t.c===card).reduce((a,t)=>a+parseFloat(t.a||0),0),
    col:h.col||h.color||'#8B9CB8'
  })).filter(x=>x.val>0);

  const legendEl=document.getElementById('chartCard-legend');
  if(cardSpend.length){
    const _cc=Chart.getChart(document.getElementById('chartCard')); if(_cc) _cc.destroy();
    new Chart(document.getElementById('chartCard'),{
      type:'doughnut',
      data:{
        labels:cardSpend.map(x=>x.label),
        datasets:[{data:cardSpend.map(x=>x.val),backgroundColor:cardSpend.map(x=>x.col+'BF'),borderColor:cardSpend.map(x=>x.col),borderWidth:1.5,hoverOffset:8}]
      },
      options:{
        responsive:true,maintainAspectRatio:false,cutout:'68%',
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${fmt(ctx.parsed)}`}}
        }
      }
    });
    // Custom legend — dot + name + amount, scrollable
    if(legendEl) legendEl.innerHTML=cardSpend.map(x=>`
      <div style="display:flex;align-items:center;gap:7px;min-width:0">
        <span style="flex-shrink:0;width:8px;height:8px;border-radius:50%;background:${x.col}"></span>
        <span style="font-size:11px;color:var(--t2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.label}</span>
        <span style="flex-shrink:0;font-size:11px;color:var(--t3);font-variant-numeric:tabular-nums">${fmt(x.val)}</span>
      </div>`).join('');
  } else {
    // Empty state — no data yet
    const _cc=Chart.getChart(document.getElementById('chartCard')); if(_cc) _cc.destroy();
    document.getElementById('chartCard').style.display='none';
    if(legendEl) legendEl.innerHTML=`
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:var(--t3)">
        <i class="ti ti-chart-donut" style="font-size:32px;opacity:.25"></i>
        <span style="font-size:12px">No spend data yet</span>
      </div>`;
  }
}

// ─── STATUS FILTER ───────────────────────────────────────────────────────────
function toggleStatusFilter(){
  const pop=document.getElementById('sf-pop');
  const isOpen=pop.style.display==='block';
  closeAllPopovers();
  pop.style.display=isOpen?'none':'block';
}

function setSFilter(status, el){
  sFilter=status;
  document.querySelectorAll('.sf-opt').forEach(o=>o.classList.remove('on'));
  if(el) el.classList.add('on');
  // Show amber dot on filter button when not "ALL"
  const dot=document.getElementById('sf-dot');
  if(dot) dot.style.display=sFilter==='ALL'?'none':'block';
  closeAllPopovers();
  buildList();
}

function goToNeedsAttention(){
  cfilt='ALL';
  const allChip=document.querySelector('.chip:not([data-card])');
  if(allChip){document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));allChip.classList.add('on');}
  setSFilter('pending', document.getElementById('sfo-pending'));
  go('feed');
}

// ─── DATE FILTER ─────────────────────────────────────────────────────────────
function toggleDatePicker(){
  const pop=document.getElementById('dp-pop');
  const isOpen=pop.style.display==='block';
  closeAllPopovers();
  pop.style.display=isOpen?'none':'block';
}

function setQuickDate(type, el){
  const now=new Date();
  const toISO=d=>d.toISOString().slice(0,10);
  activeDateQuick=type;
  document.querySelectorAll('#dp-pop .dp-qbtn').forEach(b=>b.classList.remove('on'));
  if(el) el.classList.add('on');
  if(type==='today'){
    dateFrom=dateTo=toISO(now);
  } else if(type==='week'){
    const mon=new Date(now);
    mon.setDate(now.getDate()-((now.getDay()||7)-1));
    dateFrom=toISO(mon); dateTo=toISO(now);
  } else if(type==='month'){
    dateFrom=toISO(new Date(now.getFullYear(),now.getMonth(),1));
    dateTo=toISO(now);
  } else if(type==='prev-month'){
    const pm=new Date(now.getFullYear(),now.getMonth()-1,1);
    const pme=new Date(now.getFullYear(),now.getMonth(),0);
    dateFrom=toISO(pm); dateTo=toISO(pme);
  } else {
    dateFrom=dateTo='';
  }
  const fromEl=document.getElementById('dp-from');
  const toEl  =document.getElementById('dp-to');
  if(fromEl) fromEl.value=dateFrom;
  if(toEl)   toEl.value  =dateTo;
  _applyDateState();
  closeAllPopovers();
}

function onDateInputChange(){
  // Clear quick-select highlight when user manually edits dates
  document.querySelectorAll('.dp-qbtn').forEach(b=>b.classList.remove('on'));
  activeDateQuick='custom';
}

function applyDateFilter(){
  dateFrom=document.getElementById('dp-from')?.value||'';
  dateTo  =document.getElementById('dp-to')?.value  ||'';
  // Swap if from > to
  if(dateFrom&&dateTo&&dateFrom>dateTo){[dateFrom,dateTo]=[dateTo,dateFrom];}
  _applyDateState();
  closeAllPopovers();
}

function clearDateFilter(){
  dateFrom=dateTo=''; activeDateQuick='all';
  const fromEl=document.getElementById('dp-from');
  const toEl  =document.getElementById('dp-to');
  if(fromEl) fromEl.value='';
  if(toEl)   toEl.value  ='';
  document.querySelectorAll('#dp-pop .dp-qbtn').forEach(b=>b.classList.remove('on'));
  const allBtn=document.getElementById('dp-all-btn');
  if(allBtn) allBtn.classList.add('on');
  _applyDateState();
}

function _applyDateState(){
  // Update label button
  const lbl=document.getElementById('dp-label');
  const dot=document.getElementById('dp-dot');
  const badge=document.getElementById('dp-active-badge');
  const rangeText=document.getElementById('dp-range-text');
  const hasRange=!!(dateFrom||dateTo);
  if(lbl){
    if(!hasRange)          lbl.textContent='All dates';
    else if(dateFrom===dateTo) lbl.textContent=dateFrom;
    else lbl.textContent=(dateFrom||'…')+' → '+(dateTo||'…');
  }
  if(dot)   dot.style.display=hasRange?'block':'none';
  if(badge) badge.style.display=hasRange?'flex':'none';
  if(rangeText&&hasRange){
    rangeText.textContent=(dateFrom===dateTo?dateFrom:(dateFrom||'…')+' → '+(dateTo||'…'));
  }
  buildSheet();
}

// ─── NOTIFICATION CENTER ─────────────────────────────────────────────────────
let _notifs = [];           // {id, msg, time, type, read}
let _notifTab = 'all';      // 'all' | 'unread'
let _prevNotifsLoaded = false;
let _notifIdSeq = 0;

function _timeAgo(ts){
  const diff = Math.floor((Date.now() - ts) / 1000);
  if(diff < 60)    return 'Just now';
  if(diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if(diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function pushNotif(msg, type='txn', txnId=null){
  const n={id:++_notifIdSeq, msg, type, txnId, time:Date.now(), read:false};
  _notifs.unshift(n);
  if(_notifs.length > 100) _notifs.length=100;
  _renderNotifBadge();
  if(document.getElementById('notif-panel').classList.contains('open')) _renderNotifBody();
}

function _renderNotifBadge(){
  const unread=_notifs.filter(n=>!n.read).length;
  const badge=document.getElementById('notif-badge');
  if(badge){
    badge.textContent=unread>99?'99+':String(unread);
    badge.style.display=unread?'flex':'none';
  }
}

function _renderNotifBody(){
  const body=document.getElementById('notif-body');
  if(!body) return;
  const items=_notifTab==='unread'?_notifs.filter(n=>!n.read):_notifs;
  if(!items.length){
    body.innerHTML=`<div class="notif-empty"><i class="ti ti-bell-off" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px"></i>${_notifTab==='unread'?'No unread notifications':'No notifications yet'}</div>`;
    return;
  }
  // Split into new (unread) and earlier (read)
  const unread=items.filter(n=>!n.read);
  const read=items.filter(n=>n.read);
  let html='';
  if(unread.length){
    html+=`<div class="notif-section-lbl">New</div>`;
    html+=unread.map(n=>_notifItemHtml(n)).join('');
  }
  if(read.length){
    html+=`<div class="notif-section-lbl">Earlier</div>`;
    html+=read.map(n=>_notifItemHtml(n)).join('');
  }
  body.innerHTML=html;
}

function _notifItemHtml(n){
  const iconClass=n.type==='txn'?'slack':n.type==='success'?'system':'system';
  const icon=n.type==='txn'?'ti-brand-slack':n.type==='error'?'ti-alert-circle':'ti-info-circle';
  return `<div class="notif-item${n.read?'':' unread'}" onclick="readAndGoToNotif(${n.id})">
    <div class="notif-icon ${iconClass}"><i class="ti ${icon}"></i></div>
    <div class="notif-content">
      <div class="notif-msg">${n.msg}</div>
      <div class="notif-time">${_timeAgo(n.time)}</div>
    </div>
    ${n.read?'':'<div class="notif-dot"></div>'}
  </div>`;
}

function readNotif(id){
  const n=_notifs.find(x=>x.id===id);
  if(n) n.read=true;
  _renderNotifBadge();
  _renderNotifBody();
}
function readAndGoToNotif(id){
  const n=_notifs.find(x=>x.id===id);
  if(n) n.read=true;
  _renderNotifBadge();
  closeAllPopovers();
  if(n&&n.txnId){
    // Ensure the transaction is visible (expand date range if needed)
    const t=TX.find(x=>x.id===n.txnId);
    if(t&&t.dt){
      if(feedActiveDateQuick!=='all'&&(t.dt<feedDateFrom||t.dt>feedDateTo)){
        // Transaction is outside current date range — expand to All Time
        feedDateFrom=feedDateTo='';
        feedActiveDateQuick='all';
        document.querySelectorAll('#feed-dp-pop .dp-qbtn').forEach(b=>b.classList.remove('on'));
        const allBtn=document.getElementById('feed-dp-all-btn');
        if(allBtn) allBtn.classList.add('on');
        const lbl=document.getElementById('feed-dp-label');
        if(lbl) lbl.textContent='All Time';
      }
    }
    selId=n.txnId;
    go('feed',true);
    // Highlight the row after render
    requestAnimationFrame(()=>{
      buildList(); buildDetail();
      requestAnimationFrame(()=>{
        const allRows=document.querySelectorAll('.txnitem');
        const row=[...allRows].find(r=>r.dataset.txnId===n.txnId);
        if(row){
          row.scrollIntoView({behavior:'smooth',block:'center'});
          row.classList.add('notif-highlight');
          setTimeout(()=>row.classList.remove('notif-highlight'),2500);
        }
      });
    });
  } else {
    go('feed',true);
  }
}

function markAllNotifRead(){
  _notifs.forEach(n=>n.read=true);
  _renderNotifBadge();
  _renderNotifBody();
}

function switchNotifTab(tab, el){
  _notifTab=tab;
  document.querySelectorAll('.notif-tab').forEach(t=>t.classList.remove('on'));
  if(el) el.classList.add('on');
  _renderNotifBody();
}

function toggleNotifPanel(){
  const panel=document.getElementById('notif-panel');
  const isOpen=panel.classList.contains('open');
  closeAllPopovers();
  if(!isOpen){
    panel.classList.add('open');
    _renderNotifBody();
  }
}

function loadPrevNotifs(){
  if(_prevNotifsLoaded) return;
  _prevNotifsLoaded=true;
  // Show TX history as notifications (oldest 20 already-loaded transactions)
  const hist=[...TX].sort((a,b)=>a.dt<b.dt?1:-1).slice(6,26);
  hist.forEach(t=>{
    const cname=ch(t.c).name||('Card ••••'+t.c);
    _notifs.push({
      id:++_notifIdSeq,
      msg:`${fmt(t.a)} at ${t.m} — ${cname} notified in Slack`,
      type:'txn', txnId:t.id, time:new Date(t.dt+'T'+(t.tm||'12:00')).getTime(), read:true
    });
  });
  _renderNotifBody();
}

// ─── LIVE FEED DATE FILTER ───────────────────────────────────────────────────
function inFeedDateRange(d){
  if(!feedDateFrom && !feedDateTo) return true;
  if(!d) return true;
  const dt=d.slice(0,10);
  if(feedDateFrom && dt < feedDateFrom) return false;
  if(feedDateTo   && dt > feedDateTo)   return false;
  return true;
}

function toggleFeedDatePicker(){
  const pop=document.getElementById('feed-dp-pop');
  const isOpen=pop.style.display==='block';
  closeAllPopovers();
  pop.style.display=isOpen?'none':'block';
}

function setFeedQuickDate(type, el){
  const now=new Date();
  feedActiveDateQuick=type;
  document.querySelectorAll('#feed-dp-pop .dp-qbtn').forEach(b=>b.classList.remove('on'));
  if(el) el.classList.add('on');
  if(type==='today'){
    feedDateFrom=feedDateTo=_toISO(now);
  } else if(type==='week'){
    const mon=new Date(now);
    mon.setDate(now.getDate()-((now.getDay()||7)-1));
    feedDateFrom=_toISO(mon); feedDateTo=_toISO(now);
  } else if(type==='month'){
    feedDateFrom=_toISO(new Date(now.getFullYear(),now.getMonth(),1));
    feedDateTo=_toISO(now);
  } else if(type==='prev-month'){
    const pm=new Date(now.getFullYear(),now.getMonth()-1,1);
    const pme=new Date(now.getFullYear(),now.getMonth(),0);
    feedDateFrom=_toISO(pm); feedDateTo=_toISO(pme);
  } else {
    feedDateFrom=feedDateTo='';
  }
  const fromEl=document.getElementById('feed-dp-from');
  const toEl  =document.getElementById('feed-dp-to');
  if(fromEl) fromEl.value=feedDateFrom;
  if(toEl)   toEl.value  =feedDateTo;
  _applyFeedDateState();
  closeAllPopovers();
}

function onFeedDateInputChange(){
  document.querySelectorAll('#feed-dp-pop .dp-qbtn').forEach(b=>b.classList.remove('on'));
  feedActiveDateQuick='custom';
}

function applyFeedDateFilter(){
  feedDateFrom=document.getElementById('feed-dp-from')?.value||'';
  feedDateTo  =document.getElementById('feed-dp-to')?.value  ||'';
  if(feedDateFrom&&feedDateTo&&feedDateFrom>feedDateTo){[feedDateFrom,feedDateTo]=[feedDateTo,feedDateFrom];}
  feedActiveDateQuick='custom';
  _applyFeedDateState();
  closeAllPopovers();
}

function clearFeedDateFilter(){
  feedDateFrom=feedDateTo=''; feedActiveDateQuick='all';
  const fromEl=document.getElementById('feed-dp-from');
  const toEl  =document.getElementById('feed-dp-to');
  if(fromEl) fromEl.value='';
  if(toEl)   toEl.value  ='';
  document.querySelectorAll('#feed-dp-pop .dp-qbtn').forEach(b=>b.classList.remove('on'));
  const allBtn=document.getElementById('feed-dp-all-btn');
  if(allBtn) allBtn.classList.add('on');
  _applyFeedDateState();
}

function _applyFeedDateState(){
  const lbl=document.getElementById('feed-dp-label');
  const dot=document.getElementById('feed-dp-dot');
  const hasRange=!!(feedDateFrom||feedDateTo);
  const labels={today:'Today',week:'This Week',month:'This Month','prev-month':'Last Month',all:'All Time',custom:'Custom'};
  if(lbl) lbl.textContent=labels[feedActiveDateQuick]||(feedDateFrom&&feedDateTo&&feedDateFrom===feedDateTo?feedDateFrom:(feedDateFrom||'…')+' → '+(feedDateTo||'…'));
  if(dot) dot.style.display=(feedActiveDateQuick==='all'&&!hasRange)?'none':'block';
  buildList();
  if(selId){ const t=TX.find(x=>x.id===selId); if(!t||!inFeedDateRange(t.dt)) selId=null; }
  buildDetail();
}

// ─── CLOSE ALL POPOVERS ───────────────────────────────────────────────────────
function closeAllPopovers(){
  const np=document.getElementById('notif-panel');
  if(np) np.classList.remove('open');
  ['sf-pop','dp-pop','feed-dp-pop'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
}
// Close on outside click
document.addEventListener('click',e=>{
  if(!e.target.closest('.sf-wrap')&&!e.target.closest('.dp-wrap')&&!e.target.closest('#notif-panel')&&!e.target.closest('#notif-btn')) closeAllPopovers();
});


// ─── WORKFLOW CARDS ──────────────────────────────────────────────────────────
function buildWorkflowCards(wfs, checkedAt){
  // Returns colored HTML for a workflow's active state
  function statusHtml(wf){
    if(!wf||wf.active===null) return `<span style="color:var(--t3)">Not found in n8n</span>`;
    if(wf.active)  return `<span style="color:var(--teal)">Active</span>`;
    return `<span style="color:var(--amber)">Inactive</span>`;
  }
  // Returns colored HTML for last execution time (from lastExec object)
  function lastRunHtml(wf){
    if(!wf||!wf.lastExec||!wf.lastExec.startedAt) return `<span style="color:var(--t3)">Never</span>`;
    const d=new Date(wf.lastExec.startedAt);
    const ago=Math.round((Date.now()-d)/60000);
    const color=wf.lastExec.status==='error'?'var(--red)':wf.lastExec.status==='success'?'var(--teal)':'var(--t2)';
    const label=ago<1?'Just now':ago<60?`${ago}m ago`:ago<1440?`${Math.round(ago/60)}h ago`:d.toLocaleDateString();
    return `<span style="color:${color}">${label}</span>`;
  }
  // Returns colored HTML for webhook/integration status
  function hookHtml(wf){
    if(!wf||wf.active===null) return `<span style="color:var(--t3)">—</span>`;
    if(wf.active) return `<span style="color:var(--teal)">Active</span>`;
    return `<span style="color:var(--t3)">Not configured</span>`;
  }
  // Update per-WF rows
  const map={
    WF1:{status:'wf1-status',lastrun:'wf1-lastrun'},
    WF2:{status:'wf2-status',lastrun:'wf2-lastrun'},
    WF3:{status:'wf3-status',lastrun:'wf3-lastrun'},
    WF4:{status:'wf4-status',lastrun:'wf4-lastrun'},
    WF5:{status:'wf5-status',lastrun:'wf5-lastsync'},
    WF6:{status:'wf6-status',lastrun:'wf6-lastrun'},
  };
  Object.entries(map).forEach(([key,ids])=>{
    const wf=wfs[key];
    const s=document.getElementById(ids.status);  if(s) s.innerHTML=statusHtml(wf);
    const r=document.getElementById(ids.lastrun); if(r) r.innerHTML=lastRunHtml(wf);
  });
  // WF2 extras
  const wf2tpl=document.getElementById('wf2-template');
  if(wf2tpl) wf2tpl.innerHTML=wfs.WF2?.active?`<span style="color:var(--teal)">Configured</span>`:`<span style="color:var(--t3)">Not configured</span>`;
  // WF3 interactivity webhook
  const wf3h=document.getElementById('wf3-webhook'); if(wf3h) wf3h.innerHTML=hookHtml(wfs.WF3);
  // WF6 webhook
  const wf6h=document.getElementById('wf6-webhook'); if(wf6h) wf6h.innerHTML=hookHtml(wfs.WF6);
  // Header last-checked label
  const wfLbl=document.getElementById('dot-workflow-lbl');
  const allOn=Object.values(wfs).every(w=>w.active===true);
  const anyErr=Object.values(wfs).some(w=>w.active===false&&w.active!==null);
  if(wfLbl&&checkedAt){
    const t=new Date(checkedAt).toLocaleTimeString();
    wfLbl.textContent=allOn?`All systems operational — checked ${t}`:`${Object.values(wfs).filter(w=>w.active).length}/6 active — checked ${t}`;
  }
}

// ─── SYSTEM STATUS ───────────────────────────────────────────────────────────
// _wfLive filled by pollN8nStatus(); each entry: { active, edited, err }
let _wfLive = {};

function applyDot(id, state){
  const el=document.getElementById(id);
  if(el) el.className=`sysdot ${state}`;
}

// Worst-case state across a list of WF keys.
// Priority: err > warn(edited+inactive) > off(inactive) > on(active)
function _worstState(wfKeys){
  let hasOn = false;
  let hasWarn = false;
  let hasErr = false;
  wfKeys.forEach(key => {
    const wf = _wfLive[key];
    if(!wf) return;
    if(wf.err)         hasErr  = true;
    else if(wf.active) hasOn   = true;
    else if(wf.warn)   hasWarn = true;
  });
  if(hasErr)  return 'err';
  if(hasWarn) return 'warn';
  if(hasOn)   return 'on';
  return 'off';
}

// Derive header sysdots + Live badge from _wfLive.
// Mapping:
//   n8n + Plaid  <- WF1
//   Slack        <- worst(WF2, WF3)
//   Sheets       <- worst(WF4, WF6)
//   QuickBooks   <- WF5
function syncSysdotsFromWFs(){
  const wf1State=_worstState(['WF1']);
  applyDot('dot-n8n',   wf1State);
  applyDot('dot-plaid', wf1State);
  applyDot('dot-slack',  _worstState(['WF2','WF3']));
  applyDot('dot-sheets', _worstState(['WF4','WF6']));
  applyDot('dot-qb',     _worstState(['WF5']));
  const badge=document.getElementById('netlify-live-badge');
  if(badge) badge.style.display=wf1State==='on'?'inline':'none';

  // Derive coreOn from actual WF state, not stale SYS_STATUS
  const coreOn = wf1State === 'on';

  // Update SYS_STATUS so initSysStatus-style checks stay consistent
  SYS_STATUS.n8n   = coreOn ? 'on' : 'off';
  SYS_STATUS.plaid = coreOn ? 'on' : 'off';

  // Update all live labels
  ['dot-overview','dot-recent','dot-feed'].forEach(id => applyDot(id, coreOn ? 'on' : wf1State));

  const syncTime = SYS_STATUS.syncTs
    ? ' — last sync ' + new Date(SYS_STATUS.syncTs).toLocaleTimeString()
    : '';

  const ovLbl = document.getElementById('dot-overview-lbl');
  if(ovLbl) ovLbl.textContent = coreOn
    ? 'Live' + syncTime
    : wf1State === 'err' ? 'n8n unreachable — check HF Space' : 'Not connected — complete setup to see live data';

  const feedLbl = document.getElementById('dot-feed-lbl');
  if(feedLbl) feedLbl.textContent = coreOn ? 'Live' : wf1State === 'err' ? 'n8n unreachable' : 'Not connected';
}

function initSysStatus(){
  // Labels start as "Not connected" via HTML defaults.
  // pollN8nStatus will call syncSysdotsFromWFs which updates everything once data arrives.
  pollN8nStatus();
  setInterval(pollN8nStatus, 90000);
}

async function pollN8nStatus(){
  if(!N8N_STATUS_URL||N8N_STATUS_URL.startsWith('%%')) return;
  let data;
  try{
    const r=await authFetch(N8N_STATUS_URL+'?_nc='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('http '+r.status);
    data=await r.json();
  }catch(e){
    for(let i=1;i<=6;i++){
      const key='WF'+i;
      _wfLive[key]={active:false,edited:false,err:true};
    }
    applyDot('dot-workflow','err');
    for(let i=1;i<=6;i++) applyDot(`dot-wf${i}`,'err');
    const wfLbl=document.getElementById('dot-workflow-lbl');
    if(wfLbl) wfLbl.textContent='n8n unreachable — HF Space may be sleeping';
    syncSysdotsFromWFs();
    return;
  }
  if(!data.reachable){
    for(let i=1;i<=6;i++){
      const key='WF'+i;
      _wfLive[key]={active:false,edited:false,err:true};
    }
    applyDot('dot-workflow','err');
    for(let i=1;i<=6;i++) applyDot(`dot-wf${i}`,'err');
    const wfLbl=document.getElementById('dot-workflow-lbl');
    if(wfLbl) wfLbl.textContent='n8n unreachable — '+(data.error||'unknown error');
    syncSysdotsFromWFs();
    return;
  }
  const wfs=data.workflows||{};
  const keyToNum={WF1:1,WF2:2,WF3:3,WF4:4,WF5:5,WF6:6};
  Object.entries(wfs).forEach(([key,wf])=>{
    const n=keyToNum[key];if(!n) return;
    // active=true → green, active=false+id found → warn (edited/inactive), active=null → off, err → red
    const isWarn = wf.active === false && wf.id !== null;
    _wfLive[key]={active:!!wf.active, warn:isWarn, err:!!wf.err};
    let dotState;
    if(wf.err)         dotState='err';
    else if(wf.active) dotState='on';
    else if(isWarn)    dotState='warn';
    else               dotState='off';
    applyDot(`dot-wf${n}`, dotState);
  });
  const allActive=Object.values(wfs).every(w=>w.active===true);
  const anyEdited=Object.values(wfs).some(w=>w.active===false&&w.id!==null);
  const anyErr   =Object.values(wfs).some(w=>w.err===true);
  const headerState=anyErr?'err':allActive?'on':anyEdited?'warn':'off';
  applyDot('dot-workflow',headerState);
  buildWorkflowCards(wfs, data.checkedAt);
  syncSysdotsFromWFs();
}

// ─── LIVE DATA LOAD ──────────────────────────────────────────────────────────
// Fetches TX[] and H{} from the Cloudflare Worker /dashboard-data endpoint.
// Runs on page load and every 5 minutes. No page reload needed.
let _lastSyncTs = '';

let _loadInProgress=false;
async function loadDashboardData(silent=false){
  if(_loadInProgress) return;
  _loadInProgress=true;
  if(!DASHBOARD_DATA_URL||DASHBOARD_DATA_URL.startsWith('%%')) return;
  try{
    const r=await authFetch(DASHBOARD_DATA_URL+'?_nc='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    if(d.error){
      if(!silent) toast('Data error',d.error,'error');
      return;
    }

    // Snapshot existing IDs BEFORE overwriting TX so we can detect truly new ones
    const prevTxIds = new Set(TX.map(t=>t.id));
    const isFirstLoad = !_lastSyncTs;

    // Populate global TX, H, and PROJECTS, then re-render everything
    TX=d.transactions||[];
    const newH=d.cardholders||{};
    Object.keys(newH).forEach(k=>{H[k]=newH[k];});
    if(d.projects&&d.projects.length){ PROJECTS=d.projects; setSyncStatus('synced'); }

    // Update SYS_STATUS counts now that we have real data
    SYS_STATUS.txnCount=TX.length;
    SYS_STATUS.cardCount=Object.keys(H).length;
    if(d.syncTs) SYS_STATUS.syncTs=d.syncTs;

    updStats();
    buildChips();
    buildList();
    buildRecent();
    buildAttention();
    if(PROJECTS.length) buildProjects();
    if(selId) buildDetail();

    const ovLbl=document.getElementById('dot-overview-lbl');
    if(ovLbl&&d.syncTs) ovLbl.textContent='Live — last sync '+new Date(d.syncTs).toLocaleTimeString();

    if(!isFirstLoad){
      const newTxns=TX.filter(t=>!prevTxIds.has(t.id));
      if(newTxns.length){
        const msgMap=newTxns.map(t=>{
          const cname=ch(t.c).name||('Card ••••'+t.c);
          return {msg:`${fmt(t.a)} at ${t.m} — ${cname} notified in Slack`, txnId:t.id};
        });
        showNewTxnCard(msgMap.map(x=>x.msg));
        msgMap.forEach(x=>pushNotif(x.msg,'txn',x.txnId));
      }
    } else if(!silent){
      toast('Dashboard loaded',`${TX.length} transactions across ${Object.keys(H).length} card${Object.keys(H).length!==1?'s':''}. Monitoring active.`,'success');
    }
    if(d.syncTs) _lastSyncTs=d.syncTs;
  }catch(e){
    if(!silent) toast('Connection error','Could not reach Worker: '+e.message,'error');
  }finally{
    _loadInProgress=false;
  }
  try{ initCharts(); }catch(e){ console.error('initCharts failed:',e.message); }
}

// ─── INIT ────────────────────────────────────────────────────────────────────
// initApp() is called by initAuth() once a valid Google session is confirmed.
function initApp(){
  // Poll for fresh data every 30 seconds
  setInterval(()=>loadDashboardData(true), 30*1000);

  tick(); setInterval(tick,1000);
  updStats(); buildList(); buildRecent(); buildAttention();
  initSysStatus();

  // Load live transaction data from Cloudflare Worker → Google Sheets
  loadDashboardData(false);

  // Auto-sync projects from Sheets on load (silent — no toast on success)
  (async function initProjects(){
    const urls=[];
    if(DASHBOARD_DATA_URL&&!DASHBOARD_DATA_URL.startsWith('%%'))
      urls.push(DASHBOARD_DATA_URL.replace(/\/dashboard-data$/, '') + '/projects');
    if(PROJECTS_WEBHOOK_URL&&!PROJECTS_WEBHOOK_URL.startsWith('%%'))
      urls.push(PROJECTS_WEBHOOK_URL+'?action=list');
    for(const url of urls){
      try{
        const sep=url.includes('?')?'&':'?';
        const r=await authFetch(url+sep+'_nc='+Date.now(),{cache:'no-store'});
        if(!r.ok) continue;
        const d=await r.json();
        const list=d.projects||d.data||d;
        if(Array.isArray(list)&&list.length){
          PROJECTS=list.map(p=>typeof p==='string'?{name:p,active:true}:p);
          buildProjects();
          setSyncStatus('synced');
          if(selId) buildDetail();
          break;
        }
      }catch(e){}
    }
  })();
}

// Start auth flow — shows login overlay or proceeds directly if token cached
initAuth();
