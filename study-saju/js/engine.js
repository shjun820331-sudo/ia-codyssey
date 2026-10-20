/* 공부사주 - 만세력 계산 엔진
 * lunar-javascript(절기·간지 계산)를 감싸서 한국 출생 기준으로 보정한다.
 *  1) 출생 시각(서울 벽시계) → UTC: 서머타임·과거 표준시(UTC+8:30 시절)는 브라우저의 시간대 데이터(Asia/Seoul)로 처리
 *  2) 연주·월주·대운: 절기 시각과 같은 '순간'으로 비교해야 하므로, 라이브러리 기준인 UTC+8 시계로 바꿔 넣는다
 *  3) 일주·시주: 출생지 경도(+균시차)로 보정한 태양시로 계산한다
 */
(function (root) {
  'use strict';

  const L = root.Solar ? root : (typeof require !== 'undefined' ? require('./vendor/lunar.js') : null);
  const { Solar, LunarYear, LunarUtil, ShouXingUtil } = L;

  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const GAN_KO = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
  const ZHI_KO = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
  const ZHI_ANIMAL = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];
  // 오행: 0 목, 1 화, 2 토, 3 금, 4 수
  const ELEMENTS = ['목', '화', '토', '금', '수'];
  const ELEMENT_HANJA = ['木', '火', '土', '金', '水'];
  const GAN_ELEMENT = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
  const ZHI_ELEMENT = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
  // 음양: 1 양, 0 음 (지지는 체(體) 기준이 아니라 용(用) 기준: 자·오·사·해 반전)
  const GAN_YANG = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  const ZHI_YANG = [0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];
  const STAGES = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양'];
  // 일간별 장생 위치 보정값(甲 장생=亥 …). 라이브러리의 CHANG_SHENG_OFFSET과 같은 값
  const STAGE_OFFSET = [1, 6, 10, 9, 10, 9, 7, 0, 4, 3];

  // 십신: 일간 기준 대상의 오행 관계 + 음양 같음 여부
  // rel: 0 같은 오행, 1 내가 생함, 2 내가 극함, 3 나를 극함, 4 나를 생함
  const TEN_GODS = [
    ['비견', '겁재'], ['식신', '상관'], ['편재', '정재'], ['편관', '정관'], ['편인', '정인'],
  ];
  const TEN_GOD_GROUP = { 비견: '비겁', 겁재: '비겁', 식신: '식상', 상관: '식상', 편재: '재성', 정재: '재성', 편관: '관성', 정관: '관성', 편인: '인성', 정인: '인성' };
  const GROUPS = ['비겁', '식상', '재성', '관성', '인성'];

  function relation(fromEl, toEl) { return (toEl - fromEl + 5) % 5; }
  function tenGod(dayGanIdx, el, yang) {
    const rel = relation(GAN_ELEMENT[dayGanIdx], el);
    return TEN_GODS[rel][GAN_YANG[dayGanIdx] === yang ? 0 : 1];
  }
  function groupOfRelation(rel) { return GROUPS[rel]; }

  // ---------- 시간 보정 ----------
  const TZ = 'Asia/Seoul';
  let offsetFmt = null;
  function tzOffsetMinutes(utcMs, timeZone) {
    if (!offsetFmt || offsetFmt.resolvedOptions().timeZone !== timeZone) {
      offsetFmt = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' });
    }
    const name = offsetFmt.formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName').value;
    const m = /GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?/.exec(name);
    if (!m || !m[1]) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  }
  // 벽시계 시각 → UTC(ms). 서머타임 경계에서도 맞도록 두 번 맞춰 본다.
  function wallClockToUtc(y, mo, d, h, mi, timeZone) {
    const naive = Date.UTC(y, mo - 1, d, h, mi);
    let off = tzOffsetMinutes(naive, timeZone);
    off = tzOffsetMinutes(naive - off * 60000, timeZone);
    return { utcMs: naive - off * 60000, offsetMinutes: off };
  }
  function standardOffsetMinutes(year, timeZone) {
    // 그 해 1월의 오프셋(서머타임 없음)을 표준시로 본다
    return tzOffsetMinutes(Date.UTC(year, 0, 15), timeZone);
  }
  // 균시차(분): 시태양시 - 평태양시
  function equationOfTime(utcMs) {
    const start = Date.UTC(new Date(utcMs).getUTCFullYear(), 0, 0);
    const n = (utcMs - start) / 86400000;
    const b = (2 * Math.PI * (n - 81)) / 364;
    return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  }
  function toParts(ms) {
    const t = new Date(ms);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() };
  }
  function solarFromMs(ms) {
    const p = toParts(ms);
    return Solar.fromYmdHms(p.y, p.m, p.d, p.h, p.mi, p.s);
  }
  function fmt(p) {
    const z = (n) => String(n).padStart(2, '0');
    return `${p.y}-${z(p.m)}-${z(p.d)} ${z(p.h)}:${z(p.mi)}`;
  }

  // ---------- 한국 음력 ----------
  // 라이브러리 음력은 중국 기준(UTC+8)이라, 합삭이 베이징 시간 23시대이면 한국(UTC+9)은 초하루가 하루 늦다.
  // 1960년 이후는 정밀 합삭 시각으로 한국 기준 초하루를 다시 정한다(한국천문연구원 방식).
  // 그 이전은 라이브러리의 역사 자료를 그대로 쓴다. 윤달 배치가 두 나라에서 다른 드문 해는 반영하지 않는다.
  const PRECISE_FROM_JD = 2436935; // 1960-01-01
  function koreanFirstDay(chinaFirstJd) {
    if (chinaFirstJd < PRECISE_FROM_JD) return chinaFirstJd;
    const k = Math.floor((chinaFirstJd + 14 - 2451551) / 29.5306);
    const t = ShouXingUtil.shuoHigh(k * 2 * Math.PI); // J2000 기준 일수, 베이징 시간
    if (Math.floor(t + 0.5) + Solar.J2000 !== chinaFirstJd) return chinaFirstJd;
    return Math.floor(t + 1 / 24 + 0.5) + Solar.J2000;
  }
  function lunarError(msg) { const e = new Error(msg); e.kind = 'lunar'; return e; }
  function lunarToSolar(year, month, day, leap) {
    const want = leap ? -month : month;
    const list = LunarYear.fromYear(year).getMonths().concat(LunarYear.fromYear(year + 1).getMonths());
    const i = list.findIndex((m) => m.getYear() === year && m.getMonth() === want);
    if (i < 0) throw lunarError(leap ? `${year}년에는 음력 윤${month}월이 없어요.` : '음력 날짜를 다시 확인해 주세요.');
    const first = koreanFirstDay(list[i].getFirstJulianDay());
    const next = koreanFirstDay(list[i + 1].getFirstJulianDay());
    if (day < 1 || day > next - first) throw lunarError(`${year}년 음력 ${leap ? '윤' : ''}${month}월은 ${next - first}일까지 있어요.`);
    const s = Solar.fromJulianDay(first + day - 1);
    return { y: s.getYear(), m: s.getMonth(), d: s.getDay() };
  }

  // ---------- 기둥 정보 ----------
  function ganIdx(ch) { return GAN.indexOf(ch); }
  function zhiIdx(ch) { return ZHI.indexOf(ch); }

  function pillar(ganCh, zhiCh, dayGanI, stageCh) {
    const g = ganIdx(ganCh);
    const z = zhiIdx(zhiCh);
    const hidden = LunarUtil.ZHI_HIDE_GAN[zhiCh].map((hc) => {
      const hi = ganIdx(hc);
      return { gan: GAN_KO[hi], hanja: hc, element: GAN_ELEMENT[hi], tenGod: tenGod(dayGanI, GAN_ELEMENT[hi], GAN_YANG[hi]) };
    });
    return {
      gan: GAN_KO[g], zhi: ZHI_KO[z], hanja: ganCh + zhiCh, ganIndex: g, zhiIndex: z,
      ganElement: GAN_ELEMENT[g], zhiElement: ZHI_ELEMENT[z],
      ganTenGod: dayGanI === g && stageCh === undefined ? '일간' : tenGod(dayGanI, GAN_ELEMENT[g], GAN_YANG[g]),
      zhiTenGod: tenGod(dayGanI, ZHI_ELEMENT[z], ZHI_YANG[z]),
      hidden,
      stage: stageCh || null,
    };
  }

  function ganzhiFromText(text) { return { gan: text[0], zhi: text[1] }; }

  /**
   * @param {object} input
   *  year, month, day, hour, minute  출생 시각(벽시계)
   *  calendar 'solar' | 'lunar', leapMonth(boolean, 음력 윤달)
   *  timeUnknown(boolean), gender 'M' | 'F'
   *  longitude(동경, 기본 서울 126.98), correction 'true' | 'mean' | 'none'
   *  ziSect 1: 23시부터 다음 날 일주 / 2: 야자시(자정 전까지 당일 일주)
   */
  function calculate(input) {
    const timeZone = input.timeZone || TZ;
    const longitude = Number(input.longitude ?? 126.98);
    const correction = input.correction || 'true';
    const ziSect = input.ziSect === 2 ? 2 : 1;
    const unknown = !!input.timeUnknown;
    const hour = unknown ? 12 : Number(input.hour);
    const minute = unknown ? 0 : Number(input.minute || 0);

    let y = Number(input.year), mo = Number(input.month), d = Number(input.day);
    if (input.calendar === 'lunar') ({ y, m: mo, d } = lunarToSolar(y, mo, d, !!input.leapMonth));

    const { utcMs, offsetMinutes } = wallClockToUtc(y, mo, d, hour, minute, timeZone);
    const stdOffset = standardOffsetMinutes(y, timeZone);
    const dst = offsetMinutes !== stdOffset;

    // 연·월·대운용: 라이브러리 절기 기준(UTC+8)과 같은 순간
    const ymSolar = solarFromMs(utcMs + 8 * 3600000);
    // 일·시용: 출생지 태양시
    let solarMs;
    let eot = 0;
    if (correction === 'none') {
      solarMs = utcMs + stdOffset * 60000; // 서머타임만 걷어낸 표준시
    } else {
      solarMs = utcMs + longitude * 4 * 60000;
      if (correction === 'true') { eot = equationOfTime(utcMs); solarMs += eot * 60000; }
    }
    const dhSolar = solarFromMs(solarMs);

    const ecYM = ymSolar.getLunar().getEightChar();
    const ecDH = dhSolar.getLunar().getEightChar();
    ecDH.setSect(ziSect);

    const dayGanCh = ecDH.getDayGan();
    const dg = ganIdx(dayGanCh);

    const yearGZ = ganzhiFromText(ecYM.getYear());
    const monthGZ = ganzhiFromText(ecYM.getMonth());
    const dayGZ = ganzhiFromText(ecDH.getDay());
    const timeGZ = ganzhiFromText(ecDH.getTime());

    // 12운성(일간 기준 각 지지). 양간은 순행, 음간은 역행
    const stageOf = (zhiCh) => {
      const zi = zhiIdx(zhiCh);
      const i = STAGE_OFFSET[dg] + (dg % 2 === 0 ? zi : -zi);
      return STAGES[((i % 12) + 12) % 12];
    };

    const pillars = {
      year: pillar(yearGZ.gan, yearGZ.zhi, dg, stageOf(yearGZ.zhi)),
      month: pillar(monthGZ.gan, monthGZ.zhi, dg, stageOf(monthGZ.zhi)),
      day: pillar(dayGZ.gan, dayGZ.zhi, dg, stageOf(dayGZ.zhi)),
      hour: unknown ? null : pillar(timeGZ.gan, timeGZ.zhi, dg, stageOf(timeGZ.zhi)),
    };
    pillars.day.ganTenGod = '일간';

    // 대운 (성별: 라이브러리 1 남, 0 여)
    const yun = ecYM.getYun(input.gender === 'F' ? 0 : 1);
    const daYun = yun.getDaYun(10).slice(1).map((dy) => {
      const gz = ganzhiFromText(dy.getGanZhi());
      const p = pillar(gz.gan, gz.zhi, dg, stageOf(gz.zhi));
      return { ...p, startYear: dy.getStartYear(), endYear: dy.getEndYear(), startAge: dy.getStartYear() - y };
    });

    return {
      input: { ...input, solarDate: { y, m: mo, d } },
      time: {
        wallClock: fmt({ y, m: mo, d, h: hour, mi: minute }),
        offsetMinutes, standardOffsetMinutes: stdOffset, dst,
        solarTime: fmt(toParts(solarMs)),
        correctionMinutes: Math.round((solarMs - (utcMs + offsetMinutes * 60000)) / 60000),
        equationOfTime: Math.round(eot * 10) / 10,
        correction, ziSect, timeUnknown: unknown, longitude,
      },
      pillars,
      dayMaster: { gan: GAN_KO[dg], hanja: dayGanCh, index: dg, element: GAN_ELEMENT[dg], yang: GAN_YANG[dg] === 1 },
      zodiac: ZHI_ANIMAL[zhiIdx(yearGZ.zhi)],
      yun: {
        forward: yun.isForward(),
        startYears: yun.getStartYear(), startMonths: yun.getStartMonth(), startDays: yun.getStartDay(),
      },
      daYun,
    };
  }

  // 그 해의 세운(입춘 기준) - 한 해의 한가운데 날짜로 판단
  function yearPillar(year, dayGanIndex) {
    const gz = ganzhiFromText(Solar.fromYmd(year, 7, 1).getLunar().getYearInGanZhiExact());
    return { year, ...pillar(gz.gan, gz.zhi, dayGanIndex, null) };
  }

  // 그 해(입춘~다음 해 소한 전)의 12개 월운. start는 한국 시간 기준 절입 시각
  function monthPillars(year, dayGanIndex) {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const m = ((i + 1) % 12) + 1; // 2월부터 다음 해 1월까지
      const y = m === 1 ? year + 1 : year;
      const lunar = Solar.fromYmd(y, m, 20).getLunar();
      const gz = ganzhiFromText(lunar.getMonthInGanZhiExact());
      const jie = lunar.getPrevJie();
      const js = jie.getSolar();
      const startMs = Date.UTC(js.getYear(), js.getMonth() - 1, js.getDay(), js.getHour(), js.getMinute()) + 3600000; // UTC+8 → KST
      const st = toParts(startMs);
      out.push({
        solarMonth: m, solarYear: y, jieName: JIE_KO[jie.getName()] || jie.getName(),
        start: { y: st.y, m: st.m, d: st.d, h: st.h, mi: st.mi },
        ...pillar(gz.gan, gz.zhi, dayGanIndex, null),
      });
    }
    return out;
  }
  const JIE_KO = {
    立春: '입춘', 惊蛰: '경칩', 清明: '청명', 立夏: '입하', 芒种: '망종', 小暑: '소서',
    立秋: '입추', 白露: '백로', 寒露: '한로', 立冬: '입동', 大雪: '대설', 小寒: '소한',
    LI_CHUN: '입춘', XIAO_HAN: '소한', DA_XUE: '대설',
  };

  const api = {
    calculate, yearPillar, monthPillars, lunarToSolar, tenGod, relation, groupOfRelation,
    wallClockToUtc, equationOfTime,
    GAN_KO, ZHI_KO, ELEMENTS, ELEMENT_HANJA, GAN_ELEMENT, ZHI_ELEMENT, GAN_YANG, ZHI_YANG, TEN_GOD_GROUP, GROUPS,
  };
  root.SajuEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
