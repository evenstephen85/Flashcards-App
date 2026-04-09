import React, { useState, useEffect, useCallback, useRef } from "react";

// ── Google Fonts ──────────────────────────────────────────────────────────────
if (!document.querySelector('link[data-fc-fonts]')) {
  const fl = document.createElement("link");
  fl.rel = "stylesheet";
  fl.setAttribute("data-fc-fonts", "");
  fl.href = "https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&family=Merriweather:wght@400;700&family=Lato:wght@400;700;900&family=Dancing+Script:wght@600;700&display=swap";
  document.head.appendChild(fl);
}

// ── Storage ───────────────────────────────────────────────────────────────────
const SK = "flashcardsplus_v3";
const loadStateAsync = async () => { try { const r = await window.storage.get(SK); return r ? JSON.parse(r.value) : null; } catch { return null; } };
const saveStateAsync = async (s) => { try { await window.storage.set(SK, JSON.stringify(s)); } catch {} };
const deleteStateAsync = async () => { try { await window.storage.delete(SK); } catch {} };

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_USERS = 6;
const ALPHABET  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const NUMBERS   = Array.from({length:101},(_,i)=>i);

// 100 most common English words by frequency (approximate rank order)
const SIGHT_WORDS = [
  "the","of","and","a","to","in","is","you","that","it",
  "he","was","for","on","are","as","with","his","they","I",
  "at","be","this","have","from","or","one","had","by","but",
  "not","what","all","were","we","when","your","can","said","there",
  "each","which","she","do","how","their","if","will","up","other",
  "about","out","many","then","them","these","so","some","her","would",
  "make","like","him","into","time","has","look","two","more","go",
  "see","no","way","could","my","than","first","been","call","who",
  "its","now","find","long","down","day","did","get","come","made",
  "may","part","over","new","after","use","an","work","know","old",
];

const VOWELS = ["A","E","I","O","U"];
const CONSONANTS = ALPHABET.filter(l=>!VOWELS.includes(l));

const FONTS = [
  { id:"fredoka", label:"Rounded", css:"'Fredoka One', cursive",   bold:false },
  { id:"merri",   label:"Classic", css:"'Merriweather', serif",     bold:false },
  { id:"lato",    label:"Clean",   css:"'Lato', sans-serif",        bold:true  },
  { id:"dancing", label:"Cursive", css:"'Dancing Script', cursive", bold:true  },
];

const BASE_THEMES = [
  { id:"chalkboard",name:"Chalkboard",primary:"#023C0F",secondary:"#F4C847",accent:"#F0F0F0" },
  { id:"light",     name:"Light",     primary:"#FFFFFF",secondary:"#0078D4",accent:"#0B937C" },
  { id:"dark",      name:"Dark",      primary:"#050505",secondary:"#0042EB",accent:"#DEFF38" },
  { id:"princess", name:"Princess", primary:"#FF85E9",secondary:"#AC0ACD",accent:"#FF8E24" },
  { id:"ocean",     name:"Ocean",     primary:"#33CCFF",secondary:"#FFF176",accent:"#77F8CB" },
  { id:"energy",    name:"Energy",    primary:"#520052",secondary:"#FF8C00",accent:"#39FF14" },
];

// Colour derivation
const hexToRgb  = h => { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `${r},${g},${b}`; };
const luminance  = h => { const r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255; return 0.299*r+0.587*g+0.114*b; };
const clampByte  = n => Math.max(0,Math.min(255,Math.round(n)));
const shiftHex   = (h,dr,dg,db) => { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `#${clampByte(r+dr).toString(16).padStart(2,"0")}${clampByte(g+dg).toString(16).padStart(2,"0")}${clampByte(b+db).toString(16).padStart(2,"0")}`; };

// HSB <-> Hex
function hsbToHex(h,s,b){
  s/=100;b/=100;const k=n=>(n+h/60)%6;
  const f=n=>b-b*s*Math.max(0,Math.min(k(n),4-k(n),1));
  return `#${[f(5),f(3),f(1)].map(v=>clampByte(v*255).toString(16).padStart(2,"0")).join("")}`;
}
function hexToHsb(hex){
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  let h=0;if(d){if(mx===r)h=60*((g-b)/d%6);else if(mx===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);}
  if(h<0)h+=360;
  const s=mx?d/mx*100:0;
  return{h:Math.round(h),s:Math.round(s),b:Math.round(mx*100)};
}
function brightnessToSB(n){
  if(n<=10)return{s:0,b:n*5};
  if(n<=25)return{s:(n-10)*6.66,b:50-2.5*(n-10)};
  if(n<=75)return{s:100,b:1.75*(n-25)+12.5};
  if(n<=90)return{s:100-6.66*(n-75),b:100-3.33*(n-75)};
  return{s:0,b:50+5*(n-90)};
}
function sbToBrightness(s,b){
  // reverse: find closest N
  let best=0,bestD=Infinity;
  for(let n=0;n<=100;n++){const{s:ts,b:tb}=brightnessToSB(n);const d=Math.abs(ts-s)+Math.abs(tb-b);if(d<bestD){bestD=d;best=n;}}
  return best;
}

function ColorPickerSliders({value,onChange}){
  const hsb=hexToHsb(value);
  const[hue,setHue]=useState(hsb.h);
  const[bright,setBright]=useState(()=>sbToBrightness(hsb.s,hsb.b));
  const apply=(h,n)=>{const{s,b}=brightnessToSB(n);const hex=hsbToHex(h,s,b);onChange(hex);};
  const handleHue=e=>{const h=Number(e.target.value);setHue(h);apply(h,bright);};
  const handleBright=e=>{const n=Number(e.target.value);setBright(n);apply(hue,n);};
  const{s:curS,b:curB}=brightnessToSB(bright);
  const previewColor=hsbToHex(hue,curS,curB);
  const hueGrad="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)";
  const brightGrad=(()=>{const stops=[];for(let n=0;n<=100;n+=5){const{s,b}=brightnessToSB(n);stops.push(hsbToHex(hue,s,b));}return`linear-gradient(to right,${stops.join(",")})`;})();
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8,width:"100%"}}>
      <div style={{width:clamp(44,vminPx(9),66),height:clamp(44,vminPx(9),66),borderRadius:"var(--r)",border:"2px solid var(--border2)",background:previewColor,alignSelf:"center"}}/>
      <div style={{position:"relative",height:28}}>
        <div style={{position:"absolute",inset:0,borderRadius:14,background:hueGrad,pointerEvents:"none"}}/>
        <input type="range"min="0"max="359"value={hue}onChange={handleHue}style={{position:"absolute",width:"100%",height:"100%",opacity:0,cursor:"pointer",margin:0}}/>
      </div>
      <div style={{position:"relative",height:28}}>
        <div style={{position:"absolute",inset:0,borderRadius:14,background:brightGrad,pointerEvents:"none"}}/>
        <input type="range"min="0"max="100"value={bright}onChange={handleBright}style={{position:"absolute",width:"100%",height:"100%",opacity:0,cursor:"pointer",margin:0}}/>
      </div>
    </div>
  );
}

function deriveTheme(p) {
  const lum = luminance(p);
  const dark = lum < 0.5;
  const bgShift   = dark ? 30 : -50;
  const surfShift = dark ? 20 : -35;
  const bg      = shiftHex(p, bgShift,   bgShift,   bgShift);
  const surface = shiftHex(p, surfShift, surfShift, surfShift);
  const white   = dark ? "#F4F1E8" : "#1A1A1A";
  const dim     = dark ? "rgba(244,241,232,0.55)" : "rgba(26,26,26,0.55)";
  const border2 = dark ? "rgba(244,241,232,0.27)" : "rgba(26,26,26,0.25)";
  return { bg, surface, white, dim, border2 };
}

function applyTheme(theme, fontId) {
  const root = document.documentElement;
  const d    = deriveTheme(theme.primary);
  root.style.setProperty("--primary",   theme.primary);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--accent",    theme.accent);
  const rp=hexToRgb(theme.primary), rs=hexToRgb(theme.secondary), ra=hexToRgb(theme.accent);
  root.style.setProperty("--rgb-primary",   rp);
  root.style.setProperty("--rgb-secondary", rs);
  root.style.setProperty("--rgb-accent",    ra);
  root.style.setProperty("--bg",      d.bg);
  root.style.setProperty("--surface", d.surface);
  root.style.setProperty("--white",   d.white);
  root.style.setProperty("--dim",     d.dim);
  root.style.setProperty("--border2", d.border2);
  root.style.setProperty("--p-soft",`rgba(${rp},.12)`);root.style.setProperty("--p-mid",`rgba(${rp},.25)`);root.style.setProperty("--p-bold",`rgba(${rp},.4)`);
  root.style.setProperty("--s-soft",`rgba(${rs},.12)`);root.style.setProperty("--s-mid",`rgba(${rs},.25)`);root.style.setProperty("--s-bold",`rgba(${rs},.4)`);
  root.style.setProperty("--a-soft",`rgba(${ra},.12)`);root.style.setProperty("--a-mid",`rgba(${ra},.25)`);root.style.setProperty("--a-bold",`rgba(${ra},.4)`);
  const font = FONTS.find(f=>f.id===fontId)||FONTS[0];
  root.style.setProperty("--title",        font.css);
  root.style.setProperty("--title-weight", font.bold?"700":"400");
}
function resolveUserTheme(u) {
  const id=u?.themeId||"chalkboard";
  const base=BASE_THEMES.find(t=>t.id===id)||BASE_THEMES[0];
  const ov=u?.customThemes?.[id]||{};
  return {...base,...ov,id};
}

// ── Shared settings ───────────────────────────────────────────────────────────
const DEFAULT_SHARED = { timer:{mode:"none",seconds:60}, scored:false, order:"alpha", cardCount:0, algebra:"Off" };
const getShared = u => ({...DEFAULT_SHARED,...(u?.sharedSettings||{})});
const saveShared = (appState,activeUser,patch,persist) =>
  persist({...appState,users:appState.users.map(u=>u.name===activeUser?{...u,sharedSettings:{...getShared(u),...patch}}:u)});

// ── Mode config ───────────────────────────────────────────────────────────────
const MODES = [
  {id:"letters",       label:"ABC abc\u2026",          sub:"Letters",       portrait:"secondary",landscape:"secondary" },
  {id:"numbers",       label:"1\u2026 2\u2026 3\u2026",sub:"Numbers",       portrait:"accent",   landscape:"accent"    },
  {id:"sightwords",    label:"a\u2026 I\u2026 the\u2026",sub:"Sight Words",portrait:"accent",   landscape:"secondary" },
  {id:"phonics",       label:"Zeb\u2026 Pav\u2026",    sub:"Phonics",       portrait:"secondary",landscape:"accent"    },
  {id:"addition",      label:"1 + 2 = 3",              sub:"Addition",      portrait:"secondary",landscape:"accent"    },
  {id:"subtraction",   label:"1 \u2212 1 = 0",         sub:"Subtraction",   portrait:"accent",   landscape:"secondary" },
  {id:"multiplication",label:"2 \u00d7 2 = 4",         sub:"Multiplication",portrait:"accent",   landscape:"accent"    },
  {id:"division",      label:"4 \u00f7 1 = 4",         sub:"Division",      portrait:"secondary",landscape:"secondary" },
];

const QWERTY = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["SHIFT","Z","X","C","V","B","N","M","DEL"],
  ["DONE"],
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtTime = s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
const clamp   = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const vminPx  = pct=>Math.min(window.innerWidth,window.innerHeight)*pct/100;
const tc  = k=>`var(--${k})`;
const tca = (k,a)=>`rgba(var(--rgb-${k}),${a})`;

// ── Hooks ─────────────────────────────────────────────────────────────────────
function usePortrait(){const[p,setP]=useState(window.innerHeight>window.innerWidth);useEffect(()=>{const u=()=>setP(window.innerHeight>window.innerWidth);window.addEventListener("resize",u);return()=>window.removeEventListener("resize",u);},[]);return p;}
function useViewport(){const[vp,setVp]=useState({vw:window.innerWidth,vh:window.innerHeight});useEffect(()=>{const u=()=>setVp({vw:window.innerWidth,vh:window.innerHeight});window.addEventListener("resize",u);return()=>window.removeEventListener("resize",u);},[]);return vp;}

// ── Icons ─────────────────────────────────────────────────────────────────────
const Ico = {
  home:    ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>,
  edit:    ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:   ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  gear:    ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.1"strokeLinecap="round"strokeLinejoin="round"><circle cx="12"cy="12"r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  reset:   ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
  retry:   ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  watch:   ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.1"strokeLinecap="round"strokeLinejoin="round"><circle cx="12"cy="13"r="7"/><polyline points="12 10 12 13 14 15"/><path d="M9.5 2.5h5M12 2.5V5"/><path d="M19 5l1.5-1.5"/></svg>,
  alpha:   ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"><line x1="4"y1="7"x2="20"y2="7"/><line x1="4"y1="12"x2="15"y2="12"/><line x1="4"y1="17"x2="10"y2="17"/><polyline points="18 15 21 12 18 9"strokeLinejoin="round"/></svg>,
  shuffle: ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4"y1="20"x2="21"y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15"y1="15"x2="21"y2="21"/><line x1="4"y1="4"x2="9"y2="9"/></svg>,
  card:    ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="3"y="4"width="18"height="16"rx="2"fill={c}fillOpacity=".15"/><rect x="3"y="4"width="18"height="16"rx="2"/><line x1="7"y1="10"x2="17"y2="10"/><line x1="7"y1="14"x2="14"y2="14"/></svg>,
  back:    ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  list:    ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"strokeLinejoin="round"><line x1="8"y1="6"x2="21"y2="6"/><line x1="8"y1="12"x2="21"y2="12"/><line x1="8"y1="18"x2="21"y2="18"/><line x1="3"y1="6"x2="3.01"y2="6"/><line x1="3"y1="12"x2="3.01"y2="12"/><line x1="3"y1="18"x2="3.01"y2="18"/></svg>,
  flag:    ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.2"strokeLinecap="round"strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"fill={c}fillOpacity=".25"/><line x1="4"y1="22"x2="4"y2="15"/></svg>,
  check:   ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.8"strokeLinecap="round"strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x:       ({sz,c="currentColor"})=><svg width={sz}height={sz}viewBox="0 0 24 24"fill="none"stroke={c}strokeWidth="2.8"strokeLinecap="round"strokeLinejoin="round"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>,
};

// Two score placards side by side
const IcoScore = ({sz,c="currentColor",active=true})=>{
  const s=Math.max(sz||8,8);
  return(
    <svg width={s*2.4} height={s*2} viewBox="0 0 48 40" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{opacity:active?1:0.5}}>
      <rect x="1" y="8" width="20" height="30" rx="2.5" fill={c} fillOpacity=".14"/>
      <rect x="1" y="8" width="20" height="30" rx="2.5"/>
      <circle cx="11" cy="4" r="2" fill={c} opacity=".75"/>
      <line x1="11" y1="6" x2="11" y2="8" strokeWidth="1.4"/>
      <line x1="11" y1="18" x2="11" y2="30" strokeWidth="2.5"/>
      <line x1="9" y1="20" x2="11" y2="18" strokeWidth="2"/>
      <rect x="27" y="8" width="20" height="30" rx="2.5" fill={c} fillOpacity=".22"/>
      <rect x="27" y="8" width="20" height="30" rx="2.5"/>
      <circle cx="37" cy="4" r="2" fill={c} opacity=".75"/>
      <line x1="37" y1="6" x2="37" y2="8" strokeWidth="1.4"/>
      <line x1="33" y1="18" x2="41" y2="18" strokeWidth="2.5"/>
      <line x1="41" y1="18" x2="36" y2="30" strokeWidth="2.5"/>
      {!active && <line x1="0" y1="20" x2="48" y2="20" stroke={c} strokeWidth="2.8" opacity=".8"/>}
    </svg>
  );
};
// ── CSS ───────────────────────────────────────────────────────────────────────
if (!document.querySelector('style[data-fc-css]')) {
const styleEl = document.createElement("style");
styleEl.setAttribute("data-fc-css", "");
styleEl.textContent = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;}
:root{
  --bg:#1A3D2B;--surface:#153322;--white:#F4F1E8;--dim:rgba(244,241,232,0.55);
  --border:rgba(244,241,232,0.13);--border2:rgba(244,241,232,0.27);
  --primary:#2D8A5E;--secondary:#F4C847;--accent:#F0F0F0;--red:#E88080;--green:#4CAF50;
  --rgb-primary:45,138,94;--rgb-secondary:244,200,71;--rgb-accent:240,240,240;
  --p-soft:rgba(45,138,94,.12);--p-mid:rgba(45,138,94,.25);--p-bold:rgba(45,138,94,.4);
  --s-soft:rgba(244,200,71,.12);--s-mid:rgba(244,200,71,.25);--s-bold:rgba(244,200,71,.4);
  --a-soft:rgba(240,240,240,.12);--a-mid:rgba(240,240,240,.25);--a-bold:rgba(240,240,240,.4);
  --r-soft:rgba(232,128,128,.18);--r-mid:rgba(232,128,128,.35);--r-bold:rgba(232,128,128,.55);--r-mute:rgba(232,128,128,.65);
  --g-soft:rgba(76,175,80,.12);--g-mid:rgba(76,175,80,.25);--g-bold:rgba(76,175,80,.4);
  --overlay:rgba(0,0,0,.65);--press:rgba(255,255,255,.1);--shadow:rgba(0,0,0,.4);
  --r:12px;--pill:50px;
  --fs-xs:clamp(.7rem,2vmin,.9rem);--fs-sm:clamp(.85rem,2.5vmin,1.1rem);--fs-md:clamp(1rem,3vmin,1.4rem);--fs-lg:clamp(1.3rem,4vmin,2rem);--fs-xl:clamp(2rem,8vmin,4.5rem);
  --title:'Fredoka One',cursive;--title-weight:400;--body:'Nunito',sans-serif;
}
html,body,#root{width:100%;height:100%;overflow:hidden;background:var(--bg);}
.app{width:100vw;height:100dvh;display:flex;align-items:stretch;font-family:var(--body);color:var(--white);overflow:hidden;background:var(--bg);}
.screen{width:100%;height:100%;display:flex;flex-direction:column;animation:fadeUp .3s ease;}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.greeting-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:clamp(28px,5vmin,64px) clamp(20px,5vmin,64px);}
.greeting-top{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(12px,2.5vmin,28px);text-align:center;}
.app-title{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(3rem,12vmin,7rem);color:var(--secondary);line-height:1;}
.app-tagline{font-size:clamp(1.2rem,4vmin,2.2rem);font-weight:700;color:var(--white);line-height:1.35;max-width:540px;}
.hdivider{width:100%;max-width:360px;height:1px;background:var(--border2);}
.greeting-body{font-size:clamp(1.05rem,3.2vmin,1.7rem);font-weight:600;color:var(--dim);line-height:1.9;max-width:520px;}
.greeting-body .hl{color:var(--white);font-weight:800;}
.greeting-body .hl2{color:var(--secondary);font-weight:800;}
.greeting-body .hl3{color:var(--primary);font-weight:800;}
.start-btn{width:100%;max-width:440px;padding:clamp(16px,4vmin,30px) 24px;background:var(--secondary);border:none;border-radius:var(--pill);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.5rem,5vmin,2.6rem);color:var(--bg);cursor:pointer;transition:transform .12s,filter .12s;margin-top:clamp(6px,2vmin,20px);}
.start-btn:active{transform:scale(.97);filter:brightness(.92);}
.name-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:clamp(10px,2vmin,24px) clamp(12px,3vmin,24px) 0;gap:clamp(6px,1.4vmin,14px);}
.name-title{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.5rem,5vmin,3.2rem);color:var(--secondary);text-align:center;line-height:1.1;}
.name-display{width:100%;background:var(--surface);border:2.5px solid var(--border2);border-radius:var(--r);padding:clamp(8px,2vmin,18px) 20px;font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.8rem,6vmin,4rem);height:clamp(64px,12vmin,108px);display:flex;align-items:center;letter-spacing:2px;cursor:text;flex-shrink:0;}
.name-placeholder{color:var(--dim);font-family:var(--title);font-weight:var(--title-weight);font-size:inherit;letter-spacing:2px;}
.text-cursor{display:inline-block;width:3px;height:.85em;background:var(--secondary);margin-left:1px;vertical-align:middle;animation:blink 1s step-end infinite;flex-shrink:0;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
.name-error{color:var(--red);font-size:clamp(.85rem,2vmin,1.1rem);font-weight:700;align-self:flex-start;width:100%;padding-left:4px;}
.name-keyboard-area{display:flex;flex-direction:column;justify-content:flex-end;width:100%;flex-shrink:0;margin-top:auto;}
.name-action-row{display:flex;flex-direction:row-reverse;gap:10px;width:100%;flex-shrink:0;margin-top:clamp(6px,1.5vmin,14px);margin-bottom:clamp(4px,1vmin,10px);}
.name-done-btn{flex:1;padding:clamp(12px,3vmin,20px) 16px;background:var(--g-soft);border:2px solid var(--green);border-radius:var(--pill);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1rem,3.5vmin,1.8rem);color:var(--green);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;opacity:1;}
.name-done-btn svg,.name-done-btn span{opacity:1;}
.name-done-btn:active{filter:brightness(.88);}
.name-cancel-btn{flex:1;padding:clamp(12px,3vmin,20px) 16px;background:transparent;border:2px solid var(--border2);border-radius:var(--pill);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1rem,3.5vmin,1.8rem);color:var(--dim);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;}
.name-cancel-btn:active{filter:brightness(.88);}
.keyboard{width:100%;display:flex;flex-direction:column;gap:clamp(3px,.8vmin,8px);padding-bottom:clamp(4px,1vmin,12px);}
.key-row{display:flex;gap:clamp(3px,.6vmin,7px);height:calc((100vw - 60px) / 10);flex-shrink:1;min-height:28px;}
@media (orientation:landscape){.key-row{height:calc(min((100vw - 60px) / 10, (100vh - 200px) / 6));}}
.key{flex:1;min-width:0;background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--r);color:var(--primary);font-family:var(--body);font-size:clamp(.8rem,2.5vmin,1.4rem);font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;touch-action:manipulation;transition:background .07s,transform .07s;}
.key:active{background:var(--p-mid);transform:scale(.93);}
.key-wide{flex:1.7;}
.key-shift-on{background:var(--s-mid);border-color:var(--secondary);color:var(--secondary);}
.key-del{background:var(--r-soft);border-color:var(--red);color:var(--red);}
.done-row{flex:1;min-height:0;max-height:calc((100vw - 24px) / 10);display:flex;}
.key-done{flex:1;background:var(--p-mid);border:2px solid var(--primary);border-radius:var(--r);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1rem,3.5vmin,1.8rem);color:var(--primary);cursor:pointer;touch-action:manipulation;transition:background .1s;}
.key-done:active{background:var(--p-bold);}
.numpad{width:100%;max-width:320px;display:flex;flex-direction:column;gap:clamp(4px,.8vmin,8px);margin:0 auto;}
.numpad-row{display:flex;gap:clamp(4px,.8vmin,8px);}
.numpad-key{flex:1;aspect-ratio:1;min-width:0;background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--r);color:var(--primary);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.2rem,4vmin,2rem);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;touch-action:manipulation;transition:background .07s,transform .07s;}
.numpad-key:active{background:var(--p-mid);transform:scale(.93);}
.numpad-neg{color:var(--red);font-size:clamp(1.5rem,5vmin,2.5rem);font-weight:900;}
.numpad-check{background:var(--g-soft);border-color:var(--green);color:var(--green);font-size:clamp(1.5rem,5vmin,2.5rem);}
.numpad-check:active{background:var(--green);color:#fff;}
.answer-input-box{display:inline-block;min-width:1.5em;padding:0 .15em;border-bottom:3px solid var(--accent);text-align:center;color:var(--accent);font-family:var(--title);font-weight:var(--title-weight);}
.answer-feedback{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(2rem,8vmin,4rem);padding:clamp(8px,2vmin,16px) clamp(16px,4vmin,32px);border-radius:var(--r);z-index:10;animation:feedPop .4s ease-out;}
.answer-feedback.correct{color:var(--green);background:var(--g-soft);}
.answer-feedback.wrong{color:var(--red);background:var(--r-soft);}
@keyframes feedPop{0%{transform:translate(-50%,-50%) scale(.5);opacity:0}50%{transform:translate(-50%,-50%) scale(1.15);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
.uselect-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:clamp(12px,2.5vmin,28px) clamp(14px,3.5vmin,40px);gap:clamp(10px,2vmin,20px);}
.uselect-title{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.8rem,7vmin,4.5rem);color:var(--secondary);text-align:center;}
.user-grid{display:grid;width:100%;gap:clamp(6px,1.2vmin,12px);overflow-y:auto;flex:1;align-content:start;}
.user-pill{background:var(--surface);border:2px solid var(--border2);border-radius:50px;padding:clamp(12px,2.5vmin,20px) clamp(14px,3vmin,24px);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.1rem,3.5vmin,1.8rem);color:var(--accent);cursor:pointer;touch-action:manipulation;transition:background .12s,transform .1s;width:100%;display:flex;align-items:center;gap:8px;}
.user-pill:active{transform:scale(.97);background:var(--press);}
.user-pill.add-pill{border-style:dashed;color:var(--dim);font-weight:600;justify-content:center;font-family:var(--body);}
.user-name{flex:1;text-align:left;}
.uab{background:transparent;border:none;padding:5px;cursor:pointer;touch-action:manipulation;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:color .15s,background .15s;flex-shrink:0;}
.uab.edit{color:var(--a-bold);}
.uab.edit:active{color:var(--accent);background:var(--a-mid);}
.uab.del{color:var(--r-mute);}
.uab.del:active{color:var(--red);background:var(--r-soft);}
.dialog-overlay{position:fixed;inset:0;background:var(--overlay);display:flex;align-items:center;justify-content:center;z-index:999;animation:fadeUp .2s ease;padding:16px;}
.dialog-box{background:var(--surface);border:2px solid var(--border2);border-radius:var(--r);padding:clamp(18px,3.5vmin,32px) clamp(18px,4.5vmin,36px);max-width:520px;width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;max-height:92vh;overflow-y:auto;}
.dialog-box::-webkit-scrollbar{width:4px;}
.dialog-box::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px;}
.dialog-title{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.5rem,4.5vmin,2.2rem);color:var(--primary);}
.dialog-body{font-size:clamp(1rem,2.8vmin,1.3rem);font-weight:600;color:var(--dim);line-height:1.6;}
.dialog-name{color:var(--secondary);}
.dialog-warn{color:var(--red);font-size:clamp(.8rem,2.2vmin,1rem);font-weight:700;}
.dialog-row{display:flex;gap:10px;width:100%;}
.dialog-row.col{flex-direction:column;}
.dbtn{flex:1;padding:clamp(11px,2.8vmin,18px) 10px;border-radius:var(--r);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(.95rem,2.8vmin,1.3rem);cursor:pointer;touch-action:manipulation;transition:background .12s,transform .1s;border:2px solid var(--border2);background:transparent;color:var(--dim);display:flex;align-items:center;justify-content:center;gap:7px;}
.dbtn:active{transform:scale(.97);}
.dbtn.p{background:var(--g-soft);border-color:var(--green);color:var(--green);opacity:1;}
.dbtn.d{background:var(--r-soft);border-color:var(--red);color:var(--red);opacity:1;}
.timer-mode-row{display:flex;gap:8px;width:100%;}
.timer-mode-btn{flex:1;padding:clamp(12px,3vmin,22px) 6px;background:var(--bg);border:2px solid var(--border2);border-radius:var(--r);font-family:var(--title);font-weight:var(--title-weight);color:var(--dim);cursor:pointer;touch-action:manipulation;transition:all .12s;text-align:center;font-size:inherit;}
.timer-mode-btn.sel{background:var(--a-mid);border-color:var(--accent);color:var(--accent);}
.timer-mode-btn:active{transform:scale(.95);}
.pm-wrap-portrait{width:86%;margin:0 auto;}
.pm-wrap-landscape{width:100%;}
.pm-area{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:clamp(6px,1.5vmin,14px) 0;}
.pm-area-land{display:grid;grid-template-columns:1fr auto 1fr auto;align-items:stretch;gap:8px;padding:clamp(4px,1vmin,10px) 0;}
.pm-col{display:flex;flex-direction:column;gap:7px;}
.pm-time{font-family:var(--title);font-weight:var(--title-weight);color:var(--white);text-align:center;padding:0 10px;min-width:6ch;}
.pm-actions-col{display:flex;flex-direction:column;gap:7px;align-self:stretch;}
.pm-btn{border-radius:var(--r);font-family:var(--title);font-weight:var(--title-weight);cursor:pointer;touch-action:manipulation;padding:clamp(10px,2.5vmin,18px) 8px;text-align:center;white-space:nowrap;border:2px solid;transition:transform .08s;}
.pm-btn:active{transform:scale(.93);}
.pm-btn.cp{background:var(--p-soft);border-color:var(--primary);color:var(--primary);}
.pm-btn.cs{background:var(--s-soft);border-color:var(--secondary);color:var(--secondary);}
.pm-btn.ca{background:var(--a-soft);border-color:var(--accent);color:var(--accent);}
.top-bar{display:flex;align-items:center;justify-content:space-between;padding:clamp(10px,2.5vmin,20px) clamp(10px,2.5vmin,22px);flex-shrink:0;gap:8px;}
.user-chip{background:var(--surface);border:1.5px solid var(--border2);border-radius:50px;padding:clamp(8px,1.8vmin,14px) clamp(12px,2.5vmin,22px);font-family:var(--body);font-size:clamp(.85rem,2.2vmin,1.2rem);font-weight:700;color:var(--dim);cursor:pointer;touch-action:manipulation;transition:background .12s;white-space:nowrap;}
.user-chip:active{background:var(--press);}
.bar-title{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.4rem,4vmin,2.6rem);color:var(--secondary);flex-shrink:0;}
.icon-btn{background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--r);display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;transition:background .12s;flex-shrink:0;}
.icon-btn:active{background:var(--press);}
.icon-btn.home-btn{background:var(--a-soft);border-color:var(--accent);}
.icon-btn.home-btn:active{background:var(--a-mid);}
.mode-grid{flex:1;display:grid;min-height:0;padding:0 clamp(5px,1.2vmin,12px) clamp(6px,1.5vmin,14px);gap:clamp(4px,.8vmin,8px);grid-auto-rows:1fr;}
.mode-btn{border-radius:var(--r);border:2px solid transparent;cursor:pointer;touch-action:manipulation;transition:transform .11s,filter .11s;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px;gap:1px;overflow:hidden;position:relative;min-height:0;min-width:0;}
.mode-btn:active{transform:scale(.95);filter:brightness(1.1);}
.mode-bg{position:absolute;inset:0;border-radius:inherit;}
.mode-label{font-family:var(--title);font-weight:var(--title-weight);line-height:1.05;text-align:center;position:relative;z-index:1;overflow:hidden;max-width:100%;}
.mode-sub{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(.85rem,2.5vmin,1.4rem);opacity:.85;text-align:center;position:relative;z-index:1;overflow:hidden;max-width:100%;}
.letsel-header{display:flex;flex-direction:column;flex-shrink:0;padding:clamp(5px,1.8vmin,14px) clamp(5px,1.2vmin,10px);gap:clamp(3px,.7vmin,7px);border-bottom:1px solid var(--border);}
.letsel-row{display:flex;align-items:center;gap:clamp(3px,.5vmin,5px);}
.letsel-title{font-family:var(--title);font-weight:var(--title-weight);color:var(--secondary);margin-right:auto;flex-shrink:0;}
.accent-pill{background:var(--a-soft);border:1.5px solid var(--accent);border-radius:var(--r);color:var(--accent);cursor:pointer;touch-action:manipulation;transition:background .12s;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;}
.accent-pill:active{background:var(--a-mid);}
.pill-row1{display:flex;align-items:center;justify-content:center;}
.pill-row2{font-family:var(--title);font-weight:var(--title-weight);}
.letter-grid{flex:1;display:grid;min-height:0;align-content:start;overflow:hidden;}
.tile{border-radius:var(--r);border:2px solid var(--border2);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;transition:transform .1s,background .12s,border-color .12s,color .12s;font-family:var(--title);font-weight:var(--title-weight);line-height:1;color:var(--dim);min-width:0;min-height:0;overflow:hidden;}
.tile:active{transform:scale(.91);}
.tile.sel{background:var(--s-mid);border-color:var(--secondary);color:var(--secondary);font-weight:700;}
.tile-wide{grid-column:span 2;}
.case-tile{border-color:var(--accent);background:var(--a-soft);padding:0;overflow:hidden;cursor:pointer;display:flex;}
.case-tile:active{transform:scale(.93);}
.case-half{flex:1;height:100%;display:flex;align-items:center;justify-content:center;font-family:var(--title);font-weight:var(--title-weight);transition:background .15s,color .15s;color:var(--dim);pointer-events:none;}
.case-half.active-half{background:var(--a-bold);color:var(--accent);}
.case-divider{width:1px;height:55%;background:var(--border2);flex-shrink:0;pointer-events:none;}
.tile.ctrl-all{border-color:var(--accent);color:var(--dim);background:var(--a-soft);}
.letsel-actions{display:flex;align-items:stretch;gap:clamp(5px,1.2vmin,12px);padding:clamp(8px,2.5vmin,20px) clamp(8px,2vmin,16px);flex-shrink:0;border-top:1px solid var(--border);}
.footer-btn{flex:1;border-radius:var(--pill);font-family:var(--title);font-weight:var(--title-weight);cursor:pointer;touch-action:manipulation;transition:transform .12s,filter .12s;display:flex;align-items:center;justify-content:center;gap:clamp(4px,1vmin,8px);border:2px solid var(--border2);background:var(--surface);color:var(--dim);}
.footer-btn.home{background:var(--a-soft);border-color:var(--accent);color:var(--accent);}
.footer-btn:active{transform:scale(.97);}
.footer-btn.go{background:var(--secondary);border-color:var(--secondary);color:var(--bg);}
.footer-btn.go:disabled{opacity:.32;cursor:default;}
.num-slider-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(20px,4vmin,40px);padding:clamp(20px,4vmin,48px) clamp(20px,5vmin,60px);}
.num-range-display{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(2.5rem,9vmin,5.5rem);color:var(--secondary);text-align:center;}
.num-range-sub{font-family:var(--body);font-weight:600;color:var(--dim);font-size:clamp(.9rem,2.5vmin,1.3rem);text-align:center;}
.dual-slider{position:relative;width:100%;height:clamp(40px,8vmin,60px);}
.dual-slider input[type=range]{position:absolute;width:100%;top:50%;transform:translateY(-50%);-webkit-appearance:none;appearance:none;background:transparent;pointer-events:none;height:clamp(40px,8vmin,60px);}
.dual-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:clamp(30px,6vmin,48px);height:clamp(30px,6vmin,48px);border-radius:50%;background:var(--secondary);border:3px solid var(--accent);cursor:pointer;pointer-events:all;box-shadow:0 2px 8px var(--shadow);}
.dual-slider input[type=range]::-moz-range-thumb{width:clamp(30px,6vmin,48px);height:clamp(30px,6vmin,48px);border-radius:50%;background:var(--secondary);border:3px solid var(--accent);cursor:pointer;pointer-events:all;}
.slider-track{position:absolute;top:50%;transform:translateY(-50%);height:8px;width:100%;border-radius:4px;background:var(--border2);pointer-events:none;}
.slider-fill{position:absolute;top:50%;transform:translateY(-50%);height:8px;border-radius:4px;background:var(--secondary);pointer-events:none;}
.dialog-slider{width:100%;height:clamp(36px,7vmin,52px);-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;margin:4px 0;}
.dialog-slider::-webkit-slider-runnable-track{height:8px;border-radius:4px;background:var(--border2);}
.dialog-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:clamp(28px,5.5vmin,44px);height:clamp(28px,5.5vmin,44px);border-radius:50%;background:var(--secondary);border:3px solid var(--accent);margin-top:calc(-1 * (clamp(28px,5.5vmin,44px) - 8px) / 2);box-shadow:0 2px 6px var(--shadow);}
.dialog-slider::-moz-range-track{height:8px;border-radius:4px;background:var(--border2);}
.dialog-slider::-moz-range-thumb{width:clamp(28px,5.5vmin,44px);height:clamp(28px,5.5vmin,44px);border-radius:50%;background:var(--secondary);border:3px solid var(--accent);}
.dialog-slider-labels{display:flex;justify-content:space-between;font-family:var(--body);font-weight:700;color:var(--secondary);margin-top:4px;}
.settings-scroll{flex:1;overflow-y:auto;padding:clamp(12px,2.5vmin,24px) clamp(16px,4vmin,48px);display:flex;flex-direction:column;gap:clamp(12px,2.5vmin,22px);}
.settings-scroll::-webkit-scrollbar{width:4px;}
.settings-scroll::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px;}
.settings-section{display:flex;flex-direction:column;gap:8px;width:100%;max-width:480px;align-self:center;}
.settings-label{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.1rem,3.2vmin,1.6rem);color:var(--secondary);}
.settings-divider{width:100%;max-width:480px;align-self:center;min-height:2px;height:2px;background:var(--border2);flex-shrink:0;}
.colors-block{display:flex;flex-direction:column;gap:8px;}
.swatches-row{display:flex;align-items:flex-end;gap:12px;}
.color-swatch-wrap{display:flex;flex-direction:column;align-items:center;gap:4px;width:clamp(44px,9vmin,66px);}
.color-swatch-label{font-size:clamp(.72rem,2vmin,.95rem);font-weight:700;color:var(--secondary);font-family:var(--title);font-weight:var(--title-weight);text-align:center;}
.color-swatch{width:clamp(44px,9vmin,66px);height:clamp(44px,9vmin,66px);border-radius:var(--r);border:2px solid var(--border2);cursor:pointer;transition:transform .12s;}
.color-swatch:active{transform:scale(.9);}
input[type=color]{opacity:0;position:absolute;width:0;height:0;}
.theme-name-col{display:flex;flex-direction:column;gap:4px;flex:1;}
.theme-col-label{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(.72rem,2vmin,.95rem);color:var(--secondary);text-align:center;}
.theme-name-btn{width:100%;background:var(--bg);border:2px solid var(--border2);border-radius:var(--r);padding:0 clamp(10px,2.5vmin,18px);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(.9rem,2.5vmin,1.3rem);color:var(--accent);cursor:pointer;touch-action:manipulation;transition:background .12s;display:flex;align-items:center;justify-content:space-between;gap:8px;height:clamp(44px,9vmin,66px);}
.theme-name-btn:active{background:var(--a-soft);}
.font-grid{display:grid;gap:8px;}
.font-opt{padding:clamp(10px,2.5vmin,16px) 8px;background:var(--bg);border:2px solid var(--border2);border-radius:var(--r);font-size:clamp(.85rem,2.5vmin,1.1rem);color:var(--dim);cursor:pointer;touch-action:manipulation;transition:all .12s;text-align:center;}
.font-opt.sel{background:var(--a-mid);border-color:var(--accent);color:var(--accent);}
.font-opt:active{transform:scale(.94);}
.game-settings-grid{display:grid;gap:8px;}
.game-setting-btn{display:flex;align-items:center;gap:10px;width:100%;padding:clamp(12px,2.8vmin,20px) clamp(12px,3vmin,20px);background:var(--bg);border:2px solid var(--border2);border-radius:var(--r);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1rem,2.8vmin,1.4rem);color:var(--accent);cursor:pointer;touch-action:manipulation;transition:background .12s;text-align:left;}
.game-setting-btn:active{background:var(--a-soft);}
.game-setting-btn.active{background:var(--p-soft);border-color:var(--primary);color:var(--primary);}
.game-setting-icon{flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.game-setting-label{flex:1;font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(.75rem,2vmin,1rem);color:var(--dim);}
.game-setting-value{flex-shrink:0;font-family:var(--title);font-weight:var(--title-weight);}
.theme-picker-grid{display:grid;gap:7px;width:100%;}
.theme-item{display:flex;align-items:center;gap:10px;width:100%;background:var(--bg);border:2px solid var(--border2);border-radius:var(--r);padding:10px 12px;cursor:pointer;touch-action:manipulation;transition:background .12s;font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(.9rem,2.8vmin,1.25rem);color:var(--accent);}
.theme-item:active{background:var(--press);}
.theme-item.sel-theme{border-color:var(--accent);color:var(--accent);}
.theme-dot{width:16px;height:16px;border-radius:50%;flex-shrink:0;}
.theme-item-name{flex:1;text-align:left;color:var(--accent);}
.theme-item-actions{display:flex;gap:4px;flex-shrink:0;}
.theme-icon-btn{background:transparent;border:none;padding:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:6px;touch-action:manipulation;}
.reset-btn{width:100%;padding:clamp(13px,3vmin,20px) 24px;background:var(--r-soft);border:2px solid var(--red);border-radius:var(--r);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.1rem,3.5vmin,1.8rem);color:var(--red);cursor:pointer;touch-action:manipulation;transition:background .12s,transform .1s;display:flex;align-items:center;justify-content:center;gap:10px;}
.reset-btn svg,.reset-btn span{opacity:1;}
.reset-btn:active{background:var(--r-mid);transform:scale(.97);}
.generic-back{background:transparent;border:2px solid var(--accent);border-radius:50px;padding:clamp(12px,3vmin,20px) clamp(28px,5vmin,52px);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1rem,3vmin,1.6rem);color:var(--accent);cursor:pointer;touch-action:manipulation;}
.generic-back:active{background:var(--a-soft);}
.round-screen{width:100%;height:100%;display:flex;flex-direction:column;background:var(--bg);animation:fadeUp .3s ease;}
.round-topbar{display:flex;align-items:center;padding:clamp(10px,2.5vmin,20px) clamp(10px,2.5vmin,22px);flex-shrink:0;gap:8px;}
.round-progress{font-family:var(--body);font-weight:700;color:var(--dim);font-size:clamp(1rem,2.8vmin,1.5rem);flex:1;text-align:center;}
.round-timer{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(1.2rem,3.2vmin,2rem);color:var(--accent);flex-shrink:0;text-align:right;min-width:80px;}
.round-timer.warn{color:var(--red);}
.round-body{flex:1;display:flex;min-height:0;}
.round-body.col{flex-direction:column;}
.round-body.row{flex-direction:row;}
.card-area{flex:1;display:flex;align-items:center;justify-content:center;padding:clamp(10px,2.5vmin,24px);min-height:0;cursor:pointer;}
.card-area.no-tap{cursor:default;}
.flashcard{width:100%;height:100%;background:var(--surface);border-radius:var(--r);border:2px solid var(--border2);display:flex;align-items:center;justify-content:center;animation:cardIn .25s ease;}
@keyframes cardIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}
.card-letter{font-family:var(--title);font-weight:var(--title-weight);color:var(--primary);line-height:1;text-align:center;}
.score-bar-bottom{display:flex;gap:clamp(5px,1vmin,12px);padding:clamp(8px,2vmin,16px) clamp(10px,2.5vmin,20px);flex-shrink:0;border-top:1px solid var(--border);}
.score-bar-side{display:flex;flex-direction:column;gap:clamp(5px,1vmin,10px);padding:clamp(6px,1.5vmin,12px);flex-shrink:0;border-left:1px solid var(--border);}
.score-btn{border-radius:var(--r);font-family:var(--title);font-weight:var(--title-weight);cursor:pointer;touch-action:manipulation;transition:transform .1s;border:2px solid transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}
.score-btn:active{transform:scale(.94);}
.score-btn.correct{background:var(--g-mid);border-color:var(--green);color:var(--green);opacity:1;}
.score-btn.correct svg,.score-btn.correct span{opacity:1;}
.score-btn.wrong{background:var(--r-mid);border-color:var(--red);color:var(--red);opacity:1;}
.score-btn.wrong svg,.score-btn.wrong span{opacity:1;}
.score-btn.skip{background:var(--s-soft);border-color:var(--secondary);color:var(--secondary);}
.score-btn.back{background:var(--surface);border-color:var(--border2);color:var(--dim);}
.score-btn-sym{line-height:1;}
.score-btn-lbl{font-size:.55em;opacity:.85;font-family:var(--body);font-weight:700;}
.score-screen{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(14px,3vmin,28px);padding:clamp(16px,3.5vmin,40px) clamp(20px,5vmin,56px);text-align:center;}
.score-title{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(2.5rem,9vmin,5.5rem);color:var(--secondary);line-height:1;}
.score-grid{display:grid;gap:clamp(6px,1.5vmin,12px);width:100%;max-width:520px;}
.score-cell{background:var(--surface);border:2px solid var(--border2);border-radius:var(--r);padding:clamp(10px,2.5vmin,20px) 8px;display:flex;flex-direction:column;align-items:center;gap:4px;}
.score-cell-label{font-family:var(--body);font-weight:700;font-size:clamp(.75rem,2.2vmin,1.1rem);color:var(--dim);}
.score-cell-value{font-family:var(--title);font-weight:var(--title-weight);line-height:1;}
.score-actions{display:flex;gap:clamp(6px,1.5vmin,12px);width:100%;max-width:520px;}
.score-action-btn{flex:1;padding:clamp(12px,3vmin,22px) 6px;border-radius:var(--pill);font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(.9rem,3vmin,1.5rem);cursor:pointer;touch-action:manipulation;transition:transform .12s;display:flex;align-items:center;justify-content:center;gap:7px;border:2px solid transparent;}
.score-action-btn:active{transform:scale(.97);}
.score-action-btn.retry{background:var(--p-soft);border-color:var(--primary);color:var(--primary);}
.score-action-btn.select{background:transparent;border-color:var(--secondary);color:var(--secondary);}
.score-action-btn.home{background:transparent;border-color:var(--accent);color:var(--accent);}
.placeholder-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:40px 32px;}
.placeholder-title{font-family:var(--title);font-weight:var(--title-weight);font-size:clamp(2rem,7vmin,4rem);text-align:center;}
.placeholder-body{font-size:clamp(.95rem,2.5vmin,1.35rem);color:var(--dim);font-weight:600;text-align:center;max-width:400px;line-height:1.65;}
`;
document.head.appendChild(styleEl);
} // end style guard

// ── Keyboard ──
function Keyboard({ onChar, onDelete, onDone, isShift, onShiftPress, hideDone=false }) {
  const fire = useCallback((key,e)=>{
    e.preventDefault();
    if(key==="SHIFT"){onShiftPress();return;} if(key==="DEL"){onDelete();return;} if(key==="DONE"){onDone();return;} onChar(key);
  },[onChar,onDelete,onDone,onShiftPress]);
  return (
    <div className="keyboard">
      {QWERTY.map((row,ri)=>{
        if(row[0]==="DONE") {
          if(hideDone) return null;
          return <div key={ri} className="done-row"><button className="key-done" onPointerDown={e=>{e.preventDefault();onDone();}}>Done</button></div>;
        }
        return <div className="key-row" key={ri}>{row.map(key=>{let cls="key";if(key==="SHIFT")cls+=" key-wide"+(isShift?" key-shift-on":"");if(key==="DEL")cls+=" key-wide key-del";return <button key={key} className={cls} onPointerDown={e=>fire(key,e)}>{key==="SHIFT"?"shift":key==="DEL"?"del":key}</button>;})}</div>;
      })}
    </div>
  );
}

// ── Name Entry ────────────────────────────────────────────────────────────────
function NameEntryScreen({ onComplete, onCancel, existingNames=[], initialName="", title="Please enter child's Name" }) {
  const [chars,   setChars]   = useState(()=>initialName.split(""));
  const [cursor,  setCursor]  = useState(0);
  const [isShift, setIsShift] = useState(true);
  const [error,   setError]   = useState("");
  const [allSel,  setAllSel]  = useState(initialName.length>0);
  const displayRef = useRef(null);

  useEffect(()=>{ if(initialName.length>0){ setCursor(0); setAllSel(true); } },[]);

  const handleShiftPress = useCallback(()=>setIsShift(s=>!s),[]);

  const handleChar = useCallback((key)=>{
    setError("");
    const ch=isShift?key.toUpperCase():key.toLowerCase();
    if(isShift)setIsShift(false);
    if(allSel){setChars([ch]);setCursor(1);setAllSel(false);return;}
    if(chars.length>=24)return;
    setChars(c=>{const n=[...c];n.splice(cursor,0,ch);return n;});
    setCursor(p=>p+1);
  },[chars,cursor,isShift,allSel]);

  const handleDelete = useCallback(()=>{
    setError("");
    if(allSel){setChars([]);setCursor(0);setAllSel(false);setIsShift(true);return;}
    if(cursor===0)return;
    setChars(c=>{const n=[...c];n.splice(cursor-1,1);if(n.length===0)setIsShift(true);return n;});
    setCursor(p=>Math.max(0,p-1));
  },[chars,cursor,allSel]);

  const handleDone = useCallback(()=>{
    const t=chars.join("").trim();
    if(!t){setError("Please type a name first.");return;}
    if(existingNames.filter(n=>n.toLowerCase()!==initialName.toLowerCase()).map(n=>n.toLowerCase()).includes(t.toLowerCase())){setError("That name is already in use.");return;}
    onComplete(t);
  },[chars,existingNames,onComplete,initialName]);

  const handleDisplayClick = useCallback((e)=>{
    if(!displayRef.current)return;
    setAllSel(false);
    const name=chars.join("");
    if(!name){setCursor(0);return;}
    const el=displayRef.current,style=window.getComputedStyle(el);
    const fs=parseFloat(style.fontSize),ff=style.fontFamily;
    const cvs=document.createElement("canvas"),ctx=cvs.getContext("2d");
    ctx.font=`${fs}px ${ff}`;
    const rect=el.getBoundingClientRect();
    const clickX=e.clientX-rect.left-parseFloat(style.paddingLeft||"20");
    let best=name.length,bestDist=Infinity;
    for(let i=0;i<=name.length;i++){const w=ctx.measureText(name.slice(0,i)).width;const d=Math.abs(w-clickX);if(d<bestDist){bestDist=d;best=i;}}
    setCursor(best);
    if(best!==0||name.length>0) setIsShift(false);
  },[chars]);

  const name=chars.join(""),before=allSel?name:name.slice(0,cursor),after=allSel?"":name.slice(cursor);
  return (
    <div className="screen">
      <div className="name-wrap">
        <div className="name-title">{title}</div>
        <div style={{width:"100%"}}>
          <div ref={displayRef} className="name-display" onClick={handleDisplayClick}>
            {name?(
              <>
                <span style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:"inherit",color:"var(--secondary)",background:allSel?"var(--a-bold)":"transparent",borderRadius:allSel?"4px":undefined}}>{before}</span>
                {!allSel&&<span className="text-cursor"/>}
                <span style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:"inherit",color:"var(--secondary)"}}>{after}</span>
              </>
            ):(
              <><span className="text-cursor"/><span className="name-placeholder">Your name</span></>
            )}
          </div>
          {error&&<p className="name-error">{error}</p>}
        </div>
        <div className="name-keyboard-area">
          <Keyboard onChar={handleChar} onDelete={handleDelete} onDone={handleDone} isShift={isShift} onShiftPress={handleShiftPress} hideDone={true}/>
          <div className="name-action-row">
            <button className="name-done-btn" onClick={handleDone}><Ico.check sz={18} c="var(--green)"/>Done</button>
            {onCancel&&<button className="name-cancel-btn" onClick={onCancel}><Ico.x sz={18} c="var(--dim)"/>Cancel</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Timer / card-count dialog helpers ─────────────────────────────────────────
function useHoldRepeat(setSecs, clampFn) {
  const holdRef = useRef(null);
  const startHold = useCallback((d)=>{
    setSecs(s=>clampFn(s+d)); let c=0;
    const r=()=>{holdRef.current=setTimeout(()=>{c++;setSecs(s=>clampFn(s+d));r();},c<5?350:c<15?160:80);};r();
  },[setSecs,clampFn]);
  const stopHold=useCallback(()=>clearTimeout(holdRef.current),[]);
  useEffect(()=>()=>clearTimeout(holdRef.current),[]);
  return{startHold,stopHold};
}

// ── Timer Dialog ──────────────────────────────────────────────────────────────
function TimerDialog({timer,onSave,onCancel,fs=22}){
  const[mode,setMode]=useState(timer.mode);
  const[secs,setSecs]=useState(timer.seconds||60);
  const handleSlider=e=>setSecs(Number(e.target.value));
  const nudge=d=>setSecs(s=>clamp(s+d,5,120));
  return(
    <div className="dialog-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)onCancel();}}>
      <div className="dialog-box">
        <div className="dialog-title" style={{fontSize:fs*1.8}}>Timer</div>
        <div className="timer-mode-row">
          {[["none","Off"],["up","On"],["down","Timed"]].map(([v,l])=>
            <button key={v} className={`timer-mode-btn${mode===v?" sel":""}`} style={{fontSize:fs}} onClick={()=>setMode(v)}>{l}</button>
          )}
        </div>
        <div style={{width:"100%",padding:"clamp(8px,2vmin,16px) 0",opacity:mode==="down"?1:0.25,pointerEvents:mode==="down"?"auto":"none",transition:"opacity .2s"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:clamp(Math.round(fs*.5),6,16),marginBottom:10}}>
            <button onClick={()=>nudge(-1)} style={{width:fs*1.8,height:fs*1.8,borderRadius:"50%",border:"2px solid var(--accent)",background:"var(--a-soft)",color:"var(--accent)",fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:fs*1.1,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>&#8722;</button>
            <div style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:fs*1.8,color:"var(--accent)",textAlign:"center",minWidth:fs*4}}>{fmtTime(secs)}</div>
            <button onClick={()=>nudge(1)} style={{width:fs*1.8,height:fs*1.8,borderRadius:"50%",border:"2px solid var(--accent)",background:"var(--a-soft)",color:"var(--accent)",fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:fs*1.1,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          <input type="range" min="5" max="120" value={secs} onChange={handleSlider} className="dialog-slider"/>
          <div className="dialog-slider-labels" style={{fontSize:fs*.7}}>
            <span>:05</span><span>:30</span><span>1:00</span><span>1:30</span><span>2:00</span>
          </div>
        </div>
        <div className="dialog-row">
          <button className="dbtn" style={{fontSize:fs*.9}} onClick={onCancel}><Ico.x sz={16} c="var(--dim)"/>Cancel</button>
          <button className="dbtn p" style={{fontSize:fs*.9}} onClick={()=>onSave({mode,seconds:secs})}><Ico.check sz={16} c="var(--green)"/>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Card Count Dialog ─────────────────────────────────────────────────────────
function CardCountDialog({count,totalSelected,onSave,onCancel,fs=22}){
  const[val,setVal]=useState(count||0);
  const isAll=val===0;
  const sliderVal=isAll?26:val;
  const handleSlider=e=>{const raw=Number(e.target.value);setVal(raw>=26?0:raw);};
  const nudge=d=>{
    if(isAll&&d<0){setVal(25);return;}
    if(!isAll){const n=val+d;if(n>25){setVal(0);return;}setVal(clamp(n,5,25));return;}
    setVal(clamp(5+d,5,25));
  };
  return(
    <div className="dialog-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)onCancel();}}>
      <div className="dialog-box">
        <div className="dialog-title" style={{fontSize:fs*1.3}}>Maximum Cards?</div>
        <div style={{width:"100%",padding:"clamp(8px,2vmin,16px) 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:clamp(Math.round(fs*.5),6,16),marginBottom:10}}>
            <button onClick={()=>nudge(-1)} style={{width:fs*1.8,height:fs*1.8,borderRadius:"50%",border:"2px solid var(--accent)",background:"var(--a-soft)",color:"var(--accent)",fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:fs*1.1,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>&#8722;</button>
            <div style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:fs*2,color:"var(--accent)",textAlign:"center",minWidth:fs*4}}>{isAll?"All":val}</div>
            <button onClick={()=>nudge(1)} style={{width:fs*1.8,height:fs*1.8,borderRadius:"50%",border:"2px solid var(--accent)",background:"var(--a-soft)",color:"var(--accent)",fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:fs*1.1,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          <input type="range" min="5" max="26" value={sliderVal} onChange={handleSlider} className="dialog-slider"/>
          <div className="dialog-slider-labels" style={{fontSize:fs*.7}}>
            <span>5</span><span>10</span><span>15</span><span>20</span><span>All</span>
          </div>
        </div>
        <div className="dialog-row">
          <button className="dbtn" style={{fontSize:fs*.9}} onClick={onCancel}><Ico.x sz={16} c="var(--dim)"/>Cancel</button>
          <button className="dbtn p" style={{fontSize:fs*.9}} onClick={()=>onSave(val)}><Ico.check sz={16} c="var(--green)"/>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Generic dialogs ───────────────────────────────────────────────────────────
function DeleteUserDialog({name,onConfirm,onCancel}){return(<div className="dialog-overlay"onPointerDown={e=>{if(e.target===e.currentTarget)onCancel();}}><div className="dialog-box"><div className="dialog-title">Remove learner?</div><p className="dialog-body">Remove <span className="dialog-name">{name}</span> and their settings?</p><p className="dialog-warn">Cannot be undone.</p><div className="dialog-row"><button className="dbtn"onClick={onCancel}><Ico.x sz={15}c="var(--dim)"/>Cancel</button><button className="dbtn d"onClick={onConfirm}><Ico.trash sz={15}c="var(--red)"/>Remove</button></div></div></div>);}
function ResetDialog({onConfirm,onCancel}){return(<div className="dialog-overlay"onPointerDown={e=>{if(e.target===e.currentTarget)onCancel();}}><div className="dialog-box"><div className="dialog-title"style={{color:"var(--red)"}}>Factory Reset?</div><p className="dialog-body">Erase <strong style={{color:"var(--white)"}}>all data</strong>.</p><p className="dialog-warn">Cannot be undone.</p><div className="dialog-row"><button className="dbtn"onClick={onCancel}><Ico.x sz={15}c="var(--dim)"/>Cancel</button><button className="dbtn d"onClick={onConfirm}><Ico.reset sz={15}c="var(--red)"/>Reset</button></div></div></div>);}
function ResetThemeDialog({name,onConfirm,onCancel}){return(<div className="dialog-overlay"onPointerDown={e=>{if(e.target===e.currentTarget)onCancel();}}><div className="dialog-box"><div className="dialog-title">Reset theme?</div><p className="dialog-body">Restore <span className="dialog-name">{name}</span> to default colors?</p><div className="dialog-row"><button className="dbtn"onClick={onCancel}><Ico.x sz={15}c="var(--dim)"/>Cancel</button><button className="dbtn d"onClick={onConfirm}><Ico.reset sz={15}c="var(--red)"/>Reset</button></div></div></div>);}

// ── Greeting ──────────────────────────────────────────────────────────────────
function GreetingScreen({onContinue}){
  return(
    <div className="screen">
      <div className="greeting-wrap">
        <div className="greeting-top">
          <div className="app-title">Flashcards+</div>
          <div className="app-tagline">The free, fast way to learn with your child</div>
          <div className="hdivider"/>
          <p className="greeting-body">
            <span className="hl2">No ads.</span> <span className="hl2">No tracking.</span> <span className="hl2">No cost</span> — ever.<br/><br/>
            A <span className="hl">fun</span> learning app designed to be used <span className="hl">together with a parent</span>, just like real flashcards.
          </p>
        </div>
        <button className="start-btn" onClick={onContinue}>Get Started</button>
      </div>
    </div>
  );
}

// ── User Select ───────────────────────────────────────────────────────────────
function UserSelectScreen({users,onSelect,onAddNew,onDelete,onEditName}){
  const[confirmDel,setConfirmDel]=useState(null);
  const portrait=usePortrait();
  const sz=clamp(Math.round(vminPx(3.8)),18,28);
  return(
    <div className="screen">
      <div className="uselect-wrap">
        <div className="uselect-title">Who is learning today?</div>
        <div className="user-grid" style={{gridTemplateColumns:`repeat(${portrait?1:2},1fr)`}}>
          {users.map(u=>(
            <button key={u.name} className="user-pill" onClick={()=>onSelect(u.name)}>
              <span className="user-name">{u.name}</span>
              <span className="uab edit" onPointerDown={e=>{e.stopPropagation();onEditName(u.name);}}><Ico.edit sz={sz} c="var(--accent)"/></span>
              <span className="uab del"  onPointerDown={e=>{e.stopPropagation();setConfirmDel(u.name);}}><Ico.trash sz={sz} c="var(--red)"/></span>
            </button>
          ))}
          {users.length<MAX_USERS&&<button className="user-pill add-pill" onClick={onAddNew}>Add a new learner</button>}
        </div>
      </div>
      {confirmDel&&<DeleteUserDialog name={confirmDel} onConfirm={()=>{onDelete(confirmDel);setConfirmDel(null);}} onCancel={()=>setConfirmDel(null)}/>}
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
function HomeScreen({userName,onMode,onSwitchUser,onSettings}){
  const portrait=usePortrait();useViewport();
  const cols=portrait?2:4;
  const iSz=clamp(Math.round(vminPx(portrait?4.5:3.8)),20,36);const btnSz=iSz+20;
  const lf=l=>{const n=l.length;if(portrait){if(n<=7)return"clamp(1.6rem,6vh,4rem)";if(n<=11)return"clamp(1.2rem,4.5vh,3rem)";return"clamp(1rem,3.5vh,2.3rem)";}if(n<=7)return"clamp(1.6rem,5.5vw,3.5rem)";if(n<=11)return"clamp(1.3rem,4vw,2.8rem)";return"clamp(1.1rem,3vw,2.2rem)";};
  return(
    <div className="screen">
      <div className="top-bar" style={{position:"relative"}}>
        <button className="user-chip" style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",color:"var(--accent)",zIndex:1}} onClick={onSwitchUser}>{userName} &#9662;</button>
        <div className="bar-title" style={{position:"absolute",left:0,right:0,textAlign:"center",pointerEvents:"none",fontSize:"clamp(1.8rem,5vmin,3.2rem)"}}>Flashcards+</div>
        <button className="icon-btn" style={{width:btnSz,height:btnSz,zIndex:1}} onClick={onSettings}><Ico.gear sz={iSz} c="var(--accent)"/></button>
      </div>
      <div className="mode-grid" style={{gridTemplateColumns:`repeat(${cols},1fr)`}}>
        {MODES.map(m=>{const color=portrait?m.portrait:m.landscape;return(
          <button key={m.id} className="mode-btn" style={{borderColor:tc(color),background:tca(color,.15)}} onClick={()=>onMode(m.id)}>
            <span className="mode-label" style={{fontSize:lf(m.label),color:tc(color)}}>{m.label}</span>
            <span className="mode-sub"   style={{color:tc(color)}}>{m.sub}</span>
          </button>
        );})}
      </div>
    </div>
  );
}

// ── Selection Header ──────────────────────────────────────────────────────────
function SelectionHeader({title,shared,onToggleScored,onOpenCards,onOpenTimer,onToggleOrder,uiFP,pillH,pillW,iconSz,hideShuffle=false}){
  const tl=()=>{if(shared.timer.mode==="none")return"Off";if(shared.timer.mode==="up")return"On";return fmtTime(shared.timer.seconds);};
  const fullSz=Math.round(pillH*0.70);
  const ps={width:pillW,minWidth:pillW,height:pillH};
  return(
    <div className="letsel-header">
      <div className="letsel-row">
        <div className="letsel-title" style={{fontSize:uiFP*1.6}}>{title}</div>
        {hideShuffle
          ?<div style={{width:pillW,minWidth:pillW,height:pillH}}/>
          :<button className="accent-pill" style={{...ps,alignItems:"center",justifyContent:"center"}} onClick={onToggleOrder}>
            {shared.order==="alpha"?<Ico.alpha sz={fullSz} c="var(--accent)"/>:<Ico.shuffle sz={fullSz} c="var(--accent)"/>}
          </button>
        }
        <button className="accent-pill" style={{...ps,alignItems:"center",justifyContent:"center"}} onClick={onToggleScored}>
          <IcoScore sz={fullSz*0.40} c="var(--accent)" active={shared.scored}/>
        </button>
        <button className="accent-pill" style={{...ps,flexDirection:"column"}} onClick={onOpenCards}>
          <div className="pill-row1"><Ico.card sz={iconSz} c="var(--accent)"/></div>
          <div className="pill-row2" style={{fontSize:uiFP*.72}}>{shared.cardCount===0?"All":shared.cardCount}</div>
        </button>
        <button className="accent-pill" style={{...ps,flexDirection:"column"}} onClick={onOpenTimer}>
          <div className="pill-row1"><Ico.watch sz={iconSz} c="var(--accent)"/></div>
          <div className="pill-row2" style={{fontSize:uiFP*.72}}>{tl()}</div>
        </button>
      </div>
    </div>
  );
}

// ── Letter Selection ──────────────────────────────────────────────────────────
function LetterSelectionScreen({onGo,onHome,activeUser,appState,persist}){
  const portrait=usePortrait();useViewport();
  const user=appState.users.find(u=>u.name===activeUser);
  const ls=user?.letterSettings||{};
  const shared=getShared(user);
  const[selUpper,setSelUpper]=useState(()=>new Set(Array.isArray(ls.selUpper)?ls.selUpper:ALPHABET));
  const[selLower,setSelLower]=useState(()=>new Set(Array.isArray(ls.selLower)?ls.selLower:ALPHABET));
  const[caseMode,setCaseMode]=useState(ls.caseMode||"upper");
  const[showTimer,setShowTimer]=useState(false);
  const[showCC,setShowCC]=useState(false);
  const saveLett=(su,sl,cm)=>persist({...appState,users:appState.users.map(u=>u.name===activeUser?{...u,letterSettings:{selUpper:[...su],selLower:[...sl],caseMode:cm}}:u)});
  const saveS=p=>saveShared(appState,activeUser,p,persist);
  const curSel=caseMode==="upper"?selUpper:selLower;
  const allCur=curSel.size===26;
  const total=selUpper.size+selLower.size;
  const toggleL=l=>{
    const fn=s=>{const n=new Set(s);n.has(l)?n.delete(l):n.add(l);return n;};
    if(caseMode==="upper"){const n=fn(selUpper);setSelUpper(n);saveLett(n,selLower,caseMode);}
    else{const n=fn(selLower);setSelLower(n);saveLett(selUpper,n,caseMode);}
  };
  const toggleAll=()=>{
    const n=allCur?new Set():new Set(ALPHABET);
    if(caseMode==="upper"){setSelUpper(n);saveLett(n,selLower,caseMode);}
    else{setSelLower(n);saveLett(selUpper,n,caseMode);}
  };
  const toggleCase=()=>{const cm=caseMode==="upper"?"lower":"upper";setCaseMode(cm);saveLett(selUpper,selLower,cm);};
  const handleGo=()=>{
    let deck=[];
    ALPHABET.forEach(l=>{if(selUpper.has(l))deck.push({label:l});if(selLower.has(l))deck.push({label:l.toLowerCase()});});
    deck.sort((a,b)=>a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
    if(shared.order==="random")deck=deck.sort(()=>Math.random()-.5);
    const cc=shared.cardCount;if(cc>0&&deck.length>cc)deck=deck.slice(0,cc);
    onGo({deck,mode:"letters",fullDeck:[...deck],selUpper:[...selUpper],selLower:[...selLower],caseMode});
  };
  const uiFP=clamp(Math.round(vminPx(portrait?3.5:2.4)),12,28);
  const iSz=clamp(Math.round(uiFP*.9),10,24);
  const pPV=clamp(Math.round(uiFP*.28),3,7);
  const pH=uiFP*2+pPV*2+4;
  const pW=Math.max(iSz*2,Math.ceil("2:22".length*uiFP*.6))+Math.round(uiFP*.5)*2+8;
  const hISz=clamp(Math.round(vminPx(portrait?4.5:3.0)),18,32);
  const {vw,vh}=useViewport();
  const cols=portrait?5:10;
  const gap=Math.max(3,Math.round(vminPx(0.6)));
  const tileTarget=portrait?Math.floor((vw-40)/5):Math.floor((vw-40)/10);
  const rows=portrait?6:3;
  const availH=vh-200;
  const tileH=Math.min(tileTarget,Math.floor((availH-gap*(rows-1))/rows));
  const gridW=tileH*cols+gap*(cols-1);
  const tileFontSz=Math.round(tileH*0.55);
  return(
    <div className="screen">
      <div><SelectionHeader title="Letters" shared={shared} onToggleScored={()=>saveS({scored:!shared.scored})} onOpenCards={()=>setShowCC(true)} onOpenTimer={()=>setShowTimer(true)} onToggleOrder={()=>saveS({order:shared.order==="alpha"?"random":"alpha"})} uiFP={uiFP} pillH={pH} pillW={pW} iconSz={iSz}/></div>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",padding:"4px 8px"}}>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},${tileH}px)`,gridAutoRows:tileH,gap:gap,maxWidth:gridW,justifyContent:"center"}}>
          {ALPHABET.map(l=>{
            const sel=curSel.has(l);
            return <button key={l} className={`tile${sel?" sel":""}`} style={{fontSize:tileFontSz,width:tileH,height:tileH}} onClick={()=>toggleL(l)}>
              {caseMode==="upper"?l:l.toLowerCase()}
            </button>;
          })}
          <div key="ctrl-case" className="tile case-tile" style={{fontSize:Math.round(tileFontSz*0.7),gridColumn:"span 2",height:tileH}} onClick={toggleCase}>
            <div className={`case-half${caseMode==="upper"?" active-half":""}`}>&#9650;</div>
            <div className="case-divider"/>
            <div className={`case-half${caseMode==="lower"?" active-half":""}`}>&#9660;</div>
          </div>
          <button key="ctrl-all" className="tile ctrl-all" style={{fontSize:Math.round(tileFontSz*0.65),gridColumn:`span ${cols-2}`,height:tileH}} onClick={toggleAll}>{allCur?"None":"All"}</button>
        </div>
      </div>
      <div className="letsel-actions">
        <button className="footer-btn home" style={{fontSize:uiFP,padding:`${pPV*2}px 12px`}} onClick={onHome}><Ico.home sz={hISz} c="var(--accent)"/>Home</button>
        <div style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface)",border:"1.5px solid var(--border2)",borderRadius:"50px",padding:`${pPV*2}px ${Math.round(uiFP*.8)}px`,fontFamily:"var(--body)",fontWeight:700,color:"var(--dim)",whiteSpace:"nowrap",fontSize:clamp(Math.round(uiFP*.85),13,24)}}><b style={{color:"var(--secondary)"}}>{total}</b>&nbsp;/ 52</div>
        <button className="footer-btn go" style={{fontSize:uiFP,padding:`${pPV*2}px 16px`}} onClick={handleGo} disabled={total===0}><Ico.flag sz={hISz} c="var(--bg)"/>Go!</button>
      </div>
      {showTimer&&<TimerDialog timer={shared.timer} onSave={t=>{saveS({timer:t});setShowTimer(false);}} onCancel={()=>setShowTimer(false)} fs={uiFP}/>}
      {showCC&&<CardCountDialog count={shared.cardCount} totalSelected={total} onSave={cc=>{saveS({cardCount:cc});setShowCC(false);}} onCancel={()=>setShowCC(false)} fs={uiFP}/>}
    </div>
  );
}

// ── Number Selection ──────────────────────────────────────────────────────────
function NumberSelectionScreen({onGo,onHome,activeUser,appState,persist}){
  const portrait=usePortrait();useViewport();
  const user=appState.users.find(u=>u.name===activeUser);
  const ns=user?.numberSettings||{lo:0,hi:100};
  const shared=getShared(user);
  const[lo,setLo]=useState(ns.lo??0);
  const[hi,setHi]=useState(ns.hi??100);
  const[showTimer,setShowTimer]=useState(false);
  const[showCC,setShowCC]=useState(false);
  const saveNums=(l,h)=>persist({...appState,users:appState.users.map(u=>u.name===activeUser?{...u,numberSettings:{lo:l,hi:h}}:u)});
  const saveS=p=>saveShared(appState,activeUser,p,persist);
  const handleLo=e=>{const v=Math.min(Number(e.target.value),hi);setLo(v);saveNums(v,hi);};
  const handleHi=e=>{const v=Math.max(Number(e.target.value),lo);setHi(v);saveNums(lo,v);};
  const total=hi-lo+1;
  const leftPct=(lo/100)*100;
  const rightPct=(hi/100)*100;
  const uiFP=clamp(Math.round(vminPx(portrait?3.5:2.4)),12,28);
  const iSz=clamp(Math.round(uiFP*.9),10,24);
  const pPV=clamp(Math.round(uiFP*.28),3,7);
  const pH=uiFP*2+pPV*2+4;
  const pW=Math.max(iSz*2,Math.ceil("2:22".length*uiFP*.6))+Math.round(uiFP*.5)*2+8;
  const hISz=clamp(Math.round(vminPx(portrait?4.5:3.0)),18,32);
  const handleGo=()=>{
    let deck=NUMBERS.filter(n=>n>=lo&&n<=hi).map(n=>({label:String(n)}));
    if(shared.order==="random")deck=deck.sort(()=>Math.random()-.5);
    const cc=shared.cardCount;if(cc>0&&deck.length>cc)deck=deck.slice(0,cc);
    onGo({deck,mode:"numbers",lo,hi});
  };
  return(
    <div className="screen">
      <div><SelectionHeader title="Numbers" shared={shared} onToggleScored={()=>saveS({scored:!shared.scored})} onOpenCards={()=>setShowCC(true)} onOpenTimer={()=>setShowTimer(true)} onToggleOrder={()=>saveS({order:shared.order==="alpha"?"random":"alpha"})} uiFP={uiFP} pillH={pH} pillW={pW} iconSz={iSz}/></div>
      <div className="num-slider-wrap">
        <div style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:"clamp(1rem,3vmin,1.5rem)",color:"var(--dim)",textAlign:"center",marginBottom:4}}>What range of numbers?</div>
        <div className="num-range-display">{lo} &#8211; {hi}</div>
        <div className="dual-slider" style={{width:"100%",maxWidth:560}}>
          <div className="slider-track"/>
          <div className="slider-fill" style={{left:`${leftPct}%`,right:`${100-rightPct}%`}}/>
          <input type="range" min="0" max="100" value={lo} onChange={handleLo}/>
          <input type="range" min="0" max="100" value={hi} onChange={handleHi}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",width:"100%",maxWidth:560,fontFamily:"var(--body)",fontWeight:700,color:"var(--secondary)",fontSize:clamp(Math.round(uiFP*.75),11,18)}}>
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
      </div>
      <div className="letsel-actions">
        <button className="footer-btn home" style={{fontSize:uiFP,padding:`${pPV*2}px 12px`}} onClick={onHome}><Ico.home sz={hISz} c="var(--accent)"/>Home</button>
        <div style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface)",border:"1.5px solid var(--border2)",borderRadius:"50px",padding:`${pPV*2}px ${Math.round(uiFP*.8)}px`,fontFamily:"var(--body)",fontWeight:700,color:"var(--dim)",whiteSpace:"nowrap",fontSize:clamp(Math.round(uiFP*.85),13,24)}}><b style={{color:"var(--secondary)"}}>{total}</b>&nbsp;/ 101</div>
        <button className="footer-btn go" style={{fontSize:uiFP,padding:`${pPV*2}px 16px`}} onClick={handleGo} disabled={total===0}><Ico.flag sz={hISz} c="var(--bg)"/>Go!</button>
      </div>
      {showTimer&&<TimerDialog timer={shared.timer} onSave={t=>{saveS({timer:t});setShowTimer(false);}} onCancel={()=>setShowTimer(false)} fs={uiFP}/>}
      {showCC&&<CardCountDialog count={shared.cardCount} totalSelected={total} onSave={cc=>{saveS({cardCount:cc});setShowCC(false);}} onCancel={()=>setShowCC(false)} fs={uiFP}/>}
    </div>
  );
}

// ── Sight Words Selection ─────────────────────────────────────────────────────
function SightWordsSelectionScreen({onGo,onHome,activeUser,appState,persist}){
  const portrait=usePortrait();useViewport();
  const user=appState.users.find(u=>u.name===activeUser);
  const shared=getShared(user);
  const sw=user?.sightWordSettings||{};
  const[selected,setSelected]=useState(()=>new Set(Array.isArray(sw.selected)?sw.selected:SIGHT_WORDS));
  const[sortBy,setSortBy]=useState(sw.sortBy||"frequency");
  const[showTimer,setShowTimer]=useState(false);
  const[showCC,setShowCC]=useState(false);
  const saveSW=(sel,sort)=>persist({...appState,users:appState.users.map(u=>u.name===activeUser?{...u,sightWordSettings:{selected:[...sel],sortBy:sort}}:u)});
  const saveS=p=>saveShared(appState,activeUser,p,persist);
  const sorted=sortBy==="alpha"
    ?[...SIGHT_WORDS].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()))
    :sortBy==="size"
    ?[...SIGHT_WORDS].sort((a,b)=>a.length-b.length||a.toLowerCase().localeCompare(b.toLowerCase()))
    :[...SIGHT_WORDS];
  const total=selected.size;
  const allSel=total===SIGHT_WORDS.length;
  const toggleWord=w=>{const n=new Set(selected);n.has(w)?n.delete(w):n.add(w);setSelected(n);saveSW(n,sortBy);};
  const toggleAll=()=>{const n=allSel?new Set():new Set(SIGHT_WORDS);setSelected(n);saveSW(n,sortBy);};
  const cycleSort=()=>{const order=["frequency","alpha","size"];const i=(order.indexOf(sortBy)+1)%order.length;setSortBy(order[i]);saveSW(selected,order[i]);};
  const sortLabel=sortBy==="frequency"?"Freq":sortBy==="alpha"?"A–Z":"Size";
  const handleGo=()=>{
    let deck=sorted.filter(w=>selected.has(w)).map(w=>({label:w}));
    if(shared.order==="random")deck=deck.sort(()=>Math.random()-.5);
    const cc=shared.cardCount;if(cc>0&&deck.length>cc)deck=deck.slice(0,cc);
    onGo({deck,mode:"sightwords",selected:[...selected],sortBy});
  };
  const uiFP=clamp(Math.round(vminPx(portrait?3.5:2.4)),12,28);
  const iSz=clamp(Math.round(uiFP*.9),10,24);
  const pPV=clamp(Math.round(uiFP*.28),3,7);
  const pH=uiFP*2+pPV*2+4;
  const pW=Math.max(iSz*2,Math.ceil("2:22".length*uiFP*.6))+Math.round(uiFP*.5)*2+8;
  const hISz=clamp(Math.round(vminPx(portrait?4.5:3.0)),18,32);
  const cols=portrait?3:6;
  const gap=Math.max(3,Math.round(vminPx(0.6)));
  const gp=Math.max(4,Math.round(vminPx(1.1)));
  return(
    <div className="screen">
      <div><SelectionHeader title="Sight Words" shared={shared} onToggleScored={()=>saveS({scored:!shared.scored})} onOpenCards={()=>setShowCC(true)} onOpenTimer={()=>setShowTimer(true)} onToggleOrder={()=>saveS({order:shared.order==="alpha"?"random":"alpha"})} uiFP={uiFP} pillH={pH} pillW={pW} iconSz={iSz}/></div>
      <div style={{flex:1,display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gridAutoRows:"min-content",gap:gap,padding:gp,overflow:"auto",alignContent:"start"}}>
        {sorted.map(w=>{
          const sel=selected.has(w);
          return <button key={w} className={`tile${sel?" sel":""}`} style={{fontSize:"clamp(.75rem,2.5vmin,1.2rem)",padding:"clamp(6px,1.5vmin,12px) 4px"}} onClick={()=>toggleWord(w)}>{w}</button>;
        })}
      </div>
      <div className="letsel-actions">
        <button className="footer-btn home" style={{fontSize:uiFP,padding:`${pPV*2}px 12px`}} onClick={onHome}><Ico.home sz={hISz} c="var(--accent)"/>Home</button>
        <button className="footer-btn" style={{fontSize:uiFP*.8,padding:`${pPV}px 10px`}} onClick={cycleSort}>{sortLabel}</button>
        <button className="footer-btn" style={{fontSize:uiFP*.8,padding:`${pPV}px 10px`}} onClick={toggleAll}>{allSel?"None":"All"}</button>
        <div style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface)",border:"1.5px solid var(--border2)",borderRadius:"50px",padding:`${pPV*2}px ${Math.round(uiFP*.8)}px`,fontFamily:"var(--body)",fontWeight:700,color:"var(--dim)",whiteSpace:"nowrap",fontSize:clamp(Math.round(uiFP*.85),13,24)}}><b style={{color:"var(--secondary)"}}>{total}</b>&nbsp;/ {SIGHT_WORDS.length}</div>
        <button className="footer-btn go" style={{fontSize:uiFP,padding:`${pPV*2}px 16px`}} onClick={handleGo} disabled={total===0}><Ico.flag sz={hISz} c="var(--bg)"/>Go!</button>
      </div>
      {showTimer&&<TimerDialog timer={shared.timer} onSave={t=>{saveS({timer:t});setShowTimer(false);}} onCancel={()=>setShowTimer(false)} fs={uiFP}/>}
      {showCC&&<CardCountDialog count={shared.cardCount} totalSelected={total} onSave={cc=>{saveS({cardCount:cc});setShowCC(false);}} onCancel={()=>setShowCC(false)} fs={uiFP}/>}
    </div>
  );
}

// ── Phonics Selection ────────────────────────────────────────────────────────
function PhonicsSelectionScreen({onGo,onHome,activeUser,appState,persist}){
  const portrait=usePortrait();useViewport();
  const user=appState.users.find(u=>u.name===activeUser);
  const shared=getShared(user);
  const ps=user?.phonicsSettings||{};
  const[selLetters,setSelLetters]=useState(()=>new Set(Array.isArray(ps.selLetters)?ps.selLetters:ALPHABET));
  const[phonicsCase,setPhonicsCase]=useState(ps.phonicsCase||"lower");
  const[showTimer,setShowTimer]=useState(false);
  const[showCC,setShowCC]=useState(false);
  const[showMinWarn,setShowMinWarn]=useState(false);
  const savePhon=(sel,pc)=>persist({...appState,users:appState.users.map(u=>u.name===activeUser?{...u,phonicsSettings:{selLetters:[...sel],phonicsCase:pc||phonicsCase}}:u)});
  const togglePhonicsCase=()=>{const nc=phonicsCase==="lower"?"upper":"lower";setPhonicsCase(nc);savePhon(selLetters,nc);};
  const saveS=p=>saveShared(appState,activeUser,p,persist);
  useEffect(()=>{
    if(shared.cardCount===0)saveS({cardCount:20});
  },[]);
  const total=selLetters.size;
  const allSel=total===26;
  const selVowels=VOWELS.filter(v=>selLetters.has(v));
  const selConsonants=CONSONANTS.filter(c=>selLetters.has(c));
  const toggleL=l=>{const n=new Set(selLetters);n.has(l)?n.delete(l):n.add(l);setSelLetters(n);savePhon(n,phonicsCase);};
  const toggleAll=()=>{const n=allSel?new Set():new Set(ALPHABET);setSelLetters(n);savePhon(n,phonicsCase);};
  const generateDeck=(count)=>{
    const deck=[];const seen=new Set();let attempts=0;
    while(deck.length<count&&attempts<count*20){
      attempts++;
      const c1=selConsonants[Math.floor(Math.random()*selConsonants.length)];
      const v=selVowels[Math.floor(Math.random()*selVowels.length)];
      const c2=selConsonants[Math.floor(Math.random()*selConsonants.length)];
      const raw=c1+v+c2;
      const label=phonicsCase==="upper"?raw.toUpperCase():raw.toLowerCase();
      if(seen.has(label))continue;
      seen.add(label);deck.push({label});
    }
    return deck;
  };
  const handleGo=()=>{
    if(selConsonants.length<5||selVowels.length<2){setShowMinWarn(true);return;}
    const cc=shared.cardCount;
    const count=cc>0?cc:20;
    const deck=generateDeck(count);
    onGo({deck,mode:"phonics",selLetters:[...selLetters],deckSize:count,phonicsCase});
  };
  const handleCCSave=cc=>{const v=cc===0?20:clamp(cc,5,25);saveS({cardCount:v});setShowCC(false);};
  const {vw,vh}=useViewport();
  const uiFP=clamp(Math.round(vminPx(portrait?3.5:2.4)),12,28);
  const iSz=clamp(Math.round(uiFP*.9),10,24);
  const pPV=clamp(Math.round(uiFP*.28),3,7);
  const pH=uiFP*2+pPV*2+4;
  const pW=Math.max(iSz*2,Math.ceil("2:22".length*uiFP*.6))+Math.round(uiFP*.5)*2+8;
  const hISz=clamp(Math.round(vminPx(portrait?4.5:3.0)),18,32);
  const cols=portrait?5:10;
  const gap=Math.max(3,Math.round(vminPx(0.6)));
  const phonicLetters=[...VOWELS,...CONSONANTS];
  const tileTarget=portrait?Math.floor((vw-40)/5):Math.floor((vw-40)/10);
  const rows=portrait?6:3;
  const availH=vh-200;
  const tileH=Math.min(tileTarget,Math.floor((availH-gap*(rows-1))/rows));
  const gridW=tileH*cols+gap*(cols-1);
  const tileFontSz=Math.round(tileH*0.55);
  return(
    <div className="screen">
      <div><SelectionHeader title="Phonics" shared={{...shared,order:"random"}} onToggleScored={()=>saveS({scored:!shared.scored})} onOpenCards={()=>setShowCC(true)} onOpenTimer={()=>setShowTimer(true)} onToggleOrder={()=>{}} uiFP={uiFP} pillH={pH} pillW={pW} iconSz={iSz} hideShuffle/></div>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",padding:"4px 8px"}}>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},${tileH}px)`,gridAutoRows:tileH,gap:gap,maxWidth:gridW,justifyContent:"center"}}>
          {phonicLetters.map(l=>{
            const sel=selLetters.has(l);
            const isVowel=VOWELS.includes(l);
            return <button key={l} className={`tile${sel?" sel":""}`} style={{fontSize:tileFontSz,width:tileH,height:tileH,borderColor:sel?(isVowel?"var(--accent)":"var(--primary)"):"var(--border2)",color:sel?(isVowel?"var(--accent)":"var(--primary)"):"var(--dim)",background:sel?(isVowel?"var(--a-mid)":"var(--p-mid)"):"var(--surface)"}} onClick={()=>toggleL(l)}>{phonicsCase==="upper"?l:l.toLowerCase()}</button>;
          })}
          <div key="ctrl-case" className="tile case-tile" style={{fontSize:Math.round(tileFontSz*0.7),gridColumn:"span 2",height:tileH}} onClick={togglePhonicsCase}>
            <div className={`case-half${phonicsCase==="upper"?" active-half":""}`}>&#9650;</div>
            <div className="case-divider"/>
            <div className={`case-half${phonicsCase==="lower"?" active-half":""}`}>&#9660;</div>
          </div>
          <button className="tile ctrl-all" style={{fontSize:Math.round(tileFontSz*0.65),gridColumn:`span ${cols-2}`,height:tileH}} onClick={toggleAll}>{allSel?"None":"All"}</button>
        </div>
      </div>
      <div className="letsel-actions">
        <button className="footer-btn home" style={{fontSize:uiFP,padding:`${pPV*2}px 12px`}} onClick={onHome}><Ico.home sz={hISz} c="var(--accent)"/>Home</button>
        <div style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface)",border:"1.5px solid var(--border2)",borderRadius:"var(--pill)",padding:`${pPV*2}px ${Math.round(uiFP*1.2)}px`,fontFamily:"var(--body)",fontWeight:700,color:"var(--dim)",whiteSpace:"nowrap",fontSize:clamp(Math.round(uiFP*.7),11,20),gap:8}}>
          <span style={{color:"var(--accent)"}}>{selVowels.length}V</span>
          <span style={{color:"var(--secondary)"}}>{selConsonants.length}C</span>
        </div>
        <button className="footer-btn go" style={{fontSize:uiFP,padding:`${pPV*2}px 16px`}} onClick={handleGo}><Ico.flag sz={hISz} c="var(--bg)"/>Go!</button>
      </div>
      {showMinWarn&&(
        <div className="dialog-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)setShowMinWarn(false);}}>
          <div className="dialog-box">
            <div className="dialog-title">Not enough letters</div>
            <p className="dialog-body">Phonics needs at least <span style={{color:"var(--primary)",fontWeight:800}}>5 consonants</span> and <span style={{color:"var(--secondary)",fontWeight:800}}>2 vowels</span> selected.</p>
            <p className="dialog-body">You have <span style={{color:"var(--primary)",fontWeight:800}}>{selConsonants.length} consonants</span> and <span style={{color:"var(--secondary)",fontWeight:800}}>{selVowels.length} vowels</span>.</p>
            <div className="dialog-row"><button className="dbtn" onClick={()=>setShowMinWarn(false)}>OK</button></div>
          </div>
        </div>
      )}
      {showTimer&&<TimerDialog timer={shared.timer} onSave={t=>{saveS({timer:t});setShowTimer(false);}} onCancel={()=>setShowTimer(false)} fs={uiFP}/>}
      {showCC&&<CardCountDialog count={shared.cardCount} totalSelected={20} onSave={handleCCSave} onCancel={()=>setShowCC(false)} fs={uiFP}/>}
    </div>
  );
}

// ── Math helpers ─────────────────────────────────────────────────────────────
const BOX_SYM = "\u25FB";
const ALGEBRA_SYMBOLS = ["Off","X","a","N",BOX_SYM,"Random"];
const ALL_ALGEBRA_DISPLAY = ["X","a","N",BOX_SYM];

function CardLabel({text,fontSize}){
  if(!text.includes(BOX_SYM)) return <span className="card-letter" style={{fontSize}}>{text}</span>;
  const parts=text.split(BOX_SYM);
  return <span className="card-letter" style={{fontSize}}>{parts.map((p,i)=><React.Fragment key={i}>{p}{i<parts.length-1&&<span style={{display:"inline-block",width:"1.15em",height:"1.15em",border:"3px solid currentColor",borderRadius:"3px",verticalAlign:"middle",marginLeft:"0.05em",marginRight:"0.05em"}}>&nbsp;</span>}</React.Fragment>)}</span>;
}

// ── Numpad for answer entry ──────────────────────────────────────────────────
function Numpad({onKey,onNeg,onCheck}){
  const rows=[[1,2,3],[4,5,6],[7,8,9],["neg",0,"check"]];
  return(
    <div className="numpad">
      {rows.map((row,ri)=>(
        <div className="numpad-row" key={ri}>
          {row.map(k=>{
            if(k==="neg") return <button key={k} className="numpad-key numpad-neg" onPointerDown={e=>{e.preventDefault();onNeg();}}>−</button>;
            if(k==="check") return <button key={k} className="numpad-key numpad-check" onPointerDown={e=>{e.preventDefault();onCheck();}}>✓</button>;
            return <button key={k} className="numpad-key" onPointerDown={e=>{e.preventDefault();onKey(String(k));}}>{k}</button>;
          })}
        </div>
      ))}
    </div>
  );
}

function applyAlgebra(a,op,b,answer,algebraMode){
  if(algebraMode==="Off") return `${a} ${op} ${b} = ?`;
  const sym = algebraMode==="Random" ? ALL_ALGEBRA_DISPLAY[Math.floor(Math.random()*ALL_ALGEBRA_DISPLAY.length)] : algebraMode;
  const pos = Math.floor(Math.random()*3);
  if(pos===0) return `${sym} ${op} ${b} = ${answer}`;
  if(pos===1) return `${a} ${op} ${sym} = ${answer}`;
  return `${a} ${op} ${b} = ${sym}`;
}

function makeExample(a,op,b,answer,algebraMode,forcePos){
  if(algebraMode==="Off") return `${a} ${op} ${b} = ?`;
  const sym = algebraMode==="Random" ? ALL_ALGEBRA_DISPLAY[Math.floor(Math.random()*ALL_ALGEBRA_DISPLAY.length)] : algebraMode;
  if(forcePos===0) return `${sym} ${op} ${b} = ${answer}`;
  if(forcePos===1) return `${a} ${op} ${sym} = ${answer}`;
  return `${a} ${op} ${b} = ${sym}`;
}

function highestFactor(n){ for(let i=Math.floor(n/2);i>=2;i--){if(n%i===0)return i;} return 1; }

function buildAdditionDeck(lo,hi,count,alg){
  const deck=[];const seen=new Set();let attempts=0;
  while(deck.length<count&&attempts<count*20){
    attempts++;
    const sum=Math.floor(Math.random()*(hi-lo+1))+lo;
    const a=Math.floor(Math.random()*(sum+1));
    const b=sum-a;
    const label=applyAlgebra(a,"+",b,sum,alg);
    if(seen.has(label))continue;
    seen.add(label);deck.push({label,answer:sum});
  }
  return deck;
}

function buildSubtractionDeck(lo,hi,count,alg,allowNeg){
  const deck=[];const seen=new Set();let attempts=0;
  while(deck.length<count&&attempts<count*20){
    attempts++;
    const a=Math.floor(Math.random()*(hi-lo+1))+lo;
    const b=Math.floor(Math.random()*(hi-lo+1))+lo;
    let label,ans;
    if(allowNeg){
      ans=a-b;
      label=applyAlgebra(a,"−",b,ans,alg);
    } else {
      const big=Math.max(a,b),small=Math.min(a,b);
      ans=big-small;
      label=applyAlgebra(big,"−",small,ans,alg);
    }
    if(seen.has(label))continue;
    seen.add(label);deck.push({label,answer:ans});
  }
  return deck;
}

function buildMultiplicationDeck(lo,hi,count,alg){
  const deck=[];const seen=new Set();let attempts=0;
  while(deck.length<count&&attempts<count*20){
    attempts++;
    const a=Math.floor(Math.random()*(hi-lo+1))+lo;
    const b=Math.floor(Math.random()*(hi-lo+1))+lo;
    const label=applyAlgebra(a,"×",b,a*b,alg);
    if(seen.has(label))continue;
    seen.add(label);deck.push({label,answer:a*b});
  }
  return deck;
}

function buildTimesTableDeck(n,alg){
  const deck=[];
  for(let i=1;i<=12;i++){
    deck.push({label:applyAlgebra(n,"×",i,n*i,alg),answer:n*i});
  }
  return deck;
}

function buildDivisionDeck(lo,hi,count,alg){
  const deck=[];const seen=new Set();
  let attempts=0;
  while(deck.length<count&&attempts<count*100){
    attempts++;
    const dividend=Math.floor(Math.random()*(hi-lo+1))+lo;
    if(dividend<2)continue;
    const hf=highestFactor(dividend);
    if(hf<2)continue;
    const divisor=Math.floor(Math.random()*(hf-1))+2;
    if(dividend%divisor!==0)continue;
    const q=dividend/divisor;
    const label=applyAlgebra(dividend,"÷",divisor,q,alg);
    if(seen.has(label))continue;
    seen.add(label);deck.push({label,answer:q});
  }
  while(deck.length<count){
    const d=Math.floor(Math.random()*9)+2;
    const q=Math.floor(Math.random()*10)+1;
    const label=applyAlgebra(d*q,"÷",d,q,alg);
    if(seen.has(label)){continue;}
    seen.add(label);deck.push({label,answer:q});
  }
  return deck;
}

function buildDivisionRemainderDeck(lo,hi,count,alg){
  const deck=[];const seen=new Set();let attempts=0;
  while(deck.length<count&&attempts<count*20){
    attempts++;
    const dividend=Math.floor(Math.random()*(hi-lo+1))+lo;
    if(dividend<3)continue;
    const divisor=Math.floor(Math.random()*(Math.min(dividend-1,hi)-2+1))+2;
    const q=Math.floor(dividend/divisor);
    const r=dividend%divisor;
    const label=applyAlgebra(dividend,"÷",divisor,r>0?`${q} R${r}`:`${q}`,alg);
    if(seen.has(label))continue;
    seen.add(label);deck.push({label,answer:r>0?`${q} R${r}`:`${q}`});
  }
  return deck;
}

// ── Shared Math Selection UI ─────────────────────────────────────────────────
function MathSelectionScreen({onGo,onHome,activeUser,appState,persist,modeId,title}){
  const portrait=usePortrait();useViewport();
  const user=appState.users.find(u=>u.name===activeUser);
  const shared=getShared(user);
  const ms=user?.mathSettings?.[modeId]||{};
  const defs={
    addition:{lo:1,hi:20,alg:"Off"},
    subtraction:{lo:5,hi:20,alg:"Off",allowNeg:false},
    multiplication:{lo:0,hi:12,alg:"Off",timesTable:false},
    division:{lo:2,hi:50,alg:"Off",allowRemainder:false},
  }[modeId];
  const[lo,setLo]=useState(ms.lo??defs.lo);
  const[hi,setHi]=useState(ms.hi??defs.hi);
  const[alg,setAlg]=useState(shared.algebra||ms.alg||defs.alg);
  const[allowNeg,setAllowNeg]=useState(ms.allowNeg??defs.allowNeg??false);
  const[timesTable,setTimesTable]=useState(ms.timesTable??defs.timesTable??false);
  const[allowRemainder,setAllowRemainder]=useState(ms.allowRemainder??defs.allowRemainder??false);
  const[answerEntry,setAnswerEntry]=useState(ms.answerEntry??false);
  const[showAlgPicker,setShowAlgPicker]=useState(false);
  const[showTimer,setShowTimer]=useState(false);
  const[showCC,setShowCC]=useState(false);
  const saveMath=patch=>persist({...appState,users:appState.users.map(u=>u.name===activeUser?{...u,mathSettings:{...(u.mathSettings||{}),[modeId]:{...ms,...patch}}}:u)});
  const saveS=p=>saveShared(appState,activeUser,p,persist);
  useEffect(()=>{if(shared.cardCount===0)saveS({cardCount:20});},[]);
  const handleLo=e=>{const v=Math.min(Number(e.target.value),hi);setLo(v);saveMath({lo:v});};
  const handleHi=e=>{const v=Math.max(Number(e.target.value),lo);setHi(v);saveMath({hi:v});};
  const handleSingle=e=>{const v=Number(e.target.value);setHi(v);saveMath({hi:v});};
  const handleCCSave=cc=>{const v=cc===0?20:clamp(cc,5,25);saveS({cardCount:v});setShowCC(false);};
  const sliderMin={addition:1,subtraction:5,multiplication:0,division:2}[modeId];
  const sliderMax={addition:100,subtraction:100,multiplication:12,division:100}[modeId];
  const question = modeId==="addition"?"What range of sums?"
    :modeId==="subtraction"?"Range of biggest number?"
    :modeId==="multiplication"?(timesTable?"What times table?":"What range of numbers?")
    :"Range of dividends?";
  const isDual = modeId==="multiplication"&&timesTable ? false : true;
  const handleGo=()=>{
    const cc=shared.cardCount;const count=cc>0?cc:20;
    let deck;
    if(modeId==="addition") deck=buildAdditionDeck(lo,hi,count,alg);
    else if(modeId==="subtraction") deck=buildSubtractionDeck(lo,hi,count,alg,allowNeg);
    else if(modeId==="multiplication"&&timesTable) deck=buildTimesTableDeck(hi,alg);
    else if(modeId==="multiplication") deck=buildMultiplicationDeck(lo,hi,count,alg);
    else if(modeId==="division"&&allowRemainder) deck=buildDivisionRemainderDeck(lo,hi,count,alg);
    else deck=buildDivisionDeck(lo,hi,count,alg);
    if(modeId==="multiplication"&&timesTable&&shared.order==="random") deck=deck.sort(()=>Math.random()-.5);
    onGo({deck,mode:modeId,lo,hi,alg,allowNeg,timesTable,allowRemainder,answerEntry,deckSize:count});
  };
  const ex1=(()=>{
    if(modeId==="addition"){const a=lo,b=lo+1;return makeExample(a,"+",b,a+b,alg,0);}
    if(modeId==="subtraction"){const a=Math.max(1,hi-4),b=lo;if(allowNeg){return makeExample(a,"\u2212",b,a-b,alg,0);}return makeExample(Math.max(a,b),"\u2212",Math.min(a,b),Math.abs(a-b),alg,0);}
    if(modeId==="multiplication"&&timesTable) return makeExample(hi,"\u00d7",1,hi,alg,0);
    if(modeId==="multiplication"){return makeExample(lo,"\u00d7",hi,lo*hi,alg,0);}
    if(modeId==="division"){
      if(allowRemainder){const d=Math.max(lo,4),dv=3,q=Math.floor(d/dv),r=d%dv;return makeExample(d,"\u00f7",dv,r>0?`${q} R${r}`:q,alg,0);}
      const hf=highestFactor(Math.max(lo,2));return makeExample(Math.max(lo,2),"\u00f7",Math.max(hf,1),hf>0?Math.max(lo,2)/hf:1,alg,0);
    }
    return "";
  })();
  const ex2=(()=>{
    if(modeId==="addition"){const a=Math.round(hi*3/4),b=Math.round(hi/4);return makeExample(a,"+",b,a+b,alg,2);}
    if(modeId==="subtraction"){let a=Math.round(hi*2/3),b=Math.round(hi/3);if(allowNeg){return makeExample(b,"\u2212",a,b-a,alg,2);}return makeExample(a,"\u2212",b,a-b,alg,2);}
    if(modeId==="multiplication"&&timesTable) return makeExample(hi,"\u00d7",12,hi*12,alg,2);
    if(modeId==="multiplication"){let a=clamp(Math.round(hi/2+1),lo,hi),b=clamp(Math.round(hi/3+2),lo,hi);return makeExample(a,"\u00d7",b,a*b,alg,2);}
    if(modeId==="division"){
      if(allowRemainder){let d=Math.max(hi,7),dv=4;while(d%dv===0&&dv>2)dv--;const q=Math.floor(d/dv),r=d%dv;return makeExample(d,"\u00f7",dv,r>0?`${q} R${r}`:`${q}`,alg,2);}
      const hf=highestFactor(Math.max(hi,4));return makeExample(Math.max(hi,4),"\u00f7",Math.max(hf,1),hf>0?Math.max(hi,4)/hf:1,alg,2);
    }
    return "";
  })();
  const uiFP=clamp(Math.round(vminPx(portrait?3.5:2.4)),12,28);
  const iSz=clamp(Math.round(uiFP*.9),10,24);
  const pPV=clamp(Math.round(uiFP*.28),3,7);
  const pH=uiFP*2+pPV*2+4;
  const pW=Math.max(iSz*2,Math.ceil("2:22".length*uiFP*.6))+Math.round(uiFP*.5)*2+8;
  const hISz=clamp(Math.round(vminPx(portrait?4.5:3.0)),18,32);
  const showShuffle=modeId==="multiplication"&&timesTable;
  const leftPct=isDual?((lo-sliderMin)/(sliderMax-sliderMin))*100:0;
  const rightPct=((hi-sliderMin)/(sliderMax-sliderMin))*100;
  const optBtnStyle={padding:"clamp(12px,3vmin,20px) clamp(16px,4vmin,28px)",borderRadius:"var(--pill)",border:"2px solid var(--border2)",background:"var(--surface)",fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:uiFP*1.05,color:"var(--dim)",cursor:"pointer",display:"flex",alignItems:"center",gap:8};
  const optBtnActiveStyle={...optBtnStyle,background:"var(--a-mid)",borderColor:"var(--accent)",color:"var(--accent)"};
  return(
    <div className="screen">
      <div><SelectionHeader title={title} shared={{...shared,order:showShuffle?shared.order:"random"}} onToggleScored={()=>saveS({scored:!shared.scored})} onOpenCards={()=>setShowCC(true)} onOpenTimer={()=>setShowTimer(true)} onToggleOrder={showShuffle?()=>saveS({order:shared.order==="alpha"?"random":"alpha"}):()=>{}} uiFP={uiFP} pillH={pH} pillW={pW} iconSz={iSz} hideShuffle={!showShuffle}/></div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"clamp(10px,2.5vmin,24px)",padding:"clamp(12px,3vmin,32px) clamp(16px,4vmin,48px)",overflowY:"auto"}}>
        <div style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:"clamp(1.2rem,3.5vmin,1.8rem)",color:"var(--dim)",textAlign:"center"}}>{question}</div>
        <div className="num-range-display">{isDual?`${lo} \u2013 ${hi}`:hi}</div>
        <div className="dual-slider" style={{width:"100%",maxWidth:560}}>
          <div className="slider-track"/>
          <div className="slider-fill" style={{left:`${leftPct}%`,right:`${100-rightPct}%`}}/>
          {isDual&&<input type="range" min={sliderMin} max={sliderMax} value={lo} onChange={handleLo}/>}
          <input type="range" min={sliderMin} max={sliderMax} value={hi} onChange={isDual?handleHi:handleSingle}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",width:"100%",maxWidth:560,fontFamily:"var(--body)",fontWeight:700,color:"var(--secondary)",fontSize:clamp(Math.round(uiFP*.75),11,18)}}>
          <span>{sliderMin}</span><span>{Math.floor((sliderMax-sliderMin)*.25+sliderMin)}</span><span>{Math.floor((sliderMax-sliderMin)*.5+sliderMin)}</span><span>{Math.floor((sliderMax-sliderMin)*.75+sliderMin)}</span><span>{sliderMax}</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"center"}}>
          <div style={{fontFamily:"var(--body)",fontWeight:600,fontSize:uiFP*.8,color:"var(--dim)"}}>Examples:</div>
          <div style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:uiFP*1.5,color:"var(--accent)"}}>{ex1}</div>
          <div style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:uiFP*1.5,color:"var(--accent)"}}>{ex2}</div>
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
          <button style={alg!=="Off"?optBtnActiveStyle:optBtnStyle} onClick={()=>setShowAlgPicker(true)}>Algebra: {alg}</button>
          {modeId==="subtraction"&&<button style={allowNeg?optBtnActiveStyle:optBtnStyle} onClick={()=>{setAllowNeg(!allowNeg);saveMath({allowNeg:!allowNeg});}}>Negatives: {allowNeg?"On":"Off"}</button>}
          {modeId==="multiplication"&&<button style={timesTable?optBtnActiveStyle:optBtnStyle} onClick={()=>{const v=!timesTable;setTimesTable(v);saveMath({timesTable:v});if(v&&hi>12)setHi(12);}}>Times Table: {timesTable?"On":"Off"}</button>}
          {modeId==="division"&&<button style={allowRemainder?optBtnActiveStyle:optBtnStyle} onClick={()=>{const v=!allowRemainder;setAllowRemainder(v);saveMath({allowRemainder:v});}}>Remainder: {allowRemainder?"Yes":"No"}</button>}
          <button style={answerEntry?optBtnActiveStyle:optBtnStyle} onClick={()=>{const v=!answerEntry;setAnswerEntry(v);saveMath({answerEntry:v});}}>Answer Entry: {answerEntry?"On":"Off"}</button>
        </div>
      </div>
      <div className="letsel-actions">
        <button className="footer-btn home" style={{fontSize:uiFP,padding:`${pPV*2}px 12px`}} onClick={onHome}><Ico.home sz={hISz} c="var(--accent)"/>Home</button>
        <button className="footer-btn go" style={{fontSize:uiFP,padding:`${pPV*2}px 16px`}} onClick={handleGo}><Ico.flag sz={hISz} c="var(--bg)"/>Go!</button>
      </div>
      {showAlgPicker&&(
        <div className="dialog-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)setShowAlgPicker(false);}}>
          <div className="dialog-box">
            <div className="dialog-title">Algebra Mode</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,width:"100%"}}>
              {ALGEBRA_SYMBOLS.map(s=>(
                <button key={s} onClick={()=>{setAlg(s);saveMath({alg:s});saveS({algebra:s});setShowAlgPicker(false);}} style={{padding:"clamp(12px,3vmin,20px) 8px",borderRadius:"var(--r)",border:`2px solid ${alg===s?"var(--accent)":"var(--border2)"}`,background:alg===s?"var(--a-mid)":"var(--surface)",color:alg===s?"var(--accent)":"var(--dim)",fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:"clamp(1rem,3vmin,1.5rem)",cursor:"pointer",textAlign:"center"}}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      {showTimer&&<TimerDialog timer={shared.timer} onSave={t=>{saveS({timer:t});setShowTimer(false);}} onCancel={()=>setShowTimer(false)} fs={uiFP}/>}
      {showCC&&<CardCountDialog count={shared.cardCount} totalSelected={20} onSave={handleCCSave} onCancel={()=>setShowCC(false)} fs={uiFP}/>}
    </div>
  );
}

// ── Placeholder selection screens ─────────────────────────────────────────────
function GenericSelectionScreen({title,onHome,activeUser,appState,persist,onGo,modeId}){
  const portrait=usePortrait();
  const user=appState.users.find(u=>u.name===activeUser);
  const shared=getShared(user);
  const uiFP=clamp(Math.round(vminPx(portrait?3.5:2.4)),12,28);
  const iSz=clamp(Math.round(uiFP*.9),10,24);
  const pPV=clamp(Math.round(uiFP*.28),3,7);
  const pH=uiFP*2+pPV*2+4;
  const pW=Math.max(iSz*2,Math.ceil("2:22".length*uiFP*.6),Math.ceil("All".length*uiFP*.56))+Math.round(uiFP*.5)*2+8;
  const hISz=clamp(Math.round(vminPx(portrait?4.5:3.0)),18,32);
  const saveS=p=>saveShared(appState,activeUser,p,persist);
  const[showTimer,setShowTimer]=useState(false);
  return(
    <div className="screen">
      <div><SelectionHeader title={title} shared={shared} onToggleScored={()=>saveS({scored:!shared.scored})} onOpenCards={()=>{}} onOpenTimer={()=>setShowTimer(true)} onToggleOrder={()=>saveS({order:shared.order==="alpha"?"random":"alpha"})} uiFP={uiFP} pillH={pH} pillW={pW} iconSz={iSz}/></div>
      <div className="placeholder-wrap">
        <div className="placeholder-title" style={{color:tc("primary")}}>{title} — coming soon</div>
        <p className="placeholder-body">The {title} mode will be available in a future update.</p>
      </div>
      <div className="letsel-actions">
        <button className="footer-btn home" style={{fontSize:uiFP,padding:`${pPV*2}px 12px`}} onClick={onHome}><Ico.home sz={hISz} c="var(--accent)"/>Home</button>
        <button className="footer-btn go" style={{fontSize:uiFP,padding:`${pPV*2}px 16px`,opacity:.35,cursor:"default"}}><Ico.flag sz={hISz} c="var(--bg)"/>Go!</button>
      </div>
      {showTimer&&<TimerDialog timer={shared.timer} onSave={t=>{saveS({timer:t});setShowTimer(false);}} onCancel={()=>setShowTimer(false)} fs={uiFP}/>}
    </div>
  );
}

// ── Answer entry helpers ─────────────────────────────────────────────────────
function parseCardAnswer(card){
  // card.answer may be a number, string like "5", or "3 R2"
  return String(card.answer!=null?card.answer:"");
}
function getEntryPlaceholder(label){
  // Find the algebra symbol or ? in the label to use as placeholder
  const syms=["X","a","N",BOX_SYM,"?"];
  for(const s of syms){if(label.includes(s))return s;}
  return "?";
}
function buildDisplayLabel(label,enteredValue,placeholder){
  // Replace the placeholder symbol with the entered value (or show placeholder if empty)
  const display=enteredValue.length>0?enteredValue:placeholder;
  return label.replace(placeholder,display);
}

// ── Flashcard Round ───────────────────────────────────────────────────────────
function FlashcardRound({config,onHome,onShowScore,onBackToSelection}){
  const portrait=usePortrait();const{vw,vh}=useViewport();
  const deck=config.deck,total=deck.length;
  const shared=config.shared;
  const timerCfg=shared.timer||{mode:"none",seconds:60};
  const scored=shared.scored||false;
  const isAnswerEntry=!!config.answerEntry;
  const[scores,setScores]=useState(()=>new Array(total).fill(null));
  const[index,setIndex]=useState(0);
  const[elapsed,setElapsed]=useState(()=>timerCfg.mode==="down"?timerCfg.seconds:0);
  const[expired,setExpired]=useState(false);
  const[interacted,setInteracted]=useState(0);
  const[entryValue,setEntryValue]=useState("");
  const[feedback,setFeedback]=useState(null); // "correct" | "wrong" | null
  const feedTimer=useRef(null);
  const timerRef=useRef(null);const lastTap=useRef(0);
  useEffect(()=>{
    if(timerCfg.mode==="none")return;
    timerRef.current=setInterval(()=>setElapsed(p=>{if(timerCfg.mode==="down"){const n=p-1;if(n<=0){clearInterval(timerRef.current);setExpired(true);return 0;}return n;}return p+1;}),1000);
    return()=>clearInterval(timerRef.current);
  },[]);
  useEffect(()=>()=>clearTimeout(feedTimer.current),[]);
  const goHome=useCallback(()=>{clearInterval(timerRef.current);onHome();},[onHome]);
  const finish=useCallback((fs,fe,fi)=>{clearInterval(timerRef.current);onShowScore({scores:fs,total,elapsed:fe,timerCfg,scored,cardsInteracted:fi,mode:config.mode,config});},[total,timerCfg,scored,onShowScore,config]);
  useEffect(()=>{if(expired)finish(scores,0,interacted);},[expired]);
  const advanceToNext=useCallback((ns,ni,fe)=>{
    const next=index+1;if(next>=total)finish(ns,fe,ni);else{setIndex(next);setEntryValue("");setFeedback(null);}
  },[index,total,finish]);
  const advanceFree=useCallback(e=>{
    if(scored||isAnswerEntry)return;if(e.target.closest&&e.target.closest(".icon-btn"))return;
    const now=Date.now();if(now-lastTap.current<350)return;lastTap.current=now;
    const ni=interacted+1;setInteracted(ni);
    advanceToNext(scores,ni,elapsed);
  },[scored,isAnswerEntry,index,total,elapsed,scores,interacted,advanceToNext]);
  const scoreAction=useCallback(result=>{
    if(result==="back"){if(index===0){clearInterval(timerRef.current);onBackToSelection();return;}setScores(p=>{const n=[...p];n[index-1]=null;return n;});setInteracted(i=>Math.max(0,i-1));setIndex(i=>i-1);setEntryValue("");setFeedback(null);return;}
    const ns=[...scores];ns[index]=result;setScores(ns);
    const ni=interacted+1;setInteracted(ni);
    advanceToNext(ns,ni,elapsed);
  },[scores,index,total,elapsed,interacted,advanceToNext,onBackToSelection]);
  // Answer entry handlers
  const handleNumKey=useCallback(digit=>{
    if(feedback)return;
    setEntryValue(v=>v.length<10?v+digit:v);
  },[feedback]);
  const handleNeg=useCallback(()=>{
    if(feedback)return;
    setEntryValue(v=>v.startsWith("−")?v.slice(1):"−"+v);
  },[feedback]);
  const handleCheck=useCallback(()=>{
    if(feedback)return;
    if(entryValue.length===0)return;
    const card=deck[index];
    const correctAnswer=parseCardAnswer(card);
    // Normalize: replace − with - for comparison
    const normalize=s=>String(s).replace(/−/g,"-").replace(/\s+/g,"").toLowerCase();
    const isCorrect=normalize(entryValue)===normalize(correctAnswer);
    const fb=isCorrect?"correct":"wrong";
    setFeedback(fb);
    const ni=interacted+1;setInteracted(ni);
    if(scored){
      const ns=[...scores];ns[index]=isCorrect?"correct":"wrong";setScores(ns);
      feedTimer.current=setTimeout(()=>{advanceToNext(ns,ni,elapsed);},800);
    }else{
      feedTimer.current=setTimeout(()=>{advanceToNext(scores,ni,elapsed);},800);
    }
  },[feedback,entryValue,deck,index,scored,scores,interacted,elapsed,advanceToNext]);
  const card=deck[index];
  const maxLabelLen=Math.max(...deck.map(c=>c.label.length));
  const answerEntryActive=isAnswerEntry&&card.answer!=null;
  const cardH=vh*(portrait?answerEntryActive?0.35:0.65:0.6);
  const cardW=vw*(portrait?0.85:scored?0.55:0.85);
  const fitH=cardH*0.8;
  const fitW=cardW*0.8/(maxLabelLen*0.6);
  const cFS=Math.round(Math.min(fitH,fitW));
  const iSz=clamp(Math.round(vminPx(portrait?4.5:3.8)),20,32);const btnSz=iSz+18;
  const isW=timerCfg.mode==="down"&&elapsed<=5;
  const sfP=portrait?clamp(Math.round(vminPx(3.5)),14,24):clamp(Math.round(vminPx(3.0)),12,20);
  const ssP=portrait?clamp(Math.round(vminPx(7)),24,52):clamp(Math.round(vminPx(5.5)),18,40);
  const spH=Math.round(vw/4*.95);
  const ssW=clamp(Math.round(vminPx(28)),120,240);
  // Build display label with entry value replacing the unknown
  const placeholder=answerEntryActive?getEntryPlaceholder(card.label):"?";
  const displayText=answerEntryActive?buildDisplayLabel(card.label,entryValue,placeholder):card.label;
  const btns=[{cls:"back",sym:"\u25c0",lbl:"Back",a:"back"},{cls:"wrong",sym:"\u2717",lbl:"Wrong",a:"wrong"},{cls:"correct",sym:"\u2713",lbl:"Right",a:"correct"},{cls:"skip",sym:"\u25b6",lbl:"Skip",a:"skip"}];
  const portBar=<div className="score-bar-bottom">{btns.map(b=><button key={b.a}className={`score-btn ${b.cls}`}style={{flex:1,height:spH}}onClick={()=>scoreAction(b.a)}><span className="score-btn-sym"style={{fontSize:ssP}}>{b.sym}</span><span className="score-btn-lbl"style={{fontSize:sfP*.7}}>{b.lbl}</span></button>)}</div>;
  const sideBar=<div className="score-bar-side"style={{width:ssW,padding:"clamp(8px,2vmin,16px) clamp(8px,1.5vmin,14px)"}}>{btns.map(b=><button key={b.a}className={`score-btn ${b.cls}`}style={{flex:1,width:"100%"}}onClick={()=>scoreAction(b.a)}><span className="score-btn-sym"style={{fontSize:Math.round(ssP*1.15)}}>{b.sym}</span><span className="score-btn-lbl"style={{fontSize:sfP*.8}}>{b.lbl}</span></button>)}</div>;
  const topBar=<div className="round-topbar">
    <button className="icon-btn home-btn"style={{width:btnSz,height:btnSz}}onPointerDown={e=>{e.stopPropagation();goHome();}}><Ico.home sz={iSz}c="var(--accent)"/></button>
    <button className="icon-btn"style={{width:btnSz,height:btnSz}}onPointerDown={e=>{e.stopPropagation();onBackToSelection();}}><Ico.list sz={iSz}c="var(--dim)"/></button>
    <div className="round-progress">{index+1} / {total}</div>
    {timerCfg.mode!=="none"?<span className={`round-timer${isW?" warn":""}`}>{fmtTime(elapsed)}</span>:<div style={{width:btnSz}}/>}
  </div>;
  const cardArea=(noTap)=><div className={`card-area${noTap?" no-tap":""}`} style={{position:"relative"}}><div className="flashcard"key={index}><CardLabel text={displayText} fontSize={cFS}/></div>{feedback&&<div className={`answer-feedback ${feedback}`}>{feedback==="correct"?"Correct!":"Wrong"}</div>}</div>;
  if(answerEntryActive){
    // Answer entry mode: card on top, numpad below
    if(!portrait) return(
      <div className="round-screen" style={{flexDirection:"row"}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          {topBar}
          <div className="card-area no-tap" style={{flex:1,position:"relative"}}><div className="flashcard"key={index}><CardLabel text={displayText} fontSize={cFS}/></div>{feedback&&<div className={`answer-feedback ${feedback}`}>{feedback==="correct"?"Correct!":"Wrong"}</div>}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",justifyContent:"center",padding:"clamp(8px,2vmin,16px)"}}>
          <Numpad onKey={handleNumKey} onNeg={handleNeg} onCheck={handleCheck}/>
        </div>
      </div>
    );
    return(
      <div className="round-screen">
        {topBar}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",minHeight:0}}>
          <div className="flashcard" key={index} style={{marginBottom:8}}><CardLabel text={displayText} fontSize={cFS}/></div>
          {feedback&&<div className={`answer-feedback ${feedback}`}>{feedback==="correct"?"Correct!":"Wrong"}</div>}
        </div>
        <div style={{padding:"0 clamp(16px,4vw,48px) clamp(8px,2vmin,16px)"}}>
          <Numpad onKey={handleNumKey} onNeg={handleNeg} onCheck={handleCheck}/>
        </div>
      </div>
    );
  }
  if(!portrait&&scored) return(
    <div className="round-screen" style={{flexDirection:"row"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {topBar}
        {cardArea(true)}
      </div>
      {sideBar}
    </div>
  );
  return(
    <div className="round-screen">
      {topBar}
      <div className="round-body col"onPointerDown={advanceFree}>
        {cardArea(scored)}
      </div>
      {portrait&&scored&&portBar}
    </div>
  );
}

// ── Score Screen ──────────────────────────────────────────────────────────────
const MODE_LABELS = {letters:"Letters",numbers:"Numbers",phonics:"Phonics",sightwords:"Sight Words",addition:"Addition",subtraction:"Subtraction",multiplication:"Multiplication",division:"Division"};
function ScoreScreen({scoreData,onRetry,onHome,onSelectAgain}){
  const{scores,total,elapsed,timerCfg,scored,cardsInteracted,mode}=scoreData;
  const correct=scores.filter(r=>r==="correct").length;
  const wrong  =scores.filter(r=>r==="wrong").length;
  const skipped=scores.filter(r=>r==="skip").length;
  const shown  =cardsInteracted||0;
  const showTime=timerCfg?.mode!=="none";
  const title=scored?(correct===total?"Perfect!":correct>=total*.7?"Great job!":"Nice try!"):"Finished!";
  const cFS="clamp(2rem,6.5vmin,4rem)";
  return(
    <div className="screen">
      <div className="score-screen">
        <div className="score-title">{title}</div>
        {scored&&(
          <div className="score-grid"style={{gridTemplateColumns:"repeat(3,1fr)"}}>
            <div className="score-cell"><span className="score-cell-label">Wrong</span><span className="score-cell-value"style={{color:"var(--red)",fontSize:cFS}}>{wrong}</span></div>
            <div className="score-cell"><span className="score-cell-label">Correct</span><span className="score-cell-value"style={{color:"var(--green)",fontSize:cFS}}>{correct}</span></div>
            <div className="score-cell"><span className="score-cell-label">Skipped</span><span className="score-cell-value"style={{color:"var(--secondary)",fontSize:cFS}}>{skipped}</span></div>
          </div>
        )}
        <div className="score-grid"style={{gridTemplateColumns:showTime?"1fr 1fr":"1fr",maxWidth:showTime?520:260}}>
          <div className="score-cell">
            <span className="score-cell-label">Cards</span>
            <span style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:cFS,color:"var(--accent)",lineHeight:1}}>{shown} / {total}</span>
          </div>
          {showTime&&<div className="score-cell"><span className="score-cell-label">{timerCfg.mode==="up"?"Time":"Remaining"}</span><span className="score-cell-value"style={{color:"var(--accent)",fontSize:"clamp(1.5rem,5vmin,3rem)"}}>{fmtTime(elapsed)}</span></div>}
        </div>
        <div className="score-actions">
          <button className="score-action-btn select"onClick={onSelectAgain}><Ico.back sz={18}c="var(--secondary)"/>{MODE_LABELS[mode]||"Select"}</button>
          <button className="score-action-btn retry" onClick={onRetry}><Ico.retry sz={18}c="var(--primary)"/>Try Again</button>
          <button className="score-action-btn home"  onClick={onHome}><Ico.home sz={18}c="var(--accent)"/>Home</button>
        </div>
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsScreen({onBack,activeUser,appState,persist,onEditThemeName,onOpenTimer,onOpenCardCount,onFactoryReset}){
  const[showReset,setShowReset]=useState(false);
  const[showPicker,setShowPicker]=useState(false);
  const[colorEditing,setColorEditing]=useState(null);
  const[confirmResetId,setConfirmResetId]=useState(null);
  const portrait=usePortrait();useViewport();
  const iSz=clamp(Math.round(vminPx(portrait?4.5:3.8)),20,36);const btnSz=iSz+20;
  const user=appState.users.find(u=>u.name===activeUser)||{};
  const themeId=user.themeId||"chalkboard";
  const fontId=user.fontId||"fredoka";
  const customThemes=user.customThemes||{};
  const themeNames=user.themeNames||{};
  const shared=getShared(user);
  const getTN=id=>themeNames[id]||BASE_THEMES.find(t=>t.id===id)?.name||id;
  const getT=id=>{const b=BASE_THEMES.find(t=>t.id===id)||BASE_THEMES[0];return{...b,...(customThemes[id]||{}),id};};
  const cur=getT(themeId);
  const cRefs={primary:useRef(null),secondary:useRef(null),accent:useRef(null)};
  const saveUser=useCallback(u=>persist({...appState,users:appState.users.map(x=>x.name===activeUser?{...x,...u}:x)}),[appState,activeUser,persist]);
  const updateColor=(key,val)=>{const ov={...(customThemes[themeId]||{}),[key]:val};saveUser({customThemes:{...customThemes,[themeId]:ov}});applyTheme({...cur,...ov,id:themeId},fontId);};
  const selectTheme=id=>{const t=getT(id);saveUser({themeId:id});setShowPicker(false);applyTheme(t,fontId);};
  const doResetTheme=id=>{const b=BASE_THEMES.find(t=>t.id===id)||BASE_THEMES[0];const cv={...customThemes};delete cv[id];const tn={...themeNames};delete tn[id];saveUser({customThemes:cv,themeNames:tn});if(id===themeId)applyTheme(b,fontId);setConfirmResetId(null);};
  const updateFont=fid=>{saveUser({fontId:fid});applyTheme(cur,fid);};
  const saveS=p=>saveShared(appState,activeUser,p,persist);
  const tl=()=>{if(shared.timer.mode==="none")return"Off";if(shared.timer.mode==="up")return"On";return fmtTime(shared.timer.seconds);};
  const rSz=clamp(Math.round(vminPx(2.5)),12,20);const eSz=clamp(Math.round(vminPx(2.8)),14,22);
  return(
    <div className="screen">
      <div className="top-bar"><div style={{width:btnSz}}/><div className="bar-title" style={{fontSize:"clamp(1.8rem,5vmin,3.2rem)"}}>Settings</div><button className="icon-btn home-btn"style={{width:btnSz,height:btnSz}}onClick={onBack}><Ico.home sz={iSz}c="var(--accent)"/></button></div>
      <div className="settings-scroll">
        <div className="settings-section">
          <div className="settings-label">Game Settings</div>
          <div className="game-settings-grid" style={{gridTemplateColumns:portrait?"1fr":"1fr 1fr"}}>
            <button className="game-setting-btn" onClick={()=>saveS({order:shared.order==="alpha"?"random":"alpha"})}>
              <span className="game-setting-icon">{shared.order==="alpha"?<Ico.alpha sz={iSz} c="var(--accent)"/>:<Ico.shuffle sz={iSz} c="var(--accent)"/>}</span>
              <span className="game-setting-label">Card Order</span>
              <span className="game-setting-value">{shared.order==="alpha"?"Ordered":"Shuffled"}</span>
            </button>
            <button className="game-setting-btn" onClick={()=>saveS({scored:!shared.scored})}>
              <span className="game-setting-icon"><IcoScore sz={iSz*.52} c="var(--accent)" active={shared.scored}/></span>
              <span className="game-setting-label">Scoring</span>
              <span className="game-setting-value">{shared.scored?"Scored":"Free Play"}</span>
            </button>
            <button className="game-setting-btn" onClick={()=>onOpenCardCount(shared)}>
              <span className="game-setting-icon"><Ico.card sz={iSz} c="var(--accent)"/></span>
              <span className="game-setting-label">Max Cards</span>
              <span className="game-setting-value">{shared.cardCount===0?"All":shared.cardCount}</span>
            </button>
            <button className="game-setting-btn" onClick={()=>onOpenTimer(shared)}>
              <span className="game-setting-icon"><Ico.watch sz={iSz} c="var(--accent)"/></span>
              <span className="game-setting-label">Timer</span>
              <span className="game-setting-value">{tl()}</span>
            </button>
          </div>
        </div>
        <div className="settings-divider"/>
        <div className="settings-section">
          <div className="settings-label">Colors</div>
          <div className="colors-block">
            <div className="swatches-row">
              {[["primary","Primary"],["secondary","Secondary"],["accent","Accent"]].map(([key,lbl])=>(
                <div key={key}className="color-swatch-wrap">
                  <div className="color-swatch-label">{lbl}</div>
                  <div className="color-swatch"style={{background:cur[key]}}onClick={()=>setColorEditing(key)}/>
                </div>
              ))}
              <div className="theme-name-col">
                <div className="theme-col-label">Theme</div>
                <button className="theme-name-btn"onClick={()=>setShowPicker(true)}>{getTN(themeId)}<span style={{opacity:.6}}>&#9662;</span></button>
              </div>
            </div>
            {colorEditing&&(
              <div style={{marginTop:8}}>
                <div style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:"clamp(.85rem,2.5vmin,1.1rem)",color:"var(--secondary)",marginBottom:6,textTransform:"capitalize"}}>{colorEditing}</div>
                <ColorPickerSliders value={cur[colorEditing]} onChange={v=>updateColor(colorEditing,v)}/>
              </div>
            )}
          </div>
        </div>
        <div className="settings-divider"/>
        <div className="settings-section">
          <div className="settings-label">Font</div>
          <div className="font-grid"style={{gridTemplateColumns:portrait?"1fr 1fr":"repeat(4,1fr)"}}>
            {FONTS.map(f=><button key={f.id}className={`font-opt${fontId===f.id?" sel":""}`}style={{fontFamily:f.css,fontWeight:f.bold?"700":"400"}}onClick={()=>updateFont(f.id)}>{f.label}</button>)}
          </div>
        </div>
        <div className="settings-divider"/>
        <div className="settings-section"><div className="settings-label">Data</div>
          <button className="reset-btn"onClick={()=>setShowReset(true)}><Ico.reset sz={22}c="var(--red)"/>Factory Reset</button>
        </div>
      </div>
      {showPicker&&(
        <div className="dialog-overlay"onPointerDown={e=>{if(e.target===e.currentTarget)setShowPicker(false);}}>
          <div className="dialog-box">
            <div className="dialog-title">Choose Theme</div>
            <div className="theme-picker-grid"style={{gridTemplateColumns:portrait?"1fr":"1fr 1fr"}}>
              {BASE_THEMES.map(t=>{const th=getT(t.id);return(
                <div key={t.id}className={`theme-item${themeId===t.id?" sel-theme":""}`}onClick={()=>selectTheme(t.id)}>
                  <div className="theme-dot"style={{background:th.primary}}/>
                  <span className="theme-item-name">{getTN(t.id)}</span>
                  <div className="theme-item-actions">
                    <button className="theme-icon-btn"onPointerDown={e=>{e.stopPropagation();onEditThemeName(t.id);setShowPicker(false);}}><Ico.edit sz={eSz}c="var(--accent)"/></button>
                    <button className="theme-icon-btn"onPointerDown={e=>{e.stopPropagation();setConfirmResetId(t.id);}}><Ico.reset sz={rSz}c="var(--dim)"/></button>
                  </div>
                </div>
              );})}
            </div>
          </div>
        </div>
      )}
      {confirmResetId&&<ResetThemeDialog name={getTN(confirmResetId)} onConfirm={()=>doResetTheme(confirmResetId)} onCancel={()=>setConfirmResetId(null)}/>}
      {showReset&&<ResetDialog onConfirm={()=>{setShowReset(false);onFactoryReset();}} onCancel={()=>setShowReset(false)}/>}
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App(){
  const[loading,setLoading]=useState(true);
  const[appState,setAppState]=useState({users:[]});
  const[screen,setScreen]=useState("greeting");
  const[activeUser,setActiveUser]=useState(null);
  const[selScreen,setSelScreen]=useState(null);
  const[editingUser,setEditingUser]=useState(null);
  const[editingThemeId,setEditingThemeId]=useState(null);
  const[roundKey,setRoundKey]=useState(0);
  const[roundConfig,setRoundConfig]=useState(null);
  const[scoreData,setScoreData]=useState(null);
  const[settingsTimerOpen,setSettingsTimerOpen]=useState(false);
  const[settingsCCOpen,setSettingsCCOpen]=useState(false);
  const portrait=usePortrait();

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const s=await loadStateAsync();
      if(cancelled)return;
      if(s&&s.users&&s.users.length>0){
        setAppState(s);
        setActiveUser(s.users[0].name);
        setScreen("home");
        applyTheme(resolveUserTheme(s.users[0]),s.users[0].fontId||"fredoka");
      } else {
        applyTheme(BASE_THEMES[0],"fredoka");
      }
      setLoading(false);
    })();
    return()=>{cancelled=true;};
  },[]);

  const persist=useCallback((next)=>{setAppState(next);saveStateAsync(next);},[]);

  useEffect(()=>{
    const u=appState.users.find(u=>u.name===activeUser);
    if(u){applyTheme(resolveUserTheme(u),u.fontId||"fredoka");}
  },[activeUser,appState]);

  const doFactoryReset=useCallback(()=>{
    deleteStateAsync();
    setAppState({users:[]});
    setActiveUser(null);
    setScreen("greeting");
    applyTheme(BASE_THEMES[0],"fredoka");
  },[]);

  const handleNameComplete=name=>{
    let next;
    if(editingUser){next={...appState,users:appState.users.map(u=>u.name===editingUser?{...u,name}:u)};if(activeUser===editingUser)setActiveUser(name);setEditingUser(null);}
    else{next={...appState,users:[...appState.users,{name}]};setActiveUser(name);}
    persist(next);setScreen("home");
  };

  const handleUserSelect=n=>{setActiveUser(n);setScreen("home");};
  const handleAddUser=()=>{setEditingUser(null);setScreen("nameentry");};
  const handleEditUser=n=>{setEditingUser(n);setScreen("nameentry");};
  const handleDeleteUser=n=>{
    const next={...appState,users:appState.users.filter(u=>u.name!==n)};persist(next);
    if(!next.users.length){setActiveUser(null);setScreen("greeting");}
    else{setActiveUser(null);setScreen("userselect");}
  };

  const handleMode=id=>{
    setSelScreen(id);setScreen("selection");
  };

  const handleGo=cfg=>{
    const user=appState.users.find(u=>u.name===activeUser);
    const shared=getShared(user);
    setRoundConfig({...cfg,shared});setRoundKey(k=>k+1);setScreen("round");
  };

  const handleRetry=()=>{
    if(!roundConfig)return;
    const user=appState.users.find(u=>u.name===activeUser);
    const shared=getShared(user);
    const cfg=roundConfig;
    let deck;
    if(cfg.mode==="letters"){
      const su=new Set(cfg.selUpper||[]),sl=new Set(cfg.selLower||[]);
      deck=[];
      ALPHABET.forEach(l=>{if(su.has(l))deck.push({label:l});if(sl.has(l))deck.push({label:l.toLowerCase()});});
      deck.sort((a,b)=>a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
    } else if(cfg.mode==="numbers"){
      deck=NUMBERS.filter(n=>n>=(cfg.lo??0)&&n<=(cfg.hi??100)).map(n=>({label:String(n)}));
    } else if(cfg.mode==="sightwords"){
      const sel=new Set(cfg.selected||SIGHT_WORDS);
      const sorted=cfg.sortBy==="alpha"?[...SIGHT_WORDS].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())):cfg.sortBy==="size"?[...SIGHT_WORDS].sort((a,b)=>a.length-b.length||a.toLowerCase().localeCompare(b.toLowerCase())):[...SIGHT_WORDS];
      deck=sorted.filter(w=>sel.has(w)).map(w=>({label:w}));
    } else if(cfg.mode==="phonics"){
      const sl=new Set(cfg.selLetters||ALPHABET);
      const sv=VOWELS.filter(v=>sl.has(v));
      const sc=CONSONANTS.filter(c=>sl.has(c));
      const count=cfg.deckSize||20;
      deck=[];const seen=new Set();let att=0;
      while(deck.length<count&&att<count*20){
        att++;
        const c1=sc[Math.floor(Math.random()*sc.length)];
        const v=sv[Math.floor(Math.random()*sv.length)];
        const c2=sc[Math.floor(Math.random()*sc.length)];
        const label=(c1+v+c2).toLowerCase();
        if(seen.has(label))continue;
        seen.add(label);deck.push({label});
      }
    } else if(cfg.mode==="addition"){
      deck=buildAdditionDeck(cfg.lo||1,cfg.hi||20,cfg.deckSize||20,cfg.alg||"Off");
    } else if(cfg.mode==="subtraction"){
      deck=buildSubtractionDeck(cfg.lo||5,cfg.hi||20,cfg.deckSize||20,cfg.alg||"Off",cfg.allowNeg||false);
    } else if(cfg.mode==="multiplication"&&cfg.timesTable){
      deck=buildTimesTableDeck(cfg.hi||5,cfg.alg||"Off");
    } else if(cfg.mode==="multiplication"){
      deck=buildMultiplicationDeck(cfg.lo||0,cfg.hi||12,cfg.deckSize||20,cfg.alg||"Off");
    } else if(cfg.mode==="division"&&cfg.allowRemainder){
      deck=buildDivisionRemainderDeck(cfg.lo||2,cfg.hi||50,cfg.deckSize||20,cfg.alg||"Off");
    } else if(cfg.mode==="division"){
      deck=buildDivisionDeck(cfg.lo||2,cfg.hi||50,cfg.deckSize||20,cfg.alg||"Off");
    } else {
      deck=[...cfg.deck];
    }
    if(shared.order==="random")deck=deck.sort(()=>Math.random()-.5);
    const cc=shared.cardCount;if(cc>0&&deck.length>cc)deck=deck.slice(0,cc);
    setRoundConfig(rc=>({...rc,deck,shared}));setRoundKey(k=>k+1);setScreen("round");
  };

  const handleShowScore=data=>{setScoreData(data);setScreen("score");};
  const handleSelectAgain=()=>setScreen("selection");
  const handleSettings=()=>setScreen("settings");
  const handleHome=()=>setScreen("home");
  const handleBackToSelection=()=>setScreen("selection");
  const handleEditThemeName=tid=>{setEditingThemeId(tid);setScreen("edittheme");};
  const handleThemeNameSaved=newName=>{
    persist({...appState,users:appState.users.map(u=>u.name===activeUser?{...u,themeNames:{...(u.themeNames||{}),[editingThemeId]:newName}}:u)});
    setEditingThemeId(null);setScreen("settings");
  };

  const existingNames=appState.users.map(u=>u.name);
  const activeUserObj=appState.users.find(u=>u.name===activeUser);
  const activeThemeName=activeUserObj?.themeNames?.[editingThemeId]||BASE_THEMES.find(t=>t.id===editingThemeId)?.name||"";

  const saveS=p=>saveShared(appState,activeUser,p,persist);
  const sharedForSettings=getShared(activeUserObj);

  if(loading){
    return(
      <div className="app">
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{fontFamily:"var(--title)",fontWeight:"var(--title-weight)",fontSize:"clamp(2rem,8vmin,4rem)",color:"var(--secondary)",animation:"fadeUp .5s ease"}}>Flashcards+</div>
        </div>
      </div>
    );
  }

  return(
    <div className="app">
      {screen==="greeting"    &&<GreetingScreen onContinue={()=>setScreen("nameentry")}/>}
      {screen==="nameentry"   &&<NameEntryScreen onComplete={handleNameComplete} onCancel={editingUser?()=>{setEditingUser(null);setScreen("userselect");}:appState.users.length>0?()=>setScreen("userselect"):undefined} existingNames={existingNames} initialName={editingUser||""} title={editingUser?"Edit Name":"Please enter child's name"}/>}
      {screen==="userselect"  &&<UserSelectScreen users={appState.users} onSelect={handleUserSelect} onAddNew={handleAddUser} onDelete={handleDeleteUser} onEditName={handleEditUser}/>}
      {screen==="home"        &&activeUser&&<HomeScreen userName={activeUser} onMode={handleMode} onSwitchUser={()=>setScreen("userselect")} onSettings={handleSettings}/>}
      {screen==="selection"   &&selScreen==="letters"       &&<LetterSelectionScreen onGo={handleGo} onHome={handleHome} activeUser={activeUser} appState={appState} persist={persist}/>}
      {screen==="selection"   &&selScreen==="numbers"       &&<NumberSelectionScreen onGo={handleGo} onHome={handleHome} activeUser={activeUser} appState={appState} persist={persist}/>}
      {screen==="selection"   &&selScreen==="sightwords"    &&<SightWordsSelectionScreen onGo={handleGo} onHome={handleHome} activeUser={activeUser} appState={appState} persist={persist}/>}
      {screen==="selection"   &&selScreen==="phonics"       &&<PhonicsSelectionScreen onGo={handleGo} onHome={handleHome} activeUser={activeUser} appState={appState} persist={persist}/>}
      {screen==="selection"   &&selScreen==="addition"      &&<MathSelectionScreen onGo={handleGo} onHome={handleHome} activeUser={activeUser} appState={appState} persist={persist} modeId="addition" title="Addition"/>}
      {screen==="selection"   &&selScreen==="subtraction"   &&<MathSelectionScreen onGo={handleGo} onHome={handleHome} activeUser={activeUser} appState={appState} persist={persist} modeId="subtraction" title="Subtraction"/>}
      {screen==="selection"   &&selScreen==="multiplication"&&<MathSelectionScreen onGo={handleGo} onHome={handleHome} activeUser={activeUser} appState={appState} persist={persist} modeId="multiplication" title="Multiplication"/>}
      {screen==="selection"   &&selScreen==="division"      &&<MathSelectionScreen onGo={handleGo} onHome={handleHome} activeUser={activeUser} appState={appState} persist={persist} modeId="division" title="Division"/>}
      {screen==="selection"   &&!["letters","numbers","sightwords","phonics","addition","subtraction","multiplication","division"].includes(selScreen)&&<GenericSelectionScreen title={MODE_LABELS[selScreen]||selScreen} onHome={handleHome} activeUser={activeUser} appState={appState} persist={persist} modeId={selScreen}/>}
      {screen==="round"       &&roundConfig&&<FlashcardRound key={roundKey} config={roundConfig} onHome={handleHome} onShowScore={handleShowScore} onBackToSelection={handleBackToSelection}/>}
      {screen==="score"       &&scoreData&&<ScoreScreen scoreData={scoreData} onRetry={handleRetry} onHome={handleHome} onSelectAgain={handleSelectAgain}/>}
      {screen==="settings"    &&activeUser&&(
        <>
          <SettingsScreen onBack={handleHome} activeUser={activeUser} appState={appState} persist={persist} onEditThemeName={handleEditThemeName} onOpenTimer={()=>setSettingsTimerOpen(true)} onOpenCardCount={()=>setSettingsCCOpen(true)} onFactoryReset={doFactoryReset}/>
          {settingsTimerOpen&&<TimerDialog timer={sharedForSettings.timer} onSave={t=>{saveS({timer:t});setSettingsTimerOpen(false);}} onCancel={()=>setSettingsTimerOpen(false)} fs={clamp(Math.round(vminPx(3.5)),14,28)}/>}
          {settingsCCOpen&&<CardCountDialog count={sharedForSettings.cardCount} totalSelected={52} onSave={cc=>{saveS({cardCount:cc});setSettingsCCOpen(false);}} onCancel={()=>setSettingsCCOpen(false)} fs={clamp(Math.round(vminPx(3.5)),14,28)}/>}
        </>
      )}
      {screen==="edittheme"   &&<NameEntryScreen title="Rename Theme" initialName={activeThemeName} existingNames={[]} onComplete={handleThemeNameSaved} onCancel={()=>setScreen("settings")}/>}
    </div>
  );
}
