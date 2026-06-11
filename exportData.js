// EduNote 데이터 내보내기/가져오기 모듈 (exportData.js)
// classic <script> — messages.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// CSV: exportData/importData(과제), exportStudents/importStudents(학생).
// Excel(SheetJS): loadSheetJS(동적 로드), exportDataXlsx/importDataXlsx(과제),
//   exportStudentsXlsx/downloadStudentTemplate/importStudentsXlsx(학생). top-level → window 전역.
// 런타임 의존(window 전역): records/students/normalizeRecord/persist/persistStudents/renderList/
//   renderStudents/updateClassSelect/showToast/showLoading/stuKey 등, window.XLSX(loadSheetJS 로드), fb 래퍼.
// 잔류(모놀리스): deleteAllStudents(학생 일괄삭제, 비-export).
// ⚠ 버그 백로그 Bug B(오늘의학습 전용필드) 의 export/import 매핑 수정은 이제 이 파일(exportDataXlsx/importDataXlsx)에서.
// 주의: 다른 파일에서 재정의 금지.

function exportData() {
  var myRecs = records.filter(function(r){ return isOwnerOrAdmin() || r.teacher === currentUser; });
  if (myRecs.length === 0) { showToast('저장할 기록이 없습니다.', 'error'); return; }
  const json = JSON.stringify(myRecs, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const _sName = (currentSchoolProfile && currentSchoolProfile.name) ? currentSchoolProfile.name.replace(/[^가-힣A-Za-z0-9]/g,'') : 'EduNote';
  const fname = _sName + '_목록_' + new Date().toLocaleDateString('ko-KR').replace(/[.] /g,'').replace('.','') + '.json';
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({
      suggestedName: fname,
      startIn: 'desktop',
      types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
    }).then(async handle => {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToast('목록 저장 완료!');
    }).catch(e => { if (e.name !== 'AbortError') showToast('저장 실패.', 'error'); });
  } else {
    const a = document.createElement('a');
    a.download = fname;
    a.href = URL.createObjectURL(blob);
    a.click();
    showToast('목록 저장 완료!');
  }
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const raw = JSON.parse(ev.target.result);
      if (!Array.isArray(raw)) throw new Error('형식 오류');
      // 모든 필드 기본값 보장
      const data = raw.map(function(r){
        var rec = normalizeRec(r);
        // teacher 없으면 현재 로그인한 선생님으로 설정
        if (!rec.teacher) rec.teacher = currentUser;
        return rec;
      });
      if (records.length > 0) {
        if (!confirm('기존 기록에 추가할까요?\n(취소하면 기존 기록을 덮어씁니다)')) {
          records = data;
        } else {
          const existingIds = new Set(records.map(r => r.id));
          const newRecs = data.map(r => existingIds.has(r.id) ? {...r, id: Date.now() + Math.random()} : r);
          records = [...records, ...newRecs];
        }
      } else {
        records = data;
      }
      persist();
      renderAll();
      switchTab('list');
      // Firestore에 저장
      if (window.fbDb && currentSchool && currentSchool.length > 10) {
        showLoading(true);
        window._importing = true;
        Promise.all(data.map(function(rec) {
          var ref = window.fbDoc(window.fbDb, 'users', currentSchool, 'records', String(rec.id));
          return window.fbSetDoc(ref, rec);
        })).then(function(){
          showToast(data.length + '개 기록을 불러왔습니다!');
        }).catch(function(){
          showToast('일부 저장 실패.', 'error');
        }).finally(function(){
          showLoading(false);
          window._importing = false;
        });
      } else {
        showToast(data.length + '개 기록을 불러왔습니다!');
      }
    } catch(e) {
      showToast('파일을 읽을 수 없습니다.', 'error');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ── 학생 관리 ──
// 전역 상태(students) → state.js

// 학생 저장: 학원 공유 풀 schools/{schoolId}/students (원장만 쓰기 가능)
function persistStudents(){
  localStorage.setItem(stuKey(),JSON.stringify(students));
  // 진단: 저장 조건 확인
  if (!window.fbDb) { console.warn('[학생저장] fbDb 없음'); updateClassSelect(); return; }
  if (currentRole !== 'owner' && currentRole !== 'superadmin') {
    console.warn('[학생저장] 권한 아님. currentRole=', currentRole);
    updateClassSelect(); return;
  }
  if (!currentSchoolId) {
    console.warn('[학생저장] currentSchoolId 없음');
    showToast('학원 ID가 없어 저장 못 했습니다. (콘솔 확인)', 'error');
    updateClassSelect(); return;
  }
  console.log('[학생저장] 시작. schoolId=', currentSchoolId, 'role=', currentRole, '학생수=', students.length);

  // 저장 전에 학원 문서의 ownerUid 보장 (규칙 통과를 위해)
  var myUid = (window.fbAuth && window.fbAuth.currentUser) ? window.fbAuth.currentUser.uid : currentSchool;
  var schoolRef = window.fbDoc(window.fbDb, 'schools', currentSchoolId);
  window.fbGetDoc(schoolRef).then(function(snap){
    if (snap.exists() && snap.data().ownerUid === myUid) {
      // 이미 올바름 → 바로 저장
      return doSaveStudents();
    }
    // ownerUid 누락/불일치 → 먼저 채우고 저장
    console.log('[학생저장] ownerUid 보정 시도. 현재=', snap.exists() ? snap.data().ownerUid : '(문서없음)', '→', myUid);
    return window.fbUpdateDoc(schoolRef, { ownerUid: myUid })
      .then(function(){ return doSaveStudents(); })
      .catch(function(err){
        console.error('[학생저장] ownerUid 보정 실패', err && err.code, err && err.message);
        showToast('학원 권한 설정 실패: ' + (err && (err.code||err.message) || ''), 'error');
      });
  }).catch(function(err){
    console.error('[학생저장] 학원 문서 읽기 실패', err && err.code, err && err.message);
    // 그래도 저장 시도
    doSaveStudents();
  });

  function doSaveStudents() {
    students.forEach(function(s) {
      var ref = window.fbDoc(window.fbDb, 'schools', currentSchoolId, 'students', String(s.id));
      window.fbSetDoc(ref, s).then(function(){
        // 성공
      }).catch(function(err){
        console.error('[학생저장 실패]', s.name, err && err.code, err && err.message);
        showToast('저장 실패: ' + (err && (err.code||err.message) || '알 수 없음'), 'error');
      });
    });
  }
  updateClassSelect();
}

// ── 학원 학생/선생님 로드 → schoolStore.js ──



// uid → 선생님 이름
function phoneLast4(p){ var d=String(p||'').replace(/\D/g,''); return d.length>=4 ? d.slice(-4) : ''; }
function _tMeta(){ return (currentSchoolProfile && currentSchoolProfile.teacherMeta) || {}; }
function teacherMetaFor(uid){ var m=_tMeta()[uid]||{}; return { phone: m.phone||'', code4: m.code4||'' }; }
function _teacherEffPhone(t){ var m=teacherMetaFor(t.uid); return m.phone || t.phone || ''; }
function _teacherCode(t){ return teacherMetaFor(t.uid).code4 || ''; }
function teacherLimitNum(){
  var L = currentSchoolProfile && currentSchoolProfile.teacherLimit;
  if (typeof L==='number') return L;
  var plan = (currentSchoolProfile && currentSchoolProfile.plan) || 'free';
  return (typeof PLANS!=='undefined' && PLANS[plan] && PLANS[plan].teacherLimit) || 10;
}
function _activeTeachers(){ return (_schoolTeachers||[]).filter(function(t){ return t.status!=='inactive'; }); }
function _inactiveTeachers(){ return (_schoolTeachers||[]).filter(function(t){ return t.status==='inactive'; }); }
function _escAttr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function _tByName(a,b){ return String(a.name||'').localeCompare(String(b.name||''),'ko'); }

window._teacherEditUid = null;
window._teacherInactiveOpen = false;

function renderTeacherRoster(){
  if (typeof loadSchoolTeachers==='function') loadSchoolTeachers().then(_drawTeacherRoster);
  else _drawTeacherRoster();
}
function filterTeacherRoster(){ _drawTeacherRoster(); }
function toggleInactiveTeachers(){ window._teacherInactiveOpen=!window._teacherInactiveOpen; _drawTeacherRoster(); }
function startTeacherEdit(uid){ window._teacherEditUid=uid; _drawTeacherRoster(); }
function cancelTeacherEdit(){ window._teacherEditUid=null; _drawTeacherRoster(); }

function _drawTeacherRoster(){
  var el=document.getElementById('teacherRosterList'); if(!el) return;
  var q=((document.getElementById('teacherSearch')||{}).value||'').trim().toLowerCase();
  var active=_activeTeachers().slice().sort(_tByName);
  var inactive=_inactiveTeachers().slice().sort(_tByName);
  var stuCodes={}; (typeof students!=='undefined'&&students?students:[]).forEach(function(s){ if(s&&s.code4) stuCodes[String(s.code4)]=true; });
  var tCount={}; active.forEach(function(t){ var c=_teacherCode(t); if(c) tCount[c]=(tCount[c]||0)+1; });
  function match(t){ if(!q) return true; var hay=((t.name||'')+' '+_teacherEffPhone(t)+' '+_teacherCode(t)).toLowerCase(); return hay.indexOf(q)>=0; }

  var limit=teacherLimitNum();
  var topHtml='<div style="display:flex;align-items:center;justify-content:space-between;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 14px;margin-bottom:12px">'
    +'<span style="font-size:12px;font-weight:700;color:#0369a1">활성 선생님</span>'
    +'<span style="font-size:14px;font-weight:900;color:#0891b2">'+active.length+' <span style="font-size:12px;color:#94a3b8;font-weight:700">/ '+limit+'명</span></span>'
    +'</div>';

  var aRows=active.filter(match);
  var aHtml = aRows.length ? aRows.map(function(t){ return _teacherCard(t,false,stuCodes,tCount); }).join('')
    : '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px">'+(q?'검색 결과가 없습니다.':'활성 선생님이 없습니다.')+'</div>';

  var iRows=inactive.filter(match);
  var inacHtml='<div style="margin-top:14px;border-top:1px dashed #e2e8f0;padding-top:12px">'
    +'<button onclick="toggleInactiveTeachers()" style="width:100%;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px 12px;cursor:pointer;font-family:inherit">'
    +'<span style="font-size:12px;font-weight:700;color:#64748b">퇴원 선생님 ('+inactive.length+')</span>'
    +'<span style="font-size:11px;color:#94a3b8">'+(window._teacherInactiveOpen?'감추기 \u25B2':'펼치기 \u25BC')+'</span></button>'
    + (window._teacherInactiveOpen ? '<div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">'
        + (iRows.length ? iRows.map(function(t){ return _teacherCard(t,true,stuCodes,tCount); }).join('')
                        : '<div style="text-align:center;color:#cbd5e1;padding:14px;font-size:12px">'+(q?'검색 결과 없음':'퇴원 선생님이 없습니다.')+'</div>')
        + '</div>' : '')
    +'</div>';

  el.innerHTML = topHtml + '<div style="display:flex;flex-direction:column;gap:8px">'+aHtml+'</div>' + inacHtml;
}

function _teacherCard(t,isInactive,stuCodes,tCount){
  var editing=(window._teacherEditUid===t.uid);
  var phone=_teacherEffPhone(t), code=_teacherCode(t);
  var dup=!isInactive && code && (stuCodes[code] || tCount[code]>1);
  if(editing){
    return '<div style="border:1.5px solid #0891b2;border-radius:10px;padding:12px;background:#f0fdff">'
      +'<div style="font-size:14px;font-weight:800;color:#1e293b;margin-bottom:8px">'+escapeNotice(t.name||'')+'</div>'
      +'<label style="font-size:11px;color:#64748b;font-weight:700">휴대폰</label>'
      +'<input id="tedit-phone-'+t.uid+'" value="'+_escAttr(phone)+'" placeholder="예: 010-1234-5678" style="width:100%;box-sizing:border-box;padding:8px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;margin:3px 0 8px">'
      +'<label style="font-size:11px;color:#64748b;font-weight:700">출퇴근 코드(4자리)</label>'
      +'<input id="tedit-code-'+t.uid+'" value="'+_escAttr(code)+'" maxlength="4" inputmode="numeric" placeholder="0000" style="width:100%;box-sizing:border-box;padding:8px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;margin:3px 0 10px">'
      +'<div style="display:flex;gap:6px">'
      +'<button onclick="saveTeacherEdit(\''+t.uid+'\')" style="flex:1;background:linear-gradient(135deg,#0891b2,#0e7490);color:#fff;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit">저장</button>'
      +'<button onclick="cancelTeacherEdit()" style="flex:1;background:#f1f5f9;color:#64748b;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">취소</button>'
      +'</div></div>';
  }
  var codeHtml=code
    ? '<span style="font-family:monospace;font-size:15px;font-weight:800;letter-spacing:2px;color:'+(dup?'#dc2626':'#0891b2')+';background:'+(dup?'#fef2f2':'#ecfeff')+';border-radius:7px;padding:3px 10px">'+code+'</span>'
    : '<span style="font-size:12px;color:#94a3b8">코드 미설정</span>';
  var actions=isInactive
    ? '<button onclick="setTeacherActive(\''+t.uid+'\',true)" style="background:#dcfce7;color:#15803d;border:none;border-radius:7px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">활성화</button>'
    : '<button onclick="startTeacherEdit(\''+t.uid+'\')" style="background:#e0f2fe;color:#0369a1;border:none;border-radius:7px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">수정</button>'
      +'<button onclick="setTeacherActive(\''+t.uid+'\',false)" style="background:#fff7ed;color:#c2410c;border:none;border-radius:7px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">퇴원</button>';
  return '<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;border:1px solid #e2e8f0;border-radius:10px;'+(isInactive?'opacity:.7;background:#fafafa':'')+'">'
    +'<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:800;color:#1e293b">'+escapeNotice(t.name||'')+'</div>'
    +'<div style="font-size:12px;color:#64748b;margin-top:2px">'+(phone?escapeNotice(phone):'휴대폰 미설정')+'</div>'
    +(dup?'<div style="font-size:11px;color:#dc2626;margin-top:3px;font-weight:600">\u26A0 코드 중복 — 키오스크 인식 불가</div>':'')+'</div>'
    +'<div style="text-align:center;flex-shrink:0">'+codeHtml+'</div>'
    +'<div style="display:flex;gap:5px;flex-shrink:0">'+actions+'</div>'
    +'</div>';
}

function saveTeacherEdit(uid){
  var phone=((document.getElementById('tedit-phone-'+uid)||{}).value||'').trim();
  var code=((document.getElementById('tedit-code-'+uid)||{}).value||'').trim();
  if(code){
    if(!/^\d{4}$/.test(code)){ showToast('출퇴근 코드는 4자리 숫자로 입력해주세요.','error'); return; }
    var stuDup=(typeof students!=='undefined'&&students?students:[]).some(function(s){ return s&&String(s.code4)===code; });
    if(stuDup){ showToast('이미 학생이 사용 중인 코드입니다.','error'); return; }
    var tDup=(_schoolTeachers||[]).some(function(t){ return t.uid!==uid && _teacherCode(t)===code; });
    if(tDup){ showToast('다른 선생님이 사용 중인 코드입니다.','error'); return; }
  }
  saveTeacherMeta(uid, { phone: phone, code4: code });
}
function saveTeacherMeta(uid, meta){
  if(!window.fbDb || !currentSchoolId){ showToast('저장 실패: 학원 정보를 찾을 수 없습니다.','error'); return; }
  var val={ phone: meta.phone||'', code4: meta.code4||'' };
  var update={}; update['teacherMeta.'+uid]=val;
  window.fbUpdateDoc(window.fbDoc(window.fbDb,'schools',currentSchoolId), update).then(function(){
    if(!currentSchoolProfile.teacherMeta) currentSchoolProfile.teacherMeta={};
    currentSchoolProfile.teacherMeta[uid]=val;
    window._teacherEditUid=null;
    showToast('저장되었습니다.');
    _drawTeacherRoster();
  }).catch(function(e){ showToast('저장 실패: '+((e&&(e.code||e.message))||''),'error'); });
}
function setTeacherActive(uid, active){
  var t=(_schoolTeachers||[]).find(function(x){return x.uid===uid;});
  var nm=t?t.name:'선생님';
  if(!active){ if(!confirm(nm+' 선생님을 퇴원(비활성) 처리할까요?\n로그인이 차단되고 정원에서 제외됩니다. (삭제 아님 · 다시 활성화 가능)')) return; }
  else { if(!confirm(nm+' 선생님을 다시 활성화할까요?')) return; }
  if(!window.fbCallable){ showToast('서버 연결이 필요합니다.','error'); return; }
  showLoading(true);
  window.fbCallable('ownerSetTeacherActive')({ teacherUid: uid, active: active }).then(function(){
    showLoading(false);
    if(t) t.status = active?'active':'inactive';
    showToast(nm+' 선생님 '+(active?'활성화':'퇴원 처리')+' 완료');
    _drawTeacherRoster();
  }).catch(function(e){
    showLoading(false);
    showToast(((e&&(e.message||e.code))||'')||'처리에 실패했습니다.','error');
  });
}
function teacherNameByUid(uid) {
  var t = _schoolTeachers.find(function(x){ return x.uid === uid; });
  return t ? t.name : '(알 수 없음)';
}

function exportStudents() {
  if (currentRole !== 'owner' && currentRole !== 'superadmin') { showToast('원장만 사용할 수 있습니다.', 'error'); return; }
  if (students.length === 0) { showToast('저장할 학생이 없습니다.', 'error'); return; }
  var json = JSON.stringify(students, null, 2);
  var blob = new Blob([json], {type:'application/json'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url;
  a.download = (currentSchoolProfile && currentSchoolProfile.name || '학원') + '_학생목록.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('학생목록 저장 완료!');
}

function importStudents(e) {
  if (currentRole !== 'owner' && currentRole !== 'superadmin') { showToast('원장만 사용할 수 있습니다.', 'error'); e.target.value=''; return; }
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) throw new Error('형식 오류');
      var added = 0;
      data.forEach(function(s) {
        if (!s.name) return;
        if (students.find(function(ex){ return ex.name === s.name && ex.className === (s.className||''); })) return;
        students.push({
          id: Date.now() + '_' + Math.random().toString(36).slice(2,8),
          className: s.className || '',
          name: s.name,
          grade: s.grade || '',
          phone: s.phone || '',
          parent: s.parent || '',
          assignedTo: [],
          createdAt: new Date().toISOString()
        });
        added++;
      });
      if (added > 0) {
        persistStudents();
        renderStudents();
        updateStudentFilter();
        showToast('' + added + '명 불러오기 완료!');
      } else {
        showToast('이미 등록된 학생들입니다.', 'info');
      }
    } catch(err) {
      showToast('파일 형식이 맞지 않습니다.', 'error');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ── SheetJS 동적 로드 ──────────────────────────────────────
function loadSheetJS(cb) {
  if (window.XLSX) { cb(); return; }
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = cb;
  s.onerror = function(){ showToast('라이브러리 로드 실패. 인터넷 연결을 확인해주세요.', 'error'); };
  document.head.appendChild(s);
}

// ── 목록 엑셀 저장 ────────────────────────────────────────
function exportDataXlsx() {
  var myRecs = records.filter(function(r){ return isOwnerOrAdmin() || r.teacher === currentUser; });
  if (myRecs.length === 0) { showToast('저장할 기록이 없습니다.', 'error'); return; }
  loadSheetJS(function() {
    var COMP = {'-1':'', 0:'미완료', 25:'시작함', 50:'절반', 75:'거의', 100:'완료'};
    var rows = myRecs.map(function(r) {
      return {
        '날짜': r.date || '',
        '선생님': r.teacher || '',
        '반': r.className || '',
        '학생': r.student || '',
        '지각정도': r.attendance || '',
        '수업태도': r.attitude || '',
        '단어시험': r.wordTest || '',
        '단어점수': r.wordScore || '',
        '지난과제1': r.lastHomework || '',
        '이행도1': COMP[String(r.lastCompletion)] || '',
        '지난과제2': r.lastHomework2 || '',
        '이행도2': COMP[String(r.lastCompletion2)] || '',
        '지난과제3': r.lastHomework3 || '',
        '이행도3': COMP[String(r.lastCompletion3)] || '',
        '지난과제4': r.lastHomework4 || '',
        '이행도4': COMP[String(r.lastCompletion4)] || '',
        '지난과제5': r.lastHomework5 || '',
        '이행도5': COMP[String(r.lastCompletion5)] || '',
        '수업내용': r.todayContent || '',
        '독해': r.reading || '', '독해이행': COMP[String(r.readingComp)] || '',
        '문법': r.grammar || '', '문법이행': COMP[String(r.grammarComp)] || '',
        '독해1': r.reading1||'', '독해1이행': COMP[String(r.reading1Comp)]||'',
        '문법1': r.grammar1||'', '문법1이행': COMP[String(r.grammar1Comp)]||'',
        '시험1': r.exam1||'', '시험1이행': COMP[String(r.exam1Comp)]||'',
        '독해2': r.reading2||'', '독해2이행': COMP[String(r.reading2Comp)]||'',
        '문법2': r.grammar2||'', '문법2이행': COMP[String(r.grammar2Comp)]||'',
        '시험2': r.exam2||'', '시험2이행': COMP[String(r.exam2Comp)]||'',
        '독해3': r.reading3||'', '독해3이행': COMP[String(r.reading3Comp)]||'',
        '문법3': r.grammar3||'', '문법3이행': COMP[String(r.grammar3Comp)]||'',
        '시험3': r.exam3||'', '시험3이행': COMP[String(r.exam3Comp)]||'',
        '독해4': r.reading4||'', '독해4이행': COMP[String(r.reading4Comp)]||'',
        '문법4': r.grammar4||'', '문법4이행': COMP[String(r.grammar4Comp)]||'',
        '시험4': r.exam4||'', '시험4이행': COMP[String(r.exam4Comp)]||'',
        '독해5': r.reading5||'', '독해5이행': COMP[String(r.reading5Comp)]||'',
        '문법5': r.grammar5||'', '문법5이행': COMP[String(r.grammar5Comp)]||'',
        '시험5': r.exam5||'', '시험5이행': COMP[String(r.exam5Comp)]||'',
        '기타1': r.etc1||'', '기타1이행': COMP[String(r.etc1Comp)]||'',
        '기타2': r.etc2||'', '기타2이행': COMP[String(r.etc2Comp)]||'',
        '기타3': r.etc3||'', '기타3이행': COMP[String(r.etc3Comp)]||'',
        '기타4': r.etc4||'', '기타4이행': COMP[String(r.etc4Comp)]||'',
        '기타5': r.etc5||'', '기타5이행': COMP[String(r.etc5Comp)]||'',
        '오늘과제1': r.homework||'', '오늘과제2': r.homework2||'',
        '오늘과제3': r.homework3||'', '오늘과제4': r.homework4||'',
        '오늘과제5': r.homework5||'',
        '오늘과제전체': r.homeworksJson||'',
        '특이사항': r.memo||'',
      };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '수업기록');
    var _sName = (currentSchoolProfile && currentSchoolProfile.name) ? currentSchoolProfile.name.replace(/[^가-힣A-Za-z0-9]/g,'') : 'EduNote';
    var fname = _sName + '_수업기록_' + new Date().toLocaleDateString('ko-KR').replace(/[.\s]/g,'') + '.xlsx';
    XLSX.writeFile(wb, fname);
    showToast('엑셀 저장 완료!');
  });
}

// ── 목록 엑셀 불러오기 ─────────────────────────────────────
function importDataXlsx(e) {
  var file = e.target.files[0];
  if (!file) return;
  loadSheetJS(function() {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var wb = XLSX.read(ev.target.result, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        var COMP_REV = {'미완료':0, '시작함':25, '절반':50, '거의':75, '완료':100};
        var data = rows.map(function(row) {
          return normalizeRec({
            teacher:       row['선생님'] || currentUser,
            date:          row['날짜'] ? String(row['날짜']) : '',
            className:     row['반'] || '',
            student:       row['학생'] || '',
            attendance:    row['지각정도'] || '',
            attitude:      row['수업태도'] || '',
            wordTest:      row['단어시험'] || '',
            wordScore:     row['단어점수'] || '',
            lastHomework:  row['지난과제1'] || '',
            lastCompletion: COMP_REV[row['이행도1']] !== undefined ? COMP_REV[row['이행도1']] : -1,
            lastHomework2: row['지난과제2'] || '',
            lastCompletion2: COMP_REV[row['이행도2']] !== undefined ? COMP_REV[row['이행도2']] : -1,
            lastHomework3: row['지난과제3'] || '',
            lastCompletion3: COMP_REV[row['이행도3']] !== undefined ? COMP_REV[row['이행도3']] : -1,
            lastHomework4: row['지난과제4'] || '',
            lastCompletion4: COMP_REV[row['이행도4']] !== undefined ? COMP_REV[row['이행도4']] : -1,
            lastHomework5: row['지난과제5'] || '',
            lastCompletion5: COMP_REV[row['이행도5']] !== undefined ? COMP_REV[row['이행도5']] : -1,
            todayContent:  row['수업내용'] || '',
            reading:       row['독해'] || '',      readingComp:  COMP_REV[row['독해이행']]  !== undefined ? COMP_REV[row['독해이행']]  : 0,
            grammar:       row['문법'] || '',      grammarComp:  COMP_REV[row['문법이행']]  !== undefined ? COMP_REV[row['문법이행']]  : 0,
            reading1:      row['독해1'] || '',     reading1Comp: COMP_REV[row['독해1이행']] !== undefined ? COMP_REV[row['독해1이행']] : 0,
            grammar1:      row['문법1'] || '',     grammar1Comp: COMP_REV[row['문법1이행']] !== undefined ? COMP_REV[row['문법1이행']] : 0,
            exam1:         row['시험1'] || '',     exam1Comp:    COMP_REV[row['시험1이행']] !== undefined ? COMP_REV[row['시험1이행']] : 0,
            reading2:      row['독해2'] || '',     reading2Comp: COMP_REV[row['독해2이행']] !== undefined ? COMP_REV[row['독해2이행']] : 0,
            grammar2:      row['문법2'] || '',     grammar2Comp: COMP_REV[row['문법2이행']] !== undefined ? COMP_REV[row['문법2이행']] : 0,
            exam2:         row['시험2'] || '',     exam2Comp:    COMP_REV[row['시험2이행']] !== undefined ? COMP_REV[row['시험2이행']] : 0,
            reading3:      row['독해3'] || '',     reading3Comp: COMP_REV[row['독해3이행']] !== undefined ? COMP_REV[row['독해3이행']] : 0,
            grammar3:      row['문법3'] || '',     grammar3Comp: COMP_REV[row['문법3이행']] !== undefined ? COMP_REV[row['문법3이행']] : 0,
            exam3:         row['시험3'] || '',     exam3Comp:    COMP_REV[row['시험3이행']] !== undefined ? COMP_REV[row['시험3이행']] : 0,
            reading4:      row['독해4'] || '',     reading4Comp: COMP_REV[row['독해4이행']] !== undefined ? COMP_REV[row['독해4이행']] : 0,
            grammar4:      row['문법4'] || '',     grammar4Comp: COMP_REV[row['문법4이행']] !== undefined ? COMP_REV[row['문법4이행']] : 0,
            exam4:         row['시험4'] || '',     exam4Comp:    COMP_REV[row['시험4이행']] !== undefined ? COMP_REV[row['시험4이행']] : 0,
            reading5:      row['독해5'] || '',     reading5Comp: COMP_REV[row['독해5이행']] !== undefined ? COMP_REV[row['독해5이행']] : 0,
            grammar5:      row['문법5'] || '',     grammar5Comp: COMP_REV[row['문법5이행']] !== undefined ? COMP_REV[row['문법5이행']] : 0,
            exam5:         row['시험5'] || '',     exam5Comp:    COMP_REV[row['시험5이행']] !== undefined ? COMP_REV[row['시험5이행']] : 0,
            etc1:          row['기타1'] || '',     etc1Comp:     COMP_REV[row['기타1이행']] !== undefined ? COMP_REV[row['기타1이행']] : 0,
            etc2:          row['기타2'] || '',     etc2Comp:     COMP_REV[row['기타2이행']] !== undefined ? COMP_REV[row['기타2이행']] : 0,
            etc3:          row['기타3'] || '',     etc3Comp:     COMP_REV[row['기타3이행']] !== undefined ? COMP_REV[row['기타3이행']] : 0,
            etc4:          row['기타4'] || '',     etc4Comp:     COMP_REV[row['기타4이행']] !== undefined ? COMP_REV[row['기타4이행']] : 0,
            etc5:          row['기타5'] || '',     etc5Comp:     COMP_REV[row['기타5이행']] !== undefined ? COMP_REV[row['기타5이행']] : 0,
            homework:      row['오늘과제1'] || '', homework2: row['오늘과제2'] || '',
            homework3:     row['오늘과제3'] || '', homework4: row['오늘과제4'] || '',
            homework5:     row['오늘과제5'] || '',
            homeworksJson: row['오늘과제전체'] || (function(){
              var a = ['오늘과제1','오늘과제2','오늘과제3','오늘과제4','오늘과제5']
                .map(function(k){ return (row[k]||'').trim(); }).filter(function(t){ return t !== ''; });
              return a.length ? JSON.stringify(a) : '';
            })(),
            memo:          row['특이사항'] || '',
          });
        });
        if (data.length === 0) { showToast('불러올 데이터가 없습니다.', 'error'); return; }
        if (records.length > 0) {
          if (!confirm('기존 기록에 추가할까요?\n(취소하면 기존 기록을 덮어씁니다)')) {
            records = data;
          } else {
            var existingIds = new Set(records.map(function(r){ return r.id; }));
            var newRecs = data.map(function(r){ return existingIds.has(r.id) ? Object.assign({}, r, {id: Date.now() + Math.random()}) : r; });
            records = records.concat(newRecs);
          }
        } else {
          records = data;
        }
        persist();
        renderAll();
        switchTab('list');
        if (window.fbDb && currentSchool && currentSchool.length > 10) {
          showLoading(true); window._importing = true;
          Promise.all(data.map(function(rec) {
            return window.fbSetDoc(window.fbDoc(window.fbDb, 'users', currentSchool, 'records', String(rec.id)), rec);
          })).then(function(){ showToast(data.length + '개 기록을 불러왔습니다!'); })
            .catch(function(){ showToast('일부 저장 실패.', 'error'); })
            .finally(function(){ showLoading(false); window._importing = false; });
        } else {
          showToast(data.length + '개 기록을 불러왔습니다!');
        }
      } catch(err) {
        showToast('파일을 읽을 수 없습니다: ' + err.message, 'error');
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── 학생 엑셀 저장 ─────────────────────────────────────────
function exportStudentsXlsx() {
  if (currentRole !== 'owner' && currentRole !== 'superadmin') { showToast('원장만 사용할 수 있습니다.', 'error'); return; }
  var myStudents = students;
  if (myStudents.length === 0) { showToast('저장할 학생이 없습니다.', 'error'); return; }
  loadSheetJS(function() {
    var rows = myStudents.map(function(s) {
      return {
        '반':       s.className || '',
        '이름':     s.name      || '',
        '학년':     s.grade     || '',
        '학생번호': s.phone     || '',
        '학부모번호': s.parent  || '',
      };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '학생목록');
    var fname = (currentUser || 'edunote') + '_학생목록.xlsx';
    XLSX.writeFile(wb, fname);
    showToast('학생목록 저장 완료!');
  });
}

// ── 학생 엑셀 양식 다운로드 (C) ─────────────────────────────
function downloadStudentTemplate() {
  loadSheetJS(function() {
    var ws = XLSX.utils.aoa_to_sheet([
      ['반','이름','학년','학생번호','학부모번호'],
      ['중1A','홍길동','중1','010-0000-0001','010-1111-1111'],
      ['중1A','이영희','중1','010-0000-0002','010-2222-2222'],
    ]);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '학생목록');
    XLSX.writeFile(wb, '에듀노트_학생목록_양식.xlsx');
    showToast('양식 다운로드 완료! 이 형식에 맞게 입력 후 업로드하세요.');
  });
}

// ── 학생 엑셀 불러오기 (A+C: 스마트 열 인식) ──────────────────
function importStudentsXlsx(e) {
  if (currentRole !== 'owner' && currentRole !== 'superadmin') { showToast('원장만 사용할 수 있습니다.', 'error'); e.target.value=''; return; }
  var file = e.target.files[0];
  if (!file) return;
  loadSheetJS(function() {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var wb = XLSX.read(ev.target.result, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (rows.length === 0) { showToast('데이터가 없습니다.', 'error'); e.target.value=''; return; }

        // ── A: 스마트 열 매칭 ──
        // 각 필드의 가능한 열 제목 변형들
        var colMap = {
          name:   ['이름','학생명','성명','name','학생 이름','학생이름'],
          cls:    ['반','클래스','class','반이름','반 이름','학급'],
          grade:  ['학년','grade','학년도'],
          phone:  ['학생번호','학생전화','학생 전화','학생연락처','학생 연락처','전화','연락처','phone','학생phone'],
          parent: ['학부모번호','부모전화','학부모전화','학부모 전화','학부모연락처','학부모 연락처','부모번호','parent','보호자연락처','보호자 연락처'],
        };
        var headers = Object.keys(rows[0]);
        function findCol(candidates) {
          for (var i=0; i<candidates.length; i++) {
            for (var j=0; j<headers.length; j++) {
              if (headers[j].trim() === candidates[i]) return headers[j];
            }
          }
          // 부분일치도 시도 (예: "학생 전화번호" → "학생전화" 포함)
          for (var i=0; i<candidates.length; i++) {
            for (var j=0; j<headers.length; j++) {
              if (headers[j].includes(candidates[i]) || candidates[i].includes(headers[j].trim())) return headers[j];
            }
          }
          return null;
        }
        var colName   = findCol(colMap.name);
        var colCls    = findCol(colMap.cls);
        var colGrade  = findCol(colMap.grade);
        var colPhone  = findCol(colMap.phone);
        var colParent = findCol(colMap.parent);

        if (!colName) {
          showToast('이름 열을 찾을 수 없습니다. 양식을 다운받아 사용해 주세요.', 'error');
          e.target.value=''; return;
        }

        var added = 0;
        rows.forEach(function(row) {
          var name = String(row[colName] || '').trim();
          var cls  = colCls    ? String(row[colCls]    || '').trim() : '';
          var grade= colGrade  ? String(row[colGrade]  || '').trim() : '';
          var phone= colPhone  ? String(row[colPhone]  || '').trim() : '';
          var par  = colParent ? String(row[colParent] || '').trim() : '';
          if (!name) return;
          if (students.find(function(ex){ return ex.name === name && ex.className === cls; })) return;
          students.push({
            id:        Date.now() + '_' + Math.random().toString(36).slice(2,8),
            className: cls, name: name, grade: grade,
            phone: phone, parent: par,
            assignedTo: [], createdAt: new Date().toISOString()
          });
          added++;
        });
        if (added > 0) {
          persistStudents(); renderStudents(); updateStudentFilter();
          showToast(added + '명 불러오기 완료! (인식된 열: 이름=' + colName + (colCls?'/반='+colCls:'') + ')');
        } else {
          showToast('이미 등록된 학생들이거나 이름 데이터가 없습니다.', 'info');
        }
      } catch(err) {
        showToast('파일을 읽을 수 없습니다: ' + err.message, 'error');
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  });
}

// 출결코드(4자리 숫자) 유효성/중복 헬퍼
