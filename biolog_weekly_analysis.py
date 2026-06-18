# -*- coding: utf-8 -*-
"""
BioLog Weekly Analysis
- biolog_data.json 에서 최근 7일 데이터 읽기
- Google Gemini API로 전문 분석 (무료 티어)
- KakaoTalk으로 자동 전송
- 실행: GitHub Actions (매주 일요일 07:00 KST)
"""

import json, os, requests
from datetime import datetime

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_FILE  = os.path.join(BASE_DIR, "biolog_data.json")
TOKEN_FILE = os.path.join(BASE_DIR, "kakao_token.json")
IS_CI      = os.environ.get("GITHUB_ACTIONS") == "true"

# ── 데이터 로드 ───────────────────────────────────────

def load_biolog():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    entries = raw.get("entries", raw) if isinstance(raw, dict) else raw
    entries = sorted(entries, key=lambda x: x["date"])
    return entries[-7:]  # 최근 7일

# ── Gemini API 분석 ───────────────────────────────────

def analyze_with_gemini(entries):
    import google.generativeai as genai

    lines = []
    for e in entries:
        lines.append(
            f"[{e['date']}] 혈당:{e.get('glucose','-')}mg/dL "
            f"수면:{e.get('sleepHours','-')}h "
            f"전날RPE:{e.get('prevRpe','-')}({e.get('prevType','-')}) "
            f"당일RPE:{e.get('todayRpe','-')}({e.get('todayType','-')}) "
            f"단백질:{e.get('protein','-')} "
            f"컨디션:{e.get('condition','-')}/5"
            + (f" 메모:{e['notes']}" if e.get('notes') else "")
        )
    data_str = "\n".join(lines)

    glucoses = [float(e.get("glucose", 0)) for e in entries if e.get("glucose")]
    sleeps   = [float(e.get("sleepHours", 0)) for e in entries if e.get("sleepHours")]
    avg_glucose = round(sum(glucoses) / len(glucoses), 1) if glucoses else "-"
    avg_sleep   = round(sum(sleeps)   / len(sleeps),   1) if sleeps   else "-"

    prompt = f"""당신은 대사질환·운동생리학·스포츠영양 분야 10년 이상 경력의 전문가입니다.
아래 1주일 BioLog 데이터를 분석해 카카오톡 메시지로 피드백을 작성해주세요.

[사용자 프로필]
- 테넬리아정(테네리글립틴+메트포르민 500mg 최저용량) + 베르베린 복용 중
- 새벽현상(Dawn Phenomenon) 강하게 나타남 → 기상 직후 혈당이 실제보다 높음
- 고볼륨 풀ROM 하체 중심 훈련, 역도화 사용
- 취침 전 카제인(요프로) + 소량 탄수 루틴

[이번 주 데이터]
{data_str}

[평균] 공복혈당 {avg_glucose}mg/dL | 수면 {avg_sleep}h

[작성 형식 — 카카오톡 메시지, 400자 이내]
📊 이번 주 총평 한 줄
혈당: 패턴 분석 (새벽현상 감안)
운동: 강도-혈당 상관 평가
수면: 영향 평가
✅ 잘한 점
⚡ 개선 포인트 1가지
💡 다음 주 핵심 권장사항 1가지"""

    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model    = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content(prompt)
    return response.text

# ── 카카오 토큰 관리 ──────────────────────────────────

def load_token():
    if IS_CI:
        return {
            "access_token":  "",
            "refresh_token": os.environ["KAKAO_REFRESH_TOKEN"],
            "client_id":     os.environ["KAKAO_CLIENT_ID"],
            "client_secret": os.environ["KAKAO_CLIENT_SECRET"],
        }
    with open(TOKEN_FILE, "r") as f:
        return json.load(f)

def save_token(data):
    if not IS_CI:
        with open(TOKEN_FILE, "w") as f:
            json.dump(data, f, indent=2)

def get_fresh_access_token(token_data):
    res = requests.post("https://kauth.kakao.com/oauth/token", data={
        "grant_type":    "refresh_token",
        "client_id":     token_data["client_id"],
        "client_secret": token_data["client_secret"],
        "refresh_token": token_data["refresh_token"],
    })
    result = res.json()
    if "access_token" in result:
        token_data["access_token"] = result["access_token"]
        if "refresh_token" in result:
            token_data["refresh_token"] = result["refresh_token"]
        save_token(token_data)
        return token_data
    raise Exception(f"토큰 갱신 실패: {result}")

def send_kakao(message):
    token_data = get_fresh_access_token(load_token())
    headers    = {"Authorization": f"Bearer {token_data['access_token']}"}
    payload    = {"template_object": json.dumps({
        "object_type": "text",
        "text": message,
        "link": {
            "web_url":        "https://youngmoneykor-bit.github.io/portfolio-dashboard/biolog.html",
            "mobile_web_url": "https://youngmoneykor-bit.github.io/portfolio-dashboard/biolog.html"
        }
    })}
    res = requests.post("https://kapi.kakao.com/v2/api/talk/memo/default/send",
                        headers=headers, data=payload)
    result = res.json()
    if result.get("result_code") == 0:
        print("카카오톡 전송 완료!")
    else:
        print(f"카카오톡 전송 실패: {res.text}")

# ── 메인 ─────────────────────────────────────────────

def main():
    print("BioLog 데이터 로드 중...")
    entries = load_biolog()
    if not entries:
        print("데이터 없음. 종료.")
        return

    week_start = entries[0]["date"]
    week_end   = entries[-1]["date"]
    print(f"분석 기간: {week_start} ~ {week_end} ({len(entries)}일)")

    print("Gemini API 분석 중...")
    analysis = analyze_with_gemini(entries)

    message = f"[BioLog 주간 분석]\n{week_start} ~ {week_end}\n\n{analysis}"
    print("\n" + "="*40)
    print(message)
    print("="*40)

    send_kakao(message)

if __name__ == "__main__":
    main()
