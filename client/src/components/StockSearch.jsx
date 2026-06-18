import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

const EXCHANGES = [
  { id: "all", label: "전체" },
  { id: "US",  label: "🇺🇸 미국 전체" },
  { id: "NASDAQ", label: "NASDAQ" },
  { id: "NYSE", label: "NYSE" },
  { id: "KR",  label: "🇰🇷 한국 전체" },
  { id: "KOSPI", label: "KOSPI" },
  { id: "KOSDAQ", label: "KOSDAQ" },
];

const TYPES = [
  { id: "all", label: "전체" },
  { id: "EQUITY", label: "주식" },
  { id: "ETF", label: "ETF" },
];

export default function StockSearch({ onAdd, onClose, existingSymbols, apiBase }) {
  const [mode, setMode]         = useState("stock"); // "stock" | "fund"
  const [query, setQuery]       = useState("");
  const [exchange, setExchange] = useState("all");
  const [type, setType]         = useState("all");
  const [results, setResults]   = useState([]);
  const [fundResults, setFundResults] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [dbStatus, setDbStatus] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 0, pages: 1 });
  const inputRef    = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    axios.get(`${apiBase}/db-status`).then(r => setDbStatus(r.data)).catch(() => {});
  }, []);

  useEffect(() => { setQuery(""); setResults([]); setFundResults([]); }, [mode]);

  // 주식 검색
  const doStockSearch = useCallback(async (q, exch, tp, page = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: q.trim(), exchange: exch, type: tp, page, limit: 50 });
      const res = await axios.get(`${apiBase}/search?${params}`);
      setResults(res.data.results || []);
      setPagination({ total: res.data.total || 0, page: res.data.page || 0, pages: res.data.pages || 1 });
    } catch { setResults([]); }
    setLoading(false);
  }, [apiBase]);

  // 펀드 검색
  const doFundSearch = useCallback(async (q) => {
    if (!q.trim()) { setFundResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await axios.get(`${apiBase}/fund/search?q=${encodeURIComponent(q.trim())}`);
      setFundResults(res.data || []);
    } catch { setFundResults([]); }
    setLoading(false);
  }, [apiBase]);

  // 펀드 클래스 자동 확장 (인접 코드 스캔)
  const expandClasses = useCallback(async () => {
    if (fundResults.length === 0) return;
    // 가장 높은 번호의 코드를 시드로 사용
    const seed = [...fundResults].sort((a, b) => b.code.localeCompare(a.code))[0];
    setExpanding(true);
    try {
      const res = await axios.get(`${apiBase}/fund/expand-classes?code=${seed.code}`);
      const existing = new Set(fundResults.map(f => f.code));
      const merged = [...fundResults];
      (res.data || []).forEach(f => {
        if (!existing.has(f.code)) merged.push(f);
      });
      setFundResults(merged);
    } catch (e) {
      console.error("클래스 확장 실패:", e);
    }
    setExpanding(false);
  }, [fundResults, apiBase]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (mode === "stock") {
      debounceRef.current = setTimeout(() => doStockSearch(query, exchange, type, 0), 250);
    } else {
      debounceRef.current = setTimeout(() => doFundSearch(query), 300);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, exchange, type, mode, doStockSearch, doFundSearch]);

  const handleAdd = (item) => {
    const key = item.symbol || item.code;
    if (existingSymbols.includes(key)) return;
    if (mode === "fund") {
      onAdd({ symbol: item.code, name: item.name, type: "FUND", exchange: "펀드", country: "KR" });
    } else {
      onAdd(item);
    }
  };

  const countryFlag = (s) => s.country === "KR" ? "🇰🇷" : "🇺🇸";
  const typeColor = (t) => {
    if (t === "ETF") return "type-etf";
    if (t === "FUND") return "type-fund";
    if (t === "MUTUALFUND") return "type-mutualfund";
    return "type-equity";
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>🔍 종목 검색</h2>
            {dbStatus && mode === "stock" && (
              <div className="db-badge">
                {dbStatus.loaded
                  ? `📦 총 ${dbStatus.total.toLocaleString()}개 종목 (🇺🇸 ${dbStatus.us.toLocaleString()} · 🇰🇷 ${dbStatus.kr.toLocaleString()})`
                  : "⏳ 종목 DB 로딩 중..."}
              </div>
            )}
            {mode === "fund" && <div className="db-badge">🏦 네이버 금융 펀드 검색</div>}
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* 모드 전환 탭 */}
        <div className="mode-tabs">
          <button className={`mode-tab ${mode === "stock" ? "active" : ""}`} onClick={() => setMode("stock")}>
            📈 주식 · ETF
          </button>
          <button className={`mode-tab ${mode === "fund" ? "active" : ""}`} onClick={() => setMode("fund")}>
            🏦 펀드 (ISA·연금)
          </button>
        </div>

        {/* 검색창 */}
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder={mode === "fund"
              ? "펀드명 입력 (예: 유리필라델피아, 마이다스아시아, 트러스톤)"
              : "종목명 또는 티커 입력 (예: 삼성전자, 005930, AAPL, Apple)"}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Escape" && onClose()}
            className="search-input"
          />
          {loading && <span className="search-spinner">⟳</span>}
          {query && <button className="search-clear" onClick={() => setQuery("")}>✕</button>}
        </div>

        {/* 주식 필터 (주식 모드만) */}
        {mode === "stock" && (
          <div className="search-filters">
            <div className="filter-group">
              <span className="filter-label">거래소</span>
              <div className="filter-chips">
                {EXCHANGES.map(ex => (
                  <button key={ex.id} className={`chip ${exchange === ex.id ? "active" : ""}`} onClick={() => setExchange(ex.id)}>
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">종류</span>
              <div className="filter-chips">
                {TYPES.map(tp => (
                  <button key={tp.id} className={`chip ${type === tp.id ? "active" : ""}`} onClick={() => setType(tp.id)}>
                    {tp.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 결과 수 */}
        <div className="search-count">
          {loading ? "검색 중..." : mode === "stock"
            ? `${pagination.total.toLocaleString()}개 종목${query ? ` — "${query}" 검색 결과` : ""}`
            : query ? `${fundResults.length}개 펀드 — "${query}" 검색 결과` : "펀드명을 입력하세요"}
        </div>

        {/* 결과 목록 — 주식 */}
        {mode === "stock" && (
          <div className="search-results">
            {results.length === 0 && !loading && (
              <div className="no-results">{query ? `"${query}"에 대한 검색 결과가 없습니다.` : "종목이 없습니다."}</div>
            )}
            {results.map((stock, i) => {
              const isAdded = existingSymbols.includes(stock.symbol);
              return (
                <div key={stock.symbol + i} className={`search-result-item ${isAdded ? "added" : ""}`}>
                  <div className="result-flag">{countryFlag(stock)}</div>
                  <div className="result-info">
                    <div className="result-row1">
                      <span className="result-symbol">{stock.symbol}</span>
                      {stock.krCode && <span className="result-krcode">{stock.krCode}</span>}
                      <span className={`result-type ${typeColor(stock.type)}`}>{stock.type}</span>
                    </div>
                    <div className="result-name">{stock.name}</div>
                    <div className="result-exchange-tag">{stock.exchange}</div>
                  </div>
                  <button className={`btn-add-stock ${isAdded ? "already-added" : ""}`} onClick={() => handleAdd(stock)} disabled={isAdded}>
                    {isAdded ? "✓ 추가됨" : "+ 추가"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 결과 목록 — 펀드 */}
        {mode === "fund" && (
          <div className="search-results">
            {fundResults.length === 0 && !loading && query && (
              <div className="no-results">"{query}"에 대한 펀드 검색 결과가 없습니다.</div>
            )}
            {!query && !loading && (
              <div className="fund-hint">
                <p>💡 ISA·연금 계좌에서 운용 중인 펀드명을 검색하세요</p>
                <p className="fund-hint-sub">기준가(NAV)는 하루 1회 업데이트됩니다</p>
              </div>
            )}
            {fundResults.map((fund, i) => {
              const isAdded = existingSymbols.includes(fund.code);
              return (
                <div key={fund.code + i} className={`search-result-item ${isAdded ? "added" : ""}`}>
                  <div className="result-flag">🏦</div>
                  <div className="result-info">
                    <div className="result-row1">
                      <span className="result-symbol" style={{fontSize:"11px"}}>{fund.code}</span>
                      <span className="result-type type-fund">FUND</span>
                    </div>
                    <div className="result-name">{fund.name}</div>
                    <div className="result-exchange-tag">펀드 · 기준가 하루 1회 업데이트</div>
                  </div>
                  <button className={`btn-add-stock ${isAdded ? "already-added" : ""}`} onClick={() => handleAdd(fund)} disabled={isAdded}>
                    {isAdded ? "✓ 추가됨" : "+ 추가"}
                  </button>
                </div>
              );
            })}
            {fundResults.length >= 10 && (
              <button className="btn-expand-classes" onClick={expandClasses} disabled={expanding}>
                {expanding ? "⏳ 인접 코드 스캔 중... (5~10초)" : "🔍 같은 펀드의 다른 클래스 찾기 (C-W, S-P 등)"}
              </button>
            )}
          </div>
        )}

        {/* 페이지네이션 (주식 모드만) */}
        {mode === "stock" && pagination.pages > 1 && (
          <div className="pagination">
            <button className="page-btn" disabled={pagination.page === 0} onClick={() => doStockSearch(query, exchange, type, pagination.page - 1)}>◀ 이전</button>
            <span className="page-info">{pagination.page + 1} / {pagination.pages}</span>
            <button className="page-btn" disabled={pagination.page >= pagination.pages - 1} onClick={() => doStockSearch(query, exchange, type, pagination.page + 1)}>다음 ▶</button>
          </div>
        )}
      </div>
    </div>
  );
}
