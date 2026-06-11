# EduNote 통합요약

> 갱신: 2026-06. 학원(하그원) 과제·출결·수업 관리 SaaS. 상용화 준비 단계, 소규모 테스트 중.

## 제품 개요

- **EduNote** (edunote.kr) — 과제/출결/수업·반 관리. 단일 `index.html`(vanilla JS) + Firebase.
- 스택: Firebase Auth/Firestore/Functions(v2, `asia-northeast3`, Blaze, **런타임 nodejs22**) + GitHub Pages(GitHub 계정 `edunote-kr`, 커스텀 도메인 edunote.kr).
- 역할 3종: 슈퍼관리자 / 원장(owner) / 선생님(teacher). 로그인 `아이디@edunote.kr`.
- 테스트 학원: "KMS ENGLISH X EPIC". 슈퍼 로그인 admin@edunote.kr.

## 현재 상태 (2026-06 세션 기준)

### 보안 — 핵심 완료 ✅ (상세: `EduNote_보안작업_요약.md`)
- Firestore 규칙 **v13** + 합류/학원생성/코드대조 서버화(Cloud Functions).
- **App Check(reCAPTCHA v3)** 적용 + 메인 함수 5종 강제(`ENFORCE_APP_CHECK=true`).
- 함수 하드닝: joinByCode 레이트리밋 + **원장 코드 합류 maxOwners(기본1) 정원 검사(⑨)**, createFreeTrialSchool 트랜잭션·스캔 제거(+maxOwners:1 명시), checkPhoneAvailable 풀스캔 제거, crypto 코드 생성, deleteMyAccount/deleteUser 재귀 파기, enumeration 차단.
- `backfillPhoneKeys` 1회 실행 완료(레거시 phoneKey 채움).
- **쓰기·읽기 표면 하드닝(v11·v12·v13)**:
  - v11: inquiries/applications `hasOnly` 화이트리스트 + 길이 캡(message≤4000), 문의 textarea maxlength=4000.
  - v12: userIds create 에 hasOnly+uid==본인+ID 캡.
  - **v13: 교차 테넌트(타 학원 데이터) 차단** — (A) users/create 에서 schoolId 자기주장 금지(비슈퍼는 미설정/null만; 멤버십은 서버 함수만 부여), (B) schools/create 슈퍼 전용 축소. 공개 schoolNames(docId 노출)+create 시 임의 schoolId 주입을 결합한 "타 학원 멤버 PII/학생풀/출결 전량 읽기" 경로를 봉쇄. 정상 클라 무손상·단독 게시 완료.
  - 동적키/내부신뢰 경로(checkins·classAttendance·공유 students·본인 records)는 수용 위험으로 분류.
- Cloud Functions 8종: resetPasswordByPhone / deleteUser / **ownerSetTeacherActive(신규: 원장이 선생님 활성·비활성 토글)** / joinByCode / createFreeTrialSchool / checkPhoneAvailable / checkJoinCode / deleteMyAccount / backfillPhoneKeys.
- **함수 런타임 Node 20→22 전환 완료**(2026-06). deps 핀: `firebase-functions ^7.2.5` + `firebase-admin ^13.10.0`.

### 보안 — 확인 권장(미완 점검) ⏳
- App Check verified 며칠 모니터링 / 휴대폰 OTP 두 흐름(가입·비번재설정).
- v13 스모크 3건: 일반 가입 / 코드 합류 가입 / 슈퍼 학원추가·신청승인.
- Node22 콜드스타트(checkPhoneAvailable 1회) + 콘솔 런타임 `nodejs22` 표기.

### UI 버그 수정 (이전 세션)
- **충전/충전설정 깜빡임**: 플랜 화면이 잠깐 떴다 크레딧 뷰로 바뀌던 문제 → `openChargeFromNav`의 220ms setTimeout 제거(동기 호출)로 단일 페인트.
- **비밀번호 "일치합니다" 잔존**: `clearSignupForm`에 `pwCheckResult` 누락 → 추가(가입 탭 재진입 시 초기화).
- **코드 가입인데 비활성화 창**: 가입 직후 프로필 로드 2중 경쟁 → `_signupInProgress` 플래그로 가입 중 자동 로드 차단, `_loadedUid`로 늦은 자동 로드 차단.
- **신청 화면 이용료 안내**: 결제방법 선택 화면(`subPayChoice`)에 이용료 안내 복사 표시.

### 가입 코드검증 흐름 (신규, 함수 ⑩)
- 가입 시 학원/코드 입력을 **서버 `checkJoinCode`로 즉시 검증**(미인증+App Check). 두 경로 모두 적용: ① 학원명 칸에 코드 직입 ② 등록된 학원명 입력 후 뜨는 선생님 코드칸.
- **선생님 코드만** joinable → 🟢 "「학원명」 확인됨 · 선생님으로 합류" (학원명 인라인 표시=확인). **원장 코드** → 🔴 "등록 불가능한 코드입니다". 무효/불일치/만료/비활성/정원초과 각 메시지.
- 통과 시에만 `schoolChecked=true` → **잘못된 코드로는 가입 진행 자체가 막힘**(doFirebaseSignup 필수조건). 신규(미등록) 학원명은 코드 없이 원장으로 개설.
- 기존 "코드 무조건 초록불(클라 무검증)" → 서버 검증으로 대체. 코드 대조/합류 권위 검증은 여전히 joinByCode. Playwright 스텁으로 선생님/원장/무효/불일치 4케이스 검증 완료.
- 배포: 함수 `checkJoinCode` (firebase) + index.html (GitHub).

### 동의 모달 UX (스크롤 게이트, 신규)
- 약관/개인정보 **체크박스 클릭 시 직접 토글 차단**(`onclick=openConsentFromCheckbox`) → 전문 모달 즉시 오픈.
- 모달 푸터 **미동의/동의** 2버튼. **동의는 전문을 끝까지 스크롤해야 활성**(content `onscroll` 으로 바닥 감지, 내용이 짧으면 즉시 활성). 안내문구 `…ScrollHint` 는 활성 시 숨김.
- **동의** → 체크 ON + 닫힘 / **미동의·X·기존 close 호출** → 체크 OFF + 닫힘(`consentAgree/consentDisagree`).
- 마케팅 체크박스는 기존 일반 토글 유지. 동의 로직은 이용약관 모달 뒤 스크립트에 통합 정의(privacy 스크립트 블록은 중복 정의 제거). Playwright 로 스크롤게이트·동의·미동의·토글차단 동작 검증 완료.

### 이용약관·동의 흐름 (신규)
- **가입 동의 UI**: 가입 폼에 [필수] **이용약관** 동의 체크박스(`signupAgreeTerms`, "전문 보기")를 [필수] 개인정보 위에 추가. 미동의 시 가입 차단.
- **동의 기록**: user 문서에 `consentTerms`/`consentTermsVersion('EduNote-TOS-2026-06-11')` 추가.
- **약관 전문 모달**(`termsModal`, z-index 10001, `openTermsOfService()/closeTermsOfService()`): 14개 조항 — 정의(플랜·크레딧·무료체험), 결제/구독(자동갱신·해지), **크레딧(선불·건당 차감·소비분 환불불가)**, **청약철회·환불(플랜=7일내 미사용 전액/이용개시=일할, 크레딧=미사용분 환불·소비분 제외·수수료 공제)**, 학생정보 위탁, 책임제한, 관할.
- **⚠ 미완(민석쌤 채울 것)**: 부칙 사업자 정보 `【상호/대표자/등록번호/주소/연락처】` + 시행일 + 제7조 크레딧 유효기간 → 사업자등록 발급 후. (현재 placeholder)
- 규칙 변경 불필요(user create hasOnly 없음). 배포=index.html(GitHub)만.

### 개인정보 처리방침·동의 흐름 (신규)
- **가입 동의 UI**: 가입 폼에 [필수] 개인정보 수집·이용 + [선택] 마케팅 수신 체크박스(고정 HTML, recaptcha-container 뒤). 필수 미동의 시 가입 차단(`doFirebaseSignup` 검증).
- **동의 기록 저장**: user 문서에 `consentPrivacy`/`consentMarketing`/`consentPolicyVersion('EduNote-PP-2026-06-11')`/`consentAt` 기록. (user create 규칙에 hasOnly 없어 새 필드 허용 — 규칙 변경 불필요. user 문서 직접 기록이라 normalizeRecord 파이프라인 무관)
- **처리방침 전문 모달**: 최상위 고정(z-index 10001 > 로그인 9999), `openPrivacyPolicy()/closePrivacyPolicy()`. 핵심: 학생 정보=**위탁 관계**(학원이 처리자, EduNote 수탁, 학생/학부모 동의는 학원 책임), 만14세 미만 회원가입 불가, Firebase/SMS/PG 위탁 고지.
- **⚠ 미완(민석쌤 채울 것)**: 처리방침 제9조 사업자 정보 `【상호/대표자/주소/등록번호/보호책임자/연락처】` + 제10조 시행일 → **사업자등록 발급 후 채우기**. (현재 placeholder)
- **차후 고려**: 이용약관(이용약관 동의 체크박스 슬롯 추가 가능), 기존 회원 소급 동의 모달, 학원 대상 "학생 동의 확보 책임" 1회 고지.

### 결제 구조 (확정, 미연동)
- 2종 분리: **(A) 플랜 구독** — 베이직/프로/프리미엄, 플랜에 문자/알림톡 무료 건수 포함(프로 ~300건/월, 프리미엄 ~1,000건/월). **(B) 크레딧 충전** — 플랜과 별개 선불 알림 크레딧, 메세지관리>충전에서만.
- UI 분리: 플랜 변경/연장 경로엔 크레딧 구매 없음, 충전 경로는 크레딧 전용.
- 현재는 무통장입금 신청까지만 구현, 실 PG 연동 전.

### 선생님 관리·출결·모듈분리 (2026-06 세션)

**모듈 분리 1~3단계 완료** (설계: `EduNote_분리설계_작업요약.md`)
- ① `styles.css` 분리. ② `utils.js`(순수유틸 10종) + `fb.js`(Firebase 모듈 외부화). ③ **`state.js`(전역 상태 8종, 분수령) 분리 완료**.
- **③ state.js (B안=선언만 이동)**: 전역 상태 `currentUser/currentRole/currentSchool/currentSchoolId/currentSchoolProfile/records/notices/students` 를 `state.js`(classic)로 이동. 모놀리스의 top-level `var` 선언 3블록 제거(주석 마커로 대체). classic script 는 window 공유 → bare 참조(`records`)·`window.records` 전부 무수정 동작. `App.state.X` 네임스페이스 전면치환(A안)은 **ES모듈 전환(2단계) 때** 같이 하기로 보류(지금 하면 ~9,000줄 수백곳 수정·고위험, 분리 이득은 classic 에서 window 공유로 이미 충족). ⚠ **선언 규칙**: 이 8종의 `var` 선언은 **state.js 한 곳에만**. state.js 파일 자체는 자유롭게 수정 가능(전역 추가·초기값 변경은 여기서). **다른 파일**(모놀리스·신규 모듈)에서 `var X=...` **재선언만 금지**(state.js 초기화를 덮어써 데이터 유실). 재할당(`records=[...]`, var 없이)·함수내 지역 `var` shadow 는 정상.
- **④ notices.js (알림장 모듈, 첫 UI 모듈 분리 완료)**: 모놀리스 연속 블록(섹션주석~deleteNotice, 약 190줄)을 통째로 `notices.js`(classic)로 이동. 정의 9종 — `noticeKey/persistNotices/saveNotice/updateNoticeClassFilter/updateNoticeTeacherFilter/renderNotices/toggleNoticeGroup/makeNoticeCard/deleteNotice` (top-level fn → window 전역, 인라인 onclick 무손상). 런타임 의존(escapeNotice·fb 래퍼·showToast·saveNoticeCard·상태전역)은 호출 시점에 전역 존재. **잔류(아직 모놀리스)**: `saveNoticeCard`, `loadOwnerData` 내 알림장 집계·dedup(원장 도메인 — 차후 schoolStore 로). 교차검사: notices.js 가 모놀리스 top-level `let/const`(비전역) 참조 0 → 스코프 트랩 없음. 모놀리스 9,238→9,048줄.
- 로드순서 `styles → utils(즉시) → state(즉시) → notices(즉시) → fb(deferred, module) → 모놀리스`. 검증: state.js·notices.js + 인라인 7블록(모놀리스 9,048줄 포함) 전부 `node --check` OK.
- 배포: index.html + styles.css + utils.js + **state.js** + **notices.js** + fb.js 를 **repo 루트에 함께**(상대경로). 규칙/함수 변경 없음. 다음 단계=⑤ 다음 독립 기능 한 모듈씩(후보: 출결/키오스크 `attendance.js`, 또는 원장 집계 분리 시 도메인 `schoolStore`).

**출결 처리 배지 다중 표시**
- 기존: 등원→하원 누르면 "하원"만 표시(마지막 상태로 덮음). → `ciStatuses()`/`ciBadgesHtml()` 추가로 **등원·하원**, **지각·하원** 을 두 배지로 나란히. 출결 처리·출결 이력 둘 다. 필터용 `ciStatus()`(단일)는 유지.

**선생님 관리 패널 재구성 (업무관리>선생님 관리, 원장 전용)**
- 기존 "선생님별 학생 배정" UI → **반배정 관리** 패널로 이동('예정' 해제, `NAV_REAL_PANELS`에 classassign 추가, 탭훅 `teachers→renderTeacherRoster` / `classassign→renderTeacherAssign`).
- 선생님 관리 = **명단**(이름·휴대폰·출퇴근코드4자리) + 검색 + 상단 **"활성 선생님 N / 제한 M명"**(활성만 카운트).
- **휴대폰·코드4 수동 입력**(원장이 수정). 저장 위치 = `schools/{id}.teacherMeta = { "<uid>": { phone, code4 } }` — **원장이 학원 문서에 직접 쓸 수 있는 자리**(보호필드 아님 → 규칙·서버 불필요). 코드4 저장 시 학생 code4 + 다른 선생님 코드와 중복검사(중복 거부 + 명단 ⚠ 표시). `applySchool`이 maxTeachers/teacherLimit/teacherMeta 를 `currentSchoolProfile`에 캡처.
- **퇴원/활성 토글 (삭제 없음)**: 하단 "퇴원 선생님 (n)" **펼치기/감추기(기본 감추기)**. 퇴원=비활성. → **Cloud Function `ownerSetTeacherActive`**(원장/슈퍼만, 같은 학원 teacher 검증, Admin SDK). 비활성=`status:'inactive'`(로그인 차단·정원 제외), 활성화 시 정원 초과면 거부.

**키오스크 선생님 출퇴근**
- 4자리 입력 → 학생 code4 우선 매칭 → 없으면 **활성** 선생님 `teacherMeta.code4` 매칭 → 출근/퇴근. 기록은 기존 `schools/{id}/checkins/{date}` 문서에 `t_<uid>` 키(학생 출결 이력 화면은 학생만 순회 → 무영향). `startKiosk`에서 teacherMeta 최신화(학원문서 재읽기).

**정원(좌석) 동적화 — 비활성=좌석 반환**
- `joinByCode` 선생님 카운트를 **활성(status!=='inactive')만** + 허용정원 기준 **`teacherCount`**(기존 `maxTeachers`=1+허용 의 off-by-one 정렬)로 변경. → 비활성 처리 시 좌석 1 반환되어 신규 합류 가능. "10명 제한"이 정확히 활성 10명. 기존 초과분은 강제 제거 안 함(신규만 차단).
- `ownerSetTeacherActive` 활성화 검사도 동일 기준.

## 다음 트랙 (우선순위)

0. **(보안 후속) Firestore 자체 App Check enforce** — 콘솔 토글. 현재 App Check 는 함수에만 강제 → Firestore 직접 접근은 규칙만이 방어선. verified 안정 확인 후 켜면 규칙 우회 표면 한 겹 더 차단. 막히면 enforce 끄기로 롤백.
1. **결제(PG) 연동** — (A) 구독+크레딧은 민석쌤 PG 계정 / (B) 학원 수강료는 각 학원 자체 PG(민석쌤 미경유). 크레딧은 선불·알림전용, 문자/알림톡 원가에 마진.
2. **개인정보 처리방침·동의 흐름** — 처리방침 전문+가입 동의+동의 기록 **구현 완료**. 남은 것: 사업자 정보 placeholder 채우기(발급 후)+시행일, (선택)이용약관·소급 동의.
3. **SMS/카카오 알림톡 발송** — Solapi 등 + 알림톡 템플릿 승인. 결제·성장 후. 발송+크레딧 차감은 반드시 Cloud Function 원자 처리.
4. **PWA 전환** — manifest.json + 아이콘(192/512/iOS180) + **network-first 서비스워커(sw.js)** 구현 완료. 과거 cache-first 워커가 구버전 페이지를 캐시하던 문제를 network-first(온라인=항상 최신, 오프라인만 캐시 폴백)로 구조적 해소. head의 SW *해제* 블록을 *등록* 블록으로 교체. **⚠ 배포: manifest.json·sw.js·icon-*.png·apple-touch-icon-180.png 를 index.html 과 같은 repo 루트에 함께 올려야 경로(상대경로) 동작.** 필요 시 Capacitor 래핑(인앱결제는 외부 웹결제 우회).
5. **모듈 분리 리팩토링**(4계층) — 보안/결제 후. 설계 문서 `EduNote_분리설계_작업요약.md`.

## 핵심 학습/원칙

- 새 필드 = 풀 파이프라인(HTML 고정 input + serialize/deserialize + normalizeRecord + 카드 렌더 + export). normalizeRecord 누락 시 로그아웃/리로드에 조용히 소실. inquiries/applications 신규 필드는 규칙 화이트리스트에도 추가.
- `activateScreen`/`subscribeScreen`은 `mainApp`(display:none) 밖에 있어야(아니면 0×0). position:fixed는 변형 조상 안에서 stacking trap → body로 이동.
- 보안 경계는 **규칙/서버 함수**(Firebase config 노출은 정상). 배포 순서: 클라 먼저 → 제약 나중. (단 v11~v13 규칙은 정상 클라 무손상이라 독립 게시 가능)
- **schoolId(docId)는 공개 schoolNames 에 노출되므로 비밀이 아님** → 멤버십 권한으로 신뢰하려면 자기주장 경로(user create)를 반드시 막아야 함(v13에서 봉쇄). 멤버십은 서버 함수만 부여.
- **코드 합류(joinByCode)는 정원으로 봉쇄**: teacher=maxTeachers, owner=maxOwners(기본1). 코드가 유출돼도 정원만큼만 합류. 원장은 기본 1명 → ownerCode 합류는 슈퍼가 maxOwners 올리기 전엔 사실상 차단. 코드는 비밀이지만 "비밀 유출"을 정원으로 2차 방어.
- `todayStr()`는 local time(UTC 금지 — KST 오프셋 이슈). 코드 생성은 crypto + 혼동문자 제외.
- **서비스워커는 network-first**: cache-first 는 단일 index.html 앱에서 구버전 셸을 서빙해 "새 배포 안 보임" 유발(과거 SW 킬스위치 원인). network-first + skipWaiting + activate 시 옛 캐시 삭제 + 외부(Firebase) 무캐시로 해소. 롤백은 register→unregister 한 줄.
- 함수 수정은 functions/index.js **전체 교체**(덧붙이기 시 require/initializeApp 중복 → 배포 분석 실패). 배포 OOM은 로컬 Node↔런타임 버전 불일치가 원인 → 둘 다 22로(`nvm use 22`), 못 맞추면 `NODE_OPTIONS=--max-old-space-size=4096`.

## 작업 방식

- Python 정확 문자열 치환(assert count==1) → `node --check` 문법 검증 → `/mnt/user-data/outputs/index.html` 출력 → present. 규칙 변경은 괄호 균형 검사. 필요 시 Playwright 검증.
- 단일 파일 제약 유지(모듈 분리 전까지). 데이터 모델 변경 전 확인 후 구현.
