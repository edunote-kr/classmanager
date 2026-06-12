/* EduNote utils.js — 의존 없는 공통 유틸 (전역 함수).
   index.html 의 메인 스크립트보다 먼저 로드되어 전역에 정의된다.
   ※ 순수 함수만(모놀리스 상태/함수 비참조). 분리 1단계 산출물. */
function isCode4(c) { return /^\d{4}$/.test(c); }
function gradeLevel(g){ g=String(g||''); if(/초/.test(g))return '초등'; if(/중/.test(g))return '중등'; if(/고/.test(g))return '고등'; return '기타'; }
function todayStr() {
  // 로컬(예: KST) 기준 날짜. toISOString은 UTC라 새벽 시간대에 하루 어긋나므로 보정.
  var d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function formatDate(d) { return d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short'}); }
function escapeNotice(s){ if(s==null)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// 인라인 onclick 등 속성 안에 문자열 '인자'로 넣을 때 사용.
// JS 문자열 이스케이프(\\ ' 개행) + HTML 속성 이스케이프(& " < >) 동시 적용 →
// 속성 탈출/인자 문자열 탈출(XSS) 모두 차단. (브라우저가 속성 디코드 후 JS가 인자 디코드)
function escJsArg(s){
  return String(s==null?'':s)
    .replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\r?\n/g,' ');
}
function escapeInq(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAdmin(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function generateCode(length) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
function escapeMsg(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// 수업내용(오늘의학습/독해/문법/내신/기타/보충, 1~5 포함)이 하나라도 있는지.
// 미리보기 has 가드·makeCard·텍스트export·saveRecord 검증에서 공용 사용(가드 drift 방지).
function hasAnyLessonContent(rec){
  if(!rec) return false;
  if(rec.todayContent||rec.reading||rec.grammar) return true;
  if(rec.todayContent1||rec.todayContent2||rec.todayContent3||rec.todayContent4||rec.todayContent5) return true;
  for(var i=1;i<=5;i++){
    if(rec['today'+i]||rec['reading'+i]||rec['grammar'+i]||rec['exam'+i]||rec['etc'+i]||rec['supplement'+i]) return true;
  }
  return false;
}
