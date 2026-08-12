import { useState, useEffect } from "react";

/* ────────────────────────────────────────────────────────────────────────
   아이콘: lucide-react 대신 ad-ref 사이드바가 쓰는 것과 같은 이모지 스타일로
   맞춘다(2026-08-11). className은 크기/색/여백 지정용으로 기존 호출부에서
   그대로 넘어오므로, 그 값을 span에 그대로 씌워서 기존 레이아웃을 유지한다.
   ──────────────────────────────────────────────────────────────────────── */
function makeIcon(emoji) {
  function Icon({ className }) {
    return <span className={className} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>{emoji}</span>;
  }
  return Icon;
}
const Target = makeIcon("🎯");
const X = makeIcon("✕");
const ExternalLink = makeIcon("🔗");
const Sparkles = makeIcon("✨");
const Eye = makeIcon("👁️");
const Zap = makeIcon("⚡");
const ArrowUpRight = makeIcon("↗️");
const Flag = makeIcon("🚩");
const Bookmark = makeIcon("🔖");
const BookmarkCheck = makeIcon("✅");
const TrendingUp = makeIcon("📈");
const AlertTriangle = makeIcon("⚠️");
const Info = makeIcon("ℹ️");
const ChevronDown = makeIcon("⌄");
const List = makeIcon("📋");
const Hash = makeIcon("#");
const ListChecks = makeIcon("✅");
const Link2 = makeIcon("🔗");
const Search = makeIcon("🔍");
const Folder = makeIcon("📁");
const FolderPlus = makeIcon("📁");
const ChevronRight = makeIcon("›");
const Filter = makeIcon("🔽");
const MessageCircle = makeIcon("💬");
const Pencil = makeIcon("✏️");
const Trash2 = makeIcon("🗑️");
const Send = makeIcon("📤");
const StickyNote = makeIcon("📝");
const FolderInput = makeIcon("📥");

/* 로고 이미지 제거함(2026-08-11) - 실제 로고 파일을 받으면 헤더에 다시 넣는다. */

/* GET 요청을 JSONP로 - Apps Script 웹앱은 plain fetch로 GET을 해도 응답에
   Access-Control-Allow-Origin이 없어서 브라우저가 응답을 못 읽게 막는다(CORS 에러,
   2026-08-11 실제로 확인함). 백엔드가 이미 ?callback= 파라미터로 JSONP 응답을
   지원하므로(README §2.5) 그걸 쓴다 - <script> 태그로 불러오는 방식이라 CORS 자체가
   적용되지 않음. POST(북마크/피드백/하트비트 등)는 text/plain 트릭으로 이미 우회돼
   있어서 안 건드림. */
function fetchJsonp(url) {
  return new Promise((resolve, reject) => {
    const cbName = "__newsClippingJsonp_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    window[cbName] = (data) => {
      resolve(data);
      delete window[cbName];
      script.remove();
    };
    script.onerror = () => {
      reject(new Error("JSONP 요청 실패"));
      delete window[cbName];
      script.remove();
    };
    script.src = `${url}?callback=${cbName}`;
    document.body.appendChild(script);
  });
}

/* ────────────────────────────────────────────────────────────────────────
   ★ API 주소 설정 ★
   Apps Script 웹앱을 배포하고 받은 주소를 아래 따옴표 안에 붙여넣으세요.
   예: const API_URL = "https://script.google.com/macros/s/AKfycb..../exec";

   주소를 넣기 전(빈 값)이면 아래 샘플 데이터로 화면이 표시됩니다.
   주소를 넣으면 실제 시트 데이터를 불러옵니다.
   ──────────────────────────────────────────────────────────────────────── */
const API_URL = "https://script.google.com/macros/s/AKfycbyczlkDnp12KZrW-du0wr6GucG-IraMrwMFUbQ9Se7C-amNONG9CYyDYpj0Eqs30cAD/exec";

/* ────────────────────────────────────────────────────────────────────────
   샘플 데이터 — 지은님 뉴스클리핑 시스템 구조 반영
   실제 운영 시 DuckDB → /api/news/... 에서 주입됩니다.
   ──────────────────────────────────────────────────────────────────────── */

const WEEKLY_INSIGHT = {
  week: "2026.06.23 — 06.29",
  summary:
    "경쟁사들이 일제히 '해외주식 수수료 인하'로 몰리는 한 주. 가격 경쟁이 과열되는 반대편에서 네이버페이증권은 커뮤니티 강화로 방향을 틀었다.",
  conclusions: [
    {
      title: "경쟁사 수수료 경쟁이 '해외주식'으로 전선 이동",
      what: "토스·키움·삼성이 3일에 걸쳐 해외주식 수수료·환전 우대를 잇달아 발표(관련 기사 17건). 국내주식에 머물던 가격 경쟁이 해외주식으로 옮겨붙는 흐름.",
      why: "우리 앱의 핵심 무대인 해외주식에서 경쟁사들이 '가격'으로 유입을 노린다는 신호. 단, 이들은 커뮤니티·정보 경험이 아닌 수수료로만 접근 중.",
      action: "지금이 '수수료로 왔다가 정보·커뮤니티 때문에 남는다'는 메시지를 키울 적기. 신규 유입 대비 커뮤니티 체류 데이터를 근거로 차별화 캠페인 기획.",
      evidence: 17,
    },
    {
      title: "네이버페이증권, 커뮤니티 영역으로 진입 시작",
      what: "종목토론방 AI 요약 베타 출시 + 하반기 전면 개편 예고(6건). 이번 주 처음으로 '정보·커뮤니티 경험' 관련 구체적 행보가 포착됨.",
      why: "우리의 차별화 영역인 '커뮤니티 정보 경험'에 경쟁사가 처음 발을 들인 것. 아직 초기라 선점 여지가 있으나, 방치하면 강점이 희석될 수 있음.",
      action: "네이버 개편 전에 '실시간 한국어 토론·동료 투자자 인사이트'의 우위를 명확히 각인시키는 선점 메시지 필요. 개편 내용 상세 모니터링 착수.",
      evidence: 6,
    },
    {
      title: "메리츠증권은 실적·리테일 투자에 집중 (신규 서비스는 잠잠)",
      what: "자사 기사 31건 중 다수가 2분기 실적 호조·리테일 500억 투자. 신규 서비스·기능 발표는 이번 주 거의 없음.",
      why: "체력(실적·투자)은 탄탄하나, 경쟁사들이 서비스로 움직이는 주에 눈에 띄는 신규 메시지가 부재. 화제성 측면에서 상대적으로 조용했음.",
      action: "쌓인 리테일 투자 여력을 '눈에 보이는 서비스 개선'으로 연결해 발표 시점을 잡을 것. 경쟁사 개편 대응과 묶으면 화제성 확보 가능.",
      evidence: 31,
    },
  ],
  watchNextWeek:
    "네이버페이증권 종목토론방 개편의 구체적 사양 공개 여부 — 우리 커뮤니티 강점과 직접 부딪히는 지점이라 최우선 주시.",
};

const TOPIC_TOP7 = [
  { rank: 1, topic: "미국주식 환전 수수료 무료화", mentions: 17, article: { title: "토스증권, 미국주식 환전 수수료 전면 무료화 선언", media: "한국경제" } },
  { rank: 2, topic: "2분기 증권사 실적", mentions: 14, article: { title: "메리츠증권 2분기 순이익 전년比 22% 증가", media: "매일경제" } },
  { rank: 3, topic: "종목토론방 AI 요약", mentions: 9, article: { title: "네이버페이증권, 종목토론방에 AI 요약 도입", media: "전자신문" } },
  { rank: 4, topic: "해외 ETF 라인업 확대", mentions: 7, article: { title: "삼성증권, 글로벌 ETF 라인업 확대", media: "파이낸셜뉴스" } },
  { rank: 5, topic: "리테일 디지털 전환 투자", mentions: 6, article: { title: "메리츠증권, 리테일 디지털 전환에 500억 투자", media: "한국경제" } },
  { rank: 6, topic: "MAU·이용자 지표 경쟁", mentions: 5, article: { title: "토스증권 MAU 500만 돌파…해외주식이 견인", media: "서울경제" } },
  { rank: 7, topic: "수수료 무료 이벤트 연장", mentions: 4, article: { title: "키움증권, 수수료 평생 무료 이벤트 연장", media: "이데일리" } },
];

const COMPETITOR_ACTIONS = [
  { date: "06.27", company: "토스증권", action: "미국주식 환전 수수료 전면 무료화", url: "https://example.com" },
  { date: "06.27", company: "네이버페이증권", action: "종목토론방 AI 요약 기능 베타 출시", url: "https://example.com" },
  { date: "06.26", company: "토스증권", action: "MAU 500만 돌파 (해외주식 견인)", url: "https://example.com" },
  { date: "06.25", company: "삼성증권", action: "글로벌 ETF 상품군 대폭 확대", url: "https://example.com" },
  { date: "06.25", company: "네이버페이증권", action: "하반기 종목토론방 전면 개편 예고", url: "https://example.com" },
  { date: "06.24", company: "키움증권", action: "국내주식 수수료 무료 이벤트 연장", url: "https://example.com" },
];

const ARTICLES = [
  { date: "06.27", topic: "환전 수수료 무료화", title: "토스증권, 미국주식 환전 수수료 전면 무료화 선언", media: "한국경제", priority: 95, summary: "토스증권이 미국주식 거래 시 환전 수수료를 전액 면제하는 정책을 발표했다. 해외주식 신규 유입을 겨냥한 공격적 행보로 분석된다." },
  { date: "06.27", topic: "2분기 실적", title: "메리츠증권 2분기 순이익 전년比 22% 증가", media: "매일경제", priority: 92, summary: "메리츠증권이 2분기 호실적을 기록했다. 리테일과 IB 부문이 고르게 성장하며 시장 기대치를 상회했다." },
  { date: "06.23", topic: "리테일 투자", title: "메리츠증권, 리테일 디지털 전환에 500억 투자", media: "한국경제", priority: 90, summary: "메리츠증권이 디지털 리테일 역량 강화를 위해 대규모 투자를 단행한다. 모바일 트레이딩 환경 고도화가 핵심이다." },
  { date: "06.27", topic: "AI 종목토론방", title: "네이버페이증권, 종목토론방에 AI 요약 도입", media: "전자신문", priority: 88, summary: "네이버페이증권이 종목토론방 게시글을 AI가 요약해주는 기능을 베타 출시했다. 커뮤니티 체류 시간을 늘리려는 전략이다." },
  { date: "06.25", topic: "커뮤니티 개편", title: "네이버페이증권, 커뮤니티 개편 예고", media: "디지털데일리", priority: 80, summary: "네이버페이증권이 하반기 종목토론방 전면 개편을 예고했다. 투자자 간 정보 공유 기능을 강화할 계획이다." },
  { date: "06.25", topic: "해외 ETF", title: "삼성증권, 글로벌 ETF 라인업 확대", media: "파이낸셜뉴스", priority: 72, summary: "삼성증권이 해외 ETF 상품군을 대폭 늘렸다. 분산투자 수요에 대응하려는 움직임이다." },
  { date: "06.24", topic: "수수료 이벤트", title: "키움증권, 수수료 평생 무료 이벤트 연장", media: "이데일리", priority: 68, summary: "키움증권이 국내주식 수수료 무료 이벤트를 연장했다. 신규 고객 확보 경쟁이 이어지고 있다." },
];

const APP_PERSPECTIVES = [
  { date: "06.27", type: "opp", text: "경쟁사들이 해외주식 '수수료'로 몰리는 국면 — 우리는 '정보·커뮤니티 경험'으로 차별화할 여백이 오히려 커짐. 유입 후 잔존 메시지 강화 적기.", src: "토스 환전 수수료 무료화" },
  { date: "06.27", type: "threat", text: "네이버페이증권이 종목토론방 AI 요약을 출시하며 커뮤니티 정보 경험 영역에 처음 진입. 우리 핵심 강점과 정면으로 겹치는 지점이라 주시 필요.", src: "네이버 AI 종목토론방" },
  { date: "06.26", type: "note", text: "토스 MAU 500만의 견인차가 해외주식이라는 점은, 해외주식 시장 자체가 커지고 있다는 신호. 파이 확대는 우리에게도 기회 요인.", src: "토스 MAU 500만" },
  { date: "06.25", type: "threat", text: "네이버페이증권 하반기 커뮤니티 전면 개편 예고. 개편 상세가 공개되기 전에 우리 커뮤니티 우위를 각인시킬 선점 타이밍이 좁아지고 있음.", src: "네이버 커뮤니티 개편 예고" },
  { date: "06.25", type: "opp", text: "삼성증권의 ETF 라인업 확대는 상품 경쟁 중심 — 커뮤니티·정보 경험은 여전히 무주공산. 우리 포지션을 재확인시켜 주는 근거.", src: "삼성 ETF 확대" },
  { date: "06.24", type: "note", text: "키움의 수수료 무료 이벤트 연장은 국내주식 위주. 우리 해외주식 특화 포지션과 직접 충돌하진 않으나 업계 가격 경쟁 지속을 보여줌.", src: "키움 수수료 이벤트" },
  { date: "06.23", type: "opp", text: "메리츠의 리테일 디지털 500억 투자 — 투자 여력이 '눈에 보이는 서비스·커뮤니티 개선'으로 연결되면 우리 앱 차별화의 실탄이 될 수 있음.", src: "메리츠 리테일 500억 투자" },
];

const PERSPECTIVE_TAG = {
  opp: { badge: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300", icon: TrendingUp, label: "기회" },
  threat: { badge: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300", icon: AlertTriangle, label: "위협" },
  note: { badge: "bg-slate-500/10 text-slate-500 dark:bg-slate-400/15 dark:text-[#c0c7d2]", icon: Info, label: "참고" },
};

// ── 데일리 데이터 (실제 Apps Script 구조: 키워드 TOP3 + 고정 4개 주제 섹션) ──
const DAILY_DAYS = [
  { d: "06.23", w: "월" }, { d: "06.24", w: "화" }, { d: "06.25", w: "수" },
  { d: "06.26", w: "목" }, { d: "06.27", w: "금" }, { d: "06.28", w: "토" }, { d: "06.29", w: "일" },
];

// API 연결 전 데모용 - 증권사 필터 칩 UI를 실제 데이터 없이도 보여주기 위한 샘플 목록
// (실제 연결되면 API가 내려주는 competitors로 교체됨, 2026-08-11 추가)
const SAMPLE_COMPETITORS = [
  { name: "메리츠증권", aliases: ["메리츠증권"] },
  { name: "토스증권", aliases: ["토스증권"] },
  { name: "네이버페이증권", aliases: ["네이버페이증권", "네이버증권"] },
  { name: "삼성증권", aliases: ["삼성증권"] },
  { name: "키움증권", aliases: ["키움증권"] },
  { name: "미래에셋증권", aliases: ["미래에셋증권"] },
];

// 날짜별 데일리 리포트 (지금은 06.27만 샘플, 나머지는 DB 연결 후)
const DAILY_REPORTS = {
  "06.27": {
    weekday: "금요일",
    keywords: [
      { title: "경쟁사 서비스 모방 심화", desc: "토스증권의 차별화 기능을 경쟁 MTS로 확산, 차별점이 흐려지는 흐름" },
      { title: "AI 기반 투자 정보 강화", desc: "토스·미래에셋 등 주요 증권사가 AI로 시장 분석·종목 정보 제공" },
      { title: "전산 안정성·고객 신뢰", desc: "키움 전산 오류로 인한 반대매매 사태, 시스템 안정성이 핵심 요소" },
    ],
    topics: [
      {
        label: "금융 상품·이벤트 관련",
        points: [
          { summary: "토스증권은 국내 주식 거래 수수료를 무료로 제공하며 신규 고객 유치에 힘쓰고 있다.", links: ["https://example.com"] },
          { summary: "우리자산운용은 AI 관련 기업에 투자하는 '피지컬AI BIG 2 플러스 펀드'를 출시했다.", links: [] },
        ],
        persp: "토스증권의 '수수료 무료'는 고객 한 명을 데려오는 데 드는 비용(CAC)보다 효과적인 신규 고객 유치 전략. 해외주식 특화인 우리 앱은 국내 투자자의 관심을 해외로 돌릴 차별화된 유인책을 준비해야.",
      },
      {
        label: "금융 앱 기능·서비스 관련",
        points: [
          { summary: "토스증권은 올해 1분기 키움증권에 이어 두 번째로 많은 19건의 전산 오류(컴퓨터 시스템의 문제) 민원을 기록했다.", links: ["https://example.com", "https://example.com"] },
          { summary: "토스뱅크는 블록체인 기술을 활용해 해외주식 결제 방식을 혁신하는 계획을 밝혔다.", links: [] },
          { summary: "여러 금융사가 생성형 AI(질문하면 스스로 새로운 내용을 만들어내는 인공지능)를 활용해 고객 상담 챗봇 서비스를 도입하고 있다.", links: [] },
        ],
        persp: "토스의 전산 오류는 우리 앱이 '편의성'만큼 '안정성'을 확보하는 것이 중요함을 시사. 안정적인 해외주식 투자 경험을 제공해야.",
      },
      {
        label: "금융 커뮤니티·핀테크 관련",
        points: [
          { summary: "키움증권은 전산 오류로 고객 증거금 반대매매 논란을 빚었다.", links: ["https://example.com"] },
          { summary: "네이버페이는 얼굴결제 가맹점을 빠르게 확대하고 있다.", links: [] },
        ],
        persp: "전산 오류는 시스템 안정성이 신뢰에 직결됨을 보여줌. 우리 앱은 해외주식 거래 안정성을 최우선으로.",
      },
    ],
  },
};

const CIRCLED_CHARS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮"];
// 인덱스(0부터)를 원문자 번호로. 15개 초과하면 "16." 처럼 일반 숫자로 대체.
function circledNum(i) {
  return i < CIRCLED_CHARS.length ? CIRCLED_CHARS[i] : (i + 1) + ".";
}

/* ──────────────────────────────────────────────────────────────────────── */

function PriorityDot({ score }) {
  const color = score >= 90 ? "#dc2626" : score >= 80 ? "#f59e0b" : "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-xs tabular-nums text-slate-500 dark:text-[#a5adba]">{score}</span>
    </span>
  );
}

function ArticleModal({ article, onClose }) {
  if (!article) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 dark:bg-[#232936] dark:ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-[#2b3242]">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              {article.topic && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-[#2b3242] dark:text-[#c0c7d2]">{article.topic}</span>}
              <span className="text-xs text-slate-400">{article.date}</span>
            </div>
            <h3 className="text-lg font-semibold leading-snug text-[#303845] dark:text-[#cbd2dc]">{article.title}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {(article.media || article.priority > 0) && (
            <div className="flex items-center gap-4 text-sm">
              {article.media && <span className="font-medium text-slate-600 dark:text-[#c0c7d2]">{article.media}</span>}
              {article.media && article.priority > 0 && <span className="text-slate-300 dark:text-[#6b7280]">·</span>}
              {article.priority > 0 && <span className="flex items-center gap-1.5 text-slate-500 dark:text-[#a5adba]">우선순위 <PriorityDot score={article.priority} /></span>}
            </div>
          )}
          <p className="text-sm leading-relaxed text-slate-600 dark:text-[#c0c7d2]">{article.summary}</p>
          {article.url && (
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
              원문 보기 <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// 요약 문장 안의 (괄호 설명)을 작은 회색 글씨로 렌더링
// 클릭하면 뜻 캡션(툴팁)이 뜨는 용어. ⟪용어⟫⟨설명⟩ 형식에서 변환됨.
function TermTooltip({ term, desc }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="cursor-pointer border-b border-dashed border-slate-400 text-[#303845] hover:border-slate-600 dark:border-[#3f4757] dark:text-[#cbd2dc] dark:hover:border-slate-300"
      >
        {term}
      </button>
      {open && (
        <span
          className="absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-[240px] -translate-x-1/2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-normal leading-snug text-slate-600 shadow-lg dark:border-[#363d4d] dark:bg-[#232936] dark:text-[#c0c7d2]"
        >
          {desc}
        </span>
      )}
    </span>
  );
}

// 용어 기호가 섞인 텍스트를 정규화: 백틱/별표 제거 + 유사 화살괄호를 표준(⟪⟫⟨⟩)으로 통일
// (Gemini가 ⟪⟫ 대신 한중일 겹화살괄호 《》 나 홑화살괄호 〈〉 를 쓰는 경우가 있어 함께 흡수)
function stripWrappers(text) {
  return String(text || "")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/《/g, "⟪").replace(/》/g, "⟫")   // 겹화살괄호(U+300A/B) → 표준
    .replace(/〈/g, "⟨").replace(/〉/g, "⟩");  // 홑화살괄호(U+3008/9) → 표준
}

// [클릭 캡션용] ⟪용어⟫⟨설명⟩ → 클릭하면 뜻이 뜨는 용어. (주간 핵심 결론, 데일리 주제별 하이라이트에서만 사용)
function renderWithCaption(text) {
  if (!text) return null;
  text = stripWrappers(text);

  const termPattern = /⟪([^⟪⟫]*)⟫⟨([^⟨⟩]*)⟩/g;
  const nodes = [];
  let lastIndex = 0;
  let m;
  let key = 0;

  function pushPlain(str) {
    if (!str) return;
    // 캡션 구역이라도, 혹시 남은 일반 (괄호)는 작게 처리
    const parts = str.split(/(\([^()]*\))/g);
    parts.forEach((part) => {
      if (/^\([^()]*\)$/.test(part)) {
        nodes.push(<span key={key++} className="text-[0.82em] text-slate-400 dark:text-[#757d8d]">{part}</span>);
      } else if (part) {
        nodes.push(<span key={key++}>{part}</span>);
      }
    });
  }

  while ((m = termPattern.exec(text)) !== null) {
    pushPlain(text.slice(lastIndex, m.index));
    nodes.push(<TermTooltip key={key++} term={m[1]} desc={m[2]} />);
    lastIndex = termPattern.lastIndex;
  }
  pushPlain(text.slice(lastIndex));
  return nodes;
}

// [작은 괄호용] 모든 용어 설명을 예전처럼 작고 흐린 (괄호)로 표시. (그 외 모든 곳에서 사용)
// ⟪용어⟫⟨설명⟩ 기호가 들어와도 "용어(설명)" 형태로 바꿔 작게 보여준다.
// 통합 검색: 데일리·주간 데이터 전체를 훑어 질의어가 포함된 항목을 모아 반환.
// 각 결과에 "어디서 걸렸는지"(출처 탭·날짜·필드종류)를 함께 담는다.
function cleanForSearch(s) {
  // ⟪용어⟫⟨설명⟩ (및 CJK 변종) → "용어(설명)"로 자연스럽게 변환, 백틱/별표 제거
  return String(s || "")
    .replace(/[⟪《]([^⟪⟫《》]*)[⟫》][⟨〈]([^⟨⟩〈〉]*)[⟩〉]/g, "$1($2)")
    .replace(/⟪|⟫|⟨|⟩|《|》|〈|〉/g, "")
    .replace(/`/g, "")
    .replace(/\*\*/g, "");
}

function buildSearchResults(query, dailyData, weeklyData) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const results = [];

  function hit(text) {
    const t = cleanForSearch(text).toLowerCase();
    return t.includes(q);
  }

  // ── 데일리 훑기 ──
  Object.keys(dailyData || {}).forEach((date) => {
    const day = dailyData[date] || {};
    // 핵심 키워드
    (day.keywords || []).forEach((k) => {
      const txt = `${k.title || ""} ${k.desc || ""}`;
      if (hit(txt)) {
        results.push({ tab: "daily", date, kind: "핵심 키워드", text: cleanForSearch(`${k.title || ""} — ${k.desc || ""}`), url: null });
      }
    });
    // 주제별 하이라이트 (요약 + 관점)
    const topics = day.topics || {};
    Object.keys(topics).forEach((topicName) => {
      const tp = topics[topicName] || {};
      (tp.points || []).forEach((pt) => {
        if (hit(pt.summary)) {
          results.push({ tab: "daily", date, kind: `${topicName} · 요약`, text: cleanForSearch(pt.summary), url: (pt.links && pt.links[0]) || null });
        }
      });
      if (hit(tp.persp)) {
        results.push({ tab: "daily", date, kind: `${topicName} · 우리 앱 관점`, text: cleanForSearch(tp.persp), url: null });
      }
    });
  });

  // ── 주간 훑기 ──
  Object.keys(weeklyData || {}).forEach((weekId) => {
    const wk = weeklyData[weekId] || {};
    const label = wk.period || weekId;
    if (hit(wk.summary)) {
      results.push({ tab: "weekly", weekId, date: label, kind: "이번 주 요약", text: cleanForSearch(wk.summary), url: null });
    }
    (wk.conclusions || []).forEach((c) => {
      const txt = `${c.title || ""} ${c.what || ""} ${c.why || ""} ${c.action || ""}`;
      if (hit(txt)) {
        results.push({ tab: "weekly", weekId, date: label, kind: "핵심 결론", text: cleanForSearch(c.title || c.what || ""), url: null });
      }
    });
    (wk.keywords || []).forEach((k) => {
      const txt = `${k.topic || ""} ${k.article || ""}`;
      if (hit(txt)) {
        results.push({ tab: "weekly", weekId, date: label, kind: "화제 키워드", text: cleanForSearch(k.topic || ""), url: k.url || null });
      }
    });
    (wk.archive || []).forEach((a) => {
      if (hit(`${a.text || ""} ${a.src || ""}`)) {
        results.push({ tab: "weekly", weekId, date: label, kind: "우리 앱 관점 아카이브", text: cleanForSearch(a.text), url: a.url || null });
      }
    });
    if (hit(wk.watchNextWeek)) {
      results.push({ tab: "weekly", weekId, date: label, kind: "다음 주 주시 포인트", text: cleanForSearch(wk.watchNextWeek), url: null });
    }
  });

  return results;
}

// 통합 검색 결과 화면
function SearchResultsView({ query, results, onClear, onJump, sortOrder, onToggleSort }) {
  // 날짜 기준 정렬용 키 추출: 데일리는 "2026-07-02", 주간은 "2026-06-29 ~ ..."의 앞 날짜
  function dateKey(r) {
    const m = String(r.date).match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : String(r.date);
  }
  const sorted = [...results].sort((a, b) => {
    const ka = dateKey(a), kb = dateKey(b);
    if (ka === kb) return 0;
    return sortOrder === "asc" ? (ka < kb ? -1 : 1) : (ka > kb ? -1 : 1);
  });
  const dailyResults = sorted.filter((r) => r.tab === "daily");
  const weeklyResults = sorted.filter((r) => r.tab === "weekly");

  const Item = ({ r }) => (
    <div
      onClick={() => onJump && onJump(r)}
      className="cursor-pointer rounded-lg border border-slate-100 p-3.5 transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-[#2b3242] dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/5"
      title="이 내용이 있는 화면으로 이동"
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${r.tab === "daily" ? "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300" : "bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300"}`}>
          {r.tab === "daily" ? "데일리" : "주간"}
        </span>
        <span className="text-[11px] text-slate-400">{r.date}</span>
        <span className="text-[11px] text-slate-300 dark:text-[#6b7280]">·</span>
        <span className="text-[11px] text-slate-500 dark:text-[#a5adba]">{r.kind}</span>
        <span className="ml-auto text-[10px] text-indigo-500 dark:text-indigo-400">이동 →</span>
      </div>
      <p className="text-sm leading-relaxed text-slate-700 dark:text-[#c0c7d2]">
        {r.text}
        {r.url && (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-1 inline-flex items-center text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
            title="원문 기사 보기"
          >
            <ArrowUpRight className="inline h-3.5 w-3.5" />
          </a>
        )}
      </p>
    </div>
  );

  return (
    <main className="min-w-0 flex-1 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#303845] dark:text-[#cbd2dc]">
          '{query}' 검색 결과 <span className="text-slate-400">{results.length}건</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSort}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-[#363d4d] dark:text-[#a5adba] dark:hover:bg-slate-700"
            title="날짜 정렬 방향 전환"
          >
            {sortOrder === "desc" ? "최신순 ↓" : "오래된순 ↑"}
          </button>
          <button onClick={onClear} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-[#a5adba] dark:hover:bg-slate-700">
            검색 닫기
          </button>
        </div>
      </div>

      {results.length === 0 && (
        <div className="rounded-xl border border-slate-100 p-10 text-center text-sm text-slate-400 dark:border-[#2b3242]">
          '{query}'에 대한 결과가 없습니다. 다른 검색어를 시도해 보세요.
        </div>
      )}

      {dailyResults.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-[#c0c7d2]">
            <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[11px] text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300">데일리</span>
            {dailyResults.length}건
          </h2>
          <div className="space-y-2">{dailyResults.map((r, i) => <Item key={i} r={r} />)}</div>
        </section>
      )}

      {weeklyResults.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-[#c0c7d2]">
            <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-600 dark:bg-violet-400/15 dark:text-violet-300">주간</span>
            {weeklyResults.length}건
          </h2>
          <div className="space-y-2">{weeklyResults.map((r, i) => <Item key={i} r={r} />)}</div>
        </section>
      )}
    </main>
  );
}

// 관점(코멘트) 표시용: 용어 설명 괄호만 떼고 용어는 남긴다. 원본 데이터는 건드리지 않음.
// ⟪용어⟫⟨설명⟩ → 용어, 그리고 이미 변환된 용어(설명) → 용어
function stripTermExplanations(text) {
  return String(text || "")
    .replace(/[⟪《]([^⟪⟫《》]*)[⟫》][⟨〈][^⟨⟩〈〉]*[⟩〉]/g, "$1")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/([^\s(])\s*\([^()]*\)/g, "$1");
}

function renderWithParens(text) {
  if (!text) return null;
  // ⟪용어⟫⟨설명⟩ → 용어(설명) 로 먼저 변환
  let converted = stripWrappers(text).replace(/⟪([^⟪⟫]*)⟫⟨([^⟨⟩]*)⟩/g, "$1($2)");

  // (내용) 단위로 쪼개어 괄호만 작게
  const parts = converted.split(/(\([^()]*\))/g);
  return parts.map((part, i) => {
    if (/^\([^()]*\)$/.test(part)) {
      return <span key={i} className="text-[0.82em] text-slate-400 dark:text-[#757d8d]">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

function FolderPickerModal({ folders, currentFolders = [], onSelect, onCancel, initialMemo = "" }) {
  const [newFolder, setNewFolder] = useState("");
  const [creating, setCreating] = useState(false);
  const [memo, setMemo] = useState(initialMemo || "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-[#2b3242] dark:bg-[#232936]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-[#2b3242]">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#303845] dark:text-[#cbd2dc]">
            <Bookmark className="h-4 w-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />북마크·메모를 어느 폴더에 저장할까요?
          </h3>
          <button onClick={onCancel} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-5 pt-3 text-xs text-slate-400">여러 폴더에 담을 수 있어요. 이미 담긴 폴더를 누르면 해제됩니다.</p>
        <div className="max-h-36 overflow-y-auto px-3 pb-2 pt-2">
          <div className="space-y-0.5">
            {creating ? (
              <div className="flex items-center gap-2 px-1 py-1">
                <input
                  autoFocus
                  type="text"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newFolder.trim()) onSelect(newFolder.trim(), memo); if (e.key === "Escape") { setCreating(false); setNewFolder(""); } }}
                  placeholder="폴더 이름 (예: 환전 수수료, 지은)"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-[#363d4d] dark:bg-[#1a1f2b] dark:text-[#cbd2dc]"
                />
                <button
                  onClick={() => newFolder.trim() && onSelect(newFolder.trim(), memo)}
                  disabled={!newFolder.trim()}
                  className="flex-shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
                >저장</button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
              >
                <FolderPlus className="h-4 w-4 flex-shrink-0" />새 폴더 만들기
              </button>
            )}

            {folders && folders.length > 0 ? (
              folders.map((f) => {
                const inFolder = currentFolders.includes(f);
                return (
                  <button
                    key={f}
                    onClick={() => onSelect(f, memo)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                      inFolder
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200"
                        : "text-slate-700 hover:bg-indigo-50 dark:text-[#c0c7d2] dark:hover:bg-indigo-500/15"
                    }`}
                  >
                    <Folder className="h-4 w-4 flex-shrink-0 text-slate-400 dark:text-[#757d8d]" />
                    <span className="flex-1 truncate">{f}</span>
                    {inFolder && <BookmarkCheck className="h-4 w-4 flex-shrink-0 fill-current text-indigo-500 dark:text-indigo-400" />}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-3 text-center text-xs text-slate-400">아직 만들어진 폴더가 없습니다.</p>
            )}
          </div>
        </div>

        {/* 개인 메모 — 시선이 가도록 크게 */}
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-[#2b3242]">
          <label className="mb-2 flex items-center gap-2 text-sm font-bold text-[#303845] dark:text-[#cbd2dc]">
            <StickyNote className="h-4 w-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />개인 메모 <span className="text-xs font-normal text-slate-400 dark:text-[#757d8d]">(선택)</span>
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="이 항목에 대한 개인 메모를 남겨두세요"
            rows={5}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#303845] outline-none placeholder:text-slate-300 focus:border-indigo-400 dark:border-[#363d4d] dark:bg-[#1a1f2b] dark:text-[#cbd2dc] dark:placeholder:text-[#757d8d]"
          />
          {/* 저장 버튼: 폴더를 고르지 않아도 이 버튼으로 저장 가능 (기본 폴더에 북마크+메모 저장) */}
          <button
            onClick={() => onSelect(null, memo, true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <BookmarkCheck className="h-4 w-4" />저장
          </button>
          <p className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-[#757d8d]">폴더를 선택하지 않으면 '기본' 폴더에 저장됩니다</p>
        </div>
      </div>
    </div>
  );
}

// 북마크 날짜를 데일리 조회용 "YYYY-MM-DD" 키로 정규화 (데일리 dailyData의 키 형식과 일치)
function toDailyDateKey(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return s;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

// 북마크 날짜를 "YY.MM.DD"로 정규화 (서버가 Date 객체 문자열/ISO 등 어떤 형식으로 줘도 처리)
function fmtBookmarkDate(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  let y, m, d;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    y = iso[1]; m = iso[2]; d = iso[3];
  } else {
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return s;
    y = String(dt.getFullYear());
    m = String(dt.getMonth() + 1).padStart(2, "0");
    d = String(dt.getDate()).padStart(2, "0");
  }
  return `${y.slice(2)}.${m}.${d}`;
}

// ── 북마크 카드의 폴더 이동 버튼 + 드롭다운 (북마크 탭에서 사용) ──
function FolderMoveButton({ currentFolder, folders, onMove }) {
  const [open, setOpen] = useState(false);
  const targets = (folders || []).filter((f) => f !== (currentFolder || "기본"));
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex-shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-500 dark:text-[#757d8d] dark:hover:bg-[#2b3242] dark:hover:text-indigo-300"
        aria-label="폴더 이동"
        title="다른 폴더로 이동"
      >
        <FolderInput className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-[#363d4d] dark:bg-[#232936]">
            <p className="border-b border-slate-100 px-3 py-2 text-[11px] font-medium text-slate-400 dark:border-[#2b3242] dark:text-[#757d8d]">이동할 폴더 선택</p>
            <div className="max-h-48 overflow-y-auto py-1">
              {targets.length > 0 ? (
                targets.map((f) => (
                  <button
                    key={f}
                    onClick={() => { onMove(f); setOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-700 transition hover:bg-indigo-50 dark:text-[#c0c7d2] dark:hover:bg-indigo-500/15"
                  >
                    <Folder className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-[#757d8d]" />
                    <span className="flex-1 truncate">{f}</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-[12px] text-slate-400 dark:text-[#757d8d]">이동할 다른 폴더가 없습니다</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 북마크 항목의 개인 메모 표시·편집 (북마크 탭에서 사용) ──
function BookmarkMemoEditor({ memo, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memo || "");
  function save() {
    onSave((draft || "").trim());
    setEditing(false);
  }
  if (editing) {
    return (
      <div className="mt-2 flex items-start gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); if (e.key === "Escape") { setDraft(memo || ""); setEditing(false); } }}
          rows={2}
          autoFocus
          placeholder="개인 메모 (나만 봅니다)"
          className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-[#303845] outline-none placeholder:text-slate-300 focus:border-indigo-400 dark:border-[#363d4d] dark:bg-[#1a1f2b] dark:text-[#cbd2dc] dark:placeholder:text-[#757d8d]"
        />
        <div className="flex flex-col gap-1">
          <button onClick={save} className="rounded bg-indigo-600 px-2 py-1 text-[11px] text-white hover:bg-indigo-700">저장</button>
          <button onClick={() => { setDraft(memo || ""); setEditing(false); }} className="rounded px-2 py-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-[#c0c7d2]">취소</button>
        </div>
      </div>
    );
  }
  if (memo && memo.trim()) {
    return (
      <div
        onClick={() => { setDraft(memo); setEditing(true); }}
        className="mt-2 flex cursor-pointer items-start gap-1.5 rounded-lg bg-amber-50/60 px-2.5 py-1.5 text-[13px] text-[#5c5138] transition hover:bg-amber-50 dark:bg-amber-500/10 dark:text-amber-200/90 dark:hover:bg-amber-500/15"
        title="클릭하여 메모 수정"
      >
        <StickyNote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500 dark:text-amber-400" />
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{memo}</span>
        <Pencil className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-400/70" />
      </div>
    );
  }
  return (
    <button
      onClick={() => { setDraft(""); setEditing(true); }}
      className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-500 dark:text-[#757d8d] dark:hover:text-indigo-300"
    >
      <StickyNote className="h-3 w-3" />메모 추가
    </button>
  );
}

function BookmarksView({ bookmarks, folders, onRemove, onJump, onCreateFolder, onDeleteFolder, onRenameFolder, onUpdateMemo, onMoveFolder }) {
  // 폴더별로 북마크 묶기. 기본 선택은 첫 번째 실제 폴더.
  const foldersInUse = [...new Set(bookmarks.map((b) => b.folder || "기본"))];
  const folderTabs = [...new Set([...(folders || []), ...foldersInUse])];
  const [selFolder, setSelFolder] = useState(folderTabs[0] || "기본");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState(null);
  const [editName, setEditName] = useState("");

  function submitNewFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    onCreateFolder && onCreateFolder(name);
    setNewFolderName("");
    setCreatingFolder(false);
    setSelFolder(name);
  }

  function startEdit(f) { setEditingFolder(f); setEditName(f); }
  function submitEdit() {
    const from = editingFolder;
    const to = editName.trim();
    if (from && to && from !== to) {
      onRenameFolder && onRenameFolder(from, to);
      if (selFolder === from) setSelFolder(to);
    }
    setEditingFolder(null); setEditName("");
  }
  function cancelEdit() { setEditingFolder(null); setEditName(""); }

  // 선택된 폴더가 목록에서 사라지면 첫 폴더로 보정
  useEffect(() => {
    if (folderTabs.length > 0 && !folderTabs.includes(selFolder)) {
      setSelFolder(folderTabs[0]);
    }
  }, [folderTabs.join("|")]);

  const shown = bookmarks.filter((b) => (b.folder || "기본") === selFolder);

  // 날짜 최신순 정렬
  const sorted = [...shown].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // 폴더별 개수
  const countByFolder = {};
  bookmarks.forEach((b) => { const f = b.folder || "기본"; countByFolder[f] = (countByFolder[f] || 0) + 1; });

  return (
    <main className="min-w-0 flex-1 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-[#303845] dark:text-[#cbd2dc] sm:text-2xl">
          <Bookmark className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />북마크
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-[#a5adba]">모든 날짜의 북마크를 폴더별로 모아 봅니다 · 팀원들과 공유됩니다</p>
      </div>

      {/* 폴더 탭 + 폴더 만들기 (북마크가 없어도 폴더는 만들 수 있도록 항상 표시) */}
      <div className="flex flex-wrap items-center gap-2">
        {folderTabs.map((f) => (
          editingFolder === f ? (
            <div key={f} className="flex items-center gap-1">
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                onBlur={submitEdit}
                className="w-28 rounded-lg border border-indigo-400 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-indigo-400 dark:bg-[#1a1f2b] dark:text-[#cbd2dc]"
              />
            </div>
          ) : (
            <div
              key={f}
              onDoubleClick={() => startEdit(f)}
              title="더블클릭하면 폴더명을 수정할 수 있어요"
              className={`group flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                selFolder === f
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-[#363d4d] dark:bg-[#232936] dark:text-[#a5adba]"
              }`}
            >
              <button onClick={() => setSelFolder(f)} className="flex items-center gap-1.5">
                <Folder className="h-3.5 w-3.5" />
                {f}
                <span className={`tabular-nums ${selFolder === f ? "opacity-70" : "text-slate-400"}`}>
                  {countByFolder[f] || 0}
                </span>
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`'${f}' 폴더를 삭제할까요?\n이 폴더의 북마크(${countByFolder[f] || 0}개)도 함께 삭제됩니다.`)) {
                    onDeleteFolder && onDeleteFolder(f);
                  }
                }}
                className={`ml-0.5 rounded p-0.5 transition ${
                  selFolder === f
                    ? "text-white/60 hover:text-white dark:text-slate-900/50 dark:hover:text-slate-900"
                    : "text-slate-300 hover:text-rose-500 dark:text-[#757d8d] dark:hover:text-rose-400"
                }`}
                aria-label={`${f} 폴더 삭제`}
                title="폴더 삭제"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        ))}

        {/* 새 폴더 만들기 */}
        {creatingFolder ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewFolder();
                if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
              }}
              placeholder="폴더 이름"
              className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-[#363d4d] dark:bg-[#1a1f2b] dark:text-[#cbd2dc]"
            />
            <button
              onClick={submitNewFolder}
              disabled={!newFolderName.trim()}
              className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
            >추가</button>
            <button
              onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}
              className="rounded-lg px-1.5 py-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >취소</button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingFolder(true)}
            className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-[#363d4d] dark:text-[#a5adba] dark:hover:border-indigo-400 dark:hover:text-indigo-300"
          >
            <FolderPlus className="h-3.5 w-3.5" />폴더 만들기
          </button>
        )}
      </div>

      {bookmarks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-[#2b3242] dark:bg-[#232936]">
          <Bookmark className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-[#6b7280]" />
          <p className="text-sm text-slate-400">아직 북마크가 없습니다.<br />데일리 인사이트에서 북마크 아이콘을 눌러 저장해보세요.</p>
        </div>
      ) : (
        <>

          {/* 북마크 목록 */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[#2b3242] dark:bg-[#232936]">
            <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {sorted.map((b, i) => (
                <div key={b.commentId + "_" + i} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="flex flex-shrink-0 flex-col items-center gap-1 pt-0.5">
                    <span className="text-xs tabular-nums text-slate-400">{fmtBookmarkDate(b.date)}</span>
                    <span className="flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                      <Folder className="h-2.5 w-2.5" />{b.folder || "기본"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {b.topic && (
                      <span className="mb-1 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-[#2b3242] dark:text-[#a5adba]">{b.topic}</span>
                    )}
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-[#c0c7d2]">{b.text}</p>
                    {b.date && (
                      <button
                        onClick={() => onJump && onJump(b.date)}
                        className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-slate-400 underline decoration-dotted hover:text-indigo-500 dark:hover:text-indigo-400"
                      >
                        원문으로 이동 <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                    <BookmarkMemoEditor
                      memo={b.memo || ""}
                      onSave={(newMemo) => onUpdateMemo && onUpdateMemo(b.commentId, b.folder || "기본", newMemo)}
                    />
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-0.5">
                    <FolderMoveButton
                      currentFolder={b.folder || "기본"}
                      folders={folders}
                      onMove={(target) => onMoveFolder && onMoveFolder(b, target)}
                    />
                    <button
                      onClick={() => onRemove && onRemove(b.commentId, b.folder)}
                      className="flex-shrink-0 rounded-md p-1.5 text-indigo-500 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/15"
                      aria-label="북마크 해제"
                      title="북마크 해제"
                    >
                      <BookmarkCheck className="h-4 w-4 fill-current" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <footer className="pt-2 text-center text-[11px] text-slate-400">
        Wisebirds · 메리츠증권 뉴스 인텔리전스
      </footer>
    </main>
  );
}

// ── 피드백 스레드: 항목에 붙는 말풍선 아이콘 + 클릭 시 펼쳐지는 피드백 입력·목록 ──
// 평소엔 말풍선 아이콘만. 클릭하면 입력창 + 팀원 피드백 목록이 펼쳐진다.
// 본인(myBrowserId 일치)이 남긴 피드백에는 수정·삭제 버튼이 보인다.
function FeedbackThread({ item, feedbackList, myBrowserId, onAdd, onUpdate, onRemove }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editDraft, setEditDraft] = useState("");

  // 이 항목(commentId)에 달린 피드백만 필터 (작성시각 오름차순)
  const items = (feedbackList || [])
    .filter((f) => f.commentId === item.commentId)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const count = items.length;

  function submitNew() {
    const t = draft.trim();
    if (!t) return;
    onAdd(item, t);
    setDraft("");
  }
  function submitEdit(rowKey) {
    const t = editDraft.trim();
    if (!t) return;
    onUpdate(rowKey, t);
    setEditingKey(null);
    setEditDraft("");
  }

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
          count > 0
            ? "border-indigo-200 text-indigo-500 hover:text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-300"
            : "border-slate-200 text-slate-400 hover:border-indigo-200 hover:text-indigo-500 dark:border-[#363d4d] dark:text-[#8b93a3] dark:hover:text-indigo-300"
        }`}
        aria-label="피드백"
        title="이 항목에 피드백 남기기 (AI 개선에 반영됩니다)"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        피드백
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#363d4d] dark:bg-[#1a1f2b]">
          {/* 안내 */}
          <p className="mb-2 text-[11px] text-slate-400 dark:text-[#757d8d]">
            남긴 피드백은 AI가 다음 리포트 품질을 개선하는 데 참고합니다. 팀원 모두에게 보입니다.
          </p>

          {/* 기존 피드백 목록 */}
          {items.length > 0 && (
            <div className="mb-2 space-y-2">
              {items.map((f) => {
                const mine = myBrowserId && f.browserId === myBrowserId;
                const editing = editingKey === f.rowKey;
                return (
                  <div key={f.rowKey} className="rounded-md bg-white px-2.5 py-2 text-[13px] dark:bg-[#232936]">
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">{f.author || "익명"}</span>
                      <span className="text-[10px] text-slate-400 dark:text-[#757d8d]">{(f.time || "").slice(5, 16)}</span>
                      {mine && !editing && (
                        <span className="ml-auto flex items-center gap-1">
                          <button onClick={() => { setEditingKey(f.rowKey); setEditDraft(f.feedback); }} className="text-slate-400 hover:text-indigo-500 dark:text-[#757d8d] dark:hover:text-indigo-300" aria-label="수정"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => { if (confirm("이 피드백을 삭제할까요?")) onRemove(f.rowKey); }} className="text-slate-400 hover:text-rose-500 dark:text-[#757d8d] dark:hover:text-rose-400" aria-label="삭제"><Trash2 className="h-3 w-3" /></button>
                        </span>
                      )}
                    </div>
                    {editing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") submitEdit(f.rowKey); if (e.key === "Escape") { setEditingKey(null); setEditDraft(""); } }}
                          className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[13px] text-[#303845] outline-none focus:border-indigo-400 dark:border-[#363d4d] dark:bg-[#1a1f2b] dark:text-[#cbd2dc]"
                          autoFocus
                        />
                        <button onClick={() => submitEdit(f.rowKey)} className="rounded bg-indigo-600 px-2 py-1 text-[11px] text-white hover:bg-indigo-700">저장</button>
                        <button onClick={() => { setEditingKey(null); setEditDraft(""); }} className="rounded px-1.5 py-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-[#c0c7d2]">취소</button>
                      </div>
                    ) : (
                      <p className="text-[#303845] dark:text-[#c0c7d2]">{f.feedback}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 새 피드백 입력 */}
          <div className="flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
              placeholder="이 인사이트에 대한 피드백을 남겨주세요"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-[#303845] outline-none placeholder:text-slate-300 focus:border-indigo-400 dark:border-[#363d4d] dark:bg-[#232936] dark:text-[#cbd2dc] dark:placeholder:text-[#757d8d]"
            />
            <button onClick={submitNew} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-700" aria-label="피드백 등록">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DailyView({ date, setDate, dailyData, dailyDays, loading, bookmarkedByMe, onRequestBookmark, competitors = [], selCompetitor, onSelectCompetitor, feedbackList = [], myBrowserId, onAddFeedback, onUpdateFeedback, onRemoveFeedback }) {
  const report = dailyData[date];

  // ── 월/주차 필터 ──
  // dailyDays: [{d:"2026-07-01", w:"수"}, ...] (오름차순)
  // 각 날짜에서 "월"과 "주차"(그 달의 몇째 주)를 계산
  const withMeta = dailyDays.map((day) => {
    const dt = new Date(day.d);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    // 그 달의 몇째 주인지 (1일이 속한 주를 1주차로, 월요일 시작 기준)
    // getDay(): 0=일 ~ 6=토 → 월요일 시작 오프셋으로 변환 (월=0 ~ 일=6)
    const rawFirst = new Date(y, dt.getMonth(), 1).getDay();
    const firstDayMon = (rawFirst + 6) % 7;
    const week = Math.ceil((dt.getDate() + firstDayMon) / 7);
    return { ...day, ym: `${y}-${String(m).padStart(2, "0")}`, ymLabel: `${y}년 ${m}월`, week };
  });

  // 월 목록 (중복 제거, 오름차순)
  const months = [...new Set(withMeta.map((x) => x.ym))].sort();
  const [selMonth, setSelMonth] = useState(months.length ? months[months.length - 1] : "");
  const effectiveMonth = months.includes(selMonth) ? selMonth : (months[months.length - 1] || "");

  // 선택된 월의 주차 목록
  const weeksInMonth = [...new Set(withMeta.filter((x) => x.ym === effectiveMonth).map((x) => x.week))].sort((a, b) => a - b);
  // 기본값은 "auto" — 사용자가 아직 주차를 직접 고르지 않은 상태.
  // auto이면 그 달의 최신(마지막) 주차를 자동 선택. 사용자가 고르면 그 값을 따름.
  const [selWeek, setSelWeek] = useState("auto");
  const latestWeek = weeksInMonth.length ? weeksInMonth[weeksInMonth.length - 1] : "all";
  const effectiveWeek =
    selWeek === "auto" ? latestWeek
    : selWeek === "all" ? "all"
    : weeksInMonth.includes(selWeek) ? selWeek
    : latestWeek;

  // 필터 적용된 날짜 목록
  const filteredDays = withMeta.filter(
    (x) => x.ym === effectiveMonth && (effectiveWeek === "all" || x.week === effectiveWeek)
  );

  const monthLabel = withMeta.find((x) => x.ym === effectiveMonth)?.ymLabel || effectiveMonth;

  // topics 정규화
  const TOPIC_ORDER = ["금융 상품·이벤트 관련", "금융 앱 기능·서비스 관련", "금융 커뮤니티·핀테크 관련"];
  const normalizedTopics = report
    ? Array.isArray(report.topics)
      ? report.topics
      : TOPIC_ORDER
          .filter((name) => report.topics && report.topics[name])
          .map((name) => ({ label: name, ...report.topics[name] }))
    : [];

  // 경쟁사 슬라이서 필터: 선택된 경쟁사의 별칭 중 하나라도 문장/관점에 포함되면 매칭.
  // 매칭 문장이 없는 주제는 숨김. 선택 없으면(null) 전체 표시. selCompetitor = { name, aliases:[...] }.
  // 공백은 있든 없든 같은 것으로 취급 ("네이버증권" 별칭 하나로 "네이버 증권" 표기도 함께 매칭됨).
  function normSpace(x) {
    return String(x).replace(/\s+/g, "");
  }
  function matchCompetitor(text, comp) {
    if (!text || !comp) return false;
    const t = normSpace(text);
    const aliases = (comp.aliases && comp.aliases.length > 0) ? comp.aliases : [comp.name];
    return aliases.some((a) => a && t.indexOf(normSpace(a)) >= 0);
  }
  const displayTopics = selCompetitor
    ? normalizedTopics
        .map((tp) => {
          const pts = (tp.points || []).filter(
            (pt) => matchCompetitor(pt.summary, selCompetitor) || matchCompetitor(pt.persp, selCompetitor)
          );
          const perspHit = matchCompetitor(tp.persp, selCompetitor);
          return { ...tp, points: pts, _perspHit: perspHit };
        })
        .filter((tp) => (tp.points && tp.points.length > 0) || tp._perspHit)
    : normalizedTopics;

  const displayKeywords = report && selCompetitor
    ? (report.keywords || []).filter((k) => matchCompetitor(k.title, selCompetitor) || matchCompetitor(k.desc, selCompetitor))
    : (report ? report.keywords : []);

  return (
    <main className="min-w-0 flex-1 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#303845] dark:text-[#cbd2dc] sm:text-2xl">데일리 마케팅 인사이트</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-[#a5adba]">자사와 경쟁사 11곳의 핵심 뉴스를 AI가 선별·요약해 마케팅 관점으로 정리합니다</p>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-[#8b93a3]">다시 보고 싶은 인사이트는 북마크해두세요 — 폴더로 모아 보고, 주간 인사이트에도 우선 반영됩니다</p>
      </div>


      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-400 dark:border-[#2b3242] dark:bg-[#232936]">
          데이터를 불러오는 중…
        </div>
      )}

      {/* 월/주차 필터 + 날짜 목록 (한 줄) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {/* 월 선택 */}
        <div className="relative flex-shrink-0">
          <select
            value={effectiveMonth}
            onChange={(e) => { setSelMonth(e.target.value); setSelWeek("all"); }}
            className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-7 text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-[#363d4d] dark:bg-[#232936] dark:text-[#c0c7d2]"
          >
            {months.map((m) => {
              const lbl = withMeta.find((x) => x.ym === m)?.ymLabel || m;
              return <option key={m} value={m}>{lbl}</option>;
            })}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </div>

        {/* 주차 선택 */}
        <div className="relative flex-shrink-0">
          <select
            value={effectiveWeek}
            onChange={(e) => setSelWeek(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-7 text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-[#363d4d] dark:bg-[#232936] dark:text-[#c0c7d2]"
          >
            <option value="all">전체 주차</option>
            {weeksInMonth.map((w) => (
              <option key={w} value={w}>{w}주차</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </div>

        {/* 구분선 */}
        <div className="h-8 w-px flex-shrink-0 bg-slate-200 dark:bg-[#2b3242]" />

        {/* 날짜 목록 (오름차순) */}
        {filteredDays.length === 0 ? (
          <span className="flex-shrink-0 px-2 text-xs text-slate-400">해당 기간 데이터 없음</span>
        ) : (
          filteredDays.map((day) => (
            <button
              key={day.d}
              onClick={() => setDate(day.d)}
              className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-center text-xs transition ${
                date === day.d
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-[#363d4d] dark:bg-[#232936] dark:text-[#a5adba]"
              }`}
            >
              <div className="text-[10px] opacity-70">{day.w}</div>
              <div className="font-medium">{day.d.slice(5)}</div>
            </button>
          ))
        )}
      </div>

      {/* 증권사(경쟁사) 필터 - 날짜 필터 바로 아래 두 번째 줄, 가로 칩 형태(2026-08-11:
          예전엔 왼쪽 세로 사이드바였는데 ad-ref 레이아웃에 맞춰 두 줄 구조로 변경) */}
      {competitors && competitors.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <Filter className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          <button
            onClick={() => onSelectCompetitor(null)}
            className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
              !selCompetitor
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 text-slate-500 hover:border-slate-300 dark:border-[#363d4d] dark:text-[#a5adba]"
            }`}
          >전체 보기</button>
          {competitors.map((c) => {
            const active = selCompetitor && selCompetitor.name === c.name;
            return (
              <button
                key={c.name}
                onClick={() => onSelectCompetitor(active ? null : c)}
                className={`flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "border border-slate-200 text-slate-500 hover:border-slate-300 dark:border-[#363d4d] dark:text-[#a5adba]"
                }`}
              >
                <span>{c.name}</span>
                {c.name === "메리츠증권" && (
                  <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${active ? "bg-white/20" : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"}`}>client</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {report ? (
        <>
          {/* 핵심 키워드 TOP3 */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[#2b3242] dark:bg-[#232936]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-[#2b3242]">
              <Hash className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-bold text-[#303845] dark:text-[#cbd2dc]">핵심 키워드 TOP 3</h2>
              <span className="ml-auto text-xs text-slate-400">{date} {report.weekday}</span>
            </div>
            <div className="space-y-2 p-5">
              {displayKeywords.map((k, i) => (
                <div key={i} className="text-sm leading-relaxed">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">{i + 1}. {renderWithParens(k.title)}</span>
                  <span className="text-slate-500 dark:text-[#a5adba]"> — {renderWithParens(k.desc)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 주제별 하이라이트 (고정 4개 주제) */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[#2b3242] dark:bg-[#232936]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-[#2b3242]">
              <ListChecks className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-bold text-[#303845] dark:text-[#cbd2dc]">주제별 하이라이트 요약</h2>
              <span className="ml-auto text-xs text-slate-400">주제별 기사 · 우리 앱 관점</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {selCompetitor && displayTopics.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  '{selCompetitor.name}' 관련 기사·관점이 이 날짜에는 없습니다.
                </div>
              )}
              {displayTopics.map((tp, ti) => {
                const points = tp.points || [];
                const isEmpty = points.length === 0;
                return (
                  <div key={ti} className="p-5">
                    <span className="mb-2 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-[#2b3242] dark:text-[#a5adba]">{tp.label}</span>
                    {isEmpty ? (
                      <p className="text-sm text-slate-400">해당 없음</p>
                    ) : (
                      <>
                        {/* 요약 문장 + 기사 링크 + (새 구조) 문장별 우리 앱 관점 */}
                        <div className="space-y-3">
                          {points.map((pt, pi) => {
                            const commentId = `${date}_${tp.label}_${pi}`; // 문장별 북마크 ID
                            const bmFolders = (bookmarkedByMe && bookmarkedByMe[commentId]) || [];
                            const bookmarked = bmFolders.length > 0;
                            return (
                              <div key={pi}>
                                <div className="flex gap-1.5 text-sm leading-relaxed text-[#303845] dark:text-[#cbd2dc]">
                                  <span className="flex-shrink-0 text-slate-400">{circledNum(pi)}</span>
                                  <span>
                                    {renderWithCaption(pt.summary)}
                                    {(pt.links || []).map((url, li) => (
                                      <a
                                        key={li}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-1 inline-flex translate-y-0.5 text-slate-300 hover:text-indigo-600 dark:text-[#757d8d] dark:hover:text-indigo-400"
                                        aria-label="관련 기사"
                                      >
                                        <Link2 className="inline h-3.5 w-3.5" />
                                      </a>
                                    ))}
                                  </span>
                                </div>
                                {/* 이 문장에 대한 우리 앱 관점 (새 구조) — 라벨·박스 없이 들여쓰기+은은한 색으로 */}
                                {pt.persp && (
                                  <div className="ml-5 mt-1 flex items-start justify-between gap-2 text-[13px] leading-relaxed text-indigo-700/80 dark:text-indigo-300/80">
                                    <div className="min-w-0 flex-1">
                                      <span className="mr-1 text-indigo-500 dark:text-indigo-400">→</span>{stripTermExplanations(pt.persp)}
                                    </div>
                                    <button
                                      onClick={() => onRequestBookmark && onRequestBookmark({ commentId, date, topic: tp.label, text: stripTermExplanations(pt.persp) })}
                                      className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                                        bookmarked
                                          ? "border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300"
                                          : "border-slate-200 text-slate-400 hover:border-indigo-200 hover:text-indigo-500 dark:border-[#363d4d] dark:text-[#8b93a3] dark:hover:text-indigo-300"
                                      }`}
                                      aria-label="이 관점 북마크"
                                      title={bookmarked ? `북마크됨 · ${bmFolders.join(", ")} (누르면 폴더 관리)` : "다시 보고 싶은 인사이트를 북마크하세요"}
                                    >
                                      {bookmarked ? <BookmarkCheck className="h-3.5 w-3.5 fill-current" /> : <Bookmark className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
                                )}
                                {pt.persp && (
                                  <div className="ml-5">
                                    <FeedbackThread
                                      item={{ commentId, date, topic: tp.label, text: stripTermExplanations(pt.persp) }}
                                      feedbackList={feedbackList}
                                      myBrowserId={myBrowserId}
                                      onAdd={onAddFeedback}
                                      onUpdate={onUpdateFeedback}
                                      onRemove={onRemoveFeedback}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* (옛 구조 하위호환) 문장별 관점이 하나도 없고 주제 종합 관점만 있으면 기존 박스로 */}
                        {!points.some((pt) => pt.persp) && tp.persp && (() => {
                          const commentId = `${date}_${tp.label}`;
                          const bmFolders = (bookmarkedByMe && bookmarkedByMe[commentId]) || [];
                          const bookmarked = bmFolders.length > 0;
                          return (
                            <div className="mt-2.5 rounded-r-lg border-l-[3px] border-indigo-600 bg-indigo-50/70 px-3 py-2 text-[13px] leading-relaxed text-slate-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-[#c0c7d2]">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">▶ 우리 앱 관점</span> · {renderWithParens(tp.persp)}
                                </div>
                                <button
                                  onClick={() => onRequestBookmark && onRequestBookmark({ commentId, date, topic: tp.label, text: stripTermExplanations(tp.persp) })}
                                  className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs transition ${
                                    bookmarked
                                      ? "border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300"
                                      : "border-slate-200 text-slate-400 hover:border-indigo-200 hover:text-indigo-500 dark:border-[#363d4d] dark:text-[#8b93a3] dark:hover:text-indigo-300"
                                  }`}
                                  aria-label="이 관점 북마크"
                                  title={bookmarked ? `북마크됨 · ${bmFolders.join(", ")} (누르면 폴더 관리)` : "다시 보고 싶은 인사이트를 북마크하세요"}
                                >
                                  {bookmarked ? <BookmarkCheck className="h-3.5 w-3.5 fill-current" /> : <Bookmark className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                              <FeedbackThread
                                item={{ commentId, date, topic: tp.label, text: stripTermExplanations(tp.persp) }}
                                feedbackList={feedbackList}
                                myBrowserId={myBrowserId}
                                onAdd={onAddFeedback}
                                onUpdate={onUpdateFeedback}
                                onRemove={onRemoveFeedback}
                              />
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-[#2b3242] dark:bg-[#232936]">
          <p className="text-sm text-slate-400">{date} 리포트는 준비 중입니다.<br />실제 데이터는 DB 연결 후 표시됩니다.</p>
        </div>
      )}

      <footer className="pt-2 text-center text-[11px] text-slate-400">
        Wisebirds · 메리츠증권 뉴스 인텔리전스 · 매일 05시 자동 업데이트
      </footer>
    </main>
  );
}

// view/onViewChange: ad-ref 사이드바(데일리 뉴스/주간 인사이트/북마크)가 바깥에서 이 탭을
// 조종한다(2026-08-11) - 예전엔 이 컴포넌트 자체 헤더에 탭 버튼이 있었지만 제거했고, 대신
// 부모가 넘겨준 view를 내부 state에 동기화한다. 다크모드도 이 컴포넌트 자체 토글을 없애고
// ad-ref 전체 테마(ThemeProvider)를 그대로 따르게 했다 - Tailwind dark: 클래스가
// globals.css의 @custom-variant 설정으로 <html data-theme="dark">를 그대로 인식함.
export default function NewsClippingDashboard({ view: viewProp, onViewChange }) {
  const [perspectiveFilter, setPerspectiveFilter] = useState("opp");
  const [period, setPeriod] = useState("2026-W26");
  const [selWeekMonth, setSelWeekMonth] = useState(null); // null=auto(최신 달), 주간 뷰의 월 필터
  const [activeSection, setActiveSection] = useState("insight");
  const [view, setViewState] = useState(viewProp || "daily");
  useEffect(() => {
    if (viewProp && viewProp !== view) setViewState(viewProp);
  }, [viewProp]);
  const setView = (v) => {
    setViewState(v);
    if (onViewChange) onViewChange(v);
  };
  const [dailyDate, setDailyDate] = useState("06.27");
  const [remoteDaily, setRemoteDaily] = useState(null); // API에서 받은 데이터 (null이면 아직/미설정)
  const [dailyLoading, setDailyLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(""); // 통합 검색어
  const [returnToSearch, setReturnToSearch] = useState(null); // 검색결과에서 점프한 경우, 돌아갈 검색어를 기억
  const [returnPulse, setReturnPulse] = useState(false); // 돌아가기 버튼 등장 시 잠깐만 반짝이게
  const [searchSort, setSearchSort] = useState("desc"); // 검색결과 날짜 정렬 (desc=최신순, asc=오래된순)

  // ── 브라우저 로컬 상태 저장 (좋아요 + 접속자 정체성을 하나의 저장소로 통합) ──
  // window.name에 JSON 하나로 합쳐 저장 (따로따로 저장하면 서로 덮어써버리는 문제 방지)
  function loadLocalState() {
    try {
      if (window.name && window.name.indexOf("MERITZ_STATE:") === 0) {
        return JSON.parse(window.name.slice("MERITZ_STATE:".length));
      }
    } catch (e) { /* 무시 */ }
    return {};
  }
  function saveLocalState(partial) {
    const next = { ...loadLocalState(), ...partial };
    try { window.name = "MERITZ_STATE:" + JSON.stringify(next); } catch (e) { /* 무시 */ }
    return next;
  }

  // ── 북마크 상태 ──
  // bookmarkedByMe: { commentId: [폴더명, ...] }  (이 브라우저에서 북마크한 것 + 어느 폴더들에 넣었는지)
  // allBookmarks: [{ commentId, folder, date, topic, text }]  (서버의 전체 북마크 — 북마크 탭에서 사용)
  // folders: [폴더명, ...]  (서버에 등록된 전체 폴더 목록 — 공유됨)
  const [bookmarkedByMe, setBookmarkedByMe] = useState({});
  const [allBookmarks, setAllBookmarks] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]); // 항목별 피드백 코멘트 (팀 공유)
  const [folders, setFolders] = useState([]);
  const [competitors, setCompetitors] = useState(SAMPLE_COMPETITORS); // 슬라이서용 경쟁사 목록 (시트 기반, API 연결 전엔 샘플로 대체)
  const [selCompetitor, setSelCompetitor] = useState(null); // 선택된 경쟁사(null=전체)

  // 폴더 선택 팝업 상태 (북마크 누를 때 뜸)
  // pendingBookmark: { commentId, date, topic, text } — 저장 대기 중인 북마크 정보
  const [pendingBookmark, setPendingBookmark] = useState(null);

  // ── 접속자 표시(누가 함께 보고 있는지) 상태 ──
  const [myIdentity, setMyIdentity] = useState(null); // { browserId, name, isAnonymous, color }
  const [activeUsers, setActiveUsers] = useState([]); // [{ name, isAnonymous, color }, ...]

  // 최초 로드: 저장된 좋아요·정체성 복원, 없으면 이름 입력 팝업 띄우기
  useEffect(() => {
    const saved = loadLocalState();
    if (saved.bookmarks) {
      // 구버전(문자열) 저장값 호환: { id: "폴더" } → { id: ["폴더"] }
      const norm = {};
      Object.keys(saved.bookmarks).forEach((k) => {
        const v = saved.bookmarks[k];
        norm[k] = Array.isArray(v) ? v : (v ? [v] : []);
      });
      setBookmarkedByMe(norm);
    }
    if (saved.identity && saved.identity.browserId) {
      setMyIdentity(saved.identity);
    } else {
      // 처음 방문 → browserId만 만들어 바로 익명으로 시작 (이름은 묻지 않음, 서버가 동물 이름 배정)
      const browserId = (crypto.randomUUID ? crypto.randomUUID() : "b_" + Date.now() + "_" + Math.random().toString(36).slice(2));
      const pending = { browserId, name: "", isAnonymous: true, color: "" };
      saveLocalState({ identity: pending });
      setMyIdentity(pending);
    }
  }, []);

  function persistBookmarks(next) {
    saveLocalState({ bookmarks: next });
  }

  // "나 아직 여기 있어요" 신호 전송 (이름 있으면 함께 실어 보냄)
  function sendHeartbeat(nameOverride) {
    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    if (!myIdentity || !myIdentity.browserId) return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "heartbeat",
        browserId: myIdentity.browserId,
        name: nameOverride !== undefined ? nameOverride : (myIdentity.isAnonymous ? "" : myIdentity.name),
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res || res.error) return;
        const nextIdentity = { browserId: myIdentity.browserId, name: res.name, isAnonymous: res.isAnonymous, color: res.color };
        setMyIdentity(nextIdentity);
        saveLocalState({ identity: nextIdentity });
        if (Array.isArray(res.activeUsers)) setActiveUsers(res.activeUsers);
      })
      .catch((e) => console.error("접속 신호 전송 실패:", e));
  }

  // 30초마다 반복 전송 (창을 닫으면 자연히 멈춤 → 목록에서 90초 뒤 자동 제외됨)
  useEffect(() => {
    if (!myIdentity) return;
    sendHeartbeat(); // 최초 1회 즉시
    const t = setInterval(() => sendHeartbeat(), 30000);
    return () => clearInterval(t);
  }, [myIdentity && myIdentity.browserId]);

  // 북마크 아이콘 클릭 → 폴더 선택 팝업 띄움 (이미 담긴 폴더는 팝업에서 다시 누르면 해제)
  // item: { commentId, date, topic, text }
  function requestBookmark(item) {
    setPendingBookmark(item);
  }

  // 폴더를 골라(또는 새로 만들어) 북마크 확정 저장.
  // 같은 문장을 여러 폴더에 담을 수 있음. 이미 담긴 폴더를 다시 고르면 그 폴더에서만 해제.
  function confirmBookmark(folder, memo) {
    if (!pendingBookmark) return;
    const item = pendingBookmark;
    const folderName = (folder || "").trim() || "기본";
    const memoText = (memo || "").trim();
    const cur = bookmarkedByMe[item.commentId] || [];
    const already = cur.includes(folderName);

    if (already) {
      // 이미 담긴 폴더를 다시 고른 경우: 메모가 있으면 메모만 갱신, 없으면 해제
      if (memoText) {
        setAllBookmarks((prev) => prev.map((b) =>
          (b.commentId === item.commentId && (b.folder || "기본") === folderName) ? { ...b, memo: memoText } : b
        ));
        if (API_URL && API_URL !== "여기에_웹앱_주소") {
          fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ type: "bookmark", action: "updateMemo", commentId: item.commentId, folder: folderName, memo: memoText }),
          }).then((r) => r.json()).catch((e) => console.error("메모 저장 실패:", e));
        }
        setPendingBookmark(null);
        return;
      }
      removeBookmark(item.commentId, folderName);
      setPendingBookmark(null);
      return;
    }

    const nextFolders = [...cur, folderName];
    const nextBm = { ...bookmarkedByMe, [item.commentId]: nextFolders };
    setBookmarkedByMe(nextBm);
    persistBookmarks(nextBm);
    setFolders((prev) => (prev.includes(folderName) ? prev : [...prev, folderName]));
    setAllBookmarks((prev) => {
      const dup = prev.some((b) => b.commentId === item.commentId && (b.folder || "기본") === folderName);
      if (dup) return prev;
      return [...prev, { commentId: item.commentId, folder: folderName, date: item.date, topic: item.topic, text: item.text, memo: memoText }];
    });
    setPendingBookmark(null);

    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "bookmark", action: "add",
        commentId: item.commentId, folder: folderName,
        date: item.date, topic: item.topic, text: item.text,
        browserId: myIdentity ? myIdentity.browserId : "",
        memo: memoText,
      }),
    })
      .then((r) => r.json())
      .catch((e) => console.error("북마크 저장 실패:", e));
  }

  // 북마크 해제. folder를 지정하면 그 폴더에서만, 없으면 모든 폴더에서 해제.
  function removeBookmark(commentId, folder) {
    const cur = bookmarkedByMe[commentId] || [];
    const nextBm = { ...bookmarkedByMe };
    if (folder) {
      const remain = cur.filter((f) => f !== folder);
      if (remain.length > 0) nextBm[commentId] = remain;
      else delete nextBm[commentId];
    } else {
      delete nextBm[commentId];
    }
    setBookmarkedByMe(nextBm);
    persistBookmarks(nextBm);
    setAllBookmarks((prev) => prev.filter((b) => {
      if (b.commentId !== commentId) return true;
      if (folder) return (b.folder || "기본") !== folder; // 그 폴더 항목만 제거
      return false; // 폴더 미지정 → 전체 제거
    }));

    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "bookmark", action: "remove",
        commentId, folder: folder || "",
        browserId: myIdentity ? myIdentity.browserId : "",
      }),
    })
      .then((r) => r.json())
      .catch((e) => console.error("북마크 해제 실패:", e));
  }

  // ── 피드백 코멘트 (항목별 공유 피드백, 제미나이 반영용) ──
  // 추가: 항목에 피드백을 남긴다. 낙관적 업데이트 후 서버 기록.
  function addFeedback(item, text) {
    const feedback = (text || "").trim();
    if (!feedback) return;
    const now = (() => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    })();
    const author = myIdentity && myIdentity.name ? myIdentity.name : "익명";
    const browserId = myIdentity ? myIdentity.browserId : "";
    const rowKey = item.commentId + "|" + now;
    const entry = {
      commentId: item.commentId, date: item.date || "", topic: item.topic || "", text: item.text || "",
      feedback, browserId, author, time: now, rowKey,
    };
    setFeedbackList((prev) => [...prev, entry]);

    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "comment", action: "add",
        commentId: item.commentId, date: item.date || "", topic: item.topic || "", text: item.text || "",
        feedback, browserId, animalName: author,
      }),
    }).then((r) => r.json()).catch((e) => console.error("피드백 저장 실패:", e));
  }

  // 수정: rowKey로 특정 피드백의 내용을 갱신
  function updateFeedback(rowKey, text) {
    const feedback = (text || "").trim();
    if (!feedback) return;
    setFeedbackList((prev) => prev.map((f) => (f.rowKey === rowKey ? { ...f, feedback } : f)));
    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "comment", action: "update", rowKey, feedback }),
    }).then((r) => r.json()).catch((e) => console.error("피드백 수정 실패:", e));
  }

  // 삭제: rowKey로 특정 피드백 제거
  function removeFeedback(rowKey) {
    setFeedbackList((prev) => prev.filter((f) => f.rowKey !== rowKey));
    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "comment", action: "remove", rowKey }),
    }).then((r) => r.json()).catch((e) => console.error("피드백 삭제 실패:", e));
  }

  // 북마크를 다른 폴더로 이동 (북마크 탭). 옛 폴더에서 제거 + 새 폴더로 추가(메모 유지).
  function moveBookmarkFolder(bookmark, targetFolder) {
    const fromFolder = bookmark.folder || "기본";
    const toFolder = (targetFolder || "").trim();
    if (!toFolder || toFolder === fromFolder) return;
    const memoText = bookmark.memo || "";
    setAllBookmarks((prev) => {
      const existsInTarget = prev.some((b) => b.commentId === bookmark.commentId && (b.folder || "기본") === toFolder);
      let next = prev.filter((b) => !(b.commentId === bookmark.commentId && (b.folder || "기본") === fromFolder));
      if (!existsInTarget) {
        next = [...next, { ...bookmark, folder: toFolder, memo: memoText }];
      } else if (memoText) {
        next = next.map((b) =>
          (b.commentId === bookmark.commentId && (b.folder || "기본") === toFolder) ? { ...b, memo: memoText } : b
        );
      }
      return next;
    });
    setBookmarkedByMe((prev) => {
      const cur = prev[bookmark.commentId] || [];
      const removed = cur.filter((x) => x !== fromFolder);
      const added = removed.includes(toFolder) ? removed : [...removed, toFolder];
      const next = { ...prev, [bookmark.commentId]: added };
      persistBookmarks(next);
      return next;
    });
    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "bookmark", action: "remove", commentId: bookmark.commentId, folder: fromFolder }),
    }).then((r) => r.json()).catch((e) => console.error("이동(제거) 실패:", e));
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "bookmark", action: "add",
        commentId: bookmark.commentId, folder: toFolder,
        date: bookmark.date, topic: bookmark.topic, text: bookmark.text,
        browserId: myIdentity ? myIdentity.browserId : "",
        memo: memoText,
      }),
    }).then((r) => r.json()).catch((e) => console.error("이동(추가) 실패:", e));
  }

  // 북마크 항목의 개인 메모 갱신 (북마크 탭에서 사용). 로컬 즉시 반영 + 서버 기록.
  function updateBookmarkMemo(commentId, folder, memo) {
    const memoText = (memo || "").trim();
    const folderName = folder || "기본";
    setAllBookmarks((prev) => prev.map((b) =>
      (b.commentId === commentId && (b.folder || "기본") === folderName) ? { ...b, memo: memoText } : b
    ));
    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "bookmark", action: "updateMemo", commentId, folder: folderName, memo: memoText }),
    }).then((r) => r.json()).catch((e) => console.error("메모 수정 실패:", e));
  }

  // 폴더 생성 (북마크 탭에서 직접). 서버에 등록하고 화면에 즉시 반영.
  function createFolder(name) {
    const folderName = (name || "").trim();
    if (!folderName) return;
    setFolders((prev) => (prev.includes(folderName) ? prev : [...prev, folderName]));

    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "folder", action: "create",
        folder: folderName,
        browserId: myIdentity ? myIdentity.browserId : "",
      }),
    })
      .then((r) => r.json())
      .catch((e) => console.error("폴더 생성 실패:", e));
  }

  // 폴더 삭제 (북마크 탭에서). 그 폴더의 북마크도 함께 사라짐.
  function deleteFolder(name) {
    const folderName = (name || "").trim();
    if (!folderName) return;
    // 화면 즉시 반영: 폴더 목록·전체 북마크·내 북마크에서 해당 폴더 제거
    setFolders((prev) => prev.filter((f) => f !== folderName));
    setAllBookmarks((prev) => prev.filter((b) => (b.folder || "기본") !== folderName));
    setBookmarkedByMe((prev) => {
      const next = {};
      Object.keys(prev).forEach((cid) => {
        const remain = (prev[cid] || []).filter((fd) => fd !== folderName);
        if (remain.length > 0) next[cid] = remain;
      });
      persistBookmarks(next);
      return next;
    });

    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "folder", action: "delete",
        folder: folderName,
        browserId: myIdentity ? myIdentity.browserId : "",
      }),
    })
      .then((r) => r.json())
      .catch((e) => console.error("폴더 삭제 실패:", e));
  }

  // 폴더명 변경 (북마크 탭에서 더블클릭 편집). 그 폴더의 북마크 폴더명도 함께 변경.
  function renameFolder(oldName, newName) {
    const from = (oldName || "").trim();
    const to = (newName || "").trim();
    if (!from || !to || from === to) return;
    // 화면 즉시 반영
    setFolders((prev) => {
      const next = prev.map((f) => (f === from ? to : f));
      return [...new Set(next)]; // 새 이름이 이미 있으면 병합(중복 제거)
    });
    setAllBookmarks((prev) => prev.map((b) => ((b.folder || "기본") === from ? { ...b, folder: to } : b)));
    setBookmarkedByMe((prev) => {
      const next = {};
      Object.keys(prev).forEach((cid) => {
        const arr = (prev[cid] || []).map((fd) => (fd === from ? to : fd));
        next[cid] = [...new Set(arr)];
      });
      persistBookmarks(next);
      return next;
    });

    if (!API_URL || API_URL === "여기에_웹앱_주소") return;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "folder", action: "rename",
        folder: from, newFolder: to,
        browserId: myIdentity ? myIdentity.browserId : "",
      }),
    })
      .then((r) => r.json())
      .catch((e) => console.error("폴더명 변경 실패:", e));
  }

  // API 주소가 설정돼 있으면 실제 데이터를 불러옴 (아니면 샘플 사용)
  useEffect(() => {
    if (!API_URL || API_URL === "여기에_웹앱_주소") return; // 미설정 → 샘플 유지
    setDailyLoading(true);
    fetchJsonp(API_URL)
      .then((json) => {
        if (json && json.daily) {
          setRemoteDaily(json);
          // 가장 최신 날짜를 기본 선택
          if (json.dailyList && json.dailyList.length > 0) {
            setDailyDate(json.dailyList[0]);
          }
          // 주간 데이터가 있으면 최신 주차를 기본 선택
          if (json.weeklyList && json.weeklyList.length > 0) {
            setPeriod(json.weeklyList[0]);
          }
          // 서버에 저장된 북마크·폴더 목록을 초기값으로
          if (Array.isArray(json.bookmarks)) {
            setAllBookmarks(json.bookmarks);
          }
          if (Array.isArray(json.folders)) {
            setFolders(json.folders);
          }
          if (Array.isArray(json.competitors)) {
            setCompetitors(json.competitors);
          }
          if (Array.isArray(json.feedback)) {
            setFeedbackList(json.feedback);
          }
        }
      })
      .catch((e) => console.error("데일리 데이터 로드 실패:", e))
      .finally(() => setDailyLoading(false));
  }, []);

  // ── 주간 데이터: API에 weekly가 있으면 사용, 없으면 샘플 ──
  const hasRemoteWeekly = remoteDaily && remoteDaily.weeklyList && remoteDaily.weeklyList.length > 0;
  // 선택된 주차 (기본: 최신). period 상태를 주차ID로 사용
  const weeklyPick = hasRemoteWeekly
    ? (remoteDaily.weekly[period] ? period : remoteDaily.weeklyList[0])
    : null;
  const weeklyReport = hasRemoteWeekly ? remoteDaily.weekly[weeklyPick] : null;

  // 주간 표시용 데이터 (실제 or 샘플)
  const wInsight = weeklyReport
    ? {
        week: weeklyReport.period,
        summary: weeklyReport.summary,
        conclusions: (weeklyReport.conclusions || []).map((c) => ({
          title: c.title, what: c.what, why: c.why, action: c.action, evidence: 0,
        })),
        watchNextWeek: weeklyReport.watchNextWeek,
      }
    : WEEKLY_INSIGHT;
  const wTopics = weeklyReport
    ? (weeklyReport.keywords || []).slice(0, 5).map((k, i) => ({
        rank: i + 1, topic: k.topic, mentions: k.mentions, insight: k.insight || "",
        article: { title: k.article, media: "", url: k.url },
      }))
    : TOPIC_TOP7;
  const wPerspectives = weeklyReport ? (weeklyReport.archive || []) : APP_PERSPECTIVES;
  // 실제 데이터가 있으면 그것을, 없으면 샘플을 사용
  const dailyData = remoteDaily ? remoteDaily.daily : DAILY_REPORTS;
  const dailyDays = remoteDaily
    ? remoteDaily.dailyList
        .slice()
        .sort() // 오름차순(오래된→최신)으로 정렬해 [화][수] 순서로 표시
        .map((d) => {
          // yyyy-MM-dd → 요일 계산
          const wk = ["일", "월", "화", "수", "목", "금", "토"][new Date(d).getDay()];
          return { d, w: wk };
        })
    : DAILY_DAYS;

  // 통합 검색 결과 (데일리 + 주간 전체에서)
  const searchResults = searchQuery.trim()
    ? buildSearchResults(searchQuery, dailyData, remoteDaily ? remoteDaily.weekly : {})
    : [];

  // 검색 결과 클릭 → 해당 화면(탭·날짜/주차)으로 이동. 돌아올 수 있게 검색어를 기억해둠.
  function jumpToResult(r) {
    setReturnToSearch(searchQuery.trim()); // 돌아갈 검색어 저장
    setReturnPulse(true); // 버튼 반짝임 시작
    setTimeout(() => setReturnPulse(false), 5000); // 5초 뒤 반짝임 멈춤
    setSearchQuery(""); // 검색 화면 닫기
    if (r.tab === "daily") {
      setView("daily");
      // 검색 결과의 date는 dailyData의 키(예: 2026-07-02)와 동일하므로 그대로 사용
      setDailyDate(r.date);
    } else {
      setView("weekly");
      if (r.weekId) setPeriod(r.weekId);
    }
  }

  // 주차 선택 드롭다운 목록 (실제 주간 데이터 or 샘플)
  const PERIODS = hasRemoteWeekly
    ? remoteDaily.weeklyList.map((id) => ({
        value: id,
        label: remoteDaily.weekly[id].period || id,
      }))
    : [
        { value: "2026-W26", label: "6월 4주차 (06.23–06.29)" },
        { value: "2026-W25", label: "6월 3주차 (06.16–06.22)" },
        { value: "2026-W24", label: "6월 2주차 (06.09–06.15)" },
        { value: "2026-W23", label: "6월 1주차 (06.02–06.08)" },
      ];

  // 주차 목록에 월 정보를 붙임 - 데일리 뷰처럼 "월 선택 → 그 달 주차만 칩으로" 구조를
  // 쓰기 위함(2026-08-11: 주차가 쌓일수록 한 줄에 다 나열하기 어려워짐). 실제 weekId는
  // "2026-08-03_주간"처럼 날짜로 시작해서 파싱 가능하지만, 샘플 데이터의 "2026-W26" 같은
  // 값은 날짜로 못 파싱되니 그런 경우는 전부 "전체"라는 가상의 달 하나로 묶는다.
  const weeksWithMonth = PERIODS.map((p) => {
    const dt = new Date(p.value.slice(0, 10));
    const valid = !isNaN(dt.getTime());
    return {
      ...p,
      ym: valid ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}` : "전체",
      ymLabel: valid ? `${dt.getFullYear()}년 ${dt.getMonth() + 1}월` : "전체",
    };
  });
  const weekMonths = [...new Set(weeksWithMonth.map((w) => w.ym))];
  const effectiveWeekMonth = weekMonths.includes(selWeekMonth) ? selWeekMonth : (weekMonths[0] || "전체");
  const filteredWeeks = weeksWithMonth.filter((w) => w.ym === effectiveWeekMonth);

  const TOC = [
    { id: "insight", label: "이번 주 핵심 결론" },
    { id: "topics", label: "화제 키워드 TOP 7" },
    { id: "archive", label: "우리 앱 관점 아카이브" },
  ];

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const handler = () => {
      const offsets = TOC.map((t) => {
        const el = document.getElementById(t.id);
        return { id: t.id, top: el ? el.getBoundingClientRect().top : Infinity };
      });
      const current = offsets.filter((o) => o.top <= 120).pop() || offsets[0];
      if (current) setActiveSection(current.id);
    };
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const perspectiveCounts = {
    opp: wPerspectives.filter((p) => p.type === "opp").length,
    threat: wPerspectives.filter((p) => p.type === "threat").length,
    note: wPerspectives.filter((p) => p.type === "note").length,
  };
  const shownPerspectives = wPerspectives.filter(
    (p) => perspectiveFilter === "all" || p.type === perspectiveFilter
  );

  const cardCls = "scroll-mt-20 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[#2b3242] dark:bg-[#232936]";
  const headCls = "flex items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-[#2b3242]";

  return (
    // 페이지/헤더 배경을 하드코딩 hex 대신 ad-ref 공용 CSS 변수로 - 다른 탭들과 배경색이
    // 안 맞던 문제 수정(2026-08-11). 카드 내부 색은 그대로 둠(ad-ref도 카드가 페이지
    // 배경과 살짝 다른 색을 쓰는 게 원래 디자인이라 안 건드림).
    <div className="min-h-screen break-keep bg-[var(--bg-page)] font-sans antialiased text-[var(--text-primary)]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-surface)] backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold text-[#303845] dark:text-[#cbd2dc]">메리츠증권 뉴스 인텔리전스</span>
            <span className="hidden rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300 sm:inline">{view === "weekly" ? "주간 리포트" : "데일리 리포트"}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* 통합 검색 (데일리 + 주간 전체) */}
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="인사이트·기사 검색 (예: ADR)"
                className="w-60 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:w-72 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-[#363d4d] dark:bg-[#232936] dark:text-[#c0c7d2]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="검색어 지우기"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* 검색결과에서 특정 화면으로 이동한 경우: 돌아가기 버튼 (채움 스타일 + 등장 시 반짝임) */}
            {!searchQuery && returnToSearch && (
              <button
                onClick={() => { setSearchQuery(returnToSearch); setReturnToSearch(null); }}
                className={`hidden items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md ring-2 ring-indigo-300 transition hover:bg-indigo-700 md:flex dark:bg-indigo-500 dark:ring-indigo-400/50 dark:hover:bg-indigo-400 ${returnPulse ? "animate-pulse" : ""}`}
                title="방금 보던 검색 결과로 돌아가기"
              >
                ← 검색 결과로 ({returnToSearch})
              </button>
            )}
            {/* 데일리/주간/북마크 탭 전환은 이제 ad-ref 사이드바가 담당(2026-08-11) -
                여기 내부 탭 버튼은 제거하고 view는 부모가 넘겨주는 값을 그대로 따름 */}
            {/* 주차 선택 드롭다운은 헤더 구석에 있어서 눈에 안 띈다는 피드백으로 본문 상단
                가로 칩 목록으로 옮김(2026-08-11) - 아래 "주차 선택" 참고. 여기선 제거함. */}
            {/* 함께 보고 있는 사람 (실시간 접속자, 원형 아바타) */}
            {activeUsers.length > 0 && (
              <div className="hidden items-center -space-x-1.5 sm:flex" title="지금 함께 보고 있는 사람">
                {activeUsers.slice(0, 5).map((u, i) => (
                  <div
                    key={i}
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm dark:border-[#141822]"
                    style={{ backgroundColor: u.color || "#64748b" }}
                    title={u.name}
                  >
                    {u.name ? u.name.replace("익명의 ", "").slice(0, 1) : "?"}
                  </div>
                ))}
                {activeUsers.length > 5 && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-300 text-[10px] font-bold text-slate-600 shadow-sm dark:border-[#141822] dark:bg-[#363d4d] dark:text-[#c0c7d2]">
                    +{activeUsers.length - 5}
                  </div>
                )}
              </div>
            )}
            {/* 다크/라이트 토글 제거함(2026-08-11) - ad-ref 사이드바의 전체 테마 토글을 그대로 씀 */}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-5 pb-16 pt-6">
        {/* 좌측 목차 사이드바 제거함(2026-08-11, 사용자 요청 - 필요 없다고 판단) */}

        {/* 경쟁사 슬라이서는 세로 사이드바에서 DailyView 안의 가로 칩 행(날짜 필터 아래
            두 번째 줄)으로 옮김(2026-08-11) - competitors/selCompetitor는 그대로 DailyView에
            props로 넘어가서 그 안에서 렌더링됨 */}

        {searchQuery.trim() ? (
          <SearchResultsView query={searchQuery.trim()} results={searchResults} onClear={() => { setSearchQuery(""); setReturnToSearch(null); }} onJump={jumpToResult} sortOrder={searchSort} onToggleSort={() => setSearchSort((s) => (s === "desc" ? "asc" : "desc"))} />
        ) : view === "daily" ? (
          <DailyView date={dailyDate} setDate={setDailyDate} dailyData={dailyData} dailyDays={dailyDays} loading={dailyLoading} bookmarkedByMe={bookmarkedByMe} onRequestBookmark={requestBookmark} competitors={competitors} selCompetitor={selCompetitor} onSelectCompetitor={setSelCompetitor} feedbackList={feedbackList} myBrowserId={myIdentity ? myIdentity.browserId : ""} onAddFeedback={addFeedback} onUpdateFeedback={updateFeedback} onRemoveFeedback={removeFeedback} />
        ) : view === "bookmarks" ? (
          <BookmarksView
            bookmarks={allBookmarks}
            folders={folders}
            onRemove={removeBookmark}
            onJump={(date) => {
              const key = toDailyDateKey(date);
              let target = key;
              if (dailyData && !dailyData[target]) {
                const keys = Object.keys(dailyData);
                const hit = keys.find((k) => String(k).slice(0, 10) === String(key).slice(0, 10));
                if (hit) target = hit;
              }
              setDailyDate(target);
              setView("daily");
            }}
            onCreateFolder={createFolder}
            onDeleteFolder={deleteFolder}
            onRenameFolder={renameFolder}
            onUpdateMemo={updateBookmarkMemo}
            onMoveFolder={moveBookmarkFolder}
          />
        ) : (
        <main className="min-w-0 flex-1 space-y-6">
          {/* ── 타이틀 ── */}
          <div>
            <h1 className="text-xl font-bold text-[#303845] dark:text-[#cbd2dc] sm:text-2xl">주간 뉴스 인사이트</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#a5adba]">{wInsight.week} · 11개 키워드 모니터링</p>
          </div>

          {/* 주차 선택 - 예전엔 헤더 구석의 작은 드롭다운뿐이라 눈에 안 띈다는 피드백으로,
              데일리 뷰와 같은 "월 선택 → 그 달 주차만 칩으로" 구조로 옮김(2026-08-11) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <div className="relative flex-shrink-0">
              <select
                value={effectiveWeekMonth}
                onChange={(e) => setSelWeekMonth(e.target.value)}
                className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-7 text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-[#363d4d] dark:bg-[#232936] dark:text-[#c0c7d2]"
              >
                {weekMonths.map((ym) => {
                  const lbl = weeksWithMonth.find((w) => w.ym === ym)?.ymLabel || ym;
                  return <option key={ym} value={ym}>{lbl}</option>;
                })}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="h-8 w-px flex-shrink-0 bg-slate-200 dark:bg-[#2b3242]" />
            {filteredWeeks.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  weeklyPick === p.value
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-[#363d4d] dark:bg-[#232936] dark:text-[#a5adba]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
            <p className="text-sm font-medium leading-relaxed text-slate-700 dark:text-[#c0c7d2]">{stripTermExplanations(wInsight.summary)}</p>
          </div>

          {/* ── 주간 핵심 결론 ── */}
          <section id="insight" className={cardCls}>
            <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-3.5 dark:border-[#2b3242] dark:from-indigo-500/10 dark:to-violet-500/10">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-bold text-[#303845] dark:text-[#cbd2dc]">이번 주 핵심 결론</h2>
              <span className="ml-auto rounded-md bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-[#2b3242]/70 dark:text-[#c0c7d2]">AI 분석 기반 · 원문 확인 권장</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {wInsight.conclusions.map((c, i) => (
                <div key={i} className="p-5">
                  <div className="flex gap-4">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">{i + 1}</div>
                    <div className="flex-1 space-y-3">
                      <h3 className="font-semibold leading-snug text-[#303845] dark:text-[#cbd2dc]">{renderWithCaption(c.title)}</h3>
                      <div className="space-y-2.5 text-sm leading-relaxed">
                        <div className="flex gap-2.5">
                          <span className="mt-0.5 w-14 flex-shrink-0 text-[11px] font-semibold text-slate-400">무엇이</span>
                          <span className="text-slate-600 dark:text-[#c0c7d2]">{renderWithCaption(c.what)}</span>
                        </div>
                        <div className="flex gap-2.5">
                          <span className="mt-0.5 w-14 flex-shrink-0 text-[11px] font-semibold text-slate-400">왜 중요</span>
                          <span className="text-slate-600 dark:text-[#c0c7d2]">{renderWithCaption(c.why)}</span>
                        </div>
                        <div className="flex gap-2.5 rounded-lg bg-emerald-50/70 p-2.5 dark:bg-emerald-500/10">
                          <span className="mt-0.5 flex w-14 flex-shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <Target className="h-3 w-3" />액션
                          </span>
                          <span className="font-medium text-emerald-900 dark:text-emerald-200">{stripTermExplanations(c.action)}</span>
                        </div>
                      </div>
                      <span className="inline-block text-xs text-slate-400">근거 기사 {c.evidence}건</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-3 border-t border-slate-100 bg-amber-50/50 p-5 dark:border-[#2b3242] dark:bg-amber-500/10">
              <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">다음 주 주시 포인트</span>
                <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-[#c0c7d2]">{stripTermExplanations(wInsight.watchNextWeek)}</p>
              </div>
            </div>
          </section>

          {/* ── 화제 키워드 TOP7 ── */}
          <section id="topics" className={cardCls}>
            <div className={headCls}>
              <Zap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-bold text-[#303845] dark:text-[#cbd2dc]">이번 주 화제 키워드 TOP 5</h2>
              <span className="ml-auto text-xs text-slate-400">키워드별 대표 기사 · 클릭 시 원문</span>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {wTopics.map((t) => (
                <div key={t.rank} className="flex items-center gap-4 px-5 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 dark:bg-[#2b3242] dark:text-[#c0c7d2]">{t.rank}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#303845] dark:text-[#cbd2dc]">{stripTermExplanations(t.topic)}</span>
                      <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300">언급 {t.mentions}회</span>
                    </div>
                    {t.insight && (
                      <p className="mt-1 text-[13px] leading-relaxed text-indigo-700/90 dark:text-indigo-300/90">
                        <span className="mr-1 text-indigo-500 dark:text-indigo-400">→</span>{stripTermExplanations(t.insight)}
                      </p>
                    )}
                    {t.article.url ? (
                      <a className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 dark:text-[#757d8d] dark:hover:text-indigo-400" href={t.article.url} target="_blank" rel="noopener noreferrer">
                        <span className="line-clamp-1">{t.article.title}</span>
                        {t.article.media && <span className="text-slate-300 dark:text-[#6b7280]">· {t.article.media}</span>}
                        <ArrowUpRight className="h-3 w-3 flex-shrink-0" />
                      </a>
                    ) : (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 dark:text-[#757d8d]">
                        <span className="line-clamp-1">{t.article.title}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 우리 앱 관점 아카이브 ── */}
          <section id="archive" className={cardCls}>
            <div className={headCls}>
              <Bookmark className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-bold text-[#303845] dark:text-[#cbd2dc]">우리 앱 관점 아카이브</h2>
              <span className="ml-auto text-xs text-slate-400">전략 신호 누적 · 태그로 필터</span>
            </div>
            <div className="flex gap-4 border-b border-slate-100 px-5 py-3.5 dark:border-[#2b3242]">
              <div className="flex-1 rounded-lg bg-emerald-50 py-2.5 text-center dark:bg-emerald-500/10">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{perspectiveCounts.opp}</div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400">기회</div>
              </div>
              <div className="flex-1 rounded-lg bg-amber-50 py-2.5 text-center dark:bg-amber-500/10">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{perspectiveCounts.threat}</div>
                <div className="text-xs text-amber-600 dark:text-amber-400">위협</div>
              </div>
              <div className="flex-1 rounded-lg bg-slate-100 py-2.5 text-center dark:bg-[#2b3242]">
                <div className="text-2xl font-bold text-slate-500 dark:text-[#c0c7d2]">{perspectiveCounts.note}</div>
                <div className="text-xs text-slate-500 dark:text-[#a5adba]">참고</div>
              </div>
            </div>
            <div className="flex gap-2 border-b border-slate-100 px-5 py-3 dark:border-[#2b3242]">
              {[
                { key: "opp", label: "기회" },
                { key: "threat", label: "위협" },
                { key: "note", label: "참고" },
                { key: "all", label: "전체" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setPerspectiveFilter(f.key)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    perspectiveFilter === f.key
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                      : "border-slate-200 bg-transparent text-slate-500 hover:bg-slate-50 dark:border-[#363d4d] dark:text-[#a5adba] dark:hover:bg-slate-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {shownPerspectives.map((p, i) => {
                const tag = PERSPECTIVE_TAG[p.type];
                const TagIcon = tag.icon;
                return (
                  <div key={i} className="flex gap-3 px-5 py-3.5">
                    <span className="w-9 flex-shrink-0 pt-0.5 text-xs text-slate-400">{p.date}</span>
                    <span className={`flex flex-shrink-0 items-center gap-1 self-start rounded-md px-2 py-0.5 text-[11px] font-medium ${tag.badge}`}>
                      <TagIcon className="h-3 w-3" />
                      {tag.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-slate-700 dark:text-[#c0c7d2]">{stripTermExplanations(p.text)}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        출처:{" "}
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-indigo-500 dark:hover:text-indigo-400">
                            {stripTermExplanations(p.src)}
                          </a>
                        ) : (
                          stripTermExplanations(p.src)
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <footer className="pt-2 text-center text-[11px] text-slate-400">
            Wisebirds · 메리츠증권 뉴스 인텔리전스 · 매주 월요일 자동 업데이트
          </footer>
        </main>
        )}
      </div>

      {/* 북마크 폴더 선택 팝업 */}
      {pendingBookmark && (
        <FolderPickerModal
          folders={folders}
          currentFolders={(pendingBookmark && bookmarkedByMe[pendingBookmark.commentId]) || []}
          initialMemo={(() => {
            const b = allBookmarks.find((x) => x.commentId === pendingBookmark.commentId && x.memo);
            return b ? b.memo : "";
          })()}
          onSelect={(folder, memo, viaSaveButton) => confirmBookmark(folder, memo, viaSaveButton)}
          onCancel={() => setPendingBookmark(null)}
        />
      )}
    </div>
  );
}
