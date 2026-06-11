// EduNote 공용 코어 헬퍼 (core.js) — 상태(state.js) 의존, 순수 utils 와 구분.
// classic <script> — state.js 뒤, 기능 모듈/모놀리스보다 먼저 로드.
// 정의: recKey/stuKey(localStorage 키, currentUser 의존),
//   isOwnerOrAdmin/getRoleBadge/getRoleBadgeColor(역할, currentRole 의존). 모두 window 전역.
// 의존: currentUser/currentRole (state.js). 호출은 전부 런타임.
// 주의: 다른 파일에서 재정의 금지.

function recKey() { return 'kms_records_'+(currentUser||'_'); }
function stuKey() { return 'kms_students_'+(currentUser||'_'); }

function isOwnerOrAdmin() {
  return currentRole === 'owner' || currentRole === 'superadmin';
}

function getRoleBadge() {
  if (currentRole === 'superadmin') return '관리자';
  if (currentRole === 'owner') return '원장님';
  if (currentRole === 'teacher') return '선생님';
  return '';
}

function getRoleBadgeColor() {
  if (currentRole === 'superadmin') return { bg: '#f59e0b', color: '#1e293b' };
  if (currentRole === 'owner')      return { bg: '#6366f1', color: '#fff' };
  return { bg: '#e2e8f0', color: '#475569' };
}
