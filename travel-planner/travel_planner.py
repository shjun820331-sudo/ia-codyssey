#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

GEMINI_MODEL = "gemini-flash-latest"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)
KAKAO_LOCAL_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

REQUIRED_RECOMMENDATION_KEYS = ["recommended_city", "weather", "events", "reason"]


def parse_args():
    parser = argparse.ArgumentParser(
        description="LLM + 지도 API를 조합한 국내 여행 추천 프로그램"
    )
    parser.add_argument("--date", "-date", required=True, help="여행 날짜 (YYYY-MM-DD)")
    return parser.parse_args()


def validate_date(date_str):
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def load_api_keys():
    load_dotenv()
    gemini_key = os.getenv("GEMINI_API_KEY")
    kakao_key = os.getenv("KAKAO_API_KEY")

    missing = []
    if not gemini_key:
        missing.append("GEMINI_API_KEY")
    if not kakao_key:
        missing.append("KAKAO_API_KEY")

    if missing:
        print("[오류] 다음 API 키가 설정되지 않았습니다:", ", ".join(missing))
        print()
        print("설정 방법:")
        print("  1) 프로젝트 루트에 .env 파일을 만들고 아래처럼 작성하세요.")
        print('     GEMINI_API_KEY="YOUR_GEMINI_KEY"')
        print('     KAKAO_API_KEY="YOUR_KAKAO_REST_API_KEY"')
        print("  2) 또는 터미널에서 환경변수로 직접 설정하세요.")
        print('     export GEMINI_API_KEY="YOUR_GEMINI_KEY"')
        print('     export KAKAO_API_KEY="YOUR_KAKAO_REST_API_KEY"')
        sys.exit(1)

    return gemini_key, kakao_key


def extract_json_from_text(text):
    text = text.strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("응답에서 JSON 객체를 찾을 수 없습니다.")
    return json.loads(match.group(0))


def call_gemini(prompt, api_key):
    headers = {"Content-Type": "application/json"}
    params = {"key": api_key}
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7},
    }
    resp = requests.post(GEMINI_URL, headers=headers, params=params, json=body, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini API 오류: HTTP {resp.status_code} - {resp.text[:200]}")
    data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Gemini 응답 파싱 실패: {e}")


def build_recommendation_prompt(date_str, strict=False):
    prompt = f"""당신은 국내 여행 추천 전문가입니다. {date_str} 에 여행하기 좋은 국내(한국) 지역을 1곳 추천해주세요.

반드시 아래 스키마를 따르는 JSON만 출력하세요. 설명, 마크다운, 코드블록 없이 순수 JSON 객체 하나만 출력합니다.

{{
  "recommended_city": "string, 예: 제주",
  "weather": "string, 해당 시기 일반적 날씨 요약",
  "events": ["string, 행사/축제 후보 1~3개"],
  "reason": "string, 추천 근거 2~4문장"
}}"""
    if strict:
        prompt += (
            "\n\n중요: recommended_city, weather, events, reason 이 4개 키만 포함한 "
            "JSON 객체 하나만 출력하세요. 다른 텍스트는 절대 포함하지 마세요."
        )
    return prompt


def validate_recommendation_schema(data):
    for key in REQUIRED_RECOMMENDATION_KEYS:
        if key not in data:
            raise ValueError(f"필수 키 누락: {key}")


def get_recommendation(date_str, gemini_key, errors):
    try:
        text = call_gemini(build_recommendation_prompt(date_str), gemini_key)
        data = extract_json_from_text(text)
        validate_recommendation_schema(data)
        return data
    except Exception as e:
        errors.append({"step": "recommendation", "type": "PARSE_ERROR_RETRY", "message": str(e)})
        try:
            text = call_gemini(build_recommendation_prompt(date_str, strict=True), gemini_key)
            data = extract_json_from_text(text)
            validate_recommendation_schema(data)
            return data
        except Exception as e2:
            errors.append({"step": "recommendation", "type": "PARSE_ERROR", "message": str(e2)})
            return {
                "recommended_city": "제주",
                "weather": "정보 없음 (LLM 응답 파싱 실패)",
                "events": [],
                "reason": "LLM 응답 파싱에 실패하여 기본값을 사용합니다.",
            }


def search_restaurants(city, kakao_key, errors, limit=5):
    headers = {"Authorization": f"KakaoAK {kakao_key}"}
    params = {"query": f"{city} 맛집", "size": limit}

    try:
        resp = requests.get(KAKAO_LOCAL_URL, headers=headers, params=params, timeout=15)
    except requests.RequestException as e:
        errors.append({"step": "place_search", "type": "NETWORK_ERROR", "message": str(e)})
        return []

    if resp.status_code in (401, 403):
        errors.append(
            {"step": "place_search", "type": "AUTH_ERROR", "message": f"HTTP {resp.status_code}"}
        )
        return []
    if resp.status_code != 200:
        errors.append(
            {
                "step": "place_search",
                "type": "API_ERROR",
                "message": f"HTTP {resp.status_code} - {resp.text[:200]}",
            }
        )
        return []

    documents = resp.json().get("documents", [])
    if not documents:
        errors.append(
            {
                "step": "place_search",
                "type": "EMPTY_RESULT",
                "message": f"0 results for query={city} 맛집",
            }
        )
        return []

    restaurants = []
    for doc in documents[:limit]:
        restaurants.append(
            {
                "name": doc.get("place_name", ""),
                "address": doc.get("road_address_name") or doc.get("address_name", ""),
                "category": doc.get("category_name", ""),
                "url": doc.get("place_url", ""),
                "x": doc.get("x"),
                "y": doc.get("y"),
            }
        )
    return restaurants


def build_report_prompt(date_str, recommendation, restaurants):
    restaurants_text = json.dumps(restaurants, ensure_ascii=False, indent=2) if restaurants else "[]"
    return f"""아래 데이터를 바탕으로 국내 여행 리포트를 Markdown으로 작성하세요.

날짜: {date_str}
1차 추천 데이터: {json.dumps(recommendation, ensure_ascii=False, indent=2)}
맛집 검색 결과: {restaurants_text}

작성 규칙:
- 출력은 Markdown 텍스트만 출력하고 다른 설명은 하지 마세요.
- 최상위 제목은 "# {date_str} 국내 여행 추천 리포트" 로 시작하세요.
- 아래 섹션을 이 순서대로 모두 포함하세요.
  ## 추천 지역
  ## 추천 이유
  ## 날씨 요약
  ## 행사/축제
  ## 맛집 추천
  ## (선택) 1일 일정 제안
- 맛집 검색 결과가 빈 배열이면 "## 맛집 추천" 섹션에 "데이터 없음 (장소 검색 결과 0건)"이라고 표기하세요.
- 맛집 검색 결과가 있으면 아래 형식의 번호 목록으로 정리하세요.
  1. **{{name}}** - {{category}}
     - 주소: {{address}}
     - 링크: {{url}}
- "(선택) 1일 일정 제안"은 오전/오후/저녁 수준으로 간단히 제안하세요.
- "오류 요약 (errors)" 섹션은 작성하지 마세요. (별도로 추가됩니다)
"""


def strip_code_fence(text):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:markdown)?\n", "", text)
        text = re.sub(r"\n```$", "", text)
    return text


def fallback_report(date_str, recommendation, restaurants):
    lines = [f"# {date_str} 국내 여행 추천 리포트", ""]
    lines.append("## 추천 지역")
    lines.append(f"- {recommendation.get('recommended_city', '정보 없음')}")
    lines.append("")
    lines.append("## 추천 이유")
    lines.append(recommendation.get("reason", "정보 없음"))
    lines.append("")
    lines.append("## 날씨 요약")
    lines.append(recommendation.get("weather", "정보 없음"))
    lines.append("")
    lines.append("## 행사/축제")
    events = recommendation.get("events") or []
    if events:
        lines.extend(f"- {e}" for e in events)
    else:
        lines.append("- 데이터 없음")
    lines.append("")
    lines.append("## 맛집 추천")
    if restaurants:
        for i, r in enumerate(restaurants, 1):
            lines.append(f"{i}. **{r['name']}** - {r.get('category', '')}")
            lines.append(f"   - 주소: {r.get('address', '')}")
            lines.append(f"   - 링크: {r.get('url', '')}")
    else:
        lines.append("- 데이터 없음 (장소 검색 결과 0건)")
    lines.append("")
    lines.append("## (선택) 1일 일정 제안")
    lines.append("- 리포트 생성 실패로 상세 일정을 제공할 수 없습니다.")
    return "\n".join(lines)


def errors_section(errors):
    lines = ["", "## 오류 요약 (errors)"]
    if errors:
        lines.extend(f"- [{e.get('step')}] {e.get('type')}: {e.get('message')}" for e in errors)
    else:
        lines.append("- 오류 없음")
    return "\n" + "\n".join(lines) + "\n"


def generate_report(date_str, recommendation, restaurants, errors, gemini_key):
    try:
        text = call_gemini(build_report_prompt(date_str, recommendation, restaurants), gemini_key)
        report_md = strip_code_fence(text)
    except Exception as e:
        errors.append({"step": "report_generation", "type": "LLM_ERROR", "message": str(e)})
        report_md = fallback_report(date_str, recommendation, restaurants)

    return report_md + errors_section(errors)


def save_results(date_str, recommendation, restaurants, errors, report_md):
    results_dir = Path("results")
    results_dir.mkdir(exist_ok=True)

    raw_data = {
        "date": date_str,
        "recommendation": recommendation,
        "restaurants": restaurants,
        "errors": errors,
    }

    raw_path = results_dir / f"{date_str}_travel_data.json"
    report_path = results_dir / f"{date_str}_travel_plan.md"

    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(raw_data, f, ensure_ascii=False, indent=2)

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_md)

    return raw_path, report_path


def main():
    args = parse_args()

    if not validate_date(args.date):
        print(f"[오류] 날짜 형식이 올바르지 않습니다: {args.date}")
        print('사용법: python travel_planner.py --date "YYYY-MM-DD"')
        print('예시:   python travel_planner.py --date "2026-03-15"')
        sys.exit(1)

    gemini_key, kakao_key = load_api_keys()
    errors = []

    print("[1/3] 1차 추천 생성 중(LLM)...")
    recommendation = get_recommendation(args.date, gemini_key, errors)
    print(f'    - recommended_city: "{recommendation.get("recommended_city")}"')

    print("[2/3] 맛집 검색 중(지도/장소 API)...")
    restaurants = search_restaurants(recommendation.get("recommended_city", ""), kakao_key, errors)
    if restaurants:
        print(f"    - 맛집 {len(restaurants)}곳 검색 완료")
    else:
        print("    - 검색 결과 0건 또는 오류 발생 (데이터 없음으로 진행)")

    print("[3/3] 최종 리포트 생성 중(LLM)...")
    report_md = generate_report(args.date, recommendation, restaurants, errors, gemini_key)
    print("    - 리포트 생성 완료")

    raw_path, report_path = save_results(args.date, recommendation, restaurants, errors, report_md)

    print()
    print(f"완료! {report_path} 를 확인하세요.")
    print(f"원본 데이터: {raw_path}")


if __name__ == "__main__":
    main()
