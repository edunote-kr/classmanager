// EduNote 내비게이션/탭 라우팅 모듈 (nav.js)
// classic <script> — students.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// 탭 전환(switchTab) + 그룹/리프 네비, 오버레이 스택, 브라우저 뒤로/앞으로 연동.
// 상태 var(window 전역): _navOverlays/_navSuppressPop/NAV_INITIAL_TAB (popstate 핸들러 등 모놀리스와 공유 — var 전역이라 안전).
// 정의: switchTab/_navCloseFor/navOpenOverlay/navOnOverlayClosed/navSwitchTab/navSelectLeaf/navSelectGroup. (top-level → window 전역)
// 런타임 의존(window 전역): activeTab(state.js), renderNav/renderList/render* 등 화면 렌더, closeLessonPreview/closeMobileSheet(preview.js) 등.
// 잔류(모놀리스): updateAttendance/updateAttitude(빈 스텁), closeUserModal, popstate 핸들러, renderNav(메뉴 빌더).
// 주의: 다른 파일에서 재정의 금지.

function switchTab(tab) {
  activeTab = tab;
  var meta = navLeafMeta(tab);
  // 액션 리프(마이페이지 등)는 패널 전환 없이 동작만
  if (meta && meta.action) { if (typeof window[meta.action]==='function') window[meta.action](); return; }
  var panelKey = navPanelKey(tab);
  var mc = document.getElementById('mainContent');
  if (mc) { var ps=mc.querySelectorAll(':scope > .panel'); for (var i=0;i<ps.length;i++) ps[i].classList.remove('active'); }
  var tp = document.getElementById('panel-'+panelKey);
  if (tp) tp.classList.add('active');
  if (panelKey==='soon') { var st0=document.getElementById('soonTitle'); if(st0) st0.textContent=(meta&&meta.label)||'준비 중'; }
  document.body.classList.toggle('tab-input', tab==='input');
  if(tab!=='input'){ if(_lessonPreviewOpen) closeLessonPreview(); if(_mobileSheetOpen) closeMobileSheet(); }
  else { if(_lessonPreviewOpen) setTimeout(renderLessonPreview,50); }
  navSyncActive(tab);
  if (tab==='dashboard') renderDashboard();
  if (tab==='checkin')    enterCheckinManage();
  if (tab==='checkinlog') enterCheckinHistory();
  if (tab && tab.indexOf('mp-')===0) { mpShowPane(tab); populateMyPage(); }
  if (tab==='leavers' && typeof renderLeavers==='function') renderLeavers();
  if (tab==='list')     { updateStudentFilter(); renderList(); }
  if (tab==='notice')   renderNotices();
  if (tab==='msg-sms-log')  renderSendHistory('sms');
  if (tab==='msg-alim-log') renderSendHistory('alimtalk');
  if (tab==='stats')    loadClassAttendance(renderStats);
  if (tab==='input')    { updateLoadSelect(); renderHomeworks(); renderLastHomeworks(); renderLessonBlocks(); renderTests(); }
  if (tab==='students') renderStudents();
  if (tab==='teachers') renderTeacherRoster();
  if (tab==='classassign') renderTeacherAssign();
  if (tab==='attendance') {
    var _am=document.getElementById('attMonth'); if(_am) _am.value=String(new Date().getMonth()+1);
    var _ay=document.getElementById('attYear');  if(_ay) _ay.value=String(new Date().getFullYear());
    loadClassAttendance(renderAttendance);
  }
}

/* ===== 브라우저 뒤로/앞으로가기 내비게이션 ===== */
var _navOverlays = [];
var _navSuppressPop = false;
var NAV_INITIAL_TAB = 'dashboard';
function _navCloseFor(id) {
  switch (id) {
    case 'assignStudentModal': return closeAssignStudent;
    case 'applyModal':         return closeApplyModal;
    case 'messageBoxModal':    return closeMessageBox;
    case 'msgDetailModal':     return closeMsgDetail;
    case 'myPageModal':        return closeMyPage;
    case 'pwResetModal':       return closePwReset;
    case 'userModal':          return closeUserModal;
    case 'createUserModal':    return closeCreateUserModal;
    case 'studentCalendarModal': return closeStudentCalendar;
    case 'printOverlay':       return (typeof closePrint === 'function') ? closePrint : function(){ var m=document.getElementById('printOverlay'); if(m) m.style.display='none'; };
    default: return function(){ var m=document.getElementById(id); if(m) m.style.display='none'; };
  }
}
function navOpenOverlay(id) {
  for (var i=0;i<_navOverlays.length;i++){ if(_navOverlays[i].id===id) return; }
  _navOverlays.push({ id:id, close:_navCloseFor(id) });
  try { history.pushState({ navOverlay:id }, ''); } catch(e) {}
}
function navOnOverlayClosed(id) {
  var idx = -1;
  for (var i=_navOverlays.length-1;i>=0;i--){ if(_navOverlays[i].id===id){ idx=i; break; } }
  if (idx === -1) return;
  if (idx === _navOverlays.length-1) {
    _navOverlays.pop();
    _navSuppressPop = true;
    try { history.back(); } catch(e) { _navSuppressPop = false; }
  } else {
    _navOverlays.splice(idx,1);
  }
}
function navSwitchTab(tab) { navSelectLeaf(tab); }
function navSelectLeaf(tab) {
  var meta = navLeafMeta(tab);
  if (meta && meta.action) { if (typeof window[meta.action]==='function') window[meta.action](); return; }
  if (tab === activeTab) { switchTab(tab); return; }
  switchTab(tab);
  try { history.pushState({ navTab:tab }, ''); } catch(e) {}
}
function navSelectGroup(gid) {
  if (_navOpenGroup===gid && navGroupOf(activeTab)===gid) { _navCollapsed = !_navCollapsed; renderNav(); return; }
  _navCollapsed = false; _navOpenGroup = gid;
  var g = NAV_GROUPS.filter(function(x){return x.id===gid;})[0];
  var _ow = (typeof isOwnerOrAdmin==='function') ? isOwnerOrAdmin() : true;
  var _lv = g ? (g.leaves||[]).filter(function(l){ return _ow || !l.owner; }) : [];
  if (_lv.length) navSelectLeaf(_lv[0].id);
  else { renderNav(); }
}
