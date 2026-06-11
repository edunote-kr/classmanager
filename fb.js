/* EduNote fb.js — Firebase 초기화 + window.fb* 브리지 (ES module).
   index.html 에서 <script type="module" src="fb.js"></script> 로 로드.
   ※ 기존 인라인 모듈을 그대로 외부화(동작 동일, deferred 실행). 분리 1단계 산출물. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAuth, setPersistence, browserSessionPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber, updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore, initializeFirestore, doc, setDoc, getDoc, collection, getDocs, query, where, addDoc, deleteDoc, updateDoc, onSnapshot, deleteField } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-functions.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyAgSVfgqsbYwjLQI_yMv6-iA7DEfXjLaBE",
  authDomain: "edunote-b199a.firebaseapp.com",
  projectId: "edunote-b199a",
  storageBucket: "edunote-b199a.firebasestorage.app",
  messagingSenderId: "623822141828",
  appId: "1:623822141828:web:d0ad8eef240e14e9ab45d1"
};

const app = initializeApp(firebaseConfig);

// ── App Check (reCAPTCHA v3) ────────────────────────────────────────────────
// reCAPTCHA 관리(google.com/recaptcha/admin)에서 발급한 "사이트 키" 를 아래에 붙여넣으세요.
// (비밀 키는 Firebase 콘솔 App Check 등록 화면에 넣고, 사이트 키만 여기 코드에 들어갑니다)
// 키를 넣기 전(placeholder)에는 초기화하지 않으므로, 지금 배포해도 기존 동작에 영향 없음.
// 키를 넣고 배포 → App Check 콘솔 metrics 에서 verified 요청 확인 → 그 다음 함수의
// ENFORCE_APP_CHECK=true 배포 (순서 지켜야 사용자 잠금 방지).
const APP_CHECK_SITE_KEY = "6LdRKBgtAAAAAGtNgLQN_Q1EinxCTRUADP7A5XHp";
if (APP_CHECK_SITE_KEY && APP_CHECK_SITE_KEY.indexOf("PASTE_") !== 0) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch (e) {
    console.error("App Check 초기화 실패:", e && (e.code || e.message));
  }
}

const auth = getAuth(app);
// WebChannel(Listen/channel) 연결이 불안정한 환경(맥 Safari, 추적방지 등) 대비:
// long-polling 강제로 연결 안정성 확보 (변경 금지)
let db;
try {
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
} catch (e) {
  db = getFirestore(app);
}
const googleProvider = new GoogleAuthProvider();

// 비밀번호 재설정 전용 보조 앱 (메인 로그인 세션을 건드리지 않도록 분리)
const pwResetApp = initializeApp(firebaseConfig, 'pwReset');
const pwResetAuth = getAuth(pwResetApp);
const pwResetFunctions = getFunctions(pwResetApp, 'asia-northeast3');
window.fbPwResetAuth = pwResetAuth;
window.fbPwResetSignInPhone = signInWithPhoneNumber;
window.fbPwResetSignOut = signOut;
window.fbPwResetCallable = function(name){ return httpsCallable(pwResetFunctions, name); };

// 메인 로그인 세션 기준 Functions (슈퍼관리자 권한 검증이 필요한 callable용 — context.auth가 채워짐)
const mainFunctions = getFunctions(app, 'asia-northeast3');
window.fbCallable = function(name){ return httpsCallable(mainFunctions, name); };

// 전역으로 노출
window.fbAuth = auth;
window.fbDb = db;
window.fbCreateUser = createUserWithEmailAndPassword;
window.fbSignIn = signInWithEmailAndPassword;
window.fbSignOut = signOut;
window.fbUpdatePassword = updatePassword;
window.fbReauth = reauthenticateWithCredential;
window.fbEmailAuthProvider = EmailAuthProvider;
window.fbSendPasswordReset = sendPasswordResetEmail;
window.fbOnAuthStateChanged = onAuthStateChanged;
window.fbDoc = doc;
window.fbSetDoc = setDoc;
window.fbSetDocMerge = function(ref, data) { return setDoc(ref, data, { merge: true }); };
window.fbGetDoc = getDoc;
window.fbCollection = collection;
window.fbGetDocs = getDocs;
window.fbQuery = query;
window.fbWhere = where;
window.fbAddDoc = addDoc;
window.fbDeleteDoc = deleteDoc;
window.fbUpdateDoc = updateDoc;
window.fbDeleteField = deleteField;
window.fbOnSnapshot = onSnapshot;
window.fbGoogleProvider = googleProvider;
window.fbSignInWithPopup = signInWithPopup;
window.fbRecaptchaVerifier = RecaptchaVerifier;
window.fbSignInWithPhoneNumber = signInWithPhoneNumber;

// #2 브라우저 종료 시 자동 로그아웃: 세션 지속성으로 설정
// (같은 탭 새로고침은 유지되고, 브라우저/탭을 닫으면 세션 해제됨)
setPersistence(auth, browserSessionPersistence).catch(function(e){ console.warn('persistence:', e); });

// 보안 강화: sessionStorage 표식으로 "현재 브라우저 세션" 검증
// sessionStorage는 브라우저/탭 완전 종료 시 삭제되고 새로고침엔 유지됨 → 종료 후 재실행이면 강제 로그아웃
var SESSION_FLAG = 'kms_active_session';
// 사용자가 의도적으로 로그인/가입할 때 호출 → 이 브라우저 세션을 '활성'으로 표시
window.markActiveSession = function(){ try { sessionStorage.setItem(SESSION_FLAG, '1'); } catch(e) {} };
window.clearActiveSession = function(){ try { sessionStorage.removeItem(SESSION_FLAG); } catch(e) {} };

// Firebase 준비 완료 → 직접 auth 상태 감지 시작
onAuthStateChanged(auth, function(user) {
  if (user) {
    // 세션 표식이 없으면 = 브라우저를 닫았다가 다시 연 것 → 보안상 강제 로그아웃
    var hasSession = false;
    try { hasSession = sessionStorage.getItem(SESSION_FLAG) === '1'; } catch(e) {}
    if (!hasSession) {
      // 자동 복원된 로그인 차단
      try { sessionStorage.removeItem(SESSION_FLAG); } catch(e) {}
      signOut(auth).catch(function(){});
      window._loadedUid = null;
      window._profileLoading = false;
      if (typeof hideInitLoader === 'function') hideInitLoader();
      var lp0 = document.getElementById('landingPage');
      if (lp0) lp0.style.display = 'block';
      return;
    }
    // 가입 진행 중에는 자동 로드를 건너뜀(가입 흐름이 직접 처리).
    //   중복 로드로 stale한 inactive 를 읽어 비활성 모달이 뜨는 race 방지.
    if (window._signupInProgress) return;
    // 중복 호출 완전 방지: uid 단위 추적
    if (window._profileLoading) return;
    if (window._loadedUid === user.uid) return; // 이미 이 UID로 처리 완료
    if (typeof loadUserProfile === 'function') {
      window._profileLoading = true;
      loadUserProfile(user).finally(function(){
        window._profileLoading = false;
        if (window.currentUser) window._loadedUid = user.uid;
      });
    }
  } else {
    window._loadedUid = null;
    window._profileLoading = false;
    if (typeof hideInitLoader === 'function') hideInitLoader();
    var lp = document.getElementById('landingPage');
    var act = document.getElementById('activateScreen');
    var sub = document.getElementById('subscribeScreen');
    var actShown = act && act.style.display !== 'none' && act.style.display !== '';
    var subShown = sub && sub.style.display !== 'none' && sub.style.display !== '';
    if (lp && !actShown && !subShown) lp.style.display = 'block';
  }
});
