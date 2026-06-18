# Stock Analyzer — Claude Code Guide

## 프로젝트 개요

AI 기반 주식 포트폴리오 분석 앱. 한국/미국 주식·ETF·펀드를 관리하고, Claude AI로 포트폴리오를 분석해준다.

## 아키텍처

```
stock-analyzer/
├── server.js          # Express 백엔드 (단일 파일)
├── client/            # React + Vite 프론트엔드
│   └── src/
│       ├── App.jsx                    # 라우팅, 전역 상태, 30초 자동 갱신
│       └── components/
│           ├── Dashboard.jsx          # 포트폴리오 요약 + 시장 지수
│           ├── Portfolio.jsx          # 종목 목록, 수량/평균가 편집
│           ├── Market.jsx             # 주요 지수 현황
│           ├── Analysis.jsx           # Claude AI 분석 탭
│           └── StockSearch.jsx        # 종목 검색 모달
├── .github/workflows/deploy.yml       # GCP Cloud Run 자동 배포
└── Dockerfile                         # 2-stage 빌드 (builder + prod)
```

## 개발 서버 실행

터미널 두 개 필요:

```bash
# 백엔드 (포트 3001)
node server.js

# 프론트엔드 (포트 5173)
cd client && npm run dev
```

프론트엔드 `vite.config.js`에서 `/api` → `http://localhost:3001` 프록시 설정되어 있음.

## 빌드 & 배포

```bash
# 로컬 빌드 확인
npm run build          # client/dist 생성

# Docker 빌드 (2-stage)
docker build -t stock-analyzer .
docker run -p 8080:8080 --env-file .env stock-analyzer
```

main 브랜치 push 시 GitHub Actions가 자동으로 GCP Cloud Run에 배포.

## 환경 변수

`.env` 파일 필요 (`.env.example` 참고):

| 변수 | 설명 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `NAVER_CLIENT_ID` | 네이버 오픈API (뉴스 검색) |
| `NAVER_CLIENT_SECRET` | 네이버 오픈API |
| `PORT` | 서버 포트 (기본 3001, Cloud Run은 8080 자동 주입) |

## 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/quotes` | 주식/ETF 시세 (Yahoo Finance) |
| GET | `/api/market` | 주요 지수 현황 |
| GET | `/api/fund/price` | 펀드 기준가 (네이버 증권 스크래핑) |
| GET | `/api/search` | 종목 검색 (한국/미국) |
| POST | `/api/analyze` | Claude AI 포트폴리오 분석 |

## 데이터 소스

- **미국 주식/ETF**: Yahoo Finance (`yahoo-finance2`)
- **한국 주식**: 네이버 금융 스크래핑 (euc-kr 인코딩 → iconv-lite 변환)
- **펀드**: 네이버 증권 API
- **AI 분석**: Anthropic Claude API (`@anthropic-ai/sdk`)

## 포트폴리오 상태

- `localStorage`에 저장 (브라우저 로컬, 서버 DB 없음)
- 시세는 30초마다 자동 갱신 (`REFRESH_INTERVAL = 30000`)
- 종목 타입: `KR` (한국주식), `US` (미국주식), `ETF`, `FUND` (펀드)

## GitHub Actions 시크릿 설정

GCP 배포를 위해 레포 Settings → Secrets에 필요:

- `GCP_PROJECT_ID`
- `GCP_SA_KEY` (서비스 계정 JSON)
- `ANTHROPIC_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
