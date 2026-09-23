/**
 * 기한지킴이 - OCR 텍스트 파서
 * Tesseract.js가 추출한 원문 텍스트에서 마감일 / 항목명 / 금액 / 카테고리를 추정한다.
 * 브라우저(window.OCRParser)와 Node(module.exports) 양쪽에서 동작한다.
 */
(function (root) {
  'use strict';

  // 날짜 주변에 있으면 "마감일"일 가능성이 높은 키워드 (공백 제거 후 비교)
  const DATE_KEYWORDS = /(유효기간|유효기한|유통기한|소비기한|사용기한|사용기간|만료|마감|까지|기한|납부|납기|결제예정|반납|교환기간|EXP|EXPIRY|EXPIRES|VALID|USEBY|BESTBEFORE|~)/i;
  // 발행일처럼 "마감일이 아닌" 날짜를 암시하는 키워드
  const NON_DUE_KEYWORDS = /(발행일|구매일|주문일|승인일시|거래일시|결제일시|발급일|제조일|생산일|포장일|MFG|PRINTED)/i;

  // 항목명 후보에서 제외할 문구
  const TITLE_STOP_WORDS = /(유효기간|유효기한|유통기한|소비기한|사용기한|교환처|사용처|주문번호|쿠폰번호|바코드|발행일|구매일|합계|총액|금액|결제|승인|사업자|대표|전화|주소|TEL|FAX|WWW|HTTP|고객|영수증|부가세|과세|면세|선물|보낸사람|받는사람|수량|단가|카드번호|일시불|거래|POS|NO\.|감사합니다|안내|문의|고객센터)/i;

  const TITLE_LABEL = /^(상품명|제품명|품명|쿠폰명|상품|메뉴명|교환상품|이용권명|서비스명|강의명|도서명|항목)[:：]?(.*)$/;

  // 공백 제거 문자열 기준 키워드 → [카테고리 id, 세부 메뉴]
  const CATEGORY_RULES = [
    [/(기프티콘|기프티쇼|카카오톡선물|선물하기|KAKAOTALK|교환처|모바일쿠폰|모바일교환권|교환권|e쿠폰|GIFTICON)/i, 'food', '모바일 쿠폰/기프티콘'],
    [/(식사권|외식|상품권|할인권|관람권)/, 'food', '외식 상품권/할인권'],
    [/(우유|요거트|요구르트|치즈|버터|유제품)/, 'food', '유제품'],
    [/(비타민|영양제|유산균|오메가|홍삼|건강기능)/, 'food', '건강기능식품'],
    [/(약국|의약품|처방)/, 'food', '가정용 상비약'],
    [/(화장품|크림|세럼|로션|선크림|에센스|샴푸)/, 'food', '화장품 및 미용용품'],
    [/(유통기한|소비기한)/, 'food', '유통기한/소비기한'],
    [/(넷플릭스|NETFLIX|티빙|TVING|왓챠|디즈니|웨이브|WAVVE|쿠팡플레이|유튜브프리미엄)/i, 'finance', 'OTT 구독'],
    [/(재산세|자동차세|지방세|주민세|종합소득세|국세|세금)/, 'finance', '각종 세금'],
    [/(전기요금|가스요금|수도요금|관리비|통신요금|휴대폰요금|고지서)/, 'finance', '공과금 및 통신비'],
    [/(보험)/, 'finance', '보험 계약 갱신일'],
    [/(적금|청약)/, 'finance', '적금/청약 만기 및 납입일'],
    [/(대출|이자)/, 'finance', '대출 이자 및 원금 납부일'],
    [/(포인트소멸|마일리지)/, 'finance', '카드사 포인트/마일리지 소멸예정'],
    [/(정기검사|종합검사|자동차검사)/, 'car', '자동차 정기/종합검사'],
    [/(엔진오일|타이어|소모품)/, 'car', '자동차 소모품 교체'],
    [/(건강검진)/, 'car', '국가 건강검진 마감'],
    [/(예방접종|독감)/, 'car', '독감 및 필수 예방접종'],
    [/(여권)/, 'car', '여권 만료일'],
    [/(필터)/, 'car', '정수기/가전 필터 교체'],
    [/(도서관|반납|대출도서)/, 'growth', '도서관 대출 반납 및 예약 일정'],
    [/(토익|TOEIC|토플|TOEFL|오픽|OPIC|텝스|TEPS|JLPT|HSK)/i, 'growth', '어학 성적 만료일'],
    [/(공모전|해커톤)/, 'growth', '공모전 및 해커톤 접수 마감일'],
    [/(수강권|수강기간|인강|강의)/, 'growth', '수강권 및 인강 만료일'],
    [/(자격증|기사|시험접수|원서접수)/, 'growth', '각종 시험 일정'],
    [/(펜션|숙소|예약금)/, 'meeting', '여행/펜션 예약금 입금일'],
    [/(헬스|피트니스|필라테스|PT권|PT이용권)/, 'meeting', '운동/피트니스 정기권 갱신'],
    [/(회비)/, 'meeting', '동호회 월 정기회비 납부일'],
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const compact = (s) => s.replace(/\s+/g, '');

  function isValidDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function daysBetween(fromIso, toIso) {
    const [y1, m1, d1] = fromIso.split('-').map(Number);
    const [y2, m2, d2] = toIso.split('-').map(Number);
    return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
  }

  /** "아 메 리 카 노" 처럼 글자마다 띄어진 한글 OCR 결과를 붙여준다. */
  function fixSpacing(line) {
    const tokens = line.split(' ');
    if (tokens.length >= 3) {
      const singles = tokens.filter((t) => t.length === 1).length;
      if (singles / tokens.length >= 0.6) return tokens.join('');
    }
    return line;
  }

  function toLines(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => l.replace(/[|_]+/g, ' ').replace(/[“”"`]/g, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  /** 한 줄에서 날짜 후보들을 뽑아낸다. */
  function datesInLine(line, todayIso) {
    const found = [];
    let rest = line;
    const thisYear = Number(todayIso.slice(0, 4));

    // 1) 연-월-일 : 2026.12.31 / 2026-12-31 / 2026/12/31 / 2026년 12월 31일 / 26.12.31
    const full = /(?<!\d)((?:19|20)\d{2}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/g;
    rest = rest.replace(full, (match, y, m, d) => {
      let year = Number(y);
      if (y.length === 2) year += 2000;
      if (isValidDate(year, Number(m), Number(d))) found.push({ date: iso(year, Number(m), Number(d)), strength: y.length === 4 ? 2 : 1 });
      return ' '.repeat(match.length);
    });

    // 2) 붙여 쓴 8자리 : 20261231
    const packed = /(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g;
    rest = rest.replace(packed, (match, y, m, d) => {
      if (isValidDate(Number(y), Number(m), Number(d))) found.push({ date: iso(Number(y), Number(m), Number(d)), strength: 1 });
      return ' '.repeat(match.length);
    });

    // 3) 연도 없는 월/일 : 12월 31일 (연도는 오늘 기준으로 추정)
    const monthDay = /(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/g;
    rest.replace(monthDay, (match, m, d) => {
      let year = thisYear;
      if (!isValidDate(year, Number(m), Number(d))) return match;
      if (daysBetween(todayIso, iso(year, Number(m), Number(d))) < -30) year += 1;
      if (isValidDate(year, Number(m), Number(d))) found.push({ date: iso(year, Number(m), Number(d)), strength: 0 });
      return match;
    });

    return found;
  }

  /** 가장 그럴듯한 마감일을 고른다. */
  function extractDueDate(lines, todayIso) {
    const candidates = [];
    lines.forEach((line, i) => {
      const c = compact(line);
      const prev = i > 0 ? compact(lines[i - 1]) : '';
      const dates = datesInLine(line, todayIso);
      if (!dates.length) return;
      const latestOnLine = dates.reduce((a, b) => (a.date > b.date ? a : b)).date;
      dates.forEach(({ date, strength }) => {
        let score = 1 + strength;
        if (DATE_KEYWORDS.test(c)) score += 5;
        else if (DATE_KEYWORDS.test(prev) && !NON_DUE_KEYWORDS.test(prev)) score += 3;
        if (NON_DUE_KEYWORDS.test(c)) score -= 4;
        // "2026.01.01 ~ 2026.12.31" 같은 기간 표기는 끝 날짜가 마감일
        if (dates.length > 1 && date === latestOnLine) score += 2;
        const diff = daysBetween(todayIso, date);
        if (diff >= 0) score += 2;
        if (diff < -365) score -= 3;
        if (diff > 365 * 15) score -= 3;
        candidates.push({ date, score, line: i });
      });
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : -1));
    return candidates[0].date;
  }

  function cleanTitle(s) {
    return fixSpacing(s)
      .replace(/^[\s:：\-·•*#>\])]+/, '')
      .replace(/[\s:：\-·•*#<\[(]+$/, '')
      .trim()
      .slice(0, 40);
  }

  function looksLikeTitle(line) {
    const c = compact(line);
    if (c.length < 2 || c.length > 40) return false;
    if (TITLE_STOP_WORDS.test(c)) return false;
    if (datesInLine(line, '2000-01-01').length) return false;
    const digits = (c.match(/\d/g) || []).length;
    if (digits / c.length > 0.4) return false;
    const letters = (c.match(/[가-힣A-Za-z]/g) || []).length;
    return letters >= 2 && letters / c.length >= 0.5;
  }

  /** 항목명을 추정한다. 라벨(상품명: ...)이 있으면 우선, 없으면 상단의 의미 있는 줄. */
  function extractTitle(lines) {
    for (let i = 0; i < lines.length; i++) {
      const m = compact(lines[i]).match(TITLE_LABEL);
      if (!m) continue;
      const original = lines[i];
      const colon = original.search(/[:：]/);
      let value = colon >= 0 ? original.slice(colon + 1) : m[2];
      if (!compact(value) && lines[i + 1]) value = lines[i + 1];
      value = cleanTitle(value);
      if (value.length >= 2) return value;
    }
    const scored = lines
      .map((line, i) => ({ line: fixSpacing(line), i }))
      .filter(({ line }) => looksLikeTitle(line))
      .map(({ line, i }) => {
        const korean = (line.match(/[가-힣]/g) || []).length;
        let score = korean * 0.5 - i * 0.8;
        if (korean >= 2) score += 3;
        return { line, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored.length ? cleanTitle(scored[0].line) : '';
  }

  /** 금액을 추정한다. 합계/결제금액 줄을 우선하고, 없으면 "원" 표기 중 최대값. */
  function extractAmount(lines) {
    const toNum = (s) => Number(String(s).replace(/[^\d]/g, ''));
    const valid = (n) => n >= 100 && n < 100000000;
    const priority = /(합계|총액|총금액|결제금액|받을금액|청구금액|납부금액|판매금액|금액|가격|정가|TOTAL)/i;

    for (const line of lines) {
      if (!priority.test(compact(line))) continue;
      const nums = (line.match(/\d{1,3}(?:[,.]\d{3})+|\d{3,8}/g) || []).map(toNum).filter(valid);
      if (nums.length) return Math.max(...nums);
    }
    let best = 0;
    for (const line of lines) {
      const re = /(\d{1,3}(?:[,.]\d{3})+|\d{3,8})\s*원/g;
      let m;
      while ((m = re.exec(line))) {
        const n = toNum(m[1]);
        if (valid(n) && n > best) best = n;
      }
    }
    return best || null;
  }

  function guessCategory(text) {
    const c = compact(text);
    for (const [re, categoryId, sub] of CATEGORY_RULES) {
      if (re.test(c)) return { categoryId, sub };
    }
    return null;
  }

  /**
   * @param {string} text  OCR 원문
   * @param {{today?: string}} [opts]  today: 'YYYY-MM-DD' (테스트용)
   * @returns {{title: string, dueDate: string|null, amount: number|null, category: {categoryId: string, sub: string}|null}}
   */
  function parse(text, opts = {}) {
    const now = new Date();
    const todayIso = opts.today || iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const lines = toLines(text);
    return {
      title: extractTitle(lines),
      dueDate: extractDueDate(lines, todayIso),
      amount: extractAmount(lines),
      category: guessCategory(text),
    };
  }

  const api = { parse, extractDueDate, extractTitle, extractAmount, guessCategory, toLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OCRParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
