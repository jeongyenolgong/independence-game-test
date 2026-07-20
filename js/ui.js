/* 화면 보조 동작 — 첫 화면 암구호 검사 + 이름 퀴즈 가로 배치 판정.
 *
 * 왜 별도 파일인가: engine.js·main.js는 다른 작업 창이 동시에 고치고 있다.
 * 이 두 가지는 화면(index.html·style.css) 쪽 일이라 여기 따로 두면 서로 안 부딪힌다.
 * 나중에 한 창으로 합칠 때 engine.js·main.js로 흡수해도 된다.
 */
(function () {
  'use strict';

  /* ── ① 첫 화면 암구호 ─────────────────────────────────────────────
     main.js가 #btn-start에 걸어둔 시작 핸들러는 건드리지 않는다. 대신 문서 단계에서
     클릭을 먼저 받아(capture), 암구호가 틀렸을 때만 그 클릭이 버튼까지 못 가게 막는다.
     맞으면 그냥 흘려보내므로 기존 시작 흐름이 그대로 돈다. */
  var PASSWORD = '하이러닝';

  function normalize(s) {
    return String(s || '').replace(/\s+/g, '').toLowerCase();
  }

  function gateOk() {
    var input = document.getElementById('gate-code');
    if (!input) return true;                       // 입력칸이 없으면 막지 않는다
    return normalize(input.value) === normalize(PASSWORD);
  }

  function reject() {
    var input = document.getElementById('gate-code');
    if (!input) return;
    input.classList.remove('is-wrong');
    void input.offsetWidth;                        // 연속으로 틀려도 매번 흔들리게 재시작
    input.classList.add('is-wrong');
    input.focus();
    input.select();
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('#btn-start');
    if (!btn) return;
    if (gateOk()) return;                          // 통과 — main.js 핸들러로 넘어간다
    e.preventDefault();
    e.stopPropagation();
    reject();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (!e.target || e.target.id !== 'gate-code') return;
    e.preventDefault();
    var btn = document.getElementById('btn-start');
    if (btn) btn.click();
  });

  /* ── ② 이름 퀴즈만 가로 4칸 ────────────────────────────────────────
     이름 퀴즈와 중등 4지선다가 같은 패널·같은 버튼 클래스를 돌려 쓴다. 둘 다 선택지가
     4개라 개수로는 못 가른다. 가르는 건 길이다 — 인물 이름은 최장 4자(김마리아),
     중등 보기는 최단 15자를 넘는다. 8자를 경계로 두면 안전하다.
     ※engine.js에서 이름 퀴즈에 전용 클래스를 붙여주면 이 관찰자는 지워도 된다. */
  var NAME_MAX = 8;

  function markNameQuiz() {
    var wrap = document.getElementById('quiz-options');
    if (!wrap) return;
    var opts = wrap.querySelectorAll('.quiz-opt');
    var isNames = opts.length === 4;
    for (var i = 0; isNames && i < opts.length; i++) {
      if (opts[i].textContent.trim().length > NAME_MAX) isNames = false;
    }
    wrap.classList.toggle('is-names', isNames);
  }

  function watchQuiz() {
    var wrap = document.getElementById('quiz-options');
    if (!wrap) return;
    new MutationObserver(markNameQuiz).observe(wrap, { childList: true });
    markNameQuiz();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchQuiz);
  } else {
    watchQuiz();
  }
})();
