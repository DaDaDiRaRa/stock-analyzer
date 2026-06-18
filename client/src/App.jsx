import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import Portfolio from './components/Portfolio';
import Market from './components/Market';
import Analysis from './components/Analysis';
import StockSearch from './components/StockSearch';
import axios from 'axios';
import './App.css';

const API = '/api';
const REFRESH_INTERVAL = 30000;

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [portfolio, setPortfolio] = useState(() => {
    try { return JSON.parse(localStorage.getItem('portfolio') || '[]'); } catch { return []; }
  });
  const [quotes, setQuotes] = useState({});
  const [marketData, setMarketData] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const refreshQuotes = useCallback(async () => {
    if (portfolio.length === 0) return;

    const stocks = portfolio.filter(p => p.type !== 'FUND');
    const funds  = portfolio.filter(p => p.type === 'FUND');
    const map = {};

    // 주식/ETF 시세 (Yahoo Finance)
    if (stocks.length > 0) {
      try {
        const res = await axios.post(`${API}/quotes`, { symbols: stocks.map(p => p.symbol) });
        res.data.forEach(q => { map[q.symbol] = q; });
      } catch (err) { console.error('주식 시세 실패:', err); }
    }

    // 펀드 기준가 (네이버 증권)
    if (funds.length > 0) {
      try {
        const codes = funds.map(p => p.symbol).join(',');
        const res = await axios.get(`${API}/fund/price?codes=${codes}`);
        res.data.forEach(f => {
          if (f.basePrice) {
            map[f.code] = {
              symbol: f.code,
              name: f.name,
              price: f.basePrice,
              change: null,
              changePercent: f.returnRate1m ?? null,
              currency: 'KRW',
              isFund: true,
              returnRate1m: f.returnRate1m,
              returnRate3m: f.returnRate3m,
              returnRate6m: f.returnRate6m,
              returnRate1y: f.returnRate1y,
              riskGrade: f.riskGrade,
              peerGroupName: f.peerGroupName,
            };
          }
        });
      } catch (err) { console.error('펀드 기준가 실패:', err); }
    }

    setQuotes(map);
    setLastUpdated(new Date());
  }, [portfolio]);

  const refreshMarket = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/market`);
      setMarketData(res.data);
    } catch (err) {
      console.error('시장 데이터 실패:', err);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
  }, [portfolio]);

  useEffect(() => {
    refreshQuotes();
    refreshMarket();
    const timer = setInterval(() => {
      refreshQuotes();
      refreshMarket();
    }, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [refreshQuotes, refreshMarket]);

  const addStock = (stock) => {
    setPortfolio(prev => {
      const exists = prev.find(p => p.symbol === stock.symbol);
      if (exists) return prev;
      return [...prev, { ...stock, quantity: 0, avgPrice: 0 }];
    });
    setShowAddModal(false);
    setTimeout(refreshQuotes, 500);
  };

  const updateStock = (symbol, field, value) => {
    setPortfolio(prev =>
      prev.map(p => p.symbol === symbol ? { ...p, [field]: parseFloat(value) || 0 } : p)
    );
  };

  const removeStock = (symbol) => {
    setPortfolio(prev => prev.filter(p => p.symbol !== symbol));
    setQuotes(prev => { const n = { ...prev }; delete n[symbol]; return n; });
  };

  const enrichedPortfolio = portfolio.map(p => ({
    ...p,
    ...(quotes[p.symbol] || {}),
    currentPrice: quotes[p.symbol]?.price || 0,
  }));

  const tabs = [
    { id: 'dashboard', label: '대시보드', icon: '📊' },
    { id: 'portfolio', label: '포트폴리오', icon: '💼' },
    { id: 'market', label: '시장 현황', icon: '🌍' },
    { id: 'analysis', label: 'AI 분석', icon: '🤖' },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">📈</span>
          <h1>AI 주식 분석</h1>
        </div>
        <div className="header-right">
          {lastUpdated && (
            <span className="last-updated">
              업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}
            </span>
          )}
          <button className="btn-refresh" onClick={() => { refreshQuotes(); refreshMarket(); }}>
            🔄
          </button>
          <button className="btn-add" onClick={() => setShowAddModal(true)}>
            + 종목 추가
          </button>
        </div>
      </header>

      <nav className="nav">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`nav-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === 'dashboard' && (
          <Dashboard portfolio={enrichedPortfolio} marketData={marketData} onAddStock={() => setShowAddModal(true)} />
        )}
        {tab === 'portfolio' && (
          <Portfolio portfolio={enrichedPortfolio} onUpdate={updateStock} onRemove={removeStock} onAdd={() => setShowAddModal(true)} />
        )}
        {tab === 'market' && <Market marketData={marketData} />}
        {tab === 'analysis' && (
          <Analysis portfolio={enrichedPortfolio} marketData={marketData} apiBase={API} />
        )}
      </main>

      {showAddModal && (
        <StockSearch
          onAdd={addStock}
          onClose={() => setShowAddModal(false)}
          existingSymbols={portfolio.map(p => p.symbol)}
          apiBase={API}
        />
      )}
    </div>
  );
}
