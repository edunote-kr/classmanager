// EduNote 전역 상태 (state.js)
// classic <script> — 모놀리스(index.html)보다 먼저 로드된다.
// classic script 는 window 를 공유하므로 bare 참조(records 등)와 window.records 둘 다 그대로 동작.
// 주의:
//  - 모놀리스에서 이 변수들을 다시 `var X = ...` 로 선언하지 말 것(초기화로 덮어써짐).
//  - 재할당(records = [...], currentUser = ...)은 정상. 같은 window 전역을 갱신한다.
//  - 함수 내부의 지역 `var records`(셰도잉)는 별개이므로 그대로 둔다.

var currentUser = null;            // 로그인 사용자 이름
var currentRole = null;            // 'superadmin' | 'owner' | 'teacher'
var currentSchool = null;          // 소속 기준(본인 uid)
var currentSchoolId = null;        // 소속 학원 docId
var currentSchoolProfile = { name: '', phone: '', logo: null };  // 학원 프로필(로고 이미지 등)

var records = [];                  // 과제 records
var notices = [];                  // 알림장 (반·오늘 과제·특이사항)
var students = [];                 // 학생 목록

var activeTab = 'dashboard';       // 현재 활성 탭(switchTab 이 갱신). preview.js 등 모듈이 공유 참조.
