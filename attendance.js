// EduNote 출결(수업출결 코어 + 학생 캘린더) 모듈 (attendance.js)
// classic <script> — kiosk.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// 정의: _myUidForAtt/loadClassAttendance/_repStatus/mirrorClassAttendance/backfillClassAttendance/
//   cleanupOldAttendanceKeys/removeClassAttendanceSession/pruneOrphanAttendance/_attScopeRecords/
//   renderAttendance/filterAttList + 학생 캘린더(var _calName/_calY/_calM/_calByDate, openStudentCalendar/
//   closeStudentCalendar/calNavMonth/drawCalendar/showCalDay). top-level → window 전역(인라인 onclick·외부 호출 무손상).
// 런타임 의존(window 전역): _attEntries(모놀리스 1499 잔류), currentSchool/currentSchoolId/currentUser/currentRole/students,
//   isOwnerOrAdmin/showToast/showLoading/loadOwnerData/todayStr 등, window.fbAuth/fbDb/fbGetDocs/fbCollection/fbDoc/fbSetDoc/fbDeleteDoc.
// 잔류(의도): cleanupOwnerDupRecords(원장 도메인 → 추후 schoolStore), _attEntries(var 전역).
// 주의: 이 식별자들을 다른 파일에서 재선언/재정의하지 말 것.

function _myUidForAtt() {
  return (window.fbAuth && window.fbAuth.currentUser) ? window.fbAuth.currentUser.uid : (currentSchool || '');
}

// 학교 단위 수업출결 로드 (schools/{id}/classAttendance/{date}) → _attEntries 평면화
function loadClassAttendance(cb) {
  _attEntries = [];
  if (!window.fbDb || !currentSchoolId) { if (typeof cb==='function') cb(); return; }
  window.fbGetDocs(window.fbCollection(window.fbDb, 'schools', currentSchoolId, 'classAttendance'))
    .then(function(snap){
      var out = [];
      snap.forEach(function(docSnap){
        var date = docSnap.id;
        var data = docSnap.data() || {};
        var ents = data.entries || {};
        Object.keys(ents).forEach(function(k){
          if (k.indexOf('__') !== -1) return;           // 구버전(복합키) entry 무시
          var e = ents[k] || {};
          var sessions = e.sessions || [];
          if (!e.status && !e.makeup && !sessions.length) return; // 빈 칸 스킵
          out.push({
            date: date,
            student: e.name || '',
            studentId: e.studentId || k,
            attendance: e.status || '',
            makeup: !!e.makeup,
            count: (typeof e.count === 'number' ? e.count : sessions.length),
            sessions: sessions
          });
        });
      });
      _attEntries = out;
    })
    .catch(function(err){ console.warn('[classAttendance] load 실패:', err); })
    .finally(function(){ if (typeof cb==='function') cb(); });
}

// 대표 출결 산출 규칙: 결석 > 지각(15분이상) > 지각(15분이내) > 정시도착
function _repStatus(sessions) {
  var sev = { '결석':4, '15분이상':3, '15분이내':2, '정시도착':1 };
  var best = '', bestv = 0, mk = false;
  (sessions || []).forEach(function(s){
    if (s && s.makeup) mk = true;
    var v = sev[s && s.status] || 0;
    if (v > bestv) { bestv = v; best = s.status; }
  });
  return { status: best, makeup: mk };
}

// 수업 출결만 학교 단위로 복제(mirror).
// 단위 = 학생 × 하루 (entries["{studentId}"] 1칸). 그날 수업들은 sessions[]에 누적 → 두 선생/여러 번도 1칸으로 통합.
// 지각정도/보충을 안 고른 수업은 세션으로 인정하지 않음(출결 표시 X).
function mirrorClassAttendance(rec) {
  if (!window.fbDb || !currentSchoolId || !rec) return Promise.resolve();
  var date = (rec.date || '').slice(0,10);
  if (!date) return Promise.resolve();
  var sid = rec.studentId || (typeof resolveStudentId==='function' ? resolveStudentId(rec) : '');
  if (!sid) return Promise.resolve();                 // 학생 식별 불가 (스킵)
  var uid = _myUidForAtt();
  var rid = String(rec.id || '');
  var hasAtt = !!(rec.attendance || rec.makeup);      // 지각정도/보충 입력 시에만 세션 인정
  var ref = window.fbDoc(window.fbDb, 'schools', currentSchoolId, 'classAttendance', date);
  return window.fbGetDoc(ref).then(function(snap){
    var data = (snap && typeof snap.exists === 'function' && snap.exists()) ? (snap.data() || {}) : {};
    var entries = data.entries || {};
    var entry = entries[sid] || { studentId: sid, name: rec.student || '', sessions: [] };
    // 같은 기록(rid) 재저장 → 해당 세션 교체. (지각정도 해제 후 저장이면 추가 안 함 = 사실상 제거)
    var sessions = (entry.sessions || []).filter(function(x){ return String(x.rid) !== rid; });
    if (hasAtt) {
      sessions.push({
        rid: rid,
        teacher: rec.teacher || currentUser || '',
        teacherUid: uid,
        className: rec.className || '',
        session: rec.session || '정규',
        status: rec.attendance || '',
        makeup: !!rec.makeup,
        at: new Date().toISOString()
      });
    }
    var rep = _repStatus(sessions);
    var payload = { entries: {} };
    payload.entries[sid] = {
      studentId: sid,
      name: rec.student || entry.name || '',
      status: rep.status,
      makeup: rep.makeup,
      count: sessions.length,
      sessions: sessions,
      updatedAt: new Date().toISOString()
    };
    return window.fbSetDocMerge(ref, payload);
  }).catch(function(err){ console.warn('[classAttendance] mirror 실패:', err); });
}

// 내 계정의 기존 수업기록 출결을 학교 출결로 1회 가져오기 (계정당 1회, 중복 안전)
async function backfillClassAttendance() {
  if (!isOwnerOrAdmin()) { showToast('원장만 사용할 수 있습니다.', 'error'); return; }
  if (!window.fbDb || !currentSchoolId) { showToast('학원 정보가 없어 가져올 수 없습니다.', 'error'); return; }
  var src = (window.records || []).filter(function(r){ return (r.attendance || r.makeup); });
  if (!src.length) { showToast('가져올 출결 기록이 없습니다.', 'error'); return; }
  if (!confirm('내 계정의 기존 수업기록 ' + src.length + '건의 출결을 학교 출결로 가져옵니다.\n(여러 번 눌러도 중복되지 않습니다)')) return;
  showLoading(true);
  var ok = 0, skip = 0;
  for (var i=0; i<src.length; i++) {
    try {
      var r = src[i];
      var sid = r.studentId || (typeof resolveStudentId==='function' ? resolveStudentId(r) : '');
      if (!sid || !((r.date||'').slice(0,10))) { skip++; continue; }
      await mirrorClassAttendance(r);
      ok++;
    } catch(e) { skip++; }
  }
  showLoading(false);
  showToast(ok + '건 가져오기 완료' + (skip ? (' · ' + skip + '건 건너뜀(학생 식별 불가)') : ''));
  loadClassAttendance(renderAttendance);
}

// 옛 복합키(studentId__반__선생__세션) 출결 entry 일괄 정리. 전체 덮어쓰기라 키에 '/' 있어도 안전.
async function cleanupOldAttendanceKeys() {
  if (!isOwnerOrAdmin()) { showToast('원장만 사용할 수 있습니다.', 'error'); return; }
  if (!window.fbDb || !currentSchoolId) { showToast('학원 정보가 없습니다.', 'error'); return; }
  showLoading(true);
  try {
    var snap = await window.fbGetDocs(window.fbCollection(window.fbDb, 'schools', currentSchoolId, 'classAttendance'));
    var cleaned = 0;
    for (var i = 0; i < snap.docs.length; i++) {
      var d = snap.docs[i];
      var data = d.data() || {};
      var ents = data.entries || {};
      var keep = {}; var removed = false;
      Object.keys(ents).forEach(function(k){
        if (k.indexOf('__') !== -1) { removed = true; } else { keep[k] = ents[k]; }
      });
      if (removed) {
        var nd = Object.assign({}, data); nd.entries = keep;
        await window.fbSetDoc(d.ref, nd);   // 전체 덮어쓰기 (field-path '/' 문제 회피)
        cleaned++;
      }
    }
    showToast('옛 출결 키 정리 완료: ' + cleaned + '개 날짜');
    loadClassAttendance(renderAttendance);
  } catch (e) {
    showToast('정리 실패: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// (cleanupOwnerDupRecords 는 원장 도메인이라 모놀리스에 잔류)

// record 삭제 시 그 record(rid)가 만든 출결 세션 1개 제거 + 대표상태/카운트 재계산
function removeClassAttendanceSession(rec) {
  if (!window.fbDb || !currentSchoolId || !rec) return Promise.resolve();
  var date = (rec.date||'').slice(0,10);
  if (!date) return Promise.resolve();
  var sid = rec.studentId || (typeof resolveStudentId==='function' ? resolveStudentId(rec) : '');
  if (!sid) return Promise.resolve();
  var rid = String(rec.id||'');
  var ref = window.fbDoc(window.fbDb, 'schools', currentSchoolId, 'classAttendance', date);
  return window.fbGetDoc(ref).then(function(snap){
    if (!(snap && typeof snap.exists==='function' && snap.exists())) return;
    var data = snap.data()||{}; var entries = data.entries || {};
    var entry = entries[sid]; if (!entry) return;
    var sessions = (entry.sessions||[]).filter(function(x){ return String(x.rid) !== rid; });
    var payload = { entries: {} };
    if (!sessions.length) {
      payload.entries[sid] = { studentId: sid, name: entry.name||'', status:'', makeup:false, count:0, sessions:[], updatedAt:new Date().toISOString() };
    } else {
      var rep = _repStatus(sessions);
      payload.entries[sid] = { studentId: sid, name: entry.name||'', status: rep.status, makeup: rep.makeup, count: sessions.length, sessions: sessions, updatedAt: new Date().toISOString() };
    }
    return window.fbSetDocMerge(ref, payload);
  }).catch(function(err){ console.warn('[classAttendance] 세션 제거 실패:', err); });
}

// 고아 출결 정리: 내가 기록한 세션 중 현재 내 records에 없는 rid(=삭제된 기록) 제거
async function pruneOrphanAttendance() {
  if (!window.fbDb || !currentSchoolId) return;
  var myUid = _myUidForAtt();
  var live = {}; (window.records||[]).forEach(function(r){ live[String(r.id)] = true; });
  var snap = await window.fbGetDocs(window.fbCollection(window.fbDb,'schools',currentSchoolId,'classAttendance'));
  var changed = 0;
  for (var i=0;i<snap.docs.length;i++){
    var d = snap.docs[i]; var data = d.data()||{}; var entries = data.entries||{};
    var dirty = false; var newEntries = {};
    Object.keys(entries).forEach(function(sid){
      var e = entries[sid]||{}; var sess = e.sessions||[];
      var kept = sess.filter(function(x){ return !(x.teacherUid===myUid && !live[String(x.rid)]); });
      if (kept.length !== sess.length) dirty = true;
      if (kept.length){ var rep=_repStatus(kept); newEntries[sid]={studentId:e.studentId||sid,name:e.name||'',status:rep.status,makeup:rep.makeup,count:kept.length,sessions:kept,updatedAt:new Date().toISOString()}; }
      // kept 0개면 newEntries에서 통째 제외(칸 제거)
    });
    if (dirty){ var nd=Object.assign({},data); nd.entries=newEntries; await window.fbSetDoc(d.ref, nd); changed++; }
  }
  if (typeof showToast==='function') showToast('고아 출결 정리: '+changed+'개 날짜');
  if (typeof loadClassAttendance==='function' && typeof renderAttendance==='function') loadClassAttendance(renderAttendance);
}

function _attScopeRecords() {
  if (isOwnerOrAdmin()) return _attEntries.slice();
  // 선생님: 본인이 기록했거나 본인에게 배정된 학생의 출결만
  var uid = _myUidForAtt();
  var assigned = {};
  ((typeof students!=='undefined' && students) || []).forEach(function(s){ if(s && s.id!=null) assigned[String(s.id)] = true; });
  return _attEntries.filter(function(e){
    return e.teacherUid === uid || assigned[String(e.studentId)];
  });
}
function renderAttendance() {
  var ysel=document.getElementById('attYear'), msel=document.getElementById('attMonth'), grid=document.getElementById('attList');
  if(!ysel||!msel||!grid) return;
  var scope=_attScopeRecords();
  var years={}; scope.forEach(function(r){ var y=(r.date||'').slice(0,4); if(y) years[y]=true; });
  var cy=String(new Date().getFullYear()); years[cy]=true;
  var yearList=Object.keys(years).sort().reverse();
  var prevY=ysel.value||cy;
  ysel.innerHTML=yearList.map(function(y){ return '<option value="'+y+'">'+y+'년</option>'; }).join('');
  ysel.value = yearList.indexOf(prevY)!==-1 ? prevY : cy;
  if(!msel.value) msel.value=String(new Date().getMonth()+1);
  var ym=ysel.value+'-'+('0'+msel.value).slice(-2);
  var map={};
  scope.forEach(function(r){
    if((r.date||'').slice(0,7)!==ym) return;
    var nm=r.student||'이름없음';
    if(!map[nm]) map[nm]={name:nm, cls:r.className||'', on:0,late:0,abs:0,mk:0};
    if(r.className) map[nm].cls=r.className;
    if(r.attendance==='정시도착') map[nm].on++;
    else if(r.attendance==='결석') map[nm].abs++;
    else if(r.attendance) map[nm].late++;
    if(r.makeup) map[nm].mk++;
  });
  var rows=Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){
    if((a.cls||'')!==(b.cls||'')) return (a.cls||'').localeCompare(b.cls||'');
    return a.name.localeCompare(b.name);
  });
  function badge(label,n,bg,col){ return n>0 ? '<span style="background:'+bg+';color:'+col+';font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px">'+label+' '+n+'</span>' : ''; }
  grid.innerHTML = rows.length ? rows.map(function(r){
    var search=((r.name+' '+r.cls).toLowerCase()).replace(/"/g,'');
    var stu=students.find(function(x){ return x.name===r.name; });
    var sid=stu?stu.id:'';
    var badges=[badge('출',r.on,'#dcfce7','#16a34a'),badge('지',r.late,'#fef9c3','#ca8a04'),badge('결',r.abs,'#fee2e2','#dc2626'),badge('보충',r.mk,'#f5f3ff','#7c3aed')].filter(Boolean).join(' ') || '<span style="font-size:11px;color:#cbd5e1">기록 없음</span>';
    var calBtn = sid ? '<button onclick="openStudentCalendar(\''+sid+'\')" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">달력</button>' : '';
    return '<div data-att-row data-search="'+search+'" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:8px">'
      + '<div style="min-width:0">'
      + '<div style="font-weight:700;color:#1e293b;font-size:13px">'+escapeNotice(r.name)+(r.cls?' <span style="font-size:11px;color:#64748b;background:#f1f5f9;padding:1px 7px;border-radius:4px;font-weight:600">'+escapeNotice(r.cls)+'</span>':'')+'</div>'
      + '<div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">'+badges+'</div>'
      + '</div>' + calBtn + '</div>';
  }).join('') : '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px">해당 월 출결 기록이 없습니다</div>';
}
function filterAttList() {
  var q=((document.getElementById('attSearch')||{value:''}).value||'').trim().toLowerCase();
  Array.prototype.forEach.call(document.querySelectorAll('#attList [data-att-row]'), function(el){
    var t=el.getAttribute('data-search')||'';
    el.style.display=(!q||t.indexOf(q)!==-1)?'flex':'none';
  });
}
var _calName=null, _calY=null, _calM=null, _calByDate={};
function openStudentCalendar(id) {
  var s=students.find(function(x){ return String(x.id)===String(id); });
  if(!s){ showToast('학생 정보를 찾을 수 없습니다.','error'); return; }
  _calName=s.name;
  var ysel=document.getElementById('attYear'), msel=document.getElementById('attMonth');
  if(ysel&&ysel.value&&msel&&msel.value){ _calY=parseInt(ysel.value,10); _calM=parseInt(msel.value,10); }
  else { var d=new Date(); _calY=d.getFullYear(); _calM=d.getMonth()+1; }
  document.getElementById('calStudentName').textContent=s.name+(s.className?' · '+s.className:'');
  document.getElementById('studentCalendarModal').style.display='flex';
  navOpenOverlay('studentCalendarModal');
  drawCalendar();
}
function closeStudentCalendar() {
  var m=document.getElementById('studentCalendarModal');
  if(m) m.style.display='none';
  navOnOverlayClosed('studentCalendarModal');
}
function calNavMonth(delta) {
  _calM+=delta;
  if(_calM<1){ _calM=12; _calY--; }
  else if(_calM>12){ _calM=1; _calY++; }
  drawCalendar();
}
function drawCalendar() {
  var grid=document.getElementById('calGrid'), label=document.getElementById('calMonthLabel');
  if(!grid) return;
  var ym=_calY+'-'+('0'+_calM).slice(-2);
  if(label) label.textContent=_calY+'년 '+_calM+'월';
  var _dd=document.getElementById('calDayDetail'); if(_dd){ _dd.style.display='none'; _dd.innerHTML=''; } // 월 이동/재그리기 시 상세 닫기
  var scope=_attScopeRecords();
  var byDate={};
  scope.forEach(function(r){
    if(r.student!==_calName) return;
    if((r.date||'').slice(0,7)!==ym) return;
    var d=(r.date||'').slice(8,10);
    byDate[d]={att:r.attendance||'', mk:!!r.makeup, count:(r.count||(r.sessions?r.sessions.length:0)||0), sessions:(r.sessions||[])};
  });
  _calByDate=byDate;
  var firstDow=new Date(_calY,_calM-1,1).getDay();
  var days=new Date(_calY,_calM,0).getDate();
  var wk=['일','월','화','수','목','금','토'];
  var html='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">';
  html+=wk.map(function(w,i){ return '<div style="text-align:center;font-size:10px;font-weight:700;color:'+(i===0?'#dc2626':(i===6?'#2563eb':'#94a3b8'))+';padding:2px 0">'+w+'</div>'; }).join('');
  for(var b=0;b<firstDow;b++) html+='<div></div>';
  var attColor={'정시도착':['#dcfce7','#16a34a'],'15분이내':['#fef9c3','#ca8a04'],'15분이상':['#fef9c3','#ca8a04'],'결석':['#fee2e2','#dc2626']};
  for(var day=1;day<=days;day++){
    var dd=('0'+day).slice(-2);
    var info=byDate[dd];
    var bg='#fff', col='#334155', bd='#e2e8f0';
    if(info&&info.att&&attColor[info.att]){ bg=attColor[info.att][0]; col=attColor[info.att][1]; bd=bg; }
    var mk=(info&&info.mk);
    if(mk && !(info&&info.att&&attColor[info.att])){ bg='#f5f3ff'; col='#7c3aed'; }
    var _bd2=mk?'2px solid #7c3aed':('1px solid '+bd);
    var dot=mk?'<span style="position:absolute;right:3px;bottom:3px;width:7px;height:7px;border-radius:50%;background:#7c3aed;box-shadow:0 0 0 1.5px #fff"></span>':'';
    var cnt=(info&&info.count)||0;
    var cntBadge=(cnt>=2)?'<span style="position:absolute;top:1px;right:2px;font-size:9px;font-weight:800;color:#0891b2;background:#fff;border:1px solid #a5f3fc;border-radius:8px;padding:0 3px;line-height:1.5">'+cnt+'</span>':'';
    var ttl='';
    if(info&&info.sessions&&info.sessions.length){
      ttl=info.sessions.map(function(sx){ return (sx.teacher||'')+' '+(sx.status||'')+(sx.makeup?' ·보충':'')+(sx.session&&sx.session!=='정규'?(' ('+sx.session+')'):''); }).join('\n').replace(/"/g,'');
    }
    var clickable=(info&&info.sessions&&info.sessions.length)?(' onclick="showCalDay(\''+dd+'\')"'):'';
    var cur=(clickable?'cursor:pointer;':'');
    html+='<div'+clickable+' title="'+ttl+'" style="'+cur+'position:relative;aspect-ratio:1;min-height:30px;border:'+_bd2+';border-radius:6px;background:'+bg+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:'+col+'">'+day+dot+cntBadge+'</div>';
  }
  html+='</div>';
  grid.innerHTML=html;
}

// 달력 날짜 탭 → 그날 선생님별 출결 상세 펼치기 (맥/모바일 hover 대체)
function showCalDay(dd){
  var el=document.getElementById('calDayDetail'); if(!el) return;
  var info=_calByDate[dd];
  if(!info || !(info.sessions && info.sessions.length)){ el.style.display='none'; el.innerHTML=''; return; }
  var title=_calM+'월 '+parseInt(dd,10)+'일';
  var rows=info.sessions.map(function(sx){
    var st=sx.status||'';
    var color = st==='정시도착' ? '#16a34a' : (st==='결석' ? '#dc2626' : (st ? '#ca8a04' : '#64748b'));
    var lbl = st || '기록';
    var extra = (sx.makeup?' · 보충':'') + (sx.session && sx.session!=='정규' ? (' · '+sx.session) : '');
    return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid #eef2f7">'
      + '<span style="font-size:12px;color:#475569;font-weight:600">'+escapeNotice(sx.teacher||'-')+'</span>'
      + '<span style="font-size:12px;font-weight:700;color:'+color+'">'+escapeNotice(lbl)+escapeNotice(extra)+'</span>'
      + '</div>';
  }).join('');
  el.innerHTML='<div style="font-size:12px;font-weight:800;color:#0891b2;margin-bottom:2px">'+title+' · 수업 '+info.sessions.length+'회</div>'+rows;
  el.style.display='block';
}
