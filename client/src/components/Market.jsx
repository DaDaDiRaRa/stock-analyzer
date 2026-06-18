import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';

const API = '/api';

const INDEX_INFO = {
  '^GSPC': { emoji: '🇺🇸', desc: 'S&P 500 대형주 지수' },
  '^IXIC': { emoji: '💻', desc: '나스닥 기술주 지수' },
  '^DJI':  { emoji: '🏭', desc: '다우존스 산업평균' },
  '^KS11': { emoji: '🇰🇷', desc: '한국 종합주가지수' },
  '^KQ11': { emoji: '🔬', desc: '한국 코스닥 지수' },
  '^TNX':  { emoji: '📊', desc: '미국 10년 만기 국채 수익률' },
  'GC=F':  { emoji: '🥇', desc: '금 선물 (온스당)' },
  'CL=F':  { emoji: '🛢️', desc: '원유 WTI 선물 (배럴당)' },
};

export default function Market({ marketData }) {
  const [chartData, setChartData] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(null);

  const loadChart = async (symbol) => {
    if (chartData[symbol]) {
      setSelectedIndex(symbol);
      return;
    }
    try {
      const res = await axios.get(`${API}/chart/${symbol}?range=3mo&interval=1d`);
      setChartData(p => ({ ...p, [symbol]: res.data }));
      setSelectedIndex(symbol);
    } catch {}
  };

  const selectedData = selectedIndex ? marketData.find(m => m.symbol === selectedIndex) : null;

  const marketSentiment = () => {
    if (marketData.length === 0) return { label: '데이터 로딩중', color: '#94a3b8' };
    const up = marketData.filter(m => m.changePercent > 0).length;
    const total = marketData.length;
    const ratio = up / total;
    if (ratio >= 0.7) return { label: '강세', color: '#10b981' };
    if (ratio >= 0.5) return { label: '중립', color: '#f59e0b' };
    return { label: '약세', color: '#f43f5e' };
  };

  const sentiment = marketSentiment();

  return (
    <div className="market-page">
      <div className="page-header">
        <h2>🌍 시장 현황</h2>
        <div className="sentiment-badge" style={{ background: sentiment.color + '20', color: sentiment.color, border: `1px solid ${sentiment.color}` }}>
          시장 분위기: {sentiment.label}
        </div>
      </div>

      <div className="market-grid">
        {marketData.map((m, i) => {
          const info = INDEX_INFO[m.symbol] || { emoji: '📈', desc: '' };
          const isSelected = selectedIndex === m.symbol;
          return (
            <div
              key={i}
              className={`market-card ${isSelected ? 'selected' : ''} ${m.changePercent >= 0 ? 'up' : 'down'}`}
              onClick={() => loadChart(m.symbol)}
            >
              <div className="market-card-top">
                <span className="market-emoji">{info.emoji}</span>
                <div className="market-card-info">
                  <div className="market-card-name">{m.name}</div>
                  <div className="market-card-desc">{info.desc}</div>
                </div>
              </div>
              <div className="market-card-price">
                {m.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={`market-card-change ${m.changePercent >= 0 ? 'pos' : 'neg'}`}>
                {m.changePercent >= 0 ? '▲' : '▼'} {Math.abs(m.change || 0).toFixed(2)}
                ({m.changePercent >= 0 ? '+' : ''}{(m.changePercent || 0).toFixed(2)}%)
              </div>
            </div>
          );
        })}
      </div>

      {selectedIndex && (
        <div className="market-chart-panel">
          <div className="chart-panel-header">
            <h3>{selectedData?.name} — 3개월 추이</h3>
            <button className="btn-close" onClick={() => setSelectedIndex(null)}>✕</button>
          </div>
          {chartData[selectedIndex]?.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData[selectedIndex]}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.floor(chartData[selectedIndex].length / 6)} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={70} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke={selectedData?.changePercent >= 0 ? '#10b981' : '#f43f5e'}
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-loading">차트 로딩중...</div>
          )}
        </div>
      )}

      <div className="market-summary">
        <h3>시장 요약</h3>
        <div className="summary-grid">
          {marketData.slice(0, 3).map((m, i) => (
            <div key={i} className="summary-item">
              <div className="summary-name">{m.name}</div>
              <div className="summary-detail">
                <span>현재: {m.price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span className={m.changePercent >= 0 ? 'text-green' : 'text-red'}>
                  {m.changePercent >= 0 ? '+' : ''}{(m.changePercent || 0).toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
