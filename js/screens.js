/* screens.js — 시스템 화면: 타이틀·도감·설정·엔딩 몽타주·결과·크레딧 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const Screens = {};

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  // ---------- 라벨 주입 ----------
  Screens.applyLabels = function () {
    const S = window.G.data.system, L = window.G.data.labels;
    document.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.getAttribute('data-k');
      const v = (S && S[k] != null) ? S[k] : (L && L[k] != null ? L[k] : null);
      if (v != null && v !== '') el.textContent = v;
    });
    // 개별 버튼 라벨(빈 값이면 기본 유지)
    const setTxt = (id, v) => { if (v) $(id).textContent = v; };
    setTxt('btn-start', L['title.btn_start']);
    setTxt('result-heading', S['result.heading']);
    setTxt('result-codex', L['result.btn_codex']);
    setTxt('result-exit', L['result.btn_exit']);
    setTxt('result-save', L['result.btn_save']);
    $('codex-guide').textContent = L['codex.guide'] || '카드를 눌러 앞뒤를 넘겨 보세요.';
  };

  // ---------- 도감 ----------
  Screens.openCodex = function (fromResult) {
    const cards = window.G.data.cards, met = window.G.met;
    const grid = $('codex-grid'); grid.innerHTML = '';
    $('codex-progress').textContent = (window.G.data.labels['codex.progress'] || '만난 사람 {n}/10')
      .replace('{n}', met.size);
    cards.forEach((c) => {
      const name = c['실명'];
      const unlocked = met.has(name);
      const card = document.createElement('div');
      card.className = 'codex-card' + (unlocked ? '' : ' locked');
      card.innerHTML =
        '<div class="codex-card-inner">' +
        '  <div class="codex-face codex-front"><p class="quote">' + (unlocked ? '“' + c['대표한마디'] + '”' : '') + '</p></div>' +
        '  <div class="codex-face codex-back">' +
        '    <div class="cname">' + name + '</div>' +
        '    <div class="cinfo">' + (c['한자'] || '') + '<br>' + (c['생몰년'] || '') + '<br><br>' + (c['한줄'] || '') + '</div>' +
        '  </div>' +
        '</div>';
      if (unlocked) card.onclick = () => card.classList.toggle('flipped');
      grid.appendChild(card);
    });
    Screens._codexFromResult = !!fromResult;
    show('screen-codex');
  };
  Screens.closeCodex = function () {
    hide('screen-codex');
    if (Screens._codexFromResult) show('screen-result');
  };

  // ---------- 설정 ----------
  Screens.openSettings = function () { show('screen-settings'); };
  Screens.closeSettings = function () { hide('screen-settings'); };

  // ---------- 엔딩 몽타주 L1~L3 ----------
  Screens.playEnding = async function (onDone) {
    const S = window.G.data.system, E = window.G.data.ending;
    const box = $('dialogue-box');
    const pLayer = $('portrait-layer'), cLayer = $('caption-layer');
    const type = window.Engine.typewriter;   // 탭으로 넘김(도입·L3 내레이션)
    const type2 = window.Engine.typeAuto;    // 절 완성 즉시 착지(몽타주 상징 절)
    $('minimenu').classList.add('hidden');  // 엔딩(L1~L3) 미니메뉴 숨김(정본 규칙)

    // 배경: 만세 물결(색) 유지
    $('bg-caption').textContent = '';
    $('stage').classList.remove('fx-tense', 'fx-blur', 'fx-vignette');
    $('bg').classList.add('color');

    const narr = (S['ending.narration'] || '').split('\n').filter(Boolean);
    const theme = (S['ending.theme_close'] || '').split('\n').filter(Boolean);
    // 9개 상징 구 = narr[1]+narr[2]를 쉼표로 분해
    const phrases = ((narr[1] || '') + ',' + (narr[2] || ''))
      .split(',').map((s) => s.trim().replace(/[.\s]+$/, '')).filter(Boolean);

    // 인물 → 공식 흑백 사진 경로. 정본 411행(★공식사진 채택 = 미술 원칙 전환):
    // L1 초상 = 실제 공식사진(도감 뒷면과 같은 에셋 계열). 목판·색부활 아님.
    const photoOf = {};
    (window.G.data.cards || []).forEach((c) => { photoOf[c['실명']] = c['뒷면_공식이미지_img']; });

    pLayer.classList.remove('hidden');
    // 도입 내레이션
    await type(narr[0], 'narr');

    for (let i = 0; i < E.length; i++) {
      const row = E[i];
      const isHan = (row.person === '한용운');

      // ── ① 떠오름 ── 흑백 사진. 이름은 절대 여기 쓰지 않는다(리빌 전 실명 노출 = 반전 파괴).
      // 이름·증표 자막을 초상과 한 덩어리(montage-group)로 묶는다. 정본 "초상 위 캡션 층"
      // = 얼굴 위가 아니라 얼굴 위쪽. 묶어두면 ③비트의 '동행 페이드'(405행)도 저절로 된다.
      // 자막은 자리만 잡고 투명 — 리빌 때 나타나도 초상이 밀리지 않게.
      const photo = photoOf[row.person];
      pLayer.innerHTML =
        '<div class="montage-group">' +
        '  <div class="namecap"></div>' +
        '  <div class="montage-portrait">' +
        (photo ? '<img src="' + photo + '" alt="">' : '') +
        (isHan ? '<div class="han-script">자유는 만유의 생명이요…</div>' : '') +
        '  </div>' +
        '  <div class="tokencap"></div>' +
        '</div>';
      const grp = pLayer.querySelector('.montage-group');
      const port = grp.querySelector('.montage-portrait');
      cLayer.classList.add('hidden');   // 몽타주는 캡션층을 안 쓴다(장소 자막 전용)

      // ── ② 리빌 ── 절이 완성되는 '그 순간'. 탭을 기다리지 않는다.
      if (!isHan) {
        if (phrases[i]) await type2(phrases[i], 'narr');
        grp.querySelector('.namecap').textContent = row.name_caption || '';
      } else {
        // 한용운: 이름 자막 없음(L2 필체 겹침이 정체를 대신 밝힌다)
        await type2(narr[3] || '', 'narr'); // "그들이 건넨 것은…"
        port.querySelector('.han-script').classList.add('show');
      }
      grp.querySelector('.tokencap').textContent = row.caption || '';
      port.classList.add('revived');
      grp.classList.add('named');   // 자막 한 번에 또렷이(타이핑 X = 반전 임팩트)

      await waitTapAfter(700);   // 리빌 착지 여음 뒤 탭 = 다음 인물

      // ── ③ 스쳐 지나감 ── 금빛이 스러지며 왼쪽 아래 물결로 흘러 군중에 섞인다.
      // 사진이 흑백이라 금빛만 빠지면 군중과 동일 톤 = 다시 익명(screen_spec:405).
      // 배경 물결·대사상자는 안 떠난다 — 다음 얼굴이 같은 물결에서 솟는다.
      grp.classList.add('exiting');
      await sleep(1100);
    }

    // L3 주제 봉인
    pLayer.innerHTML = '';
    pLayer.classList.add('hidden');
    for (const line of theme) await type(line, 'narr');
    box.classList.add('hidden');
    if (onDone) onDone();
  };

  function waitTap() {
    return new Promise((resolve) => {
      function h(e) { $('stage').removeEventListener('click', h); resolve(); }
      $('stage').addEventListener('click', h);
    });
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  // 리빌 착지 여음(ms) 뒤에 탭을 받는다. 단, 여음 중에 들어온 탭은 버리지 않고
  // 담아 뒀다가 착지하는 즉시 넘어간다 — 정본 "리빌 착지 후 탭=다음 인물"을
  // 지키되(성급한 탭이 반전을 잘라먹지 않게), 탭이 씹힌 느낌은 주지 않게.
  function waitTapAfter(ms) {
    return new Promise((resolve) => {
      let landed = false, tapped = false;
      const t = setTimeout(() => { landed = true; if (tapped) done(); }, ms);
      function done() { clearTimeout(t); $('stage').removeEventListener('click', h); resolve(); }
      function h() { tapped = true; if (landed) done(); }
      $('stage').addEventListener('click', h);
    });
  }

  // ---------- ⑤ 결과 ----------
  Screens.showResult = function () {
    hide('stage');
    const grid = $('result-grid'); grid.innerHTML = '';
    window.G.data.cards.forEach((c, idx) => {
      const cell = document.createElement('div');
      cell.className = 'result-cell';
      cell.style.animationDelay = (idx * 0.12) + 's';
      cell.innerHTML = '<div class="result-portrait">' + c['실명'] + '</div>' +
        '<div class="result-name">' + c['실명'] + '</div>';
      grid.appendChild(cell);
    });
    show('screen-result');
  };

  // ---------- 크레딧 ----------
  Screens.showCredits = function () {
    hide('screen-result');
    const S = window.G.data.system, L = window.G.data.labels;
    const scroll = $('credits-scroll');
    const block = (label, body) => body ? ('<h3>' + (label || '') + '</h3><p>' + body + '</p>') : '';
    scroll.innerHTML =
      '<h3 style="font-size:24px;margin-top:60px">만세는 언제 부르오</h3>' +
      block(L['credits.label_maker'], S['credits.maker']) +
      block(L['credits.label_sources'], S['credits.sources']) +
      block(L['credits.label_fonts'], S['credits.font_letter']) +
      block(L['credits.label_assets'], S['credits.assets']) +
      '<p style="margin:40px 0 60px;color:#8a7a5a">— 끝 —</p>';
    // 정적 표시(영화식 위로 스크롤 제거). 길면 화면 내 일반 스크롤.
    scroll.style.top = '';
    scroll.style.transition = '';
    show('screen-credits');
    const back = () => { $('screen-credits').removeEventListener('click', back); if (window.Main) window.Main.toTitle(); };
    $('screen-credits').addEventListener('click', back);
  };

  window.Screens = Screens;
})();
