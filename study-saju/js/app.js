/* 공부사주 - 화면 (Vanilla JS + LocalStorage)
 * 입력 → SajuEngine.calculate → SajuAnalysis.analyze → 탭별 렌더링, AI 상담은 SajuCounsel
 */
(function () {
  'use strict';

  const E = window.SajuEngine;
  const A = window.SajuAnalysis;
  const K = window.SajuKnowledge;
  const C = window.SajuCounsel;

  const STORAGE_KEY = 'study-saju-v1';
  const KEY_STORAGE = 'study-saju-api-key';
  const CHAT_PREFIX = 'study-saju-chat-';

  const CITIES = [
    ['서울', 126.98], ['인천', 126.70], ['경기 수원', 127.01], ['경기 고양·파주', 126.83], ['경기 성남·용인', 127.13],
    ['강원 춘천', 127.73], ['강원 강릉', 128.90], ['충북 청주', 127.49], ['충남 천안', 127.11], ['대전', 127.38], ['세종', 127.29],
    ['전북 전주', 127.15], ['광주', 126.85], ['전남 목포', 126.39], ['전남 여수·순천', 127.66], ['대구', 128.60],
    ['경북 포항', 129.37], ['경북 안동', 128.73], ['울산', 129.31], ['부산', 129.08], ['경남 창원', 128.68], ['경남 진주', 128.11], ['제주', 126.53],
    ['직접 입력(경도)', null],
  ];
  const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', 'N수생'];
  const POS = { hour: '시주', day: '일주', month: '월주', year: '연주' };

  // ---------- Storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.people)) return s;
      }
    } catch (e) { /* 손상된 데이터는 새로 시작 */ }
    return { people: [], activeId: null };
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { toast('저장 공간이 부족해 저장하지 못했어요'); }
  }
  function getKey() { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { return ''; } }
  function setKey(k) { try { if (k) localStorage.setItem(KEY_STORAGE, k); else localStorage.removeItem(KEY_STORAGE); } catch (e) { /* 무시 */ } }
  function loadChat(id) {
    try { const c = JSON.parse(localStorage.getItem(CHAT_PREFIX + id) || 'null'); if (c && Array.isArray(c.api)) return c; } catch (e) { /* 무시 */ }
    return { api: [], view: [] };
  }
  function saveChat(id, chat) {
    try { localStorage.setItem(CHAT_PREFIX + id, JSON.stringify(chat)); } catch (e) {
      // 검색 결과가 쌓여 용량이 넘치면 화면 기록만 남긴다
      try { localStorage.setItem(CHAT_PREFIX + id, JSON.stringify({ api: [], view: chat.view })); } catch (err) { /* 무시 */ }
    }
  }

  let state = load();
  let current = null; // { person, chart, analysis }
  let focusYear = new Date().getFullYear();
  let openMonth = null;
  let editingId = null;
  let chat = { api: [], view: [] };
  let asking = null; // AbortController
  // AI 상담 방식: claude.ai 안이면 'viewer'(키 필요 없음), 그 밖이면 'key'. 판단 전에는 'pending'
  let chatMode = window.claude ? 'pending' : 'key';

  // ---------- Helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function particle(word, withBatchim, without) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    if (code < 0 || code > 11171) return word + without;
    return word + (code % 28 ? withBatchim : without);
  }
  function statusIcon(tone) { return { good: '▲', normal: '●', care: '◆' }[tone]; }
  function status(p) { return `<span class="status ${p.tone}">${statusIcon(p.tone)} ${esc(p.label)}</span>`; }
  function elName(i) { return `${E.ELEMENTS[i]}(${E.ELEMENT_HANJA[i]})`; }
  function personTitle(p) { return p.name || (p.mode === 'parent' ? '우리 아이' : '나'); }

  // 학년 자동 추정: 3월 학기 기준, 만 6세가 되는 해의 다음 해 3월에 초1
  function guessGrade(birthYear) {
    const now = new Date();
    const schoolYear = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
    const n = schoolYear - birthYear - 6;
    if (n >= 1 && n <= 12) return GRADES[n - 1];
    if (n > 12) return 'N수생';
    return '초1';
  }

  // ---------- Form ----------
  const form = $('#birth-form');
  function fillSelect(sel, items, value) {
    sel.innerHTML = items.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
    if (value !== undefined) sel.value = String(value);
  }
  function setupForm() {
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear; y >= 1940; y--) years.push([y, `${y}년`]);
    fillSelect(form.year, years, thisYear - 15);
    fillSelect(form.month, Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1}월`]), 3);
    fillSelect(form.day, Array.from({ length: 31 }, (_, i) => [i + 1, `${i + 1}일`]), 1);
    fillSelect(form.city, CITIES.map(([n, lon], i) => [i, n]), 0);
    fillSelect(form.grade, GRADES.map((g) => [g, g]), guessGrade(thisYear - 15));
    $('#concern-chips').innerHTML = K.CONCERNS.map((c) => `<button type="button" class="chip" aria-pressed="false" data-concern="${esc(c)}">${esc(c)}</button>`).join('');

    form.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'calendar') $('#leap-wrap').hidden = form.calendar.value !== 'lunar';
      if (t.name === 'timeUnknown') form.time.disabled = t.checked;
      if (t.name === 'city') $('#lon-wrap').hidden = CITIES[Number(t.value)][1] !== null;
      if (t.name === 'year') form.grade.value = guessGrade(Number(t.value));
      if (t.name === 'mode') $('#name-label').textContent = form.mode.value === 'parent' ? '자녀 이름(별명)' : '이름(별명)';
    });
    $('#concern-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-concern]');
      if (!chip) return;
      const on = chip.getAttribute('aria-pressed') !== 'true';
      $$('#concern-chips .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', String(on));
    });
    form.addEventListener('submit', onSubmit);
  }

  function readForm() {
    const cityIdx = Number(form.city.value);
    const [cityName, cityLon] = CITIES[cityIdx];
    const [hh, mm] = (form.time.value || '12:00').split(':').map(Number);
    const concern = $('#concern-chips .chip[aria-pressed="true"]');
    return {
      mode: form.mode.value, name: form.name.value.trim(), gender: form.gender.value,
      calendar: form.calendar.value, leapMonth: form.calendar.value === 'lunar' && form.leap.checked,
      year: Number(form.year.value), month: Number(form.month.value), day: Number(form.day.value),
      hour: hh, minute: mm, timeUnknown: form.timeUnknown.checked,
      city: cityName, longitude: cityLon === null ? Number(form.longitude.value) : cityLon,
      grade: form.grade.value, concern: concern ? concern.dataset.concern : '', goal: form.goal.value.trim(),
      correction: form.correction.value, ziSect: Number(form.ziSect.value),
    };
  }
  function writeForm(p) {
    form.mode.value = p.mode; form.name.value = p.name || ''; form.gender.value = p.gender;
    form.calendar.value = p.calendar; form.leap.checked = !!p.leapMonth; $('#leap-wrap').hidden = p.calendar !== 'lunar';
    form.year.value = p.year; form.month.value = p.month; form.day.value = p.day;
    const z = (n) => String(n).padStart(2, '0');
    form.time.value = `${z(p.hour)}:${z(p.minute)}`; form.timeUnknown.checked = !!p.timeUnknown; form.time.disabled = !!p.timeUnknown;
    const ci = CITIES.findIndex(([n]) => n === p.city);
    form.city.value = ci >= 0 ? ci : CITIES.length - 1;
    $('#lon-wrap').hidden = ci >= 0 && CITIES[ci][1] !== null;
    form.longitude.value = p.longitude;
    form.grade.value = p.grade; form.goal.value = p.goal || '';
    $$('#concern-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.concern === p.concern)));
    form.correction.value = p.correction || 'mean'; form.ziSect.value = String(p.ziSect || 1);
    $('#name-label').textContent = p.mode === 'parent' ? '자녀 이름(별명)' : '이름(별명)';
  }

  function validate(p) {
    if (!Number.isFinite(p.longitude) || p.longitude < -180 || p.longitude > 180) return '경도를 올바르게 입력해 주세요.';
    if (p.calendar === 'solar') {
      const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
      if (d.getUTCMonth() !== p.month - 1) return `${p.month}월에는 ${p.day}일이 없어요.`;
      if (d > new Date()) return '아직 오지 않은 날짜예요.';
    } else {
      try { E.lunarToSolar(p.year, p.month, p.day, p.leapMonth); } catch (e) { return e.message; }
    }
    return null;
  }

  function onSubmit(e) {
    e.preventDefault();
    const data = readForm();
    const err = validate(data);
    const errEl = $('#form-error');
    if (err) { errEl.textContent = err; errEl.hidden = false; return; }
    errEl.hidden = true;
    if (editingId) {
      const i = state.people.findIndex((x) => x.id === editingId);
      state.people[i] = { ...state.people[i], ...data };
      // 출생 정보가 바뀌면 이전 상담 내용은 맞지 않으니 지운다
      try { localStorage.removeItem(CHAT_PREFIX + editingId); } catch (er) { /* 무시 */ }
      state.activeId = editingId;
    } else {
      const person = { id: uid(), createdAt: Date.now(), ...data };
      state.people.push(person);
      state.activeId = person.id;
    }
    editingId = null;
    save();
    focusYear = new Date().getFullYear();
    openMonth = null;
    showReport('summary');
  }

  // ---------- Screens ----------
  function showForm(person) {
    editingId = person ? person.id : null;
    $('#form-title').textContent = person ? '정보 수정' : '사주 정보 입력';
    $('#btn-cancel-form').hidden = state.people.length === 0;
    if (person) writeForm(person);
    else { form.reset(); setupDefaults(); }
    $('#form-panel').hidden = false;
    $('#report').hidden = true;
    renderPeople();
    window.scrollTo({ top: 0 });
  }
  function setupDefaults() {
    const y = new Date().getFullYear() - 15;
    form.year.value = y; form.month.value = 3; form.day.value = 1; form.city.value = 0;
    form.grade.value = guessGrade(y); form.time.disabled = false;
    $('#leap-wrap').hidden = true; $('#lon-wrap').hidden = true;
    $$('#concern-chips .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    $('#name-label').textContent = '이름(별명)';
  }

  function compute(person) {
    const chart = E.calculate(person);
    const analysis = A.analyze(chart, person, new Date(), focusYear);
    return { person, chart, analysis };
  }

  function showReport(tab) {
    const person = state.people.find((p) => p.id === state.activeId);
    if (!person) { showForm(null); return; }
    current = compute(person);
    chat = loadChat(person.id);
    $('#form-panel').hidden = true;
    $('#report').hidden = false;
    renderPeople();
    renderHead();
    renderSummary(); renderStyle(); renderFlow(); renderCareer(); renderChat();
    selectTab(tab || 'summary');
  }

  function selectTab(tab) {
    $$('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $$('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  }

  function renderPeople() {
    const wrap = $('#people');
    wrap.hidden = state.people.length === 0;
    $('#people-list').innerHTML = state.people.map((p) => `<button type="button" class="chip" role="tab" aria-selected="${p.id === state.activeId && $('#form-panel').hidden}" data-person="${esc(p.id)}">${esc(personTitle(p))}${p.mode === 'parent' ? ' (자녀)' : ''}</button>`).join('');
  }

  function renderHead() {
    const { person: p, chart } = current;
    $('#report-title').textContent = `${personTitle(p)}의 공부사주`;
    const cal = p.calendar === 'lunar' ? `음력${p.leapMonth ? '(윤)' : ''}` : '양력';
    const t = p.timeUnknown ? '시간 모름' : `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
    $('#report-sub').textContent = `${cal} ${p.year}.${p.month}.${p.day} ${t} · ${p.city} · ${p.grade} · ${chart.zodiac}띠`;
  }

  // ---------- 원국 ----------
  function charBox(name, hanja, el) { return `<div class="char el-${el}"><b>${esc(name)}</b><small>${esc(hanja)} · ${E.ELEMENTS[el]}</small></div>`; }
  function cautionText(y) {
    const list = [y.gi, y.gu].filter((v) => v !== null).map(elName);
    return list.length ? `, 조심할 기운은 ${list.join('·')}이에요` : '이에요';
  }
  function renderSummary() {
    const { chart, analysis: a } = current;
    const order = ['hour', 'day', 'month', 'year'];
    const cols = order.map((k) => {
      const p = chart.pillars[k];
      if (!p) return `<div class="pillar"><span class="pos">${POS[k]}</span><div class="char empty"><b>?</b></div><div class="char empty"><b>?</b></div><span class="god">시간 모름</span></div>`;
      return `<div class="pillar${k === 'day' ? ' is-day' : ''}">
        <span class="pos">${POS[k]}</span>
        <span class="god">${esc(p.ganTenGod)}</span>
        ${charBox(p.gan, p.hanja[0], p.ganElement)}
        ${charBox(p.zhi, p.hanja[1], p.zhiElement)}
        <span class="god">${esc(p.zhiTenGod)}</span>
        <span class="hidden-stems" title="지장간">${p.hidden.map((h) => esc(h.gan)).join('·')}</span>
        <span class="stage">${esc(p.stage)}</span>
      </div>`;
    }).join('');

    const bars = a.elements.percent.map((v, i) => `<div class="bar-row${i === a.yongsin.yong ? ' is-yong' : ''}">
        <span class="name">${elName(i)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(v, 1)}%;background:var(--el-${i})"></span></span>
        <span class="val">${v}%</span></div>`).join('');
    const groupRows = E.GROUPS.map((g) => `<div class="bar-row"><span class="name">${g}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(a.groups[g], 1)}%;background:var(--accent)"></span></span>
        <span class="val">${a.groups[g]}%</span></div>`).join('');

    const t = chart.time;
    const corr = t.timeUnknown ? '출생 시간을 몰라 시주 없이 계산했어요.'
      : `입력 ${esc(t.wallClock)} → 보정 ${esc(t.solarTime)} (${t.correctionMinutes > 0 ? '+' : ''}${t.correctionMinutes}분${t.dst ? ', 서머타임 반영' : ''}${t.standardOffsetMinutes === 510 ? ', 당시 표준시 UTC+8:30' : ''})`;

    $('[data-panel="summary"]').innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>사주 원국</h3><span class="muted">일간: ${esc(chart.dayMaster.gan)}${esc(chart.dayMaster.hanja)} ${elName(chart.dayMaster.element)}</span></div>
        <div class="pillars">${cols}</div>
        <p class="hint">위: 천간 / 아래: 지지. 작은 글씨는 십신, 지장간, 12운성(일간 기준)이에요.</p>
        <p class="hint">${corr}</p>
      </section>
      <section class="panel">
        <h3>한눈에 보기</h3>
        <div class="facts">
          <div class="fact"><span class="k">기운의 세기</span><span class="v">${esc(a.strength.label)}</span></div>
          <div class="fact"><span class="k">용신(필요한 기운)</span><span class="v">${elName(a.yongsin.yong)}</span></div>
          <div class="fact"><span class="k">공부 유형</span><span class="v">${esc(a.style.title)}</span></div>
        </div>
        <p>${esc(a.strength.desc)}</p>
        ${a.strength.tags.length ? `<div class="tags">${a.strength.tags.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : ''}
        <p class="note">${esc(a.yongsin.reason)} 도움이 되는 기운은 <b>${elName(a.yongsin.yong)}</b>·${elName(a.yongsin.hee)}${cautionText(a.yongsin)}.${a.yongsin.johu ? ' ' + esc(a.yongsin.johu.note) : ''}</p>
      </section>
      <section class="panel">
        <h3>오행 분포</h3>
        <div class="bars" role="list">${bars}</div>
        ${a.elements.notes.map((n) => `<p class="note">${esc(n.text)}</p>`).join('')}
      </section>
      <section class="panel">
        <h3>십신 분포</h3>
        <p class="muted">비겁(나·경쟁) · 식상(표현) · 재성(성과) · 관성(규율) · 인성(배움)</p>
        <div class="bars" role="list">${groupRows}</div>
        ${a.natal.map((n) => `<p class="note">${esc(n)}</p>`).join('')}
      </section>`;
  }

  // ---------- 공부 스타일 ----------
  function renderStyle() {
    const { person, analysis: a } = current;
    const s = a.style;
    const parent = person.mode === 'parent';
    const levelName = { elem: '초등', mid: '중등', high: '고등' }[a.profile.level];
    $('[data-panel="style"]').innerHTML = `
      <section class="panel hero">
        <p class="kicker">${parent ? '우리 아이의' : '나의'} 공부 유형</p>
        <p class="type">${esc(s.title)}</p>
        <p>${esc(s.summary)}</p>
        ${s.combo ? `<p class="note">${esc(s.combo)}</p>` : ''}
        <div class="tags"><span class="tag tag-accent">주 기운 ${esc(s.primary)}</span><span class="tag">보조 ${esc(s.secondary)}</span><span class="tag">약한 기운 ${esc(s.weakest)}</span></div>
      </section>
      <section class="panel">
        <div class="two-col">
          <div class="box"><h4>강점</h4><ul>${s.strengths.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div class="box"><h4>빠지기 쉬운 함정</h4><ul>${s.pitfalls.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>
      </section>
      <section class="panel">
        <h3>${levelName} 맞춤 공부법</h3>
        <ol>${s.methods.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        <p><b>잘 맞는 환경</b> · ${esc(s.environment)}</p>
        <p class="note">${esc(s.weakNote)}</p>
      </section>
      <section class="panel">
        <h3>타고난 기질 · ${esc(s.dayMaster.gan)}${esc(E.ELEMENT_HANJA[current.chart.dayMaster.element])} 일간</h3>
        <p><b>${esc(s.dayMaster.image)}</b> 같은 사람이에요. ${esc(s.dayMaster.trait)}</p>
        <p class="note">${esc(s.dayMaster.tip)}</p>
      </section>
      ${parent ? `<section class="panel">
        <h3>부모님을 위한 대화법</h3>
        <p>${esc(a.parent.strength)}</p>
        <div class="two-col">
          <div class="box"><h4>이렇게 말해 주세요</h4><p>${esc(a.parent.talk)}</p></div>
          <div class="box"><h4>이건 피해 주세요</h4><p>${esc(a.parent.avoid)}</p></div>
        </div>
      </section>` : ''}`;
  }

  // ---------- 공부 흐름 ----------
  function monthCard(m, i) {
    return `<button type="button" class="month ${m.tone}" data-month="${i}" aria-expanded="${openMonth === i}">
      <span class="m">${m.solarMonth}월 ${status(m)}</span>
      <span class="gz">${esc(m.gan)}${esc(m.zhi)}월 · ${esc(m.jieName)} ${m.start.m}/${m.start.d}부터</span>
      <span class="k">${esc(m.keys.join(' · '))}</span>
      ${m.event ? `<span class="ev">${esc(m.event)}</span>` : ''}
    </button>`;
  }
  function renderFlow() {
    const { analysis: a } = current;
    const thisYear = new Date().getFullYear();
    const cur = a.currentDaYun;
    const dayun = a.daYun.map((d) => `<div class="du${cur && d.startYear === cur.startYear ? ' now' : ''}">
        <span class="age">${d.startAge}세~</span><span class="g">${esc(d.gan)}${esc(d.zhi)}</span><span class="age">${d.startYear}</span>
        <span class="status ${d.tone}" title="${esc(d.label)}">${statusIcon(d.tone)}</span></div>`).join('');

    const years = a.years.map((y) => `<div class="year-card">
        <div class="top"><h4>${y.year}년 ${esc(y.gan)}${esc(y.zhi)}년</h4>${status(y)}</div>
        <div class="tags">${y.keys.map((k) => `<span class="tag tag-accent">${esc(k)}</span>`).join('')}</div>
        <p>${esc(y.text)}</p>
        ${y.notes.map((n) => `<p class="hint">· ${esc(n)}</p>`).join('')}
      </div>`).join('');

    const months = a.months.map(monthCard).join('');
    const om = openMonth !== null ? a.months[openMonth] : null;
    const detail = om ? `<div class="month-detail">
        <h4>${om.solarYear}년 ${om.solarMonth}월 (${esc(om.gan)}${esc(om.zhi)}월, ${esc(om.jieName)} ${om.start.m}/${om.start.d} ${String(om.start.h).padStart(2, '0')}:${String(om.start.mi).padStart(2, '0')}부터)</h4>
        <p>${esc(om.text)}</p>
        ${om.notes.map((n) => `<p class="hint">· ${esc(n)}</p>`).join('')}
        ${om.event ? `<p><b>학사 일정</b> · ${esc(om.event)}</p>` : ''}
      </div>` : '<p class="hint">달을 누르면 자세한 풀이가 나와요.</p>';

    const exams = a.examTips.length ? `<section class="panel">
        <h3>${a.focusYear}년 시험 전략</h3>
        ${a.examTips.map((t) => `<div class="year-card"><div class="top"><h4>${t.month}월 · ${esc(t.event)}</h4>${status({ tone: t.level === '집중' ? 'good' : t.level === '관리' ? 'care' : 'normal', label: t.level === '집중' ? '흐름 좋음' : t.level === '관리' ? '관리 필요' : '보통' })}</div><p>${esc(t.tip)}</p></div>`).join('')}
        <p class="hint">시험 날짜는 학교·교육청 공지를 따르세요. 월운은 절기(매달 4~8일경) 기준으로 바뀌어요.</p>
      </section>` : '';

    $('[data-panel="flow"]').innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>대운 · 10년의 큰 흐름</h3><span class="muted">${a.daYun[0] ? `${a.daYun[0].startAge}세부터 10년마다 바뀌어요` : ''}</span></div>
        <div class="dayun">${dayun}</div>
        ${cur ? `<div class="year-card"><div class="top"><h4>지금 대운 ${esc(cur.gan)}${esc(cur.zhi)} (${cur.startYear}~${cur.endYear})</h4>${status(cur)}</div><p>${esc(cur.text)}</p></div>` : '<p class="muted">아직 첫 대운이 시작되기 전이에요. 타고난 원국의 기질이 그대로 드러나는 시기예요.</p>'}
        ${a.nextDaYun && a.nextDaYun.startYear - thisYear <= 3 ? `<p class="note">${a.nextDaYun.startYear}년부터 ${esc(a.nextDaYun.gan)}${esc(a.nextDaYun.zhi)} 대운으로 바뀌어요(${esc(a.nextDaYun.keys.join('·'))}). 대운이 바뀌는 해 앞뒤로는 마음과 환경이 흔들리기 쉬우니 루틴을 단단히 지켜 주세요.</p>` : ''}
      </section>
      <section class="panel">
        <h3>올해와 앞으로 2년</h3>
        <div class="years">${years}</div>
      </section>
      <section class="panel">
        <div class="year-nav">
          <button type="button" class="btn-icon" data-action="prev-year" aria-label="이전 해">‹</button>
          <h3>${a.focusYear}년 월별 공부 흐름</h3>
          <button type="button" class="btn-icon" data-action="next-year" aria-label="다음 해">›</button>
        </div>
        <div class="legend">${status({ tone: 'good', label: '공부 집중기' })}${status({ tone: 'normal', label: '꾸준히 유지' })}${status({ tone: 'care', label: '컨디션 관리기' })}</div>
        <div class="months">${months}</div>
        ${detail}
      </section>
      ${exams}`;
  }

  // ---------- 진로 ----------
  function renderCareer() {
    const { person, analysis: a } = current;
    const c = a.career;
    $('[data-panel="career"]').innerHTML = `
      <section class="panel">
        <h3>잘 맞는 계열</h3>
        ${c.fields.map((f, i) => `<div class="field-card"><span class="rank">${i + 1}순위</span><h4>${esc(f.name)}</h4>
          <div class="tags">${f.majors.map((m) => `<span class="tag">${esc(m)}</span>`).join('')}</div></div>`).join('')}
        <p class="hint">${esc(a.style.primary)}·${esc(a.style.secondary)} 기운과 ${elName(a.yongsin.yong)} 용신을 함께 보고 골랐어요.</p>
      </section>
      <section class="panel">
        <h3>추천 직업</h3>
        <div class="jobs">${c.jobs.map((j) => `<div class="job"><span class="n">${esc(j.name)} ${j.future ? '<span class="tag tag-future">미래 유망</span>' : ''}</span><span class="pct">${j.match}%</span><span class="w">${esc(j.why)}</span></div>`).join('')}</div>
        <p class="hint">%는 이 사주와 직업 성향이 얼마나 비슷한지를 나타내요(32개 직업 중 상대 비교). '미래 유망'은 사주가 아닌 산업 변화 기준이에요.</p>
      </section>
      <section class="panel">
        <h3>${person.mode === 'parent' ? '아이와 해 볼' : '지금 해 볼'} 진로 탐색</h3>
        <ul>${c.activities.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="note">최신 입시 제도나 직업 전망이 궁금하면 <b>AI 상담</b>에서 물어보세요. 검색해서 지금 기준으로 알려 드려요.</p>
      </section>`;
  }

  // ---------- AI 상담 ----------
  function md(text) {
    // 간단한 마크다운: 굵게, 제목, 목록, 문단 (HTML은 모두 이스케이프)
    const lines = esc(text).split('\n');
    let html = '';
    let list = null;
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if ((m = /^#{1,4}\s+(.*)/.exec(line))) { close(); html += `<h4>${inline(m[1])}</h4>`; }
      else if ((m = /^\s*[-*•]\s+(.*)/.exec(line))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(line))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
      else if (!line.trim()) { close(); }
      else { close(); html += `<p>${inline(line)}</p>`; }
    }
    close();
    return html;
  }
  function msgHtml(v) {
    if (v.role === 'user') return `<div class="msg user">${esc(v.text)}</div>`;
    if (v.role === 'error') return `<div class="msg ai error">${esc(v.text)}</div>`;
    const src = v.sources && v.sources.length ? `<div class="sources"><b>참고한 자료</b>${v.sources.slice(0, 5).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('')}</div>` : '';
    return `<div class="msg ai">${md(v.text)}${src}</div>`;
  }
  function suggestions() {
    const { person, analysis: a } = current;
    const parent = person.mode === 'parent';
    const now = new Date();
    const list = parent ? [
      '아이에게 어떤 말을 해야 공부 의욕이 생길까요?',
      `${now.getMonth() + 1}월과 다음 달, 아이 공부를 어떻게 도와주면 좋을까요?`,
      '우리 아이에게 맞는 학원·공부 환경은 어떤 곳일까요?',
      '아이 진로, 요즘 직업 변화까지 생각하면 어떤 방향이 좋을까요?',
    ] : [
      `이번 달(${now.getMonth() + 1}월) 공부, 어떻게 하면 좋을까요?`,
      '다음 시험 준비 전략을 짜 주세요.',
      '나한테 맞는 하루 공부 루틴을 만들어 주세요.',
      '나랑 맞는 진로를 요즘 유망 직업과 연결해서 알려 주세요.',
    ];
    const byConcern = {
      집중력: '집중이 너무 안 돼요. 제 사주에 맞는 집중법이 있을까요?',
      '성적이 안 오름': '열심히 하는데 성적이 안 올라요. 뭐가 문제일까요?',
      '시험 불안': '시험만 보면 긴장해서 실수해요. 어떻게 극복하죠?',
      '공부 습관': '공부 습관을 잡고 싶어요. 어디서부터 시작할까요?',
      '진로·전공 선택': '문과·이과(선택과목)와 전공을 어떻게 정하면 좋을까요?',
      '공부 의욕': '공부하기가 너무 싫어요. 의욕을 되찾는 방법이 있을까요?',
      '친구·부모님 관계': '친구·가족 관계 때문에 공부가 흔들려요. 어떻게 하면 좋을까요?',
      '휴대폰·게임': '휴대폰·게임을 줄이고 싶은데 잘 안 돼요.',
    };
    if (person.concern && byConcern[person.concern]) list.unshift(parent ? `아이 고민(${person.concern}), 부모로서 어떻게 도와야 할까요?` : byConcern[person.concern]);
    if (a.examTips[0]) list.push(`${a.examTips[0].month}월 ${a.examTips[0].event} 준비는 언제부터 어떻게 할까요?`);
    return list.slice(0, 5);
  }
  function renderChat() {
    const inViewer = chatMode === 'viewer' || chatMode === 'pending';
    const ready = inViewer || (chatMode === 'key' && !!getKey());
    $('#key-card').hidden = chatMode !== 'key' || ready;
    $('#chat-off').hidden = chatMode !== 'off';
    $('#chat-box').hidden = !ready;
    $('#chat-note').textContent = inViewer
      ? '사주 계산 결과와 학년·고민을 함께 보고 답해요. 질문할 때 내 Claude 계정의 사용량이 쓰여요.'
      : '사주 계산 결과와 학년·고민을 함께 보고 답해요. 필요하면 최신 입시·직업 정보를 검색해요.';
    if (!ready) return;
    const log = $('#chat-log');
    log.innerHTML = chat.view.length ? chat.view.map(msgHtml).join('')
      : `<div class="panel chat-empty"><p><b>무엇이든 물어보세요</b></p><p class="muted">사주 결과와 ${esc(current.person.grade)}, ${esc(current.person.concern || '고민')}을 함께 보고 상담해 드려요.</p></div>`;
    $('#suggest-chips').innerHTML = suggestions().map((q) => `<button type="button" class="chip" data-suggest="${esc(q)}">${esc(q)}</button>`).join('');
    $('#suggest-chips').hidden = chat.view.length > 0;
  }

  async function sendQuestion(q) {
    if (!q || asking) return;
    const person = current.person;
    const summary = A.summaryForAI(current.chart, current.analysis);
    const turns = chat.view.filter((v) => v.role !== 'error').map((v) => ({ role: v.role === 'ai' ? 'assistant' : 'user', content: v.text }));
    chat.view.push({ role: 'user', text: q });
    renderChat();
    const log = $('#chat-log');
    const bubble = document.createElement('div');
    bubble.className = 'msg ai typing';
    bubble.textContent = '사주와 상황을 살펴보는 중…';
    log.appendChild(bubble);
    bubble.scrollIntoView({ block: 'end', behavior: 'smooth' });
    const btn = $('#btn-send');
    btn.textContent = '멈추기';
    asking = new AbortController();
    try {
      const res = await C.ask({
        apiKey: getKey(), summary, question: q, history: chat.api, turns, signal: asking.signal,
        profile: { mode: person.mode, name: person.name, grade: person.grade, concern: person.concern, goal: person.goal },
        onText: (t) => { bubble.innerHTML = md(t); },
      });
      if (res.messages) chat.api = res.messages;
      chat.view.push({ role: 'ai', text: res.text, sources: res.sources });
    } catch (err) {
      chat.view.push({ role: 'error', text: await C.errorMessage(err) });
    } finally {
      asking = null;
      btn.textContent = '보내기';
      if (current.person.id === person.id) {
        saveChat(person.id, { api: chat.api, view: chat.view.filter((v) => v.role !== 'error') });
        renderChat();
        const last = $('#chat-log').lastElementChild;
        if (last) last.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }
  }

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-tab],[data-person],[data-month],[data-suggest]');
    if (!t) return;
    if (t.dataset.tab) { selectTab(t.dataset.tab); return; }
    if (t.dataset.person) { if (asking) asking.abort(); state.activeId = t.dataset.person; save(); focusYear = new Date().getFullYear(); openMonth = null; showReport('summary'); return; }
    if (t.dataset.month !== undefined) { const i = Number(t.dataset.month); openMonth = openMonth === i ? null : i; renderFlow(); return; }
    if (t.dataset.suggest) { sendQuestion(t.dataset.suggest); return; }
    switch (t.dataset.action) {
      case 'new-person': showForm(null); break;
      case 'edit-person': showForm(current.person); break;
      case 'cancel-form': editingId = null; showReport('summary'); break;
      case 'prev-year': case 'next-year':
        focusYear += t.dataset.action === 'prev-year' ? -1 : 1;
        openMonth = null;
        current.analysis = A.analyze(current.chart, current.person, new Date(), focusYear);
        renderFlow();
        break;
      case 'clear-chat':
        if (asking) asking.abort();
        chat = { api: [], view: [] };
        try { localStorage.removeItem(CHAT_PREFIX + current.person.id); } catch (err) { /* 무시 */ }
        renderChat();
        break;
      case 'open-settings': openSettings(); break;
      case 'change-key': $('#settings-dialog').close(); setKey(''); if (current) { showReport('chat'); } toast('새 API 키를 입력해 주세요'); break;
      case 'delete-key': setKey(''); openSettings(); if (current) renderChat(); toast('API 키를 삭제했어요'); break;
      case 'export': exportData(); break;
      case 'delete-person': deletePerson(); break;
      default: break;
    }
  });

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (asking) { asking.abort(); return; }
    const q = e.target.q.value.trim();
    if (!q) return;
    e.target.q.value = '';
    sendQuestion(q);
  });
  $('#chat-form').q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chat-form').requestSubmit(); }
  });
  $('#key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const k = e.target.key.value.trim();
    if (!/^sk-ant-/.test(k)) { toast('Anthropic API 키는 sk-ant- 로 시작해요'); return; }
    setKey(k);
    e.target.key.value = '';
    renderChat();
    toast('API 키를 저장했어요');
    C.loadSdk().catch(() => { /* 질문할 때 다시 시도 */ });
  });

  function openSettings() {
    const k = getKey();
    $('#key-status').textContent = k ? `저장됨 (${k.slice(0, 10)}…${k.slice(-4)})` : '저장된 키가 없어요.';
    $('#key-field').hidden = chatMode !== 'key';
    $('[data-action="delete-person"]').hidden = !current || $('#report').hidden;
    disarmDelete();
    $('#settings-dialog').showModal();
  }
  async function exportData() {
    const json = JSON.stringify({ app: 'study-saju', version: 1, people: state.people }, null, 2);
    const filename = `공부사주-백업-${new Date().toISOString().slice(0, 10)}.json`;
    // claude.ai 안에서는 페이지가 직접 내려받을 수 없어 파일 저장 기능으로 넘긴다
    const downloads = window.claude ? await window.claude.use('downloads') : null;
    if (window.claude) {
      if (!downloads) { toast('이 화면에서는 백업 파일을 받을 수 없어요'); return; }
      try {
        await downloads.save({ filename, data: json });
        toast('백업 파일을 저장했어요');
      } catch (err) {
        if (err && err.code !== 'declined') toast('백업 파일을 저장하지 못했어요');
      }
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.people)) throw new Error('형식');
      let added = 0;
      for (const p of data.people) {
        if (!p || !p.id || state.people.some((x) => x.id === p.id) || validate(p)) continue;
        state.people.push(p); added++;
      }
      if (!state.activeId && state.people[0]) state.activeId = state.people[0].id;
      save();
      $('#settings-dialog').close();
      toast(`${added}명을 불러왔어요`);
      if (state.activeId) showReport('summary');
    } catch (err) {
      toast('백업 파일을 읽지 못했어요');
    }
  });
  // 확인 창(confirm)을 쓸 수 없는 화면도 있어서, 버튼을 한 번 더 누르면 삭제한다
  let deleteTimer = null;
  function disarmDelete() {
    const btn = $('[data-action="delete-person"]');
    clearTimeout(deleteTimer);
    btn.dataset.armed = '';
    btn.textContent = '지금 사람 삭제';
  }
  function deletePerson() {
    if (!current) return;
    const btn = $('[data-action="delete-person"]');
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = `한 번 더 누르면 ${particle(personTitle(current.person), '이', '가')} 삭제돼요`;
      deleteTimer = setTimeout(disarmDelete, 4000);
      return;
    }
    disarmDelete();
    const id = current.person.id;
    state.people = state.people.filter((p) => p.id !== id);
    try { localStorage.removeItem(CHAT_PREFIX + id); } catch (err) { /* 무시 */ }
    state.activeId = state.people[0] ? state.people[0].id : null;
    save();
    $('#settings-dialog').close();
    current = null;
    if (state.activeId) showReport('summary'); else showForm(null);
    toast('삭제했어요');
  }

  // ---------- PWA ----------
  function setupInstall() {
    if (window.claude) return; // claude.ai 안에서는 앱 설치·오프라인 캐시를 쓰지 않는다
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 설치 기능 없이도 앱은 동작 */ });
    }
    let installPrompt = null;
    const btn = $('#btn-install');
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; btn.hidden = false; });
    btn.addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      btn.hidden = true;
      if (outcome === 'accepted') toast('홈 화면에 공부사주를 설치했어요');
    });
    window.addEventListener('appinstalled', () => { btn.hidden = true; });
  }

  setupForm();
  setupInstall();
  C.mode().then((m) => { chatMode = m; if (current) renderChat(); });
  if (state.activeId && state.people.some((p) => p.id === state.activeId)) showReport('summary');
  else if (state.people[0]) { state.activeId = state.people[0].id; showReport('summary'); }
  else showForm(null);
})();
