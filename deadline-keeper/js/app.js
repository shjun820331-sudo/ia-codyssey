/**
 * 기한지킴이 (Deadline Keeper) - 메인 앱
 * Vanilla JS + LocalStorage. 외부 의존성: Tailwind CDN, Tesseract.js(OCR 버튼을 누를 때만 로드)
 */
(function () {
  'use strict';

  // ============================================================
  // 1. 상수 & 기본 카테고리
  // ============================================================
  const KEYS = {
    items: 'dk.items',
    archive: 'dk.archive',
    categories: 'dk.customCategories',
    seeded: 'dk.seeded',
    notified: 'dk.notifiedOn',
  };
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const CUSTOM_SUB = '__custom__';

  const BUILTIN_CATEGORIES = [
    {
      id: 'food', emoji: '🍔', name: '식품/뷰티', color: '#DD6B20',
      desc: '먹고 바르는 것들의 유통·소비기한부터 기프티콘·상품권까지',
      subs: ['유통기한/소비기한', '신선식품', '유제품', '건강기능식품', '가정용 상비약', '화장품 및 미용용품', '위생용품', '모바일 쿠폰/기프티콘', '외식 상품권/할인권', '기타 식품/뷰티'],
    },
    {
      id: 'finance', emoji: '💳', name: '금융/구독', color: '#3182CE',
      desc: '카드·적금·세금·구독료처럼 돈이 오가는 날짜',
      subs: ['신용/체크카드 유효기간', '카드사 포인트/마일리지 소멸예정', '적금/청약 만기 및 납입일', '대출 이자 및 원금 납부일', '각종 세금', '공과금 및 통신비', 'OTT 구독', '소프트웨어/클라우드 구독', '정기 멤버십', '보험 계약 갱신일'],
    },
    {
      id: 'car', emoji: '🚗', name: '차량/생활', color: '#38A169',
      desc: '자동차·집·건강처럼 놓치면 과태료나 불편이 생기는 생활 점검',
      subs: ['자동차 정기/종합검사', '자동차 소모품 교체', '주택용 소화기 유효기간', '정수기/가전 필터 교체', '국가 건강검진 마감', '독감 및 필수 예방접종', '운전면허 적성검사/갱신', '여권 만료일', '전·월세 계약 만료일', '집안 가전/렌탈 약정 만료'],
    },
    {
      id: 'growth', emoji: '📈', name: '성장·스펙', color: '#805AD5',
      desc: '자격증·시험·공모전 등 나를 키우는 일정',
      subs: ['어학 성적 만료일', '자격증 및 면허 갱신일', '각종 시험 일정', '수강권 및 인강 만료일', '도서관 대출 반납 및 예약 일정', '공모전 및 해커톤 접수 마감일', '입학 및 입사 지원 마감 일정', '과제 및 프로젝트 마감 일정', '이력서 및 포트폴리오 갱신일', '독서모임 도서 완독일'],
    },
    {
      id: 'meeting', emoji: '👥', name: '모임/회비', color: '#D53F8C',
      desc: '회비·경조사·예약금 등 사람과의 약속',
      subs: ['동호회 월 정기회비 납부일', '가족 모임 회비/일정', '친목 계모임 날짜', '동창회 정기 회비', '스터디룸/연습실 예약 일정', '운동/피트니스 정기권 갱신', '경조사 일정 및 축의금', '여행/펜션 예약금 입금일', '동아리 회의 및 정기 모임', '연말 파티/행사 예약 마감'],
    },
  ];

  const COLOR_CHOICES = ['#3182CE', '#E53E3E', '#DD6B20', '#D69E2E', '#38A169', '#319795', '#805AD5', '#D53F8C', '#4A5568'];
  const EMOJI_CHOICES = ['⭐', '🐶', '🏠', '🎮', '✈️', '🎓', '💊', '🧾', '🎁', '🌱', '👶', '🏋️'];

  const REPEAT_LABEL = { none: '한 번만', weekly: '매주', monthly: '매월', yearly: '매년' };
  const REMIND_LABEL = { 0: '당일', 1: 'D-1', 3: 'D-3', 7: 'D-7' };

  const TABS = [
    { id: 'timeline', label: '⏱️ 임박순 타임라인' },
    { id: 'folder', label: '🗂️ 카테고리별 폴더' },
    { id: 'calendar', label: '📅 캘린더 뷰' },
    { id: 'archive', label: '🏆 완료 아카이브' },
  ];

  // ============================================================
  // 2. 유틸
  // ============================================================
  const $ = (sel, el = document) => el.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => fmt(new Date());
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmt(d); };
  const ddayOf = (s) => Math.round((parseDate(s) - parseDate(todayStr())) / 86400000);
  const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const prettyDate = (s) => { const d = parseDate(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`; };
  const dotDate = (s) => s.replaceAll('-', '.');

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** 월 단위 이동 (31일 → 다음 달 말일로 보정, anchorDay로 원래 일자 복원) */
  function addMonths(s, n, anchorDay) {
    const d = parseDate(s);
    const day = anchorDay || d.getDate();
    const y = d.getFullYear();
    const m = d.getMonth() + n;
    const last = new Date(y, m + 1, 0).getDate();
    return fmt(new Date(y, m, Math.min(day, last)));
  }

  function nextDue(item, from) {
    const base = from || item.dueDate;
    if (item.repeat === 'weekly') return addDays(base, 7);
    if (item.repeat === 'monthly') return addMonths(base, 1, item.anchorDay);
    if (item.repeat === 'yearly') return addMonths(base, 12, item.anchorDay);
    return base;
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { toast('저장 공간이 부족해 저장하지 못했어요.'); }
  }

  // ============================================================
  // 3. 상태
  // ============================================================
  const state = {
    items: load(KEYS.items, []),
    archive: load(KEYS.archive, []),
    customCategories: load(KEYS.categories, []),
    tab: sessionStorage.getItem('dk.tab') || 'timeline',
    calCursor: todayStr().slice(0, 7), // YYYY-MM
    calSelected: todayStr(),
    alertDismissed: false,
    today: todayStr(),
  };

  const categories = () => [...BUILTIN_CATEGORIES, ...state.customCategories];
  const getCat = (id) => categories().find((c) => c.id === id) || { id, emoji: '📁', name: '미분류', color: '#718096', desc: '', subs: [] };

  function persist() {
    save(KEYS.items, state.items);
    save(KEYS.archive, state.archive);
    save(KEYS.categories, state.customCategories);
  }

  let undoSnapshot = null;
  function snapshot() {
    undoSnapshot = JSON.stringify({ items: state.items, archive: state.archive });
  }
  function undo() {
    if (!undoSnapshot) return;
    const s = JSON.parse(undoSnapshot);
    state.items = s.items;
    state.archive = s.archive;
    undoSnapshot = null;
    persist();
    render();
    toast('되돌렸어요.');
  }

  // ============================================================
  // 4. 샘플 데이터 (첫 방문 시 1회)
  // ============================================================
  function seedIfFirstVisit() {
    if (localStorage.getItem(KEYS.seeded) || state.items.length || state.archive.length) return;
    const t = todayStr();
    const mk = (title, categoryId, sub, offset, amount, repeat = 'none', remind = 1, memo = '') => {
      const dueDate = addDays(t, offset);
      return { id: uid(), title, categoryId, sub, dueDate, amount, repeat, remind, memo, anchorDay: parseDate(dueDate).getDate(), doneCount: 0, createdAt: Date.now() };
    };
    state.items = [
      mk('스타벅스 아메리카노 T', 'food', '모바일 쿠폰/기프티콘', 0, 4500, 'none', 3, '카카오톡 선물함'),
      mk('도서관 책 반납 - 클린 코드', 'growth', '도서관 대출 반납 및 예약 일정', -1, 0, 'none', 1),
      mk('서울우유 1L', 'food', '유제품', 1, 2980, 'none', 0),
      mk('넷플릭스 스탠다드', 'finance', 'OTT 구독', 3, 13500, 'monthly', 1),
      mk('정보처리기사 필기 원서접수', 'growth', '각종 시험 일정', 6, 19400, 'none', 3),
      mk('휴대폰 요금', 'finance', '공과금 및 통신비', 12, 55000, 'monthly', 3),
      mk('러닝크루 월 회비', 'meeting', '동호회 월 정기회비 납부일', 18, 20000, 'monthly', 1),
      mk('자동차 정기검사', 'car', '자동차 정기/종합검사', 27, 0, 'none', 7),
      mk('정수기 필터 교체', 'car', '정수기/가전 필터 교체', 45, 0, 'none', 7),
    ];
    state.archive = [
      { ...mk('메가커피 아이스티 기프티콘', 'food', '모바일 쿠폰/기프티콘', -3, 2500), completedAt: addDays(t, -4) },
    ];
    localStorage.setItem(KEYS.seeded, '1');
    persist();
  }

  // ============================================================
  // 5. 계산 로직
  // ============================================================
  const sortByDue = (list) => [...list].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.title.localeCompare(b.title, 'ko')));

  /** 이번 달에 발생하는 반복 항목의 총 고정 지출 */
  function monthlyFixedExpense() {
    const now = parseDate(todayStr());
    const y = now.getFullYear();
    const m = now.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    return state.items.reduce((sum, it) => {
      if (it.repeat === 'none' || !it.amount) return sum;
      const due = parseDate(it.dueDate);
      let times = 0;
      if (it.repeat === 'monthly') times = 1;
      else if (it.repeat === 'yearly') times = due.getMonth() === m ? 1 : 0;
      else if (it.repeat === 'weekly') {
        for (let d = 1; d <= daysInMonth; d++) if (new Date(y, m, d).getDay() === due.getDay()) times++;
      }
      return sum + it.amount * times;
    }, 0);
  }

  function alertBuckets() {
    const today = [], overdue = [], reminded = [];
    state.items.forEach((it) => {
      const d = ddayOf(it.dueDate);
      if (d < 0) overdue.push(it);
      else if (d === 0) today.push(it);
      else if (d <= Number(it.remind)) reminded.push(it);
    });
    return { today, overdue, reminded };
  }

  /** 캘린더용: 기간 내에 해당 항목이 걸리는 날짜 목록 (반복 항목은 미래 회차까지 투영) */
  function occurrencesBetween(item, start, end) {
    const out = [];
    let cur = item.dueDate;
    for (let i = 0; i < 400 && cur <= end; i++) {
      if (cur >= start) out.push(cur);
      if (item.repeat === 'none') break;
      cur = nextDue(item, cur);
    }
    return out;
  }

  // ============================================================
  // 6. 완료 / 삭제
  // ============================================================
  function completeItem(id, cardEl) {
    const idx = state.items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const item = state.items[idx];
    snapshot();

    const finish = () => {
      if (item.repeat === 'none') {
        state.items.splice(idx, 1);
        state.archive.unshift({ ...item, completedAt: todayStr() });
        persist();
        render();
        toast(`🎉 '${item.title}' 완료! 아카이브에 쌓였어요.`, { action: { label: '되돌리기', fn: undo } });
      } else {
        // 반복형: 삭제하지 않고 다음 주기로 마감일 갱신 (오늘 이후가 될 때까지)
        const paidDue = item.dueDate;
        let next = nextDue(item);
        while (ddayOf(next) < 0) next = nextDue(item, next);
        item.dueDate = next;
        item.doneCount = (item.doneCount || 0) + 1;
        state.archive.unshift({ ...item, id: uid(), dueDate: paidDue, completedAt: todayStr(), recurringLog: true });
        persist();
        render();
        toast(`🔁 다음 마감일을 ${prettyDate(next)}로 갱신했어요.`, { action: { label: '되돌리기', fn: undo } });
      }
    };

    if (cardEl && item.repeat === 'none') {
      cardEl.classList.add('is-leaving');
      setTimeout(finish, 300);
    } else finish();
  }

  function deleteItem(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    snapshot();
    state.items = state.items.filter((i) => i.id !== id);
    persist();
    render();
    toast(`'${item.title}'을(를) 삭제했어요.`, { action: { label: '되돌리기', fn: undo } });
  }

  function restoreFromArchive(id) {
    const entry = state.archive.find((a) => a.id === id);
    if (!entry || entry.recurringLog) return;
    snapshot();
    state.archive = state.archive.filter((a) => a.id !== id);
    const { completedAt, ...item } = entry;
    state.items.push(item);
    persist();
    render();
    toast(`'${item.title}'을(를) 대시보드로 되돌렸어요.`, { action: { label: '취소', fn: undo } });
  }

  function deleteArchive(id) {
    snapshot();
    state.archive = state.archive.filter((a) => a.id !== id);
    persist();
    render();
    toast('아카이브 기록을 지웠어요.', { action: { label: '되돌리기', fn: undo } });
  }

  // ============================================================
  // 7. 렌더링
  // ============================================================
  function render() {
    state.today = todayStr();
    renderHeader();
    renderAlerts();
    renderSummary();
    renderTabs();
    renderView();
  }

  function renderHeader() {
    const d = new Date();
    $('#today-label').textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
    const btn = $('#btn-notify');
    if (!('Notification' in window)) btn.classList.add('hidden');
    else if (Notification.permission === 'granted') { btn.textContent = '🔔'; btn.title = '브라우저 알림이 켜져 있어요'; btn.style.opacity = 1; }
    else { btn.textContent = '🔕'; btn.title = '브라우저 알림 켜기'; btn.style.opacity = .7; }
  }

  function renderAlerts() {
    const el = $('#alert-banner');
    const { today, overdue, reminded } = alertBuckets();
    if (state.alertDismissed || (!today.length && !overdue.length && !reminded.length)) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    const names = (list) => list.slice(0, 3).map((i) => escapeHtml(i.title)).join(', ') + (list.length > 3 ? ` 외 ${list.length - 3}개` : '');
    const rows = [];
    if (today.length) rows.push(`<p class="font-bold text-[15px]">🚨 오늘 마감인 항목이 <span class="text-alert">${today.length}개</span> 있습니다!</p><p class="text-sm text-red-700/80 mt-0.5 truncate">${names(today)}</p>`);
    if (overdue.length) rows.push(`<p class="font-semibold text-sm mt-2">⏰ 기한이 지난 항목 ${overdue.length}개 · <span class="font-normal text-red-700/80">${names(overdue)}</span></p>`);
    if (reminded.length) rows.push(`<p class="font-semibold text-sm mt-2">🔔 리마인드 시점 도달 ${reminded.length}개 · <span class="font-normal text-red-700/80">${names(reminded)}</span></p>`);

    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="rounded-2xl border ${today.length ? 'border-red-500 bg-red-50' : 'border-red-200 bg-red-50/60'} p-4 flex items-start gap-3 text-red-800">
        <div class="flex-1 min-w-0">${rows.join('')}</div>
        <button type="button" class="btn-icon text-red-400 hover:text-red-700 hover:bg-red-100" data-action="dismiss-alert" aria-label="알림 닫기">✕</button>
      </div>`;
  }

  function renderSummary() {
    const weekCount = state.items.filter((i) => { const d = ddayOf(i.dueDate); return d >= 0 && d <= 7; }).length;
    const recurring = state.items.filter((i) => i.repeat !== 'none').length;
    const monthKey = todayStr().slice(0, 7);
    const doneThisMonth = state.archive.filter((a) => (a.completedAt || '').startsWith(monthKey)).length;
    const now = new Date();
    const stat = (label, value, sub, accent = false) => `
      <div class="card p-4">
        <p class="text-xs font-semibold text-ink-sub">${label}</p>
        <p class="mt-1.5 text-xl md:text-2xl font-extrabold tracking-tight ${accent ? 'text-primary' : ''}">${value}</p>
        <p class="text-xs text-ink-sub mt-1">${sub}</p>
      </div>`;
    $('#summary').innerHTML =
      stat(`${now.getMonth() + 1}월 총 고정 지출`, won(monthlyFixedExpense()), `반복 항목 ${recurring}개 기준`, true) +
      stat('이번 주 마감 임박', `${weekCount}개`, '오늘 ~ D-7') +
      stat('관리 중인 기한', `${state.items.length}개`, `카테고리 ${categories().length}개`) +
      stat('이번 달 완료', `${doneThisMonth}개`, `누적 ${state.archive.length}개 달성`);
  }

  function renderTabs() {
    $('#tabs').innerHTML = TABS.map((t) => `
      <button type="button" role="tab" class="tab-pill" data-action="tab" data-tab="${t.id}" aria-selected="${state.tab === t.id}">${t.label}</button>
    `).join('');
  }

  function renderView() {
    const view = $('#view');
    if (state.tab === 'timeline') view.innerHTML = timelineView();
    else if (state.tab === 'folder') view.innerHTML = folderView();
    else if (state.tab === 'calendar') view.innerHTML = calendarView();
    else view.innerHTML = archiveView();
  }

  // ---------- 카드 ----------
  function ddayBadge(d) {
    if (d < 0) return `<span class="badge bg-red-100 text-red-600">D+${-d} 지남</span>`;
    if (d === 0) return `<span class="badge bg-alert text-white">D-Day</span>`;
    if (d <= 3) return `<span class="badge bg-orange-100 text-orange-600">D-${d}</span>`;
    if (d <= 7) return `<span class="badge bg-primary-soft text-primary">D-${d}</span>`;
    return `<span class="badge bg-slate-100 text-slate-500">D-${d}</span>`;
  }

  function cardHTML(item) {
    const cat = getCat(item.categoryId);
    const d = ddayOf(item.dueDate);
    const isToday = d === 0;
    const reminded = d > 0 && d <= Number(item.remind);
    const border = isToday ? 'border-2 border-red-500' : d < 0 ? 'border border-red-200' : 'border border-transparent';
    return `
      <article class="item-card card ${border} p-4 flex flex-col gap-3" data-id="${item.id}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5 min-w-0">
            <span class="badge tip" style="background:${cat.color}14;color:${cat.color}" data-tip="${escapeHtml(cat.desc)}">${cat.emoji} ${escapeHtml(cat.name)}</span>
            ${item.sub ? `<span class="badge bg-slate-100 text-slate-500 max-w-[180px] truncate">${escapeHtml(item.sub)}</span>` : ''}
          </div>
          <button type="button" class="btn-icon -mr-1 -mt-1 shrink-0" data-action="edit" data-id="${item.id}" aria-label="수정">✎</button>
        </div>

        ${isToday ? `<div><span class="badge urgent-badge bg-red-50 text-alert border border-red-200">🔥 오늘 안 쓰면 손해!</span></div>` : ''}

        <button type="button" class="text-left" data-action="edit" data-id="${item.id}">
          <h3 class="text-[17px] font-bold leading-snug break-words">${escapeHtml(item.title)}</h3>
          ${item.memo ? `<p class="text-xs text-ink-sub mt-1 line-clamp-1">${escapeHtml(item.memo)}</p>` : ''}
        </button>

        <div class="mt-auto flex items-center justify-between gap-2 pt-1">
          <div class="flex flex-wrap items-center gap-1.5 min-w-0">
            ${ddayBadge(d)}
            <span class="text-xs text-ink-sub">${prettyDate(item.dueDate)}</span>
            ${item.repeat !== 'none' ? `<span class="badge bg-slate-100 text-slate-600" title="${REPEAT_LABEL[item.repeat]} 반복${item.doneCount ? ` · ${item.doneCount}회 완료` : ''}">🔁 ${REPEAT_LABEL[item.repeat]}</span>` : ''}
            ${reminded ? `<span class="badge bg-amber-50 text-amber-600" title="리마인드 시점(${REMIND_LABEL[item.remind]}) 도달">🔔</span>` : ''}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${item.amount ? `<span class="text-[15px] font-bold">${won(item.amount)}</span>` : ''}
            <button type="button" class="check-btn" data-action="complete" data-id="${item.id}" aria-label="완료 처리" title="${item.repeat === 'none' ? '완료하고 아카이브로 보내기' : '이번 회차 완료 → 다음 주기로 갱신'}">✓</button>
          </div>
        </div>
      </article>`;
  }

  const grid = (items) => `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">${items.map(cardHTML).join('')}</div>`;

  function emptyState(title, sub, withButton = true) {
    return `
      <div class="card py-14 px-6 text-center">
        <p class="text-4xl">🛡️</p>
        <p class="mt-3 font-bold text-lg">${title}</p>
        <p class="text-sm text-ink-sub mt-1">${sub}</p>
        ${withButton ? `<button type="button" class="btn-primary mt-5" data-action="open-item">+ 항목 추가</button>` : ''}
      </div>`;
  }

  // ---------- 타임라인 ----------
  function timelineView() {
    if (!state.items.length) return emptyState('지켜야 할 기한이 없어요', '기프티콘, 구독료, 검사일… 무엇이든 추가해 보세요.');
    const groups = [
      { title: '⏰ 기한 지남', test: (d) => d < 0, cls: 'text-alert' },
      { title: '🔥 오늘 마감', test: (d) => d === 0, cls: 'text-alert' },
      { title: '📌 이번 주 (D-1 ~ D-7)', test: (d) => d >= 1 && d <= 7 },
      { title: '🗓️ 한 달 안 (D-8 ~ D-30)', test: (d) => d >= 8 && d <= 30 },
      { title: '🌿 여유 있음 (D-31 이후)', test: (d) => d > 30 },
    ];
    const sorted = sortByDue(state.items);
    return groups.map((g) => {
      const list = sorted.filter((i) => g.test(ddayOf(i.dueDate)));
      if (!list.length) return '';
      return `
        <div class="mb-7">
          <h2 class="text-sm font-bold mb-2.5 ${g.cls || 'text-ink'}">${g.title} <span class="text-ink-sub font-semibold">${list.length}</span></h2>
          ${grid(list)}
        </div>`;
    }).join('');
  }

  // ---------- 카테고리 폴더 ----------
  function folderView() {
    return categories().map((cat) => {
      const list = sortByDue(state.items.filter((i) => i.categoryId === cat.id));
      const sum = list.reduce((s, i) => s + (i.amount || 0), 0);
      return `
        <details class="card mb-3 overflow-visible group" ${list.length ? 'open' : ''}>
          <summary class="list-none cursor-pointer p-4 flex items-center gap-3 select-none">
            <span class="w-10 h-10 rounded-xl grid place-items-center text-xl" style="background:${cat.color}1a">${cat.emoji}</span>
            <div class="flex-1 min-w-0">
              <p class="font-bold flex items-center gap-1.5">
                ${escapeHtml(cat.name)}
                ${cat.desc ? `<span class="tip text-ink-sub text-xs font-normal cursor-help" data-tip="${escapeHtml(cat.desc)}" tabindex="0">ⓘ</span>` : ''}
              </p>
              <p class="text-xs text-ink-sub">${list.length}개 항목${sum ? ` · ${won(sum)}` : ''}</p>
            </div>
            <span class="text-ink-sub transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div class="px-4 pb-4">
            ${list.length ? grid(list) : `<p class="text-sm text-ink-sub text-center py-6">아직 항목이 없어요. <button type="button" class="text-primary font-semibold" data-action="open-item" data-category="${cat.id}">추가하기</button></p>`}
          </div>
        </details>`;
    }).join('');
  }

  // ---------- 캘린더 ----------
  function calendarView() {
    const [y, m] = state.calCursor.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const start = fmt(first);
    const end = fmt(new Date(y, m - 1, daysInMonth));

    const byDate = {};
    state.items.forEach((it) => {
      occurrencesBetween(it, start, end).forEach((date) => {
        (byDate[date] = byDate[date] || []).push({ item: it, projected: date !== it.dueDate });
      });
    });

    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<div class="cal-cell pointer-events-none"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${y}-${pad(m)}-${pad(day)}`;
      const list = byDate[date] || [];
      const isToday = date === state.today;
      const dow = (first.getDay() + day - 1) % 7;
      const chips = list.slice(0, 3).map(({ item, projected }) => {
        const cat = getCat(item.categoryId);
        const urgent = !projected && ddayOf(date) <= 0;
        return `<span class="cal-chip ${projected ? 'opacity-50' : ''}" style="background:${urgent ? '#FED7D7' : cat.color + '1a'};color:${urgent ? '#C53030' : cat.color}">${cat.emoji} ${escapeHtml(item.title)}</span>`;
      }).join('');
      const dots = list.slice(0, 4).map(({ item }) => `<i class="w-1.5 h-1.5 rounded-full" style="background:${getCat(item.categoryId).color}"></i>`).join('');
      cells.push(`
        <button type="button" class="cal-cell ${state.calSelected === date ? 'is-selected' : ''}" data-action="cal-select" data-date="${date}">
          <span class="inline-grid place-items-center w-6 h-6 rounded-full text-xs font-semibold ${isToday ? 'bg-primary text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : ''}">${day}</span>
          ${chips}
          ${list.length > 3 ? `<span class="cal-chip text-ink-sub">+${list.length - 3}</span>` : ''}
          <span class="cal-dots hidden gap-0.5 mt-1 justify-center">${dots}</span>
        </button>`);
    }

    const selected = byDate[state.calSelected] || [];
    const selectedInMonth = state.calSelected.startsWith(state.calCursor);
    return `
      <div class="card overflow-hidden">
        <div class="flex items-center justify-between p-4">
          <button type="button" class="btn-icon" data-action="cal-move" data-dir="-1" aria-label="이전 달">‹</button>
          <div class="text-center">
            <p class="font-bold text-lg">${y}년 ${m}월</p>
            <button type="button" class="text-xs text-primary font-semibold" data-action="cal-today">오늘로</button>
          </div>
          <button type="button" class="btn-icon" data-action="cal-move" data-dir="1" aria-label="다음 달">›</button>
        </div>
        <div class="cal-grid text-center text-xs font-semibold text-ink-sub pb-2">
          ${WEEKDAYS.map((w, i) => `<span class="${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : ''}">${w}</span>`).join('')}
        </div>
        <div class="cal-grid">${cells.join('')}</div>
      </div>
      <p class="text-xs text-ink-sub mt-2 px-1">흐리게 표시된 항목은 반복 일정의 예정 회차예요.</p>

      ${selectedInMonth ? `
      <div class="mt-5">
        <div class="flex items-center justify-between mb-2.5">
          <h2 class="text-sm font-bold">${prettyDate(state.calSelected)} <span class="text-ink-sub">${selected.length}</span></h2>
          <button type="button" class="text-sm text-primary font-semibold" data-action="open-item" data-date="${state.calSelected}">+ 이 날짜에 추가</button>
        </div>
        ${selected.length ? grid(selected.map((s) => s.item)) : '<p class="card text-sm text-ink-sub text-center py-8">이 날은 마감이 없어요 🙌</p>'}
      </div>` : ''}`;
  }

  // ---------- 아카이브 ----------
  function archiveView() {
    if (!state.archive.length) return emptyState('아직 완료한 항목이 없어요', '카드의 ✓ 버튼을 누르면 이곳에 성취가 차곡차곡 쌓여요.', false);
    const onTime = state.archive.filter((a) => a.completedAt <= a.dueDate).length;
    const saved = state.archive.reduce((s, a) => s + (a.amount || 0), 0);
    const recurringCount = state.archive.filter((a) => a.recurringLog).length;
    const rate = Math.round((onTime / state.archive.length) * 100);

    const rows = [...state.archive]
      .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
      .map((a) => {
        const cat = getCat(a.categoryId);
        const late = a.completedAt > a.dueDate;
        return `
          <li class="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
            <span class="w-9 h-9 rounded-xl grid place-items-center shrink-0" style="background:${cat.color}1a">${cat.emoji}</span>
            <div class="flex-1 min-w-0">
              <p class="font-semibold truncate">${escapeHtml(a.title)}</p>
              <p class="text-xs text-ink-sub">
                ${dotDate(a.completedAt)} 완료 · 마감 ${dotDate(a.dueDate)}
                ${a.recurringLog ? ' · 🔁 반복 회차' : ''}
                ${late ? ' · <span class="text-alert">지각</span>' : ' · <span class="text-green-600">기한 내</span>'}
              </p>
            </div>
            ${a.amount ? `<span class="text-sm font-semibold shrink-0">${won(a.amount)}</span>` : ''}
            ${a.recurringLog ? '' : `<button type="button" class="btn-icon" data-action="restore" data-id="${a.id}" title="대시보드로 되돌리기" aria-label="되돌리기">↺</button>`}
            <button type="button" class="btn-icon" data-action="delete-archive" data-id="${a.id}" title="기록 삭제" aria-label="기록 삭제">🗑</button>
          </li>`;
      }).join('');

    return `
      <div class="card p-5 mb-4 bg-gradient-to-br from-primary to-indigo-600 text-white">
        <p class="text-sm opacity-80">지금까지 지켜낸 기한</p>
        <p class="text-4xl font-extrabold mt-1">${state.archive.length}<span class="text-lg font-bold ml-1">개</span></p>
        <div class="mt-4 h-2 rounded-full bg-white/25 overflow-hidden"><div class="h-full bg-white rounded-full" style="width:${rate}%"></div></div>
        <div class="mt-2 flex flex-wrap justify-between gap-2 text-xs opacity-90">
          <span>기한 내 완료율 ${rate}%</span>
          <span>반복 납부 ${recurringCount}회 · 챙긴 금액 ${won(saved)}</span>
        </div>
      </div>
      <div class="card px-4 py-1"><ul>${rows}</ul></div>
      <div class="text-right mt-3">
        <button type="button" class="text-xs text-ink-sub underline underline-offset-2 hover:text-alert" data-action="clear-archive">아카이브 비우기</button>
      </div>`;
  }

  // ============================================================
  // 8. 토스트
  // ============================================================
  function toast(message, opts = {}) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${opts.spinner ? '<span class="spinner"></span>' : ''}<span class="toast-msg"></span>`;
    el.querySelector('.toast-msg').textContent = message;
    if (opts.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opts.action.label;
      b.addEventListener('click', () => { opts.action.fn(); close(); });
      el.appendChild(b);
    }
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();

    let timer;
    function close() {
      clearTimeout(timer);
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 200);
    }
    if (!opts.persistent) timer = setTimeout(close, opts.duration || 3500);
    return {
      update: (msg) => { el.querySelector('.toast-msg').textContent = msg; },
      close,
    };
  }

  // ============================================================
  // 9. 항목 모달
  // ============================================================
  const itemModal = $('#item-modal');
  const itemForm = $('#item-form');

  function fillCategorySelect(selectedId) {
    const sel = itemForm.categoryId;
    sel.innerHTML = categories().map((c) => `<option value="${c.id}">${c.emoji} ${escapeHtml(c.name)}</option>`).join('');
    sel.value = selectedId && categories().some((c) => c.id === selectedId) ? selectedId : categories()[0].id;
  }

  function fillSubSelect(categoryId, selectedSub) {
    const cat = getCat(categoryId);
    const sel = itemForm.sub;
    const subs = cat.subs || [];
    sel.innerHTML =
      subs.map((s, i) => `<option value="${escapeHtml(s)}">${i + 1}. ${escapeHtml(s)}</option>`).join('') +
      `<option value="${CUSTOM_SUB}">${subs.length + 1}. [ + 직접 입력 ]</option>`;
    const isCustom = selectedSub && !subs.includes(selectedSub);
    sel.value = selectedSub && !isCustom ? selectedSub : subs.length && !isCustom ? subs[0] : CUSTOM_SUB;
    itemForm.customSub.value = isCustom ? selectedSub : '';
    $('#category-tip').dataset.tip = cat.desc || '';
    toggleCustomSub();
  }

  function toggleCustomSub() {
    const custom = itemForm.sub.value === CUSTOM_SUB;
    $('#custom-sub-wrap').classList.toggle('hidden', !custom);
    if (custom && document.activeElement === itemForm.sub) itemForm.customSub.focus();
  }

  function setSegmented(name, value) {
    itemForm.querySelectorAll(`.segmented[data-name="${name}"] button`).forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.value === String(value)));
    });
  }
  const getSegmented = (name) => itemForm.querySelector(`.segmented[data-name="${name}"] button[aria-pressed="true"]`)?.dataset.value;

  const formatAmountInput = (v) => { const n = String(v).replace(/[^\d]/g, ''); return n ? Number(n).toLocaleString('ko-KR') : ''; };

  function openItemModal({ id, categoryId, date } = {}) {
    const item = id ? state.items.find((i) => i.id === id) : null;
    itemForm.reset();
    $('#item-form-error').classList.add('hidden');
    $('#ocr-result').classList.add('hidden');
    $('#item-modal-title').textContent = item ? '항목 수정' : '새 항목 추가';
    $('#btn-delete-item').classList.toggle('hidden', !item);

    itemForm.id.value = item ? item.id : '';
    itemForm.title.value = item ? item.title : '';
    fillCategorySelect(item ? item.categoryId : categoryId);
    fillSubSelect(itemForm.categoryId.value, item ? item.sub : null);
    itemForm.dueDate.value = item ? item.dueDate : date || addDays(todayStr(), 7);
    itemForm.amount.value = item && item.amount ? formatAmountInput(item.amount) : '';
    itemForm.memo.value = item ? item.memo || '' : '';
    setSegmented('repeat', item ? item.repeat : 'none');
    setSegmented('remind', item ? item.remind : 1);

    openModal(itemModal);
    if (!item) setTimeout(() => itemForm.title.focus(), 50);
  }

  function submitItem(e) {
    e.preventDefault();
    const f = itemForm;
    const title = f.title.value.trim();
    const dueDate = f.dueDate.value;
    const sub = f.sub.value === CUSTOM_SUB ? f.customSub.value.trim() : f.sub.value;
    const err = $('#item-form-error');
    const fail = (msg, field) => { err.textContent = msg; err.classList.remove('hidden'); field.focus(); };
    if (!title) return fail('항목 이름을 입력해 주세요.', f.title);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return fail('마감일을 선택해 주세요.', f.dueDate);
    if (f.sub.value === CUSTOM_SUB && !sub) return fail('세부 메뉴를 직접 입력하거나 목록에서 골라 주세요.', f.customSub);

    const data = {
      title,
      categoryId: f.categoryId.value,
      sub,
      dueDate,
      amount: Number(f.amount.value.replace(/[^\d]/g, '')) || 0,
      repeat: getSegmented('repeat') || 'none',
      remind: Number(getSegmented('remind') ?? 1),
      memo: f.memo.value.trim(),
      anchorDay: parseDate(dueDate).getDate(),
    };

    if (f.id.value) {
      const item = state.items.find((i) => i.id === f.id.value);
      Object.assign(item, data);
      toast('수정했어요.');
    } else {
      state.items.push({ id: uid(), ...data, doneCount: 0, createdAt: Date.now() });
      const d = ddayOf(dueDate);
      toast(d < 0 ? '추가했어요. 이미 기한이 지난 항목이에요!' : `추가했어요. ${d === 0 ? '오늘' : `D-${d}`} 마감이에요.`);
    }
    persist();
    closeModals();
    render();
  }

  // ============================================================
  // 10. OCR (Tesseract.js)
  // ============================================================
  let tesseractWorker = null;
  let ocrAbort = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('스크립트를 불러오지 못했어요.'));
      document.head.appendChild(s);
    });
  }

  /** 큰 사진은 줄이고 흑백·대비 보정해서 인식률과 속도를 올린다. */
  function preprocessImage(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1800;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          const v = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
          px[i] = px[i + 1] = px[i + 2] = v;
        }
        ctx.putImageData(data, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function runOCR(file) {
    const btn = $('#btn-ocr');
    const label = $('#ocr-btn-label');
    btn.disabled = true;
    label.innerHTML = '<span class="inline-flex items-center gap-2"><span class="spinner"></span>분석 중…</span>';
    const t = toast('AI가 이미지를 분석 중입니다...', { spinner: true, persistent: true });

    $('#ocr-preview').src = URL.createObjectURL(file);
    $('#ocr-result').classList.remove('hidden');
    $('#ocr-text').textContent = '분석 중…';

    // 모델 다운로드 실패 시 Tesseract가 reject하지 않고 멈추는 경우가 있어 errorHandler + 타임아웃으로 감싼다
    const aborted = new Promise((_, reject) => { ocrAbort = reject; });
    aborted.catch(() => {});
    const guard = (promise, ms) => Promise.race([
      promise,
      aborted,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);

    try {
      if (!window.Tesseract) {
        t.update('AI 분석 엔진을 불러오는 중입니다...');
        await guard(loadScript(TESSERACT_URL), 30000);
      }
      if (!tesseractWorker) {
        t.update('한국어·영어 인식 모델을 준비 중입니다... (최초 1회)');
        tesseractWorker = await guard(Tesseract.createWorker(['kor', 'eng'], 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') t.update(`AI가 이미지를 분석 중입니다... ${Math.round(m.progress * 100)}%`);
          },
          errorHandler: (e) => ocrAbort && ocrAbort(e instanceof Error ? e : new Error(String(e))),
        }), 120000);
      }
      const image = await preprocessImage(file);
      t.update('AI가 이미지를 분석 중입니다...');
      const { data } = await guard(tesseractWorker.recognize(image), 120000);
      const text = (data.text || '').trim();
      $('#ocr-text').textContent = text || '(인식된 글자가 없어요)';
      t.close();
      applyOCRResult(OCRParser.parse(text));
    } catch (err) {
      console.error(err);
      if (tesseractWorker) tesseractWorker.terminate().catch(() => {});
      tesseractWorker = null;
      t.close();
      $('#ocr-text').textContent = '분석에 실패했어요.';
      toast('이미지 분석에 실패했어요. 네트워크 상태를 확인하거나 직접 입력해 주세요.', { duration: 5000 });
    } finally {
      ocrAbort = null;
      btn.disabled = false;
      label.textContent = '📸 다른 이미지로 다시 인식';
    }
  }

  function applyOCRResult(result) {
    const f = itemForm;
    const filled = [];
    const flash = (el) => { el.classList.remove('autofilled'); void el.offsetWidth; el.classList.add('autofilled'); };

    if (result.category && categories().some((c) => c.id === result.category.categoryId)) {
      f.categoryId.value = result.category.categoryId;
      fillSubSelect(result.category.categoryId, result.category.sub);
      flash(f.categoryId); flash(f.sub);
      filled.push('카테고리');
    }
    if (result.title) { f.title.value = result.title; flash(f.title); filled.push('이름'); }
    if (result.dueDate) { f.dueDate.value = result.dueDate; flash(f.dueDate); filled.push('마감일'); }
    if (result.amount) { f.amount.value = formatAmountInput(result.amount); flash(f.amount); filled.push('금액'); }

    if (filled.length) toast(`✨ ${filled.join(' · ')} 자동 입력 완료! 내용을 확인해 주세요.`, { duration: 4500 });
    else toast('글자는 읽었지만 날짜·이름을 찾지 못했어요. 직접 입력해 주세요.', { duration: 4500 });
  }

  // ============================================================
  // 11. 카테고리 모달
  // ============================================================
  const categoryModal = $('#category-modal');
  const categoryForm = $('#category-form');

  function renderCategoryPreview() {
    const f = categoryForm;
    const color = f.color.value;
    $('#category-preview').innerHTML = `
      <span class="w-11 h-11 rounded-xl grid place-items-center text-2xl" style="background:${color}1a">${escapeHtml(f.emoji.value || '⭐')}</span>
      <div class="min-w-0">
        <span class="badge" style="background:${color}14;color:${color}">${escapeHtml(f.emoji.value || '⭐')} ${escapeHtml(f.name.value || '새 카테고리')}</span>
        <p class="text-xs text-ink-sub mt-1 truncate">${escapeHtml(f.desc.value || '미리보기')}</p>
      </div>`;
    $('#color-picks').querySelectorAll('[data-color]').forEach((b) => {
      b.style.boxShadow = b.dataset.color.toLowerCase() === color.toLowerCase() ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : 'none';
    });
  }

  function renderCustomCategoryList() {
    const list = state.customCategories;
    $('#custom-category-list').innerHTML = list.length ? `
      <p class="text-xs font-semibold text-ink-sub mb-2">내가 만든 카테고리</p>
      <ul class="space-y-1.5">
        ${list.map((c) => `
          <li class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <span>${escapeHtml(c.emoji)}</span>
            <span class="flex-1 text-sm font-semibold truncate" style="color:${c.color}">${escapeHtml(c.name)}</span>
            <span class="text-xs text-ink-sub">${state.items.filter((i) => i.categoryId === c.id).length}개</span>
            <button type="button" class="btn-icon" data-action="delete-category" data-id="${c.id}" aria-label="카테고리 삭제">🗑</button>
          </li>`).join('')}
      </ul>` : '';
  }

  function openCategoryModal() {
    categoryForm.reset();
    categoryForm.color.value = COLOR_CHOICES[0];
    $('#category-form-error').classList.add('hidden');
    $('#emoji-picks').innerHTML = EMOJI_CHOICES.map((e) => `<button type="button" class="w-8 h-8 rounded-lg hover:bg-slate-100 text-lg" data-action="pick-emoji" data-emoji="${e}">${e}</button>`).join('');
    $('#color-picks').innerHTML =
      COLOR_CHOICES.map((c) => `<button type="button" class="w-8 h-8 rounded-full transition" style="background:${c}" data-action="pick-color" data-color="${c}" aria-label="색상 ${c}"></button>`).join('') +
      `<label class="w-8 h-8 rounded-full grid place-items-center bg-slate-100 cursor-pointer text-sm relative overflow-hidden" title="직접 고르기">🎨<input type="color" class="absolute inset-0 opacity-0 cursor-pointer" data-role="color-input"></label>`;
    renderCategoryPreview();
    renderCustomCategoryList();
    openModal(categoryModal);
    setTimeout(() => categoryForm.name.focus(), 50);
  }

  function submitCategory(e) {
    e.preventDefault();
    const f = categoryForm;
    const name = f.name.value.trim();
    const err = $('#category-form-error');
    if (!name) { err.textContent = '카테고리 이름을 입력해 주세요.'; err.classList.remove('hidden'); f.name.focus(); return; }
    if (categories().some((c) => c.name === name)) { err.textContent = '같은 이름의 카테고리가 이미 있어요.'; err.classList.remove('hidden'); f.name.focus(); return; }
    const cat = {
      id: 'c_' + uid(),
      emoji: f.emoji.value.trim() || '⭐',
      name,
      color: f.color.value,
      desc: f.desc.value.trim(),
      subs: f.subs.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10),
      custom: true,
    };
    state.customCategories.push(cat);
    persist();
    closeModals();
    render();
    toast(`${cat.emoji} '${cat.name}' 카테고리를 만들었어요.`, { action: { label: '항목 추가', fn: () => openItemModal({ categoryId: cat.id }) } });
  }

  function deleteCategory(id) {
    const cat = state.customCategories.find((c) => c.id === id);
    if (!cat) return;
    const count = state.items.filter((i) => i.categoryId === id).length;
    if (count) { toast(`'${cat.name}'에 항목이 ${count}개 있어 삭제할 수 없어요. 항목을 먼저 옮기거나 지워 주세요.`, { duration: 5000 }); return; }
    if (!confirm(`'${cat.name}' 카테고리를 삭제할까요?`)) return;
    state.customCategories = state.customCategories.filter((c) => c.id !== id);
    persist();
    renderCustomCategoryList();
    render();
    toast('카테고리를 삭제했어요.');
  }

  // ============================================================
  // 12. 모달 공통
  // ============================================================
  let lastFocus = null;
  function openModal(modal) {
    lastFocus = document.activeElement;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModals() {
    [itemModal, categoryModal].forEach((m) => m.classList.add('hidden'));
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ============================================================
  // 13. 브라우저 알림 (푸시)
  // ============================================================
  function notifyIfNeeded() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (localStorage.getItem(KEYS.notified) === todayStr()) return;
    const { today, overdue, reminded } = alertBuckets();
    if (!today.length && !reminded.length && !overdue.length) return;
    const parts = [];
    if (today.length) parts.push(`오늘 마감 ${today.length}개`);
    if (reminded.length) parts.push(`곧 마감 ${reminded.length}개`);
    if (overdue.length) parts.push(`기한 지남 ${overdue.length}개`);
    try {
      new Notification('🛡️ 기한지킴이', { body: `${parts.join(' · ')}\n${[...today, ...reminded].slice(0, 3).map((i) => i.title).join(', ')}`, tag: 'dk-daily' });
      localStorage.setItem(KEYS.notified, todayStr());
    } catch (e) { /* 일부 모바일 브라우저는 페이지에서 직접 알림을 띄울 수 없다 */ }
  }

  async function requestNotification() {
    if (!('Notification' in window)) return toast('이 브라우저는 알림을 지원하지 않아요.');
    if (Notification.permission === 'granted') return toast('알림이 이미 켜져 있어요. 매일 첫 접속 시 알려드려요.');
    if (Notification.permission === 'denied') return toast('브라우저 설정에서 알림 권한을 허용해 주세요.');
    const p = await Notification.requestPermission();
    renderHeader();
    if (p === 'granted') { toast('🔔 알림을 켰어요. 리마인드 시점이 되면 알려드려요.'); localStorage.removeItem(KEYS.notified); notifyIfNeeded(); }
  }

  // ============================================================
  // 14. 백업 / 초기화
  // ============================================================
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items: state.items, archive: state.archive, customCategories: state.customCategories }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deadline-keeper-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.items)) throw new Error('형식 오류');
        snapshot();
        state.items = data.items;
        state.archive = Array.isArray(data.archive) ? data.archive : [];
        state.customCategories = Array.isArray(data.customCategories) ? data.customCategories : [];
        persist();
        render();
        toast(`백업을 불러왔어요. (항목 ${state.items.length}개)`, { action: { label: '되돌리기', fn: undo } });
      } catch (e) {
        toast('올바른 백업 파일이 아니에요.');
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm('모든 항목, 아카이브, 커스텀 카테고리를 삭제할까요? 되돌릴 수 없어요.')) return;
    state.items = [];
    state.archive = [];
    state.customCategories = [];
    localStorage.setItem(KEYS.seeded, '1');
    persist();
    render();
    toast('모든 데이터를 초기화했어요.');
  }

  // ============================================================
  // 15. 이벤트
  // ============================================================
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    switch (action) {
      case 'open-item': openItemModal({ categoryId: el.dataset.category, date: el.dataset.date }); break;
      case 'open-category': openCategoryModal(); break;
      case 'close-modal': closeModals(); break;
      case 'edit': openItemModal({ id }); break;
      case 'complete': completeItem(id, el.closest('.item-card')); break;
      case 'delete-from-modal': { const itemId = itemForm.id.value; closeModals(); deleteItem(itemId); break; }
      case 'restore': restoreFromArchive(id); break;
      case 'delete-archive': deleteArchive(id); break;
      case 'clear-archive':
        if (confirm('완료 아카이브를 모두 비울까요?')) { snapshot(); state.archive = []; persist(); render(); toast('아카이브를 비웠어요.', { action: { label: '되돌리기', fn: undo } }); }
        break;
      case 'tab':
        state.tab = el.dataset.tab;
        sessionStorage.setItem('dk.tab', state.tab);
        renderTabs();
        renderView();
        break;
      case 'dismiss-alert': state.alertDismissed = true; renderAlerts(); break;
      case 'cal-move': {
        const [y, m] = state.calCursor.split('-').map(Number);
        const d = new Date(y, m - 1 + Number(el.dataset.dir), 1);
        state.calCursor = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        state.calSelected = state.calCursor === todayStr().slice(0, 7) ? todayStr() : `${state.calCursor}-01`;
        renderView();
        break;
      }
      case 'cal-today': state.calCursor = todayStr().slice(0, 7); state.calSelected = todayStr(); renderView(); break;
      case 'cal-select': state.calSelected = el.dataset.date; renderView(); break;
      case 'pick-emoji': categoryForm.emoji.value = el.dataset.emoji; renderCategoryPreview(); break;
      case 'pick-color': categoryForm.color.value = el.dataset.color; renderCategoryPreview(); break;
      case 'delete-category': deleteCategory(id); break;
      case 'export': exportData(); break;
      case 'reset': resetAll(); break;
    }
  });

  // 세그먼트 버튼 (반복 / 리마인드)
  itemForm.querySelectorAll('.segmented').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setSegmented(seg.dataset.name, b.dataset.value);
    });
  });

  itemForm.categoryId.addEventListener('change', () => fillSubSelect(itemForm.categoryId.value));
  itemForm.sub.addEventListener('change', toggleCustomSub);
  itemForm.amount.addEventListener('input', (e) => { e.target.value = formatAmountInput(e.target.value); });
  itemForm.addEventListener('submit', submitItem);

  $('#btn-ocr').addEventListener('click', () => $('#ocr-file').click());
  $('#ocr-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('이미지 파일만 인식할 수 있어요.');
    runOCR(file);
  });

  categoryForm.addEventListener('submit', submitCategory);
  categoryForm.addEventListener('input', (e) => {
    if (e.target.dataset.role === 'color-input') categoryForm.color.value = e.target.value;
    renderCategoryPreview();
  });

  $('#btn-notify').addEventListener('click', requestNotification);
  $('#import-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importData(f); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModals();
  });

  // 자정이 지나면 D-Day를 다시 계산
  setInterval(() => { if (state.today !== todayStr()) { state.alertDismissed = false; render(); notifyIfNeeded(); } }, 60 * 1000);

  // 다른 탭에서 데이터가 바뀌면 동기화
  window.addEventListener('storage', (e) => {
    if (![KEYS.items, KEYS.archive, KEYS.categories].includes(e.key)) return;
    state.items = load(KEYS.items, []);
    state.archive = load(KEYS.archive, []);
    state.customCategories = load(KEYS.categories, []);
    render();
  });

  // ============================================================
  // 16. 시작
  // ============================================================
  seedIfFirstVisit();
  render();
  notifyIfNeeded();
})();
