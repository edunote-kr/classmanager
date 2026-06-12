// EduNote 학원/원장 데이터 도메인 (schoolStore.js)
// classic <script> — preview.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// Firebase 학원 데이터 로딩·집계 계층. 정의:
//   loadSchoolStudents/loadSchoolTeachers(로스터), loadOwnerData(원장 전체집계),
//   loadSchoolData/loadSchoolStats(학원 조회·통계), loadSchools(superadmin 목록),
//   cleanupOwnerDupRecords(원장 중복사본 정리, window.* 노출).
//   top-level → window 전역. 호출처(로그인/탭전환/새로고침 버튼)는 모두 런타임.
// 런타임 의존(window 전역): records/notices/students/currentSchool/currentSchoolId/currentRole,
//   캐시 _schoolTeachers/_attEntries(모놀리스 var 전역), render* 함수, isOwnerOrAdmin/showToast/showLoading,
//   window.fbDb/fbAuth/fbGetDocs/fbCollection/fbDoc/fbSetDoc/fbDeleteDoc (fb.js).
// 잔류(모놀리스): isOwnerOrAdmin(공용 역할체크), 각종 캐시 var, render* UI 함수.
// 주의: 이 함수들을 다른 파일에서 재정의하지 말 것.

// 학원 공유 학생 풀 로드 (원장=전체, 선생님=배정된 것만)
function loadSchoolStudents() {
  if (!window.fbDb || !currentSchoolId) {
    console.warn('[학생로드] 조건 안 맞음. fbDb=', !!window.fbDb, 'schoolId=', currentSchoolId);
    return Promise.resolve();
  }
  console.log('[학생로드] 시작. schoolId=', currentSchoolId, 'role=', currentRole);
  return window.fbGetDocs(window.fbCollection(window.fbDb, 'schools', currentSchoolId, 'students'))
    .then(function(snap) {
      var all = [];
      snap.forEach(function(d){ all.push(Object.assign({id: d.id}, d.data())); });
      console.log('[학생로드] 가져온 학생 수=', all.length);
      if (currentRole === 'owner' || currentRole === 'superadmin') {
        students = all; // 원장은 전체
      } else {
        // 선생님: 자기 uid가 assignedTo에 포함된 학생만
        var myUid = currentSchool;
        students = all.filter(function(s){
          return Array.isArray(s.assignedTo) && s.assignedTo.indexOf(myUid) !== -1;
        });
      }
      localStorage.setItem(stuKey(), JSON.stringify(students));
      // 원장이면 선생님 목록도 미리 로드 (학생 카드/요약에 이름 표시용)
      if (currentRole === 'owner' || currentRole === 'superadmin') {
        return loadSchoolTeachers().then(function(){
          renderStudents(); updateStudentFilter(); updateClassSelect();
        });
      }
      renderStudents(); updateStudentFilter(); updateClassSelect();
    }).catch(function(err){
      console.error('[학생로드 실패]', err && err.code, err && err.message);
      showToast('학생 불러오기 실패: ' + (err && (err.code||err.message) || ''), 'error');
    });
}

// 학원 소속 선생님 목록 로드 (캐시 _schoolTeachers 채움)
function loadSchoolTeachers() {
  if (!window.fbDb || !currentSchoolId) return Promise.resolve();
  return window.fbGetDocs(window.fbQuery(
    window.fbCollection(window.fbDb, 'users'),
    window.fbWhere('schoolId', '==', currentSchoolId)
  )).then(function(snap){
    _schoolTeachers = [];
    snap.forEach(function(d){
      var u = d.data();
      if (u.role === 'teacher') _schoolTeachers.push({ uid: d.id, name: u.name || u.userId, userId: u.userId, phone: u.phone || '', status: u.status || 'active' });
    });
  }).catch(function(){ /* 선생님 목록 실패해도 학생 표시는 진행 */ });
}

// [중복정리] 과거 persist 버그로 원장 본인 서브컬렉션에 복사된 다른 선생님 기록(사본) 삭제.
// 원본은 각 선생님 계정(users/{teacherUid}/records)에 그대로 유지됨. 콘솔에서 1회 실행 권장.
async function cleanupOwnerDupRecords() {
  if (!isOwnerOrAdmin()) { showToast('원장만 사용할 수 있습니다.', 'error'); return; }
  if (!window.fbDb || !currentSchool) { showToast('학원 정보가 없습니다.', 'error'); return; }
  if (!confirm('원장 계정에 잘못 복사된 다른 선생님 과제·알림장 사본을 정리합니다.\n(각 선생님 원본은 그대로 유지됩니다) 계속할까요?')) return;
  showLoading(true);
  try {
    var removed = 0;
    var subs = ['records', 'notices'];
    for (var si = 0; si < subs.length; si++) {
      var snap = await window.fbGetDocs(window.fbCollection(window.fbDb, 'users', currentSchool, subs[si]));
      for (var i = 0; i < snap.docs.length; i++) {
        var d = snap.docs[i];
        var data = d.data() || {};
        // 본인(원장)이 작성한 것이 아니면 = 과거 버그로 복사된 사본 → 삭제
        if (data.teacher && data.teacher !== currentUser) {
          await window.fbDeleteDoc(d.ref);
          removed++;
        }
      }
    }
    showToast('중복 사본 정리 완료: ' + removed + '개 삭제');
    if (currentRole === 'owner') loadOwnerData(currentSchool);
  } catch (e) {
    showToast('정리 실패: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}
window.cleanupOwnerDupRecords = cleanupOwnerDupRecords;

function loadOwnerData(ownerUid) {
  showLoading(true);
  showToast('학원 정보를 불러오는 중입니다...', 'info');
  var expectedUid = ownerUid;
  var _pendingTimers = [];
  var _ownerLoadDone = false;
  var _ownerTimeout = setTimeout(function() {
    if (_ownerLoadDone) return;
    showLoading(false);
    showToast('학원 데이터 로딩이 지연됩니다. 저장된 데이터로 표시합니다.', 'info');
  }, 15000);
  function finishOwnerLoad() {
    _ownerLoadDone = true;
    clearTimeout(_ownerTimeout);
    _pendingTimers.forEach(function(t){ clearTimeout(t); });
    _pendingTimers = [];
    showLoading(false);
  }
  var memberUids = [ownerUid]; // 원장 본인 포함 (두 번째 then에서도 사용)
  var uidByName = {};          // 이름→uid (중복 제거 시 작성자 본인 서브컬렉션 우선용)
  // 같은 schoolId를 가진 모든 사용자 조회
  var usersRef = window.fbCollection(window.fbDb, 'users');
  var q = window.fbQuery(usersRef, window.fbWhere('schoolId', '==', currentSchoolId));

  window.fbGetDocs(q).then(function(snap) {
    if (!window.currentUser) { finishOwnerLoad(); return Promise.reject('cancelled'); }
    if (window.fbAuth && window.fbAuth.currentUser && window.fbAuth.currentUser.uid !== expectedUid) {
      finishOwnerLoad(); return Promise.reject('cancelled');
    }
    snap.forEach(function(d) {
      var u = d.data() || {};
      if (u.name) uidByName[u.name] = d.id;
      if (d.id !== ownerUid) memberUids.push(d.id);
    });

    // 하위컬렉션 읽기 타임아웃 래퍼: 매달리면 빈 결과로 처리하고 진행
    var _emptySnap = { forEach: function(){}, size: 0 };
    function getDocsTO(collRef) {
      var timer;
      return Promise.race([
        window.fbGetDocs(collRef),
        new Promise(function(resolve){ timer = setTimeout(function(){ resolve(_emptySnap); }, 8000); _pendingTimers.push(timer); })
      ]).then(function(r){ clearTimeout(timer); return r; })
        .catch(function(){ clearTimeout(timer); return _emptySnap; });
    }

    // 모든 멤버 records 병렬 로드 (학생은 학원 공유 풀에서 별도 로드)
    var recPromises = memberUids.map(function(uid) {
      return getDocsTO(window.fbCollection(window.fbDb, 'users', uid, 'records'));
    });
    // 모든 멤버 notices(알림장)도 병렬 로드 → 원장이 전체 알림장 확인
    var notPromises = memberUids.map(function(uid) {
      return getDocsTO(window.fbCollection(window.fbDb, 'users', uid, 'notices'));
    });

    return Promise.all([Promise.all(recPromises), Promise.all(notPromises)]);
  }).then(function(results) {
    if (!results) { finishOwnerLoad(); return; }
    if (!window.currentUser) { finishOwnerLoad(); return; }
    if (window.fbAuth && window.fbAuth.currentUser && window.fbAuth.currentUser.uid !== expectedUid) {
      finishOwnerLoad(); return;
    }
    // 같은 record id가 여러 서브컬렉션에서 올 수 있음(과거 persist 버그로 원장 서브컬렉션에
    // 다른 선생님 기록이 복사된 경우). id별로 1개만 유지하되, 작성자(teacher) 본인의
    // 서브컬렉션에서 온 것을 우선 채택해 stale 복사본이 이기지 않게 한다.
    var byId = {};
    (results[0] || []).forEach(function(snap, idx) {
      var srcUid = memberUids[idx];
      if (!snap || !snap.forEach) return;
      snap.forEach(function(d) {
        var r = Object.assign({ id: d.id }, d.data());
        var rightful = uidByName[r.teacher] || ownerUid; // 이 기록의 정당한 작성자 uid
        var prev = byId[r.id];
        if (!prev) { byId[r.id] = { rec: r, src: srcUid, rightful: rightful }; return; }
        var prevIsRightful = (prev.src === prev.rightful);
        var newIsRightful  = (srcUid === rightful);
        if (newIsRightful && !prevIsRightful) byId[r.id] = { rec: r, src: srcUid, rightful: rightful };
      });
    });
    var allRecs = Object.keys(byId).map(function(k){ return byId[k].rec; });

    records = allRecs.map(normalizeRec);

    // 알림장(notices)도 동일하게 작성자 우선 dedup
    var nById = {};
    (results[1] || []).forEach(function(snap, idx) {
      var srcUid = memberUids[idx];
      if (!snap || !snap.forEach) return;
      snap.forEach(function(d) {
        var n = Object.assign({ id: d.id }, d.data());
        var rightful = uidByName[n.teacher] || ownerUid;
        var prev = nById[n.id];
        if (!prev) { nById[n.id] = { rec: n, src: srcUid, rightful: rightful }; return; }
        var prevIsRightful = (prev.src === prev.rightful);
        var newIsRightful  = (srcUid === rightful);
        if (newIsRightful && !prevIsRightful) nById[n.id] = { rec: n, src: srcUid, rightful: rightful };
      });
    });
    var allNots = Object.keys(nById).map(function(k){ return nById[k].rec; });
    allNots.sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); });
    notices = allNots;
    localStorage.setItem(noticeKey(), JSON.stringify(notices));

    persist();
    persistNotices();
    loadSchoolStudents(); // 학원 공유 학생 풀 로드 (원장=전체)
    setupAdminFilter(); // 원장도 선생님 필터 사용
    renderAll(); updateLoadSelect(); updateStudentFilter(); renderStudents(); updateClassSelect();
    if (typeof renderNotices === 'function') renderNotices();
    showToast('학원 전체 데이터 불러오기 완료!');
  }).catch(function(e) {
    if (e === 'cancelled') return;
    showToast('오프라인 모드', 'info');
  }).finally(function() { finishOwnerLoad(); });
}

// 학원 데이터 조회 (목록 + 통계)
function loadSchoolData() {
  var sel = document.getElementById('adminSchoolSelect');
  var schoolId = sel ? sel.value : '';
  var schoolName = sel ? (sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].getAttribute('data-name') : '') : '';
  var el = document.getElementById('adminSchoolData');
  if (!schoolId) { el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:40px;font-size:13px">학원을 선택해주세요</div>'; return; }

  el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:40px;font-size:13px">로딩 중...</div>';

  // 해당 학원 사용자 찾기
  window.fbGetDoc(window.fbDoc(window.fbDb, 'schools', schoolId)).then(function(schoolSnap) {
    var schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
    var ownerCode = schoolData.ownerCode || '';
    var teacherCode = schoolData.teacherCode || '';

    return window.fbGetDocs(window.fbCollection(window.fbDb, 'users')).then(function(userSnap) {
      var members = [];
      userSnap.forEach(function(d) {
        var u = d.data();
        if (u.role === 'superadmin') return;
        if (u.schoolId === schoolId || u.schoolId === ownerCode || u.schoolId === teacherCode ||
            (u.schoolName && schoolName && u.schoolName.trim() === schoolName.trim())) {
          members.push(Object.assign({uid: d.id}, u));
        }
      });

      if (members.length === 0) {
        el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:40px;font-size:13px">소속 사용자가 없습니다</div>';
        return;
      }

      // 모든 사용자의 records 가져오기
      var recordPromises = members.map(function(m) {
        return window.fbGetDocs(window.fbCollection(window.fbDb, 'users', m.uid, 'records'))
          .then(function(rSnap) {
            var recs = [];
            rSnap.forEach(function(r) { recs.push(Object.assign({_id: r.id, _teacher: m.name || m.userId}, r.data())); });
            return recs;
          });
      });
      // 모든 사용자의 알림장(notices) 가져오기
      var noticePromises = members.map(function(m) {
        return window.fbGetDocs(window.fbCollection(window.fbDb, 'users', m.uid, 'notices'))
          .then(function(nSnap) {
            var nts = [];
            nSnap.forEach(function(nn) { nts.push(Object.assign({_id: nn.id, _teacher: m.name || m.userId}, nn.data())); });
            return nts;
          })
          .catch(function(){ return []; });
      });

      return Promise.all([Promise.all(recordPromises), Promise.all(noticePromises)]).then(function(res) {
        // 같은 doc id가 여러 멤버 서브컬렉션에서 올 수 있음(과거 복사본). 작성자(_teacher) 본인의
        // 서브컬렉션 것을 우선해 id별 1개만 유지 → 학원에서 삭제한 항목이 잔존/중복되지 않음.
        function dedupByAuthor(arr) {
          var map = {};
          arr.forEach(function(it) {
            var key = String(it._id);
            var prev = map[key];
            if (!prev) { map[key] = it; return; }
            // it._teacher = 이 사본이 들어있던 멤버 이름. it.teacher = 실제 작성자.
            var prevRight = (prev._teacher === prev.teacher);
            var newRight  = (it._teacher === it.teacher);
            if (newRight && !prevRight) map[key] = it;
          });
          return Object.keys(map).map(function(k){ return map[k]; });
        }
        var records = dedupByAuthor([].concat.apply([], res[0]));
        records.sort(function(a,b) { return (b.date||'').localeCompare(a.date||''); });
        var schoolNotices = dedupByAuthor([].concat.apply([], res[1]));
        schoolNotices.sort(function(a,b) { return (b.date||'').localeCompare(a.date||''); });
        renderAdminSchoolData(schoolName, members, records, schoolNotices);
      });
    });
  });
}

function loadSchoolStats() {
  var el = document.getElementById('schoolStatList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px">로딩 중...</div>';

  Promise.all([
    window.fbGetDocs(window.fbCollection(window.fbDb, 'schools')),
    window.fbGetDocs(window.fbCollection(window.fbDb, 'users'))
  ]).then(function(results) {
    var schoolSnap = results[0];
    var userSnap   = results[1];

    var schools = [];
    schoolSnap.forEach(function(d) { schools.push(Object.assign({id: d.id}, d.data())); });

    if (schools.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px">등록된 학원이 없습니다</div>';
      return;
    }

    // 학생 수 + 이번 달 발송 병렬 카운트 (학원당 students 1쿼리 + sendLogs 1쿼리)
    var _now = new Date();
    var _monthStart = new Date(_now.getFullYear(), _now.getMonth(), 1).getTime();
    return Promise.all(schools.map(function(s){
      var pStu = window.fbGetDocs(window.fbCollection(window.fbDb, 'schools', s.id, 'students'))
        .then(function(stuSnap){
          var total = 0, active = 0;
          stuSnap.forEach(function(sd){
            total++;
            var st = (sd.data() || {}).status;
            if (st !== 'withdrawn' && st !== 'leave') active++;
          });
          s._stuTotal = total; s._stuActive = active;
        })
        .catch(function(){ s._stuTotal = null; s._stuActive = null; });
      var pSend = window.fbGetDocs(window.fbQuery(
          window.fbCollection(window.fbDb, 'schools', s.id, 'sendLogs'),
          window.fbWhere('sentAt', '>=', _monthStart)
        ))
        .then(function(snap){
          var sms = 0, alim = 0;
          snap.forEach(function(d){ var r = d.data() || {}; if (r.channel === 'sms') sms++; else alim++; });
          s._sendSms = sms; s._sendAlim = alim;
        })
        .catch(function(){ s._sendSms = 0; s._sendAlim = 0; });
      return Promise.all([pStu, pSend]);
    })).then(function(){ renderSchoolStatCards(el, schools, userSnap); });
  }).catch(function(e){
    el.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px;font-size:13px">불러오기 실패: ' + (e && (e.code||e.message) || '') + '</div>';
  });
}

// ── 학원 통계 헬퍼 ──────────────────────────
function _statPlanBadge(plan){
  plan = plan || 'basic';
  var m = {
    basic:    ['#eef2ff','#4f46e5','베이직'],
    standard: ['#ecfeff','#0891b2','스탠다드'],
    premium:  ['#fef3c7','#d97706','프리미엄'],
    free:     ['#f1f5f9','#64748b','무료']
  };
  var c = m[plan] || ['#f1f5f9','#64748b', plan];
  return '<span style="font-size:10px;font-weight:800;padding:2px 9px;border-radius:6px;background:'+c[0]+';color:'+c[1]+'">'+c[2]+'</span>';
}
function _statDdayBadge(expiresAt){
  if(!expiresAt) return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#94a3b8">만료일 없음</span>';
  var exp = new Date(expiresAt);
  var diff = Math.ceil((exp - new Date()) / 86400000);
  var color, bg, txt;
  if(diff < 0){ color='#dc2626'; bg='#fee2e2'; txt='만료 '+Math.abs(diff)+'일 경과'; }
  else if(diff <= 7){ color='#dc2626'; bg='#fee2e2'; txt='D-'+diff+' 임박'; }
  else if(diff <= 30){ color='#d97706'; bg='#fef3c7'; txt='D-'+diff; }
  else { color='#16a34a'; bg='#f0fdf4'; txt='D-'+diff; }
  return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:'+bg+';color:'+color+'">'+expiresAt.slice(0,10)+' · '+txt+'</span>';
}
function _statCreditBox(label, color, ch){
  ch = ch || {};
  var free = ch.free || 0, paid = ch.paid || 0, tot = free + paid;
  return '<div style="flex:1;background:#f8fafc;border-radius:8px;padding:8px 10px;min-width:0">'
    + '<div style="font-size:10px;color:#94a3b8;margin-bottom:2px">'+label+'</div>'
    + '<div style="font-size:16px;font-weight:900;color:'+color+'">'+tot+'<span style="font-size:10px;color:#94a3b8;font-weight:600"> 건</span></div>'
    + '<div style="font-size:9px;color:#94a3b8">무료 '+free+' · 충전 '+paid+'</div>'
    + '</div>';
}
function _statSummaryBox(val, label, color){
  return '<div style="background:#fff;border-radius:10px;padding:10px 8px;text-align:center;border:1px solid #e2e8f0">'
    + '<div style="font-size:18px;font-weight:900;color:'+color+'">'+val+'</div>'
    + '<div style="font-size:10px;color:#94a3b8;margin-top:2px">'+label+'</div></div>';
}
function _statActiveBadge(lastActiveAt){
  if(!lastActiveAt) return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#94a3b8">활동기록 수집 전</span>';
  var diff = Math.floor((new Date() - new Date(lastActiveAt)) / 86400000);
  var txt = diff <= 0 ? '오늘' : (diff + '일 전');
  var color, bg;
  if(diff >= 14){ color='#dc2626'; bg='#fee2e2'; }
  else if(diff >= 7){ color='#d97706'; bg='#fef3c7'; }
  else { color='#16a34a'; bg='#f0fdf4'; }
  return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:'+bg+';color:'+color+'">마지막 활동 '+txt+'</span>';
}

// 발송 단가(원/건, 추정 — 실단가는 solapi.com/pricing 확인 후 조정)
var SEND_COST = { sms: 20, alimtalk: 10 };
function _estSendCost(sms, alim){ return (sms||0)*SEND_COST.sms + (alim||0)*SEND_COST.alimtalk; }

function renderSchoolStatCards(el, schools, userSnap){
  var now = new Date();
  // 학원별 마지막 활동 = 멤버 user lastActiveAt 최댓값
  schools.forEach(function(s){
    var maxLA = '';
    userSnap.forEach(function(d){
      var u = d.data();
      if(u.role === 'superadmin') return;
      var match = (u.schoolId===s.id || u.schoolId===s.ownerCode || u.schoolId===s.teacherCode || (u.schoolName && s.name && u.schoolName.trim()===s.name.trim()));
      if(match && u.lastActiveAt && u.lastActiveAt > maxLA) maxLA = u.lastActiveAt;
    });
    s._lastActiveAt = maxLA;
  });
  // 전체 집계
  var total = schools.length;
  var activeN = 0, soonN = 0, expiredN = 0, paidN = 0, trialN = 0, totSms = 0, totAlim = 0, dormantN = 0, sendSmsN = 0, sendAlimN = 0;
  schools.forEach(function(s){
    if(s.status === 'active') activeN++;
    if(s.expiresAt){
      var d = Math.ceil((new Date(s.expiresAt) - now) / 86400000);
      if(d < 0) expiredN++;
      else if(d <= 30) soonN++;
    }
    if(s._lastActiveAt){
      var la = Math.floor((now - new Date(s._lastActiveAt)) / 86400000);
      if(la >= 14) dormantN++;
    }
    var p = s.plan || 'basic';
    if(p === 'free' || !s.plan) trialN++; else paidN++;
    var n = s.notif || {};
    var sm = n.sms || {}, al = n.alimtalk || {};
    totSms  += (sm.free||0) + (sm.paid||0);
    totAlim += (al.free||0) + (al.paid||0);
    sendSmsN  += (s._sendSms||0);
    sendAlimN += (s._sendAlim||0);
  });

  var summary = '<div style="background:linear-gradient(135deg,#f8fafc,#eef2ff);border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:6px">'
    + '<div style="font-size:12px;font-weight:800;color:#475569;margin-bottom:10px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg> 전체 요약</div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px">'
    + _statSummaryBox(total, '총 학원', '#1e293b')
    + _statSummaryBox(activeN, '활성', '#16a34a')
    + _statSummaryBox(paidN, '유료', '#6366f1')
    + _statSummaryBox(trialN, '체험', '#f59e0b')
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'
    + _statSummaryBox(soonN, '만료 임박', soonN>0?'#d97706':'#94a3b8')
    + _statSummaryBox(expiredN, '만료됨', expiredN>0?'#dc2626':'#94a3b8')
    + _statSummaryBox(dormantN, '휴면(14일+)', dormantN>0?'#dc2626':'#94a3b8')
    + _statSummaryBox(totSms+totAlim, '총 크레딧', '#0891b2')
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px">'
    + _statSummaryBox((sendSmsN+sendAlimN)+'건', '이번 달 발송 (문자'+sendSmsN+'·알림톡'+sendAlimN+')', '#0891b2')
    + _statSummaryBox('₩'+_estSendCost(sendSmsN, sendAlimN).toLocaleString(), '추정 원가', '#dc2626')
    + '</div>'
    + '</div>';

  var cards = schools.map(function(s) {
    var members = [];
    userSnap.forEach(function(d) {
      var u = d.data();
      if (u.role === 'superadmin') return;
      if (u.schoolId === s.id ||
          u.schoolId === s.ownerCode ||
          u.schoolId === s.teacherCode ||
          (u.schoolName && s.name && u.schoolName.trim() === s.name.trim())) {
        members.push(u);
      }
    });

    var ownerCount   = members.filter(function(u) { return u.role === 'owner'; }).length;
    var teacherCount = members.filter(function(u) { return u.role === 'teacher'; }).length;
    var activeCount  = members.filter(function(u) { return u.status === 'active'; }).length;
    var waitCount    = members.filter(function(u) { return u.status !== 'active'; }).length;
    var maxTeachers  = s.teacherCount !== undefined ? s.teacherCount : (s.maxTeachers ? s.maxTeachers - 1 : 0);
    var usageRate    = maxTeachers > 0 ? Math.round(teacherCount / maxTeachers * 100) : 0;
    var isActive     = s.status === 'active';
    var couponUsed   = members.some(function(u){ return u.role === 'owner' && u.freeTrialUsed; });
    var notif        = s.notif || {};
    var stuLabel     = (s._stuTotal == null) ? '-' : (s._stuActive + (s._stuTotal !== s._stuActive ? ' <span style="font-size:11px;color:#94a3b8">/ '+s._stuTotal+'</span>' : ''));

    return '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff">'
      // 학원명 + 상태
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'
      + '<div style="min-width:0">'
      + '<div style="font-size:14px;font-weight:800;color:#1e293b"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M14 22v-4a2 2 0 1 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17"/><path d="m4 6 8-4 8 4"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/></svg>' + escHtml(s.name) + '</div>'
      + '<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + _statPlanBadge(s.plan) + _statDdayBadge(s.expiresAt) + _statActiveBadge(s._lastActiveAt) + '</div>'
      + '<div style="font-size:11px;color:#94a3b8;margin-top:6px">생성: ' + (s.createdAt ? s.createdAt.slice(0,10) : '-') + '</div>'
      + '<div style="margin-top:4px"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:' + (couponUsed ? '#fef3c7' : '#f1f5f9') + ';color:' + (couponUsed ? '#d97706' : '#94a3b8') + '">무료체험 쿠폰 ' + (couponUsed ? '사용됨' : '미사용') + '</span></div>'
      + '</div>'
      + '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;background:' + (isActive ? '#dcfce7' : '#fee2e2') + ';color:' + (isActive ? '#16a34a' : '#dc2626') + '">' + (isActive ? '활성' : '비활성') + '</span>'
      + '</div>'
      // 크레딧
      + '<div style="display:flex;gap:8px;margin-bottom:8px">'
      + _statCreditBox('문자 크레딧', '#0891b2', notif.sms)
      + _statCreditBox('알림톡 크레딧', '#7c3aed', notif.alimtalk)
      + '</div>'
      // 이번 달 발송 + 추정원가
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 11px;background:#f8fafc;border-radius:8px;margin-bottom:12px;font-size:11px">'
      + '<span style="color:#64748b">이번 달 발송 <b style="color:#0891b2">' + ((s._sendSms||0)+(s._sendAlim||0)) + '건</b> <span style="color:#cbd5e1">(문자' + (s._sendSms||0) + '·알림톡' + (s._sendAlim||0) + ')</span></span>'
      + '<span style="color:#64748b">추정원가 <b style="color:#dc2626">₩' + _estSendCost(s._sendSms, s._sendAlim).toLocaleString() + '</b></span>'
      + '</div>'
      // 인원 통계 (원장/선생님/학생/대기)
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">'
      + '<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center">'
      + '<div style="font-size:18px;font-weight:900;color:#6366f1">' + ownerCount + '</div>'
      + '<div style="font-size:10px;color:#94a3b8;margin-top:2px">원장</div></div>'
      + '<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center">'
      + '<div style="font-size:18px;font-weight:900;color:#0891b2">' + teacherCount + ' <span style="font-size:11px;color:#94a3b8">/ ' + maxTeachers + '</span></div>'
      + '<div style="font-size:10px;color:#94a3b8;margin-top:2px">선생님</div></div>'
      + '<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center">'
      + '<div style="font-size:18px;font-weight:900;color:#16a34a">' + stuLabel + '</div>'
      + '<div style="font-size:10px;color:#94a3b8;margin-top:2px">학생</div></div>'
      + '<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center">'
      + '<div style="font-size:18px;font-weight:900;color:#f59e0b">' + waitCount + '</div>'
      + '<div style="font-size:10px;color:#94a3b8;margin-top:2px">대기</div></div>'
      + '</div>'
      // 선생님 사용률 바
      + '<div style="margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-size:11px;color:#64748b">선생님 사용률</span>'
      + '<span style="font-size:11px;font-weight:700;color:#6366f1">' + usageRate + '%</span>'
      + '</div>'
      + '<div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden">'
      + '<div style="height:100%;width:' + Math.min(usageRate,100) + '%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:3px;transition:width 0.5s"></div>'
      + '</div>'
      + '</div>';
  }).join('');

  el.innerHTML = summary + cards;
}

function loadSchools() {
  var schoolsRef = window.fbCollection(window.fbDb, 'schools');
  window.fbGetDocs(schoolsRef).then(function(snap) {
    var schools = [];
    snap.forEach(function(d) { schools.push(Object.assign({id: d.id}, d.data())); });

    // 통계
    document.getElementById('adminTotalSchools').textContent = schools.length;
    document.getElementById('adminActiveSchools').textContent = schools.filter(function(s){ return s.status === 'active'; }).length;

    // 사용자 수 (superadmin 제외)
    window.fbGetDocs(window.fbCollection(window.fbDb, 'users')).then(function(uSnap) {
      var userCount = 0;
      uSnap.forEach(function(d) {
        var data = d.data();
        if (data.role !== 'superadmin') userCount++;
      });
      document.getElementById('adminTotalUsers').textContent = userCount;
    });

    // 목록 렌더링
    var el = document.getElementById('schoolList');
    if (schools.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px">등록된 학원이 없습니다</div>';
      return;
    }
    el.innerHTML = schools.map(function(s) {
      var statusColor = s.status === 'active' ? '#16a34a' : '#ef4444';
      var statusBg    = s.status === 'active' ? '#dcfce7' : '#fee2e2';
      var statusText  = s.status === 'active' ? '활성' : '비활성';
      var tCount      = s.teacherCount !== undefined ? s.teacherCount : (s.maxTeachers ? s.maxTeachers - 1 : 0);
      var expStr      = s.expiresAt ? s.expiresAt.slice(0,10) : '미설정';
      var isExpired   = s.expiresAt && new Date() > new Date(s.expiresAt);
      return '<div data-school-name="' + (s.name||'').replace(/"/g,'&quot;') + '" style="border:1.5px solid ' + (isExpired ? '#fca5a5' : '#e2e8f0') + ';border-radius:10px;padding:14px;background:' + (isExpired ? '#fff5f5' : '#f8fafc') + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        + '<span style="font-size:14px;font-weight:800;color:#1e293b"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M14 22v-4a2 2 0 1 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17"/><path d="m4 6 8-4 8 4"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/></svg>' + escHtml(s.name) + '</span>'
        + '<div style="display:flex;gap:6px;align-items:center">'
        + (isExpired ? '<span style="font-size:10px;font-weight:700;color:#dc2626;background:#fee2e2;padding:2px 8px;border-radius:10px">만료</span>' : '')
        + '<span style="background:' + statusBg + ';color:' + statusColor + ';font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">' + statusText + '</span>'
        + '</div>'
        + '</div>'
        // 만료일 + 연장 버튼
        + '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid ' + (isExpired?'#fca5a5':'#e2e8f0') + ';border-radius:8px;padding:8px 12px;margin-bottom:10px">'
        + '<span style="font-size:12px;color:#64748b;white-space:nowrap"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> 만료일:</span>'
        + '<span style="font-size:13px;font-weight:700;color:' + (isExpired?'#dc2626':'#1e293b') + '">' + expStr + '</span>'
        + '<button onclick="extendSchoolExpiry(\'' + s.id + '\',\'' + (s.expiresAt||'') + '\')" '
        + 'style="margin-left:auto;font-size:11px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:6px;padding:4px 12px;cursor:pointer;font-family:inherit;font-weight:700"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> 연장</button>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
        + '<div style="background:#ede9fe;border-radius:8px;padding:8px">'
        + '<div style="font-size:10px;color:#7c3aed;font-weight:700;margin-bottom:2px">원장 코드</div>'
        + '<div style="font-size:16px;font-weight:900;color:#4f46e5;letter-spacing:2px;margin-bottom:6px">' + s.ownerCode + '</div>'
        + '<button onclick="reissueCode(\'' + s.id + '\',\'owner\',\'' + escJsArg(s.name) + '\')" style="width:100%;font-size:10px;background:#fff;color:#7c3aed;border:1px solid #c4b5fd;border-radius:6px;padding:4px;cursor:pointer;font-family:inherit;font-weight:700"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg> 재발급</button>'
        + '</div>'
        + '<div style="background:#dbeafe;border-radius:8px;padding:8px">'
        + '<div style="font-size:10px;color:#1d4ed8;font-weight:700;margin-bottom:2px">선생님 코드</div>'
        + '<div style="font-size:16px;font-weight:900;color:#1d4ed8;letter-spacing:2px;margin-bottom:6px">' + s.teacherCode + '</div>'
        + '<button onclick="reissueCode(\'' + s.id + '\',\'teacher\',\'' + escJsArg(s.name) + '\')" style="width:100%;font-size:10px;background:#fff;color:#1d4ed8;border:1px solid #93c5fd;border-radius:6px;padding:4px;cursor:pointer;font-family:inherit;font-weight:700"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg> 재발급</button>'
        + '</div>'
        + '</div>'
        // 인원수 인라인 조정
        + '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin-bottom:10px">'
        + '<span style="font-size:12px;color:#475569;white-space:nowrap"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> 원장 1 +</span>'
        + '<input type="number" id="tc-' + s.id + '" value="' + tCount + '" min="0" max="99" '
        + 'style="width:52px;padding:4px 6px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:14px;font-weight:700;text-align:center;font-family:inherit">'
        + '<span style="font-size:12px;color:#475569;white-space:nowrap">명</span>'
        + '<button onclick="saveSchoolLimit(\'' + s.id + '\')" '
        + 'style="margin-left:auto;font-size:11px;background:#6366f1;color:#fff;border:none;border-radius:6px;padding:5px 14px;cursor:pointer;font-family:inherit;font-weight:700">저장</button>'
        + '</div>'
        // 플랜 변경
        + '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin-bottom:10px">'
        + '<span style="font-size:12px;color:#475569;white-space:nowrap;font-weight:700">플랜</span>'
        + '<select id="plan-' + s.id + '" style="flex:1;padding:5px 8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:13px;font-family:inherit;background:#fff;font-weight:700">'
        + ['free','basic','standard','premium'].map(function(pk){
            var pn = {free:'무료 체험',basic:'베이직',standard:'스탠다드',premium:'프리미엄'}[pk];
            return '<option value="'+pk+'"'+(s.plan===pk?' selected':'')+'>'+pn+'</option>';
          }).join('')
        + '</select>'
        + '<button onclick="saveSchoolPlan(\'' + s.id + '\')" style="font-size:11px;background:#6366f1;color:#fff;border:none;border-radius:6px;padding:5px 14px;cursor:pointer;font-family:inherit;font-weight:700">저장</button>'
        + '</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button onclick="copyCode(\'' + s.ownerCode + '\')" style="font-size:11px;background:#ede9fe;color:#6366f1;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-family:inherit">원장코드 복사</button>'
        + '<button onclick="copyCode(\'' + s.teacherCode + '\')" style="font-size:11px;background:#dbeafe;color:#1d4ed8;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-family:inherit">선생님코드 복사</button>'
        + '<button onclick="toggleSchoolStatus(\'' + s.id + '\',\'' + s.status + '\')" style="font-size:11px;background:' + (s.status==='active' ? '#fee2e2' : '#dcfce7') + ';color:' + (s.status==='active' ? '#dc2626' : '#16a34a') + ';border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-family:inherit">' + (s.status==='active' ? '비활성화' : '활성화') + '</button>'
        + '<button onclick="showSchoolUsers(\'' + s.id + '\',\'' + escJsArg(s.name) + '\')" style="font-size:11px;background:#f1f5f9;color:#475569;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-family:inherit"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 사용자</button>'
        + '<button onclick="deleteSchool(\'' + s.id + '\',\'' + escJsArg(s.name) + '\')" style="font-size:11px;background:#fee2e2;color:#dc2626;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-family:inherit"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> 삭제</button>'
        + '</div>'
        + '</div>';
    }).join('');
  });
}
