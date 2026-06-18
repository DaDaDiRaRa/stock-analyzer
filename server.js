require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const iconv = require("iconv-lite");
const YahooFinance = require("yahoo-finance2").default;
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3001;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

app.use(cors());
app.use(express.json());

// ====== 종목 데이터베이스 ======
let stockDatabase = [];
let dbStatus = { loaded: false, total: 0, us: 0, kr: 0, lastUpdated: null };

const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://finance.naver.com/",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

// 네이버 금융 한 페이지 파싱
async function fetchNaverPage(sosok, page) {
  const r = await axios.get("https://finance.naver.com/sise/sise_market_sum.nhn", {
    params: { sosok, page },
    headers: NAVER_HEADERS,
    responseType: "arraybuffer",
    timeout: 15000,
  });
  const html = iconv.decode(Buffer.from(r.data), "euc-kr");
  const regex = /code=(\d{6})[^>]*>[^<]*<\/a>[^<]*<\/td>[^<]*<td[^>]*>[^<]*<a[^>]*>([^<]+)<\/a>/g;
  const simple = /href="[^"]*code=(\d{6})[^"]*"[^>]*class="tltle"[^>]*>([^<]+)<\/a>/g;
  const stocks = [];
  const seen = new Set();
  
  // 먼저 tltle 클래스 링크로 시도
  let m;
  while ((m = simple.exec(html)) !== null) {
    const code = m[1].trim();
    const name = m[2].trim();
    if (code && name && !seen.has(code)) { seen.add(code); stocks.push({ code, name }); }
  }
  
  // tltle 못찾으면 일반 code= 패턴
  if (stocks.length === 0) {
    const codeRegex = /code=(\d{6})/g;
    const codes = [];
    while ((m = codeRegex.exec(html)) !== null) codes.push(m[1]);
    const nameRegex = /itemdetail[^>]*>([가-힣\w\(\)&\.\s]{2,20})<\/a>/g;
    const names = [];
    while ((m = nameRegex.exec(html)) !== null) names.push(m[1].trim());
    const unique = [...new Set(codes)];
    unique.forEach((code, i) => { if (names[i]) stocks.push({ code, name: names[i] }); });
  }
  return stocks;
}

// 네이버 금융 전체 종목 로드
async function loadKoreanStocks() {
  console.log("한국 종목 로드 중 (네이버 금융)...");
  
  // 페이지 수 확인
  async function getLastPage(sosok) {
    const r = await axios.get("https://finance.naver.com/sise/sise_market_sum.nhn", {
      params: { sosok, page: 1 },
      headers: NAVER_HEADERS, responseType: "arraybuffer", timeout: 10000,
    });
    const html = iconv.decode(Buffer.from(r.data), "euc-kr");
    const nums = [...html.matchAll(/page=(\d+)/g)].map(x => parseInt(x[1]));
    return Math.max(...nums, 1);
  }
  
  const [kospiPages, kosdaqPages] = await Promise.all([getLastPage(0), getLastPage(1)]);
  console.log("KOSPI", kospiPages, "페이지 / KOSDAQ", kosdaqPages, "페이지");
  
  // 병렬 로드 (배치 처리)
  async function loadAllPages(sosok, totalPages, marketName, suffix) {
    const stocks = [];
    const BATCH = 10;
    for (let start = 1; start <= totalPages; start += BATCH) {
      const end = Math.min(start + BATCH - 1, totalPages);
      const pages = [];
      for (let p = start; p <= end; p++) pages.push(p);
      const results = await Promise.allSettled(pages.map(p => fetchNaverPage(sosok, p)));
      results.forEach(r => {
        if (r.status === "fulfilled") {
          r.value.forEach(s => stocks.push({ ...s, market: marketName, suffix }));
        }
      });
    }
    return stocks;
  }
  
  const [kospiRaw, kosdaqRaw] = await Promise.all([
    loadAllPages(0, kospiPages, "KOSPI", ".KS"),
    loadAllPages(1, kosdaqPages, "KOSDAQ", ".KQ"),
  ]);
  
  // 중복 제거 + 포맷 변환
  const seen = new Set();
  const stocks = [];
  [...kospiRaw, ...kosdaqRaw].forEach(s => {
    const symbol = s.code + s.suffix;
    if (!seen.has(symbol) && s.code && s.name) {
      seen.add(symbol);
      stocks.push({
        symbol,
        name: s.name,
        exchange: s.market,
        type: "EQUITY",
        country: "KR",
        krCode: s.code,
      });
    }
  });
  console.log("한국 주식 로드 완료:", stocks.length, "개");
  return stocks;
}

// 네이버 ETF 리스트
async function loadKoreanETFs() {
  try {
    const r = await axios.get("https://finance.naver.com/api/sise/etfItemList.nhn", {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/" },
      timeout: 15000,
    });
    const items = r.data?.result?.etfItemList || [];
    return items.map(e => ({
      symbol: e.itemcode + ".KS",
      name: e.itemname,
      exchange: "KRX ETF",
      type: "ETF",
      country: "KR",
      krCode: e.itemcode,
    })).filter(e => e.name && e.krCode);
  } catch (err) {
    console.error("ETF 로드 실패:", err.message);
    return [];
  }
}

// 미국 전체 종목 — Alpha Vantage (HTTP), NASDAQ HTTP 폴백
async function loadUSStocks() {
  console.log("미국 종목 로드 중...");

  // 1순위: Alpha Vantage listing (symbol,name,exchange,assetType,ipoDate,delistingDate,status)
  try {
    const r = await axios.get(
      "https://www.alphavantage.co/query?function=LISTING_STATUS&apikey=demo",
      { timeout: 20000, responseType: "text" }
    );
    const lines = r.data.split("\n").filter(l => l.trim());
    const stocks = [];
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(",");
      if (p.length < 7) continue;
      const symbol = p[0].trim();
      const name = p[1].trim();
      const exchange = p[2].trim();
      const assetType = p[3].trim();
      const status = p[6].trim();
      if (!symbol || !name || status !== "Active") continue;
      if (/[^A-Z0-9\.\-]/.test(symbol)) continue;
      const type = assetType === "ETF" ? "ETF" : assetType === "Mutual Fund" ? "MUTUALFUND" : "EQUITY";
      stocks.push({ symbol, name, exchange, type, country: "US" });
    }
    if (stocks.length > 1000) {
      console.log("Alpha Vantage 미국 종목:", stocks.length, "개");
      return stocks;
    }
  } catch (e) {
    console.error("Alpha Vantage 실패:", e.message);
  }

  // 폴백: NASDAQ HTTP
  try {
    const MKT = { Q: "NASDAQ", N: "NYSE", A: "AMEX", P: "NYSE ARCA", Z: "BATS", V: "IEX" };
    const r = await axios.get(
      "http://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt",
      { timeout: 20000, responseType: "text" }
    );
    const lines = r.data.split("\n");
    // header: Nasdaq Traded|Symbol|Security Name|Listing Exchange|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
    const stocks = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("File Creation")) continue;
      const p = line.split("|");
      if (p.length < 9) continue;
      const symbol = p[1].trim();
      const name = p[2].trim();
      const exchCode = p[3].trim();
      const isTest = p[5] === "Y";
      const isETF = p[8].trim() === "Y";
      if (!symbol || !name || isTest) continue;
      if (/[^A-Z0-9\.]/.test(symbol)) continue;
      stocks.push({ symbol, name, exchange: MKT[exchCode] || exchCode, type: isETF ? "ETF" : "EQUITY", country: "US" });
    }
    console.log("NASDAQ HTTP 미국 종목:", stocks.length, "개");
    return stocks;
  } catch (e) {
    console.error("NASDAQ HTTP 실패:", e.message);
    return [];
  }
}

async function buildDatabase() {
  console.log("=== 종목 DB 구축 시작 ===");
  const [usRes, krRes, etfRes] = await Promise.allSettled([
    loadUSStocks(),
    loadKoreanStocks(),
    loadKoreanETFs(),
  ]);
  const us = usRes.status === "fulfilled" ? usRes.value : [];
  const kr = krRes.status === "fulfilled" ? krRes.value : [];
  const etf = etfRes.status === "fulfilled" ? etfRes.value : [];
  const seen = new Set();
  const all = [...us, ...kr, ...etf].filter(s => {
    if (!s.symbol || seen.has(s.symbol)) return false;
    seen.add(s.symbol);
    return true;
  });
  stockDatabase = all;
  dbStatus = { loaded: true, total: all.length, us: us.length, kr: kr.length + etf.length, lastUpdated: new Date().toISOString() };
  console.log("=== DB 완성: 총", all.length, "개 (미국", us.length, "/ 한국", kr.length + etf.length, ") ===");
}

buildDatabase();
setInterval(buildDatabase, 7 * 24 * 60 * 60 * 1000);

// ====== 펀드 API ======

const NAVER_FUND_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://m.stock.naver.com/",
  "Accept": "application/json",
};

// 펀드 검색 (네이버 자동완성 API)
app.get("/api/fund/search", async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 1) return res.json([]);
  try {
    const r = await axios.get("https://ac.stock.naver.com/ac", {
      params: { q: q.trim(), target: "fund" },
      headers: NAVER_FUND_HEADERS,
      timeout: 8000,
    });
    const items = (r.data?.items || []).map(item => ({
      code: item.code,
      name: item.name,
      type: "FUND",
      exchange: "펀드",
      country: "KR",
    }));
    res.json(items);
  } catch (err) {
    console.error("펀드 검색 실패:", err.message);
    res.json([]);
  }
});

// 펀드 기준가(NAV) 조회
app.get("/api/fund/price", async (req, res) => {
  const { codes } = req.query; // 쉼표 구분
  if (!codes) return res.json([]);
  const codeList = codes.split(",").filter(Boolean);
  const results = await Promise.allSettled(
    codeList.map(code =>
      axios.get("https://m.stock.naver.com/front-api/fund/detail", {
        params: { fundCode: code.trim() },
        headers: NAVER_FUND_HEADERS,
        timeout: 8000,
      })
    )
  );
  const prices = results.map((r, i) => {
    if (r.status !== "fulfilled") return { code: codeList[i], basePrice: null, error: true };
    const d = r.value.data?.result || {};
    return {
      code: d.fundCode || codeList[i],
      name: d.fundName,
      basePrice: d.basePrice ? parseFloat(d.basePrice) : null,
      returnRate1m: d.returnRate1m ?? null,
      returnRate3m: d.returnRate3m ?? null,
      returnRate6m: d.returnRate6m ?? null,
      returnRate1y: d.returnRate1y ?? null,
      riskGrade: d.riskGrade,
      peerGroupName: d.peerGroupName,
      parentPeerGroupName: d.parentPeerGroupName,
      aum: d.aum ? parseInt(d.aum) : null,
    };
  });
  res.json(prices);
});

// ====== API 엔드포인트 ======

app.get("/api/db-status", (req, res) => res.json(dbStatus));

app.get("/api/search", async (req, res) => {
  try {
    const { q = "", exchange = "all", type = "all", page = 0, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const qStr = q.trim().toLowerCase().replace(/\s+/g, "");

    let pool = stockDatabase;
    if (exchange !== "all") {
      pool = pool.filter(s => {
        if (exchange === "US") return s.country === "US";
        if (exchange === "KR") return s.country === "KR";
        return s.exchange === exchange;
      });
    }
    if (type !== "all") {
      pool = pool.filter(s => s.type === type.toUpperCase());
    }

    let results;
    if (!qStr) {
      const total = pool.length;
      return res.json({ results: pool.slice(pageNum * limitNum, (pageNum + 1) * limitNum), total, page: pageNum, pages: Math.ceil(total / limitNum) });
    }

    const exact = [], starts = [], contains = [];
    for (const s of pool) {
      const sym = s.symbol.toLowerCase().replace(/\.(ks|kq)$/, "");
      const name = s.name.toLowerCase().replace(/\s+/g, "");
      const code = (s.krCode || "").toLowerCase();
      if (sym === qStr || code === qStr) exact.push(s);
      else if (sym.startsWith(qStr) || name.startsWith(qStr) || code.startsWith(qStr)) starts.push(s);
      else if (sym.includes(qStr) || name.includes(qStr) || code.includes(qStr)) contains.push(s);
    }
    results = [...exact, ...starts, ...contains];
    const total = results.length;
    res.json({ results: results.slice(pageNum * limitNum, (pageNum + 1) * limitNum), total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error("Search err:", err.message);
    res.json({ results: [], total: 0, page: 0, pages: 1 });
  }
});

app.post("/api/quotes", async (req, res) => {
  try {
    const { symbols } = req.body;
    if (!symbols?.length) return res.json([]);
    const results = await Promise.allSettled(symbols.map(s => yf.quote(s)));
    const quotes = results.filter(r => r.status === "fulfilled" && r.value).map(r => {
      const q = r.value;
      return { symbol: q.symbol, name: q.shortName || q.longName || q.symbol, price: q.regularMarketPrice, change: q.regularMarketChange, changePercent: q.regularMarketChangePercent, volume: q.regularMarketVolume, marketCap: q.marketCap, currency: q.currency, prevClose: q.regularMarketPreviousClose, open: q.regularMarketOpen, dayHigh: q.regularMarketDayHigh, dayLow: q.regularMarketDayLow, week52High: q.fiftyTwoWeekHigh, week52Low: q.fiftyTwoWeekLow };
    });
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: "시세 조회 실패" });
  }
});

app.get("/api/chart/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { range = "1mo", interval = "1d" } = req.query;
    const now = new Date();
    switch (range) {
      case "1mo": now.setMonth(now.getMonth()-1); break;
      case "3mo": now.setMonth(now.getMonth()-3); break;
      case "6mo": now.setMonth(now.getMonth()-6); break;
      case "1y": now.setFullYear(now.getFullYear()-1); break;
      default: now.setMonth(now.getMonth()-1);
    }
    const result = await yf.chart(symbol, { period1: now, interval });
    const data = (result.quotes || []).filter(q => q.close != null).map(q => ({
      date: new Date(q.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
      price: parseFloat(q.close.toFixed(2)),
    }));
    res.json(data);
  } catch (err) {
    res.json([]);
  }
});

app.get("/api/market", async (req, res) => {
  try {
    const indices = ["^GSPC","^IXIC","^DJI","^KS11","^KQ11","^TNX","GC=F","CL=F"];
    const names = { "^GSPC":"S&P 500","^IXIC":"NASDAQ","^DJI":"다우존스","^KS11":"KOSPI","^KQ11":"KOSDAQ","^TNX":"미국 10년 국채","GC=F":"금","CL=F":"원유(WTI)" };
    const results = await Promise.allSettled(indices.map(s => yf.quote(s)));
    const markets = results.filter(r => r.status === "fulfilled" && r.value).map(r => {
      const q = r.value;
      return { symbol: q.symbol, name: names[q.symbol] || q.shortName, price: q.regularMarketPrice, change: q.regularMarketChange, changePercent: q.regularMarketChangePercent, currency: q.currency };
    });
    res.json(markets);
  } catch (err) {
    res.status(500).json({ error: "시장 데이터 조회 실패" });
  }
});

// HTML 엔티티 + 태그 제거
function cleanHtml(str = "") {
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .trim();
}

// 네이버 뉴스 검색
async function fetchNaverNews(query, display = 5) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || clientId === "your_naver_client_id_here") return [];
  try {
    const r = await axios.get("https://openapi.naver.com/v1/search/news.json", {
      params: { query, display, sort: "date" },
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
      timeout: 8000,
    });
    return (r.data.items || []).map(item => ({
      title: cleanHtml(item.title),
      description: cleanHtml(item.description),
      link: item.originallink || item.link,
      pubDate: item.pubDate,
    }));
  } catch (err) {
    console.error("네이버 뉴스 실패:", err.message);
    return [];
  }
}

app.get("/api/news", async (req, res) => {
  const { q, display = 10 } = req.query;
  if (!q) return res.json([]);
  const items = await fetchNaverNews(q, Number(display));
  res.json(items);
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { portfolio, marketData } = req.body;
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "your_anthropic_api_key_here") {
      return res.status(400).json({ error: "API 키가 설정되지 않았습니다. .env 파일에 ANTHROPIC_API_KEY를 입력해주세요." });
    }

    // 종목별 최신 뉴스 병렬 수집 (종목당 3개)
    const newsResults = await Promise.allSettled(
      portfolio.map(p => fetchNaverNews(p.name, 3))
    );
    const newsMap = {};
    portfolio.forEach((p, i) => {
      newsMap[p.symbol] = newsResults[i].status === "fulfilled" ? newsResults[i].value : [];
    });

    const pText = portfolio.map(p => {
      const val = p.currentPrice * p.quantity, cost = p.avgPrice * p.quantity;
      const pnl = val - cost, pct = cost > 0 ? ((pnl/cost)*100).toFixed(2) : "N/A";
      const news = newsMap[p.symbol];
      const newsText = news.length
        ? "\n  최신 뉴스:\n" + news.map(n => `  · [${n.pubDate?.slice(0,16)}] ${n.title}`).join("\n")
        : "";
      return `- ${p.name}(${p.symbol}): ${p.quantity}주, 매수가 ${p.avgPrice}, 현재 ${p.currentPrice}, 평가 ${val.toLocaleString()}, 손익 ${pnl>=0?"+":""}${pnl.toFixed(0)}(${pct}%), 일등락 ${p.changePercent?.toFixed(2)}%${newsText}`;
    }).join("\n\n");

    const mText = marketData.map(m => `- ${m.name}: ${m.price?.toLocaleString("en-US",{minimumFractionDigits:2})} (${m.changePercent>=0?"+":""}${m.changePercent?.toFixed(2)}%)`).join("\n");
    const tv = portfolio.reduce((s,p) => s+p.currentPrice*p.quantity,0);
    const tc = portfolio.reduce((s,p) => s+p.avgPrice*p.quantity,0);
    const tp = tv-tc, tpp = tc>0?((tp/tc)*100).toFixed(2):"N/A";

    const hasNews = Object.values(newsMap).some(n => n.length > 0);

    const prompt = `당신은 전문 주식 투자 분석가입니다. 포트폴리오, 시장 현황${hasNews ? ", 최신 뉴스" : ""}를 종합 분석하고 투자 의견을 제공하세요.

## 포트폴리오
총 평가: ${tv.toLocaleString()} / 원금: ${tc.toLocaleString()} / 손익: ${tp>=0?"+":""}${tp.toLocaleString()} (${tpp}%)

${pText}

## 시장 지수
${mText}

## 요청
1. **포트폴리오 종합 평가**: 구성, 다각화, 리스크
2. **개별 종목 분석**: 현황과 단기/중기 전망${hasNews ? " (뉴스 반영)" : ""}
3. **시장 상황**: 글로벌/국내 흐름
4. **리스크 요인 및 대응**
5. **투자 전략 제언**

한국어로, 마크다운 형식으로 실용적으로 답변해주세요.`;

    const msg = await anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 2500, messages: [{ role: "user", content: prompt }] });
    res.json({ analysis: msg.content[0].text, newsMap });
  } catch (err) {
    res.status(500).json({ error: "AI 분석 실패: " + err.message });
  }
});

// 프로덕션: React 빌드 파일 정적 서빙
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "client/dist")));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, "client/dist/index.html"));
  });
}

app.listen(PORT, () => console.log("서버 실행 중: http://localhost:" + PORT));
