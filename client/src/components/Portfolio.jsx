import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';

const API = '/api';

export default function Portfolio({ portfolio, onUpdate, onRemove, onAdd }) {
  const [chartData, setChartData] = useState({});
  const [loadingChart, setLoadingChart] = useState({});
  const [expanded, setExpanded] = useState(null);

  const loadChart = async (symbol) => {
    if (chartData[symbol]) return;
    setLoadingChart(p => ({ ...p, [symbol]: true }));
    try {
      const res = await axios.get(`${API}/chart/${symbol}?range=1mo&interval=1d`);
      setChartData(p => ({ ...p, [symbol]: res.data }));
    } catch {}
    setLoadingChart(p => ({ ...p, [symbol]: false }));
  };

  const toggleExpand = (symbol, isFund) => {
    if (expanded === symbol) {
      setExpanded(null);
    } else {
      setExpanded(symbol);
      if (!isFund) loadChart(symbol);
    }
  };

  const fmtPrice = (val, currency) => {
    if (!val && val !== 0) return '-';
    if (currency === 'KRW') return val.toLocaleString('ko-KR') + '원';
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="portfolio-page">
      <div className="page-header">
        <h2>💼 포트폴리오 관리</h2>
        <button className="btn-primary" onClick={onAdd}>+ 종목 추가</button>
      </div>

      {portfolio.length === 0 ? (
        <div className="empty-state large">
          <div className="empty-icon">📭</div>
          <h3>보유 종목이 없습니다</h3>
          <p>종목을 검색하여 포트폴리오에 추가하세요</p>
          <button className="btn-primary" onClick={onAdd}>+ 종목 추가하기</button>
        </div>
      ) : (
        <div className="portfolio-list">
          {portfolio.map((p) => {
            const val = (p.currentPrice || 0) * (p.quantity || 0);
            const cost = (p.avgPrice || 0) * (p.quantity || 0);
            const pnl = val - cost;
            const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
            const isExpanded = expanded === p.symbol;

            return (
              <div key={p.symbol} className={`portfolio-card ${isExpanded ? 'expanded' : ''}`}>
                <div className="portfolio-card-header" onClick={() => toggleExpand(p.symbol, p.isFund)}>
                  <div className="stock-info">
                    <div className="stock-symbol">{p.isFund ? p.name?.substring(0, 14) + (p.name?.length > 14 ? '…' : '') : p.symbol}</div>
                    <div className="stock-name">{p.isFund ? (p.peerGroupName || p.exchange) : p.name}</div>
                    <div className="stock-exchange">{p.isFund ? '펀드 · 기준가 매일 업데이트' : `${p.exchange} · ${p.type}`}</div>
                  </div>

                  <div className="stock-price-block">
                    <div className="current-price">
                      {p.isFund ? (
                        <span style={{fontSize:'12px', color:'var(--text-muted)', marginRight:'4px'}}>기준가</span>
                      ) : null}
                      {fmtPrice(p.currentPrice, p.currency || 'KRW')}
                    </div>
                    {p.isFund ? (
                      <div className={`price-change ${(p.returnRate3m ?? 0) >= 0 ? 'pos' : 'neg'}`}>
                        {p.returnRate3m != null
                          ? `3개월 ${p.returnRate3m >= 0 ? '▲' : '▼'} ${Math.abs(p.returnRate3m).toFixed(2)}%`
                          : '수익률 없음'}
                      </div>
                    ) : (
                      <div className={`price-change ${(p.changePercent ?? 0) >= 0 ? 'pos' : 'neg'}`}>
                        {p.changePercent !== undefined
                          ? `${p.changePercent >= 0 ? '▲' : '▼'} ${Math.abs(p.changePercent).toFixed(2)}%`
                          : '로딩중...'}
                      </div>
                    )}
                  </div>

                  <div className="stock-input-block">
                    <label>보유수량</label>
                    <input
                      type="number"
                      value={p.quantity || ''}
                      placeholder="0"
                      min="0"
                      onClick={e => e.stopPropagation()}
                      onChange={e => onUpdate(p.symbol, 'quantity', e.target.value)}
                    />
                  </div>

                  <div className="stock-input-block">
                    <label>평균매수가</label>
                    <input
                      type="number"
                      value={p.avgPrice || ''}
                      placeholder="0"
                      min="0"
                      step="0.01"
                      onClick={e => e.stopPropagation()}
                      onChange={e => onUpdate(p.symbol, 'avgPrice', e.target.value)}
                    />
                  </div>

                  <div className="stock-pnl-block">
                    <div className="pnl-value">{val > 0 ? val.toLocaleString() : '-'}</div>
                    {cost > 0 && (
                      <div className={`pnl-change ${pnl >= 0 ? 'pos' : 'neg'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                      </div>
                    )}
                  </div>

                  <div className="card-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn-expand" onClick={() => toggleExpand(p.symbol)}>
                      {isExpanded ? '▲' : '▼'}
                    </button>
                    <button className="btn-remove" onClick={() => onRemove(p.symbol)}>✕</button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="portfolio-card-detail">
                    {p.isFund ? (
                      <div className="detail-stats">
                        <div className="detail-stat">
                          <span>기준가(NAV)</span>
                          <span>{fmtPrice(p.currentPrice, 'KRW')}</span>
                        </div>
                        <div className="detail-stat">
                          <span>1개월 수익률</span>
                          <span className={p.returnRate1m >= 0 ? 'text-green' : 'text-red'}>
                            {p.returnRate1m != null ? (p.returnRate1m >= 0 ? '+' : '') + p.returnRate1m.toFixed(2) + '%' : '-'}
                          </span>
                        </div>
                        <div className="detail-stat">
                          <span>3개월 수익률</span>
                          <span className={p.returnRate3m >= 0 ? 'text-green' : 'text-red'}>
                            {p.returnRate3m != null ? (p.returnRate3m >= 0 ? '+' : '') + p.returnRate3m.toFixed(2) + '%' : '-'}
                          </span>
                        </div>
                        <div className="detail-stat">
                          <span>6개월 수익률</span>
                          <span className={p.returnRate6m >= 0 ? 'text-green' : 'text-red'}>
                            {p.returnRate6m != null ? (p.returnRate6m >= 0 ? '+' : '') + p.returnRate6m.toFixed(2) + '%' : '-'}
                          </span>
                        </div>
                        <div className="detail-stat">
                          <span>1년 수익률</span>
                          <span className={p.returnRate1y >= 0 ? 'text-green' : 'text-red'}>
                            {p.returnRate1y != null ? (p.returnRate1y >= 0 ? '+' : '') + p.returnRate1y.toFixed(2) + '%' : '-'}
                          </span>
                        </div>
                        <div className="detail-stat">
                          <span>위험등급</span>
                          <span>{p.riskGrade ? `${p.riskGrade}등급` : '-'}</span>
                        </div>
                        <div className="detail-stat">
                          <span>펀드 유형</span>
                          <span>{p.peerGroupName || '-'}</span>
                        </div>
                        <div className="detail-stat">
                          <span>펀드 코드</span>
                          <span style={{fontSize:'11px'}}>{p.symbol}</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="detail-stats">
                          <div className="detail-stat">
                            <span>시가</span>
                            <span>{fmtPrice(p.open, p.currency)}</span>
                          </div>
                          <div className="detail-stat">
                            <span>고가</span>
                            <span className="text-green">{fmtPrice(p.dayHigh, p.currency)}</span>
                          </div>
                          <div className="detail-stat">
                            <span>저가</span>
                            <span className="text-red">{fmtPrice(p.dayLow, p.currency)}</span>
                          </div>
                          <div className="detail-stat">
                            <span>전일 종가</span>
                            <span>{fmtPrice(p.prevClose, p.currency)}</span>
                          </div>
                          <div className="detail-stat">
                            <span>52주 최고</span>
                            <span>{fmtPrice(p.week52High, p.currency)}</span>
                          </div>
                          <div className="detail-stat">
                            <span>52주 최저</span>
                            <span>{fmtPrice(p.week52Low, p.currency)}</span>
                          </div>
                          <div className="detail-stat">
                            <span>거래량</span>
                            <span>{p.volume ? p.volume.toLocaleString() : '-'}</span>
                          </div>
                          <div className="detail-stat">
                            <span>시가총액</span>
                            <span>{p.marketCap ? (p.marketCap / 1e9).toFixed(2) + 'B' : '-'}</span>
                          </div>
                        </div>

                        <div className="chart-section">
                          <h4>1개월 차트</h4>
                          {loadingChart[p.symbol] ? (
                            <div className="chart-loading">차트 로딩중...</div>
                          ) : chartData[p.symbol]?.length > 0 ? (
                            <ResponsiveContainer width="100%" height={180}>
                              <LineChart data={chartData[p.symbol]}>
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={60} />
                                <Tooltip />
                                <Line type="monotone" dataKey="price" stroke="#6366f1" dot={false} strokeWidth={2} />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="chart-loading">차트 데이터 없음</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
