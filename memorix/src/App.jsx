import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Storage (localStorage) ───────────────────────────────────────────────────
const storage = {
  get: (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  del: (key) => { try { localStorage.removeItem(key); } catch {} },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUPS = [
  { id: "cell-bio", label: "Biologie cellulaire",                   sem: 1 },
  { id: "histo",    label: "Histologie & Biologie du développement", sem: 1 },
  { id: "biochem",  label: "Biochimie",                              sem: 1 },
  { id: "biophys",  label: "Biophysique",                            sem: 1 },
  { id: "biostat",  label: "Biostatistique",                         sem: 1 },
];
const NUMS = [1, 2, 3];
const PACKETS = [
  { id: "prioritaire", label: "Prioritaire" },
  { id: "important",   label: "Important"   },
  { id: "utile",       label: "Utile"        },
];
const SEM1_GROUPS = GROUPS.map((g) => g.id);

const PLANS = [
  { id: "sem1", label: "Semestre 1",     price: "19 €", groups: SEM1_GROUPS, desc: "Toutes les matières du semestre 1" },
  { id: "sem2", label: "Semestre 2",     price: "19 €", groups: [],          desc: "Disponible prochainement" },
  { id: "both", label: "Année complète", price: "29 €", groups: SEM1_GROUPS, desc: "Tous les semestres · Accès illimité" },
  ...GROUPS.map((g) => ({ id: `g-${g.id}`, label: g.label, price: "9 €", groups: [g.id], desc: "Cours 1, 2 et 3 · Tous paquets" })),
];

const ADMIN_PASSWORD = "medecine2024";

const DEFAULT_SETTINGS = {
  againMin: 1, hardMin: 5, goodMin: 10, easyDays: 4,
  newCardsPerDay: 20, maxReviewsPerDay: 100,
  dailyGroups: [], dailyPackets: [],
};

const INITIAL_CARDS = [
  { id: "cb1p1", front: "Qu'est-ce que la membrane plasmique ?",   back: "Bicouche lipidique composée de phospholipides, cholestérol et protéines membranaires. Rôle de barrière sélective et d'interface de signalisation cellulaire.", groupId: "cell-bio", num: 1, packetId: "prioritaire" },
  { id: "cb1p2", front: "Décrivez les phases du cycle cellulaire", back: "G1 (croissance) → S (réplication ADN) → G2 (vérification) → M (mitose). Points de contrôle régulés par complexes cycline-CDK et protéine Rb.", groupId: "cell-bio", num: 1, packetId: "prioritaire" },
  { id: "cb1i1", front: "Qu'est-ce que l'apoptose ?",              back: "Mort cellulaire programmée. Voie intrinsèque (mitochondriale → caspase-9) et extrinsèque (récepteurs de mort → caspase-8). Élimine les cellules défectueuses sans inflammation.", groupId: "cell-bio", num: 1, packetId: "important" },
  { id: "cb1u1", front: "Rôle du réticulum endoplasmique rugueux", back: "Synthèse et maturation des protéines destinées à la sécrétion ou aux membranes. Ribosomes fixés sur le RER ; protéine entre dans la lumière pour repliement et glycosylation N-liée.", groupId: "cell-bio", num: 1, packetId: "utile" },
];

// ─── SRS Algorithm ────────────────────────────────────────────────────────────

function computeNext(prev, rating, settings = DEFAULT_SETTINGS) {
  const { againMin = 1, hardMin = 5, goodMin = 10, easyDays = 4 } = settings;
  const { state = "new", step = 0, interval = 1, ease = 2.5, reps = 0, lapses = 0, lapseInt = 1 } = prev || {};
  const minFrom = (m) => new Date(Date.now() + m * 60000).toISOString();
  const dayFrom = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const base = { ease, reps, lapses, lapseInt };
  if (state === "new" || state === "learning") {
    if (rating === 1) return { ...base, state: "learning", step: 0, interval: againMin, next: minFrom(againMin) };
    if (rating === 2) return { ...base, state: "learning", step: 1, interval: hardMin,  next: minFrom(hardMin)  };
    if (rating === 3) {
      if (step >= 2) return { ...base, state: "review", step: 0, interval: 1, reps: 1, lapseInt: 0, next: dayFrom(1) };
      return { ...base, state: "learning", step: 2, interval: goodMin, next: minFrom(goodMin) };
    }
    return { ...base, state: "review", step: 0, interval: easyDays, reps: 1, lapseInt: 0, next: dayFrom(easyDays) };
  }
  if (state === "review") {
    if (rating === 1) {
      const li = Math.max(1, Math.round(interval * 0.2));
      return { state: "relearning", step: 0, interval, ease: Math.max(1.3, ease - 0.2), reps, lapses: lapses + 1, lapseInt: li, next: minFrom(againMin) };
    }
    let ni, ne = ease;
    if (rating === 2) { ni = Math.max(interval + 1, Math.round(interval * 1.2)); ne = Math.max(1.3, ease - 0.15); }
    else if (rating === 3) { ni = Math.max(interval + 1, Math.round(interval * ease)); }
    else { ni = Math.max(interval + 1, Math.round(interval * ease * 1.3)); ne = Math.min(3.5, ease + 0.15); }
    return { state: "review", step: 0, interval: ni, ease: ne, reps: reps + 1, lapses, lapseInt: 0, next: dayFrom(ni) };
  }
  if (rating === 1) return { ...prev, next: minFrom(againMin) };
  const ni = Math.max(1, lapseInt);
  return { state: "review", step: 0, interval: ni, ease, reps: reps + 1, lapses, lapseInt: 0, next: dayFrom(ni) };
}

function getIntervalLabel(prev, rating, settings = DEFAULT_SETTINGS) {
  const r = computeNext(prev, rating, settings);
  if (r.state === "learning" || r.state === "relearning") {
    const m = Math.max(1, Math.round((new Date(r.next) - Date.now()) / 60000));
    return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
  }
  const d = r.interval;
  if (d === 1) return "1 jour"; if (d < 7) return `${d} j`;
  if (d < 30)  return `${Math.round(d / 7)} sem.`;
  if (d < 365) return `${Math.round(d / 30)} mois`;
  return `${(d / 365).toFixed(1)} an${d >= 730 ? "s" : ""}`;
}

function isDue(p) { return !p?.next || new Date(p.next) <= new Date(); }
function isNew(p) { return !p || p.state === "new"; }
function stateLabel(p) {
  if (!p || p.state === "new") return "Nouveau";
  if (p.state === "learning")   return "Apprentissage";
  if (p.state === "relearning") return "Réapprentissage";
  return `Révision · J+${p.interval}`;
}

function filterCards(cards, gid, num, pkId) {
  return cards.filter((c) => c.groupId === gid && c.num === num && c.packetId === pkId);
}
function packetStats(cards, progress, gid, num, pkId) {
  const list = filterCards(cards, gid, num, pkId);
  return { total: list.length, due: list.filter((c) => isDue(progress[c.id])).length };
}
function buildQueue(cardList, progress, settings, limit) {
  const { dailyGroups, dailyPackets, maxReviewsPerDay } = settings;
  const cap = limit ?? maxReviewsPerDay;
  return cardList.filter((c) => {
    const p = progress[c.id];
    if (!isDue(p)) return false;
    if (isNew(p)) {
      if (dailyGroups.length  > 0 && !dailyGroups.includes(c.groupId))   return false;
      if (dailyPackets.length > 0 && !dailyPackets.includes(c.packetId)) return false;
    }
    return true;
  }).slice(0, cap);
}
function globalDue(cards, progress, accessibleGroups, settings, packetId = null) {
  const eligible = cards.filter((c) => accessibleGroups.includes(c.groupId) && (!packetId || c.packetId === packetId));
  return buildQueue(eligible, progress, settings).length;
}

// ─── Design ───────────────────────────────────────────────────────────────────

const C = {
  bg: "#f5f3ee", surface: "#ffffff", border: "#d0ccc4",
  text: "#1a1917", textMed: "#4e4a46", textLt: "#7a7672",
  accent: "#2c4a7c", accentBg: "#eef3fb",
  prio: "#9b2335", prioBg: "#fef2f4",
  imp:  "#8b5e00", impBg:  "#fef8e8",
  util: "#1e5a3a", utilBg: "#edf7f2",
  again: "#b91c1c", againBg: "#fff0f0",
  hard:  "#b45309", hardBg:  "#fff8ed",
  good:  "#15803d", goodBg:  "#edfdf3",
  easy:  "#1d4ed8", easyBg:  "#eff6ff",
};
const packetColor = (id) => id === "prioritaire" ? C.prio : id === "important" ? C.imp : C.util;
const packetBg    = (id) => id === "prioritaire" ? C.prioBg : id === "important" ? C.impBg : C.utilBg;
const font  = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const serif = "Georgia, 'Times New Roman', serif";
const mono  = "'Courier New', Courier, monospace";

// ─── Base components ──────────────────────────────────────────────────────────

function Tag({ color, bg, children, small }) {
  return <span style={{ display: "inline-block", fontFamily: mono, fontSize: small ? 8 : 9, letterSpacing: 2, textTransform: "uppercase", padding: small ? "2px 6px" : "3px 8px", borderRadius: 3, background: bg || C.accentBg, color: color || C.accent, whiteSpace: "nowrap" }}>{children}</span>;
}
function Btn({ fill, danger, small, full, disabled, children, style, ...rest }) {
  return (
    <button {...rest} disabled={disabled} style={{ fontFamily: font, fontSize: small ? 12 : 13, fontWeight: 500, padding: small ? "6px 12px" : "9px 18px", cursor: disabled ? "not-allowed" : "pointer", border: `1.5px solid ${fill ? C.accent : danger ? C.again : C.border}`, borderRadius: 6, background: fill ? C.accent : "transparent", color: fill ? "#fff" : danger ? C.again : C.text, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: disabled ? 0.4 : 1, width: full ? "100%" : undefined, ...style }}>
      {children}
    </button>
  );
}
function Modal({ children, onClose, width = 440 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,23,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.surface, borderRadius: 12, padding: "32px 28px", width, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.textLt }}>×</button>
        {children}
      </div>
    </div>
  );
}
function Label({ children, color }) {
  return <p style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2.5, textTransform: "uppercase", color: color || C.textLt, margin: "0 0 6px" }}>{children}</p>;
}
function Nav({ left, center, right }) {
  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
      <div>{left}</div>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.textLt }}>{center}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{right}</div>
    </div>
  );
}
const iLine = { fontFamily: font, fontSize: 14, color: C.text, background: "transparent", width: "100%", outline: "none", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${C.border}`, padding: "8px 0" };
const iBox  = { fontFamily: font, fontSize: 14, color: C.text, background: "transparent", width: "100%", outline: "none", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", resize: "vertical" };

function MultiToggle({ label, options, value, onChange, colorFn }) {
  const isAll = value.length === 0;
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const TBtn = ({ active, onClick, label: lbl, color, bg }) => (
    <button onClick={onClick} style={{ fontFamily: font, fontSize: 12, fontWeight: active ? 600 : 400, padding: "7px 14px", cursor: "pointer", borderRadius: 6, border: `1.5px solid ${active ? (color || C.accent) : C.border}`, background: active ? (bg || C.accentBg) : "transparent", color: active ? (color || C.accent) : C.textMed, display: "flex", alignItems: "center", gap: 5 }}>
      {active && <span style={{ fontSize: 10 }}>✓</span>}{lbl}
    </button>
  );
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <TBtn active={isAll} onClick={() => onChange([])} label="Tout" color={C.accent} bg={C.accentBg} />
        {options.map((o) => {
          const col = colorFn ? colorFn(o.value) : C.accent;
          const bg  = col === C.prio ? C.prioBg : col === C.imp ? C.impBg : col === C.util ? C.utilBg : C.accentBg;
          return <TBtn key={o.value} active={value.includes(o.value)} onClick={() => toggle(o.value)} label={o.label} color={col} bg={bg} />;
        })}
      </div>
      <p style={{ fontSize: 11, color: C.textLt, margin: "8px 0 0" }}>{isAll ? "Toutes les options incluses" : `${value.length} sélectionnée${value.length > 1 ? "s" : ""}`}</p>
    </div>
  );
}

function ClassSelector({ label, options, value, onChange, columns = "auto" }) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: "grid", gridTemplateColumns: columns === "auto" ? "repeat(auto-fill, minmax(140px, 1fr))" : `repeat(${columns}, 1fr)`, gap: 8, marginTop: 8 }}>
        {options.map((opt) => {
          const active = value === opt.value, col = opt.color || C.accent, bg = opt.bg || C.accentBg;
          return (
            <button key={opt.value} onClick={() => onChange(opt.value)} style={{ fontFamily: font, fontSize: 12, fontWeight: active ? 600 : 400, padding: "10px 12px", cursor: "pointer", borderRadius: 8, border: `2px solid ${active ? col : C.border}`, background: active ? bg : C.surface, color: active ? col : C.textMed, textAlign: "left", lineHeight: 1.4 }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = col; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = C.border; }}>
              {active && <span style={{ marginRight: 6 }}>✓</span>}{opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card Editor ──────────────────────────────────────────────────────────────

function CardEditor({ card, onSave, onCancel }) {
  const isNew = !card?.id;
  const [form, setForm] = useState({ front: card?.front || "", back: card?.back || "", groupId: card?.groupId || GROUPS[0].id, num: card?.num || 1, packetId: card?.packetId || "prioritaire" });
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const validate = () => { const e = {}; if (!form.front.trim()) e.front = true; if (!form.back.trim()) e.back = true; setErrors(e); return !Object.keys(e).length; };
  const handleSave = () => { if (!validate()) return; onSave({ ...form, id: card?.id || `card-${Date.now()}` }); setSaved(true); };
  const groupOpts  = GROUPS.map((g)  => ({ value: g.id,  label: g.label }));
  const numOpts    = NUMS.map((n)    => ({ value: n,      label: `Cours ${n}` }));
  const packetOpts = PACKETS.map((pk)=> ({ value: pk.id, label: pk.label, color: packetColor(pk.id), bg: packetBg(pk.id) }));
  const selGroup   = GROUPS.find((g) => g.id === form.groupId);
  const selPacket  = PACKETS.find((p) => p.id === form.packetId);
  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh" }}>
      <Nav left={<button onClick={onCancel} style={{ fontFamily: font, fontSize: 13, background: "none", border: "none", cursor: "pointer", color: C.textMed }}>← Retour</button>} center={isNew ? "Nouvelle flashcard" : "Modifier"} right={<Btn fill onClick={handleSave}>{saved ? "✓ Enregistré" : isNew ? "Créer" : "Mettre à jour"}</Btn>} />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px" }}>
              <p style={{ fontFamily: serif, fontSize: 16, margin: "0 0 16px" }}>Contenu</p>
              <div style={{ marginBottom: 14 }}>
                <Label color={errors.front ? C.again : undefined}>Recto — Question{errors.front ? " (requis)" : ""}</Label>
                <textarea style={{ ...iBox, minHeight: 90, marginTop: 6, display: "block", borderColor: errors.front ? C.again : C.border }} value={form.front} onChange={(e) => { setForm((p) => ({ ...p, front: e.target.value })); setErrors((er) => ({ ...er, front: false })); }} placeholder="La question..." rows={3} />
              </div>
              <div>
                <Label color={errors.back ? C.again : undefined}>Verso — Réponse{errors.back ? " (requis)" : ""}</Label>
                <textarea style={{ ...iBox, minHeight: 110, marginTop: 6, display: "block", borderColor: errors.back ? C.again : C.border }} value={form.back} onChange={(e) => { setForm((p) => ({ ...p, back: e.target.value })); setErrors((er) => ({ ...er, back: false })); }} placeholder="La réponse complète..." rows={4} />
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
              <Label>Aperçu</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 0" }}>
                <Tag color={packetColor(form.packetId)} bg={packetBg(form.packetId)}>{selPacket?.label}</Tag>
                <Tag color={C.accent} bg={C.accentBg}>{selGroup?.label}</Tag>
                <Tag color={C.textMed} bg={C.bg}>Cours {form.num}</Tag>
              </div>
              {form.front && <p style={{ fontFamily: serif, fontSize: 13, color: C.textMed, margin: "10px 0 0", lineHeight: 1.5 }}>{form.front.slice(0, 100)}{form.front.length > 100 ? "…" : ""}</p>}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn fill full onClick={handleSave}>{saved ? "✓ Enregistré" : isNew ? "Créer la carte" : "Mettre à jour"}</Btn>
              <Btn full onClick={onCancel}>Annuler</Btn>
            </div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px", height: "fit-content" }}>
            <p style={{ fontFamily: serif, fontSize: 16, margin: "0 0 20px" }}>Classification</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <ClassSelector label="Matière" value={form.groupId} onChange={(v) => setForm((p) => ({ ...p, groupId: v }))} options={groupOpts} />
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
                <ClassSelector label="Numéro de cours" value={form.num} onChange={(v) => setForm((p) => ({ ...p, num: v }))} options={numOpts} columns={3} />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
                <ClassSelector label="Paquet" value={form.packetId} onChange={(v) => setForm((p) => ({ ...p, packetId: v }))} options={packetOpts} columns={1} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Admin list ───────────────────────────────────────────────────────────────

function AdminList({ cards, onNew, onEdit, onDelete }) {
  const [filterGid, setFilterGid] = useState("all");
  const [filterNum, setFilterNum] = useState("all");
  const [filterPkt, setFilterPkt] = useState("all");
  const [search,    setSearch]    = useState("");
  const [delId,     setDelId]     = useState(null);
  const filtered = useMemo(() => cards.filter((c) =>
    (filterGid === "all" || c.groupId === filterGid) &&
    (filterNum === "all" || c.num     === filterNum) &&
    (filterPkt === "all" || c.packetId === filterPkt) &&
    (!search || `${c.front} ${c.back}`.toLowerCase().includes(search.toLowerCase()))
  ), [cards, filterGid, filterNum, filterPkt, search]);
  const FBtn = ({ active, onClick, children, color, bg }) => (
    <button onClick={onClick} style={{ fontFamily: font, fontSize: 11, fontWeight: active ? 600 : 400, padding: "5px 12px", cursor: "pointer", borderRadius: 20, border: `1.5px solid ${active ? (color || C.accent) : C.border}`, background: active ? (bg || C.accentBg) : "transparent", color: active ? (color || C.accent) : C.textMed, whiteSpace: "nowrap" }}>{children}</button>
  );
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px" }}>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.textLt, fontSize: 16 }}>⌕</span>
        <input style={{ ...iBox, paddingLeft: 36, borderRadius: 8 }} placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textLt, fontSize: 16 }}>×</button>}
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <div><Label>Matière</Label><div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}><FBtn active={filterGid === "all"} onClick={() => setFilterGid("all")}>Toutes</FBtn>{GROUPS.map((g) => <FBtn key={g.id} active={filterGid === g.id} onClick={() => setFilterGid(g.id)}>{g.label.split(" ")[0]}…</FBtn>)}</div></div>
          <div><Label>Cours</Label><div style={{ display: "flex", gap: 6, marginTop: 6 }}><FBtn active={filterNum === "all"} onClick={() => setFilterNum("all")}>Tous</FBtn>{NUMS.map((n) => <FBtn key={n} active={filterNum === n} onClick={() => setFilterNum(n)}>{n}</FBtn>)}</div></div>
          <div><Label>Paquet</Label><div style={{ display: "flex", gap: 6, marginTop: 6 }}><FBtn active={filterPkt === "all"} onClick={() => setFilterPkt("all")}>Tous</FBtn>{PACKETS.map((pk) => <FBtn key={pk.id} active={filterPkt === pk.id} onClick={() => setFilterPkt(pk.id)} color={packetColor(pk.id)} bg={packetBg(pk.id)}>{pk.label}</FBtn>)}</div></div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: C.textMed, margin: 0 }}><strong style={{ color: C.text }}>{filtered.length}</strong> carte{filtered.length !== 1 ? "s" : ""}</p>
        {(filterGid !== "all" || filterNum !== "all" || filterPkt !== "all" || search) && <button onClick={() => { setFilterGid("all"); setFilterNum("all"); setFilterPkt("all"); setSearch(""); }} style={{ fontFamily: font, fontSize: 12, background: "none", border: "none", cursor: "pointer", color: C.textLt }}>✕ Effacer</button>}
      </div>
      {filtered.length === 0 ? (
        <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 10, padding: "48px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: C.textLt, margin: "0 0 16px" }}>{cards.length === 0 ? "Aucune carte." : "Aucune correspondance."}</p>
          {cards.length === 0 && <Btn onClick={onNew}>Créer la première carte →</Btn>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((card) => {
            const grp = GROUPS.find((g) => g.id === card.groupId), col = packetColor(card.packetId), bg = packetBg(card.packetId);
            return (
              <div key={card.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", display: "flex" }}>
                <div style={{ width: 4, background: col, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: "14px 16px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                    <Tag color={col} bg={bg} small>{PACKETS.find((p) => p.id === card.packetId)?.label}</Tag>
                    <Tag color={C.accent} bg={C.accentBg} small>{grp?.label}</Tag>
                    <Tag color={C.textMed} bg={C.bg} small>Cours {card.num}</Tag>
                  </div>
                  <p style={{ fontFamily: serif, fontSize: 14, color: C.text, margin: "0 0 4px", lineHeight: 1.5 }}>{card.front}</p>
                  <p style={{ fontSize: 12, color: C.textLt, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.back}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <Btn small onClick={() => onEdit(card)}>✏ Modifier / Reclasser</Btn>
                    <Btn small danger onClick={() => setDelId(card.id)}>Supprimer</Btn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {delId && (
        <Modal onClose={() => setDelId(null)} width={320}>
          <p style={{ fontFamily: serif, fontSize: 20, margin: "0 0 8px" }}>Supprimer ?</p>
          <p style={{ fontSize: 13, color: C.textMed, margin: "0 0 24px" }}>Action irréversible.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn fill danger onClick={() => { onDelete(delId); setDelId(null); }}>Supprimer</Btn>
            <Btn onClick={() => setDelId(null)}>Annuler</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AdminView({ cards, onSave, onDelete, onBack }) {
  const [subView, setSubView] = useState("list");
  const [editCard, setEditCard] = useState(null);
  const handleSave = (cd) => { onSave(cd); setTimeout(() => setSubView("list"), 700); };
  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", color: C.text }}>
      {subView === "list" && (<>
        <Nav left={<button onClick={onBack} style={{ fontFamily: font, fontSize: 13, background: "none", border: "none", cursor: "pointer", color: C.textMed }}>← Quitter</button>} center={`Admin · ${cards.length} cartes`} right={<Btn fill onClick={() => { setEditCard(null); setSubView("editor"); }}>+ Nouvelle carte</Btn>} />
        <AdminList cards={cards} onNew={() => { setEditCard(null); setSubView("editor"); }} onEdit={(c) => { setEditCard(c); setSubView("editor"); }} onDelete={onDelete} />
      </>)}
      {subView === "editor" && <CardEditor card={editCard} onSave={handleSave} onCancel={() => setSubView("list")} />}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ paymentStatus, cards, progress, settings, onStudy, onGlobalStudy, onAdmin, onSettings, onLogout }) {
  const accessible = GROUPS.filter((g) => paymentStatus.groups.includes(g.id));
  const accessibleIds = accessible.map((g) => g.id);
  const sem1 = accessible.filter((g) => g.sem === 1);
  const globalModes = [
    { id: "prioritaire", label: "Prioritaire",      col: C.prio,   bg: C.prioBg   },
    { id: "important",   label: "Important",         col: C.imp,    bg: C.impBg    },
    { id: "utile",       label: "Utile",              col: C.util,   bg: C.utilBg   },
    { id: null,          label: "Toutes les cartes", col: C.accent, bg: C.accentBg },
  ];
  function PktBtn({ gid, num, pk }) {
    const { total, due } = packetStats(cards, progress, gid, num, pk.id);
    const col = packetColor(pk.id), bg = packetBg(pk.id), hasDue = due > 0, upToDate = total > 0 && !hasDue;
    return (
      <button onClick={() => total > 0 && onStudy(gid, num, pk.id)} style={{ fontFamily: font, fontSize: 11, fontWeight: 500, padding: "7px 12px", cursor: total > 0 ? "pointer" : "default", borderRadius: 6, border: `1.5px solid ${hasDue ? col : upToDate ? C.border : "#e8e5e0"}`, background: hasDue ? bg : C.surface, color: hasDue ? col : upToDate ? C.textLt : "#c0bbb5", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 90 }}
        onMouseEnter={(e) => { if (total > 0) e.currentTarget.style.borderColor = col; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = hasDue ? col : upToDate ? C.border : "#e8e5e0"; }}>
        <span>{pk.label}</span>
        <span style={{ fontSize: 10, fontWeight: 400 }}>{total === 0 ? "vide" : hasDue ? `${due} carte${due > 1 ? "s" : ""}` : "✓ à jour"}</span>
      </button>
    );
  }
  function GroupBlock({ group }) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "11px 18px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <p style={{ fontFamily: serif, fontSize: 15, margin: 0 }}>{group.label}</p>
        </div>
        {NUMS.map((n, i) => (
          <div key={n} style={{ display: "flex", alignItems: "center", padding: "10px 18px", gap: 14, borderBottom: i < NUMS.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: C.textLt, minWidth: 52, textTransform: "uppercase" }}>Cours {n}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PACKETS.map((pk) => <PktBtn key={pk.id} gid={group.id} num={n} pk={pk} />)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", color: C.text }}>
      <Nav left={<span style={{ fontFamily: serif, fontSize: 20 }}>Memorix</span>} center="Tableau de bord" right={<><Btn small onClick={onSettings}>Paramètres</Btn><Btn small onClick={onAdmin}>Admin</Btn><button onClick={onLogout} style={{ fontFamily: font, fontSize: 12, background: "none", border: "none", color: C.textLt, cursor: "pointer" }}>Déconnexion</button></>} />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 22px", marginBottom: 28 }}>
          <p style={{ fontFamily: serif, fontSize: 18, margin: "0 0 3px" }}>Révision globale</p>
          <p style={{ fontSize: 12, color: C.textMed, margin: "0 0 16px" }}>Toutes vos matières en une session</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {globalModes.map((mode) => {
              const count = globalDue(cards, progress, accessibleIds, settings, mode.id), hasCards = count > 0;
              return (
                <button key={mode.id ?? "all"} onClick={() => hasCards && onGlobalStudy(mode.id)} style={{ fontFamily: font, padding: "14px 10px", cursor: hasCards ? "pointer" : "default", borderRadius: 8, border: `1.5px solid ${hasCards ? mode.col : C.border}`, background: hasCards ? mode.bg : "transparent", color: hasCards ? mode.col : C.textLt, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                  onMouseEnter={(e) => { if (hasCards) e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}>
                  <span style={{ fontSize: 11, fontWeight: 600, textAlign: "center", lineHeight: 1.3 }}>{mode.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 300 }}>{count}</span>
                  <span style={{ fontSize: 10, opacity: 0.7 }}>carte{count !== 1 ? "s" : ""}</span>
                </button>
              );
            })}
          </div>
          {(settings.dailyGroups.length > 0 || settings.dailyPackets.length > 0) && (
            <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 6, background: C.accentBg, border: `1px solid ${C.accent}30` }}>
              <p style={{ fontSize: 11, color: C.accent, margin: 0 }}>🎯 Filtre du jour actif — nouvelles cartes limitées à : {settings.dailyGroups.map((id) => GROUPS.find((g) => g.id === id)?.label.split(" ")[0]).join(", ")}{settings.dailyGroups.length > 0 && settings.dailyPackets.length > 0 && " · "}{settings.dailyPackets.map((id) => PACKETS.find((p) => p.id === id)?.label).join(", ")}</p>
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ fontFamily: serif, fontSize: 18, margin: 0 }}>Par matière et cours</p>
        </div>
        {sem1.length > 0 && (<><p style={{ fontFamily: mono, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: C.textLt, margin: "0 0 12px" }}>— Semestre 1</p>{sem1.map((g) => <GroupBlock key={g.id} group={g} />)}</>)}
      </div>
    </div>
  );
}

// ─── Study view ───────────────────────────────────────────────────────────────

function StudyView({ label, queue, onRate, onBack, settings }) {
  const [idx, setIdx]       = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [localQ, setLocalQ]    = useState(queue);
  const [done, setDone]        = useState(false);
  const [stats, setStats]      = useState({ correct: 0, total: 0 });
  const card = localQ[idx];
  const handleRate = async (rating) => {
    setStats((s) => ({ total: s.total + 1, correct: s.correct + (rating >= 3 ? 1 : 0) }));
    const np = await onRate(card, rating);
    const q = [...localQ];
    if (np.state === "learning" || np.state === "relearning") { q.splice(idx, 1); q.splice(Math.min(idx + 4, q.length), 0, card); }
    else q.splice(idx, 1);
    setLocalQ(q);
    if (!q.length || idx >= q.length) { setDone(true); return; }
    setShowBack(false);
  };
  if (done || !card) {
    return (
      <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ fontSize: 52 }}>✓</div>
        <p style={{ fontFamily: serif, fontSize: 26, margin: 0 }}>Session terminée</p>
        <p style={{ fontSize: 14, color: C.textMed }}>{stats.correct}/{stats.total} · {stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%</p>
        <Btn fill style={{ marginTop: 20 }} onClick={onBack}>← Tableau de bord</Btn>
      </div>
    );
  }
  const col = packetColor(card.packetId);
  const grp = GROUPS.find((g) => g.id === card.groupId);
  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", color: C.text }}>
      <Nav left={<button onClick={onBack} style={{ fontFamily: font, fontSize: 13, background: "none", border: "none", cursor: "pointer", color: C.textMed }}>← Retour</button>} center={label} right={<span style={{ fontSize: 12, color: C.textLt }}>{idx + 1} / {localQ.length}</span>} />
      <div style={{ height: 3, background: C.border }}><div style={{ height: 3, background: col, width: `${(idx / Math.max(1, localQ.length)) * 100}%`, transition: "width 0.3s" }} /></div>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 24px 0" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <Tag color={col} bg={packetBg(card.packetId)}>{PACKETS.find((p) => p.id === card.packetId)?.label}</Tag>
          <Tag color={C.accent} bg={C.accentBg}>{grp?.label}</Tag>
          <Tag color={C.textMed} bg={C.bg}>Cours {card.num}</Tag>
          <Tag color={C.textLt} bg={C.bg}>{stateLabel(null)}</Tag>
        </div>
        <div style={{ perspective: 1200, height: 260, marginBottom: 22 }}>
          <div style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d", transform: showBack ? "rotateY(180deg)" : "rotateY(0)", transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)", cursor: showBack ? "default" : "pointer" }} onClick={() => !showBack && setShowBack(true)}>
            <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", background: C.surface, borderRadius: 12, border: `1.5px solid ${C.border}`, padding: "28px 32px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <Label>Question</Label>
              <p style={{ fontFamily: serif, fontSize: 20, lineHeight: 1.6, margin: "8px 0 0" }}>{card.front}</p>
              <p style={{ fontSize: 12, color: C.textLt, position: "absolute", bottom: 16, right: 22 }}>Cliquez pour révéler →</p>
            </div>
            <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", background: C.surface, borderRadius: 12, border: `1.5px solid ${col}`, padding: "28px 32px", display: "flex", flexDirection: "column", justifyContent: "center", transform: "rotateY(180deg)" }}>
              <Label>Réponse</Label>
              <p style={{ fontSize: 15, lineHeight: 1.8, margin: "8px 0 0", color: C.textMed }}>{card.back}</p>
            </div>
          </div>
        </div>
        {showBack && (
          <div>
            <Label>Comment était-ce ?</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 10 }}>
              {[[1,"À revoir",C.again,C.againBg],[2,"Difficile",C.hard,C.hardBg],[3,"Bien",C.good,C.goodBg],[4,"Facile",C.easy,C.easyBg]].map(([r,lbl,btnCol,btnBg]) => (
                <button key={r} onClick={() => handleRate(r)} style={{ fontFamily: font, padding: "14px 8px", cursor: "pointer", borderRadius: 8, border: `1.5px solid ${btnCol}`, background: btnBg, color: btnCol, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e)  => { e.currentTarget.style.transform = "none"; }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{lbl}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{getIntervalLabel(null, r, settings)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsView({ settings, onSave, onBack }) {
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState(false);
  const save = () => { onSave(s); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const Sl = ({ k, label, desc, min, max, step, unit }) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 18, fontWeight: 300, color: C.accent, margin: 0 }}>{s[k]}<span style={{ fontSize: 11 }}> {unit}</span></p>
      </div>
      <p style={{ fontSize: 11, color: C.textMed, margin: "0 0 8px" }}>{desc}</p>
      <input type="range" min={min} max={max} step={step} value={s[k]} onChange={(e) => setS((p) => ({ ...p, [k]: Number(e.target.value) }))} style={{ width: "100%", accentColor: C.accent }} />
    </div>
  );
  const Sec = ({ title, children }) => (<div style={{ marginBottom: 24 }}><h2 style={{ fontFamily: serif, fontSize: 19, fontWeight: 400, margin: "0 0 12px", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>{title}</h2>{children}</div>);
  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", color: C.text }}>
      <Nav left={<button onClick={onBack} style={{ fontFamily: font, fontSize: 13, background: "none", border: "none", cursor: "pointer", color: C.textMed }}>← Retour</button>} center="Paramètres" right={<Btn fill onClick={save}>{saved ? "✓ Sauvegardé" : "Sauvegarder"}</Btn>} />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "28px 24px" }}>
        <Sec title="🎯 Nouvelles cartes du jour">
          <p style={{ fontSize: 13, color: C.textMed, margin: "0 0 14px", lineHeight: 1.6 }}>Choisissez quelles nouvelles cartes (jamais vues) seront proposées aujourd'hui. Les révisions planifiées apparaissent toujours.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
              <MultiToggle label="Matières à découvrir" value={s.dailyGroups} onChange={(v) => setS((p) => ({ ...p, dailyGroups: v }))} options={GROUPS.map((g) => ({ value: g.id, label: g.label }))} colorFn={() => C.accent} />
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
              <MultiToggle label="Paquets à découvrir" value={s.dailyPackets} onChange={(v) => setS((p) => ({ ...p, dailyPackets: v }))} options={PACKETS.map((pk) => ({ value: pk.id, label: pk.label }))} colorFn={packetColor} />
            </div>
          </div>
        </Sec>
        <Sec title="⏱ Intervalles d'apprentissage">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Sl k="againMin" label="À revoir"  desc="Délai de réaffichage (min)."            min={1} max={10}  step={1}  unit="min"   />
            <Sl k="hardMin"  label="Difficile" desc="Délai pour une carte presque sue (min)." min={2} max={30}  step={1}  unit="min"   />
            <Sl k="goodMin"  label="Bien"      desc="Avant graduation vers révision (min)."   min={5} max={60}  step={5}  unit="min"   />
            <Sl k="easyDays" label="Facile"    desc="Graduation immédiate (jours)."           min={1} max={14}  step={1}  unit="jours" />
          </div>
        </Sec>
        <Sec title="📚 Session d'étude">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Sl k="newCardsPerDay"   label="Nouvelles cartes / jour" desc="Limite les cartes inédites quotidiennes." min={5}  max={100} step={5}  unit="" />
            <Sl k="maxReviewsPerDay" label="Révisions max / session" desc="Plafond de cartes par session."           min={20} max={500} step={10} unit="" />
          </div>
        </Sec>
        <Btn fill full style={{ fontSize: 14 }} onClick={save}>{saved ? "✓ Sauvegardé" : "Sauvegarder tous les paramètres"}</Btn>
      </div>
    </div>
  );
}

// ─── Landing & PayModal ───────────────────────────────────────────────────────

function PayModal({ plan, onClose, onConfirm }) {
  const [step, setStep] = useState("form");
  const [f, setF] = useState({ email: "", name: "", card: "", expiry: "", cvc: "" });
  const F = (k, label, ph, type = "text") => (<div key={k}><Label>{label}</Label><input style={iLine} type={type} placeholder={ph} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} /></div>);
  const submit = () => { setStep("proc"); setTimeout(() => setStep("done"), 1400); setTimeout(onConfirm, 2200); };
  return (
    <Modal onClose={onClose} width={400}>
      {step === "form" && (<>
        <p style={{ fontFamily: serif, fontSize: 22, margin: "0 0 4px" }}>{plan.label}</p>
        <p style={{ fontSize: 14, color: C.textMed, margin: "0 0 24px" }}>{plan.price} / semestre</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {F("email","E-mail","vous@exemple.com","email")} {F("name","Titulaire","Prénom Nom")} {F("card","Carte","4242 4242 4242 4242")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>{F("expiry","Expiration","MM/AA")} {F("cvc","CVC","123")}</div>
        </div>
        <Btn fill full style={{ marginTop: 24, fontSize: 14 }} onClick={submit}>Payer {plan.price}</Btn>
        <p style={{ fontSize: 11, color: C.textLt, textAlign: "center", marginTop: 8 }}>🔒 Mode démo · Aucun débit réel</p>
      </>)}
      {step === "proc" && <div style={{ padding: "48px 0", textAlign: "center" }}><p style={{ fontFamily: serif, fontSize: 20, color: C.textMed }}>Traitement…</p></div>}
      {step === "done" && <div style={{ padding: "48px 0", textAlign: "center" }}><p style={{ fontSize: 40, margin: "0 0 12px" }}>✓</p><p style={{ fontFamily: serif, fontSize: 20 }}>Accès activé</p></div>}
    </Modal>
  );
}

function Landing({ onPay, onAdmin, paymentStatus, onDash }) {
  const [tab, setTab] = useState("semester"), [selected, setSelected] = useState(null), [showPay, setShowPay] = useState(false), [showAdmin, setShowAdmin] = useState(false), [adminPwd, setAdminPwd] = useState("");
  const semPlans = PLANS.filter((p) => ["sem1","sem2","both"].includes(p.id)), grpPlans = PLANS.filter((p) => p.id.startsWith("g-")), display = tab === "semester" ? semPlans : grpPlans, selPlan = PLANS.find((p) => p.id === selected);
  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", color: C.text }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><span style={{ fontFamily: serif, fontSize: 22 }}>Memorix</span><span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: C.textLt, textTransform: "uppercase" }}>Sciences du vivant</span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{paymentStatus && <Btn fill small onClick={onDash}>Mon espace →</Btn>}<button onClick={() => setShowAdmin(true)} style={{ fontFamily: font, fontSize: 12, background: "none", border: "none", color: C.textLt, cursor: "pointer" }}>Admin</button></div>
      </div>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "64px 32px 48px" }}>
        <Tag color={C.accent} bg={C.accentBg}>Répétition espacée · SM-2 · Paquets hiérarchisés</Tag>
        <h1 style={{ fontFamily: serif, fontSize: 44, fontWeight: 400, letterSpacing: -1.5, lineHeight: 1.08, margin: "18px 0 22px" }}>Apprendre.<br />Retenir.<br />Réussir.</h1>
        <p style={{ fontSize: 15, lineHeight: 1.8, color: C.textMed, maxWidth: 440, margin: "0 0 36px" }}>Flashcards intelligentes pour étudiants en médecine. Répétition espacée SM-2, paquets hiérarchisés, révision globale ou par matière.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {PACKETS.map((pk) => (<div key={pk.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px", borderTop: `3px solid ${packetColor(pk.id)}` }}><p style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: packetColor(pk.id), margin: "0 0 4px" }}>{pk.label}</p><p style={{ fontSize: 11, color: C.textMed, lineHeight: 1.6, margin: 0 }}>{pk.id === "prioritaire" ? "Incontournables à l'examen." : pk.id === "important" ? "Notions souvent mobilisées." : "Approfondissement et liens."}</p></div>))}
        </div>
      </div>
      <div style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "48px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <h2 style={{ fontFamily: serif, fontSize: 24, fontWeight: 400, margin: "0 0 20px" }}>Choisissez votre accès</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>{[["semester","Par semestre"],["subject","Par matière"]].map(([k,l]) => (<button key={k} onClick={() => { setTab(k); setSelected(null); }} style={{ fontFamily: font, fontSize: 13, fontWeight: 500, padding: "7px 16px", cursor: "pointer", borderRadius: 6, border: `1.5px solid ${tab===k?C.accent:C.border}`, background: tab===k?C.accentBg:"transparent", color: tab===k?C.accent:C.textMed }}>{l}</button>))}</div>
          <div style={{ display: "grid", gridTemplateColumns: tab==="semester"?"repeat(3,1fr)":"repeat(2,1fr)", gap: 12 }}>
            {display.map((plan) => { const active=selected===plan.id, locked=plan.groups.length===0; return (<div key={plan.id} onClick={() => !locked&&setSelected(plan.id)} style={{ background:active?C.accent:C.surface, color:active?"#fff":locked?C.textLt:C.text, border:`1.5px solid ${active?C.accent:C.border}`, borderRadius:10, padding:"20px 18px", cursor:locked?"not-allowed":"pointer" }} onMouseEnter={(e) => { if(!active&&!locked) e.currentTarget.style.borderColor=C.accent; }} onMouseLeave={(e) => { if(!active&&!locked) e.currentTarget.style.borderColor=C.border; }}><p style={{ fontFamily:mono, fontSize:9, letterSpacing:2, textTransform:"uppercase", margin:"0 0 8px", opacity:0.55 }}>{tab==="semester"?"Offre":"Matière"}</p><p style={{ fontFamily:serif, fontSize:17, margin:"0 0 4px" }}>{plan.label}</p><p style={{ fontSize:11, opacity:0.6, margin:"0 0 16px", lineHeight:1.5 }}>{plan.desc}</p><p style={{ fontSize:24, fontWeight:300, margin:0 }}>{locked?"—":plan.price}<span style={{ fontSize:11, opacity:0.55 }}>{locked?"":" /sem."}</span></p></div>); })}
          </div>
          {selected && (<div style={{ marginTop:18, display:"flex", alignItems:"center", gap:14 }}><Btn fill onClick={() => setShowPay(true)}>Souscrire — {selPlan?.price} →</Btn><span style={{ fontSize:12, color:C.textLt }}>Mode démo · Aucun débit réel</span></div>)}
        </div>
      </div>
      {showPay && selPlan && <PayModal plan={selPlan} onClose={() => setShowPay(false)} onConfirm={() => { onPay(selected); setShowPay(false); }} />}
      {showAdmin && (<Modal onClose={() => setShowAdmin(false)} width={320}><p style={{ fontFamily:serif, fontSize:20, margin:"0 0 18px" }}>Accès admin</p><Label>Mot de passe</Label><input style={iLine} type="password" placeholder="••••••••" value={adminPwd} onChange={(e) => setAdminPwd(e.target.value)} onKeyDown={(e) => e.key==="Enter"&&onAdmin(adminPwd)} autoFocus /><div style={{ display:"flex", gap:10, marginTop:22 }}><Btn fill onClick={() => onAdmin(adminPwd)}>Connexion</Btn><Btn onClick={() => setShowAdmin(false)}>Annuler</Btn></div></Modal>)}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view,     setView]     = useState("loading");
  const [payment,  setPayment]  = useState(null);
  const [cards,    setCards]    = useState([]);
  const [prog,     setProg]     = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [studyCtx, setStudyCtx] = useState(null);

  useEffect(() => {
    const savedCards   = storage.get("mx5-cards");
    const savedProg    = storage.get("mx5-progress");
    const savedSet     = storage.get("mx5-settings");
    const savedPayment = storage.get("mx5-payment");
    setCards(savedCards || INITIAL_CARDS);
    if (savedProg)    setProg(savedProg);
    if (savedSet)     setSettings({ ...DEFAULT_SETTINGS, ...savedSet });
    if (savedPayment) { setPayment(savedPayment); setView("dashboard"); }
    else setView("landing");
  }, []);

  const saveCards = useCallback((c) => { setCards(c);      storage.set("mx5-cards", c);    }, []);
  const saveProg  = useCallback((p) => { setProg(p);       storage.set("mx5-progress", p); }, []);
  const saveSet   = useCallback((s) => { setSettings(s);   storage.set("mx5-settings", s); }, []);

  const handlePay = useCallback((planId) => {
    const plan = PLANS.find((p) => p.id === planId);
    const pay  = { planId, groups: plan.groups };
    setPayment(pay); storage.set("mx5-payment", pay); setView("dashboard");
  }, []);

  const handleAdmin = (pwd) => { pwd === ADMIN_PASSWORD ? setView("admin") : alert("Mot de passe incorrect."); };

  const handleSaveCard = useCallback((cardData) => {
    const updated = cards.find((c) => c.id === cardData.id) ? cards.map((c) => c.id === cardData.id ? cardData : c) : [...cards, cardData];
    saveCards(updated);
  }, [cards, saveCards]);

  const handleDeleteCard = useCallback((id) => { saveCards(cards.filter((c) => c.id !== id)); }, [cards, saveCards]);

  const startStudy = useCallback((gid, num, pkId) => {
    const list  = filterCards(cards, gid, num, pkId);
    const queue = buildQueue(list, prog, settings);
    if (!queue.length) { alert("Aucune carte à réviser !"); return; }
    const grpLabel = GROUPS.find((g) => g.id === gid)?.label;
    const pktLabel = PACKETS.find((p) => p.id === pkId)?.label;
    setStudyCtx({ label: `${grpLabel} · Cours ${num} · ${pktLabel}`, queue });
    setView("study");
  }, [cards, prog, settings]);

  const startGlobalStudy = useCallback((packetId) => {
    const accessibleIds = payment?.groups || [];
    const eligible = cards.filter((c) => accessibleIds.includes(c.groupId) && (!packetId || c.packetId === packetId));
    const queue = buildQueue(eligible, prog, settings);
    if (!queue.length) { alert("Aucune carte à réviser !"); return; }
    const label = packetId ? `Révision globale · ${PACKETS.find((p) => p.id === packetId)?.label}` : "Révision globale · Toutes les cartes";
    setStudyCtx({ label, queue }); setView("study");
  }, [cards, prog, payment, settings]);

  const handleRate = useCallback(async (card, rating) => {
    const np = computeNext(prog[card.id], rating, settings);
    const updProg = { ...prog, [card.id]: np };
    saveProg(updProg);
    return np;
  }, [prog, saveProg, settings]);

  const logout = useCallback(() => {
    storage.del("mx5-payment"); setPayment(null); setView("landing");
  }, []);

  if (view === "loading")
    return <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: C.textLt }}>Chargement…</p></div>;
  if (view === "landing")
    return <Landing onPay={handlePay} onAdmin={handleAdmin} paymentStatus={payment} onDash={() => setView("dashboard")} />;
  if (view === "dashboard")
    return <Dashboard paymentStatus={payment} cards={cards} progress={prog} settings={settings} onStudy={startStudy} onGlobalStudy={startGlobalStudy} onAdmin={() => setView("admin")} onSettings={() => setView("settings")} onLogout={logout} />;
  if (view === "study" && studyCtx)
    return <StudyView label={studyCtx.label} queue={studyCtx.queue} onRate={handleRate} onBack={() => setView("dashboard")} settings={settings} />;
  if (view === "admin")
    return <AdminView cards={cards} onSave={handleSaveCard} onDelete={handleDeleteCard} onBack={() => setView(payment ? "dashboard" : "landing")} />;
  if (view === "settings")
    return <SettingsView settings={settings} onSave={saveSet} onBack={() => setView("dashboard")} />;
  return null;
}
