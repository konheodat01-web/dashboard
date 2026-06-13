let currentMember = 'admin'; // declared first to avoid TDZ
let websites = [
  {id:1, brand:'Debet', url:'https://debets.sbs', admin:'wp-admin', account:'dybala5858585858@gmail.com', password:'Mktb2022@', status:'Tốt', note:''},
];
let wsNextId = 2;
let editingWsId = null;
const WS_STATUS_COLOR = {'Tốt':'#27ae60','Chờ cấp lại mật khẩu':'#e67e22','Lỗi web':'#e74c3c'};
const WS_STATUS_ICON  = {'Tốt':'✅','Chờ cấp lại mật khẩu':'🔒','Lỗi web':'⚠️'};
const LOAI_CONFIG_DEFAULT = {
  'Tinh Gọn':      {price: 14000, color: 'red'},
  'Chỉ Viết':      {price:  4000, color: 'blue'},
  'Chỉ Đăng':      {price:  4000, color: 'blue'},
  'Tinh Gọn Nhanh':{price:  7000, color: 'green'},
};
let LOAI_CONFIG = Object.assign({}, LOAI_CONFIG_DEFAULT);

function _loadCustomLoai(){
  try{
    const s = localStorage.getItem('wt_loai_config');
    if(s){ const custom=JSON.parse(s); LOAI_CONFIG=Object.assign({},LOAI_CONFIG_DEFAULT,custom); }
  }catch(e){}
}
_loadCustomLoai();

function _saveCustomLoai(){
  try{ localStorage.setItem('wt_loai_config', JSON.stringify(LOAI_CONFIG)); }catch(e){}
  syncLoaiBaiDropdowns();
}

function syncLoaiBaiDropdowns(){
  const loais = Object.keys(LOAI_CONFIG);
  document.querySelectorAll('select').forEach(sel=>{
    const opts = [...sel.options].map(o=>o.value);
    if(opts.includes('Tinh Gọn') && opts.includes('Chỉ Viết')){
      const cur = sel.value;
      sel.innerHTML = loais.map(l=>`<option value="${l}">${l} — ${(LOAI_CONFIG[l].price/1000).toFixed(0)}k</option>`).join('');
      if(loais.includes(cur)) sel.value = cur;
    }
  });
}
function loaiPrice(loai){ return (LOAI_CONFIG[loai]||{price:14000}).price; }
function nghiemThuBadge(val){
  const v = (val===undefined||val===null) ? 100 : Number(val);
  const cfg = NT_CONFIG[v] || NT_CONFIG[100];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;color:${cfg.color};background:${cfg.bg};border:1px solid ${cfg.border};cursor:pointer">${cfg.label}</span>`;
}
function loaiBadge(loai){
  const cfg = LOAI_CONFIG[loai]||{color:'gray'};
  const cls = cfg.color==='red'?'badge-red':cfg.color==='blue'?'badge-blue':cfg.color==='green'?'badge-green':'badge-gray';
  return `<span class="badge ${cls}" style="font-size:11px">${loai}</span>`;
}

let data = { hai: [], hieu: [] };

let reportData = { hai: [], hieu: [] };

function calcMoney(bai, chiDang, loai){
  return bai * loaiPrice(loai||'Tinh Gọn') + (chiDang||0) * 4000;
}

function fmt(n){
  return new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(n);
}

function fmtDate(d){
  if(!d) return '';
  let [y,m,dd] = d.split('-');
  return `${dd}/${m}`;
}

function _currentMonthYM(){
  const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');
}
// ===== PERIOD START =====
let _periodStart = '2026-03-13';
(function loadPeriodStart(){
  try{ const s=localStorage.getItem('wt_period_start'); if(s && /^\d{4}-\d{2}-\d{2}$/.test(s)) _periodStart=s; }catch(e){}
})();
function getPeriodStart(){ return _periodStart; }
function _inCurrentPeriod(ngay){ return (ngay||'') >= _periodStart; }

// ===== PERIOD HISTORY =====
let _periodHistory = [];
(function loadPeriodHistory(){
  try{ const h=localStorage.getItem('wt_period_history'); if(h) _periodHistory=JSON.parse(h); }catch(e){}
})();
function _savePeriodHistory(){
  try{ localStorage.setItem('wt_period_history', JSON.stringify(_periodHistory)); }catch(e){}
}
function _savePeriodToHistory(start, endDate){
  if(!start) return;
  const exists=_periodHistory.find(h=>h.start===start);
  if(!exists){ _periodHistory.unshift({start, end: endDate||start}); _savePeriodHistory(); }
}
let _viewingPeriod = null;

// ===== SALARY CONFIG =====
let _salaryConfig = { hai: {chiPhi:[], phuCap:[]}, hieu: {chiPhi:[], phuCap:[]} };
(function loadSalaryConfig(){
  try{
    const s=localStorage.getItem('wt_salary_config'); if(s) _salaryConfig=JSON.parse(s);
    ['hai','hieu'].forEach(sh=>{
      if(!_salaryConfig[sh]) _salaryConfig[sh]={chiPhi:[],phuCap:[]};
      if(typeof _salaryConfig[sh].chiPhi==='number'){ const v=_salaryConfig[sh].chiPhi; _salaryConfig[sh].chiPhi=v?[{name:'Chi phí',amount:v}]:[]; }
      if(typeof _salaryConfig[sh].phuCap==='number'){ const v=_salaryConfig[sh].phuCap; _salaryConfig[sh].phuCap=v?[{name:'Phụ cấp',amount:v}]:[]; }
    });
  }catch(e){}
})();
function getSalaryConfig(sheet){ return _salaryConfig[sheet]||{chiPhi:[],phuCap:[]}; }
function getTotalChiPhi(sheet){ return (getSalaryConfig(sheet).chiPhi||[]).reduce((a,x)=>a+(x.amount||0),0); }
function getTotalPhuCap(sheet){ return (getSalaryConfig(sheet).phuCap||[]).reduce((a,x)=>a+(x.amount||0),0); }

// ===== SALARY RATES =====
let _salaryRates = { hai: {}, hieu: {} };
(function loadSalaryRates(){
  try{ const s=localStorage.getItem('wt_salary_rates'); if(s) _salaryRates=JSON.parse(s); ['hai','hieu'].forEach(sh=>{ if(!_salaryRates[sh]) _salaryRates[sh]={}; }); }catch(e){}
})();
function getLoaiPrice(loai, sheet, row){
  if(row && row.donGia > 0) return row.donGia;
  const custom = sheet && _salaryRates[sheet] && _salaryRates[sheet][loai];
  return custom || (LOAI_CONFIG[loai]||{price:14000}).price;
}

// ===== FLEX SALARY (THƯỞNG/PHẠT) =====
let _flexSalary = { hai: [], hieu: [] };
(function loadFlexSalary(){
  try{ const s=localStorage.getItem('wt_flex_salary'); if(s) _flexSalary=JSON.parse(s); ['hai','hieu'].forEach(sh=>{ if(!_flexSalary[sh]) _flexSalary[sh]=[]; }); }catch(e){}
})();
function getFlexSalary(sheet){ return _flexSalary[sheet]||[]; }
function getTotalPhat(sheet){ return getFlexSalary(sheet).filter(x=>x.loai==='phat').reduce((a,x)=>a+(x.amount||0),0); }
function getTotalThuong(sheet){ return getFlexSalary(sheet).filter(x=>x.loai==='thuong').reduce((a,x)=>a+(x.amount||0),0); }
let _flexNextId = { hai: 1, hieu: 1 };
(function initFlexIds(){ ['hai','hieu'].forEach(sh=>{ _flexNextId[sh]=Math.max(1,...getFlexSalary(sh).map(x=>x.id||0))+1; }); })();

// ===== NT_CONFIG =====
const NT_CONFIG = {
  100: {label:'100%', color:'#27ae60', bg:'#f0faf4', border:'#a8deba'},
  80:  {label:'80%',  color:'#2980b9', bg:'#f0f7fd', border:'#b8d4ea'},
  50:  {label:'50%',  color:'#e74c3c', bg:'#fdf2f2', border:'#f5c6c6'},
  0:   {label:'0%',   color:'#555',    bg:'#f0f0f0', border:'#ccc'},
};

// ===== TOTALS (period-based) =====
function totalHai(){
  return data.hai.filter(r=>_inCurrentPeriod(r.ngay)).reduce((a,r)=>a+getLoaiPrice(r.loai,'hai',r)*(r.nghiemThu===undefined?1:r.nghiemThu/100)+(r.chiDang||0)*4000,0);
}
function totalHieu(){
  return data.hieu.filter(r=>_inCurrentPeriod(r.ngay)).reduce((a,r)=>a+getLoaiPrice(r.loai,'hieu',r)*(r.nghiemThu===undefined?1:r.nghiemThu/100)+(r.chiDang||0)*4000,0);
}
function totalBaiHai(){ return data.hai.filter(r=>_inCurrentPeriod(r.ngay)).length; }
function totalBaiHieu(){ return data.hieu.filter(r=>_inCurrentPeriod(r.ngay)).length; }

function renderDashboard() {
  const container = document.getElementById('page-dashboard-content');
  if (!container) return;

  const activeTasks = (tasks || []).slice(0, 5);

  let tasksHtml = '';
  if (activeTasks.length === 0) {
    tasksHtml = `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">Không có công việc nào đang hoạt động.</div>`;
  } else {
    tasksHtml = activeTasks.map(t => {
      const totalCards = (t.cards || []).length;
      const doneCards = (t.cards || []).filter(c => c.colId === 'done' || c.colId === 'pending').length;
      const pct = totalCards ? Math.round((doneCards / totalCards) * 100) : 0;
      
      return `
        <div style="background:#fff;border:1px solid var(--gray-border);border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.03);display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
              <span class="badge badge-blue" style="font-size:10px">${t.type || 'Công việc'}</span>
              <span style="font-size:11px;color:var(--text-muted)">Tạo từ: ${t.from || ''}</span>
            </div>
            <div style="font-size:14px;font-weight:700;color:var(--text-main);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" onclick="showPage('tasks'); openTask(${t.id})">${t.name}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:13px;font-weight:700;color:#c0392b">${pct}% Hoàn thành</div>
            <div style="font-size:11px;color:var(--text-muted)">${doneCards}/${totalCards} task con</div>
          </div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--gray-border);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h2 style="font-size:18px;font-weight:800;margin:0">Trung tâm Điều hành</h2>
        <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0 0">Chào mừng bạn quay lại, Admin</p>
      </div>
      <button onclick="showPage('tasks')" class="btn btn-primary btn-sm">Xem tất cả công việc</button>
    </div>
    
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:20px">
      <div class="db-card-glass">
        <div class="db-card-label">Tổng dự án</div>
        <div class="db-card-value">${(tasks || []).length}</div>
        <div class="db-card-desc">Đang được quản lý trên hệ thống</div>
      </div>
      <div class="db-card-glass">
        <div class="db-card-label">Tài khoản Web</div>
        <div class="db-card-value">${(websites || []).length}</div>
        <div class="db-card-desc">Tổng tài khoản quản trị website</div>
      </div>
    </div>
    
    <div style="margin-top:16px">
      <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-main)">Dự án hoạt động gần đây</h3>
      <div>
        ${tasksHtml}
      </div>
    </div>
  `;
}

function statusBadge(s){
  if(s==='Đã Gửi') return `<span class="badge badge-green">${s}</span>`;
  if(s==='Done') return `<span class="badge badge-blue">${s}</span>`;
  return `<span class="badge badge-gray">${s||'Chưa gửi'}</span>`;
}

let activeEditClose = null;

function editCell(sheet, id, field, el){
  if(activeEditClose){activeEditClose();activeEditClose=null;}

  const cur = data[sheet].find(r=>r.id===id);
  if(!cur) return;

  if(field==='status'){
    const orig=cur[field];
    const opts=['Chưa gửi','Đã Gửi','Done'];
    const sel=document.createElement('select');
    sel.style.cssText='font-size:12px;padding:2px 4px;border:1px solid var(--red);border-radius:4px;background:#fff;color:var(--text)';
    opts.forEach(o=>{const opt=document.createElement('option');opt.value=o;opt.textContent=o;if(o===orig)opt.selected=true;sel.appendChild(opt);});
    el.innerHTML='';el.appendChild(sel);sel.focus();
    sel.onclick=e=>e.stopPropagation();
    sel.onchange=()=>{cur[field]=sel.value;el.innerHTML=statusBadge(cur[field]);activeEditClose=null;};
    sel.onkeydown=e=>{if(e.key==='Escape'){cur[field]=orig;el.innerHTML=statusBadge(orig);activeEditClose=null;}};
    activeEditClose=()=>{cur[field]=sel.value;el.innerHTML=statusBadge(cur[field]);};
    return;
  }
  if(field==='loai'){
    const orig=cur[field];
    const opts=['Tinh Gọn','Chỉ Viết','Chỉ Đăng','Tinh Gọn Nhanh'];
    const sel=document.createElement('select');
    sel.style.cssText='font-size:12px;padding:2px 4px;border:1px solid var(--red);border-radius:4px;background:#fff;color:var(--text)';
    opts.forEach(o=>{const opt=document.createElement('option');opt.value=o;opt.textContent=o;if(o===orig)opt.selected=true;sel.appendChild(opt);});
    el.innerHTML='';el.appendChild(sel);sel.focus();
    sel.onclick=e=>e.stopPropagation();
    sel.onchange=()=>{cur[field]=sel.value;el.innerHTML=loaiBadge(cur[field]);activeEditClose=null;};
    sel.onkeydown=e=>{if(e.key==='Escape'){cur[field]=orig;el.innerHTML=loaiBadge(orig);activeEditClose=null;}};
    activeEditClose=()=>{cur[field]=sel.value;el.innerHTML=loaiBadge(cur[field]);};
    return;
  }

  const orig=cur[field]||'';
  const inp=document.createElement('input');
  inp.type='text';inp.value=orig;
  inp.style.cssText='width:100%;min-width:140px;font-size:12px;padding:2px 6px;border:1px solid var(--red);border-radius:4px;background:#fff;color:var(--text);outline:none';
  el.innerHTML='';el.appendChild(inp);inp.focus();inp.select();
  inp.onclick=e=>e.stopPropagation();

  const renderVal=()=>{
    const v=cur[field]||'';
    const isLink=['website','link','spin','index'].includes(field);
    if(isLink){
      el.innerHTML=v?`<span style="font-size:11px;color:var(--blue);max-width:140px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle" title="${v}">${v}</span>`:'<span style="color:var(--text-muted)">—</span>';
    } else {
      el.innerHTML=v||'<span style="color:var(--text-muted)">—</span>';
      if(field==='keyword') el.style.fontWeight='500';
    }
    activeEditClose=null;
  };

  const save=()=>{
    const newVal = inp.value.trim();
    if(newVal !== orig){
      cur[field]=newVal;
      if(field==='anchor') cur._anchorManual = (newVal !== ''); // mark manual if non-empty
      saveAppData();
    } else { cur[field]=newVal; }
    renderVal();
    updateWsIcons();
  };
  activeEditClose=save;
  inp.onblur=save;
  inp.onkeydown=e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape'){cur[field]=orig;inp.value=orig;inp.blur();}};
}

function urlShort(u){
  if(!u) return '—';
  try{return new URL(u).hostname+(new URL(u).pathname.length>1?new URL(u).pathname:'');}catch(e){return u;}
}

function openLinkViewer(sheet, id){
  const r = data[sheet].find(x=>x.id===id);
  if(!r) return;
  const links = [];
  if(r.link) links.push({label:'&#128279; Link bài', url:r.link});
  if(r.website) links.push({label:'&#127760; Website', url:r.website});
  if(r.spin) links.push({label:'&#128257; Spin / Drive', url:r.spin});
  if(r.index) links.push({label:'&#128269; Index', url:r.index});

  const body = links.length ? links.map(l=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-border)">
      <span style="font-size:13px;min-width:130px;color:var(--text-muted)">${l.label}</span>
      <a href="${l.url}" target="_blank" style="color:var(--blue);font-size:12px;word-break:break-all;flex:1">${l.url}</a>
    </div>`).join('')
  : '<div style="color:var(--text-muted);text-align:center;padding:20px">Chưa có link nào</div>';

  document.getElementById('modalTitle').innerHTML = `&#128279; ${r.keyword}`;
  document.getElementById('modalBody').innerHTML = `<div style="font-size:13px">${body}</div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

const sheetFilters = {
  hai:  {ngay:null,ngay_from:'',ngay_to:'',keyword:null,loai:null,website:null,anchor:null,chuyenMuc:null,link:null,status:null},
  hieu: {ngay:null,ngay_from:'',ngay_to:'',keyword:null,loai:null,website:null,anchor:null,chuyenMuc:null,link:null,spin:null,index:null,status:null}
};
const selected = {hai: new Set(), hieu: new Set()};

let activeDrop = null;
let dropState = {}; // {sheet, field, allVals, checked: Set, searchQ}

function getFieldVal(r, field){
  if(field==='ngay') return fmtDate(r.ngay)||'(trống)';
  return String(r[field]||'')||'(trống)';
}

function getUnique(sheet, field){
  return [...new Set(data[sheet].map(r=>getFieldVal(r,field)))].filter(v=>v).sort();
}

function openFilter(sheet, field, thEl){
  // toggle: click same header closes
  if(activeDrop){
    const same = activeDrop._sheet===sheet && activeDrop._field===field;
    closeDrop();
    if(same) return;
  }

  const f = sheetFilters[sheet];
  const allVals = getUnique(sheet, field);
  // current selection: null = all checked; Set = those checked
  const curSet = f[field]; // null means all selected
  const checkedSet = curSet===null ? new Set(allVals) : new Set(curSet);

  const drop = document.createElement('div');
  drop.className = 'fdrop';
  drop._sheet = sheet;
  drop._field = field;
  drop._allVals = allVals;
  drop._checked = checkedSet; // live reference updated by clicks
  activeDrop = drop;

  const isDate = field==='ngay';

  drop.innerHTML = `
    ${isDate ? `<div class="fdrop-date">
      <div><label>Từ ngày</label><input type="date" id="dp_from" value="${f.ngay_from||''}"></div>
      <div><label>Đến ngày</label><input type="date" id="dp_to" value="${f.ngay_to||''}"></div>
    </div>` : ''}
    <div class="fdrop-search">
      <input type="text" id="fdropSearch" placeholder="🔍 Tìm kiếm..." autocomplete="off" oninput="renderDropList()">
    </div>
    <div class="fdrop-list" id="fdropList"></div>
    <div class="fdrop-footer">
      <button class="btn btn-sm btn-outline" onclick="closeDrop()">Huỷ</button>
      <button class="btn btn-sm btn-primary" onclick="applyDrop()">&#10003; OK</button>
    </div>`;

  const rect = thEl.getBoundingClientRect();
  drop.style.cssText = `position:fixed;top:${rect.bottom+2}px;left:${Math.min(rect.left,window.innerWidth-300)}px`;
  document.body.appendChild(drop);

  renderDropList(); // append to DOM first, THEN render list

  setTimeout(()=>{
    const s = document.getElementById('fdropSearch');
    if(s) s.focus();
    document.addEventListener('mousedown', outsideClick);
  }, 30);
}

function renderDropList(){
  if(!activeDrop) return;
  const listEl = document.getElementById('fdropList');
  if(!listEl) return;
  const q = (document.getElementById('fdropSearch')||{}).value||'';
  const allVals = activeDrop._allVals;
  const checked = activeDrop._checked;
  const visible = q ? allVals.filter(v=>v.toLowerCase().includes(q.toLowerCase())) : allVals;
  const allChecked = checked.size === allVals.length;
  const someChecked = checked.size > 0 && !allChecked;

  listEl.innerHTML =
    `<label class="fdrop-item fdrop-selectall">
      <input type="checkbox" id="chkAllDrop" ${allChecked?'checked':''}>
      <span style="font-weight:500">${q?'Chọn kết quả tìm kiếm':'Chọn tất cả'}</span>
    </label>
    <div style="height:1px;background:var(--gray-border);margin:2px 0"></div>`
    + visible.map((v,i)=>`
    <label class="fdrop-item">
      <input type="checkbox" data-idx="${i}" ${checked.has(v)?'checked':''} class="dchk">
      <span style="font-size:12px;word-break:break-all">${v}</span>
    </label>`).join('');

  // store visible vals for delegation
  listEl._visible = visible;

  document.getElementById('chkAllDrop').onchange = function(){
    dropToggleAll(this);
  };
  listEl.querySelectorAll('.dchk').forEach((chk,i)=>{
    chk.onchange = function(){
      const val = listEl._visible[i];
      if(this.checked) activeDrop._checked.add(val);
      else activeDrop._checked.delete(val);
      const allChk = document.getElementById('chkAllDrop');
      if(allChk) allChk.checked = activeDrop._checked.size === activeDrop._allVals.length;
    };
  });
}

function dropToggleAll(chk){
  const q = (document.getElementById('fdropSearch')||{}).value||'';
  const allVals = activeDrop._allVals;
  const visible = q ? allVals.filter(v=>v.toLowerCase().includes(q.toLowerCase())) : allVals;
  if(chk.checked){
    visible.forEach(v=>activeDrop._checked.add(v));
    if(!q) allVals.forEach(v=>activeDrop._checked.add(v));
  } else {
    visible.forEach(v=>activeDrop._checked.delete(v));
    if(!q) activeDrop._checked.clear();
  }
  renderDropList();
}

function applyDrop(){
  if(!activeDrop) return;
  const {_sheet:sheet, _field:field, _allVals:allVals, _checked:checked} = activeDrop;
  const f = sheetFilters[sheet];

  if(field==='ngay'){
    f.ngay_from = (document.getElementById('dp_from')||{}).value||'';
    f.ngay_to = (document.getElementById('dp_to')||{}).value||'';
  }

  // if all checked = no filter (null), else store the set
  if(checked.size === allVals.length){
    f[field] = null;
  } else {
    f[field] = new Set(checked);
  }

  updateFilterHeaders(sheet);
  closeDrop();
  renderDashboard();
}

function updateFilterHeaders(sheet){
  const f = sheetFilters[sheet];
  const tbl = document.getElementById('table'+sheet.charAt(0).toUpperCase()+sheet.slice(1));
  if(!tbl) return;
  tbl.querySelectorAll('.fh').forEach(th=>{
    const m = th.getAttribute('onclick').match(/'([^']+)'/g);
    const field = m&&m[1] ? m[1].replace(/'/g,'') : null;
    if(!field) return;
    const hasFilter = f[field]!==null || (field==='ngay'&&(f.ngay_from||f.ngay_to));
    th.classList.toggle('active', !!hasFilter);
    th.querySelector('.fh-ic').textContent = hasFilter ? '▲' : '▼';
  });
}

function closeDrop(){
  if(activeDrop){ activeDrop.remove(); activeDrop=null; }
  document.removeEventListener('mousedown', outsideClick);
}

function outsideClick(e){
  if(activeDrop && !activeDrop.contains(e.target) && !e.target.closest('.fh')) closeDrop();
}

function applyFilters(sheet, rows){
  const f = sheetFilters[sheet];
  return rows.filter(r=>{
    if(f.ngay_from || f.ngay_to){
      const from=f.ngay_from, to=f.ngay_to;
      if(from && !to && r.ngay!==from) return false;
      if(from && to && !(r.ngay>=from && r.ngay<=to)) return false;
      if(!from && to && r.ngay>to) return false;
    }
    const fields=['ngay','keyword','loai','website','anchor','chuyenMuc','link','spin','index','status'];
    for(const field of fields){
      if(f[field]!==null && f[field]!==undefined){
        const v = getFieldVal(r,field);
        if(!f[field].has(v)) return false;
      }
    }
    return true;
  });
}

// Active date filter per sheet (null = show all, or 'YYYY-MM-DD')
// activeDate removed

function getSheetDates(sheet){
  const all = [...new Set(data[sheet].map(r=>r.ngay).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  return all;
}

function todayVN(){
  const now = new Date();
  const vn = new Date(now.getTime() + 7*60*60*1000);
  return vn.toISOString().split('T')[0];
}

function addDays(dateStr, n){
  if(!dateStr || dateStr.length!==10) dateStr = todayVN();
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// Track which sheet's calendar is open
let _calSheet = null;

function renderDateNav(sheet){
  const nav = document.getElementById('dateNav'+sheet.charAt(0).toUpperCase()+sheet.slice(1));
  if(!nav) return;
  const todayStr = todayVN();
  const dates = getSheetDates(sheet);

  if(activeDate[sheet] === undefined){
    const hour = new Date().getHours();
    if(hour >= 12 && dates.includes(todayStr)) activeDate[sheet] = todayStr;
    else if(dates.length) activeDate[sheet] = dates[0];
    else activeDate[sheet] = todayStr;
  }

  const cur = activeDate[sheet];
  const displayDate = (cur && cur.length===10) ? cur : todayVN();
  const isAll = !cur || cur.length!==10;
  const isToday = displayDate === todayStr;
  const isTomorrow = displayDate === addDays(todayStr, 1);
  const isYesterday = displayDate === addDays(todayStr, -1);
  const parts = displayDate.split('-');
  let label = parseInt(parts[2]) + '/' + parseInt(parts[1]) + '/' + parts[0];
  if(isAll) label = 'Tất cả';
  else if(isToday) label = '📅 Hôm nay (' + parseInt(parts[2]) + '/' + parseInt(parts[1]) + ')';
  else if(isTomorrow) label = '⏭ Ngày mai (' + parseInt(parts[2]) + '/' + parseInt(parts[1]) + ')';
  else if(isYesterday) label = '⏮ Hôm qua (' + parseInt(parts[2]) + '/' + parseInt(parts[1]) + ')';

  const curCount = isAll ? data[sheet].length : data[sheet].filter(r=>r.ngay===displayDate).length;

  nav.innerHTML = `
    <div style="display:flex;align-items:center;gap:0;background:#fff;border:1px solid var(--gray-border);border-radius:8px;overflow:hidden">
      <button onclick="navDate('${sheet}',-1)" title="Ngày hôm trước"
        style="background:none;border:none;border-right:1px solid var(--gray-border);padding:6px 12px;cursor:pointer;font-size:14px;color:var(--text-muted);transition:all .15s"
        onmouseover="this.style.background='var(--gray-light)'" onmouseout="this.style.background='none'">&#8249;</button>
      <div style="padding:5px 14px;font-size:13px;font-weight:600;min-width:160px;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px">
        ${label}
        ${curCount>0?`<span style="background:var(--red);color:#fff;border-radius:20px;font-size:10px;padding:1px 7px;font-weight:600">${curCount}</span>`:'<span style="color:var(--text-muted);font-size:11px;font-weight:400">trống</span>'}
      </div>
      <button onclick="navDate('${sheet}',1)" title="Ngày hôm sau"
        style="background:none;border:none;border-left:1px solid var(--gray-border);padding:6px 12px;cursor:pointer;font-size:14px;color:var(--text-muted);transition:all .15s"
        onmouseover="this.style.background='var(--gray-light)'" onmouseout="this.style.background='none'">&#8250;</button>
    </div>
    <button onclick="setActiveDate('${sheet}',null)" class="date-tab${isAll?' date-tab-active':''}">
      Tất cả ${isAll?'('+data[sheet].length+')':''}
    </button>
    <button onclick="openMiniCal('${sheet}',this)" class="date-tab" style="font-size:12px;padding:4px 10px;background:#fff;border:1px solid var(--gray-border);border-radius:8px;cursor:pointer;color:var(--text)">
      📅 ${isAll ? displayDate.slice(0,7).replace('-','/') : (parseInt(parts[2])+'/'+parseInt(parts[1]))}
    </button>`;
}

function openMiniCal(sheet, btn){
  // Close if same already open
  const existing = document.getElementById('miniCal');
  if(existing && _calSheet===sheet){ existing.remove(); _calSheet=null; return; }
  if(existing) existing.remove();
  _calSheet = sheet;

  const cur = activeDate[sheet];
  const refDate = (cur && cur.length===10) ? cur : todayVN();
  const [ry, rm] = refDate.split('-').map(Number);

  // Build day→count map
  const dayMap = {};
  data[sheet].forEach(r=>{ if(r.ngay) dayMap[r.ngay] = (dayMap[r.ngay]||0)+1; });

  const cal = document.createElement('div');
  cal.id = 'miniCal';
  cal.style.cssText = 'position:fixed;background:#fff;border:1px solid var(--gray-border);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);z-index:9999;padding:12px;min-width:260px;user-select:none';

  function buildCal(year, month){
    const todayStr = todayVN();
    const firstDay = new Date(year, month-1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    // shift: Mon=0
    const offset = (firstDay + 6) % 7;
    const monthNames = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

    let cells = '';
    for(let i=0; i<offset; i++) cells += '<div></div>';
    for(let d=1; d<=daysInMonth; d++){
      const dateStr = year+'-'+(String(month).padStart(2,'0'))+'-'+(String(d).padStart(2,'0'));
      const count = dayMap[dateStr]||0;
      const isToday = dateStr===todayStr;
      const isActive = dateStr===activeDate[sheet];
      const hasData = count > 0;
      cells += `<div onclick="setActiveDate('${sheet}','${dateStr}');closeMiniCal()" style="
        width:34px;height:34px;border-radius:8px;display:flex;flex-direction:column;align-items:center;
        justify-content:center;cursor:pointer;position:relative;font-size:12px;font-weight:${hasData?'600':'400'};
        color:${isActive?'#fff':isToday?'var(--red)':hasData?'var(--text)':'var(--text-muted)'};
        background:${isActive?'var(--red)':isToday&&!isActive?'#fdf2f2':'transparent'};
        border:${isToday&&!isActive?'1px solid var(--red)':'1px solid transparent'};
        transition:background .1s"
        onmouseover="if(!${isActive}) this.style.background='var(--gray-light)'"
        onmouseout="if(!${isActive}) this.style.background='${isActive?'var(--red)':isToday&&!isActive?'#fdf2f2':'transparent'}'">
        <span>${d}</span>
        ${hasData&&!isActive?`<span style="width:5px;height:5px;background:var(--red);border-radius:50%;position:absolute;bottom:3px"></span>`:''}
        ${hasData&&isActive?`<span style="font-size:9px;line-height:1;opacity:.9">${count}</span>`:''}
      </div>`;
    }

    cal.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <button onclick="calNav(-1)" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px 8px;border-radius:6px;color:var(--text-muted)" onmouseover="this.style.background='var(--gray-light)'" onmouseout="this.style.background='none'">‹</button>
        <span style="font-weight:600;font-size:13px">${monthNames[month]} ${year}</span>
        <button onclick="calNav(1)" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px 8px;border-radius:6px;color:var(--text-muted)" onmouseover="this.style.background='var(--gray-light)'" onmouseout="this.style.background='none'">›</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,34px);gap:2px;margin-bottom:4px">
        ${['H','B','T','N','S','B','C'].map(d=>`<div style="text-align:center;font-size:10px;font-weight:600;color:var(--text-muted);padding:4px 0">${d}</div>`).join('')}
        ${cells}
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--gray-border);padding-top:8px;margin-top:4px">
        <button onclick="setActiveDate('${sheet}',null);closeMiniCal()" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--text-muted)">Tất cả</button>
        <button onclick="setActiveDate('${sheet}','${todayStr}');closeMiniCal()" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--red);font-weight:600">Hôm nay</button>
      </div>`;
    cal._year = year; cal._month = month;
  }

  window.calNav = function(dir){
    let m = cal._month + dir, y = cal._year;
    if(m>12){m=1;y++;} if(m<1){m=12;y--;}
    buildCal(y, m);
  };

  buildCal(ry, rm);

  // Position below button
  document.body.appendChild(cal);
  const rect = btn.getBoundingClientRect();
  let left = rect.left;
  if(left + 270 > window.innerWidth) left = window.innerWidth - 278;
  cal.style.top = (rect.bottom + 4) + 'px';
  cal.style.left = left + 'px';

  // Close on outside click
  setTimeout(()=>{
    document.addEventListener('mousedown', function outsideCal(e){
      if(!cal.contains(e.target) && e.target !== btn){
        closeMiniCal(); document.removeEventListener('mousedown', outsideCal);
      }
    });
  }, 50);
}

function closeMiniCal(){
  const c = document.getElementById('miniCal');
  if(c) c.remove();
  _calSheet = null;
}

function navDate(sheet, dir){
  const today = todayVN();
  // If no active date, start from today before navigating
  const cur = activeDate[sheet] && activeDate[sheet].length===10 ? activeDate[sheet] : today;
  activeDate[sheet] = addDays(cur, dir);
  renderDashboard();
}

function setActiveDate(sheet, date){
  activeDate[sheet] = (date && date.length===10) ? date : null;
  renderDashboard();
}

// Delegated handler for website copy buttons
document.addEventListener('click', e=>{
  const btn = e.target.closest('.ws-copy-btn');
  if(!btn) return;
  // Support data-field (copy from input) or data-val (copy direct value)
  if(btn.dataset.field){
    const el = document.getElementById(btn.dataset.field);
    if(el) copyText(el.value, btn);
  } else if(btn.dataset.val){
    copyText(btn.dataset.val, btn);
  }
});

// Delegated handler for website lookup buttons (avoids inline onclick escaping issues)
document.addEventListener('click', e=>{
  const btn = e.target.closest('.ws-lookup-btn');
  if(!btn) return;
  e.stopPropagation();
  checkWebsiteInSheet(btn.dataset.url, btn);
});

function findBrandByUrl(url){
  if(!url) return '';
  const q=url.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const ws=websites.find(w=>{
    const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    return wu===q||wu.includes(q)||q.includes(wu);
  });
  return ws ? ws.brand : '';
}

// Auto-fill anchor for rows where anchor is empty and not manually set
function autoFillAnchors(){
  let changed=false;
  ['hai','hieu'].forEach(sheet=>{
    data[sheet].forEach(r=>{
      if(r._anchorManual) return; // manually set
      if(r.anchor) return; // already filled (even if auto)
      const brand=findBrandByUrl(r.website);
      if(brand){ r.anchor=brand; changed=true; }
    });
  });
  if(changed) saveAppData();
}

function updateWsIcons(){
  document.querySelectorAll('.ws-lookup-btn').forEach(btn=>{
    const url = btn.dataset.url;
    if(!url) return;
    const q = url.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    const ws = websites.find(w=>{
      const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
      return wu===q||wu.includes(q)||q.includes(wu);
    });
    btn.textContent = ws ? (WS_STATUS_ICON[ws.status]||'✅') : '🔍';
    btn.title = ws ? (ws.brand+' — '+ws.status) : 'Kiểm tra website';
    btn.style.opacity = ws ? '1' : '0.5';
  });
  autoFillAnchors();
}

function getWsIcon(url, rowId){
  if(!url) return '';
  try {
    const q = url.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    const ws = websites.find(w=>{
      const wu = (w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
      return wu===q || wu.includes(q) || q.includes(wu);
    });
    const icon  = ws ? (WS_STATUS_ICON[ws.status]||'✅') : '🔍';
    const title = ws ? (ws.brand+' — '+ws.status) : 'Chưa nhận diện';
    return `<button class="ws-lookup-btn" data-url="${url.replace(/"/g,'&quot;')}" data-rowid="${rowId}" title="${title.replace(/"/g,'&quot;')}" style="background:none;border:none;cursor:pointer;font-size:13px;padding:1px 3px;flex-shrink:0">${icon}</button>`;
  } catch(e){ return ''; }
}


function getIndexStatusBadge(r){
  if(!r.indexId) return '<span style="color:var(--red);font-size:11px;font-weight:500">Chưa gửi</span>';
  const task = indexTasks.find(t=>t.taskId===r.indexId);
  if(!task) return `<span style="font-size:10px;color:var(--text-muted);border:1px dashed var(--gray-border);padding:1px 5px;border-radius:4px">${r.indexId}</span>`;
  const st = task.status;
  if(st==='Done') return '<span style="font-size:10px;color:#27ae60;font-weight:600">Done</span>';
  if(st==='Pending') return '<span style="font-size:10px;color:#e67e22">Pending</span>';
  if(st==='Đã gửi index') return '<span style="font-size:10px;color:#2980b9">Đã gửi</span>';
  return '<span style="font-size:10px;color:var(--text-muted)">'+st+'</span>';
}
// [REMOVED: function renderHai\(\)] /* DEAD CODE ELIMINATED */
function _removed_placeholder_0f6d6bf5(){
  renderDateNav('hai');
  const rows = getVisibleRows('hai');
  const cnt=document.getElementById('haiCount');
  if(cnt) cnt.textContent=rows.length+'/'+data.hai.length+' dòng';
  const tbody=document.getElementById('tbodyHai');
  const empty=document.getElementById('emptyHai');
  if(!rows.length){tbody.innerHTML='';empty.style.display='block';updateBulkBar('hai');return;}
  empty.style.display='none';
  tbody.innerHTML=rows.map((r,i)=>{
    const sel=selected.hai.has(r.id);
    const bg=!sel&&r._color?'background:'+r._color:'';
    return `<tr class="${sel?'row-selected':''}" data-id="${r.id}" style="${bg}">
      <td style="width:32px;text-align:center"><input type="checkbox" ${sel?'checked':''} onchange="toggleRow('hai',${r.id},this.checked)" style="cursor:pointer;accent-color:var(--red)"></td>
      <td onclick="openAssignIndexId('hai',${r.id})" title="Click để gán / đổi ID Index" style="cursor:pointer;white-space:nowrap" onmouseover="this.style.background='#f0f7fd'" onmouseout="this.style.background=''">
        ${r.indexId ? `<span style="font-family:monospace;font-size:11px;background:#f0f7fd;color:#2980b9;padding:2px 7px;border-radius:4px;font-weight:600;border:1px solid #b8d4ea">${r.indexId}</span>` : '<span style="font-size:11px;color:var(--text-muted);border:1px dashed var(--gray-border);padding:2px 7px;border-radius:4px">+ Gán</span>'}
      </td>
      <td class="ec" onclick="editCell('hai',${r.id},'ngay',this)">${fmtDate(r.ngay)}</td>
      <td style="width:28px;text-align:center;padding:0 2px">
        <button onclick="copyText(this.dataset.kw,this)" data-kw="${r.keyword.replace(/\"/g,'&quot;')}"
          title="Copy keyword"
          style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:13px;padding:3px 5px;border-radius:3px;line-height:1;opacity:.45;transition:all .15s;display:block;margin:auto"
          onmouseover="this.style.opacity=1;this.style.color='var(--red)'" onmouseout="this.style.opacity=.45;this.style.color='var(--text-muted)'">&#128203;</button>
      </td>
      <td class="ec" onclick="editCell('hai',${r.id},'keyword',this)" style="font-weight:500;max-width:200px">${r.keyword}</td>
      <td class="ec" onclick="editCell('hai',${r.id},'loai',this)">${loaiBadge(r.loai)}</td>
      <td class="ec" onclick="editCell('hai',${r.id},'website',this)" style="max-width:130px">
        <span style="font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block" title="${r.website||''}">${r.website||'<span style=color:var(--text-muted)>—</span>'}</span>
      </td>
      <td style="width:28px;text-align:center;padding:0 2px">
        ${r.website ? getWsIcon(r.website, r.id) : ''}
      </td>
      <td class="ec" onclick="editCell('hai',${r.id},'anchor',this)" style="color:var(--text-muted);max-width:100px">${r.anchor||'—'}</td>
      <td class="ec" onclick="editCell('hai',${r.id},'chuyenMuc',this)">${r.chuyenMuc||'—'}</td>
      <td class="ec" onclick="editCell('hai',${r.id},'link',this)" style="max-width:140px"><span style="font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block" title="${r.link||''}">${r.link||'<span style=color:var(--text-muted)>—</span>'}</span></td>
      <td style="text-align:center;cursor:pointer" onclick="openNghiemThu('hai',${r.id})">${nghiemThuBadge(r.nghiemThu===undefined?100:r.nghiemThu)}</td>
      <td style="text-align:center">${getIndexStatusBadge(r)}</td>
      <td style="white-space:nowrap"><button class="btn btn-sm btn-outline" onclick="openLinkViewer('hai',${r.id})" style="font-size:11px;padding:3px 8px">&#128279; Xem</button> <button class="btn btn-sm btn-outline" onclick="copyExcelSingleRow('hai',${r.id})" style="font-size:11px;padding:3px 6px" title="Copy dòng này sang Excel">📊</button></td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteEntry('hai',${r.id})">&#128465;</button></td>
    </tr>`;}).join('');
  updateBulkBar('hai');
  initDragSelect('hai');
  updateWsIcons();
  setTimeout(()=>updateStickyTops('hai'),0);
}

// [REMOVED: function renderHieu\(\)] /* DEAD CODE ELIMINATED */
function _removed_placeholder_1d36d5b3(){
  renderDateNav('hieu');
  const rows = getVisibleRows('hieu');
  const cnt=document.getElementById('hieuCount');
  if(cnt) cnt.textContent=rows.length+'/'+data.hieu.length+' dòng';
  const tbody=document.getElementById('tbodyHieu');
  const empty=document.getElementById('emptyHieu');
  if(!rows.length){tbody.innerHTML='';empty.style.display='block';updateBulkBar('hieu');return;}
  empty.style.display='none';
  tbody.innerHTML=rows.map((r,i)=>{
    const sel=selected.hieu.has(r.id);
    const bg=!sel&&r._color?'background:'+r._color:'';
    return `<tr class="${sel?'row-selected':''}" data-id="${r.id}" style="${bg}">
      <td style="width:32px;text-align:center"><input type="checkbox" ${sel?'checked':''} onchange="toggleRow('hieu',${r.id},this.checked)" style="cursor:pointer;accent-color:var(--red)"></td>
      <td onclick="openAssignIndexId('hieu',${r.id})" title="Click để gán / đổi ID Index" style="cursor:pointer;white-space:nowrap" onmouseover="this.style.background='#f0f7fd'" onmouseout="this.style.background=''">
        ${r.indexId ? `<span style="font-family:monospace;font-size:11px;background:#f0f7fd;color:#2980b9;padding:2px 7px;border-radius:4px;font-weight:600;border:1px solid #b8d4ea">${r.indexId}</span>` : '<span style="font-size:11px;color:var(--text-muted);border:1px dashed var(--gray-border);padding:2px 7px;border-radius:4px">+ Gán</span>'}
      </td>
      <td class="ec" onclick="editCell('hieu',${r.id},'ngay',this)">${fmtDate(r.ngay)}</td>
      <td style="width:28px;text-align:center;padding:0 2px">
        <button onclick="copyText(this.dataset.kw,this)" data-kw="${r.keyword.replace(/\"/g,'&quot;')}"
          title="Copy keyword"
          style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:13px;padding:3px 5px;border-radius:3px;line-height:1;opacity:.45;transition:all .15s;display:block;margin:auto"
          onmouseover="this.style.opacity=1;this.style.color='var(--red)'" onmouseout="this.style.opacity=.45;this.style.color='var(--text-muted)'">&#128203;</button>
      </td>
      <td class="ec" onclick="editCell('hieu',${r.id},'keyword',this)" style="font-weight:500;max-width:200px">${r.keyword}</td>
      <td class="ec" onclick="editCell('hieu',${r.id},'loai',this)">${loaiBadge(r.loai)}</td>
      <td class="ec" onclick="editCell('hieu',${r.id},'website',this)" style="max-width:130px">
        <span style="font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block" title="${r.website||''}">${r.website||'<span style=color:var(--text-muted)>—</span>'}</span>
      </td>
      <td style="width:28px;text-align:center;padding:0 2px">
        ${r.website ? getWsIcon(r.website, r.id) : ''}
      </td>
      <td class="ec" onclick="editCell('hieu',${r.id},'anchor',this)" style="color:var(--text-muted);max-width:100px">${r.anchor||'—'}</td>
      <td class="ec" onclick="editCell('hieu',${r.id},'chuyenMuc',this)">${r.chuyenMuc||'—'}</td>
      <td class="ec" onclick="editCell('hieu',${r.id},'link',this)" style="max-width:130px"><span style="font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block" title="${r.link||''}">${r.link||'<span style=color:var(--text-muted)>—</span>'}</span></td>
      <td class="ec" onclick="editCell('hieu',${r.id},'spin',this)" style="max-width:100px"><span style="font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block" title="${r.spin||''}">${r.spin||'<span style=color:var(--text-muted)>—</span>'}</span></td>
      <td style="text-align:center;min-width:80px;padding:4px 6px">${getIndexStatusBadge(r)}</td>
      <td style="text-align:center;cursor:pointer" onclick="openNghiemThu('hieu',${r.id})">${nghiemThuBadge(r.nghiemThu===undefined?100:r.nghiemThu)}</td>
      <td style="white-space:nowrap"><button class="btn btn-sm btn-outline" onclick="openLinkViewer('hieu',${r.id})" style="font-size:11px;padding:3px 8px">&#128279; Xem</button> <button class="btn btn-sm btn-outline" onclick="copyExcelSingleRow('hieu',${r.id})" style="font-size:11px;padding:3px 6px" title="Copy dòng này sang Excel">📊</button></td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteEntry('hieu',${r.id})">&#128465;</button></td>
    </tr>`;}).join('');
  updateBulkBar('hieu');
  initDragSelect('hieu');
  updateWsIcons();
  setTimeout(()=>updateStickyTops('hieu'),0);
}

function toggleRow(sheet, id, checked){
  if(checked) selected[sheet].add(id); else selected[sheet].delete(id);
  updateBulkBar(sheet);
  const allChk=document.getElementById('chkAll'+sheet.charAt(0).toUpperCase()+sheet.slice(1));
  const visibleIds=getVisibleRows(sheet).map(r=>r.id);
  if(allChk) allChk.checked=visibleIds.length>0&&visibleIds.every(id=>selected[sheet].has(id));
}

function getVisibleRows(sheet){
  const idxQ = (document.getElementById('indexIdFilter'+sheet.charAt(0).toUpperCase()+sheet.slice(1))||{}).value?.trim().toLowerCase()||'';
  let rows = applyFilters(sheet, data[sheet]);
  // If indexId filter active → bypass date filter, only filter by indexId
  if(idxQ){
    rows = rows.filter(r=>(r.indexId||'').toLowerCase().includes(idxQ));
  } else {
    // Only filter by date if activeDate is a valid date string (not null/undefined = Tất cả)
    if(activeDate[sheet] && typeof activeDate[sheet]==='string' && activeDate[sheet].length===10){
      rows = rows.filter(r=>r.ngay===activeDate[sheet]);
    }
  }
  const kw = (document.getElementById('kwSearch'+sheet.charAt(0).toUpperCase()+sheet.slice(1))||{}).value?.toLowerCase()||'';
  if(kw) rows = rows.filter(r=>(r.keyword||'').toLowerCase().includes(kw));
  return rows;
}

function toggleAll(sheet, checked){
  const rows = getVisibleRows(sheet);
  rows.forEach(r=>{ if(checked) selected[sheet].add(r.id); else selected[sheet].delete(r.id); });
  renderDashboard();
}

function updateBulkBar(sheet){
  const bar=document.getElementById('bulkBar'+sheet.charAt(0).toUpperCase()+sheet.slice(1));
  const cnt=document.getElementById('bulkCount'+sheet.charAt(0).toUpperCase()+sheet.slice(1));
  const n=selected[sheet].size;
  if(bar){
    bar.classList.toggle('bulk-bar-inactive', n===0);
  }
  if(cnt){ cnt.textContent = n>0 ? 'Đã chọn '+n+' dòng' : 'Chưa chọn dòng nào'; }
}

function bulkOpenLinks(sheet, field){
  const ids = selected[sheet];
  if(!ids.size){ toast('Chưa chọn dòng nào!','#e74c3c'); return; }
  const rows = data[sheet].filter(r=>ids.has(r.id));
  const urls = rows.map(r=>r[field]).filter(u=>u&&u.startsWith('http'));
  if(!urls.length){ toast('Không có link nào để mở!','#e67e22'); return; }
  if(urls.length > 10){
    if(!confirm('Sắp mở '+urls.length+' tab cùng lúc. Tiếp tục?')) return;
  }
  urls.forEach(url=>window.open(url,'_blank'));
  toast('✓ Đã mở '+urls.length+' link', '#27ae60');
}

function bulkCopyField(sheet, field){
  const ids = selected[sheet];
  if(!ids.size){ toast('Chưa chọn dòng nào!','#e74c3c'); return; }
  const rows = data[sheet].filter(r=>ids.has(r.id));
  const vals = rows.map(r=>r[field]||'').join('\n');
  copyText(vals, null);
  const fieldLabel = {keyword:'từ khóa',link:'link bài',spin:'spin'}[field]||field;
  toast(`✓ Đã copy ${rows.length} ${fieldLabel}`,'#27ae60',2500);
}

// Excel column mapping:
// Deadline | Key chính | Key phụ | Loại bài | Người nhận | Website | Anchor | Link 2 | Anchor 2 | Chuyên Mục | Link bài | [3 trống] | Spin | Index
function rowToExcel(r, sheet){
  const person = sheet==='hai'?'Hải':'Hiếu';
  return [
    (r.ngay ? (()=>{ const p=r.ngay.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; })() : ''),  // Deadline
    r.keyword||'',    // Key chính
    '',               // Key phụ
    r.loai||'',       // Loại bài
    person,           // Người nhận
    r.website||'',    // Website
    r.anchor||'',     // Anchor
    '',               // Link 2
    '',               // Anchor 2
    r.chuyenMuc||'',  // Chuyên Mục
    r.link||'',       // Link bài
    r.spin||'',       // Spin
    r.index||'',      // Index
  ].join('\t');
}

function bulkCopyExcel(sheet){
  const ids = selected[sheet];
  if(!ids.size){ toast('Chưa chọn dòng nào!','#e74c3c'); return; }
  const rows = data[sheet].filter(r=>ids.has(r.id));
  const text = rows.map(r=>rowToExcel(r,sheet)).join('\n');
  copyText(text, null);
  toast('✓ Đã copy '+rows.length+' dòng (định dạng Excel)', '#27ae60', 3000);
}

function copyExcelSingleRow(sheet, id){
  const r = data[sheet].find(x=>x.id===id);
  if(!r) return;
  copyText(rowToExcel(r,sheet), null);
  toast('✓ Đã copy dòng (định dạng Excel)', '#27ae60', 2500);
}

function bulkStatus(sheet, status){
  selected[sheet].forEach(id=>{
    const r=data[sheet].find(x=>x.id===id);
    if(r) r.status=status;
  });
  renderDashboard();
  saveAppData();
  toast(`&#10003; Đã cập nhật ${selected[sheet].size} dòng → ${status}`);
}

function bulkDelete(sheet){
  if(!confirm(`Xoá ${selected[sheet].size} dòng đã chọn?`)) return;
  const ids = new Set(selected[sheet]);
  data[sheet] = data[sheet].filter(r=>!ids.has(r.id));
  selected[sheet] = new Set(); // reset hẳn, không dùng .clear() để tránh stale ref
  saveAppData();
  renderDashboard();
  renderDashboard();
  toast('Đã xoá ' + ids.size + ' dòng.');
}

function clearSelection(sheet){
  selected[sheet] = new Set();
  const allChk=document.getElementById('chkAll'+sheet.charAt(0).toUpperCase()+sheet.slice(1));
  if(allChk) allChk.checked=false;
  renderDashboard();
}

function clearFilter(sheet){
  const f=sheetFilters[sheet];
  Object.keys(f).forEach(k=>{ f[k]=k==='ngay_from'||k==='ngay_to'?'':null; });
  updateFilterHeaders(sheet);
  renderDashboard();
}

function getF(id){return (document.getElementById(id)||{}).value||'';}
function inDateRange(ngay,from,to){
  if(!from&&!to) return true;
  if(!ngay) return false;
  if(from&&!to) return ngay>=from;
  if(from&&to) return ngay>=from&&ngay<=to;
  if(!from&&to) return ngay<=to;
  return true;
}

function addEntry(){ /* DEAD CODE ELIMINATED */ }
function deleteEntry(){ /* DEAD CODE ELIMINATED */ }
function clearForm(){ /* DEAD CODE ELIMINATED */ }
let _showPageRedirectCount = 0;
function showPage(name) {
  switchWorkspace('job', null);
  document.querySelectorAll('.page').forEach(page => {
    page.classList.add('is-hidden');
  });
  const target = document.getElementById('page-' + name);
  if (target) {
    target.classList.remove('is-hidden');
  } else {
    localStorage.setItem('wt_activePage', 'dashboard');
    const fallbackPage = document.getElementById('page-dashboard');
    if (fallbackPage) fallbackPage.classList.remove('is-hidden');
    return;
  }
  document.querySelectorAll('.sidebar-sub-item').forEach(item => item.classList.remove('active'));
  const currentSubItem = Array.from(document.querySelectorAll('.sidebar-sub-item')).find(item => {
    const attr = item.getAttribute('onclick');
    return attr && attr.includes("'" + name + "'");
  });
  if (currentSubItem) currentSubItem.classList.add('active');
  if (name === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (name === 'tasks' && typeof renderTasksOverview === 'function') renderTasksOverview();
  if (name === 'recurring' && typeof renderRecurringTasks === 'function') renderRecurringTasks();
  if (name === 'wstrack' && typeof renderWsTrack === 'function') renderWsTrack();
  if (name === 'links' && typeof renderLinks === 'function') { renderLinks(); renderWebsites(); }
  if (name === 'prompts' && typeof renderPrompts === 'function') renderPrompts();
  localStorage.setItem('wt_activePage', name);
  if (!['tasks', 'links', 'prompts'].includes(name)) {
    try {
      sessionStorage.removeItem('wt_activeSubPage');
      sessionStorage.removeItem('wt_activeProject');
    } catch(e){}
  }
}

function closeModal(e){
  if(!e||e.target===document.getElementById('modalOverlay')||!e.target.closest('.modal'))
    document.getElementById('modalOverlay').classList.remove('open');
  setTimeout(updateWsIcons, 50);
}

function toast(msg, bg='#27ae60', duration=2500){
  const t = document.getElementById('toast');
  t.innerHTML = msg; t.style.background = bg;
  t.classList.add('show');
  clearTimeout(t._toastTimer);
  t._toastTimer = setTimeout(()=>t.classList.remove('show'), duration);
}

document.getElementById('currentDate').textContent = new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
const fDateEl = document.getElementById('fDate');
if (fDateEl) fDateEl.value = todayVN();

// ===== LOCAL STORAGE PERSISTENCE =====
// Set sticky top values dynamically based on actual rendered heights
function updateStickyTops(sheet){} // no-op: sticky handled by CSS

function saveAppData(){
  delete _settings.loginBg;
  const ts = saveToLocalStorage();
  const ind = document.getElementById('syncIndicator');
  if(ind){
    ind.textContent = '☁ Đang đồng bộ...';
    ind.style.opacity = '1';
    ind.style.color = '#ffaa00';
  }
  if(window._fbReady && window._fbDb){
    console.log('Pushing to Firebase, ts=', ts);
    return window._fbDb.ref('appData').set(fbPayload(ts)).then(()=>{
      console.log('Firebase push OK');
      if(ind){
        ind.textContent = '☁ Đã đồng bộ';
        ind.style.color = '#f0f6fc';
        setTimeout(()=>ind.style.opacity='0', 1500);
      }
    }).catch(e=>{
      console.error('Firebase push FAILED:', e);
      if(ind){
        ind.textContent = '❌ Lỗi đồng bộ';
        ind.style.color = '#f85149';
        setTimeout(()=>ind.style.opacity='0', 3000);
      }
      throw e;
    });
  } else {
    console.warn('Firebase not ready, _fbReady=', window._fbReady);
    if(ind){
      ind.textContent = '☁ Đã lưu (Local)';
      ind.style.color = '#8b949e';
      setTimeout(()=>ind.style.opacity='0', 1500);
    }
    return Promise.resolve();
  }
}

function fbPayload(ts){
  return {
    tasks, taskOrder: tasks.map(t=>t.id),
    deletedTasks, links, linkCategories,
    websites, wsGroups,
    giaoViecList, assignees, prompts, recurringTasks, khoId: khoIdList,
    recurDoneToday: getRecurDoneToday(),
    siteTracking,
    passwords: (typeof getProfilePasswords === 'function') ? getProfilePasswords() : {},
    settings: _settings,
    _trash_ts: parseInt(localStorage.getItem('wt_trash_ts')||'0'),
    wtApiKey: wtApiKey,
    wtSerperCredits: wtSerperCredits,
    teleTokenRank: localStorage.getItem('tele_token_rank') || '',
    teleChatIdRank: localStorage.getItem('tele_chat_id_rank') || '',
    _ts: ts, _sid: _sessionId
  };
}

function saveToLocalStorage(){
  const ts = Date.now();
  try{
    localStorage.setItem('wt_tasks',           JSON.stringify(tasks));
    if(deletedTasks.length>50) deletedTasks=deletedTasks.slice(-50); // cap trash at 50
    localStorage.setItem('wt_deleted_tasks',   JSON.stringify(deletedTasks));
    localStorage.setItem('wt_links',           JSON.stringify(links));
    localStorage.setItem('wt_link_categories', JSON.stringify(linkCategories));
    localStorage.setItem('wt_websites',        JSON.stringify(websites));
    localStorage.setItem('wt_ws_groups',       JSON.stringify(wsGroups));
    localStorage.setItem('wt_giaoviec',        JSON.stringify(giaoViecList));
    localStorage.setItem('wt_assignees',       JSON.stringify(assignees));
    localStorage.setItem('wt_prompts',         JSON.stringify(prompts));
    localStorage.setItem('wt_recurring',       JSON.stringify(recurringTasks));
    localStorage.setItem('wt_kho_id',          JSON.stringify(khoIdList));
    // recurDoneToday saved via setRecurDoneToday()
    localStorage.setItem('wt_passwords',       JSON.stringify((typeof getProfilePasswords === 'function') ? getProfilePasswords() : {}));
    localStorage.setItem('wt_settings', JSON.stringify(_settings));
    localStorage.setItem('wt_ts',              String(ts));
  }catch(e){}
  return ts;
}


// Unique session ID - avoid receiving own pushes
const _sessionId = Math.random().toString(36).slice(2);
const _pageLoadTime = Date.now();

function initFirebaseListener(){
  if(!window._fbReady || !window._fbDb) return;

  // Fetch settings immediately on connect (for login screen bg/avatars on fresh devices)
  window._fbDb.ref('appData/settings').once('value').then(snap=>{
    const s = snap.val();
    if(s && typeof s==='object'){
      _settings = s;
      delete _settings.loginBg;
      applyAllAvatars();
      localStorage.setItem('wt_settings', JSON.stringify(_settings));
    }
  }).catch(()=>{});

  window._fbDb.ref('appData').on('value', (snapshot)=>{
    const r = snapshot.val();
    if(!r) return;
    if (!data) data = { hai: [], hieu: [] };
    if (!data.hai) data.hai = [];
    if (!data.hieu) data.hieu = [];
    console.log('Firebase received, _sid=', r._sid, 'mySession=', _sessionId, 'tasks=', (r.tasks||[]).length);
    // Only skip pushes from THIS session (to avoid echo)
    if(r._sid && r._sid === _sessionId){
      // Own push — skip data reload but still update badges and active renders
      console.log('Skipped own push');
      updateNavBadges();
      renderTasksOverview();
      if(document.querySelector('.page.active')?.id==='page-tasks'){
        const gvPanel = document.getElementById('panel-giaoviec');
        if(gvPanel && gvPanel.style.display!=='none') renderGiaoViec();
      }
      // Update recurDoneToday even on own push
      if(Array.isArray(r.siteTracking) && r.siteTracking.length > 0){ 
        siteTracking=r.siteTracking; 
        localStorage.setItem('wt_site_tracking',JSON.stringify(siteTracking)); 
        if(document.querySelector('.page.active')?.id==='page-wstrack') renderWsTrack(); 
      } else if(Array.isArray(r.siteTracking) && siteTracking.length === 0) { 
        // Nếu cả 2 đều rỗng thì thôi, nhưng nếu local có mà server rỗng (do lỗi) thì giữ lại local
        siteTracking = r.siteTracking;
      }
      if(Array.isArray(r.recurDoneToday)){
        setRecurDoneToday(r.recurDoneToday.filter(d=>d.date===todayVN()));
      }
      if(Array.isArray(r.recurringTasks)) recurringTasks = r.recurringTasks;
      if(document.querySelector('.page.active')?.id==='page-recurring') renderRecurringTasks();
      return;
    }

    // Skip if Firebase data is OLDER than our local save — but ONLY within 5s of page load
    // After that, always accept Firebase to allow cross-device sync
    const localTs = parseInt(localStorage.getItem('wt_ts')||'0');
    const timeSinceLoad = Date.now() - _pageLoadTime;
    if(timeSinceLoad < 5000 && (r._ts||0) < localTs){
      console.log('Skipped stale Firebase data (within 5s of load): fb_ts=', r._ts, 'local_ts=', localTs);
      // Still restore siteTracking - it has no local timestamp so always trust Firebase
      if(Array.isArray(r.siteTracking) && r.siteTracking.length > 0){
        siteTracking = r.siteTracking;
        localStorage.setItem('wt_site_tracking', JSON.stringify(siteTracking));
        if(document.querySelector('.page.active')?.id==='page-wstrack') renderWsTrack();
      }
      return;
    }

    try{
      // Helper: Firebase stores empty arrays as null
      const arr = (v, fallback=[]) => Array.isArray(v) ? v : (v != null ? Object.values(v) : fallback);

      
      
      tasks = arr(r.tasks, tasks);
      deduplicateTasks();
      if(tasks.length) taskNextId = Math.max(taskNextId, ...tasks.map(x=>x.id||0)) + 1;
      tasks.forEach(task=>{ (task.cards||[]).forEach(c=>{ const n=parseInt((c.id||'').replace(/\D/g,''))||0; if(n>=cardNextId) cardNextId=n+1; }); });
      tasks.forEach(normalizeTaskCards);

      // Task order
      try{
        const fbOrder = Array.isArray(r.taskOrder) ? r.taskOrder : null;
        const lsOrder = JSON.parse(localStorage.getItem('wt_task_order')||'[]');
        const savedOrder = fbOrder || lsOrder;
        if(savedOrder.length){
          const taskMap = {}; tasks.forEach(t=>{ taskMap[t.id]=t; });
          const ordered = savedOrder.map(id=>taskMap[id]).filter(Boolean);
          const orderedIds = new Set(savedOrder);
          tasks = [...ordered, ...tasks.filter(t=>!orderedIds.has(t.id))];
        }
      } catch(e){}

      // deletedTasks — only accept if Firebase trash is NOT older than local permanent-delete
      const localTrashTs = parseInt(localStorage.getItem('wt_trash_ts')||'0');
      const fbTrashTs = r._trash_ts||0;
      if(Array.isArray(r.deletedTasks) && fbTrashTs >= localTrashTs){
        deletedTasks = r.deletedTasks;
      }
      // Update local trash_ts to whichever is newer
      if(fbTrashTs > localTrashTs) localStorage.setItem('wt_trash_ts', String(fbTrashTs));
      if(r._period_start&&typeof r._period_start==='string'){ _periodStart=r._period_start; try{localStorage.setItem('wt_period_start',_periodStart);}catch(e){} }
      if(Array.isArray(r._period_history)&&r._period_history.length>_periodHistory.length){ _periodHistory=r._period_history; try{localStorage.setItem('wt_period_history',JSON.stringify(_periodHistory));}catch(e){} }
      if(r._salary_config&&typeof r._salary_config==='object'){ _salaryConfig=r._salary_config; ['hai','hieu'].forEach(sh=>{if(!_salaryConfig[sh])_salaryConfig[sh]={chiPhi:[],phuCap:[]};}); try{localStorage.setItem('wt_salary_config',JSON.stringify(_salaryConfig));}catch(e){} }
      if(r._salary_rates&&typeof r._salary_rates==='object'){ _salaryRates=r._salary_rates; ['hai','hieu'].forEach(sh=>{if(!_salaryRates[sh])_salaryRates[sh]={};}); try{localStorage.setItem('wt_salary_rates',JSON.stringify(_salaryRates));}catch(e){} }
      if(r._flex_salary&&typeof r._flex_salary==='object'){ _flexSalary=r._flex_salary; ['hai','hieu'].forEach(sh=>{if(!_flexSalary[sh])_flexSalary[sh]=[];}); try{localStorage.setItem('wt_flex_salary',JSON.stringify(_flexSalary));}catch(e){} }
      if(r._loai_config&&typeof r._loai_config==='object'){ Object.assign(LOAI_CONFIG,r._loai_config); try{localStorage.setItem('wt_loai_config',JSON.stringify(LOAI_CONFIG));}catch(e){} syncLoaiBaiDropdowns(); }

      if(r.wtApiKey !== undefined){ wtApiKey = r.wtApiKey; localStorage.setItem('wt_valueserp_api_key', wtApiKey); }
      if(r.wtSerperCredits !== undefined){ wtSerperCredits = r.wtSerperCredits; localStorage.setItem('wt_serper_credits_left', wtSerperCredits); }
      if(r.teleTokenRank !== undefined) localStorage.setItem('tele_token_rank', r.teleTokenRank);
      if(r.teleChatIdRank !== undefined) localStorage.setItem('tele_chat_id_rank', r.teleChatIdRank);

      links         = arr(r.links, links);
      linkCategories= r.linkCategories != null ? r.linkCategories : linkCategories;
      if(Array.isArray(r.websites) && r.websites.length){ websites=r.websites; wsNextId=Math.max(2,...websites.map(w=>w.id+1)); deduplicateWebsiteIds(); }
      else if(r.websites===null) websites=[];
      wsGroups      = Array.isArray(r.wsGroups)      ? r.wsGroups      : wsGroups;
      if(Array.isArray(r.siteTracking) && r.siteTracking.length > 0){ 
        siteTracking=r.siteTracking; 
        localStorage.setItem('wt_site_tracking',JSON.stringify(siteTracking)); 
        if(document.querySelector('.page.active')?.id==='page-wstrack') renderWsTrack(); 
      } else if(Array.isArray(r.siteTracking) && siteTracking.length === 0) { 
        // Nếu cả 2 đều rỗng thì thôi, nhưng nếu local có mà server rỗng (do lỗi) thì giữ lại local
        siteTracking = r.siteTracking;
      }
      if(Array.isArray(r.recurDoneToday)){ const _td=r.recurDoneToday.filter(d=>d.date===todayVN()); const _cur=localStorage.getItem('wt_recur_done_today'); if(JSON.stringify(_td)!==_cur){ setRecurDoneToday(_td); if(document.querySelector('.page.active')?.id==='page-recurring') renderRecurringTasks(); } }
      if(r.khoId && Array.isArray(r.khoId)){ khoIdList=r.khoId; localStorage.setItem('wt_kho_id',JSON.stringify(khoIdList)); if(document.querySelector('.page.active')?.id==='page-index') renderKhoId(); }
      if(Array.isArray(r.giaoViecList)){ giaoViecList=r.giaoViecList; giaoViecNextId=Math.max(1,...giaoViecList.map(g=>g.id||0))+1; }
      if(Array.isArray(r.assignees) && r.assignees.length) assignees=r.assignees;
      if(Array.isArray(r.prompts)){      prompts=r.prompts;           promptNextId=Math.max(1,...prompts.map(p=>p.id||0))+1; }
      if(r.passwords && typeof r.passwords==='object') localStorage.setItem('wt_passwords', JSON.stringify(r.passwords));
      if(r.settings && typeof r.settings==='object'){
       _settings = r.settings;
       delete _settings.loginBg;
if(!_settings.avatars) _settings.avatars = {}; // local fills gaps, fb overrides
        applyAllAvatars();
        localStorage.setItem('wt_settings', JSON.stringify(_settings));
      }

      // Mirror everything to localStorage
      localStorage.setItem('wt_tasks',           JSON.stringify(tasks));
      if(r.recurringTasks && Array.isArray(r.recurringTasks)){ recurringTasks=r.recurringTasks; recurNextId=Math.max(1,...recurringTasks.map(x=>x.id||0))+1; localStorage.setItem('wt_recurring',JSON.stringify(recurringTasks)); if(document.querySelector('.page.active')?.id==='page-recurring') renderRecurringTasks(); }
      localStorage.setItem('wt_recurring',       JSON.stringify(recurringTasks));
    localStorage.setItem('wt_kho_id',          JSON.stringify(khoIdList));
    // recurDoneToday saved via setRecurDoneToday()
      localStorage.setItem('wt_deleted_tasks',   JSON.stringify(deletedTasks));
      localStorage.setItem('wt_links',           JSON.stringify(links));
      localStorage.setItem('wt_link_categories', JSON.stringify(linkCategories));
      localStorage.setItem('wt_websites',        JSON.stringify(websites));
      localStorage.setItem('wt_ws_groups',       JSON.stringify(wsGroups));
      localStorage.setItem('wt_index_tasks',     JSON.stringify(indexTasks));
      localStorage.setItem('wt_giaoviec',        JSON.stringify(giaoViecList));
      localStorage.setItem('wt_assignees',       JSON.stringify(assignees));
      localStorage.setItem('wt_prompts',         JSON.stringify(prompts));
    localStorage.setItem('wt_recurring',       JSON.stringify(recurringTasks));
    localStorage.setItem('wt_kho_id',          JSON.stringify(khoIdList));
    // recurDoneToday saved via setRecurDoneToday()
      if(r._ts) localStorage.setItem('wt_ts',    String(r._ts));

      if (isAdminLoggedIn()) {
        renderDashboard();
        renderTasksOverview();
        // Fix: also re-render sub-board if currently open
        if(currentProjectId){
          const openTask = tasks.find(t=>t.id===currentProjectId);
          if(openTask){
            // Normalize cards array (Firebase may return object instead of array)
            normalizeTaskCards(openTask);
            renderSubBoard(openTask);
          }
        }
        // Normalize all tasks' cards arrays defensively
        tasks.forEach(normalizeTaskCards);
        const active=document.querySelector('.page.active')?.id?.replace('page-','');
        if(active==='links'){renderLinks();renderWebsites();}
        if(active==='index') renderIndexTasks();
        updateNavBadges();
      } else {
        tasks.forEach(normalizeTaskCards);
      }

      // Auto-clean trash only AFTER Firebase data is fully loaded
      if(!window._trashCleaned){ window._trashCleaned=true; autoCleanTrash(); autoBackupDaily(); migrateIndexTasksToKho(); }

      const ind=document.getElementById('syncIndicator');
      if(ind){ind.textContent='🔄 Nhận dữ liệu mới';ind.style.opacity='1';ind.style.color='#fff';setTimeout(()=>ind.style.opacity='0',3000);}
    }catch(e){console.warn('Firebase receive error',e);}
  });
}

function loadAppData(){
  try{
    const hai = localStorage.getItem('wt_data_hai');
    const hieu = localStorage.getItem('wt_data_hieu');
    const t = localStorage.getItem('wt_tasks');
    const l = localStorage.getItem('wt_links');
    const lc = localStorage.getItem('wt_link_categories');
    if(hai) data.hai = JSON.parse(hai);
    if(hieu) data.hieu = JSON.parse(hieu);
    if(t){
      tasks = JSON.parse(t);
      deduplicateTasks();
      tasks.forEach(normalizeTaskCards);
      if(tasks.length) taskNextId = Math.max(taskNextId, ...tasks.map(x=>x.id||0)) + 1;
      // update cardNextId from all existing cards
      tasks.forEach(task=>{ (task.cards||[]).forEach(c=>{ const n=parseInt((c.id||'').replace(/\D/g,''))||0; if(n>=cardNextId) cardNextId=n+1; }); });
      try{
        const savedOrder = JSON.parse(localStorage.getItem('wt_task_order')||'[]');
        if(savedOrder.length){
          const taskMap = {}; tasks.forEach(task=>{ taskMap[task.id]=task; });
          const orderedIds = new Set(savedOrder);
          const ordered = savedOrder.map(id=>taskMap[id]).filter(Boolean);
          const rest = tasks.filter(task=>!orderedIds.has(task.id));
          tasks = [...ordered, ...rest];
        }
      } catch(e){}
    }
    const dt=localStorage.getItem('wt_deleted_tasks'); if(dt) deletedTasks=JSON.parse(dt);
    if(l) links = JSON.parse(l);
    if(lc) linkCategories = JSON.parse(lc);
    const ws = localStorage.getItem('wt_websites');
    if(ws){ websites=JSON.parse(ws); wsNextId=Math.max(1,...websites.map(w=>w.id+1)); }
    const _rec=localStorage.getItem('wt_recurring'); if(_rec){ recurringTasks=JSON.parse(_rec); recurNextId=Math.max(1,...recurringTasks.map(r=>r.id||0))+1; }
    const wsg=localStorage.getItem('wt_ws_groups'); if(wsg) wsGroups=JSON.parse(wsg);
    const it=localStorage.getItem('wt_index_tasks'); if(it){ indexTasks=JSON.parse(it); itNextId=Math.max(1,...indexTasks.map(t=>t._id||0))+1; }
    const gv=localStorage.getItem('wt_giaoviec'); if(gv){ giaoViecList=JSON.parse(gv); giaoViecNextId=Math.max(1,...giaoViecList.map(g=>g.id||0))+1; }
    const ga=localStorage.getItem('wt_assignees'); if(ga) assignees=JSON.parse(ga);
    const pr=localStorage.getItem('wt_prompts'); if(pr){ prompts=JSON.parse(pr); promptNextId=Math.max(1,...prompts.map(p=>p.id||0))+1; }
    const st=localStorage.getItem('wt_settings');
    if(st){
      try{
        _settings=JSON.parse(st);
        delete _settings.loginBg;
       if(!_settings.avatars) _settings.avatars={};
        applyAllAvatars();
      }catch(e){}
    }
  }catch(e){ console.warn('localStorage load failed', e); }
}


// ===== CÔNG VIỆC KHÁC — PROJECT BOARDS =====
const DEFAULT_COLS = [
  {id:'todo',    label:'Cần làm',    color:'#6c757d'},
  {id:'doing',   label:'Đang làm',   color:'#2980b9'},
  {id:'done',    label:'Hoàn thành', color:'#27ae60'},
  {id:'pending', label:'Pending',    color:'#e67e22'},
];
const TASK_TYPE_COLORS = {'Nội dung':'badge-blue','SEO':'badge-green','Thiết kế':'badge-red','Kỹ thuật':'badge-gray','Marketing':'badge-red','Khác':'badge-gray'};

let tasks = [
  {id:1,name:'Viết 20 bài tk888.fit',person:'Hiếu',type:'Nội dung',desc:'Tinh gọn nhanh, tập trung từ khóa chính',from:'2026-03-18',deadline:'2026-03-25',cols:null,cards:[
    {id:'c1',colId:'todo',name:'Tìm keyword chính',desc:''},
    {id:'c2',colId:'doing',name:'Viết 10 bài đầu',desc:''},
  ]},
  {id:2,name:'Check backlink tháng 3',person:'Hải',type:'SEO',desc:'',from:'2026-03-18',deadline:'2026-03-30',cols:null,cards:[
    {id:'c3',colId:'todo',name:'Export backlink report',desc:''},
  ]},
];
let taskNextId = 10;
let deletedTasks = []; // trash bin
let cardNextId = 100;
let currentProjectId = null;
let dragCardId = null;
let pendingDragCard = null;
let editingCardId = null;
let editingProjectId = null;

function patchLegacyTaskColumns(task) {
  if (task && task.cols && Array.isArray(task.cols)) {
    const hasDoing = task.cols.some(col => col.id === 'doing');
    if (!hasDoing) {
      console.log(`[V35 Guard] Phát hiện task lỗi thiếu cột doing: ${task.name}. Tiến hành cứu hộ.`);
      const updatedCols = [
        task.cols[0],
        { id: 'doing', label: 'Đang làm', color: '#2980b9' },
        ...task.cols.slice(1)
      ];
      task.cols = updatedCols;
    }
  }
}

function normalizeTaskCards(task){
  if(!task) return;
  // Firebase may return cols as object instead of array
  if(task.cols && !Array.isArray(task.cols) && typeof task.cols === 'object'){
    const colEntries = Object.entries(task.cols);
    // Sort by numeric key to preserve order
    colEntries.sort((a,b)=>parseInt(a[0])-parseInt(b[0]));
    task.cols = colEntries.map(e=>e[1]);
  }
  
  patchLegacyTaskColumns(task);

  // Firebase may return cards as object {0:{...},1:{...}} instead of array
  if(task.cards && !Array.isArray(task.cards) && typeof task.cards === 'object'){
    const cardEntries = Object.entries(task.cards);
    cardEntries.sort((a,b)=>parseInt(a[0])-parseInt(b[0]));
    task.cards = cardEntries.map(e=>e[1]);
  }
  if(!task.cards) task.cards = [];
  // Normalize each card's colId against the task's columns
  const cols = getProjectCols(task);
  const validColIds = new Set(cols.map(c=>c.id));
  // Add legacy colId aliases
  validColIds.add('todo'); validColIds.add('doing'); validColIds.add('pending'); validColIds.add('done');
  const firstColId = cols[0].id;
  task.cards.forEach(card=>{
    if(!card.colId || !validColIds.has(card.colId)){
      // Unknown colId — put back in first col
      console.warn(`Card ${card.id} has invalid colId "${card.colId}", resetting to "${firstColId}"`);
      card.colId = firstColId;
    }
  });
}

function getProjectCols(task){
  return task.cols || DEFAULT_COLS;
}

function calcProjectProgress(task){
  if(!task.cards||!task.cards.length) return 0;
  const cols = getProjectCols(task);
  const lastColId = cols[cols.length-1].id;
  const done = task.cards.filter(c=>c.colId===lastColId||c.colId==='done').length;
  return Math.round(done/task.cards.length*100);
}

function daysLeft(deadline){
  if(!deadline) return '';
  // Compare as local date strings to avoid UTC offset issues
  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(deadline+'T00:00:00'); // force local midnight
  const diff = Math.round((dl-today)/(1000*60*60*24));
  if(diff<0) return `<span style="color:var(--red);font-size:11px;font-weight:600">Trễ ${Math.abs(diff)}n</span>`;
  if(diff===0) return `<span style="color:var(--red);font-size:11px;font-weight:600">Hôm nay!</span>`;
  if(diff<=3) return `<span style="color:#e67e22;font-size:11px">Còn ${diff}n</span>`;
  return `<span style="font-size:11px;color:var(--text-muted)">Còn ${diff}n</span>`;
}

function daysSince(from){
  if(!from) return 0;
  return Math.floor((new Date()-new Date(from))/(1000*60*60*24));
}

// ---- OVERVIEW as LIST ----
function taskMove(id, dir){
  const idx = tasks.findIndex(t=>t.id===id);
  if(idx<0) return;
  let ni;
  if(dir==='up') ni=Math.max(0,idx-1);
  else if(dir==='down') ni=Math.min(tasks.length-1,idx+1);
  else if(dir==='top') ni=0;
  else if(dir==='bottom') ni=tasks.length-1;
  else return;
  if(ni===idx) return;
  const [m]=tasks.splice(idx,1);
  tasks.splice(ni,0,m);
  _saveTaskOrder();
  renderTasksOverview();
}

// Save order+tasks to localStorage AND Firebase
let _taskSyncTimer = null;
function _saveTaskOrder(){
  try{
    localStorage.setItem('wt_task_order', JSON.stringify(tasks.map(t=>t.id)));
    localStorage.setItem('wt_tasks', JSON.stringify(tasks));
  }catch(e){}
  // Debounce Firebase push to avoid echo-loop duplicate
  clearTimeout(_taskSyncTimer);
  _taskSyncTimer = setTimeout(()=>{ saveAppData(); }, 1500);
}


function initTaskGridDrag(){ /* no-op, drag replaced by buttons */ }


const _taskRowMap = {};


function deduplicateWebsiteIds(){
  const seen = new Set();
  let count = 0;
  websites.forEach(w=>{
    if(seen.has(w.id)){
      w.id = wsNextId++;
      count++;
    }
    seen.add(w.id);
  });
  if(count > 0){
    saveAppData();
    console.log('Fixed', count, 'dup website IDs');
  }
}

function deduplicateLinkIds(){
  const seen = new Set();
  let count = 0;
  links.forEach(l=>{
    if(seen.has(l.id)){
      l.id = linkNextId++;
      count++;
    }
    seen.add(l.id);
  });
  if(count > 0){
    saveAppData();
    console.log('Fixed', count, 'dup link IDs');
  }
}

function deduplicateTasks(){
  const seen = new Set();
  let maxId = tasks.reduce((m,t)=>Math.max(m,t.id||0),0);
  tasks = tasks.map(t=>{
    if(seen.has(t.id)){ t = {...t, id: ++maxId}; }
    seen.add(t.id);
    return t;
  });
}

function openTask(id){
  const numId = parseInt(id);
  const t = tasks.find(x=>x.id===numId);
  if(!t) return;
  openProjectBoard(t.id);
}

function renderTasksOverview(){
  updateTrashBadge();
  renderPendingSummary();
  const fp=(document.getElementById('tkFilterPerson')||{}).value||'';
  // Member filter: Hải/Hiếu only see their tasks
  const memberFilter = currentMember==='admin'?'':currentMember==='hai'?'Hải':currentMember==='hieu'?'Hiếu':'';
  // Populate type filter options
  const typeSelTk = document.getElementById('tkFilterType');
  if(typeSelTk){
    const types = [...new Set(tasks.map(t=>t.type).filter(Boolean))].sort();
    const curType = typeSelTk.value;
    typeSelTk.innerHTML = '<option value="">🏷️ Tất cả loại</option>' + types.map(t=>`<option value="${t}" ${t===curType?'selected':''}>${t}</option>`).join('');
  }
  const fType=(document.getElementById('tkFilterType')||{}).value||'';
  const fDate=(document.getElementById('tkFilterDate')||{}).value||'';
  const fPri=(document.getElementById('tkFilterPriority')||{}).value||'';
  const fStatus=(document.getElementById('tkFilterStatus')||{}).value||'';
  const today2=todayVN();
  let list = tasks.filter(t=>{
    if(memberFilter && t.person!==memberFilter) return false;
    if(fp && t.person!==fp) return false;
    if(currentMember==='hai' && t.team==='Team 02') return false;
    if(fType && (t.type||'')!==fType) return false;
    // Date filter
    if(fDate){
      if(fDate==='today' && t.deadline!==today2) return false;
      if(fDate==='week'){ if(!t.deadline||t.deadline<today2||t.deadline>addDays(today2,7)) return false; }
      if(fDate==='overdue'){ if(!t.deadline||t.deadline>=today2) return false; }
      if(fDate==='no_deadline' && t.deadline) return false;
    }
    // Priority filter
    if(fPri && (t.priority||'Bình thường')!==fPri) return false;
    // Status filter
    if(fStatus){
      const isDone2 = calcProjectProgress(t)>=100||calcTaskAutoStatus(t)==='Hoàn thành';
      const isPending2 = !!t.pendingReason;
      const isOverdue2 = !isDone2&&t.deadline&&t.deadline<today2;
      if(fStatus==='done' && !isDone2) return false;
      if(fStatus==='active' && (isDone2||isPending2)) return false;
      if(fStatus==='pending' && !isPending2) return false;
      if(fStatus==='overdue' && !isOverdue2) return false;
    }
    return true;
  });
  const grid = document.getElementById('projectGrid');
  const empty = document.getElementById('emptyProjects');
  if(!list.length){grid.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';

  // Group by: has deadline vs no deadline
  const withDeadline = list.filter(t=>t.deadline);
  const noDeadline   = list.filter(t=>!t.deadline);

  const renderRow = t => {
    const pct = calcProjectProgress(t);
    const pcolor = pct>=100?'#27ae60':pct>=50?'#2980b9':'#e67e22';
    const age = daysSince(t.from);
    const ageLabel = age===0?'Hôm nay':age===1?'Hôm qua':`${age} ngày trước`;
    const cols = getProjectCols(t);
    const lastCol = cols[cols.length-1];
    const doneCards = (t.cards||[]).filter(c=>c.colId===lastCol.id||c.colId==='done').length;
    const totalCards = (t.cards||[]).length;
    const isDone = pct>=100 || calcTaskAutoStatus(t)==='Hoàn thành';
    const isPendingTask = !!t.pendingReason;
    const priClass = t.priority==='Cao'?'priority-cao':t.priority==='Thấp'?'priority-thap':'priority-binh';
    const priBadge = t.priority==='Cao'
      ? '<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#fdf2f2;color:#e74c3c;border:1px solid #f5c6c6;font-weight:600">🔴 Cao</span>'
      : t.priority==='Thấp'
      ? '<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f0faf4;color:#27ae60;border:1px solid #a8deba;font-weight:600">🟢 Thấp</span>'
      : '<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#fff4e5;color:#e67e22;border:1px solid #fce0b0;font-weight:600">🟠 Bình thường</span>';
    return `<div class="task-row ${isDone?'task-row-done':''} ${priClass}${isPendingTask?' task-row-pending':''}" style="display:flex;align-items:center;gap:0;${isPendingTask?'border-left:3px solid #e67e22 !important;':''}" data-tid="${t.id}" onclick="event.stopPropagation()">

      <div style="padding:0 6px;flex-shrink:0" onclick="event.stopPropagation()">
        <input type="checkbox" class="task-chk" data-tid="${t.id}" onchange="onTaskCheck(${t.id},this)"
          style="width:16px;height:16px;cursor:pointer;accent-color:var(--red)">
      </div>
      <div style="flex:1;min-width:0;cursor:pointer" onclick="event.stopPropagation();openTask(${t.id})">
        <div class="task-row-main">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            <span class="badge ${TASK_TYPE_COLORS[t.type]||'badge-gray'}" style="font-size:10px">${t.type}</span>
            ${priBadge}
            ${getTaskStatusBadge(t)}
            ${t.person?`<span class="tag-person ${t.person==='Hải'?'tag-hai':t.person==='Hiếu'?'tag-hieu':''}" style="font-size:10px">${t.person}</span>`:''}
            ${t.team==='Team 02'?'<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#f0f0f0;color:#555">Team 2</span>':''}
            <span style="font-weight:600;font-size:13px${isDone?';text-decoration:line-through;color:var(--text-muted)':''}">${t.name}</span>
          </div>
          ${isPendingTask?`<div style="font-size:11px;color:#e67e22;margin-top:3px">⏸ Pending: ${(t.pendingReason||'').slice(0,80)}</div>`:''}
          ${t.desc?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.4">${t.desc.slice(0,100)}${t.desc.length>100?'…':''}</div>`:''}
        </div>
        <div class="task-row-meta">
          <span style="font-size:11px;color:var(--text-muted)" title="Nhận ${t.from?fmtDate(t.from):'?'}">📅 ${ageLabel}</span>
          ${t.deadline
            ?`<span style="font-size:11px">${daysLeft(t.deadline)||`<span style='color:var(--text-muted);font-size:11px'>DL: ${fmtDate(t.deadline)}</span>`}</span>`
            :'<span style="font-size:11px;color:var(--gray-border)">Không có deadline</span>'}
          ${totalCards?`<span style="font-size:11px;color:var(--text-muted)">${doneCards}/${totalCards} thẻ</span>`:''}
          <div style="display:flex;align-items:center;gap:5px;min-width:80px">
            <div style="flex:1;height:5px;background:var(--gray-border);border-radius:3px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${pcolor};border-radius:3px"></div>
            </div>
            <span style="font-size:11px;color:var(--text-muted);min-width:28px">${pct}%</span>
          </div>
        </div>
      </div>

      <button onclick="event.stopPropagation();openTaskPendingModal(${t.id})" title="${isPendingTask?'Sửa / xoá pending':'Pending task này'}"
        class="${isPendingTask?'btn-pending-active':''}"
        style="cursor:pointer;font-size:11px;flex-shrink:0">⏸</button>
      ${(currentMember==='admin'||currentMember==='hieu')?`<button onclick="event.stopPropagation();openGiaoViecFromTask(${t.id})" title="Giao việc này"
        style="cursor:pointer;font-size:11px;font-weight:600;flex-shrink:0">📤 Giao</button>`:''}
      <button onclick="event.stopPropagation();confirmDeleteTask(${t.id})" title="Xoá task"
        style="cursor:pointer;font-size:15px;flex-shrink:0">🗑</button>
    </div>`;
  };

  // Separate done vs active
  const isTaskDone = t => calcProjectProgress(t)>=100 || calcTaskAutoStatus(t)==='Hoàn thành';
  const activeList = list.filter(t=>!isTaskDone(t));
  const doneList   = list.filter(t=>isTaskDone(t));

  const withDeadlineActive = activeList.filter(t=>t.deadline);
  const noDeadlineActive   = activeList.filter(t=>!t.deadline);

  let html = '';
  if(withDeadlineActive.length){
    const sorted = [...withDeadlineActive].sort((a,b)=>a.deadline.localeCompare(b.deadline));
    html += `<div class="task-group-label">&#128198; Có deadline <span style="font-size:11px;font-weight:400;color:var(--text-muted)">(${sorted.length})</span></div>`;
    html += sorted.map(renderRow).join('');
  }
  if(noDeadlineActive.length){
    html += `<div class="task-group-label" style="margin-top:${withDeadlineActive.length?16:0}px">&#8734; Không có deadline <span style="font-size:11px;font-weight:400;color:var(--text-muted)">(${noDeadlineActive.length})</span></div>`;
    html += noDeadlineActive.map(renderRow).join('');
  }

  // Done section — collapsible
  if(doneList.length){
    const doneOpen = (localStorage.getItem('tk_done_open')||'0')==='1';
    html += `<div onclick="toggleTaskDoneSection()" style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;background:#f0faf4;border-top:2px solid #a8deba;border-radius:6px;margin-top:16px;user-select:none">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#27ae60">✅ Đã hoàn thành (${doneList.length})</span>
      <span id="tkDoneChevron" style="font-size:11px;color:#27ae60;margin-left:auto;transition:transform .2s;display:inline-block;transform:${doneOpen?'rotate(180deg)':'rotate(0deg)'}">▼</span>
    </div>`;
    if(doneOpen){
      html += `<div id="tkDoneList">${doneList.map(renderRow).join('')}</div>`;
    } else {
      html += `<div id="tkDoneList" style="display:none"></div>`;
    }
  }

  grid.innerHTML = html;
  initTaskGridDrag();
  updateNavBadges();
}

function toggleTaskDoneSection(){
  const cur = (localStorage.getItem('tk_done_open')||'0')==='1';
  localStorage.setItem('tk_done_open', cur?'0':'1');
  renderTasksOverview();
}

function openProjectBoard(id){
  currentProjectId = id;
  try{ sessionStorage.setItem('wt_activeProject', String(id)); } catch(e){}
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  document.getElementById('tasksOverview').style.display='none';
  document.getElementById('taskSubBoard').style.display='block';
  document.querySelector('main').classList.add('board-mode');
  document.getElementById('subBoardTitle').textContent = t.name;
  const pEl = document.getElementById('subBoardPerson');
  pEl.innerHTML = t.person?`<span class="tag-person ${t.person==='Hải'?'tag-hai':t.person==='Hiếu'?'tag-hieu':''}" style="font-size:12px">${t.person}</span>`:'';
  renderSubBoard(t);
}

function backToOverview(){
  currentProjectId=null;
  _selectedCardIds.clear();
  try{ sessionStorage.removeItem('wt_activeProject'); } catch(e){}
  document.getElementById('taskSubBoard').style.display='none';
  document.getElementById('tasksOverview').style.display='block';
  document.querySelector('main').classList.remove('board-mode');
  renderTasksOverview();
}

// ---- SUB KANBAN BOARD ----
function renderSubBoard(task){
  const board = document.getElementById('subKanbanBoard');
  const cols = getProjectCols(task);
  board.innerHTML='';
  cols.forEach(col=>{
    const cards = (task.cards||[]).filter(c=>{
      if(col.id==='col_new'){
        return c.colId==='col_new' || c.colId==='todo' || !c.colId;
      }
      return c.colId===col.id;
    });
    const colEl = document.createElement('div');
    colEl.style.cssText=`flex:0 0 220px;background:var(--gray-light);border-radius:10px;padding:10px;border-top:3px solid ${col.color};min-height:200px;max-height:calc(100vh - 180px);display:flex;flex-direction:column;overflow:hidden`;
    colEl.dataset.colId = col.id;

    const isPending = col.id==='pending' || col.id==='col_pending';
    colEl.innerHTML=`
      <div class="kb-col-header">
        <span class="kb-col-title" style="color:${col.color}">${col.label}</span>
        <span class="kb-col-count">${cards.length}</span>
      </div>
      <div class="kb-cards" id="subcards-${col.id}" style="overflow-y:auto;flex:1"></div>
      <button class="kb-add-btn" onclick="openAddCardModal('${col.id}')">&#43; Thêm thẻ</button>`;

    colEl.addEventListener('dragover',e=>{e.preventDefault();colEl.style.background='#fde8e8';});
    colEl.addEventListener('dragleave',()=>colEl.style.background='var(--gray-light)');
    colEl.addEventListener('drop',e=>{
      e.preventDefault();colEl.style.background='var(--gray-light)';
      if(!dragCardId) return;
      if(isPending){
        pendingDragCard={cardId:dragCardId,colId:col.id,taskId:task.id};
        const card = (task.cards||[]).find(c=>c.id===dragCardId);
        document.getElementById('pendingReason').value=card?.pendingReason||'';
        document.getElementById('pendingModal').classList.add('open');
      } else {
        const card=(task.cards||[]).find(c=>c.id===dragCardId);
        if(card){card.colId=col.id;delete card.pendingReason;}
        saveAppData();
        renderSubBoard(task);
        renderTasksOverview();
        toast('Đã chuyển thẻ');
      }
      dragCardId=null;
    });
    board.appendChild(colEl);

    const cardsEl=document.getElementById('subcards-'+col.id);
    cards.forEach(card=>{
      const isLastCol = col.id===cols[cols.length-1].id || col.id==='done';
      const nextCol = !isLastCol ? cols[cols.findIndex(c=>c.id===col.id)+1] : null;
      // Wrapper row: [select] [card] [done tick]
      const rowEl = document.createElement('div');
      rowEl.style.cssText='display:flex;align-items:center;gap:5px;margin-bottom:8px';

      // Left: select checkbox
      const selWrap = document.createElement('div');
      selWrap.style.cssText='flex-shrink:0;width:18px;display:flex;align-items:center;justify-content:center';
      selWrap.innerHTML=`<input type="checkbox" class="card-chk" data-cardid="${card.id}" data-taskid="${task.id}"
        style="cursor:pointer;accent-color:var(--red);width:14px;height:14px"
        onchange="onCardCheck(event)">`;

      // Center: card body
      const cardEl=document.createElement('div');
      cardEl.className='kb-card';
      cardEl.style.cssText='margin-bottom:0;flex:1;min-width:0;position:relative';
      cardEl.draggable=true;
      cardEl.innerHTML=`
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;min-width:0;overflow:hidden">
            <div style="font-size:13px;font-weight:500;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isLastCol?'text-decoration:line-through;color:var(--text-muted)':''}">
              ${task.dang==='url' ? wsInlineIcon(card.name) : ''}<span class="kb-card-name" style="cursor:pointer" onclick="event.stopPropagation();openAddCardModal('${col.id}','${card.id}')" title="${(card.name||'').replace(/"/g,'&quot;')}">${card.name}</span>
            </div>
            ${card.desc?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" onclick="event.stopPropagation();openAddCardModal('${col.id}','${card.id}')">${card.desc}</div>`:''}
            ${card.pendingReason?`<div class="kb-card-pending">\u2759\u2759 ${card.pendingReason}</div>`:''}
          </div>
          ${task.dang==='url'?`
            <button class="kb-ws-menu-btn" onclick="event.stopPropagation();toggleWsExpand('${card.id}',this)" title="Xem thêm">▼</button>
          `:''}
        </div>
        ${task.dang==='url'?`<div class="kb-ws-expand" id="wsexp-${card.id}">${wsCardExpandItems(card.name)}</div>`:''}
        <!-- Tooltip data only, rendered globally -->
        <span class="kb-card-tooltip-data" data-name="${(card.name||'').replace(/"/g,'&quot;').replace(/`/g,'&#96;')}" data-desc="${(card.desc||'').replace(/"/g,'&quot;').replace(/`/g,'&#96;')}" style="display:none"></span>`;

      // Right: done/next tick
      const tickWrap = document.createElement('label');
      tickWrap.title = nextCol ? '→ '+nextCol.label : 'Hoàn thành';
      tickWrap.style.cssText='flex-shrink:0;width:32px;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;opacity:.5;transition:opacity .15s';
      tickWrap.onmouseover=()=>tickWrap.style.opacity='1';
      tickWrap.onmouseout=()=>tickWrap.style.opacity='.5';
      tickWrap.innerHTML=`
        <input type="checkbox" ${isLastCol?'checked':''} style="cursor:pointer;accent-color:var(--red);width:14px;height:14px"
          onchange="moveCardByCheck(event,${task.id},'${card.id}','${col.id}')" onclick="event.stopPropagation()">
        <span style="font-size:8px;color:var(--text-muted);line-height:1.1;text-align:center">${nextCol?nextCol.label.slice(0,5):'Done'}</span>`;

      rowEl.appendChild(selWrap);
      rowEl.appendChild(cardEl);
      rowEl.appendChild(tickWrap);

      cardEl.addEventListener('dragstart',e=>{e.stopPropagation();dragCardId=card.id;setTimeout(()=>cardEl.classList.add('dragging'),0);});
      cardEl.addEventListener('dragend',()=>cardEl.classList.remove('dragging'));
      cardEl.addEventListener('mouseenter',e=>{
        const data=cardEl.querySelector('.kb-card-tooltip-data');
        if(!data) return;
        const name=data.dataset.name, desc=data.dataset.desc;
        if(!name && !desc) return;
        showKbTooltip(e, name, desc);
      });
      cardEl.addEventListener('mousemove',e=>moveKbTooltip(e));
      cardEl.addEventListener('mouseleave',()=>hideKbTooltip());
      cardsEl.appendChild(rowEl);
    });
  });
}

function calcTaskAutoStatus(task){
  const cols = getProjectCols(task);
  const cards = task.cards || [];
  if(!cards.length) return task.status || 'Chưa làm';
  const firstColId = cols[0].id;
  const lastColId  = cols[cols.length-1].id;
  const pendingColIds = new Set(cols.filter(c=>c.id==='pending'||c.id==='col_pending'||c.label.toLowerCase().includes('pending')).map(c=>c.id));
  // Done: all cards in last col
  if(cards.every(c=>c.colId===lastColId||c.colId==='done')) return 'Hoàn thành';
  // Pending if task itself is pending
  if(task.pendingReason) return 'Pending';
  // Chưa làm: all cards still in first col (or todo)
  if(cards.every(c=>c.colId===firstColId||c.colId==='todo')) return 'Chưa làm';
  // At least 1 card moved out of first col
  return 'Đang làm';
}

function getTaskStatusBadge(t){
  const s = t.pendingReason ? 'Pending task' : calcTaskAutoStatus(t);
  if(s==='Hoàn thành') return '<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f0faf4;color:#27ae60;border:1px solid #a8deba;font-weight:600">✅ Hoàn thành</span>';
  if(s==='Đang làm')  return '<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f0f7fd;color:#2980b9;border:1px solid #b8d4ea;font-weight:600">🔄 Đang làm</span>';
  if(s==='Pending task') return '<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#fff8ee;color:#e67e22;border:1px solid #fce0b0;font-weight:600">⏸ Pending</span>';
  return '<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f8f9fa;color:#6c757d;border:1px solid #dee2e6;font-weight:600">🕐 Chưa làm</span>';
}

function moveCardByCheck(event, taskId, cardId, currentColId){
  event.stopPropagation();
  const task = tasks.find(t=>t.id===taskId);
  if(!task) return;
  const cols = getProjectCols(task);
  const card = task.cards.find(c=>c.id===cardId);
  if(!card) return;
  const curIdx = cols.findIndex(c=>c.id===currentColId);
  const nextCol = cols[curIdx+1];
  if(!nextCol){
    // Already last col — uncheck moves back
    if(!event.target.checked && curIdx>0) card.colId=cols[curIdx-1].id;
    saveAppData();
    renderSubBoard(task); renderTasksOverview(); return;
  }
  if(nextCol.id==='pending' || nextCol.id==='col_pending'){
    // Going to pending needs reason
    event.target.checked=false;
    pendingDragCard={cardId,colId:nextCol.id,taskId};
    document.getElementById('pendingReason').value=card.pendingReason||'';
    document.getElementById('pendingModal').classList.add('open');
  } else {
    card.colId=nextCol.id;
    if(card.pendingReason) delete card.pendingReason;
    saveAppData();
    renderSubBoard(task);
    renderTasksOverview();
    toast(`→ ${nextCol.label}`);
  }
}


function openNewProjectModal(){
  editingProjectId=null;
  document.getElementById('npmTitle').textContent='+ Thêm task mới';
  document.getElementById('npm_name').value='';
  populateTaskTypeSelect('npm_type', 'Nội dung');
  // Person: auto-fill from member
  const npmPerson=document.getElementById('npm_person');
  if(npmPerson){
    npmPerson.value = currentMember==='hai'?'Hải':currentMember==='hieu'?'Hiếu':'';
    npmPerson.disabled = currentMember!=='admin';
  }
  const pri=document.getElementById('npm_priority'); if(pri) pri.value='Bình thường';
  const dang0=document.getElementById('npm_dang'); if(dang0) dang0.value='url';
  document.getElementById('npm_from').value=todayVN();
  document.getElementById('npm_deadline').value='';
  document.getElementById('npm_desc').value='';
  document.getElementById('npm_steps').value='';
  const _rec=document.getElementById('npm_recurring'); if(_rec){_rec.checked=false;}
  const _rf=document.getElementById('npm_recurring_fields'); if(_rf) _rf.style.display='none';
  // Team
  const teamSel=document.getElementById('npm_team'); if(teamSel) teamSel.value='Team 01';
  const teamRow=document.getElementById('npm_team_row');
  if(teamRow) teamRow.style.display = currentMember==='hai'?'none':'block';
  document.getElementById('npm_delete_btn').style.display='none';
  document.getElementById('newProjectModal').classList.add('open');
  setTimeout(()=>document.getElementById('npm_name').focus(),100);
}

function openEditProjectModal(){
  const t=tasks.find(x=>x.id===currentProjectId);
  if(!t) return;
  editingProjectId=t.id;
  document.getElementById('npmTitle').textContent='✎ Sửa task';
  document.getElementById('npm_name').value=t.name;
  const npmPerson=document.getElementById('npm_person');
  if(npmPerson){ npmPerson.value=t.person||''; npmPerson.disabled=(currentMember!=='admin'); }
  populateTaskTypeSelect('npm_type', t.type||'Nội dung');
  const pri=document.getElementById('npm_priority'); if(pri) pri.value=t.priority||'Bình thường';
  const dang=document.getElementById('npm_dang'); if(dang) dang.value=t.dang||'text';
  document.getElementById('npm_from').value=t.from||'';
  document.getElementById('npm_deadline').value=t.deadline||'';
  document.getElementById('npm_desc').value=t.desc||'';
  const teamSel=document.getElementById('npm_team'); if(teamSel) teamSel.value=t.team||'Team 01';
  const teamRow=document.getElementById('npm_team_row'); if(teamRow) teamRow.style.display=currentMember==='hai'?'none':'block';
  const midSteps = t.cols&&t.cols!==DEFAULT_COLS ? t.cols.filter(c=>c.id!=='col_new'&&c.id!=='col_pending'&&c.id!=='done'&&c.id!=='todo') : [];
  document.getElementById('npm_steps').value=midSteps.map(c=>c.label).join('\n');
  // Recurring fields
  const recEl=document.getElementById('npm_recurring');
  if(recEl){ recEl.checked=!!t.recurring; document.getElementById('npm_recurring_fields').style.display=t.recurring?'grid':'none'; }
  if(t.recurring){ const rt=document.getElementById('npm_recur_type'); if(rt) rt.value=t.recurring.type||'weekly'; const rd=document.getElementById('npm_recur_days'); if(rd) rd.value=t.recurring.days||7; }
  document.getElementById('npm_delete_btn').style.display='inline-flex';
  document.getElementById('newProjectModal').classList.add('open');
  setTimeout(()=>document.getElementById('npm_name').focus(),100);
}

function closeNewProjectModal(){document.getElementById('newProjectModal').classList.remove('open');}

function parseSteps(stepsText) {
  if (!stepsText) stepsText = '';
  const systemLabels = ['chưa làm', 'đang làm', 'hoàn thành', 'pending', 'bước đang làm'];
  const lines = stepsText.trim().split('\n')
    .map(l => l.trim())
    .filter(l => l && !systemLabels.includes(l.toLowerCase()));

  const midCols = lines.map((l, i) => {
    const label = l.replace(/^(b.{0,4}c\s*\d+|step\s*\d+|\d+)\s*[:.)]\s*/i, '').trim() || l;
    return {
      id: 'col_s' + i,
      label: label || ('Bước ' + (i + 1)),
      color: ['#8e44ad', '#16a085', '#d35400', '#c0392b', '#2c3e50', '#2980b9'][i % 6]
    };
  });

  return [
    { id: 'col_new', label: 'Chưa làm', color: '#95a5a6' },
    { id: 'doing',   label: 'Đang làm',  color: '#2980b9' },
    ...midCols,
    { id: 'done',    label: 'Hoàn thành', color: '#27ae60' },
    { id: 'col_pending', label: 'Pending', color: '#e67e22' }
  ];
}



// ===== RECURRING TASKS =====
let recurringTasks = [];
let recurNextId = 1;

function saveRecurring(){
  saveAppData();
}


// ===== TASK TYPES MANAGEMENT =====
const DEFAULT_TASK_TYPES = ['Nội dung','SEO','Thiết kế','Kỹ thuật','Marketing','Khác'];
function getTaskTypes(){
  try{ return JSON.parse(localStorage.getItem('wt_task_types')||'null') || DEFAULT_TASK_TYPES; }catch(e){ return DEFAULT_TASK_TYPES; }
}
function saveTaskTypes(types){ localStorage.setItem('wt_task_types', JSON.stringify(types)); }

function populateTaskTypeSelect(selId, currentVal){
  const sel = document.getElementById(selId);
  if(!sel) return;
  const types = getTaskTypes();
  sel.innerHTML = types.map(t=>`<option ${t===currentVal?'selected':''}>${t}</option>`).join('');
}

function openTaskTypeManager(){
  const types = getTaskTypes();
  const overlay = document.createElement('div');
  overlay.id = 'taskTypeModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.2);width:360px">
    <div style="font-weight:700;font-size:15px;margin-bottom:14px">⚙ Quản lý loại task</div>
    <div id="ttList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
      ${types.map((t,i)=>`<div style="display:flex;align-items:center;gap:8px">
        <input type="text" value="${t}" data-idx="${i}" class="tt-input" style="flex:1;border:1px solid var(--gray-border);border-radius:6px;padding:5px 8px;font-size:13px">
        <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:16px">×</button>
      </div>`).join('')}
    </div>
    <button onclick="ttAddRow()" class="btn btn-sm btn-outline" style="width:100%;margin-bottom:12px">+ Thêm loại</button>
    <div style="display:flex;justify-content:space-between">
      <button onclick="document.getElementById('taskTypeModal').remove()" class="btn btn-outline">Huỷ</button>
      <button onclick="saveTaskTypeManager()" class="btn btn-primary">✓ Lưu</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

function ttAddRow(){
  const ttList = document.getElementById('ttList');
  if(!ttList) return;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px';
  row.innerHTML = '<input type="text" class="tt-input" style="flex:1;border:1px solid var(--gray-border);border-radius:6px;padding:5px 8px;font-size:13px" placeholder="Tên loại mới...">'
    + '<button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:16px">×</button>';
  ttList.appendChild(row);
  row.querySelector('input').focus();
}

function saveTaskTypeManager(){
  const inputs = document.querySelectorAll('#ttList .tt-input');
  const types = [...inputs].map(i=>(i.value||'').trim()).filter(Boolean);
  if(!types.length){ toast('Cần ít nhất 1 loại!','#e74c3c'); return; }
  saveTaskTypes(types);
  document.getElementById('taskTypeModal').remove();
  // Refresh selects
  const cur = document.getElementById('npm_type')?.value;
  populateTaskTypeSelect('npm_type', cur);
  const curRm = document.getElementById('rm_type')?.value;
  if(document.getElementById('rm_type')) populateTaskTypeSelect('rm_type', curRm);
  toast('✓ Đã lưu loại task');
}


// ===== WEBSITE TRACKING =====
let siteTracking = []; // [{wsId, entries:[{id,date,rank,backlinks,indexed,note}]}]
let _wstSelectedWsId = null;

let wtApiKey = localStorage.getItem('wt_valueserp_api_key') || '';
let wtSerperCredits = parseInt(localStorage.getItem('wt_serper_credits_left')) || 0;
function openWstApiSettings() {
  const overlay = document.createElement('div');
  overlay.id = 'wstApiModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;width:400px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
    <div style="font-weight:700;font-size:15px;margin-bottom:8px">🔑 Thiết lập API Serper.dev</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.5">Nhập API Key cung cấp bởi <a href="https://serper.dev" target="_blank" style="color:var(--blue)">Serper.dev</a>. Đăng ký mới sẽ được tặng ngay 2.500 lượt miễn phí.</div>
    <div class="form-group" style="margin-bottom:12px"><label>Serper.dev API Key</label>
      <input type="text" id="wstApiInput" value="${wtApiKey}" style="width:100%" placeholder="Nhập API Key...">
    </div>
    <div class="form-group" style="margin-bottom:16px"><label>Số dư Token hiện hành</label>
      <div style="font-size:11px;color:#aaa;margin-bottom:4px">Nhập "Credits left" trên web Serper để bảng đếm ngược trừ lùi giúp bạn mỗi khi quét.</div>
      <input type="number" id="wstApiCreditsInput" value="${wtSerperCredits}" style="width:100%" placeholder="Vd: 2500">
    </div>
    <hr style="border:0; border-top:1px solid var(--gray-border); margin:15px 0;">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#2980b9">🤖 Báo cáo Telegram (Auto Check Rank)</div>
    <div class="form-group" style="margin-bottom:12px"><label>Bot Token</label>
      <input type="password" id="wstTeleToken" value="${localStorage.getItem('tele_token_rank') || ''}" style="width:100%" placeholder="Nhập Bot Token...">
    </div>
    <div class="form-group" style="margin-bottom:16px"><label>Chat ID</label>
      <div style="display:flex;gap:6px">
        <input type="text" id="wstTeleChatId" value="${localStorage.getItem('tele_chat_id_rank') || ''}" style="flex:1" placeholder="Nhập Chat ID...">
        <button onclick="testTeleRank()" class="btn btn-sm btn-outline" style="border-color:var(--success);color:var(--success)">🔔 Test</button>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between">
      <button onclick="document.getElementById('wstApiModal').remove()" class="btn btn-outline">Huỷ</button>
      <button onclick="saveWstApiSettings()" class="btn btn-primary">✓ Lưu</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function sendToTelegramRank(msg) {
    const t = localStorage.getItem('tele_token_rank'), c = localStorage.getItem('tele_chat_id_rank');
    if(!t || !c) return false;
    try {
        const res = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: c, text: msg, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        return res.ok;
    } catch(e) { return false; }
}

async function testTeleRank() {
    const tInput = document.getElementById('wstTeleToken').value.trim();
    const cInput = document.getElementById('wstTeleChatId').value.trim();
    if(!tInput || !cInput) { alert("Vui lòng điền đủ Token và Chat ID trước khi test!"); return; }
    
    // Tạm thời lưu để test
    const oldT = localStorage.getItem('tele_token_rank'), oldC = localStorage.getItem('tele_chat_id_rank');
    localStorage.setItem('tele_token_rank', tInput);
    localStorage.setItem('tele_chat_id_rank', cInput);
    
    const ok = await sendToTelegramRank('<b>🔔 Test thành công!</b>\nTool Quản lý công việc đã kết nối được với Telegram của sếp.');
    if(ok) alert("✅ Bot đã gửi tin nhắn test thành công! Sếp kiểm tra Telegram nhé.");
    else {
        alert("❌ Lỗi! Sếp kiểm tra lại Token hoặc Chat ID xem đúng chưa nhé.");
        // Khôi phục nếu lỗi
        if(oldT) localStorage.setItem('tele_token_rank', oldT); else localStorage.removeItem('tele_token_rank');
        if(oldC) localStorage.setItem('tele_chat_id_rank', oldC); else localStorage.removeItem('tele_chat_id_rank');
    }
}
function saveWstApiSettings() {
  wtApiKey = document.getElementById('wstApiInput').value.trim();
  wtSerperCredits = parseInt(document.getElementById('wstApiCreditsInput').value) || 0;
  localStorage.setItem('wt_valueserp_api_key', wtApiKey);
  localStorage.setItem('wt_serper_credits_left', wtSerperCredits);
  
  localStorage.setItem('tele_token_rank', document.getElementById('wstTeleToken').value.trim());
  localStorage.setItem('tele_chat_id_rank', document.getElementById('wstTeleChatId').value.trim());
  
  document.getElementById('wstApiModal').remove();
  toast('✓ Đã lưu cấu hình API & Telegram');
  wstUpdateAPIUsage();
}

async function wstUpdateAPIUsage() {
    if(!wtApiKey) return;
    try {
        const bdg = document.getElementById('wstApiBadge');
        if(!bdg) return;
        bdg.style.display='inline-block';
        if(wtSerperCredits > 0) bdg.innerText = `💎 Tokens: ${wtSerperCredits}`;
        else bdg.innerText = `💎 Serper: Đang kiểm tra...`;

        const urls = ['https://google.serper.dev/account', 'https://api.serper.dev/account'];
        for(let u of urls) {
            try {
                const res = await fetch(u, { headers: { 'X-API-KEY': wtApiKey } });
                if(res.ok) {
                    const data = await res.json();
                    let bestVal = data.credits_remaining || data.creditsLeft || data.available || data.remaining || data.creditsRemaining || data.balance;
                    if(bestVal !== undefined) {
                        wtSerperCredits = parseInt(bestVal);
                        localStorage.setItem('wt_serper_credits_left', wtSerperCredits);
                        bdg.innerText = `💎 Tokens: ${wtSerperCredits}`;
                        break;
                    }
                }
            } catch(e2) {}
        }
    }catch(e){}
}

function wstSaveKeyword(wsId, kw) {
  let site = getWstSite(wsId);
  if(!site){ siteTracking.push({wsId,entries:[]}); site=getWstSite(wsId); }
  site.mainKeyword = kw;
  saveWsTrack();
}

async function wstFetchRank(wsId) {
  const w = websites.find(x => x.id === wsId);
  const site = getWstSite(wsId);
  
  // Từ khóa tìm kiếm mặc định lấy theo w.brand (của web gốc)
  const keyword = (site && site.mainKeyword) ? site.mainKeyword : (w ? w.brand : '');
  
  if(!w || !keyword) return {error: "Chua c\u00f3 t\u1eeb kh\u00f3a", keyword: ''};
  if(!wtApiKey) return {error: "Chua c\u00f3 API Key", keyword};

  const url = 'https://google.serper.dev/search';
  const headers = { 'X-API-KEY': wtApiKey, 'Content-Type': 'application/json' };
  
  const bodyD = JSON.stringify({ q: keyword, gl: 'vn', hl: 'vi', location: 'Vietnam', device: 'desktop', num: 100 });
  const bodyM = JSON.stringify({ q: keyword, gl: 'vn', hl: 'vi', location: 'Vietnam', device: 'mobile', num: 100 });
  
  try {
    const [resD, resM] = await Promise.all([
        fetch(url, { method: 'POST', headers, body: bodyD }),
        fetch(url, { method: 'POST', headers, body: bodyM })
    ]);
    const dataD = await resD.json();
    const dataM = await resM.json();
    
    if(dataD.message === "Unauthorized." || dataD.statusCode === 403) {
        return {error: "API Key bị sai hoặc đã hết lượt!"};
    }
    
    let costD = dataD.credits || 0;
    let costM = dataM.credits || 0;
    if(dataD.organic && !costD) costD = 1;
    if(dataM.organic && !costM) costM = 1;
    
    let totalCost = costD + costM;
    if(totalCost > 0) {
        wtSerperCredits = Math.max(0, wtSerperCredits - totalCost);
        localStorage.setItem('wt_serper_credits_left', wtSerperCredits);
        wstUpdateAPIUsage();
    }
    
    // Find rank by matching url domain (or its latest 301 target)
    // If w.is301=true, w.url is already the 301 target URL - use it directly
    // Otherwise find child 301 websites whose sourceUrl = w.url
    let targetUrl = w.url;
    if(!w.is301) {
      const kids = websites.filter(x=>x.is301&&x.sourceUrl&&((x.sourceUrl===w.url||x.sourceUrl===(w.url||'').replace(/\/$/,'')) || (x.sourceUrl===w.brand)));
      const latest301 = kids.length ? kids[kids.length-1] : null;
      if(latest301) targetUrl = latest301.url || latest301.sourceUrl || w.url;
    }
    const cleanMainDom = (targetUrl||'').replace(/^https?:\/\//,'').replace(/\/(.*)$/,'').toLowerCase();
    
    let rankD = null;
    if(dataD.organic) {
      for(let res of dataD.organic) {
        if((res.link||'').toLowerCase().includes(cleanMainDom)) {
          rankD = res.position;
          break;
        }
      }
    }
    
    let rankM = null;
    if(dataM.organic) {
      for(let res of dataM.organic) {
        if((res.link||'').toLowerCase().includes(cleanMainDom)) {
          rankM = res.position;
          break;
        }
      }
    }
    
    let finalRankStr = null;
    if(rankD && rankM) {
        if(rankD <= rankM) finalRankStr = rankD + " <span style='font-size:9px;color:var(--text-muted)'>(PC)</span>";
        else finalRankStr = rankM + " <span style='font-size:9px;color:var(--text-muted)'>(MB)</span>";
    } else if(rankD) {
        finalRankStr = rankD + " <span style='font-size:9px;color:var(--text-muted)'>(PC)</span>";
    } else if(rankM) {
        finalRankStr = rankM + " <span style='font-size:9px;color:var(--text-muted)'>(MB)</span>";
    }
    
    // auto save to latest entry or new entry for today
    const tbDay = todayVN();
    if(!site.entries) site.entries = [];
    const entries = site.entries.slice().sort((a,b)=>b.date.localeCompare(a.date));
    let last = entries[0];
    if(last && last.date === tbDay) {
      last.rank = finalRankStr || "Out 100";
    } else {
      site.entries.push({id:'wste'+Date.now(), date:tbDay, rank: finalRankStr || "Out 100", indexed:'', moBot:site.moBot||'Mở', note:''});
    }
    saveWsTrack();
    return {success: true, rank: finalRankStr || "Out 100", rankD, rankM, keyword};
  } catch(e) {
    return {error: "Lỗi kết nối API"};
  }
}

function wstFormatRankUI(rankStr) {
    if(!rankStr) return '<span style="color:var(--text-muted)">N/A</span>';
    if(typeof rankStr !== 'string') rankStr = rankStr.toString();
    if(rankStr === "Out 100") return '<span style="color:#7f8c8d;background:#f1f2f6;padding:2px 6px;border-radius:4px;font-size:11px">Out 100</span>';
    
    let isError = rankStr.includes('Lỗi') || rankStr.includes('API');
    if(isError) return rankStr; 

    let rawNum = parseInt(rankStr.replace(/<[^>]*>?/gm, ''));
    if(isNaN(rawNum)) return rankStr; 
    
    let deviceSuffix = rankStr.includes('MB') ? '(MB)' : rankStr.includes('PC') ? '(PC)' : '';
    
    let color = "#fff";
    let bg = "#95a5a6";
    if(rawNum >= 1 && rawNum <= 10) bg = "#27ae60"; // Green
    else if(rawNum >= 11 && rawNum <= 20) bg = "#2980b9"; // Blue
    else if(rawNum >= 21 && rawNum <= 50) bg = "#e67e22"; // Orange
    else if(rawNum >= 51 && rawNum <= 100) bg = "#7f8c8d"; // Gray

    return `<span style="background:${bg};color:${color};padding:2px 6px;border-radius:4px;font-weight:700;display:inline-block">${rawNum} <span style="font-size:9px;opacity:0.8">${deviceSuffix}</span></span>`;
}

async function wstBulkCheckRank() {
  const visibleRowCheckboxes = document.querySelectorAll('.wst-chk');
  if(!visibleRowCheckboxes.length) { toast("Không có web nào đang hiển thị trên bảng!"); return; }
  
  const visibleWsIds = Array.from(visibleRowCheckboxes).map(c => parseInt(c.dataset.id));
  const allTrackedWs = visibleWsIds.map(id => websites.find(w => w.id === id)).filter(Boolean);
  
  if(!wtApiKey) { toast("Vui lòng thiết lập ValueSERP API Key trước!", "#e74c3c"); openWstApiSettings(); return; }

  // Auto-init siteTracking entry for any newly tracked website
  allTrackedWs.forEach(w => {
    if(!getWstSite(w.id)) siteTracking.push({wsId: w.id, entries: []});
  });
  const targets = allTrackedWs.filter(w => {
    let targetW = w;
    if(!w.is301) {
      const kids = websites.filter(x=>x.is301&&x.sourceUrl&&((x.sourceUrl===w.url||x.sourceUrl===(w.url||'').replace(/\/$/,'')) || (x.sourceUrl===w.brand)));
      if(kids.length) targetW = kids[kids.length-1];
    }
    return (getWstSite(w.id)?.mainKeyword) || targetW.brand;
  });
  if(!targets.length) { toast("Không có web nào có Từ khóa (hoặc tên mặc định)!", "#e74c3c"); return; }
  
  window.wstCancelBulkCheck = false;
  const overlay = document.createElement('div');
  overlay.id = 'wstBulkOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;backdrop-filter:blur(4px);padding:20px;box-sizing:border-box';
  overlay.innerHTML = `
    <div style="font-size:24px;margin-bottom:12px;font-weight:700">🔄 Đang kiểm tra Rank phân luồng PC & Mobile...</div>
    <div id="wstBulkProgress" style="font-size:16px;margin-bottom:16px;font-weight:600;color:#f39c12">Đang khởi động hệ thống...</div>
    
    <div style="width:100%;max-width:900px;max-height:60vh;overflow-y:auto;background:#2c3e50;border-radius:8px;padding:0;margin-bottom:20px;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid #34495e">
      <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left">
        <thead style="position:sticky;top:0;background:#1a252f;z-index:10">
          <tr style="color:#bdc3c7">
            <th style="padding:12px;border-bottom:2px solid #34495e">Website</th>
            <th style="padding:12px;border-bottom:2px solid #34495e">Từ khóa chính</th>
            <th style="padding:12px;border-bottom:2px solid #34495e;text-align:center">Rank PC</th>
            <th style="padding:12px;border-bottom:2px solid #34495e;text-align:center">Rank Mobile</th>
            <th style="padding:12px;border-bottom:2px solid #34495e;text-align:center">Kết luận</th>
            <th style="padding:12px;border-bottom:2px solid #34495e;text-align:center">T.Thái</th>
          </tr>
        </thead>
        <tbody id="wstBulkTableBody">
        </tbody>
      </table>
    </div>
    
    <button onclick="window.wstCancelBulkCheck=true" class="btn" style="background:#e74c3c;color:#fff;border:none;padding:10px 20px;font-size:14px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 6px rgba(0,0,0,.2)">🛑 Dừng thao tác & Đóng lại</button>
  `;
  document.body.appendChild(overlay);

  let successCount = 0;
  let reportLines = [];
  for(let i=0; i<targets.length; i++) {
    if(window.wstCancelBulkCheck) {
        toast("🛑 Đã ngắt thao tác check rank!", "#e74c3c", 3000);
        break;
    }
    
    const w = targets[i];
    // Dò xem web này có URL 301 không
    let targetUrl = w.url || w.brand;
    if(!w.is301) {
      const kids = websites.filter(x=>x.is301&&x.sourceUrl&&((x.sourceUrl===w.url||x.sourceUrl===(w.url||'').replace(/\/$/,'')) || (x.sourceUrl===w.brand)));
      const latest301 = kids.length ? kids[kids.length-1] : null;
      if(latest301) targetUrl = latest301.url || latest301.sourceUrl || targetUrl;
    }
    
    document.getElementById('wstBulkProgress').innerText = `👉 Đang check: ${targetUrl} (${i+1}/${targets.length})`;
    
    // Thêm dòng mới vào UI bảng
    const tbodyBulk = document.getElementById('wstBulkTableBody');
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #34495e';
    const tkId = `br_tk_${w.id}`;
    const pcId = `br_pc_${w.id}`;
    const mbId = `br_mb_${w.id}`;
    const fnId = `br_fn_${w.id}`;
    const stId = `br_st_${w.id}`;
    
    // Từ khóa hiển thị tạm trước khi fetch
    const site = getWstSite(w.id);
    const tempKw = (site && site.mainKeyword) ? site.mainKeyword : w.brand;
    
    tr.innerHTML = `
      <td style="padding:12px">${targetUrl}</td>
      <td style="padding:12px;color:#f1c40f" id="${tkId}">${tempKw}</td>
      <td style="padding:12px;text-align:center" id="${pcId}">-</td>
      <td style="padding:12px;text-align:center" id="${mbId}">-</td>
      <td style="padding:12px;text-align:center" id="${fnId}">-</td>
      <td style="padding:12px;text-align:center" id="${stId}">⏳</td>
    `;
    if(tbodyBulk) {
        tbodyBulk.appendChild(tr);
        tr.scrollIntoView({behavior: 'smooth', block: 'end'});
    }
    
    const rankTd = document.getElementById('rank_td_' + w.id);
    if(rankTd) rankTd.innerHTML = '<span style="font-size:11px">⏳ Đang lấy...</span>';
    
    const res = await wstFetchRank(w.id);
    let rankText = "N/A";
    
    // Update bảng sau khi fetch xong
    const tdKw = document.getElementById(tkId);
    const tdPc = document.getElementById(pcId);
    const tdMb = document.getElementById(mbId);
    const tdFn = document.getElementById(fnId);
    const tdSt = document.getElementById(stId);
    
    if(res.keyword && tdKw) tdKw.innerText = res.keyword;
    
    if(res.error) {
       if(tdPc) tdPc.innerText = "Lỗi";
       if(tdMb) tdMb.innerText = "Lỗi";
       if(tdFn) tdFn.innerHTML = `<span style="color:#e74c3c">Lỗi API</span>`;
       if(tdSt) tdSt.innerText = "❌";
       
       // Cập nhật state thành lỗi để renderWsTrack giữ lại nội dung lỗi
       const tbDay = todayVN();
       let site = getWstSite(w.id);
       if(!site.entries) site.entries = [];
       const entries = site.entries.slice().sort((a,b)=>b.date.localeCompare(a.date));
       let last = entries[0];
       let errMsg = res.error.includes("lỗi") ? "Lỗi mạng" : "Lỗi API/Hết lượt";
       if(last && last.date === tbDay) {
         last.rank = `<span style="color:#e74c3c">${errMsg}</span>`;
       } else {
         site.entries.push({id:'wste'+Date.now(), date:tbDay, rank: `<span style="color:#e74c3c">${errMsg}</span>`, indexed:'', moBot:site.moBot||'Mở', note:''});
       }
       saveWsTrack();
       
       rankText = "Lỗi API";
       
       if(!res.error.includes("Lỗi kết nối API")) {
           toast("🛑 Dừng do lỗi: " + res.error, "#e74c3c", 5000);
           break;
       }
    } else {
       successCount++;
       if(tdPc) tdPc.innerText = res.rankD || "Out 100";
       if(tdMb) tdMb.innerText = res.rankM || "Out 100";
       if(tdFn) tdFn.innerHTML = res.rank || "Out 100";
       if(tdSt) tdSt.innerText = "✅";
       
       rankText = res.rank || "N/A";
       rankText = rankText.replace(/<[^>]*>?/gm, ''); // Xóa thẻ HTML (PC/MB)
       if(rankText.includes("Out 100")) rankText = "N/A";
    }
    
    let siteGoc = w.brand || w.url;
    let site301 = targetUrl; // targetUrl đã được tính toán ở trên (là link 301 nếu có)
    reportLines.push(`${siteGoc} -> ${site301} -> ${rankText.trim()}`);
    
    renderWsTrack();
    
    if(i < targets.length - 1 && !window.wstCancelBulkCheck) {
       await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  if(document.getElementById('wstBulkOverlay')) document.getElementById('wstBulkOverlay').remove();
  
  if(!window.wstCancelBulkCheck) {
      toast(`Hoàn thành check tự động! Thành công ${successCount}/${targets.length}`, "#27ae60", 4000);
      
      // Send Telegram Report
      if (reportLines.length > 0 && localStorage.getItem('tele_token_rank') && localStorage.getItem('tele_chat_id_rank')) {
          let teleMsg = `<b>📊 BÁO CÁO RANK WEBSITE</b>\n\n`;
          teleMsg += reportLines.join('\n');
          await sendToTelegramRank(teleMsg);
      }
  }
}

function saveWsTrack(){
  try{ localStorage.setItem('wt_site_tracking', JSON.stringify(siteTracking)); }catch(e){}
  // Push to Firebase in fbPayload via saveAppData
  saveAppData();
}


function getWstChecklist(){
  try{ return JSON.parse(localStorage.getItem('wst_checklist')||'null') || ['Dựng web','Content']; }catch(e){ return ['Dựng web','Content']; }
}
function saveWstChecklist(items){ localStorage.setItem('wst_checklist', JSON.stringify(items)); }

function openWstChecklistManager(){
  const items = getWstChecklist();
  const overlay = document.createElement('div');
  overlay.id = 'wstClModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;width:380px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
    <div style="font-weight:700;font-size:15px;margin-bottom:4px">⚙ Quản lý Checklist</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Kéo ☰ để sắp xếp thứ tự</div>
    <div id="wstClList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>
    <button onclick="wstClAddRow()" class="btn btn-sm btn-outline" style="width:100%;margin-bottom:12px">+ Thêm mục</button>
    <div style="display:flex;justify-content:space-between">
      <button onclick="document.getElementById('wstClModal').remove()" class="btn btn-outline">Huỷ</button>
      <button onclick="wstClSave()" class="btn btn-primary">✓ Lưu</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  // Build rows with drag handles
  const list = document.getElementById('wstClList');
  items.forEach(item => wstClMakeRow(list, item));
  wstClInitDrag(list);
}

function wstClMakeRow(list, value){
  const row = document.createElement('div');
  row.className = 'wst-cl-row';
  row.draggable = true;
  row.style.cssText = 'display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--gray-border);border-radius:6px;padding:3px 6px';
  row.innerHTML =
    '<span class="wst-cl-handle" style="cursor:grab;color:var(--text-muted);font-size:16px;padding:0 4px;user-select:none">☰</span>' +
    '<input type="text" value="'+(value||'')+'" class="wst-cl-input" style="flex:1;border:none;outline:none;padding:4px 0;font-size:13px" placeholder="Tên mục...">' +
    '<button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:16px;padding:0">×</button>';
  list.appendChild(row);
  if(value==='') row.querySelector('input').focus();
}

function wstClAddRow(){
  const list = document.getElementById('wstClList');
  if(!list) return;
  wstClMakeRow(list, '');
  wstClInitDrag(list);
}

function wstClInitDrag(list){
  let dragEl = null;
  list.querySelectorAll('.wst-cl-row').forEach(row=>{
    row.addEventListener('dragstart', e=>{ dragEl=row; setTimeout(()=>row.style.opacity='.4',0); });
    row.addEventListener('dragend', ()=>{ row.style.opacity='1'; dragEl=null; });
    row.addEventListener('dragover', e=>{ e.preventDefault(); if(dragEl&&dragEl!==row){ const rect=row.getBoundingClientRect(); const mid=rect.top+rect.height/2; if(e.clientY<mid) list.insertBefore(dragEl,row); else list.insertBefore(dragEl,row.nextSibling); } });
  });
}

function wstClSave(){
  const inputs = document.querySelectorAll('#wstClList .wst-cl-input');
  const items = [...inputs].map(i=>(i.value||'').trim()).filter(Boolean);
  if(!items.length){ toast('Cần ít nhất 1 mục!','#e74c3c'); return; }
  saveWstChecklist(items);
  document.getElementById('wstClModal').remove();
  renderWsTrack();
  toast('✓ Đã lưu checklist');
}

function getWstSite(wsId){
  return siteTracking.find(s=>s.wsId===wsId);
}


let _wstSelected = new Set();

function wstToggleSelect(wsId, cb){
  if(cb.checked) _wstSelected.add(wsId);
  else _wstSelected.delete(wsId);
  wstRenderBulkBar();
  const allCk = document.getElementById('wstSelectAll');
  if(allCk){
    const all = document.querySelectorAll('.wst-chk');
    allCk.checked = all.length && [...all].every(c=>c.checked);
  }
}

function wstToggleSelectAll(cb){
  document.querySelectorAll('.wst-chk').forEach(c=>{
    c.checked = cb.checked;
    const id = parseInt(c.dataset.id);
    if(cb.checked) _wstSelected.add(id); else _wstSelected.delete(id);
  });
  wstRenderBulkBar();
}

function wstRenderBulkBar(){
  let bar = document.getElementById('wstBulkBar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'wstBulkBar';
    bar.style.cssText='position:sticky;top:0;z-index:20;background:#fff8e1;border-bottom:2px solid #ffe082;padding:8px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
    const tbl = document.getElementById('wstTable');
    if(tbl) tbl.parentElement.insertBefore(bar, tbl);
  }
  if(!_wstSelected.size){ bar.style.display='none'; return; }
  bar.style.display='flex';
  bar.innerHTML = `<span style="font-weight:600;font-size:13px">${_wstSelected.size} web đã chọn</span>
    <button onclick="wstCopySelected('source')" class="btn btn-sm btn-outline" style="font-size:11px">🔗 Copy URL gốc</button>
    <button onclick="wstCopySelected('301')" class="btn btn-sm btn-outline" style="font-size:11px;color:#6c5ce7;border-color:#c3b1e1">🔀 Copy URL 301</button>
    <button onclick="wstCopySelected('both')" class="btn btn-sm btn-outline" style="font-size:11px">📋 Copy cả hai</button>
    <button onclick="_wstSelected.clear();renderWsTrack()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;margin-left:auto">×</button>`;
}

function wstCopySelected(mode){
  const lines = [];
  _wstSelected.forEach(wsId=>{
    const w = websites.find(x=>x.id===wsId);
    if(!w) return;
    const kids = websites.filter(x=>x.is301&&x.sourceUrl&&((x.sourceUrl===w.url||x.sourceUrl===(w.url||'').replace(/\/$/,'')) || (x.sourceUrl===w.brand)));
    const latest301 = kids.length?kids[kids.length-1]:null;
    if(mode==='source') lines.push(w.url||'');
    else if(mode==='301') lines.push(latest301?.url||w.url||'');
    else lines.push((w.url||'')+'\t'+(latest301?.url||''));
  });
  copyText(lines.join('\n'), null);
  toast('✓ Đã copy '+lines.length+' URL','#27ae60',2000);
}

function renderWsTrack(){
  const tbody = document.getElementById('wstTbody');
  const thead = document.getElementById('wstThead');
  const empty = document.getElementById('wstEmpty');
  if(!tbody) return;

  const allTrackedWs = siteTracking.map(s=>websites.find(w=>w.id===s.wsId)).filter(Boolean);
  const chkItems = getWstChecklist();

  if(wtApiKey && !window._wstApiLoaded) {
      window._wstApiLoaded = true;
      wstUpdateAPIUsage();
  }

  // Populate filters
  const gSel = document.getElementById('wst_filter_group');
  if(gSel){ const cur=gSel.value; const groups=[...new Set(allTrackedWs.map(w=>w.group||'').filter(Boolean))].sort(); gSel.innerHTML='<option value="">Tất cả nhóm</option>'+groups.map(g=>`<option value="${g}" ${g===cur?'selected':''}>${g}</option>`).join(''); }


  const q=(document.getElementById('wst_search')?.value||'').toLowerCase();
  const fGroup=gSel?.value||'';
  const fCheck='';

  let list = allTrackedWs.filter(w=>{
    if(q && !w.brand.toLowerCase().includes(q) && !(w.url||'').toLowerCase().includes(q)) return false;
    if(fGroup && (w.group||'')!==fGroup) return false;
    if(fCheck){
      const cl=getWstSite(w.id)?.checklist||{};
      if(fCheck==='all_done' && !chkItems.every(i=>cl[i])) return false;
      if(fCheck==='partial' && chkItems.every(i=>cl[i])) return false;
      if(fCheck.startsWith('done_') && !cl[fCheck.slice(5)]) return false;
      if(fCheck.startsWith('undone_') && cl[fCheck.slice(7)]) return false;
    }
    return true;
  });

  if(!list.length){ tbody.innerHTML=''; if(thead) thead.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';

  // Get 301 children helper
  function getW301Children(w){
    return websites.filter(x=>x.is301&&x.sourceUrl&&(x.sourceUrl===w.url||x.sourceUrl===(w.url||'').replace(/\/$/,'')));
  }

  // Filters: moBot, index
  const fMobot = document.getElementById('wst_filter_mobot')?.value||'';
  const fIndex = document.getElementById('wst_filter_index')?.value||'';
  list = list.filter(w=>{
    if(fMobot){
      const site=getWstSite(w.id);
      const entries=(site?.entries||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
      const mb=entries[0]?.moBot||site?.moBot||'';
      if(mb!==fMobot) return false;
    }
    if(fIndex){
      const site=getWstSite(w.id);
      const entries=(site?.entries||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
      if(entries[0]?.indexed!==fIndex) return false;
    }
    return true;
  });

  // Checklist filter (from fCheck already computed above)
  // (fCheck handled inline in list filter)

  if(!list.length){ tbody.innerHTML=''; if(thead) thead.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';

  // Build table header
  if(thead){
    thead.innerHTML = `<tr style="background:#f8f9fa;border-bottom:2px solid var(--gray-border)">
      <th style="padding:8px 6px;text-align:center;width:30px"><input type="checkbox" id="wstSelectAll" onchange="wstToggleSelectAll(this)" style="cursor:pointer;accent-color:var(--red)"></th>
      <th style="padding:8px 10px;text-align:left;font-size:11px;min-width:130px">URL hiện tại (301)</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px;min-width:130px">Website (gốc)</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px">Nhóm</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px;min-width:140px">Từ khóa SEO</th>
      ${chkItems.map(item=>`<th style="padding:8px 10px;text-align:center;font-size:11px;white-space:nowrap">${item}</th>`).join('')}
      <th style="padding:8px 10px;text-align:center;font-size:11px;white-space:nowrap">Mở bot</th>
      <th style="padding:8px 10px;text-align:center;font-size:11px">🏆 Rank</th>
      <th style="padding:8px 10px;text-align:center;font-size:11px">🔍 Index</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px">Cập nhật</th>
      <th style="padding:8px 10px;text-align:center;font-size:11px">Thao tác</th>
    </tr>`;
  }

  tbody.innerHTML = list.map(w=>{
    const site = getWstSite(w.id);
    const cl = site?.checklist||{};
    const entries = (site?.entries||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
    const last = entries[0];
    const allDone = chkItems.length && chkItems.every(i=>cl[i]);
    const kids = getW301Children(w);
    // Latest 301: sort by added order (last in array), use url or sourceUrl
    const latest301 = kids.length ? kids[kids.length-1] : null;
    const display301Url = latest301 ? (latest301.url||latest301.sourceUrl||'—') : (w.url||'—');
    const isSameAsSource = !latest301;
    const isSelected = _wstSelected.has(w.id);
    const indexIcon = last?.indexed==='Đã index'?'✅':last?.indexed==='Chưa index'?'❌':last?.indexed==='Một phần'?'⚠️':'—';
    const mb = last?.moBot||site?.moBot||'';

    return `<tr style="border-bottom:1px solid #f0f0f0;${allDone?'background:#f6fff8':''};${isSelected?'background:#fdf2f2;':''}" onmouseover="if(!${isSelected})this.style.background='#fafafa'" onmouseout="if(!${isSelected})this.style.background='${allDone?'#f6fff8':''}'">
      <td style="padding:6px;text-align:center">
        <input type="checkbox" class="wst-chk" data-id="${w.id}" onchange="wstToggleSelect(${w.id},this)" ${isSelected?'checked':''} style="cursor:pointer;accent-color:var(--red)">
      </td>
      <td style="padding:8px 10px;min-width:160px">
        ${(()=>{
          const dW = isSameAsSource ? w : latest301;
          const dColor = isSameAsSource ? 'var(--blue)' : '#6c5ce7';
          const sc = WS_STATUS_COLOR[dW.status]||'#999';
          return `<div style="display:flex;align-items:center;gap:6px">
            <button onclick="wstShowWebInfo(${dW.id})" style="font-size:16px;flex-shrink:0;background:none;border:none;cursor:pointer;padding:0;line-height:1" title="Xem thông tin ${dW.brand}">${WS_STATUS_ICON[dW.status]||'🌐'}</button>
            <div style="min-width:0">
              <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dW.brand}</div>
              <div style="font-size:10px;color:${dColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">${dW.url||''}</div>
              <span style="font-size:10px;padding:0 5px;border-radius:8px;background:${sc}18;color:${sc}">${dW.status||''}</span>
            </div>
          </div>`;
        })()}
      </td>
      <td style="padding:8px 10px;min-width:160px">
        ${(()=>{
          const sc = WS_STATUS_COLOR[w.status]||'#999';
          return `<div style="display:flex;align-items:center;gap:6px">
            <button onclick="wstShowWebInfo(${w.id})" style="font-size:16px;flex-shrink:0;background:none;border:none;cursor:pointer;padding:0;line-height:1" title="Xem thông tin ${w.brand}">${WS_STATUS_ICON[w.status]||'🌐'}</button>
            <div style="min-width:0">
              <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.brand}</div>
              <div style="font-size:10px;color:var(--blue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">${w.url||''}</div>
              <span style="font-size:10px;padding:0 5px;border-radius:8px;background:${sc}18;color:${sc}">${w.status||''}</span>
            </div>
          </div>`;
        })()}
      </td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text-muted)">${w.group||'—'}</td>
      <td style="padding:8px 10px;font-size:11px;">
        <div style="display:flex;align-items:center;gap:4px">
          <input type="text" placeholder="${w.brand||'Nhập từ khóa...'}" value="${site?.mainKeyword || w.brand || ''}" onchange="wstSaveKeyword(${w.id}, this.value)" style="width:110px;font-size:11px;padding:3px 6px;height:24px">
          <button onclick="var btn=this;btn.innerHTML='⏳'; wstFetchRank(${w.id}).then(r=>{btn.innerHTML='↺'; renderWsTrack(); if(r.error)toast(r.error,'#e74c3c'); else toast('Xong!','#27ae60')})" style="background:none;border:1px solid var(--gray-border);border-radius:4px;cursor:pointer;padding:2px 4px;font-size:10px" title="Kiểm tra rank ngay">↺</button>
        </div>
      </td>
      ${chkItems.map(item=>`<td style="padding:8px 10px;text-align:center">
        <span onclick="wstToggleCheck(${w.id},'${item}')" style="cursor:pointer;font-size:16px" title="${item}">${cl[item]?'✅':'⬜'}</span>
      </td>`).join('')}
      <td style="padding:8px 10px;text-align:center">
        <input type="checkbox" onchange="wstToggleMoBot(${w.id},this.checked)" ${last?.moBot==='Mở'?'checked':''} style="width:16px;height:16px;cursor:pointer;accent-color:#27ae60" title="${last?.moBot==='Mở'?'Đang Mở — click để Đóng':'Đang Đóng — click để Mở'}">
      </td>
      <td id="rank_td_${w.id}" style="padding:8px 10px;text-align:center;font-size:12px;font-weight:600">
        ${!last?'<span style="color:var(--text-muted)">N/A</span>':last.moBot==='Đóng'?'<span style="color:#e74c3c">CMB</span>':wstFormatRankUI(last.rank)}
      </td>
      <td style="padding:8px 10px;text-align:center;font-size:16px">${indexIcon}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text-muted);white-space:nowrap">${last?.date||'—'}</td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap">
        <button onclick="wstOpenDetail(${w.id})" class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 6px" title="Xem lịch sử">📋</button>
        <button onclick="wstAddEntry(${w.id})" class="btn btn-sm" style="font-size:11px;padding:2px 7px;background:var(--red);color:#fff;border:none" title="Thêm dữ liệu">+</button>
        <button onclick="wstRemoveTracking(${w.id})" class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 5px;color:#e74c3c;border-color:#e74c3c" title="Bỏ theo dõi">×</button>
      </td>
    </tr>`;
  }).join('');

  // Render bulk bar
  wstRenderBulkBar();
}


function wsQuickAddTracking(wsId){
  const w = websites.find(x=>x.id===wsId);
  if(!w) return;
  if(w.is301){
    toast('Web 301 không thể theo dõi trực tiếp — hãy thêm web gốc','#e67e22',3000);
    return;
  }
  if(siteTracking.some(s=>s.wsId===wsId)){
    toast(w.brand+' đã có trong theo dõi','#e67e22',2000);
    return;
  }
  siteTracking.push({wsId,entries:[]});
  saveWsTrack();
  renderWebsites();
  toast('📈 Đã thêm '+w.brand+' vào theo dõi','#27ae60',2500);
}

function wsBulkAddToTracking(){
  const sel = _wsSelected;
  if(!sel||!sel.size){ toast('Chưa chọn website nào','#e74c3c'); return; }
  let added=0, skipped=0, is301=0;
  sel.forEach(wsId=>{
    const id=typeof wsId==='number'?wsId:parseInt(wsId);
    const w=websites.find(x=>x.id===id);
    if(!w) return;
    if(w.is301){ is301++; return; }
    if(siteTracking.some(s=>s.wsId===id)){ skipped++; return; }
    siteTracking.push({wsId:id,entries:[]});
    added++;
  });
  if(added) saveWsTrack();
  renderWebsites();
  let msg = added?`✅ Đã thêm ${added} web vào theo dõi`:'';
  if(skipped) msg += (msg?', ':'')+`${skipped} web đã có`;
  if(is301) msg += (msg?', ':'')+`${is301} web 301 bỏ qua`;
  toast(msg||'Không có web nào được thêm','#27ae60',3500);
}

function wstShowWebInfo(wsId){
  const w = websites.find(x=>x.id===wsId);
  if(!w) return;
  websiteInfoTarget = w;
  showWebsiteInfo(w, true);
}

function wstToggleMoBot(wsId, checked){
  let site = getWstSite(wsId);
  if(!site){ siteTracking.push({wsId,entries:[]}); site=getWstSite(wsId); }
  if(!site.entries) site.entries=[];
  // Get last entry and update its moBot, or create new entry
  const entries = site.entries.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const last = entries[0];
  if(last){
    // Update moBot on latest entry
    const idx = site.entries.findIndex(e=>e.id===last.id);
    if(idx>=0) site.entries[idx].moBot = checked?'Mở':'Đóng';
  } else {
    site.entries.push({id:'wste'+Date.now(),date:todayVN(),moBot:checked?'Mở':'Đóng',rank:null,indexed:'',note:''});
  }
  saveWsTrack();
  renderWsTrack();
}

function wstSaveMoBot(wsId, val){
  let site = getWstSite(wsId);
  if(!site){ siteTracking.push({wsId,entries:[]}); site=getWstSite(wsId); }
  site.moBot = val.trim();
  saveWsTrack();
}

function wstAddEntry(wsId){
  _wstSelectedWsId = wsId;
  openWstAddModal();
}

function wstRemoveTracking(wsId){
  const w = websites.find(x=>x.id===wsId);
  if(!confirm('Bỏ theo dõi '+w?.brand+'?')) return;
  siteTracking = siteTracking.filter(s=>s.wsId!==wsId);
  saveWsTrack();
  renderWsTrack();
}

function wstOpenDetail(wsId){
  const w = websites.find(x=>x.id===wsId);
  const site = getWstSite(wsId);
  if(!w||!site) return;
  const entries = (site.entries||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const indexBadge = v=>v==='Đã index'?'<span style="font-size:10px;background:#d4edda;color:#155724;padding:1px 6px;border-radius:10px">✅ Đã index</span>':v==='Chưa index'?'<span style="font-size:10px;background:#f8d7da;color:#721c24;padding:1px 6px;border-radius:10px">❌ Chưa</span>':v==='Một phần'?'<span style="font-size:10px;background:#fff3cd;color:#856404;padding:1px 6px;border-radius:10px">⚠️ Một phần</span>':'—';
  const ov = document.createElement('div');
  ov.id='wstDetailOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
  ov.onclick=e=>{if(e.target===ov)ov.remove()};
  ov.innerHTML=`<div style="background:#fff;border-radius:12px;padding:22px;width:620px;max-width:95vw;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div><div style="font-weight:700;font-size:15px">📋 ${w.brand}</div><div style="font-size:11px;color:var(--blue)">${w.url||''}</div></div>
      <div style="display:flex;gap:6px">
        <button onclick="wstAddEntry(${wsId});document.getElementById('wstDetailOv').remove()" class="btn btn-primary btn-sm">+ Thêm dữ liệu</button>
        <button onclick="document.getElementById('wstDetailOv').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-muted)">×</button>
      </div>
    </div>
    ${!entries.length?'<div style="text-align:center;padding:24px;color:var(--text-muted)">Chưa có dữ liệu</div>':`
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f8f9fa;border-bottom:2px solid var(--gray-border)">
        <th style="padding:7px 8px;text-align:left">Ngày</th>
        <th style="padding:7px 8px;text-align:center">🏆 Rank</th>
        <th style="padding:7px 8px;text-align:center">🔗 BL</th>
        <th style="padding:7px 8px;text-align:center">🔍 Index</th>
        <th style="padding:7px 8px;text-align:left">Ghi chú</th>
        <th style="padding:7px 8px;width:30px"></th>
      </tr></thead>
      <tbody>${entries.map((e,i)=>{
        const prev=entries[i+1];
        const rD=prev&&prev.rank&&e.rank?e.rank-prev.rank:null;
        const bD=prev&&prev.backlinks&&e.backlinks?e.backlinks-prev.backlinks:null;
        return `<tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:7px 8px;font-weight:${i===0?'600':'400'}">${e.date}</td>
          <td style="padding:7px 8px;text-align:center">${e.rank||'—'}${rD!==null?` <span style="font-size:10px;color:${rD<0?'#27ae60':'#e74c3c'}">${rD<0?'▲'+Math.abs(rD):'▼'+rD}</span>`:''}</td>
          <td style="padding:7px 8px;text-align:center">${e.backlinks||'—'}${bD!==null?` <span style="font-size:10px;color:${bD>0?'#27ae60':'#e74c3c'}">${bD>0?'+'+bD:bD}</span>`:''}</td>
          <td style="padding:7px 8px;text-align:center">${indexBadge(e.indexed)}</td>
          <td style="padding:7px 8px;color:var(--text-muted);max-width:160px">${e.note||'—'}</td>
          <td style="padding:7px 8px"><button onclick="wstDeleteEntry(${wsId},'${e.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);opacity:.4;font-size:13px" onmouseover="this.style.opacity=1;this.style.color='#e74c3c'" onmouseout="this.style.opacity=.4;this.style.color='var(--text-muted)'">🗑</button></td>
        </tr>`}).join('')}</tbody>
    </table>`}
  </div>`;
  document.body.appendChild(ov);
}


function wstSelectWeb(wsId){
  _wstSelectedWsId = wsId;
  const sel = document.getElementById('wst_filter_ws');
  if(sel) sel.value = wsId;
  renderWsTrack();
}

function renderWstContent(wsId){
  const content = document.getElementById('wstContent');
  if(!content) return;
  const w = websites.find(x=>x.id===wsId);
  const site = getWstSite(wsId);
  if(!w||!site){ content.innerHTML='<div style="padding:20px;color:var(--text-muted)">Không tìm thấy dữ liệu.</div>'; return; }

  const entries = (site.entries||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));

  const indexBadge = v => v==='Đã index'?'<span style="font-size:11px;background:#d4edda;color:#155724;padding:2px 7px;border-radius:10px">✅ Đã index</span>':
    v==='Chưa index'?'<span style="font-size:11px;background:#f8d7da;color:#721c24;padding:2px 7px;border-radius:10px">❌ Chưa index</span>':
    v==='Một phần'?'<span style="font-size:11px;background:#fff3cd;color:#856404;padding:2px 7px;border-radius:10px">⚠️ Một phần</span>':'—';

  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <div style="font-weight:700;font-size:15px">📈 ${w.brand}</div>
      <div style="font-size:11px;color:var(--blue)">${w.url||''}</div>
      <button onclick="openWstAddModal()" class="btn btn-primary btn-sm" style="margin-left:auto">+ Thêm dữ liệu</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;padding:10px 12px;background:#f8f9fa;border-radius:8px;border:1px solid var(--gray-border)">
      <span style="font-size:11px;font-weight:600;color:var(--text-muted);line-height:2">Checklist:</span>
      ${getWstChecklist().map(item=>{
        const done=(site&&site.checklist&&site.checklist[item]);
        const btn = '<button onclick="wstToggleCheck('+wsId+',\''+item+'\') " style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;border:1px solid '+(done?'#27ae60':'var(--gray-border)')+';background:'+(done?'#d4edda':'#fff')+';color:'+(done?'#155724':'var(--text-muted)')+';cursor:pointer;font-size:12px">'+(done?'✅ ':'⬜ ')+item+'</button>';
        return btn;
      }).join('')}
    </div>
    ${!entries.length ? '<div style="text-align:center;padding:32px;color:var(--text-muted)">Chưa có dữ liệu nào. Bấm "+ Thêm dữ liệu" để bắt đầu.</div>' : `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f8f9fa;border-bottom:2px solid var(--gray-border)">
        <th style="padding:8px 10px;text-align:left">Ngày</th>
        <th style="padding:8px 10px;text-align:center">🏆 Rank TB</th>
        <th style="padding:8px 10px;text-align:center">🔗 Backlink</th>
        <th style="padding:8px 10px;text-align:center">🔍 Index</th>
        <th style="padding:8px 10px;text-align:left">📝 Ghi chú</th>
        <th style="padding:8px 10px;width:60px"></th>
      </tr></thead>
      <tbody>
        ${entries.map((e,i)=>{
          // Compare with previous entry (older)
          const prev = entries[i+1];
          const rankDiff = prev&&prev.rank&&e.rank ? e.rank-prev.rank : null;
          const blDiff = prev&&prev.backlinks&&e.backlinks ? e.backlinks-prev.backlinks : null;
          const rankArrow = rankDiff===null?'':(rankDiff<0?'<span style="color:#27ae60;font-size:10px">▲'+Math.abs(rankDiff)+'</span>':(rankDiff>0?'<span style="color:#e74c3c;font-size:10px">▼'+rankDiff+'</span>':''));
          const blArrow = blDiff===null?'':(blDiff>0?'<span style="color:#27ae60;font-size:10px">+'+blDiff+'</span>':(blDiff<0?'<span style="color:#e74c3c;font-size:10px">'+blDiff+'</span>':''));
          return `<tr style="border-bottom:1px solid #f0f0f0;${i===0?'background:#f9f9f9':''}">
            <td style="padding:8px 10px;font-weight:${i===0?'600':'400'}">${e.date}</td>
            <td style="padding:8px 10px;text-align:center">${e.rank||'—'} ${rankArrow}</td>
            <td style="padding:8px 10px;text-align:center">${e.backlinks||'—'} ${blArrow}</td>
            <td style="padding:8px 10px;text-align:center">${indexBadge(e.indexed)}</td>
            <td style="padding:8px 10px;color:var(--text-muted);max-width:200px">${e.note||'—'}</td>
            <td style="padding:8px 10px;text-align:right">
              <button onclick="wstDeleteEntry(${wsId},'${e.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:13px;opacity:.4" onmouseover="this.style.opacity=1;this.style.color='#e74c3c'" onmouseout="this.style.opacity=.4;this.style.color='var(--text-muted)'">🗑</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`}`;
}

function openWstPickModal(){
  // Only show source websites (not 301), plus find parent of 301
  const tracked = new Set(siteTracking.map(s=>s.wsId));
  const available = websites.filter(w=>!tracked.has(w.id) && !w.is301);
  const overlay = document.createElement('div');
  overlay.id = 'wstPickOverlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:20px;width:420px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
    <div style="font-weight:700;font-size:14px;margin-bottom:12px">+ Chọn website để theo dõi</div>
    <input type="text" placeholder="🔍 Tìm..." oninput="wstPickFilter(this.value)" style="width:100%;border:1px solid var(--gray-border);border-radius:6px;padding:6px 10px;font-size:12px;margin-bottom:10px">
    <div id="wstPickList" style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${available.length?available.map(w=>`
        <div onclick="wstAddTracking(${w.id})" style="padding:8px 12px;border:1px solid var(--gray-border);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='#fdf2f2'" onmouseout="this.style.background=''">
          <div style="flex:1"><div style="font-size:13px;font-weight:600">${w.brand}</div><div style="font-size:11px;color:var(--blue)">${w.url||''}</div></div>
          <span style="font-size:11px;color:#27ae60;font-weight:600">+ Thêm</span>
        </div>`).join(''):'<div style="text-align:center;padding:20px;color:var(--text-muted)">Tất cả website đã được theo dõi</div>'}
    </div>
    <div style="text-align:right;margin-top:12px">
      <button onclick="document.getElementById('wstPickOverlay').remove()" class="btn btn-outline">Đóng</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}




function wstPickFilter(q){
  const tracked = new Set(siteTracking.map(s=>s.wsId));
  const ql = (q||'').toLowerCase();
  let parentFromW301 = new Set();
  if(ql){
    websites.filter(w=>w.is301).forEach(w301=>{
      if((w301.brand.toLowerCase().includes(ql)||(w301.url||'').toLowerCase().includes(ql)) && w301.sourceUrl){
        const parent = websites.find(p=>!p.is301&&p.url&&(p.url===w301.sourceUrl||p.url.replace(/\/$/,'')=== w301.sourceUrl.replace(/\/$/,'')));
        if(parent) parentFromW301.add(parent.id);
      }
    });
  }
  const list = websites.filter(w=>{
    if(w.is301) return false;
    if(!ql) return true;
    return w.brand.toLowerCase().includes(ql)||(w.url||'').toLowerCase().includes(ql)||parentFromW301.has(w.id);
  }).slice(0,10);
  const el = document.getElementById('wstPickList');
  if(!el) return;
  if(!list.length){ el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted)">Không tìm thấy</div>'; return; }
  const rows = list.map(w=>{
    const isTracked = tracked.has(w.id);
    const isParent = parentFromW301.has(w.id);
    const div = document.createElement('div');
    div.style.cssText='padding:8px 12px;border:1px solid '+(isTracked?'#a8deba':'#dee2e6')+';border-radius:8px;display:flex;align-items:center;gap:8px;background:'+(isTracked?'#f0faf4':'#fff');
    if(!isTracked){ div.style.cursor='pointer'; div.onmouseover=()=>div.style.background='#fdf2f2'; div.onmouseout=()=>div.style.background='#fff'; div.onclick=()=>wstAddTracking(w.id); }
    div.innerHTML='<div style="flex:1"><div style="font-size:13px;font-weight:600">'+w.brand+(isParent?'<span style="font-size:10px;background:#e8f5e9;color:#2e7d32;padding:1px 6px;border-radius:10px;margin-left:4px">web gốc của 301</span>':'')+'</div><div style="font-size:11px;color:#2980b9">'+(w.url||'')+'</div></div>'+(isTracked?'<span style="font-size:11px;color:#27ae60;font-weight:600">✓ Đã theo dõi</span>':'<span style="font-size:11px;color:#27ae60;font-weight:600">+ Thêm</span>');
    return div;
  });
  el.innerHTML='';
  rows.forEach(r=>el.appendChild(r));
}

function wstAddTracking(wsId){
  if(!siteTracking.find(s=>s.wsId===wsId)){
    siteTracking.push({wsId, entries:[]});
    saveWsTrack();
  }
  _wstSelectedWsId = wsId;
  const ov = document.getElementById('wstPickOverlay');
  if(ov) ov.remove();
  renderWsTrack();
}

function openWstAddModal(){
  const wsId = _wstSelectedWsId;
  if(!wsId){ toast('Chọn website trước!','#e74c3c'); return; }
  const w = websites.find(x=>x.id===wsId);
  const overlay = document.createElement('div');
  overlay.id = 'wstAddOverlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;width:400px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
    <div style="font-weight:700;font-size:14px;margin-bottom:14px">📈 Thêm dữ liệu — ${w?.brand||''}</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="form-group"><label>Ngày ghi nhận</label>
        <input type="date" id="wst_date" style="width:100%" value="${todayVN()}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label>🤖 Mở bot</label>
          <select id="wst_mobot" style="width:100%">
            <option value="Đóng" selected>🔴 Đóng</option>
            <option value="Mở">🟢 Mở</option>
          </select>
        </div>
        <div class="form-group"><label>🏆 Rank trung bình</label>
          <input type="number" id="wst_rank" min="1" style="width:100%" placeholder="VD: 15">
        </div>
      </div>
      <div class="form-group"><label>🔍 Trạng thái Index Google</label>
        <select id="wst_indexed" style="width:100%">
          <option value="">-- Chưa kiểm tra --</option>
          <option value="Đã index">✅ Đã index</option>
          <option value="Một phần">⚠️ Một phần</option>
          <option value="Chưa index">❌ Chưa index</option>
        </select>
      </div>
      <div class="form-group"><label>📝 Ghi chú</label>
        <textarea id="wst_note" rows="2" style="width:100%" placeholder="Ghi chú tình trạng, thay đổi..."></textarea>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:16px">
      <button onclick="document.getElementById('wstAddOverlay').remove()" class="btn btn-outline">Huỷ</button>
      <button onclick="wstSaveEntry()" class="btn btn-primary">✓ Lưu</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  setTimeout(()=>document.getElementById('wst_date')?.focus(),50);
}

function wstSaveEntry(){
  const wsId = _wstSelectedWsId;
  if(!wsId) return;
  let site = getWstSite(wsId);
  if(!site){ siteTracking.push({wsId,entries:[]}); site=getWstSite(wsId); }
  if(!site.entries) site.entries = []; // safety fix
  const entry = {
    id: 'wste'+Date.now(),
    date: document.getElementById('wst_date').value||todayVN(),
    rank: parseInt(document.getElementById('wst_rank').value)||null,
    indexed: document.getElementById('wst_indexed').value||'',
    note: (document.getElementById('wst_note').value||'').trim(),
  };
  site.entries.push(entry);
  saveWsTrack();
  document.getElementById('wstAddOverlay').remove();
  renderWsTrack();
  toast('✓ Đã lưu dữ liệu theo dõi');
}

function wstToggleCheck(wsId, item){
  let site = getWstSite(wsId);
  if(!site){ siteTracking.push({wsId,entries:[]}); site=getWstSite(wsId); }
  if(!site.checklist) site.checklist={};
  site.checklist[item] = !site.checklist[item];
  saveWsTrack();
  renderWsTrack();
}

function wstDeleteEntry(wsId, entryId){
  if(!confirm('Xoá mục này?')) return;
  const site = getWstSite(wsId);
  if(!site) return;
  site.entries = site.entries.filter(e=>e.id!==entryId);
  saveWsTrack();
  renderWsTrack();
}

function renderRecurringTasks(){
  const list = document.getElementById('recurringList');
  const empty = document.getElementById('recurringEmpty');
  if(!list) return;
  if(!recurringTasks.length){ list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  const today = todayVN();

  const _today = todayVN();
  // Done today section
  const _allDoneToday = getRecurDoneToday();
  const doneTodayList = _allDoneToday.filter(d=>d.date===_today && (currentMember==='admin'||d.person===('')));

  const visibleRecurring = currentMember==='admin' ? recurringTasks : recurringTasks.filter(r=>r.person===(''));
  if(!visibleRecurring.length){ list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  // Tách task chưa done và task đã done hôm nay
  const notDoneList = visibleRecurring.filter(r=>!doneTodayList.some(d=>d.id===r.id));
  list.innerHTML = notDoneList.map(r=>{
    const today = _today;
    const typeLabel = {daily:'Hàng ngày', weekly:'Hàng tuần', monthly:'Hàng tháng', custom:`Mỗi ${r.days} ngày`}[r.type]||r.type;
    const nextDate = r.nextDate||'—';
    const isDue = nextDate<=today;
    const isDoneToday = doneTodayList.some(d=>d.id===r.id);
    let cardClass = 'task-recur-card';
    if(isDoneToday) cardClass += ' task-recur-done';
    else if(isDue) cardClass += ' task-recur-due';
    return `<div class="${cardClass}" style="border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:14px;margin-bottom:8px;">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;margin-bottom:4px;${isDoneToday?'text-decoration:line-through;color:var(--text-muted)':''}">
          ${isDoneToday?'✅':'🔁'} ${r.name}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <span style="font-size:11px;background:#21262d;color:#c9d1d9;padding:2px 8px;border-radius:10px;border:1px solid #30363d">${typeLabel}</span>
          ${r.person?`<span style="font-size:11px;color:var(--text-muted)">👤 ${r.person}</span>`:''}
          ${isDoneToday
            ? `<span style="font-size:11px;color:#27ae60;font-weight:600">✓ Đã xong hôm nay</span><span style="font-size:11px;color:var(--text-muted)">📅 Lần tới: ${nextDate}</span>`
            : `<span style="font-size:11px;color:${isDue?'var(--red)':'var(--text-muted)'}">📅 Lần tới: <b>${nextDate}</b>${isDue?' ⚠️ Đến hạn!':''}</span>`
          }
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${isDoneToday
          ?`<button onclick="undoDoneRecurring(${r.id})" class="btn btn-sm btn-outline" style="font-size:11px;color:#e67e22;border-color:#e67e22" title="Hoàn tác done">↩ Hoàn tác</button>`
          :`<button onclick="doneRecurringToday(${r.id})" class="btn btn-sm" style="background:#27ae60;color:#fff;border:none;font-size:11px">✓ Done</button>`
        }
        <button onclick="editRecurring(${r.id})" class="btn btn-sm btn-outline" style="font-size:11px">✎</button>
        <button onclick="deleteRecurring(${r.id})" class="btn btn-sm btn-outline" style="font-size:11px;">🗑</button>
      </div>
    </div>`;
  }).join('');

  // Done today section
  const today2 = _today;
  if(doneTodayList.length){
    const doneOpen = (localStorage.getItem('recur_done_open')||'1')==='1';
    list.innerHTML += `<div style="margin-top:16px">
      <div onclick="toggleRecurDoneSection()" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;background:#f0faf4;border-radius:8px;border:1px solid #a8deba;user-select:none">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#27ae60">✅ Đã hoàn thành hôm nay (${doneTodayList.length})</span>
        <span id="recurDoneChevron" style="margin-left:auto;font-size:11px;color:#27ae60;transform:${doneOpen?'rotate(0deg)':'rotate(-90deg)'};transition:transform .2s;display:inline-block">▼</span>
      </div>
      <div id="recurDoneList" style="display:${doneOpen?'block':'none'};margin-top:6px">
        ${doneTodayList.map(d=>`<div style="padding:8px 14px;border:1px solid #a8deba;border-radius:8px;background:#f0faf4;display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span style="font-size:13px;font-weight:600">✅ ${d.name}</span>
          <span style="font-size:11px;color:var(--text-muted)">${d.doneAt||today2}</span>
          <button onclick="undoDoneRecurring(${d.id})" class="btn btn-sm btn-outline" style="font-size:11px;color:#e67e22;border-color:#e67e22;margin-left:auto">↩ Hoàn tác</button>
        </div>`).join('')}
      </div>
    </div>`;
  }
}

function openNewRecurringModal(id){
  const r = id ? recurringTasks.find(x=>x.id===id) : null;
  const overlay = document.createElement('div');
  overlay.id = 'recurringModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.2);width:420px;max-width:95vw">
    <div style="font-weight:700;font-size:15px;margin-bottom:16px">${r?'✎ Sửa':'+ Thêm'} task định kỳ</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="form-group"><label>Tên task *</label>
        <input type="text" id="rm_name" style="width:100%" value="${r?.name||''}" placeholder="VD: Check backlink tháng...">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label>Người thực hiện</label>
          ${currentMember==='admin'
            ? `<select id="rm_person" style="width:100%">
                <option value="">--</option>
                <option ${(r?.person==='Hải')?'selected':''}>Hải</option>
                <option ${(r?.person==='Hiếu')?'selected':''}>Hiếu</option>
                <option ${(r?.person==='Khác')?'selected':''}>Khác</option>
              </select>`
            : `<input type="text" id="rm_person" style="width:100%;background:#f8f9fa" value="${''}" readonly>`
          }
        </div>
        <div class="form-group"><label>Loại</label>
          <div style="display:flex;gap:6px;align-items:center">
            <select id="rm_type" style="flex:1"></select>
            <button type="button" onclick="openTaskTypeManager()" style="background:none;border:1px solid var(--gray-border);border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11px;color:var(--text-muted)" title="Quản lý loại task">⚙</button>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label>Chu kỳ</label>
          <select id="rm_recur_type" style="width:100%" onchange="rmToggleSchedule(this.value)">
            <option value="daily" ${!r||r?.type==='daily'?'selected':''}>Hàng ngày</option>
            <option value="weekly" ${r?.type==='weekly'?'selected':''}>Hàng tuần</option>
            <option value="monthly" ${r?.type==='monthly'?'selected':''}>Hàng tháng</option>
            <option value="custom" ${r?.type==='custom'?'selected':''}>Tùy chỉnh (ngày)</option>
          </select>
        </div>
        <div class="form-group" id="rm_days_wrap" style="display:${r?.type==='custom'?'block':'none'}"><label>Số ngày</label>
          <input type="number" id="rm_days" min="1" value="${r?.days||7}" style="width:100%">
        </div>
      </div>
      <!-- Weekly: chọn thứ -->
      <div class="form-group" id="rm_weekdays_wrap" style="display:${r?.type==='weekly'||!r?'block':'none'}">
        <label style="font-size:12px">Các thứ trong tuần</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
          ${['CN','T2','T3','T4','T5','T6','T7'].map((d,i)=>`<label style="display:flex;align-items:center;gap:3px;cursor:pointer;padding:3px 8px;border:1px solid var(--gray-border);border-radius:6px;font-size:12px;${(r?.weekdays||[]).includes(i)?'background:#fdf2f2;border-color:var(--red);color:var(--red)':''}">
            <input type="checkbox" value="${i}" name="rm_weekday" ${(r?.weekdays||[]).includes(i)?'checked':''} style="cursor:pointer;accent-color:var(--red)">${d}</label>`).join('')}
        </div>
      </div>
      <!-- Monthly: chọn ngày -->
      <div class="form-group" id="rm_monthdays_wrap" style="display:${r?.type==='monthly'?'block':'none'}">
        <label style="font-size:12px">Các ngày trong tháng</label>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
          ${Array.from({length:31},(_,i)=>`<label style="cursor:pointer;width:30px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid var(--gray-border);border-radius:4px;font-size:11px;${(r?.monthdays||[]).includes(i+1)?'background:var(--red);color:#fff;border-color:var(--red)':''}">
            <input type="checkbox" value="${i+1}" name="rm_monthday" ${(r?.monthdays||[]).includes(i+1)?'checked':''} style="display:none">${i+1}</label>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Click để chọn/bỏ ngày</div>
      </div>
      <div class="form-group"><label>Ngày bắt đầu tính (lần tới)</label>
        <input type="date" id="rm_next" style="width:100%" value="${r?.nextDate||todayVN()}">
      </div>
      <div class="form-group"><label>Mô tả</label>
        <textarea id="rm_desc" rows="2" style="width:100%">${r?.desc||''}</textarea>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:16px">
      <button onclick="document.getElementById('recurringModal').remove()" class="btn btn-outline">Huỷ</button>
      <button onclick="saveRecurringModal(${r?r.id:'null'})" class="btn btn-primary">✓ Lưu</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  populateTaskTypeSelect('rm_type', r?.type_task||'Nội dung');
  // Init monthday click handlers
  document.querySelectorAll('input[name="rm_monthday"]').forEach(chk=>{
    const lbl=chk.parentElement;
    lbl.onclick=()=>{ chk.checked=!chk.checked; lbl.style.background=chk.checked?'var(--red)':''; lbl.style.color=chk.checked?'#fff':''; lbl.style.borderColor=chk.checked?'var(--red)':'var(--gray-border)'; };
  });
  setTimeout(()=>document.getElementById('rm_name').focus(),100);
}


function rmToggleSchedule(type){
  const d = document.getElementById('rm_days_wrap');
  const w = document.getElementById('rm_weekdays_wrap');
  const m = document.getElementById('rm_monthdays_wrap');
  if(d) d.style.display = type==='custom'?'block':'none';
  if(w) w.style.display = type==='weekly'?'block':'none';
  if(m) m.style.display = type==='monthly'?'block':'none';
  // Toggle monthday labels click handler
  if(type==='monthly'){
    setTimeout(()=>{
      document.querySelectorAll('input[name="rm_monthday"]').forEach(chk=>{
        const lbl = chk.parentElement;
        lbl.onclick = ()=>{
          chk.checked=!chk.checked;
          lbl.style.background=chk.checked?'var(--red)':'';
          lbl.style.color=chk.checked?'#fff':'';
          lbl.style.borderColor=chk.checked?'var(--red)':'var(--gray-border)';
        };
      });
    },50);
  }
}


function doneRecurringToday(id){
  const r = recurringTasks.find(x=>x.id===id);
  if(!r) return;
  const today = todayVN();
  // Save to done list
  let doneList = getRecurDoneToday();
  doneList = doneList.filter(d=>d.date===today); // keep only today
  if(!doneList.find(d=>d.id===id)){
    doneList.push({id, name:r.name, date:today, doneAt:today, person:r.person||''});
    saveRecurDoneToday(doneList);
  }
  // Advance next date THEN save once
  r.lastDone = today;
  r.nextDate = calcNextDate(today, r);
  saveRecurring(); // saves recurringTasks + recurDoneToday together
  setTimeout(()=>renderRecurringTasks(), 50);
  toast(`✅ Done: ${r.name} — lần tới: ${r.nextDate}`, '#27ae60', 4000);
}

function toggleRecurDoneSection(){
  const cur = (localStorage.getItem('recur_done_open')||'1')==='1';
  localStorage.setItem('recur_done_open', cur?'0':'1');
  const list = document.getElementById('recurDoneList');
  const chevron = document.getElementById('recurDoneChevron');
  if(list) list.style.display = cur?'none':'block';
  if(chevron) chevron.style.transform = cur?'rotate(-90deg)':'rotate(0deg)';
}

function undoDoneRecurring(id){
  const r = recurringTasks.find(x=>x.id===id);
  if(!r) return;
  const today = todayVN();
  // Restore nextDate FIRST before any save
  r.nextDate = today;
  r.lastDone = '';
  // Remove from done list
  let doneList = getRecurDoneToday();
  doneList = doneList.filter(d=>!(d.id===id && d.date===today));
  setRecurDoneToday(doneList);
  // Single save with both updated
  saveRecurring(); // includes recurDoneToday via getRecurDoneToday()
  setTimeout(()=>renderRecurringTasks(), 50);
  toast('↩ Đã hoàn tác — task trở lại chưa done', '#e67e22', 3000);
}

function editRecurring(id){ openNewRecurringModal(id); }

function saveRecurringModal(id){
  const name = (document.getElementById('rm_name').value||'').trim();
  if(!name){ toast('Nhập tên task!','#e74c3c'); return; }
  const obj = {
    id: id||recurNextId++,
    name,
    person: document.getElementById('rm_person').value,
    type_task: document.getElementById('rm_type').value,
    type: document.getElementById('rm_recur_type').value,
    days: parseInt(document.getElementById('rm_days').value||7),
    nextDate: document.getElementById('rm_next').value||todayVN(),
    desc: document.getElementById('rm_desc').value.trim(),
    weekdays: [...document.querySelectorAll('input[name="rm_weekday"]:checked')].map(x=>parseInt(x.value)),
    monthdays: [...document.querySelectorAll('input[name="rm_monthday"]:checked')].map(x=>parseInt(x.value)),
  };
  if(id){
    const idx = recurringTasks.findIndex(x=>x.id===id);
    if(idx>=0) recurringTasks[idx]=obj;
  } else {
    recurringTasks.push(obj);
  }
  saveRecurring();
  document.getElementById('recurringModal').remove();
  renderRecurringTasks();
  toast('✓ Đã lưu task định kỳ');
}

function deleteRecurring(id){
  if(!confirm('Xoá task định kỳ này?')) return;
  recurringTasks = recurringTasks.filter(x=>x.id!==id);
  saveRecurring();
  renderRecurringTasks();
  toast('Đã xoá');
}

function createRecurringNow(id, silent){
  // Không còn tạo task trong Công việc khác nữa
  // Chỉ cập nhật nextDate trong kho task định kỳ
  return null;
}



function updateRecurringBadge(){
  const today = todayVN();
  const due = recurringTasks.filter(r=>r.nextDate&&r.nextDate<=today).length;
  const badge = document.getElementById('navBadgeRecurring');
  if(badge){ badge.textContent=due; badge.style.display=due?'':'none'; }
}

function toggleRecurringFields(){
  const checked = document.getElementById('npm_recurring')?.checked;
  const el = document.getElementById('npm_recurring_fields');
  if(el) el.style.display = checked ? 'grid' : 'none';
}

function calcNextDate(fromDate, recurring){
  const d = new Date(fromDate+'T12:00:00');
  if(!d || isNaN(d)) return todayVN();
  const type = recurring.type;
  const days = parseInt(recurring.days)||7;
  if(type==='weekly' && recurring.weekdays && recurring.weekdays.length){
    // Find next weekday after fromDate
    for(let i=1;i<=7;i++){
      const next = new Date(d); next.setDate(d.getDate()+i);
      if(recurring.weekdays.includes(next.getDay())) return next.toISOString().split('T')[0];
    }
    d.setDate(d.getDate()+7); // fallback
  } else if(type==='monthly' && recurring.monthdays && recurring.monthdays.length){
    // Find next monthday after fromDate
    const sortedDays = [...recurring.monthdays].sort((a,b)=>a-b);
    const curDay = d.getDate();
    const curMonth = d.getMonth(), curYear = d.getFullYear();
    // Check remaining days this month
    const nextThisMonth = sortedDays.find(day=>day>curDay);
    if(nextThisMonth) return new Date(curYear, curMonth, nextThisMonth).toISOString().split('T')[0].split('T')[0];
    // Otherwise first day next month
    return new Date(curYear, curMonth+1, sortedDays[0]).toISOString().split('T')[0];
  } else if(type==='daily')  d.setDate(d.getDate()+1);
  else if(type==='weekly') d.setDate(d.getDate()+7);
  else if(type==='monthly') d.setMonth(d.getMonth()+1);
  else d.setDate(d.getDate()+days);
  return d.toISOString().split('T')[0];
}



function saveProject(){
  const name=(document.getElementById('npm_name').value||'').trim();
  if(!name){toast('Nhập tên task!','#e74c3c');return;}
  const stepsText=document.getElementById('npm_steps').value||'';
  const cols=parseSteps(stepsText);
  if(editingProjectId){
    const t=tasks.find(x=>x.id===editingProjectId);
    if(t){
      t.name=name;t.person=currentMember==='hai'?'Hải':currentMember==='hieu'?'Hiếu':(document.getElementById('npm_person').value||t.person||'');
      t.type=document.getElementById('npm_type').value;
      t.priority=document.getElementById('npm_priority')?.value||t.priority||'Bình thường';
      t.dang=document.getElementById('npm_dang')?.value||t.dang||'text';
      t.from=document.getElementById('npm_from').value;
      t.deadline=document.getElementById('npm_deadline').value;
      t.desc=document.getElementById('npm_desc').value.trim();
      if(cols!==null) t.cols=cols;
      t.team=document.getElementById('npm_team')?.value||t.team||'Team 01';
      t.recurring=document.getElementById('npm_recurring')?.checked?{type:document.getElementById('npm_recur_type')?.value||'weekly',days:parseInt(document.getElementById('npm_recur_days')?.value||7)}:null;

      // === BẮT ĐẦU LUỒNG APPEND-ONLY SYNC CHO DẠNG TASK URL ===
      if (t.dang === 'url') {
        if (!t.cards) t.cards = [];
        const lines = t.desc.split('\n').map(l => l.trim()).filter(Boolean);
        const urls = [...new Set(lines.map(extractUrlFromLine).filter(Boolean))];
        const firstColId = (t.cols && t.cols.length > 0) ? t.cols[0].id : 'col_new';

        urls.forEach(url => {
          const hasCard = t.cards.some(c => (c.name || '').toLowerCase().trim() === url.toLowerCase().trim());
          if (!hasCard) {
            t.cards.push({
              id: 'c' + cardNextId++,
              colId: firstColId,
              name: url,
              desc: ''
            });
          }
        });
      }
      // === KẾT THÚC LUỒNG APPEND-ONLY SYNC ===

      if(currentProjectId===editingProjectId){
        document.getElementById('subBoardTitle').textContent=t.name;
        renderSubBoard(t);
      }
    }
  } else {
    const recurOn=document.getElementById('npm_recurring')?.checked;
    const _personVal = currentMember==='hai'?'Hải':currentMember==='hieu'?'Hiếu':(document.getElementById('npm_person').value||'');
    const _taskCols = cols || DEFAULT_COLS;
    const _dang = document.getElementById('npm_dang')?.value || 'url';
    const _desc = document.getElementById('npm_desc').value.trim();
    
    let _cards = [];
    if (_dang === 'url') {
      const lines = _desc.split('\n').map(l => l.trim()).filter(Boolean);
      const urls = [...new Set(lines.map(extractUrlFromLine).filter(Boolean))];
      if (urls.length > 0) {
        urls.forEach(url => {
          _cards.push({
            id: 'c' + cardNextId++,
            colId: _taskCols[0].id,
            name: url,
            title: url,
            desc: ''
          });
        });
      } else {
        _cards = [{ id: 'card_' + Date.now(), title: name, name: name, colId: _taskCols[0].id, note: '', deadline: '', link: '' }];
      }
    } else {
      _cards = [{ id: 'card_' + Date.now(), title: name, name: name, colId: _taskCols[0].id, note: '', deadline: '', link: '' }];
    }

    const t={id:taskNextId++,name,person:_personVal,
      type:document.getElementById('npm_type').value,from:document.getElementById('npm_from').value,
      deadline:document.getElementById('npm_deadline').value,desc:_desc,
      cols,cards:_cards,priority:document.getElementById('npm_priority')?.value||'Bình thường',dang:_dang,team:document.getElementById('npm_team')?.value||'Team 01',
      recurring:recurOn?{type:document.getElementById('npm_recur_type')?.value||'weekly',days:parseInt(document.getElementById('npm_recur_days')?.value||7)}:null};
    tasks.push(t);
  }
  closeNewProjectModal();
  if(currentProjectId){
    const t=tasks.find(x=>x.id===currentProjectId);
    if(t) renderSubBoard(t);
  }
  renderTasksOverview();
  saveAppData();
  toast('&#10003; Đã lưu!');
}

function deleteProject(){
  if(!editingProjectId) return;
  const found=tasks.find(x=>x.id===editingProjectId);
  if(found) deletedTasks.unshift({...found,_deletedAt:Date.now()});
  tasks=tasks.filter(t=>t.id!==editingProjectId);
  closeNewProjectModal();
  backToOverview();
  saveAppData();
  toast('🗑 Đã xoá task.','#2c3e50',4000);
}

// ---- CARD MODAL ----
function openAddCardModal(defaultColId, cardId=null){
  const task=tasks.find(t=>t.id===currentProjectId);
  if(!task) return;
  editingCardId=cardId;
  const cols=getProjectCols(task);
  document.getElementById('acTitle').textContent=cardId?'✎ Sửa thẻ':'Thêm thẻ';
  const sel=document.getElementById('ac_col');
  sel.innerHTML=cols.map(c=>`<option value="${c.id}" ${c.id===defaultColId?'selected':''}>${c.label}</option>`).join('');
  if(cardId){
    const card=task.cards.find(c=>c.id===cardId);
    document.getElementById('ac_name').value=card?.name||'';
    document.getElementById('ac_desc').value=card?.desc||'';
    document.getElementById('ac_delete_btn').style.display='inline-flex';
  } else {
    document.getElementById('ac_name').value='';
    document.getElementById('ac_desc').value='';
    document.getElementById('ac_delete_btn').style.display='none';
  }
  document.getElementById('addCardModal').classList.add('open');
  setTimeout(()=>document.getElementById('ac_name').focus(),100);
}

function closeAddCardModal(){document.getElementById('addCardModal').classList.remove('open');editingCardId=null;}

function saveCard(){
  const name=(document.getElementById('ac_name').value||'').trim();
  if(!name){toast('Nhập tên thẻ!','#e74c3c');return;}
  const task=tasks.find(t=>t.id===currentProjectId);
  if(!task) return;
  const colId=document.getElementById('ac_col').value;
  const desc=document.getElementById('ac_desc').value.trim();

  // Ép phẳng tên thẻ về dạng URL sạch nếu là task dạng URL
  let finalName = name;
  if (task.dang === 'url') {
    finalName = extractUrlFromLine(name) || name;
  }

  if(editingCardId){
    const card=task.cards.find(c=>c.id===editingCardId);
    if(card){card.name=finalName;card.colId=colId;card.desc=desc;}
  } else {
    task.cards.push({id:'c'+cardNextId++,colId,name:finalName,desc});
  }
  closeAddCardModal();
  renderSubBoard(task);
  renderTasksOverview();
  saveAppData();
  toast('&#10003; Đã lưu thẻ!');
}

function deleteCard(){
  const task=tasks.find(t=>t.id===currentProjectId);
  if(!task||!editingCardId) return;
  if(!confirm('Xoá thẻ này?')) return;
  task.cards=task.cards.filter(c=>c.id!==editingCardId);
  closeAddCardModal();
  renderSubBoard(task);
  saveAppData();
  toast('Đã xoá thẻ.');
}

// ---- PENDING ----
function confirmPending(){
  const reason=document.getElementById('pendingReason').value.trim();
  if(pendingDragCard){
    if(pendingDragCard.gvId!=null){
      // Card in a GV board
      const g=giaoViecList.find(x=>x.id===pendingDragCard.gvId);
      const card=(g?.taskCards||[]).find(c=>c.id===pendingDragCard.cardId);
      if(card){
        card.colId=pendingDragCard.colId;
        card.pendingReason=reason;
        card.pendingDate=todayVN();
        card.pendingStatus='Chờ xử lý';
      }
      pendingDragCard=null;
      if(g) renderGvKanban({id:g.id,name:g.taskName,cols:g.taskCols,cards:g.taskCards});
      renderGiaoViec();
      saveAppData();
    } else {
      const _tid = pendingDragCard.taskId || currentProjectId;
      const task=tasks.find(t=>t.id===_tid);
      // Bulk pending support
      const idsToMove = pendingDragCard.bulkIds || [pendingDragCard.cardId];
      (task?.cards||[]).forEach(c=>{
        if(!idsToMove.includes(c.id)) return;
        c.colId = pendingDragCard.colId;
        c.pendingReason = reason;
        c.pendingDate = todayVN();
        c.pendingStatus = 'Chờ xử lý';
      });
      pendingDragCard=null;
      clearCardSelection();
      if(task) renderSubBoard(task);
      renderTasksOverview();
      saveAppData();
    }
    toast('❙❙ Đã chuyển sang Pending');
  }
  closePendingModal();
}
function closePendingModal(){document.getElementById('pendingModal').classList.remove('open');pendingDragCard=null;}

function renderPendingSummary(){
  const panel = document.getElementById('pendingSummaryPanel');
  if(!panel) return;

  // Collect pending cards
  const allPendingCards=[];
  // Filter tasks by current member
  const myTasks = currentMember==='admin' ? tasks
    : tasks.filter(t=>{
        const p = (t.person||'').trim();
        return !p || p===('');
      });
  myTasks.forEach(task=>{
    const cols=getProjectCols(task);
    const pendingColIds=new Set(cols.filter(c=>c.id==='pending'||c.id==='col_pending'||c.label.toLowerCase().includes('pending')).map(c=>c.id));
    (task.cards||[]).forEach(card=>{
      if(pendingColIds.has(card.colId)) allPendingCards.push({task,card});
    });
  });

  // Collect pending parent tasks
  const allPendingTasks = myTasks.filter(t=>t.pendingReason);

  const body=document.getElementById('pendingSummaryBody');
  const cnt=document.getElementById('pendingCount');
  if(!body || !cnt) return;
  const total = allPendingCards.length + allPendingTasks.length;
  if(!total){panel.style.display='none';return;}
  panel.style.display='block';
  cnt.textContent=total;

  const STATUSES=['Chờ xử lý','Đang xử lý','Đã xử lý xong'];
  const sColor={'Chờ xử lý':'#e67e22','Đang xử lý':'#2980b9','Đã xử lý xong':'#27ae60'};

  // Render pending parent tasks first
  const parentRows = allPendingTasks.map(t=>{
    const age=t.pendingDate?daysSince(t.pendingDate):0;
    const ageStr=age===0?'Hôm nay':age===1?'Hôm qua':`${age} ngày`;
    const st=t.pendingStatus||'Chờ xử lý';
    return `<tr style="border-bottom:1px solid #fce0b0;background:#fff3e6">
      <td style="padding:8px 12px">
        <span onclick="openProjectBoard(${t.id})" style="color:var(--blue);cursor:pointer;font-weight:600;font-size:12px">⏸ ${t.name}</span>
        <span style="font-size:10px;background:#e67e22;color:#fff;border-radius:10px;padding:1px 6px;margin-left:4px">Task cha</span>
      </td>
      <td style="padding:8px 12px;font-size:12px;color:var(--text-muted)">— Cả task —</td>
      <td style="padding:8px 12px;white-space:nowrap;font-size:12px">
        ${t.pendingDate?fmtDate(t.pendingDate):'?'}
        <span style="color:var(--text-muted);font-size:11px">(${ageStr})</span>
      </td>
      <td style="padding:8px 12px;max-width:200px;color:var(--text-muted);font-size:12px">${t.pendingReason||'—'}</td>
      <td style="padding:8px 12px">
        <select onchange="updateTaskPendingStatus(${t.id},this.value)"
          style="font-size:11px;padding:2px 6px;border:1px solid #fce0b0;border-radius:4px;background:#fff;color:${sColor[st]};font-weight:500;cursor:pointer">
          ${STATUSES.map(s=>`<option value="${s}" ${st===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="padding:8px 8px;white-space:nowrap">
        <button class="btn btn-sm btn-outline" onclick="resolveTaskPending(${t.id})"
          style="font-size:11px;padding:3px 8px;color:#27ae60;border-color:#27ae60" title="Xoá pending task">
          ✓ Bỏ pending
        </button>
      </td>
    </tr>`;
  }).join('');

  // Render pending cards
  const firstColOf = task => getProjectCols(task)[0];
  const cardRows = allPendingCards.map(({task,card})=>{
    const age=card.pendingDate?daysSince(card.pendingDate):0;
    const ageStr=age===0?'Hôm nay':age===1?'Hôm qua':`${age} ngày`;
    const firstCol=firstColOf(task);
    const st=card.pendingStatus||'Chờ xử lý';
    return `<tr style="border-bottom:1px solid #fce0b0">
      <td style="padding:8px 12px">
        <span onclick="openProjectBoard(${task.id})" style="color:var(--blue);cursor:pointer;font-weight:500;font-size:12px">${task.name}</span>
      </td>
      <td style="padding:8px 12px;font-weight:500;font-size:12px">${card.name}</td>
      <td style="padding:8px 12px;white-space:nowrap;font-size:12px">
        ${card.pendingDate?fmtDate(card.pendingDate):'?'}
        <span style="color:var(--text-muted);font-size:11px">(${ageStr})</span>
      </td>
      <td style="padding:8px 12px;max-width:200px;color:var(--text-muted);font-size:12px">${card.pendingReason||'—'}</td>
      <td style="padding:8px 12px">
        <select onchange="updatePendingStatus(${task.id},'${card.id}',this.value)"
          style="font-size:11px;padding:2px 6px;border:1px solid #fce0b0;border-radius:4px;background:#fff;color:${sColor[st]};font-weight:500;cursor:pointer">
          ${STATUSES.map(s=>`<option value="${s}" ${st===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="padding:8px 8px;white-space:nowrap">
        <button class="btn btn-sm btn-primary" onclick="resolvePending(${task.id},'${card.id}')"
          style="font-size:11px;padding:3px 8px" title="Done → về cột đầu (${firstCol.label})">
          &#10003; Done
        </button>
      </td>
    </tr>`;
  }).join('');

  body.innerHTML = parentRows + cardRows;
}

function updatePendingStatus(taskId,cardId,status){
  const task=tasks.find(t=>t.id===taskId);
  const card=task?.cards.find(c=>c.id===cardId);
  if(card){card.pendingStatus=status;}
}

function resolvePending(taskId,cardId){
  const task=tasks.find(t=>t.id===taskId);
  const card=task?.cards.find(c=>c.id===cardId);
  if(!card) return;
  const firstCol=getProjectCols(task)[0];
  card.colId=firstCol.id;
  delete card.pendingReason; delete card.pendingDate; delete card.pendingStatus;
  renderTasksOverview();
  if(currentProjectId===taskId) renderSubBoard(task);
  saveAppData();
  toast(`&#10003; Đã resolve → "${firstCol.label}"`);
}



// [REMOVED: QUICK IMPORT] // ===== MEMBER SWITCHER =====
const MEMBER_CONFIG = { admin: {label:'Admin', avatar:'A', pages:['dashboard','recurring','tasks','links','prompts','wstrack','ecosystem']} };

function toggleMemberDropdown(){
  document.getElementById('memberDropdown').classList.toggle('open');
  // close on outside click
  setTimeout(()=>document.addEventListener('click', closeMemberDropdownOutside, {once:true}), 10);
}
function closeMemberDropdownOutside(e){
  if(!e.target.closest('#memberPicker'))
    document.getElementById('memberDropdown').classList.remove('open');
}



// Patch renders to respect member filter
const _origRenderTasksOverview = renderTasksOverview;
renderTasksOverview = function(){
  if(currentMember!=='admin'){
    const el=document.getElementById('tkFilterPerson');
    if(el) el.value = '';
  }
  _origRenderTasksOverview();
};

function isAdminLoggedIn() {
  try {
    return sessionStorage.getItem('wt_session_admin') === 'true';
  } catch(e) {
    return false;
  }
}

// ===== LOGIN / LOGOUT =====
function showLoginScreen(){
  const ls = document.getElementById('loginScreen');
  if(ls) ls.style.display='flex';
}

function hideLoginScreen(){
  const ls = document.getElementById('loginScreen');
  if(ls) ls.style.display='none';
  document.body.classList.remove('login-mode');
  // Show app version after login
  const ver = document.getElementById('appVersion');
  if(ver) ver.style.display = 'block';
}

// ===== AVATAR =====
let _pendingAvatar = undefined;
function applyAllAvatars(){
  const avs = _settings.avatars || {};
  ['admin'].forEach(m=>{
    const src = avs[m] || null;
    const icon = MEMBER_CONFIG[m]?.avatar || 'H';
    const loginEl = document.getElementById('loginAv_'+m);
    if(loginEl) loginEl.innerHTML = src ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block">` : icon;
    const mdEl = document.getElementById('md-avatar-'+m);
    if(mdEl) mdEl.innerHTML = src ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block">` : icon;
  });
  const hdrEl = document.getElementById('memberAvatar');
  if(hdrEl){
    const src = avs[currentMember] || null;
    hdrEl.innerHTML = src ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block">` : (MEMBER_CONFIG[currentMember]?.avatar||'H');
  }
}

// ===== SETTINGS =====
let _settings = {};
function openSettings(){
  document.getElementById('settingsModal').classList.add('open');
}
function closeSettings(){ document.getElementById('settingsModal').classList.remove('open'); }

function saveSettings(){
  const btn = document.getElementById('settingsSaveBtn');
  if (btn) {
    btn.textContent='Đang lưu...'; btn.disabled=true;
  }
  saveAppData();
  setTimeout(()=>{
    if (btn) {
      btn.textContent='✓ Lưu'; btn.disabled=false;
    }
    closeSettings();
    toast('✓ Đã lưu cài đặt giao diện');
  }, 500);
}

// ===== UNIFIED SEARCH =====
let _uniMode = 'link'; // 'link' | 'prompt'
const UNI_MODES = {
  link:   { icon:'🔗', placeholder:'Tìm link / website...', addColor:'#e74c3c' },
  prompt: { icon:'✍️', placeholder:'Tìm prompt...',         addColor:'#8e44ad' },
};

function uniToggleMode(){
  _uniMode = _uniMode==='link' ? 'prompt' : 'link';
  const m = UNI_MODES[_uniMode];
  document.getElementById('uniModeBtn').textContent = m.icon;
  document.getElementById('uniInput').placeholder = m.placeholder;
  document.getElementById('uniAddBtn').style.color = m.addColor;
  document.getElementById('uniInput').value = '';
  uniClose();
}

function uniSearch(){
  if(_uniMode==='link') qlSearch();
  else pqSearch();
}

function uniClose(){
  qlClose();
  pqClose();
}

function uniAdd(){
  if(_uniMode==='link') qlOpenAdd();
  else pqOpenAdd();
}

function uniKeydown(e){
  if(_uniMode==='link') qlKeydown(e);
  else if(e.key==='Escape'){ pqClose(); e.target.blur(); }
}

// Patch ql/pq to read from uniInput
function qlGetInput(){ return document.getElementById('uniInput')?.value||''; }
function pqGetInput(){ return document.getElementById('uniInput')?.value||''; }

// ===== PROFILE AVATARS =====
function getProfileAvatars(){
  try{ const s=JSON.parse(localStorage.getItem('wt_settings')||'{}'); return s.avatars||{}; }catch(e){ return {}; }
}

// ===== GLOBAL KB CARD TOOLTIP =====
function showKbTooltip(e, name, desc){
  const tip=document.getElementById('kbTooltip');
  if(!tip) return;
  tip.innerHTML=`<div style="font-weight:600;margin-bottom:${desc?'6px':'0'}">${name}</div>${desc?`<div style="color:rgba(255,255,255,.75)">${desc}</div>`:''}`;
  tip.style.display='block';
  moveKbTooltip(e);
}
function moveKbTooltip(e){
  const tip=document.getElementById('kbTooltip');
  if(!tip||tip.style.display==='none') return;
  const x=e.clientX+14, y=e.clientY+14;
  const w=tip.offsetWidth, h=tip.offsetHeight;
  tip.style.left=(x+w>window.innerWidth ? x-w-20 : x)+'px';
  tip.style.top=(y+h>window.innerHeight ? y-h-20 : y)+'px';
}
function hideKbTooltip(){
  const tip=document.getElementById('kbTooltip');
  if(tip) tip.style.display='none';
}

// ===== ADMIN AUTHENTICATION SUCCESS CALLBACK (V48 Isolation) =====
function onAdminLoginSuccess() {
  currentMember = 'admin';
  try { localStorage.setItem('wt_activeMember', 'admin'); } catch(e) {}
  switchWorkspace('job', document.querySelector('.sidebar-nav-item'));
  restorePosition();
  renderDashboard();
  renderTasksOverview();
}

// ===== CHANGE PASSWORD =====
function openChangePassword(){
  const title = document.getElementById('cpwTitle');
  if (title) title.textContent = `🔑 Đổi mật khẩu - Admin`;
  const cpwOld = document.getElementById('cpwOld');
  if (cpwOld) cpwOld.value='';
  const cpwNew = document.getElementById('cpwNew');
  if (cpwNew) cpwNew.value='';
  const cpwConfirm = document.getElementById('cpwConfirm');
  if (cpwConfirm) cpwConfirm.value='';
  const cpwErr = document.getElementById('cpwErr');
  if (cpwErr) cpwErr.style.display='none';
  const modal = document.getElementById('changePwModal');
  if (modal) modal.classList.add('open');
  if (cpwOld) setTimeout(()=>cpwOld.focus(),100);
}
function closeChangePassword(){ const modal = document.getElementById('changePwModal'); if (modal) modal.classList.remove('open'); }
function saveChangePassword(){
  const old = document.getElementById('cpwOld')?.value || '';
  const nw = document.getElementById('cpwNew')?.value || '';
  const cf = document.getElementById('cpwConfirm')?.value || '';
  const err = document.getElementById('cpwErr');

  if (!old || !nw || !cf) {
    if (err) { err.textContent = 'Vui lòng nhập đầy đủ các trường!'; err.style.display = 'block'; }
    return;
  }

  if (nw !== cf) {
    if (err) { err.textContent = 'Mật khẩu mới và xác nhận mật khẩu không khớp!'; err.style.display = 'block'; }
    return;
  }

  // Đọc mật khẩu hiện tại từ Local Storage (do Firebase đồng bộ xuống)
  let currentRealPassword = "123456"; // Fallback mặc định
  try {
    const localData = localStorage.getItem('wt_passwords');
    if (localData) {
      const parsed = JSON.parse(localData);
      if (parsed && parsed.admin) currentRealPassword = parsed.admin;
    }
  } catch(e) {
    console.error("[V57] Lỗi đọc mật khẩu cục bộ:", e);
  }

  // So khớp mật khẩu hiện tại
  if (old !== currentRealPassword) {
    if (err) { err.textContent = 'Mật khẩu hiện tại không chính xác!'; err.style.display = 'block'; }
    return;
  }

  // ĐỒNG BỘ MẬT KHẨU MỚI LÊN THẲNG FIREBASE VÀ LOCAL STORAGE
  if (window.firebase) {
    firebase.database().ref('passwords/admin').set(nw).then(() => {
      // Cập nhật lại Local Storage để đồng bộ ngay lập tức
      try {
        const pws = JSON.parse(localStorage.getItem('wt_passwords') || '{}');
        pws['admin'] = nw;
        localStorage.setItem('wt_passwords', JSON.stringify(pws));
      } catch (e) {}
      
      closeChangePassword();
      if (typeof toast === 'function') toast('✅ Đổi mật khẩu thành công! Mật khẩu mới đã được cập nhật.');
    }).catch(errFirebase => {
      console.error("[V57 Firebase Error] Không thể ghi đè mật khẩu mới:", errFirebase);
      if (err) { err.textContent = 'Lỗi kết nối mạng, không thể lưu mật khẩu mới lên đám mây.'; err.style.display = 'block'; }
    });
  } else {
    // Fallback nếu không tải được Firebase SDK
    try {
      const pws = JSON.parse(localStorage.getItem('wt_passwords') || '{}');
      pws['admin'] = nw;
      localStorage.setItem('wt_passwords', JSON.stringify(pws));
      closeChangePassword();
      if (typeof toast === 'function') toast('✅ Đổi mật khẩu cục bộ thành công!');
    } catch (e) {}
  }
}

function openResetPwModal(){}
function closeResetPwModal(){}
function selectResetTarget(){}
function cancelResetProfile(){}
function confirmResetProfile(){}

// Restore member first (before restorePosition so page filter is correct)
// ===== EARLY DECLARATIONS (needed before setMember/updateNavBadges) =====
let indexTasks = [];
let itNextId = 1;
let selectedTaskIds = new Set();
let giaoViecList = [];
let giaoViecNextId = 1;
let assignees = ['Hải', 'Hiếu']; // default, customizable
let prompts = [];
let promptNextId = 1;

(function restoreMember(){
  try{
    const session = sessionStorage.getItem('wt_session_member');
    if(!session) return; // No session — login screen will handle, don't set member
    const valid = ['admin','hai','hieu'];
    currentMember = 'admin';
  }catch(e){}
})();
// ===== LINK QUAN TRỌNG =====
let links = [
  {id:1, name:'Admin WordPress Debet', url:'https://debets.sbs/wp-admin', desc:'Đăng nhập quản trị WordPress Debet', group:'WordPress', type:'work', owner:'Hiếu'},
  {id:2, name:'CafeLegend Admin', url:'https://cafelegend.vn/wp-admin', desc:'Quản trị CafeLegend.vn', group:'WordPress', type:'work', owner:'admin'},
  {id:3, name:'Qyazo Spin Tool', url:'https://qyazo.com', desc:'Tool tạo spin link cho index', group:'SEO', type:'work', owner:'admin'},
  {id:4, name:'Google Search Console', url:'https://search.google.com/search-console', desc:'Kiểm tra index, lỗi crawl', group:'SEO', type:'work', owner:'admin'},
  {id:5, name:'debets.sbs', url:'https://debets.sbs', desc:'Website Debet', group:'Client', type:'web', owner:'admin'},
  {id:6, name:'cafelegend.vn', url:'https://cafelegend.vn', desc:'Website Cafe Legend', group:'Client', type:'web', owner:'admin'},
];
let linkNextId = 10;
let editingLinkId = null;


// ===== LINK CÔNG VIỆC =====
let _lkEditIdx = -1;

function getOwnerBadge(owner){
  if(owner==='Hải') return '<span class="owner-badge-hai">Hải</span>';
  if(owner==='Hiếu') return '<span class="owner-badge-hieu">Hiếu</span>';
  return '<span class="owner-badge-admin">Chung</span>';
}

function copyFieldVal(id, btn){
  const val = document.getElementById(id)?.value||'';
  copyText(val, btn);
}

function lkGetVisible(){
  return links.map((l,i)=>({...l,_idx:i})).filter(l=>{
    if(l.type!=='work') return false;
    if(currentMember==='hai' && l.owner!=='admin' && l.owner!=='Hải') return false;
    if(currentMember==='hieu' && l.owner!=='admin' && l.owner!=='Hiếu') return false;
    return true;
  });
}

function renderLinks(){
  const q=(document.getElementById('linkSearch')||{}).value?.toLowerCase()||'';
  const fg=(document.getElementById('linkFilterGroup')||{}).value||'';
  const fo=(document.getElementById('linkFilterOwner')||{}).value||'';
  const fa=(document.getElementById('linkFilterAccount')||{}).value||'';

  const gSel=document.getElementById('linkFilterGroup');
  if(gSel){
    const all=lkGetVisible();
    const groups=[...new Set(all.map(l=>l.group||'Khác'))].sort();
    const cur=gSel.value;
    gSel.innerHTML='<option value="">Tất cả nhóm</option>'+groups.map(g=>`<option value="${g}" ${g===cur?'selected':''}>${g}</option>`).join('');
  }

  let list=lkGetVisible().filter(l=>{
    if(q && !l.name.toLowerCase().includes(q) && !(l.url||'').toLowerCase().includes(q) && !(l.desc||'').toLowerCase().includes(q)) return false;
    if(fg && (l.group||'Khác')!==fg) return false;
    if(fo && l.owner!==fo) return false;
    if(fa==='has_account' && !l.account) return false;
    if(fa==='no_account' && l.account) return false;
    return true;
  });

  const grid=document.getElementById('workLinksGrid');
  const empty=document.getElementById('emptyWorkLinks');
  const cnt=document.getElementById('lkCount');
  if(cnt) cnt.textContent=list.length+' link';
  if(!list.length){if(grid)grid.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';

  grid.innerHTML=list.map(l=>{
    const grpTag=l.group&&l.group!=='Khác'?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#fff3cd;color:#856404">${l.group}</span>`:'';
    const isActive=_lkEditIdx===l._idx;
    const acc=(l.account||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const pwd=(l.password||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return `<div onclick="lkSelectByIdx(${l._idx})"
      style="background:${isActive?'#fdf2f2':'#fff'};border:1px solid ${isActive?'var(--red)':'var(--gray-border)'};border-radius:8px;padding:10px 14px;cursor:pointer;margin-bottom:4px;display:flex;align-items:center;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          🔗 ${l.name} ${grpTag} ${getOwnerBadge(l.owner)}
        </div>
        <div style="font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${l.url||''}</div>
        ${l.desc?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${l.desc}</div>`:''}
        ${l.note?`<div style="font-size:11px;color:var(--blue);margin-top:2px">📝 ${l.note}</div>`:''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0" onclick="event.stopPropagation()">
        ${l.account?`<button onclick="copyText('${acc}',this)" style="background:none;border:1px solid var(--gray-border);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer" title="Copy TK">👤</button>`:''}
        ${l.password?`<button onclick="copyText('${pwd}',this)" style="background:none;border:1px solid var(--gray-border);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer" title="Copy MK">🔑</button>`:''}
        <a href="${l.url}" target="_blank" onclick="event.stopPropagation()" class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 8px">Mở</a>
      </div>
    </div>`;
  }).join('');
}

function lkSelectByIdx(idx){
  const l=links[idx];
  if(!l) return;
  _lkEditIdx=idx;
  document.getElementById('lf_name').value=l.name||'';
  document.getElementById('lf_url').value=l.url||'';
  document.getElementById('lf_desc').value=l.desc||'';
  document.getElementById('lf_note').value=l.note||'';
  document.getElementById('lf_type').value=l.type||'work';
  populateGroupSelect(l.type||'work');
  setTimeout(()=>{ const g=document.getElementById('lf_group'); if(g) g.value=l.group||''; },20);
  const ownerEl=document.getElementById('lf_owner');
  if(ownerEl) ownerEl.value=l.owner||'admin';
  const hasAuth=!!(l.account||l.password);
  const chk=document.getElementById('lf_has_auth');
  if(chk){chk.checked=hasAuth;toggleLfAuth();}
  document.getElementById('lf_account').value=l.account||'';
  document.getElementById('lf_password').value=l.password||'';
  document.getElementById('lf_delete_btn').style.display='inline-flex';
  document.getElementById('linkAddPanelTitle').textContent='✎ Sửa link';
  renderLinks();
}

function lkNewLink(){
  _lkEditIdx=-1;
  document.getElementById('lf_name').value='';
  document.getElementById('lf_url').value='';
  document.getElementById('lf_desc').value='';
  document.getElementById('lf_note').value='';
  document.getElementById('lf_type').value='work';
  populateGroupSelect('work');
  const ownerEl=document.getElementById('lf_owner'); if(ownerEl) ownerEl.value='admin';
  const chk=document.getElementById('lf_has_auth'); if(chk){chk.checked=false;toggleLfAuth();}
  document.getElementById('lf_account').value='';
  document.getElementById('lf_password').value='';
  document.getElementById('lf_delete_btn').style.display='none';
  document.getElementById('linkAddPanelTitle').textContent='+ Thêm link';
  document.getElementById('lf_name').focus();
  renderLinks();
}

function lkClearForm(){ lkNewLink(); }

function lkSaveLink(){
  const name=(document.getElementById('lf_name').value||'').trim();
  const url=(document.getElementById('lf_url').value||'').trim();
  if(!name){toast('Nhập tên link!','#e74c3c');return;}
  if(!url){toast('Nhập URL!','#e74c3c');return;}
  const hasAuth=document.getElementById('lf_has_auth')?.checked;
  const obj={
    id:_lkEditIdx>=0?links[_lkEditIdx].id:linkNextId++,
    name,url,
    desc:(document.getElementById('lf_desc').value||'').trim(),
    note:(document.getElementById('lf_note').value||'').trim(),
    group:(document.getElementById('lf_group').value||'Khác').trim(),
    type:'work',
    owner:document.getElementById('lf_owner').value||'admin',
    account:hasAuth?(document.getElementById('lf_account').value||'').trim():'',
    password:hasAuth?(document.getElementById('lf_password').value||''):'',
  };
  if(_lkEditIdx>=0){
    links[_lkEditIdx]=obj;
  } else {
    links.unshift(obj);
    _lkEditIdx=0;
  }
  saveAppData();
  renderLinks();
  toast('✓ Đã lưu link!');
}

function lkDeleteLink(){
  if(_lkEditIdx<0||!confirm('Xoá link này?')) return;
  links.splice(_lkEditIdx,1);
  _lkEditIdx=-1;
  saveAppData();
  lkNewLink();
}

function quickAddLink(type){ if(type==='work') lkNewLink(); }
function editLink(id){ const idx=links.findIndex(l=>l.id===id); if(idx>=0) lkSelectByIdx(idx); }
function saveLink(){ lkSaveLink(); }
function deleteLink(){ lkDeleteLink(); }
function clearLinkForm(){ lkClearForm(); }
// ===== CATEGORY MANAGER =====
let linkCategories = {
  work: ['WordPress', 'SEO', 'Tool', 'Google', 'Khác'],
  web:  ['Client', 'Social', 'Hosting', 'Domain', 'Khác'],
};

// (init moved to end)

function populateGroupSelect(typeVal){
  const type = typeVal || (document.getElementById('lf_type')||{}).value || 'work';
  const sel = document.getElementById('lf_group');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = linkCategories[type].map(c=>`<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
  if(!sel.value) sel.value = linkCategories[type][0]||'Khác';
}

// Hook lf_type change to repopulate group
document.addEventListener('DOMContentLoaded', ()=>{
  const typeEl = document.getElementById('lf_type');
  if(typeEl) typeEl.addEventListener('change', ()=>populateGroupSelect(typeEl.value));
  populateGroupSelect('work');
});



function openCategoryManager(){
  renderCategoryLists();
  document.getElementById('categoryModal').classList.add('open');
}
function closeCategoryManager(){
  document.getElementById('categoryModal').classList.remove('open');
  populateGroupSelect();
  renderLinks();
}

function renderCategoryLists(){
  ['work','web'].forEach(type=>{
    const listEl = document.getElementById('cm'+(type==='work'?'Work':'Web')+'List');
    const cats = linkCategories[type];
    listEl.innerHTML = cats.map((c,i)=>`
      <div style="display:flex;align-items:center;gap:6px;background:var(--gray-light);border-radius:6px;padding:5px 8px;border:1px solid var(--gray-border)">
        <input type="text" value="${c}" data-type="${type}" data-idx="${i}"
          onchange="renameCategory(this,'${type}',${i})"
          style="flex:1;border:none;background:transparent;font-size:13px;outline:none;min-width:0">
        <span style="font-size:11px;color:var(--text-muted)">${links.filter(l=>l.group===c&&l.type===type).length} link</span>
        <button onclick="deleteCategory('${type}',${i})"
          style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;padding:0 2px;line-height:1"
          title="Xoá danh mục">&#10005;</button>
      </div>`).join('');
  });
}

function addCategory(){
  const name = document.getElementById('cm_new_name').value.trim();
  const type = document.getElementById('cm_type').value;
  if(!name){toast('Nhập tên danh mục!','#e74c3c');return;}
  if(linkCategories[type].includes(name)){toast('Danh mục đã tồn tại!','#e67e22');return;}
  linkCategories[type].splice(linkCategories[type].length-1, 0, name); // insert before "Khác"
  document.getElementById('cm_new_name').value='';
  renderCategoryLists();
  saveAppData();
  toast('&#10003; Đã thêm danh mục "'+name+'"');
}

function renameCategory(input, type, idx){
  const oldName = linkCategories[type][idx];
  const newName = input.value.trim();
  if(!newName){input.value=oldName;return;}
  if(linkCategories[type].includes(newName)&&newName!==oldName){
    toast('Tên đã tồn tại!','#e74c3c');input.value=oldName;return;
  }
  // Rename in all links
  links.forEach(l=>{ if(l.type===type&&l.group===oldName) l.group=newName; });
  linkCategories[type][idx]=newName;
  renderCategoryLists();
  saveAppData();
  toast('&#10003; Đổi tên thành "'+newName+'"');
}

function deleteCategory(type, idx){
  const name = linkCategories[type][idx];
  const count = links.filter(l=>l.type===type&&l.group===name).length;
  if(count>0){
    if(!confirm(`Danh mục "${name}" còn ${count} link.\nXoá danh mục sẽ chuyển các link về "Khác". Tiếp tục?`)) return;
    links.forEach(l=>{ if(l.type===type&&l.group===name) l.group='Khác'; });
  }
  linkCategories[type].splice(idx,1);
  if(!linkCategories[type].includes('Khác')) linkCategories[type].push('Khác');
  renderCategoryLists();
  saveAppData();
  toast('Đã xoá danh mục "'+name+'"');
}
// [REMOVED: SHEET IMPORT] // ===== BULK EDIT =====
let bulkEditSheet = '';
let bulkEditField = '';

function toggleEditMenu(sheet){
  const menu = document.getElementById('editMenu-'+sheet);
  const isOpen = menu.style.display!=='none';
  // close all
  ['hai','hieu'].forEach(s=>{ const m=document.getElementById('editMenu-'+s); if(m) m.style.display='none'; });
  if(!isOpen){
    menu.style.display='block';
    setTimeout(()=>document.addEventListener('click', function closeEM(e){
      if(!e.target.closest('#editMenu-'+sheet)&&!e.target.closest('#editMenuBtn-'+sheet)){
        menu.style.display='none';
        document.removeEventListener('click',closeEM);
      }
    }),50);
  }
}
function closeEditMenu(sheet){
  const m=document.getElementById('editMenu-'+sheet);
  if(m) m.style.display='none';
}

function openBulkEdit(sheet, field){
  bulkEditSheet = sheet;
  bulkEditField = field;
  const n = selected[sheet].size;
  if(!n){toast('Chưa chọn dòng nào!','#e74c3c');return;}

  const labels = {loai:'Loại bài',anchor:'Anchor text',chuyenMuc:'Chuyên mục',website:'Website',ngay:'Ngày',index:'Loại Index'};
  document.getElementById('bulkEditTitle').textContent = '✎ Sửa hàng loạt — '+labels[field];
  document.getElementById('bulkEditCount').textContent = `Áp dụng cho ${n} dòng đã chọn`;
  document.getElementById('bulkEditLabel').textContent = 'Giá trị mới cho "'+labels[field]+'"';

  const wrap = document.getElementById('bulkEditInput');
  if(field==='loai'){
    wrap.innerHTML=`<select id="beVal" style="width:100%;height:36px;font-size:13px">
      <option>Tinh Gọn</option><option>Chỉ Viết</option>
      <option>Chỉ Đăng</option><option>Tinh Gọn Nhanh</option>
    </select>`;
  } else if(field==='ngay'){
    wrap.innerHTML=`<input type="date" id="beVal" style="width:100%;font-size:13px;height:36px" value="${todayVN()}">`;
  } else if(field==='index'){
    wrap.innerHTML=`<select id="beVal" style="width:100%;height:36px;font-size:13px">
      <option value="">-- Không có --</option>
      <option value="Google Index">Google Index</option>
      <option value="Bing Index">Bing Index</option>
      <option value="Manual Index">Manual Index</option>
      <option value="Auto Index">Auto Index</option>
      <option value="Omega Index">Omega Index</option>
    </select>`;
  } else {
    wrap.innerHTML=`<input type="text" id="beVal" style="width:100%;font-size:13px" placeholder="Nhập ${labels[field]}...">`;
  }
  document.getElementById('bulkEditModal').classList.add('open');
  setTimeout(()=>document.getElementById('beVal')?.focus(),100);
}

function closeBulkEdit(){
  document.getElementById('bulkEditModal').classList.remove('open');
}

function applyBulkEdit(){
  const val = (document.getElementById('beVal')?.value||'').trim();
  const sheet = bulkEditSheet;
  const field = bulkEditField;
  let count=0;
  data[sheet].forEach(r=>{
    if(selected[sheet].has(r.id)){r[field]=val;count++;}
  });
  saveAppData();
  closeBulkEdit();
  // If date changed, jump to that date
  if(field==='ngay' && val) activeDate[sheet] = val;
  renderDashboard();
  toast(`&#10003; Đã cập nhật "${val}" cho ${count} dòng`);
}

// ===== DRAG-TO-SELECT CHECKBOXES =====
let dragSelecting = false;
let dragSelectValue = true; // true=check, false=uncheck
let dragSelectSheet = '';

// DragSelect: use single delegated listeners, init once
let _dragStartTd = null;

function initDragSelect(sheet){
  // no-op: listeners are set up once via initDragSelectGlobal
}

function initDragSelectGlobal(){
  ['hai','hieu'].forEach(sheet=>{
    const tbody = document.getElementById('tbody'+sheet.charAt(0).toUpperCase()+sheet.slice(1));
    if(!tbody || tbody._dsInit) return;
    tbody._dsInit = true;

    tbody.addEventListener('mousedown', e=>{
      if(e.button!==0) return;
      const td = e.target.closest('td');
      if(!td || td !== td.parentElement?.firstElementChild) return;
      if(!td.querySelector('input[type=checkbox]')) return;
      _dragStartTd = td;
      dragSelectSheet = sheet;
      dragSelecting = false;
    });

    tbody.addEventListener('mouseover', e=>{
      if(!_dragStartTd || dragSelectSheet!==sheet) return;
      const td = e.target.closest('td');
      if(!td || td !== td.parentElement?.firstElementChild) return;
      if(td === _dragStartTd) return;
      if(!dragSelecting){
        dragSelecting = true;
        document.body.style.userSelect='none';
        const startChk = _dragStartTd.querySelector('input[type=checkbox]');
        const startId = parseInt(_dragStartTd.parentElement?.dataset.id);
        dragSelectValue = startChk ? !startChk.checked : true;
        if(startChk) startChk.checked = dragSelectValue;
        if(startId) toggleRow(sheet, startId, dragSelectValue);
      }
      const chk = td.querySelector('input[type=checkbox]');
      const id = parseInt(td.parentElement?.dataset.id);
      if(chk) chk.checked = dragSelectValue;
      if(id) toggleRow(sheet, id, dragSelectValue);
    });
  });
}

document.addEventListener('mouseup', ()=>{
  if(dragSelecting){ dragSelecting=false; document.body.style.userSelect=''; }
  dragSelecting = false;
  _dragStartTd = null;
});
// [REMOVED: BULK IMPORT FIELD] // ===== ROW COLOR =====

function closeAllBulkDropdowns(){
  document.querySelectorAll('[id^="bulk-drop-"]').forEach(el=>el.style.display='none');
}
function toggleBulkDropdown(key){
  const el = document.getElementById('bulk-drop-'+key);
  if(!el) return;
  const isOpen = el.style.display!=='none';
  closeAllBulkDropdowns();
  if(!isOpen){
    el.style.display='block';
    setTimeout(()=>{
      function outside(e){
        if(!el.contains(e.target) && !e.target.closest('[onclick*="toggleBulkDropdown"]')){
          el.style.display='none';
          document.removeEventListener('click', outside);
        }
      }
      document.addEventListener('click', outside);
    }, 10);
  }
}

function toggleColorPicker(sheet){
  const picker = document.getElementById('colorPicker-'+sheet);
  const isOpen = picker.style.display !== 'none';
  // Close all pickers first
  ['hai','hieu'].forEach(s=>{ const p=document.getElementById('colorPicker-'+s); if(p) p.style.display='none'; });
  if(!isOpen){
    picker.style.display='block';
    setTimeout(()=>document.addEventListener('click', function closeCP(e){
      if(!e.target.closest('#colorPicker-'+sheet) && !e.target.closest('#colorBtn-'+sheet)){
        picker.style.display='none';
        document.removeEventListener('click', closeCP);
      }
    }), 50);
  }
}

function bulkSetColor(sheet, color){
  selected[sheet].forEach(id=>{
    const r = data[sheet].find(x=>x.id===id);
    if(r){ if(color) r._color=color; else delete r._color; }
  });
  document.getElementById('colorPicker-'+sheet).style.display='none';
  saveAppData();
  renderDashboard();
  toast(color ? '&#127912; Đã tô màu '+selected[sheet].size+' dòng' : 'Đã xoá màu');
}function copyText(text, btn){
  // support data-kw attribute
  if(btn && btn.dataset && btn.dataset.kw) text = btn.dataset.kw;
  const doSuccess = () => {
    if(btn){
      const orig = btn.innerHTML;
      btn.innerHTML = '&#10003;';
      btn.style.color = 'var(--green)';
      btn.style.opacity = '1';
      setTimeout(()=>{ btn.innerHTML=orig; btn.style.color=''; btn.style.opacity='.45'; }, 1200);
    }
    const preview = text.length > 30 ? text.slice(0,30)+'…' : text;
    toast('✓ Đã copy: ' + preview, '#27ae60', 2000);
  };
  // Modern clipboard API
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(doSuccess).catch(()=>fallbackCopy(text,btn,doSuccess));
  } else {
    fallbackCopy(text, btn, doSuccess);
  }
}
function fallbackCopy(text, btn, onSuccess){
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(el);
  el.focus(); el.select();
  try{
    document.execCommand('copy');
    onSuccess();
  } catch(e){ toast('Không copy được!','#e74c3c'); }
  document.body.removeChild(el);
}
// ===== LINKS TAB SWITCHING =====
function switchLinksTab(tab){
  try{ sessionStorage.setItem('wt_activeSubPage', tab); } catch(e){}
  document.getElementById('linksPanel').style.display  = tab==='links'?'flex':'none';
  document.getElementById('websitesPanel').style.display = tab==='websites'?'flex':'none';
  const t1=document.getElementById('linksTab1'), t2=document.getElementById('linksTab2');
  if(t1){
    t1.classList.toggle('active', tab==='links');
    t1.style.background = '';
    t1.style.color = '';
    t1.style.borderBottomColor = '';
    t1.style.fontWeight = '';
  }
  if(t2){
    t2.classList.toggle('active', tab==='websites');
    t2.style.background = '';
    t2.style.color = '';
    t2.style.borderBottomColor = '';
    t2.style.fontWeight = '';
  }
  if(tab==='websites'){
    // Hide Team 02 filter option for Hải
    const teamOpt=document.querySelector('#websiteFilterTeam option[value="Team 02"]');
    if(teamOpt) teamOpt.style.display = currentMember==='hai' ? 'none' : '';
    // Reset filter if Hải had Team 02 selected
    const teamSel=document.getElementById('websiteFilterTeam');
    if(teamSel && currentMember==='hai' && teamSel.value==='Team 02') teamSel.value='Team 01';
    renderWebsites();
  }
  if(tab==='links') renderLinks();
}

// ===== WEBSITES =====
let wsGroups = ['Chính', 'Phụ', 'Khách']; // Team 01 sub-groups

function renderWebsites(){
  const q=(document.getElementById('websiteSearch')||{}).value?.toLowerCase()||'';
  const fs=(document.getElementById('websiteFilterStatus')||{}).value||'';
  const ft=(document.getElementById('websiteFilterTeam')||{}).value||'';
  const fg=(document.getElementById('websiteFilterGroup')||{}).value||'';
  const fo=(document.getElementById('websiteFilterOwner')||{}).value||'';
  // Update pill counts (pre-status filter, but after team/group/owner filter)
  wsUpdatePillCounts(websites.filter(w=>{
    if(q && !w.brand.toLowerCase().includes(q) && !(w.url||'').toLowerCase().includes(q)) return false;
    if(ft && w.team!==ft) return false;
    if(fg && w.group!==fg) return false;
    if(fo && w.owner!==fo) return false;
    if(w.team==='Team 02' && currentMember==='hai') return false;
    return true;
  }));

  // Hide Team field in form for Hải member
  const teamRow=document.getElementById('wf_team_row');
  if(teamRow) teamRow.style.display = currentMember==='hai' ? 'none' : 'grid';

  // Update group dropdown based on team filter
  const groupSel=document.getElementById('websiteFilterGroup');
  if(groupSel){
    const cur=groupSel.value;
    groupSel.innerHTML='<option value="">Tất cả nhóm</option>';
    if(ft!=='Team 02'){
      wsGroups.forEach(g=>{ const o=document.createElement('option'); o.value=g; o.textContent=g; groupSel.appendChild(o); });
      groupSel.value=cur;
    }
  }

  // Update wf_group select
  const wfGroup=document.getElementById('wf_group');
  if(wfGroup){
    const cur2=wfGroup.value;
    wfGroup.innerHTML='<option value="">-- Không có nhóm --</option>';
    wsGroups.forEach(g=>{ const o=document.createElement('option'); o.value=g; o.textContent=g; wfGroup.appendChild(o); });
    if(cur2) wfGroup.value=cur2;
  }

  // Also show/hide group field based on wf_team
  const wfTeam=document.getElementById('wf_team');
  const groupRow=document.getElementById('wf_group_row');
  if(wfTeam&&groupRow) groupRow.style.display=wfTeam.value==='Team 02'?'none':'block';

  const ftr=(document.getElementById('websiteFilterTracked')||{}).value||'';
  let list=websites.filter(w=>{
    if(q && !w.brand.toLowerCase().includes(q) && !(w.url||'').toLowerCase().includes(q)) return false;
    if(fs && w.status!==fs) return false;
    if(ft && w.team!==ft) return false;
    if(fg && w.group!==fg) return false;
    if(fo && w.owner!==fo) return false;
    if(w.team==='Team 02' && currentMember==='hai') return false;
    if(ftr==='tracked' && !siteTracking.some(s=>s.wsId===w.id)) return false;
    if(ftr==='untracked' && siteTracking.some(s=>s.wsId===w.id)) return false;
    return true;
  });

  const grid=document.getElementById('websitesGrid');
  const empty=document.getElementById('emptyWebsites');
  if(!list.length){if(grid)grid.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';

  // Flat list — team/group shown as tags
  grid.innerHTML=list.map(w=>{
    _copyMap['ws_acc_'+w.id]=w.account||'';
    _copyMap['ws_pwd_'+w.id]=w.password||'';
    const _isTracked = siteTracking.some(s=>s.wsId===w.id);
    return `<div data-wsid="${w.id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid ${_isTracked?'var(--red)':'var(--gray-border)'};border-left:${_isTracked?'4px solid var(--red)':'1px solid var(--gray-border)'};margin-bottom:6px;transition:box-shadow .15s;background:${_isTracked?'#fdf9f9':'#fff'}" onmouseover="this.style.boxShadow='0 2px 10px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow=''">
      <input type="checkbox" class="ws-chk" onclick="event.stopPropagation()" onchange="wsToggleSelect(${w.id},this)" style="width:15px;height:15px;cursor:pointer;accent-color:var(--red);flex-shrink:0">
      <div style="flex:1;display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0" onclick="openWebsiteForm(${w.id})">
      <div style="width:34px;height:34px;border-radius:8px;background:${WS_STATUS_COLOR[w.status]||'#999'}22;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${WS_STATUS_ICON[w.status]||'🌐'}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span style="font-weight:600;font-size:13px">${w.brand}</span>
          ${w.team==='Team 02'?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#f0f0f0;color:#666">Team 2</span>`:''}
          ${w.group?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#fff3cd;color:#856404">${w.group}</span>`:''}
          ${w.owner&&w.owner!=='Công ty'&&w.owner!=='Chung'?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:${w.owner==='Hải'?'#fdf2f2':'#f0f7fd'};color:${w.owner==='Hải'?'var(--red)':'var(--blue)'}">${w.owner}</span>`:''}
        </div>
        <div style="font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${w.url||''}</div>
        ${w.note?`<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${w.note}</div>`:''}
      </div>
      </div><!-- end clickable -->
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        ${w.is301?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#f0f0ff;color:#6c5ce7;border:1px solid #c3b1e1;white-space:nowrap">🔀 301</span>`:''}
        ${(()=>{ const kids=websites.filter(x=>x.is301&&x.sourceUrl&&(x.sourceUrl===w.url||x.sourceUrl===w.url?.replace(/\/$/,''))); return kids.length?`<button onclick="event.stopPropagation();showW301s(${w.id})" style="font-size:10px;padding:1px 7px;border-radius:10px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;cursor:pointer;white-space:nowrap" title="Xem ${kids.length} web 301">🔀 ×${kids.length}</button>`:'' })()}
        <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${WS_STATUS_COLOR[w.status]||'#999'}18;color:${WS_STATUS_COLOR[w.status]||'#999'};white-space:nowrap">${w.status}</span>
        ${w.admin?`<a href="${joinAdminUrl(w.url,w.admin)}" target="_blank" onclick="event.stopPropagation()" class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 8px">Admin</a>`:''}
        <button onclick="event.stopPropagation();copyText(this.dataset.url,this)" data-url="${(w.url||'').replace(/"/g,'&quot;')}" class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 8px;color:var(--blue);border-color:#b8d4ea" title="Copy URL">🔗</button>
        <button onclick="event.stopPropagation();wsCopyAccount(${w.id},this)" class="btn btn-sm" style="font-size:11px;padding:2px 10px;background:#27ae60;color:#fff;border:none;font-weight:600" title="Copy tài khoản">👤 TK</button>
        <button onclick="event.stopPropagation();wsCopyPassword(${w.id},this)" class="btn btn-sm" style="font-size:11px;padding:2px 10px;background:#2980b9;color:#fff;border:none;font-weight:600" title="Copy mật khẩu">🔑 MK</button>
        <button onclick="event.stopPropagation();wsQuickAddTracking(${w.id})" class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 7px;${siteTracking.some(s=>s.wsId===w.id)?'color:#27ae60;border-color:#a8deba':'color:var(--text-muted)'}" title="${siteTracking.some(s=>s.wsId===w.id)?'Đang theo dõi':'Thêm vào theo dõi'}">📈</button>
        <button onclick="event.stopPropagation();openWebsiteForm(${w.id})" class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 7px" title="Sửa website">✏️</button>
        <button onclick="event.stopPropagation();wsVidcoCopy(${w.id},this)" class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 8px;color:var(--text-muted)" title="Copy VIDCO">📋</button>
      </div>
    </div>`;
  }).join('');
}

function openWebsiteForm(id=null){
  editingWsId=id;
  const w=id?websites.find(x=>x.id===id):null;
  document.getElementById('wfTitle').textContent=w?'✎ Sửa website':'+ Thêm website';
  document.getElementById('wf_id').value=id||'';
  document.getElementById('wf_brand').value=w?.brand||'';
  document.getElementById('wf_url').value=w?.url||'';
  document.getElementById('wf_admin').value=w?.admin||'';
  document.getElementById('wf_account').value=w?.account||'';
  document.getElementById('wf_password').value=w?.password||'';
  document.getElementById('wf_status').value=w?.status||'Tốt';
  document.getElementById('wf_note').value=w?.note||'';
  document.getElementById('wf_team').value=w?.team||'Team 01';
  // Apply team rules first (populates owner options correctly)
  onWfTeamChange();
  // Then set owner value
  document.getElementById('wf_owner').value=w?.owner||'Công ty';
  // If Hải member: hide Team field (Hải is always Team 01)
  const teamRow=document.getElementById('wf_team_row');
  if(teamRow) teamRow.style.display = currentMember==='hai' ? 'none' : 'grid';
  // Populate group select
  const wfGroup=document.getElementById('wf_group');
  if(wfGroup){
    wfGroup.innerHTML='<option value="">-- Không có nhóm --</option>';
    wsGroups.forEach(g=>{ const o=document.createElement('option'); o.value=g; o.textContent=g; wfGroup.appendChild(o); });
    wfGroup.value=w?.group||'';
  }
  document.getElementById('wf_delete_btn').style.display=w?'inline-flex':'none';
  // 301 fields
  const is301El=document.getElementById('wf_is301');
  if(is301El){
    is301El.checked=!!(w?.is301);
    document.getElementById('wf_301_fields').style.display=w?.is301?'block':'none';
    if(w?.is301){
      document.getElementById('wf_source_url').value=w?.sourceUrl||'';
      const sel=document.getElementById('wf_source_select');
      if(sel) sel.innerHTML='<option value="">-- Chọn từ kho --</option>'+websites.filter(x=>x.id!==w?.id).map(x=>`<option value="${x.url||''}">${x.brand} (${x.url||''})</option>`).join('');
    }
  }
  document.getElementById('wf_brand').focus();
}


function showW301s(wsId){
  const w = websites.find(x=>x.id===wsId);
  if(!w) return;
  const children = websites.filter(x=>x.is301&&x.sourceUrl&&(x.sourceUrl===w.url||(w.url&&x.sourceUrl.replace(/\/$/,'')===w.url.replace(/\/$/,''))));
  if(!children.length){ toast('Chưa có website 301 nào từ '+w.brand,'#e67e22'); return; }
  const overlay = document.createElement('div');
  overlay.id = 'w301Overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.onclick = e=>{ if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;width:480px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-weight:700;font-size:15px">🔀 Web 301 từ <span style="color:var(--red)">${w.brand}</span></div>
      <button onclick="document.getElementById('w301Overlay').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-muted)">×</button>
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Web gốc: <b>${w.url||''}</b></div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${children.map(x=>`
        <div style="padding:10px 12px;border:1px solid var(--gray-border);border-radius:8px;display:flex;align-items:center;gap:10px;background:#fff">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px">${x.brand}</div>
            <div style="font-size:11px;color:var(--blue)">${x.url||''}</div>
          </div>
          <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${WS_STATUS_COLOR[x.status]||'#999'}18;color:${WS_STATUS_COLOR[x.status]||'#999'}">${x.status||''}</span>
          <button onclick="document.getElementById('w301Overlay').remove();openWebsiteForm(${x.id})" class="btn btn-sm btn-outline" style="font-size:11px">✎</button>
        </div>`).join('')}
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

function wfToggle301(){
  const checked = document.getElementById('wf_is301')?.checked;
  const fields = document.getElementById('wf_301_fields');
  if(fields) fields.style.display = checked ? 'block' : 'none';
  if(checked){
    const si = document.getElementById('wf_source_search');
    if(si) si.value='';
    const sr = document.getElementById('wf_source_results');
    if(sr) sr.style.display='none';
  }
}

function wf301Search(q){
  const res = document.getElementById('wf_source_results');
  if(!res) return;
  const list = websites.filter(w=>w.id!==editingWsId && (
    !q || w.brand.toLowerCase().includes(q.toLowerCase()) || (w.url||'').toLowerCase().includes(q.toLowerCase())
  )).slice(0,8);
  if(!list.length || !q){ res.style.display='none'; return; }
  res.style.display='block';
  res.innerHTML = list.map(w=>`
    <div onclick="wf301SelectSource(${w.id})" style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #f0f0f0;display:flex;flex-direction:column;gap:2px"
      onmouseover="this.style.background='#fdf2f2'" onmouseout="this.style.background=''">
      <span style="font-weight:600">${w.brand}</span>
      <span style="color:var(--blue);font-size:11px">${w.url||''}</span>
    </div>`).join('');
}

function wf301SelectSource(wsId){
  if(!wsId) return;
  const src = websites.find(w=>w.id===parseInt(wsId));
  if(!src) return;
  // Copy all info from source except URL
  document.getElementById('wf_brand').value = src.brand||'';
  document.getElementById('wf_admin').value = src.admin||'';
  document.getElementById('wf_account').value = src.account||'';
  document.getElementById('wf_password').value = src.password||'';
  document.getElementById('wf_status').value = src.status||'Tốt';
  document.getElementById('wf_note').value = src.note||'';
  if(document.getElementById('wf_team')) document.getElementById('wf_team').value = src.team||'Team 01';
  onWfTeamChange();
  if(document.getElementById('wf_owner')) document.getElementById('wf_owner').value = src.owner||'Công ty';
  if(document.getElementById('wf_group')) document.getElementById('wf_group').value = src.group||'';
  // Store source URL
  document.getElementById('wf_source_url').value = src.url||'';
  // Update search box display
  const si = document.getElementById('wf_source_search');
  if(si) si.value = src.brand + ' — ' + (src.url||'');
  const sr = document.getElementById('wf_source_results');
  if(sr) sr.style.display='none';
  // Clear URL field so user fills it
  document.getElementById('wf_url').value = '';
  setTimeout(()=>document.getElementById('wf_url').focus(), 50);
  toast('✓ Đã sao chép thông tin từ '+src.brand+' — nhập URL mới vào', '#27ae60', 3000);
}

function clearWebsiteForm(){
  editingWsId=null;
  ['wf_brand','wf_url','wf_admin','wf_account','wf_password','wf_note'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('wf_status').value='Tốt';
  document.getElementById('wf_delete_btn').style.display='none';
  document.getElementById('wfTitle').textContent='+ Thêm website';
  const _301=document.getElementById('wf_is301'); if(_301){_301.checked=false; document.getElementById('wf_301_fields').style.display='none'; document.getElementById('wf_source_url').value='';}
}

function normalizeAdmin(v){ return (v||'').trim().replace(/^\/+|\/+$/g,''); }
function normalizeUrl(v){ return (v||'').trim().replace(/^https?:\/\//i,'').replace(/\/+$/,''); }
function joinAdminUrl(url, admin){ let u=(url||'').replace(/\/$/,''); if(u&&!/^https?:\/\//i.test(u)) u='https://'+u; const a=normalizeAdmin(admin); return a ? u+'/'+a : u; }
function ensureHttps(url){ let u=(url||'').trim().replace(/\/$/,''); if(u&&!/^https?:\/\//i.test(u)) u='https://'+u; return u; }

function saveWebsite(){
  const brand=(document.getElementById('wf_brand')?.value||'').trim();
  const url=normalizeUrl(document.getElementById('wf_url')?.value||'');
  if(!brand){toast('Vui lòng nhập tên brand!','#e74c3c');return;}
  const newId = editingWsId ? editingWsId : wsNextId++;
  const obj={
    id: newId,
    brand, url,
    admin: normalizeAdmin(document.getElementById('wf_admin')?.value),
    account: (document.getElementById('wf_account')?.value||'').trim(),
    password: document.getElementById('wf_password')?.value||'',
    status: document.getElementById('wf_status')?.value||'Tốt',
    note: (document.getElementById('wf_note')?.value||'').trim(),
    team: document.getElementById('wf_team')?.value||'Team 01',
    owner: document.getElementById('wf_owner')?.value||'Công ty',
    group: document.getElementById('wf_group')?.value||'',
    is301: document.getElementById('wf_is301')?.checked||false,
    sourceUrl: document.getElementById('wf_is301')?.checked ? (document.getElementById('wf_source_url')?.value||'').trim() : '',
  };
  if(editingWsId){
    const i=websites.findIndex(w=>w.id===editingWsId);
    if(i>=0) websites[i]=obj; else websites.push(obj);
  } else {
    // Check for duplicate URL
    // Chỉ check trùng URL, không check brand (nhiều web có thể cùng brand)
    const dup = url && websites.find(w=>w.url&&w.url.replace(/\/$/,'')===url.replace(/\/$/,''));
    if(dup){
      const msg = 'Website "'+dup.brand+'" ('+dup.url+') đã tồn tại!\n\nChọn:\n• OK = Thay thế thông tin cũ bằng dữ liệu vừa nhập\n• Huỷ = Bỏ, giữ nguyên dữ liệu cũ';
      if(confirm(msg)){
        const i=websites.findIndex(w=>w.id===dup.id);
        if(i>=0) websites[i]={...obj, id:dup.id};
      } else {
        return; // Cancel - keep old data, discard new
      }
    } else {
      websites.push(obj);
    }
  }
  editingWsId=null;
  clearWebsiteForm();
  saveAppData();
  renderWebsites();
  autoFillAnchors();
  updateWsIcons();
  toast('✓ Đã lưu website: '+brand);
}

function deleteWebsite(){
  if(!editingWsId||!confirm('Xoá website này?')) return;
  websites=websites.filter(w=>w.id!==editingWsId);
  clearWebsiteForm();
  saveAppData();
  renderWebsites();
  updateWsIcons();
  toast('Đã xoá.');
}

function toggleWfPassword(){
  const inp=document.getElementById('wf_password');
  inp.type=inp.type==='password'?'text':'password';
}

// ===== WEBSITE LOOKUP from sheet =====
let websiteInfoTarget = null;

function checkWebsiteInSheet(url, btn){
  if(!url||!url.trim()){toast('Ô website đang trống!','#e67e22');return;}
  const q=url.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const found=websites.find(w=>{
    const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    return wu===q || wu.includes(q) || q.includes(wu);
  });
  // Update the lookup button icon to show status
  if(btn){
    if(found){
      btn.textContent = WS_STATUS_ICON[found.status]||'✅';
      btn.title = found.brand+' — '+found.status;
      btn.style.opacity='1';
      btn.style.color=WS_STATUS_COLOR[found.status]||'#27ae60';
    } else {
      btn.textContent='❓';
      btn.title='Chưa nhận diện được';
      btn.style.opacity='1';
      btn.style.color='#e67e22';
    }
  }
  if(found){
    websiteInfoTarget=found;
    showWebsiteInfo(found, true);
  } else {
    showWebsiteInfo(null, false, url);
  }
}

const _copyMap = {};
function _cp(key,btn){ copyText(_copyMap[key]||'',btn); }

function showWebsiteInfo(w, found, url=''){
  const body=document.getElementById('websiteInfoBody');
  if(!found){
    // Show inline add form directly in popup — no navigation needed
    body.innerHTML=`
      <div style="padding:14px 16px;background:#fff8ee;border-bottom:1px solid #fce0b0;display:flex;align-items:center;gap:8px">
        <span style="font-size:18px">❓</span>
        <div>
          <div style="font-weight:600;color:#e67e22">Chưa nhận diện được</div>
          <div style="font-size:11px;color:var(--text-muted)">"${url}" chưa có trong danh sách</div>
        </div>
      </div>
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:2px">Thêm vào danh sách Websites:</div>
        <div class="form-group"><label>Tên brand *</label><input type="text" id="wi_brand" style="width:100%" placeholder="VD: CafeLegend"></div>
        <div class="form-group"><label>URL</label><input type="text" id="wi_url" value="${url}" style="width:100%"></div>
        <div class="form-group"><label>Đuôi quản trị</label><input type="text" id="wi_admin" style="width:100%" placeholder="wp-admin"></div>
        <div class="form-group"><label>Tài khoản</label><input type="text" id="wi_account" style="width:100%"></div>
        <div class="form-group">
          <label>Mật khẩu</label>
          <div style="display:flex;gap:4px">
            <input type="password" id="wi_password" style="flex:1">
            <button onclick="const i=document.getElementById('wi_password');i.type=i.type==='password'?'text':'password'" style="background:none;border:1px solid var(--gray-border);border-radius:6px;padding:0 8px;cursor:pointer">👁</button>
          </div>
        </div>
        <div class="form-group"><label>Trạng thái</label>
          <select id="wi_status" style="width:100%">
            <option value="Tốt">✅ Tốt</option>
            <option value="Chờ cấp lại mật khẩu">🔒 Chờ cấp lại mật khẩu</option>
            <option value="Lỗi web">⚠️ Lỗi web</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="saveWebsiteFromPopup()">&#43; Thêm vào danh sách</button>
      </div>`;
    document.getElementById('wiBtnEdit').style.display='none';
    const _ob=document.getElementById('wiBtnOpen'); if(_ob) _ob.style.display='none';
    const _vb=document.getElementById('wiBtnVidco'); if(_vb) _vb.style.display='none';
  } else {
    const safeAcc = (w.account||'').replace(/"/g,'&quot;');
    const safePwd = (w.password||'').replace(/"/g,'&quot;');
    _copyMap['wi_acc'] = w.account||'';
    _copyMap['wi_pwd'] = w.password||'';
    const _vidcoDomain = (w.url||'').replace(/https?:\/\//,'').replace(/\/$/,'');
    const _vidcoAdminUrl = (w.url&&w.admin) ? joinAdminUrl(w.url,w.admin) : '';
    const _vidcoOwner = (w.owner&&w.owner!=='Công ty'&&w.owner!=='Chung') ? w.owner : '';
    _copyMap['wi_vidco'] = _vidcoDomain+' | '+_vidcoAdminUrl+' | '+(w.account||'')+' | '+(w.password||'')+' | '+(w.group||'')+' | '+_vidcoOwner;
    const rows=[
      ['Brand', w.brand],
      ['URL', `<a href="${ensureHttps(w.url)}" target="_blank" style="color:var(--blue)">${w.url}</a>`],
      ['Quản trị', w.admin?`<a href="${joinAdminUrl(w.url,w.admin)}" target="_blank" style="color:var(--blue)">${w.admin}</a>`:'—'],
      ['Tài khoản', w.account ? `<div style="display:flex;align-items:center;gap:6px">
        <span style="flex:1;user-select:all">${w.account}</span>
        <button onclick="_cp('wi_acc',this)" style="background:none;border:1px solid var(--gray-border);border-radius:4px;cursor:pointer;padding:2px 7px;font-size:12px;color:var(--text-muted)" title="Copy">📋</button>
      </div>` : '—'],
      ['Mật khẩu', w.password ? `<div style="display:flex;align-items:center;gap:6px">
        <span style="flex:1;user-select:all;font-family:monospace;letter-spacing:1px">${w.password}</span>
        <button onclick="_cp('wi_pwd',this)" style="background:none;border:1px solid var(--gray-border);border-radius:4px;cursor:pointer;padding:2px 7px;font-size:12px;color:var(--text-muted)" title="Copy">📋</button>
      </div>` : '—'],
      ['Trạng thái', `<span style="color:${WS_STATUS_COLOR[w.status]||'#999'};font-weight:600">${WS_STATUS_ICON[w.status]||''} ${w.status}</span>`],
      w.note?['Ghi chú', w.note]:null,
    ].filter(Boolean);
    body.innerHTML=`
      <div style="padding:12px 16px;background:#f0faf4;border-bottom:1px solid #b7e4c7;display:flex;align-items:center;gap:8px">
        <span style="font-size:20px">✅</span>
        <span style="font-weight:600;color:#27ae60">Đã nhận diện: ${w.brand}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${rows.map(([k,v])=>`
          <tr>
            <td style="padding:9px 16px;color:var(--text-muted);font-weight:500;width:100px;border-bottom:1px solid var(--gray-border);white-space:nowrap">${k}</td>
            <td style="padding:9px 16px;border-bottom:1px solid var(--gray-border)">${v}</td>
          </tr>`).join('')}
      </table>`;
    document.getElementById('wiBtnEdit').style.display='inline-flex';
    const _vBtn=document.getElementById('wiBtnVidco'); if(_vBtn) _vBtn.style.display='inline-flex';
    const adminUrl = (w.url&&w.admin) ? joinAdminUrl(w.url,w.admin) : '';
    const btnOpen = document.getElementById('wiBtnOpen');
    if(btnOpen){ btnOpen.style.display = adminUrl ? 'inline-flex' : 'none'; btnOpen._href = adminUrl; }
  }
  document.getElementById('websiteInfoModal').classList.add('open');
}

function saveWebsiteFromPopup(){
  const brand=(document.getElementById('wi_brand')?.value||'').trim();
  const url=(document.getElementById('wi_url')?.value||'').trim();
  if(!brand){toast('Nhập tên brand!','#e74c3c');return;}
  const obj={
    id:wsNextId++,
    brand,url,
    admin:(document.getElementById('wi_admin')?.value||'').trim(),
    account:(document.getElementById('wi_account')?.value||'').trim(),
    password:document.getElementById('wi_password')?.value||'',
    status:document.getElementById('wi_status')?.value||'Tốt',
    note:'',
  };
  websites.unshift(obj);
  saveAppData();
  closeWebsiteInfo();
  // Re-render websites panel if visible
  if(document.getElementById('websitesPanel')?.style.display!=='none') renderWebsites();
  toast('✓ Đã thêm '+brand+' vào danh sách!');
}

function wiOpenAdmin(){ const btn=document.getElementById('wiBtnOpen'); if(btn&&btn._href) window.open(btn._href,'_blank'); }

function closeWebsiteInfo(){document.getElementById('websiteInfoModal').classList.remove('open');}

function goEditWebsite(){
  if(!websiteInfoTarget) return;
  const w=websiteInfoTarget;
  const body=document.getElementById('websiteInfoBody');
  const groupOpts = ['<option value="">-- Không có --</option>', ...wsGroups.map(g=>`<option value="${g}" ${w.group===g?'selected':''}>${g}</option>`)].join('');
  const isTeam2 = w.team==='Team 02';
  body.innerHTML=`
    <div style="padding:10px 16px;background:#f8f9fa;border-bottom:1px solid var(--gray-border);font-weight:600;font-size:13px">✎ Sửa: ${w.brand}</div>
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
      <div class="form-group"><label>Tên brand *</label><input type="text" id="we_brand" value="${w.brand.replace(/"/g,'&quot;')}" style="width:100%"></div>
      <div class="form-group"><label>URL</label><input type="text" id="we_url" value="${(w.url||'').replace(/"/g,'&quot;')}" style="width:100%"></div>
      <div class="form-group"><label>Đuôi quản trị</label><input type="text" id="we_admin" value="${(w.admin||'').replace(/"/g,'&quot;')}" style="width:100%"></div>
      <div class="form-group"><label>Tài khoản</label><input type="text" id="we_account" value="${(w.account||'').replace(/"/g,'&quot;')}" style="width:100%"></div>
      <div class="form-group">
        <label>Mật khẩu</label>
        <div style="display:flex;gap:4px">
          <input type="password" id="we_password" value="${(w.password||'').replace(/"/g,'&quot;')}" style="flex:1">
          <button onclick="const i=document.getElementById('we_password');i.type=i.type==='password'?'text':'password'" style="background:none;border:1px solid var(--gray-border);border-radius:6px;padding:0 8px;cursor:pointer">👁</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="form-group">
          <label>Team</label>
          <select id="we_team" style="width:100%" onchange="weOnTeamChange()" ${currentMember==='hai'?'disabled':''}>
            <option value="Team 01" ${w.team!=='Team 02'?'selected':''}>Team 01</option>
            <option value="Team 02" ${w.team==='Team 02'?'selected':''}>Team 02</option>
          </select>
        </div>
        <div class="form-group">
          <label>Người quản lý</label>
          <select id="we_owner" style="width:100%">
            <option value="Công ty" ${w.owner==='Công ty'||!w.owner?'selected':''}>Công ty</option>
            <option value="Hải" ${w.owner==='Hải'?'selected':''}>Hải</option>
            <option value="Hiếu" ${w.owner==='Hiếu'?'selected':''}>Hiếu</option>
          </select>
        </div>
      </div>
      <div class="form-group" id="we_group_row" style="${isTeam2?'display:none':''}">
        <label>Nhóm con <span style="font-size:11px;color:var(--text-muted)">(Team 01)</span></label>
        <select id="we_group" style="width:100%">${groupOpts}</select>
      </div>
      <div class="form-group"><label>Trạng thái</label>
        <select id="we_status" style="width:100%">
          <option value="Tốt" ${w.status==='Tốt'?'selected':''}>✅ Tốt</option>
          <option value="Chờ cấp lại mật khẩu" ${w.status==='Chờ cấp lại mật khẩu'?'selected':''}>🔒 Chờ cấp lại mật khẩu</option>
          <option value="Lỗi web" ${w.status==='Lỗi web'?'selected':''}>⚠️ Lỗi web</option>
        </select>
      </div>
      <div class="form-group"><label>Ghi chú</label><textarea id="we_note" rows="2" style="width:100%">${w.note||''}</textarea></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary" onclick="saveWebsiteFromModal(${w.id})" style="flex:1">✓ Lưu</button>
        <button class="btn btn-danger btn-sm" onclick="deleteWebsiteFromModal(${w.id})">🗑</button>
      </div>
    </div>`;
  document.getElementById('wiBtnEdit').style.display='none';
}

function weOnTeamChange(){
  const t = document.getElementById('we_team')?.value;
  const gr = document.getElementById('we_group_row');
  const ow = document.getElementById('we_owner');
  if(gr) gr.style.display = t==='Team 02'?'none':'';
  if(ow){
    const cur=ow.value;
    ow.innerHTML = t==='Team 02'
      ? '<option value="Công ty">Công ty</option><option value="Hiếu">Hiếu</option>'
      : '<option value="Công ty">Công ty</option><option value="Hải">Hải</option><option value="Hiếu">Hiếu</option>';
    if([...ow.options].find(o=>o.value===cur)) ow.value=cur; else ow.value='Công ty';
  }
}

function saveWebsiteFromModal(id){
  const brand=(document.getElementById('we_brand')?.value||'').trim();
  if(!brand){toast('Nhập tên brand!','#e74c3c');return;}
  const idx=websites.findIndex(w=>w.id===id);
  if(idx>=0){
    websites[idx]={...websites[idx],
      brand,
      url:(document.getElementById('we_url')?.value||'').trim(),
      admin:normalizeAdmin(document.getElementById('we_admin')?.value),
      account:(document.getElementById('we_account')?.value||'').trim(),
      password:document.getElementById('we_password')?.value||'',
      team:document.getElementById('we_team')?.value||websites[idx].team||'Team 01',
      owner:document.getElementById('we_owner')?.value||'Công ty',
      group:document.getElementById('we_group')?.value||'',
      status:document.getElementById('we_status')?.value||'Tốt',
      note:document.getElementById('we_note')?.value||'',
    };
  }
  saveAppData();
  closeWebsiteInfo();
  if(document.getElementById('websitesPanel')?.style.display!=='none') renderWebsites();
  toast('✓ Đã cập nhật!');
}

function deleteWebsiteFromModal(id){
  if(!confirm('Xoá website này?')) return;
  websites=websites.filter(w=>w.id!==id);
  saveAppData();
  closeWebsiteInfo();
  if(document.getElementById('websitesPanel')?.style.display!=='none') renderWebsites();
  toast('Đã xoá.');
}
// ===== AUTOCOMPLETE =====
function acGetValues(field){
  const all = new Set();
  if(field === 'website'){
    // Lấy từ danh sách Link Tổng (websites) — nguồn chính xác
    if(typeof websites !== 'undefined' && Array.isArray(websites)){
      websites.forEach(w=>{
        const v = (w.url||'').trim();
        if(v) all.add(v);
      });
    }
    // Bổ sung thêm các website đã dùng trong sheet bài (phòng trường hợp chưa có trong link tổng)
    const person = document.getElementById('fPerson')?.value || '';
    const sheet = person==='Hải' ? data.hai : person==='Hiếu' ? data.hieu : [...data.hai,...data.hieu];
    (Array.isArray(sheet)?sheet:[...sheet]).forEach(r=>{
      const v = (r[field]||'').trim();
      if(v) all.add(v);
    });
    return [...all].sort();
  }
  const person = document.getElementById('fPerson')?.value || '';
  const sheet = person==='Hải' ? data.hai : person==='Hiếu' ? data.hieu : [...data.hai,...data.hieu];
  (Array.isArray(sheet)?sheet:[...sheet]).forEach(r=>{
    const v = (r[field]||'').trim();
    if(v) all.add(v);
  });
  return [...all].sort();
}

function acInput(input, listId, field){
  const list = document.getElementById(listId);
  if(!list) return;
  const q = (input.value||'').toLowerCase().trim();
  const vals = acGetValues(field).filter(v=> !q || v.toLowerCase().includes(q));
  if(!vals.length){ list.classList.remove('open'); return; }
  // Tăng giới hạn lên 50 kết quả (trước là 10)
  list.innerHTML = vals.slice(0,50).map(v=>
    `<div class="ac-item" onmousedown="acSelect('${input.id}','${listId}','${v.replace(/'/g,"\\'")}')">
      ${v}
    </div>`
  ).join('');
  list.classList.add('open');
}

function acSelect(inputId, listId, val){
  const input = document.getElementById(inputId);
  if(input) input.value = val;
  acClose(listId);
}

function acClose(listId){
  const list = document.getElementById(listId);
  if(list) list.classList.remove('open');
}

// Close all autocomplete on click outside
document.addEventListener('click', e=>{
  if(!e.target.closest('.ac-wrap')) document.querySelectorAll('.ac-list').forEach(l=>l.classList.remove('open'));
});
function wsBulkCopyUrls(btn){
  if(!_wsSelected.size) return;
  const urls = [..._wsSelected].map(id=>{
    const w = websites.find(x=>x.id===id);
    return w?.url||'';
  }).filter(Boolean).join('\n');
  copyText(urls, btn);
}

function wsBulkDelete(){
  if(!_wsSelected.size) return;
  const count = _wsSelected.size;
  if(!confirm('Xoá '+count+' website đã chọn?')) return;
  websites = websites.filter(w=>!_wsSelected.has(w.id));
  _wsSelected.clear();
  saveAppData(); renderWebsites(); updateWsIcons();
  toast('✓ Đã xoá '+count+' website.');
}

function wsBulkEditToggle(){
  const panel = document.getElementById('wsBulkEditPanel');
  const btn = document.getElementById('wsBulkEditBtn');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  btn.textContent = isOpen ? '✏ Sửa hàng loạt' : '✕ Đóng';
}

function wsBulkApplyEdit(){
  if(!_wsSelected.size) return;
  const admin   = document.getElementById('wbe_admin')?.value.trim();
  const status  = document.getElementById('wbe_status')?.value;
  const team    = document.getElementById('wbe_team')?.value;
  const owner   = document.getElementById('wbe_owner')?.value;
  const group   = document.getElementById('wbe_group')?.value.trim();
  const account = document.getElementById('wbe_account')?.value.trim();
  const password= document.getElementById('wbe_password')?.value.trim();
  let count = 0;
  websites.forEach(w=>{
    if(!_wsSelected.has(w.id)) return;
    if(admin)    w.admin    = normalizeAdmin(admin);
    if(status)   w.status   = status;
    if(team)     w.team     = team;
    if(owner)    w.owner    = owner;
    if(group)    w.group    = group;
    if(account)  w.account  = account;
    if(password) w.password = password;
    count++;
  });
  saveAppData(); renderWebsites(); autoFillAnchors(); updateWsIcons();
  // Reset fields
  ['wbe_admin','wbe_group','wbe_account','wbe_password'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  ['wbe_status','wbe_team','wbe_owner'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  toast('✓ Đã cập nhật '+count+' website.');
}

function wsToggleSelectAll(chk){
  const other = chk.id==='wsSelectAll' ? document.getElementById('wsSelectAllTop') : document.getElementById('wsSelectAll');
  if(other) other.checked = chk.checked;
  // Each .ws-chk has onchange="wsToggleSelect(ID, this)" — extract ID from that
  document.querySelectorAll('.ws-chk').forEach(c=>{
    c.checked = chk.checked;
    // Extract id from the onchange attribute
    const match = (c.getAttribute('onchange')||'').match(/wsToggleSelect\((\d+)/);
    if(match){
      const id = parseInt(match[1]);
      if(chk.checked) _wsSelected.add(id);
      else _wsSelected.delete(id);
    }
  });
  const bar = document.getElementById('wsBulkBar');
  if(bar){
    bar.style.display = _wsSelected.size ? 'flex' : 'none';
    const cnt = document.getElementById('wsBulkCount');
    if(cnt) cnt.textContent = _wsSelected.size+' web đã chọn';
  }
}

function wsSetStatusFilter(val){
  // Store in hidden input
  const el = document.getElementById('websiteFilterStatus');
  if(el) el.value = val;
  // Update pill active states
  const pills = {
    'wsPillAll': '', 'wsPillTot': 'Tốt',
    'wsPillMK': 'Chờ cấp lại mật khẩu', 'wsPillLoi': 'Lỗi web'
  };
  Object.entries(pills).forEach(([id, v])=>{
    const btn = document.getElementById(id);
    if(!btn) return;
    const active = val===v;
    btn.style.fontWeight = active ? '700' : '';
    btn.style.boxShadow = active ? '0 0 0 2px var(--red)' : '';
  });
  renderWebsites();
}

function wsUpdatePillCounts(fullList){
  const cnt = (s) => s ? fullList.filter(w=>w.status===s).length : fullList.length;
  const set = (id, n) => { const e=document.getElementById(id); if(e) e.textContent=n; };
  set('wsCntAll', cnt(''));
  set('wsCntTot', cnt('Tốt'));
  set('wsCntMK',  cnt('Chờ cấp lại mật khẩu'));
  set('wsCntLoi', cnt('Lỗi web'));
}

function wsVidcoCopy(id, btn){
  const w = websites.find(x=>x.id===id);
  if(!w) return;
  const domain = (w.url||'').replace(/https?:\/\//,'').replace(/\/$/,'');
  const admin = (w.admin||'').trim();
  const owner = (w.owner&&w.owner!=='Công ty'&&w.owner!=='Chung') ? w.owner : '';
  const txt = domain+' | '+admin+' | '+(w.account||'')+' | '+(w.password||'')+' | '+(w.group||'')+' | '+owner;
  copyText(txt, btn);
}
function wsCopyAccount(id, btn){
  const w = websites.find(x=>x.id===id);
  if(!w) return;
  copyText(w.account||'', btn);
}
function wsCopyPassword(id, btn){
  const w = websites.find(x=>x.id===id);
  if(!w) return;
  copyText(w.password||'', btn);
}


// Website list checkbox selection for bulk VIDCO copy
let _wsSelected = new Set();
function wsToggleSelect(id, chk){
  if(chk.checked) _wsSelected.add(id);
  else _wsSelected.delete(id);
  const bar = document.getElementById('wsBulkBar');
  if(bar) bar.style.display = _wsSelected.size ? 'flex' : 'none';
  if(bar) bar.querySelector('#wsBulkCount').textContent = _wsSelected.size+' web đã chọn';
}
function wsVidcoCopyBulk(btn){
  if(!_wsSelected.size) return;
  const lines = [..._wsSelected].map(id=>{
    const w = websites.find(x=>x.id===id);
    if(!w) return null;
    const domain = (w.url||'').replace(/https?:\/\//,'').replace(/\/$/,'');
    const owner = (w.owner&&w.owner!=='Công ty'&&w.owner!=='Chung') ? w.owner : '';
    const admin = (w.admin||'').trim();
    return domain+' | '+admin+' | '+(w.account||'')+' | '+(w.password||'')+' | '+(w.group||'')+' | '+owner;
  }).filter(Boolean);
  copyText(lines.join('\n'), btn);
}
function wsClearSelect(){
  _wsSelected.clear();
  document.querySelectorAll('.ws-chk').forEach(c=>c.checked=false);
  ['wsSelectAll','wsSelectAllTop'].forEach(id=>{ const e=document.getElementById(id); if(e) e.checked=false; });
  const bar=document.getElementById('wsBulkBar');
  if(bar) bar.style.display='none';
}

// [REMOVED: WEBSITE IMPORT] // ===== TASK TRASH =====
function updateTrashBadge(){
  const el=document.getElementById('trashCount');
  if(!el) return;
  if(deletedTasks.length>0){ el.textContent=deletedTasks.length; el.style.display='block'; }
  else el.style.display='none';
}

function openTaskTrash(){
  renderTrash();
  document.getElementById('taskTrashModal').classList.add('open');
}
function closeTaskTrash(){ document.getElementById('taskTrashModal').classList.remove('open'); }

function renderTrash(){
  const body=document.getElementById('trashBody');
  if(!deletedTasks.length){
    body.innerHTML='<div style="padding:32px;text-align:center;color:var(--text-muted)"><div style="font-size:32px;margin-bottom:8px">✅</div>Thùng rác trống</div>';
    return;
  }
  body.innerHTML=deletedTasks.map((t,i)=>{
    const dt=t._deletedAt?new Date(t._deletedAt).toLocaleDateString('vi-VN'):'';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--gray-border);border-radius:8px;background:#fff">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${t.name}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
          ${t.person?`👤 ${t.person} · `:''}${t.type||''} · Xoá ${dt}
        </div>
      </div>
      <button onclick="restoreTask(${i})" class="btn btn-sm btn-outline" style="font-size:11px;white-space:nowrap">↩ Khôi phục</button>
      <button onclick="permanentDeleteTask(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px" title="Xoá vĩnh viễn"
        onmouseover="this.style.color='#e74c3c'" onmouseout="this.style.color='var(--text-muted)'">🗑</button>
    </div>`;
  }).join('');
}

function restoreTask(idx){
  const t={...deletedTasks[idx]};
  delete t._deletedAt;
  normalizeTaskCards(t);
  deletedTasks.splice(idx,1);
  tasks.unshift(t);
  saveAppData();
  renderTrash();
  renderTasksOverview();
  updateTrashBadge();
  toast('✓ Đã khôi phục: '+t.name);
}

function permanentDeleteTask(idx){
  const name=deletedTasks[idx].name;
  if(!confirm('Xoá vĩnh viễn "'+name+'"? Không thể khôi phục!')) return;
  deletedTasks.splice(idx,1);
  try{ localStorage.setItem('wt_trash_ts', String(Date.now())); }catch(e){}
  saveAppData();
  renderTrash();
  updateTrashBadge();
  toast('Đã xoá vĩnh viễn.');
}

function emptyTrash(){
  if(!deletedTasks.length) return;
  if(!confirm('Xoá vĩnh viễn tất cả '+deletedTasks.length+' task trong thùng rác?')) return;
  deletedTasks=[];
  try{ localStorage.setItem('wt_trash_ts', String(Date.now())); }catch(e){}
  saveAppData();
  renderTrash();
  updateTrashBadge();
  toast('Đã dọn sạch thùng rác.');
}

function updateOwnerFilters(m){
  const linkOwner=document.getElementById('linkFilterOwner');
  if(linkOwner){
    const cur=linkOwner.value;
    if(m==='hai') linkOwner.innerHTML='<option value="">Tất cả</option><option value="admin">Chung</option><option value="Hải">Hải</option>';
    else if(m==='hieu') linkOwner.innerHTML='<option value="">Tất cả</option><option value="admin">Chung</option><option value="Hiếu">Hiếu</option>';
    else linkOwner.innerHTML='<option value="">Tất cả</option><option value="admin">Chung (tất cả)</option><option value="Hải">Hải</option><option value="Hiếu">Hiếu</option>';
    linkOwner.value=['','admin','Hải','Hiếu'].includes(cur)?cur:'';
  }
  const wsOwner=document.getElementById('websiteFilterOwner');
  if(wsOwner){
    const cur2=wsOwner.value;
    if(m==='hai') wsOwner.innerHTML='<option value="">Tất cả người</option><option value="Công ty">Công ty</option><option value="Hải">Hải</option>';
    else if(m==='hieu') wsOwner.innerHTML='<option value="">Tất cả người</option><option value="Công ty">Công ty</option><option value="Hiếu">Hiếu</option>';
    else wsOwner.innerHTML='<option value="">Tất cả người</option><option value="Công ty">Công ty</option><option value="Hải">Hải</option><option value="Hiếu">Hiếu</option>';
    wsOwner.value=['','Công ty','Hải','Hiếu'].includes(cur2)?cur2:'';
  }
}

function onWfTeamChange(){
  const team = document.getElementById('wf_team')?.value;
  const ownerSel = document.getElementById('wf_owner');
  const groupRow = document.getElementById('wf_group')?.closest('.form-group');

  // Owner options: Team 01 = Công ty/Hải/Hiếu, Team 02 = Công ty/Hiếu only
  if(ownerSel){
    const cur = ownerSel.value;
    ownerSel.innerHTML = team==='Team 02'
      ? '<option value="Công ty">Công ty</option><option value="Hiếu">Hiếu</option>'
      : '<option value="Công ty">Công ty</option><option value="Hải">Hải</option><option value="Hiếu">Hiếu</option>';
    // If previous value still valid, keep it
    if([...ownerSel.options].find(o=>o.value===cur)) ownerSel.value=cur;
    else ownerSel.value='Công ty';
  }
  // Group only for Team 01
  if(groupRow) groupRow.style.display = team==='Team 02' ? 'none' : 'block';
}
function openWsGroupManager(){
  renderWsGroupList();
  document.getElementById('wsGroupModal').classList.add('open');
}
function closeWsGroupManager(){
  document.getElementById('wsGroupModal').classList.remove('open');
  renderWebsites();
}
function renderWsGroupList(){
  const el=document.getElementById('wsGroupList');
  if(!el) return;
  el.innerHTML=wsGroups.map((g,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#fff;border:1px solid var(--gray-border);border-radius:6px">
      <span style="flex:1;font-size:13px">${g}</span>
      <button onclick="deleteWsGroup(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px" onmouseover="this.style.color='#e74c3c'" onmouseout="this.style.color='var(--text-muted)'">🗑</button>
    </div>`).join('');
}
function addWsGroup(){
  const inp=document.getElementById('wsGroupInput');
  const name=(inp?.value||'').trim();
  if(!name){toast('Nhập tên nhóm!','#e74c3c');return;}
  if(wsGroups.includes(name)){toast('Nhóm đã tồn tại!','#e67e22');return;}
  wsGroups.push(name);
  if(inp) inp.value='';
  saveAppData();
  renderWsGroupList();
  toast('✓ Đã thêm nhóm: '+name);
}
function deleteWsGroup(i){
  const name=wsGroups[i];
  if(!confirm('Xoá nhóm "'+name+'"? Website trong nhóm này sẽ không có nhóm.')) return;
  wsGroups.splice(i,1);
  websites.forEach(w=>{ if(w.group===name) w.group=''; });
  saveAppData();
  renderWsGroupList();
  renderWebsites();
}

// ===== LINK AUTH TOGGLE =====
function toggleLfAuth(){
  const checked = document.getElementById('lf_has_auth').checked;
  const fields = document.getElementById('lf_auth_fields');
  if(fields) fields.style.display = checked ? 'flex' : 'none';
}

// ===== TASK SELECTION & BULK =====

function onTaskCheck(id, chk){
  const numId = parseInt(id);
  if(chk.checked) selectedTaskIds.add(numId);
  else selectedTaskIds.delete(numId);

  updateTaskBulkBar();
}

function updateTaskBulkBar(){
  const bar = document.getElementById('taskBulkBar');
  const cnt = document.getElementById('taskBulkCount');
  if(!bar) return;
  if(selectedTaskIds.size > 0){
    bar.style.display='flex';
    cnt.textContent = selectedTaskIds.size + ' task đã chọn';
  } else {
    bar.style.display='none';
  }
}

function clearTaskSelection(){
  selectedTaskIds.clear();
  document.querySelectorAll('.task-chk').forEach(c=>c.checked=false);
  updateTaskBulkBar();
}

function confirmDeleteTask(id){
  const found = tasks.find(x=>x.id===id);
  if(!found) return;
  deletedTasks.unshift({...found, _deletedAt: Date.now()});
  tasks = tasks.filter(x=>x.id!==id);
  selectedTaskIds.delete(id);
  saveAppData();
  renderTasksOverview();
  toast('🗑 Đã xoá task. <a onclick="undoDeleteTask('+id+')" style="color:#fff;text-decoration:underline;cursor:pointer;font-weight:600">Hoàn tác</a>', '#2c3e50', 6000);
}

function undoDeleteTask(id){
  const idx=deletedTasks.findIndex(t=>t.id===id);
  if(idx<0) return;
  const t={...deletedTasks[idx]};
  delete t._deletedAt;
  deletedTasks.splice(idx,1);
  tasks.unshift(t);
  saveAppData();
  renderTasksOverview();
  toast('✓ Đã khôi phục task!');
}

function bulkTaskDelete(){
  if(!selectedTaskIds.size) return;
  const ids = new Set([...selectedTaskIds].map(x=>parseInt(x)));
  const n = ids.size;
  tasks.forEach(t=>{ if(ids.has(parseInt(t.id))) deletedTasks.unshift({...t,_deletedAt:Date.now()}); });
  tasks = tasks.filter(t=>!ids.has(parseInt(t.id)));
  selectedTaskIds.clear();
  saveAppData();
  renderTasksOverview();
  toast('🗑 Đã xoá '+n+' task. <a onclick="undoDeleteBulk()" style="color:#fff;text-decoration:underline;cursor:pointer;font-weight:600">Hoàn tác</a>', '#2c3e50', 5000);
}

function bulkTaskDone(){
  if(!selectedTaskIds.size) return;
  const _doneIds = new Set([...selectedTaskIds].map(x=>parseInt(x)));
  const n = _doneIds.size;
  tasks.forEach(t=>{
    if(!_doneIds.has(parseInt(t.id))) return;
    const cols = getProjectCols(t);
    const doneColId = cols.length >= 2 ? cols[cols.length-2].id : cols[cols.length-1].id;
    (t.cards||[]).forEach(c=>{ c.colId = doneColId; });
  });
  selectedTaskIds.clear();
  saveAppData();
  renderTasksOverview();
  toast('✓ Đã Done ' + n + ' task!');
}

// ===== QUICK LINK SEARCH (HEADER) =====
let _qlItems = []; // store for index-based access in qlOpenAdmin

function qlGetItems(){
  const workItems = links.filter(l=>l.type==='work'||!l.type).map(l=>({
    icon:'🔗', label:l.name, sub:l.url, url:l.url,
    account:l.account, password:l.password
  }));
  const webItems = websites.filter(w=> currentMember!=='hai' || w.team!=='Team 02').map(w=>({
    icon: WS_STATUS_ICON[w.status]||'🌐',
    label:w.brand, sub:w.url,
    url: joinAdminUrl(w.url, w.admin),
    account:w.account, password:w.password,
    wsId: w.id
  }));
  return [...workItems, ...webItems];
}

function qlOpenAdmin(idx){
  const item = _qlItems[idx];
  if(!item) return;
  window.open(item.url, '_blank');
  document.getElementById('uniInput').value='';
  qlClose();
}

function qlEditWebsite(wsId){
  const w = websites.find(x=>x.id===wsId);
  if(!w) return;
  qlClose();
  document.getElementById('uniInput').value='';
  // Open websiteInfoModal directly in edit mode
  websiteInfoTarget = w;
  showWebsiteInfo(w, true);
  // Switch immediately to edit form
  setTimeout(goEditWebsite, 50);
}

function qlSearch(){
  const q=(qlGetInput()||'').toLowerCase();
  const all=qlGetItems();
  const res=q?all.filter(i=>i.label.toLowerCase().includes(q)||(i.sub||'').toLowerCase().includes(q)):all.slice(0,8);
  _qlItems = res; // store for qlOpenAdmin
  const drop=document.getElementById('qlDropdown');
  if(!drop) return;
  if(!res.length){drop.innerHTML='<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12px">Không tìm thấy — nhấn + để thêm</div>';drop.style.display='block';return;}
  drop.innerHTML=res.map((item,idx)=>`
    <div class="search-item" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--gray-border);transition:background .1s"
      onclick="window.open('${item.url.replace(/'/g,"\\'")}','_blank');document.getElementById('uniInput').value='';qlClose()">
      <span style="font-size:16px;flex-shrink:0">${item.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#212529">${item.label}</div>
        <div style="font-size:11px;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.sub||''}</div>
      </div>
      ${item.account?`<div onclick="event.stopPropagation()" style="display:flex;gap:4px">
        <button onclick="event.stopPropagation();copyText('${(item.account||'').replace(/'/g,"\\'")}',this)" style="background:none;border:1px solid var(--gray-border);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer" title="Copy tài khoản">👤</button>
        ${item.password?`<button onclick="event.stopPropagation();copyText('${(item.password||'').replace(/'/g,"\\'")}',this)" style="background:none;border:1px solid var(--gray-border);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer" title="Copy mật khẩu">🔑</button>`:''}
      </div>`:''}
      ${item.wsId?`<button onclick="event.stopPropagation();wsVidcoCopy(${item.wsId},this)" style="background:none;border:1px solid var(--gray-border);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer" title="Copy VIDCO">📋</button>`:''}
      ${item.wsId?`<button onclick="event.stopPropagation();qlEditWebsite(${item.wsId})" style="background:none;border:1px solid var(--gray-border);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer;color:#e67e22" title="Sửa website">✏️</button>`:''}
      <button onclick="event.stopPropagation();qlOpenAdmin(${idx})" class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 8px;white-space:nowrap;color:var(--text)" title="${item.account?'Mở trang quản trị':'Mở link'}">Mở</button>
    </div>`).join('');
  drop.style.display='block';
}

let _qlKeepOpen = false;
function qlClose(){
  if(_qlKeepOpen){ _qlKeepOpen=false; return; }
  const d=document.getElementById('qlDropdown'); if(d) d.style.display='none';
}

function qlKeydown(e){
  if(e.key==='Escape'){qlClose();e.target.blur();}
  if(e.key==='Enter'){
    const v=e.target.value.trim();
    if(v.startsWith('http')) window.open(v,'_blank');
  }
}

function qlOpenAdd(){
  qlClose();
  const q=(qlGetInput()||'').trim();
  document.getElementById('ql_name').value='';
  document.getElementById('ql_url').value=q.startsWith('http')?q:'';
  document.getElementById('ql_group').value='';
  document.getElementById('ql_admin').value='';
  document.getElementById('ql_account').value='';
  document.getElementById('ql_password').value='';
  const _qlNote=document.getElementById('ql_note'); if(_qlNote) _qlNote.value='';
  const _qlTeam=document.getElementById('ql_team'); if(_qlTeam) _qlTeam.value='Team 01';
  const _qlOwner=document.getElementById('ql_owner'); if(_qlOwner) _qlOwner.value='Công ty';
  const _qlStatus=document.getElementById('ql_status'); if(_qlStatus) _qlStatus.value='Tốt';
  const _qlDesc=document.getElementById('ql_desc'); if(_qlDesc) _qlDesc.value='';
  const _qlNoteW=document.getElementById('ql_note_work'); if(_qlNoteW) _qlNoteW.value='';
  const _qlAccW=document.getElementById('ql_account_work'); if(_qlAccW) _qlAccW.value='';
  const _qlPwdW=document.getElementById('ql_password_work'); if(_qlPwdW) _qlPwdW.value='';
  document.getElementById('ql_type').value='work';
  qlTypeChange();
  document.getElementById('qlAddModal').style.display='block';
  document.getElementById('qlOverlay').style.display='block';
  setTimeout(()=>document.getElementById('ql_name').focus(),100);
}

function qlCloseAdd(){
  document.getElementById('qlAddModal').style.display='none';
  document.getElementById('qlOverlay').style.display='none';
}

function qlTypeChange(){
  const t=document.getElementById('ql_type').value;
  document.getElementById('ql_extra_work').style.display=t==='work'?'flex':'none';
  document.getElementById('ql_extra_web').style.display=t==='web'?'flex':'none';
  if(t==='work'){
    const sel=document.getElementById('ql_group');
    if(sel){ sel.innerHTML=linkCategories.work.map(g=>`<option value="${g}">${g}</option>`).join(''); }
  }
  if(t==='web'){
    const sel=document.getElementById('ql_group_ws');
    if(sel){ sel.innerHTML='<option value="">-- Không có --</option>'+wsGroups.map(g=>`<option value="${g}">${g}</option>`).join(''); }
  }
}

function qlToggleNewGroup(){
  const inp=document.getElementById('ql_group_new');
  const sel=document.getElementById('ql_group');
  const btn=document.getElementById('ql_group_add_btn');
  if(inp.style.display==='none'){
    inp.style.display='block'; sel.style.display='none'; btn.textContent='✓';
    inp.focus();
  } else {
    const name=inp.value.trim();
    if(name && !linkCategories.work.includes(name)){
      linkCategories.work.push(name);
      saveAppData();
    }
    inp.style.display='none'; sel.style.display='block'; btn.textContent='+';
    // Reload options and select new
    sel.innerHTML=linkCategories.work.map(g=>`<option value="${g}">${g}</option>`).join('');
    if(name) sel.value=name;
    inp.value='';
  }
}

function qlSave(){
  const type=document.getElementById('ql_type').value;
  const name=(document.getElementById('ql_name')?.value||'').trim();
  const url=(document.getElementById('ql_url')?.value||'').trim();
  if(!name||!url){toast('Nhập tên và URL!','#e74c3c');return;}
  if(type==='work'){
    links.unshift({
      id:linkNextId++, name, url,
      desc:(document.getElementById('ql_desc')?.value||'').trim(),
      group:document.getElementById('ql_group')?.value||'Khác',
      type:'work',
      owner:document.getElementById('ql_owner_work')?.value||'admin',
      note:(document.getElementById('ql_note_work')?.value||'').trim(),
      account:(document.getElementById('ql_account_work')?.value||'').trim(),
      password:document.getElementById('ql_password_work')?.value||'',
    });
  } else {
    websites.unshift({
      id:wsNextId++, brand:name, url,
      admin:normalizeAdmin(document.getElementById('ql_admin')?.value),
      account:(document.getElementById('ql_account')?.value||'').trim(),
      password:document.getElementById('ql_password')?.value||'',
      status:document.getElementById('ql_status')?.value||'Tốt',
      note:(document.getElementById('ql_note')?.value||'').trim(),
      team:document.getElementById('ql_team')?.value||'Team 01',
      owner:document.getElementById('ql_owner')?.value||'Công ty',
      group:document.getElementById('ql_group_ws')?.value||'',
    });
  }
  saveAppData();
  updateWsIcons();
  qlCloseAdd();
  toast('✓ Đã thêm: '+name);
}
// ===== TASK INDEX =====
let _iamTaskId = null; // current task being actioned
let _iamAction = 'done';
let _aimTeam = 'Team 01';
let _aimPerson = 'Hải';

// Generate task ID: MM + team_num + stt  e.g. "020101-99"
function genIndexTaskId(dateStr, team, stt, mmOverride){
  const d = dateStr || todayVN();
  const mm = mmOverride || d.split('-')[1] || String(new Date().getMonth()+1).padStart(2,'0');
  const tNum = team === 'Team 02' ? '02' : '01';
  // If single number → expand to X-X range: "1" → "1-1"
  const normalizedStt = /^\d+$/.test(stt.trim()) ? `${stt.trim()}-${stt.trim()}` : stt;
  // Pad each number to 4 digits: "1-99" → "0001-0099"
  const paddedStt = normalizedStt.replace(/\d+/g, n => String(n).padStart(4,'0'));
  return mm + tNum + paddedStt;
}

// Render colorized ID: MM(đỏ) | TeamNum(xanh dương) | STT(xanh lá)
// Format: MMTT<stt>  e.g. 020101-99 → MM=02, TT=01, STT=01-99
function renderItId(taskId){
  if(!taskId) return `<span class="it-id">—</span>`;
  // Extract: first 2 = MM, next 2 = team, rest = stt
  const mm   = taskId.slice(0,2);
  const team = taskId.slice(2,4);
  const stt  = taskId.slice(4);
  return `<span class="it-id"><span class="it-id-mm">${mm}</span><span class="it-id-team">${team}</span><span class="it-id-stt">${stt}</span></span>`;
}

// Date +4 days
function indexDueDate(dateStr){
  return addDays(dateStr, 4);
}


// ===== KHO ID =====
let khoIdList = []; // persisted archive of all created index task IDs

function getRecurDoneToday(){
  try{ return JSON.parse(localStorage.getItem('wt_recur_done_today')||'[]'); }catch(e){ return []; }
}
function setRecurDoneToday(list){
  localStorage.setItem('wt_recur_done_today', JSON.stringify(list));
}
function saveRecurDoneToday(list){
  setRecurDoneToday(list);
  // Will be included in next saveAppData call
}

function loadKhoId(){
  try{ khoIdList = JSON.parse(localStorage.getItem('wt_kho_id')||'[]'); }catch(e){ khoIdList=[]; }
}
function saveKhoId(){
  localStorage.setItem('wt_kho_id', JSON.stringify(khoIdList));
  saveAppData(); // push everything including khoId to Firebase
}

function addToKhoId(task){
  if(task.isSubTask) return; // không lưu task con
  if(khoIdList.find(k=>k.taskId===task.taskId)) return; // đã có rồi
  khoIdList.push({
    taskId: task.taskId,
    name: task.name||'',
    team: task.team||'',
    person: task.person||'',
    stt: task.stt||'',
    createdDate: task.createdDate||todayVN(),
    website: task.name||'',
  });
  saveKhoId();
}

function switchItTab(tab){
  const tasksPanel = document.querySelector('#page-index .table-wrap');
  const khoPanel = document.getElementById('itKhoPanel');
  const banner = document.getElementById('itDueBanner');
  const t1 = document.getElementById('itTab-tasks');
  const t2 = document.getElementById('itTab-kho');
  if(tab==='kho'){
    if(tasksPanel) tasksPanel.style.display='none';
    if(khoPanel){ khoPanel.style.display='flex'; khoPanel.style.flexDirection='column'; }
    if(banner) banner.style.display='none';
    if(t1){ t1.style.background='#fff'; t1.style.color='var(--text-muted)'; }
    if(t2){ t2.style.background='var(--red)'; t2.style.color='#fff'; }
    renderKhoId();
  } else {
    if(tasksPanel) tasksPanel.style.display='';
    if(khoPanel) khoPanel.style.display='none';
    if(t1){ t1.style.background='var(--red)'; t1.style.color='#fff'; }
    if(t2){ t2.style.background='#fff'; t2.style.color='var(--text-muted)'; }
    renderIndexTasks();
  }
}

function renderKhoId(){
  loadKhoId();
  const q = (document.getElementById('khoSearch')?.value||'').toLowerCase();
  const ft = document.getElementById('khoFilterTeam')?.value||'';
  const fm = document.getElementById('khoFilterMonth')?.value||'';

  // Populate month filter
  const months = [...new Set(khoIdList.map(k=>k.taskId?.slice(0,2)).filter(Boolean))].sort().reverse();
  const mSel = document.getElementById('khoFilterMonth');
  if(mSel){
    const cur = mSel.value;
    mSel.innerHTML = '<option value="">Tất cả tháng</option>' + months.map(m=>`<option value="${m}" ${m===cur?'selected':''}>Tháng ${parseInt(m)}</option>`).join('');
  }

  let list = [...khoIdList].sort((a,b)=>(b.taskId||'').localeCompare(a.taskId||''));
  if(q) list = list.filter(k=>(k.taskId||'').toLowerCase().includes(q)||(k.name||'').toLowerCase().includes(q)||(k.website||'').toLowerCase().includes(q));
  if(ft) list = list.filter(k=>k.team===ft);
  if(fm) list = list.filter(k=>(k.taskId||'').startsWith(fm));

  const el = document.getElementById('khoList');
  const empty = document.getElementById('khoEmpty');
  const cnt = document.getElementById('khoCount');
  if(cnt) cnt.textContent = list.length + ' ID';

  if(!list.length){ if(el) el.innerHTML=''; if(empty) empty.style.display='block'; return; }
  if(empty) empty.style.display='none';

  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:#f8f9fa;border-bottom:2px solid var(--gray-border)">
      <th style="padding:8px 10px;text-align:left;font-weight:600">ID Task</th>
      <th style="padding:8px 10px;text-align:left;font-weight:600">Tên / Website</th>
      <th style="padding:8px 10px;text-align:left;font-weight:600">STT</th>
      <th style="padding:8px 10px;text-align:left;font-weight:600">Team</th>
      <th style="padding:8px 10px;text-align:left;font-weight:600">Người</th>
      <th style="padding:8px 10px;text-align:left;font-weight:600">Ngày tạo</th>
      <th style="padding:8px 10px;text-align:left;font-weight:600">Trạng thái</th>
    </tr></thead>
    <tbody>
      ${list.map((k,i)=>`<tr style="${i%2===0?'background:#fff':'background:#f8f9fa'};border-bottom:1px solid #f0f0f0">
        <td style="padding:7px 10px;font-family:monospace;font-weight:600">${renderItId(k.taskId)}${k.isSubTask?'<span style="font-size:9px;background:#fff3cd;color:#856404;border:1px solid #ffc107;border-radius:4px;padding:1px 4px;margin-left:3px">sub</span>':''}</td>
        <td style="padding:7px 10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${k.name||'—'}</td>
        <td style="padding:7px 10px">${k.stt||'—'}</td>
        <td style="padding:7px 10px">${k.team||'—'}</td>
        <td style="padding:7px 10px">${k.person||'—'}</td>
        <td style="padding:7px 10px">${fmtDate(k.createdDate)||'—'}</td>
        <td style="padding:7px 10px">${(()=>{const t=indexTasks.find(x=>x.taskId===k.taskId);return t?`<span style="font-size:11px;color:${t.status==='Done'?'#27ae60':t.status==='Pending'?'#e67e22':'#2980b9'}">${t.status}</span>`:'<span style="font-size:11px;color:var(--text-muted)">Đã xóa</span>'})()}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function renderIndexTasks(){
  // Render due banner first
  renderIndexDueBanner();

  const tbody = document.getElementById('tbodyIndexTasks');
  const empty = document.getElementById('emptyIndexTasks');
  if(!tbody || !empty) return;

  const q = (document.getElementById('itSearch')||{}).value?.toLowerCase()||'';
  const fTeam = (document.getElementById('itFilterTeam')||{}).value||'';
  const fStatus = (document.getElementById('itFilterStatus')||{}).value||'';

  // Member filter: Hải/Hiếu only see their own tasks; admin sees all + can filter
  const personFilter = document.getElementById('itFilterPerson');
  const fPerson = currentMember==='admin'
    ? (personFilter?.value||'')
    : currentMember==='hai' ? 'Hải' : 'Hiếu';

  // Lock person filter for non-admin
  if(personFilter){
    personFilter.disabled = currentMember!=='admin';
    if(currentMember!=='admin') personFilter.value = fPerson;
  }

  let list = indexTasks.filter(t=>{
    if(fPerson && t.person!==fPerson) return false;
    if(currentMember==='hai' && t.team!=='Team 01') return false;
    if(fTeam && t.team!==fTeam) return false;
    if(fStatus && t.status!==fStatus) return false;
    if(q && !t.taskId.toLowerCase().includes(q) && !(t.stt||'').toLowerCase().includes(q) && !(t.name||'').toLowerCase().includes(q)) return false;
    return true;
  });

  // Sort: oldest createdDate first, newest last (không phân nhóm theo status nữa)
  list = list.slice().sort((a,b)=> (a.createdDate||'').localeCompare(b.createdDate||'') || (a.taskId||'').localeCompare(b.taskId||''));

  if(!list.length){ tbody.innerHTML=''; empty.style.display='block'; updateNavBadges(); return; }
  empty.style.display='none';

  const activeList = list.filter(t=>t.status!=='Done');
  const doneList   = list.filter(t=>t.status==='Done');

  const today = todayVN();

  const renderRow = t => {
    const isDone = t.status==='Done';
    const isPending = t.status==='Pending';
    const subBadge = t.isSubTask ? '<span style="font-size:9px;background:#fff3cd;color:#856404;border:1px solid #ffc107;border-radius:4px;padding:1px 5px;margin-left:4px">sub</span>' : '';
    const isOverdue = !isDone && t.dueDate < today;
    const isDue = !isDone && t.dueDate === today;
    const teamBadge = t.team==='Team 02'
      ? '<span class="it-badge-team t2">Team 02</span>'
      : '<span class="it-badge-team">Team 01</span>';
    let statusCell = '';
    if(isDone) statusCell = '<span class="it-status-done">✅ Done</span>';
    else if(isPending) statusCell = '<span class="it-status-pending">⏳ Pending</span>';
    else if(isOverdue) statusCell = '<span style="color:#e74c3c;font-size:12px;font-weight:600">⚠️ Trễ</span>';
    else if(isDue) statusCell = '<span class="it-status-waiting">⏰ Hôm nay!</span>';
    else statusCell = '<span class="badge badge-gray" style="font-size:11px">Đã gửi index</span>';

    const noteCell = t.pendingReason
      ? `<span style="font-size:11px;color:#e67e22">📝 ${t.pendingReason.slice(0,30)}${t.pendingReason.length>30?'…':''}</span>`
      : '';

    const dueDateLabel = isDone
      ? `<span style="color:#27ae60;font-size:12px">${fmtDate(t.dueDate)||'—'}</span>`
      : (isOverdue || isDue)
        ? `<span style="color:#e74c3c;font-size:12px;font-weight:600">${fmtDate(t.dueDate)||'—'}</span>`
        : `<span style="font-size:12px">${fmtDate(t.dueDate)||'—'}</span>`;

    let actionBtn = '';
    if(!isDone){
      actionBtn = `<button onclick="openIndexActionModal('${t.taskId}')"
        class="btn btn-sm ${isPending?'btn-outline':'btn-primary'}"
        style="${isPending?'color:#e67e22;border-color:#e67e22':'background:#27ae60;border-color:#27ae60'}">
        ${isPending?'↩ Cập nhật':'✓ Hành động'}
      </button>`;
    } else {
      actionBtn = `<button onclick="restoreIndexTask('${t.taskId}')"
        class="btn btn-sm btn-outline" style="font-size:11px;color:#e67e22;border-color:#e67e22" title="Khôi phục về chưa done">↩ Khôi phục</button>`;
    }
    const editBtn = `<button onclick="openEditIndexModal('${t.taskId}')" title="Sửa task"
      style="background:none;border:1px solid var(--gray-border);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer;margin-left:4px"
      onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--gray-border)'">✎</button>`;

    return `<tr class="${isDone?'it-row-done':''}" style="${isDue&&!isDone?'background:#fffde7':isOverdue&&!isDone?'background:#fdf2f2':''}">
      <td style="white-space:nowrap">${renderItId(t.taskId)}${subBadge||''}</td>
      <td style="font-size:13px;font-weight:500">${t.name||'<span style="color:var(--text-muted)">—</span>'}</td>
      <td style="font-size:12px">${fmtDate(t.createdDate)||'—'}</td>
      <td style="font-size:12px;font-weight:600">${t.stt}</td>
      <td>${teamBadge}</td>
      <td><span class="tag-person ${t.person==='Hải'?'tag-hai':t.person==='Hiếu'?'tag-hieu':''}" style="font-size:11px">${t.person||'—'}</span></td>
      <td>${dueDateLabel}${t.pendingNewDue&&isPending?`<div style="font-size:10px;color:var(--text-muted)">DK: ${fmtDate(t.pendingNewDue)}</div>`:''}</td>
      <td>${statusCell}</td>
      <td>${noteCell}</td>
      <td style="white-space:nowrap">${actionBtn}${editBtn}
        <button onclick="deleteIndexTask('${t.taskId}')" title="Xoá"
          style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;opacity:.4;margin-left:4px"
          onmouseover="this.style.opacity=1;this.style.color='#e74c3c'" onmouseout="this.style.opacity=.4;this.style.color='var(--text-muted)'">🗑</button>
      </td>
    </tr>`;
  };

  let html = activeList.map(renderRow).join('');

  // Done section
  if(doneList.length){
    const _itDoneOpen = (localStorage.getItem('it_done_open')||'0')==='1';
    html += `<tr id="itDoneSectionRow">
      <td colspan="10" style="padding:0">
        <div onclick="toggleItDoneSection()" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;background:#f0faf4;border-top:2px solid #a8deba;border-bottom:1px solid #a8deba;user-select:none"
          onmouseover="this.style.background='#e6f7ee'" onmouseout="this.style.background='#f0faf4'">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#27ae60">✅ Đã hoàn thành (${doneList.length})</span>
          <span id="itDoneChevron" style="font-size:11px;color:#27ae60;transition:transform .2s;display:inline-block;transform:${_itDoneOpen?'rotate(180deg)':'rotate(0deg)'}">▼</span>
        </div>
      </td>
    </tr>`;
    if(_itDoneOpen){
      html += doneList.map(renderRow).join('');
    }
  }

  tbody.innerHTML = html;
  updateNavBadges();
}

function renderIndexDueBanner(){
  const today = todayVN();
  const banner = document.getElementById('itDueBanner');
  const list = document.getElementById('itDueList');
  const cnt = document.getElementById('itDueCount');
  if(!banner||!list) return;

  // Tasks due today (dueDate===today AND not done), OR overdue AND not done, OR pending with pendingNewDue===today
  const duePerson = currentMember==='hai'?'Hải':currentMember==='hieu'?'Hiếu':'';
  const due = indexTasks.filter(t=>{
    if(duePerson && t.person!==duePerson) return false;
    if(t.status==='Done') return false;
    if(t.status==='Pending') return t.pendingNewDue === today;
    return t.dueDate <= today;
  });

  if(!due.length){ banner.style.display='none'; return; }
  banner.style.display='block';
  cnt.textContent = due.length;

  list.innerHTML = due.map(t=>{
    const isOverdue = t.dueDate < today && t.status!=='Pending';
    const isPending = t.status==='Pending';
    return `<div class="it-due-card ${isOverdue?'overdue':isPending?'waiting':''}">
      ${renderItId(t.taskId)}${t.isSubTask?'<span style="font-size:9px;background:#fff3cd;color:#856404;border:1px solid #ffc107;border-radius:4px;padding:1px 5px;margin-left:3px">sub</span>':''}
      ${t.name?`<span style="font-size:12px;font-weight:500;color:var(--text)">${t.name}</span>`:''}
      <span class="${t.team==='Team 02'?'it-badge-team t2':'it-badge-team'}">${t.team}</span>
      ${t.person?`<span class="tag-person ${t.person==='Hải'?'tag-hai':'tag-hieu'}" style="font-size:11px">${t.person}</span>`:''}
      <span style="font-size:12px;color:var(--text-muted)">STT: ${t.stt}</span>
      ${isPending?`<span style="font-size:11px;color:#e67e22;flex:1">📝 ${t.pendingReason||''}</span>`:'<span style="flex:1"></span>'}
      ${isOverdue?`<span style="font-size:11px;color:#e74c3c;font-weight:600">⚠️ Trễ ${Math.ceil((new Date(today)-new Date(t.dueDate))/(864e5))}n</span>`:''}
      <button onclick="openIndexActionModal('${t.taskId}')"
        class="btn btn-sm btn-primary" style="background:#27ae60;border-color:#27ae60;white-space:nowrap">
        ✓ Hành động
      </button>
    </div>`;
  }).join('');
}

// ---- ADD MODAL ----
function _populateAimMonths(){
  const sel = document.getElementById('aim_month');
  if(!sel) return;
  const now = new Date();
  const options = [];
  for(let i=0; i<6; i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const label = `Tháng ${d.getMonth()+1}/${d.getFullYear()}${i===0?' (hiện tại)':i===1?' (tháng trước)':''}`;
    options.push(`<option value="${mm}">${label}</option>`);
  }
  sel.innerHTML = options.join('');
}

function openAddIndexModal(){
  _aimTeam = 'Team 01';
  _aimPerson = currentMember==='hai' ? 'Hải' : currentMember==='hieu' ? 'Hiếu' : 'Hải';
  _populateAimMonths();
  document.getElementById('aim_date').value = todayVN();
  document.getElementById('aim_stt').value = '';
  const sf = document.getElementById('aim_stt_from'); if(sf) sf.value='';
  const st = document.getElementById('aim_stt_to'); if(st) st.value='';
  const sub = document.getElementById('aim_is_sub'); if(sub) sub.checked=false;
  const pp = document.getElementById('aim_parents_preview'); if(pp){ pp.style.display='none'; pp.innerHTML=''; }
  document.getElementById('aim_name').value = '';

  // Team buttons
  const teamRow = document.getElementById('aim_team_row');
  if(currentMember==='hai'){
    _aimTeam='Team 01';
    if(teamRow) teamRow.style.display='none';
  } else {
    if(teamRow) teamRow.style.display='block';
    aimSetTeam('Team 01');
  }

  // Person row
  const personRow = document.getElementById('aim_person_row');
  if(currentMember==='hai'){
    _aimPerson='Hải';
    if(personRow) personRow.style.display='none';
  } else if(currentMember==='hieu'){
    _aimPerson='Hiếu';
    if(personRow) personRow.style.display='none';
  } else {
    // admin: show picker, default Hải
    if(personRow) personRow.style.display='block';
    aimSetPerson('Hải');
  }

  updateAimPreview();
  document.getElementById('addIndexModal').classList.add('open');
  setTimeout(()=>document.getElementById('aim_name').focus(),100);
}

function closeAddIndexModal(){
  document.getElementById('addIndexModal').classList.remove('open');
  const sub=document.getElementById('aim_is_sub'); if(sub) sub.checked=false;
  const pp=document.getElementById('aim_parents_preview'); if(pp){pp.style.display='none';pp.innerHTML='';}
}

function aimSetTeam(team){
  _aimTeam = team;
  const t1 = document.getElementById('aim_team_btn1');
  const t2 = document.getElementById('aim_team_btn2');
  if(t1){ t1.className='btn '+(team==='Team 01'?'btn-primary':'btn-outline'); t1.style.cssText='flex:1'+(team==='Team 01'?';background:var(--red);border-color:var(--red)':''); }
  if(t2){ t2.className='btn '+(team==='Team 02'?'btn-primary':'btn-outline'); t2.style.cssText='flex:1'+(team==='Team 02'?';background:var(--blue);border-color:var(--blue)':''); }
  updateAimPreview();
}

function aimSetPerson(person){
  _aimPerson = person;
  const bh = document.getElementById('aim_person_btn_hai');
  const bhi = document.getElementById('aim_person_btn_hieu');
  if(bh){
    bh.className='btn '+(person==='Hải'?'btn-primary':'btn-outline');
    bh.style.cssText='flex:1'+(person==='Hải'?';background:var(--red);border-color:var(--red)':'');
  }
  if(bhi){
    bhi.className='btn '+(person==='Hiếu'?'btn-primary':'btn-outline');
    bhi.style.cssText='flex:1'+(person==='Hiếu'?';background:var(--blue);border-color:var(--blue)':'');
  }
}

function _buildAimStt(){
  const from = (document.getElementById('aim_stt_from')?.value||'').trim();
  const to = (document.getElementById('aim_stt_to')?.value||'').trim();
  if(!from) return '';
  return to && to !== from ? `${from}-${to}` : from;
}

function updateAimPreview(){
  const dateVal = document.getElementById('aim_date')?.value || todayVN();
  const sttVal = _buildAimStt();
  if(document.getElementById('aim_stt')) document.getElementById('aim_stt').value = sttVal;
  const mmVal = document.getElementById('aim_month')?.value || '';
  const prev = document.getElementById('aim_preview_id');
  const prevDue = document.getElementById('aim_preview_due');
  if(!sttVal){ if(prev) prev.textContent='—'; if(prevDue) prevDue.textContent='—'; return; }
  const id = genIndexTaskId(dateVal, _aimTeam, sttVal, mmVal||undefined);
  const due = indexDueDate(dateVal);
  const dp = due.split('-');
  if(prev) prev.innerHTML = renderItId(id);
  if(prevDue) prevDue.textContent = `${parseInt(dp[2])}/${parseInt(dp[1])}/${dp[0]}`;
}

// Attach live preview update
document.addEventListener('DOMContentLoaded', ()=>{
  const d=document.getElementById('aim_date'); if(d) d.addEventListener('input', updateAimPreview);
  const sf=document.getElementById('aim_stt_from'); if(sf) sf.addEventListener('input', updateAimPreview);
  const st=document.getElementById('aim_stt_to'); if(st) st.addEventListener('input', updateAimPreview);
});

function saveAddIndexTask(){
  const dateVal = document.getElementById('aim_date').value || todayVN();
  const mmVal = document.getElementById('aim_month')?.value || '';
  const sttVal = _buildAimStt();
  if(!sttVal){ toast('Vui lòng nhập STT!','#e74c3c'); return; }
  const taskId = genIndexTaskId(dateVal, _aimTeam, sttVal, mmVal||undefined);
  const isSubTask = document.getElementById('aim_is_sub')?.checked;

  if(indexTasks.find(t=>t.taskId===taskId)){
    const msg = `⚠️ Thêm task thất bại!\n\nID "${taskId}" đã tồn tại trong hệ thống.\n\nVui lòng kiểm tra lại STT hoặc ngày ép index.`;
    alert(msg);
    return;
  }

  // Parse STT range thành [start, end]
  function parseSttRange(s){
    const norm = /^\d+$/.test(s.trim()) ? `${s.trim()}-${s.trim()}` : s;
    const parts = norm.split('-').map(Number);
    return [parts[0], parts[1]||parts[0]];
  }

  const mm = taskId.slice(0,2);
  const [newStart, newEnd] = parseSttRange(sttVal);

  // Tìm task cha nếu là task con
  let parentIds = [];
  if(isSubTask){
    parentIds = indexTasks.filter(t=>{
      if(t.team !== _aimTeam) return false;
      if(t.taskId.slice(0,2) !== mm) return false;
      const [es,ee] = parseSttRange(t.stt);
      return newStart<=ee && newEnd>=es;
    }).map(t=>t.taskId);
  } else {
    // Check xung đột range STT (chỉ khi không phải task con)
    const sttConflict = indexTasks.find(t=>{
      if(t.team !== _aimTeam) return false;
      if(t.taskId.slice(0,2) !== mm) return false;
      const [exStart, exEnd] = parseSttRange(t.stt);
      return newStart <= exEnd && newEnd >= exStart;
    });
    if(sttConflict){
      const [exS, exE] = parseSttRange(sttConflict.stt);
      const msg = `⚠️ Thêm task thất bại!\n\nSTT "${sttVal}" bị xung đột với task đã tồn tại:\n• ID: ${sttConflict.taskId}\n• STT: ${sttConflict.stt} (${exS}–${exE})\n• Tên: ${sttConflict.name||'(không tên)'}\n\nSố thứ tự bị trùng — vui lòng dùng dải STT khác.\n\nNếu đây là task con, hãy tick vào "🔗 Task con".`;
      alert(msg);
      return;
    }
  }
  const nameVal = (document.getElementById('aim_name').value||'').trim();
  if(!nameVal){ toast('Vui lòng nhập tên task!','#e74c3c'); return; }
  const due = indexDueDate(dateVal);
  const newItTask = {
    taskId, stt:sttVal,
    name: nameVal,
    person: _aimPerson,
    team: _aimTeam,
    createdDate: dateVal,
    dueDate: due,
    status: 'Đã gửi index',
    pendingReason: '',
    pendingNewDue: '',
    _id: itNextId++,
    isSubTask: isSubTask||false,
    parentIds: parentIds.length ? parentIds : [],
  };
  indexTasks.push(newItTask);
  try{ addToKhoId(newItTask); }catch(e){ console.warn('khoId err:',e); }
  saveAppData();
  closeAddIndexModal();
  renderIndexTasks();
  updateNavBadges();
  toast('✓ Đã tạo task index: '+taskId);
}

// ---- ACTION MODAL ----
function openIndexActionModal(taskId){
  _iamTaskId = taskId;
  _iamAction = 'done';
  document.getElementById('iamTaskId').innerHTML = renderItId(taskId);
  const _t = indexTasks.find(x=>x.taskId===taskId);
  const nameEl = document.getElementById('iamTaskName');
  if(nameEl) nameEl.textContent = _t?.name || '';
  document.getElementById('iamPendingFields').style.display='none';
  document.getElementById('iamReason').value='';
  document.getElementById('iamNewDue').value='';
  // Reset buttons
  const bd=document.getElementById('iamBtnDone'); const bp=document.getElementById('iamBtnPending');
  if(bd){ bd.className='btn btn-primary'; bd.style.cssText='flex:1;background:#27ae60;border-color:#27ae60'; }
  if(bp){ bp.className='btn btn-outline'; bp.style.cssText='flex:1;color:#e67e22;border-color:#e67e22'; }
  document.getElementById('indexActionModal').classList.add('open');
}

function closeIndexActionModal(){
  document.getElementById('indexActionModal').classList.remove('open');
}

function iamSetAction(action){
  _iamAction = action;
  const pf = document.getElementById('iamPendingFields');
  const bd=document.getElementById('iamBtnDone'); const bp=document.getElementById('iamBtnPending');
  if(action==='done'){
    if(pf) pf.style.display='none';
    if(bd){ bd.className='btn btn-primary'; bd.style.cssText='flex:1;background:#27ae60;border-color:#27ae60'; }
    if(bp){ bp.className='btn btn-outline'; bp.style.cssText='flex:1;color:#e67e22;border-color:#e67e22'; }
  } else {
    if(pf) pf.style.display='flex';
    if(bd){ bd.className='btn btn-outline'; bd.style.cssText='flex:1;color:#27ae60;border-color:#27ae60'; }
    if(bp){ bp.className='btn btn-primary'; bp.style.cssText='flex:1;background:#e67e22;border-color:#e67e22'; }
    // Default new due = today + 1
    const nd=document.getElementById('iamNewDue'); if(nd&&!nd.value) nd.value=addDays(todayVN(),1);
  }
}


// Sync sheet rows status when index task status changes
function syncSheetStatusFromIndex(taskId, newStatus){
  // taskId format: MM+Team+STT e.g. "030396-445"
  // Match sheet rows where r.indexId === taskId
  const statusMap = {
    'Done': 'Done',
    'Đã gửi index': 'Chưa gửi',
    'Pending': 'Chưa gửi'
  };
  const sheetStatus = statusMap[newStatus];
  if(!sheetStatus) return;
  let changed = false;
  ['hai','hieu'].forEach(sheet => {
    data[sheet].forEach(r => {
      if(r.indexId && r.indexId === taskId){
        r.status = newStatus === 'Done' ? 'Done' : sheetStatus;
        changed = true;
      }
    });
  });
  return changed;
}
function submitIndexAction(){
  const t = indexTasks.find(x=>x.taskId===_iamTaskId);
  if(!t) return;
  if(_iamAction==='done'){
    t.status='Done';
    t.pendingReason='';
    t.pendingNewDue='';
    syncSheetStatusFromIndex(t.taskId, 'Done');
    if(!khoIdList.find(k=>k.taskId===t.taskId)) addToKhoId(t);
  } else {
    const reason=(document.getElementById('iamReason').value||'').trim();
    const newDue=(document.getElementById('iamNewDue').value||'').trim();
    if(!reason){ toast('Vui lòng nhập lý do pending!','#e74c3c'); return; }
    if(!newDue){ toast('Vui lòng chọn ngày dự kiến hoàn thành!','#e74c3c'); return; }
    t.status='Pending';
    t.pendingReason=reason;
    t.pendingNewDue=newDue;
    // Update dueDate to pendingNewDue for reminder
    t.dueDate=newDue;
  }
  saveAppData();
  closeIndexActionModal();
  renderIndexTasks();
  toast(_iamAction==='done'?'✅ Đã đánh dấu Done!':'⏳ Đã đặt Pending — nhắc vào '+fmtDate(t.pendingNewDue));
}

function toggleItDoneSection(){
  const cur = (localStorage.getItem('it_done_open')||'0')==='1';
  localStorage.setItem('it_done_open', cur?'0':'1');
  renderIndexTasks();
}

function restoreIndexTask(taskId){
  const t = indexTasks.find(x=>x.taskId===taskId);
  if(!t) return;
  t.status = 'Đã gửi index';
  t.pendingReason = '';
  t.pendingNewDue = '';
  // Restore original dueDate from createdDate
  t.dueDate = indexDueDate(t.createdDate);
  syncSheetStatusFromIndex(t.taskId, 'Đã gửi index');
  saveAppData();
  renderIndexTasks();
  toast('↩ Đã khôi phục: '+taskId);
}

let _eimTeam = 'Team 01';
let _eimPerson = 'Hải';

function openEditIndexModal(taskId){
  const t = indexTasks.find(x=>x.taskId===taskId);
  if(!t) return;
  _eimTeam = t.team||'Team 01';
  _eimPerson = t.person||'Hải';
  document.getElementById('eim_taskId').value = taskId;
  document.getElementById('eim_name').value = t.name||'';
  document.getElementById('eim_date').value = t.createdDate||todayVN();
  document.getElementById('eim_stt').value = t.stt||'';
  // Team
  const teamRow = document.getElementById('eim_team_row');
  if(currentMember==='hai'){ if(teamRow) teamRow.style.display='none'; }
  else { if(teamRow) teamRow.style.display='block'; eimSetTeam(_eimTeam); }
  // Person
  const personRow = document.getElementById('eim_person_row');
  if(currentMember!=='admin'){ if(personRow) personRow.style.display='none'; }
  else { if(personRow) personRow.style.display='block'; eimSetPerson(_eimPerson); }
  document.getElementById('editIndexModal').classList.add('open');
  setTimeout(()=>document.getElementById('eim_name').focus(),100);
}

function closeEditIndexModal(){
  document.getElementById('editIndexModal').classList.remove('open');
}

function eimSetTeam(team){
  _eimTeam = team;
  const b1=document.getElementById('eim_team_btn1');
  const b2=document.getElementById('eim_team_btn2');
  if(b1){ b1.className='btn '+(team==='Team 01'?'btn-primary':'btn-outline'); b1.style.flex='1'; }
  if(b2){ b2.className='btn '+(team==='Team 02'?'btn-primary':'btn-outline'); b2.style.flex='1'; }
}

function eimSetPerson(person){
  _eimPerson = person;
  const bh=document.getElementById('eim_person_btn_hai');
  const bhi=document.getElementById('eim_person_btn_hieu');
  if(bh){ bh.className='btn '+(person==='Hải'?'btn-primary':'btn-outline'); bh.style.flex='1'; }
  if(bhi){ bhi.className='btn '+(person==='Hiếu'?'btn-primary':'btn-outline'); bhi.style.flex='1'; }
}

function saveEditIndexTask(){
  const taskId = document.getElementById('eim_taskId').value;
  const t = indexTasks.find(x=>x.taskId===taskId);
  if(!t) return;
  const nameVal = (document.getElementById('eim_name').value||'').trim();
  if(!nameVal){ toast('Vui lòng nhập tên task!','#e74c3c'); return; }
  const sttVal = (document.getElementById('eim_stt').value||'').trim();
  if(!sttVal){ toast('Vui lòng nhập STT!','#e74c3c'); return; }
  const dateVal = document.getElementById('eim_date').value || t.createdDate;
  t.name = nameVal;
  t.stt = sttVal;
  t.createdDate = dateVal;
  t.team = currentMember==='hai' ? 'Team 01' : _eimTeam;
  t.person = currentMember==='admin' ? _eimPerson : t.person;
  // Rebuild taskId + dueDate only if not done/pending (to avoid disrupting active tasks)
  if(t.status==='Đã gửi index'){
    const newId = genIndexTaskId(dateVal, t.team, sttVal);
    if(newId !== taskId){
      if(indexTasks.find(x=>x.taskId===newId && x.taskId!==taskId)){
        toast('Task ID "'+newId+'" đã tồn tại!','#e74c3c'); return;
      }
      t.taskId = newId;
      t.dueDate = indexDueDate(dateVal);
    }
  }
  saveAppData();
  closeEditIndexModal();
  renderIndexTasks();
  toast('✓ Đã cập nhật task!');
}

function removeFromKhoId(taskId){
  khoIdList = khoIdList.filter(k=>k.taskId!==taskId);
  saveKhoId();
}

function deleteIndexTask(taskId){
  if(!confirm('Xoá task index "'+taskId+'"?')) return;
  indexTasks = indexTasks.filter(t=>t.taskId!==taskId);
  removeFromKhoId(taskId); // xóa khỏi kho
  saveAppData();
  renderIndexTasks();
  toast('Đã xoá.');
}

// ===== TASK PENDING (task cha) =====
function openTaskPendingModal(taskId){
  const t = tasks.find(x=>x.id===taskId);
  if(!t) return;
  document.getElementById('tpm_taskId').value = taskId;
  document.getElementById('tpmTaskName').textContent = t.name;
  document.getElementById('tpm_reason').value = t.pendingReason||'';
  document.getElementById('tpm_note').value = t.pendingNote||'';
  const isAlready = !!t.pendingReason;
  document.getElementById('tpmTitle').textContent = isAlready ? '⏸ Sửa / xoá pending' : '⏸ Pending task';
  document.getElementById('tpmClearBtn').style.display = isAlready ? 'inline-flex' : 'none';
  document.getElementById('taskPendingModal').classList.add('open');
  setTimeout(()=>document.getElementById('tpm_reason').focus(),100);
}

function closeTaskPendingModal(){
  document.getElementById('taskPendingModal').classList.remove('open');
}

function saveTaskPending(){
  const rawId = document.getElementById("tpm_taskId").value;
  const reason = (document.getElementById("tpm_reason").value||"").trim();
  if(!reason){ toast("Vui lòng nhập lý do pending!","#e74c3c"); return; }
  const note = (document.getElementById("tpm_note").value||"").trim();
  if(rawId.startsWith("gv_")){
    const gvId = parseInt(rawId.replace("gv_",""));
    const g = giaoViecList.find(x=>x.id===gvId);
    if(!g) return;
    g.pendingReason=reason; g.pendingNote=note; g.pendingDate=todayVN(); g.pendingStatus="Chờ xử lý";
    saveAppData(); closeTaskPendingModal(); renderGiaoViec();
    toast("⏸ Đã pending: "+g.taskName);
  } else {
    const t = tasks.find(x=>x.id===parseInt(rawId));
    if(!t) return;
    t.pendingReason=reason; t.pendingNote=note; t.pendingDate=todayVN(); t.pendingStatus="Chờ xử lý";
    saveAppData(); closeTaskPendingModal(); renderTasksOverview();
    toast("⏸ Đã pending task: "+t.name);
  }
}

function resolveTaskPending(taskId){
  const t = tasks.find(x=>x.id===taskId);
  if(!t) return;
  delete t.pendingReason; delete t.pendingNote; delete t.pendingDate; delete t.pendingStatus;
  saveAppData(); renderTasksOverview();
  toast("✓ Đã bỏ pending task: "+t.name);
}

function resolveTaskPendingFromModal(){
  const rawId = document.getElementById("tpm_taskId").value;
  if(rawId.startsWith("gv_")){
    resolveGvPending(parseInt(rawId.replace("gv_","")), null);
    closeTaskPendingModal();
  } else {
    resolveTaskPending(parseInt(rawId));
    closeTaskPendingModal();
  }
}

function updateTaskPendingStatus(taskId, status){
  const t = tasks.find(x=>x.id===taskId);
  if(t){ t.pendingStatus=status; saveAppData(); }
}

// ===== GIAO VIỆC =====
let _gvTaskRef = null; // task being assigned

function switchTasksTab(tab){
  try{ sessionStorage.setItem('wt_activeSubPage', tab); } catch(e){}
  document.getElementById('panel-mytasks').style.display = tab==='mytasks' ? 'block' : 'none';
  document.getElementById('panel-giaoviec').style.display = tab==='giaoviec' ? 'block' : 'none';
  document.getElementById('tab-mytasks').classList.toggle('active', tab==='mytasks');
  document.getElementById('tab-giaoviec').classList.toggle('active', tab==='giaoviec');
  // Ẩn taskSubBoard khi chuyển sang giao việc
  if(tab==='giaoviec'){
    const sub = document.getElementById('taskSubBoard');
    if(sub) sub.style.display='none';
    const ov = document.getElementById('tasksOverview');
    if(ov) ov.style.display='block';
    document.querySelector('main')?.classList.remove('board-mode');
    renderGiaoViec();
  }
}

function renderGiaoViec(){
  updateGvBadge();
  renderGvPendingSummary();

  const listWrap = document.getElementById('gvListWrap');
  const gvSub = document.getElementById('gvSubBoard');
  if(gvSub && gvSub.style.display!=='none') return; // board open, don't re-render list

  const list = document.getElementById('gvList');
  const empty = document.getElementById('gvEmpty');
  if(!list) return;

  const fStatus = document.getElementById('gvFilterStatus')?.value||'';
  const fPerson = document.getElementById('gvFilterPerson')?.value||'';

  // Show/hide controls based on member
  const personSel = document.getElementById('gvFilterPerson');
  const manageBtn = document.getElementById('btnManageAssignees');
  if(personSel) personSel.style.display = currentMember==='hai' ? 'none' : '';
  if(manageBtn) manageBtn.style.display = currentMember==='hai' ? 'none' : '';

  if(personSel){
    const cur = personSel.value;
    const all = [...new Set(giaoViecList.map(g=>g.assignee))].sort();
    personSel.innerHTML = '<option value="">Tất cả người</option>'
      + all.map(p=>`<option value="${p}" ${p===cur?'selected':''}>${p}</option>`).join('');
  }

  // Filter active items (exclude đã nghiệm thu)
  let items = giaoViecList.filter(g=>{
    if(g.status==='Đã nghiệm thu') return false;
    if(currentMember==='hai' && g.assignee!=='Hải') return false;
    if(fStatus==='Pending' && !g.pendingReason) return false;
    if(fStatus && fStatus!=='Pending' && fStatus!=='Chờ nghiệm thu' && g.status!==fStatus) return false;
    if(fStatus==='Chờ nghiệm thu' && g.status!=='Chờ nghiệm thu') return false;
    if(fPerson && g.assignee!==fPerson) return false;
    return true;
  }).slice().sort((a,b)=>(b.id||0)-(a.id||0));

  if(!items.length){ list.innerHTML=''; empty.style.display='block'; }
  else {
    empty.style.display='none';

  list.innerHTML = items.map(g=>{
    const isPendingTask = !!g.pendingReason;
    const autoStatus = gvCalcStatus(g);
    // Tự động nâng status nếu cards đã done hết nhưng chưa nghiệm thu
    if(autoStatus==='Hoàn thành' && g.status!=='Đã nghiệm thu' && g.status!=='Chờ nghiệm thu') g.status='Chờ nghiệm thu';
    const isWaitingAccept = g.status==='Chờ nghiệm thu' || (autoStatus==='Hoàn thành' && g.status!=='Đã nghiệm thu');
    const badgeCls = isPendingTask?'gv-badge-wait':isWaitingAccept?'gv-badge-wait':autoStatus==='Hoàn thành'?'gv-badge-done':autoStatus==='Đang làm'?'gv-badge-doing':'gv-badge-wait';
    const badgeLabel = isPendingTask?'⏸ Pending':isWaitingAccept?'🔔 Chờ nghiệm thu':autoStatus;
    const dlLabel = g.deadline ? `📅 ${fmtDate(g.deadline)}` : '';
    const isOverdue = g.deadline && g.deadline < todayVN() && !isWaitingAccept;
    const cardStyle = isPendingTask ? 'border-left:3px solid #e67e22;background:#fff8ee'
                    : isWaitingAccept ? 'border-left:3px solid #27ae60;background:#f0faf4' : '';
    const totalCards = (g.taskCards||[]).length;
    const doneCols = g.taskCols ? new Set([g.taskCols[g.taskCols.length-1]?.id,'done']) : new Set(['done']);
    const doneCards = (g.taskCards||[]).filter(c=>doneCols.has(c.colId)).length;

    // Phân quyền đổi trạng thái:
    // - Hải được giao → chỉ Hải đổi
    // - Người khác được giao → người giao (admin/hieu) đổi
    // - Khi Chờ nghiệm thu: không ai đổi được qua select, phải bấm nút Nghiệm thu
    const isHaiTask = g.assignee==='Hải';
    const canChangeStatus = !isWaitingAccept && (isHaiTask ? currentMember==='hai' : currentMember!=='hai');

    return `<div class="gv-card" style="${cardStyle}">
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px;cursor:pointer" onclick="openGvBoard(${g.id})">
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${g.taskName}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:4px">
            <span class="${badgeCls}">${badgeLabel}</span>
            <span style="font-size:12px">👤 <b>${g.assignee}</b></span>
            ${dlLabel?`<span style="font-size:11px;color:${isOverdue?'#e74c3c':'var(--text-muted)'}">${dlLabel}${isOverdue?' ⚠️':''}</span>`:''}
            ${g.assigner?`<span style="font-size:11px;color:var(--text-muted)">Giao bởi: ${g.assigner}</span>`:''}
            ${totalCards?`<span style="font-size:11px;color:var(--text-muted)">${doneCards}/${totalCards} thẻ</span>`:''}
          </div>
          ${isPendingTask?`<div style="font-size:11px;color:#e67e22">⏸ ${(g.pendingReason||'').slice(0,80)}</div>`:''}
          ${isWaitingAccept?`<div style="font-size:11px;color:#27ae60;font-weight:500">🔔 Đã hoàn thành — chờ người giao nghiệm thu</div>`:''}
          ${g.note?`<div style="font-size:12px;color:var(--text-muted)">📝 ${g.note}</div>`:''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;align-items:center;flex-wrap:wrap">
          ${canChangeStatus ? `<select onchange="updateGvStatus(${g.id},this.value)" style="height:28px;font-size:12px;border:1px solid var(--gray-border);border-radius:6px;padding:0 6px">
            ${['Chờ làm','Đang làm','Hoàn thành'].map(s=>`<option ${g.status===s?'selected':''}>${s}</option>`).join('')}
          </select>` : ''}
          ${isWaitingAccept && currentMember!=='hai' ? `<button onclick="confirmNghiemThu(${g.id})"
            style="background:#27ae60;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;color:#fff;font-weight:600;white-space:nowrap">✓ Nghiệm thu</button>` : ''}
          ${isWaitingAccept && currentMember==='hai' ? `<span style="font-size:11px;color:#27ae60;padding:4px 8px;background:#f0faf4;border-radius:6px;border:1px solid #a8deba">⏳ Chờ nghiệm thu</span>` : ''}
          <button onclick="openGvTaskPending(${g.id})" title="${isPendingTask?'Sửa/xoá pending':'Pending task này'}"
            style="background:none;border:1px solid ${isPendingTask?'#e67e22':'var(--gray-border)'};border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;color:${isPendingTask?'#e67e22':'var(--text-muted)'}">⏸</button>
          ${currentMember!=='hai'?`<button onclick="openEditGiaoViec(${g.id})" style="background:none;border:1px solid var(--gray-border);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px">✎</button>`:''}
          ${currentMember!=='hai'?`<button onclick="recallGiaoViec(${g.id})" title="Thu hồi về Task của tôi"
            style="background:none;border:1px solid #a8deba;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;color:#27ae60">↩</button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
  } // end else

  // Render Done section
  renderGvDoneSection();
}

function gvCalcStatus(g){
  if(!g.taskCards||!g.taskCards.length) return g.status||'Chờ làm';
  const cols = g.taskCols||null;
  const lastColId = cols ? cols[cols.length-1].id : 'done';
  const firstColId = cols ? cols[0].id : 'col_new';
  const allDone = g.taskCards.every(c=>c.colId===lastColId||c.colId==='done');
  if(allDone) return 'Hoàn thành';
  const allFirst = g.taskCards.every(c=>(c.colId===firstColId||c.colId==='todo'||!c.colId));
  if(allFirst) return 'Chờ làm';
  return 'Đang làm';
}

// Gọi sau mỗi thay đổi card GV: tự cập nhật status và thông báo khi done
function gvSyncStatus(g){
  const prev = g.status;
  const next = gvCalcStatus(g);
  if(next === prev) return;
  g.status = next;
  if(next === 'Hoàn thành' && prev !== 'Hoàn thành' && prev !== 'Chờ nghiệm thu'){
    // Tất cả cards done → chuyển sang Chờ nghiệm thu thay vì Hoàn thành
    g.status = 'Chờ nghiệm thu';
    const who = g.assignee || 'Người thực hiện';
    toast(`🔔 "${g.taskName}" hoàn thành — chờ nghiệm thu!`, '#27ae60', 5000);
    return; // status đã set riêng
  }
}

// GV: open kanban board for a giao viec item
let _gvBoardId = null;
function openGvBoard(gvId){
  const g = giaoViecList.find(x=>x.id===gvId);
  if(!g) return;
  _gvBoardId = gvId;
  // Build a temp task object for renderSubBoard
  const tempTask = {
    id: gvId,
    name: g.taskName,
    person: g.assignee,
    cols: g.taskCols,
    cards: g.taskCards||[],
  };
  document.getElementById('gvListWrap').style.display='none';
  document.getElementById('gvPendingPanel').style.display='none';
  document.getElementById('gvSubBoard').style.display='block';
  document.getElementById('gvSubBoardTitle').textContent = g.taskName;
  const gvPersonEl = document.getElementById('gvSubBoardPerson');
  if(gvPersonEl) gvPersonEl.innerHTML = g.assignee ? `<span class="tag-person ${g.assignee==='Hải'?'tag-hai':'tag-hieu'}" style="font-size:12px">${g.assignee}</span>` : '';
  renderGvKanban(tempTask);
}

function closeGvBoard(){
  _gvBoardId=null;
  _currentGvBoardId=null;
  _gvSelectedCardIds.clear();
  document.getElementById('gvSubBoard').style.display='none';
  document.getElementById('gvListWrap').style.display='block';
  const pp = document.getElementById('gvPendingPanel');
  if(pp) pp.style.display='none';
  renderGiaoViec();
}

function renderGvKanban(tempTask){
  const board = document.getElementById('gvKanbanBoard');
  if(!board) return;
  const g = giaoViecList.find(x=>x.id===tempTask.id);
  const cols = getProjectCols(tempTask);
  board.innerHTML='';
  cols.forEach(col=>{
    const cards=(tempTask.cards||[]).filter(c=>{
      if(c.colId===col.id) return true;
      if(col.id==='col_new'&&c.colId==='todo') return true;
      if(col.id==='col_pending'&&c.colId==='pending') return true;
      return false;
    });
    const isPending = col.id==='pending'||col.id==='col_pending';
    const colEl=document.createElement('div');
    colEl.style.cssText=`flex:0 0 220px;background:var(--gray-light);border-radius:10px;padding:10px;border-top:3px solid ${col.color};min-height:200px;max-height:calc(100vh - 220px);display:flex;flex-direction:column;overflow:hidden`;
    colEl.dataset.colId = col.id;
    colEl.innerHTML=`
      <div class="kb-col-header">
        <span class="kb-col-title" style="color:${col.color}">${col.label}</span>
        <span class="kb-col-count">${cards.length}</span>
      </div>
      <div class="kb-cards" id="gvcards-${col.id}" style="overflow-y:auto;flex:1"></div>
      <button class="kb-add-btn" onclick="openGvAddCardModal('${col.id}',${tempTask.id})">&#43; Thêm thẻ</button>`;
    // Drop target
    colEl.addEventListener('dragover',e=>{e.preventDefault();colEl.style.background='#fde8e8';});
    colEl.addEventListener('dragleave',()=>colEl.style.background='var(--gray-light)');
    colEl.addEventListener('drop',e=>{
      e.preventDefault(); colEl.style.background='var(--gray-light)';
      if(!dragCardId) return;
      if(isPending){
        pendingDragCard={cardId:dragCardId,colId:col.id,gvId:tempTask.id};
        const card=(tempTask.cards||[]).find(c=>c.id===dragCardId);
        document.getElementById('pendingReason').value=card?.pendingReason||'';
        document.getElementById('pendingModal').classList.add('open');
      } else {
        const card=(tempTask.cards||[]).find(c=>c.id===dragCardId);
        if(card){card.colId=col.id; delete card.pendingReason;}
        if(g){g.taskCards=tempTask.cards; gvSyncStatus(g);}
        saveAppData();
        renderGvKanban(tempTask);
        renderGiaoViec();
        toast('Đã chuyển thẻ');
      }
      dragCardId=null;
    });
    board.appendChild(colEl);

    const cardsEl=colEl.querySelector('#gvcards-'+col.id);
    const isLastCol=col.id===cols[cols.length-1].id||col.id==='done';
    cards.forEach(card=>{
      const nextCol=!isLastCol?cols[cols.indexOf(col)+1]:null;

      const rowEl=document.createElement('div');
      rowEl.style.cssText='display:flex;align-items:center;gap:5px;margin-bottom:8px';

      // Left: select checkbox
      const gvSelWrap=document.createElement('div');
      gvSelWrap.style.cssText='flex-shrink:0;width:18px;display:flex;align-items:center;justify-content:center';
      gvSelWrap.innerHTML=`<input type="checkbox" class="gv-card-chk" data-cardid="${card.id}" data-gvid="${tempTask.id}"
        style="cursor:pointer;accent-color:var(--red);width:14px;height:14px"
        onchange="onGvCardCheck(event)">`;

      // Card body
      const cardEl=document.createElement('div');
      cardEl.className='kb-card';
      cardEl.style.cssText='margin-bottom:0;flex:1;min-width:0;position:relative';
      cardEl.draggable=true;
      cardEl.innerHTML=`
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;min-width:0;overflow:hidden">
            <div style="font-size:13px;font-weight:500;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isLastCol?'text-decoration:line-through;color:var(--text-muted)':''}">
              <span class="kb-card-name" style="cursor:pointer"
                onclick="event.stopPropagation();openGvEditCardModal('${col.id}','${card.id}',${tempTask.id})"
                title="${(card.name||'').replace(/"/g,'&quot;')}">${card.name}</span>
            </div>
            ${card.desc?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer"
              onclick="event.stopPropagation();openGvEditCardModal('${col.id}','${card.id}',${tempTask.id})">${card.desc}</div>`:''}
            ${card.pendingReason?`<div class="kb-card-pending">❙❙ ${card.pendingReason}</div>`:''}
          </div>
        </div>
        <span class="kb-card-tooltip-data" data-name="${(card.name||'').replace(/"/g,'&quot;').replace(/\`/g,'&#96;')}" data-desc="${(card.desc||'').replace(/"/g,'&quot;').replace(/\`/g,'&#96;')}" style="display:none"></span>`;

      // Right: tick to next col
      const tickWrap=document.createElement('label');
      tickWrap.title = nextCol ? '→ '+nextCol.label : 'Hoàn thành';
      tickWrap.style.cssText='flex-shrink:0;width:32px;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;opacity:.5;transition:opacity .15s';
      tickWrap.onmouseover=()=>tickWrap.style.opacity='1';
      tickWrap.onmouseout=()=>tickWrap.style.opacity='.5';
      tickWrap.innerHTML=`
        <input type="checkbox" ${isLastCol?'checked':''} style="cursor:pointer;accent-color:var(--red);width:14px;height:14px"
          onchange="gvMoveCard(event,${tempTask.id},'${card.id}','${col.id}')" onclick="event.stopPropagation()">
        <span style="font-size:8px;color:var(--text-muted);line-height:1.1;text-align:center">${nextCol?nextCol.label.slice(0,5):'Done'}</span>`;

      rowEl.appendChild(gvSelWrap);
      rowEl.appendChild(cardEl);
      rowEl.appendChild(tickWrap);

      cardEl.addEventListener('dragstart',e=>{e.stopPropagation();dragCardId=card.id;setTimeout(()=>cardEl.classList.add('dragging'),0);});
      cardEl.addEventListener('dragend',()=>{cardEl.classList.remove('dragging');dragCardId=null;});
      cardEl.addEventListener('mouseenter',e=>{
        const data=cardEl.querySelector('.kb-card-tooltip-data');
        if(!data) return;
        const name=data.dataset.name, desc=data.dataset.desc;
        if(!name&&!desc) return;
        showKbTooltip(e, name, desc);
      });
      cardEl.addEventListener('mousemove',e=>moveKbTooltip(e));
      cardEl.addEventListener('mouseleave',()=>hideKbTooltip());

      cardsEl.appendChild(rowEl);
    });
  });
}

// GV add/edit card modal (reuse the same modal as tasks)
let _gvEditCardId = null;
let _gvEditCardTaskId = null;
let _gvEditCardColId = null;

function openGvAddCardModal(colId, gvId){
  _gvEditCardId = null; _gvEditCardTaskId = gvId; _gvEditCardColId = colId;
  const g = giaoViecList.find(x=>x.id===gvId);
  if(!g) return;
  const cols = getProjectCols({cols:g.taskCols});
  document.getElementById('acTitle').textContent = 'Thêm thẻ';
  const sel = document.getElementById('ac_col');
  sel.innerHTML = cols.map(c=>`<option value="${c.id}" ${c.id===colId?'selected':''}>${c.label}</option>`).join('');
  document.getElementById('ac_name').value='';
  document.getElementById('ac_desc').value='';
  document.getElementById('ac_delete_btn').style.display='none';
  // Override save/delete to target gv
  document.getElementById('ac_delete_btn').onclick = ()=>deleteGvCard(gvId);
  document.querySelector('#addCardModal .modal-footer .btn-primary').onclick = ()=>saveGvCard(gvId);
  document.getElementById('addCardModal').classList.add('open');
  setTimeout(()=>document.getElementById('ac_name').focus(),100);
}

function openGvEditCardModal(colId, cardId, gvId){
  _gvEditCardId = cardId; _gvEditCardTaskId = gvId; _gvEditCardColId = colId;
  const g = giaoViecList.find(x=>x.id===gvId);
  if(!g) return;
  const card = (g.taskCards||[]).find(c=>c.id===cardId);
  if(!card) return;
  const cols = getProjectCols({cols:g.taskCols});
  document.getElementById('acTitle').textContent = '✎ Sửa thẻ';
  const sel = document.getElementById('ac_col');
  sel.innerHTML = cols.map(c=>`<option value="${c.id}" ${c.id===colId?'selected':''}>${c.label}</option>`).join('');
  document.getElementById('ac_name').value = card.name||'';
  document.getElementById('ac_desc').value = card.desc||'';
  document.getElementById('ac_delete_btn').style.display='inline-flex';
  document.getElementById('ac_delete_btn').onclick = ()=>deleteGvCard(gvId);
  document.querySelector('#addCardModal .modal-footer .btn-primary').onclick = ()=>saveGvCard(gvId);
  document.getElementById('addCardModal').classList.add('open');
  setTimeout(()=>document.getElementById('ac_name').focus(),100);
}

function saveGvCard(gvId){
  const name = (document.getElementById('ac_name').value||'').trim();
  if(!name){ toast('Nhập tên thẻ!','#e74c3c'); return; }
  const g = giaoViecList.find(x=>x.id===gvId);
  if(!g) return;
  const colId = document.getElementById('ac_col').value;
  const desc = document.getElementById('ac_desc').value.trim();
  if(_gvEditCardId){
    const card = (g.taskCards||[]).find(c=>c.id===_gvEditCardId);
    if(card){ card.name=name; card.colId=colId; card.desc=desc; }
  } else {
    if(!g.taskCards) g.taskCards=[];
    g.taskCards.push({id:'gvc'+cardNextId++, colId, name, desc});
  }
  gvSyncStatus(g);
  saveAppData();
  closeAddCardModal();
  renderGvKanban({id:gvId, name:g.taskName, cols:g.taskCols, cards:g.taskCards});
  toast('✓ Đã lưu thẻ!');
}

function deleteGvCard(gvId){
  if(!_gvEditCardId||!confirm('Xoá thẻ này?')) return;
  const g = giaoViecList.find(x=>x.id===gvId);
  if(!g) return;
  g.taskCards = (g.taskCards||[]).filter(c=>c.id!==_gvEditCardId);
  saveAppData();
  closeAddCardModal();
  renderGvKanban({id:gvId, name:g.taskName, cols:g.taskCols, cards:g.taskCards});
  toast('Đã xoá thẻ.');
}

// ===== GV CARD BULK SELECT =====
let _gvSelectedCardIds = new Set();
let _currentGvBoardId = null;

function onGvCardCheck(event){
  event.stopPropagation();
  const chk = event.target;
  const cardId = chk.dataset.cardid;
  const gvId = parseInt(chk.dataset.gvid);
  _currentGvBoardId = gvId;
  if(chk.checked) _gvSelectedCardIds.add(cardId);
  else _gvSelectedCardIds.delete(cardId);
  updateGvCardBulkBar();
}

function updateGvCardBulkBar(){
  const bar = document.getElementById('gvCardBulkBar');
  const cnt = document.getElementById('gvCardBulkCount');
  if(!bar) return;
  if(_gvSelectedCardIds.size > 0){
    bar.style.display='flex';
    cnt.textContent = _gvSelectedCardIds.size + ' thẻ đã chọn';
  } else {
    bar.style.display='none';
  }
}

function gvClearCardSelection(){
  _gvSelectedCardIds.clear();
  document.querySelectorAll('.gv-card-chk').forEach(c=>c.checked=false);
  updateGvCardBulkBar();
}

function toggleGvSelectAllMenu(){
  const menu = document.getElementById('gvSelectAllMenu');
  if(!menu) return;
  const isOpen = menu.style.display!=='none';
  if(isOpen){ menu.style.display='none'; return; }
  // Populate column items
  if(_currentGvBoardId){
    const g = giaoViecList.find(x=>x.id===_currentGvBoardId);
    const colItems = document.getElementById('gvSelectColItems');
    if(g && colItems){
      const cols = getProjectCols({cols:g.taskCols});
      colItems.innerHTML = cols.map(col=>{
        const cnt = (g.taskCards||[]).filter(c=>c.colId===col.id||(col.id==='col_new'&&c.colId==='todo')).length;
        return `<div onclick="gvSelectColCards('${col.id}')"
          style="padding:9px 14px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--gray-border);display:flex;align-items:center;justify-content:space-between"
          onmouseover="this.style.background='#fdf2f2'" onmouseout="this.style.background=''">
          <span style="color:${col.color}">${col.label}</span>
          <span style="font-size:11px;color:var(--text-muted)">${cnt}</span>
        </div>`;
      }).join('');
    }
  }
  menu.style.display='block';
  setTimeout(()=>{
    function outsideClick(e){
      if(!document.getElementById('gvSelectAllMenu')?.contains(e.target)){
        document.getElementById('gvSelectAllMenu').style.display='none';
        document.removeEventListener('click', outsideClick);
      }
    }
    document.addEventListener('click', outsideClick);
  }, 10);
}

function gvSelectAllCards(){
  if(!_currentGvBoardId) return;
  const g = giaoViecList.find(x=>x.id===_currentGvBoardId);
  if(!g) return;
  (g.taskCards||[]).forEach(c=>_gvSelectedCardIds.add(c.id));
  document.querySelectorAll('.gv-card-chk').forEach(chk=>{ chk.checked=true; });
  updateGvCardBulkBar();
}

function gvSelectColCards(colId){
  if(!_currentGvBoardId) return;
  const g = giaoViecList.find(x=>x.id===_currentGvBoardId);
  if(!g) return;
  const colCards = (g.taskCards||[]).filter(c=>c.colId===colId||(colId==='col_new'&&c.colId==='todo'));
  const ids = new Set(colCards.map(c=>c.id));
  document.querySelectorAll('.gv-card-chk').forEach(chk=>{
    if(!ids.has(chk.dataset.cardid)) return;
    chk.checked=true;
    _gvSelectedCardIds.add(chk.dataset.cardid);
  });
  updateGvCardBulkBar();
  toast(`☑ Đã chọn ${colCards.length} thẻ trong cột`, '#2c3e50', 2000);
}

function gvBulkCardMove(){
  if(!_currentGvBoardId||!_gvSelectedCardIds.size) return;
  const g = giaoViecList.find(x=>x.id===_currentGvBoardId);
  if(!g) return;
  const cols = getProjectCols({cols:g.taskCols});
  (g.taskCards||[]).forEach(card=>{
    if(!_gvSelectedCardIds.has(card.id)) return;
    const curIdx = cols.findIndex(c=>c.id===card.colId||(c.id==='col_new'&&card.colId==='todo'));
    const next = cols[curIdx+1];
    if(next && next.id!=='pending' && next.id!=='col_pending') card.colId=next.id;
  });
  gvSyncStatus(g);
  saveAppData();
  gvClearCardSelection();
  renderGvKanban({id:g.id, name:g.taskName, cols:g.taskCols, cards:g.taskCards});
  toast('→ Đã chuyển thẻ sang cột tiếp');
}

function gvBulkCardCopyUrls(btn){
  if(!_currentGvBoardId||!_gvSelectedCardIds.size) return;
  const g = giaoViecList.find(x=>x.id===_currentGvBoardId);
  if(!g) return;
  const urls = (g.taskCards||[]).filter(c=>_gvSelectedCardIds.has(c.id)).map(c=>c.name).join('\n');
  copyText(urls, btn);
}

function gvBulkCardCopyVidco(btn){
  if(!_currentGvBoardId||!_gvSelectedCardIds.size) return;
  const g = giaoViecList.find(x=>x.id===_currentGvBoardId);
  if(!g) return;
  const selected = (g.taskCards||[]).filter(c=>_gvSelectedCardIds.has(c.id));
  const lines = selected.map(c=>{
    const q=c.name.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    const ws=websites.find(w=>{const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');return wu===q||wu.includes(q)||q.includes(wu);});
    if(!ws) return null;
    const domain=(ws.url||'').replace(/https?:\/\//,'').replace(/\/$/,'');
    const owner=(ws.owner&&ws.owner!=='Công ty'&&ws.owner!=='Chung')?ws.owner:'';
    return domain+' | '+(ws.admin||'')+' | '+(ws.account||'')+' | '+(ws.password||'')+' | '+(ws.group||'')+' | '+owner;
  }).filter(Boolean);
  if(!lines.length){ toast('Không có URL nào nhận diện được.','#e67e22'); return; }
  copyText(lines.join('\n'), btn);
}

function gvBulkCardDelete(){
  if(!_currentGvBoardId||!_gvSelectedCardIds.size) return;
  const g = giaoViecList.find(x=>x.id===_currentGvBoardId);
  if(!g||!confirm('Xoá '+_gvSelectedCardIds.size+' thẻ đã chọn?')) return;
  const n = _gvSelectedCardIds.size;
  g.taskCards = (g.taskCards||[]).filter(c=>!_gvSelectedCardIds.has(c.id));
  saveAppData();
  gvClearCardSelection();
  renderGvKanban({id:g.id, name:g.taskName, cols:g.taskCols, cards:g.taskCards});
  toast('🗑 Đã xoá '+n+' thẻ');
}

function gvMoveCard(event, gvId, cardId, currentColId){
  event.stopPropagation();
  const g = giaoViecList.find(x=>x.id===gvId);
  if(!g) return;
  const cols = getProjectCols({cols:g.taskCols});
  const card=(g.taskCards||[]).find(c=>c.id===cardId);
  if(!card) return;
  const curIdx=cols.findIndex(c=>c.id===currentColId);
  const nextCol=cols[curIdx+1];
  if(!nextCol){
    if(!event.target.checked&&curIdx>0) card.colId=cols[curIdx-1].id;
    gvSyncStatus(g);
    saveAppData(); renderGvKanban({id:gvId,cols:g.taskCols,cards:g.taskCards}); renderGiaoViec(); return;
  }
  if(nextCol.id==='pending'||nextCol.id==='col_pending'){
    event.target.checked=false;
    pendingDragCard={cardId,colId:nextCol.id,gvId};
    document.getElementById('pendingReason').value=card.pendingReason||'';
    document.getElementById('pendingModal').classList.add('open');
  } else {
    card.colId=nextCol.id;
    delete card.pendingReason;
    const _g=giaoViecList.find(x=>x.id===gvId);
    if(_g) _g.taskCards=g.taskCards;
    gvSyncStatus(g);
    saveAppData();
    renderGvKanban({id:gvId,name:g.taskName,cols:g.taskCols,cards:g.taskCards});
    renderGiaoViec();
    toast(`→ ${nextCol.label}`);
  }
}

// GV: pending task cha (trong giao viec)
function openGvTaskPending(gvId){
  const g = giaoViecList.find(x=>x.id===gvId);
  if(!g) return;
  document.getElementById('tpm_taskId').value = 'gv_'+gvId;
  document.getElementById('tpmTaskName').textContent = g.taskName + ' → ' + g.assignee;
  document.getElementById('tpm_reason').value = g.pendingReason||'';
  document.getElementById('tpm_note').value = g.pendingNote||'';
  const isAlready = !!g.pendingReason;
  document.getElementById('tpmTitle').textContent = isAlready?'⏸ Sửa / xoá pending':'⏸ Pending task giao';
  document.getElementById('tpmClearBtn').style.display = isAlready?'inline-flex':'none';
  document.getElementById('taskPendingModal').classList.add('open');
  setTimeout(()=>document.getElementById('tpm_reason').focus(),100);
}

// GV: pending summary
function renderGvPendingSummary(){
  const panel = document.getElementById('gvPendingPanel');
  const body = document.getElementById('gvPendingBody');
  const cnt = document.getElementById('gvPendingCount');
  if(!panel||!body) return;

  // Pending parent gv tasks
  const pendingParents = giaoViecList.filter(g=>g.pendingReason && (currentMember!=='hai' || g.assignee==='Hải'));
  // Pending child cards within gv tasks
  const pendingCards = [];
  giaoViecList.filter(g=>currentMember!=='hai' || g.assignee==='Hải').forEach(g=>{
    (g.taskCards||[]).forEach(card=>{
      if(card.pendingReason) pendingCards.push({g,card});
    });
  });
  const total = pendingParents.length + pendingCards.length;
  if(!total){panel.style.display='none';return;}
  panel.style.display='block';
  cnt.textContent=total;

  const STATUSES=['Chờ xử lý','Đang xử lý','Đã xử lý xong'];
  const sColor={'Chờ xử lý':'#e67e22','Đang xử lý':'#2980b9','Đã xử lý xong':'#27ae60'};

  const parentRows = pendingParents.map(g=>{
    const st=g.pendingStatus||'Chờ xử lý';
    const age=g.pendingDate?daysSince(g.pendingDate):0;
    const ageStr=age===0?'Hôm nay':age===1?'Hôm qua':`${age} ngày`;
    return `<tr style="border-bottom:1px solid #fce0b0;background:#fff3e6">
      <td style="padding:7px 12px;font-size:12px;font-weight:600">${g.taskName} <span style="font-size:10px;background:#e67e22;color:#fff;border-radius:10px;padding:1px 6px;margin-left:4px">Task cha</span></td>
      <td style="padding:7px 12px;font-size:11px;color:var(--text-muted)">👤 ${g.assignee}</td>
      <td style="padding:7px 12px;font-size:12px;white-space:nowrap">${g.pendingDate?fmtDate(g.pendingDate):'?'} <span style="font-size:11px;color:var(--text-muted)">(${ageStr})</span></td>
      <td style="padding:7px 12px;font-size:12px;color:var(--text-muted);max-width:180px">${g.pendingReason||'—'}</td>
      <td style="padding:7px 12px">
        <select onchange="updateGvPendingStatus(${g.id},null,this.value)"
          style="font-size:11px;padding:2px 6px;border:1px solid #fce0b0;border-radius:4px;background:#fff;color:${sColor[st]};font-weight:500">
          ${STATUSES.map(s=>`<option ${st===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 8px;white-space:nowrap">
        <button onclick="resolveGvPending(${g.id},null)" class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 8px;color:#27ae60;border-color:#27ae60">✓ Bỏ pending</button>
      </td>
    </tr>`;
  }).join('');

  const cardRows = pendingCards.map(({g,card})=>{
    const st=card.pendingStatus||'Chờ xử lý';
    const age=card.pendingDate?daysSince(card.pendingDate):0;
    const ageStr=age===0?'Hôm nay':age===1?'Hôm qua':`${age} ngày`;
    return `<tr style="border-bottom:1px solid #fce0b0">
      <td style="padding:7px 12px;font-size:12px"><span onclick="openGvBoard(${g.id})" style="color:var(--blue);cursor:pointer;font-weight:500">${g.taskName}</span></td>
      <td style="padding:7px 12px;font-size:12px;font-weight:500">${card.name}</td>
      <td style="padding:7px 12px;font-size:12px;white-space:nowrap">${card.pendingDate?fmtDate(card.pendingDate):'?'} <span style="font-size:11px;color:var(--text-muted)">(${ageStr})</span></td>
      <td style="padding:7px 12px;font-size:12px;color:var(--text-muted);max-width:180px">${card.pendingReason||'—'}</td>
      <td style="padding:7px 12px">
        <select onchange="updateGvPendingStatus(${g.id},'${card.id}',this.value)"
          style="font-size:11px;padding:2px 6px;border:1px solid #fce0b0;border-radius:4px;background:#fff;color:${sColor[st]};font-weight:500">
          ${STATUSES.map(s=>`<option ${st===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 8px;white-space:nowrap">
        <button onclick="resolveGvPending(${g.id},'${card.id}')" class="btn btn-sm btn-primary" style="font-size:11px;padding:3px 8px">✓ Done</button>
      </td>
    </tr>`;
  }).join('');

  body.innerHTML = parentRows + cardRows;
}

function updateGvPendingStatus(gvId, cardId, status){
  const g = giaoViecList.find(x=>x.id===gvId);
  if(!g) return;
  if(cardId){
    const card=(g.taskCards||[]).find(c=>c.id===cardId);
    if(card) card.pendingStatus=status;
  } else {
    g.pendingStatus=status;
  }
  saveAppData();
}

function resolveGvPending(gvId, cardId){
  const g = giaoViecList.find(x=>x.id===gvId);
  if(!g) return;
  if(cardId){
    const card=(g.taskCards||[]).find(c=>c.id===cardId);
    if(card){ const cols=getProjectCols({cols:g.taskCols}); const pIdx=cols.findIndex(c=>c.id==='col_pending'||c.id==='pending'); card.colId=pIdx>0?cols[pIdx-1].id:cols[0].id; delete card.pendingReason; delete card.pendingDate; delete card.pendingStatus; }
  } else {
    delete g.pendingReason; delete g.pendingNote; delete g.pendingDate; delete g.pendingStatus;
  }
  saveAppData();
  renderGiaoViec();
  toast('✓ Đã bỏ pending');
}

function updateGvBadge(){
  const badge = document.getElementById('gvBadge');
  if(!badge) return;
  const myItems = currentMember==='hai'
    ? giaoViecList.filter(g=>g.assignee==='Hải')
    : currentMember==='hieu'
    ? giaoViecList.filter(g=>g.assignee==='Hiếu')
    : giaoViecList;
  const pending = myItems.filter(g=>g.status!=='Hoàn thành'&&g.status!=='Đã nghiệm thu').length;
  if(pending){ badge.textContent=pending; badge.style.display='inline'; }
  else badge.style.display='none';
}

function openGiaoViecFromTask(taskId){
  const t = tasks.find(x=>x.id===taskId);
  if(!t) return;
  _gvTaskRef = t;
  document.getElementById('gv_editId').value='';
  document.getElementById('gvModalTitle').textContent='📤 Giao việc';
  const preview = document.getElementById('gvTaskPreview');
  const pct = calcProjectProgress(t);
  preview.innerHTML = `<div style="font-weight:600;font-size:13px;margin-bottom:4px">${t.name}</div>
    <div style="display:flex;gap:8px;font-size:12px;color:var(--text-muted)">
      <span>${t.type||''}</span>${t.deadline?`<span>📅 DL: ${fmtDate(t.deadline)}</span>`:''}
      <span>${pct}% hoàn thành</span>
    </div>`;
  document.getElementById('gvAssigneeInput').value='';
  document.getElementById('gvDeadline').value=t.deadline||'';
  document.getElementById('gvStatus').value='Chờ làm';
  document.getElementById('gvNote').value='';
  document.getElementById('gvDeleteBtn').style.display='none';
  document.getElementById('giaoViecModal').classList.add('open');
  setTimeout(()=>document.getElementById('gvAssigneeInput').focus(),100);
}

function openEditGiaoViec(id){
  const g = giaoViecList.find(x=>x.id===id);
  if(!g) return;
  _gvTaskRef = null;
  document.getElementById('gv_editId').value=id;
  document.getElementById('gvModalTitle').textContent='✎ Sửa giao việc';
  const preview = document.getElementById('gvTaskPreview');
  preview.innerHTML=`<div style="font-weight:600;font-size:13px">${g.taskName}</div>`;
  document.getElementById('gvAssigneeInput').value=g.assignee||'';
  document.getElementById('gvDeadline').value=g.deadline||'';
  document.getElementById('gvStatus').value=g.status||'Chờ làm';
  document.getElementById('gvNote').value=g.note||'';
  document.getElementById('gvDeleteBtn').style.display='inline-flex';
  document.getElementById('giaoViecModal').classList.add('open');
  setTimeout(()=>document.getElementById('gvAssigneeInput').focus(),100);
}

function closeGiaoViecModal(){
  document.getElementById('giaoViecModal').classList.remove('open');
  _gvTaskRef=null;
}

function saveGiaoViec(){
  const assignee = (document.getElementById('gvAssigneeInput')?.value||'').trim();
  if(!assignee){ toast('Vui lòng nhập người nhận!','#e74c3c'); return; }
  const editId = document.getElementById('gv_editId')?.value;
  const obj = {
    assignee,
    deadline: document.getElementById('gvDeadline')?.value||'',
    status: document.getElementById('gvStatus')?.value||'Chờ làm',
    note: document.getElementById('gvNote')?.value||'',
    assigner: currentMember==='admin'?'Admin':currentMember==='hieu'?'Hiếu':'',
    createdAt: todayVN(),
  };
  if(editId){
    const g = giaoViecList.find(x=>x.id===parseInt(editId));
    if(g) Object.assign(g, obj);
  } else {
    const t = _gvTaskRef;
    const newItem = {
      id: giaoViecNextId++,
      taskId: t?.id||null,
      taskName: t?.name||'(không rõ)',
      taskType: t?.type||'',
      taskDesc: t?.desc||'',
      taskDeadline: t?.deadline||'',
      taskPriority: t?.priority||'',
      taskPerson: t?.person||'',
      taskTeam: t?.team||'',
      taskFrom: t?.from||'',
      taskCols: t?.cols||null,
      taskCards: t?.cards||[],
      ...obj
    };
    giaoViecList.push(newItem);
    // Auto-add assignee to list if not exists
    if(!assignees.includes(assignee)) assignees.push(assignee);
    // Remove from tasks — task đã giao chuyển hẳn sang tab Giao việc
    if(t) tasks = tasks.filter(x=>x.id!==t.id);
  }
  saveAppData();
  closeGiaoViecModal();
  renderTasksOverview(); // refresh task list immediately
  switchTasksTab('giaoviec');
  toast(`✓ Đã giao việc cho ${assignee}`);
}

function updateGvStatus(id, status){
  const g = giaoViecList.find(x=>x.id===id);
  if(!g) return;
  if(status==='Hoàn thành'){
    // Mọi task khi chuyển Hoàn thành → Chờ nghiệm thu (cần xác nhận nghiệm thu)
    g.status='Chờ nghiệm thu';
    g.completedAt=todayVN();
    saveAppData();
    renderGiaoViec();
    toast(`🔔 "${g.taskName}" — đang chờ nghiệm thu`,'#27ae60');
  } else {
    g.status = status;
    saveAppData();
    renderGiaoViec();
    toast(`✓ Cập nhật trạng thái: ${status}`);
  }
}

function confirmNghiemThu(id){
  const g = giaoViecList.find(x=>x.id===id);
  if(!g) return;
  g.status='Đã nghiệm thu';
  g.acceptedAt=todayVN();
  saveAppData();
  renderGiaoViec();
  toast('✅ Đã nghiệm thu: '+g.taskName);
}

function renderGvDoneSection(){
  const sec = document.getElementById('gvDoneSection');
  const doneList = document.getElementById('gvDoneList');
  const cnt = document.getElementById('gvDoneCount');
  if(!sec) return;

  const doneItems = giaoViecList.filter(g=>{
    if(g.status!=='Đã nghiệm thu') return false;
    if(currentMember==='hai' && g.assignee!=='Hải') return false;
    return true;
  }).slice().sort((a,b)=>(b.acceptedAt||'').localeCompare(a.acceptedAt||''));

  if(!doneItems.length){ sec.style.display='none'; return; }
  sec.style.display='block';
  cnt.textContent=doneItems.length;

  const isOpen=(localStorage.getItem('gv_done_open')||'0')==='1';
  const chevron=document.getElementById('gvDoneChevron');
  if(chevron) chevron.textContent=isOpen?'▲':'▼';
  doneList.style.display=isOpen?'flex':'none';

  // Bulk select
  const selIds = new Set();
  doneList.innerHTML = doneItems.map(g=>`
    <div class="gv-card" style="opacity:.85;border-left:3px solid #27ae60">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <input type="checkbox" class="gv-done-chk" data-id="${g.id}" onchange="updateGvDoneBulk()"
          style="width:16px;height:16px;cursor:pointer;accent-color:var(--red);flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${g.taskName}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
            👤 ${g.assignee}
            ${g.assigner?` · Giao bởi: ${g.assigner}`:''}
            ${g.acceptedAt?` · Nghiệm thu: ${fmtDate(g.acceptedAt)}`:''}
          </div>
        </div>
        ${currentMember!=='hai'?`<button onclick="restoreGvDone(${g.id})" title="Khôi phục về Chờ làm"
          style="background:none;border:1px solid #b8d4ea;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;color:#2980b9">↩ Khôi phục</button>
        <button onclick="deleteGvDone(${g.id})" title="Xoá"
          style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--text-muted);opacity:.5"
          onmouseover="this.style.opacity=1;this.style.color='#e74c3c'" onmouseout="this.style.opacity=.5;this.style.color='var(--text-muted)'">🗑</button>`:''}
      </div>
    </div>`).join('');

  // Bulk bar
  const bar = document.getElementById('gvDoneBulkBar');
  if(bar) bar.style.display='none';
}

function toggleGvDoneSection(){
  const cur=(localStorage.getItem('gv_done_open')||'0')==='1';
  localStorage.setItem('gv_done_open', cur?'0':'1');
  renderGvDoneSection();
}

function updateGvDoneBulk(){
  const chks=[...document.querySelectorAll('.gv-done-chk:checked')];
  const bar=document.getElementById('gvDoneBulkBar');
  const cnt=document.getElementById('gvDoneBulkCount');
  if(bar){ bar.style.display=chks.length?'flex':'none'; }
  if(cnt) cnt.textContent=chks.length+' đã chọn';
}

function bulkDeleteGvDone(){
  const ids=[...document.querySelectorAll('.gv-done-chk:checked')].map(c=>parseInt(c.dataset.id));
  if(!ids.length) return;
  if(!confirm('Xoá '+ids.length+' task đã nghiệm thu?')) return;
  giaoViecList=giaoViecList.filter(g=>!ids.includes(g.id));
  saveAppData(); renderGiaoViec(); toast('Đã xoá '+ids.length+' task.');
}

function restoreGvDone(id){
  const g=giaoViecList.find(x=>x.id===id);
  if(!g) return;
  g.status='Chờ làm';
  delete g.acceptedAt; delete g.completedAt;
  saveAppData(); renderGiaoViec();
  toast('↩ Đã khôi phục: '+g.taskName);
}

function deleteGvDone(id){
  const g=giaoViecList.find(x=>x.id===id);
  if(!g||!confirm('Xoá "'+g.taskName+'"?')) return;
  giaoViecList=giaoViecList.filter(x=>x.id!==id);
  saveAppData(); renderGiaoViec(); toast('Đã xoá.');
}

function recallGiaoViec(id){
  try{
  const g = giaoViecList.find(x=>x.id===id);
  if(!g){ toast('Không tìm thấy task id='+id,'#e74c3c'); return; }
  if(!confirm(`Thu hồi "${g.taskName}"?\nTask sẽ trở về tab "Task của tôi".`)) return;
  // Person: giao lại cho người thu hồi (Hiếu/admin), không phải Hải
  const recallPerson = currentMember==='hieu' ? 'Hiếu' : currentMember==='admin' ? (g.taskPerson==='Hải'?'Hiếu':g.taskPerson||'') : g.taskPerson||'';
  const restored = {
    id: taskNextId++,
    name: g.taskName,
    type: g.taskType||'Khác',
    desc: g.taskDesc||'',
    deadline: g.taskDeadline||'',
    priority: g.taskPriority||'Bình thường',
    person: recallPerson,
    team: g.taskTeam||'Team 01',
    from: g.taskFrom||todayVN(),
    cols: g.taskCols||null,
    cards: g.taskCards||[],
  };
  // Also normalize taskCols from giaoViec if it's an object
  if(restored.cols && !Array.isArray(restored.cols) && typeof restored.cols === 'object'){
    const e = Object.entries(restored.cols).sort((a,b)=>parseInt(a[0])-parseInt(b[0]));
    restored.cols = e.map(x=>x[1]);
  }
  if(restored.cards && !Array.isArray(restored.cards) && typeof restored.cards === 'object'){
    const e = Object.entries(restored.cards).sort((a,b)=>parseInt(a[0])-parseInt(b[0]));
    restored.cards = e.map(x=>x[1]);
  }
  normalizeTaskCards(restored);
  tasks.push(restored);
  giaoViecList = giaoViecList.filter(x=>x.id!==id);
  saveAppData();
  renderGiaoViec();
  renderTasksOverview();
  switchTasksTab('mytasks');
  toast('↩ Đã thu hồi: '+g.taskName);
  }catch(e){ toast('Lỗi thu hồi: '+e.message,'#e74c3c'); console.error(e); }
}

function deleteGiaoViec(){
  const editId = parseInt(document.getElementById('gv_editId')?.value);
  if(!editId||!confirm('Xoá việc đã giao này?')) return;
  giaoViecList = giaoViecList.filter(g=>g.id!==editId);
  saveAppData();
  closeGiaoViecModal();
  renderGiaoViec();
  toast('Đã xoá.');
}

// Assignee search dropdown
function gvAssigneeSearch(){
  const q = (document.getElementById('gvAssigneeInput')?.value||'').toLowerCase();
  const drop = document.getElementById('gvAssigneeDropdown');
  if(!drop) return;
  const filtered = assignees.filter(a=>a.toLowerCase().includes(q));
  if(!filtered.length||!q){ drop.style.display='none'; return; }
  drop.innerHTML = filtered.map(a=>`<div class="search-item" onclick="gvSelectAssignee('${a.replace(/'/g,"\\'")}')"
    style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--gray-border)">👤 ${a}</div>`).join('');
  drop.style.display='block';
}

function gvSelectAssignee(name){
  const inp = document.getElementById('gvAssigneeInput');
  if(inp) inp.value=name;
  const drop = document.getElementById('gvAssigneeDropdown');
  if(drop) drop.style.display='none';
}

// Close dropdown on outside click
document.addEventListener('click',e=>{ if(!e.target.closest('#giaoViecModal')) { const d=document.getElementById('gvAssigneeDropdown'); if(d) d.style.display='none'; } });

// Manage assignees
function openManageAssignees(){
  renderAssigneeList();
  document.getElementById('manageAssigneesModal').classList.add('open');
  setTimeout(()=>document.getElementById('newAssigneeName').focus(),100);
}
function closeManageAssignees(){
  document.getElementById('manageAssigneesModal').classList.remove('open');
}

function renderAssigneeList(){
  const el = document.getElementById('assigneeList');
  if(!el) return;
  if(!assignees.length){ el.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:16px">Chưa có người nhận nào</div>'; return; }
  el.innerHTML = assignees.map((a,i)=>`
    <div style="display:flex;align-items:center;gap:8px;background:#f8f9fa;border:1px solid var(--gray-border);border-radius:6px;padding:8px 10px">
      <input type="text" value="${a}" onchange="renameAssignee(${i},this.value)"
        style="flex:1;border:none;background:transparent;font-size:13px;outline:none">
      <button onclick="removeAssignee(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px"
        onmouseover="this.style.color='#e74c3c'" onmouseout="this.style.color='var(--text-muted)'">✕</button>
    </div>`).join('');
}

function addAssignee(){
  const inp = document.getElementById('newAssigneeName');
  const name = (inp?.value||'').trim();
  if(!name){ toast('Nhập tên!','#e74c3c'); return; }
  if(assignees.includes(name)){ toast('Tên đã tồn tại!','#e67e22'); return; }
  assignees.push(name);
  if(inp) inp.value='';
  saveAppData();
  renderAssigneeList();
}

function renameAssignee(i, newName){
  newName = newName.trim();
  if(!newName){ renderAssigneeList(); return; }
  const old = assignees[i];
  assignees[i] = newName;
  // Update in giaoViecList too
  giaoViecList.forEach(g=>{ if(g.assignee===old) g.assignee=newName; });
  saveAppData();
  renderAssigneeList();
}

function removeAssignee(i){
  const name = assignees[i];
  if(!confirm(`Xoá "${name}" khỏi danh sách?`)) return;
  assignees.splice(i,1);
  saveAppData();
  renderAssigneeList();
}

// ===== INDEX ID ASSIGNMENT =====
let _assignSheet = null;
let _assignIds = []; // row ids being assigned (single or bulk)

function _getIndexIdOptions(){
  // Return active (non-done) index tasks sorted newest first
  return indexTasks.filter(t=>t.status!=='Done').slice().reverse();
}

function _populateAssignSelect(){
  const sel = document.getElementById('assignIdSelect');
  if(!sel) return;
  const opts = _getIndexIdOptions();
  sel.innerHTML = '<option value="">-- Chọn từ danh sách --</option>'
    + opts.map(t=>`<option value="${t.taskId}">${t.taskId}${t.name?' — '+t.name:''}</option>`).join('');
}

function onAssignIdSelectChange(){
  const sel = document.getElementById('assignIdSelect');
  const manual = document.getElementById('assignIdManual');
  if(sel&&manual&&sel.value) manual.value = sel.value;
}

function openAssignIndexId(sheet, rowId){
  _assignSheet = sheet;
  _assignIds = [rowId];
  const r = data[sheet].find(x=>x.id===rowId);
  const ctx = document.getElementById('assignIdContext');
  if(ctx) ctx.textContent = `Bài: ${r?.keyword||'(không tên)'} — ${fmtDate(r?.ngay)||''}`;
  _populateAssignSelect();
  const manual = document.getElementById('assignIdManual');
  if(manual) manual.value = r?.indexId||'';
  const sel = document.getElementById('assignIdSelect');
  if(sel) sel.value = r?.indexId||'';
  document.getElementById('assignIndexIdModal').classList.add('open');
  setTimeout(()=>document.getElementById('assignIdManual').focus(),100);
}

function openBulkIndexId(sheet){
  const ids = [...selected[sheet]];
  if(!ids.length){ toast('Chưa chọn dòng nào!','#e74c3c'); return; }
  _assignSheet = sheet;
  _assignIds = ids;
  const ctx = document.getElementById('assignIdContext');
  if(ctx) ctx.textContent = `Gán cho ${ids.length} dòng đã chọn trong Sheet ${sheet==='hai'?'Hải':'Hiếu'}`;
  _populateAssignSelect();
  const manual = document.getElementById('assignIdManual');
  if(manual) manual.value = '';
  const sel = document.getElementById('assignIdSelect');
  if(sel) sel.value = '';
  document.getElementById('assignIndexIdModal').classList.add('open');
  setTimeout(()=>document.getElementById('assignIdManual').focus(),100);
}

function applyAssignIndexId(){
  const val = (document.getElementById('assignIdManual')?.value||'').trim()
           || (document.getElementById('assignIdSelect')?.value||'').trim();
  if(!val){ toast('Nhập hoặc chọn ID Index!','#e74c3c'); return; }
  _assignIds.forEach(id=>{
    const r = data[_assignSheet].find(x=>x.id===id);
    if(r) r.indexId = val;
  });
  saveAppData();
  closeAssignIndexIdModal();
  renderDashboard();
  toast(`✓ Đã gán ID "${val}" cho ${_assignIds.length} dòng`);
}

function clearAssignIndexId(){
  _assignIds.forEach(id=>{
    const r = data[_assignSheet].find(x=>x.id===id);
    if(r) r.indexId = '';
  });
  saveAppData();
  closeAssignIndexIdModal();
  renderDashboard();
  toast('Đã xoá ID Index khỏi các dòng đã chọn');
}

function closeAssignIndexIdModal(){
  document.getElementById('assignIndexIdModal').classList.remove('open');
  _assignSheet = null; _assignIds = [];
}

function clearIndexIdFilter(sheet){
  const el = document.getElementById('indexIdFilter'+sheet.charAt(0).toUpperCase()+sheet.slice(1));
  if(el){ el.value=''; }
  renderDashboard();
}

// ===== PROMPTS =====
let _promptTab = 'viet';

function switchPromptTab(tab){
  try{ sessionStorage.setItem('wt_activeSubPage', tab); } catch(e){}
  _promptTab = tab;
  ['viet','anh','note'].forEach(t=>{
    const btn=document.getElementById('ptab-'+t);
    if(btn) btn.classList.toggle('active',t===tab);
  });
  renderPrompts();
}

function renderPrompts(){
  const list = document.getElementById('promptList');
  const empty = document.getElementById('promptEmpty');
  if(!list) return;

  const q = (document.getElementById('promptSearch')?.value||'').toLowerCase();
  // _promptCatFilter stored on window
  const fCat = window._promptCatFilter||'';

  // Render category tags
  const cats = [...new Set(prompts.filter(p=>p.type===_promptTab).map(p=>p.cat||'Khác').filter(Boolean))].sort();
  const tagWrap = document.getElementById('promptCatTags');
  if(tagWrap){
    tagWrap.innerHTML = [
      `<span class="prompt-cat-tag ${!fCat?'active':''}" onclick="setPromptCat('')">Tất cả</span>`,
      ...cats.map(c=>`<span class="prompt-cat-tag ${fCat===c?'active':''}" onclick="setPromptCat('${c.replace(/'/g,"\\'")}')">${c}</span>`)
    ].join('');
  }

  let items = prompts.filter(p=>{
    if(p.type !== _promptTab) return false;
    if(fCat && (p.cat||'Khác') !== fCat) return false;
    if(q && !p.name.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q) && !(p.cat||'').toLowerCase().includes(q)) return false;
    return true;
  });

  if(!items.length){ list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';

  list.innerHTML = items.map(p=>`
    <div class="prompt-card type-${p.type}" id="pcard-${p.id}">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
            <span style="font-size:13px;font-weight:700;color:var(--text)">${p.name}</span>
            ${p.cat?`<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:#f0f0f0;color:#555;font-weight:500">${p.cat}</span>`:''}
          </div>
          ${p.note?`<div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">💡 ${p.note}</div>`:''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button onclick="copyPrompt(${p.id},this)" title="Copy prompt"
            style="background:#f0f7fd;border:1px solid #b8d4ea;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;font-weight:600;color:#2980b9;white-space:nowrap;transition:all .15s"
            onmouseover="this.style.background='#2980b9';this.style.color='#fff'" onmouseout="this.style.background='#f0f7fd';this.style.color='#2980b9'">📋 Copy</button>
          <button onclick="openEditPromptModal(${p.id})" title="Sửa"
            style="background:none;border:1px solid var(--gray-border);border-radius:6px;padding:5px 8px;cursor:pointer;font-size:12px"
            onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--gray-border)'">✎</button>
          <button onclick="togglePromptExpand(${p.id})" title="Xem đầy đủ / thu gọn"
            style="background:none;border:1px solid var(--gray-border);border-radius:6px;padding:5px 8px;cursor:pointer;font-size:11px"
            id="pexpand-${p.id}">▼</button>
        </div>
      </div>
      <div class="prompt-content" id="pcontent-${p.id}">${escHtml(p.content)}</div>
    </div>`).join('');
}

function setPromptCat(cat){
  window._promptCatFilter = cat;
  renderPrompts();
}

function pmCatSearch(){
  const q = (document.getElementById('pm_cat')?.value||'').toLowerCase();
  const type = document.getElementById('pm_type')?.value||'viet';
  const cats = [...new Set(prompts.filter(p=>p.type===type).map(p=>p.cat||'').filter(Boolean))].sort();
  const filtered = q ? cats.filter(c=>c.toLowerCase().includes(q)) : cats;
  const drop = document.getElementById('pmCatDrop');
  if(!drop) return;
  if(!filtered.length && !q){ drop.style.display='none'; return; }
  const addNew = q && !cats.map(c=>c.toLowerCase()).includes(q);
  drop.innerHTML = [
    ...filtered.map(c=>`<div onclick="pmSelectCat('${c.replace(/'/g,"\\'")}')"
      style="padding:7px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--gray-border)"
      onmouseover="this.style.background='#fdf2f2'" onmouseout="this.style.background=''">
      ${c}
    </div>`),
    addNew ? `<div onclick="pmSelectCat('${q.replace(/'/g,"\\'")}')"
      style="padding:7px 12px;cursor:pointer;font-size:13px;color:var(--red);font-weight:600"
      onmouseover="this.style.background='#fdf2f2'" onmouseout="this.style.background=''">
      + Thêm mới: "${q}"
    </div>` : ''
  ].join('');
  drop.style.display = (filtered.length || addNew) ? 'block' : 'none';
  pmRenderCatTags(type);
}

function pmSelectCat(cat){
  const inp = document.getElementById('pm_cat');
  if(inp) inp.value = cat;
  pmCatClose();
  pmRenderCatTags(document.getElementById('pm_type')?.value||'viet');
}

function pmCatClose(){
  const d = document.getElementById('pmCatDrop');
  if(d) d.style.display='none';
}

function pmRenderCatTags(type){
  const existing = document.getElementById('pmCatExisting');
  if(!existing) return;
  const cur = document.getElementById('pm_cat')?.value||'';
  const cats = [...new Set(prompts.filter(p=>p.type===type).map(p=>p.cat||'').filter(Boolean))].sort();
  if(!cats.length){ existing.innerHTML=''; return; }
  existing.innerHTML = cats.map(c=>`<span onclick="pmSelectCat('${c.replace(/'/g,"\\'")}')"
    style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;cursor:pointer;border:1px solid ${cur===c?'var(--red)':'var(--gray-border)'};background:${cur===c?'#fdf2f2':'#fff'};color:${cur===c?'var(--red)':'var(--text-muted)'};transition:all .15s"
    onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)'"
    onmouseout="this.style.borderColor='${cur===c?'var(--red)':'var(--gray-border)'}';this.style.color='${cur===c?'var(--red)':'var(--text-muted)'}'">
    ${c}
  </span>`).join('');
}

function escHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function togglePromptExpand(id){
  const el = document.getElementById('pcontent-'+id);
  const btn = document.getElementById('pexpand-'+id);
  if(!el) return;
  el.classList.toggle('expanded');
  if(btn) btn.textContent = el.classList.contains('expanded') ? '▲' : '▼';
}

function copyPrompt(id, btn){
  const p = prompts.find(x=>x.id===id);
  if(!p) return;
  copyText(p.content, btn);
}

function openAddPromptModal(){
  document.getElementById('pm_id').value='';
  document.getElementById('pm_name').value='';
  document.getElementById('pm_content').value='';
  document.getElementById('pm_note').value='';
  document.getElementById('pm_cat').value='';
  document.getElementById('pm_type').value=_promptTab==='note'?'note':_promptTab;
  document.getElementById('pm_delete_btn').style.display='none';
  document.getElementById('promptModalTitle').textContent='+ Thêm prompt';
  document.getElementById('promptModal').classList.add('open');
  pmRenderCatTags(_promptTab);
  setTimeout(()=>document.getElementById('pm_name').focus(),100);
}

function openEditPromptModal(id){
  const p = prompts.find(x=>x.id===id);
  if(!p) return;
  document.getElementById('pm_id').value=id;
  document.getElementById('pm_name').value=p.name;
  document.getElementById('pm_content').value=p.content;
  document.getElementById('pm_note').value=p.note||'';
  document.getElementById('pm_cat').value=p.cat||'';
  document.getElementById('pm_type').value=p.type;
  document.getElementById('pm_delete_btn').style.display='inline-flex';
  document.getElementById('promptModalTitle').textContent='✎ Sửa prompt';
  document.getElementById('promptModal').classList.add('open');
  pmRenderCatTags(p.type||'viet');
  setTimeout(()=>document.getElementById('pm_name').focus(),100);
}

function closePromptModal(){
  document.getElementById('promptModal').classList.remove('open');
}

function savePrompt(){
  const name=(document.getElementById('pm_name').value||'').trim();
  const content=(document.getElementById('pm_content').value||'').trim();
  if(!name){ toast('Vui lòng nhập tên prompt!','#e74c3c'); return; }
  if(!content){ toast('Vui lòng nhập nội dung prompt!','#e74c3c'); return; }
  const editId = document.getElementById('pm_id').value;
  const obj={
    name, content,
    type:document.getElementById('pm_type').value||'viet',
    cat:(document.getElementById('pm_cat').value||'').trim()||'Khác',
    note:(document.getElementById('pm_note').value||'').trim(),
  };
  if(editId){
    const p=prompts.find(x=>x.id===parseInt(editId));
    if(p) Object.assign(p,obj);
  } else {
    prompts.push({id:promptNextId++,...obj});
  }
  saveAppData();
  closePromptModal();
  renderPrompts();
  toast('✓ Đã lưu prompt: '+name);
}

function deletePrompt(){
  const editId=parseInt(document.getElementById('pm_id').value);
  if(!editId||!confirm('Xoá prompt này?')) return;
  prompts=prompts.filter(p=>p.id!==editId);
  saveAppData();
  closePromptModal();
  renderPrompts();
  toast('Đã xoá.');
}

// ===== CARD BULK SELECT =====
let _selectedCardIds = new Set();
let _lastSelectedColId = null;

function wsCardExpandItems(url){
  if(!url) return '';
  const q=url.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const ws=websites.find(w=>{
    const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    return wu===q||wu.includes(q)||q.includes(wu);
  });
  const adminUrl = ws?.admin ? joinAdminUrl(ws.url, ws.admin) : null;
  const safeUrl = url.replace(/'/g,"\\'");
  let html = `<button onclick="copyText('${safeUrl}',this)" class="kb-ws-exp-btn" style="color:#2980b9;border-color:#b8d4ea;background:#f0f7fd">🔗 URL</button>`;
  if(adminUrl) html += `<a href="${adminUrl}" target="_blank" class="kb-ws-exp-btn">Admin</a>`;
  if(ws?.account) html += `<button onclick="copyText('${(ws.account||'').replace(/'/g,"\\'")}',this)" class="kb-ws-exp-btn" style="color:#27ae60;border-color:#a8deba;background:#f0faf4">👤 TK</button>`;
  if(ws?.password) html += `<button onclick="copyText('${(ws.password||'').replace(/'/g,"\\'")}',this)" class="kb-ws-exp-btn" style="color:var(--red);border-color:#f5c6c6;background:#fdf2f2">🔑 MK</button>`;
  if(ws) html += `<button onclick="wsVidcoCopy(${ws.id},this)" class="kb-ws-exp-btn" style="color:#555">📋 VIDCO</button>`;
  return html;
}

function wsCardMenuItems(url){ return wsCardExpandItems(url); }
function wsCardActions(url){ return wsCardExpandItems(url); }

function toggleWsExpand(cardId, btn){
  const exp = document.getElementById('wsexp-'+cardId);
  if(!exp) return;
  const isOpen = exp.classList.contains('open');
  exp.classList.toggle('open', !isOpen);
  if(btn) btn.textContent = isOpen ? '▼' : '▲';
}

function toggleWsMenu(cardId, btn){ toggleWsExpand(cardId, btn); }

function onCardCheck(event){
  event.stopPropagation();
  const chk = event.target;
  const cardId = chk.dataset.cardid;
  const row = chk.closest(`div[style*="display:flex"]`);
  const card = row ? row.querySelector(".kb-card") : null;
  if(chk.checked){
    _selectedCardIds.add(cardId); if(card) card.classList.add("card-selected");
    const task = tasks.find(x=>x.id===currentProjectId);
    const c = task?.cards?.find(x=>x.id===cardId);
    if(c){ _lastSelectedColId=c.colId; updateSelColBtn(); }
  } else {
    _selectedCardIds.delete(cardId); if(card) card.classList.remove("card-selected");
  }
  updateCardBulkBar();
}

function updateSelColBtn(){
  const btn = document.getElementById("btnSelCol");
  if(!btn||!_lastSelectedColId) return;
  const task = tasks.find(x=>x.id===currentProjectId);
  const cols = task ? getProjectCols(task) : [];
  const col = cols.find(c=>c.id===_lastSelectedColId);
  btn.textContent = col ? `u2611 Cu1ea3 "${col.label}"` : "u2611 Cu1ea3 cu1ed9t";
}

function updateCardBulkBar(){
  const bar = document.getElementById('cardBulkBar');
  const cnt = document.getElementById('cardBulkCount');
  if(!bar) return;
  if(_selectedCardIds.size>0){
    bar.style.display='flex';
    cnt.textContent = _selectedCardIds.size + ' thẻ đã chọn';
  } else {
    bar.style.display='none';
  }
}

function toggleSelectAllMenu(){
  const menu = document.getElementById('selectAllMenu');
  if(!menu) return;
  const isOpen = menu.style.display!=='none';
  if(isOpen){ menu.style.display='none'; return; }
  // Populate column items
  const task = tasks.find(x=>x.id===currentProjectId);
  const colItems = document.getElementById('selectColItems');
  if(task && colItems){
    const cols = getProjectCols(task);
    colItems.innerHTML = cols.map(col=>{
      const cnt = (task.cards||[]).filter(c=>c.colId===col.id||(col.id==='col_new'&&c.colId==='todo')).length;
      return `<div onclick="selectColCards('${col.id}')"
        style="padding:9px 14px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--gray-border);display:flex;align-items:center;justify-content:space-between"
        onmouseover="this.style.background='#fdf2f2'" onmouseout="this.style.background=''">
        <span style="color:${col.color}">${col.label}</span>
        <span style="font-size:11px;color:var(--text-muted)">${cnt}</span>
      </div>`;
    }).join('');
  }
  menu.style.display='block';
  // Close on outside click — but not when clicking inside the menu itself
  setTimeout(()=>{
    function outsideClick(e){
      if(!document.getElementById('selectAllMenu')?.contains(e.target)){
        closeSelectAllMenu();
        document.removeEventListener('click', outsideClick);
      }
    }
    document.addEventListener('click', outsideClick);
  }, 10);
}

function closeSelectAllMenu(){
  const menu = document.getElementById('selectAllMenu');
  if(menu) menu.style.display='none';
}

function selectColCards(colId){
  const task = tasks.find(x=>x.id===currentProjectId);
  if(!task) return;
  const colCards = (task.cards||[]).filter(c=>c.colId===colId||(colId==='col_new'&&c.colId==='todo'));
  const colCardIds = new Set(colCards.map(c=>c.id));
  document.querySelectorAll('.card-chk').forEach(chk=>{
    if(!colCardIds.has(chk.dataset.cardid)) return;
    chk.checked=true;
    _selectedCardIds.add(chk.dataset.cardid);
    const row = chk.closest('div[style*="display:flex"]');
    const card = row ? row.querySelector('.kb-card') : null;
    if(card) card.classList.add('card-selected');
  });
  updateCardBulkBar();
  toast(`☑ Đã chọn ${colCards.length} thẻ trong cột`,'#2c3e50',2000);
}

function selectAllCards(){
  const task = tasks.find(x=>x.id===currentProjectId);
  if(!task) return;
  task.cards.forEach(c=>_selectedCardIds.add(c.id));
  document.querySelectorAll('.card-chk').forEach(chk=>{
    chk.checked=true;
    const row = chk.closest('div[style*="display:flex"]');
    const card = row ? row.querySelector('.kb-card') : null;
    if(card) card.classList.add('card-selected');
  });
  updateCardBulkBar();
}

function clearCardSelection(){
  _selectedCardIds.clear();
  document.querySelectorAll('.card-chk').forEach(c=>c.checked=false);
  updateCardBulkBar();
}


function toggleBulkMoveToMenu(){
  const menu = document.getElementById('bulkMoveToMenu');
  if(!menu) return;
  if(menu.style.display !== 'none'){ menu.style.display='none'; return; }
  // Populate with current task's columns
  const task = tasks.find(t=>t.id===currentProjectId);
  if(!task){ menu.style.display='none'; return; }
  const cols = getProjectCols(task);
  menu.innerHTML = cols.map(col=>`
    <div onclick="bulkMoveToCol('${col.id}')"
      style="padding:9px 14px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--gray-border);display:flex;align-items:center;gap:8px;color:#2c3e50"
      onmouseover="this.style.background='#f0f7fd'" onmouseout="this.style.background=''">
      <span style="width:8px;height:8px;border-radius:50%;background:${col.color};flex-shrink:0"></span>
      ${col.label}
    </div>`).join('');
  menu.style.display='block';
  setTimeout(()=>{
    function outside(e){
      if(!document.getElementById('bulkMoveToMenu')?.contains(e.target)){
        document.getElementById('bulkMoveToMenu').style.display='none';
        document.removeEventListener('click',outside);
      }
    }
    document.addEventListener('click',outside);
  },10);
}

function bulkMoveToCol(colId){
  document.getElementById('bulkMoveToMenu').style.display='none';
  const task = tasks.find(t=>t.id===currentProjectId);
  if(!task||!_selectedCardIds.size) return;
  const isPending = colId==='pending'||colId==='col_pending';
  if(isPending){
    // Pending requires reason — open modal for first selected card
    const firstCard = (task.cards||[]).find(c=>_selectedCardIds.has(c.id));
    if(firstCard){
      pendingDragCard = {cardId:firstCard.id, colId, taskId:task.id, bulkIds:[..._selectedCardIds], bulkColId:colId};
      document.getElementById('pendingReason').value = firstCard.pendingReason||'';
      document.getElementById('pendingModal').classList.add('open');
    }
    return;
  }
  (task.cards||[]).forEach(card=>{
    if(!_selectedCardIds.has(card.id)) return;
    card.colId = colId;
    delete card.pendingReason;
  });
  saveAppData();
  clearCardSelection();
  renderSubBoard(task);
  renderTasksOverview();
  const cols = getProjectCols(task);
  const col = cols.find(c=>c.id===colId);
  toast(`⇒ Đã chuyển ${_selectedCardIds.size||'các'} thẻ → ${col?.label||colId}`);
}

function closeAllBulkDropdowns(){
  document.querySelectorAll('[id^="bulk-drop-"]').forEach(el=>el.style.display='none');
}
function toggleBulkDropdown(key){
  const el = document.getElementById('bulk-drop-'+key);
  if(!el) return;
  const isOpen = el.style.display!=='none';
  closeAllBulkDropdowns();
  if(!isOpen){
    el.style.display='block';
    setTimeout(()=>{
      function outside(e){
        if(!el.contains(e.target) && !e.target.closest('[onclick*="toggleBulkDropdown"]')){
          el.style.display='none';
          document.removeEventListener('click', outside);
        }
      }
      document.addEventListener('click', outside);
    }, 10);
  }
}

function bulkCardMove(dir){
  const task = tasks.find(x=>x.id===currentProjectId);
  if(!task||!_selectedCardIds.size) return;
  const cols = getProjectCols(task);
  task.cards.forEach(card=>{
    if(!_selectedCardIds.has(card.id)) return;
    const curIdx = cols.findIndex(c=>c.id===card.colId||(c.id==='col_new'&&card.colId==='todo'));
    const next = cols[curIdx+1];
    if(next && next.id!=='pending' && next.id!=='col_pending') card.colId=next.id;
  });
  saveAppData();
  clearCardSelection();
  renderSubBoard(task);
  renderTasksOverview();
  toast(`→ Đã chuyển ${_selectedCardIds.size||'các'} thẻ`);
}

function bulkCardCopyUrls(btn){
  const task = tasks.find(x=>x.id===currentProjectId);
  if(!task||!_selectedCardIds.size) return;
  const urls = task.cards.filter(c=>_selectedCardIds.has(c.id)).map(c=>c.name).join('\n');
  copyText(urls, btn);
}

function bulkCardCopyVidco(btn){
  const task = tasks.find(x=>x.id===currentProjectId);
  if(!task||!_selectedCardIds.size) return;
  const selected = task.cards.filter(c=>_selectedCardIds.has(c.id));
  const found = [], notFound = [];
  const lines = selected.map(c=>{
    const q=c.name.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    const ws=websites.find(w=>{
      const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
      return wu===q||wu.includes(q)||q.includes(wu);
    });
    if(ws){
      found.push(c.name);
      const domain=(ws.url||'').replace(/https?:\/\//,'').replace(/\/$/,'');
      const owner=(ws.owner&&ws.owner!=='Công ty'&&ws.owner!=='Chung')?ws.owner:'';
      return domain+' | '+(ws.admin||'')+' | '+(ws.account||'')+' | '+(ws.password||'')+' | '+(ws.group||'')+' | '+owner;
    } else {
      notFound.push(c.name);
      return null;
    }
  }).filter(Boolean);
  if(!lines.length){ toast('Không có URL nào nhận diện được trong kho website.','#e67e22'); return; }
  const text = lines.join('\n');
  const doSuccess = () => {
    let msg = `✓ Đã copy VIDCO ${found.length} web`;
    if(notFound.length) msg += ` · Bỏ qua ${notFound.length} chưa có trong kho`;
    toast(msg, '#27ae60', 4000);
    if(btn){ const orig=btn.innerHTML; btn.innerHTML='✓'; setTimeout(()=>btn.innerHTML=orig,1500); }
  };
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(doSuccess).catch(()=>fallbackCopy(text,btn,doSuccess));
  } else {
    fallbackCopy(text, btn, doSuccess);
  }
}

function bulkCardDelete(){
  const task = tasks.find(x=>x.id===currentProjectId);
  if(!task||!_selectedCardIds.size) return;
  const n = _selectedCardIds.size;
  task.cards = task.cards.filter(c=>!_selectedCardIds.has(c.id));
  saveAppData();
  clearCardSelection();
  renderSubBoard(task);
  renderTasksOverview();
  toast('🗑 Đã xoá '+n+' thẻ');
}

// ===== URL TASK MODE =====
function wsInlineIcon(url){
  if(!url) return '';
  try{
    const q=url.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    const ws=websites.find(w=>{
      const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
      return wu===q||wu.includes(q)||q.includes(wu);
    });
    const icon=ws?(WS_STATUS_ICON[ws.status]||'✅'):'🔍';
    const tip=ws?(ws.brand+' — '+ws.status):'Chưa có trong kho';
    return `<span title="${tip}" style="margin-right:4px;cursor:default">${icon}</span>`;
  }catch(e){return '';}
}

function isValidUrl(s){
  s=(s||'').trim();
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s);
}

function extractUrlFromLine(line){
  line=(line||'').trim();
  // First check if the whole line is a URL
  if(isValidUrl(line)) return line;
  // Otherwise try to extract first URL-like token from the line
  const tokens=line.split(/\s+/);
  for(const t of tokens){
    if(isValidUrl(t)) return t;
  }
  // Try regex match for URL embedded in text
  const m=line.match(/(https?:\/\/[\w\-./:%?=&#@]+|[\w.-]+\.[a-z]{2,}(?:\/\S*)?)/i);
  return m ? m[1] : null;
}

function qi_onDangChange(){
  const dang=document.getElementById('qi_dang')?.value||'text';
  const hint=document.getElementById('qi_url_hint');
  const stepsRow=document.querySelector('#qi_step1 .form-group:has(#qi_steps)')?.closest('.form-group');
  const btnParse=document.getElementById('qi_btn_parse');
  const btnParseUrl=document.getElementById('qi_btn_parse_url');
  if(hint) hint.style.display=dang==='url'?'block':'none';
  if(btnParse) btnParse.style.display=dang==='url'?'none':'inline-flex';
  if(btnParseUrl) btnParseUrl.style.display=dang==='url'?'inline-flex':'none';
  // Always show steps row
  const stepsRow2=document.getElementById('qi_steps_row');
  if(stepsRow2) stepsRow2.style.display='block';
}

function qi_parseUrl(){
  const raw=(document.getElementById('qi_input')?.value||'');
  const lines=raw.split('\n').map(l=>l.trim()).filter(Boolean);
  const urls=lines.map(extractUrlFromLine).filter(Boolean);
  if(!urls.length){
    const err=document.getElementById('qi_error');
    if(err){err.textContent='Không tìm thấy URL hợp lệ trong nội dung dán vào.';err.style.display='block';}
    return;
  }
  const err=document.getElementById('qi_error'); if(err) err.style.display='none';

  // Build task name from qi_taskname or default
  let taskName=(document.getElementById('qi_taskname')?.value||'').trim()||`Task URL (${urls.length} link)`;
  if(!taskName.trim()){ toast('Vui lòng nhập tên task!','#e74c3c'); return; }
  const person=document.getElementById('qi_person')?.value||'';
  const from=document.getElementById('qi_from')?.value||todayVN();
  const deadline=document.getElementById('qi_deadline')?.value||'';
  const priority=document.getElementById('qi_priority')?.value||'Bình thường';
  const team=document.getElementById('qi_team')?.value||'Team 01';

  const manualSteps=(document.getElementById('qi_steps')?.value||'').trim();
  const cols = manualSteps ? parseSteps(manualSteps) : null;
  const firstColId = cols ? cols[0].id : 'todo';
  const startId = cardNextId;
  cardNextId += urls.length;
  qi_parsedTasks=[{
    name:taskName, person, type:'SEO', dang:'url',
    from, deadline, desc:'', priority, team,
    cols,
    cards: urls.map((u,i)=>({id:'qcu'+(startId+i), colId:firstColId, name:u, desc:''}))
  }];

  // Show preview
  document.getElementById('qi_step1').style.display='none';
  document.getElementById('qi_step2').style.display='block';
  document.getElementById('qi_btn_parse_url').style.display='none';
  document.getElementById('qi_btn_back').style.display='inline-flex';
  document.getElementById('qi_btn_add').style.display='inline-flex';
  document.getElementById('qi_count').textContent=1;

  const t=qi_parsedTasks[0];
  // Render URL preview with ws recognition
  const STATUSES={
    '✅':'Tốt','⚠️':'Lỗi web','🔒':'Chờ cấp lại mật khẩu','🔍':'Chưa có trong kho'
  };
  const grouped={};
  t.cards.forEach(card=>{
    const url=card.name;
    const q=url.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    const ws=websites.find(w=>{
      const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
      return wu===q||wu.includes(q)||q.includes(wu);
    });
    const icon=ws?(WS_STATUS_ICON[ws.status]||'✅'):'🔍';
    const label=ws?(ws.brand+' — '+ws.status):'Chưa có trong kho';
    const grp=icon+' '+label.split(' — ')[1];
    if(!grouped[grp]) grouped[grp]=[];
    grouped[grp].push({card,ws,icon,label});
  });

  // Summary badges
  const inKho=t.cards.filter(card=>{
    const q=card.name.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    return websites.some(w=>{const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');return wu===q||wu.includes(q)||q.includes(wu);});
  }).length;

  document.getElementById('qi_preview').innerHTML=`
    <div style="background:#f8f9fa;border-radius:8px;padding:12px 14px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">${t.name}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-size:12px;background:#f0faf4;border:1px solid #a8deba;border-radius:20px;padding:2px 10px;color:#27ae60">✅ Trong kho: ${inKho}</span>
        <span style="font-size:12px;background:#fdf2f2;border:1px solid #f5c6c6;border-radius:20px;padding:2px 10px;color:var(--red)">🔍 Chưa có: ${t.cards.length-inKho}</span>
        <span style="font-size:12px;background:#f0f7fd;border:1px solid #b8d4ea;border-radius:20px;padding:2px 10px;color:#2980b9">Tổng: ${t.cards.length} URL</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;max-height:300px;overflow-y:auto">
        ${t.cards.map((card,i)=>{
          const url=card.name;
          const q=url.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
          const ws=websites.find(w=>{const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');return wu===q||wu.includes(q)||q.includes(wu);});
          const icon=ws?(WS_STATUS_ICON[ws.status]||'✅'):'🔍';
          const tip=ws?(ws.brand+' — '+ws.status):'Chưa có trong kho';
          const tipColor=icon==='✅'?'#27ae60':icon==='🔍'?'#888':'#e74c3c';
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#fff;border-radius:6px;border:1px solid var(--gray-border)">
            <span style="font-size:14px" title="${tip}">${icon}</span>
            <span style="flex:1;font-size:12px;color:#333">${url}</span>
            <span style="font-size:11px;color:${tipColor}">${tip}</span>
            <button onclick="qi_parsedTasks[0].cards.splice(${i},1);qi_parseUrl_repreview()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;padding:0 2px">✕</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function qi_parseUrl_repreview(){
  // Rebuild after deletion
  const t=qi_parsedTasks[0]; if(!t) return;
  const cards=document.getElementById('qi_preview').querySelectorAll('[style*="padding:6px"]');
  // Just re-run qi_parseUrl logic on remaining cards
  const inKho=t.cards.filter(card=>{
    const q=card.name.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    return websites.some(w=>{const wu=(w.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');return wu===q||wu.includes(q)||q.includes(wu);});
  }).length;
  const container=document.getElementById('qi_preview');
  if(container){
    const summaryBadges=container.querySelector('[style*="display:flex;gap:8px"]');
    if(summaryBadges){
      summaryBadges.innerHTML=`
        <span style="font-size:12px;background:#f0faf4;border:1px solid #a8deba;border-radius:20px;padding:2px 10px;color:#27ae60">✅ Trong kho: ${inKho}</span>
        <span style="font-size:12px;background:#fdf2f2;border:1px solid #f5c6c6;border-radius:20px;padding:2px 10px;color:var(--red)">🔍 Chưa có: ${t.cards.length-inKho}</span>
        <span style="font-size:12px;background:#f0f7fd;border:1px solid #b8d4ea;border-radius:20px;padding:2px 10px;color:#2980b9">Tổng: ${t.cards.length} URL</span>`;
    }
  }
}

// ===== PROMPT QUICK ACCESS (HEADER) =====
let _pqTab = 'viet';

function pqSetTab(tab){
  _pqTab = tab;
  const bv=document.getElementById('pqTabViet'), ba=document.getElementById('pqTabAnh'), bn=document.getElementById('pqTabNote');
  if(bv){ bv.style.borderBottomColor=tab==='viet'?'var(--red)':'transparent'; bv.style.color=tab==='viet'?'var(--red)':'var(--text-muted)'; bv.style.fontWeight=tab==='viet'?'600':'500'; }
  if(ba){ ba.style.borderBottomColor=tab==='anh'?'var(--red)':'transparent'; ba.style.color=tab==='anh'?'var(--red)':'var(--text-muted)'; ba.style.fontWeight=tab==='anh'?'600':'500'; }
  if(bn){ bn.style.borderBottomColor=tab==='note'?'var(--red)':'transparent'; bn.style.color=tab==='note'?'var(--red)':'var(--text-muted)'; bn.style.fontWeight=tab==='note'?'600':'500'; }
  pqSearch();
}

function pqSearch(){
  const drop = document.getElementById('pqDropdown');
  if(!drop) return;
  drop.style.display='flex';
  const pqOverlay = document.getElementById('pqOverlay');
  if(pqOverlay) pqOverlay.style.display='block';
  const q = (pqGetInput()||'').toLowerCase();
  const items = prompts.filter(p=>{
    if(p.type!==_pqTab) return false;
    if(q && !p.name.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q) && !(p.cat||'').toLowerCase().includes(q)) return false;
    return true;
  }).slice(0,12);
  const results = document.getElementById('pqResults');
  if(!results) return;
  if(!items.length){
    results.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Không tìm thấy prompt nào<br><span style="font-size:11px">Nhấn + để thêm mới</span></div>';
    return;
  }
  results.innerHTML = items.map(p=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--gray-border);transition:background .1s"
      onmouseover="this.style.background='#fdf2f2'" onmouseout="this.style.background=''">
      <div style="flex:1;min-width:0;cursor:pointer" onclick="pqCopy(${p.id},this)">
        <div style="font-size:13px;font-weight:700;color:#212529;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:1px">${p.cat||''}${p.note?` · ${p.note.slice(0,40)}`:''}</div>
        <div style="font-size:11px;color:#888;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px;font-family:monospace">${(p.content||'').slice(0,60)}…</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button onclick="event.stopPropagation();pqCopy(${p.id},this)"
          style="background:#f0f7fd;border:1px solid #b8d4ea;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;font-weight:600;color:#2980b9;white-space:nowrap">📋 Copy</button>
        <button onclick="event.stopPropagation();pqEdit(${p.id})"
          style="background:none;border:1px solid var(--gray-border);border-radius:6px;padding:4px 7px;cursor:pointer;font-size:11px">✎</button>
      </div>
    </div>`).join('');
}

function pqCopy(id, btn){
  const p = prompts.find(x=>x.id===id);
  if(!p) return;
  copyText(p.content, btn);
}

function pqEdit(id){
  pqClose();
  showPage('prompts');
  setTimeout(()=>{ _promptTab=prompts.find(x=>x.id===id)?.type||'viet'; renderPrompts(); openEditPromptModal(id); }, 100);
}

function pqClose(){
  const drop=document.getElementById('pqDropdown');
  const ov=document.getElementById('pqOverlay');
  if(drop) drop.style.display='none';
  if(ov) ov.style.display='none';
}

function pqOpenAdd(){
  pqClose();
  showPage('prompts');
  setTimeout(()=>{ _promptTab=_pqTab; renderPrompts(); openAddPromptModal(); }, 100);
}


// ===== AUTO CLEAN TRASH DAILY =====

function autoCleanTrash(){
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const before = deletedTasks.length;
  deletedTasks = deletedTasks.filter(t => {
    if(!t._deletedAt) return true; // no timestamp → keep (legacy data)
    return (now - t._deletedAt) < DAY_MS;
  });
  if(deletedTasks.length < before){
    saveAppData();
    updateTrashBadge();
    console.log(`🗑 Auto-cleaned ${before - deletedTasks.length} task(s) from trash`);
  }
}

// ===== DAILY AUTO BACKUP =====
function autoBackupDaily(){
  try{
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastBackup = localStorage.getItem('wt_backup_date');
    if(lastBackup === today) return; // already backed up today

    const snapshot = {
      date: today,
      ts: Date.now(),
      hai: data.hai,
      hieu: data.hieu,
      tasks: tasks,
      giaoViecList: giaoViecList,
      indexTasks: indexTasks,
      websites: websites,
      links: links,
      prompts: prompts,
    };

    // Shift backups: keep 7 days
    for(let i=6; i>=1; i--){
      const prev = localStorage.getItem('wt_backup_'+(i-1));
      if(prev) localStorage.setItem('wt_backup_'+i, prev);
    }
    localStorage.setItem('wt_backup_0', JSON.stringify(snapshot));
    localStorage.setItem('wt_backup_date', today);
    console.log('✅ Auto backup saved for', today);
  } catch(e){ console.warn('Backup failed:', e); }
}

function restoreFromBackup(dateKey){
  if(!confirm('Khôi phục backup ngày '+dateKey+'?\nDữ liệu hiện tại sẽ bị ghi đè.')) return;
  window._fbDb.ref('backups/'+dateKey).once('value', snap=>{
    const s = snap.val();
    if(!s){ toast('Không tìm thấy backup '+dateKey,'#e74c3c'); return; }
    if(Array.isArray(s.hai))  data.hai  = s.hai;
    if(Array.isArray(s.hieu)) data.hieu = s.hieu;
    if(Array.isArray(s.tasks)) tasks = s.tasks;
    if(Array.isArray(s.giaoViecList)) giaoViecList = s.giaoViecList;
    if(Array.isArray(s.indexTasks))   indexTasks   = s.indexTasks;
    if(Array.isArray(s.websites))     websites     = s.websites;
    if(Array.isArray(s.links))        links        = s.links;
    if(Array.isArray(s.prompts))      prompts      = s.prompts;
    saveAppData();
    renderDashboard(); renderTasksOverview();
    const el=document.getElementById('backupOverlay'); if(el) el.remove();
    toast('✅ Đã khôi phục backup '+dateKey, '#27ae60', 5000);
  });
}

function openBackupModal(){
  if(!window._fbDb){ toast('Firebase chưa kết nối','#e74c3c'); return; }
  const overlay = document.createElement('div');
  overlay.id = 'backupOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.2);min-width:400px;max-width:500px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-weight:700;font-size:15px">🗃️ Backup tự động (7 ngày gần nhất)</div>
      <button onclick="document.getElementById('backupOverlay').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-muted)">&times;</button>
    </div>
    <div id="backupList" style="display:flex;flex-direction:column;gap:8px"><div style="text-align:center;padding:20px;color:var(--text-muted)">⏳ Đang tải từ Firebase...</div></div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:12px">✅ Backup lưu trên Firebase — dùng được mọi thiết bị</div>
  </div>`;
  document.body.appendChild(overlay);
  window._fbDb.ref('backups').once('value', snap=>{
    const val = snap.val()||{};
    const dates = Object.keys(val).sort().reverse();
    const el = document.getElementById('backupList');
    if(!el) return;
    if(!dates.length){ el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted)">Chưa có backup nào</div>'; return; }
    el.innerHTML = dates.map(d=>{
      const s = val[d];
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--gray-border);border-radius:8px;background:#fff">
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">📅 ${d}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Hải: ${(s.hai||[]).length} bài · Hiếu: ${(s.hieu||[]).length} bài · Task: ${(s.tasks||[]).length}</div>
        </div>
        <button onclick="restoreFromBackup('${d}')" class="btn btn-sm btn-outline" style="color:var(--red);border-color:var(--red)">↩ Khôi phục</button>
      </div>`;
    }).join('');
  });
}


// Migrate existing indexTasks to khoId (one-time)
function forceMigrateKho(){
  localStorage.removeItem('wt_kho_migrated');
  khoIdList = [];
  migrateIndexTasksToKho();
  renderKhoId();
  toast('✓ Đã đồng bộ '+khoIdList.length+' ID vào kho', '#27ae60', 3000);
}

function migrateIndexTasksToKho(){
  if(localStorage.getItem('wt_kho_migrated')==='2') return; // already done v2
  let added = 0;
  indexTasks.forEach(t=>{
    if(!khoIdList.find(k=>k.taskId===t.taskId)){
      khoIdList.push({
        taskId: t.taskId,
        name: t.name||'',
        team: t.team||'',
        person: t.person||'',
        stt: t.stt||'',
        createdDate: t.createdDate||'',
        website: t.name||'',
      });
      added++;
    }
  });
  if(added>0){
    saveKhoId();
    console.log('Migrated '+added+' index tasks to Kho ID');
  }
  localStorage.setItem('wt_kho_migrated','2');
}

// ===== INIT — load after all variables declared =====
loadAppData();
applyAllAvatars();
renderDashboard();
loadKhoId();
window._appLoaded = true;
initDragSelectGlobal();
window._appData = data;
window._tasks = tasks;
window._links = links;
window._linkCategories = linkCategories;
window._websites = websites;
setTimeout(syncLoaiBaiDropdowns, 150);

// Restore last active page & sub-board
function restoreSubTab(savedSubPage) {
  if (!savedSubPage) return;
  const activePage = localStorage.getItem('wt_activePage');
  if (activePage === 'tasks') {
    if (savedSubPage === 'mytasks' || savedSubPage === 'giaoviec') {
      switchTasksTab(savedSubPage);
    }
  } else if (activePage === 'links') {
    if (savedSubPage === 'links' || savedSubPage === 'websites') {
      switchLinksTab(savedSubPage);
    }
  } else if (activePage === 'prompts') {
    if (savedSubPage === 'viet' || savedSubPage === 'anh' || savedSubPage === 'note') {
      switchPromptTab(savedSubPage);
    }
  }
}

function restorePosition(){
  const pWork = document.getElementById('panel-workspace-job');
  const pDash = document.getElementById('page-dashboard');
  if (!pWork || !pDash) {
    setTimeout(restorePosition, 50);
    return;
  }
  if (!isAdminLoggedIn()) return;

  let savedPage = localStorage.getItem('wt_activePage');
  let savedSubPage = sessionStorage.getItem('wt_activeSubPage');

  if (!savedSubPage) {
    // KỊCH BẢN TẮT MÁY / TẮT TAB VÀO LẠI (Phiên mới):
    // Xóa sạch vết định tuyến con để tự động quay về giao diện chính tổng quan
    try {
      sessionStorage.removeItem('wt_activeSubPage');
      sessionStorage.removeItem('wt_activeProject');
    } catch(e){}
    
    if (savedPage) {
      showPage(savedPage); 
    } else {
      showPage('dashboard'); // Mặc định về Tab Báo cáo nếu nạp phiên hoàn toàn mới
    }
  } else {
    // KỊCH BẢN F5 (Duy trì phiên): Khôi phục toàn vẹn cấu trúc phân cấp sâu
    if (savedPage) {
      showPage(savedPage);
      if (typeof restoreSubTab === 'function') {
        restoreSubTab(savedSubPage);
      }
    }
  }

  // Khôi phục project nếu ở tasks và có activeProject trong session
  const activePage = localStorage.getItem('wt_activePage');
  if(activePage === 'tasks'){
    try{
      const savedId = sessionStorage.getItem('wt_activeProject');
      if(savedId){
        const pid = parseInt(savedId);
        const t = tasks.find(x=>x.id===pid);
        if(t) openProjectBoard(pid);
      }
    }catch(e){ sessionStorage.removeItem('wt_activeProject'); }
  }
}
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  restorePosition();
} else {
  window.addEventListener('DOMContentLoaded', restorePosition);
}


// ===== SWITCH MEMBER WITH PASSWORD =====
let _switchPwTarget = null;

function switchMemberWithPw(m){
  console.warn("[V64 Protection] Tính năng chuyển đổi hồ sơ đã bị vô hiệu hóa.");
  return false;
}
function closeSwitchPwModal(){
  _switchPwTarget = null;
  document.getElementById('switchPwModal').style.display = 'none';
}
function submitSwitchPw(){
  const inp = document.getElementById('switchPwInput');
  const pw = inp?.value || '';
  const correct = getProfilePassword(_switchPwTarget);
  if(pw !== correct){
    document.getElementById('switchPwErr').style.display = 'block';
    inp.value = ''; inp.focus(); return;
  }
  const target = _switchPwTarget;
  closeSwitchPwModal();
  try{ sessionStorage.setItem('wt_session_member', target); }catch(e){}
  try{ localStorage.setItem('wt_activeMember', target); }catch(e){}
  currentMember = target; updateNavBadges();
}

// ===== NGHIỆM THU =====
let _ntSheet = null, _ntId = null, _ntVal = 100;

function openNghiemThu(sheet, id){
  _ntSheet = sheet; _ntId = id;
  const r = data[sheet].find(x=>x.id===id);
  if(!r) return;
  const cur = r.nghiemThu===undefined ? 100 : r.nghiemThu;
  const basePrice = getLoaiPrice(r.loai, sheet, r);
  document.getElementById('ntKeyword').textContent = r.keyword;
  document.getElementById('ntLoai').textContent = r.loai + ' — ' + fmt(basePrice) + ' đ';
  _ntVal = cur;
  [100,80,50,0].forEach(v=>{
    const btn = document.getElementById('ntBtn'+v);
    const cfg = NT_CONFIG[v];
    if(btn){
      btn.style.background = v===cur ? cfg.color : cfg.bg;
      btn.style.color = v===cur ? '#fff' : cfg.color;
      btn.style.fontWeight = v===cur ? '700' : '500';
    }
  });
  document.getElementById('ntReason').value = r.nghiemThuLydo || '';
  document.getElementById('ntReasonRow').style.display = cur===100 ? 'none' : 'flex';
  document.getElementById('ntModal').style.display = 'flex';
}
function closeNghiemThu(){ document.getElementById('ntModal').style.display='none'; }
function selectNT(val){
  _ntVal = val;
  [100,80,50,0].forEach(v=>{
    const btn = document.getElementById('ntBtn'+v);
    const cfg = NT_CONFIG[v];
    if(btn){ btn.style.background=v===val?cfg.color:cfg.bg; btn.style.color=v===val?'#fff':cfg.color; btn.style.fontWeight=v===val?'700':'500'; }
  });
  document.getElementById('ntReasonRow').style.display = val===100 ? 'none' : 'flex';
}
function saveNT(){
  const r = data[_ntSheet].find(x=>x.id===_ntId);
  if(!r) return;
  if(_ntVal !== 100){
    const reason = document.getElementById('ntReason').value.trim();
    if(!reason){ toast('Vui lòng nhập lý do!','#e74c3c'); return; }
    r.nghiemThuLydo = reason;
  } else { r.nghiemThuLydo = ''; }
  r.nghiemThu = _ntVal;
  saveAppData();
  closeNghiemThu();
  renderDashboard();
  renderDashboard();
  toast('✅ Đã cập nhật nghiệm thu');
}

// ===== PERIOD MANAGEMENT =====
function autoFillEndDate(newStart){
  if(!newStart) return;
  const d = new Date(newStart + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  const prev = d.toISOString().split('T')[0];
  const el = document.getElementById('endMonthEndDate');
  if(el) el.value = prev;
}
function openEndMonthModal(){
  const today = todayVN();
  const ps = getPeriodStart();
  const [py,pm,pd] = ps.split('-');
  const [ty,tm,td] = today.split('-');
  const infoEl = document.getElementById('endMonthInfo');
  if(infoEl) infoEl.innerHTML = `<b>Kỳ hiện tại:</b> từ <b>${pd}/${pm}/${py}</b> đến hôm nay (<b>${td}/${tm}/${ty}</b>)`;
  document.getElementById('endMonthNewStart').value = today;
  autoFillEndDate(today);
  document.getElementById('endMonthPin').value='';
  document.getElementById('endMonthErr').style.display='none';
  document.getElementById('endMonthErr').textContent='Mã PIN không đúng.';
  document.getElementById('endMonthModal').style.display='flex';
  setTimeout(()=>document.getElementById('endMonthNewStart').focus(), 100);
}
function closeEndMonthModal(){ document.getElementById('endMonthModal').style.display='none'; }
function confirmEndMonth(){
  const pin = document.getElementById('endMonthPin').value;
  if(pin !== ADMIN_PIN){
    document.getElementById('endMonthErr').style.display='block';
    document.getElementById('endMonthErr').textContent='Mã PIN không đúng.';
    document.getElementById('endMonthPin').value='';
    document.getElementById('endMonthPin').focus();
    return;
  }
  const newStart = document.getElementById('endMonthNewStart').value;
  if(!newStart){ alert('Vui lòng chọn ngày bắt đầu tháng mới!'); return; }
  const endDateInput = document.getElementById('endMonthEndDate').value;
  let endDate;
  if(endDateInput){
    if(endDateInput >= newStart){
      document.getElementById('endMonthErr').style.display='block';
      document.getElementById('endMonthErr').textContent='Ngày kết thúc tháng cũ phải trước ngày bắt đầu tháng mới.';
      return;
    }
    endDate = endDateInput;
  } else {
    const d = new Date(newStart + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    endDate = d.toISOString().split('T')[0];
  }
  document.getElementById('endMonthErr').style.display='none';
  document.getElementById('endMonthErr').textContent='Mã PIN không đúng.';
  const oldStart = _periodStart;
  _savePeriodToHistory(oldStart, endDate);
  _periodStart = newStart;
  try{ localStorage.setItem('wt_period_start', newStart); }catch(e){}
  saveAppData(); closeEndMonthModal(); renderDashboard();
  const [y,m,d2] = newStart.split('-');
  toast(`✅ Tháng mới bắt đầu từ ${d2}/${m}/${y}`);
}

function openEditPeriodModal(){
  document.getElementById('editPeriodDate').value = _periodStart;
  document.getElementById('editPeriodPin').value = '';
  document.getElementById('editPeriodErr').style.display = 'none';
  document.getElementById('editPeriodModal').style.display = 'flex';
  setTimeout(()=>document.getElementById('editPeriodDate').focus(), 100);
}
function closeEditPeriodModal(){ document.getElementById('editPeriodModal').style.display='none'; }
function confirmEditPeriod(){
  const pin = document.getElementById('editPeriodPin').value;
  if(pin !== ADMIN_PIN){ document.getElementById('editPeriodErr').style.display='block'; document.getElementById('editPeriodPin').value=''; document.getElementById('editPeriodPin').focus(); return; }
  const newDate = document.getElementById('editPeriodDate').value;
  if(!newDate){ alert('Vui lòng chọn ngày!'); return; }
  _periodStart = newDate;
  try{ localStorage.setItem('wt_period_start', newDate); }catch(e){}
  saveAppData(); closeEditPeriodModal(); renderDashboard();
  const [y,m,d] = newDate.split('-');
  toast(`✅ Ngày bắt đầu tháng đã đổi thành ${d}/${m}/${y}`);
}

function openPeriodHistoryModal(){ renderPeriodHistoryList(); document.getElementById('periodHistoryModal').style.display='flex'; }
function closePeriodHistoryModal(){ document.getElementById('periodHistoryModal').style.display='none'; }
function renderPeriodHistoryList(){
  const list = document.getElementById('periodHistoryList');
  if(!list) return;
  if(!_periodHistory.length){ list.innerHTML='<div style="text-align:center;padding:24px;color:var(--text-muted)">Chưa có lịch sử tháng nào.</div>'; return; }
  list.innerHTML = _periodHistory.map((h,i)=>{
    const [sy,sm,sd]=h.start.split('-'); const [ey,em,ed]=h.end.split('-');
    const isViewing = _viewingPeriod && _viewingPeriod.start===h.start;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--gray-border);${isViewing?'background:#fdf2f2':''}">
      <div><div style="font-size:13px;font-weight:600">${sd}/${sm}/${sy} → ${ed}/${em}/${ey}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${_calcPeriodStats(h.start,h.end)}</div></div>
      <button onclick="viewPeriod(${i})" class="btn btn-sm ${isViewing?'btn-primary':'btn-outline'}" style="font-size:11px">${isViewing?'✓ Đang xem':'Xem báo cáo'}</button>
    </div>`;
  }).join('');
}
function _calcPeriodStats(start, end){
  const hBai=data.hai.filter(r=>r.ngay>=start&&r.ngay<=end).length;
  const hieuBai=data.hieu.filter(r=>r.ngay>=start&&r.ngay<=end).length;
  const hTien=data.hai.filter(r=>r.ngay>=start&&r.ngay<=end).reduce((a,r)=>a+getLoaiPrice(r.loai,'hai',r)*(r.nghiemThu===undefined?1:r.nghiemThu/100),0);
  const hieuTien=data.hieu.filter(r=>r.ngay>=start&&r.ngay<=end).reduce((a,r)=>a+getLoaiPrice(r.loai,'hieu',r)*(r.nghiemThu===undefined?1:r.nghiemThu/100),0);
  return `Hải: ${hBai} bài — ${fmt(hTien)} · Hiếu: ${hieuBai} bài — ${fmt(hieuTien)}`;
}
function viewPeriod(idx){ const h=_periodHistory[idx]; _viewingPeriod=h; closePeriodHistoryModal(); renderDashboardForPeriod(h.start,h.end); }
function backToCurrentPeriod(){ _viewingPeriod=null; renderDashboard(); }
function renderDashboardForPeriod(start,end){
  const [sy,sm,sd]=start.split('-'); const [ey,em,ed]=end.split('-');
  const container = document.getElementById('page-dashboard-content');
  if(!container) return;

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--gray-border);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h2 style="font-size:18px;font-weight:800;margin:0;color:var(--red)">📋 Đang xem lịch sử: ${sd}/${sm}/${sy} → ${ed}/${em}/${ey}</h2>
        <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0 0">Chế độ xem lịch sử</p>
      </div>
      <button onclick="backToCurrentPeriod()" class="btn btn-outline btn-sm">← Về hiện tại</button>
    </div>
    <div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">
      Lịch sử các kỳ lương viết bài cũ đã được lưu trữ và đóng lại.
    </div>
  `;
}

function openRollbackModal(){
  if(!_periodHistory.length){ toast('Không có tháng trước để quay về.','#e74c3c'); return; }
  const prev=_periodHistory[0];
  const [sy,sm,sd]=prev.start.split('-'); const [ey,em,ed]=prev.end.split('-'); const [py,pm,pd]=_periodStart.split('-');
  const infoEl=document.getElementById('rollbackInfo');
  if(infoEl) infoEl.innerHTML=`Hủy lệnh bắt đầu tháng mới, quay về kỳ trước:<br><b>${sd}/${sm}/${sy}</b> → <b>${ed}/${em}/${ey}</b><br><span style="font-size:12px;color:var(--text-muted)">Kỳ hiện tại (<b>${pd}/${pm}/${py}</b> đến nay) sẽ bị xóa khỏi lịch sử.</span>`;
  document.getElementById('rollbackPin').value=''; document.getElementById('rollbackErr').style.display='none';
  document.getElementById('rollbackModal').style.display='flex';
  setTimeout(()=>document.getElementById('rollbackPin').focus(),100);
}
function closeRollbackModal(){ document.getElementById('rollbackModal').style.display='none'; }
function confirmRollback(){
  const pin=document.getElementById('rollbackPin').value;
  if(pin!==ADMIN_PIN){ document.getElementById('rollbackErr').style.display='block'; document.getElementById('rollbackPin').value=''; document.getElementById('rollbackPin').focus(); return; }
  const prev=_periodHistory[0]; if(!prev){closeRollbackModal();return;}
  _periodStart=prev.start; _periodHistory.shift();
  try{localStorage.setItem('wt_period_start',_periodStart);}catch(e){}
  _savePeriodHistory(); saveAppData(); closeRollbackModal(); renderDashboard();
  const [y,m,d]=prev.start.split('-');
  toast(`↩ Đã quay về kỳ từ ${d}/${m}/${y}`);
}

// ===== CẤU HÌNH CHI PHÍ / PHỤ CẤP =====
let _salaryConfigTarget = null;
let _scTempChiPhi = [], _scTempPhuCap = [];
function openSalaryConfigModal(sheet){
  _salaryConfigTarget = sheet;
  const name = sheet==='hai'?'Hải':'Hiếu';
  const sc = getSalaryConfig(sheet);
  _scTempChiPhi = JSON.parse(JSON.stringify(sc.chiPhi||[]));
  _scTempPhuCap = JSON.parse(JSON.stringify(sc.phuCap||[]));
  document.getElementById('scTitle').textContent = `⚙ Chi phí / Phụ cấp — ${name}`;
  document.getElementById('scPin').value=''; document.getElementById('scErr').style.display='none';
  renderScLists();
  document.getElementById('salaryConfigModal').style.display='flex';
}
function closeSalaryConfigModal(){ document.getElementById('salaryConfigModal').style.display='none'; }
function _fmtVND(n){ if(!n&&n!==0)return''; return Number(n).toLocaleString('vi-VN')+' đ'; }
function _parseVND(s){ return parseInt((s||'').replace(/[^\d]/g,''))||0; }
function _scAmountInput(input,type,idx){
  const raw=_parseVND(input.value); _scTempList(type,idx,'amount',raw);
  const formatted=raw?raw.toLocaleString('vi-VN'):'';
  if(input.value!==formatted&&raw>0){input.value=formatted;input.setSelectionRange(formatted.length,formatted.length);}
}
function renderScLists(){
  const renderList=(list,type)=>{
    const wrap=document.getElementById(`sc_${type}_list`);if(!wrap)return;
    wrap.innerHTML=list.length?list.map((item,i)=>`<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <input type="text" value="${_fmtVND(item.amount||0)}" style="width:130px;font-size:12px;height:32px;border:1px solid var(--gray-border);border-radius:5px;padding:0 8px;text-align:right"
        oninput="_scAmountInput(this,'${type}',${i})" onfocus="this.value=_parseVND(this.value)||'';this.select()" onblur="this.value=_fmtVND(_parseVND(this.value))">
      <input type="text" value="${(item.name||'').replace(/"/g,'&quot;')}" placeholder="Tên..."
        style="flex:1;font-size:12px;height:32px;border:1px solid var(--gray-border);border-radius:5px;padding:0 8px"
        oninput="_scTempList('${type}',${i},'name',this.value)">
      <button onclick="_scRemove('${type}',${i})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:0 2px">✕</button>
    </div>`).join(''):`<div style="font-size:12px;color:var(--text-muted);padding:6px 0">Chưa có. Nhấn + để thêm.</div>`;
  };
  renderList(_scTempChiPhi,'chiPhi'); renderList(_scTempPhuCap,'phuCap');
}
function _scTempList(type,idx,field,val){ const list=type==='chiPhi'?_scTempChiPhi:_scTempPhuCap; if(list[idx])list[idx][field]=val; }
function _scRemove(type,idx){ if(type==='chiPhi')_scTempChiPhi.splice(idx,1);else _scTempPhuCap.splice(idx,1); renderScLists(); }
function _scAdd(type){ if(type==='chiPhi')_scTempChiPhi.push({name:'',amount:0});else _scTempPhuCap.push({name:'',amount:0}); renderScLists(); const list=document.getElementById(`sc_${type}_list`); const inputs=list?.querySelectorAll('input[type=text]'); if(inputs?.length)inputs[inputs.length-1].focus(); }
function saveSalaryConfig(){
  const pin=document.getElementById('scPin').value;
  if(pin!==ADMIN_PIN){document.getElementById('scErr').style.display='block';document.getElementById('scPin').value='';document.getElementById('scPin').focus();return;}
  _salaryConfig[_salaryConfigTarget]={chiPhi:_scTempChiPhi.filter(x=>x.amount>0||x.name),phuCap:_scTempPhuCap.filter(x=>x.amount>0||x.name)};
  try{localStorage.setItem('wt_salary_config',JSON.stringify(_salaryConfig));}catch(e){}
  closeSalaryConfigModal(); renderDashboard();
  toast(`✅ Đã cập nhật chi phí/phụ cấp cho ${_salaryConfigTarget==='hai'?'Hải':'Hiếu'}`);
}

// ===== SỬA MỨC LƯƠNG THEO LOẠI BÀI =====
function openSalaryRatesModal(){
  renderSalaryRatesForm();
  renderLoaiManager();
  document.getElementById('salaryRatesPin').value='';
  document.getElementById('salaryRatesErr').style.display='none';
  const sec=document.getElementById('loaiManagerSection');
  if(sec) sec.style.display=(currentMember==='admin')?'block':'none';
  document.getElementById('salaryRatesModal').style.display='flex';
}
function closeSalaryRatesModal(){ document.getElementById('salaryRatesModal').style.display='none'; }
function renderSalaryRatesForm(){
  const loais=Object.keys(LOAI_CONFIG);
  const tbody=document.getElementById('salaryRatesTbody'); if(!tbody)return;
  tbody.innerHTML=loais.map(loai=>{
    const def=LOAI_CONFIG[loai].price, hai=_salaryRates.hai[loai]||def, hieu=_salaryRates.hieu[loai]||def;
    return `<tr><td style="font-size:13px;font-weight:500">${loai}</td>
      <td><input type="text" data-sheet="hai" data-loai="${loai}" value="${hai.toLocaleString('vi-VN')}" style="width:110px;font-size:12px;height:30px;border:1px solid var(--gray-border);border-radius:5px;padding:0 8px;text-align:right" oninput="_rateInput(this)" onfocus="this.value=_parseVND(this.value)||'';this.select()" onblur="this.value=(_parseVND(this.value)||0).toLocaleString('vi-VN')"></td>
      <td><input type="text" data-sheet="hieu" data-loai="${loai}" value="${hieu.toLocaleString('vi-VN')}" style="width:110px;font-size:12px;height:30px;border:1px solid var(--gray-border);border-radius:5px;padding:0 8px;text-align:right" oninput="_rateInput(this)" onfocus="this.value=_parseVND(this.value)||'';this.select()" onblur="this.value=(_parseVND(this.value)||0).toLocaleString('vi-VN')"></td>
      <td style="font-size:11px;color:var(--text-muted)">${def.toLocaleString('vi-VN')} đ</td></tr>`;
  }).join('');
}
function _rateInput(input){ const raw=_parseVND(input.value); if(raw>0){const f=raw.toLocaleString('vi-VN');if(input.value!==f)input.value=f;} }

// ===== QUẢN LÝ LOẠI BÀI =====
const LOAI_COLORS=['red','blue','green','gray','orange'];
const LOAI_COLOR_LABELS={red:'Đỏ',blue:'Xanh dương',green:'Xanh lá',gray:'Xám',orange:'Cam'};

function renderLoaiManager(){
  const tbody=document.getElementById('loaiManagerTbody'); if(!tbody)return;
  const loais=Object.keys(LOAI_CONFIG);
  tbody.innerHTML=loais.map(loai=>{
    const cfg=LOAI_CONFIG[loai];
    const isDefault=loai in LOAI_CONFIG_DEFAULT;
    const colorOpts=LOAI_COLORS.map(c=>`<option value="${c}" ${cfg.color===c?'selected':''}>${LOAI_COLOR_LABELS[c]||c}</option>`).join('');
    return `<tr>
      <td><input type="text" class="loai-name-input" data-orig="${loai}" value="${loai}" style="width:140px;font-size:12px;height:28px;border:1px solid var(--gray-border);border-radius:5px;padding:0 8px"></td>
      <td style="text-align:center"><input type="text" class="loai-price-input" value="${cfg.price.toLocaleString('vi-VN')}" style="width:100px;font-size:12px;height:28px;border:1px solid var(--gray-border);border-radius:5px;padding:0 8px;text-align:right" oninput="_rateInput(this)" onfocus="this.value=_parseVND(this.value)||'';this.select()" onblur="this.value=(_parseVND(this.value)||0).toLocaleString('vi-VN')"></td>
      <td style="text-align:center"><select class="loai-color-select" style="font-size:12px;height:28px;border:1px solid var(--gray-border);border-radius:5px;padding:0 4px">${colorOpts}</select></td>
      <td style="text-align:center">${isDefault?`<span style="font-size:10px;color:var(--text-muted)">Gốc</span>`:`<button onclick="deleteLoaiBai('${loai}')" style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:16px;padding:0 4px">✕</button>`}</td>
    </tr>`;
  }).join('');
}

function addLoaiBaiRow(){
  const tbody=document.getElementById('loaiManagerTbody'); if(!tbody)return;
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td><input type="text" class="loai-name-input" data-orig="" value="" placeholder="Tên loại bài..." style="width:140px;font-size:12px;height:28px;border:1px solid var(--green);border-radius:5px;padding:0 8px"></td>
    <td style="text-align:center"><input type="text" class="loai-price-input" value="0" style="width:100px;font-size:12px;height:28px;border:1px solid var(--gray-border);border-radius:5px;padding:0 8px;text-align:right" oninput="_rateInput(this)" onfocus="this.value=_parseVND(this.value)||'';this.select()" onblur="this.value=(_parseVND(this.value)||0).toLocaleString('vi-VN')"></td>
    <td style="text-align:center"><select class="loai-color-select" style="font-size:12px;height:28px;border:1px solid var(--gray-border);border-radius:5px;padding:0 4px">${LOAI_COLORS.map(c=>`<option value="${c}">${LOAI_COLOR_LABELS[c]||c}</option>`).join('')}</select></td>
    <td style="text-align:center"><button onclick="this.closest('tr').remove()" style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:16px;padding:0 4px">✕</button></td>`;
  tbody.appendChild(tr);
  tr.querySelector('.loai-name-input').focus();
}

function deleteLoaiBai(loai){
  const used=[...data.hai,...data.hieu].some(r=>r.loai===loai);
  if(used){ toast('⚠ Không thể xoá: loại bài này đang có bài viết!','#e74c3c',3000); return; }
  if(!confirm(`Xoá loại bài "${loai}"?`)) return;
  delete LOAI_CONFIG[loai];
  _saveCustomLoai();
  renderSalaryRatesForm();
  renderLoaiManager();
  toast(`✓ Đã xoá loại bài "${loai}"`,'#27ae60');
}

function saveSalaryRates(){
  const pin=document.getElementById('salaryRatesPin').value;
  if(pin!==ADMIN_PIN){document.getElementById('salaryRatesErr').style.display='block';document.getElementById('salaryRatesPin').value='';document.getElementById('salaryRatesPin').focus();return;}

  // 1. Lưu thay đổi loại bài (admin only)
  if(currentMember==='admin'){
    const rows=document.querySelectorAll('#loaiManagerTbody tr');
    const newConfig={};
    let hasError=false;
    rows.forEach(row=>{
      const nameInput=row.querySelector('.loai-name-input');
      const priceInput=row.querySelector('.loai-price-input');
      const colorSel=row.querySelector('.loai-color-select');
      if(!nameInput||!priceInput||!colorSel) return;
      const name=nameInput.value.trim();
      const price=_parseVND(priceInput.value)||0;
      const color=colorSel.value;
      if(!name){ hasError=true; nameInput.style.borderColor='#e74c3c'; return; }
      nameInput.style.borderColor='';
      newConfig[name]={price,color};
    });
    if(hasError){ toast('⚠ Tên loại bài không được để trống!','#e74c3c',3000); return; }
    // Xoá loại tùy chỉnh không còn trong danh sách
    Object.keys(LOAI_CONFIG).forEach(k=>{ if(!(k in newConfig)&&!(k in LOAI_CONFIG_DEFAULT)) delete LOAI_CONFIG[k]; });
    Object.assign(LOAI_CONFIG, newConfig);
    _saveCustomLoai();
  }

  // 2. Lưu mức lương cá nhân
  document.querySelectorAll('#salaryRatesTbody input').forEach(inp=>{
    const sheet=inp.dataset.sheet, loai=inp.dataset.loai;
    _salaryRates[sheet][loai]=_parseVND(inp.value)||LOAI_CONFIG[loai]?.price||14000;
  });
  try{localStorage.setItem('wt_salary_rates',JSON.stringify(_salaryRates));}catch(e){}
  saveAppData(); closeSalaryRatesModal(); renderDashboard(); toast('✅ Đã cập nhật mức lương & loại bài');
}

// ===== THƯỞNG / PHẠT LINH HOẠT =====
let _flexModalSheet = null;
function openFlexSalaryModal(sheet){
  if(sheet){ _flexModalSheet=sheet; }
  else if(currentMember==='admin'){ document.getElementById('flexSheetPicker').style.display='flex'; document.getElementById('flexSheetBody').style.display='none'; document.getElementById('flexSalaryModal').style.display='flex'; return; }
  else { _flexModalSheet=currentMember; }
  _renderFlexModal();
}
function _renderFlexModal(){
  const name=_flexModalSheet==='hai'?'Hải':'Hiếu';
  document.getElementById('flexSalaryTitle').textContent=`🎁 Thưởng / Phạt — ${name}`;
  document.getElementById('flexSheetPicker').style.display='none';
  document.getElementById('flexSheetBody').style.display='block';
  renderFlexList();
  document.getElementById('flexSalaryModal').style.display='flex';
}
function closeFlexSalaryModal(){ document.getElementById('flexSalaryModal').style.display='none'; }
function renderFlexList(){
  const list=getFlexSalary(_flexModalSheet);
  const wrap=document.getElementById('flexList'); if(!wrap)return;
  if(!list.length){wrap.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">Chưa có khoản nào.</div>';return;}
  wrap.innerHTML=list.map((item,i)=>{
    const isThuong=item.loai==='thuong';
    return `<div style="display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-bottom:1px solid var(--gray-border);background:${isThuong?'#f6fff9':'#fff8f8'}">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:12px;font-weight:700;color:${isThuong?'var(--green)':'var(--red)'}">${isThuong?'🟢 Thưởng':'🔴 Phạt'}</span>
          <span style="font-size:12px;color:var(--text-muted)">${item.ngay?fmtDate(item.ngay):''}</span>
        </div>
        <div style="font-size:13px;font-weight:600">${item.lydo||'—'}</div>
        <div style="font-size:13px;color:${isThuong?'var(--green)':'var(--red)'}">${isThuong?'+':'-'}${fmt(item.amount)}</div>
      </div>
      <button onclick="editFlexItem(${i})" style="background:none;border:1px solid var(--gray-border);border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;color:var(--text-muted)">✎</button>
      <button onclick="deleteFlexItem(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;padding:0 2px">✕</button>
    </div>`;
  }).join('');
}
function addFlexItem(loai){ const list=_flexSalary[_flexModalSheet]; list.push({id:_flexNextId[_flexModalSheet]++,loai,ngay:todayVN(),amount:0,lydo:''}); _saveFlexSalary(); renderFlexList(); editFlexItem(list.length-1); }
function editFlexItem(idx){ const item=getFlexSalary(_flexModalSheet)[idx]; if(!item)return; document.getElementById('flexEditIdx').value=idx; document.getElementById('flexEditLoai').value=item.loai; document.getElementById('flexEditNgay').value=item.ngay||todayVN(); document.getElementById('flexEditAmount').value=item.amount?item.amount.toLocaleString('vi-VN'):''; document.getElementById('flexEditLydo').value=item.lydo||''; document.getElementById('flexEditModal').style.display='flex'; setTimeout(()=>document.getElementById('flexEditLydo').focus(),100); }
function closeFlexEditModal(){ document.getElementById('flexEditModal').style.display='none'; }
function saveFlexItem(){ const idx=parseInt(document.getElementById('flexEditIdx').value); const item=_flexSalary[_flexModalSheet][idx]; if(!item)return; item.ngay=document.getElementById('flexEditNgay').value; item.amount=_parseVND(document.getElementById('flexEditAmount').value)||0; item.lydo=document.getElementById('flexEditLydo').value.trim(); item.loai=document.getElementById('flexEditLoai').value; _saveFlexSalary(); closeFlexEditModal(); renderFlexList(); renderDashboard(); }
function deleteFlexItem(idx){ if(!confirm('Xóa khoản này?'))return; _flexSalary[_flexModalSheet].splice(idx,1); _saveFlexSalary(); renderFlexList(); renderDashboard(); }
function _saveFlexSalary(){ try{localStorage.setItem('wt_flex_salary',JSON.stringify(_flexSalary));}catch(e){} saveAppData(); }

// Start Firebase real-time listener with active retry fallback
(function autoStartFirebase() {
  let attempts = 0;
  const checker = setInterval(() => {
    attempts++;
    if (window._fbReady && window._fbDb) {
      initFirebaseListener();
      clearInterval(checker);
    } else if (attempts >= 30) { // Sau 15 giây tự hủy để tránh rò rỉ RAM
      clearInterval(checker);
      // Chạy Offline cứu hộ
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderTasksOverview === 'function') renderTasksOverview();
    }
  }, 500);
})();


function bulkNghiemThu(sheet){
  const ids = selected[sheet];
  if(!ids||!ids.size){ toast('Chưa chọn dòng nào!','#e74c3c'); return; }
  // Show quick picker
  const opts = [
    {v:100, label:'100% — Đầy đủ', color:'#27ae60'},
    {v:80,  label:'80% — Khá',     color:'#2980b9'},
    {v:50,  label:'50% — TB',      color:'#e74c3c'},
    {v:0,   label:'0% — Không đạt',color:'#555'},
  ];
  // Click 1: chọn % → hiện ô nhập lý do (bắt buộc nếu <100%)
  const btns = opts.map(o=>`<button onclick="bulkNtSelectVal('${sheet}',${o.v},this)"
    style="padding:10px 14px;border:2px solid ${o.color};border-radius:8px;background:#fff;color:${o.color};font-weight:700;cursor:pointer;font-size:14px;min-width:110px">${o.label}</button>`).join('');
  const overlay = document.createElement('div');
  overlay.id='bulkNtOverlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML=`<div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.2);min-width:380px;max-width:480px">
    <div style="font-weight:700;font-size:15px;margin-bottom:16px">🎯 Nghiệm thu cho ${ids.size} bài</div>
    <div id="bulkNtBtns" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">${btns}</div>
    <div id="bulkNtReasonWrap" style="display:none;margin-top:16px">
      <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Lý do nghiệm thu <span style="color:var(--red)">*</span></label>
      <textarea id="bulkNtReason" rows="3" style="width:100%;border:1px solid var(--gray-border);border-radius:6px;padding:8px;font-size:13px;resize:vertical" placeholder="Nhập lý do..."></textarea>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
      <button onclick="document.getElementById('bulkNtOverlay').remove()" style="background:none;border:1px solid var(--gray-border);border-radius:6px;padding:6px 16px;cursor:pointer">Huỷ</button>
      <button id="bulkNtConfirm" style="display:none;background:var(--red);color:#fff;border:none;border-radius:6px;padding:6px 18px;cursor:pointer;font-weight:600">✓ Xác nhận</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

let _bulkNtVal = null;
let _bulkNtSheet = null;

function bulkNtSelectVal(sheet, val, btn){
  _bulkNtVal = val;
  _bulkNtSheet = sheet;
  // Highlight selected button
  document.querySelectorAll('#bulkNtBtns button').forEach(b=>b.style.opacity='.4');
  btn.style.opacity='1';
  btn.style.boxShadow='0 0 0 3px '+btn.style.color;
  // Show reason field (required for <100%, optional for 100%)
  const wrap = document.getElementById('bulkNtReasonWrap');
  const lbl = wrap.querySelector('label');
  if(val < 100){
    lbl.innerHTML = 'Lý do nghiệm thu <span style="color:var(--red)">*</span>';
  } else {
    lbl.innerHTML = 'Lý do / ghi chú <span style="color:var(--text-muted);font-weight:400">(tuỳ chọn)</span>';
  }
  wrap.style.display='block';
  document.getElementById('bulkNtConfirm').style.display='inline-block';
  document.getElementById('bulkNtConfirm').onclick = ()=>applyBulkNT(_bulkNtSheet, _bulkNtVal);
  setTimeout(()=>document.getElementById('bulkNtReason').focus(), 100);
}

function applyBulkNT(sheet, val){
  const reason = (document.getElementById('bulkNtReason')?.value||'').trim();
  if(val < 100 && !reason){ toast('Vui lòng nhập lý do!','#e74c3c'); return; }
  const ids = selected[sheet];
  data[sheet].forEach(r=>{
    if(ids.has(r.id)){
      r.nghiemThu = val;
      r.nghiemThuLydo = reason || '';
    }
  });
  saveAppData();
  const el=document.getElementById('bulkNtOverlay'); if(el) el.remove();
  renderDashboard();
  renderDashboard();
  toast(`✓ Đã cập nhật NT ${val}% cho ${ids.size} bài`);
}


// ===== HE SINH THAI WORKSPACE SWITCHER =====
// ===== HE SINH THAI WORKSPACE SWITCHER =====
function switchWorkspace(workspaceId, element) {
  document.querySelectorAll('.sidebar-nav-item').forEach(btn => btn.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  } else {
    const fallbackBtn = document.getElementById('btn-tab-' + workspaceId);
    if (fallbackBtn) fallbackBtn.classList.add('active');
  }
  document.querySelectorAll('.workspace-panel').forEach(panel => {
    panel.classList.add('is-hidden');
  });
  const targetPanel = document.getElementById('panel-workspace-' + workspaceId);
  if (targetPanel) {
    targetPanel.classList.remove('is-hidden');
    if (workspaceId === 'finance' || workspaceId === 'tools' || workspaceId === 'my-tools') {
      const iframe = targetPanel.querySelector('iframe');
      if (iframe && (!iframe.src || iframe.src.includes('about:blank') || iframe.src === '')) {
        const dataSrc = iframe.getAttribute('data-src') || iframe.getAttribute('src');
        if (dataSrc) {
          loadEcosystemApp(iframe, dataSrc);
        }
      }
    }
  }
  const submenu = document.getElementById('workspace-submenu');
  if (submenu) {
    submenu.style.display = (workspaceId === 'job') ? 'flex' : 'none';
  }
}

// ===== MICRO-FRONTEND LOADER V66 =====
function loadEcosystemApp(iframe, targetUrl) {
  if (!iframe) return;
  const sessionToken = sessionStorage.getItem('wt_session_admin') === 'true' ? 'secure_admin_active' : 'guest';
  const separator = targetUrl.includes('?') ? '&' : '?';
  const iframeSrc = `${targetUrl}${separator}theme=dark&auth_token=${encodeURIComponent(sessionToken)}`;
  console.log(`[V66 Dynamic Portal] Nạp iframe: ${iframeSrc}`);
  iframe.src = iframeSrc;
}

// ===== CROSS-ORIGIN MESSAGE PROXY CONTROLLER V66 =====
window.addEventListener('message', function(event) {
  // Nhận các tin nhắn từ tool con gửi lên để proxy API request
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || msg.type !== 'API_REQUEST') return;

  console.log(`[V66 Proxy] Nhận yêu cầu gọi API hộ từ Origin: ${event.origin}`, msg);

  // Danh sách trắng Origin được phép gọi Proxy (ở đây là toàn bộ github.io của tài khoản)
  if (!event.origin.includes('github.io') && !event.origin.includes('localhost') && !event.origin.includes('127.0.0.1')) {
    console.warn(`[V66 Proxy Warning] Chặn yêu cầu từ Origin không an toàn: ${event.origin}`);
    return;
  }

  // Uỷ quyền fetch request cùng nguồn gốc
  const fetchOpts = {
    method: msg.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...msg.headers
    }
  };
  if (msg.body && (fetchOpts.method === 'POST' || fetchOpts.method === 'PUT')) {
    fetchOpts.body = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
  }

  fetch(msg.url, fetchOpts)
    .then(res => {
      const isJson = res.headers.get('content-type')?.includes('application/json');
      return Promise.all([res.status, res.headers, isJson ? res.json() : res.text()]);
    })
    .then(([status, headers, body]) => {
      // Bắn trả dữ liệu lại cho iframe đã gọi
      event.source.postMessage({
        type: 'API_RESPONSE',
        requestId: msg.requestId,
        status: status,
        body: body
      }, event.origin);
    })
    .catch(err => {
      console.error(`[V66 Proxy Error] Lỗi fetch proxy:`, err);
      event.source.postMessage({
        type: 'API_RESPONSE',
        requestId: msg.requestId,
        status: 500,
        error: err.message
      }, event.origin);
    });
});

function updateNavBadges() {
  const sidebar = document.querySelector('nav');
  if (!sidebar) return;
  const badgeRecur = document.getElementById('navBadgeRecurring');
  if (badgeRecur) {
    let doneIds = new Set();
    try { doneIds = new Set(getRecurDoneToday().map(d => d.taskId)); } catch(e) {}
    const activeRecurs = (recurringTasks || []).filter(t => !doneIds.has(t.id)).length;
    badgeRecur.textContent = activeRecurs || '';
    badgeRecur.style.display = activeRecurs ? 'inline-block' : 'none';
  }
  const badgeTasks = document.getElementById('navBadgeTasks');
  if (badgeTasks) {
    const activeTasksCount = (tasks || []).length;
    badgeTasks.textContent = activeTasksCount || '';
    badgeTasks.style.display = activeTasksCount ? 'inline-block' : 'none';
  }
  const badgeGv = document.getElementById('gvBadge');
  if (badgeGv) {
    const activeGv = (giaoViecList || []).filter(g => g.status !== 'Done' && g.status !== 'Đã Duyệt').length;
    badgeGv.textContent = activeGv || '';
    badgeGv.style.display = activeGv ? 'inline-block' : 'none';
  }
}

// ==========================================================================
// V32: TaskImporter Namespace for Quick Import (Anti-Regression Recovery)
// ==========================================================================
const TaskImporter = {
  parsedTasks: [],
  open: function() {
    document.getElementById('quickImportModal').classList.add('open');
    document.getElementById('quickImportModal').style.display = 'flex';
    this.goBack();
    setTimeout(() => {
      document.getElementById('qi_input').focus();
      this.onDangChange();
    }, 50);
    const teamRow = document.getElementById('qi_team_row');
    if (teamRow) {
      teamRow.style.display = currentMember === 'hai' ? 'none' : 'block';
    }
    const personSelect = document.getElementById('qi_person');
    if (personSelect) {
      if (currentMember !== 'admin') {
        personSelect.value = currentMember === 'hai' ? 'Hải' : 'Hiếu';
        personSelect.disabled = true;
      } else {
        personSelect.value = '';
        personSelect.disabled = false;
      }
    }
    const dateFrom = document.getElementById('qi_from');
    if (dateFrom) dateFrom.value = todayVN();
  },
  close: function(e) {
    const isBackdropClick = e && e.target === document.getElementById('quickImportModal');
    const isDirectClose = !e;
    if (!isBackdropClick && !isDirectClose) return;
    const hasContent = (document.getElementById('qi_input')?.value || '').trim() ||
                       (document.getElementById('qi_taskname')?.value || '').trim() ||
                       (document.getElementById('qi_steps')?.value || '').trim();
    if (hasContent && isBackdropClick) {
      if (!confirm('Có task chưa thêm xong. Bạn có muốn thoát không?\n\nNhấn OK để thoát, Huỷ để quay lại điền tiếp.')) return;
    }
    document.getElementById('quickImportModal').classList.remove('open');
    document.getElementById('quickImportModal').style.display = 'none';
    this.resetForm();
  },
  resetForm: function() {
    document.getElementById('qi_input').value = '';
    document.getElementById('qi_taskname').value = '';
    document.getElementById('qi_steps').value = '';
    document.getElementById('qi_person').selectedIndex = 0;
    document.getElementById('qi_step1').style.display = 'block';
    document.getElementById('qi_step2').style.display = 'none';
    document.getElementById('qi_loading').style.display = 'none';
    document.getElementById('qi_btn_back').style.display = 'none';
    document.getElementById('qi_btn_add').style.display = 'none';
    document.getElementById('qi_error').style.display = 'none';
    document.getElementById('qi_preview').innerHTML = '';
    this.parsedTasks = [];
    const qf = document.getElementById('qi_from'); if (qf) qf.value = todayVN();
    const qd = document.getElementById('qi_deadline'); if (qd) qd.value = '';
    const dang = document.getElementById('qi_dang')?.value || 'url';
    const btnParse = document.getElementById('qi_btn_parse');
    const btnParseUrl = document.getElementById('qi_btn_parse_url');
    if (btnParse) btnParse.style.display = dang === 'url' ? 'none' : 'inline-flex';
    if (btnParseUrl) btnParseUrl.style.display = dang === 'url' ? 'inline-flex' : 'none';
  },
  goBack: function() {
    document.getElementById('qi_step1').style.display = 'block';
    document.getElementById('qi_step2').style.display = 'none';
    document.getElementById('qi_loading').style.display = 'none';
    const dang = document.getElementById('qi_dang')?.value || 'url';
    document.getElementById('qi_btn_parse').style.display = dang === 'url' ? 'none' : 'inline-flex';
    document.getElementById('qi_btn_parse_url').style.display = dang === 'url' ? 'inline-flex' : 'none';
    document.getElementById('qi_btn_back').style.display = 'none';
    document.getElementById('qi_btn_add').style.display = 'none';
    document.getElementById('qi_error').style.display = 'none';
  },
  onDangChange: function() {
    const dang = document.getElementById('qi_dang')?.value || 'text';
    const hint = document.getElementById('qi_url_hint');
    const btnParse = document.getElementById('qi_btn_parse');
    const btnParseUrl = document.getElementById('qi_btn_parse_url');
    if (hint) hint.style.display = dang === 'url' ? 'block' : 'none';
    if (btnParse) btnParse.style.display = dang === 'url' ? 'none' : 'inline-flex';
    if (btnParseUrl) btnParseUrl.style.display = dang === 'url' ? 'inline-flex' : 'none';
    const stepsRow = document.getElementById('qi_steps_row');
    if (stepsRow) stepsRow.style.display = 'block';
  },
  addDefaultSteps: function() {
    const el = document.getElementById('qi_steps');
    if (!el) return;
    if (!el.value.trim()) {
      el.value = 'Viết trang chủ\nThêm ảnh vào docs\nThêm ảnh vào drive\nThêm ảnh vào bài đăng';
    }
    el.focus();
  },
  parse: async function() {
    const text = (document.getElementById('qi_input').value || '').trim();
    if (!text) {
      const e = document.getElementById('qi_error');
      e.textContent = 'Vui lòng dán nội dung vào!';
      e.style.display = 'block';
      return;
    }
    document.getElementById('qi_step1').style.display = 'none';
    document.getElementById('qi_loading').style.display = 'block';
    document.getElementById('qi_btn_parse').style.display = 'none';
    const person = document.getElementById('qi_person').value;
    const manualTaskName = (document.getElementById('qi_taskname')?.value || '').trim();
    const manualSteps = (document.getElementById('qi_steps')?.value || '').trim();
    await new Promise(r => setTimeout(r, 400));

    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const domainPat = /^(https?:\/\/)?[\w.-]+\.[a-zA-Z]{2,10}(\/\S*)?(\s[\s\S]*)?$/i;
    const isStepLine = l => /^(b.{0,5}c\s*\d+|step\s*\d+|\d+\s*[:.)]\s*\w)/i.test(l);

    const domainLines = lines.filter(l => domainPat.test(l));
    const instrLines = lines.filter(l => !domainPat.test(l) && l.length > 2);
    const stepLines = instrLines.filter(l => isStepLine(l));
    const descLines = instrLines.filter(l => !isStepLine(l));
    const fullDesc = descLines.join(' ');

    const detectLoai = s => {
      s = s.toLowerCase();
      if (/tinh g[oọ]n nhanh/.test(s)) return 'Tinh Gọn Nhanh';
      if (/ch[iỉ]\s*vi[eế]t/.test(s)) return 'Chỉ Viết';
      if (/ch[iỉ]\s*[dđ][aă]ng/.test(s)) return 'Chỉ Đăng';
      if (/tinh g[oọ]n/.test(s)) return 'Tinh Gọn';
      return '';
    };
    const detectType = s => {
      s = s.toLowerCase();
      if (/backlink|seo|t[uừ]\s*kh[oó]a|keyword/.test(s)) return 'SEO';
      if (/thi[eế]t k[eế]|design/.test(s)) return 'Thiết kế';
      if (/code|k[yỹ]\s*thu[aậ]t|fix/.test(s)) return 'Kỹ thuật';
      return 'Nội dung';
    };

    const loai = detectLoai(fullDesc);
    const type = detectType(fullDesc);
    const soBai = parseInt((fullDesc.match(/(\d+)\s*bài/i) || [])[1]) || 0;

    const cols = manualSteps ? parseSteps(manualSteps)
               : stepLines.length >= 1 ? parseSteps(stepLines.join('\n'))
               : null;
    const firstColId = cols ? cols[0].id : 'col_new';

    const itemLines = domainLines.length > 0 ? lines.filter(l => l.length > 2) : lines.filter(l => l.length > 2);
    const cards = itemLines.map((line, i) => {
      return { id: 'qc' + (cardNextId + i), colId: firstColId, name: line.replace(/^https?:\/\//, ''), desc: '' };
    });
    cardNextId += cards.length;

    let taskName = manualTaskName;
    if (!taskName) {
      if (descLines.filter(l => !isStepLine(l)).length > 0) {
        taskName = descLines.filter(l => !isStepLine(l))[0];
        if (taskName.length > 70) taskName = taskName.slice(0, 70) + '…';
      } else if (domainLines.length > 0) {
        taskName = `${domainLines.length} website${soBai ? ' — ' + soBai + ' bài/web' : ''}`;
      } else {
        taskName = lines[0] || 'Task mới';
      }
    }

    this.parsedTasks = [{
      id: taskNextId,
      name: taskName,
      type, desc: fullDesc, person,
      from: document.getElementById('qi_from')?.value || todayVN(),
      deadline: document.getElementById('qi_deadline')?.value || '',
      priority: document.getElementById('qi_priority')?.value || 'Bình thường',
      team: currentMember === 'hai' ? 'Team 01' : (document.getElementById('qi_team')?.value || 'Team 01'),
      cols, cards,
      _loaiBai: loai, _soBai: soBai,
    }];

    document.getElementById('qi_loading').style.display = 'none';
    document.getElementById('qi_step2').style.display = 'block';
    document.getElementById('qi_count').textContent = '1';
    document.getElementById('qi_btn_back').style.display = 'inline-flex';
    document.getElementById('qi_btn_add').style.display = 'inline-flex';

    const t = this.parsedTasks[0];
    const colList = cols ? cols.map(c => c.label) : ['Cần làm', 'Đang làm', 'Pending', 'Hoàn thành'];
    document.getElementById('qi_preview').innerHTML = `
      <div style="background:#161b22;border-radius:8px;padding:12px 14px;border:1px solid #30363d">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span class="badge ${TASK_TYPE_COLORS[t.type] || 'badge-gray'}" style="font-size:11px">${t.type}</span>
          ${t._loaiBai ? `<span class="badge badge-red" style="font-size:11px">${t._loaiBai}</span>` : ''}
          ${t._soBai ? `<span class="badge badge-blue" style="font-size:11px">${t._soBai} bài/web</span>` : ''}
          ${t.person ? `<span class="tag-person ${t.person === 'Hải' ? 'tag-hai' : t.person === 'Hiếu' ? 'tag-hieu' : ''}" style="font-size:11px">${t.person}</span>` : ''}
        </div>
        <div style="margin-bottom:6px">
          <label style="font-size:11px;color:#8b949e;display:block;margin-bottom:3px">Tên task</label>
          <input type="text" value="${t.name.replace(/"/g, '&quot;')}" oninput="TaskImporter.parsedTasks[0].name=this.value"
            style="width:100%;font-size:14px;font-weight:600;border:1px solid #30363d;background-color:#0d1117;color:#c9d1d9;border-radius:6px;padding:6px 8px;box-sizing:border-box">
        </div>
        <div style="margin-bottom:10px;font-size:11px;color:#8b949e">
          Kanban: <b style="color:#c9d1d9">${colList.join(' → ')}</b>
        </div>
        <div style="font-size:12px;font-weight:500;margin-bottom:6px;color:#c9d1d9">Task con (${t.cards.length} thẻ — vào cột "${colList[0]}")</div>
        <div data-cards style="display:flex;flex-direction:column;gap:4px">
          ${t.cards.map((c, i) => `
            <div style="display:flex;align-items:center;gap:6px;background-color:#0d1117;border-radius:5px;padding:5px 8px;border:1px solid #30363d">
              <span style="font-size:11px;color:#8b949e;min-width:20px">${i + 1}.</span>
              <input type="text" value="${c.name.replace(/"/g, '&quot;')}" 
                oninput="TaskImporter.parsedTasks[0].cards[${i}].name=this.value"
                style="flex:1;font-size:12px;border:none;outline:none;background:transparent;color:#c9d1d9">
              <button onclick="TaskImporter.parsedTasks[0].cards.splice(${i},1);TaskImporter.repreview()" 
                style="background:none;border:none;cursor:pointer;color:#8b949e;font-size:14px;padding:0 2px">&#10005;</button>
            </div>`).join('')}
        </div>
      </div>`;
  },
  repreview: function() {
    const t = this.parsedTasks[0];
    if (!t) return;
    const cardsHtml = t.cards.map((c, i) => `
      <div style="display:flex;align-items:center;gap:6px;background-color:#0d1117;border-radius:5px;padding:5px 8px;border:1px solid #30363d">
        <span style="font-size:11px;color:#8b949e;min-width:20px">${i + 1}.</span>
        <input type="text" value="${c.name.replace(/"/g, '&quot;')}" 
          oninput="TaskImporter.parsedTasks[0].cards[${i}].name=this.value"
          style="flex:1;font-size:12px;border:none;outline:none;background:transparent;color:#c9d1d9">
        <button onclick="TaskImporter.parsedTasks[0].cards.splice(${i},1);TaskImporter.repreview()" 
          style="background:none;border:none;cursor:pointer;color:#8b949e;font-size:14px;padding:0 2px">&#10005;</button>
      </div>`).join('');
    const cardList = document.getElementById('qi_preview').querySelector('[data-cards]');
    if (cardList) cardList.innerHTML = cardsHtml;
  },
  parseUrl: function() {
    const raw = (document.getElementById('qi_input')?.value || '');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const urls = lines.map(extractUrlFromLine).filter(Boolean);
    if (!urls.length) {
      const err = document.getElementById('qi_error');
      if (err) {
        err.textContent = 'Không tìm thấy URL hợp lệ trong nội dung dán vào.';
        err.style.display = 'block';
      }
      return;
    }
    const err = document.getElementById('qi_error'); if (err) err.style.display = 'none';

    let taskName = (document.getElementById('qi_taskname')?.value || '').trim() || `Task URL (${urls.length} link)`;
    const person = document.getElementById('qi_person')?.value || '';
    const from = document.getElementById('qi_from')?.value || todayVN();
    const deadline = document.getElementById('qi_deadline')?.value || '';
    const priority = document.getElementById('qi_priority')?.value || 'Bình thường';
    const team = document.getElementById('qi_team')?.value || 'Team 01';

    const manualSteps = (document.getElementById('qi_steps')?.value || '').trim();
    const cols = manualSteps ? parseSteps(manualSteps) : null;
    const firstColId = cols ? cols[0].id : 'todo';
    const startId = cardNextId;
    cardNextId += urls.length;
    this.parsedTasks = [{
      name: taskName, person, type: 'SEO', dang: 'url',
      from, deadline, desc: '', priority, team,
      cols,
      cards: urls.map((u, i) => ({ id: 'qcu' + (startId + i), colId: firstColId, name: u, desc: '' }))
    }];

    document.getElementById('qi_step1').style.display = 'none';
    document.getElementById('qi_step2').style.display = 'block';
    document.getElementById('qi_btn_parse_url').style.display = 'none';
    document.getElementById('qi_btn_back').style.display = 'inline-flex';
    document.getElementById('qi_btn_add').style.display = 'inline-flex';
    document.getElementById('qi_count').textContent = 1;

    const t = this.parsedTasks[0];
    const inKho = t.cards.filter(card => {
      const q = card.name.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
      return websites.some(w => {
        const wu = (w.url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
        return wu === q || wu.includes(q) || q.includes(wu);
      });
    }).length;

    document.getElementById('qi_preview').innerHTML = `
      <div style="background:#161b22;border-radius:8px;padding:12px 14px;margin-bottom:10px;border:1px solid #30363d">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#f0f6fc">${t.name}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <span style="font-size:12px;background:rgba(46,160,67,0.15);border:1px solid rgba(46,160,67,0.3);border-radius:20px;padding:2px 10px;color:#56d364">✅ Trong kho: ${inKho}</span>
          <span style="font-size:12px;background:rgba(248,81,73,0.15);border:1px solid rgba(248,81,73,0.3);border-radius:20px;padding:2px 10px;color:#f85149">🔍 Chưa có: ${t.cards.length - inKho}</span>
          <span style="font-size:12px;background:rgba(56,139,253,0.15);border:1px solid rgba(56,139,253,0.3);border-radius:20px;padding:2px 10px;color:#58a6ff">Tổng: ${t.cards.length} URL</span>
        </div>
        <div data-cards style="display:flex;flex-direction:column;gap:5px;max-height:300px;overflow-y:auto">
          ${t.cards.map((card, i) => {
            const url = card.name;
            const q = url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
            const ws = websites.find(w => {
              const wu = (w.url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
              return wu === q || wu.includes(q) || q.includes(wu);
            });
            const icon = ws ? (WS_STATUS_ICON[ws.status] || '✅') : '🔍';
            const tip = ws ? (ws.brand + ' — ' + ws.status) : 'Chưa có trong kho';
            const tipColor = icon === '✅' ? '#56d364' : icon === '🔍' ? '#8b949e' : '#f85149';
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background-color:#0d1117;border-radius:6px;border:1px solid #30363d">
              <span style="font-size:14px" title="${tip}">${icon}</span>
              <span style="flex:1;font-size:12px;color:#c9d1d9">${url}</span>
              <span style="font-size:11px;color:${tipColor}">${tip}</span>
              <button onclick="TaskImporter.parsedTasks[0].cards.splice(${i},1);TaskImporter.repreviewUrl()" 
                style="background:none;border:none;cursor:pointer;color:#8b949e;font-size:14px;padding:0 2px">✕</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  },
  repreviewUrl: function() {
    const t = this.parsedTasks[0];
    if (!t) return;
    const inKho = t.cards.filter(card => {
      const q = card.name.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
      return websites.some(w => {
        const wu = (w.url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
        return wu === q || wu.includes(q) || q.includes(wu);
      });
    }).length;
    const container = document.getElementById('qi_preview');
    if (container) {
      const summaryBadges = container.querySelector('[style*="display:flex;gap:8px"]');
      if (summaryBadges) {
        summaryBadges.innerHTML = `
          <span style="font-size:12px;background:rgba(46,160,67,0.15);border:1px solid rgba(46,160,67,0.3);border-radius:20px;padding:2px 10px;color:#56d364">✅ Trong kho: ${inKho}</span>
          <span style="font-size:12px;background:rgba(248,81,73,0.15);border:1px solid rgba(248,81,73,0.3);border-radius:20px;padding:2px 10px;color:#f85149">🔍 Chưa có: ${t.cards.length - inKho}</span>
          <span style="font-size:12px;background:rgba(56,139,253,0.15);border:1px solid rgba(56,139,253,0.3);border-radius:20px;padding:2px 10px;color:#58a6ff">Tổng: ${t.cards.length} URL</span>`;
      }
      const cardList = container.querySelector('[data-cards]');
      if (cardList) {
        cardList.innerHTML = t.cards.map((card, i) => {
          const url = card.name;
          const q = url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
          const ws = websites.find(w => {
            const wu = (w.url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
            return wu === q || wu.includes(q) || q.includes(wu);
          });
          const icon = ws ? (WS_STATUS_ICON[ws.status] || '✅') : '🔍';
          const tip = ws ? (ws.brand + ' — ' + ws.status) : 'Chưa có trong kho';
          const tipColor = icon === '✅' ? '#56d364' : icon === '🔍' ? '#8b949e' : '#f85149';
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background-color:#0d1117;border-radius:6px;border:1px solid #30363d">
            <span style="font-size:14px" title="${tip}">${icon}</span>
            <span style="flex:1;font-size:12px;color:#c9d1d9">${url}</span>
            <span style="font-size:11px;color:${tipColor}">${tip}</span>
            <button onclick="TaskImporter.parsedTasks[0].cards.splice(${i},1);TaskImporter.repreviewUrl()" 
              style="background:none;border:none;cursor:pointer;color:#8b949e;font-size:14px;padding:0 2px">✕</button>
          </div>`;
        }).join('');
      }
    }
  },
  addAll: function() {
    if (!this.parsedTasks.length) return;
    const t = this.parsedTasks[0];
    const newTask = {
      id: taskNextId++,
      name: t.name,
      person: t.person || '',
      type: t.type || 'SEO',
      dang: t.dang || 'url',
      from: t.from || todayVN(),
      deadline: t.deadline || '',
      desc: t.desc || '',
      priority: t.priority || 'Bình thường',
      team: t.team || 'Team 01',
      cols: t.cols || null,
      cards: (t.cards || []).map(c => ({ ...c })),
    };
    tasks.push(newTask);
    document.getElementById('quickImportModal').classList.remove('open');
    document.getElementById('quickImportModal').style.display = 'none';
    this.resetForm();
    renderTasksOverview();
    saveAppData();
    toast(`&#10003; Đã thêm task "${newTask.name}" với ${newTask.cards.length} thẻ con!`);
  }
};

// Event delegation listener for #page-tasks to open TaskImporter modal
document.getElementById('page-tasks')?.addEventListener('click', function(event) {
  const importBtn = event.target.closest('[data-action="import-message"]');
  if (importBtn) {
    event.preventDefault();
    if (typeof TaskImporter.open === 'function') {
      TaskImporter.open();
    }
  }
});

window.validateAdminPassword = function(inputPassword) {
  try {
    const pws = JSON.parse(localStorage.getItem('wt_passwords') || '{}');
    return inputPassword === pws['admin'];
  } catch(e) {
    return false;
  }
};