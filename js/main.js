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
    // 배포: /el/ = 초등, /md/ = 중등. 각 폴더의 index.html이 window.__GRADE 를 심어 둔다.
    // 개발 중엔 ?grade=el|md (한글 초등|중등도 허용).
    const GRADES = { el: '초등', md: '중등', '초등': '초등', '중등': '중등' };
    const raw = window.__GRADE || new URLSearchParams(location.search).get('grade');
    window.G.grade = GRADES[raw] || '초등';
    // 학습창 높이가 학년마다 다르다(그 학년의 가장 긴 학습 글에 맞춘 값 — style.css 참고).
    // CSS가 학년을 알 수 있게 여기서 한 번 적어 둔다.
    document.body.dataset.grade = window.G.grade;
    Screens.applyLabels();
    wire();
    refreshResume();
    hide('screen-loading');
    show('screen-title');
  }

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  // ---------- 진행 기록(이어하기) ----------
  // 같은 기기·같은 브라우저에만 남는다. 브라우저 저장소는 주소(도메인) 단위라 배포본의
  // /el/ 과 /md/ 가 한 통을 같이 쓴다 → **열쇠에 학년을 붙여** 초등·중등을 따로 담는다.
  // 안 그러면 한 태블릿에서 두 학년을 돌릴 때 진행이 서로를 덮어쓴다.
  const SAVE_PREFIX = 'indep.save.';
  function saveKey() { return SAVE_PREFIX + window.G.grade; }

  // 사파리 시크릿 창 등에선 localStorage 접근 자체가 예외를 던진다.
  // 저장은 곁다리 기능이라, 실패하면 조용히 없던 일로 하고 게임은 그대로 굴러가야 한다.
  function readSave() {
    try {
      const raw = localStorage.getItem(saveKey());
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s.flowIndex !== 'number' || s.flowIndex <= 0) return null;
      if (s.flowIndex >= window.G.data.flow.length) return null;   // 이미 끝난 판
      return { flowIndex: s.flowIndex, met: Array.isArray(s.met) ? s.met : [] };
    } catch (e) { return null; }
  }

  function writeSave() {
    try {
      localStorage.setItem(saveKey(), JSON.stringify({
        flowIndex: window.G.flowIndex,
        met: [...window.G.met],
      }));
    } catch (e) { /* 저장 못 해도 진행은 막지 않는다 */ }
  }

  function clearSave() {
    try { localStorage.removeItem(saveKey()); } catch (e) { /* 위와 같음 */ }
  }

  // 첫 화면의 이어하기 버튼 — 기록이 없으면 아예 안 보인다(지금까지의 화면 그대로).
  // 버튼엔 '이어하기' 넉 자만 둔다. 어디까지 갔는지(누구까지·몇/10)는 첫 화면에 안 적는다 —
  // 다음 사람에게 남의 진행이 먼저 읽히고, 열 명 중 몇을 만나야 하는지도 미리 새어 나간다.
  function refreshResume() {
    $('btn-resume').classList.toggle('hidden', !readSave());
  }

  // ---------- 버튼 배선 ----------
  function wire() {
    $('btn-start').onclick = startGame;
    $('btn-resume').onclick = resumeGame;
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
    $('result-save').onclick = saveCodexPdf;
  }

  // ---------- 도감 저장(PDF) ----------
  // 결과 화면은 흐름 마지막 'result' 노드로만 닿는다 = 열 명을 다 만난 뒤. 그래서 잠긴 카드는
  // 여기 올 수 없고, met 를 따지지 않고 cards 열 장을 그대로 싣는다.
  const PAGE_ROWS = 5;                       // A4 한 장에 다섯 명 → 10인 = 2장

  function buildSheet() {
    const D = window.G.data, L = D.labels, S = D.system;
    const sheet = document.createElement('div');
    sheet.className = 'pdf-sheet';

    const pages = Math.ceil(D.cards.length / PAGE_ROWS);
    for (let p = 0; p < pages; p++) {
      const page = document.createElement('div');
      page.className = 'pdf-page';

      const head = document.createElement('div');
      head.className = 'pdf-head';
      const h1 = document.createElement('h1');
      h1.textContent = S['result.heading'] || '10인의 독립운동가';
      const sub = document.createElement('p');
      sub.textContent = L['codex.title'] || '만난 사람들';
      head.appendChild(h1); head.appendChild(sub);
      page.appendChild(head);

      const rows = document.createElement('div');
      rows.className = 'pdf-rows';
      D.cards.slice(p * PAGE_ROWS, (p + 1) * PAGE_ROWS).forEach((c) => {
        const row = document.createElement('div');
        row.className = 'pdf-row';

        // 그림 두 장 — 유화(도감 앞면 정답 포스터) + 공식 흑백사진(엔딩 몽타주·결과화면).
        // 게임에선 두 얼굴이 서로 다른 자리에 흩어져 나오는데, 저장본엔 나란히 남긴다.
        const face = (src, extra) => {
          const box = document.createElement('div');
          box.className = 'pdf-card' + (extra ? ' ' + extra : '');
          if (src) {
            const img = document.createElement('img');
            img.src = src; img.alt = '';
            box.appendChild(img);
          }
          return box;
        };
        const painting = face(c['앞면_초상_img']);
        const photo = face(c['뒷면_공식이미지_img'], 'pdf-photo');

        // 오른쪽 = 도감 뒷면(이름·한자·생몰년·한줄) + 대표 한마디
        const info = document.createElement('div');
        info.className = 'pdf-info';
        const add = (cls, text) => {
          if (!text) return;
          const el = document.createElement('div');
          el.className = cls; el.textContent = text;
          info.appendChild(el);
        };
        add('pdf-name', c['실명']);
        add('pdf-meta', [c['한자'], c['생몰년']].filter(Boolean).join('  ·  '));
        add('pdf-line', c['한줄']);
        add('pdf-quote', c['대표한마디'] ? '“' + c['대표한마디'] + '”' : '');

        row.appendChild(painting); row.appendChild(photo); row.appendChild(info);
        rows.appendChild(row);
      });
      page.appendChild(rows);

      const foot = document.createElement('div');
      foot.className = 'pdf-foot';
      foot.textContent = (p + 1) + ' / ' + pages;
      page.appendChild(foot);

      sheet.appendChild(page);
    }
    return sheet;
  }

  // 글꼴(필체 otf)과 초상 이미지가 다 뜨기 전에 찍으면 글씨가 기본 글꼴로,
  // 그림이 빈 칸으로 나온다. 캡처 전에 둘 다 기다린다.
  function waitForAssets(root) {
    const imgs = [...root.querySelectorAll('img')].map((img) =>
      img.complete ? null : new Promise((done) => { img.onload = img.onerror = done; }));
    return Promise.all([document.fonts.ready, ...imgs.filter(Boolean)]);
  }

  async function saveCodexPdf() {
    const btn = $('result-save');
    if (btn.disabled) return;                       // 연타 방지
    const L = window.G.data.labels;
    const label = btn.textContent;
    if (!window.html2canvas || !window.jspdf) {
      alert(L['result.save_fail'] || '저장 기능을 불러오지 못했어요. 새로고침 해 주세요.');
      return;
    }

    btn.disabled = true;
    btn.textContent = L['result.saving'] || '저장하는 중…';
    const sheet = buildSheet();
    document.body.appendChild(sheet);
    try {
      await waitForAssets(sheet);
      const pdf = new window.jspdf.jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pages = [...sheet.querySelectorAll('.pdf-page')];
      // 종이색은 CSS의 한지 팔레트에서 그대로 읽어 온다 — 색을 여기 또 적어 두면
      // 나중에 팔레트만 바꿨을 때 지면 가장자리에만 옛 색이 남는다.
      const paper = getComputedStyle(document.documentElement)
        .getPropertyValue('--paper-rgb').trim();
      for (let i = 0; i < pages.length; i++) {
        const canvas = await window.html2canvas(pages[i], {
          scale: 2, backgroundColor: paper ? 'rgb(' + paper + ')' : '#eee6d5',
          useCORS: true, logging: false,
        });
        if (i > 0) pdf.addPage();
        // 210×297mm = A4 전면. 지면을 794×1123px(A4 비율)로 짰으니 그대로 채워진다.
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
      }
      pdf.save((L['result.save_filename'] || '만난 사람들') + '.pdf');
    } catch (e) {
      console.error(e);
      alert(L['result.save_fail'] || '저장에 실패했어요. 다시 한 번 눌러 주세요.');
    } finally {
      sheet.remove();
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // ---------- 게임 시작 ----------
  // gen = 지금 돌고 있는 판의 번호. '시작'을 누를 때마다 하나 오른다.
  // 옛 판이 남긴 '다음으로' 신호는 번호가 달라 무시된다(아래 nextFrom 참고).
  let gen = 0;

  function startGame() {
    // 처음부터 시작하면 남아 있던 진행이 사라진다 — 되돌릴 수 없으니 한 번 물어본다.
    if (readSave() && !window.confirm('지금까지 한 기록이 지워집니다. 계속할까요?')) return;
    clearSave();
    enterStage(0, []);
  }

  // 이어하기 — 저장된 칸이 아니라 **그 직전 '장면'부터** 다시 붙인다.
  // 배경 그림은 장면 칸(staging.bg_img)이 깔아 주기 때문에, 코드 입력·퀴즈 칸에서 곧장
  // 이어 붙이면 배경이 빈 채로 뜬다. 장면 47칸이 전부 배경을 다시 까는 것을 확인하고 잡은 규칙이라
  // 되감아도 반드시 그림이 돌아온다. 대신 그 장면 대사 한 토막을 다시 보게 된다.
  function resumeGame() {
    const save = readSave();
    if (!save) { refreshResume(); return; }
    enterStage(rewindToScene(save.flowIndex), save.met);
  }

  function rewindToScene(index) {
    const flow = window.G.data.flow;
    for (let i = Math.min(index, flow.length - 1); i > 0; i--)
      if (flow[i].type === 'scene') return i;
    return 0;
  }

  function enterStage(index, met) {
    gen++;
    window.G.met = new Set(met);
    window.G.flowIndex = index;
    hide('screen-title');
    show('stage');
    $('minimenu').classList.remove('hidden');
    $('bg').className = 'bg';
    runFlow();
  }

  // ---------- 진행 제어 ----------
  // 한 칸에서 '다음으로'는 **한 번만** 먹는다. 예전엔 아무나 next()를 부르면 그대로
  // 한 칸이 넘어가서, 진행이 두 갈래로 돌기 시작하면(시작 버튼이 두 번 먹히는 등)
  // 코드를 안 넣었는데도 화면이 저 혼자 넘어가고, 버려진 찾기 화면이 다음 화면
  // 뒤에 그대로 남아 비쳤다(2026-07-27 사용자 제보).
  // 그래서 '몇 판째(gen)의 몇 번째 칸(i)에서 나온 신호인지'를 표에 적어 두고,
  // 지금 자리와 어긋나는 신호는 조용히 버린다.
  function nextFrom(g, i) {
    return function () {
      if (g !== gen || window.G.flowIndex !== i) return;   // 옛 판·지난 칸의 신호 = 무시
      window.G.flowIndex++;
      writeSave();          // 칸이 넘어갈 때마다 조용히 기록(이어하기용)
      runFlow();
    };
  }

  function runFlow() {
    const flow = window.G.data.flow;
    if (window.G.flowIndex >= flow.length) { Main.toTitle(); return; }
    const node = flow[window.G.flowIndex];
    const next = nextFrom(gen, window.G.flowIndex);
    switch (node.type) {
      case 'scene':
        Engine.playScene(node.id, next); break;
      case 'introChoice':
        Engine.playIntroChoice(node.relay, next); break;
      case 'find': {
        // 포스터 코드로 정답 인물을 찾아내면 만남 기록(도감 해금)
        const rel = window.G.data.relays.find((r) => 'R' + r.n === node.relay);
        Engine.playFind(node.relay, () => { if (rel) Engine.markMet(rel.person); next(); });
        break;
      }
      case 'quiz':
        Engine.playQuiz(node.scene, node.person, next); break;
      case 'ending':
        Screens.playEnding(next); break;
      case 'result':
        // 열 명을 다 만나고 엔딩까지 봤다 = 이 판은 끝났다. 기록을 지워 다음 사람이
        // 첫 화면에서 '이어하기'를 만나지 않게 한다(누르면 결과 화면만 다시 뜬다).
        clearSave();
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
    refreshResume();          // 첫 화면으로 돌아올 때마다 이어하기 유무를 다시 본다
    show('screen-title');
  };

  window.Main = Main;
  document.addEventListener('DOMContentLoaded', boot);
})();
