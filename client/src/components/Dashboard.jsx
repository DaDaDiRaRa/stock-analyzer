import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e', '#a855f7', '#fb923c', '#34d399'];

export default function Dashboard({ portfolio, marketData, onAddStock }) {
  const stats = useMemo(() => {
    const hasPositions = portfolio.some(p => p.quantity > 0);
    const totalValue = portfolio.reduce((s, p) => s + (p.currentPrice || 0) * (p.quantity || 0), 0);
    const totalCost = portfolio.reduce((s, p) => s + (p.avgPrice || 0) * (p.quantity || 0), 0);
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    return { totalValue, totalCost, totalPnl, totalPnlPct, hasPositions };
  }, [portfolio]);

  const pieData = portfolio
    .filter(p => p.quantity > 0 && p.currentPrice > 0)
    .map((p, i) => ({
      name: p.symbol,
      value: p.currentPrice * p.quantity,
      color: COLORS[i % COLORS.length],
    }));

  const topGainers = [...portfolio]
    .filter(p => p.changePercent != null)
    .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
    .slice(0, 3);

  const topLosers = [...portfolio]
    .filter(p => p.changePercent != null)
    .sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0))
    .slice(0, 3);

  const fmtPrice = (val, currency) => {
    if (!val && val !== 0) return '-';
    if (currency === 'KRW') return val.toLocaleString('ko-KR') + '원';
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="dashboard">
      {/* 총 자산 카드 */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">총 평가금액</div>
          <div className="stat-value">{stats.totalValue > 0 ? stats.totalValue.toLocaleString() : '-'}</div>
          <div className="stat-sub">투자 원금: {stats.totalCost > 0 ? stats.totalCost.toLocaleString() : '-'}</div>
        </div>
        <div className={`stat-card ${stats.totalPnl >= 0 ? 'positive' : 'negative'}`}>
          <div className="stat-label">총 손익</div>
          <div className="stat-value">
            {stats.hasPositions
              ? `${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toLocaleString()}`
              : '-'}
          </div>
          <div className="stat-sub">
            {stats.hasPositions
              ? `${stats.totalPnlPct >= 0 ? '+' : ''}${stats.totalPnlPct.toFixed(2)}%`
              : '보유 수량을 입력해주세요'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">보유 종목 수</div>
          <div className="stat-value">{portfolio.length}</div>
          <div className="stat-sub">수량 입력된 종목: {portfolio.filter(p => p.quantity > 0).length}개</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">일일 손익</div>
          <div className={`stat-value ${portfolio.reduce((s, p) => s + (p.change || 0) * (p.quantity || 0), 0) >= 0 ? 'text-green' : 'text-red'}`}>
            {stats.hasPositions
              ? `${portfolio.reduce((s, p) => s + (p.change || 0) * (p.quantity || 0), 0) >= 0 ? '+' : ''}${portfolio.reduce((s, p) => s + (p.change || 0) * (p.quantity || 0), 0).toFixed(2)}`
              : '-'}
          </div>
          <div className="stat-sub">오늘 변동분</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* 비중 차트 */}
        <div className="card">
          <h3>포트폴리오 비중</h3>
          {pieData.length > 0 ? (
            <div className="pie-container">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={2}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => val.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {pieData.map((d, i) => (
                  <div key={i} className="legend-item">
                    <span className="legend-dot" style={{ background: d.color }} />
                    <span>{d.name}</span>
                    <span className="legend-pct">
                      {((d.value / stats.totalValue) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>포트폴리오에 종목을 추가하고<br />수량을 입력해주세요</p>
              <button className="btn-primary" onClick={onAddStock}>+ 종목 추가</button>
            </div>
          )}
        </div>

        {/* 시장 지수 */}
        <div className="card">
          <h3>주요 지수</h3>
          <div className="market-list">
            {marketData.slice(0, 6).map((m, i) => (
              <div key={i} className="market-item">
                <div className="market-name">{m.name}</div>
                <div className="market-price">
                  {m.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={`market-change ${m.changePercent >= 0 ? 'pos' : 'neg'}`}>
                  {m.changePercent >= 0 ? '▲' : '▼'}
                  {Math.abs(m.changePercent || 0).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 상위 등락 */}
        <div className="card">
          <h3>보유 종목 등락</h3>
          {portfolio.length === 0 ? (
            <div className="empty-state"><p>종목을 추가해주세요</p></div>
          ) : (
            <>
              <div className="gainers-losers">
                <div>
                  <div className="gl-title text-green">▲ 상위 상승</div>
                  {topGainers.map((p, i) => (
                    <div key={i} className="gl-item">
                      <span className="gl-symbol">{p.symbol}</span>
                      <span className="gl-pct text-green">+{(p.changePercent || 0).toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="gl-title text-red">▼ 상위 하락</div>
                  {topLosers.map((p, i) => (
                    <div key={i} className="gl-item">
                      <span className="gl-symbol">{p.symbol}</span>
                      <span className="gl-pct text-red">{(p.changePercent || 0).toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 보유 종목 요약 */}
        <div className="card full-width">
          <h3>보유 종목 현황</h3>
          {portfolio.length === 0 ? (
            <div className="empty-state">
              <p>아직 추가된 종목이 없습니다</p>
              <button className="btn-primary" onClick={onAddStock}>+ 첫 종목 추가하기</button>
            </div>
          ) : (
            <div className="stock-summary-table">
              <div className="table-header">
                <span>종목</span>
                <span>현재가</span>
                <span>등락</span>
                <span>보유수량</span>
                <span>평가금액</span>
                <span>손익</span>
              </div>
              {portfolio.map((p, i) => {
                const val = (p.currentPrice || 0) * (p.quantity || 0);
                const cost = (p.avgPrice || 0) * (p.quantity || 0);
                const pnl = val - cost;
                const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
                return (
                  <div key={i} className="table-row">
                    <span className="col-symbol">
                      <strong>{p.symbol}</strong>
                      <small>{p.name}</small>
                    </span>
                    <span>{fmtPrice(p.currentPrice, p.currency)}</span>
                    <span className={p.changePercent >= 0 ? 'text-green' : 'text-red'}>
                      {p.changePercent != null
                        ? `${p.changePercent >= 0 ? '+' : ''}${p.changePercent.toFixed(2)}%`
                        : '-'}
                    </span>
                    <span>{p.quantity > 0 ? p.quantity.toLocaleString() + '주' : '-'}</span>
                    <span>{val > 0 ? val.toLocaleString() : '-'}</span>
                    <span className={pnl >= 0 ? 'text-green' : 'text-red'}>
                      {cost > 0
                        ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`
                        : '-'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
