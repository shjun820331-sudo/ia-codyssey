# 국내 여행 추천 프로그램

## 1. 프로그램 개요
여행 날짜를 입력하면 Gemini API가 그 시기에 여행하기 좋은 국내 지역을 추천하고, Kakao Local API로 해당 지역의 맛집을 검색한 뒤, 두 결과를 종합해 최종 여행 리포트를 생성하는 CLI 프로그램입니다.

- LLM API: Google Gemini (`gemini-flash-latest`)
- 지도/장소 API: Kakao Local

## 2. 실행 방법

### 사전 준비
```bash
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### API 키 설정
1. 프로젝트 루트에 `.env` 파일을 만듭니다. (`.env.example`을 복사해서 사용하세요.)
2. 아래 내용을 채워 넣습니다. (⚠️ 실제 키 값은 절대 GitHub 등에 올리지 마세요)

```
GEMINI_API_KEY=your_key_here
KAKAO_API_KEY=your_key_here
```

- `GEMINI_API_KEY`는 [Google AI Studio](https://aistudio.google.com/)에서 발급합니다.
- `KAKAO_API_KEY`는 [Kakao Developers](https://developers.kakao.com/)에서 발급한 REST API 키이며, 해당 앱에서 **Maps(지도) 서비스**가 활성화되어 있어야 합니다. (비활성화 시 맛집 검색에서 403 오류가 발생합니다.)

3. `.env`는 `.gitignore`에 포함되어 있어 git에 커밋되지 않습니다.

### 실행
```bash
python travel_planner.py --date "2026-03-15"
```

API 키가 설정되지 않은 상태로 실행하면 프로그램은 즉시 종료되며 설정 방법을 안내합니다.

## 3. 결과물 확인 방법
- `results/` 폴더에 실행 날짜 기준으로 아래 파일이 생성됩니다.
  - `{날짜}_travel_data.json` : 1차 추천 결과 + 맛집 검색 결과 + 오류 요약
  - `{날짜}_travel_plan.md` : 최종 여행 리포트

## 4. 보안 주의사항
- API 키는 코드나 README, 결과 파일 어디에도 직접 작성하지 않습니다.
- `.env` 파일을 통해서만 키를 관리하며, `.gitignore`로 커밋을 방지합니다.
- 키가 노출되었다고 의심되면 즉시 발급처(Google AI Studio / Kakao Developers)에서 키를 재발급하세요.

## 5. 주요 기능
- 날짜 기반 여행지 1차 추천 (Gemini): `recommended_city`, `weather`, `events`, `reason` 구조화 JSON 생성
- Kakao Local API 기반 맛집 검색 (최대 5곳)
- 맛집 검색 결과가 0건이거나 지도 API 인증/네트워크 오류가 발생해도 중단 없이 "데이터 없음"으로 리포트 생성 계속 진행
- Gemini 응답 JSON 파싱 실패 시 1회 재시도 (필수 키만 다시 출력하도록 프롬프트 강화)
- 모든 오류는 내부적으로 기록되어 원본 JSON과 최종 리포트의 "오류 요약 (errors)" 섹션에 반영

## 6. 알려진 제약사항
- 단일 지역 추천만 지원합니다 (복수 지역 추천은 미구현).
- 같은 날짜로 재실행해도 매번 API를 새로 호출합니다 (결과 캐싱 미구현).
