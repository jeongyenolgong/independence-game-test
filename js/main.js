/* main.js — 부트스트랩·상태·진행(flow) 제어 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  window.G = { data: null, grade: '초등', speed: '보통', met: new Set(), flowIndex: 0 };
  const Main = {};

  // ---------- 부트 ----------
  async function boot() {
    try {
      const res = await fetch('data/game.json');
      if (!res.ok) throw new Error('http ' + res.status);
      window.G.data = await res.json();
    } catch (e) {
      $('screen-loading').innerHTML = '<p class="loading-text">' +
        ((window.G.data && window.G.data.system && window.G.data.system['error.load_fail']) ||
          '내용을 불러오지 못했어요. 새로고침 해 주세요.') + '</p>';
      console.error(e); return;
    }
    // 학년 = URL로 구분(기획: 초/중 URL 완전 분리, 게임 내 선택 없음).
    // 실배포는 초등·중등 빌드를 각각 별도 주소로 배포. 개발 중엔 ?grade= 로 확인.
    //   초등: (기본)  ·  중등: index.html?grade=중등
    const qg = new URLSearchParams(location.search).get('grade');
    window.G.grade = (qg === '중등') ? '중등' : '초등';
    Screens.applyLabels();
    wire();
    hide('screen-loading');
    show('screen-title');
  }

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  // ---------- 버튼 배선 ----------
  function wire() {
    $('btn-start').onclick = startGame;
    // 미니메뉴
    $('btn-codex').onclick = (e) => { e.stopPropagation(); Screens.openCodex(false); };
    $('btn-settings').onclick = (e) => { e.stopPropagation(); Screens.openSettings(); };
    $('codex-close').onclick = Screens.closeCodex;
    $('settings-close').onclick = Screens.closeSettings;
    // 설정: 글자속도
    document.querySelectorAll('.speed-btn').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('.speed-btn').forEach((x) => x.classList.remove('is-on'));
        b.classList.add('is-on'); window.G.speed = b.dataset.speed;
      };
    });
    // 결과 화면
    $('result-codex').onclick = () => { hide('screen-result'); Screens.openCodex(true); };
    $('result-exit').onclick = () => Screens.showCredits();
    $('result-save').onclick = () => {
      // TODO(단계4): html2canvas + jsPDF 로 도감 20면 PDF. 지금은 인쇄 대화로 대체(스텁).
      alert('저장하기 — 도감 PDF 저장은 개발 다음 단계에서 붙습니다(플레이 검증용 스텁).');
    };
  }

  // ---------- 게임 시작 ----------
  function startGame() {
    window.G.met = new Set();
    window.G.flowIndex = 0;
    hide('screen-title');
    show('stage');
    $('minimenu').classList.remove('hidden');
    $('bg').className = 'bg';
    runFlow();
  }

  // ---------- 진행 제어 ----------
  function next() { window.G.flowIndex++; runFlow(); }

  function runFlow() {
    const flow = window.G.data.flow;
    if (window.G.flowIndex >= flow.length) { Main.toTitle(); return; }
    const node = flow[window.G.flowIndex];
    switch (node.type) {
      case 'scene':
        Engine.playScene(node.id, next); break;
      case 'introChoice':
        Engine.playIntroChoice(node.relay, next); break;
      case 'crowd': {
        // 정답 선택 시 해당 릴레이 인물을 만남 기록(도감 해금)
        const rel = window.G.data.relays.find((r) => 'R' + r.n === node.relay);
        Engine.playCrowd(node.relay, () => { if (rel) Engine.markMet(rel.person); next(); });
        break;
      }
      case 'quiz':
        Engine.playQuiz(node.scene, node.person, next); break;
      case 'ending':
        Screens.playEnding(next); break;
      case 'result':
        Screens.showResult(); break;   // 결과화면 버튼이 이후 흐름 담당
      case 'credits':
        Screens.showCredits(); break;
      default:
        next();
    }
  }

  Main.toTitle = function () {
    ['stage', 'screen-result', 'screen-credits', 'screen-codex', 'screen-settings'].forEach(hide);
    $('bg').className = 'bg';
    show('screen-title');
  };

  window.Main = Main;
  document.addEventListener('DOMContentLoaded', boot);
})();
