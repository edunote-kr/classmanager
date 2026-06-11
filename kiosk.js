// EduNote 키오스크(출결 체크 모드) 모듈 (kiosk.js)
// classic <script> — notices.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// 트랙2: 학생/선생님 코드 입력 등하원·출퇴근 체크인.
// 정의: 상태 var(_kioskOn/_kioskExitPin/_kioskInput/_checkinDay/_checkinDate/_notifyLog, KIOSK_OUT_GAP_MS),
//   함수 _hm/openKioskSetup/closeKioskSetup/startKioskFromSetup/startKiosk/loadCheckins/_renderKioskDisplay/
//   kioskKey/kioskBack/kioskClear/kioskSubmit/processTeacherCheckin/notifyStubTeacher/processCheckin/
//   persistCheckin/notifyStub/_renderKioskRecent/_kioskResult/kioskExitPrompt/closeKioskExit/confirmKioskExit/closeKiosk.
//   (top-level → window 전역, 정적 HTML 의 인라인 onclick·외부 _kioskOn 참조 무손상.)
// 런타임 의존(window 전역): students/teachers·currentSchool·todayStr·showToast·fb 래퍼 등 (state.js/utils.js/fb.js/모놀리스).
// 주의: 이 식별자들을 다른 파일에서 재선언/재정의하지 말 것.

/* ===== 출결 체크 모드 (트랙2: 등하원 코드 시스템) ===== */
var _kioskOn=false, _kioskExitPin='', _kioskInput='', _checkinDay={}, _checkinDate='', _notifyLog=[];
var KIOSK_OUT_GAP_MS=30*60*1000;
function _hm(ms){ var d=new Date(ms); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }
function openKioskSetup(){
  var inp=document.getElementById('kioskPinInput'); if(inp) inp.value='';
  document.getElementById('kioskSetupModal').style.display='flex';
}
function closeKioskSetup(){ var m=document.getElementById('kioskSetupModal'); if(m) m.style.display='none'; }
function startKioskFromSetup(){
  var pin=((document.getElementById('kioskPinInput')||{value:''}).value||'');
  if(!/^[0-9]{4}$/.test(pin)){ showToast('해제 코드 4자리를 입력하세요.','error'); return; }
  _kioskExitPin=pin; closeKioskSetup(); startKiosk();
}
function startKiosk(){
  // position:fixed가 변형된 부모 기준으로 잡혀 버튼이 화면 밖으로 밀리는 문제 방지 → body로 이동
  var _ko=document.getElementById('kioskOverlay'); if(_ko && _ko.parentElement!==document.body) document.body.appendChild(_ko);
  var _kx=document.getElementById('kioskExitModal'); if(_kx && _kx.parentElement!==document.body) document.body.appendChild(_kx);
  _kioskInput=''; _kioskOn=true; _checkinDate=todayStr(); _notifyLog=[];
  document.getElementById('kioskSchoolName').textContent=(currentSchoolProfile&&currentSchoolProfile.name)||'';
  document.getElementById('kioskResult').innerHTML='';
  document.getElementById('kioskRecent').innerHTML='';
  _renderKioskDisplay();
  document.getElementById('kioskOverlay').style.display='flex';
  try{ history.pushState({kiosk:1},''); }catch(e){}
  loadCheckins();
  if(typeof loadSchoolTeachers==='function') loadSchoolTeachers();
  if(window.fbDb && currentSchoolId){ window.fbGetDoc(window.fbDoc(window.fbDb,'schools',currentSchoolId)).then(function(sn){ if(sn&&sn.exists&&sn.exists()){ currentSchoolProfile.teacherMeta=(sn.data()||{}).teacherMeta||{}; } }).catch(function(){}); }
}
function loadCheckins(){
  _checkinDay={};
  if(window.fbDb && currentSchoolId){
    window.fbGetDoc(window.fbDoc(window.fbDb,'schools',currentSchoolId,'checkins',_checkinDate)).then(function(snap){
      _checkinDay=(snap&&snap.exists&&snap.exists())?(snap.data()||{}):{};
    }).catch(function(){ _checkinDay={}; });
  } else {
    try{ _checkinDay=JSON.parse(localStorage.getItem('kms_checkins_'+currentSchoolId+'_'+_checkinDate)||'{}'); }catch(e){ _checkinDay={}; }
  }
}
function _renderKioskDisplay(){
  var d=document.getElementById('kioskDisplay'); if(!d) return;
  var arr=[]; for(var i=0;i<4;i++){ arr.push(i<_kioskInput.length?_kioskInput[i]:'·'); }
  d.textContent=arr.join(' ');
}
function kioskKey(n){
  if(!_kioskOn || _kioskInput.length>=4) return;
  _kioskInput+=n; _renderKioskDisplay();
  if(_kioskInput.length===4) setTimeout(kioskSubmit,140);
}
function kioskBack(){ _kioskInput=_kioskInput.slice(0,-1); _renderKioskDisplay(); }
function kioskClear(){ _kioskInput=''; _renderKioskDisplay(); }
function kioskSubmit(){
  var code=_kioskInput; _kioskInput=''; _renderKioskDisplay();
  if(code.length!==4) return;
  var stu=students.find(function(s){ return String(s.code4)===String(code); });
  if(stu){ processCheckin(stu); return; }
  var tch=(_schoolTeachers||[]).find(function(t){ return t.status!=='inactive' && _teacherCode(t)===String(code); });
  if(tch){ processTeacherCheckin(tch); return; }
  _kioskResult('error','코드를 확인해주세요','일치하는 학생·선생님이 없습니다');
}
function processTeacherCheckin(tch){
  var key='t_'+tch.uid, now=Date.now(), rec=_checkinDay[key];
  if(!rec || !rec.inAt){
    _checkinDay[key]={ name:tch.name, role:'teacher', inAt:now, outAt:0 };
    persistCheckin(key); notifyStubTeacher('출근', tch, now);
    _kioskResult('in', tch.name+' 선생님 출근!', _hm(now)+' 출근 처리되었습니다');
  } else if(!rec.outAt){
    if(now-rec.inAt < KIOSK_OUT_GAP_MS){
      _kioskResult('warn', tch.name+' 이미 출근', _hm(rec.inAt)+' 출근함 · 퇴근은 30분 후');
    } else {
      rec.outAt=now; _checkinDay[key]=rec;
      persistCheckin(key); notifyStubTeacher('퇴근', tch, now);
      _kioskResult('out', tch.name+' 선생님 퇴근!', _hm(now)+' 퇴근 처리되었습니다');
    }
  } else {
    _kioskResult('warn', tch.name+' 출퇴근 완료', '오늘 출근·퇴근이 모두 기록됨');
  }
}
function notifyStubTeacher(type, tch, ms){
  var school=(currentSchoolProfile&&currentSchoolProfile.name)||'학원';
  var msg='['+school+'] '+tch.name+' 선생님이 '+_hm(ms)+'에 '+type+'했습니다.';
  _notifyLog.unshift({ msg:msg, at:ms, type:type, student:tch.name+' 선생님' });
  try{ var q=JSON.parse(localStorage.getItem('kms_notifyQueue')||'[]'); q.unshift({msg:msg,at:ms,type:type,sent:false}); localStorage.setItem('kms_notifyQueue', JSON.stringify(q.slice(0,300))); }catch(e){}
  if(window.console) console.log('[알림 stub - 발송 예정]', msg);
  _renderKioskRecent();
}
function processCheckin(stu){
  var sid=String(stu.id), now=Date.now(), rec=_checkinDay[sid];
  if(!rec || !rec.inAt){
    _checkinDay[sid]={ name:stu.name, inAt:now, outAt:0 };
    persistCheckin(sid); notifyStub('등원', stu, now);
    _kioskResult('in', stu.name+' 등원!', _hm(now)+' 등원 처리되었습니다');
  } else if(!rec.outAt){
    if(now-rec.inAt < KIOSK_OUT_GAP_MS){
      _kioskResult('warn', stu.name+' 이미 등원', _hm(rec.inAt)+' 등원함 · 하원은 30분 후');
    } else {
      rec.outAt=now; _checkinDay[sid]=rec;
      persistCheckin(sid); notifyStub('하원', stu, now);
      _kioskResult('out', stu.name+' 하원!', _hm(now)+' 하원 처리되었습니다');
    }
  } else {
    _kioskResult('warn', stu.name+' 출결 완료', '오늘 등원·하원이 모두 기록됨');
  }
}
function persistCheckin(sid){
  var obj={}; obj[sid]=_checkinDay[sid];
  if(window.fbDb && currentSchoolId){
    window.fbSetDocMerge(window.fbDoc(window.fbDb,'schools',currentSchoolId,'checkins',_checkinDate), obj).catch(function(){});
  }
  try{ localStorage.setItem('kms_checkins_'+currentSchoolId+'_'+_checkinDate, JSON.stringify(_checkinDay)); }catch(e){}
}
function notifyStub(type, stu, ms){
  var school=(currentSchoolProfile&&currentSchoolProfile.name)||'학원';
  var msg='['+school+'] '+stu.name+' 학생이 '+_hm(ms)+'에 '+type+'했습니다.';
  _notifyLog.unshift({ msg:msg, at:ms, type:type, student:stu.name });
  try{ var q=JSON.parse(localStorage.getItem('kms_notifyQueue')||'[]'); q.unshift({msg:msg,at:ms,type:type,sent:false}); localStorage.setItem('kms_notifyQueue', JSON.stringify(q.slice(0,300))); }catch(e){}
  if(window.console) console.log('[알림 stub - 발송 예정]', msg);
  _renderKioskRecent();
}
function _renderKioskRecent(){
  var el=document.getElementById('kioskRecent'); if(!el) return;
  var items=_notifyLog.slice(0,5);
  el.innerHTML = items.length ? '<div style="color:#64748b;font-size:11px;margin-bottom:6px;text-align:center">최근 알림 (전송 예정)</div>'+items.map(function(it){
    var c= (it.type==='등원'||it.type==='출근') ? '#34d399' : '#fbbf24';
    return '<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 11px;margin-bottom:5px;color:#cbd5e1;font-size:12px"><span style="color:'+c+';font-weight:700">'+it.type+'</span> '+escapeNotice(it.student)+' · '+_hm(it.at)+'</div>';
  }).join('') : '';
}
function _kioskResult(kind, big, sub){
  var colors={'in':'#34d399','out':'#fbbf24','warn':'#94a3b8','error':'#f87171'};
  var c=colors[kind]||'#cbd5e1';
  var el=document.getElementById('kioskResult'); if(!el) return;
  el.innerHTML='<div style="text-align:center"><div style="font-size:22px;font-weight:800;color:'+c+'">'+escapeNotice(big)+'</div><div style="font-size:12px;color:#94a3b8;margin-top:4px">'+escapeNotice(sub)+'</div></div>';
  clearTimeout(window._kioskResultTimer);
  window._kioskResultTimer=setTimeout(function(){ var e=document.getElementById('kioskResult'); if(e&&_kioskOn) e.innerHTML=''; }, 3500);
}
function kioskExitPrompt(){
  var inp=document.getElementById('kioskExitInput'); if(inp) inp.value='';
  document.getElementById('kioskExitModal').style.display='flex';
  setTimeout(function(){ if(inp) inp.focus(); },60);
}
function closeKioskExit(){ var m=document.getElementById('kioskExitModal'); if(m) m.style.display='none'; }
function confirmKioskExit(){
  var pw=((document.getElementById('kioskExitInput')||{value:''}).value||'');
  if(!pw){ showToast('비밀번호를 입력하세요.','error'); return; }
  var user=window.fbAuth && window.fbAuth.currentUser;
  if(!user || !user.email || !window.fbReauth || !window.fbEmailAuthProvider){ showToast('로그인 상태가 아니어서 확인할 수 없습니다.','error'); return; }
  var btn=document.getElementById('kioskExitConfirmBtn');
  if(btn){ btn.disabled=true; btn.textContent='확인 중...'; }
  function _restore(){ if(btn){ btn.disabled=false; btn.textContent='나가기'; } }
  var cred=window.fbEmailAuthProvider.credential(user.email, pw);
  window.fbReauth(user, cred).then(function(){
    _restore(); closeKioskExit(); closeKiosk();
  }).catch(function(err){
    _restore();
    var c=err && err.code;
    if(c==='auth/wrong-password'||c==='auth/invalid-credential') showToast('비밀번호가 올바르지 않습니다.','error');
    else if(c==='auth/too-many-requests') showToast('시도가 많습니다. 잠시 후 다시 시도하세요.','error');
    else showToast('확인 실패: '+(err&&err.message||''),'error');
  });
}
function closeKiosk(){
  _kioskOn=false; _kioskInput='';
  var o=document.getElementById('kioskOverlay'); if(o) o.style.display='none';
}
