// EduNote 슈퍼관리자 대시보드 모듈 (admin.js)
// classic <script> — nav.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// 학원/유저 관리, 코드 재발급, 플랜/한도/만료 관리, 만료 알림. (superadmin 전용)
// 정의: statBox/getPlanLimit/addSchool/copyCode/loadAllUsers/toggleUserStatus*/showCreateUserModal/submitCreateUser/
//   showSchoolUsers/deleteUserAccount/extendSchoolExpiry/saveSchoolLimit/saveSchoolPlan/generateUniqueCode/reissueCode/
//   setSchoolLimit/deleteSchool/toggleSchoolStatus/showAdminToast/initAdminDashboard/checkExpiryAlerts. (top-level → window 전역)
// 의존: SUPER_ADMIN_UID(core.js 로 승격), loadSchools/loadAllUsers 데이터(schoolStore/모놀리스), showToast/showLoading, fb 래퍼.
// 잔류(모놀리스/별도): 문의·크레딧 승인(approveCreditApplication/grantFreeCoupon 등 — 결제 트랙), schoolName 인덱스(writeSchoolNameIndex 등).
// 주의: 다른 파일에서 재정의 금지.

function statBox(val, label, color) {
  return '<div style="background:#fff;border-radius:10px;padding:14px;border:1px solid #e2e8f0;text-align:center">'
    + '<div style="font-size:22px;font-weight:900;color:' + color + '">' + val + '</div>'
    + '<div style="font-size:11px;color:#94a3b8;margin-top:4px">' + label + '</div>'
    + '</div>';
}


// ── 관리자 대시보드 ─────────────────────────────────────────


function getPlanLimit(plan) {
  if (plan === 'basic') return 1;
  if (plan === 'standard') return 4;
  if (plan === 'premium') return 11;
  return 1;
}

function addSchool() {
  var name = document.getElementById('newSchoolName').value.trim();
  var plan = document.getElementById('newSchoolPlan').value;
  var teacherCount = parseInt(document.getElementById('newSchoolTeachers').value) || 0;
  var days = parseInt(document.getElementById('newSchoolMonths').value) || 365;
  if (!name) { showAdminToast('학원명을 입력해주세요.', 'error'); return; }

  // 만료일 계산 (일수 기준)
  var expDate = new Date();
  expDate.setDate(expDate.getDate() + days);
  var expiresAt = expDate.toISOString().slice(0,10);

  var ownerCode   = generateCode(6);
  var teacherCode = generateCode(6);
  var schoolId    = generateCode(10);
  var maxTeachers = 1 + teacherCount;

  window.fbSetDoc(window.fbDoc(window.fbDb, 'schools', schoolId), {
    name: name,
    plan: plan,
    maxOwners: 1,
    maxTeachers: maxTeachers,
    teacherCount: teacherCount,
    ownerCode: ownerCode,
    teacherCode: teacherCode,
    expiresAt: expiresAt,
    status: 'active',
    createdAt: new Date().toISOString(),
    ownerUid: ''
  }).then(function() {
    writeSchoolNameIndex(name, teacherCode, schoolId, ownerCode);
    document.getElementById('newSchoolName').value = '';
    document.getElementById('newSchoolTeachers').value = '3';
    document.getElementById('newSchoolMonths').value = '365';
    showAdminToast('' + name + ' 추가! 원장1 + 선생님' + teacherCount + '명 · ' + days + '일(' + expiresAt + ')');
    loadSchools();
    loadSchoolStats();
  }).catch(function(err) {
    showAdminToast('오류: ' + err.message, 'error');
  });
}

// ── 학원 목록(superadmin) → schoolStore.js ──


function copyCode(code) {
  navigator.clipboard.writeText(code).then(function() {
    showAdminToast('' + code + ' 복사됨!');
  }).catch(function() {
    showAdminToast(code, 'info');
  });
}

function loadAllUsers() {
  var el = document.getElementById('allUsersList');
  el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px">로딩 중...</div>';

  window.fbGetDocs(window.fbCollection(window.fbDb, 'users')).then(function(snap) {
    var users = [];
    snap.forEach(function(d) {
      if (d.data().role !== 'superadmin') users.push(Object.assign({uid: d.id}, d.data()));
    });

    if (users.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px">사용자 없음</div>';
      return;
    }

    // 상태별 정렬 (비활성 먼저)
    users.sort(function(a,b) {
      if (a.status === 'inactive' && b.status !== 'inactive') return -1;
      if (a.status !== 'inactive' && b.status === 'inactive') return 1;
      return 0;
    });

    el.innerHTML = users.map(function(u) {
      var isActive = u.status === 'active';
      var statusColor = isActive ? '#16a34a' : '#ef4444';
      var statusBg = isActive ? '#dcfce7' : '#fee2e2';
      var statusText = isActive ? '활성' : '대기/비활성';
      return '<div data-urow="' + u.uid + '" data-uname="' + (u.name||u.userId||'이름없음').replace(/"/g,'&quot;') + '" data-user-name="' + ((u.name||'')+' '+(u.userId||'')+' '+(u.schoolName||'')).replace(/"/g,'&quot;') + '" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">'
        + '<div>'
        + '<div style="font-size:13px;font-weight:700;color:#1e293b"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' + (u.name||u.userId||'이름없음') + '</div>'
        + '<div style="font-size:11px;color:#94a3b8;margin-top:2px">'
        + (u.role||'teacher') + ' · ' + (u.schoolName||'학원없음') + ' · ' + (u.userId||'')
        + '</div>'
        + '</div>'
        + '<div style="display:flex;gap:6px;align-items:center">'
        + '<span style="background:' + statusBg + ';color:' + statusColor + ';font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">' + statusText + '</span>'
        + '<button id="aubtn-' + u.uid + '" onclick="toggleUserStatusDirect(\'' + u.uid + '\',\'' + (u.status||'inactive') + '\')" '
        + 'style="font-size:11px;background:' + (isActive ? '#fee2e2' : '#dcfce7') + ';color:' + (isActive ? '#dc2626' : '#16a34a') + ';border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-family:inherit">'
        + (isActive ? '비활성화' : '활성화') + '</button>'
        + '<button onclick="deleteUserAccount(\'' + u.uid + '\',\'' + (u.role||'teacher') + '\')" title="삭제" style="font-size:11px;background:#fee2e2;color:#dc2626;border:none;border-radius:6px;padding:4px 9px;cursor:pointer;font-family:inherit"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>'
        + '</div>'
        + '</div>';
    }).join('');
  });
}

function toggleUserStatusDirect(uid, currentStatus) {
  var newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  var btn = document.getElementById('aubtn-' + uid);
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  // setDoc merge: 문서 없어도 생성, 있으면 status만 업데이트
  window.fbSetDocMerge(window.fbDoc(window.fbDb, 'users', uid), { status: newStatus })
    .then(function() {
      showAdminToast('' + (newStatus === 'active' ? '활성화' : '비활성화') + ' 완료!');
      // 버튼만 즉시 갱신 (재조회 안 함 — 지연/한박자 문제 해결)
      if (btn) {
        var isActive = (newStatus === 'active');
        btn.disabled = false; btn.style.opacity = '1';
        btn.style.background = isActive ? '#fee2e2' : '#dcfce7';
        btn.style.color      = isActive ? '#dc2626' : '#16a34a';
        btn.textContent      = isActive ? '비활성화' : '활성화';
        btn.setAttribute('onclick', "toggleUserStatusDirect('" + uid + "','" + newStatus + "')");
      }
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      showAdminToast('오류: ' + err.message, 'error');
    });
}

// 수동 계정 생성 모달
function showCreateUserModal() {
  var modal = document.getElementById('createUserModal') || document.createElement('div');
  modal.id = 'createUserModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;box-sizing:border-box';
  modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:420px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">'
    + '<div style="font-size:15px;font-weight:800;color:#1e293b"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> 수동 계정 등록</div>'
    + '<button onclick="closeCreateUserModal()" style="background:none;border:none;font-size:22px;color:#94a3b8;cursor:pointer">×</button>'
    + '</div>'
    + '<div style="font-size:12px;color:#64748b;background:#f8fafc;border-radius:8px;padding:10px;margin-bottom:16px">Firebase에서 직접 만든 계정의 UID를 입력하면 Firestore 문서를 생성합니다</div>'
    + '<div style="margin-bottom:10px"><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Firebase UID *</label>'
    + '<input type="text" id="cuUid" placeholder="Firebase UID 붙여넣기" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;font-family:inherit;box-sizing:border-box"></div>'
    + '<div style="margin-bottom:10px"><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px">이름 *</label>'
    + '<input type="text" id="cuName" placeholder="이름" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box"></div>'
    + '<div style="margin-bottom:10px"><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px">학원명</label>'
    + '<input type="text" id="cuSchool" placeholder="학원명" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'
    + '<div><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px">역할</label>'
    + '<select id="cuRole" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;background:#fff">'
    + '<option value="teacher">선생님</option><option value="owner">원장</option></select></div>'
    + '<div><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px">상태</label>'
    + '<select id="cuStatus" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;background:#fff">'
    + '<option value="active">활성</option><option value="inactive">비활성</option></select></div>'
    + '</div>'
    + '<button onclick="submitCreateUser()" style="width:100%;padding:12px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit">등록</button>'
    + '<div id="createUserResult" style="display:none;text-align:center;margin-top:10px;font-size:12px;font-weight:700"></div>'
    + '</div>';
  document.body.appendChild(modal);
  navOpenOverlay('createUserModal');
}

function submitCreateUser() {
  var uid    = document.getElementById('cuUid').value.trim();
  var name   = document.getElementById('cuName').value.trim();
  var school = document.getElementById('cuSchool').value.trim();
  var role   = document.getElementById('cuRole').value;
  var status = document.getElementById('cuStatus').value;
  var res    = document.getElementById('createUserResult');

  if (!uid || !name) {
    res.style.display = 'block'; res.style.color = '#ef4444';
    res.textContent = 'UID와 이름은 필수입니다.'; return;
  }

  window.fbSetDocMerge(window.fbDoc(window.fbDb, 'users', uid), {
    userId: name, name: name, schoolName: school,
    role: role, status: status,
    createdAt: new Date().toISOString()
  }).then(function() {
    res.style.display = 'block'; res.style.color = '#16a34a';
    res.textContent = '등록 완료!';
    setTimeout(function() {
      document.getElementById('createUserModal').style.display = 'none';
      loadAllUsers();
    }, 1000);
  }).catch(function(err) {
    res.style.display = 'block'; res.style.color = '#ef4444';
    res.textContent = '오류: ' + err.message;
  });
}

function showSchoolUsers(schoolId, schoolName) {
  var modal = document.getElementById('userModal') || document.createElement('div');
  modal.id = 'userModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;box-sizing:border-box';
  modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
    + '<div style="font-size:15px;font-weight:800;color:#1e293b"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' + schoolName + ' 사용자</div>'
    + '<button onclick="closeUserModal()" style="background:none;border:none;font-size:22px;color:#94a3b8;cursor:pointer">×</button>'
    + '</div>'
    + '<div id="userModalList">로딩 중...</div>'
    + '</div>';
  document.body.appendChild(modal);
  navOpenOverlay('userModal');

  // 학원 문서에서 ownerCode, teacherCode 가져오기
  window.fbGetDoc(window.fbDoc(window.fbDb, 'schools', schoolId)).then(function(schoolSnap) {
    var schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
    var ownerCode = schoolData.ownerCode || '';
    var teacherCode = schoolData.teacherCode || '';

    // schoolId OR schoolCode(ownerCode/teacherCode)로 사용자 조회
    return window.fbGetDocs(window.fbCollection(window.fbDb, 'users')).then(function(snap) {
      var users = [];
      snap.forEach(function(d) {
        var u = d.data();
        if (u.role === 'superadmin') return;
        if (u.schoolId === schoolId ||
            u.schoolId === ownerCode ||
            u.schoolId === teacherCode ||
            u.schoolCode === ownerCode ||
            u.schoolCode === teacherCode ||
            (u.schoolName && schoolName && u.schoolName.trim().toLowerCase() === schoolName.trim().toLowerCase())) {
          users.push(Object.assign({uid: d.id}, u));
        }
      });

      if (users.length === 0) {
        document.getElementById('userModalList').innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px">등록된 사용자가 없습니다</div>';
        return;
      }

      document.getElementById('userModalList').innerHTML = users.map(function(u) {
        var isInactive = u.status !== 'active';
        return '<div data-umrow="' + u.uid + '" data-uname="' + (u.name||u.userId||'이름없음').replace(/"/g,'&quot;') + '" style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px">'
          + '<div>'
          + '<div style="font-size:13px;font-weight:700;color:#1e293b"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' + (u.name||u.userId||'이름없음') + '</div>'
          + '<div style="font-size:11px;color:#94a3b8">' + (u.role||'teacher') + ' · ' + (u.userId||'') + '</div>'
          + '</div>'
          + '<div style="display:flex;gap:6px;align-items:center">'
          + '<button id="umbtn-' + u.uid + '" onclick="toggleUserStatusInModal(\'' + u.uid + '\',\'' + (u.status||'inactive') + '\')" '
          + 'style="font-size:11px;background:' + (isInactive ? '#dcfce7' : '#fee2e2') + ';color:' + (isInactive ? '#16a34a' : '#dc2626') + ';border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-family:inherit;white-space:nowrap">'
          + (isInactive ? '활성화' : '비활성화') + '</button>'
          + '<button onclick="deleteUserAccount(\'' + u.uid + '\',\'' + (u.role||'teacher') + '\')" title="삭제" style="font-size:11px;background:#fee2e2;color:#dc2626;border:none;border-radius:6px;padding:4px 9px;cursor:pointer;font-family:inherit"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>'
          + '</div>'
          + '</div>';
      }).join('');
    });
  });
}

// 모달 안에서 사용자 활성/비활성 토글 — 재조회 없이 버튼만 즉시 갱신
function toggleUserStatusInModal(uid, currentStatus) {
  var newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  var btn = document.getElementById('umbtn-' + uid);
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  window.fbSetDocMerge(window.fbDoc(window.fbDb, 'users', uid), { status: newStatus })
    .then(function() {
      showAdminToast('' + (newStatus === 'active' ? '활성화' : '비활성화') + ' 완료!');
      // 버튼을 새 상태로 즉시 갱신 (재조회 안 함)
      if (btn) {
        var willInactive = (newStatus !== 'active');
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.background = willInactive ? '#dcfce7' : '#fee2e2';
        btn.style.color      = willInactive ? '#16a34a' : '#dc2626';
        btn.textContent      = willInactive ? '활성화' : '비활성화';
        btn.setAttribute('onclick', "toggleUserStatusInModal('" + uid + "','" + newStatus + "')");
      }
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      showAdminToast('오류: ' + err.message, 'error');
    });
}

// 사용자 삭제 (슈퍼관리자).
// Cloud Function(deleteUser)이 배포돼 있으면 Auth 계정 + Firestore 문서를 함께 삭제.
// 미배포 시에는 Firestore users 문서만 삭제(fallback) — 이 경우 로그인 계정(아이디/비번)은 Auth에 잔존.
function deleteUserAccount(uid, role) {
  var sel = '[data-urow="' + uid + '"], [data-umrow="' + uid + '"]';
  var row = document.querySelector(sel);
  var who = (row && row.getAttribute('data-uname')) || uid;
  var warn = (role === 'owner')
    ? '\n\n※ 이 사용자는 원장입니다. 삭제해도 학원/학생 데이터는 남지만, 학원 소유자(ownerUid) 연결이 끊깁니다.'
    : '';
  if (!confirm('이 사용자를 삭제하시겠습니까?\n\n  ' + who + '  (' + (role || 'teacher') + ')' + warn
      + '\n\n• 사용자 정보가 영구 삭제됩니다 (되돌릴 수 없음).\n• 삭제 기능(deleteUser)이 배포돼 있으면 로그인 계정까지 함께 삭제됩니다.')) return;
  if (!confirm('한 번 더 확인합니다.\n"' + who + '" 을(를) 삭제할까요?')) return;

  function removeRows() {
    var nodes = document.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  }
  function fallbackDocDelete(note) {
    window.fbDeleteDoc(window.fbDoc(window.fbDb, 'users', uid))
      .then(function() {
        showAdminToast('삭제 완료: ' + who + (note || ''));
        removeRows();
      })
      .catch(function(e) { showAdminToast('오류: ' + (e && e.message || e), 'error'); });
  }

  var callable = window.fbCallable && window.fbCallable('deleteUser');
  var p = callable ? callable({ uid: uid }) : Promise.reject({ code: 'no-callable' });

  p.then(function() {
    showAdminToast('삭제 완료 (로그인 계정 포함): ' + who);
    removeRows();
  }).catch(function(err) {
    var c = (err && err.code) || '';
    if (c.indexOf('permission-denied') >= 0) { showAdminToast('권한이 없습니다 (슈퍼관리자 전용).', 'error'); return; }
    if (c.indexOf('failed-precondition') >= 0) { showAdminToast((err.message || '삭제할 수 없는 계정입니다.'), 'error'); return; }
    if (c.indexOf('invalid-argument') >= 0) { showAdminToast((err.message || '입력값을 확인해주세요.'), 'error'); return; }
    // 그 외(함수 미배포/내부오류 등) → 문서만 삭제 fallback
    fallbackDocDelete(' (로그인 계정은 남았을 수 있음 — deleteUser 함수 배포 필요)');
  });
}

function toggleUserStatus(uid, currentStatus, schoolId, schoolName) {
  var newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', uid), { status: newStatus })
    .then(function() {
      showAdminToast('사용자 ' + (newStatus === 'inactive' ? '비활성화' : '활성화') + ' 완료!');
      showSchoolUsers(schoolId, schoolName); // 모달 새로고침
    })
    .catch(function(err) { showAdminToast('오류: ' + err.message, 'error'); });
}

function extendSchoolExpiry(id, currentExpiry) {
  var days = prompt('연장할 일수를 입력하세요:', '365');
  if (!days) return;
  var num = parseInt(days);
  if (isNaN(num) || num < 1) { showAdminToast('올바른 일수를 입력해주세요.', 'error'); return; }

  // 현재 만료일 기준으로 연장 (이미 지났으면 오늘부터)
  var base = currentExpiry && new Date(currentExpiry) > new Date() ? new Date(currentExpiry) : new Date();
  base.setDate(base.getDate() + num);
  var newExpiry = base.toISOString().slice(0,10);

  window.fbUpdateDoc(window.fbDoc(window.fbDb, 'schools', id), { expiresAt: newExpiry })
    .then(function() {
      showAdminToast('' + num + '일 연장 → 만료일: ' + newExpiry);
      loadSchools();
      loadSchoolStats();
    })
    .catch(function(err) { showAdminToast('오류: ' + err.message, 'error'); });
}

function saveSchoolLimit(id) {
  var input = document.getElementById('tc-' + id);
  if (!input) return;
  var num = parseInt(input.value);
  if (isNaN(num) || num < 0) { showAdminToast('올바른 숫자를 입력해주세요.', 'error'); return; }
  window.fbUpdateDoc(window.fbDoc(window.fbDb, 'schools', id), {
    maxTeachers: 1 + num,
    teacherCount: num
  }).then(function() {
    showAdminToast('원장1 + 선생님' + num + '명으로 저장됐습니다!');
    loadSchools();
    loadSchoolStats();
  }).catch(function(err) { showAdminToast('오류: ' + err.message, 'error'); });
}

// 플랜 저장
function saveSchoolPlan(id) {
  var sel = document.getElementById('plan-' + id);
  if (!sel) return;
  var newPlan = sel.value;
  window.fbUpdateDoc(window.fbDoc(window.fbDb, 'schools', id), { plan: newPlan })
    .then(function() {
      var planNames = { free:'무료 체험', basic:'베이직', standard:'스탠다드', premium:'프리미엄' };
      showAdminToast('플랜이 "' + (planNames[newPlan]||newPlan) + '"(으)로 저장됐습니다!');
      loadSchools();
    })
    .catch(function(err) { showAdminToast('오류: ' + err.message, 'error'); });
}

// 다른 모든 학원과 겹치지 않는 고유 코드 생성
function generateUniqueCode(length, existingCodes) {
  var code;
  var attempts = 0;
  do {
    code = generateCode(length);
    attempts++;
  } while (existingCodes.indexOf(code) !== -1 && attempts < 100);
  return code;
}

// 코드 재발급 (원장/선생님) - 새 코드 발급 + 소속 사용자 비활성화
function reissueCode(schoolId, codeType, schoolName) {
  var typeLabel = codeType === 'owner' ? '원장' : '선생님';
  if (!confirm(schoolName + '\n' + typeLabel + ' 코드를 재발급하시겠습니까?\n\n• 새 코드가 발급됩니다\n• 이 코드를 쓰던 소속 사용자는 비활성화됩니다\n• 사용자는 새 코드를 입력해야 다시 활성화됩니다\n\n새 코드를 사용자에게 직접 전달해 주세요.')) return;

  // 1. 전체 학원의 기존 코드 수집 (중복 방지)
  window.fbGetDocs(window.fbCollection(window.fbDb, 'schools')).then(function(snap) {
    var allCodes = [];
    var targetSchool = null;
    snap.forEach(function(d) {
      var s = d.data();
      if (s.ownerCode) allCodes.push(s.ownerCode);
      if (s.teacherCode) allCodes.push(s.teacherCode);
      if (d.id === schoolId) targetSchool = Object.assign({ _id: d.id }, s);
    });
    if (!targetSchool) { showAdminToast('학원을 찾을 수 없습니다.', 'error'); return; }

    // 2. 고유한 새 코드 생성
    var newCode = generateUniqueCode(6, allCodes);
    var oldCode = codeType === 'owner' ? targetSchool.ownerCode : targetSchool.teacherCode;
    var fieldName = codeType === 'owner' ? 'ownerCode' : 'teacherCode';

    // 3. 학원 문서에 새 코드 저장
    var updateObj = {};
    updateObj[fieldName] = newCode;
    window.fbUpdateDoc(window.fbDoc(window.fbDb, 'schools', schoolId), updateObj).then(function() {
      // 4. 이 코드(role)에 해당하는 소속 사용자 비활성화 + 코드 연결 끊기
      var usersRef = window.fbCollection(window.fbDb, 'users');
      window.fbGetDocs(usersRef).then(function(uSnap) {
        var updates = [];
        var affectedCount = 0;
        uSnap.forEach(function(ud) {
          var u = ud.data();
          if (u.role === 'superadmin') return;
          // 해당 학원 소속 + 재발급 대상 역할(owner/teacher) 매칭
          var belongsToSchool = (u.schoolId === schoolId || u.schoolId === oldCode);
          var roleMatch = (codeType === 'owner' && u.role === 'owner') ||
                          (codeType === 'teacher' && u.role === 'teacher');
          if (!belongsToSchool || !roleMatch) return;
          affectedCount++;
          // 비활성화 + 기존 코드 연결 제거 (새 코드 입력 시 재연결)
          var uUpdate = { status: 'inactive' };
          if (u.ownerCode === oldCode)   uUpdate.ownerCode = '';
          if (u.teacherCode === oldCode) uUpdate.teacherCode = '';
          if (u.schoolId === oldCode)    uUpdate.schoolId = '';
          updates.push(window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', ud.id), uUpdate));
        });
        Promise.all(updates).then(function() {
          showAdminToast(typeLabel + ' 코드 재발급 완료! 새 코드: ' + newCode + ' (사용자 ' + affectedCount + '명 비활성화)');
          loadSchools();
        }).catch(function(err) {
          showAdminToast('코드는 변경됐으나 일부 사용자 처리 실패: ' + err.message, 'error');
          loadSchools();
        });
      });
    }).catch(function(err) { showAdminToast('오류: ' + err.message, 'error'); });
  }).catch(function(err) { showAdminToast('오류: ' + err.message, 'error'); });
}

function setSchoolLimit(id, name, current) {
  var currentTeachers = current > 0 ? current - 1 : 0; // maxTeachers - 원장1
  var input = prompt(name + '\n선생님 인원수를 입력하세요\n(원장 1명은 기본 포함)\n현재 선생님: ' + currentTeachers + '명', currentTeachers);
  if (input === null) return;
  var num = parseInt(input);
  if (isNaN(num) || num < 0) { showAdminToast('올바른 숫자를 입력해주세요.', 'error'); return; }
  window.fbUpdateDoc(window.fbDoc(window.fbDb, 'schools', id), {
    maxTeachers: 1 + num,
    teacherCount: num
  })
    .then(function() {
      showAdminToast('원장1 + 선생님' + num + '명으로 설정됐습니다!');
      loadSchools();
    })
    .catch(function(err) { showAdminToast('오류: ' + err.message, 'error'); });
}

function deleteSchool(id, name) {
  if (!confirm(name + ' 학원을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.')) return;
  window.fbDeleteDoc(window.fbDoc(window.fbDb, 'schools', id))
    .then(function() {
      // schoolNames 인덱스도 함께 삭제 (유령 코드 잔존 방지) — 단, 다른 학원이 같은 키를 안 쓸 때만
      if (name) {
        var nameKey = normalizeSchoolKey(name);
        var idxRef = window.fbDoc(window.fbDb, 'schoolNames', nameKey);
        window.fbGetDoc(idxRef).then(function(snap){
          if (snap.exists() && snap.data() && snap.data().docId === id) {
            window.fbDeleteDoc(idxRef).catch(function(){});
          }
        }).catch(function(){});
      }
      showAdminToast('' + name + ' 삭제 완료!');
      loadSchools();
    })
    .catch(function(err) {
      showAdminToast('오류: ' + err.message, 'error');
    });
}

function toggleSchoolStatus(id, currentStatus) {
  var newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  window.fbUpdateDoc(window.fbDoc(window.fbDb, 'schools', id), { status: newStatus })
    .then(function() {
      // 소속 사용자 전체 status도 변경
      var q = window.fbQuery(window.fbCollection(window.fbDb, 'users'), window.fbWhere('schoolId', '==', id));
      return window.fbGetDocs(q).then(function(snap) {
        var updates = [];
        snap.forEach(function(d) {
          updates.push(window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', d.id), { status: newStatus }));
        });
        return Promise.all(updates);
      });
    })
    .then(function() {
      showAdminToast('학원 및 소속 사용자 ' + (newStatus === 'inactive' ? '비활성화' : '활성화') + ' 완료!');
      loadSchools();
    })
    .catch(function(err) { showAdminToast('오류: ' + err.message, 'error'); });
}

function showAdminToast(msg, type) {
  showToast(msg, type);
}

function initAdminDashboard() {
  // mainApp 확실히 숨기기
  var mainApp = document.getElementById('mainApp');
  if (mainApp) {
    mainApp.style.display = 'none';
    mainApp.classList.remove('sidebar-active');
  }
  document.getElementById('adminDashboard').style.display = 'block';
  loadSchools();
  loadSchoolStats();
  checkExpiryAlerts();
  loadApplications(); // 신청 배지 업데이트
}

function checkExpiryAlerts() {
  window.fbGetDocs(window.fbCollection(window.fbDb, 'schools')).then(function(snap) {
    var expired = [], soon = [], normal = [];
    var now = new Date();
    var in30 = new Date(); in30.setDate(in30.getDate() + 30);

    snap.forEach(function(d) {
      var s = d.data();
      if (!s.expiresAt || !s.name) return;
      var exp = new Date(s.expiresAt);
      var diff = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      if (now > exp)      expired.push({ name: s.name, date: s.expiresAt.slice(0,10), diff: diff });
      else if (exp <= in30) soon.push({ name: s.name, date: s.expiresAt.slice(0,10), diff: diff });
      else                  normal.push({ name: s.name, date: s.expiresAt.slice(0,10), diff: diff });
    });

    // 갱신 문의 미확인 건 (복합색인 불필요하도록 전체 조회 후 필터)
    window.fbGetDocs(window.fbCollection(window.fbDb, 'inquiries'))
    .then(function(iSnap) {
      var renewalCount = 0;
      iSnap.forEach(function(d) {
        var q = d.data();
        if (q.type === 'renewal' && q.status === 'unread') renewalCount++;
      });

      var container = document.getElementById('adminDashboard').querySelector('[style*="max-width"]');
      if (!container) return;

      var alertEl = document.getElementById('expiryAlert');
      if (!alertEl) {
        alertEl = document.createElement('div');
        alertEl.id = 'expiryAlert';
        container.insertAdjacentElement('afterbegin', alertEl);
      }
      alertEl.style.cssText = 'background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px';

      var inner = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:10px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> 학원 이용 현황</div>';

      // 만료
      if (expired.length > 0) {
        inner += '<div style="margin-bottom:8px"><div style="font-size:11px;color:#dc2626;font-weight:700;margin-bottom:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg> 만료 (' + expired.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:4px">';
        expired.forEach(function(s) {
          inner += '<span style="background:#fee2e2;color:#dc2626;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px">' + s.name + ' · ' + s.date + '</span>';
        });
        inner += '</div></div>';
      }

      // 30일 이내 만료 임박
      if (soon.length > 0) {
        inner += '<div style="margin-bottom:8px"><div style="font-size:11px;color:#92400e;font-weight:700;margin-bottom:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#92400e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> 만료 임박 (' + soon.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:4px">';
        soon.forEach(function(s) {
          inner += '<span style="background:#fef9c3;color:#92400e;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px">' + s.name + ' · D-' + s.diff + ' · ' + s.date + '</span>';
        });
        inner += '</div></div>';
      }

      // 정상
      if (normal.length > 0) {
        inner += '<div style="margin-bottom:8px"><div style="font-size:11px;color:#16a34a;font-weight:700;margin-bottom:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg> 정상 이용 중 (' + normal.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:4px">';
        normal.forEach(function(s) {
          inner += '<span style="background:#dcfce7;color:#16a34a;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px">' + s.name + ' · D-' + s.diff + ' · ' + s.date + '</span>';
        });
        inner += '</div></div>';
      }

      // 갱신 문의
      if (renewalCount > 0) {
        inner += '<div><span style="background:#ede9fe;color:#6d28d9;font-size:12px;font-weight:700;padding:3px 12px;border-radius:6px;cursor:pointer" onclick="switchAdminTab(\'apply\')"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> 갱신 문의 ' + renewalCount + '건 미확인</span></div>';
      }

      inner += '</div></div>';
      alertEl.innerHTML = inner;

    }).catch(function() {});
  });
}
