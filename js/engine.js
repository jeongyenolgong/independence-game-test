/* engine.js — 장면 재생기: 대사(타자기)·선택지·군중선택·학습·퀴즈·연출효과 */
(function () {
  'use strict';
  const SPEED = { '느리게': 55, '보통': 30, '빠르게': 14 };
  const $ = (id) => document.getElementById(id);

  // speaker → 편지/쪽지 필체 폰트 클래스
  const FONT = { '한용운': 'han', '안중근': 'ahn', '윤동주': 'yun', '윤봉길': 'yunbg', '김구': 'kimgu' };

  const Engine = {};
  let tapUnlock = null; // 현재 대사 탭 핸들러

  // ---------- 목판 SVG 로더 ----------
  // 인물 1명 = SVG 1장. 흑백/색부활은 별도 파일이 아니라 상태 클래스로 갈린다
  // (.state-bw = 회색필터+무표정 / .state-color = 금빛+미소). 파일럿 규약 그대로.
  const svgCache = new Map();
  function loadSvg(path) {
    if (!path) return Promise.resolve(null);
    if (!svgCache.has(path)) {
      svgCache.set(path, fetch(path).then((r) => {
        if (!r.ok) throw new Error('svg ' + r.status + ' ' + path);
        return r.text();
      }).catch((e) => { console.warn('[art] 못 불러옴:', path, e); return null; }));
    }
    return svgCache.get(path);
  }
  // 아트 미준비 인물은 img_bw가 비어 있다 → 기존 회색 플레이스홀더로 자동 폴백.
  async function mountSvg(host, path, state) {
    const svg = await loadSvg(path);
    if (!svg) return false;
    host.innerHTML = svg;
    host.classList.add('svg-host', state || 'state-bw');
    return true;
  }

  // ---------- 초상 층(D 반전용) ----------
  // 군중에서 고른 정답 인물이 여기 올라가 흑백으로 서 있다가, ◯-2의
  // fx='색부활' 신호를 받는 순간 색이 돈다. 이름은 여기서 밝히지 않는다
  // (screen_spec 【D】"화자 이름표 없음" — 실명은 ◯-4 인물 맞히기에서 처음 공개).
  function clearPortrait() {
    const layer = $('portrait-layer');
    layer.classList.add('hidden');
    layer.innerHTML = '';
  }
  async function showPortrait(path) {
    const layer = $('portrait-layer');
    layer.innerHTML = '';
    const fig = document.createElement('div');
    fig.className = 'stage-portrait';
    layer.appendChild(fig);
    const ok = await mountSvg(fig, path, 'state-bw');
    if (!ok) { clearPortrait(); return false; }
    layer.classList.remove('hidden');
    return true;
  }
  function revivePortrait() {
    const fig = $('portrait-layer').querySelector('.stage-portrait');
    if (!fig) return;
    fig.classList.remove('state-bw');
    fig.classList.add('state-color');
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
    // 색부활은 규모가 둘로 갈린다(screen_spec:489). D·E획득 = 스팟(그 사람만),
    // K = 전면(온 화면). 배경까지 물들이면 D가 K처럼 보여 만세의 클라이맥스가 죽는다.
    // 15-5 '색부활(예열)'만 예외 — 인파 위 옅은 번짐이라 전면이 맞다.
    if (t.includes('색부활')) {
      revivePortrait();
      if (t.includes('예열')) bg.classList.add('color');
    }
    if (t.includes('폭발')) { st.classList.remove('fx-tense', 'fx-blur'); bg.classList.add('burst'); }
  }

  // ---------- 무대 세팅 ----------
  function setStaging(sceneId) {
    const stg = (window.G.data.staging || {})[sceneId];
    const cap = $('bg-caption');
    const txt = stg ? ((stg.place ? '［' + stg.place + '］  ' : '') + (stg.bg || '')) : '';
    cap.textContent = txt;
    cap.style.display = txt ? '' : 'none';
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
      function cleanup() { clearInterval(timer); document.getElementById('stage').removeEventListener('click', onTap); tapUnlock = null; }
      tapUnlock = onTap;
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
        tapUnlock = null;
        resolve();
      }
      function onTap() { finish(); }
      tapUnlock = onTap;
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
      function cleanup() { if (timer) clearInterval(timer); $('stage').removeEventListener('click', onTap); tapUnlock = null; }
      tapUnlock = onTap;
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
      function cleanup() { clearInterval(timer); $('stage').removeEventListener('click', onTap); tapUnlock = null; }
      tapUnlock = onTap;
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

  // ---------- 군중 3인 선택(R1~R10) ----------
  Engine.playCrowd = function (relay, onDone) {
    const layer = $('choice-layer');
    const opts = window.G.data.choices[relay] || [];
    function render() {
      layer.innerHTML = '';
      layer.classList.remove('hidden');
      $('dialogue-box').classList.add('hidden');
      const hint = document.createElement('div');
      const L = window.G.data.labels || {};
      hint.className = 'crowd-hint'; hint.textContent = L['crowd.pick_hint'] || '군중 속에서 한 사람을 고르시오';
      layer.appendChild(hint);
      const row = document.createElement('div'); row.className = 'crowd-row';
      opts.forEach((o) => {
        const fig = document.createElement('div'); fig.className = 'crowd-fig';
        const port = document.createElement('div'); port.className = 'crowd-portrait';
        const label = document.createElement('div'); label.className = 'crowd-label';
        label.textContent = o.appearance;
        fig.appendChild(port); fig.appendChild(label);
        // 목판 흑백 초상. 정답도 이 단계엔 흑백 — 색이 돌면 힌트가 된다(screen_spec 【B】).
        mountSvg(port, o.img_bw, 'state-bw');
        fig.onclick = async (e) => {
          e.stopPropagation();
          layer.classList.add('hidden');
          const correct = (o.type === '정답') || (o.result && String(o.result).includes('반전'));
          if (correct) {
            await showPortrait(o.img_color || o.img_bw);  // 아직 흑백. 색은 ◯-2의 fx가 켠다.
            if (onDone) onDone();
          }
          else {
            if (o.response) await typewriter(o.response, o.type === '위험' ? 'emph' : 'narr');
            $('dialogue-box').classList.add('hidden');
            render(); // 복귀(재시도)
          }
        };
        row.appendChild(fig);
      });
      layer.appendChild(row);
    }
    render();
  };

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

  Engine.applyFx = applyFx;
  Engine.typewriter = typewriter;
  Engine.typeAuto = typeAuto;
  Engine.identityQuiz = identityQuiz;   // 미리보기/테스트용 노출
  Engine.setStaging = setStaging;
  window.Engine = Engine;
})();
