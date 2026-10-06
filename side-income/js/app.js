/* 부수입 가계부 - Vanilla JS + LocalStorage */
(function () {
  'use strict';

  const STORAGE_KEY = 'side-income-ledger-v1';
  const DEFAULT_CATEGORIES = [
    { name: '과외', color: 'var(--c-tutor)' },
    { name: '앱테크', color: 'var(--c-apptech)' },
    { name: '중고거래', color: 'var(--c-used)' },
    { name: '보험', color: 'var(--c-insur)' },
    { name: '받을돈', color: 'var(--c-owed)' },
  ];
  const CUSTOM_COLORS = ['#3a9bb8', '#c25a8f', '#7b8a2e', '#b8683a', '#5a6fc2', '#2e8a6a'];
  const OWED = '받을돈';

  // ---------- State ----------
  let state = load();
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-11
  let filter = '전체';
  let editingId = null;
  let pickedCategory = '과외';
  let confirmHandler = null;
  let editingGoal = false;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.entries)) {
          return { entries: data.entries, customCategories: data.customCategories || [], goal: Number(data.goal) || 0 };
        }
      }
    } catch (e) { /* 저장소를 쓸 수 없으면 빈 상태로 시작 */ }
    return { entries: [], customCategories: [], goal: 0 };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
    }
  }

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
  const signedWon = (n) => (n < 0 ? '-' : '') + won(Math.abs(n));
  const parseMoney = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const monthKey = (y, m) => `${y}-${pad(m + 1)}`;
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

  function allCategories() {
    const list = DEFAULT_CATEGORIES.map((c) => c.name).concat(state.customCategories);
    // 예전에 쓰다가 목록에서 빠진 카테고리도 내역에 있으면 보여 준다
    state.entries.forEach((e) => { if (!list.includes(e.category)) list.push(e.category); });
    return list;
  }

  function catColor(name) {
    const d = DEFAULT_CATEGORIES.find((c) => c.name === name);
    if (d) return d.color;
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CUSTOM_COLORS[h % CUSTOM_COLORS.length];
  }

  const dot = (name) => `<span class="dot" style="--cat:${catColor(name)}"></span>`;

  function inMonth(e, y, m) { return e.date.startsWith(monthKey(y, m)); }

  function totals(entries) {
    let income = 0, cost = 0, pending = 0;
    entries.forEach((e) => {
      cost += e.cost || 0;
      if (e.status === 'pending') pending += e.amount;
      else income += e.amount;
    });
    return { income, cost, pending, net: income - cost };
  }

  // ---------- Render ----------
  function render() {
    const isThisMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    $('#today-label').textContent = `오늘 ${today.getMonth() + 1}월 ${today.getDate()}일 (${WEEK[today.getDay()]})`;
    $('#month-label').textContent = `${viewYear}년 ${viewMonth + 1}월`;
    $('#btn-this-month').hidden = isThisMonth;

    const monthEntries = state.entries.filter((e) => inMonth(e, viewYear, viewMonth));
    renderSummary(monthEntries);
    renderPending();
    renderBreakdown(monthEntries);
    renderFilters(monthEntries);
    renderList(monthEntries);
  }

  function renderSummary(monthEntries) {
    const t = totals(monthEntries);
    const yearEntries = state.entries.filter((e) => e.date.startsWith(String(viewYear)));
    const yt = totals(yearEntries);

    let goalHtml;
    if (editingGoal) {
      goalHtml = `
        <form class="goal" id="goal-form">
          <div class="goal-top"><span>월 목표 금액</span></div>
          <div class="tool-row">
            <div class="money-input field" style="flex:1;min-width:0">
              <input type="text" inputmode="numeric" id="goal-input" value="${state.goal ? state.goal.toLocaleString('ko-KR') : ''}" placeholder="예: 500,000" />
              <em>원</em>
            </div>
            <button type="submit" class="btn btn-primary">저장</button>
            <button type="button" class="btn btn-ghost" data-action="cancel-goal">취소</button>
          </div>
        </form>`;
    } else if (state.goal > 0) {
      const pct = Math.max(0, Math.min(100, (t.net / state.goal) * 100));
      goalHtml = `
        <div class="goal">
          <div class="goal-top">
            <span>목표 ${won(state.goal)} 중 <b class="num">${Math.round((t.net / state.goal) * 100)}%</b></span>
            <button type="button" data-action="edit-goal">목표 수정</button>
          </div>
          <div class="bar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        </div>`;
    } else {
      goalHtml = `<div class="goal"><div class="goal-top"><span class="muted">월 목표를 정하면 달성률을 보여 드려요</span><button type="button" data-action="edit-goal">목표 정하기</button></div></div>`;
    }

    $('#summary').innerHTML = `
      <div>
        <div class="net-label">${viewMonth + 1}월 순수익</div>
        <div class="net-value num ${t.net < 0 ? 'neg' : ''}">${signedWon(t.net)}</div>
        <div class="net-sub">${viewYear}년 누적 순수익 <b class="num">${signedWon(yt.net)}</b></div>
      </div>
      <dl class="stat-row" style="margin:0">
        <div class="stat"><dt>들어온 돈</dt><dd class="num plus">${won(t.income)}</dd></div>
        <div class="stat"><dt>비용</dt><dd class="num minus">${won(t.cost)}</dd></div>
        <div class="stat"><dt>받을 예정</dt><dd class="num wait">${won(t.pending)}</dd></div>
      </dl>
      ${goalHtml}`;

    if (editingGoal) {
      const input = $('#goal-input');
      input.focus();
      bindMoneyFormat(input);
    }
  }

  function renderPending() {
    // 받을 돈은 달과 상관없이 아직 안 받은 것을 모두 보여 준다
    const items = state.entries.filter((e) => e.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
    $('#pending-section').hidden = items.length === 0;
    if (!items.length) return;
    const sum = items.reduce((s, e) => s + e.amount, 0);
    $('#pending-hint').textContent = `총 ${won(sum)} · ${items.length}건`;
    $('#pending-list').innerHTML = items.map((e) => `
      <li class="pending-item">
        ${dot(e.category)}
        <div class="info">
          <div class="title">${esc(e.memo || e.category)}</div>
          <div class="meta">${esc(e.category)} · ${formatDate(e.date)}</div>
        </div>
        <span class="amt num">${won(e.amount)}</span>
        <button type="button" class="btn btn-secondary" data-action="mark-received" data-id="${e.id}">받았어요</button>
      </li>`).join('');
  }

  function renderBreakdown(monthEntries) {
    const byCat = new Map();
    monthEntries.forEach((e) => {
      if (e.status === 'pending') return;
      const cur = byCat.get(e.category) || { income: 0, cost: 0 };
      cur.income += e.amount;
      cur.cost += e.cost || 0;
      byCat.set(e.category, cur);
    });
    const rows = [...byCat.entries()].sort((a, b) => b[1].income - a[1].income);
    const total = rows.reduce((s, [, v]) => s + v.income, 0);
    $('#breakdown-total').textContent = total ? `합계 ${won(total)}` : '';

    if (!rows.length) {
      $('#breakdown').innerHTML = `<p class="muted">이번 달에 들어온 돈이 아직 없어요.</p>`;
      return;
    }
    const max = rows[0][1].income || 1;
    $('#breakdown').innerHTML = `<div class="breakdown">${rows.map(([name, v]) => `
      <div class="bd-row" style="--cat:${catColor(name)}">
        <div class="bd-name">${dot(name)}<span>${esc(name)}</span></div>
        <div class="bar"><i style="width:${(v.income / max) * 100}%"></i></div>
        <div class="bd-amt num">${won(v.income)}<small>${Math.round((v.income / total) * 100)}%${v.cost ? ` · 비용 ${won(v.cost)}` : ''}</small></div>
      </div>`).join('')}</div>`;
  }

  function renderFilters(monthEntries) {
    const used = new Set(monthEntries.map((e) => e.category));
    const cats = ['전체'].concat(allCategories().filter((c) => used.has(c)));
    if (!cats.includes(filter)) filter = '전체';
    $('#filter-chips').innerHTML = cats.map((c) => `
      <button type="button" class="chip" role="tab" aria-selected="${c === filter}" data-action="filter" data-cat="${esc(c)}">
        ${c === '전체' ? '' : dot(c)}${esc(c)}
      </button>`).join('');
  }

  function renderList(monthEntries) {
    const list = monthEntries
      .filter((e) => filter === '전체' || e.category === filter)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    $('#list-count').textContent = list.length ? `${list.length}건` : '';

    if (!list.length) {
      $('#entry-list').innerHTML = `
        <div class="empty">
          <p>${viewMonth + 1}월 기록이 아직 없어요.</p>
          <button type="button" class="btn btn-secondary" data-action="open-add">+ 첫 기록 남기기</button>
        </div>`;
      return;
    }

    const groups = new Map();
    list.forEach((e) => { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); });

    $('#entry-list').innerHTML = [...groups.entries()].map(([date, items]) => {
      const dayNet = items.reduce((s, e) => s + (e.status === 'pending' ? 0 : e.amount) - (e.cost || 0), 0);
      return `
        <div class="day-group">
          <div class="day-head"><span>${formatDate(date)}</span><span class="num">${signedWon(dayNet)}</span></div>
          ${items.map((e) => `
            <button type="button" class="entry ${e.status === 'pending' ? 'is-pending' : ''}" data-action="edit" data-id="${e.id}">
              <div class="info">
                <div class="title">${dot(e.category)}<span>${esc(e.category)}</span>${e.status === 'pending' ? '<span class="badge-wait">받을 예정</span>' : ''}</div>
                ${e.memo ? `<div class="memo">${esc(e.memo)}</div>` : ''}
              </div>
              <div class="money num">
                <b>+${won(e.amount)}</b>
                ${e.cost ? `<small>비용 -${won(e.cost)}</small>` : ''}
              </div>
            </button>`).join('')}
        </div>`;
    }).join('');
  }

  function formatDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const prefix = y === today.getFullYear() ? '' : `${y}년 `;
    return `${prefix}${m}월 ${d}일 (${WEEK[dt.getDay()]})`;
  }

  // ---------- Entry modal ----------
  function renderCategoryPicker() {
    const cats = DEFAULT_CATEGORIES.map((c) => c.name).concat(state.customCategories);
    if (pickedCategory && pickedCategory !== '__custom' && !cats.includes(pickedCategory)) cats.push(pickedCategory);
    $('#f-category-chips').innerHTML = cats.map((c) => `
      <button type="button" class="chip" aria-pressed="${c === pickedCategory}" data-action="pick-cat" data-cat="${esc(c)}">${dot(c)}${esc(c)}</button>`).join('')
      + `<button type="button" class="chip chip-add" aria-pressed="${pickedCategory === '__custom'}" data-action="pick-cat" data-cat="__custom">+ 직접작성</button>`;
    $('#custom-cat-row').hidden = pickedCategory !== '__custom';
  }

  function openModal(entry) {
    editingId = entry ? entry.id : null;
    $('#modal-title').textContent = entry ? '기록 수정' : '부수입 기록';
    $('#btn-delete').hidden = !entry;
    $('#form-error').textContent = '';

    // 새 기록 날짜: 보고 있는 달이 이번 달이면 오늘, 아니면 그 달 1일
    const isThisMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    $('#f-date').value = entry ? entry.date : (isThisMonth ? ymd(today) : `${monthKey(viewYear, viewMonth)}-01`);
    pickedCategory = entry ? entry.category : (filter !== '전체' ? filter : '과외');
    $('#f-custom-cat').value = '';
    $('#f-amount').value = entry ? entry.amount.toLocaleString('ko-KR') : '';
    $('#f-cost').value = entry && entry.cost ? entry.cost.toLocaleString('ko-KR') : '';
    $('#f-memo').value = entry ? entry.memo : '';
    setStatus(entry ? entry.status : (pickedCategory === OWED ? 'pending' : 'done'));
    renderCategoryPicker();

    $('#entry-modal').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#f-amount').focus(), 50);
  }

  function closeModal() {
    $('#entry-modal').hidden = true;
    document.body.style.overflow = '';
    editingId = null;
  }

  function setStatus(v) {
    document.querySelectorAll('input[name="f-status"]').forEach((r) => { r.checked = r.value === v; });
  }

  function submitEntry(ev) {
    ev.preventDefault();
    const err = $('#form-error');
    const date = $('#f-date').value;
    const amount = parseMoney($('#f-amount').value);
    const cost = parseMoney($('#f-cost').value);
    const memo = $('#f-memo').value.trim();
    const status = document.querySelector('input[name="f-status"]:checked').value;
    let category = pickedCategory;

    if (!date) { err.textContent = '날짜를 골라 주세요.'; return; }
    if (category === '__custom') {
      category = $('#f-custom-cat').value.trim();
      if (!category) { err.textContent = '카테고리 이름을 적어 주세요.'; $('#f-custom-cat').focus(); return; }
      if (category === '전체') { err.textContent = "'전체'는 카테고리 이름으로 쓸 수 없어요."; return; }
      if (!allCategories().includes(category)) state.customCategories.push(category);
    }
    if (!amount && !cost) { err.textContent = '금액을 입력해 주세요.'; $('#f-amount').focus(); return; }

    if (editingId) {
      const e = state.entries.find((x) => x.id === editingId);
      Object.assign(e, { date, category, amount, cost, memo, status });
      toast('수정했어요');
    } else {
      state.entries.push({ id: uid(), date, category, amount, cost, memo, status, createdAt: Date.now() });
      toast(status === 'pending' ? `받을 돈 ${won(amount)}을 기록했어요` : `${won(amount)}을 기록했어요`);
    }
    // 저장한 날짜의 달로 이동해서 방금 기록이 보이게
    const [y, m] = date.split('-').map(Number);
    viewYear = y; viewMonth = m - 1;
    save();
    closeModal();
    render();
  }

  function deleteEntry(id) {
    const idx = state.entries.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [removed] = state.entries.splice(idx, 1);
    save();
    render();
    toast('삭제했어요', () => { state.entries.push(removed); save(); render(); });
  }

  // ---------- Confirm ----------
  function askConfirm(text, yesLabel, onYes) {
    $('#confirm-text').textContent = text;
    $('#confirm-yes').textContent = yesLabel;
    confirmHandler = onYes;
    $('#confirm-modal').hidden = false;
  }
  function closeConfirm() { $('#confirm-modal').hidden = true; confirmHandler = null; }

  // ---------- Toast ----------
  function toast(msg, undo) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '되돌리기';
      b.addEventListener('click', () => { undo(); el.remove(); });
      el.appendChild(b);
    }
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), undo ? 5000 : 2200);
  }

  // ---------- Money input formatting ----------
  function bindMoneyFormat(input) {
    input.addEventListener('input', () => {
      const n = parseMoney(input.value);
      input.value = n ? n.toLocaleString('ko-KR') : '';
    });
  }

  // ---------- Export / Import ----------
  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    if (!state.entries.length) { toast('내보낼 기록이 없어요'); return; }
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [['날짜', '카테고리', '금액', '비용', '순수익', '입금 상태', '메모']];
    [...state.entries].sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
      const net = (e.status === 'pending' ? 0 : e.amount) - (e.cost || 0);
      rows.push([e.date, e.category, e.amount, e.cost || 0, net, e.status === 'pending' ? '받을 예정' : '받음', e.memo]);
    });
    // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다
    const csv = '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
    download(`부수입가계부_${ymd(today)}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportJson() {
    download(`부수입가계부_백업_${ymd(today)}.json`, JSON.stringify({ app: 'side-income-ledger', version: 1, ...state }, null, 2), 'application/json');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.entries)) throw new Error('bad');
        const valid = data.entries.filter((e) => e && typeof e.date === 'string' && typeof e.category === 'string');
        askConfirm(`백업 파일의 기록 ${valid.length}건으로 지금 기록을 바꿀까요? 지금 기록은 사라져요.`, '불러오기', () => {
          state = {
            entries: valid.map((e) => ({
              id: e.id || uid(), date: e.date, category: e.category,
              amount: Number(e.amount) || 0, cost: Number(e.cost) || 0, memo: e.memo || '',
              status: e.status === 'pending' ? 'pending' : 'done', createdAt: Number(e.createdAt) || Date.now(),
            })),
            customCategories: Array.isArray(data.customCategories) ? data.customCategories : [],
            goal: Number(data.goal) || 0,
          };
          save();
          render();
          toast(`기록 ${valid.length}건을 불러왔어요`);
        });
      } catch (e) {
        toast('백업 파일을 읽지 못했어요. 이 앱에서 받은 .json 파일인지 확인해 주세요.');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Events ----------
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    switch (a) {
      case 'open-add': openModal(null); break;
      case 'close-modal': closeModal(); break;
      case 'edit': openModal(state.entries.find((e) => e.id === t.dataset.id)); break;
      case 'pick-cat': {
        const prev = pickedCategory;
        pickedCategory = t.dataset.cat;
        // 새 기록에서 받을돈을 고르면 '받을 예정'으로, 다른 걸 고르면 다시 '받았어요'로
        if (!editingId) {
          if (pickedCategory === OWED) setStatus('pending');
          else if (prev === OWED) setStatus('done');
        }
        renderCategoryPicker();
        if (pickedCategory === '__custom') $('#f-custom-cat').focus();
        break;
      }
      case 'prev-month':
        viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(); break;
      case 'next-month':
        viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); break;
      case 'this-month':
        viewYear = today.getFullYear(); viewMonth = today.getMonth(); render(); break;
      case 'filter': filter = t.dataset.cat; render(); break;
      case 'mark-received': {
        const e = state.entries.find((x) => x.id === t.dataset.id);
        if (!e) break;
        e.status = 'done';
        save(); render();
        toast(`${won(e.amount)} 받음으로 바꿨어요`, () => { e.status = 'pending'; save(); render(); });
        break;
      }
      case 'edit-goal': editingGoal = true; render(); break;
      case 'cancel-goal': editingGoal = false; render(); break;
      case 'export-csv': exportCsv(); break;
      case 'export-json': exportJson(); break;
      case 'confirm-yes': { const h = confirmHandler; closeConfirm(); if (h) h(); break; }
      case 'confirm-no': closeConfirm(); break;
    }
  });

  document.addEventListener('submit', (ev) => {
    if (ev.target.id === 'entry-form') submitEntry(ev);
    if (ev.target.id === 'goal-form') {
      ev.preventDefault();
      state.goal = parseMoney($('#goal-input').value);
      editingGoal = false;
      save(); render();
      toast(state.goal ? `월 목표를 ${won(state.goal)}으로 정했어요` : '월 목표를 지웠어요');
    }
  });

  $('#btn-delete').addEventListener('click', () => {
    const id = editingId;
    askConfirm('이 기록을 삭제할까요?', '삭제', () => { closeModal(); deleteEntry(id); });
  });

  $('#import-file').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (f) importJson(f);
    ev.target.value = '';
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!$('#confirm-modal').hidden) closeConfirm();
    else if (!$('#entry-modal').hidden) closeModal();
    else if (editingGoal) { editingGoal = false; render(); }
  });

  // 다른 탭에서 바꾼 내용 반영
  window.addEventListener('storage', (ev) => {
    if (ev.key === STORAGE_KEY) { state = load(); render(); }
  });

  bindMoneyFormat($('#f-amount'));
  bindMoneyFormat($('#f-cost'));
  render();
})();
