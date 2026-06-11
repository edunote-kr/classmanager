// EduNote 알림장 모듈 (notices.js)
// classic <script> — state.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// 정의(window 전역): noticeKey / persistNotices / saveNotice / updateNoticeClassFilter /
//   updateNoticeTeacherFilter / renderNotices / toggleNoticeGroup / makeNoticeCard / deleteNotice.
// 런타임 의존(window 전역, 호출 시점에 존재): 상태 notices/students/currentUser/currentRole/currentSchool (state.js),
//   escapeNotice (utils.js), window.fbDb/fbDoc/fbSetDoc/fbDeleteDoc/fbGetDocs (fb.js),
//   showToast / saveNoticeCard / isOwnerOrAdmin 등 (모놀리스).
// 잔류(아직 모놀리스): saveNoticeCard, loadOwnerData 내 알림장 집계·dedup(원장 도메인).
// 주의: 이 함수들을 다른 파일에서 재정의/재선언하지 말 것.

// ── 알림장 기능 ──────────────────────────────────────────
function noticeKey() { return 'kms_notices_'+(currentUser||'_'); }

function persistNotices() {
  localStorage.setItem(noticeKey(), JSON.stringify(notices));
  if (window.fbDb && currentSchool && currentSchool.length > 10) {
    var uid = currentSchool;
    notices.forEach(function(n) {
      // 원장은 전체 알림장을 들고 있으므로, 다른 선생님 알림장을 원장 서브컬렉션에
      // 복사하면 중복이 생긴다 → 본인이 작성한 알림장만 본인 서브컬렉션에 저장.
      if (isOwnerOrAdmin() && n.teacher && n.teacher !== currentUser) return;
      var ref = window.fbDoc(window.fbDb, 'users', uid, 'notices', String(n.id));
      window.fbSetDoc(ref, n).catch(function(){});
    });
  }
}

// "알림장으로 저장": 입력란에서 반·오늘 과제·특이사항만 추출
function saveNotice() {
  var classEl = document.getElementById('f-class');
  var className = classEl ? (classEl.value||'').trim() : '';
  // 동적 과제 블록 동기화 후 오늘 과제 수집 (무제한)
  if (typeof serializeHomeworks === 'function') serializeHomeworks();
  var homework = (typeof _homeworks !== 'undefined' && Array.isArray(_homeworks))
    ? _homeworks.map(function(t){ return (t||'').trim(); }).filter(function(t){ return t !== ''; }).join('\n')
    : (document.getElementById('f-homework')||{value:''}).value.trim();
  var memo = (document.getElementById('f-memo')||{value:''}).value.trim();
  var date = (document.getElementById('f-date')||{value:''}).value || todayStr();

  if (!className) { showToast('반을 선택해주세요.', 'error'); return; }
  if (!homework && !memo) { showToast('오늘 과제 또는 특이사항을 입력해주세요.', 'error'); return; }

  var notice = {
    id: 'N' + Date.now(),
    type: 'notice',
    className: className,
    homework: homework,
    memo: memo,
    date: date,
    teacher: currentUser || '',
    createdAt: new Date().toISOString()
  };
  notices.unshift(notice);
  persistNotices();
  if (typeof resetForm === 'function') resetForm(); // 저장 후 입력란 초기화
  showToast('알림장에 저장되었습니다!');
  if (typeof updateNoticeClassFilter === 'function') updateNoticeClassFilter();
}

// 반 필터 옵션 갱신
function updateNoticeClassFilter() {
  var sel = document.getElementById('noticeFilterClass');
  if (!sel) return;
  var prev = sel.value;
  var classes = {};
  notices.forEach(function(n){ if(n.className) classes[n.className]=true; });
  var opts = '<option value="">전체 반</option>';
  Object.keys(classes).sort().forEach(function(c){ opts += '<option value="'+c.replace(/"/g,'&quot;')+'">'+c+'</option>'; });
  sel.innerHTML = opts;
  if (prev) sel.value = prev;
}


// 알림장 선생님 필터 (원장/관리자만 노출)
function updateNoticeTeacherFilter() {
  var sel = document.getElementById('noticeFilterTeacher');
  if (!sel) return;
  if (!isOwnerOrAdmin()) { sel.style.display = 'none'; sel.value = ''; return; }
  sel.style.display = '';
  var prev = sel.value;
  var teachers = {};
  notices.forEach(function(n){ if(n.teacher) teachers[n.teacher] = true; });
  var opts = '<option value="">전체 선생님</option>';
  Object.keys(teachers).sort().forEach(function(t){ opts += '<option value="'+t.replace(/"/g,'&quot;')+'">'+escapeNotice(t)+' 선생님</option>'; });
  sel.innerHTML = opts;
  if (prev) sel.value = prev;
}

// 알림장 목록 렌더링 (반별/날짜별 그룹)
function renderNotices() {
  updateNoticeClassFilter();
  updateNoticeTeacherFilter();
  var el = document.getElementById('noticeList');
  if (!el) return;
  var fc = (document.getElementById('noticeFilterClass')||{value:''}).value;
  var ft = (isOwnerOrAdmin() ? (document.getElementById('noticeFilterTeacher')||{value:''}).value : '');
  var groupBy = (document.getElementById('noticeGroupBy')||{value:'date'}).value;

  var list = notices.filter(function(n){
    if (fc && n.className !== fc) return false;
    if (ft && n.teacher !== ft) return false;
    return true;
  });
  if (list.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:30px;font-size:13px">\uc800\uc7a5\ub41c \uc54c\ub9bc\uc7a5\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.<br><span style="font-size:11px">\uc785\ub825 \ud0ed\uc5d0\uc11c "\uc54c\ub9bc\uc7a5\uc73c\ub85c \uc800\uc7a5"\uc744 \ub20c\ub7ec\ubcf4\uc138\uc694.</span></div>';
    return;
  }

  // \ub0a0\uc9dc \uadf8\ub8f9 1\uac1c HTML (\uc54c\ub9bc\uc7a5)
  function _noticeGroupHTML(key, items, gid){
    var h = '<div style="margin-bottom:8px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">'
      + '<div onclick="toggleNoticeGroup(\'' + gid + '\')" style="background:#ecfeff;padding:9px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-size:12px;font-weight:800;color:#0891b2">' + escapeNotice(key) + ' <span style="font-weight:600;color:#94a3b8;font-size:11px">' + items.length + '\uac74</span></span>'
      + '<span id="' + gid + '-arrow" style="color:#0891b2;font-size:11px">\u25bc</span>'
      + '</div>'
      + '<div id="' + gid + '" style="padding:10px">';
    items.forEach(function(n){ h += makeNoticeCard(n); });
    h += '</div></div>';
    return h;
  }

  // \ubc18\ubcc4 \uadf8\ub8f9\uc740 \uc6d4\ubcc4 \ubb36\uc74c \uc5c6\uc774 \uae30\uc874\ub300\ub85c
  if (groupBy === 'class') {
    var cmap = {};
    list.forEach(function(n){ var key=n.className||'\ubc18 \ubbf8\uc9c0\uc815'; (cmap[key]=cmap[key]||[]).push(n); });
    var ckeys = Object.keys(cmap).sort(function(a,b){ return a.localeCompare(b,'ko'); });
    el.innerHTML = ckeys.map(function(key,gi){ return _noticeGroupHTML(key, cmap[key], 'noticeGrp-'+gi); }).join('');
    return;
  }

  // \u2500\u2500 \ub0a0\uc9dc \uadf8\ub8f9: \uc774\ubc88 \ub2ec\uc740 \uadf8\ub300\ub85c, \uc9c0\ub09c \ub2ec\ub4e4\uc740 \uc6d4 \ub2e8\uc704\ub85c \ubb36\uc5b4 \uc811\uae30 \u2500\u2500
  var curYM = todayStr().slice(0,7);
  var curMap = {}, pastByYM = {};
  list.forEach(function(n){
    var d = n.date || '';
    var ym = d.slice(0,7);
    if (ym === curYM || !ym) { (curMap[d||'\ub0a0\uc9dc \ubbf8\uc0c1']=curMap[d||'\ub0a0\uc9dc \ubbf8\uc0c1']||[]).push(n); }
    else { (pastByYM[ym]=pastByYM[ym]||[]).push(n); }
  });

  var html = '';
  Object.keys(curMap).sort(function(a,b){return b.localeCompare(a);}).forEach(function(key,gi){
    html += _noticeGroupHTML(key, curMap[key], 'noticeGrp-c'+gi);
  });

  Object.keys(pastByYM).sort(function(a,b){return b.localeCompare(a);}).forEach(function(ym, mi){
    var items = pastByYM[ym];
    var mid = 'mon-not-'+mi;
    var label = ym.slice(0,4)+'\ub144 '+parseInt(ym.slice(5,7),10)+'\uc6d4';
    var inner='', dMap={};
    items.forEach(function(n){ var d=n.date||'\ub0a0\uc9dc \ubbf8\uc0c1'; (dMap[d]=dMap[d]||[]).push(n); });
    Object.keys(dMap).sort(function(a,b){return b.localeCompare(a);}).forEach(function(key,gi){
      inner += _noticeGroupHTML(key, dMap[key], mid+'-g'+gi);
    });
    html += '<div style="margin-bottom:8px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">'
      + '<div onclick="toggleMonthBox(\''+mid+'\')" style="background:#f1f5f9;padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-size:12px;font-weight:800;color:#475569">'+label+' <span style="font-weight:600;color:#94a3b8;font-size:11px">'+items.length+'\uac74</span></span>'
      + '<span id="'+mid+'-arrow" style="color:#94a3b8;font-size:12px">\u25b6</span>'
      + '</div>'
      + '<div id="'+mid+'" style="display:none;padding:10px">'+inner+'</div>'
      + '</div>';
  });

  el.innerHTML = html;
}
function toggleNoticeGroup(gid) {
  var body = document.getElementById(gid);
  var arrow = document.getElementById(gid + '-arrow');
  if (!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arrow) arrow.textContent = open ? '▶' : '▼';
}

function makeNoticeCard(n) {
  return '<div id="notice-card-' + n.id + '" style="background:#f0fdff;border:1.5px solid #a5f3fc;border-radius:10px;padding:12px;margin-bottom:8px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<span style="font-size:13px;font-weight:800;color:#0e7490"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0e7490" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>' + escapeNotice(n.className) + '</span>'
    + '<span style="font-size:11px;color:#94a3b8">' + (isOwnerOrAdmin() && n.teacher ? '<span style="color:#0891b2;font-weight:700;margin-right:6px">' + escapeNotice(n.teacher) + ' 선생님</span>' : '') + escapeNotice(n.date) + '</span>'
    + '</div>'
    + (n.homework ? '<div style="font-size:12px;color:#334155;margin-bottom:6px;white-space:pre-wrap"><b style="color:#0891b2">오늘 과제</b><br>' + escapeNotice(n.homework) + '</div>' : '')
    + (n.memo ? '<div style="font-size:12px;color:#334155;white-space:pre-wrap"><b style="color:#0891b2">특이사항</b><br>' + escapeNotice(n.memo) + '</div>' : '')
    + '<div class="notice-btns" style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
    + '<button onclick="saveNoticeCard(\'' + n.id + '\')" style="flex:1 1 auto;min-width:80px;background:#cffafe;border:1px solid #67e8f9;color:#0e7490;border-radius:8px;padding:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">이미지 저장</button>'
    + '<button onclick="saveNoticeCard(\'' + n.id + '\',\'share\')" style="flex:1 1 auto;min-width:80px;background:#fef3c7;border:1px solid #fcd34d;color:#d97706;border-radius:8px;padding:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">공유</button>'
    + '<button onclick="deleteNotice(\'' + n.id + '\')" style="flex:0 0 auto;background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">삭제</button>'
    + '</div>'
    + '</div>';
}

function deleteNotice(id) {
  if (!confirm('이 알림장을 삭제할까요?')) return;
  notices = notices.filter(function(n){ return n.id !== id; });
  localStorage.setItem(noticeKey(), JSON.stringify(notices));
  if (window.fbDb && currentSchool && currentSchool.length > 10) {
    window.fbDeleteDoc(window.fbDoc(window.fbDb, 'users', currentSchool, 'notices', String(id))).catch(function(){});
  }
  renderNotices();
  showToast('삭제되었습니다.');
}
