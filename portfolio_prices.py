# -*- coding: utf-8 -*-
"""
Portfolio Price Checker
- KR stocks : pykrx
- US stocks : yfinance
- Indicators: RSI / MACD / Bollinger Bands
- Output    : portfolio_report.html + KakaoTalk message
- 실행 환경  : 로컬(kakao_token.json) or GitHub Actions(환경변수)

pip install pykrx yfinance requests pandas
python portfolio_prices.py
"""

import warnings
warnings.filterwarnings("ignore")

from pykrx import stock
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
import webbrowser, os, json, requests, math

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(BASE_DIR, "kakao_token.json")
IS_CI      = os.environ.get("GITHUB_ACTIONS") == "true"  # GitHub Actions 여부

KR_STOCKS = {
    "Samsung":    "005930",
    "SK Hynix":   "000660",
    "Hyundai":    "005380",
    "Shinhan":    "055550",
    "KB Finance": "105560",
}
US_STOCKS = ["SPYM", "QQQM", "SCHD", "GOOGL", "PLTR", "TSLA", "ETN", "ANET"]

today   = datetime.today()
end     = today.strftime("%Y%m%d")
start_l = (today - timedelta(days=120)).strftime("%Y%m%d")

# ── 기술적 지표 ───────────────────────────────────────

def calc_rsi(series, period=14):
    delta = series.diff()
    gain  = delta.clip(lower=0).ewm(com=period - 1, min_periods=period).mean()
    loss  = (-delta.clip(upper=0)).ewm(com=period - 1, min_periods=period).mean()
    rs    = gain / loss.replace(0, float("nan"))
    return (100 - 100 / (1 + rs)).iloc[-1]

def calc_macd(series, fast=12, slow=26, signal=9):
    macd_line   = series.ewm(span=fast, adjust=False).mean() - series.ewm(span=slow, adjust=False).mean()
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line.iloc[-1], signal_line.iloc[-1]

def calc_bb(series, period=20):
    ma  = series.rolling(period).mean()
    std = series.rolling(period).std()
    return ma.iloc[-1], (ma + 2 * std).iloc[-1], (ma - 2 * std).iloc[-1]

def generate_comment(close_series):
    if len(close_series) < 30:
        return "데이터 부족"
    comments = []
    try:
        rsi = calc_rsi(close_series)
        if not math.isnan(rsi):
            if rsi >= 75:   comments.append(f"RSI {rsi:.0f} 강한 과매수")
            elif rsi >= 70: comments.append(f"RSI {rsi:.0f} 과매수 구간")
            elif rsi <= 25: comments.append(f"RSI {rsi:.0f} 강한 과매도")
            elif rsi <= 30: comments.append(f"RSI {rsi:.0f} 과매도 구간")
            else:           comments.append(f"RSI {rsi:.0f} 중립")
    except: pass
    try:
        macd, sig = calc_macd(close_series)
        comments.append("MACD 상승 추세" if macd > sig else "MACD 하락 추세")
    except: pass
    try:
        price = close_series.iloc[-1]
        _, upper, lower = calc_bb(close_series)
        pos = (price - lower) / (upper - lower) if (upper - lower) > 0 else 0.5
        if pos >= 0.95:   comments.append("볼린저 상단 돌파")
        elif pos >= 0.80: comments.append("볼린저 상단 근접")
        elif pos <= 0.05: comments.append("볼린저 하단 이탈")
        elif pos <= 0.20: comments.append("볼린저 하단 근접")
    except: pass
    return "  |  ".join(comments[:3]) if comments else "-"

# ── 데이터 수집 ───────────────────────────────────────

def get_kr_data():
    rows = []
    for name, ticker in KR_STOCKS.items():
        row = {"name": name, "ticker": ticker,
               "price": None, "prev": None, "change": None, "pct": None, "comment": "-"}
        try:
            df = stock.get_market_ohlcv(start_l, end, ticker)
            df = df[df["종가"] > 0]
            if len(df) < 2: rows.append(row); continue
            row["price"]   = int(df["종가"].iloc[-1])
            row["prev"]    = int(df["종가"].iloc[-2])
            row["change"]  = row["price"] - row["prev"]
            row["pct"]     = df["등락률"].iloc[-1]
            row["comment"] = generate_comment(df["종가"])
        except: row["comment"] = "조회 오류"
        rows.append(row)
    return rows

def get_us_data():
    rows = []
    for ticker in US_STOCKS:
        row = {"ticker": ticker,
               "price": None, "prev": None, "change": None, "pct": None, "comment": "-"}
        try:
            close = yf.Ticker(ticker).history(period="6mo")["Close"]
            if len(close) < 2: rows.append(row); continue
            row["price"]   = close.iloc[-1]
            row["prev"]    = close.iloc[-2]
            row["change"]  = row["price"] - row["prev"]
            row["pct"]     = (row["change"] / row["prev"]) * 100
            row["comment"] = generate_comment(close)
        except: row["comment"] = "조회 오류"
        rows.append(row)
    return rows

# ── 카카오 토큰 관리 ──────────────────────────────────

def load_token():
    """GitHub Actions: 환경변수 / 로컬: kakao_token.json"""
    if IS_CI:
        return {
            "access_token":  "",   # 매 실행마다 refresh로 새로 발급
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
    """refresh_token으로 access_token 새로 발급"""
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
    token_data = get_fresh_access_token(token_data)   # 항상 새 토큰 사용
    headers    = {"Authorization": f"Bearer {token_data['access_token']}"}
    payload    = {"template_object": json.dumps({
        "object_type": "text",
        "text": message,
        "link": {"web_url": "https://example.com", "mobile_web_url": "https://example.com"}
    })}
    res = requests.post("https://kapi.kakao.com/v2/api/talk/memo/default/send",
                        headers=headers, data=payload)
    print("카카오톡 전송 완료!" if res.json().get("result_code") == 0
          else f"카카오톡 전송 실패: {res.text}")

# ── 카카오 메시지 ─────────────────────────────────────

def build_kakao_message(kr_data, us_data):
    now   = today.strftime("%Y-%m-%d")
    lines = [f"[Portfolio {now}]", "", "< 국내 >"]
    for d in kr_data:
        if d["price"] is None:
            lines.append(f"{d['name']}: N/A"); continue
        s = "▲" if d["pct"] > 0 else ("▼" if d["pct"] < 0 else "-")
        lines.append(f"{d['name']}: {d['price']:,}원  {s}{abs(d['pct']):.2f}%")
        lines.append(f"  어제: {d['prev']:,}원  → {d['comment']}")
    lines += ["", "< 해외 >"]
    for d in us_data:
        if d["price"] is None:
            lines.append(f"{d['ticker']}: N/A"); continue
        s = "▲" if d["pct"] > 0 else ("▼" if d["pct"] < 0 else "-")
        lines.append(f"{d['ticker']}: ${d['price']:.2f}  {s}{abs(d['pct']):.2f}%")
        lines.append(f"  어제: ${d['prev']:.2f}  → {d['comment']}")
    return "\n".join(lines)

# ── HTML 생성 ─────────────────────────────────────────

def badge(pct):
    if pct is None: return '<span class="badge flat">-</span>'
    cls   = "up" if pct > 0 else ("down" if pct < 0 else "flat")
    arrow = "▲" if pct > 0 else ("▼" if pct < 0 else "━")
    return f'<span class="badge {cls}">{arrow} {abs(pct):.2f}%</span>'

def build_kr_rows(data):
    html = ""
    for d in data:
        cls   = "up" if (d["pct"] or 0) > 0 else ("down" if (d["pct"] or 0) < 0 else "")
        price = f"&#8361;{d['price']:,}" if d["price"] else "N/A"
        prev  = f"&#8361;{d['prev']:,}" if d["prev"] else "-"
        s     = "+" if (d["change"] or 0) >= 0 else "-"
        chg   = f"{s}&#8361;{abs(d['change']):,}" if d["change"] is not None else "-"
        html += f"""<tr class="{cls}">
          <td><b>{d['name']}</b><br><span class="sub">{d['ticker']}</span></td>
          <td class="mono right">{prev}</td><td class="mono right">{price}</td>
          <td class="mono right">{chg}</td><td class="right">{badge(d.get('pct'))}</td>
          <td><span class="comment">{d['comment']}</span></td></tr>"""
    return html

def build_us_rows(data):
    html = ""
    for d in data:
        cls   = "up" if (d["pct"] or 0) > 0 else ("down" if (d["pct"] or 0) < 0 else "")
        price = f"${d['price']:.2f}" if d["price"] else "N/A"
        prev  = f"${d['prev']:.2f}" if d["prev"] else "-"
        s     = "+" if (d["change"] or 0) >= 0 else "-"
        chg   = f"{s}${abs(d['change']):.2f}" if d["change"] is not None else "-"
        html += f"""<tr class="{cls}">
          <td><b>{d['ticker']}</b></td>
          <td class="mono right">{prev}</td><td class="mono right">{price}</td>
          <td class="mono right">{chg}</td><td class="right">{badge(d.get('pct'))}</td>
          <td><span class="comment">{d['comment']}</span></td></tr>"""
    return html

def generate_html(kr_data, us_data):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Portfolio Dashboard</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e0e0e0;padding:28px 16px}}
h1{{font-size:1.5rem;font-weight:700;color:#fff;margin-bottom:4px}}
.subtitle{{font-size:.82rem;color:#555;margin-bottom:28px}}
.card{{background:#1a1d27;border-radius:14px;padding:20px;border:1px solid #2a2d3a;margin-bottom:20px;max-width:1100px;margin-left:auto;margin-right:auto}}
.card h2{{font-size:.85rem;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #2a2d3a}}
table{{width:100%;border-collapse:collapse}}
td{{padding:9px 8px;font-size:.83rem;border-bottom:1px solid #1e2130;vertical-align:middle}}
tr:last-child td{{border-bottom:none}}
td.mono{{font-family:'SF Mono','Fira Code',monospace;font-size:.8rem}}
td.right{{text-align:right}}
tr.up td:first-child{{border-left:3px solid #26c281}}
tr.down td:first-child{{border-left:3px solid #e74c3c}}
tr td:first-child{{border-left:3px solid transparent;padding-left:12px}}
.sub{{color:#555;font-size:.72rem}}
.badge{{display:inline-block;padding:3px 8px;border-radius:20px;font-size:.75rem;font-weight:600;white-space:nowrap}}
.badge.up{{background:#0d3d27;color:#26c281}}
.badge.down{{background:#3d1111;color:#e74c3c}}
.badge.flat{{background:#222;color:#888}}
.comment{{font-size:.75rem;color:#a0a0b0}}
th{{color:#444;font-size:.72rem;font-weight:500;padding:6px 8px;text-align:right;border-bottom:1px solid #2a2d3a}}
th:first-child,th:last-child{{text-align:left}}
.footer{{text-align:center;margin-top:20px;font-size:.75rem;color:#333}}
</style></head><body>
<h1>Portfolio Dashboard</h1>
<p class="subtitle">기준 시각: {now}</p>
<div class="card"><h2>KR Stocks — KRX</h2>
<table><tr><th>종목</th><th>어제 종가</th><th>현재가</th><th>전일대비</th><th>등락률</th><th>기술적 분석</th></tr>
{build_kr_rows(kr_data)}</table></div>
<div class="card"><h2>US Stocks — NYSE / NASDAQ</h2>
<table><tr><th>티커</th><th>어제 종가</th><th>현재가</th><th>전일대비</th><th>등락률</th><th>기술적 분석</th></tr>
{build_us_rows(us_data)}</table></div>
<p class="footer">RSI 14 · MACD 12/26/9 · Bollinger 20 &nbsp;·&nbsp; pykrx &amp; yfinance &nbsp;·&nbsp; {now}</p>
</body></html>"""

# ── 메인 ─────────────────────────────────────────────

def main():
    print("데이터 및 지표 계산 중...")
    kr_data = get_kr_data()
    us_data = get_us_data()

    if not IS_CI:
        html     = generate_html(kr_data, us_data)
        out_path = os.path.join(BASE_DIR, "portfolio_report.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"HTML 리포트 생성: {out_path}")
        webbrowser.open(f"file:///{out_path}")

    send_kakao(build_kakao_message(kr_data, us_data))

if __name__ == "__main__":
    main()
