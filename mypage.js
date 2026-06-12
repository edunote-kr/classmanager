// EduNote 마이페이지 모듈 (mypage.js)
// classic <script> — admin.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// 학원 프로필/로고 편집, 학원코드, 만료·크레딧 표시, 구독화면 이동, 비밀번호 변경.
// 상태 var(모듈 전용): myLogoBase64/_logoCleared.
// 정의: showMyPage/populateMyPage/loadMySchoolCodes/notifChan/fmtNotifCell/loadMyTeacherCredits/showMyExpiry/
//   closeSubscribeScreen/openPlanExtend/openChargeFromNav/requestRenewal/previewLogo/deleteLogo/saveMyPage/
//   closeMyPage/changeMyPassword. (top-level → window 전역)
// 런타임 의존(window 전역): currentSchool/currentSchoolId/currentSchoolProfile/currentRole, isOwnerOrAdmin(core.js),
//   getImgLogoSrc/drawLogoToCanvas/refreshSchoolLogo/applyFavicon(모놀리스 공용 로고유틸), showToast/showLoading,
//   window.fbAuth/fbDb/fbDoc/fbGetDoc/fbSetDoc/fbUpdateDoc 등 (fb.js).
// 잔류(모놀리스): 로고 렌더 유틸(getImgLogoSrc/drawLogoToCanvas), 사이드바/init/favicon, 구독화면 본체(showSubscribeScreen).
//   ⚠ 구독 함수는 화면 이동 UI일 뿐 — 결제(PG) 처리 아님. 크레딧 승인은 모놀리스(결제 트랙).
// 주의: 다른 파일에서 재정의 금지.

// ── 마이페이지 ─────────────────────────────────────────────
var myLogoBase64 = null;
var _logoCleared = false; // 로고 삭제(기본값 복귀) 플래그

function showMyPage() { if (typeof navSelectLeaf==='function') navSelectLeaf('mp-school'); else switchTab('mp-school'); }
function populateMyPage() {
  if (!window.fbDb || !window.fbAuth || !window.fbAuth.currentUser) return;
  var uid = window.fbAuth.currentUser.uid;

  window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid)).then(function(snap) {
    if (!snap.exists()) return;
    var data = snap.data();
    var isOwner = data.role === 'owner';
    var _cn=document.getElementById('mpCodeNote'); if(_cn) _cn.style.display=isOwner?'none':'block';
    var _pn=document.getElementById('mpPlanNote'); if(_pn) _pn.style.display=isOwner?'none':'block';

    // 원장만 편집 가능
    document.getElementById('myLogoSection').style.display = isOwner ? 'block' : 'none';
    document.getElementById('mySchoolNameSection').style.display = isOwner ? 'block' : 'none';
    document.getElementById('myPhoneSection').style.display = isOwner ? 'block' : 'none';
    var _ss=document.getElementById('mySenderSection'); if(_ss) _ss.style.display = isOwner ? 'block' : 'none';
    window._mpIsOwner = isOwner; if (typeof mpUpdateSaveBtn==='function') mpUpdateSaveBtn();

    if (isOwner) {
      document.getElementById('mySchoolName').value = data.schoolName || '';
      document.getElementById('myPhone').value = data.phone || '';
      _logoCleared = false; myLogoBase64 = null;
      if (data.logo) {
        myLogoBase64 = data.logo;
        document.getElementById('myLogoPreview').innerHTML = '<img src="' + data.logo + '" style="width:100%;height:100%;object-fit:contain">';
      }
    }

    // 원장이면 학원 코드 표시
    if (isOwner && data.schoolId) {
      document.getElementById('mySchoolCodeSection').style.display = 'block';
      loadMySchoolCodes(data.schoolId);
    } else {
      document.getElementById('mySchoolCodeSection').style.display = 'none';
    }

    // 선생님이면 안내 메시지
    document.getElementById('myTeacherInfo').style.display = isOwner ? 'none' : 'block';
    document.getElementById('myTeacherName').textContent = data.name || '';
    document.getElementById('myTeacherSchool').textContent = data.schoolName || '';

    // 선생님: 학원 공유 크레딧 잔액 표시 (코드/결제 버튼은 원장 전용 유지)
    if (!isOwner && data.schoolId) {
      loadMyTeacherCredits(data.schoolId, data.schoolName);
    }
  });
}

function loadMySchoolCodes(schoolId) {
  window.fbGetDoc(window.fbDoc(window.fbDb, 'schools', schoolId)).then(function(snap) {
    if (snap.exists()) {
      var d = snap.data();
      document.getElementById('myOwnerCode').textContent = d.ownerCode || '------';
      document.getElementById('myTeacherCode').textContent = d.teacherCode || '------';
      showMyExpiry(d.expiresAt, d.notif); var _sp_=document.getElementById('mySenderPhone'); if(_sp_) _sp_.value=d.senderPhone||'';
      return;
    }
    // 문서 못 찾음 → 인덱스로 실제 docId 찾아 단건 조회 (전체 스캔 제거)
    var _nm = (document.getElementById('mySchoolName')||{value:''}).value;
    resolveSchoolDocId(schoolId, _nm).then(function(realId) {
      if (!realId) return;
      window.fbGetDoc(window.fbDoc(window.fbDb, 'schools', realId)).then(function(rs) {
        if (!rs.exists()) return;
        var d = rs.data();
        document.getElementById('myOwnerCode').textContent = d.ownerCode || '------';
        document.getElementById('myTeacherCode').textContent = d.teacherCode || '------';
        showMyExpiry(d.expiresAt, d.notif); var _sp_=document.getElementById('mySenderPhone'); if(_sp_) _sp_.value=d.senderPhone||'';
      }).catch(function(){});
    }).catch(function(){});
  });
}

// notif 지갑에서 채널별 {free, paid, total} 안전 추출
function notifChan(notif, chan) {
  var c = (notif && notif[chan]) || {};
  var free = c.free || 0, paid = c.paid || 0;
  return { free: free, paid: paid, total: free + paid };
}
function fmtNotifCell(c) {
  return c.total + '건 (무료 ' + c.free + ' · 충전 ' + c.paid + ')';
}

// 선생님용: 소속 학원 문서에서 공유 크레딧(문자/알림톡) 잔액만 읽어 표시
function loadMyTeacherCredits(schoolId, schoolName) {
  function show(notif) {
    var s = document.getElementById('myTeacherCreditSms');
    if (s) s.textContent = fmtNotifCell(notifChan(notif, 'sms'));
    var a = document.getElementById('myTeacherCreditAlimtalk');
    if (a) a.textContent = fmtNotifCell(notifChan(notif, 'alimtalk'));
    var line = document.getElementById('myTeacherCreditLine');
    if (line) line.style.display = 'block';
  }
  window.fbGetDoc(window.fbDoc(window.fbDb, 'schools', schoolId)).then(function(snap) {
    if (snap.exists()) { show(snap.data().notif); return; }
    // 문서 못 찾음 → 인덱스로 실제 docId 찾아 단건 조회
    resolveSchoolDocId(schoolId, schoolName).then(function(realId) {
      if (!realId) return;
      window.fbGetDoc(window.fbDoc(window.fbDb, 'schools', realId)).then(function(rs) {
        if (rs.exists()) show(rs.data().notif);
      }).catch(function(){});
    }).catch(function(){});
  }).catch(function(){});
}

function showMyExpiry(expiresAt, notif) {
  var _s=document.getElementById('myCreditSms'); if(_s) _s.textContent = fmtNotifCell(notifChan(notif,'sms'));
  var _a=document.getElementById('myCreditAlimtalk'); if(_a) _a.textContent = fmtNotifCell(notifChan(notif,'alimtalk'));
  var sec = document.getElementById('myExpirySection');
  if (!sec) return;
  if (!expiresAt) { sec.style.display = 'none'; return; }

  var now = new Date();
  var exp = new Date(expiresAt);
  var diff = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  var isExpired = now > exp;

  sec.style.display = 'block';
  sec.style.background = isExpired ? '#fee2e2' : (diff <= 30 ? '#fef9c3' : '#f0fdf4');

  document.getElementById('myExpiryDate').textContent = expiresAt.slice(0,10);
  document.getElementById('myExpiryDate').style.color = isExpired ? '#dc2626' : (diff <= 30 ? '#92400e' : '#16a34a');

  var ddayEl = document.getElementById('myExpiryDday');
  var renewBtn = document.getElementById('myRenewBtn');

  if (isExpired) {
    ddayEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:3px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> 서비스가 만료됐습니다';
    ddayEl.style.color = '#dc2626';
  } else if (diff <= 30) {
    ddayEl.textContent = 'D-' + diff + ' · 갱신이 필요합니다';
    ddayEl.style.color = '#92400e';
  } else {
    ddayEl.textContent = 'D-' + diff + ' · 정상 이용 중';
    ddayEl.style.color = '#16a34a';
  }
  renewBtn.style.display = 'block'; // 항상 표시
}

function closeSubscribeScreen() {
  var subEl = document.getElementById('subscribeScreen');
  if (subEl) subEl.style.display = 'none';
  var mainApp = document.getElementById('mainApp');
  if (mainApp) mainApp.style.display = 'block';
}

// ── 쪽지함/문의 → messages.js 로 분리 ──

function openPlanExtend() {
  // 마이페이지 닫고 → 플랜 안내표/선택/신청 화면으로 이동
  if (!window.fbAuth || !window.fbAuth.currentUser) return;
  var fbUser = window.fbAuth.currentUser;
  closeMyPage();
  // 현재 프로필을 읽어 신청 화면에 학원명/이름 등을 채움
  window.fbGetDoc(window.fbDoc(window.fbDb, 'users', fbUser.uid)).then(function(snap) {
    var profile = snap.exists() ? snap.data() : {};
    showSubscribeScreen(fbUser, profile, 'extend');
  }).catch(function() {
    showSubscribeScreen(fbUser, {}, 'extend');
  });
}

// 메세지관리 > 충전/충전설정 진입 (구독 화면 → 크레딧 충전 뷰)
function openChargeFromNav() {
  if (typeof isOwnerOrAdmin==='function' && !isOwnerOrAdmin()) { showToast('충전은 원장 계정에서 가능합니다.','error'); return; }
  if (!window.fbAuth || !window.fbAuth.currentUser) { showToast('로그인이 필요합니다.','error'); return; }
  var u = window.fbAuth.currentUser;
  function _go(profile){ showSubscribeScreen(u, profile||{}, 'extend'); if(typeof openCreditPurchase==='function') openCreditPurchase(); }
  window.fbGetDoc(window.fbDoc(window.fbDb,'users',u.uid)).then(function(snap){ _go(snap.exists()?snap.data():{}); }).catch(function(){ _go({}); });
}

function requestRenewal() {
  // 갱신 문의 - 관리자에게 Firestore 문의 저장
  if (!window.fbDb || !window.fbAuth || !window.fbAuth.currentUser) return;
  var uid = window.fbAuth.currentUser.uid;

  window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid)).then(function(snap) {
    if (!snap.exists()) return;
    var data = snap.data();
    return window.fbCallable('submitInquiry')({
      type: 'renewal',
      name: data.name || '',
      schoolName: data.schoolName || '',
      phone: data.phone || '',
      message: '서비스 갱신 문의',
      uid: uid,
      createdAt: new Date().toISOString(),
      status: 'unread'
    });
  }).then(function() {
    showToast('갱신 문의가 접수됐습니다! 관리자가 연락드릴게요.');
    closeMyPage();
  }).catch(function() {
    showToast('갱신 문의 전송 실패. 직접 연락해주세요.', 'error');
  });
}

function previewLogo(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];

  if (file.size > 10 * 1024 * 1024) {
    showToast('10MB 이하 이미지를 사용해주세요.', 'error');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var SIZE = 512; // 저장 크기 (정사각형, 고해상도 — 가는 선/글자 또렷)

      var canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      var ctx = canvas.getContext('2d');

      // 흰 배경 채우기 (투명 PNG 대응)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SIZE, SIZE);

      // 비율 유지 fit(contain): 로고 전체가 잘리지 않게 (크롭 X)
      var sw = img.width, sh = img.height;
      var sc = Math.min(SIZE/sw, SIZE/sh);
      var dw = sw*sc, dh = sh*sc;
      ctx.drawImage(img, 0, 0, sw, sh, (SIZE-dw)/2, (SIZE-dh)/2, dw, dh);

      // JPEG 압축 (품질 0.75)
      myLogoBase64 = canvas.toDataURL('image/png');
      _logoCleared = false;

      var preview = document.getElementById('myLogoPreview');
      preview.innerHTML = '<img src="' + myLogoBase64 + '" style="width:100%;height:100%;object-fit:contain">';

      var kb = Math.round(myLogoBase64.length * 0.75 / 1024); // base64 → 대략 byte
      showToast('로고 적용 완료 (' + kb + 'KB)');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function deleteLogo() {
  if (!confirm('로고를 삭제하고 기본 에듀노트 로고로 되돌릴까요?')) return;
  myLogoBase64 = null;
  _logoCleared = true;
  var pv = document.getElementById('myLogoPreview');
  if (pv) pv.innerHTML = '<img src="' + (document.querySelector('.header-logo') ? document.querySelector('.header-logo').src : '') + '" style="width:100%;height:100%;object-fit:contain;opacity:0.85">';
  showToast('저장을 누르면 기본 로고로 적용됩니다.', 'info');
}

function saveMyPage() {
  var schoolName = document.getElementById('mySchoolName').value.trim();
  var phone = document.getElementById('myPhone').value.trim();
  var senderPhone = (document.getElementById('mySenderPhone')||{value:''}).value.trim();
  if (!schoolName) { showToast('학원명을 입력해주세요.', 'error'); return; }
  if (!window.fbDb || !window.fbAuth || !window.fbAuth.currentUser) return;

  var uid = window.fbAuth.currentUser.uid;
  var updateData = { schoolName: schoolName, phone: phone };
  if (myLogoBase64) updateData.logo = myLogoBase64;
  else if (_logoCleared) updateData.logo = ''; // 로고 삭제 → 기본값 복귀

  // 메모리 즉시 업데이트
  currentSchoolProfile.name = schoolName;
  currentSchoolProfile.phone = phone;
  if (myLogoBase64) {
    currentSchoolProfile.logo = myLogoBase64;
    // 헤더 로고 즉시 반영
    var headerLogoEl = document.getElementById('headerSchoolLogo');
    if (headerLogoEl) { headerLogoEl.src = myLogoBase64; headerLogoEl.style.display = 'block'; }
  } else if (_logoCleared) {
    currentSchoolProfile.logo = null;
    if (typeof refreshSchoolLogo==='function') refreshSchoolLogo(); // 헤더/파비콘 기본값 복귀
  }
  var headerNameEl = document.getElementById('headerSchoolNameText');
  if (headerNameEl) headerNameEl.textContent = schoolName;

  // users 문서 업데이트
  window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', uid), updateData)
    .then(function() {
      // schools 컬렉션도 동기화 (schoolId로 찾아서 업데이트)
      return window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid))
        .then(function(snap) {
          if (!snap.exists()) return;
          var profile = snap.data();
          var schoolId = profile.schoolId;
          if (!schoolId) return;

          var schoolUpdate = { name: schoolName, phone: phone, senderPhone: senderPhone };
          if (myLogoBase64) schoolUpdate.logo = myLogoBase64;
          else if (_logoCleared) schoolUpdate.logo = '';

          // schoolId가 문서 ID인 경우
          return window.fbGetDoc(window.fbDoc(window.fbDb, 'schools', schoolId))
            .then(function(schoolSnap) {
              if (schoolSnap.exists()) {
                return window.fbUpdateDoc(window.fbDoc(window.fbDb, 'schools', schoolId), schoolUpdate);
              }
              // schoolId가 코드값인 경우 인덱스로 실제 docId 찾아 단건 업데이트 (전체 스캔 제거)
              return resolveSchoolDocId(schoolId, profile.schoolName).then(function(realId) {
                if (!realId) return;
                return window.fbUpdateDoc(window.fbDoc(window.fbDb, 'schools', realId), schoolUpdate);
              });
            });
        });
    })
    .then(function() {
      document.getElementById('myPageResult').style.display = 'block';
      document.getElementById('myPageResult').textContent = '저장됐습니다!';
      showToast('마이페이지 저장 완료!');
      setTimeout(function() {
        document.getElementById('myPageResult').style.display = 'none';
      }, 2000);
    })
    .catch(function(err) { showToast('저장 실패: ' + err.message, 'error'); });
}

function closeMyPage() {
  var m=document.getElementById('myPageModal'); if(m) m.style.display='none';
}

// 마이페이지: 비밀번호 변경 (현재 비밀번호로 재인증 후 변경)
function changeMyPassword() {
  var res = document.getElementById('myPwResult');
  function show(msg, ok) {
    if (!res) return;
    res.style.display = 'block';
    res.style.color = ok ? '#16a34a' : '#ef4444';
    res.textContent = msg;
  }
  var cur = (document.getElementById('myCurrentPw')||{value:''}).value;
  var np  = (document.getElementById('myNewPw')||{value:''}).value;
  var np2 = (document.getElementById('myNewPw2')||{value:''}).value;
  if (!cur || !np) { show('현재 비밀번호와 새 비밀번호를 입력해주세요.', false); return; }
  if (np.length < 6) { show('새 비밀번호는 6자 이상이어야 합니다.', false); return; }
  if (np !== np2) { show('새 비밀번호가 일치하지 않습니다.', false); return; }
  var user = window.fbAuth && window.fbAuth.currentUser;
  if (!user) { show('로그인이 필요합니다.', false); return; }
  show('변경 중...', true);
  var cred = window.fbEmailAuthProvider.credential(user.email, cur);
  window.fbReauth(user, cred)
    .then(function(){ return window.fbUpdatePassword(user, np); })
    .then(function(){
      show('비밀번호가 변경되었습니다.', true);
      ['myCurrentPw','myNewPw','myNewPw2'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
    })
    .catch(function(err){
      var c = err && err.code;
      if (c === 'auth/wrong-password' || c === 'auth/invalid-credential') show('현재 비밀번호가 올바르지 않습니다.', false);
      else if (c === 'auth/weak-password') show('새 비밀번호가 너무 약합니다 (6자 이상).', false);
      else if (c === 'auth/requires-recent-login') show('보안을 위해 다시 로그인한 뒤 시도해주세요.', false);
      else show('변경 실패: ' + (err && err.message || ''), false);
    });
}

// 학원 로고를 사이드바/헤더에 반영 (학원 로고 없으면 기본 EduNote 로고 유지)
