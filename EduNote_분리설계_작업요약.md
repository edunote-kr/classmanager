# EduNote 작업요약 — 모듈 분리 설계 & 진행 이력

> 단일 `index.html`(약 10,700줄)을 여러 파일로 나누는 리팩토링을 여러 세션에 걸쳐 진행하기 위한 기준 문서.
> 작성 시점: 2026-06. 기술스택: Firebase(Auth/Firestore `edunote-b199a`, `asia-northeast3`, Blaze) + GitHub Pages(`edunote.kr`).

---

## 1. 지금 구조 (현재 상태)

- 단일 `index.html` 안에 HTML·CSS·JS가 모두 들어있음.
- 역할 3종: superadmin / 원장(owner) / 선생님(teacher).
- 데이터 모델 핵심
  - 과제: `users/{uid}/records/{recId}` — **계정별 저장**.
  - 알림장: `users/{uid}/notices/{id}` — **계정별 저장**.
  - 출결: 학교 단위로 미러(`classAttendance`).
  - 학원: `schools/{docId}` (docId == ownerCode 생성값과 일치하는 경로로 setDoc 또는 addDoc).
  - 학원명 인덱스: `schoolNames/{nameKey}` (중복 학원 방지).
  - 전역 상태: `records`, `students`, `notices`, `currentUser`(이름), `currentRole`, `currentSchool`(=본인 uid), `currentSchoolId`(학원 docId).
- 원장은 `loadOwnerData(uid)`로 학원 전체 멤버의 records/notices를 집계해서 본다.

---

## 2. 분리 설계 (1단계 = 빌드 도구 없이)

### 계층 구조 (위가 아래를 사용, 아래는 위를 모름)

```
index.html  (뼈대 + 패널 마크업 + 모든 script를 순서대로 로드)
│
├─ 화면 모듈 (UI·렌더)
│   records.js · attendance.js · notices.js · students-stats.js · billing.js · admin.js
│
├─ 도메인 로직 (저장·집계·규칙)
│   recordStore · schoolStore · authFlow
│
├─ 공통 코어 (모두가 의존)
│   state.js · fb.js · ui.js · utils.js
│
└─ Firebase (Auth · Firestore)
```

### 각 파일 책임

| 파일 | 책임 |
|---|---|
| `core/state.js` | **전역 상태 한 곳**(`App.state.records/notices/students/currentUser/currentRole/currentSchool/currentSchoolId`) |
| `core/fb.js` | Firebase 초기화 + `fbDoc/fbGetDocs/fbSetDoc/...` 래퍼, `getDocsTO` 타임아웃 |
| `core/ui.js` | `showToast`, `showLoading`, 모달, 화면 전환(`activateScreen` 등) |
| `core/utils.js` | `todayStr`, `esc/escapeNotice`, `normalizeRec`, `generateCode`, `planTeacherLimit` |
| `domain/recordStore.js` | records/notices의 **저장·중복제거(dedup)·삭제 동기화** (persist 로직 집결) |
| `domain/schoolStore.js` | `loadOwnerData`(원장 집계), 멤버/정원, 학원 생성·인덱스 |
| `domain/authFlow.js` | `loadUserProfile`, `initWithFirebase`, 코드 합류(`activateWithCode`) |
| `ui/records.js` | 과제 입력 폼·목록(월별 묶기)·카드 |
| `ui/attendance.js` | 출결 화면·키오스크 |
| `ui/notices.js` | 알림장 화면(월별 묶기, 선생님 필터) |
| `ui/students-stats.js` | 학생 관리·통계·차트 |
| `ui/billing.js` | 플랜/구독/크레딧/무료체험 신청 |
| `ui/admin.js` | 슈퍼관리자(학원관리·승인·인원설정·학원데이터) |
| `styles.css` | 전부 분리 |

### 핵심 설계 결정

1. **전역 상태를 `state.js` 한 곳으로.**
   지금 `records/currentUser/currentSchoolId`가 코드 전체에 흩어진 게 분리의 최대 함정.
   → `App.state.records`처럼 한 객체로 모아 어느 파일에서든 같은 값을 보게 한다. (가장 까다롭고 가장 중요)

2. **빌드 도구 없이 1단계 진행.**
   `index.html`에서 `<script src="core/state.js">` … 순서대로 로드하고, 각 모듈은 `window.App`에 자기 함수를 붙인다.
   → GitHub Pages에 파일 교체만으로 그대로 배포됨. ES모듈/Vite 전환은 규모가 더 커질 때 2단계로.

### 옮기는 순서 (위험 낮은 것부터, 한 세션에 한 단계씩)

1. ✅ `styles.css` 분리 — **완료(2026-06)**. 메인 CSS 449줄 + 로더 keyframe → `styles.css`, index 는 `<link rel="stylesheet" href="styles.css">`. 인라인 `style=`(약 1,600개)는 유지.
2. ✅ `utils.js` · `fb.js` — **완료(2026-06)**.
   - `fb.js`: 기존 인라인 Firebase ES module 을 그대로 외부화(`<script type="module" src="fb.js">`). deferred 실행이라 동작·순서 동일.
   - `utils.js`: 순수 유틸 10종(`todayStr, formatDate, escapeNotice, escHtml, escapeInq, escapeAdmin, escapeMsg, isCode4, gradeLevel, generateCode`)만 추출. **모놀리스보다 먼저 로드**(styles 링크 뒤 `<script src="utils.js">`)되어 전역 정의. `recKey/stuKey/noticeKey`는 `currentUser` 참조라 **제외**(순수 아님).
3. ✅ `state.js`로 전역 모으기 — **완료(2026-06, B안)**.
   - **B안(선언만 이동)**: 전역 상태 8종(`currentUser, currentRole, currentSchool, currentSchoolId, currentSchoolProfile, records, notices, students`)을 `state.js`(classic)로 옮기고, 모놀리스의 top-level `var` 선언 3블록을 제거(주석 마커 대체). classic script 는 `window` 를 공유하므로 bare 참조(`records`)·`window.records` 가 **무수정**으로 같은 값을 봄 → "어느 파일에서든 같은 값" 목표 충족.
   - **A안(`App.state.X` 전면치환) 보류**: ~9,000줄 수백곳 치환은 고위험이고, 그 이득(전역 공유)은 classic 에선 window 로 이미 달성됨. `App.state` 네임스페이스는 **ES모듈 전환(2단계)** 때 필요해지므로 그때 함께 한다.
   - 설계 문서가 경고한 "값 넣었는데 다른 파일에선 빈" 조용한 버그는 **ES모듈 한정** 문제이며 classic 구조에선 발생하지 않음(window 공유). `var` 호이스팅상으로도 state.js 가 모놀리스보다 먼저 초기화하므로 과거보다 더 안전.
   - ⚠ **선언 규칙**: 이 8종의 `var` 선언은 **state.js 한 곳에만** 둔다. **state.js 파일 자체는 수정 가능**(전역 추가·초기값 변경은 여기서 함). 금지되는 것은 **다른 파일**(모놀리스·신규 모듈)에서의 `var X = ...` **재선언**뿐이다(state.js 가 만든 값을 초기화로 덮어써 데이터 유실). 재할당(`records = [...]`, `var` 없이)·함수 내부 지역 `var records` 셰도잉은 정상.
4. ✅ 가장 독립적인 기능부터(알림장) — **완료(2026-06, `notices.js`)**.
   - 모놀리스 연속 블록(섹션주석 ~ `deleteNotice`, 약 190줄)을 `notices.js`(classic, state.js 뒤·모놀리스 앞)로 이동. 정의 9종(noticeKey/persistNotices/saveNotice/필터2/renderNotices/toggleNoticeGroup/makeNoticeCard/deleteNotice)은 top-level fn → window 전역이라 인라인 onclick·타 파일 호출 무손상.
   - **잔류(의도적, 아직 모놀리스)**: `saveNoticeCard`(멀리 떨어진 카드 저장), `loadOwnerData` 내 알림장 집계·dedup(원장 도메인 → 추후 `schoolStore`로). 모듈 v1 은 UI+persist 핵심만, 도메인 집계는 분리하지 않음.
   - 안전성: notices.js 가 모놀리스 top-level `let/const`(window 전역 아님) 참조 0 → "다른 파일에서 안 보이는 변수" 트랩 없음. node --check(notices.js + 인라인 7블록) 전부 통과.
5. **새 기능은 처음부터 별도 파일.**

### 현재 로드 순서 / 파일 구성 (4단계 시점)

```
index.html (뼈대 + 마크업 + 모놀리스 <script> + IIFE 들)
  ├─ styles.css                              (link)
  ├─ utils.js                                (classic, 모놀리스보다 먼저)
  ├─ state.js                                (classic, 전역 상태 8종 — utils 뒤)
  ├─ notices.js                              (classic, 알림장 UI+persist — state 뒤)
  ├─ fb.js                                   (type=module, deferred)
  └─ 모놀리스 <script> (약 9,050줄) + 후속 IIFE 스크립트들
```
배포: 위 파일 전부 **repo 루트**(edunote.kr 루트)에 함께. 상대경로. 규칙/함수 변경 없음.
다음 단계=⑤ 다음 독립 기능 한 모듈씩(후보: 출결/키오스크 `attendance.js`). 원장 집계(`loadOwnerData` 등)는 도메인 `schoolStore` 로 별도 분리 검토.

> 주의: 단순 복붙 아님. 특히 3단계(전역 상태)는 잘못 끊으면 "값을 넣었는데 다른 파일에선 비어있는" 조용한 버그가 생김. 단계마다 분리 후 문법검증 + 실제 동작 확인.

---

## 3. 우선순위 (분리보다 먼저 / 나중)

**분리보다 먼저 (상용 진입 필수)**

1. **보안 규칙** — 미성년자 개인정보. `users`·`schools` 컬렉션 전체 스캔 의존(where로 못 막는 권한)을 per-document 접근으로 리팩토링. 개인정보보호법·신뢰 직결. (최우선)
2. **결제 실연동** — PG 가맹 후 카드 stub 교체, 무통장 확인. 세금계산서/환불.
3. **개인정보/법무** — 처리방침·동의 흐름, 알림톡 발신번호 등록·템플릿 심사.

**그 다음**

4. 파일 분리(본 문서) — 기능 더 붙이기 전에.
5. PWA, 다중 원장, 인앱 도움말 등.

---

## 4. 최근 세션 수정 이력 (배포본 기준)

- **원장이 선생님 과제 못 봄** → 렌더 필터를 이름비교(`ADMIN_NAME`)에서 역할기반(`isOwnerOrAdmin()`)으로 변경(5곳).
- **무료체험 정책** → `autoActivateFreeTrial` 재작성: 이미 사용 시 공통 메시지 "이미 무료 체험을 사용하셨습니다." 차단 / 미사용+기존학원 보유 시 새 학원 안 만들고 만료일 +14일 연장 / 미사용+학원없음 시 신규 생성.
- **과제 2개 중복** → 원인은 `persist()`가 원장 메모리의 학원 전체 기록을 원장 서브컬렉션에 복사. 수정: persist는 **본인 작성분만** 저장 + `loadOwnerData`에서 id별 **작성자 우선 dedup** + 정리 유틸 `cleanupOwnerDupRecords()`(과제+알림장 사본 삭제) 추가.
- **무료 플랜 문자량** 300 → **100**(프로기능 유지, 문자만 축소).
- **선생님 정원** — 플랜별 기본 정원(무료10/베이직5/프로10/프리미엄20) `PLANS.teacherLimit`, 합류 시 만석 메시지에 "관리자에게 문의" 추가, 플랜 카드/요금 문구 전면 교체(정원 표기 + 카드·입금 결제 안내).
- **알림장 원장 집계** — `loadOwnerData`에 notices 병렬 로드 + dedup, `persistNotices` 복사 방지 가드, 카드에 작성 선생님 표기, **선생님별 필터** 드롭다운(원장만).
- **월별 묶기** — 과제목록·알림장 모두 이번 달은 그대로(오늘 펼침), 지난 달은 "YYYY년 M월" 단위 접기(`toggleMonthBox`).
- **슈퍼관리자** — 학원 카드에 무료체험 쿠폰 사용여부 배지, 학원데이터 집계에 작성자 우선 dedup(2개가 4개로 보이던 문제 해소).
- **플로팅 버튼** — "문의" 텍스트 제거, 노란 원형 + 카톡 "TALK" 아이콘.

**배포 후 1회 권장:** 원장 콘솔에서 `cleanupOwnerDupRecords()` 실행(기존 복사본 정리) → 새로고침.

---

## 5. 작업 원칙 (유지)

- 모든 변경은 `index.html` 하나로 출력(분리 진행 전까지). 새 필드는 `normalizeRecord` 등록 필수(누락 시 데이터 유실).
- 고정 HTML 요소 사용. `position:fixed` + 부모 transform 충돌 시 `document.body`에 마운트.
- 날짜는 KST(`todayStr`은 로컬 오프셋 사용).
- `.catch(()=>{})`로 에러를 삼키는 패턴 주의 — 권한 거부/실패가 조용히 묻혀 데이터가 어긋날 수 있음.
- Firestore 실제 보안 경계는 config 노출이 아니라 **rules**. 컬렉션 전체 읽기 권한은 코드 구조 변경으로만 좁혀짐.
- 대형 변경/데이터 모델 변경 전 반드시 확인 후 진행. 변경 후 `node --check`로 JS 문법 검증.
- 복잡한 레이아웃 버그는 CSS 추측 대신 렌더 기반 진단.
