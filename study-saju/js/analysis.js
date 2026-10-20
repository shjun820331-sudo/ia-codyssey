/* 공부사주 - 분석 로직
 * 만세력 결과(engine.js) → 오행·십신 세력 → 신강/신약 → 용신(억부+조후) → 공부 스타일·운의 흐름·진로
 * 해석 문장은 knowledge.js에서 가져와 조합한다. 숫자 기준은 단순화한 규칙이며 '참고용'이다.
 */
(function (root) {
  'use strict';

  const E = root.SajuEngine || require('./engine.js');
  const K = root.SajuKnowledge || require('./knowledge.js');
  const { ELEMENTS, GROUPS } = E;

  // 지장간 세력 비율(본기 → 중기 → 여기 순, 라이브러리 순서와 같음)
  const HIDDEN_WEIGHTS = { 1: [1], 2: [0.7, 0.3], 3: [0.6, 0.3, 0.1] };
  const MONTH_BRANCH_WEIGHT = 2; // 월령(태어난 달의 기운)이 가장 크다

  function round1(n) { return Math.round(n * 10) / 10; }

  // ---------- 오행·십신 세력 ----------
  function elementPower(chart) {
    const power = [0, 0, 0, 0, 0];
    const dm = chart.dayMaster.index;
    const add = (el, w) => { power[el] += w; };
    for (const key of ['year', 'month', 'day', 'hour']) {
      const p = chart.pillars[key];
      if (!p) continue;
      if (key !== 'day') add(p.ganElement, 1); // 일간 자신은 세력 계산에서 뺀다
      const ws = HIDDEN_WEIGHTS[p.hidden.length];
      const bw = key === 'month' ? MONTH_BRANCH_WEIGHT : 1;
      p.hidden.forEach((h, i) => add(h.element, ws[i] * bw));
    }
    return { power, dayMasterIndex: dm };
  }

  // 일간 기준으로 오행 → 십신 그룹 세력
  function groupPower(power, dmElement) {
    const g = {};
    GROUPS.forEach((name, rel) => { g[name] = power[(dmElement + rel) % 5]; });
    return g;
  }
  function elementOfGroup(group, dmElement) { return (dmElement + GROUPS.indexOf(group)) % 5; }

  function strengthOf(chart, groups) {
    const total = Object.values(groups).reduce((a, b) => a + b, 0) || 1;
    const support = groups.비겁 + groups.인성;
    const ratio = support / total;
    const dmEl = chart.dayMaster.element;
    const monthMain = chart.pillars.month.hidden[0].element;
    const dayMain = chart.pillars.day.hidden[0].element;
    const supports = (el) => el === dmEl || el === (dmEl + 4) % 5;
    const tags = [];
    if (supports(monthMain)) tags.push('득령(태어난 달의 도움)');
    if (supports(dayMain)) tags.push('득지(앉은 자리의 도움)');
    if (ratio >= 0.45) tags.push('득세(주변의 도움)');
    let label = '중화';
    if (ratio >= 0.52) label = '신강';
    else if (ratio <= 0.38) label = '신약';
    const desc = {
      신강: '나의 기운이 강한 사주예요. 에너지와 자기 주장이 강해, 그 힘을 밖으로 쓰는(표현·성과·규율) 공부가 잘 맞습니다.',
      중화: '나와 주변 기운이 비교적 균형 잡힌 사주예요. 특정 방식에 치우치지 않고 상황에 맞게 공부법을 바꿔도 잘 적응합니다.',
      신약: '나의 기운이 섬세한 사주예요. 좋은 환경·선생님·쉬는 시간처럼 나를 채워 주는 조건이 갖춰질 때 실력이 크게 늘어납니다.',
    }[label];
    return { label, ratio: round1(ratio * 100), tags, desc };
  }

  // ---------- 용신(억부 + 조후) ----------
  function yongsinOf(chart, groups, strength, power) {
    const dmEl = chart.dayMaster.element;
    const elOf = (g) => elementOfGroup(g, dmEl);
    let yongGroup;
    let reason;
    if (strength.label === '신강') {
      if (groups.인성 > groups.비겁) { yongGroup = '재성'; reason = '도와주는 기운(인성)이 넘쳐 재성으로 조절합니다.'; }
      else if (groups.식상 >= 0.8) { yongGroup = '식상'; reason = '넘치는 내 기운을 식상으로 흘려보내(설기) 균형을 맞춥니다.'; }
      else { yongGroup = '관성'; reason = '강한 내 기운을 관성으로 다잡아 균형을 맞춥니다.'; }
    } else if (strength.label === '신약') {
      const heavy = ['식상', '재성', '관성'].sort((a, b) => groups[b] - groups[a])[0];
      if (heavy === '재성') { yongGroup = '비겁'; reason = '재성이 강해 버거우니 비겁(나와 같은 기운)의 도움이 필요합니다.'; }
      else { yongGroup = '인성'; reason = `${heavy}이 강해 기운이 빠지니 인성(나를 돕는 기운)으로 채웁니다.`; }
    } else {
      const weakest = power.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[0].i;
      yongGroup = GROUPS[(weakest - dmEl + 5) % 5];
      reason = '균형 잡힌 사주라 가장 부족한 오행을 채워 주는 것을 우선합니다.';
    }
    const yong = elOf(yongGroup);

    // 조후: 여름생은 물, 겨울생은 불이 필요
    const mz = chart.pillars.month.zhiIndex;
    const total = power.reduce((a, b) => a + b, 0) || 1;
    let johu = null;
    if ([5, 6, 7].includes(mz) && (power[1] + power[2]) / total > 0.4) johu = { element: 4, note: '여름에 태어나 뜨겁고 건조해서 수(水) 기운이 시원하게 식혀 주면 좋아요.' };
    if ([11, 0, 1].includes(mz) && (power[4] + power[3]) / total > 0.4) johu = { element: 1, note: '겨울에 태어나 차가워서 화(火) 기운이 따뜻하게 녹여 주면 좋아요.' };

    const hee = johu && johu.element !== yong ? johu.element : (yong + 4) % 5; // 용신을 생하는 오행
    const giBase = (yong + 3) % 5; // 기신: 용신을 극하는 오행
    const guBase = (giBase + 4) % 5; // 구신: 기신을 돕는 오행
    const favor = [0, 0, 0, 0, 0];
    favor[guBase] = -1;
    favor[giBase] = -2;
    favor[hee] = 1; // 조후 희신이 기신·구신 자리와 겹치면 희신이 우선
    favor[yong] = 2;
    const gi = favor[giBase] === -2 ? giBase : null;
    const gu = favor[guBase] === -1 ? guBase : null;
    return { yong, yongGroup, hee, gi, gu, favor, reason, johu };
  }

  // ---------- 지지 관계 ----------
  function isClash(a, b) { return Math.abs(a - b) === 6; }
  function isCombine(a, b) { return (a + b) % 12 === 1; }

  // ---------- 운의 점수 ----------
  function periodScore(p, ctx) {
    const { favor } = ctx.yongsin;
    let score = favor[p.ganElement] * 1 + favor[p.zhiElement] * 1.2;
    const notes = [];
    const dayZ = ctx.chart.pillars.day.zhiIndex;
    const monthZ = ctx.chart.pillars.month.zhiIndex;
    if (isClash(p.zhiIndex, dayZ)) { score -= 1; notes.push('일지와 충(沖): 생활 리듬·마음이 흔들리기 쉬워요'); }
    if (isClash(p.zhiIndex, monthZ)) { score -= 0.5; notes.push('월지와 충(沖): 환경 변화(반·학원·이사)가 생기기 쉬워요'); }
    if (isCombine(p.zhiIndex, dayZ)) { score += 0.5; notes.push('일지와 합(合): 좋은 인연·도움을 만나기 쉬워요'); }
    return { score: round1(score), notes };
  }
  function levelOf(score) {
    if (score >= 1.5) return { level: '집중', tone: 'good', label: '공부 집중기' };
    if (score <= -1.5) return { level: '관리', tone: 'care', label: '컨디션 관리기' };
    return { level: '보통', tone: 'normal', label: '꾸준히 유지' };
  }
  function periodText(p, ctx) {
    const gg = E.TEN_GOD_GROUP[p.ganTenGod];
    const zg = E.TEN_GOD_GROUP[p.zhiTenGod];
    const main = K.PERIOD[zg]; // 지지의 힘이 오래 간다
    const favorable = ctx.yongsin.favor[p.zhiElement] >= 0;
    const parts = [favorable ? main.good : main.caution];
    if (gg !== zg) {
      const sub = K.PERIOD[gg];
      parts.push(`겉으로는 ${sub.key}의 기운도 함께 들어와요.`);
    }
    return { keys: [K.PERIOD[gg].key, K.PERIOD[zg].key].filter((v, i, a) => a.indexOf(v) === i), text: parts.join(' '), ganGroup: gg, zhiGroup: zg };
  }

  function describePeriod(p, ctx) {
    const s = periodScore(p, ctx);
    const lv = levelOf(s.score);
    const t = periodText(p, ctx);
    return { ...p, score: s.score, notes: s.notes, ...lv, ...t };
  }

  function levelOfGrade(grade) {
    if (!grade) return 'high';
    if (grade.startsWith('초')) return 'elem';
    if (grade.startsWith('중')) return 'mid';
    return 'high';
  }

  // ---------- 공부 스타일 ----------
  function studyStyle(groups, level, chart) {
    const ranked = GROUPS.slice().sort((a, b) => groups[b] - groups[a]);
    const primary = ranked[0];
    const secondary = ranked[1];
    const s = K.STYLE[primary];
    const comboKey = [`${primary}+${secondary}`, `${secondary}+${primary}`].find((k) => K.COMBO[k]);
    const weakest = ranked[4];
    return {
      primary, secondary, weakest,
      title: s.title, summary: s.summary, strengths: s.strengths, pitfalls: s.pitfalls,
      methods: s.methods[level], environment: s.environment,
      combo: comboKey ? K.COMBO[comboKey] : null,
      weakNote: `${weakest} 기운이 가장 약해요. ${{
        인성: '차분히 앉아 개념을 읽고 정리하는 시간을 일부러 만들어 주세요.',
        식상: '배운 것을 말하거나 써 보는 출력 공부를 의식적으로 늘려 주세요.',
        재성: '목표 점수와 마감일을 정해 결과로 확인하는 습관을 들이세요.',
        관성: '스스로 규칙과 시간표를 만들고 지키는 연습이 필요해요.',
        비겁: '함께 공부할 친구나 경쟁 상대를 만들어 자극을 받아 보세요.',
      }[weakest]}`,
      dayMaster: { ...K.DAY_MASTER[chart.dayMaster.gan], gan: chart.dayMaster.gan, element: ELEMENTS[chart.dayMaster.element] },
    };
  }

  function elementNotes(power) {
    const total = power.reduce((a, b) => a + b, 0) || 1;
    const pct = power.map((v) => (v / total) * 100);
    const notes = [];
    pct.forEach((v, i) => {
      if (v < 6) notes.push({ type: 'lack', element: i, text: K.ELEMENT_ADVICE.lack[i] });
      else if (v > 35) notes.push({ type: 'excess', element: i, text: K.ELEMENT_ADVICE.excess[i] });
    });
    return { percent: pct.map(round1), notes };
  }

  // ---------- 진로 ----------
  function career(groups, yongsin, level, power) {
    const total = Object.values(groups).reduce((a, b) => a + b, 0) || 1;
    const gp = {};
    for (const g of GROUPS) gp[g] = groups[g] / total;
    const elTotal = power.reduce((a, b) => a + b, 0) || 1;
    const elScore = (el) => (yongsin.favor[el] + 2) / 4 * 0.6 + (power[el] / elTotal) * 0.6;
    const scoreOf = (item) => item.groups.reduce((a, g, i) => a + gp[g] * (i === 0 ? 1.2 : 0.8), 0) + item.elements.reduce((a, el) => a + elScore(el) * 0.35, 0);
    const fields = K.FIELDS.map((f) => ({ ...f, score: scoreOf(f) })).sort((a, b) => b.score - a.score).slice(0, 3);
    const all = K.JOBS.map((j) => ({ ...j, score: scoreOf(j) })).sort((a, b) => b.score - a.score);
    const max = all[0].score;
    const min = all[all.length - 1].score;
    // 전체 직업 중 상대 위치를 60~98%로 표시
    all.forEach((j) => { j.match = Math.round(60 + ((j.score - min) / (max - min || 1)) * 38); });
    const jobs = all.slice(0, 8);
    return { fields, jobs, activities: K.CAREER_ACTIVITY[level] };
  }

  /**
   * @param chart engine.calculate 결과
   * @param profile { grade, mode: 'student'|'parent', concern, goal, name }
   * @param today Date
   * @param focusYear 월별 흐름을 볼 해(기본: 올해)
   */
  function analyze(chart, profile = {}, today = new Date(), focusYear) {
    const { power } = elementPower(chart);
    const dmEl = chart.dayMaster.element;
    const groups = groupPower(power, dmEl);
    const strength = strengthOf(chart, groups);
    const yongsin = yongsinOf(chart, groups, strength, power);
    const level = levelOfGrade(profile.grade);
    const ctx = { chart, yongsin };

    const thisYear = today.getFullYear();
    const year = focusYear || thisYear;
    const birthYear = chart.input.solarDate.y;

    const daYun = chart.daYun.map((d) => describePeriod(d, ctx));
    const currentDaYun = daYun.filter((d) => d.startYear <= thisYear).pop() || null;
    const nextDaYun = daYun.find((d) => d.startYear > thisYear) || null;

    const years = [];
    for (let y = thisYear; y < thisYear + 3; y++) years.push(describePeriod(E.yearPillar(y, chart.dayMaster.index), ctx));

    const calendar = ['고3', 'N수생'].includes(profile.grade) ? K.EXAM_CALENDAR.high3 : K.EXAM_CALENDAR[level];
    const months = E.monthPillars(year, chart.dayMaster.index).map((m) => ({ ...describePeriod(m, ctx), event: calendar[m.solarMonth] || null }));
    const examMonths = months.filter((m) => m.event && /고사|평가|수능|수학능력/.test(m.event));
    const examTips = examMonths.map((m) => ({
      month: m.solarMonth, event: m.event, level: m.level,
      tip: m.level === '집중' ? '흐름이 좋은 달이에요. 평소보다 목표를 한 단계 높여 도전해 보세요.'
        : m.level === '관리' ? '흔들리기 쉬운 달이에요. 새 진도보다 기출 반복과 실수 줄이기에 집중하고, 시험 2주 전부터 수면 시간을 고정하세요.'
          : '평소 페이스를 지키면 되는 달이에요. 시험 3주 전 계획표로 차분하게 준비하세요.',
    }));

    const style = studyStyle(groups, level, chart);
    const elements = elementNotes(power);
    const total = Object.values(groups).reduce((a, b) => a + b, 0) || 1;
    const groupPercent = {};
    for (const g of GROUPS) groupPercent[g] = round1((groups[g] / total) * 100);

    const natal = [];
    const pz = ['year', 'month', 'day', 'hour'].map((k) => chart.pillars[k]).filter(Boolean);
    const names = { 0: '연지', 1: '월지', 2: '일지', 3: '시지' };
    for (let i = 0; i < pz.length; i++) for (let j = i + 1; j < pz.length; j++) {
      if (isClash(pz[i].zhiIndex, pz[j].zhiIndex)) natal.push(`${names[i]}·${names[j]} 충: 변화와 움직임이 많은 구조라 환경이 바뀔 때 적응 시간이 필요해요.`);
      if (isCombine(pz[i].zhiIndex, pz[j].zhiIndex)) natal.push(`${names[i]}·${names[j]} 합: 사람과 잘 어울리고 협력할 때 힘이 나는 구조예요.`);
    }

    return {
      profile: { ...profile, level, age: thisYear - birthYear },
      elements: { power: power.map(round1), ...elements },
      groups: groupPercent,
      strength, yongsin: { ...yongsin, yongName: ELEMENTS[yongsin.yong], heeName: ELEMENTS[yongsin.hee], giName: yongsin.gi === null ? null : ELEMENTS[yongsin.gi], guName: yongsin.gu === null ? null : ELEMENTS[yongsin.gu] },
      style,
      daYun, currentDaYun, nextDaYun,
      years, months, focusYear: year, examTips,
      career: career(groups, yongsin, level, power),
      parent: { ...K.PARENT[style.primary], strength: K.PARENT_STRENGTH[strength.label] },
      natal,
    };
  }

  // AI 상담에 넘길 요약(토큰 절약용, 문장 대신 구조만)
  function summaryForAI(chart, a) {
    const p = chart.pillars;
    const pill = (x) => x ? `${x.gan}${x.zhi}(${x.hanja}) 천간:${x.ganTenGod} 지지:${x.zhiTenGod}` : '모름';
    return {
      기본: { 일간: `${chart.dayMaster.gan}(${ELEMENTS[chart.dayMaster.element]})`, 띠: chart.zodiac, 보정된출생시각: chart.time.solarTime, 시간모름: chart.time.timeUnknown },
      사주: { 연주: pill(p.year), 월주: pill(p.month), 일주: pill(p.day), 시주: pill(p.hour) },
      오행비율: Object.fromEntries(ELEMENTS.map((e, i) => [e, `${a.elements.percent[i]}%`])),
      십신비율: a.groups,
      신강약: `${a.strength.label} (${a.strength.ratio}%) ${a.strength.tags.join(', ')}`,
      용신: { 용신: a.yongsin.yongName, 희신: a.yongsin.heeName, 기신: a.yongsin.giName, 구신: a.yongsin.guName, 근거: a.yongsin.reason, 조후: a.yongsin.johu?.note || null },
      공부스타일: { 유형: a.style.title, 주: a.style.primary, 보조: a.style.secondary, 약함: a.style.weakest },
      원국관계: a.natal,
      현재대운: a.currentDaYun ? `${a.currentDaYun.gan}${a.currentDaYun.zhi} (${a.currentDaYun.startYear}~${a.currentDaYun.endYear}) ${a.currentDaYun.keys.join('·')} / ${a.currentDaYun.label}` : null,
      다음대운: a.nextDaYun ? `${a.nextDaYun.gan}${a.nextDaYun.zhi} (${a.nextDaYun.startYear}~) ${a.nextDaYun.keys.join('·')} / ${a.nextDaYun.label}` : null,
      세운: a.years.map((y) => `${y.year}년 ${y.gan}${y.zhi}: ${y.keys.join('·')} / ${y.label} (점수 ${y.score})`),
      월운: a.months.map((m) => `${m.solarYear}.${m.solarMonth}월(${m.jieName}~) ${m.gan}${m.zhi}: ${m.keys.join('·')} / ${m.label}${m.event ? ` / 학사:${m.event}` : ''}${m.notes.length ? ` / ${m.notes.join('; ')}` : ''}`),
      추천계열: a.career.fields.map((f) => f.name),
      추천직업: a.career.jobs.map((j) => j.name),
    };
  }

  const api = { analyze, summaryForAI, levelOfGrade };
  root.SajuAnalysis = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
