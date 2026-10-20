/* 공부사주 - AI 상담 (Claude API)
 * 정적 웹앱이라 서버가 없으므로 사용자가 입력한 본인 API 키로 브라우저에서 바로 호출한다.
 * 사주 계산은 하지 않고, 앱이 계산한 결과(summaryForAI)만 근거로 상담하게 한다.
 */
(function (root) {
  'use strict';

  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
  const MODEL = 'claude-opus-5-5';
  const MAX_PAUSE_CONTINUES = 3;

  let sdkPromise = null;
  function loadSdk() {
    if (!sdkPromise) sdkPromise = import(SDK_URL).then((m) => m.default || m.Anthropic);
    return sdkPromise;
  }

  function systemPrompt(summary, profile, today) {
    const who = profile.mode === 'parent'
      ? `상담 대상: 학부모. 자녀(${profile.name || '자녀'}, ${profile.grade || '학년 미입력'})의 공부·진로를 묻는다. 부모에게 말하되, 자녀를 어떻게 도울지(대화법·환경·역할)에 초점을 둔다.`
      : `상담 대상: 학생 본인(${profile.name || '학생'}, ${profile.grade || '학년 미입력'}). 학생에게 직접 말한다.`;
    return [
      '너는 명리학(사주) 해석과 교육 코칭을 함께 하는 "공부사주" 상담가다. 사주를 겁주는 운명론이 아니라, 아이의 기질과 시기 흐름을 이해해 공부·진로를 더 잘 설계하도록 돕는 도구로 쓴다.',
      '',
      `오늘 날짜: ${today}`,
      who,
      profile.concern ? `주요 고민: ${profile.concern}` : '',
      profile.goal ? `목표: ${profile.goal}` : '',
      '',
      '## 사주 분석 데이터 (앱이 만세력으로 계산한 값)',
      '아래 값만 근거로 쓴다. 사주팔자·대운·세운을 직접 다시 계산하거나 바꾸지 마라.',
      '```json',
      JSON.stringify(summary, null, 1),
      '```',
      '',
      '## 상담 방법',
      '- 사주 + 현실을 함께 본다: 학년, 학교 시험 일정(중간·기말·모의평가·수능), 입시 제도, 공부 습관, 친구·가족 관계, 사회와 직업 세계의 변화(AI 등)까지 고려한다.',
      '- 최신 정보가 답의 질을 좌우하면(입시 제도 변화, 올해 시험 일정, 직업·산업 전망) 웹 검색을 써서 확인하고, 검색한 사실은 출처와 함께 짧게 쓴다.',
      '- 질문이 모호하거나 꼭 필요한 정보(현재 성적대, 구체적 상황 등)가 없으면, 먼저 가정한 내용을 밝히고 답한 뒤 마지막에 한두 가지만 되물어라.',
      '- 답의 순서: ① 핵심 한 줄 ② 사주로 본 이유(일간·십신·용신·대운/세운/월운 중 관련된 것만, 쉬운 말로) ③ 지금 시기의 흐름 ④ 이번 주부터 할 수 있는 구체적 실천 2~4개 ⑤ 주의할 시기나 함정(있을 때만).',
      '- 명리 용어는 처음 나올 때 괄호로 쉽게 풀어 준다. 예: 인성(배우고 흡수하는 기운).',
      '- 모바일 화면에서 읽기 좋게 짧은 문단과 목록으로, 보통 400~900자로 답한다.',
      '',
      '## 지켜야 할 것',
      '- 단정·공포 표현 금지("망한다", "절대 안 된다"). 사주는 경향일 뿐이고 노력·환경·선택이 더 크게 작용한다는 관점을 유지한다.',
      '- 성적·합격을 보장하거나 특정 날짜의 결과를 예언하지 않는다. 부적·굿·유료 비방은 권하지 않는다.',
      '- 다른 아이와 비교하거나 아이를 깎아내리는 말을 하지 않는다.',
      '- 자해·자살 생각, 학대, 심한 우울·불안 신호가 보이면 상담을 멈추고 공감한 뒤 도움을 받을 곳을 먼저 안내한다: 자살예방상담전화 109, 청소년상담 1388(문자·카카오톡 가능), 긴급하면 112·119.',
      '- 건강·의학 문제는 전문가 상담을 권한다.',
    ].filter((l) => l !== '').join('\n');
  }

  // 응답 블록에서 화면에 보일 텍스트와 출처를 모은다
  function extract(content) {
    let text = '';
    const sources = [];
    for (const block of content) {
      if (block.type === 'text') {
        text += block.text;
        for (const c of block.citations || []) {
          if (c.url && !sources.some((s) => s.url === c.url)) sources.push({ url: c.url, title: c.title || c.url });
        }
      }
    }
    return { text, sources };
  }

  /**
   * @param opts.apiKey  사용자 API 키
   * @param opts.summary SajuAnalysis.summaryForAI 결과
   * @param opts.profile { mode, name, grade, concern, goal }
   * @param opts.history 지금까지의 messages 배열(assistant는 응답 content 블록을 그대로 보관)
   * @param opts.question 새 질문
   * @param opts.onText(fullTextSoFar) 스트리밍 중 호출
   * @param opts.signal AbortSignal
   * @returns { messages, text, sources }
   */
  async function ask(opts) {
    const Anthropic = await loadSdk();
    const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const system = systemPrompt(opts.summary, opts.profile, today);
    const messages = opts.history.concat([{ role: 'user', content: opts.question }]);

    let shown = '';
    for (let round = 0; round <= MAX_PAUSE_CONTINUES; round++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        cache_control: { type: 'ephemeral' },
        output_config: { effort: 'medium' },
        system,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'KR', timezone: 'Asia/Seoul' } }],
        messages,
      }, { signal: opts.signal });

      let acc = shown;
      stream.on('text', (delta) => {
        acc += delta;
        if (opts.onText) opts.onText(acc);
      });
      const msg = await stream.finalMessage();

      if (msg.stop_reason === 'refusal') {
        const err = new Error('refusal');
        err.kind = 'refusal';
        throw err;
      }
      messages.push({ role: 'assistant', content: msg.content });
      shown = acc;
      // 웹 검색이 길어져 서버가 턴을 잠시 멈추면, 그대로 다시 보내 이어서 받는다
      if (msg.stop_reason !== 'pause_turn') break;
    }

    // 여러 assistant 메시지(pause_turn 이어 받기)가 있으면 모두 합쳐 보여 준다
    const start = opts.history.length + 1;
    const all = messages.slice(start).flatMap((m) => m.content);
    const { text, sources } = extract(all);
    return { messages, text, sources };
  }

  function describeError(err, Anthropic) {
    if (err && err.kind === 'refusal') return '이 질문에는 답하기 어려워요. 표현을 바꿔 다시 물어봐 주세요.';
    if (err && err.name === 'AbortError') return '답변을 멈췄어요.';
    if (Anthropic) {
      if (err instanceof Anthropic.APIUserAbortError) return '답변을 멈췄어요.';
      if (err instanceof Anthropic.AuthenticationError) return 'API 키가 올바르지 않아요. 설정에서 키를 다시 확인해 주세요.';
      if (err instanceof Anthropic.PermissionDeniedError) return '이 API 키로는 사용할 수 없는 기능이에요. 콘솔에서 키 권한을 확인해 주세요.';
      if (err instanceof Anthropic.RateLimitError) return '요청이 많아 잠시 막혔어요. 1분쯤 뒤에 다시 시도해 주세요.';
      if (err instanceof Anthropic.BadRequestError) return `요청에 문제가 있어요: ${err.message}`;
      if (err instanceof Anthropic.APIConnectionError) return '인터넷 연결을 확인해 주세요.';
      if (err instanceof Anthropic.APIError) return `AI 서버 오류가 났어요(${err.status || '알 수 없음'}). 잠시 뒤 다시 시도해 주세요.`;
    }
    return `오류가 났어요: ${err && err.message ? err.message : err}`;
  }

  async function errorMessage(err) {
    let Anthropic = null;
    try { Anthropic = await loadSdk(); } catch (e) { /* SDK를 못 불러온 경우 */ }
    return describeError(err, Anthropic);
  }

  root.SajuCounsel = { ask, errorMessage, loadSdk, MODEL };
})(typeof globalThis !== 'undefined' ? globalThis : this);
