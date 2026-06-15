import { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Info, Activity, Pencil, X, Download, Upload } from "lucide-react";

const STORAGE_KEY = "biolog:entries:v1";

const SEED_ENTRIES = [
  {
    date: "2026-05-31",
    glucose: 105,
    prevRpe: 4,
    prevType: "저강도 유산소",
    todayRpe: 9,
    todayType: "고강도 근력",
    sleepHours: 9,
    protein: "카제인",
    fastingPlan: "평소",
    condition: 3,
    notes: "역도화 첫 착용 / 풀ROM 집중 / 16,560kg",
  },
  {
    date: "2026-06-01",
    glucose: 106,
    prevRpe: 9,
    prevType: "고강도 근력",
    todayRpe: 1,
    todayType: "휴식",
    sleepHours: 7,
    protein: "카제인",
    fastingPlan: "평소",
    condition: 4,
    notes: "특이사항 없음",
  },
  {
    date: "2026-06-02",
    glucose: 98,
    prevRpe: 2,
    prevType: "저강도 유산소",
    todayRpe: 7,
    todayType: "중강도",
    sleepHours: 6.5,
    protein: "카제인",
    fastingPlan: "평소",
    condition: 4,
    notes: "DOMS 매우 강력",
  },
  {
    date: "2026-06-03",
    glucose: 101,
    prevRpe: 7,
    prevType: "중강도",
    todayRpe: 4,
    todayType: "중강도",
    sleepHours: 8.5,
    protein: "없음",
    fastingPlan: "평소",
    condition: 4,
    notes: "단백질 대량 섭취",
  },
  {
    date: "2026-06-05",
    glucose: 102,
    prevRpe: 4,
    prevType: "저강도 유산소",
    todayRpe: 7,
    todayType: "중강도",
    sleepHours: 6.5,
    protein: "없음",
    fastingPlan: "평소",
    condition: 4,
    notes: "등 루틴 진행",
  },
  {
    date: "2026-06-06",
    glucose: 109,
    prevRpe: 5,
    prevType: "중강도",
    todayRpe: 9,
    todayType: "고강도 근력",
    sleepHours: 6,
    protein: "카제인",
    fastingPlan: "평소",
    condition: 4,
    notes: "데드 140kg top set / 스쿼트 100kg×5 / 고블릿+하이퍼 추가 / 총볼륨 15,089kg",
  },
  {
    date: "2026-06-09",
    glucose: 99,
    prevRpe: 4,
    prevType: "저강도 유산소",
    todayRpe: 6,
    todayType: "중강도",
    sleepHours: 7,
    protein: "유청+카제인",
    fastingPlan: "평소",
    condition: 4,
    notes: "리셋 주 / 기능성 근력 + 5.5km 러닝 / 실론 시나몬+블루베리 / 야간작업 후 주간수면 06~13시 / 측정 오후1시 — 새벽현상 제외구간 / 일주기 역전",
  },
];

const C = {
  bg: "#0b0f14",
  panel: "#13191f",
  panel2: "#181f28",
  border: "#1e2830",
  text: "#dde3ea",
  sub: "#7a8898",
  faint: "#3d4d5c",
  teal: "#2dd4bf",
  coral: "#f08060",
  amber: "#f0b429",
  red: "#e05050",
  green: "#82c95e",
  blue: "#5b9cf6",
  purple: "#a78bfa",
};

const SESSION_TYPES = ["고강도 근력", "중강도", "저강도 유산소", "휴식"];
const PROTEIN_OPTS  = ["없음", "유청", "카제인", "유청+카제인"];
const FASTING_OPTS  = ["평소", "16:8", "24시간+"];

const todayStr = () => new Date().toISOString().slice(0, 10);

const blankForm = () => ({
  date: todayStr(),
  glucose: "",
  prevRpe: 5,
  prevType: "중강도",
  todayRpe: 5,
  todayType: "중강도",
  sleepHours: "",
  protein: "없음",
  fastingPlan: "평소",
  condition: 3,
  notes: "",
});

function evaluateRules(e, baseline, n) {
  const flags = [];
  const g        = Number(e.glucose);
  const prevRpe  = Number(e.prevRpe);
  const todayRpe = Number(e.todayRpe ?? e.prevRpe);
  const sleep    = Number(e.sleepHours);
  const highPrev  = prevRpe >= 8;
  const highToday = todayRpe >= 8;
  const noProtein  = e.protein === "없음";
  const goodProtein = e.protein === "카제인" || e.protein === "유청+카제인";
  const lowSleep = e.sleepHours !== "" && sleep < 6;
  const fasting  = e.fastingPlan !== "평소";
  const hasBase  = n >= 3 && baseline != null;
  const elevated = hasBase && g > baseline + 12;

  if (g >= 126)
    flags.push({ level: "alert", title: "공복혈당 126 도달 — 당뇨 진단 기준", advice: "단일 측정값이지만 재측정 및 의사 상담 권장." });
  if (g >= 100 && g < 126)
    flags.push({ level: "warn", title: "공복혈당 전당뇨 범위(100–125)", advice: "추세를 관찰하고 다음 측정에서 확인해." });
  if (elevated)
    flags.push({ level: "warn", title: `기준치 대비 +${(g - baseline).toFixed(0)}mg/dL 상승`, advice: "전날 세션·수면·단백질 조합을 점검해봐." });
  if (highPrev && noProtein)
    flags.push({ level: "warn", title: "Rule 1 — 전날 고강도 + 취침 전 단백질 없음", advice: "코르티솔 상승 → 당신생 증가 → 아침혈당 상승 가능성. 카제인 30g 추가해." });
  if (highPrev && goodProtein)
    flags.push({ level: "ok", title: "Rule 2 — 전날 고강도 + 카제인 섭취", advice: "서방형 아미노산으로 야간 코르티솔 압력 완충. 혈당 안정 기대." });
  if (lowSleep)
    flags.push({ level: "warn", title: `Rule 3 — 수면 ${sleep}h — 인슐린저항 위험`, advice: "수면 < 6h → 코르티솔 상승 → 인슐린저항 상승. 당일 고강도 강도 조절 고려." });
  if (highToday && fasting)
    flags.push({ level: "warn", title: "Rule 4 — 당일 고강도 + 단식 동시 부하", advice: "Allostatic load 복합 → 혈당·혈압·CPK 상승 리스크. 단식일엔 강도를 낮춰." });
  if (highPrev && fasting && highToday)
    flags.push({ level: "warn", title: "Rule 4b — 연속 고강도 + 단식 이중 부하", advice: "어제와 오늘 모두 고강도+단식. 누적 allostatic load 주의." });
  if (g > 95)
    flags.push({ level: "info", title: "Rule 5 — 새벽현상 가능성", advice: "4–8시 호르몬 서지로 실제보다 높게 측정될 수 있어. 기상 후 워킹 5분 후 재측정." });
  if (highToday && noProtein)
    flags.push({ level: "info", title: "당일 고강도 예정 — 취침 전 단백질 챙겨", advice: `오늘 RPE ${todayRpe} 세션. 오늘 밤 카제인 or 요프로 필수.` });
  if (flags.length === 0)
    flags.push({ level: "ok", title: "플래그 없음 — 오늘 패턴 양호", advice: "현재 루틴을 유지해." });

  return flags;
}

const labelStyle = {
  fontSize: 11, color: C.sub, letterSpacing: "0.08em",
  textTransform: "uppercase", marginBottom: 4, display: "block",
};

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}

const inputBase = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.text,
  padding: "7px 10px",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

function NumInput({ value, onChange, placeholder, min, max, step = 1 }) {
  return (
    <input
      type="number" min={min} max={max} step={step}
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputBase}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...inputBase, cursor: "pointer" }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Slider({ value, onChange, min = 1, max = 10 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: C.teal }} />
      <span style={{ color: C.teal, fontWeight: 700, fontSize: 16, minWidth: 24, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 10, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

function FlagCard({ flag }) {
  const map = {
    alert: { bg: "#2a1010", border: C.red,    icon: <AlertTriangle size={15} color={C.red} />,    tc: C.red },
    warn:  { bg: "#1e1a0a", border: C.amber,  icon: <AlertTriangle size={15} color={C.amber} />,  tc: C.amber },
    ok:    { bg: "#0d1f12", border: C.green,  icon: <CheckCircle2 size={15} color={C.green} />,   tc: C.green },
    info:  { bg: "#0d1520", border: C.blue,   icon: <Info size={15} color={C.blue} />,            tc: C.blue },
  };
  const s = map[flag.level] || map.info;
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {s.icon}
        <span style={{ color: s.tc, fontWeight: 600, fontSize: 13 }}>{flag.title}</span>
      </div>
      <p style={{ color: C.sub, fontSize: 12, margin: 0, lineHeight: 1.5 }}>{flag.advice}</p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: C.sub, marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.value}
          {p.name === "공복혈당" ? " mg/dL" : p.name.includes("RPE") ? "" : "h"}
        </div>
      ))}
    </div>
  );
};

export default function BioLog() {
  const [entries, setEntries]     = useState([]);
  const [form, setForm]           = useState(blankForm());
  const [tab, setTab]             = useState("입력");
  const [loaded, setLoaded]       = useState(false);
  const [editingDate, setEditingDate] = useState(null);
  const [importMsg, setImportMsg] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) {
          const stored = JSON.parse(r.value);
          const merged = [...SEED_ENTRIES];
          stored.forEach(s => {
            const idx = merged.findIndex(e => e.date === s.date);
            if (idx >= 0) merged[idx] = s;
            else merged.push(s);
          });
          setEntries(merged);
        } else {
          setEntries(SEED_ENTRIES);
        }
      } catch (_) {
        setEntries(SEED_ENTRIES);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.storage.set(STORAGE_KEY, JSON.stringify(entries)).catch(() => {});
  }, [entries, loaded]);

  // ── Export JSON ───────────────────────────────────────
  const handleExport = () => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const payload = {
      exported_at: new Date().toISOString(),
      count: sorted.length,
      entries: sorted,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `biolog_data_${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Import JSON ───────────────────────────────────────
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const incoming = parsed.entries ?? parsed;
        if (!Array.isArray(incoming)) throw new Error("형식 오류");
        setEntries(prev => {
          const merged = [...prev];
          incoming.forEach(s => {
            const idx = merged.findIndex(e => e.date === s.date);
            if (idx >= 0) merged[idx] = s;
            else merged.push(s);
          });
          return merged;
        });
        setImportMsg(`완료 — ${incoming.length}개 항목 가져오기 성공`);
        setTimeout(() => setImportMsg(""), 3000);
      } catch {
        setImportMsg("오류 — 파일 형식을 확인해줘");
        setTimeout(() => setImportMsg(""), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const sorted = useMemo(() =>
    [...entries].sort((a, b) => a.date.localeCompare(b.date)), [entries]);

  const baseline = useMemo(() => {
    if (sorted.length < 3) return null;
    const vals = sorted.slice(-7).map(e => Number(e.glucose)).filter(v => !isNaN(v) && v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [sorted]);

  const latestEntry = sorted[sorted.length - 1];
  const flags = latestEntry ? evaluateRules(latestEntry, baseline, sorted.length) : [];

  const chartData = sorted.map(e => ({
    date: e.date.slice(5),
    "공복혈당": Number(e.glucose) || null,
    "전날RPE": Number(e.prevRpe) || null,
    "당일RPE": Number(e.todayRpe ?? e.prevRpe) || null,
    "수면": Number(e.sleepHours) || null,
  }));

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleEdit = (entry) => {
    setForm({
      date: entry.date,
      glucose: entry.glucose ?? "",
      prevRpe: entry.prevRpe ?? 5,
      prevType: entry.prevType ?? "중강도",
      todayRpe: entry.todayRpe ?? 5,
      todayType: entry.todayType ?? "중강도",
      sleepHours: entry.sleepHours ?? "",
      protein: entry.protein ?? "없음",
      fastingPlan: entry.fastingPlan ?? "평소",
      condition: entry.condition ?? 3,
      notes: entry.notes ?? "",
    });
    setEditingDate(entry.date);
    setTab("입력");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setForm(blankForm());
    setEditingDate(null);
  };

  const handleAdd = () => {
    if (!form.glucose || !form.sleepHours) {
      alert("공복혈당과 수면시간은 필수야.");
      return;
    }
    const idx = entries.findIndex(e => e.date === form.date);
    if (idx >= 0) {
      const updated = [...entries];
      updated[idx] = { ...form };
      setEntries(updated);
    } else {
      setEntries(prev => [...prev, { ...form }]);
    }
    setForm(blankForm());
    setEditingDate(null);
    setTab("분석");
  };

  const handleDelete = (date) => {
    if (confirm(`${date} 데이터를 삭제할까?`))
      setEntries(prev => prev.filter(e => e.date !== date));
  };

  const tabs = ["입력", "분석", "기록"];
  const isEditing = editingDate !== null;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'DM Sans', -apple-system, 'Apple SD Gothic Neo', sans-serif", color: C.text, paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <Activity size={20} color={C.teal} />
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>BioLog</span>
        <span style={{ color: C.faint, fontSize: 12, marginLeft: 4 }}>대사·운동 모니터</span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {sorted.length > 0 && (
            <span style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, color: C.sub }}>
              {sorted.length}일 기록
            </span>
          )}

          {/* 가져오기 버튼 */}
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleImport}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="JSON 가져오기"
            style={{
              background: "none",
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              cursor: "pointer",
              color: C.sub,
              padding: "5px 10px",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}>
            <Upload size={13} /> 가져오기
          </button>

          {/* 내보내기 버튼 */}
          <button
            onClick={handleExport}
            title="JSON으로 내보내기"
            style={{
              background: C.teal,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              color: "#0b0f14",
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}>
            <Download size={13} /> 내보내기
          </button>
        </div>
      </div>

      {/* 가져오기 결과 토스트 */}
      {importMsg && (
        <div style={{
          position: "fixed", top: 60, right: 16, zIndex: 999,
          background: importMsg.startsWith("완료") ? "#0d3a1f" : "#3a0f0f",
          border: `1px solid ${importMsg.startsWith("완료") ? C.green : C.red}`,
          borderRadius: 8,
          padding: "10px 16px",
          color: importMsg.startsWith("완료") ? C.green : C.red,
          fontSize: 13,
          fontWeight: 600,
        }}>
          {importMsg}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "12px 0", background: "none", border: "none",
              borderBottom: tab === t ? `2px solid ${C.teal}` : "2px solid transparent",
              color: tab === t ? C.teal : C.sub,
              fontWeight: tab === t ? 700 : 400,
              fontSize: 14, cursor: "pointer", transition: "all 0.15s",
            }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 540, margin: "0 auto" }}>

        {/* ── 입력 탭 ── */}
        {tab === "입력" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isEditing && (
              <div style={{ background: "#1a1500", border: `1px solid ${C.amber}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: C.amber, fontSize: 13, fontWeight: 600 }}>✏️ {editingDate} 데이터 수정 중</span>
                <button onClick={handleCancelEdit}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, display: "flex", alignItems: "center", gap: 4 }}>
                  <X size={14} /> 취소
                </button>
              </div>
            )}

            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="날짜">
                <input type="date" value={form.date} onChange={e => set("date", e.target.value)}
                  style={{ ...inputBase, opacity: isEditing ? 0.6 : 1 }}
                  disabled={isEditing} />
              </Field>
              <Field label="공복혈당 (mg/dL)">
                <NumInput value={form.glucose} onChange={v => set("glucose", v)} placeholder="예) 105" min={50} max={300} />
              </Field>
              <Field label="수면 시간 (h)">
                <NumInput value={form.sleepHours} onChange={v => set("sleepHours", v)} placeholder="예) 7.5" min={0} max={12} step={0.5} />
              </Field>
              <SectionDivider label="전날 운동" />
              <Field label={`전날 RPE — ${form.prevRpe}`}>
                <Slider value={form.prevRpe} onChange={v => set("prevRpe", v)} />
              </Field>
              <Field label="전날 운동 종류">
                <Select value={form.prevType} onChange={v => set("prevType", v)} options={SESSION_TYPES} />
              </Field>
              <SectionDivider label="당일 운동" />
              <Field label={`당일 RPE — ${form.todayRpe}`}>
                <Slider value={form.todayRpe} onChange={v => set("todayRpe", v)} />
              </Field>
              <Field label="당일 운동 종류">
                <Select value={form.todayType} onChange={v => set("todayType", v)} options={SESSION_TYPES} />
              </Field>
              <SectionDivider label="영양 · 기타" />
              <Field label="취침 전 단백질">
                <Select value={form.protein} onChange={v => set("protein", v)} options={PROTEIN_OPTS} />
              </Field>
              <Field label="단식 플랜">
                <Select value={form.fastingPlan} onChange={v => set("fastingPlan", v)} options={FASTING_OPTS} />
              </Field>
              <Field label={`오늘 컨디션 — ${form.condition}/5`}>
                <Slider value={form.condition} onChange={v => set("condition", v)} min={1} max={5} />
              </Field>
              <Field label="메모 (선택)">
                <input value={form.notes} onChange={e => set("notes", e.target.value)}
                  placeholder="역도화 첫 착용, 풀ROM 집중 등..."
                  style={inputBase} />
              </Field>
              <button onClick={handleAdd}
                style={{
                  background: isEditing ? C.amber : C.teal,
                  color: "#0b0f14", border: "none", borderRadius: 8,
                  padding: "12px 0", fontWeight: 800, fontSize: 15, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  marginTop: 4,
                }}>
                {isEditing ? <><Pencil size={16} /> 수정 저장</> : <><Plus size={18} /> 저장</>}
              </button>
            </div>
          </div>
        )}

        {/* ── 분석 탭 ── */}
        {tab === "분석" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sorted.length === 0 ? (
              <div style={{ textAlign: "center", color: C.faint, padding: 40 }}>아직 데이터가 없어. 입력 탭에서 첫 기록을 추가해봐.</div>
            ) : (
              <>
                {latestEntry && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { label: "공복혈당", value: `${latestEntry.glucose}`, unit: "mg/dL", color: Number(latestEntry.glucose) >= 100 ? C.coral : C.teal },
                      { label: "수면", value: `${latestEntry.sleepHours}`, unit: "h", color: Number(latestEntry.sleepHours) < 6 ? C.amber : C.green },
                      { label: "전날 RPE", value: `${latestEntry.prevRpe}`, unit: "/10", color: Number(latestEntry.prevRpe) >= 8 ? C.coral : C.blue },
                      { label: "당일 RPE", value: `${latestEntry.todayRpe ?? "-"}`, unit: "/10", color: Number(latestEntry.todayRpe) >= 8 ? C.coral : C.purple },
                    ].map(card => (
                      <div key={card.label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{card.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.value}</div>
                        <div style={{ fontSize: 10, color: C.faint }}>{card.unit}</div>
                      </div>
                    ))}
                  </div>
                )}
                {latestEntry && (
                  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 12, color: C.sub }}>
                    <span>전날 운동 <b style={{ color: C.text }}>{latestEntry.prevType}</b></span>
                    <span>당일 운동 <b style={{ color: C.text }}>{latestEntry.todayType ?? "-"}</b></span>
                    <span>단식 <b style={{ color: C.text }}>{latestEntry.fastingPlan}</b></span>
                    <span>컨디션 <b style={{ color: C.text }}>{latestEntry.condition}/5</b></span>
                    <span>취침단백질 <b style={{ color: C.text }}>{latestEntry.protein}</b></span>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={labelStyle}>룰 엔진 — 최근 기록 분석</span>
                  {flags.map((f, i) => <FlagCard key={i} flag={f} />)}
                </div>
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 8px 8px" }}>
                  <span style={{ ...labelStyle, paddingLeft: 8 }}>공복혈당 추세</span>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} />
                      <YAxis tick={{ fill: C.faint, fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={100} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.6} />
                      <ReferenceLine y={126} stroke={C.red} strokeDasharray="4 4" strokeOpacity={0.6} />
                      {baseline && <ReferenceLine y={baseline} stroke={C.teal} strokeDasharray="2 4" strokeOpacity={0.4} label={{ value: "기준", fill: C.teal, fontSize: 9 }} />}
                      <Line type="monotone" dataKey="공복혈당" stroke={C.teal} strokeWidth={2} dot={{ fill: C.teal, r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 8px 8px" }}>
                  <span style={{ ...labelStyle, paddingLeft: 8 }}>RPE(전날·당일) · 수면 추세</span>
                  <div style={{ display: "flex", gap: 16, paddingLeft: 8, marginBottom: 6 }}>
                    {[{ color: C.coral, label: "전날RPE" }, { color: C.purple, label: "당일RPE" }, { color: C.blue, label: "수면" }].map(l => (
                      <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.sub }}>
                        <div style={{ width: 10, height: 2, background: l.color, borderRadius: 1 }} />
                        {l.label}
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} />
                      <YAxis tick={{ fill: C.faint, fontSize: 10 }} domain={[0, 10]} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={8} stroke={C.coral} strokeDasharray="3 3" strokeOpacity={0.4} />
                      <Line type="monotone" dataKey="전날RPE" stroke={C.coral} strokeWidth={2} dot={{ fill: C.coral, r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="당일RPE" stroke={C.purple} strokeWidth={2} dot={{ fill: C.purple, r: 3 }} strokeDasharray="4 2" connectNulls />
                      <Line type="monotone" dataKey="수면" stroke={C.blue} strokeWidth={2} dot={{ fill: C.blue, r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 기록 탭 ── */}
        {tab === "기록" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sorted.length === 0 ? (
              <div style={{ textAlign: "center", color: C.faint, padding: 40 }}>기록 없음</div>
            ) : (
              [...sorted].reverse().map(e => (
                <div key={e.date} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.teal }}>{e.date}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => handleEdit(e)}
                        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", color: C.sub, padding: "3px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                        <Pencil size={11} /> 수정
                      </button>
                      <button onClick={() => handleDelete(e.date)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12, color: C.sub }}>
                    <span>혈당 <b style={{ color: C.text }}>{e.glucose} mg/dL</b></span>
                    <span>수면 <b style={{ color: C.text }}>{e.sleepHours}h</b></span>
                    <span>전날RPE <b style={{ color: C.coral }}>{e.prevRpe}</b> · {e.prevType}</span>
                    <span>당일RPE <b style={{ color: C.purple }}>{e.todayRpe ?? "-"}</b> · {e.todayType ?? "-"}</span>
                    <span>단백질 <b style={{ color: C.text }}>{e.protein}</b></span>
                    <span>단식 <b style={{ color: C.text }}>{e.fastingPlan}</b></span>
                    <span>컨디션 <b style={{ color: C.text }}>{e.condition}/5</b></span>
                  </div>
                  {e.notes && <div style={{ marginTop: 6, fontSize: 11, color: C.faint, fontStyle: "italic" }}>{e.notes}</div>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
