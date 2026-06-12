// EduNote 쪽지함/문의 모듈 (messages.js)
// classic <script> — schoolStore.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// 사용자(원장/선생님)의 관리자 답변 확인·문의 전송. 상태 var _myMessages/_currentMsgId(블록 내부 전용).
// 정의: fetchMyRepliedInquiries/refreshMyMessageBadge/showMessageBox/closeMessageBox/renderMessageList/
//   drawMessageList/openMessage/showMsgDetail/closeMsgDetail/sendMessageReply/deleteMyMessage/submitMyInquiry.
//   top-level → window 전역(HTML onclick·refreshMyMessageBadge typeof-가드 호출 무손상).
// 런타임 의존(window 전역): currentUser/currentRole/currentSchool, showToast/showLoading/escapeHtml 등,
//   window.fbDb/fbAuth/fbGetDocs/fbCollection/fbDoc/fbSetDoc/fbAddDoc 등 (state.js/core.js/utils.js/모놀리스/fb.js).
// 주의: 다른 파일에서 재정의 금지.

// ── 쪽지함 (사용자: 관리자 답변 확인) ──────────────────────
// 본인 uid의 문의 중 reply가 있는 것들을 가져옴
function fetchMyRepliedInquiries() {
  if (!window.fbDb || !window.fbAuth || !window.fbAuth.currentUser) return Promise.resolve([]);
  var uid = window.fbAuth.currentUser.uid;
  // 복합색인 불필요하게 본인 uid만 필터 (where 한 개)
  var q = window.fbQuery(window.fbCollection(window.fbDb, 'inquiries'), window.fbWhere('uid', '==', uid));
  return window.fbGetDocs(q).then(function(snap) {
    var list = [];
    snap.forEach(function(d) {
      var data = d.data();
      if (data.reply && data.reply.length > 0) list.push(Object.assign({id: d.id}, data));
    });
    list.sort(function(a,b){ return (b.replyAt||'').localeCompare(a.replyAt||''); });
    return list;
  });
}

// 헤더 뱃지: 안 읽은 답변 개수 (버튼은 항상 표시)
function refreshMyMessageBadge() {
  var badge = document.getElementById('myPageBadge');
  var btn = document.getElementById('myMsgBtn');
  if (btn) btn.style.display = 'inline-flex'; // 쪽지 유무와 무관하게 항상 표시
  if (!badge) return;
  fetchMyRepliedInquiries().then(function(list) {
    var unread = list.filter(function(q){ return !q.replyRead; }).length;
    if (unread > 0) {
      badge.style.display = 'block';
      badge.textContent = unread > 9 ? '9+' : unread;
    } else {
      badge.style.display = 'none';
    }
  }).catch(function(){ /* 뱃지는 조용히 실패 */ });
}

// 쪽지함 모달 열기
function showMessageBox() {
  var modal = document.getElementById('messageBoxModal');
  if (modal) modal.style.display = 'flex';
  navOpenOverlay('messageBoxModal');
  renderMessageList();
}
function closeMessageBox() {
  var modal = document.getElementById('messageBoxModal');
  if (modal) modal.style.display = 'none';
  refreshMyMessageBadge();
  navOnOverlayClosed('messageBoxModal');
}

// 쪽지 목록 렌더링 (자동 읽음 처리 안 함 — 클릭해야 읽음)
var _myMessages = []; // 쪽지함 목록 캐시

function renderMessageList() {
  var listEl = document.getElementById('msgModalList');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:30px;font-size:13px">불러오는 중...</div>';

  fetchMyRepliedInquiries().then(function(list) {
    _myMessages = list;
    drawMessageList();
  }).catch(function(err) {
    listEl.innerHTML = '<div style="text-align:center;color:#dc2626;padding:30px;font-size:13px">쪽지를 불러오지 못했습니다.<br><span style="font-size:11px;color:#94a3b8">' + (err && (err.code||err.message) || '') + '</span></div>';
  });
}

// 캐시(_myMessages)를 화면에 그림 — 재조회 없음
function drawMessageList() {
  var listEl = document.getElementById('msgModalList');
  if (!listEl) return;
  if (!_myMessages || _myMessages.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:30px;font-size:13px">아직 받은 쪽지가 없습니다.<br><span style="font-size:11px">문의를 보내면 관리자 답변이 여기에 표시됩니다.</span></div>';
    return;
  }
  listEl.innerHTML = _myMessages.map(function(q) {
    var isUnread = !q.replyRead;
    var typeText = q.type === 'renewal' ? '플랜 연장/변경' : '1:1 문의';
    var opacity = isUnread ? '1' : '0.55';
    var border  = isUnread ? '#c4b5fd' : '#e2e8f0';
    var bg      = isUnread ? '#faf5ff' : '#f8fafc';
    return '<div onclick="openMessage(\'' + q.id + '\')" style="position:relative;border:1.5px solid ' + border + ';border-radius:10px;padding:12px;background:' + bg + ';opacity:' + opacity + ';cursor:pointer;transition:opacity .2s">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">'
      + '<div style="font-size:11px;color:#94a3b8">'
      + '<span style="background:#ede9fe;color:#6d28d9;font-weight:700;padding:1px 7px;border-radius:5px">' + typeText + '</span> '
      + (isUnread
          ? '<span style="background:#ef4444;color:#fff;font-weight:700;padding:1px 7px;border-radius:8px;font-size:9px">미확인</span>'
          : '<span style="color:#94a3b8;font-weight:700;font-size:10px">읽음</span>')
      + '</div>'
      + '<button onclick="event.stopPropagation();deleteMyMessage(\'' + q.id + '\')" style="background:#fee2e2;color:#dc2626;border:none;border-radius:6px;font-size:10px;font-weight:700;padding:3px 8px;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">삭제</button>'
      + '</div>'
      + '<div style="font-size:12px;color:#64748b;margin-bottom:6px"><b>내 문의:</b> ' + escapeMsg(q.message||'') + '</div>'
      + '<div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:6px;padding:8px 10px;font-size:12px;color:#166534"><b>답변:</b> ' + escapeMsg(q.reply||'') + '<div style="font-size:10px;color:#94a3b8;margin-top:3px">' + (q.replyAt||'').slice(0,16).replace('T',' ') + '</div></div>'
      + (isUnread ? '<div style="font-size:10px;color:#a78bfa;margin-top:6px;text-align:center">탭하면 읽음 처리됩니다</div>' : '')
      + '</div>';
  }).join('');
}

// 쪽지 클릭 → 읽음 처리 (4번): 캐시 즉시 갱신 + 업데이트는 백그라운드
var _currentMsgId = null;
function openMessage(id) {
  // 1) 화면(캐시) 먼저 읽음으로 — 재조회 안 함
  var found = false;
  _myMessages.forEach(function(q) {
    if (q.id === id && !q.replyRead) { q.replyRead = true; found = true; }
  });
  if (found) {
    drawMessageList();
    // 헤더 뱃지 숫자도 즉시 반영
    var badge = document.getElementById('myPageBadge');
    if (badge) {
      var unread = _myMessages.filter(function(q){ return !q.replyRead; }).length;
      if (unread > 0) { badge.style.display = 'block'; badge.textContent = unread > 9 ? '9+' : unread; }
      else { badge.style.display = 'none'; }
    }
  }
  // 2) 서버에 백그라운드 저장 (실패해도 화면 유지)
  window.fbUpdateDoc(window.fbDoc(window.fbDb, 'inquiries', id), { replyRead: true })
    .catch(function(err) {
      showToast('읽음 저장 실패: ' + (err && (err.code||err.message) || ''), 'error');
    });
  // 3) 상세 모달 열기
  showMsgDetail(id);
}

// 쪽지 상세 모달 표시
function showMsgDetail(id) {
  _currentMsgId = id;
  var q = _myMessages.filter(function(m){ return m.id === id; })[0];
  if (!q) return;
  var body = document.getElementById('msgDetailBody');
  var typeText = q.type === 'renewal' ? '플랜 연장/변경' : '1:1 문의';
  if (body) {
    body.innerHTML =
      '<div style="font-size:11px;color:#94a3b8;margin-bottom:8px"><span style="background:#ede9fe;color:#6d28d9;font-weight:700;padding:1px 7px;border-radius:5px">' + typeText + '</span></div>'
      + '<div style="background:#f8fafc;border-radius:8px;padding:10px 12px;font-size:13px;color:#475569;line-height:1.5;margin-bottom:8px"><b>내 문의:</b><br>' + escapeMsg(q.message||'') + '</div>'
      + '<div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:6px;padding:10px 12px;font-size:13px;color:#166534;line-height:1.5"><b>관리자 답변:</b><br>' + escapeMsg(q.reply||'') + '<div style="font-size:10px;color:#94a3b8;margin-top:5px">' + (q.replyAt||'').slice(0,16).replace('T',' ') + '</div></div>';
  }
  var ta = document.getElementById('msgReplyText');
  if (ta) ta.value = '';
  var modal = document.getElementById('msgDetailModal');
  if (modal) modal.style.display = 'flex';
  navOpenOverlay('msgDetailModal');
}

function closeMsgDetail() {
  var modal = document.getElementById('msgDetailModal');
  if (modal) modal.style.display = 'none';
  _currentMsgId = null;
  navOnOverlayClosed('msgDetailModal');
}

// 답장 보내기 (방식 A: 새 문의로 생성)
function sendMessageReply() {
  if (!window.fbDb || !window.fbAuth || !window.fbAuth.currentUser) {
    showToast('로그인이 필요합니다.', 'error'); return;
  }
  var ta = document.getElementById('msgReplyText');
  var text = ta ? ta.value.trim() : '';
  if (!text) { showToast('답장 내용을 입력해주세요.', 'error'); return; }

  var orig = _myMessages.filter(function(m){ return m.id === _currentMsgId; })[0];
  var uid = window.fbAuth.currentUser.uid;
  var btn = document.getElementById('msgReplyBtn');
  if (btn) { btn.disabled = true; btn.textContent = '전송 중...'; }

  window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid)).then(function(snap) {
    var data = snap.exists() ? snap.data() : {};
    return window.fbCallable('submitInquiry')({
      type: orig ? (orig.type || 'cs') : 'cs',
      name: data.name || '',
      schoolName: data.schoolName || '',
      phone: data.phone || '',
      message: text,
      uid: uid,
      replyTo: _currentMsgId || null,  // 원 문의 참조 (참고용)
      createdAt: new Date().toISOString(),
      status: 'unread'
    });
  }).then(function() {
    showToast('답장을 보냈습니다. 관리자 답변은 쪽지함에서 확인하실 수 있어요.');
    if (btn) { btn.disabled = false; btn.textContent = '답장 보내기'; }
    closeMsgDetail();
  }).catch(function(err) {
    if (btn) { btn.disabled = false; btn.textContent = '답장 보내기'; }
    showToast('전송 실패: ' + (err && (err.code||err.message) || ''), 'error');
  });
}

// 사용자 쪽지 삭제 (3번)
function deleteMyMessage(id) {
  if (!confirm('이 쪽지를 삭제할까요? 되돌릴 수 없습니다.')) return;
  window.fbDeleteDoc(window.fbDoc(window.fbDb, 'inquiries', id))
    .then(function() {
      showToast('쪽지를 삭제했습니다.');
      // 캐시에서 제거 후 재그리기 (재조회 없음)
      _myMessages = _myMessages.filter(function(q){ return q.id !== id; });
      drawMessageList();
      refreshMyMessageBadge();
    })
    .catch(function(err) {
      showToast('삭제 실패: ' + (err && (err.code||err.message) || ''), 'error');
    });
}


// 마이페이지 1:1 문의 (로그인 사용자)
function submitMyInquiry() {
  if (!window.fbDb || !window.fbAuth || !window.fbAuth.currentUser) {
    showToast('로그인이 필요합니다.', 'error');
    return;
  }
  var ta = document.getElementById('myInquiryMessage');
  var msg = ta ? ta.value.trim() : '';
  if (!msg) { showToast('문의 내용을 입력해주세요.', 'error'); return; }
  var uid = window.fbAuth.currentUser.uid;

  window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid)).then(function(snap) {
    var data = snap.exists() ? snap.data() : {};
    return window.fbCallable('submitInquiry')({
      type: 'cs',
      name: data.name || '',
      schoolName: data.schoolName || '',
      phone: data.phone || '',
      message: msg,
      uid: uid,
      createdAt: new Date().toISOString(),
      status: 'unread'
    });
  }).then(function() {
    if (ta) ta.value = '';
    var r = document.getElementById('myInquiryResult');
    if (r) { r.style.display = 'block'; r.textContent = '문의가 접수됐습니다. 답변은 쪽지함에서 확인하실 수 있어요.'; }
    showToast('문의가 접수됐습니다!');
  }).catch(function(err) {
    showToast('문의 전송 실패. 다시 시도해주세요.', 'error');
  });
}
