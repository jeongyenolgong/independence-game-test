/* engine.js — 장면 재생기: 대사(타자기)·선택지·인물찾기(포스터 코드 입력)·학습·퀴즈·연출효과 */
(function () {
  'use strict';
  const SPEED = { '느리게': 55, '보통': 30, '빠르게': 14 };
  const $ = (id) => document.getElementById(id);

  // speaker → 편지/쪽지 필체 폰트 클래스
  const FONT = { '한용운': 'han', '안중근': 'ahn', '윤동주': 'yun', '윤봉길': 'yunbg', '김구': 'kimgu' };

  const Engine = {};

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
    // 색부활(초상 흑백→금빛)은 폐기 — 포스터가 처음부터 컬러라 켤 대상이 없다.
    // 15-5 '색부활(예열)'만 살아남았다: 만세 직전 인파 위로 번지는 옅은 색.
    if (t.includes('색부활') && t.includes('예열')) bg.classList.add('color');
    if (t.includes('폭발')) { st.classList.remove('fx-tense', 'fx-blur'); bg.classList.add('burst'); }
  }

  // ---------- 무대 세팅 = 배경 그림 ----------
  // staging.bg_img 칸에 적힌 그림을 그 장면 배경으로 깐다. 비어 있으면(아직 안 그려진
  // 장소) 회색 그라데이션 플레이스홀더로 남는다 — 섞여 있어도 화면이 깨지지 않게.
  function setStaging(sceneId) {
    const stg = (window.G.data.staging || {})[sceneId] || {};
    const bg = $('bg');
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
      while (i < lines.length && batch.length < 3 &&
             lines[i].kind !== '학습' && lines[i].kind !== '편지' && lines[i].kind !== '쪽지') {
        batch.push(lines[i]); i++;
      }
      await typeBatch(batch);
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
    let typed = '', busy = false;

    layer.classList.remove('hidden');
    clearPortrait();
    $('find-prompt').textContent = L['find.prompt'] || '';
    buildPad();
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

    function buildPad() {
      pad.innerHTML = '';
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'].forEach((k) => {
        const b = document.createElement('button');
        b.className = 'find-key' + (k ? '' : ' is-blank');
        b.textContent = k;
        if (!k) { b.disabled = true; pad.appendChild(b); return; }
        b.onclick = (e) => { e.stopPropagation(); press(k); };
        pad.appendChild(b);
      });
      renderCode();
    }
    function renderCode() {
      codeEl.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const d = document.createElement('span');
        d.className = 'find-digit' + (typed[i] ? ' is-on' : '');
        d.textContent = typed[i] || '';
        codeEl.appendChild(d);
      }
    }
    function press(k) {
      if (busy) return;
      if (k === '←') { typed = typed.slice(0, -1); renderCode(); return; }
      if (typed.length >= 3) return;
      typed += k;
      renderCode();
      if (typed.length === 3) setTimeout(submit, 180);  // 세 자리째 = 자동 판정(확인 버튼 없음)
    }
    function clearCode() { typed = ''; renderCode(); }

    // 대사가 흐르는 동안엔 키패드를 잠근다 — 탭이 대사 넘기기와 겹치므로.
    function lock(on) { busy = on; layer.classList.toggle('is-busy', on); }

    async function submit() {
      const hitCode = typed;
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
      if (!filled.has(hitCode)) { fillSlot(o, correct); filled.add(hitCode); }
      if (correct) {
        $('dialogue-box').classList.add('hidden');
        await pause(700);           // 찾아낸 얼굴을 보는 한 박자
        layer.classList.add('hidden');
        lock(false);
        showPortrait(o);            // ◯-2 반전 장면 내내 서 있는다
        if (onDone) onDone();
        return;
      }
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
})();
