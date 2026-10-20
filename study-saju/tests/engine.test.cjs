/* 공부사주 계산 엔진 테스트 - node tests/engine.test.cjs
 * 정답은 일진 계산(2000-01-01 = 戊午일)과 절기 시각(한국천문연구원 발표 기준)으로 직접 확인한 값이다.
 */
const assert = require('assert');
const E = require('../js/engine.js');
const A = require('../js/analysis.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
const gz = (p) => p && p.gan + p.zhi;
const calc = (o) => E.calculate({ gender: 'F', correction: 'mean', ...o });

// 2000-01-01이 戊午(60갑자 54번)일 때 날짜의 일주
function dayPillarByCount(y, m, d) {
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2000, 0, 1)) / 86400000);
  const i = (((54 + days) % 60) + 60) % 60;
  return E.GAN_KO[i % 10] + E.ZHI_KO[i % 12];
}

console.log('일주');
for (const [y, m, d] of [[2008, 3, 15], [2009, 8, 21], [1990, 5, 28], [2015, 12, 31], [1975, 2, 10]]) {
  test(`${y}-${m}-${d} 정오 일주`, () => assert.strictEqual(gz(calc({ year: y, month: m, day: d, hour: 12, minute: 0 }).pillars.day), dayPillarByCount(y, m, d)));
}

console.log('연주·월주 (절기 경계)');
test('2026 입춘(2/4 05:02 KST) 직전은 을사년 기축월', () => {
  const c = calc({ year: 2026, month: 2, day: 4, hour: 5, minute: 0 });
  assert.strictEqual(gz(c.pillars.year), '을사'); assert.strictEqual(gz(c.pillars.month), '기축');
});
test('2026 입춘 직후는 병오년 경인월', () => {
  const c = calc({ year: 2026, month: 2, day: 4, hour: 5, minute: 5 });
  assert.strictEqual(gz(c.pillars.year), '병오'); assert.strictEqual(gz(c.pillars.month), '경인');
});
test('2026년 월운 12개는 경인월부터 신축월까지', () => {
  const m = E.monthPillars(2026, 0).map(gz);
  assert.deepStrictEqual(m, ['경인', '신묘', '임진', '계사', '갑오', '을미', '병신', '정유', '무술', '기해', '경자', '신축']);
});
test('세운: 2026 병오, 2027 정미', () => {
  assert.strictEqual(gz(E.yearPillar(2026, 0)), '병오'); assert.strictEqual(gz(E.yearPillar(2027, 0)), '정미');
});

console.log('시간 보정');
test('서울 경도 보정은 약 -32분', () => {
  const t = calc({ year: 2008, month: 3, day: 15, hour: 14, minute: 30 }).time;
  assert.strictEqual(t.correctionMinutes, -32);
});
test('1987년 7월 서머타임은 1시간 더 빼서 계산', () => {
  const t = calc({ year: 1987, month: 7, day: 1, hour: 12, minute: 0 }).time;
  assert.strictEqual(t.dst, true); assert.strictEqual(t.correctionMinutes, -92);
});
test('1958년(UTC+8:30 시절)은 표준시 차이를 반영', () => {
  const t = calc({ year: 1958, month: 1, day: 10, hour: 12, minute: 0 }).time;
  assert.strictEqual(t.standardOffsetMinutes, 510); assert.strictEqual(t.correctionMinutes, -2);
});
test('시주: 서울 07:40 출생은 보정 후 07:08 → 진시', () => {
  assert.strictEqual(calc({ year: 2009, month: 8, day: 21, hour: 7, minute: 40 }).pillars.hour.zhi, '진');
});
test('시주: 서울 07:20 출생은 보정 후 06:48 → 묘시', () => {
  assert.strictEqual(calc({ year: 2009, month: 8, day: 21, hour: 7, minute: 20 }).pillars.hour.zhi, '묘');
});
test('밤 11시 50분(보정 후 23:18): 자시 통일이면 다음 날 일주, 야자시면 당일 일주', () => {
  const next = calc({ year: 2009, month: 8, day: 21, hour: 23, minute: 50, ziSect: 1 });
  const same = calc({ year: 2009, month: 8, day: 21, hour: 23, minute: 50, ziSect: 2 });
  assert.strictEqual(gz(next.pillars.day), dayPillarByCount(2009, 8, 22));
  assert.strictEqual(gz(same.pillars.day), dayPillarByCount(2009, 8, 21));
  assert.strictEqual(next.pillars.hour.zhi, '자');
});
test('시간 모름이면 시주 없음', () => {
  assert.strictEqual(calc({ year: 2009, month: 8, day: 21, timeUnknown: true }).pillars.hour, null);
});

console.log('음력');
test('음력 1990-05-05는 양력 1990-05-28', () => {
  assert.deepStrictEqual(calc({ year: 1990, month: 5, day: 5, calendar: 'lunar', hour: 8, minute: 0 }).input.solarDate, { y: 1990, m: 5, d: 28 });
});

test('한국 음력 기준: 2027 설날(음력 1/1)은 2월 7일 (중국은 2월 6일)', () => {
  assert.deepStrictEqual(E.lunarToSolar(2027, 1, 1, false), { y: 2027, m: 2, d: 7 });
});
test('한국 음력 기준: 2012 음력 5/1은 6월 20일', () => {
  assert.deepStrictEqual(E.lunarToSolar(2012, 5, 1, false), { y: 2012, m: 6, d: 20 });
});
test('한국에만 있는 날짜: 2026 음력 8/30 → 10월 10일', () => {
  assert.deepStrictEqual(E.lunarToSolar(2026, 8, 30, false), { y: 2026, m: 10, d: 10 });
});
test('윤달: 2017 윤6/10 → 8월 1일, 없는 윤달·날짜는 오류', () => {
  assert.deepStrictEqual(E.lunarToSolar(2017, 6, 10, true), { y: 2017, m: 8, d: 1 });
  assert.throws(() => E.lunarToSolar(2016, 6, 1, true), /윤6월이 없어요/);
  assert.throws(() => E.lunarToSolar(2016, 5, 30, false), /29일까지/);
});

console.log('대운');
test('양년 남자는 순행, 음년 남자는 역행', () => {
  assert.strictEqual(E.calculate({ year: 2008, month: 3, day: 15, hour: 12, minute: 0, gender: 'M' }).yun.forward, true); // 戊子년(양)
  assert.strictEqual(E.calculate({ year: 2009, month: 8, day: 21, hour: 12, minute: 0, gender: 'M' }).yun.forward, false); // 己丑년(음)
});
test('순행 대운은 월주 다음 간지부터', () => {
  const c = E.calculate({ year: 2008, month: 3, day: 15, hour: 12, minute: 0, gender: 'M' });
  assert.strictEqual(gz(c.pillars.month), '을묘'); assert.strictEqual(gz(c.daYun[0]), '병진');
});

console.log('분석');
test('卯월 甲寅일주(목 과다)는 신강, 금(관성) 용신', () => {
  const c = calc({ year: 2008, month: 3, day: 15, hour: 14, minute: 30, gender: 'M' });
  const a = A.analyze(c, { grade: '고2' }, new Date('2026-10-20'));
  assert.strictEqual(a.strength.label, '신강'); assert.strictEqual(a.yongsin.yongName, '금');
});
test('고2는 수능 대신 11월 학력평가, 고3은 수능', () => {
  const c = calc({ year: 2008, month: 3, day: 15, hour: 14, minute: 30 });
  const ev = (g) => A.analyze(c, { grade: g }, new Date('2026-10-20')).months.find((m) => m.solarMonth === 11).event;
  assert.strictEqual(ev('고2'), '11월 학력평가'); assert.strictEqual(ev('고3'), '대학수학능력시험');
});

test('조후 희신이 구신 자리와 겹치면 구신은 비워 둔다 (undefined 방지)', () => {
  const c = E.calculate({ year: 2016, month: 5, day: 29, calendar: 'lunar', timeUnknown: true, gender: 'M' });
  const a = A.analyze(c, { grade: '초4' }, new Date('2026-10-20'));
  assert.strictEqual(a.yongsin.heeName, '수'); assert.strictEqual(a.yongsin.guName, null);
  assert.ok(!/undefined|NaN/.test(JSON.stringify(A.summaryForAI(c, a))));
});

console.log(`\n${passed}개 통과${process.exitCode ? ', 실패 있음' : ''}`);
