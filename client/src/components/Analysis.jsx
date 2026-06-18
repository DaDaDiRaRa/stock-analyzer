import { useState } from 'react';
import axios from 'axios';

export default function Analysis({ portfolio, marketData, apiBase }) {
  const [analysis, setAnalysis] = useState('');
  const [newsMap, setNewsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState(null);

  const runAnalysis = async () => {
    if (portfolio.length === 0) {
      setError('분석할 종목이 없습니다. 포트폴리오에 종목을 추가해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    setAnalysis('');
    setNewsMap({});
    setLoadingStep('📰 종목별 최신 뉴스 수집 중...');

    try {
      setLoadingStep('🤖 AI 분석 중... (20~30초 소요)');
      const res = await axios.post(`${apiBase}/analyze`, { portfolio, marketData });
      setAnalysis(res.data.analysis);
      setNewsMap(res.data.newsMap || {});
      setLastRun(new Date());
    } catch (err) {
      setError(err.response?.data?.error || 'AI 분석 중 오류가 발생했습니다.');
    }
    setLoading(false);
    setLoadingStep('');
  };

  const renderMarkdown = (text) => {
    return text
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[hul])(.+)$/gm, '$1')
      .replace(/^<p>$/, '')
      .replace(/^<\/p>$/, '');
  };

  const formatPubDate = (str) => {
    if (!str) return '';
    const d = new Date(str);
    return isNaN(d) ? str.slice(0, 10) : d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const totalValue = portfolio.reduce((s, p) => s + (p.currentPrice || 0) * (p.quantity || 0), 0);
  const totalCost  = portfolio.reduce((s, p) => s + (p.avgPrice || 0)   * (p.quantity || 0), 0);
  const totalPnl   = totalValue - totalCost;
  const hasNews    = Object.values(newsMap).some(n => n.length > 0);

  return (
    <div className="analysis-page">
      <div className="page-header">
        <h2>🤖 AI 종합 분석</h2>
        {lastRun && <span className="last-updated">마지막 분석: {lastRun.toLocaleTimeString('ko-KR')}</span>}
      </div>

      {/* 요약 카드 */}
      <div className="analysis-summary">
        <div className="summary-card">
          <span className="summary-label">보유 종목</span>
          <span className="summary-val">{portfolio.length}개</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">총 평가금액</span>
          <span className="summary-val">{totalValue > 0 ? totalValue.toLocaleString() : '-'}</span>
        </div>
        <div className={`summary-card ${totalPnl >= 0 ? 'pos' : 'neg'}`}>
          <span className="summary-label">총 손익</span>
          <span className="summary-val">
            {totalCost > 0 ? `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)}` : '-'}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">시장 데이터</span>
          <span className="summary-val">{marketData.length}개 지수</span>
        </div>
      </div>

      <div className="analysis-action">
        <button
          className={`btn-analyze ${loading ? 'loading' : ''}`}
          onClick={runAnalysis}
          disabled={loading}
        >
          {loading ? (
            <><span className="spinner" />{loadingStep}</>
          ) : (
            <>🤖 AI 종합 분석 시작</>
          )}
        </button>
        <p className="analysis-hint">
          Claude AI가 보유 종목의 <strong>최신 뉴스</strong>와 시장 데이터를 종합해<br />
          종목별 평가, 리스크, 투자 전략을 분석합니다.
        </p>
      </div>

      {error && (
        <div className="error-box">
          <strong>⚠️ 오류:</strong> {error}
          {error.includes('API 키') && (
            <div className="error-hint">
              <code>D:\APPS\stock-analyzer\.env</code> 파일에
              <code>ANTHROPIC_API_KEY=</code> 실제 키를 입력해주세요.
            </div>
          )}
        </div>
      )}

      {/* 뉴스 섹션 */}
      {hasNews && (
        <div className="news-section">
          <h3>📰 수집된 최신 뉴스</h3>
          <div className="news-stocks">
            {portfolio.map(p => {
              const items = newsMap[p.symbol] || [];
              if (!items.length) return null;
              return (
                <div key={p.symbol} className="news-stock-group">
                  <div className="news-stock-label">{p.name}</div>
                  {items.map((n, i) => (
                    <a
                      key={i}
                      href={n.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="news-item"
                    >
                      <div className="news-title">{n.title}</div>
                      <div className="news-meta">{formatPubDate(n.pubDate)}</div>
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 분석 결과 */}
      {analysis && (
        <div className="analysis-result">
          <div className="analysis-header">
            <h3>📋 분석 결과</h3>
            <button className="btn-copy" onClick={() => navigator.clipboard.writeText(analysis)}>
              📋 복사
            </button>
          </div>
          <div
            className="analysis-content"
            dangerouslySetInnerHTML={{ __html: '<p>' + renderMarkdown(analysis) + '</p>' }}
          />
        </div>
      )}

      {portfolio.length > 0 && !loading && !analysis && (
        <div className="portfolio-preview">
          <h3>분석 대상 종목</h3>
          <div className="preview-list">
            {portfolio.map((p, i) => {
              const pnlPct = p.avgPrice > 0 && p.currentPrice > 0
                ? ((p.currentPrice - p.avgPrice) / p.avgPrice) * 100 : null;
              return (
                <div key={i} className="preview-item">
                  <span className="preview-symbol">{p.symbol}</span>
                  <span className="preview-name">{p.name}</span>
                  <span className="preview-price">
                    {p.currentPrice ? p.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                  </span>
                  {pnlPct !== null && (
                    <span className={`preview-pnl ${pnlPct >= 0 ? 'pos' : 'neg'}`}>
                      {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
