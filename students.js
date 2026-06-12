// EduNote 학생/반 관리 + 선생님 배정 모듈 (students.js)
// classic <script> — exportData.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// 학생 CRUD·코드중복검사·레벨필터·학생카드, 학생↔선생님 배정(원장 전용).
// 상태 var(window 전역): _assignStudentId/_stuLevelFilter(모듈 전용), _schoolTeachers(학원 선생님 캐시 — schoolStore/모놀리스 공유, var 전역이라 안전).
// 정의: code4Taken/checkNewStudentCode/checkEditStudentCode/addStudent/deleteStudent/renderStudents/toggleStuGroup/
//   openAssignStudent/drawAssignTeacherList/closeAssignStudent/toggleAssignSummary/setStuLevel/renderStudentLevelChips/
//   filterStudentList/saveAssignStudent/makeStudentRow/startEditStudent/cancelEditStudent/saveEditStudent/updateStudentFilter,
//   renderTeacherAssign/_drawTeacherAssign/filterAssignList/toggleAllAssign/updateAssignCount/saveBulkAssign. (top-level → window 전역)
// 런타임 의존(window 전역): students/currentSchool/currentSchoolId/currentRole, persistStudents/persist/stuKey/showToast/
//   updateClassSelect/updateStudentFilter 등, window.fbDb/fbDoc/fbSetDoc/fbDeleteDoc (fb.js).
// 잔류(모놀리스): deleteAllStudents(일괄삭제), init/persist(글루), select 헬퍼(updateClassSelect 등)·학생통계 캡처·단어차트(차후).
// 주의: 다른 파일에서 재정의 금지.

function code4Taken(code, exceptId) {
  if (!code) return false;
  return students.some(function(s){ return s.code4 === code && s.id !== exceptId; });
}
function checkNewStudentCode() {
  var el = document.getElementById('newStudentCode');
  var msg = document.getElementById('newStudentCodeMsg');
  if (!el || !msg) return;
  var v = (el.value||'').trim();
  if (!v) { msg.textContent=''; return; }
  if (!isCode4(v)) { msg.style.color='#ef4444'; msg.textContent='4자리 숫자'; return; }
  if (code4Taken(v, null)) { msg.style.color='#ef4444'; msg.textContent='이미 사용 중'; }
  else { msg.style.color='#16a34a'; msg.textContent='사용 가능'; }
}
function checkEditStudentCode(id) {
  var el = document.getElementById('edit-code-'+id);
  var msg = document.getElementById('edit-code-msg-'+id);
  if (!el || !msg) return;
  var v = (el.value||'').trim();
  if (!v) { msg.textContent=''; return; }
  if (!isCode4(v)) { msg.style.color='#ef4444'; msg.textContent='4자리 숫자'; return; }
  if (code4Taken(v, id)) { msg.style.color='#ef4444'; msg.textContent='이미 사용 중'; }
  else { msg.style.color='#16a34a'; msg.textContent='사용 가능'; }
}

function addStudent() {
  if (currentRole !== 'owner') { showToast('학생 등록은 원장만 가능합니다.', 'error'); return; }
  const cls    = document.getElementById('newStudentClass').value.trim();
  const name   = document.getElementById('newStudentName').value.trim();
  const grade  = document.getElementById('newStudentGrade') ? document.getElementById('newStudentGrade').value.trim() : '';
  const school = document.getElementById('newStudentSchool') ? document.getElementById('newStudentSchool').value.trim() : '';
  const phone  = document.getElementById('newStudentPhone') ? document.getElementById('newStudentPhone').value.trim() : '';
  const parent = document.getElementById('newParentPhone')  ? document.getElementById('newParentPhone').value.trim() : '';
  const code4  = document.getElementById('newStudentCode')  ? document.getElementById('newStudentCode').value.trim() : '';
  if (!name) { showToast('학생 이름을 입력해주세요.', 'error'); return; }
  if (!grade) { showToast('학년을 입력해주세요.', 'error'); return; }
  if (!code4) { showToast('출결코드(4자리)를 입력해주세요.', 'error'); return; }
  if (students.find(s => s.name === name && s.className === cls)) {
    showToast('이미 등록된 학생입니다.', 'error'); return;
  }
  if (code4) {
    if (!isCode4(code4)) { showToast('출결코드는 4자리 숫자로 입력해주세요.', 'error'); return; }
    if (code4Taken(code4, null)) { showToast('이미 사용 중인 출결코드입니다.', 'error'); return; }
  }
  students.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2,8), className: cls, name, grade, school, phone, parent, code4: code4, assignedTo: [], createdAt: new Date().toISOString() });
  persistStudents();
  document.getElementById('newStudentName').value  = '';
  if (document.getElementById('newStudentPhone')) document.getElementById('newStudentPhone').value = '';
  if (document.getElementById('newParentPhone'))  document.getElementById('newParentPhone').value  = '';
  if (document.getElementById('newStudentCode'))  document.getElementById('newStudentCode').value  = '';
  if (document.getElementById('newStudentCodeMsg')) document.getElementById('newStudentCodeMsg').textContent = '';
  renderStudents();
  updateStudentFilter();
  showToast(name + ' 학생이 등록됐습니다!');
}

function deleteStudent(id) {
  if (currentRole !== 'owner') { showToast('학생 삭제는 원장만 가능합니다.', 'error'); return; }
  // Firestore에서도 삭제
  if (window.fbDb && currentSchoolId) {
    window.fbDeleteDoc(window.fbDoc(window.fbDb, 'schools', currentSchoolId, 'students', String(id))).catch(function(){});
  }
  students = students.filter(s => String(s.id) !== String(id));
  localStorage.setItem(stuKey(), JSON.stringify(students));
  renderStudents();
  updateStudentFilter();
}

function renderStudents() {
  const el = document.getElementById('studentList');
  if (!el) return;

  // 역할별 UI 토글: 등록/엑셀은 원장만, 선생님은 안내문
  var isOwner = (currentRole === 'owner' || currentRole === 'superadmin');
  var ctrl = document.getElementById('studentAdminControls');
  if (ctrl) ctrl.style.display = isOwner ? 'block' : 'none';
  var note = document.getElementById('studentTeacherNote');
  if (note) note.style.display = isOwner ? 'none' : 'block';
  renderStudentLevelChips();
  var _act = students.filter(isActiveStu);

  if (_act.length === 0) {
    el.innerHTML = '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:16px">' + (isOwner ? '등록된 재원생이 없습니다' : '배정된 학생이 없습니다') + '</div>';
    return;
  }

  let html = '';

  // 원장: 선생님별 배정 요약 (접기/펼치기)
  if (isOwner && _schoolTeachers.length > 0) {
    html += '<div style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">'
      + '<div onclick="toggleAssignSummary()" style="background:#ecfeff;padding:9px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-size:12px;font-weight:800;color:#0891b2">선생님별 배정 현황</span>'
      + '<span id="assignSummaryArrow" style="color:#0891b2;font-size:11px">▼</span>'
      + '</div>'
      + '<div id="assignSummaryBody" style="padding:10px 12px">';
    // 각 선생님별 배정 학생
    _schoolTeachers.forEach(function(t){
      var assigned = _act.filter(function(s){ return Array.isArray(s.assignedTo) && s.assignedTo.indexOf(t.uid) !== -1; });
      html += '<div style="margin-bottom:8px">'
        + '<div style="font-size:12px;font-weight:700;color:#0e7490;margin-bottom:3px">' + escapeNotice(t.name) + ' <span style="color:#94a3b8;font-weight:600">' + assigned.length + '명</span></div>';
      if (assigned.length === 0) {
        html += '<div style="font-size:11px;color:#cbd5e1;padding-left:6px">배정된 학생 없음</div>';
      } else {
        html += '<div style="font-size:11px;color:#475569;padding-left:6px;line-height:1.6">'
          + assigned.map(function(s){ return escapeNotice(s.name) + (s.className ? '<span style="color:#94a3b8">('+escapeNotice(s.className)+')</span>' : ''); }).join(', ')
          + '</div>';
      }
      html += '</div>';
    });
    // 미배정 학생
    var unassigned = _act.filter(function(s){ return !Array.isArray(s.assignedTo) || s.assignedTo.length === 0; });
    html += '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #e2e8f0">'
      + '<div style="font-size:12px;font-weight:700;color:#b45309;margin-bottom:3px">미배정 <span style="color:#94a3b8;font-weight:600">' + unassigned.length + '명</span></div>'
      + (unassigned.length > 0
          ? '<div style="font-size:11px;color:#475569;padding-left:6px;line-height:1.6">' + unassigned.map(function(s){ return escapeNotice(s.name); }).join(', ') + '</div>'
          : '<div style="font-size:11px;color:#cbd5e1;padding-left:6px">없음</div>')
      + '</div>';
    html += '</div></div>';
  }

  // 반별 그룹핑 (원장/선생님 동일)
  const groups = {};
  _act.forEach(s => {
    const g = s.className || '반 미지정';
    if (!groups[g]) groups[g] = [];
    groups[g].push(s);
  });
  Object.keys(groups).sort().forEach(g => {
    html += '<div data-stu-group="1" style="margin-bottom:12px">';
    html += '<div style="font-size:11px;font-weight:800;color:#6366f1;margin-bottom:6px">' + g + '</div>';
    groups[g].sort(function(a,b){ return a.name.localeCompare(b.name, 'ko'); }).forEach(s => {
      html += makeStudentRow(s);
    });
    html += '</div>';
  });

  el.innerHTML = html;
  var _dl=document.getElementById('classListData'); if(_dl){ var _sn={}, _op=''; _act.forEach(function(s){ var c=s.className; if(c&&!_sn[c]){_sn[c]=1; _op+='<option value="'+String(c).replace(/"/g,'')+'">';} }); _dl.innerHTML=_op; }
  filterStudentList();
}

function toggleStuGroup(tid) {
  var body  = document.getElementById(tid);
  var arrow = document.getElementById(tid + '-arrow');
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
}

// ── 학생 배정 (원장 전용) ──────────────────────────────
var _assignStudentId = null;
var _schoolTeachers = []; // 학원 소속 선생님 목록 캐시

function openAssignStudent(studentId) {
  if (currentRole !== 'owner' && currentRole !== 'superadmin') return;
  _assignStudentId = studentId;
  var s = students.find(function(x){ return String(x.id) === String(studentId); });
  if (!s) return;
  document.getElementById('assignStudentName').textContent = s.name + (s.className ? ' · ' + s.className : '');
  var listEl = document.getElementById('assignTeacherList');
  listEl.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:14px">선생님 목록 불러오는 중...</div>';
  document.getElementById('assignStudentModal').style.display = 'flex';
  navOpenOverlay('assignStudentModal');

  // 같은 학원 선생님 조회 (schoolId 일치, role teacher)
  window.fbGetDocs(window.fbQuery(
    window.fbCollection(window.fbDb, 'users'),
    window.fbWhere('schoolId', '==', currentSchoolId)
  )).then(function(snap){
    _schoolTeachers = [];
    snap.forEach(function(d){
      var u = d.data();
      if (u.role === 'teacher') _schoolTeachers.push({ uid: d.id, name: u.name || u.userId, userId: u.userId, phone: u.phone || '', status: u.status || 'active' });
    });
    drawAssignTeacherList(s);
  }).catch(function(err){
    listEl.innerHTML = '<div style="color:#dc2626;font-size:12px;text-align:center;padding:14px">선생님 목록을 불러오지 못했습니다.<br><span style="font-size:11px;color:#94a3b8">' + (err && (err.code||err.message) || '') + '</span></div>';
  });
}

function drawAssignTeacherList(s) {
  var listEl = document.getElementById('assignTeacherList');
  var assigned = Array.isArray(s.assignedTo) ? s.assignedTo : [];
  if (_schoolTeachers.length === 0) {
    listEl.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:14px">소속 선생님이 없습니다.<br><span style="font-size:11px">선생님이 같은 학원 코드로 가입하면 여기에 표시됩니다.</span></div>';
    return;
  }
  listEl.innerHTML = _schoolTeachers.map(function(t){
    var checked = assigned.indexOf(t.uid) !== -1 ? 'checked' : '';
    return '<label style="display:flex;align-items:center;gap:8px;padding:9px 11px;border:1.5px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:13px">'
      + '<input type="checkbox" class="assign-teacher-cb" value="' + t.uid + '" ' + checked + ' style="width:16px;height:16px;accent-color:#0891b2">'
      + '<span style="font-weight:700;color:#1e293b">' + escHtml(t.name||'') + '</span>'
      + '<span style="font-size:11px;color:#94a3b8">' + escHtml(t.userId||'') + '</span>'
      + '</label>';
  }).join('');
}

function closeAssignStudent() {
  document.getElementById('assignStudentModal').style.display = 'none';
  _assignStudentId = null;
  navOnOverlayClosed('assignStudentModal');
}

function toggleAssignSummary() {
  var body = document.getElementById('assignSummaryBody');
  var arrow = document.getElementById('assignSummaryArrow');
  if (!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arrow) arrow.textContent = open ? '▶' : '▼';
}

// 학년 레벨 분류 + 칩 필터
var _stuLevelFilter = '전체';
function setStuLevel(lv){ _stuLevelFilter=lv; renderStudentLevelChips(); filterStudentList(); }
function renderStudentLevelChips(){
  var box=document.getElementById('studentLevelChips'); if(!box) return;
  var _a=(typeof activeStudents==='function')?activeStudents():students.filter(function(s){return !s.status||s.status==='active';});
  var c={'전체':_a.length,'초등':0,'중등':0,'고등':0};
  _a.forEach(function(s){ var L=gradeLevel(s.grade); if(c[L]!==undefined) c[L]++; });
  var levels=['전체','초등','중등','고등'];
  box.innerHTML=levels.map(function(lv){
    var on=_stuLevelFilter===lv;
    return '<button onclick="setStuLevel(\''+lv+'\')" style="padding:6px 13px;border-radius:20px;border:1.5px solid '+(on?'#6366f1':'#e2e8f0')+';background:'+(on?'#6366f1':'#fff')+';color:'+(on?'#fff':'#64748b')+';font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">'+lv+' '+c[lv]+'</button>';
  }).join('');
}
// 원생목록 검색: 이름·반·학년·학교·번호 + 학년 레벨로 필터
function filterStudentList() {
  var q = (document.getElementById('studentSearch')||{value:''}).value.trim().toLowerCase();
  var lv = _stuLevelFilter || '전체';
  var list = document.getElementById('studentList');
  if (!list) return;
  Array.prototype.forEach.call(list.querySelectorAll('[data-stu-id]'), function(el){
    var txt = (el.getAttribute('data-stu-search')||'').toLowerCase();
    var elLv = el.getAttribute('data-stu-level')||'기타';
    var okQ = !q || txt.indexOf(q) !== -1;
    var okL = (lv==='전체') || (elLv===lv);
    el.style.display = (okQ && okL) ? '' : 'none';
  });
  Array.prototype.forEach.call(list.querySelectorAll('[data-stu-group]'), function(g){
    var any = Array.prototype.some.call(g.querySelectorAll('[data-stu-id]'), function(r){ return r.style.display!=='none'; });
    g.style.display = any ? '' : 'none';
  });
}

function saveAssignStudent() {
  if (!_assignStudentId) return;
  var s = students.find(function(x){ return String(x.id) === String(_assignStudentId); });
  if (!s) return;
  var checked = [];
  document.querySelectorAll('.assign-teacher-cb:checked').forEach(function(cb){ checked.push(cb.value); });
  s.assignedTo = checked;
  // Firestore 저장
  if (window.fbDb && currentSchoolId) {
    window.fbSetDoc(window.fbDoc(window.fbDb, 'schools', currentSchoolId, 'students', String(s.id)), s).catch(function(){});
  }
  localStorage.setItem(stuKey(), JSON.stringify(students));
  closeAssignStudent();
  renderStudents();
  showToast(s.name + ' 학생 배정이 저장되었습니다 (' + checked.length + '명)');
}

function makeStudentRow(s) {
  // 검색용 통합 텍스트
  var stuSearchText = [s.name||'', s.className||'', s.grade||'', s.school||'', s.phone||'', s.parent||''].join(' ').toLowerCase();
  return '<div id="student-row-' + s.id + '" data-stu-id="' + s.id + '" data-stu-search="' + stuSearchText.replace(/"/g,'') + '" data-stu-level="' + gradeLevel(s.grade) + '" style="background:#f8fafc;border-radius:8px;margin-bottom:6px;border:1px solid #e2e8f0">'
    // 메인 행
    + '<div style="padding:8px 10px">'
    // 첫째 줄: 이름+학년 / 출결 / 버튼
    + '<div style="display:flex;align-items:center;gap:6px;justify-content:space-between;flex-wrap:wrap">'
    + '<div style="display:flex;align-items:center;gap:4px;min-width:0;flex:1 1 auto">'
    + '<span style="font-size:13px;font-weight:700;color:#1e293b;white-space:nowrap"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' + escHtml(s.name) + '</span>'
    + (s.grade ? '<span style="font-size:10px;color:#6366f1;font-weight:700;background:#ede9fe;padding:1px 6px;border-radius:4px;white-space:nowrap">' + escHtml(s.grade) + '</span>' : '')
    + '</div>'
+ (function(){
        var isOwner = (currentRole === 'owner' || currentRole === 'superadmin');
        if (!isOwner) return ''; // 선생님: 읽기 전용 (버튼 없음)
        return '<button onclick="startEditStudent(\'' + s.id + '\')" style="background:#ede9fe;color:#6366f1;border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">수정</button>'
          + '<button onclick="issueParentLink(\'' + s.id + '\',\'' + escJsArg(s.name||'') + '\')" style="background:#cffafe;color:#0e7490;border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">학부모링크</button>'
          + stuStatusButtons(s)
          + '<button onclick="deleteStudent(\'' + s.id + '\')" style="background:#fee2e2;color:#dc2626;border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">삭제</button>';
      })()
    + '</div></div>'
    // 둘째 줄: 반 / 전화번호
    + '<div style="display:flex;gap:8px;margin-top:5px;font-size:11px;color:#64748b;flex-wrap:wrap">'
    + (s.className ? '<span style="background:#f1f5f9;padding:1px 7px;border-radius:4px;font-weight:600">' + escHtml(s.className) + '</span>' : '')
    + (s.school ? '<span style="background:#eef2ff;color:#4f46e5;padding:1px 7px;border-radius:4px;font-weight:600">' + escHtml(s.school) + '</span>' : '')
    + (s.phone  ? '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 2.68h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l.6-.6a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 19z"/></svg>' + escHtml(s.phone)  + '</span>' : '')
    + (s.parent ? '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' + escHtml(s.parent) + '</span>' : '')
    + (s.code4 ? '<span style="background:#f5f3ff;color:#7c3aed;padding:1px 7px;border-radius:4px;font-weight:700">출결코드 ' + s.code4 + '</span>' : '')
    + ((function(){
        var isOwner = (currentRole === 'owner' || currentRole === 'superadmin');
        if (!isOwner) return '';
        var arr = Array.isArray(s.assignedTo) ? s.assignedTo : [];
        if (arr.length === 0) return '<span style="background:#fef3c7;color:#b45309;padding:1px 7px;border-radius:4px;font-weight:600">미배정</span>';
        var names = arr.map(function(uid){ return teacherNameByUid(uid); }).join(', ');
        return '<span style="background:#cffafe;color:#0e7490;padding:1px 7px;border-radius:4px;font-weight:600">담당: ' + escHtml(names) + '</span>';
      })())
    + '</div>'
    + '</div></div>'
    // 수정 폼
    + '<div id="student-edit-' + s.id + '" style="display:none;padding:10px;background:#f0f9ff;border-top:1.5px solid #bae6fd">'
    + '<div style="display:flex;gap:6px;margin-bottom:6px">'
    + '<input id="edit-class-'  + s.id + '" value="' + escHtml(s.className||'') + '" placeholder="반" list="classListData" style="padding:6px 8px;border-radius:6px;border:1.5px solid #e2e8f0;font-size:12px;font-family:inherit;flex:1;min-width:0">'
    + '<input id="edit-name-'   + s.id + '" value="' + escHtml(s.name||'') + '" placeholder="이름" style="padding:6px 8px;border-radius:6px;border:1.5px solid #e2e8f0;font-size:12px;font-family:inherit;flex:1;min-width:0">'
    + '<input id="edit-grade-'  + s.id + '" value="' + escHtml(s.grade||'') + '" placeholder="학년" style="padding:6px 8px;border-radius:6px;border:1.5px solid #e2e8f0;font-size:12px;font-family:inherit;flex:1;min-width:0">'
    + '</div>'
    + '<input id="edit-school-' + s.id + '" value="' + escHtml(s.school||'') + '" placeholder="학교명" style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1.5px solid #e2e8f0;font-size:12px;font-family:inherit;margin-bottom:6px">'
    + '<input id="edit-phone-'  + s.id + '" value="' + (s.phone||'') + '" placeholder="학생 번호" style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1.5px solid #e2e8f0;font-size:12px;font-family:inherit;margin-bottom:6px">'
    + '<input id="edit-parent-' + s.id + '" value="' + escHtml(s.parent||'') + '" placeholder="학부모 번호" style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1.5px solid #e2e8f0;font-size:12px;font-family:inherit;margin-bottom:6px">'
    + '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">'
    + '<input id="edit-code-' + s.id + '" value="' + (s.code4||'') + '" inputmode="numeric" maxlength="4" placeholder="출결코드 4자리(선택)" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');checkEditStudentCode(\'' + s.id + '\')" style="padding:6px 8px;border-radius:6px;border:1.5px solid #e2e8f0;font-size:12px;font-family:inherit;width:150px">'
    + '<span id="edit-code-msg-' + s.id + '" style="font-size:11px;font-weight:700"></span>'
    + '</div>'
    + '<div style="display:flex;gap:6px">'
    + '<button onclick="saveEditStudent(\'' + s.id + '\')" style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:6px;padding:5px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">저장</button>'
    + '<button onclick="cancelEditStudent(\'' + s.id + '\')" style="background:#f1f5f9;color:#64748b;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">취소</button>'
    + '</div></div>';
}

function startEditStudent(id) {
  document.getElementById('student-row-' + id).style.display = 'none';
  document.getElementById('student-edit-' + id).style.display = 'block';
}

function cancelEditStudent(id) {
  document.getElementById('student-row-' + id).style.display = 'flex';
  document.getElementById('student-edit-' + id).style.display = 'none';
}

function saveEditStudent(id) {
  if (currentRole !== 'owner' && currentRole !== 'superadmin') { showToast('수정은 원장만 가능합니다.', 'error'); return; }
  const newClass  = document.getElementById('edit-class-'  + id).value.trim();
  const newName   = document.getElementById('edit-name-'   + id).value.trim();
  const newGrade  = document.getElementById('edit-grade-'  + id) ? document.getElementById('edit-grade-'  + id).value.trim() : '';
  const newSchool = document.getElementById('edit-school-' + id) ? document.getElementById('edit-school-' + id).value.trim() : '';
  const newPhone  = document.getElementById('edit-phone-'  + id) ? document.getElementById('edit-phone-'  + id).value.trim() : '';
  const newParent = document.getElementById('edit-parent-' + id) ? document.getElementById('edit-parent-' + id).value.trim() : '';
  const newCode   = document.getElementById('edit-code-'   + id) ? document.getElementById('edit-code-'   + id).value.trim() : '';
  if (!newName) { showToast('이름을 입력해주세요.', 'error'); return; }
  if (newCode) {
    if (!isCode4(newCode)) { showToast('출결코드는 4자리 숫자로 입력해주세요.', 'error'); return; }
    if (code4Taken(newCode, id)) { showToast('이미 사용 중인 출결코드입니다.', 'error'); return; }
  }
  const s = students.find(s => String(s.id) === String(id));
  if (!s) return;
  const oldName = s.name;
  s.className = newClass;
  s.name      = newName;
  s.grade     = newGrade;
  s.school    = newSchool;
  s.phone     = newPhone;
  s.parent    = newParent;
  s.code4     = newCode;
  persistStudents();
  if (oldName !== newName) {
    records = records.map(r => r.student === oldName ? {...r, student: newName} : r);
    persist();
  }
  renderStudents();
  updateStudentFilter();
  updateLoadSelect();
  showToast('수정됐습니다!');
}

function updateStudentFilter() {
  const sel = document.getElementById('filterStudent');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value=""> 전체 학생</option>';
  activeStudents().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = (s.className ? '['+s.className+'] ' : '') + s.name;
    sel.appendChild(opt);
  });
  // 기록에만 있고 학생 목록에 없는 학생도 표시
  const registered = new Set(activeStudents().map(s => s.name));
  const fromRecords = [...new Set(records.map(r => r.student).filter(n => n && !registered.has(n)))];
  fromRecords.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.value = cur;
}

function renderTeacherAssign() {
  if (!isOwnerOrAdmin()) return;
  if (!_schoolTeachers || _schoolTeachers.length === 0) {
    loadSchoolTeachers().then(_drawTeacherAssign);
  } else {
    _drawTeacherAssign();
  }
}
function _drawTeacherAssign() {
  var sel = document.getElementById('assignTeacherSelect');
  var grid = document.getElementById('assignStudentGrid');
  if (!sel || !grid) return;
  if (!_schoolTeachers || _schoolTeachers.length === 0) {
    sel.innerHTML = '<option value="">소속 선생님 없음</option>';
    grid.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:18px">소속 선생님이 없습니다.<br><span style="font-size:11px">선생님이 같은 학원 코드로 가입하면 표시됩니다.</span></div>';
    var c0=document.getElementById('assignSelCount'); if(c0) c0.textContent='';
    return;
  }
  var prev = sel.value;
  sel.innerHTML = _schoolTeachers.map(function(t){
    return '<option value="'+t.uid+'">'+escapeNotice(t.name||t.userId||'')+'</option>';
  }).join('');
  if (prev && _schoolTeachers.some(function(t){return t.uid===prev;})) sel.value = prev;
  var uid = sel.value;
  var sorted = students.slice().sort(function(a,b){
    var ca=(a.className||''), cb=(b.className||'');
    if (ca!==cb) return ca.localeCompare(cb);
    return (a.name||'').localeCompare(b.name||'');
  });
  grid.innerHTML = sorted.map(function(s){
    var checked = (Array.isArray(s.assignedTo) && s.assignedTo.indexOf(uid)!==-1) ? 'checked' : '';
    var search = (((s.name||'')+' '+(s.className||'')+' '+(s.grade||'')).toLowerCase()).replace(/"/g,'');
    return '<label data-assign-row data-search="'+search+'" style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1.5px solid #e2e8f0;border-radius:8px;cursor:pointer">'
      + '<input type="checkbox" class="assign-stu-cb" autocomplete="off" value="'+s.id+'" '+checked+' onchange="updateAssignCount()" style="width:16px;height:16px;accent-color:#0891b2;flex-shrink:0">'
      + '<span style="font-weight:700;color:#1e293b;font-size:13px">'+escapeNotice(s.name||'')+'</span>'
      + (s.className?'<span style="font-size:11px;color:#64748b;background:#f1f5f9;padding:1px 7px;border-radius:4px">'+escapeNotice(s.className)+'</span>':'')
      + (s.grade?'<span style="font-size:10px;color:#6366f1;background:#ede9fe;padding:1px 6px;border-radius:4px;font-weight:700">'+escapeNotice(s.grade)+'</span>':'')
      + '</label>';
  }).join('') || '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:18px">등록된 학생이 없습니다</div>';
  updateAssignCount();
}
function filterAssignList() {
  var q=((document.getElementById('assignStuSearch')||{value:''}).value||'').trim().toLowerCase();
  Array.prototype.forEach.call(document.querySelectorAll('#assignStudentGrid [data-assign-row]'), function(el){
    var t=el.getAttribute('data-search')||'';
    el.style.display = (!q || t.indexOf(q)!==-1) ? 'flex' : 'none';
  });
}
function toggleAllAssign(on) {
  Array.prototype.forEach.call(document.querySelectorAll('#assignStudentGrid [data-assign-row]'), function(el){
    if (el.style.display==='none') return;
    var cb=el.querySelector('.assign-stu-cb'); if(cb) cb.checked=!!on;
  });
  updateAssignCount();
}
function updateAssignCount() {
  var n=document.querySelectorAll('#assignStudentGrid .assign-stu-cb:checked').length;
  var el=document.getElementById('assignSelCount'); if(el) el.textContent='선택 '+n+'명';
}
function saveBulkAssign() {
  var sel=document.getElementById('assignTeacherSelect');
  if(!sel||!sel.value){ showToast('선생님을 선택해주세요.','error'); return; }
  var uid=sel.value;
  var checkedIds={};
  document.querySelectorAll('#assignStudentGrid .assign-stu-cb:checked').forEach(function(cb){ checkedIds[String(cb.value)]=true; });
  var changed=[];
  students.forEach(function(s){
    var arr=Array.isArray(s.assignedTo)?s.assignedTo.slice():[];
    var has=arr.indexOf(uid)!==-1;
    var want=!!checkedIds[String(s.id)];
    if (want && !has){ arr.push(uid); s.assignedTo=arr; changed.push(s); }
    else if (!want && has){ s.assignedTo=arr.filter(function(u){return u!==uid;}); changed.push(s); }
  });
  if (changed.length===0){ showToast('변경된 내용이 없습니다.'); return; }
  if (window.fbDb && currentSchoolId) {
    changed.forEach(function(s){
      window.fbSetDoc(window.fbDoc(window.fbDb,'schools',currentSchoolId,'students',String(s.id)), s).catch(function(){});
    });
  }
  localStorage.setItem(stuKey(), JSON.stringify(students));
  showToast(changed.length+'명 배정이 업데이트되었습니다.');
  if (typeof renderStudents==='function') renderStudents();
}

// ── 학부모 읽기전용 링크 (원장/슈퍼, 알림톡 착지용) ──────────────────────────
// CF issueParentToken = get-or-create(기존 활성 토큰 재사용 → 링크 고정). parent.html(로그인 불필요)로 착지.
//   issueParentLink : 학생 카드 버튼 → 그 학생 링크 발급/복사
//   sendRecordLink  : 과제 카드 [전송] 버튼 → 그 과제의 학생 링크 발급/복사 (실발송은 다음 라운드)
function _parentLinkCore(studentId, name) {
  if (!window.fbCallable) { showToast('잠시 후 다시 시도해주세요.', 'error'); return; }
  if (!studentId) { showToast('학생 정보를 찾을 수 없습니다.', 'error'); return; }
  showToast('링크 준비 중...', 'info');
  window.fbCallable('issueParentToken')({ studentId: String(studentId) }).then(function (res) {
    var url = res && res.data && res.data.url;
    if (!url) { showToast('링크 생성에 실패했습니다.', 'error'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { showToast('학부모 링크가 복사되었습니다.'); }).catch(function () {});
    }
    showParentLinkModal(name, url);
  }).catch(function (err) {
    showToast((err && err.message) ? err.message : '링크 생성에 실패했습니다.', 'error');
  });
}

function issueParentLink(id, name) {
  _parentLinkCore(id, name);
}

// 과제 카드 [전송]: 전송 다이얼로그 오픈 (수신자 선택 + 재전송 확인)
function sendRecordLink(recId) {
  var rec = null;
  if (typeof records !== 'undefined' && Array.isArray(records)) {
    rec = records.filter(function (r) { return String(r.id) === String(recId); })[0];
  }
  if (!rec) { showToast('과제를 찾을 수 없습니다.', 'error'); return; }
  var sid = rec.studentId || (typeof resolveStudentId === 'function' ? resolveStudentId(rec) : '');
  if (!sid) { showToast('이 과제에 연결된 학생이 없습니다.', 'error'); return; }
  openSendDialog(rec, sid);
}

function _findStudentForSend(sid, rec) {
  if (typeof students === 'undefined' || !Array.isArray(students)) return null;
  var st = students.filter(function (s) { return String(s.id) === String(sid); })[0];
  if (!st && rec) st = students.filter(function (s) { return s.name === rec.student && (s.className || '') === (rec.className || ''); })[0];
  return st || null;
}

function _fmtSentTime(ms) {
  var d = new Date(ms), now = new Date();
  var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
  var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return (sameDay ? '오늘 ' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + hh + ':' + mm;
}

function closeSendDialog() {
  var el = document.getElementById('sendDialog');
  if (el) el.parentNode.removeChild(el);
}

function openSendDialog(rec, sid) {
  var st = _findStudentForSend(sid, rec);
  var name = (st && st.name) || rec.student || '학생';
  var parentPhone = (st && st.parent) || '';
  var stuPhone = (st && st.phone) || '';
  var dateStr = rec.date || '';
  var hasAny = !!(parentPhone || stuPhone);

  var sentAt = 0; try { sentAt = parseInt(localStorage.getItem('kms_psent_' + sid) || '0', 10) || 0; } catch (e) {}

  closeSendDialog();
  var ov = document.createElement('div');
  ov.id = 'sendDialog';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10002;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px';

  function row(id, label, phone, checked, enabled) {
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid ' + (enabled ? '#e2e8f0' : '#f1f5f9') + ';border-radius:10px;margin-bottom:8px;cursor:' + (enabled ? 'pointer' : 'not-allowed') + ';opacity:' + (enabled ? '1' : '.55') + '">'
      + '<input type="checkbox" id="' + id + '" ' + (checked ? 'checked' : '') + ' ' + (enabled ? '' : 'disabled') + ' style="width:18px;height:18px;accent-color:#0891b2">'
      + '<span style="font-size:13px;font-weight:700;color:#334155;flex:0 0 auto">' + label + '</span>'
      + '<span style="font-size:12px;color:' + (enabled ? '#64748b' : '#cbd5e1') + ';margin-left:auto">' + (phone ? escHtml(phone) : '번호 없음') + '</span>'
      + '</label>';
  }

  ov.innerHTML =
    '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:inherit">'
    + '<div style="font-size:15px;font-weight:800;color:#0e7490;margin-bottom:2px">학습기록 등록 알림 전송</div>'
    + '<div style="font-size:12px;color:#64748b;margin-bottom:' + (sentAt ? '10px' : '14px') + '">' + escHtml(name) + (dateStr ? ' · ' + escHtml(dateStr) : '') + ' 기록을 학부모에게 알립니다.</div>'
    + (sentAt ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;font-size:12px;color:#92400e;font-weight:700;margin-bottom:12px">⚠ 이 학생에게 ' + _fmtSentTime(sentAt) + ' 전송됨 — 다시 보낼까요?</div>' : '')
    + '<div style="font-size:11px;font-weight:800;color:#94a3b8;margin-bottom:6px">받는 사람</div>'
    + row('sendToParent', '학부모', parentPhone, !!parentPhone, !!parentPhone)
    + row('sendToStudent', '학생', stuPhone, false, !!stuPhone)
    + (hasAny
        ? '<div style="font-size:12px;color:#64748b;margin:4px 2px 14px">예상 차감 <b id="sendCreditEst" style="color:#0e7490">1</b> 크레딧 · 알림톡(실패 시 문자)</div>'
        : '<div style="font-size:12px;color:#dc2626;font-weight:700;margin:4px 2px 14px">등록된 번호가 없어 전송할 수 없습니다. 학생 정보에서 번호를 입력해주세요.</div>')
    + '<div style="display:flex;gap:8px">'
    + '<button id="sendGo" ' + (hasAny ? '' : 'disabled') + ' style="flex:1;background:' + (hasAny ? '#0891b2' : '#cbd5e1') + ';color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:800;cursor:' + (hasAny ? 'pointer' : 'not-allowed') + ';font-family:inherit">전송</button>'
    + '<button id="sendCancel" style="flex:0 0 auto;background:#f1f5f9;color:#64748b;border:none;border-radius:8px;padding:11px 18px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">취소</button>'
    + '</div></div>';

  document.body.appendChild(ov);
  ov.addEventListener('click', function (e) { if (e.target === ov) closeSendDialog(); });
  document.getElementById('sendCancel').onclick = closeSendDialog;

  function recount() {
    var n = 0;
    var p = document.getElementById('sendToParent'), s = document.getElementById('sendToStudent');
    if (p && p.checked) n++;
    if (s && s.checked) n++;
    var est = document.getElementById('sendCreditEst');
    if (est) est.textContent = String(n);
    var go = document.getElementById('sendGo');
    if (go && hasAny) { go.disabled = (n === 0); go.style.background = (n === 0) ? '#cbd5e1' : '#0891b2'; go.style.cursor = (n === 0) ? 'not-allowed' : 'pointer'; }
  }
  var pe = document.getElementById('sendToParent'), se = document.getElementById('sendToStudent');
  if (pe) pe.addEventListener('change', recount);
  if (se) se.addEventListener('change', recount);

  if (hasAny) {
    document.getElementById('sendGo').onclick = function () {
      var recips = [];
      if (pe && pe.checked) recips.push('학부모');
      if (se && se.checked) recips.push('학생');
      if (!recips.length) { showToast('받는 사람을 선택해주세요.', 'error'); return; }
      _testSend(sid, name, recips);
    };
  }
}

// 테스트 발송: 실제 알림톡 대신 링크 발급/복사로 흐름 확인 (솔라피 연동 시 실발송+크레딧 차감으로 교체)
function _testSend(sid, name, recips) {
  if (!window.fbCallable) { showToast('잠시 후 다시 시도해주세요.', 'error'); return; }
  showToast('전송 준비 중...', 'info');
  window.fbCallable('issueParentToken')({ studentId: String(sid) }).then(function (res) {
    var url = res && res.data && res.data.url;
    if (!url) { showToast('링크 생성에 실패했습니다.', 'error'); return; }
    try { localStorage.setItem('kms_psent_' + sid, String(Date.now())); } catch (e) {}
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).catch(function () {}); }
    closeSendDialog();
    _showSendResult(name, recips, url);
  }).catch(function (err) {
    showToast((err && err.message) ? err.message : '전송에 실패했습니다.', 'error');
  });
}

function _showSendResult(name, recips, url) {
  var old = document.getElementById('parentLinkModal');
  if (old) old.parentNode.removeChild(old);
  var ov = document.createElement('div');
  ov.id = 'parentLinkModal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10002;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:inherit">'
    + '<div style="font-size:15px;font-weight:800;color:#0e7490;margin-bottom:4px">전송 (테스트) 완료</div>'
    + '<div style="font-size:12px;color:#64748b;margin-bottom:12px">' + escHtml(name) + ' · 받는 사람: ' + escHtml(recips.join(', ')) + '<br>실제 알림톡 발송은 솔라피 연동 후 동작합니다. 지금은 링크 확인용입니다.</div>'
    + '<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:12px;color:#334155;word-break:break-all;user-select:all;margin-bottom:12px">' + escHtml(url) + '</div>'
    + '<div style="display:flex;gap:8px">'
    + '<button id="parentLinkCopy" style="flex:1;background:#0891b2;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">복사</button>'
    + '<button id="parentLinkOpen" style="flex:1;background:#ecfeff;color:#0e7490;border:1px solid #67e8f9;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">열기</button>'
    + '<button id="parentLinkClose" style="flex:0 0 auto;background:#f1f5f9;color:#64748b;border:none;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">닫기</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function (e) { if (e.target === ov) ov.parentNode.removeChild(ov); });
  document.getElementById('parentLinkClose').onclick = function () { ov.parentNode.removeChild(ov); };
  document.getElementById('parentLinkOpen').onclick = function () { window.open(url, '_blank'); };
  document.getElementById('parentLinkCopy').onclick = function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { showToast('복사되었습니다.'); }).catch(function () { showToast('직접 길게 눌러 복사해주세요.', 'info'); });
    } else { showToast('직접 길게 눌러 복사해주세요.', 'info'); }
  };
}

function showParentLinkModal(name, url) {
  var old = document.getElementById('parentLinkModal');
  if (old) old.parentNode.removeChild(old);
  var ov = document.createElement('div');
  ov.id = 'parentLinkModal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10002;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:inherit">'
    + '<div style="font-size:15px;font-weight:800;color:#0e7490;margin-bottom:4px">학부모 링크 발급 완료</div>'
    + '<div style="font-size:12px;color:#64748b;margin-bottom:12px">' + escHtml(name || '학생') + ' · 카톡으로 보낼 읽기전용 링크입니다. 로그인 없이 열립니다.</div>'
    + '<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:12px;color:#334155;word-break:break-all;user-select:all;margin-bottom:12px">' + escHtml(url) + '</div>'
    + '<div style="display:flex;gap:8px">'
    + '<button id="parentLinkCopy" style="flex:1;background:#0891b2;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">복사</button>'
    + '<button id="parentLinkOpen" style="flex:1;background:#ecfeff;color:#0e7490;border:1px solid #67e8f9;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">열기</button>'
    + '<button id="parentLinkClose" style="flex:0 0 auto;background:#f1f5f9;color:#64748b;border:none;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">닫기</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function (e) { if (e.target === ov) ov.parentNode.removeChild(ov); });
  document.getElementById('parentLinkClose').onclick = function () { ov.parentNode.removeChild(ov); };
  document.getElementById('parentLinkOpen').onclick = function () { window.open(url, '_blank'); };
  document.getElementById('parentLinkCopy').onclick = function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { showToast('복사되었습니다.'); }).catch(function () { showToast('직접 길게 눌러 복사해주세요.', 'info'); });
    } else { showToast('직접 길게 눌러 복사해주세요.', 'info'); }
  };
}

// ── 일괄 전송 (날짜 그룹) ─────────────────────────────────────────────────────
// 그 날짜에 보이는 학생들을 모아(학생 단위 dedup) 다이얼로그로 일괄 전송.
// 학부모 번호 없는 학생은 흐릿+"번호 미등록"으로 선택 불가. 실발송은 솔라피 연동 시 교체.
function bulkSendByDate(date) {
  if (typeof records === 'undefined' || !Array.isArray(records)) { showToast('기록을 찾을 수 없습니다.', 'error'); return; }
  var isOwner = (currentRole === 'owner' || currentRole === 'superadmin');
  var filterVal = (document.getElementById('filterStudent') || {}).value || '';
  var teacherFilter = '';
  if (isOwner) { var tSel = document.getElementById('filterTeacher'); teacherFilter = tSel ? tSel.value : ''; }

  var inDate = records.filter(function (r) {
    if (String(r.date) !== String(date)) return false;
    if (!isOwner && r.teacher !== currentUser) return false;
    if (isOwner && teacherFilter && r.teacher !== teacherFilter) return false;
    if (filterVal && r.student !== filterVal) return false;
    return true;
  });
  if (!inDate.length) { showToast('해당 날짜 기록이 없습니다.', 'error'); return; }

  var seen = {}, list = [];
  inDate.forEach(function (r) {
    var sid = r.studentId || (typeof resolveStudentId === 'function' ? resolveStudentId(r) : '');
    var keyId = sid || ('name:' + (r.student || '') + '|' + (r.className || ''));
    if (seen[keyId]) return; seen[keyId] = 1;
    var st = _findStudentForSend(sid, r);
    list.push({
      sid: sid,
      name: (st && st.name) || r.student || '학생',
      className: (st && st.className) || r.className || '',
      parent: (st && st.parent) || ''
    });
  });
  list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); });
  openBulkSendDialog(date, list);
}

function closeBulkSendDialog() {
  var el = document.getElementById('bulkSendDialog');
  if (el) el.parentNode.removeChild(el);
}

function openBulkSendDialog(date, list) {
  closeBulkSendDialog();
  var sendable = list.filter(function (x) { return !!x.parent; }).length;

  var rowsHtml = list.map(function (x, i) {
    var hasPhone = !!x.parent;
    var sentAt = 0; try { sentAt = parseInt(localStorage.getItem('kms_psent_' + x.sid) || '0', 10) || 0; } catch (e) {}
    var sentTag = (hasPhone && sentAt) ? '<span style="font-size:10px;font-weight:800;color:#b45309;background:#fef3c7;padding:1px 7px;border-radius:999px;margin-left:6px">전송됨</span>' : '';
    return '<label style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-bottom:1px solid #f1f5f9;cursor:' + (hasPhone ? 'pointer' : 'not-allowed') + ';opacity:' + (hasPhone ? '1' : '.5') + '">'
      + '<input type="checkbox" class="bulkChk" data-sid="' + escHtml(x.sid) + '" data-name="' + escHtml(x.name) + '" ' + (hasPhone ? 'checked' : 'disabled') + ' style="width:17px;height:17px;accent-color:#0891b2;flex:0 0 auto">'
      + '<span style="font-size:13px;font-weight:700;color:#334155">' + escHtml(x.name) + '</span>'
      + (x.className ? '<span style="font-size:11px;color:#94a3b8">' + escHtml(x.className) + '</span>' : '')
      + sentTag
      + '<span style="margin-left:auto;font-size:11px;color:' + (hasPhone ? '#64748b' : '#cbd5e1') + '">' + (hasPhone ? escHtml(x.parent) : '번호 미등록') + '</span>'
      + '</label>';
  }).join('');

  var ov = document.createElement('div');
  ov.id = 'bulkSendDialog';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10002;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:16px;max-width:440px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:inherit;overflow:hidden">'
    + '<div style="padding:18px 18px 10px">'
    + '<div style="font-size:15px;font-weight:800;color:#0e7490;margin-bottom:2px">일괄 전송</div>'
    + '<div style="font-size:12px;color:#64748b">' + escHtml(date) + ' · 학습기록 등록 알림을 학부모에게 전송합니다.</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 18px;background:#f8fafc;border-top:1px solid #eef2f7;border-bottom:1px solid #eef2f7">'
    + '<span style="font-size:11px;font-weight:800;color:#94a3b8">받는 학생 ' + list.length + '명 · 전송 가능 ' + sendable + '명</span>'
    + '<button id="bulkToggleAll" style="font-size:11px;font-weight:700;color:#0891b2;background:none;border:none;cursor:pointer;font-family:inherit">모두 해제</button>'
    + '</div>'
    + '<div style="overflow-y:auto;flex:1 1 auto">' + rowsHtml + '</div>'
    + '<div style="padding:12px 18px 16px;border-top:1px solid #eef2f7">'
    + (sendable
        ? '<div style="font-size:12px;color:#64748b;margin-bottom:10px">예상 차감 <b id="bulkCreditEst" style="color:#0e7490">' + sendable + '</b> 크레딧 · 알림톡(실패 시 문자)</div>'
        : '<div style="font-size:12px;color:#dc2626;font-weight:700;margin-bottom:10px">학부모 번호가 등록된 학생이 없습니다.</div>')
    + '<div style="display:flex;gap:8px">'
    + '<button id="bulkGo" ' + (sendable ? '' : 'disabled') + ' style="flex:1;background:' + (sendable ? '#0891b2' : '#cbd5e1') + ';color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:800;cursor:' + (sendable ? 'pointer' : 'not-allowed') + ';font-family:inherit">전송</button>'
    + '<button id="bulkCancel" style="flex:0 0 auto;background:#f1f5f9;color:#64748b;border:none;border-radius:8px;padding:11px 18px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">취소</button>'
    + '</div></div></div>';

  document.body.appendChild(ov);
  ov.addEventListener('click', function (e) { if (e.target === ov) closeBulkSendDialog(); });
  document.getElementById('bulkCancel').onclick = closeBulkSendDialog;

  function checks() { return Array.prototype.slice.call(ov.querySelectorAll('.bulkChk')); }
  function recount() {
    var n = checks().filter(function (c) { return c.checked && !c.disabled; }).length;
    var est = document.getElementById('bulkCreditEst'); if (est) est.textContent = String(n);
    var go = document.getElementById('bulkGo');
    if (go && sendable) { go.disabled = (n === 0); go.style.background = (n === 0) ? '#cbd5e1' : '#0891b2'; go.style.cursor = (n === 0) ? 'not-allowed' : 'pointer'; }
    var tg = document.getElementById('bulkToggleAll');
    if (tg) tg.textContent = (n === 0) ? '모두 선택' : '모두 해제';
  }
  checks().forEach(function (c) { c.addEventListener('change', recount); });
  document.getElementById('bulkToggleAll').onclick = function () {
    var anyOn = checks().some(function (c) { return c.checked && !c.disabled; });
    checks().forEach(function (c) { if (!c.disabled) c.checked = !anyOn; });
    recount();
  };

  if (sendable) {
    document.getElementById('bulkGo').onclick = function () {
      var sel = checks().filter(function (c) { return c.checked && !c.disabled; })
        .map(function (c) { return { sid: c.getAttribute('data-sid'), name: c.getAttribute('data-name') }; });
      if (!sel.length) { showToast('보낼 학생을 선택해주세요.', 'error'); return; }
      _bulkTestSend(sel);
    };
  }
}

// 일괄 테스트 발송: 선택 학생 각각 링크 발급(get-or-create) + 전송됨 마커. 실발송은 솔라피 연동 시 단일 CF로 교체.
function _bulkTestSend(sel) {
  if (!window.fbCallable) { showToast('잠시 후 다시 시도해주세요.', 'error'); return; }
  var go = document.getElementById('bulkGo');
  if (go) { go.disabled = true; go.textContent = '전송 중...'; }
  var jobs = sel.map(function (s) {
    return window.fbCallable('issueParentToken')({ studentId: String(s.sid) })
      .then(function () { try { localStorage.setItem('kms_psent_' + s.sid, String(Date.now())); } catch (e) {} return true; })
      .catch(function () { return false; });
  });
  Promise.all(jobs).then(function (results) {
    var ok = results.filter(Boolean).length, fail = results.length - ok;
    closeBulkSendDialog();
    showToast(ok + '명 전송(테스트) 완료' + (fail ? ' · 실패 ' + fail + '명' : ''));
  });
}
