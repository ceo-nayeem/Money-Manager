/* FinVault — app.js
   ONE file for all app logic. Find a part by searching for “SECTION” (e.g. “SECTION 14 · LOGIN & SESSION”).
   Everything shares one global scope, so sections can call each other freely. Keep the section ORDER. */

/* ══════════════════════════════════════════════════════════════
   SECTION 01 · CONFIG
   Firebase keys, owner email, App Check key — edit when the Firebase project changes.
   ══════════════════════════════════════════════════════════════ */
// We use Firebase Firestore to persist data across devices.
// The app also falls back to localStorage if Firebase is unavailable.

const firebaseConfig = {
  apiKey: "AIzaSyA6yfB8x0tEbfkfMU1iy0l_QCDScM6Jc1c",
  authDomain: "money-manager-v01.firebaseapp.com",
  projectId: "money-manager-v01",
  storageBucket: "money-manager-v01.firebasestorage.app",
  messagingSenderId: "727186041987",
  appId: "1:727186041987:web:1813db6ba4bbc434fa3fb6"
};

// ─── App configuration ──────────────────────────────────────────────────────
// CEO_EMAIL identifies the OWNER. It is a UI hint + legacy-data migration key ONLY.
// Real owner authorization is enforced by firestore.rules (verified Google account
// with this email) — editing this constant in the browser grants nothing.
const CEO_EMAIL = "ceo.nayeemuhammad@gmail.com";
// App Check (optional, free). Leave empty until the reCAPTCHA v3 site key is created
// (see FIREBASE_SETUP.md §7). Empty = App Check disabled = behaviour unchanged.
const APPCHECK_SITE_KEY = "";
// Shared config for the service layer (services/*.js). No secrets belong here.
window.FV_CONFIG = { firebaseConfig, ownerEmail: CEO_EMAIL, appCheckSiteKey: APPCHECK_SITE_KEY };

/* ══════════════════════════════════════════════════════════════
   SECTION 02 · STORAGE
   Local save/load, default data, chart colour helpers.
   ══════════════════════════════════════════════════════════════ */
const STORAGE_KEY='finvault_v3';
// Charts are drawn on canvas with literal color strings, so CSS variables
// can't cascade into them automatically — this reads the *current* theme's
// tokens at chart-build time so charts stay in sync when the theme changes.
function getThemeVar(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()}
// Chart label size: bumped on phones so axis/legend text stays readable (canvas text can't use CSS).
function cfs(){return window.innerWidth<=768?12.5:11}
function cA(v,a){return 'rgba('+getThemeVar(v)+','+a+')'}
function loadData(){const s=localStorage.getItem(STORAGE_KEY);if(s)try{const d=JSON.parse(s);if(d&&Array.isArray(d.transactions))d.transactions.forEach(t=>{if(t.type==='liability')t.type='payable'});return d}catch(e){}return getDefaultData()}
function saveData(){localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA))}
function getDefaultData(){return{profile:{name:'User',openingBalance:0,avatar:''},budgetMonthLimits:{},accounts:[{id:'dbbl',name:'DBBL Bank',shortName:'Dutch-Bangla Bank Ltd.',type:'bank',balance:0,note:'',color:'dbbl',number:''},{id:'bkash',name:'bKash',shortName:'bKash Mobile Banking',type:'mobile',balance:0,note:'',color:'bkash',number:''},{id:'nagad',name:'Nagad',shortName:'Nagad Digital Financial',type:'mobile',balance:0,note:'',color:'nagad',number:''},{id:'cash',name:'Cash',shortName:'Cash in Hand',type:'cash',balance:0,note:'',color:'cash',number:''}],transfers:[],transactions:[],budgets:[],goals:[],investments:[]}}

/* ══════════════════════════════════════════════════════════════
   SECTION 03 · BACKUP
   Export / import / restore / per-section reset (Data & Backup page).
   ══════════════════════════════════════════════════════════════ */
// ── Database / Backup storage ─────────────────────────────────────────────
const LAST_EXPORT_KEY='finvault_last_export_v1';
const LAST_EXPORT_VERSION=1;
function cloneData(data){return JSON.parse(JSON.stringify(data));}
function getLastExportRecord(){
  try{
    const raw=localStorage.getItem(LAST_EXPORT_KEY);
    if(!raw)return null;
    const rec=JSON.parse(raw);
    return rec&&rec.data&&typeof rec.data==='object'?rec:null;
  }catch(e){return null}
}
function setLastExportRecord(record){
  localStorage.setItem(LAST_EXPORT_KEY,JSON.stringify(record));
  renderDatabasePage();
}
function buildExportRecord(){
  return {
    app:'FinVault',
    type:'finvault-data-export',
    version:LAST_EXPORT_VERSION,
    exportedAt:new Date().toISOString(),
    data:cloneData(DATA)
  };
}
function buildExportFilename(dateIso){
  const d=new Date(dateIso);
  const stamp=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const time=[String(d.getHours()).padStart(2,'0'),String(d.getMinutes()).padStart(2,'0'),String(d.getSeconds()).padStart(2,'0')].join('');
  return `FinVault-Export-${stamp}-${time}.json`;
}
function saveLastExportLocally(record){
  try{setLastExportRecord(record);return true}catch(e){
    console.warn('Could not save last export locally:',e);
    return false;
  }
}
async function saveLastExportToCloud(record){
  if(!db)return;
  try{
    const {doc,setDoc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const backupPath=(DOC_PATH||LEGACY_DOC_PATH)+'_backup';
    await setDoc(doc(db,backupPath),{app:record.app,type:record.type,version:record.version,exportedAt:record.exportedAt,data:record.data});
  }catch(e){console.warn('Last export cloud backup failed:',e)}
}
async function getLastExportFromCloud(){
  if(!db)return null;
  try{
    const {doc,getDoc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const backupPath=(DOC_PATH||LEGACY_DOC_PATH)+'_backup';
    const snap=await getDoc(doc(db,backupPath));
    if(!snap.exists())return null;
    const d=snap.data();
    if(!d||!d.data)return null;
    return d;
  }catch(e){console.warn('Last export cloud read failed:',e);return null}
}
function normalizeImportedData(raw){
  if(!raw||typeof raw!=='object')throw new Error('Invalid export file.');
  const data=raw.data&&typeof raw.data==='object'?raw.data:raw;
  if(!Array.isArray(data.transactions))throw new Error('Invalid FinVault export: transactions are missing.');
  const normalized=cloneData(data);
  if(!normalized.profile)normalized.profile={name:'User',openingBalance:0,avatar:''};
  if(!normalized.accounts)normalized.accounts=[];
  if(!normalized.transfers)normalized.transfers=[];
  if(!normalized.budgets)normalized.budgets=[];
  if(!normalized.goals)normalized.goals=[];
  if(!normalized.investments)normalized.investments=[];
  if(!normalized.categories)normalized.categories=cloneData(DEFAULT_CATEGORIES);
  ['expense','income','invest'].forEach(k=>{if(!Array.isArray(normalized.categories[k]))normalized.categories[k]=cloneData(DEFAULT_CATEGORIES[k]);});
  normalized.transactions.forEach(t=>{if(t.type==='liability')t.type='payable'});
  return normalized;
}
function mergeById(current,incoming){
  const result=Array.isArray(current)?current.map(x=>cloneData(x)):[];
  const seen=new Set(result.map(x=>String(x&&x.id)));
  (Array.isArray(incoming)?incoming:[]).forEach(item=>{
    const key=item&&item.id!=null?String(item.id):null;
    if(key&&seen.has(key))return;
    result.push(cloneData(item));
    if(key)seen.add(key);
  });
  return result;
}
function mergeByName(current,incoming){
  const result=Array.isArray(current)?current.map(x=>cloneData(x)):[];
  const seen=new Set(result.map(x=>String(x&&x.name||'').trim().toLowerCase()));
  (Array.isArray(incoming)?incoming:[]).forEach(item=>{
    const key=String(item&&item.name||'').trim().toLowerCase();
    if(key&&seen.has(key))return;
    result.push(cloneData(item));
    if(key)seen.add(key);
  });
  return result;
}
function mergeFinVaultData(incoming){
  const current=cloneData(DATA);
  const merged={...current};
  merged.transactions=mergeById(current.transactions,incoming.transactions);
  merged.transfers=mergeById(current.transfers,incoming.transfers);
  merged.budgets=mergeById(current.budgets,incoming.budgets);
  merged.goals=mergeById(current.goals,incoming.goals);
  merged.investments=mergeById(current.investments,incoming.investments);
  merged.accounts=mergeById(current.accounts,incoming.accounts);
  merged.categories={
    expense:mergeByName(current.categories&&current.categories.expense,incoming.categories&&incoming.categories.expense),
    income:mergeByName(current.categories&&current.categories.income,incoming.categories&&incoming.categories.income),
    invest:mergeByName(current.categories&&current.categories.invest,incoming.categories&&incoming.categories.invest)
  };
  merged.budgetMonthLimits={...(incoming.budgetMonthLimits||{}),...(current.budgetMonthLimits||{})};
  // Keep the currently active profile, but import a real opening balance when the current one is still zero.
  merged.profile={...(incoming.profile||{}),...(current.profile||{})};
  if((current.profile&&Number(current.profile.openingBalance))===0 && incoming.profile && Number(incoming.profile.openingBalance)!==0){
    merged.profile.openingBalance=Number(incoming.profile.openingBalance)||0;
  }
  return merged;
}
function countDataRecords(data){
  return ['transactions','accounts','transfers','budgets','goals','investments'].reduce((n,k)=>n+(Array.isArray(data[k])?data[k].length:0),0);
}
function formatBackupDate(iso){
  try{return new Date(iso).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch(e){return iso||'Unknown'}
}
function renderDatabasePage(){
  const rec=getLastExportRecord();
  const chip=document.getElementById('db-last-export-chip');
  const details=document.getElementById('db-last-export-details');
  if(!chip||!details)return;
  if(!rec){chip.textContent='No export saved';details.textContent='No saved export yet.';renderSectionResetChips();return;}
  chip.textContent='Last export · '+formatBackupDate(rec.exportedAt);
  details.innerHTML=`<div class="db-stat"><span class="db-stat-label">Saved</span><span class="db-stat-value">${formatBackupDate(rec.exportedAt)}</span></div><div class="db-stat"><span class="db-stat-label">Records included</span><span class="db-stat-value">${countDataRecords(rec.data).toLocaleString()}</span></div><div class="db-stat"><span class="db-stat-label">Transactions</span><span class="db-stat-value">${Array.isArray(rec.data.transactions)?rec.data.transactions.length:0}</span></div>`;
  renderSectionResetChips();
}
async function exportFinVaultData(){
  const record=buildExportRecord();
  const json=JSON.stringify(record,null,2);
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=buildExportFilename(record.exportedAt);
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);
  saveLastExportLocally(record);
  await saveLastExportToCloud(record);
  toast('Data exported and saved in Database ✓','success');
}
async function importFinVaultData(raw,sourceLabel='file'){
  try{
    const incoming=normalizeImportedData(raw);
    const incomingRecords=countDataRecords(incoming);
    if(!confirm(`Import ${incomingRecords.toLocaleString()} records from this ${sourceLabel}? Existing data will stay, and matching record IDs will not be duplicated.`))return;
    DATA=mergeFinVaultData(incoming);
    syncCatsFromData();
    localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA));
    await window.saveData();
    renderAll();
    renderDatabasePage();
    toast('Data imported and merged successfully ✓','success');
  }catch(e){
    console.warn('Import failed:',e);
    toast(e.message||'Could not import this export file.','error');
  }
}
function handleImportFile(event){
  const file=event.target.files&&event.target.files[0];
  event.target.value='';
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{importFinVaultData(JSON.parse(reader.result), 'file')}catch(e){toast('Invalid JSON export file.','error')}
  };
  reader.onerror=()=>toast('Could not read the selected file.','error');
  reader.readAsText(file);
}
async function restoreLastExport(){
  let rec=getLastExportRecord();
  if(!rec)rec=await getLastExportFromCloud();
  if(!rec||!rec.data){toast('No last export is available.','error');return;}
  await importFinVaultData(rec,'last saved export');
}
const RESET_KEYS = {
  transactions:'finvault_last_reset_transactions_v1',
  budgets:'finvault_last_reset_budgets_v1',
  goals:'finvault_last_reset_goals_v1',
  investments:'finvault_last_reset_investments_v1'
};
const RESET_LABELS = {
  transactions:'Transactions',
  budgets:'Budgets',
  goals:'Goals',
  investments:'Investments'
};
function getLastReset(section){
  try{
    const raw=localStorage.getItem(RESET_KEYS[section]);
    if(!raw)return null;
    const rec=JSON.parse(raw);
    return rec&&Array.isArray(rec.data)?rec:null;
  }catch(e){return null}
}
function saveLastReset(section,data){
  const rec={app:'FinVault',type:'finvault-section-reset-backup',section,version:1,savedAt:new Date().toISOString(),data:cloneData(data)};
  localStorage.setItem(RESET_KEYS[section],JSON.stringify(rec));
  renderDatabasePage();
  return rec;
}
async function saveLastResetToCloud(section,rec){
  if(!db)return;
  try{
    const {doc,setDoc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const backupPath=(DOC_PATH||LEGACY_DOC_PATH)+'_reset_'+section;
    await setDoc(doc(db,backupPath),rec);
  }catch(e){console.warn('Section reset backup cloud save failed:',e)}
}
async function getLastResetFromCloud(section){
  if(!db)return null;
  try{
    const {doc,getDoc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const backupPath=(DOC_PATH||LEGACY_DOC_PATH)+'_reset_'+section;
    const snap=await getDoc(doc(db,backupPath));
    if(!snap.exists())return null;
    const rec=snap.data();
    return rec&&Array.isArray(rec.data)?rec:null;
  }catch(e){console.warn('Section reset backup cloud read failed:',e);return null}
}
function renderSectionResetChips(){
  Object.keys(RESET_KEYS).forEach(section=>{
    const chip=document.getElementById('reset-chip-'+section);
    if(!chip)return;
    const rec=getLastReset(section);
    chip.textContent=rec?'Last reset · '+formatBackupDate(rec.savedAt):'No reset saved';
  });
}
async function resetSectionData(section){
  if(!RESET_KEYS[section])return;
  const label=RESET_LABELS[section];
  if(!confirm(`Reset all ${label.toLowerCase()}? Only this section will be cleared. A Last Reset backup will be saved first.`))return;
  const snapshot=saveLastReset(section,DATA[section]||[]);
  await saveLastResetToCloud(section,snapshot);
  DATA[section]=[];
  localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA));
  await window.saveData();
  renderAll();
  renderDatabasePage();
  toast(`${label} reset successfully. Restore Last Reset is available.` ,'success');
}
async function restoreSectionData(section){
  if(!RESET_KEYS[section])return;
  let rec=getLastReset(section);
  if(!rec)rec=await getLastResetFromCloud(section);
  if(!rec||!Array.isArray(rec.data)){toast(`No Last Reset backup for ${RESET_LABELS[section]}.`,'error');return;}
  if(!confirm(`Restore the last reset ${RESET_LABELS[section].toLowerCase()}? Current ${RESET_LABELS[section].toLowerCase()} will be replaced.`))return;
  DATA[section]=cloneData(rec.data);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA));
  await window.saveData();
  renderAll();
  renderDatabasePage();
  toast(`${RESET_LABELS[section]} restored successfully ✓`,'success');
}
function buildSectionExportRecord(section){
  return {app:'FinVault',type:'finvault-section-export',section,version:1,exportedAt:new Date().toISOString(),data:cloneData(DATA[section]||[])};
}
function exportSectionData(section){
  const record=buildSectionExportRecord(section);
  const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`FinVault-${section.charAt(0).toUpperCase()+section.slice(1)}-${record.exportedAt.slice(0,10)}.json`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  toast(`${RESET_LABELS[section]} exported ✓`,'success');
}
function handleSectionImportFile(event,section){
  const file=event.target.files&&event.target.files[0];
  event.target.value='';
  if(!file)return;
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const raw=JSON.parse(reader.result);
      if(raw.section&&raw.section!==section)throw new Error('This file belongs to '+(RESET_LABELS[raw.section]||raw.section)+', not '+RESET_LABELS[section]+'.');
      const data=Array.isArray(raw.data)?raw.data:raw;
      if(!Array.isArray(data))throw new Error('Invalid section export file.');
      if(!confirm(`Import ${data.length.toLocaleString()} ${RESET_LABELS[section].toLowerCase()}? Existing ${RESET_LABELS[section].toLowerCase()} will remain and matching IDs will not be duplicated.`))return;
      DATA[section]=mergeById(DATA[section],data);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA));
      await window.saveData();
      renderAll();
      renderDatabasePage();
      toast(`${RESET_LABELS[section]} imported and merged ✓`,'success');
    }catch(e){toast(e.message||'Could not import this section file.','error')}
  };
  reader.onerror=()=>toast('Could not read the selected file.','error');
  reader.readAsText(file);
}

async function resetAllFinVaultData(){
  const rec=getLastExportRecord();
  if(!rec){
    toast('Export your current data first. Your latest export is what stays after reset.','error');
    return;
  }
  if(!confirm('Reset all current FinVault data? Your latest export will remain safely in Database and can be merged back later.'))return;
  const typed=prompt('Type RESET to confirm.');
  if(typed!=='RESET'){toast('Reset cancelled','info');return;}
  DATA=getDefaultData();
  syncCatsFromData();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA));
  await window.saveData();
  renderAll();
  renderDatabasePage();
  toast('Current data reset. Your last export is still safe in Database ✓','success');
}

// ── Category & Investment-type storage ──────────────────────────────────────

/* ══════════════════════════════════════════════════════════════
   SECTION 04 · STATE
   Categories, the DATA object, formatters, transaction helpers.
   ══════════════════════════════════════════════════════════════ */
const DEFAULT_EXPENSE_CATS = [{name:'Food & Dining',emoji:'🍛',color:'#4f8ef7'},{name:'Transport',emoji:'🚗',color:'#10b981'},{name:'Shopping',emoji:'🛍️',color:'#f59e0b'},{name:'Housing',emoji:'🏠',color:'#ef4444'},{name:'Entertainment',emoji:'🎬',color:'#7c3aed'},{name:'Health',emoji:'💊',color:'#ec4899'},{name:'Education',emoji:'📚',color:'#06b6d4'},{name:'Utilities',emoji:'⚡',color:'#84cc16'},{name:'Personal Care',emoji:'💅',color:'#f472b6'},{name:'Other',emoji:'💸',color:'#94a3b8'}];
const DEFAULT_INCOME_CATS  = [{name:'Salary',emoji:'💼',color:'#10b981'},{name:'Freelance',emoji:'💻',color:'#34d399'},{name:'Business',emoji:'🏢',color:'#a78bfa'},{name:'Investment Return',emoji:'📈',color:'#4ade80'},{name:'Rental Income',emoji:'🔑',color:'#fb923c'},{name:'Other Income',emoji:'💰',color:'#38bdf8'}];
const DEFAULT_INVEST_TYPES = [{name:'Stocks',color:'#4f8ef7'},{name:'Mutual Fund',color:'#7c3aed'},{name:'FDR',color:'#10b981'},{name:'Savings Bond',color:'#f59e0b'},{name:'Real Estate',color:'#ef4444'},{name:'Crypto',color:'#ec4899'},{name:'Other',color:'#94a3b8'}];
const DEFAULT_CATEGORIES = {expense:[...DEFAULT_EXPENSE_CATS],income:[...DEFAULT_INCOME_CATS],invest:[...DEFAULT_INVEST_TYPES]};
let CATS = DEFAULT_CATEGORIES;

function syncCatsFromData(){
  if(!DATA.categories) DATA.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  if(!DATA.categories.expense) DATA.categories.expense = [...DEFAULT_EXPENSE_CATS];
  if(!DATA.categories.income)  DATA.categories.income  = [...DEFAULT_INCOME_CATS];
  if(!DATA.categories.invest)  DATA.categories.invest  = [...DEFAULT_INVEST_TYPES];
  if(!DATA.budgetMonthLimits) DATA.budgetMonthLimits = {};
  CATS = DATA.categories;
}
function saveCats(){ saveData(); }
function getExpenseCats(){return CATS.expense.map(c=>c.name)}
function getIncomeCats(){return CATS.income.map(c=>c.name)}
function getAllCats(){return [...getExpenseCats(),...getIncomeCats()]}
function getInvestTypes(){return CATS.invest.map(c=>c.name)}
function getCatEmoji(name){const all=[...CATS.expense,...CATS.income];const f=all.find(c=>c.name===name);return f?f.emoji:'💸'}
function getCatColor(name){const all=[...CATS.expense,...CATS.income];const f=all.find(c=>c.name===name);return f?f.color:'#4f8ef7'}
function getInvestColor(name){const f=CATS.invest.find(c=>c.name===name);return f?f.color:'#4f8ef7'}

let DATA=loadData();
syncCatsFromData(); // Now safe — function is defined above

// ── Migrate old phone/device categories if they exist ──────────────────────
(function migrateLegacyCats(){
  try{
    const old = localStorage.getItem('finvault_categories');
    if(!old) return;
    const parsed = JSON.parse(old);
    if(!parsed || !parsed.expense) return;
    ['expense','income','invest'].forEach(type=>{
      if(!parsed[type]) return;
      parsed[type].forEach(oldCat=>{
        const exists = DATA.categories[type].find(c=>c.name===oldCat.name);
        if(!exists) DATA.categories[type].push(oldCat);
      });
    });
    saveData();
    localStorage.removeItem('finvault_categories');
  }catch(e){}
})();
const GOAL_COLORS=['#4f8ef7','#7c3aed','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16'];
let goalColorIdx=0;
let currentGoalTab='pending';
let goalDragSrcIdx=null;
const fmt=n=>'৳'+Math.abs(Math.round(n)).toLocaleString('en-IN');
const fmtFull=n=>'৳'+Math.round(n).toLocaleString('en-IN');
const today=()=>new Date().toISOString().split('T')[0];
// ── Date-group divider label: "Today" / "Yesterday" / "Weekday, D Month YYYY" ──
const TXN_DIVIDER_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const TXN_DIVIDER_WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
// Short per-day summary shown beside each date divider: only the buckets that
// actually have something that day (income / expense / receivable / payable).
// Transfers are skipped — they only move money between accounts.
function txnDaySummaryHTML(d){
  if(!d)return'';
  const defs=[['income','Income','var(--pos)'],['expense','Expense','var(--neg)'],['receivable','Receivable','var(--info)'],['payable','Payable','var(--warn)']];
  const chips=defs.filter(([k])=>d[k]>0).map(([k,l,c])=>`<span class="tds-chip" style="--c:${c}"><i></i>${l}<b>${fmt(d[k])}</b></span>`).join('');
  return chips?`<span class="txn-date-summary">${chips}</span>`:'';
}
function txnDateDividerLabel(dateStr){
  if(!dateStr)return'Unknown Date';
  if(dateStr===today())return'Today';
  const yestD=new Date();yestD.setDate(yestD.getDate()-1);
  if(dateStr===yestD.toISOString().split('T')[0])return'Yesterday';
  const d=new Date(dateStr+'T00:00:00');
  if(isNaN(d))return dateStr;
  return`${TXN_DIVIDER_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${TXN_DIVIDER_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
// ── Per-transaction "balance after" snapshots ──────────────────────────────
// Account balances are only ever kept as a single running total on the
// account itself (DATA.accounts[i].balance), updated in place whenever a
// transaction is added/edited/deleted — there's no stored history. To show
// what an account's balance *was* right after some past transaction, we
// replay every entry that ever touched that account in true chronological
// order and remember the running total at each step. Group transactions
// (t.splits) can move money in/out of more than one account at once, so
// each split is walked individually to keep every account's running total
// correct — but the "balance after" note itself is only ever shown on
// single-account rows (see renderTransactionsPage), never on the group row.
function computeTxnBalanceSnapshots(){
  const sign={income:1,payable:1,receivable:-1,expense:-1};
  const entries=[];
  (DATA.transactions||[]).forEach(t=>{
    if(t.type==='transfer'){
      if(t.fromAccount)entries.push({txnId:t.id,accountId:t.fromAccount,effect:-t.amount,date:t.date,time:t.time,sortOrder:t.sortOrder});
      if(t.toAccount)entries.push({txnId:t.id,accountId:t.toAccount,effect:t.amount,date:t.date,time:t.time,sortOrder:t.sortOrder});
    } else if(t.splits&&t.splits.length>0){
      const s=sign[t.type]||0;
      if(s)t.splits.forEach(sp=>{
        const accId=sp.account||t.account||'cash';
        entries.push({txnId:t.id,accountId:accId,effect:s*sp.amount,date:t.date,time:t.time,sortOrder:t.sortOrder});
      });
    } else if(t.account){
      const s=sign[t.type]||0;
      if(s)entries.push({txnId:t.id,accountId:t.account,effect:s*t.amount,date:t.date,time:t.time,sortOrder:t.sortOrder});
    }
  });
  entries.sort((a,b)=>{
    const dd=new Date(a.date)-new Date(b.date);
    if(dd!==0)return dd;
    const aHasTime=!!a.time,bHasTime=!!b.time;
    if(aHasTime&&bHasTime)return a.time.localeCompare(b.time);
    if(aHasTime&&!bHasTime)return -1;
    if(!aHasTime&&bHasTime)return 1;
    return(typeof a.sortOrder==='number'?a.sortOrder:0)-(typeof b.sortOrder==='number'?b.sortOrder:0);
  });
  const netByAccount={};
  entries.forEach(e=>{netByAccount[e.accountId]=(netByAccount[e.accountId]||0)+e.effect});
  const running={};
  (DATA.accounts||[]).forEach(a=>{running[a.id]=a.balance-(netByAccount[a.id]||0)});
  const snapshots={};
  entries.forEach(e=>{
    if(!(e.accountId in running))running[e.accountId]=0;
    running[e.accountId]+=e.effect;
    snapshots[e.txnId+'::'+e.accountId]=running[e.accountId];
  });
  return snapshots;
}
const uid=()=>Date.now()+Math.floor(Math.random()*9999);
// Manual drag-order for transactions that have no time set, scoped per date
function nextTxnSortOrder(date){
  const existing=(DATA.transactions||[]).filter(t=>t.date===date&&!t.time&&typeof t.sortOrder==='number');
  if(!existing.length) return 0;
  return Math.max(...existing.map(t=>t.sortOrder))+1;
}

/* ══════════════════════════════════════════════════════════════
   SECTION 05 · UI
   Toast, modals, global search, date & time pickers.
   ══════════════════════════════════════════════════════════════ */
function toast(msg,type='success'){const el=document.getElementById('toast');el.textContent=msg;el.className='toast show '+type;clearTimeout(el._t);el._t=setTimeout(()=>el.className='toast',3200)}

// ── Ripple micro-interaction (single delegated listener — lightweight) ─────
(function(){
  const RIPPLE_SELECTOR='.btn, .nav-item, .tab, .type-btn, .account-tab, .txn-item, .txn-full-item, .payment-card, .goal-card';
  document.addEventListener('pointerdown', function(e){
    const el = e.target.closest(RIPPLE_SELECTOR);
    if(!el || el.classList.contains('mcat-row')) return;
    const rect = el.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    const size = Math.max(rect.width, rect.height) * 1.4;
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size/2) + 'px';
    span.style.top = (e.clientY - rect.top - size/2) + 'px';
    el.appendChild(span);
    const cleanup = () => { if(span.parentNode) span.parentNode.removeChild(span); };
    span.addEventListener('animationend', cleanup, {once:true});
    setTimeout(cleanup, 700);
  }, {passive:true});
})();
function openModal(id,data=null){
  if(id==='add-txn')prepTxnModal(data);
  else if(id==='add-budget')prepBudgetModal(data);
  else if(id==='add-goal')prepGoalModal(data);
  else if(id==='add-investment')prepInvestModal(data);
  else if(id==='profile')prepProfileModal();
  else if(id==='manage-cats')prepManageCats();
  else if(id==='transfer')openTransferModal();
  else if(id==='payoff')prepPayoffModal(data);
  else if(id==='txn-actions')prepTxnActionsModal(data);
  else if(id==='search')prepSearchModal();
  else if(id==='install-help')fvPrepInstallHelp();
  document.getElementById('modal-'+id).classList.add('open');
}
function closeModal(id){document.getElementById('modal-'+id).classList.remove('open')}
let currentTxnActionsData=null;
function prepTxnActionsModal(data){
  currentTxnActionsData=data;
  const isTransfer=data.type==='transfer';
  const color=data.type==='income'?'var(--pos)':data.type==='payable'?'var(--warn)':data.type==='receivable'?'var(--info)':isTransfer?'#8b5cf6':'var(--neg)';
  const sign=data.type==='income'?'+':data.type==='payable'?'🔴':data.type==='receivable'?'🔵':isTransfer?'🔁':'-';
  document.getElementById('txn-actions-emoji').textContent=data.emoji||'💸';
  document.getElementById('txn-actions-name').textContent=data.desc||'Transaction';
  document.getElementById('txn-actions-meta').textContent=`${data.cat||''} · ${data.date||''}`;
  const amtEl=document.getElementById('txn-actions-amount');
  amtEl.textContent=`${sign}${fmt(data.amount)}`;
  amtEl.style.color=color;
  // Transfers are edited via a dedicated flow elsewhere, so hide "Customize" for them here.
  document.getElementById('txn-actions-edit-btn').style.display=isTransfer?'none':'';
}
function txnActionsCustomize(){
  const data=currentTxnActionsData;
  closeModal('txn-actions');
  openModal('add-txn',data);
}
function txnActionsDelete(){
  const data=currentTxnActionsData;
  closeModal('txn-actions');
  deleteTxn(data.id);
}
function deleteTxnFromModal(){
  const id=editTxnId;
  if(id==null)return;
  closeModal('add-txn');
  deleteTxn(id);
}

// ══════════════════════════════════════════════
//  GLOBAL TRANSACTION SEARCH — reachable from any page via the
//  header search icon. Matches text (description, category, person,
//  transfer parties), amount, and date — whatever the user types.
// ══════════════════════════════════════════════
function prepSearchModal(){
  const input=document.getElementById('global-search-input');
  if(input){input.value='';}
  const results=document.getElementById('global-search-results');
  if(results)results.innerHTML=`<div class="empty" style="padding:24px 0"><div class="empty-icon">🔎</div><div class="empty-text">টাইপ করা শুরু করুন — বিবরণ, ক্যাটাগরি, ব্যক্তি, পরিমাণ বা তারিখ দিয়ে খুঁজুন</div></div>`;
  setTimeout(()=>{if(input)input.focus()},80);
}
function runGlobalSearch(){
  const q=(document.getElementById('global-search-input').value||'').trim();
  const resultsEl=document.getElementById('global-search-results');
  if(!resultsEl)return;
  if(!q){
    resultsEl.innerHTML=`<div class="empty" style="padding:24px 0"><div class="empty-icon">🔎</div><div class="empty-text">টাইপ করা শুরু করুন — বিবরণ, ক্যাটাগরি, ব্যক্তি, পরিমাণ বা তারিখ দিয়ে খুঁজুন</div></div>`;
    return;
  }
  const matches=[...DATA.transactions].filter(t=>txnMatchesQuery(t,q))
    .sort((a,b)=>new Date(b.date)-new Date(a.date))
    .slice(0,40);
  if(!matches.length){
    resultsEl.innerHTML=`<div class="empty" style="padding:24px 0"><div class="empty-icon">📭</div><div class="empty-text">কোনো transaction পাওয়া যায়নি</div></div>`;
    return;
  }
  resultsEl.innerHTML=matches.map(t=>{
    const isTransfer=t.type==='transfer';
    const isLR=(t.type==='payable'||t.type==='receivable');
    const color=t.type==='income'?'var(--pos)':t.type==='payable'?'var(--warn)':t.type==='receivable'?'var(--info)':isTransfer?'#8b5cf6':'var(--neg)';
    const sign=t.type==='income'?'+':t.type==='payable'?'🔴':t.type==='receivable'?'🔵':isTransfer?'🔁':'-';
    const subLabel=isTransfer?`${t.fromName||'—'} → ${t.toName||'—'}`:isLR&&t.person?`${t.person} · ${t.cat}`:t.cat;
    const safeData=JSON.stringify(t).replace(/"/g,'&quot;');
    return`<div class="txn-item search-result-item" onclick="openSearchResult(${safeData})">
      <div class="txn-left"><div class="txn-emoji">${t.emoji||'💸'}</div>
        <div><div class="txn-name">${t.desc||'—'}</div><div class="txn-cat">${subLabel} · ${t.date}</div></div>
      </div>
      <div class="txn-amount" style="color:${color}">${sign}${fmt(t.amount)}</div>
    </div>`;
  }).join('');
}
function openSearchResult(t){
  closeModal('search');
  const isTransfer=t.type==='transfer';
  openModal(isTransfer?'txn-actions':'add-txn',t);
}

document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open')}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'))});

/* ===== Custom Date Picker — themed replacement for <input type="date"> ===== */
const DP_MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
let dpTargetId=null,dpViewDate=new Date(),dpSelectedDate=null;
function openDatePicker(id){
  dpTargetId=id;
  const val=document.getElementById(id).value;
  const base=val?new Date(val+'T00:00:00'):new Date();
  dpViewDate=new Date(base.getFullYear(),base.getMonth(),1);
  dpSelectedDate=val||null;
  document.getElementById('dp-quickjump').classList.remove('open');
  renderDatePicker();
  document.getElementById('dp-overlay').classList.add('open');
}
function closeDatePicker(){document.getElementById('dp-overlay').classList.remove('open')}
function dpChangeMonth(delta){
  dpViewDate=new Date(dpViewDate.getFullYear(),dpViewDate.getMonth()+delta,1);
  renderDatePicker();
}
function dpToggleQuickJump(){
  const qj=document.getElementById('dp-quickjump');
  if(qj.classList.contains('open')){qj.classList.remove('open');return}
  const monthSel=document.getElementById('dp-month-select');
  const yearSel=document.getElementById('dp-year-select');
  monthSel.innerHTML=DP_MONTH_NAMES.map((mn,i)=>`<option value="${i}" ${i===dpViewDate.getMonth()?'selected':''}>${mn}</option>`).join('');
  const curY=dpViewDate.getFullYear();
  let yopts='';
  for(let y=curY-15;y<=curY+5;y++)yopts+=`<option value="${y}" ${y===curY?'selected':''}>${y}</option>`;
  yearSel.innerHTML=yopts;
  qj.classList.add('open');
}
function dpQuickJumpChange(){
  const m=parseInt(document.getElementById('dp-month-select').value,10);
  const y=parseInt(document.getElementById('dp-year-select').value,10);
  dpViewDate=new Date(y,m,1);
  document.getElementById('dp-quickjump').classList.remove('open');
  renderDatePicker();
}
function renderDatePicker(){
  const y=dpViewDate.getFullYear(),m=dpViewDate.getMonth();
  document.getElementById('dp-month-label').textContent=`${DP_MONTH_NAMES[m]} ${y}`;
  const firstDay=new Date(y,m,1).getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const todayStr=today();
  let html='';
  for(let i=0;i<firstDay;i++)html+='<div class="dp-cell dp-empty"></div>';
  for(let d=1;d<=daysInMonth;d++){
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls=['dp-cell'];
    if(ds===dpSelectedDate)cls.push('dp-selected');
    if(ds===todayStr)cls.push('dp-today');
    html+=`<button type="button" class="${cls.join(' ')}" onclick="dpPick('${ds}')">${d}</button>`;
  }
  document.getElementById('dp-grid').innerHTML=html;
}
function dpPick(ds){
  const el=document.getElementById(dpTargetId);
  if(el){el.value=ds;el.dispatchEvent(new Event('change'))}
  closeDatePicker();
}
function dpSetToday(){dpPick(today())}

/* ===== Custom Time Picker — themed replacement for <input type="time"> ===== */
let tpTargetId=null,tpHour=0,tpMin=0;
function openTimePicker(id){
  tpTargetId=id;
  const val=document.getElementById(id).value;
  if(val){const[h,mi]=val.split(':');tpHour=parseInt(h,10);tpMin=parseInt(mi,10)}
  else{const now=new Date();tpHour=now.getHours();tpMin=now.getMinutes()}
  renderTimePicker(true);
  document.getElementById('tp-overlay').classList.add('open');
}
function closeTimePicker(){document.getElementById('tp-overlay').classList.remove('open')}
function renderTimePicker(scrollToSel){
  let hh='';
  for(let h=0;h<24;h++)hh+=`<button type="button" class="tp-item${h===tpHour?' tp-sel':''}" onclick="tpPickHour(${h})">${String(h).padStart(2,'0')}</button>`;
  document.getElementById('tp-hour-col').innerHTML=hh;
  let mm='';
  for(let mi=0;mi<60;mi++)mm+=`<button type="button" class="tp-item${mi===tpMin?' tp-sel':''}" onclick="tpPickMin(${mi})">${String(mi).padStart(2,'0')}</button>`;
  document.getElementById('tp-min-col').innerHTML=mm;
  document.getElementById('tp-preview').textContent=`${String(tpHour).padStart(2,'0')}:${String(tpMin).padStart(2,'0')}`;
  if(scrollToSel)requestAnimationFrame(()=>{
    const hEl=document.querySelector('#tp-hour-col .tp-sel');
    if(hEl)hEl.scrollIntoView({block:'center'});
    const mEl=document.querySelector('#tp-min-col .tp-sel');
    if(mEl)mEl.scrollIntoView({block:'center'});
  });
}
function tpPickHour(h){tpHour=h;renderTimePicker(false)}
function tpPickMin(mi){tpMin=mi;renderTimePicker(false)}
function tpSetNow(){const now=new Date();tpHour=now.getHours();tpMin=now.getMinutes();renderTimePicker(true)}
function tpClear(){
  const el=document.getElementById(tpTargetId);
  if(el){el.value='';el.dispatchEvent(new Event('change'))}
  closeTimePicker();
}
function tpConfirm(){
  const el=document.getElementById(tpTargetId);
  if(el){el.value=`${String(tpHour).padStart(2,'0')}:${String(tpMin).padStart(2,'0')}`;el.dispatchEvent(new Event('change'))}
  closeTimePicker();
}

/* ══════════════════════════════════════════════════════════════
   SECTION 06 · TRANSACTION FORM
   Add/edit transaction form, save, delete.
   ══════════════════════════════════════════════════════════════ */
let txnType='expense',editTxnId=null,isGroupMode=false,linkedExistingIds=new Set();
function prepTxnModal(data){
  editTxnId=data?data.id:null;
  document.getElementById('txn-modal-title').textContent=data?'Edit Transaction':'Add Transaction';
  document.getElementById('txn-edit-id').value=data?data.id:'';
  document.getElementById('txn-delete-btn').style.display=data?'':'none';
  txnType=data?data.type:'expense';
  setType(txnType); // populates cats, account select, shows/hides fields
  document.getElementById('txn-amount').value=data?data.amount:'';
  document.getElementById('txn-desc').value=data?data.desc:'';
  document.getElementById('txn-date').value=data?data.date:today();
  document.getElementById('txn-time').value=data?(data.time||''):'';
  document.getElementById('txn-smart').value='';
  // Set selected category
  if(txnType==='income'){
    populateCatSelect('txn-cat-income',getIncomeCats(),data?data.cat:null);
  } else {
    populateCatSelect('txn-cat-expense',getExpenseCats(),data?data.cat:null);
  }
  // Pre-select saved account — নতুন transaction হলে default Cash
  {
    const accSel=document.getElementById('txn-account');
    if(accSel) accSel.value=(data&&data.account)?data.account:'cash';
  }
  // Payable/Receivable person field
  const isLR=(txnType==='payable'||txnType==='receivable');
  if(isLR){
    document.getElementById('txn-person').value=data?data.person||'':'';
  }
  // Group mode: load splits if editing a group txn
  isGroupMode=false;
  const groupSection=document.getElementById('group-section');
  const groupBtn=document.getElementById('btn-toggle-group');
  const amtInput=document.getElementById('txn-amount');
  if(data&&data.splits&&data.splits.length>0){
    isGroupMode=true;
    groupSection.style.display='block';
    groupBtn.textContent='✕ Cancel Group';
    amtInput.disabled=true;amtInput.placeholder='Auto-calculated';
    document.getElementById('existing-picker').style.display='none';
    loadGroupSplits(data.splits);  // this also resets linkedExistingIds
  } else {
    groupSection.style.display='none';
    groupBtn.textContent='📦 Group Transaction';
    amtInput.disabled=false;amtInput.placeholder='0';
    document.getElementById('group-items-container').innerHTML='';
    document.getElementById('group-total-display').textContent='৳0';
  }
}
function setType(t){
  txnType=t;
  const isLR=(t==='payable'||t==='receivable');
  // Show/hide correct category dropdown — LR তে category নেই
  document.getElementById('cat-group-expense').style.display=(t==='expense')?'block':'none';
  document.getElementById('cat-group-income').style.display=(t==='income')?'block':'none';
  if(t==='expense') populateCatSelect('txn-cat-expense',getExpenseCats());
  else if(t==='income') populateCatSelect('txn-cat-income',getIncomeCats());
  // Payable / Receivable person field
  const lrFields=document.getElementById('lr-fields');
  if(lrFields) lrFields.style.display=isLR?'block':'none';
  if(isLR){
    const label=document.getElementById('lr-person-label');
    if(label) label.textContent=t==='payable'?'👤 যার কাছ থেকে ঋণ নিয়েছেন':'👤 যাকে ধার দিয়েছেন';
  }
  // Account select — সব type-এর জন্য
  ensureAccounts();
  const accSel=document.getElementById('txn-account');
  if(accSel) accSel.innerHTML=DATA.accounts.map(a=>`<option value="${a.id}">${a.name} (${fmtFull(a.balance)})</option>`).join('');
  // Account label — type অনুযায়ী
  const accLabel=document.getElementById('txn-account-label');
  if(accLabel){
    if(t==='income') accLabel.textContent='🏦 কোন Account-এ আসবে?';
    else if(t==='expense') accLabel.textContent='🏦 কোন Account থেকে যাবে?';
    else if(t==='payable') accLabel.textContent='🏦 কোন Account-এ ঋণের টাকা আসবে?';
    else if(t==='receivable') accLabel.textContent='🏦 কোন Account থেকে ধার দেওয়া হবে?';
  }
  // Group button — only for expense/income
  const groupBtn2=document.getElementById('btn-toggle-group');
  if(groupBtn2) groupBtn2.style.display=isLR?'none':'block';
  // Refresh group row category options if group mode active
  if(isGroupMode&&!isLR){
    const cats=t==='income'?getIncomeCats():getExpenseCats();
    const catOpts=cats.map(c=>`<option value="${c}">${c}</option>`).join('');
    document.querySelectorAll('.group-cat').forEach(sel=>{const cur=sel.value;sel.innerHTML=catOpts;sel.value=cur||cats[0];});
  }
  // Type buttons styling
  ['expense','income','payable','receivable'].forEach(type=>{
    const btn=document.getElementById('type-'+type);
    if(btn) btn.className='type-btn'+(t===type?' active '+type:'');
  });
}
function populateCatSelect(id,cats,selected=null){
  const el=document.getElementById(id);
  if(!el) return;
  el.innerHTML=cats.map(c=>`<option value="${c}"${c===selected?' selected':''}>${c}</option>`).join('');
}function saveTransaction(){
  const smartText='';
  const desc = document.getElementById('txn-desc').value.trim();
  const date = document.getElementById('txn-date').value;
  const time = document.getElementById('txn-time').value||'';
  const type = txnType;
  const editId = editTxnId;

  if(!date){toast('Please select a date','error');return}

  // Enforce a per-account transaction limit, if one is set on this user's record
  if(!editId && currentUserMeta && currentUserMeta.limits && currentUserMeta.limits.maxTransactions != null){
    if((DATA.transactions||[]).length >= currentUserMeta.limits.maxTransactions){
      toast('Transaction limit reached (' + currentUserMeta.limits.maxTransactions + ').', 'error');
      return;
    }
  }

  // --- 1. GROUP TRANSACTION LOGIC ---
  if(isGroupMode) {
    const rows = document.querySelectorAll('.group-row');
    const splits = [];
    let groupTotal = 0;
    rows.forEach(row => {
      const amt = parseFloat(row.querySelector('.group-amt').value)||0;
      const cat = row.querySelector('.group-cat').value;
      const d = row.querySelector('.group-desc').value.trim()||cat;
      const methodEl = row.querySelector('.group-method');
      const method = methodEl ? methodEl.value : (document.getElementById('txn-account').value||'cash');
      if(amt > 0){ splits.push({amount:amt, cat, desc:d, emoji:getCatEmoji(cat), account:method}); groupTotal+=amt; }
    });
    if(splits.length === 0){toast('অন্তত একটি sub-item যোগ করুন','error');return}
    if(!desc){toast('Group এর একটা title/description দিন','error');return}
    const isLR2=(type==='payable'||type==='receivable');
    const accountId2=document.getElementById('txn-account').value||'';
    const person2=isLR2?(document.getElementById('txn-person').value.trim()||''):'';
    const oldTxnG=editId?DATA.transactions.find(t=>t.id==editId):null;
    const sortOrderG=(!time)?((oldTxnG&&!oldTxnG.time&&oldTxnG.date===date&&typeof oldTxnG.sortOrder==='number')?oldTxnG.sortOrder:nextTxnSortOrder(date)):undefined;
    const txnG={
      id:editId||uid(), type, amount:groupTotal, cat:splits[0].cat, desc, date,
      emoji:'📦', account:accountId2, splits, time,
      ...(sortOrderG!==undefined&&{sortOrder:sortOrderG}),
      ...(isLR2&&{person:person2,paidAmount:oldTxnG?(oldTxnG.paidAmount||0):0,status:oldTxnG?(oldTxnG.paidAmount>=groupTotal?'settled':oldTxnG.status||'pending'):'pending'})
    };
    if(editId){
      ensureAccounts();
      const oldT=DATA.transactions.find(t=>t.id==editId);
      // Revert old balance effects (per-split if old was a group, else parent account)
      if(oldT){
        if(oldT.splits&&oldT.splits.length>0){
          oldT.splits.forEach(s=>{
            const sAcc=s.account||oldT.account||'cash';
            const oIdx=DATA.accounts.findIndex(a=>a.id===sAcc);
            if(oIdx!==-1){
              if(oldT.type==='income') DATA.accounts[oIdx].balance-=s.amount;
              else if(oldT.type==='expense') DATA.accounts[oIdx].balance+=s.amount;
              else if(oldT.type==='payable') DATA.accounts[oIdx].balance-=s.amount;
              else if(oldT.type==='receivable') DATA.accounts[oIdx].balance+=s.amount;
            }
          });
        } else if(oldT.account){
          const oIdx=DATA.accounts.findIndex(a=>a.id===oldT.account);
          if(oIdx!==-1){
            if(oldT.type==='income')DATA.accounts[oIdx].balance-=oldT.amount;
            else if(oldT.type==='expense')DATA.accounts[oIdx].balance+=oldT.amount;
            else if(oldT.type==='payable')DATA.accounts[oIdx].balance-=oldT.amount;
            else if(oldT.type==='receivable')DATA.accounts[oIdx].balance+=oldT.amount;
          }
        }
      }
      // Apply new balance per split
      splits.forEach(s=>{
        const sAcc=s.account||accountId2||'cash';
        const nIdx=DATA.accounts.findIndex(a=>a.id===sAcc);
        if(nIdx!==-1){
          if(type==='income') DATA.accounts[nIdx].balance+=s.amount;
          else if(type==='expense') DATA.accounts[nIdx].balance-=s.amount;
          else if(type==='payable') DATA.accounts[nIdx].balance+=s.amount;
          else if(type==='receivable') DATA.accounts[nIdx].balance-=s.amount;
        }
      });
    } else {
      // New group transaction: update per-split account
      ensureAccounts();
      splits.forEach(s=>{
        const sAcc=s.account||accountId2||'cash';
        const nIdx=DATA.accounts.findIndex(a=>a.id===sAcc);
        if(nIdx!==-1){
          if(type==='income') DATA.accounts[nIdx].balance+=s.amount;
          else if(type==='expense') DATA.accounts[nIdx].balance-=s.amount;
          else if(type==='payable') DATA.accounts[nIdx].balance+=s.amount;
          else if(type==='receivable') DATA.accounts[nIdx].balance-=s.amount;
        }
      });
    }
    // Mark linked existing txns with groupParentId; unmark previously linked ones
    if(editId){
      // Clear old groupParentId marks for previous linked items
      DATA.transactions.forEach(t=>{if(t.groupParentId==editId) t.groupParentId=null;});
    }
    const newId=txnG.id;
    splits.forEach(s=>{
      if(s.linkedTxnId){
        const lt=DATA.transactions.find(t=>t.id==s.linkedTxnId);
        if(lt) lt.groupParentId=newId;
      }
    });
    if(editId){const idx=DATA.transactions.findIndex(t=>t.id==editId);if(idx!==-1)DATA.transactions[idx]=txnG;toast('Group updated ✓');}
    else{DATA.transactions.unshift(txnG);toast('Group transaction added ✓');}
    saveData();closeModal('add-txn');renderAll();
    return;
  }

  // --- 2. NORMAL LOGIC ---

  const amount=parseFloat(document.getElementById('txn-amount').value);
  const isLR=(type==='payable'||type==='receivable');
  const catEl=type==='income'
    ?document.getElementById('txn-cat-income')
    :document.getElementById('txn-cat-expense');
  const cat=isLR?'':(catEl?catEl.value:'');
  const finalDesc=desc||cat;
  const person=isLR?(document.getElementById('txn-person').value.trim()||''):'';
  const accountId=document.getElementById('txn-account').value||'';

  if(!amount||amount<=0){toast('Please enter a valid amount','error');return}

  const oldTxnForLR=editId?DATA.transactions.find(t=>t.id==editId):null;
  const sortOrderN=(!time)?((oldTxnForLR&&!oldTxnForLR.time&&oldTxnForLR.date===date&&typeof oldTxnForLR.sortOrder==='number')?oldTxnForLR.sortOrder:nextTxnSortOrder(date)):undefined;
  const txn={
    id:editId||uid(),
    type,amount,cat,desc:finalDesc,date,
    emoji:getCatEmoji(cat),
    account:accountId,
    time,
    ...(sortOrderN!==undefined&&{sortOrder:sortOrderN}),
    ...(isLR&&{person,paidAmount:oldTxnForLR?(oldTxnForLR.paidAmount||0):0,status:oldTxnForLR?(oldTxnForLR.paidAmount>=amount?'settled':oldTxnForLR.status||'pending'):'pending'})
  };

  // ── Account balance update ────────────────────────────────────────────────
  // নতুন transaction add (editId নেই)
  if(!editId&&accountId){
    ensureAccounts();
    const accIdx=DATA.accounts.findIndex(a=>a.id===accountId);
    if(accIdx!==-1){
      if(type==='income')      DATA.accounts[accIdx].balance+=amount;  // income → account বাড়ে
      else if(type==='expense') DATA.accounts[accIdx].balance-=amount;  // expense → account কমে
      else if(type==='payable') DATA.accounts[accIdx].balance+=amount; // ঋণ নেওয়া → account বাড়ে
      else if(type==='receivable') DATA.accounts[accIdx].balance-=amount;// ধার দেওয়া → account কমে
    }
  }
  // edit করা হলে — পুরনো effect revert করে নতুন apply
  if(editId&&accountId){
    ensureAccounts();
    const oldTxn=DATA.transactions.find(t=>t.id==editId);
    const oldAccId=oldTxn?oldTxn.account:'';
    // Revert old account effect
    if(oldAccId){
      const oldAccIdx=DATA.accounts.findIndex(a=>a.id===oldAccId);
      if(oldAccIdx!==-1){
        if(oldTxn.type==='income')      DATA.accounts[oldAccIdx].balance-=oldTxn.amount;
        else if(oldTxn.type==='expense') DATA.accounts[oldAccIdx].balance+=oldTxn.amount;
        else if(oldTxn.type==='payable') DATA.accounts[oldAccIdx].balance-=oldTxn.amount;
        else if(oldTxn.type==='receivable') DATA.accounts[oldAccIdx].balance+=oldTxn.amount;
      }
    }
    // Apply new account effect
    const newAccIdx=DATA.accounts.findIndex(a=>a.id===accountId);
    if(newAccIdx!==-1){
      if(type==='income')      DATA.accounts[newAccIdx].balance+=amount;
      else if(type==='expense') DATA.accounts[newAccIdx].balance-=amount;
      else if(type==='payable') DATA.accounts[newAccIdx].balance+=amount;
      else if(type==='receivable') DATA.accounts[newAccIdx].balance-=amount;
    }
  }

  if(editId){
    const idx=DATA.transactions.findIndex(t=>t.id==editId);
    if(idx!==-1)DATA.transactions[idx]=txn;
    toast('Transaction updated ✓');
  } else {
    DATA.transactions.unshift(txn);
    toast('Transaction added ✓');
  }
  saveData();closeModal('add-txn');renderAll();
}
function deleteTxn(id){
  const txn=DATA.transactions.find(t=>t.id==id);
  const findFeeTxn=tr=>DATA.transactions.find(t=>t.id!=tr.id&&((tr.feeTxnId&&t.id==tr.feeTxnId)||t.linkedTransferTxnId==tr.id));
  const feeTxn=(txn&&txn.type==='transfer')?findFeeTxn(txn):null;
  if(!confirm(feeTxn?'Delete this transfer? এর সাথে যুক্ত Transaction Fee এন্ট্রিটিও মুছে যাবে।':'Delete this transaction?'))return;
  // If deleting a group txn, unlink its linked children
  if(txn&&txn.splits){
    txn.splits.forEach(s=>{
      if(s.linkedTxnId){
        const lt=DATA.transactions.find(t=>t.id==s.linkedTxnId);
        if(lt) lt.groupParentId=null;
      }
    });
  }
  // Revert account balance effect
  if(txn){
    ensureAccounts();
    if(txn.type==='transfer'){
      // Balance transfer transaction: reverse the money movement and remove the linked transfer record
      const fi=DATA.accounts.findIndex(a=>a.id===txn.fromAccount);
      const ti=DATA.accounts.findIndex(a=>a.id===txn.toAccount);
      if(fi!==-1)DATA.accounts[fi].balance+=txn.amount;
      if(ti!==-1)DATA.accounts[ti].balance-=txn.amount;
      if(txn.transferId&&Array.isArray(DATA.transfers))DATA.transfers=DATA.transfers.filter(tr=>tr.id!==txn.transferId);
      // Linked Transaction Fee entry: give the fee back to its account and remove it too
      if(feeTxn){
        const fai=DATA.accounts.findIndex(a=>a.id===(feeTxn.account||txn.fromAccount));
        if(fai!==-1)DATA.accounts[fai].balance+=feeTxn.amount;
        DATA.transactions=DATA.transactions.filter(t=>t.id!=feeTxn.id);
      }
    } else if(txn.splits&&txn.splits.length>0){
      // Group transaction: revert per-split balances
      txn.splits.forEach(s=>{
        const sAcc=s.account||txn.account||'cash';
        const accIdx=DATA.accounts.findIndex(a=>a.id===sAcc);
        if(accIdx!==-1){
          if(txn.type==='income')        DATA.accounts[accIdx].balance-=s.amount;
          else if(txn.type==='expense')  DATA.accounts[accIdx].balance+=s.amount;
          else if(txn.type==='payable')  DATA.accounts[accIdx].balance-=s.amount;
          else if(txn.type==='receivable') DATA.accounts[accIdx].balance+=s.amount;
        }
      });
    } else if(txn.account){
      const accIdx=DATA.accounts.findIndex(a=>a.id===txn.account);
      if(accIdx!==-1){
        if(txn.type==='income')        DATA.accounts[accIdx].balance-=txn.amount;
        else if(txn.type==='expense')  DATA.accounts[accIdx].balance+=txn.amount;
        else if(txn.type==='payable') DATA.accounts[accIdx].balance-=txn.amount;
        else if(txn.type==='receivable') DATA.accounts[accIdx].balance+=txn.amount;
      }
    }
  }
  DATA.transactions=DATA.transactions.filter(t=>t.id!=id);
  saveData();renderAll();toast('Deleted','info');
}

/* ══════════════════════════════════════════════════════════════
   SECTION 07 · FORMS
   Pay-off modal; budget / goal / investment save & delete.
   ══════════════════════════════════════════════════════════════ */
// ══ PAY OFF / PAY BACK ══════════════════════════════════════════════════════
function prepPayoffModal(txn){
  if(!txn) return;
  const isPayable=(txn.type==='payable');
  const paid=txn.paidAmount||0;
  const remaining=txn.amount-paid;
  document.getElementById('payoff-title').textContent=isPayable?'💳 Pay Back (ঋণ পরিশোধ)':'💰 Pay Off (পাওনা আদায়)';
  document.getElementById('payoff-type-label').textContent=isPayable?'Payable — ঋণ নিয়েছিলেন':'Receivable — ধার দিয়েছিলেন';
  document.getElementById('payoff-person-display').textContent=(txn.person||'Unknown')+' · '+txn.desc;
  document.getElementById('payoff-original-amount').textContent=fmt(txn.amount);
  document.getElementById('payoff-remaining').textContent=fmt(remaining);
  document.getElementById('payoff-remaining').style.color=remaining>0?'#ef4444':'var(--pos)';
  document.getElementById('payoff-amount').value='';
  document.getElementById('payoff-date').value=today();
  document.getElementById('payoff-txn-id').value=txn.id;
  document.getElementById('payoff-account-label').textContent=isPayable?'🏦 কোন Account থেকে পরিশোধ করবেন?':'🏦 কোন Account-এ টাকা আসবে?';
  document.getElementById('payoff-btn').textContent=isPayable?'✅ Pay Back করুন':'✅ Pay Off করুন';
  ensureAccounts();
  const accSel=document.getElementById('payoff-account');
  accSel.innerHTML=DATA.accounts.map(a=>`<option value="${a.id}">${a.name} (${fmtFull(a.balance)})</option>`).join('');
  // Pre-select original account if available
  if(txn.account){ accSel.value=txn.account; }
}

function doPayoff(){
  const txnId=document.getElementById('payoff-txn-id').value;
  const payAmt=parseFloat(document.getElementById('payoff-amount').value);
  const accountId=document.getElementById('payoff-account').value;
  const date=document.getElementById('payoff-date').value;
  if(!payAmt||payAmt<=0){toast('পরিমাণ দিন','error');return}
  if(!accountId){toast('Account select করুন','error');return}
  const txnIdx=DATA.transactions.findIndex(t=>t.id==txnId);
  if(txnIdx===-1){toast('Transaction পাওয়া যায়নি','error');return}
  const txn=DATA.transactions[txnIdx];
  const remaining=txn.amount-(txn.paidAmount||0);
  if(payAmt>remaining){toast(`বাকি আছে মাত্র ${fmt(remaining)}। বেশি দেওয়া যাবে না।`,'error');return}
  const isPayable=(txn.type==='payable');
  // Update account balance
  ensureAccounts();
  const accIdx=DATA.accounts.findIndex(a=>a.id===accountId);
  if(accIdx!==-1){
    // Pay back payable → money leaves account (ঋণ পরিশোধে account থেকে টাকা বের হয়)
    // Pay off receivable → money comes to account (পাওনা আদায়ে account-এ টাকা আসে)
    DATA.accounts[accIdx].balance += isPayable ? -payAmt : payAmt;
  }
  // Update transaction paid amount
  const newPaid=(txn.paidAmount||0)+payAmt;
  DATA.transactions[txnIdx].paidAmount=newPaid;
  DATA.transactions[txnIdx].status=newPaid>=txn.amount?'settled':'partial';
  // Add a settlement record as a note transaction
  DATA.transactions.unshift({
    id:uid(),
    type:isPayable?'expense':'income',
    amount:payAmt,
    cat:isPayable?'Payable Payment':'Receivable Collection',
    desc:(isPayable?'Paid back to ':'Collected from ')+(txn.person||txn.desc),
    date,
    emoji:isPayable?'💳':'💰',
    account:accountId,
    linkedLRId:txnId,
    time:'',
    sortOrder:nextTxnSortOrder(date)
  });
  saveData();closeModal('payoff');renderAll();
  toast((isPayable?'Pay back':'Pay off')+' করা হয়েছে: '+fmt(payAmt)+' ✓');
}
function setBudgetType(type){
  const isCustom=type==='custom';
  document.getElementById('budget-is-custom').value=isCustom?'1':'0';
  document.getElementById('budget-cat-group').style.display=isCustom?'none':'block';
  document.getElementById('budget-custom-group').style.display=isCustom?'block':'none';
  document.getElementById('budget-type-category').className='type-btn'+(!isCustom?' active income':'');
  document.getElementById('budget-type-custom').className='type-btn'+(isCustom?' active expense':'');
}
function prepBudgetModal(data){
  document.getElementById('budget-modal-title').textContent=data?'Edit Budget':'Add Budget';
  document.getElementById('budget-edit-id').value=data?data.id:'';
  const usedCats=DATA.budgets.map(b=>b.cat);
  const avail=data?getAllCats():getAllCats().filter(c=>!usedCats.includes(c));
  populateCatSelect('budget-cat',avail.length?avail:getAllCats(),data&&!data.isCustom?data.cat:null);
  document.getElementById('budget-limit').value=data?data.limit:'';
  document.getElementById('budget-custom-name').value=(data&&data.isCustom)?data.cat:'';
  setBudgetType(data&&data.isCustom?'custom':'category');
}
function saveBudget(){
  const isCustom=document.getElementById('budget-is-custom').value==='1';
  const cat=isCustom?document.getElementById('budget-custom-name').value.trim():document.getElementById('budget-cat').value;
  const limit=parseFloat(document.getElementById('budget-limit').value);
  const editId=document.getElementById('budget-edit-id').value;
  if(isCustom&&!cat){toast('কাস্টম বাজেটের নাম দিন','error');return}
  if(!limit||limit<=0){toast('Enter a valid limit','error');return}
  if(editId){const idx=DATA.budgets.findIndex(b=>b.id==editId);if(idx!==-1){DATA.budgets[idx].cat=cat;DATA.budgets[idx].limit=limit;DATA.budgets[idx].isCustom=isCustom;if(isCustom)DATA.budgets[idx].color='#a78bfa'}toast('Budget updated ✓')}
  else{if(DATA.budgets.find(b=>b.cat===cat)){toast('Budget already exists for this name','error');return}DATA.budgets.push({id:uid(),cat,limit,isCustom,color:isCustom?'#a78bfa':getCatColor(cat)});toast('Budget added ✓')}
  saveData();closeModal('add-budget');renderAll();
}
function deleteBudget(id){if(!confirm('Remove this budget?'))return;DATA.budgets=DATA.budgets.filter(b=>b.id!=id);saveData();renderAll();toast('Budget removed','info')}
function prepGoalModal(data){
  document.getElementById('goal-modal-title').textContent=data?'Edit Goal':'New Savings Goal';
  document.getElementById('goal-edit-id').value=data?data.id:'';
  document.getElementById('goal-name').value=data?data.name:'';
  document.getElementById('goal-emoji').value=data?data.emoji:'🎯';
  document.getElementById('goal-target').value=data?data.target:'';
  document.getElementById('goal-saved').value=data?data.saved:'';
}
function saveGoal(){
  const name=document.getElementById('goal-name').value.trim();
  const emoji=document.getElementById('goal-emoji').value.trim()||'🎯';
  const target=parseFloat(document.getElementById('goal-target').value);
  const saved=parseFloat(document.getElementById('goal-saved').value)||0;
  const editId=document.getElementById('goal-edit-id').value;
  if(!name){toast('Enter a goal name','error');return}
  if(!target||target<=0){toast('Enter a valid target','error');return}
  if(editId){const idx=DATA.goals.findIndex(g=>g.id==editId);if(idx!==-1)DATA.goals[idx]={...DATA.goals[idx],name,emoji,target,saved};toast('Goal updated ✓')}
  else{
    const maxOrder=DATA.goals.filter(g=>!g.achieved).reduce((m,g)=>Math.max(m,(g.order??0)),-1);
    DATA.goals.push({id:uid(),name,emoji,target,saved,color:GOAL_COLORS[goalColorIdx++%GOAL_COLORS.length],achieved:false,order:maxOrder+1});
    toast('Goal added ✓');
  }
  saveData();closeModal('add-goal');renderAll();
}
function deleteGoal(id){if(!confirm('Delete this goal?'))return;DATA.goals=DATA.goals.filter(g=>g.id!=id);saveData();renderAll();toast('Goal removed','info')}
function openAddSavings(id){
  const g=DATA.goals.find(g=>g.id==id);if(!g)return;
  document.getElementById('savings-goal-id').value=id;
  document.getElementById('savings-goal-name').textContent=g.emoji+' '+g.name+' — '+fmt(g.saved)+' saved of '+fmt(g.target);
  document.getElementById('savings-amount').value='';
  openModal('add-savings');
}
function addSavings(){
  const id=document.getElementById('savings-goal-id').value;
  const amt=parseFloat(document.getElementById('savings-amount').value);
  if(!amt||amt<=0){toast('Enter a valid amount','error');return}
  const idx=DATA.goals.findIndex(g=>g.id==id);if(idx===-1)return;
  DATA.goals[idx].saved=Math.min(DATA.goals[idx].saved+amt,DATA.goals[idx].target);
  const g=DATA.goals[idx];
  saveData();closeModal('add-savings');renderAll();toast(fmt(amt)+' added to '+g.name+' ✓');
  // গোল সম্পূর্ণ হয়ে গেলে "অর্জিত" হিসেবে মার্ক করার অপশন দেওয়া হয়
  if(g.saved>=g.target && !g.achieved){
    setTimeout(()=>{
      if(confirm('🎉 "'+g.name+'" গোলটি সম্পূর্ণ হয়ে গেছে!\n\nএটি "অর্জিত" (Achieved) হিসেবে মার্ক করবেন?')){
        markGoalAchieved(g.id);
      }
    },300);
  }
}
function markGoalAchieved(id){
  const idx=DATA.goals.findIndex(g=>g.id==id);if(idx===-1)return;
  DATA.goals[idx].achieved=true;
  DATA.goals[idx].achievedAt=today();
  saveData();renderAll();
  toast('🏆 "'+DATA.goals[idx].name+'" অর্জিত গোল হিসেবে মার্ক করা হলো!');
}
function restoreGoal(id){
  const idx=DATA.goals.findIndex(g=>g.id==id);if(idx===-1)return;
  DATA.goals[idx].achieved=false;
  saveData();renderAll();
  toast('গোলটি আবার "চলমান" তালিকায় ফিরিয়ে আনা হয়েছে','info');
}
function prepInvestModal(data){
  document.getElementById('invest-modal-title').textContent=data?'Edit Investment':'Add Investment';
  document.getElementById('invest-edit-id').value=data?data.id:'';
  document.getElementById('invest-name').value=data?data.name:'';
  document.getElementById('invest-principal').value=data?data.principal:'';
  document.getElementById('invest-current').value=data?data.current:'';
  document.getElementById('invest-notes').value=data?data.notes:'';
  const sel=document.getElementById('invest-type');
  sel.innerHTML=getInvestTypes().map(t=>`<option value="${t}"${data&&data.type===t?' selected':''}>${t}</option>`).join('');
  // Populate account select
  ensureAccounts();
  const accSel=document.getElementById('invest-account');
  if(accSel) accSel.innerHTML=DATA.accounts.map(a=>`<option value="${a.id}"${data&&data.account===a.id?' selected':''}>${a.name} (${fmtFull(a.balance)})</option>`).join('');
}
function saveInvestment(){
  const name=document.getElementById('invest-name').value.trim();
  const type=document.getElementById('invest-type').value;
  const principal=parseFloat(document.getElementById('invest-principal').value);
  const current=parseFloat(document.getElementById('invest-current').value);
  const notes=document.getElementById('invest-notes').value.trim();
  const accountId=document.getElementById('invest-account').value||'';
  const editId=document.getElementById('invest-edit-id').value;
  if(!name||!principal||!current){toast('Fill all required fields','error');return}

  // Account balance update
  ensureAccounts();
  if(!editId&&accountId){
    // নতুন investment → account থেকে principal কাটা
    const accIdx=DATA.accounts.findIndex(a=>a.id===accountId);
    if(accIdx!==-1) DATA.accounts[accIdx].balance-=principal;
  }
  if(editId&&accountId){
    const oldInv=DATA.investments.find(i=>i.id==editId);
    // Revert old account effect
    if(oldInv&&oldInv.account){
      const oldAccIdx=DATA.accounts.findIndex(a=>a.id===oldInv.account);
      if(oldAccIdx!==-1) DATA.accounts[oldAccIdx].balance+=oldInv.principal;
    }
    // Apply new
    const newAccIdx=DATA.accounts.findIndex(a=>a.id===accountId);
    if(newAccIdx!==-1) DATA.accounts[newAccIdx].balance-=principal;
  }

  if(editId){
    const idx=DATA.investments.findIndex(i=>i.id==editId);
    if(idx!==-1)DATA.investments[idx]={...DATA.investments[idx],name,type,principal,current,notes,account:accountId};
    toast('Investment updated ✓');
  } else {
    DATA.investments.push({id:uid(),name,type,principal,current,notes,account:accountId});
    toast('Investment added ✓');
  }
  saveData();closeModal('add-investment');renderAll();
}
function deleteInvestment(id){if(!confirm('Remove this investment?'))return;DATA.investments=DATA.investments.filter(i=>i.id!=id);saveData();renderAll();toast('Removed','info')}
function prepProfileModal(){document.getElementById('profile-name').value=DATA.profile.name;document.getElementById('profile-balance').value=DATA.profile.openingBalance}
function saveProfile(){
  DATA.profile.name=document.getElementById('profile-name').value.trim()||DATA.profile.name;
  DATA.profile.openingBalance=parseFloat(document.getElementById('profile-balance').value)||0;
  const n=DATA.profile.name;
  document.getElementById('user-name-display').textContent=n;
  document.getElementById('user-avatar').textContent=n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  saveData();closeModal('profile');renderAll();toast('Profile saved ✓');
}

/* ══════════════════════════════════════════════════════════════
   SECTION 08 · PROFILE PAGE
   Avatar, personal details, delete account.
   ══════════════════════════════════════════════════════════════ */
// ─── Full Profile Page ─────────────────────────────────────────────────────
const AVATAR_PRESETS = ['😀','😎','🤓','🥳','🦁','🐱','🐶','🦊','🐼','🐧','🚀','💼','🎯','🌟','🔥','⚡','🌈','🍀','🎨','⚽','🎧','📚','☕','💡'];
let pfSelectedAvatar = '';

function getAvatarDisplay(profile, name){
  if (profile && profile.avatar) return profile.avatar;
  return (name || 'U').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
}

function renderAvatarGrid(selected){
  const grid = document.getElementById('pf-avatar-grid');
  if (!grid) return;
  grid.innerHTML = AVATAR_PRESETS.map(e => `<button type="button" class="btn btn-ghost" style="padding:8px 0;font-size:19px;${e===selected?'border-color:var(--accent);background:var(--bg4)':''}" onclick="selectAvatarPreset('${e}')">${e}</button>`).join('');
}

function selectAvatarPreset(emoji){
  pfSelectedAvatar = emoji;
  const customInput = document.getElementById('pf-avatar-custom');
  if (customInput) customInput.value = '';
  const preview = document.getElementById('pf-avatar-preview');
  if (preview) preview.textContent = emoji;
  renderAvatarGrid(emoji);
}

function handleAvatarCustomInput(val){
  const trimmed = val.trim();
  const preview = document.getElementById('pf-avatar-preview');
  if (trimmed) {
    pfSelectedAvatar = trimmed;
    if (preview) preview.textContent = trimmed;
    renderAvatarGrid(null);
  } else {
    pfSelectedAvatar = '';
    const name = document.getElementById('pf-name').value || '';
    if (preview) preview.textContent = getAvatarDisplay(null, name);
    renderAvatarGrid(null);
  }
}

function renderProfilePage(){
  const p = (currentUserMeta && currentUserMeta.profile) || DATA.profile;
  const n = p.name || DATA.profile.name || 'User';
  const currentAvatar = (currentUserMeta && currentUserMeta.profile && currentUserMeta.profile.avatar) || '';
  pfSelectedAvatar = currentAvatar;

  document.getElementById('profile-page-avatar').textContent = getAvatarDisplay({avatar:currentAvatar}, n);
  document.getElementById('pf-avatar-preview').textContent = getAvatarDisplay({avatar:currentAvatar}, n);
  document.getElementById('pf-avatar-custom').value = AVATAR_PRESETS.includes(currentAvatar) ? '' : currentAvatar;
  renderAvatarGrid(AVATAR_PRESETS.includes(currentAvatar) ? currentAvatar : null);

  document.getElementById('profile-page-name').textContent = n;
  document.getElementById('profile-page-email').textContent = (currentUserMeta && currentUserMeta.email) || '';
  document.getElementById('profile-page-badges').innerHTML = '';

  document.getElementById('pf-name').value = n;
  document.getElementById('pf-phone').value = p.phone || '';
  document.getElementById('pf-job').value = p.occupation || '';
  document.getElementById('pf-balance').value = DATA.profile.openingBalance || 0;
  document.getElementById('pf-created').value = currentUserMeta && currentUserMeta.createdAt ? new Date(currentUserMeta.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';

  document.getElementById('pf-phone-group').style.display = '';
  document.getElementById('pf-job-group').style.display = '';
  document.getElementById('pf-danger-zone').style.display = '';
}

async function saveProfilePage(){
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { toast('Name cannot be empty', 'error'); return; }
  DATA.profile.name = name;
  DATA.profile.openingBalance = parseFloat(document.getElementById('pf-balance').value) || 0;
  DATA.profile.avatar = pfSelectedAvatar || '';
  const avatarDisplay = getAvatarDisplay({avatar: pfSelectedAvatar}, name);
  document.getElementById('user-name-display').textContent = name;
  document.getElementById('user-avatar').textContent = avatarDisplay;
  saveData();

  if (currentUserMeta) {
    const phone = document.getElementById('pf-phone').value.trim();
    const occupation = document.getElementById('pf-job').value.trim();
    try {
      const { getFirestore, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      if (!db) db = getFirestore(firebaseApp);
      const profile = { name, phone, occupation, avatar: pfSelectedAvatar || '' };
      await updateDoc(doc(db, 'user_meta', currentUserMeta.uid), { profile });
      currentUserMeta.profile = profile;
    } catch (e) {
      console.warn('saveProfilePage meta update error:', e);
    }
  }
  renderProfilePage();
  renderAll();
  toast('Profile saved ✓');
}

async function deleteMyAccount(){
  if (!currentUserMeta) {
    toast('This account cannot be self-deleted', 'error');
    return;
  }
  if (!confirm('This will permanently delete your account and ALL your data (transactions, budgets, goals, investments). This cannot be undone. Continue?')) return;
  const typed = prompt('Type DELETE to confirm you want to permanently remove your account:');
  if (typed !== 'DELETE') { toast('Account deletion cancelled', 'info'); return; }

  try {
    const { getFirestore, doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    if (!db) db = getFirestore(firebaseApp);
    // user_meta FIRST: firestore.rules refuse this for blocked/limited accounts, so
    // nothing is destroyed if the request is refused.
    await deleteDoc(doc(db, 'user_meta', currentUserMeta.uid));
    const gid = 'google_' + currentUserMeta.uid;
    for (const id of [gid, gid + '_backup', ...['transactions','budgets','goals','investments'].map(x => gid + '_reset_' + x)]) {
      await deleteDoc(doc(db, 'users', id)).catch(() => {});
    }
    // New-layout subcollections (present only after the Phase-1 migration was run)
    if (window.FV && window.FV.userService) {
      try { await window.FV.userService.deleteAccount(currentUserMeta.uid); } catch (_) {}
    }
  } catch (e) {
    console.warn('deleteMyAccount error:', e);
    toast('Failed to delete account. Please try again.', 'error');
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  toast('Account deleted', 'info');
  logout();
}
document.querySelectorAll('.nav-item[data-page]').forEach(item=>{
  item.addEventListener('click',()=>{switchPage(item.dataset.page);closeSidebar()});
});
// Bottom tab bar (phones only) mirrors the sidebar's data-page items —
// tapping a tab switches pages the same way and closes the drawer if open.
document.querySelectorAll('.bn-item[data-page]').forEach(item=>{
  item.addEventListener('click',()=>{switchPage(item.dataset.page);closeSidebar()});
});

/* ══════════════════════════════════════════════════════════════
   SECTION 09 · NAVIGATION
   switchPage, sidebar, header menus.
   ══════════════════════════════════════════════════════════════ */
function switchPage(page){
  document.querySelectorAll('.nav-item,.bn-item[data-page]').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('[data-page="'+page+'"]').forEach(n=>n.classList.add('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+page);
  if(pg)pg.classList.add('active');
  const titles={dashboard:['Dashboard',new Date().toLocaleString('en-US',{month:'long',year:'numeric'})+' · All accounts'],transactions:['Transactions','Every record, searchable'],budgets:['Budgets','Monthly spending limits'],goals:['Savings goals','Track your milestones'],investments:['Investments','Portfolio performance'],reports:['Reports','Insights across your finances'],database:['Data & Backup','Export, import and restore your data'],accounts:['Accounts','Banks, wallets and cash'],profile:['Profile','Your personal details']};
  const t=titles[page]||[page,''];
  document.getElementById('page-title').textContent=t[0];
  document.getElementById('page-sub').textContent=t[1];
  renderPageContent(page);
  if(typeof forceThemeColors==='function')forceThemeColors();
}
function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
  const more=document.getElementById('bn-more');
  if(more)more.classList.toggle('active',document.getElementById('sidebar').classList.contains('open'));
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  const more=document.getElementById('bn-more');
  if(more)more.classList.remove('active');
}
// Desktop icon-rail sidebar: collapsed (circle icons only) <-> expanded (labels).
// Mirrors the data-theme pattern so the choice persists with no flash on reload.
function toggleSidebarRail(){
  const html=document.documentElement;
  const cur=html.getAttribute('data-sidebar')||(window.innerWidth>=1100?'expanded':'collapsed');
  const next=cur==='expanded'?'collapsed':'expanded';
  html.setAttribute('data-sidebar',next);
  try{localStorage.setItem('finvault_sidebar',next)}catch(e){}
  const btn=document.getElementById('sidebar-toggle');
  if(btn)btn.setAttribute('title',next==='expanded'?'Collapse sidebar':'Expand sidebar');
}
function toggleProfileMenu(e){
  if(e)e.stopPropagation();
  document.getElementById('profile-menu').classList.toggle('open');
}
function closeProfileMenu(){
  document.getElementById('profile-menu').classList.remove('open');
}
document.addEventListener('click',(e)=>{
  const menu=document.getElementById('profile-menu');
  if(menu && !menu.contains(e.target)) menu.classList.remove('open');
  const addTxnMenu=document.getElementById('add-txn-switcher');
  if(addTxnMenu && !addTxnMenu.contains(e.target)) addTxnMenu.classList.remove('open');
  const bnFabMenu=document.getElementById('bn-fab-wrap');
  if(bnFabMenu && !bnFabMenu.contains(e.target)) bnFabMenu.classList.remove('open');
});
(function initProfileMenuHover(){
  const menu=document.getElementById('profile-menu');
  if(!menu) return;
  let hoverTimeout;
  menu.addEventListener('mouseenter',()=>{clearTimeout(hoverTimeout);menu.classList.add('open')});
  menu.addEventListener('mouseleave',()=>{hoverTimeout=setTimeout(()=>menu.classList.remove('open'),150)});
})();
// Add Transaction header trigger — click to toggle, or hover to reveal
// "Add New Transaction" / "Balance Transfer" without clicking (desktop only;
// hidden on mobile since the bottom nav already has its own + button).
function toggleAddTxnMenu(e){
  if(e)e.stopPropagation();
  document.getElementById('add-txn-switcher').classList.toggle('open');
}
function closeAddTxnMenu(){
  document.getElementById('add-txn-switcher').classList.remove('open');
}
// Mobile bottom-nav "+" — same two options as the desktop header button
// (New Transaction / Balance Transfer), but tap-to-open only since touch
// devices don't have hover.
function toggleBnFabMenu(e){
  if(e)e.stopPropagation();
  document.getElementById('bn-fab-wrap').classList.toggle('open');
}
function closeBnFabMenu(){
  document.getElementById('bn-fab-wrap').classList.remove('open');
}
(function initAddTxnMenuHover(){
  const menu=document.getElementById('add-txn-switcher');
  if(!menu) return;
  let hoverTimeout;
  menu.addEventListener('mouseenter',()=>{clearTimeout(hoverTimeout);menu.classList.add('open')});
  menu.addEventListener('mouseleave',()=>{hoverTimeout=setTimeout(()=>menu.classList.remove('open'),150)});
})();

// ── Theme switcher: light/dark mode × 5 accent-color palettes ─────────────
// Each combination maps directly onto an existing [data-theme] block in the
// CSS (e.g. mode "dark" + color "rose" => data-theme="dark-rose"), so this
// file only has to track the two choices and compose the theme name.

/* ══════════════════════════════════════════════════════════════
   SECTION 10 · THEME
   Light/dark mode and palette switching.
   ══════════════════════════════════════════════════════════════ */
const THEME_KEY='finvault_theme_v2';
const THEME_COLORS=['emerald','sapphire','burgundy','onyx'];
function parseThemeName(name){
  const parts=(name||'dark-emerald').split('-');
  const mode=parts[0]==='light'?'light':'dark';
  const color=THEME_COLORS.includes(parts[1])?parts[1]:'emerald';
  return{mode,color};
}
let themeState=parseThemeName(document.documentElement.getAttribute('data-theme')||localStorage.getItem(THEME_KEY));
function applyTheme(){
  const themeName=`${themeState.mode}-${themeState.color}`;
  const root=document.documentElement;
  root.setAttribute('data-theme',themeName);
  try{localStorage.setItem(THEME_KEY,themeName)}catch(e){}
  // all colours come from the [data-theme] token blocks — clear any stale inline overrides
  ['--accent','--accent2','--accent3','--accent4','--accent5','--accent6','--accent-rgb','--accent2-rgb'].forEach(v=>root.style.removeProperty(v));
  const mt=document.querySelector('meta[name="theme-color"]');
  if(mt)mt.setAttribute('content',getComputedStyle(root).getPropertyValue('--bg').trim());
  forceThemeColors();
  updateThemeSwitcherUI();
}
function hexToRgbStr(hex){
  const h=hex.replace('#','');
  return `${parseInt(h.substring(0,2),16)},${parseInt(h.substring(2,4),16)},${parseInt(h.substring(4,6),16)}`;
}
function forceThemeColors(){
  // legacy hook: earlier builds pinned inline colours here. Now just clears them.
  document.querySelectorAll('.btn-primary,.avatar').forEach(el=>el.style.removeProperty('background'));
  document.querySelectorAll('.nav-item').forEach(el=>el.style.removeProperty('color'));
}
function updateThemeSwitcherUI(){
  const sun=document.getElementById('theme-icon-sun'),moon=document.getElementById('theme-icon-moon');
  if(sun&&moon){
    sun.style.display=themeState.mode==='light'?'block':'none';
    moon.style.display=themeState.mode==='dark'?'block':'none';
  }
  const lightBtn=document.getElementById('theme-mode-light'),darkBtn=document.getElementById('theme-mode-dark');
  if(lightBtn)lightBtn.classList.toggle('active',themeState.mode==='light');
  if(darkBtn)darkBtn.classList.toggle('active',themeState.mode==='dark');
  document.querySelectorAll('.theme-swatch').forEach(b=>b.classList.toggle('active',b.dataset.color===themeState.color));
}
function setThemeMode(mode){themeState.mode=mode;applyTheme();refreshChartsForTheme()}
function setThemeColor(color){themeState.color=color;applyTheme();refreshChartsForTheme()}
function refreshChartsForTheme(){
  // Canvas charts don't pick up CSS variable changes on their own, so
  // re-render whatever chart-bearing view is currently on screen.
  try{
    if(typeof DATA==='undefined'||!DATA)return;
    if(typeof buildFlowChart==='function'&&document.getElementById('flowChart'))buildFlowChart();
    if(typeof buildDonutChart==='function'&&document.getElementById('donutChart'))buildDonutChart();
    const active=document.querySelector('.page.active');
    if(active){
      const pageId=active.id.replace('page-','');
      if((pageId==='investments'||pageId==='reports')&&typeof renderPageContent==='function')renderPageContent(pageId);
    }
  }catch(e){}
}
function toggleThemeMenu(e){
  if(e)e.stopPropagation();
  const sw=document.getElementById('theme-switcher');
  if(window.matchMedia('(hover:hover)').matches)sw.classList.add('open');else sw.classList.toggle('open');
}
document.addEventListener('click',(e)=>{
  const sw=document.getElementById('theme-switcher');
  if(sw && !sw.contains(e.target)) sw.classList.remove('open');
});
(function initThemeSwitcherHover(){
  const sw=document.getElementById('theme-switcher');
  if(!sw) return;
  let hoverTimeout;
  sw.addEventListener('mouseenter',()=>{clearTimeout(hoverTimeout);sw.classList.add('open')});
  sw.addEventListener('mouseleave',()=>{hoverTimeout=setTimeout(()=>sw.classList.remove('open'),150)});
})();
applyTheme();

/* ══════════════════════════════════════════════════════════════
   SECTION 11 · DASHBOARD
   Stats, charts, KPI tiles, dashboard widgets.
   ══════════════════════════════════════════════════════════════ */
function calcStats(){
  const income=DATA.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense=DATA.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  // Payable pending = total payable minus paid amounts (কত টাকা এখনো শোধ করা বাকি)
  const payableTxns=DATA.transactions.filter(t=>t.type==='payable');
  const payable=payableTxns.reduce((s,t)=>s+(t.amount-(t.paidAmount||0)),0);
  // Receivable pending = total receivable minus collected amounts (কত টাকা এখনো পাওয়া বাকি)
  const receivableTxns=DATA.transactions.filter(t=>t.type==='receivable');
  const receivable=receivableTxns.reduce((s,t)=>s+(t.amount-(t.paidAmount||0)),0);
  // ঋণ নেওয়ার (payable) পুরো amount ক্যাশ ব্যালেন্সে + হয় (টাকা হাতে আসে),
  // আর ধার দেওয়ার (receivable) পুরো amount ক্যাশ ব্যালেন্স থেকে − হয় (টাকা হাতছাড়া হয়)।
  // পরিশোধ/আদায় নিজে থেকেই আলাদা expense/income এন্ট্রি হিসেবে ধরা থাকে, তাই এখানে পুরো
  // মূল amount ব্যবহার করা হচ্ছে (pending নয়) — দ্বিগুণ হিসাব এড়াতে।
  const payableFull=payableTxns.reduce((s,t)=>s+t.amount,0);
  const receivableFull=receivableTxns.reduce((s,t)=>s+t.amount,0);
  const balance=DATA.profile.openingBalance+income-expense+payableFull-receivableFull;
  const savings=income-expense;
  return{income,expense,balance,savings,payable,receivable};
}
let flowChart,donutChart,portfolioChart,reportBarChart,reportLineChart;
function buildFlowChart(period='6M'){
  const ctx=document.getElementById('flowChart');if(!ctx)return;
  const numMonths=period==='1Y'?12:period==='6M'?6:period==='3M'?3:1;
  const monthKeys=[];
  for(let i=numMonths-1;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);monthKeys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  const labels=monthKeys.map(k=>{const[y,m]=k.split('-');return new Date(+y,+m-1,1).toLocaleString('en-IN',{month:'short'});});
  const incomes=monthKeys.map(k=>DATA.transactions.filter(t=>t.type==='income'&&t.date&&t.date.startsWith(k)).reduce((s,t)=>s+t.amount,0));
  const expenses=monthKeys.map(k=>DATA.transactions.filter(t=>t.type==='expense'&&t.date&&t.date.startsWith(k)).reduce((s,t)=>s+t.amount,0));
  if(flowChart)flowChart.destroy();
  flowChart=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Income',data:incomes,backgroundColor:cA('--pos-rgb',0.19),borderColor:getThemeVar('--pos'),borderWidth:1.5,borderRadius:5},{label:'Expenses',data:expenses,backgroundColor:cA('--neg-rgb',0.16),borderColor:getThemeVar('--neg'),borderWidth:1.5,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:getThemeVar('--text2'),font:{size:cfs()},boxWidth:10}}},scales:{x:{ticks:{color:getThemeVar('--text2'),font:{size:cfs()-1}},grid:{color:getThemeVar('--border2')}},y:{ticks:{color:getThemeVar('--text2'),font:{size:cfs()-1},callback:v=>'৳'+Math.round(v/1000)+'K'},grid:{color:getThemeVar('--border2')}}}}});
}
let donutChartType='expense';
function buildDonutChart(type){
  type=type||donutChartType;donutChartType=type;
  const ctx=document.getElementById('donutChart');if(!ctx)return;
  const catAgg={};DATA.transactions.filter(t=>t.type===type).forEach(t=>{catAgg[t.cat]=(catAgg[t.cat]||0)+t.amount});
  const cats=Object.keys(catAgg),vals=Object.values(catAgg),colors=cats.map(c=>getCatColor(c));
  const total=vals.reduce((a,b)=>a+b,0);
  document.getElementById('donut-total').textContent=fmt(total);
  const lblEl=document.getElementById('donut-lbl');
  if(lblEl)lblEl.textContent=type==='expense'?'spent · all time':'earned · all time';
  if(donutChart)donutChart.destroy();
  if(!cats.length){
    const legend=document.getElementById('donut-legend');
    if(legend)legend.innerHTML=`<div class="empty" style="padding:6px 0"><div class="empty-text">No ${type} data yet</div></div>`;
    return;
  }
  donutChart=new Chart(ctx,{type:'doughnut',data:{labels:cats,datasets:[{data:vals,backgroundColor:colors,borderWidth:0,hoverOffset:6}]},options:{cutout:'72%',responsive:true,maintainAspectRatio:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmt(c.raw)}`}}}}});
  const legend=document.getElementById('donut-legend');
  if(legend)legend.innerHTML=cats.map((c,i)=>`<div class="legend-item"><div class="legend-left"><div class="legend-dot" style="background:${colors[i]}"></div><span>${c}</span></div><span class="legend-pct">${Math.round((vals[i]/total)*100)}%</span></div>`).join('');
}
function switchDonutChart(el,type){
  el.closest('.tab-group').querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  buildDonutChart(type);
}
function switchFlowChart(el,period){el.closest('.tab-group').querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');buildFlowChart(period)}
function renderKPI(){
  const{income,expense,balance,savings,payable,receivable}=calcStats();
  document.getElementById('kpi-balance').innerHTML=fmtFull(balance).replace('৳','<span class="cur">৳</span>');
  // বাজেট বাদ দিয়ে ও ঋণ (payable pending) বাদ দিয়ে টোটাল ব্যালেন্স — ছোট ফন্টে, পাশাপাশি অ্যালাইন করা
  const curMonthStr=(()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;})();
  const totalBudgetAmt=DATA.budgets.reduce((s,b)=>s+getBudgetLimitForMonth(b,curMonthStr),0);
  const balanceMinusBudget=balance-totalBudgetAmt;
  const bmbEl=document.getElementById('kpi-balance-minus-budget');
  if(bmbEl)bmbEl.textContent='বাজেট বাদে '+fmtFull(balanceMinusBudget);
  const balanceMinusDebt=balance-payable;
  const bmdEl=document.getElementById('kpi-balance-minus-debt');
  if(bmdEl)bmdEl.textContent='ঋণ বাদে '+fmtFull(balanceMinusDebt);
  document.getElementById('kpi-income').textContent=fmt(income);
  document.getElementById('kpi-expense').textContent=fmt(expense);
  document.getElementById('kpi-savings').textContent=fmtFull(savings);
  // Payable & Receivable KPI
  const payabEl=document.getElementById('kpi-payable');
  if(payabEl)payabEl.textContent=fmt(payable);
  const recvEl=document.getElementById('kpi-receivable');
  if(recvEl)recvEl.textContent=fmt(receivable);
  const pendingPayab=DATA.transactions.filter(t=>t.type==='payable'&&t.status!=='settled').length;
  const pendingRecv=DATA.transactions.filter(t=>t.type==='receivable'&&t.status!=='settled').length;
  const payabChEl=document.getElementById('kpi-payable-ch');
  if(payabChEl)payabChEl.textContent=pendingPayab+' টি বাকি আছে';
  const recvChEl=document.getElementById('kpi-receivable-ch');
  if(recvChEl)recvChEl.textContent=pendingRecv+' টি বাকি পাওনা';
  const rate=income>0?Math.round((savings/income)*100):0;
  const pct=income>0?Math.round((expense/income)*100):0;
  const sEl=document.getElementById('kpi-savings-ch');
  sEl.textContent=(savings>=0?'▲ ':' ▼')+rate+'% savings rate';
  sEl.className='kpi-change '+(savings>=0?'up':'down');
  document.getElementById('kpi-expense-ch').textContent=(pct<80?'✓ ':pct<100?'⚠ ':'▲ ')+pct+'% of income';
  const c1=document.getElementById('header-chip1');
  if(c1){c1.textContent=rate>=20?rate+'% of income saved':'Only '+rate+'% saved';c1.className='chip '+(rate>=20?'ok':'bad')}
  const overCount=DATA.budgets.filter(b=>{const s=DATA.transactions.filter(t=>t.cat===b.cat&&t.type==='expense').reduce((s,t)=>s+t.amount,0);return s>b.limit}).length;
  const c2=document.getElementById('header-chip2');
  if(c2){c2.textContent=overCount?overCount+' budget'+(overCount>1?'s':'')+' over limit':'Budgets on track';c2.className='chip '+(overCount?'bad':'ok')}
}

  function renderDashTxnList(){
  const el=document.getElementById('dash-txn-list');if(!el)return;
  const recent=[...DATA.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  el.innerHTML=recent.length?recent.map(t=>{
    const isTransfer=t.type==='transfer';
    const color=t.type==='income'?'var(--pos)':t.type==='payable'?'var(--warn)':t.type==='receivable'?'var(--info)':isTransfer?'#8b5cf6':'var(--neg)';
    const sign=t.type==='income'?'+':t.type==='payable'?'🔴 ':t.type==='receivable'?'🔵 ':isTransfer?'🔁 ':'-';
    const isLR=(t.type==='payable'||t.type==='receivable');
    const subLabel=isTransfer?`${t.fromName||'—'} → ${t.toName||'—'}`:isLR&&t.person?t.person:t.cat;
    const grpBadge=t.splits&&t.splits.length>0?` <span style="font-size:9px;color:var(--accent)">📦${t.splits.length}</span>`:'';
    const transferBadge=isTransfer?` <span style="font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(var(--xfer-rgb),0.13);color:var(--xfer);font-weight:600">🔁 Transfer</span>`:'';
    const rowStyle=isTransfer?` style="border-left:3px solid var(--xfer);background:rgba(var(--xfer-rgb),0.05);border-radius:8px"`:'';
    return`<div class="txn-item"${rowStyle}><div class="txn-left"><div class="txn-emoji">${t.emoji||'💸'}</div><div><div class="txn-name">${t.desc}${grpBadge}${transferBadge}</div><div class="txn-cat">${subLabel} · ${t.date}</div></div></div><div><div class="txn-amount" style="color:${color}">${sign}${fmt(t.amount)}</div></div></div>`;
  }).join(''):`<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No transactions yet</div></div>`;
}
  
  function renderTxns() {
  const list = document.getElementById('txn-list');
  list.innerHTML = '';
  const filtered = filterTxns(); // আপনার আগের ফিল্টার লজিক

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">No transactions found</div>`;
    return;
  }

  filtered.forEach(t => {
    // চেক করা হচ্ছে যে এই ট্রানজ্যাকশনে কোনো সাব-টাস্ক (Splits) আছে কি না
    const hasSplits = t.splits && t.splits.length > 0;
    
    const div = document.createElement('div');
    div.className = 'txn-card-wrapper'; // এটি নতুন যোগ করা হয়েছে

    let itemHtml = `
      <div class="txn-item" onclick="${hasSplits ? `toggleSubItems('${t.id}')` : ''}" style="cursor:${hasSplits ? 'pointer' : 'default'}">
        <div class="txn-info">
          <div class="txn-icon">${t.emoji}</div>
          <div>
            <div class="txn-desc">
                ${t.desc} 
                ${hasSplits ? '<span style="font-size:10px; color:var(--accent); margin-left:5px;">▼</span>' : ''}
            </div>
            <div class="txn-meta">${t.cat} • ${t.date}</div>
          </div>
        </div>
        <div class="txn-amount ${t.type}">${t.type === 'expense' ? '-' : '+'}৳${t.amount}</div>
      </div>
    `;

    // যদি সাব-টাস্ক থাকে, তবে সেগুলো এখানে তৈরি হবে (Sub-task style)
    if (hasSplits) {
      itemHtml += `
        <div id="sub-list-${t.id}" style="display:none; margin-left:45px; border-left: 2px solid var(--border2); padding-left: 15px; margin-bottom: 15px; margin-top: -5px;">
      `;
      t.splits.forEach(s => {
        itemHtml += `
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text2); padding: 8px 0; border-bottom: 1px solid var(--border1);">
            <span>${s.emoji} ${s.cat}</span>
            <span style="color:var(--text)">৳${s.amount}</span>
          </div>`;
      });
      itemHtml += `</div>`;
    }

    div.innerHTML = itemHtml;
    list.appendChild(div);
  });
}

// এই ফাংশনটি স্ক্রিপ্ট ট্যাগের যেকোনো জায়গায় (যেমন একদম নিচে) পেস্ট করে দিলেই হবে
function toggleSubItems(id) {
  const el = document.getElementById('sub-list-' + id);
  if (el) {
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
  }
}
function renderDashBudgets(){
  const el=document.getElementById('dash-budget-items');if(!el)return;
  if(!DATA.budgets.length){el.innerHTML=`<div class="empty"><div class="empty-text">No budgets set</div></div>`;return}
  const curMonth = (() => { const now=new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; })();
  el.innerHTML=DATA.budgets.map(b=>{
    const monthLimit = getBudgetLimitForMonth(b, curMonth);
    const spent=DATA.transactions.filter(t=>t.cat===b.cat&&t.type==='expense'&&t.date&&t.date.startsWith(curMonth)).reduce((s,t)=>s+t.amount,0);
    const pct=Math.min(Math.round((spent/monthLimit)*100),100);
    return`<div class="budget-item"><div class="budget-row"><span class="budget-name">${b.cat}</span><span class="budget-nums">${fmt(spent)}/${fmt(monthLimit)}</span></div><div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${pct>=100?'#ef4444':b.color}"></div></div></div>`;
  }).join('');
}
function renderDashGoals(){
  const el=document.getElementById('dash-goals-grid');if(!el)return;
  const pendingGoals=DATA.goals.filter(g=>!g.achieved).sort((a,b)=>(a.order??0)-(b.order??0));
  if(!pendingGoals.length){el.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🎯</div><div class="empty-text">No goals yet</div></div>`;return}
  el.innerHTML=pendingGoals.map(g=>{const pct=Math.min(Math.round((g.saved/g.target)*100),100);return`<div class="goal-row"><div class="goal-ring" style="--p:${pct};--c:${g.color}"><span>${pct}%</span></div><div class="goal-row-body"><div class="goal-row-name">${g.emoji} ${g.name}</div><div class="goal-row-sub"><b>${fmt(g.saved)}</b> of ${fmt(g.target)}</div></div></div>`}).join('');
}
function renderDashHighlights(){
  const el=document.getElementById('dash-highlights');if(!el)return;
  const now=new Date();
  const todayStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const curMonth=todayStr.slice(0,7);
  const todaysTxns=DATA.transactions.filter(t=>t.date===todayStr);
  const todaySpend=todaysTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const todayIncome=todaysTxns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const todayCount=todaysTxns.length;
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const daysLeft=daysInMonth-now.getDate();
  const monthExpense=DATA.transactions.filter(t=>t.type==='expense'&&t.date&&t.date.startsWith(curMonth)).reduce((s,t)=>s+t.amount,0);
  const avgDaily=Math.round(monthExpense/now.getDate())||0;
  const items=[
    {emoji:'📆',label:"Today's Spend",value:fmt(todaySpend)},
    {emoji:'💵',label:"Today's Income",value:fmt(todayIncome)},
    {emoji:'🧾',label:'Txns Today',value:todayCount},
    {emoji:'📊',label:'Avg Daily Spend',value:fmt(avgDaily)},
    {emoji:'⏳',label:'Days Left',value:daysLeft+' days'}
  ];
  el.innerHTML=items.map(i=>`<div class="hl-card"><div class="hl-emoji">${i.emoji}</div><div class="hl-body"><div class="hl-label">${i.label}</div><div class="hl-value">${i.value}</div></div></div>`).join('');
}
function renderDashAccountSnap(){
  const el=document.getElementById('dash-account-snap');if(!el)return;
  ensureAccounts();
  if(!DATA.accounts.length){el.innerHTML=`<div class="empty" style="padding:10px 0"><div class="empty-text">No accounts yet</div></div>`;return}
  const dotColors={dbbl:'#4f8ef7',bkash:'#e2136e',nagad:'#f7941d',cash:'#10b981',custom:'#7c3aed'};
  el.innerHTML=DATA.accounts.map(a=>{
    const dot=dotColors[a.color]||'#4f8ef7';
    const icon=a.icon||(a.type==='bank'?'🏦':a.type==='mobile'?'📱':a.type==='cash'?'💵':'💳');
    return`<div class="acc-snap-card" onclick="switchPage('accounts');setTimeout(()=>selectAccountTab('${a.id}'),60)">
      <div class="acc-snap-top"><span class="acc-snap-dot" style="background:${dot}"></span><span class="acc-snap-name">${icon} ${a.name}</span></div>
      <div class="acc-snap-bal">${fmtFull(a.balance)}</div>
    </div>`;
  }).join('');
}
function renderDashTopCats(){
  const el=document.getElementById('dash-top-cats');if(!el)return;
  const now=new Date();
  const curMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const catExp={};
  DATA.transactions.filter(t=>t.type==='expense'&&t.date&&t.date.startsWith(curMonth)).forEach(t=>{catExp[t.cat]=(catExp[t.cat]||0)+t.amount});
  const sorted=Object.entries(catExp).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(!sorted.length){el.innerHTML=`<div class="empty" style="padding:10px 0"><div class="empty-text">No spending yet this month</div></div>`;return}
  const max=sorted[0][1];
  el.innerHTML=sorted.map(([cat,val])=>`<div class="mini-cat-item">
    <div class="mini-cat-emoji">${getCatEmoji(cat)}</div>
    <div class="mini-cat-body">
      <div class="mini-cat-top"><span class="mini-cat-name">${cat}</span><span class="mini-cat-val">${fmt(val)}</span></div>
      <div class="mini-cat-bar"><div class="mini-cat-fill" style="width:${Math.round((val/max)*100)}%;background:${getCatColor(cat)}"></div></div>
    </div>
  </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════
   SECTION 12 · TRANSACTIONS PAGE
   List, filters, drag-and-drop ordering.
   ══════════════════════════════════════════════════════════════ */
function resetTxnFilters(){
  const typeSel=document.getElementById('filter-type');
  const catSel=document.getElementById('filter-cat');
  const sortSel=document.getElementById('filter-sort');
  const searchEl=document.getElementById('filter-search');
  if(typeSel) typeSel.value='all';
  if(catSel) catSel.value='all';
  if(sortSel) sortSel.value='date-desc';
  if(searchEl) searchEl.value='';
  renderTransactionsPage();
  toast('ফিল্টার রিসেট হয়েছে ✓','info');
}
function txnMatchesQuery(t,q){
  if(!q) return true;
  q=q.trim().toLowerCase();
  if(!q) return true;
  const parts=[t.desc,t.cat,t.person,t.fromName,t.toName,t.date,t.time,String(t.amount)].filter(Boolean);
  return parts.some(p=>String(p).toLowerCase().includes(q));
}
function renderTransactionsPage(){
  const{income,expense,savings,payable,receivable}=calcStats();
  const catSel=document.getElementById('filter-cat');
  const allCats=[...new Set(DATA.transactions.map(t=>t.cat))];
  const curCat=catSel.value;
  catSel.innerHTML=`<option value="all">All Categories</option>`+allCats.map(c=>`<option value="${c}"${c===curCat?' selected':''}>${c}</option>`).join('');
  let txns=[...DATA.transactions];
  const typeF=document.getElementById('filter-type').value;
  const catF=catSel.value;
  const sortF=document.getElementById('filter-sort').value;
  const searchEl=document.getElementById('filter-search');
  const searchQ=searchEl?searchEl.value.trim():'';
  if(typeF!=='all')txns=txns.filter(t=>t.type===typeF);
  if(catF!=='all')txns=txns.filter(t=>t.cat===catF);
  if(searchQ)txns=txns.filter(t=>txnMatchesQuery(t,searchQ));
  const isFiltered=(typeF!=='all'||catF!=='all'||!!searchQ);
  const filteredTotal=txns.reduce((s,t)=>s+t.amount,0);
  const typeLabels={income:'Income',expense:'Expense',payable:'Payable',receivable:'Receivable',transfer:'🔁 Transfer'};
  let filterLabel='Filtered Total';
  if(catF!=='all'&&typeF!=='all')filterLabel=`${catF} (${typeLabels[typeF]})`;
  else if(catF!=='all')filterLabel=catF;
  else if(typeF!=='all')filterLabel=`Total ${typeLabels[typeF]}`;
  else if(searchQ)filterLabel=`"${searchQ}" এর ফলাফল`;
  if(searchQ&&(catF!=='all'||typeF!=='all'))filterLabel+=` · "${searchQ}"`;
  const filterColor=typeF==='income'?'up':typeF==='expense'?'down':'';
  const sb=document.getElementById('txn-summary-bar');
  const filteredCard=isFiltered?`<div class="txn-summary-item" style="border-color:var(--accent)"><div class="txn-summary-label">🔎 ${filterLabel}</div><div class="txn-summary-val ${filterColor}">${fmt(filteredTotal)}</div><div style="font-size:10px;color:var(--text2);margin-top:2px">${txns.length} টি ট্রানজেকশন</div></div>`:'';
  if(sb)sb.innerHTML=filteredCard+`<div class="txn-summary-item"><div class="txn-summary-label">Total Income</div><div class="txn-summary-val up">${fmt(income)}</div></div><div class="txn-summary-item"><div class="txn-summary-label">Total Expenses</div><div class="txn-summary-val down">${fmt(expense)}</div></div><div class="txn-summary-item"><div class="txn-summary-label">Payable (ঋণ)</div><div class="txn-summary-val" style="color:var(--warn)">${fmt(payable)}</div></div><div class="txn-summary-item"><div class="txn-summary-label">Receivable (পাওনা)</div><div class="txn-summary-val" style="color:var(--info)">${fmt(receivable)}</div></div><div class="txn-summary-item"><div class="txn-summary-label">Net</div><div class="txn-summary-val ${savings>=0?'up':'down'}">${fmtFull(savings)}</div></div><div class="txn-summary-item"><div class="txn-summary-label">Count</div><div class="txn-summary-val">${DATA.transactions.length}</div></div>`;
  const isDateSort=(sortF==='date-desc'||sortF==='date-asc');
  txns.sort((a,b)=>{
    if(sortF==='amount-desc') return b.amount-a.amount;
    if(sortF==='amount-asc') return a.amount-b.amount;
    const dateDiff=sortF==='date-desc'?(new Date(b.date)-new Date(a.date)):(new Date(a.date)-new Date(b.date));
    if(dateDiff!==0) return dateDiff;
    // Same date: time-set transactions sorted chronologically come first,
    // then no-time transactions keep their manual (drag-and-drop) order.
    const aHasTime=!!a.time, bHasTime=!!b.time;
    if(aHasTime&&bHasTime) return b.time.localeCompare(a.time);
    if(aHasTime&&!bHasTime) return -1;
    if(!aHasTime&&bHasTime) return 1;
    return (typeof a.sortOrder==='number'?a.sortOrder:0)-(typeof b.sortOrder==='number'?b.sortOrder:0);
  });
  const el=document.getElementById('txn-full-list');if(!el)return;
  const balSnapshots=computeTxnBalanceSnapshots();
  // Per-date totals (based on the rows currently shown, so filters are respected)
  const dayTotals={};
  if(isDateSort)txns.forEach(t=>{
    const d=dayTotals[t.date]||(dayTotals[t.date]={income:0,expense:0,receivable:0,payable:0});
    if(t.type in d)d[t.type]+=t.amount;
  });
  let lastDividerDate=null;
  el.innerHTML=txns.length?txns.map((t,idx)=>{
    const isTransfer=t.type==='transfer';
    const color=t.type==='income'?'var(--pos)':t.type==='payable'?'var(--warn)':t.type==='receivable'?'var(--info)':isTransfer?'#8b5cf6':'var(--neg)';
    const sign=t.type==='income'?'+':t.type==='payable'?'🔴':t.type==='receivable'?'🔵':isTransfer?'🔁':'-';
    const label=t.type==='payable'?'Payable':t.type==='receivable'?'Receivable':isTransfer?'Transfer':t.type;
    const isLR=(t.type==='payable'||t.type==='receivable');
    // ব্যালেন্স ট্রান্সফার ট্রানজেকশনকে সহজে চেনার জন্য একটি ইউনিক ব্যাজ ও রো-স্টাইল
    const transferBadge=isTransfer?`<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(var(--xfer-rgb),0.13);color:var(--xfer);font-weight:600;margin-left:6px">🔁 Transfer</span>`:'';
    const transferRowStyle=isTransfer?` style="border-left:3px solid var(--xfer);background:rgba(var(--xfer-rgb),0.05);border-radius:8px"`:'';
    const paid=t.paidAmount||0;
    const remaining=t.amount-paid;
    const status=t.status||'';
    let statusBadge='';
    if(isLR){
      if(status==='settled') statusBadge=`<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(var(--pos-rgb),0.13);color:var(--pos);font-weight:600;margin-left:6px">✓ Settled</span>`;
      else if(status==='partial') statusBadge=`<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(var(--warn-rgb),0.13);color:var(--warn);font-weight:600;margin-left:6px">⟳ Partial (${fmt(remaining)} left)</span>`;
      else statusBadge=`<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(var(--neg-rgb),0.13);color:var(--neg);font-weight:600;margin-left:6px">⚠ Pending</span>`;
    }
    const personInfo=isTransfer?`<span style="color:var(--xfer);font-size:10px">${t.fromName||'—'} → ${t.toName||'—'}</span> · `:isLR&&t.person?`<span style="color:var(--accent);font-size:10px">👤 ${t.person}</span> · `:'';
    const payBtn=isLR&&status!=='settled'
      ?`<button class="btn btn-sm" style="background:${t.type==='payable'?'rgba(var(--warn-rgb),0.13)':'rgba(var(--info-rgb),0.13)'};color:${t.type==='payable'?'var(--warn)':'var(--info)'};border:1px solid ${t.type==='payable'?'rgba(var(--warn-rgb),0.25)':'rgba(var(--info-rgb),0.25)'};font-size:10px" onclick="openModal('payoff',${JSON.stringify(t).replace(/"/g,'&quot;')})">${t.type==='payable'?'💳 Pay Back':'💰 Pay Off'}</button>`
      :'';
    const isGroup=t.splits&&t.splits.length>0;
    const groupBadge=isGroup?`<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:rgba(var(--accent-rgb),0.14);color:var(--accent);font-weight:600;margin-left:5px">📦 ${t.splits.length} items</span>`:'';
    const inGroupBadge=t.groupParentId?`<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:rgba(var(--accent2-rgb),0.14);color:var(--accent2);font-weight:600;margin-left:5px">🔗 In group</span>`:'';
    const subRows=isGroup?`<div id="grp-${t.id}" style="display:none;padding:6px 0 2px 44px;border-top:1px solid var(--border);">`+t.splits.map(s=>{const accName=s.account?(DATA.accounts.find(a=>a.id===s.account)||{name:s.account}).name:'Cash';return`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-radius:6px;font-size:12px;"><span style="color:var(--text2)">${s.emoji||getCatEmoji(s.cat)} ${s.desc||s.cat} <span style="color:var(--text3);font-size:10px">· ${s.cat}</span></span><span style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;padding:1px 6px;border-radius:6px;background:var(--bg4);color:var(--text2)">${accName}</span><span style="font-family:JetBrains Mono;font-weight:600;color:${color}">-${fmt(s.amount)}</span></span></div>`;}).join('')+`</div>`:'';
    const expandBtn=isGroup?`<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="toggleGrp('${t.id}',this)">▼ Show</button>`:'';
    // "Balance after" — the affected account's running balance right after this
    // transaction. Skipped for group transactions since a group can move money
    // in/out of several different accounts at once, so a single number here
    // would be misleading (each sub-item's own account is already shown above).
    let balanceAfterLine='';
    if(!isGroup){
      if(isTransfer){
        const fromBal=balSnapshots[t.id+'::'+t.fromAccount];
        const toBal=balSnapshots[t.id+'::'+t.toAccount];
        if(fromBal!==undefined&&toBal!==undefined)
          balanceAfterLine=`<div class="txn-balance-after">${t.fromName||'—'} ${fmtFull(fromBal)} · ${t.toName||'—'} ${fmtFull(toBal)}</div>`;
      } else if(t.account){
        const bal=balSnapshots[t.id+'::'+t.account];
        if(bal!==undefined){
          const accName=(DATA.accounts.find(a=>a.id===t.account)||{}).name||t.account;
          balanceAfterLine=`<div class="txn-balance-after">${accName}: ${fmtFull(bal)}</div>`;
        }
      }
    }
    // Manual drag-and-drop reordering only applies to untimed transactions, only while sorted by date,
    // and is always confined to that transaction's own date (see txnDrop).
    const canDrag=isDateSort&&!t.time;
    const timeBadge=t.time?` <span style="color:var(--text2)">⏱ ${t.time}</span>`:'';
    const dragAttrs=canDrag?`draggable="true" data-txn-id="${t.id}" data-txn-date="${t.date}" ondragstart="txnDragStart(event)" ondragend="txnDragEnd(event)"`:`data-txn-date="${t.date}"`;
    const rowClass='txn-row-wrap'+(canDrag?' txn-draggable':'');
    const dragHandle=canDrag?`<span class="txn-drag-handle" title="Drag to reorder within this date">⠿⠿</span>`:'';
    // Clicking the row opens the full Customize form directly (with a Remove button
    // inside it), rather than showing hover-only icon buttons — clean, and works well
    // on touch. Transfers can't be "customized" via that form, so they get the
    // lightweight actions popup (which only shows Remove for transfers) instead.
    const rowOnclick=`onclick="if(!event.target.closest('button,.txn-drag-handle'))openModal('${isTransfer?'txn-actions':'add-txn'}',${JSON.stringify(t).replace(/"/g,'&quot;')})"`;
    // Date-group divider: only meaningful while the list is sorted by date (otherwise
    // rows for the same date aren't contiguous, so a divider per date would be noise).
    let divider='';
    if(isDateSort&&t.date!==lastDividerDate){
      lastDividerDate=t.date;
      divider=`<div class="txn-date-divider" style="margin-top:${idx===0?'0':'10px'}"><span class="txn-date-divider-label">${txnDateDividerLabel(t.date)}</span><span class="txn-date-divider-line"></span>${txnDaySummaryHTML(dayTotals[t.date])}</div>`;
    }
    return`${divider}<div class="${rowClass}" ${dragAttrs}${transferRowStyle}><div class="txn-full-item" ${rowOnclick}><div class="txn-left" style="flex:1;min-width:0">${dragHandle}<div class="txn-emoji">${t.emoji||'💸'}</div><div style="min-width:0"><div class="txn-name">${t.desc}${transferBadge}${statusBadge}${groupBadge}${inGroupBadge}</div><div class="txn-cat">${personInfo}${t.cat} · ${t.date}${timeBadge}</div></div></div><div style="display:flex;align-items:center;gap:8px;flex-shrink:0">${expandBtn}<div style="text-align:right"><div class="txn-amount" style="color:${color}">${sign}${fmt(t.amount)}</div><div class="txn-date">${label}</div>${balanceAfterLine}</div>${payBtn}</div></div>${subRows}</div>`;
  }).join(''):
  `<div class="empty" style="padding:40px"><div class="empty-icon">🔍</div><div class="empty-text">No transactions match filter</div></div>`;
  initTxnListDnD();
}

// ── Transaction drag-and-drop reordering (untimed transactions only, same date only) ──
// Premium version: live FLIP-animated reflow of sibling rows, a lifted/rotated drag
// state on the item being dragged, and a clear blocked-cursor cue when hovering a
// different date (crossing dates is never allowed).
let txnDragSrcId=null, txnDragSrcDate=null, txnDragEl=null, txnListListenersBound=false;

function txnDragStart(e){
  const item=e.currentTarget;
  txnDragSrcId=item.dataset.txnId;
  txnDragSrcDate=item.dataset.txnDate;
  txnDragEl=item;
  e.dataTransfer.effectAllowed='move';
  try{e.dataTransfer.setData('text/plain',String(txnDragSrcId));}catch(err){}
  // Defer the "lifted" styling one tick so the browser's native drag-ghost
  // image is captured before we visually alter the source row.
  setTimeout(()=>{ if(item) item.classList.add('txn-row-dragging'); },0);
}

function txnDragEnd(){
  if(txnDragEl) txnDragEl.classList.remove('txn-row-dragging');
  document.querySelectorAll('.txn-drop-blocked').forEach(el=>el.classList.remove('txn-drop-blocked'));
  txnDragSrcId=null; txnDragSrcDate=null; txnDragEl=null;
}

// FLIP: capture rects (First), run the DOM mutation (Last), then animate every
// row that moved from its old position back to its new one (Invert → Play).
function txnFlipReorder(list, mutate){
  const rows=[...list.querySelectorAll('.txn-row-wrap')];
  const before=new Map();
  rows.forEach(r=>before.set(r, r.getBoundingClientRect()));
  mutate();
  rows.forEach(r=>{
    const b=before.get(r);
    if(!b) return;
    const a=r.getBoundingClientRect();
    const dx=b.left-a.left, dy=b.top-a.top;
    if(dx||dy){
      r.style.transition='none';
      r.style.transform=`translate(${dx}px,${dy}px)`;
      requestAnimationFrame(()=>{
        r.style.transition='transform .32s var(--ease-spring)';
        r.style.transform='';
      });
    }
  });
}

function txnListDragOver(e){
  if(!txnDragSrcId) return;
  e.preventDefault();
  const list=e.currentTarget;
  const overRow=e.target.closest('.txn-draggable');
  document.querySelectorAll('.txn-drop-blocked').forEach(el=>{if(el!==overRow)el.classList.remove('txn-drop-blocked')});
  if(!overRow||overRow.dataset.txnId===txnDragSrcId){ e.dataTransfer.dropEffect='move'; return; }
  if(overRow.dataset.txnDate!==txnDragSrcDate){
    // A different date — clearly signal this drop target is blocked and never move the row here.
    overRow.classList.add('txn-drop-blocked');
    e.dataTransfer.dropEffect='none';
    return;
  }
  overRow.classList.remove('txn-drop-blocked');
  e.dataTransfer.dropEffect='move';
  const srcRow=list.querySelector(`.txn-row-wrap[data-txn-id="${txnDragSrcId}"]`);
  if(!srcRow||srcRow===overRow) return;
  const rect=overRow.getBoundingClientRect();
  const placeBefore=(e.clientY-rect.top)<rect.height/2;
  const alreadyBefore=srcRow.nextElementSibling===overRow;
  const alreadyAfter=overRow.nextElementSibling===srcRow;
  if((placeBefore&&alreadyBefore)||(!placeBefore&&alreadyAfter)) return;
  txnFlipReorder(list,()=>{
    if(placeBefore) list.insertBefore(srcRow, overRow);
    else list.insertBefore(srcRow, overRow.nextSibling);
  });
}

function txnListDrop(e){
  if(!txnDragSrcId) return;
  e.preventDefault();
  const list=e.currentTarget;
  // Commit the manual order exactly as it now appears in the DOM for this date group.
  const domOrder=[...list.querySelectorAll(`.txn-draggable[data-txn-date="${txnDragSrcDate}"]`)];
  domOrder.forEach((row,i)=>{
    const real=DATA.transactions.find(t=>String(t.id)===String(row.dataset.txnId));
    if(real) real.sortOrder=i;
  });
  saveData();
  txnDragEnd();
}

function initTxnListDnD(){
  if(txnListListenersBound) return;
  const list=document.getElementById('txn-full-list');
  if(!list) return;
  list.addEventListener('dragover', txnListDragOver);
  list.addEventListener('drop', txnListDrop);
  txnListListenersBound=true;
}

/* ══════════════════════════════════════════════════════════════
   SECTION 13 · BUDGETS · GOALS · INVESTMENTS · REPORTS
   The four planning pages.
   ══════════════════════════════════════════════════════════════ */
// ══ BUDGET MONTH STATE ══════════════════════════════════════════════════════
let budgetSelectedMonth = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
})();

function initBudgetMonthPicker(){
  const picker = document.getElementById('budget-month-picker');
  if(picker){
    picker.value = budgetSelectedMonth;
    updateBudgetMonthLabel();
  }
}
function onBudgetMonthChange(){
  const picker = document.getElementById('budget-month-picker');
  if(picker) budgetSelectedMonth = picker.value;
  updateBudgetMonthLabel();
  renderBudgetsPage();
}
function changeBudgetMonth(dir){
  const [y,m] = budgetSelectedMonth.split('-').map(Number);
  const d = new Date(y, m-1+dir, 1);
  budgetSelectedMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const picker = document.getElementById('budget-month-picker');
  if(picker) picker.value = budgetSelectedMonth;
  updateBudgetMonthLabel();
  renderBudgetsPage();
}
function updateBudgetMonthLabel(){
  const [y,m] = budgetSelectedMonth.split('-').map(Number);
  const label = new Date(y,m-1,1).toLocaleString('en-IN',{month:'long',year:'numeric'});
  const el = document.getElementById('budget-month-label');
  if(el) el.textContent = label;
  // "Next" button disable করব যদি current month হয়
  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const btn = document.getElementById('btn-next-month');
  if(btn) btn.disabled = budgetSelectedMonth >= curM;
}

function getBudgetKeyForMonth(budgetId, month){ return `bdg_${budgetId}_${month}`; }

function getBudgetLimitForMonth(budget, month){
  // Month-specific override আছে? নাহলে default limit
  if(DATA.budgetMonthLimits && DATA.budgetMonthLimits[getBudgetKeyForMonth(budget.id,month)] !== undefined){
    return DATA.budgetMonthLimits[getBudgetKeyForMonth(budget.id,month)];
  }
  return budget.limit;
}

function renderBudgetsPage(){
  initBudgetMonthPicker();
  const el=document.getElementById('budget-page-grid');if(!el)return;
  if(!DATA.budgets.length){el.innerHTML=`<div class="empty" style="grid-column:1/-1;padding:40px"><div class="empty-icon">📊</div><div class="empty-text">No budgets yet. Add one!</div></div>`;return}
  const [y,m] = budgetSelectedMonth.split('-').map(Number);
  el.innerHTML=DATA.budgets.map(b=>{
    const monthLimit = getBudgetLimitForMonth(b, budgetSelectedMonth);
    // শুধু selected month এর expense count করব
    const spent=DATA.transactions.filter(t=>t.cat===b.cat&&t.type==='expense'&&t.date&&t.date.startsWith(budgetSelectedMonth)).reduce((s,t)=>s+t.amount,0);
    const pct=Math.min(Math.round((spent/monthLimit)*100),100);const over=spent>monthLimit;const rem=monthLimit-spent;
    return`<div class="budget-page-card">
      <div class="bp-head"><span class="bp-emoji">${b.isCustom?'✨':getCatEmoji(b.cat)}</span><div class="bp-title"><div class="bp-name">${b.cat}</div><div class="bp-sub"><span id="blimit-display-${b.id}">${fmt(monthLimit)}</span> monthly limit</div></div><span class="bp-pill${over?' over':''}">${pct}%</span></div>
      <div class="progress-bar lg"><div class="progress-fill" style="width:${pct}%;background:${over?'var(--neg)':b.color}"></div></div>
      <div class="bp-meta"><span>Spent <b>${fmt(spent)}</b></span><span>${over?'Over by':'Remaining'} <b class="${over?'down':'up'}">${fmt(Math.abs(rem))}</b></span></div>
      <div class="bp-actions"><button class="btn btn-ghost btn-sm" onclick="editMonthBudgetLimit(${b.id})">Set limit</button><button class="btn btn-ghost btn-sm" onclick="openModal('add-budget',${JSON.stringify(b).replace(/"/g,'&quot;')})">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteBudget(${b.id})">Remove</button></div>
    </div>`;
  }).join('');
}

function editMonthBudgetLimit(budgetId){
  const b = DATA.budgets.find(x=>x.id==budgetId); if(!b) return;
  const cur = getBudgetLimitForMonth(b, budgetSelectedMonth);
  const val = prompt(`"${b.cat}" এর জন্য ${budgetSelectedMonth} মাসের budget limit (৳):`, cur);
  if(val===null) return;
  const num = parseFloat(val);
  if(!num||num<=0){toast('Valid amount দিন','error');return}
  if(!DATA.budgetMonthLimits) DATA.budgetMonthLimits={};
  DATA.budgetMonthLimits[getBudgetKeyForMonth(budgetId, budgetSelectedMonth)] = num;
  saveData(); renderBudgetsPage();
  toast(`${budgetSelectedMonth} এর limit আপডেট হয়েছে ✓`);
}
function switchGoalTab(tab){
  currentGoalTab=tab;
  const pEl=document.getElementById('goal-tab-pending');
  const aEl=document.getElementById('goal-tab-achieved');
  if(pEl)pEl.classList.toggle('active',tab==='pending');
  if(aEl)aEl.classList.toggle('active',tab==='achieved');
  renderGoalsPage();
}
function buildGoalCardHTML(g,idx,isAchieved){
  const pct=Math.min(Math.round((g.saved/g.target)*100),100);
  const dragAttrs=isAchieved?'':`draggable="true" data-idx="${idx}" ondragstart="goalDragStart(event)" ondragover="goalDragOver(event)" ondrop="goalDrop(event)" ondragend="goalDragEnd(event)"`;
  const dragHandle=isAchieved?'':`<span class="gp-handle" title="Drag to reorder priority">⠿</span>`;
  const canMarkAchieved=(!isAchieved && pct>=100);
  const ringLabel=isAchieved?'✓':pct+'%';
  const stats=isAchieved
    ?`<div><span>Saved</span><b>${fmt(g.saved)}</b></div><div><span>Achieved on</span><b style="font-size:16px">${g.achievedAt||'-'}</b></div>`
    :`<div><span>Saved</span><b>${fmt(g.saved)}</b></div><div><span>Remaining</span><b>${fmt(Math.max(g.target-g.saved,0))}</b></div>`;
  const actions=isAchieved
    ?`<button class="btn btn-ghost btn-sm" onclick="restoreGoal(${g.id})">↩ চলমানে ফিরান</button><button class="btn btn-danger btn-sm" onclick="deleteGoal(${g.id})">Remove</button>`
    :`${canMarkAchieved?`<button class="btn btn-success btn-sm" onclick="markGoalAchieved(${g.id})">অর্জিত করুন</button>`:`<button class="btn btn-primary btn-sm" onclick="openAddSavings(${g.id})">+ Add savings</button>`}<button class="btn btn-ghost btn-sm" onclick="openModal('add-goal',${JSON.stringify(g).replace(/"/g,'&quot;')})">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteGoal(${g.id})">Remove</button>`;
  return `<div class="goal-page-card${isAchieved?' done':''}" ${dragAttrs}><div class="gp-top"><div class="goal-ring" style="--p:${pct};--c:${g.color}"><span>${ringLabel}</span></div><div class="gp-info"><div class="gp-name"><span class="gp-emoji">${g.emoji}</span> ${g.name}</div><div class="gp-target">Target ${fmt(g.target)}</div></div>${dragHandle}</div><div class="gp-stats">${stats}</div><div class="goal-page-actions">${actions}</div></div>`;
}
function renderGoalsPage(){
  const el=document.getElementById('goals-page-grid');if(!el)return;
  const pending=DATA.goals.filter(g=>!g.achieved).sort((a,b)=>(a.order??0)-(b.order??0));
  const achieved=DATA.goals.filter(g=>g.achieved).sort((a,b)=>new Date(b.achievedAt||0)-new Date(a.achievedAt||0));
  const pTabEl=document.getElementById('goal-tab-pending');
  const aTabEl=document.getElementById('goal-tab-achieved');
  if(pTabEl)pTabEl.textContent=`চলমান (${pending.length})`;
  if(aTabEl)aTabEl.textContent=`অর্জিত (${achieved.length})`;
  if(currentGoalTab==='achieved'){
    if(!achieved.length){el.innerHTML=`<div class="empty" style="grid-column:1/-1;padding:40px"><div class="empty-icon">🏆</div><div class="empty-text">এখনো কোনো গোল অর্জিত হয়নি।</div></div>`;return}
    el.innerHTML=achieved.map((g,i)=>buildGoalCardHTML(g,i,true)).join('');
  } else {
    if(!pending.length){el.innerHTML=`<div class="empty" style="grid-column:1/-1;padding:40px"><div class="empty-icon">🎯</div><div class="empty-text">No goals yet. Add one!</div></div>`;return}
    el.innerHTML=pending.map((g,i)=>buildGoalCardHTML(g,i,false)).join('');
  }
}
function goalDragStart(e){
  goalDragSrcIdx=parseInt(e.currentTarget.dataset.idx);
  e.dataTransfer.effectAllowed='move';
  try{e.dataTransfer.setData('text/plain',String(goalDragSrcIdx));}catch(err){}
  e.currentTarget.style.opacity='0.4';
}
function goalDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  e.currentTarget.style.borderColor='var(--accent)';
}
function goalDrop(e){
  e.preventDefault();
  e.currentTarget.style.borderColor='';
  const targetIdx=parseInt(e.currentTarget.dataset.idx);
  if(goalDragSrcIdx===null||isNaN(targetIdx)||goalDragSrcIdx===targetIdx)return;
  const pending=DATA.goals.filter(g=>!g.achieved).sort((a,b)=>(a.order??0)-(b.order??0));
  const [moved]=pending.splice(goalDragSrcIdx,1);
  pending.splice(targetIdx,0,moved);
  pending.forEach((g,i)=>{g.order=i});
  goalDragSrcIdx=null;
  saveData();renderGoalsPage();
  toast('গোলের প্রায়োরিটি আপডেট হয়েছে ✓','info');
}
function goalDragEnd(e){
  e.currentTarget.style.opacity='1';
  document.querySelectorAll('.goal-page-card').forEach(r=>r.style.borderColor='');
  goalDragSrcIdx=null;
}
function renderInvestmentsPage(){
  const el=document.getElementById('invest-grid');if(!el)return;
  const totalP=DATA.investments.reduce((s,i)=>s+i.principal,0);
  const totalC=DATA.investments.reduce((s,i)=>s+i.current,0);
  const totalG=totalC-totalP;
  el.innerHTML=DATA.investments.length?DATA.investments.map(inv=>{const gain=inv.current-inv.principal;const gainPct=((gain/inv.principal)*100).toFixed(1);const col=getInvestColor(inv.type);return`<div class="invest-card"><div class="invest-header"><div><div class="invest-name">${inv.name}</div>${inv.notes?`<div class="invest-note">${inv.notes}</div>`:''}</div><span class="invest-tag" style="background:${col}20;color:${col}">${inv.type}</span></div><div class="invest-amount">${fmt(inv.current)}</div><div class="invest-change ${gain>=0?'up':'down'}">${gain>=0?'▲ +':'▼ '}${fmt(gain)} (${gainPct}%)</div><div class="invest-meta"><div class="invest-meta-item">Invested<br><span class="invest-meta-val">${fmt(inv.principal)}</span></div><div class="invest-meta-item">Return<br><span class="invest-meta-val ${gain>=0?'up':'down'}">${gainPct}%</span></div></div><div class="invest-actions"><button class="btn btn-ghost btn-sm" onclick="openModal('add-investment',${JSON.stringify(inv).replace(/"/g,'&quot;')})">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteInvestment(${inv.id})">Remove</button></div></div>`}).join(''):`<div class="empty" style="grid-column:1/-1"><div class="empty-icon">📊</div><div class="empty-text">No investments yet</div></div>`;
  const statsEl=document.getElementById('invest-stats');
  if(statsEl){const gPct=totalP>0?((totalG/totalP)*100).toFixed(1):0;statsEl.innerHTML=`<div style="display:flex;flex-direction:column;gap:12px"><div class="txn-summary-item"><div class="txn-summary-label">Total Invested</div><div class="txn-summary-val">${fmt(totalP)}</div></div><div class="txn-summary-item"><div class="txn-summary-label">Current Value</div><div class="txn-summary-val">${fmt(totalC)}</div></div><div class="txn-summary-item"><div class="txn-summary-label">Total Return</div><div class="txn-summary-val ${totalG>=0?'up':'down'}">${totalG>=0?'+':''}${fmtFull(totalG)} (${gPct}%)</div></div><div class="txn-summary-item"><div class="txn-summary-label">Portfolio Items</div><div class="txn-summary-val">${DATA.investments.length}</div></div></div>`}
  const ctx=document.getElementById('portfolioChart');if(!ctx)return;
  if(portfolioChart)portfolioChart.destroy();
  if(!DATA.investments.length)return;
  portfolioChart=new Chart(ctx,{type:'doughnut',data:{labels:DATA.investments.map(i=>i.name),datasets:[{data:DATA.investments.map(i=>i.current),backgroundColor:DATA.investments.map(i=>getInvestColor(i.type)),borderWidth:0,hoverOffset:6}]},options:{cutout:'68%',responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:getThemeVar('--text2'),font:{size:cfs()},boxWidth:10}},tooltip:{callbacks:{label:c=>` ${fmt(c.raw)} (${((c.raw/totalC)*100).toFixed(1)}%)`}}}}});
}
function renderReportsPage(){
  const{income,expense,savings}=calcStats();
  // Build last 6 months from real transactions
  const monthKeys=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);monthKeys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  const months=monthKeys.map(k=>{const[y,m]=k.split('-');return new Date(+y,+m-1,1).toLocaleString('en-IN',{month:'short'});});
  const inc=monthKeys.map(k=>DATA.transactions.filter(t=>t.type==='income'&&t.date&&t.date.startsWith(k)).reduce((s,t)=>s+t.amount,0));
  const exp=monthKeys.map(k=>DATA.transactions.filter(t=>t.type==='expense'&&t.date&&t.date.startsWith(k)).reduce((s,t)=>s+t.amount,0));
  const barCtx=document.getElementById('reportBarChart');
  if(reportBarChart)reportBarChart.destroy();
  reportBarChart=new Chart(barCtx,{type:'bar',data:{labels:months,datasets:[{label:'Income',data:inc,backgroundColor:cA('--pos-rgb',0.21),borderColor:getThemeVar('--pos'),borderWidth:1.5,borderRadius:4},{label:'Expenses',data:exp,backgroundColor:cA('--neg-rgb',0.16),borderColor:getThemeVar('--neg'),borderWidth:1.5,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:getThemeVar('--text2'),font:{size:cfs()}}}},scales:{x:{ticks:{color:getThemeVar('--text2'),font:{size:cfs()-1}},grid:{color:getThemeVar('--border')}},y:{ticks:{color:getThemeVar('--text2'),font:{size:cfs()-1},callback:v=>'৳'+Math.round(v/1000)+'K'},grid:{color:getThemeVar('--border')}}}}});
  const lineCtx=document.getElementById('reportLineChart');
  const savs=inc.map((v,i)=>v-exp[i]);
  if(reportLineChart)reportLineChart.destroy();
  reportLineChart=new Chart(lineCtx,{type:'line',data:{labels:months,datasets:[{label:'Savings',data:savs,borderColor:getThemeVar('--accent'),backgroundColor:getThemeVar('--accent')+'20',fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:getThemeVar('--accent')}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:getThemeVar('--text2'),font:{size:cfs()}}}},scales:{x:{ticks:{color:getThemeVar('--text2'),font:{size:cfs()-1}},grid:{color:getThemeVar('--border2')}},y:{ticks:{color:getThemeVar('--text2'),font:{size:cfs()-1},callback:v=>'৳'+Math.round(v/1000)+'K'},grid:{color:getThemeVar('--border2')}}}}});
  const catExp={};DATA.transactions.filter(t=>t.type==='expense').forEach(t=>{catExp[t.cat]=(catExp[t.cat]||0)+t.amount});
  const sorted=Object.entries(catExp).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const total=sorted.reduce((s,[,v])=>s+v,0);
  const topEl=document.getElementById('report-top-cats');
  if(topEl)topEl.innerHTML=sorted.map(([cat,val])=>`<div class="insight-item"><div class="insight-icon">${getCatEmoji(cat)}</div><div style="flex:1"><div class="insight-title">${cat}</div><div style="height:4px;background:var(--bg4);border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${Math.round((val/total)*100)}%;background:${getCatColor(cat)};border-radius:4px"></div></div></div><div style="font-family:JetBrains Mono;font-size:12px;font-weight:600;margin-left:12px">${fmt(val)}</div></div>`).join('');
  const rate=income>0?Math.round((savings/income)*100):0;
  const insights=[];
  if(rate>=30)insights.push({icon:'🌟',title:'Excellent savings rate',text:`${rate}% saved — above the 20% benchmark. Great work!`});
  else if(rate>=20)insights.push({icon:'✅',title:'Good savings rate',text:`${rate}% savings rate. Aim for 30%+ to accelerate wealth.`});
  else insights.push({icon:'⚠️',title:'Low savings rate',text:`Only ${rate}% saved. Try reducing discretionary spending.`});
  if(sorted.length)insights.push({icon:'💡',title:'Top spend: '+sorted[0][0],text:`${fmt(sorted[0][1])} (${Math.round((sorted[0][1]/expense)*100)}% of expenses). Review if reducible.`});
  const over=DATA.budgets.filter(b=>{const s=DATA.transactions.filter(t=>t.cat===b.cat&&t.type==='expense').reduce((s,t)=>s+t.amount,0);return s>b.limit});
  if(over.length)insights.push({icon:'🚨',title:over.length+' budget(s) exceeded',text:over.map(b=>b.cat).join(', ')+' over limit.'});
  else insights.push({icon:'🎯',title:'All budgets on track',text:'No category exceeded its limit this month.'});
  const goalsDone=DATA.goals.filter(g=>g.saved>=g.target).length;
  if(goalsDone)insights.push({icon:'🏆',title:goalsDone+' goal(s) completed!',text:'Congratulations on reaching your targets.'});
  const aiEl=document.getElementById('ai-insights');
  if(aiEl)aiEl.innerHTML=insights.map(i=>`<div class="insight-item"><div class="insight-icon">${i.icon}</div><div><div class="insight-title">${i.title}</div><div class="insight-text" style="color:var(--text2)">${i.text}</div></div></div>`).join('');
}
function renderPageContent(page){
  if(page==='transactions')renderTransactionsPage();
  else if(page==='budgets')renderBudgetsPage();
  else if(page==='goals')renderGoalsPage();
  else if(page==='investments')renderInvestmentsPage();
  else if(page==='reports')renderReportsPage();
  else if(page==='database')renderDatabasePage();
  else if(page==='accounts')renderAccountsPage();
  else if(page==='profile')renderProfilePage();
}

/* ══════════════════════════════════════════════════════════════
   SECTION 14 · ACCOUNTS
   Payment cards, account tabs, transfers, renderAll().
   ══════════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════════
//  ACCOUNTS PAGE
// ══════════════════════════════════════════════
// Preset card themes available when a user adds a new payment method.
// Add more entries here any time — every account with a matching `theme`
// automatically renders as a full designed card, no other code changes needed.
const CARD_THEMES={
  family:{gradient:'linear-gradient(135deg,#5b2c82 0%,#a8326b 50%,#e8590c 100%)',icon:'👨‍👩‍👧‍👦',label:'FAMILY FUND'},
  teal:{gradient:'linear-gradient(135deg,#0f3d3e 0%,#0d9488 50%,#065f56 100%)',icon:'💠',label:'CUSTOM'},
  violet:{gradient:'linear-gradient(135deg,#3b0764 0%,#7c3aed 50%,#4c1d95 100%)',icon:'✦',label:'CUSTOM'},
  rose:{gradient:'linear-gradient(135deg,#4c0519 0%,#be123c 50%,#881337 100%)',icon:'♦',label:'CUSTOM'},
  amber:{gradient:'linear-gradient(135deg,#451a03 0%,#d97706 50%,#78350f 100%)',icon:'☀',label:'CUSTOM'},
  emerald:{gradient:'linear-gradient(135deg,#022c22 0%,#059669 50%,#064e3b 100%)',icon:'✳',label:'CUSTOM'},
  slate:{gradient:'linear-gradient(135deg,#0f172a 0%,#334155 50%,#1e293b 100%)',icon:'◆',label:'CUSTOM'}
};

function ensureAccounts(){
  if(!DATA.accounts) DATA.accounts=[
    {id:'dbbl',name:'DBBL Bank',shortName:'Dutch-Bangla Bank Ltd.',type:'bank',balance:0,note:'',color:'dbbl',number:''},
    {id:'bkash',name:'bKash',shortName:'bKash Mobile Banking',type:'mobile',balance:0,note:'',color:'bkash',number:''},
    {id:'nagad',name:'Nagad',shortName:'Nagad Digital Financial',type:'mobile',balance:0,note:'',color:'nagad',number:''},
    {id:'cash',name:'Cash',shortName:'Cash in Hand',type:'cash',balance:0,note:'',color:'cash',number:''}
  ];
  // Family Card — the user's first custom payment method, added once for everyone.
  if(!DATA.accounts.find(a=>a.id==='family')){
    DATA.accounts.push({id:'family',name:'Family Card',shortName:'Family Fund Account',type:'custom',theme:'family',icon:'👨‍👩‍👧‍👦',balance:0,note:'Fund contributed by family',color:'custom',number:''});
  }
  if(!DATA.transfers) DATA.transfers=[];
}

let activeAccountTab='dbbl';

function renderAccountsPage(){
  ensureAccounts();
  renderAccountCards();
  renderAccountStats();
  renderAccountTabs();
  renderAccountTxnList(activeAccountTab);
}

function renderAccountCards(){
  const grid=document.getElementById('accounts-cards-grid');if(!grid)return;
  grid.innerHTML=DATA.accounts.map(acc=>buildCardHTML(acc)).join('')+`
    <div class="payment-card add-account-card" onclick="openAddAccountModal()">
      <div class="add-account-inner">
        <div class="add-account-plus">+</div>
        <div class="add-account-label">Add Payment Method</div>
        <div class="add-account-sub">Bank, mobile wallet, family fund & more — fully customizable</div>
      </div>
    </div>`;
}

function buildCardHTML(acc){
  const isDBBL=acc.color==='dbbl';
  const isBkash=acc.color==='bkash';
  const isNagad=acc.color==='nagad';
  const isCash=acc.color==='cash';
  const isCustom=acc.color==='custom'||acc.type==='custom';
  const theme=CARD_THEMES[acc.theme]||CARD_THEMES.slate;

  let inner='';
  // Decorative elements per card
  if(isDBBL){
    inner+=`
      <div class="card-circle1"></div>
      <div class="card-circle2"></div>
      <div class="card-chip"></div>
      <div class="card-nfc">📶</div>
      <div class="card-logo-area">
        <div style="font-size:11px;color:rgba(255,255,255,0.9);font-weight:800;letter-spacing:1px;font-family:Sora,sans-serif">DUTCH-BANGLA</div>
        <div style="font-size:8.5px;color:rgba(255,255,255,0.5);letter-spacing:0.5px;margin-top:2px">BANK LIMITED</div>
        <div style="margin-top:8px;font-size:22px">🏦</div>
      </div>
      <div class="card-masked-number" style="position:absolute;top:70px;left:26px;right:20px">
        <div style="font-size:12px;letter-spacing:3px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono">•••• •••• •••• 4821</div>
      </div>
      <div class="card-footer">
        <div>
          <div style="font-size:8px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Card Holder</div>
          <div class="card-holder">${DATA.profile.name}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:22px;height:22px;border-radius:50%;background:#eb001b;opacity:0.85"></div>
          <div style="width:22px;height:22px;border-radius:50%;background:#f79e1b;margin-left:-10px;opacity:0.85"></div>
        </div>
      </div>
    `;
  } else if(isBkash){
    inner+=`
      <div class="bkash-wave"></div>
      <div class="bkash-wave2"></div>
      <div class="card-logo-area">
        <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-1px;font-family:Sora,sans-serif">b<span style="font-size:14px">Kash</span></div>
        <div style="font-size:8px;color:rgba(255,255,255,0.6);text-align:right;margin-top:2px">Mobile Banking</div>
      </div>
      <div style="position:absolute;top:26px;left:26px">
        <div style="font-size:28px">📱</div>
      </div>
      <div class="card-footer">
        <div>
          <div style="font-size:8px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Account</div>
          <div class="card-holder">${acc.number}</div>
        </div>
        <div style="font-size:20px;opacity:0.8">🇧🇩</div>
      </div>
    `;
  } else if(isNagad){
    inner+=`
      <div class="nagad-stripe"></div>
      <div class="nagad-stripe2"></div>
      <div class="card-logo-area">
        <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;font-family:Sora,sans-serif">নগদ</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.65);letter-spacing:0.5px;margin-top:3px">NAGAD</div>
      </div>
      <div style="position:absolute;top:24px;left:26px;font-size:28px">⚡</div>
      <div class="card-footer">
        <div>
          <div style="font-size:8px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Mobile</div>
          <div class="card-holder">${acc.number}</div>
        </div>
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7)">DIGITAL</div>
      </div>
    `;
  } else if(isCash){
    inner+=`
      <div class="cash-pattern"></div>
      <div class="card-logo-area">
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);letter-spacing:2px;font-family:Sora,sans-serif">CASH</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.45);letter-spacing:1px;margin-top:3px">IN HAND</div>
      </div>
      <div style="position:absolute;top:22px;left:26px;font-size:30px">💵</div>
      <div class="card-masked-number" style="position:absolute;top:70px;left:26px">
        <div style="font-size:9px;color:rgba(255,255,255,0.35);letter-spacing:3px">NO CARD NUMBER</div>
      </div>
      <div class="card-footer">
        <div>
          <div style="font-size:8px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Owner</div>
          <div class="card-holder">${DATA.profile.name}</div>
        </div>
        <div style="font-size:20px">🇧🇩</div>
      </div>
    `;
  } else if(isCustom){
    inner+=`
      <div class="card-circle1"></div>
      <div class="card-circle2"></div>
      <div class="card-custom-pattern"></div>
      <div style="position:absolute;top:24px;left:26px;right:70px">
        <div style="font-size:12px;font-weight:800;color:rgba(255,255,255,0.94);letter-spacing:0.5px;font-family:Sora,sans-serif;line-height:1.3">${acc.name}</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.55);letter-spacing:1.5px;margin-top:4px">${theme.label}</div>
      </div>
      <div class="card-logo-area" style="top:20px">
        <div style="font-size:26px">${acc.icon||theme.icon}</div>
      </div>
      <div class="card-footer">
        <div>
          <div style="font-size:8px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">${acc.number?'Reference':'Owner'}</div>
          <div class="card-holder">${acc.number||DATA.profile.name}</div>
        </div>
        <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.55);letter-spacing:1px">CUSTOM</div>
      </div>
    `;
  }

  const cardClass=isCustom?'payment-card':`payment-card card-${acc.color}`;
  const cardStyle=isCustom?` style="background:${theme.gradient}"`:'';
  return `
    <div class="${cardClass}"${cardStyle} onclick="selectAccountTab('${acc.id}')">
      ${inner}
      <div class="card-balance">
        <div class="card-balance-label">Balance</div>
        <div class="card-balance-amount">${fmtFull(acc.balance)}</div>
        ${acc.note?`<div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:3px;font-family:Sora,sans-serif">${acc.note}</div>`:''}
      </div>
      <button class="card-edit-btn" onclick="event.stopPropagation();openEditAccount('${acc.id}')">✏ Edit</button>
    </div>`;
}

function renderAccountStats(){
  const el=document.getElementById('accounts-stats-row');if(!el)return;
  ensureAccounts();
  const totalBal=DATA.accounts.reduce((s,a)=>s+a.balance,0);
  const totalIn=DATA.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalEx=DATA.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  el.innerHTML=`
    <div class="txn-summary-item">
      <div class="txn-summary-label">Total Across All Accounts</div>
      <div class="txn-summary-val up">${fmtFull(totalBal)}</div>
    </div>
    <div class="txn-summary-item">
      <div class="txn-summary-label">Total Income</div>
      <div class="txn-summary-val up">${fmt(totalIn)}</div>
    </div>
    <div class="txn-summary-item" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div>
        <div class="txn-summary-label">Transfer Money</div>
        <div class="txn-summary-val" style="font-size:13px;color:var(--text2)">Between accounts</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openTransferModal()" style="flex-shrink:0">↔ Transfer</button>
    </div>`;
}

function renderAccountTabs(){
  ensureAccounts();
  const el=document.getElementById('account-tabs');if(!el)return;
  el.innerHTML=DATA.accounts.map(a=>`<div class="account-tab${a.id===activeAccountTab?' active':''}" onclick="selectAccountTab('${a.id}')">${a.name}</div>`).join('')+'<div class="account-tab" onclick="selectAccountTab(\'all\')">All</div>';
}

function selectAccountTab(id){
  activeAccountTab=id;
  renderAccountTabs();
  renderAccountTxnList(id);
}

function renderAccountTxnList(accountId){
  const el=document.getElementById('account-txn-list');if(!el)return;
  let txns=[...DATA.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(accountId!=='all') txns=txns.filter(t=>t.account===accountId||(!t.account&&!t.fromAccount&&!t.toAccount&&accountId==='cash')||t.fromAccount===accountId||t.toAccount===accountId);
  if(!txns.length){el.innerHTML=`<div class="empty" style="padding:36px"><div class="empty-icon">📭</div><div class="empty-text">No transactions for this account</div></div>`;return}
  el.innerHTML=txns.slice(0,20).map(t=>{
    const isTransfer=t.type==='transfer';
    const color=t.type==='income'?'var(--pos)':t.type==='payable'?'var(--warn)':t.type==='receivable'?'var(--info)':isTransfer?'#8b5cf6':'var(--neg)';
    // এই অ্যাকাউন্ট থেকে টাকা গেলে '-', এই অ্যাকাউন্টে টাকা এলে '+' দেখাবে
    const sign=isTransfer?(accountId===t.toAccount?'+':accountId===t.fromAccount?'-':'🔁'):t.type==='income'?'+':t.type==='payable'?'🔴 ':t.type==='receivable'?'🔵 ':'-';
    const transferBadge=isTransfer?` <span style="font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(var(--xfer-rgb),0.13);color:var(--xfer);font-weight:600">🔁 Transfer</span>`:'';
    const rowStyle=isTransfer?` style="border-left:3px solid var(--xfer);background:rgba(var(--xfer-rgb),0.05);border-radius:8px"`:'';
    const subInfo=isTransfer?`${t.fromName||'—'} → ${t.toName||'—'}`:`${t.cat}${t.account?` · <span style="color:var(--accent);font-size:10px">${DATA.accounts.find(a=>a.id===t.account)?.name||t.account}</span>`:''}`;
    return`<div class="txn-full-item"${rowStyle}><div class="txn-left"><div class="txn-emoji">${t.emoji||'💸'}</div><div><div class="txn-name">${t.desc}${transferBadge}</div><div class="txn-cat">${subInfo} · ${t.date}</div></div></div><div style="text-align:right"><div class="txn-amount" style="color:${color}">${sign}${fmt(t.amount)}</div></div></div>`;
  }).join('');
}

function openEditAccount(id){
  ensureAccounts();
  const acc=DATA.accounts.find(a=>a.id===id);if(!acc)return;
  document.getElementById('edit-account-title').textContent='Edit '+acc.name;
  document.getElementById('edit-account-id').value=id;
  document.getElementById('edit-account-balance').value=acc.balance;
  document.getElementById('edit-account-note').value=acc.note||'';
  // Number field — cash account-এ hide করব
  const numGroup=document.getElementById('edit-account-number-group');
  const numInput=document.getElementById('edit-account-number');
  const numLabel=document.getElementById('edit-account-number-label');
  if(acc.type==='cash'){
    numGroup.style.display='none';
  } else {
    numGroup.style.display='block';
    numInput.value=acc.number||'';
    if(acc.type==='mobile') numLabel.textContent='📱 Mobile Number';
    else if(acc.type==='custom') numLabel.textContent='🏷️ Reference / Number (optional)';
    else numLabel.textContent='🏦 Account Number';
  }
  const delBtn=document.getElementById('edit-account-delete-btn');
  delBtn.style.display=acc.type==='custom'?'block':'none';
  document.getElementById('modal-edit-account').classList.add('open');
}

function deleteCustomAccount(){
  const id=document.getElementById('edit-account-id').value;
  ensureAccounts();
  const acc=DATA.accounts.find(a=>a.id===id);
  if(!acc||acc.type!=='custom')return;
  if(!confirm(`Remove "${acc.name}"? Its past transactions will stay, but you won't be able to pick it as a payment method anymore.`))return;
  DATA.accounts=DATA.accounts.filter(a=>a.id!==id);
  saveData();closeModal('edit-account');renderAccountsPage();toast(acc.name+' removed');
}

function openAddAccountModal(){
  document.getElementById('new-account-name').value='';
  document.getElementById('new-account-theme').value='family';
  document.getElementById('new-account-icon').value='';
  document.getElementById('new-account-balance').value='';
  document.getElementById('new-account-number').value='';
  document.getElementById('new-account-note').value='';
  document.getElementById('modal-add-account').classList.add('open');
}

function saveNewAccount(){
  const name=document.getElementById('new-account-name').value.trim();
  const theme=document.getElementById('new-account-theme').value;
  const icon=document.getElementById('new-account-icon').value.trim();
  const balance=parseFloat(document.getElementById('new-account-balance').value)||0;
  const number=document.getElementById('new-account-number').value.trim();
  const note=document.getElementById('new-account-note').value.trim();
  if(!name){toast('Enter a name for this payment method','error');return}
  ensureAccounts();
  const id='acc_'+uid();
  DATA.accounts.push({id,name,shortName:name,type:'custom',theme,icon,balance,note,color:'custom',number});
  saveData();closeModal('add-account');renderAccountsPage();toast(name+' added ✓');
}

function saveAccountBalance(){
  const id=document.getElementById('edit-account-id').value;
  const bal=parseFloat(document.getElementById('edit-account-balance').value);
  const note=document.getElementById('edit-account-note').value.trim();
  const numEl=document.getElementById('edit-account-number');
  const number=numEl?numEl.value.trim():'';
  if(isNaN(bal)||bal<0){toast('Enter a valid balance','error');return}
  ensureAccounts();
  const idx=DATA.accounts.findIndex(a=>a.id===id);
  if(idx!==-1){
    DATA.accounts[idx].balance=bal;
    DATA.accounts[idx].note=note;
    if(DATA.accounts[idx].type!=='cash') DATA.accounts[idx].number=number;
  }
  saveData();closeModal('edit-account');renderAccountsPage();toast('Account updated ✓');
}

function openTransferModal(){
  ensureAccounts();
  const opts=DATA.accounts.map(a=>`<option value="${a.id}">${a.name} (${fmtFull(a.balance)})</option>`).join('');
  document.getElementById('transfer-from').innerHTML=opts;
  document.getElementById('transfer-to').innerHTML=opts;
  document.getElementById('transfer-to').selectedIndex=1;
  document.getElementById('transfer-amount').value='';
  document.getElementById('transfer-fee').value='';
  updateTransferFeeHint();
  document.getElementById('transfer-date').value=today();
  const timeEl=document.getElementById('transfer-time');
  if(timeEl)timeEl.value='';
  document.getElementById('modal-transfer').classList.add('open');
}

function updateTransferFeeHint(){
  const hint=document.getElementById('transfer-fee-hint');if(!hint)return;
  const fee=parseFloat(document.getElementById('transfer-fee').value)||0;
  const amt=parseFloat(document.getElementById('transfer-amount').value)||0;
  if(fee>0){
    hint.style.display='block';
    hint.innerHTML=`⚡ Fee আলাদা <b>Utilities</b> expense হিসেবে যোগ হবে · From account থেকে মোট কাটবে <b style="color:var(--text)">${fmtFull(amt+fee)}</b>`;
  }else{hint.style.display='none';hint.innerHTML='';}
}

function doTransfer(){
  ensureAccounts();
  const fromId=document.getElementById('transfer-from').value;
  const toId=document.getElementById('transfer-to').value;
  const amt=parseFloat(document.getElementById('transfer-amount').value);
  const date=document.getElementById('transfer-date').value;
  const timeEl=document.getElementById('transfer-time');
  const time=timeEl?timeEl.value:'';
  if(fromId===toId){toast('Select different accounts','error');return}
  if(!amt||amt<=0){toast('Enter a valid amount','error');return}
  const feeRaw=parseFloat(document.getElementById('transfer-fee').value);
  if(!isNaN(feeRaw)&&feeRaw<0){toast('Fee cannot be negative','error');return}
  const fee=(!isNaN(feeRaw)&&feeRaw>0)?feeRaw:0;
  const fi=DATA.accounts.findIndex(a=>a.id===fromId);
  const ti=DATA.accounts.findIndex(a=>a.id===toId);
  if(fi===-1||ti===-1)return;
  if(DATA.accounts[fi].balance<amt+fee){toast('Insufficient balance in '+DATA.accounts[fi].name+(fee>0?' (amount + fee)':''),'error');return}
  DATA.accounts[fi].balance-=(amt+fee);   // transfer amount + fee both leave the source account
  DATA.accounts[ti].balance+=amt;         // destination receives only the transfer amount
  if(!DATA.transfers)DATA.transfers=[];
  const transferId=uid();
  const fromName=DATA.accounts[fi].name, toName=DATA.accounts[ti].name;
  DATA.transfers.unshift({id:transferId,from:fromId,to:toId,amount:amt,fee,date,time});
  // ব্যালেন্স ট্রান্সফারকেও একটি ইউনিক, চেনা-যায় এমন ট্রানজেকশন হিসেবে যোগ করা হচ্ছে
  // যাতে এটি Transactions তালিকায় সময় অনুযায়ী সাজানো যায় এবং সহজেই আলাদা করা যায়।
  if(!Array.isArray(DATA.transactions))DATA.transactions=[];
  const transferTxnId=uid();
  const transferSort=time?undefined:nextTxnSortOrder(date);
  // Transaction fee → its own expense entry (category: Utilities), charged to the source account
  let feeTxnId=null;
  if(fee>0){
    if(!CATS.expense.some(c=>c.name==='Utilities'))CATS.expense.push({name:'Utilities',emoji:'⚡',color:'#84cc16'});
    do{feeTxnId=uid()}while(feeTxnId===transferTxnId);
    DATA.transactions.unshift({
      id:feeTxnId,
      type:'expense',
      desc:`Transaction Fee: ${fromName} → ${toName}`,
      cat:'Utilities',
      emoji:getCatEmoji('Utilities'),
      amount:fee,
      date,
      time:time||'',
      account:fromId,
      linkedTransferTxnId:transferTxnId,
      ...(transferSort!==undefined&&{sortOrder:transferSort+1})
    });
  }
  DATA.transactions.unshift({
    id:transferTxnId,
    type:'transfer',
    desc:`Balance Transfer: ${fromName} → ${toName}`,
    cat:'Transfer',
    emoji:'🔁',
    amount:amt,
    date,
    time:time||'',
    transferId,
    fromAccount:fromId,
    toAccount:toId,
    fromName,
    toName,
    ...(fee>0&&{feeAmount:fee,feeTxnId}),
    ...(transferSort!==undefined&&{sortOrder:transferSort})
  });
  saveData();closeModal('transfer');renderAccountsPage();renderAll();
  toast(`৳${Math.round(amt).toLocaleString()} transferred from ${fromName} to ${toName}`+(fee>0?` (+ ৳${Math.round(fee).toLocaleString()} fee)`:'')+' ✓');
}
function renderAll(){
  renderKPI();renderDashTxnList();renderDashBudgets();renderDashGoals();buildFlowChart();buildDonutChart();
  renderDashHighlights();renderDashAccountSnap();renderDashTopCats();
  // Real-time sync: সব active page re-render করা
  const active=document.querySelector('.page.active');
  if(active){
    const pageId=active.id.replace('page-','');
    if(pageId!=='dashboard') renderPageContent(pageId);
  }
}

/* ══════════════════════════════════════════════════════════════
   SECTION 15 · LOGIN & SESSION
   Google sign-in, saved (persistent) session, onboarding, user data load.
   ══════════════════════════════════════════════════════════════ */
window.addEventListener('load',()=>{
  checkAutoLogin();
});

// ─── Login System (Google Sign-In only) ────────────────────────────────────
function checkAutoLogin(){
  // Session restore is handled by checkGoogleAutoLogin() via Firebase's
  // onAuthStateChanged listener below — nothing to do here for a fresh load.
}
function logout(){
  fvLoggingOut=true; fvLoggedInUid=null;
  localStorage.removeItem('finvault_logged_in');
  localStorage.removeItem('finvault_user_cache');
  document.documentElement.classList.remove('fv-restoring');
  document.getElementById('login-error').classList.remove('show');
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('blocked-screen').style.display='none';
  document.getElementById('onboarding-screen').style.display='none';
  closeSidebar&&closeSidebar();
  localStorage.removeItem('finvault_google_uid');
  currentUserMeta=null; window.FV_AUTHZ=null;
  pendingOnboardUser=null; pendingOnboardMeta=null;
  // Sign out of Firebase too, so the saved session is really gone (manual logout is the only
  // thing — besides clearing site data — that ends a session).
  (async()=>{
    try{
      const a=await ensureAuth();
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      await signOut(a);
    }catch(e){ console.warn('signOut failed:',e); }
    finally{ setTimeout(()=>{ fvLoggingOut=false; },400); }
  })();
  DOC_PATH = LEGACY_DOC_PATH;
}

// ─── Persistent session ───────────────────────────────────────────────────
// Signed-in state survives closing the tab / browser. It lasts until the person logs out
// manually or clears the browser's site data. Firebase keeps the sign-in (and silently
// refreshes its tokens); on top of that the app opens straight into the dashboard from
// local data while the session is verified in the background — no login page flash,
// and it still opens when offline.
let fvLoggingOut = false, fvSigningIn = false, fvLoggedInUid = null, fvLoginRunning = false, fvRestoredSilently = false;
let _authPromise = null;

async function ensureAuth() {
  if (auth) return auth;
  if (_authPromise) return _authPromise;
  _authPromise = (async () => {
    const m = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    await ensureFirebaseApp();
    let a;
    try {
      // Persistence is chosen when auth is created (IndexedDB first, localStorage as backup),
      // so a saved login is picked up on the very first read — no session-only fallback.
      a = m.initializeAuth(firebaseApp, {
        persistence: [m.indexedDBLocalPersistence, m.browserLocalPersistence],
        popupRedirectResolver: m.browserPopupRedirectResolver
      });
    } catch (e) {
      // auth was already created elsewhere (e.g. by the service layer) — reuse it, pin persistence
      a = m.getAuth(firebaseApp);
      try { await m.setPersistence(a, m.browserLocalPersistence); } catch (e2) { console.warn('setPersistence failed:', e2); }
    }
    auth = a;
    return a;
  })().catch(e => { _authPromise = null; throw e; });
  return _authPromise;
}

function fvRequestPersistentStorage(){
  // Asks the browser not to evict this site's storage under pressure (keeps the login + local data safe).
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
}

function fvEnterCachedSession(){
  try {
    const c = JSON.parse(localStorage.getItem('finvault_user_cache') || 'null');
    if (c) {
      const n = document.getElementById('user-name-display'); if (n && c.name) n.textContent = c.name;
      const a = document.getElementById('user-avatar'); if (a && c.avatar) a.textContent = c.avatar;
    }
  } catch (e) {}
  document.documentElement.classList.remove('fv-restoring');
  ['login-screen','onboarding-screen','blocked-screen'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const ld = document.getElementById('app-loader'); if (ld) ld.classList.add('hide');
  try { renderAll(); } catch (e) { console.warn('renderAll (cached session):', e); }
  setTimeout(fvHandleShortcut, 250);
}

function fvSessionEnded(msg){
  localStorage.removeItem('finvault_logged_in');
  localStorage.removeItem('finvault_google_uid');
  localStorage.removeItem('finvault_user_cache');
  fvLoggedInUid = null;
  document.documentElement.classList.remove('fv-restoring');
  const ld = document.getElementById('app-loader'); if (ld) ld.remove();
  const err = document.getElementById('login-error');
  if (err && msg) { err.textContent = msg; err.classList.add('show'); }
  document.getElementById('login-screen').style.display = 'flex';
}

async function fvHandleShortcut(){
  // Home-screen / app-icon shortcuts (see manifest.webmanifest) and ?shortcut= links
  try {
    const p = new URLSearchParams(location.search).get('shortcut');
    if (!p) return;
    history.replaceState(null, '', location.pathname);
    if (p === 'add-txn') openModal('add-txn');
    else if (['transactions','accounts','budgets','goals','investments','reports'].includes(p)) switchPage(p);
  } catch (e) {}
}

// ─── Google Sign-In ───────────────────────────────────────────────────────
async function signInWithGoogle(){
  const btn = document.getElementById('google-signin-btn');
  const errEl = document.getElementById('login-error');
  errEl.classList.remove('show');
  fvSigningIn = true;
  try {
    if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    await ensureAuth();
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await onGoogleLoginSuccess(result.user);
    } catch (e) {
      // Some in-app / installed-app browsers (notably iOS home-screen apps) block popups — use a full-page redirect instead
      if (e && ['auth/popup-blocked','auth/operation-not-supported-in-this-environment','auth/web-storage-unsupported'].includes(e.code)) {
        try { sessionStorage.setItem('fv_redirect_pending','1'); } catch (_) {}
        await signInWithRedirect(auth, provider);
        return;
      }
      throw e;
    }
  } catch (e) {
    console.warn('Google sign-in error:', e);
    errEl.textContent = (e && e.code === 'auth/popup-closed-by-user') ? 'Sign-in was cancelled. Please try again.' : 'Google sign-in failed. Please try again.';
    errEl.classList.add('show');
  } finally {
    fvSigningIn = false;
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

let pendingOnboardUser = null;
let pendingOnboardMeta = null;

async function onGoogleLoginSuccess(user){
  if (fvLoginRunning) return;
  fvLoginRunning = true;
  try { await _fvOnGoogleLoginSuccess(user); }
  finally { fvLoginRunning = false; }
}
async function _fvOnGoogleLoginSuccess(user){
  // Give this Google account its own isolated cloud document
  DOC_PATH = 'users/google_' + user.uid;

  const meta = await syncUserMeta(user);
  await applyServerAuthority(user, meta);   // entitlements + role resolution (rules are the real enforcement)
  if (meta && meta.blocked) {
    showBlockedScreen();
    return;
  }
  if (meta && !meta.onboarded) {
    pendingOnboardUser = user;
    pendingOnboardMeta = meta;
    showOnboardingScreen(user);
    return;
  }
  await finalizeGoogleLogin(user, meta);
}

async function finalizeGoogleLogin(user, meta){
  currentUserMeta = meta;
  localStorage.setItem('finvault_logged_in', '1');
  localStorage.setItem('finvault_google_uid', user.uid);
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('onboarding-screen').style.display = 'none';
  const n = (meta.profile && meta.profile.name) || user.displayName || DATA.profile.name || 'User';
  document.getElementById('user-name-display').textContent = n;
  document.getElementById('user-avatar').textContent = getAvatarDisplay(meta.profile, n);
  fvLoggedInUid = user.uid;
  document.documentElement.classList.remove('fv-restoring');
  try { localStorage.setItem('finvault_user_cache', JSON.stringify({ uid: user.uid, name: n, avatar: getAvatarDisplay(meta.profile, n) })); } catch (e) {}
  fvRequestPersistentStorage();
  // Reload data scoped to this Google account (the CEO's very first login
  // migrates the existing legacy data over instead of starting empty)
  const isFirstLoginMigration = !!(meta && meta._isNew && user.email === CEO_EMAIL);
  await reloadFirestoreForCurrentDoc(isFirstLoginMigration);
  if (meta.profile && meta.profile.name) { DATA.profile.name = meta.profile.name; saveData(); }
  applyRoleRestrictions();
  renderAll();
  if (!fvRestoredSilently) toast('Signed in as ' + n + ' ✓', 'success');
  setTimeout(fvHandleShortcut, 400);
}

function showOnboardingScreen(user){
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('onboarding-screen').style.display = 'flex';
  document.getElementById('onboard-name').value = user.displayName || '';
  document.getElementById('onboard-phone').value = '';
  document.getElementById('onboard-job').value = '';
  document.getElementById('onboarding-error').classList.remove('show');
}

async function submitOnboarding(){
  const name = document.getElementById('onboard-name').value.trim();
  const phone = document.getElementById('onboard-phone').value.trim();
  const job = document.getElementById('onboard-job').value.trim();
  const errEl = document.getElementById('onboarding-error');
  if (!name || !phone) {
    errEl.textContent = 'Please enter your name and phone number.';
    errEl.classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  const btn = document.getElementById('onboard-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const { getFirestore, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    if (!db) db = getFirestore(firebaseApp);
    const profile = { name, phone, occupation: job };
    await updateDoc(doc(db, 'user_meta', pendingOnboardUser.uid), { profile, onboarded: true });
    pendingOnboardMeta = { ...pendingOnboardMeta, profile, onboarded: true };
    await finalizeGoogleLogin(pendingOnboardUser, pendingOnboardMeta);
    pendingOnboardUser = null; pendingOnboardMeta = null;
  } catch (e) {
    console.warn('submitOnboarding error:', e);
    errEl.textContent = 'Could not save. Please try again.';
    errEl.classList.add('show');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Continue →'; }
  }
}

// Overlays server-trusted account state onto the meta object and resolves the
// caller's authorization level. entitlements/<uid> is writable only by owner/staff
// (firestore.rules); user_meta.role/blocked/limits/restrictions are self-locked.
// Everything here only drives the UI — Firestore rules enforce the real limits.
async function applyServerAuthority(user, meta){
  const fallback = { uid: user.uid, isOwner: false, role: 'user', permissions: [], isStaff: false };
  try {
    const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    if (!db) db = getFirestore(firebaseApp);
    const [entSnap, roleSnap, tok] = await Promise.all([
      getDoc(doc(db, 'entitlements', user.uid)).catch(() => null),
      getDoc(doc(db, 'adminRoles', user.uid)).catch(() => null),
      user.getIdTokenResult()
    ]);
    if (entSnap && entSnap.exists()) {
      const e = entSnap.data();
      meta.blocked = e.blocked === true;
      if (e.limits) meta.limits = e.limits;
      if (e.restrictions) meta.restrictions = e.restrictions;
      meta.planId = e.planId || 'free';
    }
    const c = tok.claims || {};
    const isOwner = !!(c.firebase && c.firebase.sign_in_provider === 'google.com' && c.email_verified === true
                       && String(c.email || '').toLowerCase() === CEO_EMAIL.toLowerCase());
    let authz = { ...fallback, isOwner };
    if (isOwner) authz = { ...authz, role: 'owner', permissions: ['*'], isStaff: true };
    else if (roleSnap && roleSnap.exists() && roleSnap.data().active === true) {
      const r = roleSnap.data();
      authz = { ...authz, role: r.role, permissions: r.permissions || [], isStaff: true };
    }
    window.FV_AUTHZ = authz;
  } catch (e) {
    console.warn('applyServerAuthority error:', e);
    window.FV_AUTHZ = fallback;
  }
}

// Creates/reads this user's account document (user_meta/<uid>)
async function syncUserMeta(user){
  try {
    const { getFirestore, doc, getDoc, setDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    if (!db) db = getFirestore(firebaseApp);
    const metaRef = doc(db, 'user_meta', user.uid);
    const snap = await getDoc(metaRef);
    if (snap.exists()) {
      const data = snap.data();
      updateDoc(metaRef, { lastLogin: Date.now(), name: user.displayName || data.name || '', email: user.email || data.email || '' }).catch(()=>{});
      return { uid: user.uid, ...data, onboarded: data.onboarded !== undefined ? data.onboarded : true, _isNew: false };
    }
    const fresh = {
      uid: user.uid,
      email: user.email || '',
      name: user.displayName || '',
      role: 'user',
      blocked: false,
      onboarded: false,
      profile: { name: user.displayName || '', phone: '', occupation: '' },
      limits: { maxTransactions: null },
      restrictions: { disabledPages: [] },
      createdAt: Date.now(),
      lastLogin: Date.now()
    };
    await setDoc(metaRef, fresh);
    return { ...fresh, _isNew: true };
  } catch (e) {
    console.warn('syncUserMeta error:', e);
    // Fail open as a normal unrestricted user rather than locking the app
    return { uid: user.uid, role: 'user', blocked: false, onboarded: true, profile: { name: user.displayName||'', phone:'', occupation:'' }, limits: { maxTransactions: null }, restrictions: { disabledPages: [] }, _isNew: false };
  }
}

function showBlockedScreen(){
  document.getElementById('login-screen').style.display = 'none';
  const el = document.getElementById('blocked-screen');
  if (el) el.style.display = 'flex';
}

// Hides nav items / enforces limits based on currentUserMeta
function applyRoleRestrictions(){
  const disabled = (currentUserMeta && currentUserMeta.restrictions && currentUserMeta.restrictions.disabledPages) || [];
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    const page = item.dataset.page;
    if (page === 'dashboard') return; // dashboard always available
    item.style.display = disabled.includes(page) ? 'none' : '';
  });
}

// Reloads Firestore data + live listener for whatever DOC_PATH currently points to
async function reloadFirestoreForCurrentDoc(migrateFromLegacy){
  try {
    const { getFirestore, doc, setDoc, getDoc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    if (!db) db = getFirestore(firebaseApp);
    const docRef = doc(db, DOC_PATH);
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data() && snap.data().transactions) {
      DATA = snap.data();
      syncCatsFromData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
    } else if (migrateFromLegacy) {
      // CEO's very first Google login: bring over the existing data
      // that was previously stored in the shared legacy document
      const legacyRef = doc(db, LEGACY_DOC_PATH);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists() && legacySnap.data() && legacySnap.data().transactions) {
        DATA = legacySnap.data();
      } else {
        DATA = getDefaultData();
      }
      syncCatsFromData();
      await setDoc(docRef, DATA);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
    } else {
      // Brand-new account — start with a fresh, empty dataset and upload it
      DATA = getDefaultData();
      syncCatsFromData();
      await setDoc(docRef, DATA);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
    }
    onSnapshot(docRef, (snap) => {
      if (firebaseSyncing) return;
      if (snap.exists()) {
        const remote = snap.data();
        if (remote && remote.transactions) {
          DATA = remote;
          syncCatsFromData();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
          renderAll();
        }
      }
    }, (err) => console.warn('Firestore listener error:', err));
  } catch (e) {
    console.warn('Firestore reload error:', e);
  }
}

// On every app open: restore the saved session (auto-login)
async function checkGoogleAutoLogin(){
  const hadSession = localStorage.getItem('finvault_logged_in') === '1';
  if (hadSession) fvEnterCachedSession();        // instant: straight into the app, verify in the background
  try {
    await ensureAuth();
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    // finishing a full-page redirect sign-in (used where popups are blocked)
    let redirected = false;
    try { redirected = sessionStorage.getItem('fv_redirect_pending') === '1'; } catch (e) {}
    if (redirected) {
      try { sessionStorage.removeItem('fv_redirect_pending'); } catch (e) {}
      try {
        const r = await authMod.getRedirectResult(auth);
        if (r && r.user) { await onGoogleLoginSuccess(r.user); }
      } catch (e) {
        console.warn('Redirect sign-in failed:', e);
        const err = document.getElementById('login-error');
        if (err) { err.textContent = 'Google sign-in failed. Please try again.'; err.classList.add('show'); }
      }
    }
    authMod.onAuthStateChanged(auth, async (user) => {
      if (fvLoggingOut || fvSigningIn) return;
      const flagged = localStorage.getItem('finvault_logged_in') === '1';
      if (user) {
        if (!flagged) {
          // a leftover Firebase session without an app session = an earlier logout that couldn't finish → finish it
          try { await authMod.signOut(auth); } catch (e) {}
          document.documentElement.classList.remove('fv-restoring');
          const ld = document.getElementById('app-loader'); if (ld) ld.remove();
          return;
        }
        if (fvLoggedInUid === user.uid) return;
        fvRestoredSilently = true;
        try { await onGoogleLoginSuccess(user); } finally { fvRestoredSilently = false; }
      } else if (flagged) {
        fvSessionEnded('Your session has ended. Please sign in again.');
      } else {
        document.documentElement.classList.remove('fv-restoring');
        const ld = document.getElementById('app-loader'); if (ld) ld.remove();
      }
    });
  } catch (e) {
    console.warn('Google auto-login check failed:', e);
    if (!hadSession) { document.documentElement.classList.remove('fv-restoring'); }
    // offline / Firebase unreachable: a returning user simply stays in the app on local data,
    // and the session is re-verified as soon as the connection is back
    window.addEventListener('online', () => { if (!auth) checkGoogleAutoLogin(); }, { once: true });
  }
}

/* ══════════════════════════════════════════════════════════════
   SECTION 16 · CATEGORY MANAGER
   Add / edit / reorder categories.
   ══════════════════════════════════════════════════════════════ */
let currentCatTab = 'expense';

function prepManageCats(){
  currentCatTab = 'expense';
  editingCatIndex = null;
  renderCatTab();
}

function switchCatTab(tab){
  currentCatTab = tab;
  editingCatIndex = null;
  ['expense','income','invest'].forEach(t=>{
    document.getElementById('mcat-tab-'+t).className='tab'+(t===tab?' active':'');
  });
  // Toggle emoji input visibility (not used for invest)
  document.getElementById('mcat-new-emoji').style.display = tab==='invest'?'none':'';
  renderCatTab();
}

let editingCatIndex = null;
let catDragSrcIndex = null;

function getCurrentCatItems(){
  return currentCatTab==='invest' ? CATS.invest : CATS[currentCatTab];
}

function renderCatTab(){
  const list = document.getElementById('mcat-list');
  const items = getCurrentCatItems();
  const isInvest = currentCatTab==='invest';
  list.innerHTML = items.map((c,i)=>{
    if(editingCatIndex===i){
      return `<div style="display:flex;flex-direction:column;gap:8px;padding:10px;background:var(--bg4);border-radius:8px;border:1px solid var(--accent)">
        <div style="display:flex;gap:6px">
          ${!isInvest?`<input class="form-input" id="mcat-edit-emoji" value="${c.emoji||''}" maxlength="2" style="width:52px;text-align:center;padding:6px 4px">`:''}
          <input class="form-input" id="mcat-edit-name" value="${c.name.replace(/"/g,'&quot;')}" style="flex:1;padding:6px 10px" placeholder="Category name">
          <input class="form-input" type="color" id="mcat-edit-color" value="${c.color}" style="width:42px;height:36px;padding:2px;cursor:pointer">
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="cancelEditCategory()">Cancel</button>
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="saveEditCategory(${i})">✓ Save</button>
        </div>
      </div>`;
    }
    return `<div class="mcat-row" draggable="true" data-idx="${i}"
        ondragstart="catDragStart(event)" ondragover="catDragOver(event)" ondrop="catDrop(event)" ondragend="catDragEnd(event)"
        style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);cursor:grab;transition:opacity 0.15s,border-color 0.15s">
      <span style="color:var(--text3);font-size:13px;flex-shrink:0;user-select:none;cursor:grab" title="Drag to reorder">⠿⠿</span>
      ${!isInvest?`<span style="font-size:16px;min-width:24px;text-align:center">${c.emoji}</span>`:''}
      <span style="flex:1;font-size:13px;font-weight:500">${c.name}</span>
      <span style="width:14px;height:14px;border-radius:50%;background:${c.color};flex-shrink:0;display:inline-block"></span>
      <button class="btn btn-ghost btn-sm" style="padding:4px 8px;font-size:11px" onclick="editCategoryInline(${i})">Edit</button>
      <button class="btn btn-danger btn-sm" style="padding:4px 8px;font-size:11px" onclick="deleteCategory(${i})">✕</button>
    </div>`;
  }).join('') || '<div style="color:var(--text2);font-size:12px;text-align:center;padding:20px">No categories yet.</div>';
}

function editCategoryInline(idx){
  editingCatIndex = idx;
  renderCatTab();
}

function cancelEditCategory(){
  editingCatIndex = null;
  renderCatTab();
}

function saveEditCategory(idx){
  const items = getCurrentCatItems();
  const isInvest = currentCatTab==='invest';
  const c = items[idx];
  const nameEl = document.getElementById('mcat-edit-name');
  const colorEl = document.getElementById('mcat-edit-color');
  const newName = nameEl.value.trim();
  if(!newName){toast('Name cannot be empty','error');return}
  const newColor = colorEl.value || c.color;
  let newEmoji = c.emoji;
  if(!isInvest){
    const emojiEl = document.getElementById('mcat-edit-emoji');
    newEmoji = (emojiEl.value.trim())||c.emoji;
  }
  items[idx] = isInvest ? {name:newName, color:newColor} : {name:newName, emoji:newEmoji, color:newColor};
  editingCatIndex = null;
  saveCats();
  renderCatTab();
  renderAll();
  toast('Category updated ✓');
}

// ── Drag & drop reordering ──────────────────────────────────────────────────
function catDragStart(e){
  catDragSrcIndex = parseInt(e.currentTarget.dataset.idx);
  e.dataTransfer.effectAllowed = 'move';
  try{ e.dataTransfer.setData('text/plain', String(catDragSrcIndex)); }catch(err){}
  e.currentTarget.style.opacity = '0.4';
}
function catDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.style.borderColor = 'var(--accent)';
}
function catDrop(e){
  e.preventDefault();
  e.currentTarget.style.borderColor = '';
  const targetIndex = parseInt(e.currentTarget.dataset.idx);
  if(catDragSrcIndex===null || isNaN(targetIndex) || catDragSrcIndex===targetIndex) return;
  const items = getCurrentCatItems();
  const [moved] = items.splice(catDragSrcIndex, 1);
  items.splice(targetIndex, 0, moved);
  catDragSrcIndex = null;
  saveCats();
  renderCatTab();
  renderAll();
  toast('Category order updated ✓','info');
}
function catDragEnd(e){
  e.currentTarget.style.opacity = '1';
  document.querySelectorAll('.mcat-row').forEach(r=>r.style.borderColor='');
  catDragSrcIndex = null;
}

function deleteCategory(idx){
  const items = currentCatTab==='invest' ? CATS.invest : CATS[currentCatTab];
  if(items.length<=1){toast('Need at least one category','error');return}
  if(!confirm('Delete "'+items[idx].name+'"? Existing transactions will keep this category label.'))return;
  items.splice(idx,1);
  saveCats();
  renderCatTab();
  renderAll();
  toast('Category deleted','info');
}

function addCategory(){
  const name = document.getElementById('mcat-new-name').value.trim();
  const emoji = document.getElementById('mcat-new-emoji').value.trim()||'📂';
  const color = document.getElementById('mcat-new-color').value||'#4f8ef7';
  if(!name){toast('Enter a category name','error');return}
  const items = currentCatTab==='invest' ? CATS.invest : CATS[currentCatTab];
  if(items.find(c=>c.name.toLowerCase()===name.toLowerCase())){toast('Category already exists','error');return}
  const isInvest = currentCatTab==='invest';
  items.push(isInvest ? {name,color} : {name,emoji,color});
  saveCats();
  document.getElementById('mcat-new-name').value='';
  document.getElementById('mcat-new-emoji').value='';
  renderCatTab();
  renderAll();
  toast('"'+name+'" added ✓');
}

/* ══════════════════════════════════════════════════════════════
   SECTION 17 · FIREBASE & CLOUD SAVE
   Firebase bootstrap, Firestore, cloud save.
   ══════════════════════════════════════════════════════════════ */
// Holds the logged-in user's profile/limits/restrictions once known
let currentUserMeta = null; // { uid, email, name, role, blocked, limits:{maxTransactions}, restrictions:{disabledPages:[]} }

// Firestore document reference (one doc per user, using a fixed device key)
let db = null;
let firebaseApp = null;
let auth = null;
const DEVICE_KEY = localStorage.getItem('finvault_device_key') || (() => {
  const k = 'dev_' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem('finvault_device_key', k);
  return k;
})();
// Legacy shared document (used only for the old User ID / Password login)
const LEGACY_DOC_PATH = "users/global_data";
// Active document path — switches to a per-Google-account path after Google sign-in
let DOC_PATH = LEGACY_DOC_PATH;

let firebaseSyncing = false;

// One shared, race-free Firebase app bootstrap (used by initFirebase, ensureAuth, loadAppConfig).
let _appPromise = null;
function ensureFirebaseApp() {
  if (_appPromise) return _appPromise;
  _appPromise = (async () => {
    const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    if (APPCHECK_SITE_KEY) {
      try {
        const { initializeAppCheck, ReCaptchaV3Provider } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js');
        if (['localhost', '127.0.0.1'].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        initializeAppCheck(firebaseApp, { provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
      } catch (e) { console.warn('App Check init failed:', e); }
    }
    return firebaseApp;
  })().catch(e => { _appPromise = null; throw e; });
  return _appPromise;
}

// Prepares Firebase on page load. Cloud data sync starts AFTER Google sign-in
// (reloadFirestoreForCurrentDoc). The old shared legacy document (users/global_data)
// is no longer touched before authentication — firestore.rules restrict it to the owner.
async function initFirebase() {
  try {
    await ensureFirebaseApp();
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    db = getFirestore(firebaseApp);
    console.log('✅ Firebase ready (cloud sync starts after sign-in)');
  } catch (e) {
    console.warn('Firebase init failed, using localStorage only:', e);
    toast('Offline mode – data saved locally', 'info');
  }
}

// Override saveData to also sync to Firestore
const _origSaveData = saveData;
window.saveData = async function() {
  _origSaveData(); // Always save to localStorage first
  if (!db || DOC_PATH === LEGACY_DOC_PATH) return; // no cloud write until signed in
  firebaseSyncing = true;
  try {
    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const docRef = doc(db, DOC_PATH);
    await setDoc(docRef, JSON.parse(JSON.stringify(DATA)));
  } catch (e) {
    console.warn('Firestore write error:', e);
  } finally {
    setTimeout(() => { firebaseSyncing = false; }, 500);
  }
};

// Init Firebase after page loads
window.addEventListener('load', () => {
  initFirebase();
  loadAppConfig();
});

/* ══════════════════════════════════════════════════════════════
   SECTION 18 · INSTALL APP (PWA)
   Service-worker registration and the “Install app” feature.
   ══════════════════════════════════════════════════════════════ */
// ─── Progressive Web App: service worker + "Install app" ───────────────────
let fvDeferredInstall = null;
function fvIsStandalone(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function fvUpdateInstallUI(){
  const standalone = fvIsStandalone();
  let dismissed = false;
  try { dismissed = parseInt(localStorage.getItem('fv_install_dismissed_until') || '0', 10) > Date.now(); } catch (e) {}
  let installedFlag = false;
  try { installedFlag = localStorage.getItem('fv_pwa_installed') === '1'; } catch (e) {}
  const card = document.getElementById('pwa-install-card'); if (card) card.hidden = standalone || dismissed || installedFlag;
  const item = document.getElementById('pwa-install-item'); if (item) item.style.display = standalone ? 'none' : '';
  const st = document.getElementById('pf-install-status');
  if (st) { st.textContent = standalone ? 'Installed ✓' : (fvDeferredInstall ? 'Ready to install' : (installedFlag ? 'Installed on this device' : 'Not installed')); st.className = 'chip' + ((standalone || (installedFlag && !fvDeferredInstall)) ? ' ok' : ''); }
  const b = document.getElementById('pf-install-btn'); if (b) b.style.display = standalone ? 'none' : '';
}
function fvDismissInstall(){
  try { localStorage.setItem('fv_install_dismissed_until', String(Date.now() + 7 * 24 * 3600 * 1000)); } catch (e) {}
  fvUpdateInstallUI();
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); fvDeferredInstall = e; try { localStorage.removeItem('fv_pwa_installed'); } catch (_) {} fvUpdateInstallUI(); });
window.addEventListener('appinstalled', () => {
  fvDeferredInstall = null;
  try { localStorage.setItem('fv_pwa_installed', '1'); } catch (_) {}
  fvUpdateInstallUI();
  try { toast('FinVault installed ✓', 'success'); } catch (e) {}
});
try { window.matchMedia('(display-mode: standalone)').addEventListener('change', fvUpdateInstallUI); } catch (e) {}
document.addEventListener('DOMContentLoaded', fvUpdateInstallUI);

async function fvInstallApp(){
  if (fvIsStandalone()) { toast('FinVault is already running as an installed app ✓'); return; }
  if (fvDeferredInstall) {
    try {
      fvDeferredInstall.prompt();
      await fvDeferredInstall.userChoice;
    } catch (e) { console.warn('install prompt failed:', e); }
    fvDeferredInstall = null;
    fvUpdateInstallUI();
    return;
  }
  openModal('install-help');            // this browser has no one-tap prompt → show the exact steps
}

function fvPrepInstallHelp(){
  const ua = navigator.userAgent || '';
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  const edge = /Edg\//.test(ua);
  const safariMac = !iOS && /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua) && /Macintosh/.test(ua);
  let steps;
  if (iOS) steps = ['Open this page in <b>Safari</b> (or Chrome) on your iPhone/iPad.','Tap the <b>Share</b> button (the square with an arrow).','Scroll down and tap <b>Add to Home Screen</b>.','Tap <b>Add</b> — FinVault now opens like a normal app from your home screen.'];
  else if (android && firefox) steps = ['Tap the <b>⋮ menu</b> in Firefox.','Tap <b>Install</b> (or <b>Add to Home screen</b>).','Confirm — FinVault is added to your home screen.'];
  else if (android) steps = ['Tap the <b>⋮ menu</b> at the top-right of Chrome.','Tap <b>Install app</b> (or <b>Add to Home screen</b>).','Tap <b>Install</b> — FinVault is added to your home screen and app list.'];
  else if (safariMac) steps = ['In Safari choose <b>File → Add to Dock…</b> (Safari 17+).','Confirm the name and click <b>Add</b>.'];
  else if (firefox) steps = ['Desktop Firefox can\'t install web apps.','Open this page in <b>Chrome</b> or <b>Edge</b>, then follow the install steps there.'];
  else steps = ['Look for the <b>install icon</b> (a small monitor with a down-arrow) at the right end of the address bar — click it.','Or open the browser menu <b>⋮</b> → <b>' + (edge ? 'Apps → Install this site as an app' : 'Cast, save and share → Install page as app…') + '</b>.','Click <b>Install</b> — FinVault opens in its own window and gets a desktop/start-menu icon.'];
  let html = '<div class="card-note" style="margin:0 0 4px">Install FinVault to open it in its own full-screen window, stay signed in, and use it even without internet.</div>';
  html += '<ol class="install-steps">' + steps.map(s => '<li><span>' + s + '</span></li>').join('') + '</ol>';
  if (!window.isSecureContext || location.protocol === 'file:') {
    html += '<div class="install-warn">Installing only works when FinVault is opened from its <b>https://</b> website — not from a file on your computer.</div>';
  }
  document.getElementById('install-help-body').innerHTML = html;
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (nw) nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            try { toast('A new version of FinVault is ready — reload to update ✓', 'info'); } catch (e) {}
          }
        });
      });
    }).catch((e) => console.warn('Service worker registration failed:', e));
  });
}

/* ══════════════════════════════════════════════════════════════
   SECTION 19 · APP CONFIG
   Global branding/config loaded from Firestore.
   ══════════════════════════════════════════════════════════════ */
// ─── Global App Branding/Config (applies to everyone; edit values in Firestore directly) ──
const APP_CONFIG_DOC = 'app_config/global';
let currentAppConfig = null;

async function loadAppConfig(){
  try {
    const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    await ensureFirebaseApp();
    if (!db) db = getFirestore(firebaseApp);
    const snap = await getDoc(doc(db, APP_CONFIG_DOC));
    if (snap.exists()) {
      currentAppConfig = snap.data();
      applyAppConfig(currentAppConfig);
    }
  } catch (e) {
    console.warn('loadAppConfig error:', e);
  }
}

function applyAppConfig(cfg){
  if (!cfg) return;
  if (cfg.appName) {
    document.title = cfg.appName;
    const b = document.getElementById('login-logo-mark'); if (b) b.textContent = cfg.appName;
  }
  if (cfg.tagline) {
    const b = document.getElementById('login-logo-sub'); if (b) b.textContent = cfg.tagline;
  }
  if (cfg.loginTitle) { const el = document.getElementById('login-title-text'); if (el) el.textContent = cfg.loginTitle; }
  if (cfg.loginSubtitle) { const el = document.getElementById('login-sub-text'); if (el) el.textContent = cfg.loginSubtitle; }
  if (cfg.accentColor) {
    document.documentElement.style.setProperty('--accent', cfg.accentColor);
  }
  if (cfg.logoImageUrl) {
    const el = document.getElementById('login-logo-mark');
    if (el && !el.querySelector('img')) {
      el.innerHTML = `<img src="${cfg.logoImageUrl}" alt="logo" style="max-height:32px;max-width:160px;-webkit-text-fill-color:initial">`;
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   SECTION 20 · GROUP TRANSACTIONS
   Split items inside one transaction.
   ══════════════════════════════════════════════════════════════ */
// ══ GROUP TRANSACTION FUNCTIONS ══════════════════════════════════════════════
function toggleGroupSection(){
  isGroupMode=!isGroupMode;
  const section=document.getElementById('group-section');
  const btn=document.getElementById('btn-toggle-group');
  const amtInput=document.getElementById('txn-amount');
  if(isGroupMode){
    section.style.display='block';
    btn.textContent='✕ Cancel Group';
    amtInput.disabled=true;amtInput.placeholder='Auto-calculated';
    linkedExistingIds=new Set();
    const container=document.getElementById('group-items-container');
    if(container.children.length===0) addGroupRow();
  } else {
    section.style.display='none';
    btn.textContent='📦 Group Transaction';
    amtInput.disabled=false;amtInput.placeholder='0';
    document.getElementById('group-items-container').innerHTML='';
    document.getElementById('group-total-display').textContent='৳0';
    document.getElementById('existing-picker').style.display='none';
    linkedExistingIds=new Set();
  }
}



function calcGroupTotal(){
  let total=0;
  document.querySelectorAll('.group-amt').forEach(inp=>{total+=parseFloat(inp.value)||0;});
  document.getElementById('group-total-display').textContent=fmt(total);
  document.getElementById('txn-amount').value=total;
}

function toggleGrp(id,btn){
  const el=document.getElementById('grp-'+id);
  if(!el)return;
  const hidden=el.style.display==='none';
  el.style.display=hidden?'block':'none';
  btn.textContent=hidden?'▲ Hide':'▼ Show';
}

// ── Existing Transaction Picker ───────────────────────────────────────────────
// Track which existing txn IDs are already linked in current group session

function showExistingPicker(){
  const picker=document.getElementById('existing-picker');
  const isHidden=picker.style.display==='none';
  picker.style.display=isHidden?'block':'none';
  if(isHidden){
    document.getElementById('existing-search').value='';
    renderExistingList('');
  }
}

function renderExistingList(query){
  const list=document.getElementById('existing-list');
  // Current group edit id — exclude self
  const selfId=document.getElementById('txn-edit-id').value;
  // Filter: same type, not group (no splits), not already linked, not self
  let txns=DATA.transactions.filter(t=>{
    if(t.id==selfId) return false;
    if(linkedExistingIds.has(String(t.id))) return false;
    if(t.type!==txnType) return false;
    // exclude transactions that are already members of another group
    if(t.groupParentId) return false;
    if(query){
      const q=query.toLowerCase();
      return (t.desc||'').toLowerCase().includes(q)||(t.cat||'').toLowerCase().includes(q);
    }
    return true;
  }).slice(0,40);

  if(!txns.length){
    list.innerHTML=`<div style="font-size:12px;color:var(--text2);text-align:center;padding:12px">No matching transactions</div>`;
    return;
  }
  list.innerHTML=txns.map(t=>`
    <div onclick="linkExistingTxn('${t.id}')" style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;border-radius:7px;cursor:pointer;background:var(--bg4);border:1px solid var(--border);transition:background 0.15s" onmouseover="this.style.background='var(--bg5)'" onmouseout="this.style.background='var(--bg4)'">
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.emoji||'💸'} ${t.desc}</div>
        <div style="font-size:10px;color:var(--text2)">${t.cat} · ${t.date}</div>
      </div>
      <div style="font-family:JetBrains Mono;font-size:12px;font-weight:700;color:${t.type==='income'?'var(--pos)':'var(--neg)'};flex-shrink:0;margin-left:10px">${t.type==='income'?'+':'-'}${fmt(t.amount)}</div>
    </div>`).join('');
}

function filterExistingList(){
  renderExistingList(document.getElementById('existing-search').value.trim());
}

function linkExistingTxn(txnId){
  const t=DATA.transactions.find(x=>x.id==txnId);
  if(!t) return;
  linkedExistingIds.add(String(txnId));
  // Add as a special linked row (not editable amount/cat — shows existing info)
  addGroupRow({
    amount:t.amount,
    cat:t.cat,
    desc:t.desc,
    emoji:t.emoji||getCatEmoji(t.cat),
    linkedTxnId:t.id   // mark as linked
  });
  // Refresh picker list to remove newly linked item
  renderExistingList(document.getElementById('existing-search').value.trim());
  toast(`"${t.desc}" linked ✓`,'info');
}

// Override addGroupRow to support linked rows
const _origAddGroupRow=addGroupRow;
// (redefined below — keep reference for splits loading)

function addGroupRow(split=null){
  const container=document.getElementById('group-items-container');
  const rowId='grow-'+Date.now()+Math.floor(Math.random()*9999);
  const cats=txnType==='income'?getIncomeCats():getExpenseCats();
  const catOpts=cats.map(c=>`<option value="${c}"${split&&split.cat===c?' selected':''}>${c}</option>`).join('');
  const div=document.createElement('div');
  div.className='group-row';
  div.id=rowId;

  const isLinked=!!(split&&split.linkedTxnId);
  if(split&&split.linkedTxnId) div.dataset.linkedId=split.linkedTxnId;

  if(isLinked){
    // Linked row — read-only display, can only remove link
    div.style.cssText='display:flex;align-items:center;gap:8px;background:var(--glass-surface);backdrop-filter:blur(12px) saturate(150%);-webkit-backdrop-filter:blur(12px) saturate(150%);padding:8px 10px;border-radius:8px;border:1px solid rgba(var(--accent-rgb),0.3)';
    div.innerHTML=`
      <span style="font-size:14px">${split.emoji||'💸'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${split.desc}</div>
        <div style="font-size:10px;color:var(--text2)">${split.cat}</div>
      </div>
      <span style="font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(var(--accent-rgb),0.14);color:var(--accent);font-weight:600;flex-shrink:0">🔗 Linked</span>
      <span style="font-family:JetBrains Mono;font-size:12px;font-weight:700;flex-shrink:0">${fmt(split.amount)}</span>
      <input type="hidden" class="group-amt" value="${split.amount}">
      <input type="hidden" class="group-desc" value="${split.desc}">
      <select class="group-cat" style="display:none"><option value="${split.cat}" selected>${split.cat}</option></select>
      <button class="btn btn-danger btn-sm" style="padding:5px 9px;font-size:13px;flex-shrink:0" onclick="unlinkGroupRow('${rowId}','${split.linkedTxnId}')">✕</button>
    `;
  } else {
    // Normal editable row — payment method added (default: cash)
    ensureAccounts();
    const methodOpts=DATA.accounts.map(a=>`<option value="${a.id}"${(split&&split.account)?split.account===a.id?' selected':'':a.id==='cash'?' selected':''}>${a.name}</option>`).join('');
    div.style.cssText='display:grid;grid-template-columns:75px 1fr 1fr 1fr auto;gap:6px;align-items:center;background:var(--bg3);padding:8px 10px;border-radius:8px;border:1px solid var(--border)';
    div.innerHTML=`
      <input class="form-input group-amt" type="number" placeholder="৳ amt" min="0" value="${split?split.amount:''}" oninput="calcGroupTotal()" style="padding:6px 8px;font-size:12px;font-family:JetBrains Mono">
      <input class="form-input group-desc" type="text" placeholder="description" value="${split?split.desc:''}" style="padding:6px 8px;font-size:12px">
      <select class="form-input group-cat" style="padding:6px 8px;font-size:12px">${catOpts}</select>
      <select class="form-input group-method" style="padding:6px 8px;font-size:11px" title="Payment Method">${methodOpts}</select>
      <button class="btn btn-danger btn-sm" style="padding:5px 9px;font-size:13px;line-height:1" onclick="document.getElementById('${rowId}').remove();calcGroupTotal()">✕</button>
    `;
  }
  container.appendChild(div);
  calcGroupTotal();
}

function unlinkGroupRow(rowId,txnId){
  document.getElementById(rowId).remove();
  linkedExistingIds.delete(String(txnId));
  calcGroupTotal();
  renderExistingList(document.getElementById('existing-search').value.trim());
}

function loadGroupSplits(splits){
  linkedExistingIds=new Set();
  document.getElementById('group-items-container').innerHTML='';
  splits.forEach(s=>{
    if(s.linkedTxnId) linkedExistingIds.add(String(s.linkedTxnId));
    addGroupRow(s);
  });
}

/* ══════════════════════════════════════════════════════════════
   SECTION 21 · BOOT
   Runs last: restores the saved login (auto-login). Keep at the very end.
   ══════════════════════════════════════════════════════════════ */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { checkGoogleAutoLogin(); });
else checkGoogleAutoLogin();
