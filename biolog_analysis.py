# -*- coding: utf-8 -*-
"""
BioLog Weekly Analysis
- biolog_data.json 읽어서 지난 7일치 분석
- 혈당 평균/추세, RPE 누적 부하, 수면 패턴, 룰 엔진 경고
- KakaoTalk "나에게 보내기" 전송

실행 방법:
  python biolog_analysis.py

GitHub Actions 환경변수:
  KAKAO_REFRESH_TOKEN, KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET
"""

import json, os, requests
from datetime import datetime, timedelta

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(BASE_DIR, "kakao_token.json")
DATA_FILE  = os.path.join(BASE_DIR, "biolog_data.json")
IS_CI      = os.environ.get("GITHUB_ACTIONS") == "true"

# ── 토큰 관리 (portfolio_prices.py 와 동일 방식) ──────
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
    res    = requests.post("https://kauth.kakao.com/oauth/token", data={
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
    token_data = load_token()
    token_data = get_fresh_access_token(token_data)
    headers    = {"Authorization": f"Bearer {token_data['access_token']}"}
    payload    = {"template_object": json.dumps({
        "object_type": "text",
        "text": message,
        "link": {"web_url": "https://example.com", "mobile_web_url": "https://example.com"}
    })}
    res = requests.post("https://kapi.kakao.com/v2/api/talk/memo/default/send",
                        headers=headers, data=payload)
    result = res.json()
    if result.get("result_code") == 0:
        print("카카오톡 전송 완료!")
    else:
        print(f"카카오톡 전송 실패: {res.text}")

# ── 데이터 로드 ───────────────────────────────────────
def load_data():
    if not os.path.exists(DATA_FILE):
        print(f"[경고] {DATA_FILE} 없음. 대시보드에서 내보내기 후 같은 폴더에 저장해.")
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    # {"entries": [...]} 또는 [...] 두 형식 모두 지원
    return raw.get("entries", raw) if isinstance(raw, dict) else raw

# ── 분석 ─────────────────────────────────────────────
def analyze(entries, days=7):
    """지난 N일치 항목 필터링 및 통계 계산"""
    cutoff = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")
    week   = [e for e in entries if e.get("date", "") >= cutoff]

    if not week:
        return None

    week.sort(key=lambda e: e["date"])

    glucoses   = [float(e["glucose"])    for e in week if e.get("glucose")]
    sleeps     = [float(e["sleepHours"]) for e in week if e.get("sleepHours")]
    prev_rpes  = [float(e["prevRpe"])    for e in week if e.get("prevRpe")]
    today_rpes = [float(e.get("todayRpe", e.get("prevRpe", 0))) for e in week]

    avg_glucose = sum(glucoses)  / len(glucoses)  if glucoses  else 0
    avg_sleep   = sum(sleeps)    / len(sleeps)     if sleeps    else 0
    avg_rpe     = sum(today_rpes)/ len(today_rpes) if today_rpes else 0
    max_glucose = max(glucoses)  if glucoses else 0
    min_glucose = min(glucoses)  if glucoses else 0

    # 혈당 추세 (선형 기울기: 양수=상승, 음수=하강)
    if len(glucoses) >= 2:
        n = len(glucoses)
        x_mean = (n - 1) / 2
        y_mean = avg_glucose
        num   = sum((i - x_mean) * (glucoses[i] - y_mean) for i in range(n))
        denom = sum((i - x_mean) ** 2 for i in range(n))
        slope = num / denom if denom else 0
    else:
        slope = 0

    # 경고 플래그
    warnings = []

    # 수면 6시간 미만 일수
    low_sleep_days = sum(1 for s in sleeps if s < 6)
    if low_sleep_days >= 2:
        warnings.append(f"수면 부족 {low_sleep_days}일 — 인슐린저항 누적 위험")

    # 고강도 후 단백질 미섭취
    for e in week:
        rpe   = float(e.get("prevRpe", 0))
        prot  = e.get("protein", "없음")
        if rpe >= 8 and prot == "없음":
            warnings.append(f"{e['date']} 고강도 후 단백질 미섭취 → 혈당 상승 리스크")

    # 고강도 + 단식 중복
    for e in week:
        rpe  = float(e.get("todayRpe", e.get("prevRpe", 0)))
        fast = e.get("fastingPlan", "평소")
        if rpe >= 8 and fast != "평소":
            warnings.append(f"{e['date']} 고강도 + 단식 이중 부하")

    # 혈당 상승 추세
    if slope > 2:
        warnings.append(f"혈당 상승 추세 감지 (기울기: +{slope:.1f} mg/dL/일)")
    elif slope < -2:
        pass  # 하강은 좋은 신호

    # 연속 고강도 (3일 이상)
    high_streak = 0
    max_streak  = 0
    for e in week:
        rpe = float(e.get("todayRpe", e.get("prevRpe", 0)))
        if rpe >= 7:
            high_streak += 1
            max_streak = max(max_streak, high_streak)
        else:
            high_streak = 0
    if max_streak >= 3:
        warnings.append(f"연속 고강도 {max_streak}일 — 과훈련·코르티솔 축적 주의")

    # 세션 구성
    session_counts = {}
    for e in week:
        t = e.get("todayType", e.get("prevType", "미분류"))
        session_counts[t] = session_counts.get(t, 0) + 1

    return {
        "week":         week,
        "count":        len(week),
        "date_range":   f"{week[0]['date']} ~ {week[-1]['date']}",
        "avg_glucose":  avg_glucose,
        "max_glucose":  max_glucose,
        "min_glucose":  min_glucose,
        "slope":        slope,
        "avg_sleep":    avg_sleep,
        "avg_rpe":      avg_rpe,
        "low_sleep_days": low_sleep_days,
        "session_counts": session_counts,
        "warnings":     warnings,
    }

# ── 메시지 생성 ───────────────────────────────────────
def build_message(stats):
    if stats is None:
        return "[BioLog] 이번 주 데이터 없음\n내보내기 후 biolog_data.json을 업로드해줘."

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # 혈당 트렌드 표시
    if stats["slope"] > 1.5:
        trend = f"▲ 상승세 (+{stats['slope']:.1f}/일)"
    elif stats["slope"] < -1.5:
        trend = f"▼ 하강세 ({stats['slope']:.1f}/일)"
    else:
        trend = "→ 안정"

    # 수면 평가
    sleep_grade = "양호" if stats["avg_sleep"] >= 7 else ("보통" if stats["avg_sleep"] >= 6 else "부족")

    # 운동 구성
    session_str = "  ".join(f"{t}×{n}" for t, n in stats["session_counts"].items())

    # 경고 메시지
    warn_lines = ""
    if stats["warnings"]:
        warn_lines = "\n⚠ 경고\n" + "\n".join(f"  · {w}" for w in stats["warnings"][:4])
    else:
        warn_lines = "\n✓ 이번 주 특이 경고 없음"

    message = f"""[BioLog 주간 리포트] {now}
기간: {stats['date_range']} ({stats['count']}일)

< 혈당 >
  평균  : {stats['avg_glucose']:.1f} mg/dL
  범위  : {stats['min_glucose']:.0f} ~ {stats['max_glucose']:.0f}
  추세  : {trend}

< 수면 >
  평균  : {stats['avg_sleep']:.1f}h  ({sleep_grade})
  6h 미만: {stats['low_sleep_days']}일

< 운동 >
  평균 RPE: {stats['avg_rpe']:.1f}
  세션 구성: {session_str}
{warn_lines}"""

    return message.strip()

# ── 메인 ─────────────────────────────────────────────
def main():
    print("BioLog 주간 분석 시작...")
    entries = load_data()
    if not entries:
        print("분석할 데이터 없음.")
        return

    stats   = analyze(entries, days=7)
    message = build_message(stats)

    print("\n" + "="*50)
    print(message)
    print("="*50 + "\n")

    send_kakao(message)

if __name__ == "__main__":
    main()
