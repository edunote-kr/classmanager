// EduNote 수업 미리보기 / 모바일 시트 모듈 (preview.js)
// classic <script> — attendance.js 뒤, 모놀리스(index.html)보다 먼저 로드.
// 입력 패널(#panel-input) 내용 변경 시 우측 미리보기 패널(데스크톱)·하단 시트(모바일) 자동 갱신.
// 정의: 상태 var(_lessonPreviewOpen/_previewTimer/_previewUserToggled/_mobileSheetOpen, _sheetBgScrollY/_sheetMcOvf/_sheetDragInit),
//   함수 _setPreviewArrowLabel/open|close|toggleLessonPreview/_lock|_unlockBgScroll/_initSheetDrag/
//   open|close|toggleMobileSheet/renderLessonPreview/_autoOpenPreviewDesktop/previewAfterLoad/_scheduleLessonPreview,
//   + document input/change 리스너(#panel-input 한정) 2개.
//   (top-level → window 전역; HTML onclick(toggleLessonPreview/toggleMobileSheet)·외부 typeof-가드 호출·previewAfterLoad 무손상.)
// 런타임 의존(window 전역): renderLessonPreview 가 쓰는 입력/렌더 헬퍼·records/students·DOM 등 (모놀리스/state.js).
// 주의: 이 식별자들을 다른 파일에서 재선언/재정의하지 말 것. switchTab(탭 라우터)은 모놀리스 잔류.

var _lessonPreviewOpen=false, _previewTimer=null, _previewUserToggled=false, _mobileSheetOpen=false;
function _setPreviewArrowLabel(){
  var arrow=document.getElementById('lessonPreviewArrow'); var label=document.getElementById('lessonPreviewLabel');
  if(arrow) arrow.textContent=_lessonPreviewOpen?'›':'‹';
  if(label) label.textContent=_lessonPreviewOpen?'닫기':'미리보기';
}
function openLessonPreview(){ _lessonPreviewOpen=true; var p=document.getElementById('lessonPreviewPane'); if(p)p.classList.add('open'); document.body.classList.add('preview-open'); _setPreviewArrowLabel(); renderLessonPreview(); }
function closeLessonPreview(){ _lessonPreviewOpen=false; var p=document.getElementById('lessonPreviewPane'); if(p)p.classList.remove('open'); document.body.classList.remove('preview-open'); _setPreviewArrowLabel(); }
function toggleLessonPreview(){ _previewUserToggled=true; if(_lessonPreviewOpen) closeLessonPreview(); else openLessonPreview(); }
var _sheetBgScrollY=0, _sheetMcOvf='', _sheetDragInit=false;
function _lockBgScroll(){
  _sheetBgScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  document.body.style.position='fixed';
  document.body.style.top=(-_sheetBgScrollY)+'px';
  document.body.style.left='0'; document.body.style.right='0'; document.body.style.width='100%';
  var mc=document.getElementById('mainContent'); if(mc){ _sheetMcOvf=mc.style.overflow||''; mc.style.overflow='hidden'; }
}
function _unlockBgScroll(){
  document.body.style.position=''; document.body.style.top=''; document.body.style.left=''; document.body.style.right=''; document.body.style.width='';
  var mc=document.getElementById('mainContent'); if(mc){ mc.style.overflow=_sheetMcOvf; }
  window.scrollTo(0,_sheetBgScrollY);
}
function _initSheetDrag(){
  if(_sheetDragInit) return;
  var drag=document.getElementById('lessonSheetDrag'), sheet=document.getElementById('lessonPreviewSheet');
  if(!drag||!sheet) return; _sheetDragInit=true;
  var startY=0, curY=0, dragging=false;
  drag.addEventListener('touchstart', function(e){ if(!_mobileSheetOpen) return; startY=e.touches[0].clientY; curY=startY; dragging=true; sheet.style.transition='none'; }, {passive:true});
  drag.addEventListener('touchmove', function(e){ if(!dragging) return; curY=e.touches[0].clientY; var dy=curY-startY; if(dy<0)dy=0; sheet.style.transform='translateY('+dy+'px)'; if(e.cancelable)e.preventDefault(); }, {passive:false});
  function _end(){ if(!dragging)return; dragging=false; var dy=curY-startY; sheet.style.transition=''; sheet.style.transform=''; if(dy>90||Math.abs(dy)<8){ closeMobileSheet(); } }
  drag.addEventListener('touchend', _end); drag.addEventListener('touchcancel', _end);
}
function openMobileSheet(){ _mobileSheetOpen=true; _initSheetDrag(); var sh=document.getElementById('lessonPreviewSheet'),bd=document.getElementById('lessonPreviewBackdrop'); if(bd)bd.style.display='block'; if(sh){sh.style.transform='';sh.classList.add('open');} _lockBgScroll(); renderLessonPreview(); }
function closeMobileSheet(){ _mobileSheetOpen=false; var sh=document.getElementById('lessonPreviewSheet'),bd=document.getElementById('lessonPreviewBackdrop'); if(sh){sh.classList.remove('open');sh.style.transition='';sh.style.transform='';} if(bd)bd.style.display='none'; _unlockBgScroll(); }
function toggleMobileSheet(){ if(_mobileSheetOpen) closeMobileSheet(); else openMobileSheet(); }
function renderLessonPreview(){
  if(!_lessonPreviewOpen && !_mobileSheetOpen) return;
  var bodies=[document.getElementById('lessonPreviewBody'), document.getElementById('lessonPreviewBodyMobile')];
  var html;
  try{
    var rec=collectRecordFromForm();
    var has = hasAnyLessonContent(rec)||rec.homework||rec.student||rec.memo;
    html = has ? ('<div style="pointer-events:none">'+makeCard(rec)+'</div>') : '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:30px 10px;line-height:1.6">입력을 시작하면<br>여기에 카드가 미리 보여요.</div>';
  }catch(e){ html='<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px">미리보기를 표시할 수 없습니다.</div>'; }
  bodies.forEach(function(bd){ if(bd) bd.innerHTML=html; });
}
function _autoOpenPreviewDesktop(){
  if(window.innerWidth < 1024) return;                 // 데스크톱(웹)만 자동 팝업
  if(typeof activeTab!=='undefined' && activeTab!=='input') return;
  if(_lessonPreviewOpen) return;
  if(_previewUserToggled) return;                      // 사용자가 직접 닫았으면 존중
  openLessonPreview();
}
function previewAfterLoad(){
  // 불러오기 시: 데스크톱은 미리보기 자동 팝업(닫아놨어도 다시 열어 보여줌)
  if(window.innerWidth >= 1024 && (typeof activeTab==='undefined' || activeTab==='input')){
    _previewUserToggled=false;
    if(!_lessonPreviewOpen) openLessonPreview(); else renderLessonPreview();
  } else if(_lessonPreviewOpen||_mobileSheetOpen){ renderLessonPreview(); }
}
function _scheduleLessonPreview(){ if(!_lessonPreviewOpen && !_mobileSheetOpen) return; clearTimeout(_previewTimer); _previewTimer=setTimeout(renderLessonPreview,250); }
document.addEventListener('input', function(e){ if(!(e.target && e.target.closest && e.target.closest('#panel-input'))) return; if(_lessonPreviewOpen||_mobileSheetOpen){ _scheduleLessonPreview(); } else { _autoOpenPreviewDesktop(); } });
document.addEventListener('change', function(e){ if(!(e.target && e.target.closest && e.target.closest('#panel-input'))) return; if(_lessonPreviewOpen||_mobileSheetOpen){ _scheduleLessonPreview(); } else { _autoOpenPreviewDesktop(); } });
