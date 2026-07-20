/* engine.js — 장면 재생기: 대사(타자기)·선택지·인물찾기(포스터 코드 입력)·학습·퀴즈·연출효과 */
(function () {
  'use strict';
  const SPEED = { '느리게': 55, '보통': 30, '빠르게': 14 };
  const $ = (id) => document.getElementById(id);

  // speaker → 편지/쪽지 필체 폰트 클래스
  const FONT = { '한용운': 'han', '안중근': 'ahn', '윤동주': 'yun', '윤봉길': 'yunbg', '김구': 'kimgu' };

  const Engine = {};

  // 연출 보강 CSS(fx.css)를 여기서 끼운다. index.html·style.css를 건드리지 않고
  // 덮어쓰기 위한 층이라, style.css 뒤에 붙는 것이 조건 — <head> 끝에 넣으면 항상 뒤다.
  // 상대경로는 document.baseURI 기준으로 풀리므로 배포본(/el/ /md/의 <base href="../">)도 맞는다.
  (function loadFx() {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'css/fx.css';
    document.head.appendChild(l);
  })();

  // 대사창 높이를 --dlg-h로 흘려보낸다. 초상 층이 이 값만큼 아래를 비워 대사창을 피한다
  // (고정 여백이면 대사가 긴 인물에서만 초상이 파묻혔다 — 사용자 지적).
  function watchDialogueHeight() {
    const box = $('dialogue-box'), st = $('stage');
    if (!box || !st || typeof ResizeObserver === 'undefined') return;
    const sync = () => st.style.setProperty('--dlg-h',
      (box.classList.contains('hidden') ? 0 : box.offsetHeight) + 'px');
    new ResizeObserver(sync).observe(box);
    new MutationObserver(sync).observe(box, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  // ---------- 초상 층(D 반전용) ----------
  // 코드로 찾아낸 정답 포스터가 ◯-2 반전 장면 내내 서 있다. 이름은 여기서 밝히지
  // 않는다(screen_spec 【D】 — 실명은 ◯-4 인물 맞히기에서 처음 공개).
  function clearPortrait() {
    const layer = $('portrait-layer');
    layer.classList.add('hidden');
    layer.innerHTML = '';
  }
  function showPortrait(opt) {
    const layer = $('portrait-layer');
    layer.innerHTML = '';
    const fig = posterCell(opt);
    fig.classList.add('stage-portrait');
    layer.appendChild(fig);
    layer.classList.remove('hidden');
  }

  // ---------- 연출 효과 ----------
  function resetPersistentFx() {
    const st = $('stage'), bg = $('bg');
    st.classList.remove('fx-blur', 'fx-vignette', 'fx-tense');
    bg.classList.remove('fx-shake');
  }
  function applyFx(token) {
    if (!token) return;
    const st = $('stage'), bg = $('bg');
    const t = String(token);
    if (t.includes('shake')) { bg.classList.remove('fx-shake'); void bg.offsetWidth; bg.classList.add('fx-shake'); }
    if (t.includes('blur')) st.classList.add('fx-blur');
    if (t.includes('비네트')) st.classList.add('fx-vignette');
    if (t.includes('긴장')) st.classList.add('fx-tense');
    // 색부활은 전부 폐기 — 배경이 흑백 목판에서 유화 컬러로 바뀌면서 '색이 돌아온다'는
    // 전제가 사라졌다(포스터도 처음부터 컬러). 대신 뒤집어서 '폭발 전까지 눌러둔다':
    // 15-5부터 배경이 서서히 색을 잃고 어두워지다가, 만세에서 제 색으로 터진다(사용자 확정).
    if (t.includes('색부활') && t.includes('예열')) bg.classList.add('hold');
    // 만세 = 서서히 밝아짐. 예전의 암전(#bg-flash)은 유화 배경과 따로 놀아 삭제했다.
    // 만세 그림이 어둠에서 제 밝기로 떠오르는 것 하나로 간다(CSS .bg.burst).
    if (t.includes('폭발')) {
      bg.classList.remove('hold');          // 눌러둔 것을 풀며 그림이 떠오른다
      st.classList.remove('fx-tense', 'fx-blur');
      bg.classList.remove('burst'); void bg.offsetWidth; bg.classList.add('burst');
    }
  }

  // ---------- 암전 → 밝아짐(여운) ----------
  // 정답을 맞힌 순간 곧장 초상이 튀어나오면 '맞았다'는 사실만 남고 여운이 없었다.
  // 화면을 한 번 재웠다가 다시 밝히고, 그 어둠 속에서 포스터를 세워 둔다
  // → 빛이 돌아올 때 사람이 이미 서 있다. during()이 어둠 한가운데에서 호출된다.
  async function blackout(during) {
    const st = $('stage');
    let v = $('fx-blackout');
    if (!v) {
      v = document.createElement('div');
      v.id = 'fx-blackout';
      v.className = 'fx-blackout';
      st.appendChild(v);
    }
    v.classList.remove('is-in', 'is-out'); void v.offsetWidth;
    v.classList.add('is-in');
    await pause(900);          // 잠긴다
    if (during) during();      // 어둠 속에서 화면을 갈아 끼운다
    await pause(500);          // 완전한 어둠 한 박자
    v.classList.remove('is-in'); void v.offsetWidth;
    v.classList.add('is-out');
    await pause(1500);         // 서서히 밝아진다
    v.classList.remove('is-out');
  }

  // ---------- 무대 세팅 = 배경 그림 ----------
  // staging.bg_img 칸에 적힌 그림을 그 장면 배경으로 깐다. 비어 있으면(아직 안 그려진
  // 장소) 회색 그라데이션 플레이스홀더로 남는다 — 섞여 있어도 화면이 깨지지 않게.
  function setStaging(sceneId) {
    const stg = (window.G.data.staging || {})[sceneId] || {};
    const bg = $('bg');
    const prev = $('bg-prev');
    // 디졸브 — 그림이 실제로 '바뀔 때'만. 같은 배경이 이어지는 장면(◯-1→◯-2→◯-3)에서
    // 매번 겹쳐 지우면 이유 없이 화면이 깜빡인다.
    const before = bg.style.getPropertyValue('--bg-img');
    const after = stg.bg_img ? 'url("' + new URL(stg.bg_img, document.baseURI).href + '")' : '';
    if (prev && before && before !== after) {
      prev.style.backgroundImage = before;
      prev.classList.remove('is-fading'); void prev.offsetWidth; prev.classList.add('is-fading');
    }
    if (stg.bg_img) {
      // ⚠️CSS 변수에 상대경로를 넣으면 style.css 기준으로 풀려 'css/assets/...'를 찾는다
      // (파일이 멀쩡해도 배경이 새까맣게 뜬다). 게다가 배포본 /el/ /md/는 <base href="../">를
      // 쓰므로 기준이 또 달라진다 → document.baseURI 기준 절대주소로 박아 둘 다 막는다.
      const abs = new URL(stg.bg_img, document.baseURI).href;
      bg.style.setProperty('--bg-img', 'url("' + abs + '")');
      bg.classList.add('has-img');
    } else {
      bg.style.removeProperty('--bg-img');
      bg.classList.remove('has-img');
    }
  }

  // ---------- 타자기 ----------
  function typewriter(text, styleClasses) {
    return new Promise((resolve) => {
      const box = $('dialogue-box'), el = $('dialogue-text'), cont = $('dialogue-cont');
      box.classList.remove('hidden');
      el.className = 'dialogue-text ' + (styleClasses || '');
      el.textContent = '';
      cont.classList.add('hidden');
      let i = 0, done = false;
      const spd = SPEED[window.G.speed] || 30;
      let timer = setInterval(step, spd);
      function step() {
        if (i >= text.length) return finish();
        el.textContent += text[i++];
      }
      function finish() { clearInterval(timer); done = true; el.textContent = text; cont.classList.remove('hidden'); }
      function onTap() {
        if (!done) { finish(); return; }
        cleanup(); resolve();
      }
      function cleanup() { clearInterval(timer); document.getElementById('stage').removeEventListener('click', onTap); }
      $('stage').addEventListener('click', onTap);
    });
  }

  // ---------- 타자기(자동 착지) — L1 몽타주 전용 ----------
  // 일반 typewriter는 타이핑이 끝나도 '탭'을 받아야 끝난다. 몽타주는 리빌이
  // **절이 완성되는 순간**에 착지해야 해서(screen_spec:403) 그 규칙이 맞지 않는다.
  // 여기서는 타이핑 완료 = 즉시 resolve. 타이핑 중 탭은 '그 절 즉시 완성'까지만
  // 하고 다음으로 넘기지 않는다(screen_spec:407 페이싱 규칙).
  function typeAuto(text, styleClasses) {
    return new Promise((resolve) => {
      const box = $('dialogue-box'), el = $('dialogue-text'), cont = $('dialogue-cont');
      box.classList.remove('hidden');
      el.className = 'dialogue-text ' + (styleClasses || '');
      el.textContent = '';
      cont.classList.add('hidden');
      let done = false, i = 0;
      const spd = SPEED[window.G.speed] || 30;
      const timer = setInterval(step, spd);
      function step() { if (i >= text.length) return finish(); el.textContent += text[i++]; }
      function finish() {
        if (done) return;
        done = true;
        clearInterval(timer);
        el.textContent = text;
        $('stage').removeEventListener('click', onTap);
        resolve();
      }
      function onTap() { finish(); }
      $('stage').addEventListener('click', onTap);
    });
  }

  // ---------- 대사 묶음(최대 3줄, 이어서 타자기) ----------
  function typeBatch(batch) {
    return new Promise((resolve) => {
      const box = $('dialogue-box'), host = $('dialogue-text'), cont = $('dialogue-cont');
      box.classList.remove('hidden');
      host.className = 'dialogue-text';
      host.innerHTML = '';
      cont.classList.add('hidden');
      const els = batch.map((line) => {
        const p = document.createElement('p');
        p.className = 'dline ' + styleFor(line);
        host.appendChild(p);
        return p;
      });
      const spd = SPEED[window.G.speed] || 30;
      let k = 0, ci = 0, started = -1, done = false, timer = null;
      startLine();

      function startLine() {
        started = k;
        applyFx(batch[k].fx);
        ci = 0;
        timer = setInterval(tick, spd);
      }
      function tick() {
        const text = batch[k].text;
        if (ci < text.length) { els[k].textContent += text[ci++]; return; }
        clearInterval(timer); timer = null;
        if (k < batch.length - 1) { k++; setTimeout(() => { if (!done) startLine(); }, 220); }
        else finishAll();
      }
      function finishAll() {
        if (timer) { clearInterval(timer); timer = null; }
        for (let j = started + 1; j < batch.length; j++) applyFx(batch[j].fx);
        batch.forEach((line, idx) => { els[idx].textContent = line.text; });
        done = true; cont.classList.remove('hidden');
      }
      function onTap() {
        if (!done) { finishAll(); return; }
        cleanup(); resolve();
      }
      function cleanup() { if (timer) clearInterval(timer); $('stage').removeEventListener('click', onTap); }
      $('stage').addEventListener('click', onTap);
    });
  }

  // ---------- 편지 전체화면(친필 서체) ----------
  function letterFull(text, fontClass) {
    return new Promise((resolve) => {
      const layer = $('letter-layer'), el = $('letter-text'), cont = layer.querySelector('.letter-cont');
      $('dialogue-box').classList.add('hidden');
      layer.classList.remove('hidden');
      el.className = 'letter-text ' + (fontClass || 'kimgu');
      el.textContent = '';
      cont.classList.add('hidden');
      let i = 0, done = false;
      const spd = (SPEED[window.G.speed] || 30) + 22; // 편지는 조금 더 느리게(여운)
      let timer = setInterval(step, spd);
      function step() { if (i >= text.length) return finish(); el.textContent += text[i++]; }
      function finish() { clearInterval(timer); done = true; el.textContent = text; cont.classList.remove('hidden'); }
      function onTap() {
        if (!done) { finish(); return; }
        cleanup(); layer.classList.add('hidden'); resolve();
      }
      function cleanup() { clearInterval(timer); $('stage').removeEventListener('click', onTap); }
      $('stage').addEventListener('click', onTap);
    });
  }

  // ---------- 증표 클로즈업(전체화면) ----------
  // 남성은 편지를 건네고(→letterFull 전체화면), 여성은 물건을 건넨다. 원고가 그 순간
  // "클로즈업"을 지시하는데 화면엔 아무것도 안 떴다 — 편지만 전체화면을 받고 물건은
  // 아무 자리도 못 받는, 엔딩에서 고친 것과 똑같은 기울기가 릴레이에도 남아 있었다.
  // 그래서 letterFull과 **같은 층위**로 만든다: 전체화면 + 탭으로 넘기는 한 박자.
  // (applyFx는 동기라 탭 대기가 없어 여기 쓸 수 없다.)

  // 실명 → 증표 그림. cards.상징물_필체_img는 여성=물건 / 남성=편지가 함께 쓰는 칸이라,
  // 남성 5인은 비어 있다(필체 폰트가 이미 시각물이므로 그림이 필요 없다).
  let TOKENS = null;
  function tokenSrc(name) {
    if (!TOKENS) {
      TOKENS = {};
      (window.G.data.cards || []).forEach((c) => {
        if (c['상징물_필체_img']) TOKENS[c['실명']] = c['상징물_필체_img'];
      });
    }
    return TOKENS[name] || '';
  }

  // fx 칸의 '증표:유관순' → '유관순'. 앞의 사람이 건넨 물건이므로 **주는 쪽** 이름이다
  // (8-3은 윤동주에게 건네지만 물건은 유관순의 태극기).
  function tokenOwner(fx) {
    const m = /증표\s*[:：]\s*([^\s,·]+)/.exec(String(fx || ''));
    return m ? m[1] : '';
  }

  // index.html은 다른 작업이 함께 쓰는 파일이라 건드리지 않는다. fx.css를 <head>에
  // 끼우는 것과 같은 방식으로 층을 코드에서 만들어 세운다.
  function tokenLayer() {
    let layer = $('token-layer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'token-layer';
    layer.className = 'token-layer hidden';
    layer.innerHTML = '<div class="token-frame"><img id="token-img" alt=""></div>' +
      '<span class="token-cont cont-indicator">▼</span>';
    $('stage').appendChild(layer);
    return layer;
  }

  function tokenFull(src) {
    return new Promise((resolve) => {
      const layer = tokenLayer(), img = $('token-img'), cont = layer.querySelector('.token-cont');
      $('dialogue-box').classList.add('hidden');
      cont.classList.add('hidden');
      layer.classList.remove('hidden', 'is-in'); void layer.offsetWidth;
      img.src = new URL(src, document.baseURI).href;
      layer.classList.add('is-in');
      // 물건이 다 떠오른 뒤에 ▼를 준다. 타자기가 글자를 다 친 뒤 ▼를 주는 것과 같은 박자.
      let done = false;
      const t = setTimeout(() => { done = true; cont.classList.remove('hidden'); }, 1100);
      function onTap() {
        if (!done) { clearTimeout(t); done = true; cont.classList.remove('hidden'); return; }
        $('stage').removeEventListener('click', onTap);
        layer.classList.add('hidden'); layer.classList.remove('is-in');
        resolve();
      }
      $('stage').addEventListener('click', onTap);
    });
  }

  function styleFor(line) {
    if (line.kind === '지문') return 'narr';
    if (line.kind === '쪽지' || line.kind === '편지') {
      return 'letter ' + (FONT[line.speaker] || 'kimgu');
    }
    if (line.fx && String(line.fx).includes('강조')) return 'emph';
    return '';
  }

  // 학년 필터: 공통 또는 현재 학년
  function forGrade(lines) {
    const g = window.G.grade;
    return lines.filter((l) => l.aud === '공통' || l.aud === g);
  }

  // 반전 장면(◯-2) = 군중에서 고른 초상이 그대로 서 있어야 하는 유일한 장면.
  function isRevealScene(sceneId) {
    return (window.G.data.relays || []).some((r) => (r.base + '-2') === String(sceneId));
  }

  // ---------- 장면 재생 ----------
  Engine.playScene = async function (sceneId, onDone) {
    setStaging(sceneId);
    resetPersistentFx();
    if (!isRevealScene(sceneId)) clearPortrait();
    $('caption-layer').classList.add('hidden');
    const raw = (window.G.data.scenes[sceneId] || []);
    const lines = forGrade(raw);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.kind === '학습') {
        // 연속된 학습 라인을 모아 학습 패널로
        const pages = [];
        while (i < lines.length && lines[i].kind === '학습') { pages.push(lines[i].text); i++; }
        $('dialogue-box').classList.add('hidden');
        await Engine.learnPanel(pages);
        continue;
      }
      if (line.kind === '편지' || line.kind === '쪽지') {
        applyFx(line.fx);
        await letterFull(line.text, FONT[line.speaker] || 'kimgu');
        i++;
        continue;
      }
      // 대사/지문: 최대 3줄을 한 대사창에 모아 이어서 타자기
      const batch = [];
      let owner = '';
      while (i < lines.length && batch.length < 3 &&
             lines[i].kind !== '학습' && lines[i].kind !== '편지' && lines[i].kind !== '쪽지') {
        batch.push(lines[i]); i++;
        // '증표:◯◯◯'가 붙은 줄에서 묶음을 끊는다. 안 끊으면 "꺼내 내밀었다"(seq1)와
        // "두 손으로 받아…"(seq2)가 한 대사창에 묶여, 이미 받은 뒤에 물건이 뜬다.
        owner = tokenOwner(batch[batch.length - 1].fx);
        if (owner) break;
      }
      await typeBatch(batch);
      // 건네는 줄 → 클로즈업 → 받는 줄. 그림이 없는 사람이면 조용히 지나간다.
      if (owner && tokenSrc(owner)) await tokenFull(tokenSrc(owner));
    }
    $('dialogue-box').classList.add('hidden');
    if (onDone) onDone();
  };

  // ---------- 학습 패널(A₂) ----------
  Engine.learnPanel = function (pages) {
    return new Promise((resolve) => {
      const panel = $('learn-panel'), txt = $('learn-text'),
        prev = $('learn-prev'), next = $('learn-next'), prog = $('learn-progress');
      let p = 0;
      panel.classList.remove('hidden');
      function render() {
        txt.innerHTML = pages[p].replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        prog.textContent = (p + 1) + '/' + pages.length;
        prev.disabled = (p === 0);
        next.textContent = (p === pages.length - 1) ? '닫기 ✓' : '다음 ▶';
      }
      prev.onclick = () => { if (p > 0) { p--; render(); } };
      next.onclick = () => {
        if (p < pages.length - 1) { p++; render(); }
        else { panel.classList.add('hidden'); prev.onclick = next.onclick = null; resolve(); }
      };
      render();
    });
  };

  // ---------- 도입 선택지(장면4, 분기 없음 합류) ----------
  Engine.playIntroChoice = function (relay, onDone) {
    const layer = $('choice-layer');
    const opts = window.G.data.choices[relay] || [];
    layer.innerHTML = '';
    layer.classList.remove('hidden');
    $('dialogue-box').classList.add('hidden');
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.textContent = o.appearance; // 플레이어 질문
      b.onclick = async (e) => {
        e.stopPropagation();
        layer.classList.add('hidden');
        if (o.response) await typewriter(o.response, ''); // 익명 인물 답 한 줄
        $('dialogue-box').classList.add('hidden');
        if (onDone) onDone(); // 둘 다 장면5로 합류
      };
      layer.appendChild(b);
    });
  };

  // ---------- 인물 찾기 = 포스터 코드 입력(R1~R10) ----------
  // 화면엔 후보 인물이 **그려지지 않는다**. 빈 자리 + 코드 입력칸 + 대사창뿐이고,
  // 벽에 붙은 오프라인 포스터 30장에서 사람을 찾아 3자리 코드를 쳐야 진행된다.
  // 대사창엔 '찾아야 할 사람'의 ◯-5 예고 묘사만 뜬다(후보 3인 묘사는 어디에도 없음).
  // 배경은 가리지 않는다 — 배경이 곧 1차 검색 필터(장터인지 강나루인지)이기 때문.

  // 코드 → {릴레이 번호, 후보}. 전역 유니크라 어느 릴레이 것인지로 4갈래가 갈린다.
  let CODES = null;
  function codeIndex() {
    if (CODES) return CODES;
    CODES = new Map();
    const ch = window.G.data.choices || {};
    Object.keys(ch).forEach((rel) => {
      const m = /^R(\d+)$/.exec(rel);
      if (!m) return;
      ch[rel].forEach((o) => { if (o.code) CODES.set(String(o.code), { n: +m[1], opt: o }); });
    });
    return CODES;
  }

  // 포스터 한 장. 아직 안 그려진 29장은 코드만 적힌 자리로 폴백한다
  // (그림이 없다고 화면이 깨지지도, 정답이 새지도 않게).
  function posterCell(opt) {
    const cell = document.createElement('div');
    cell.className = 'find-slot is-filled';
    const img = document.createElement('img');
    img.className = 'find-poster';
    img.alt = '';
    img.onerror = () => { cell.classList.add('is-todo'); cell.textContent = opt.code; };
    img.src = opt.poster_img;
    cell.appendChild(img);
    return cell;
  }

  // 대사창에 타자기 없이 즉시 표시(묘사 복귀용). 넘길 게 없으니 ▼도 없다.
  function showStatic(text, cls) {
    const box = $('dialogue-box'), el = $('dialogue-text');
    box.classList.remove('hidden');
    el.className = 'dialogue-text ' + (cls || '');
    el.textContent = text;
    $('dialogue-cont').classList.add('hidden');
  }

  Engine.playFind = function (relay, onDone) {
    const layer = $('find-layer'), slots = $('find-slots'),
      codeEl = $('find-code'), pad = $('find-pad');
    const L = window.G.data.labels || {};
    const opts = window.G.data.choices[relay] || [];
    const here = +(/^R(\d+)$/.exec(relay) || [])[1];
    const hint = (opts.find((o) => o.type === '정답') || {}).hint || '';
    const index = codeIndex();
    const filled = new Set();   // 이 장면에서 이미 자리를 채운 코드(중복 입력 시 자리 안 늘림)
    let busy = false;

    layer.classList.remove('hidden');
    layer.classList.remove('is-busy');   // 앞 릴레이가 남겼을 수 있는 잠금 상태를 걷고 시작
    clearPortrait();
    $('find-prompt').textContent = L['find.prompt'] || '';
    const input = buildInput();
    resetSlots();
    showStatic(hint);

    // 빈 자리 1개로 시작. 이 릴레이 사람을 찾을 때마다 그 자리가 채워지고 새 빈 자리가 선다.
    function resetSlots() { slots.innerHTML = ''; addEmpty(); }
    function addEmpty() {
      const s = document.createElement('div');
      s.className = 'find-slot is-empty';
      s.textContent = L['find.slot'] || '?';
      slots.appendChild(s);
      return s;
    }
    // 정답이면 새 빈 자리를 세우지 않는다 — 더 찾을 사람이 없는데 빈 자리가 남으면
    // "세 사람이 눈에 들어왔다"(◯-1 지문)와 어긋난다. 후보가 셋이므로 자리도 최대 셋.
    function fillSlot(opt, last) {
      const empty = slots.querySelector('.is-empty');
      const cell = posterCell(opt);
      if (empty) slots.replaceChild(cell, empty); else slots.appendChild(cell);
      if (!last) addEmpty();
    }

    // 자체 숫자키패드는 걷었다. 기기 자판이 이미 숫자를 칠 줄 알고, 직접 만든 패드는
    // 화면 아래를 크게 먹으면서 포스터 자리를 눌렀다. 진짜 <input>이라 붙여넣기·백스페이스·
    // 하드웨어 키보드가 전부 공짜로 따라온다.
    function buildInput() {
      pad.innerHTML = '';
      pad.classList.add('hidden');   // 자리까지 회수(.hidden = display:none)
      codeEl.innerHTML = '';
      const el = document.createElement('input');
      el.className = 'find-input';
      // type=number는 스피너·e/+/- 입력이 따라와 3자리 코드엔 해가 더 크다.
      // text + inputmode=numeric = 태블릿에서 숫자 자판이 뜨면서 값은 우리가 통제한다.
      el.type = 'text';
      el.inputMode = 'numeric';
      el.setAttribute('pattern', '[0-9]*');
      el.autocomplete = 'off';
      el.maxLength = 3;
      el.placeholder = L['find.slot_code'] || '···';
      // 입력칸 위 탭이 무대까지 올라가면 대사 넘기기로도 먹힌다(타자기가 #stage에서 듣는다).
      ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((ev) =>
        el.addEventListener(ev, (e) => e.stopPropagation()));
      el.addEventListener('input', () => {
        // 숫자만·3자리까지. 자판·붙여넣기·자동완성 어느 경로로 들어와도 여기서 걸러진다.
        const v = el.value.replace(/\D/g, '').slice(0, 3);
        if (v !== el.value) el.value = v;
        if (busy) return;
        if (v.length === 3) setTimeout(submit, 180);   // 세 자리째 = 자동 판정(확인 버튼 없음)
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (!busy && el.value.length === 3) submit(); }
      });
      codeEl.appendChild(el);
      return el;
    }
    function clearCode() { input.value = ''; }

    // 대사가 흐르는 동안엔 입력을 잠근다 — 탭이 대사 넘기기와 겹치므로.
    // 잠글 땐 입력칸·안내 문구가 잠시 걷힌다(fx.css .find-layer.is-busy): 대사가 흐르는 중에
    // 입력칸이 그대로 서 있으면 "지금 쳐도 되나?"로 읽혔다.
    // refocus=false = 잠금은 풀되 커서는 안 준다(정답 직후 — 자판이 다시 올라오면
    // 암전 연출을 자판이 가린다). #find-layer는 릴레이 10개가 돌려 쓰는 한 개짜리 층이라
    // is-busy를 남긴 채 끝내면 **다음 릴레이** 화면이 입력칸도 안내도 안 보이는 채로 열린다.
    function lock(on, refocus) {
      busy = on;
      layer.classList.toggle('is-busy', on);
      input.disabled = on;
      if (!on && refocus !== false) input.focus();
    }

    async function submit() {
      const hitCode = input.value;
      const hit = index.get(hitCode);

      // ⑤ 30장 어디에도 없는 번호(오타 등) = 입력칸만 흔들리고 지워짐. 대사 없음.
      if (!hit) {
        codeEl.classList.remove('shake-now'); void codeEl.offsetWidth;
        codeEl.classList.add('shake-now');
        clearCode();
        return;
      }
      lock(true);
      clearCode();

      // ③ 이미 지나온 릴레이 사람 / ④ 아직 만날 때가 아닌 사람 = 얼굴 없이 한 마디만.
      if (hit.n !== here) {
        const line = hit.n < here ? (L['find.past'] || '"우리 이미 만나지 않았던가?"')
          : (L['find.future'] || '"우리는 아직 만날 때가 아니야."');
        await typewriter(line, '');
        showStatic(hint);           // 묘사 즉시 복귀(타자기 없이)
        lock(false);
        return;
      }

      // ① 이 장면 정답 = 얼굴 삽입 → 다음
      const o = hit.opt;
      const correct = (o.type === '정답') || (o.result && String(o.result).includes('반전'));
      // ① 정답 = 작은 자리를 거치지 않고 곧장 큰 초상으로.
      //    예전엔 여기서도 fillSlot으로 슬롯에 한 번 꽂고 700ms 보여준 뒤 초상을 띄웠는데,
      //    같은 그림이 작게 번쩍했다 커지는 게 잔상으로 읽혔다(사용자 지적).
      if (correct) {
        $('dialogue-box').classList.add('hidden');
        layer.classList.add('hidden');
        lock(false, false);         // is-busy를 반드시 걷는다(다음 릴레이가 같은 층을 쓴다)
        // 암전 한 박자를 두고 밝아진다. 초상은 어둠 속에서 세워 두므로,
        // 빛이 돌아올 땐 그 사람이 이미 서 있다(정답이 '나타나는' 게 아니라 '드러난다').
        await blackout(() => showPortrait(o));   // ◯-2 반전 장면 내내 서 있는다
        if (onDone) onDone();
        return;
      }
      if (!filled.has(hitCode)) { fillSlot(o, false); filled.add(hitCode); }
      // ② 이 장면 오답 = 얼굴 삽입 → 기존 오답 대사 → 묘사 복귀
      if (o.response) await typewriter(o.response, o.type === '위험' ? 'emph' : 'narr');
      showStatic(hint);
      lock(false);
    }
  };

  function pause(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---------- 유틸: 셔플·화면 흔들림 ----------
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function screenShake() {
    const el = $('app');
    el.classList.remove('shake-now'); void el.offsetWidth; el.classList.add('shake-now');
  }

  // ---------- 인물 맞히기 퀴즈(퀴즈 전, 4지선다·오답=흔들림) ----------
  function identityQuiz(person) {
    return new Promise((resolve) => {
      const panel = $('quiz-panel'), qEl = $('quiz-q'), optWrap = $('quiz-options'),
        fbEl = $('quiz-feedback'), cont = $('quiz-continue');
      const L = window.G.data.labels || {};
      const names = (window.G.data.cards || []).map((c) => c['실명']);
      const others = shuffle(names.filter((n) => n !== person)).slice(0, 3);
      const opts = shuffle([person, ...others]);

      panel.classList.remove('hidden');
      $('dialogue-box').classList.add('hidden');
      qEl.textContent = L['quiz.identity_q'] || '지금 이 대화 속 주인공은 누구일까요?';
      fbEl.classList.add('hidden'); cont.classList.add('hidden');
      optWrap.innerHTML = '';
      opts.forEach((name) => {
        const b = document.createElement('button');
        b.className = 'quiz-opt'; b.textContent = name;
        b.onclick = () => {
          if (name === person) { panel.classList.add('hidden'); resolve(); }
          else { screenShake(); }   // 오답: 화면 흔들림, 피드백 문구 없음
        };
        optWrap.appendChild(b);
      });
    });
  }

  // ---------- 퀴즈 ----------
  Engine.playQuiz = async function (sceneId, person, onDone) {
    const grade = window.G.grade;
    const q = (window.G.data.quiz[grade] || {})[sceneId];
    // 1) 인물 맞히기(정답이어야 진행) → 2) 기존 내용 퀴즈
    await identityQuiz(person);
    const panel = $('quiz-panel'), qEl = $('quiz-q'), optWrap = $('quiz-options'),
      fbEl = $('quiz-feedback'), cont = $('quiz-continue');
    if (!q) { if (onDone) onDone(); return; }
    panel.classList.remove('hidden');
    $('dialogue-box').classList.add('hidden');
    qEl.textContent = q.q;
    fbEl.classList.add('hidden'); cont.classList.add('hidden');
    optWrap.innerHTML = '';

    function finish() { panel.classList.add('hidden'); cont.onclick = null; if (onDone) onDone(); }
    cont.onclick = finish;

    function lock(disabled) { [...optWrap.querySelectorAll('.quiz-opt')].forEach((b) => b.disabled = disabled); }

    if (grade === '초등') {
      const row = document.createElement('div'); row.className = 'ox-row';
      ['O', 'X'].forEach((sym) => {
        const b = document.createElement('button'); b.className = 'quiz-opt ox'; b.textContent = sym;
        b.onclick = () => {
          const ok = (sym === q.answer);
          b.classList.add(ok ? 'correct' : 'wrong');
          fbEl.textContent = ok ? q.fb_ok : q.fb_no; fbEl.classList.remove('hidden');
          if (ok) { lock(true); cont.classList.remove('hidden'); }
          else { setTimeout(() => { b.classList.remove('wrong'); }, 500); }
        };
        row.appendChild(b);
      });
      optWrap.appendChild(row);
    } else {
      q.options.forEach((opt, idx) => {
        const b = document.createElement('button'); b.className = 'quiz-opt';
        b.textContent = (idx + 1) + '. ' + opt;
        b.onclick = () => {
          const ok = (idx + 1 === q.answer);
          b.classList.add(ok ? 'correct' : 'wrong');
          fbEl.textContent = q.fb[idx]; fbEl.classList.remove('hidden');
          if (ok) { lock(true); cont.classList.remove('hidden'); }
          else { setTimeout(() => b.classList.remove('wrong'), 500); }
        };
        optWrap.appendChild(b);
      });
    }
  };

  // 인물 만남 기록(도감 해금) — 반전 장면에서 호출
  Engine.markMet = function (person) { if (person) window.G.met.add(person); };

  Engine.typewriter = typewriter;
  Engine.typeAuto = typeAuto;
  Engine.identityQuiz = identityQuiz;   // 미리보기/테스트용 노출
  window.Engine = Engine;
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', watchDialogueHeight);
  else watchDialogueHeight();
})();
