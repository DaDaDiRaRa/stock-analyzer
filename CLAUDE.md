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
| `FINNHUB_API_KEY` | Finnhub (미국 주식/ETF 뉴스) |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage (뉴스 감성 분석) |
| `DART_API_KEY` | DART 전자공시 (한국 기업 공시) |
| `NEWS_API_KEY` | NewsAPI.org (한국어 글로벌 뉴스) |
| `GOOGLE_SHEET_ID` | Google Sheets ID (포트폴리오 영구 저장) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | 서비스 계정 JSON base64 인코딩 값 |

## 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/quotes` | 주식/ETF 시세 (Yahoo Finance) |
| GET | `/api/market` | 주요 지수 현황 |
| GET | `/api/chart/:symbol` | 차트 데이터 (1mo/3mo/6mo/1y) |
| GET | `/api/search` | 종목 검색 (한국/미국 DB) |
| GET | `/api/db-status` | 종목 DB 로드 상태 |
| GET | `/api/fund/search` | 펀드 검색 (코드 `K55...` 직접 입력 지원) |
| GET | `/api/fund/expand-classes` | 펀드 클래스 자동 확장 (Naver AC 10개 한도 우회) |
| GET | `/api/fund/price` | 펀드 기준가 (네이버 증권 스크래핑) |
| GET | `/api/sheets/load` | Google Sheets에서 포트폴리오 불러오기 |
| POST | `/api/sheets/save` | Google Sheets에 포트폴리오 저장 (현재가·평가금액·비중 자동 계산) |
| POST | `/api/analyze` | Claude AI 포트폴리오 분석 |

## 데이터 소스

| 종목 유형 | 시세 | AI 분석용 데이터 |
|-----------|------|-----------------|
| 미국 주식/ETF | Yahoo Finance (`yahoo-finance2`) | Finnhub 뉴스 (14일) + Alpha Vantage 감성 분석 배치 |
| 한국 주식 | 네이버 금융 스크래핑 (euc-kr → iconv-lite) | DART 전자공시 (30일) + NewsAPI.org (ko) |
| 펀드 | 네이버 증권 API | 네이버 펀드 편입종목 look-through + 네이버 뉴스 |

- **AI 분석 모델**: `claude-sonnet-4-6` — 3M/6M 시나리오 예측 (강세/기본/약세)
- Alpha Vantage는 모든 미국 종목을 한 번의 API 호출로 배치 처리 (쿼터 절약)

## 포트폴리오 상태

- **Google Sheets 양방향 동기화** + `localStorage` 백업
  - 앱 시작 시 Sheets에서 자동 로드
  - 시세 갱신 30초마다 Sheets에 자동 저장 (현재가·평가금액·수익률·비중 갱신)
  - 헤더 `📊 Sheets` 버튼: 시트에서 직접 수정한 내용 즉시 반영
- 종목 타입: `KR` (한국주식), `US` (미국주식), `ETF`, `FUND` (펀드)

## Google Sheets 연동

**시트 구조** (4개 탭):

| 시트 | 사용자 입력 열 | 자동 계산 열 |
|------|---------------|-------------|
| `한국주식` | 종목코드(`.KS`/`.KQ`), 종목명, 수량, 평균가 | 현재가, 평가금액, 손익, 수익률, 비중 |
| `미국주식_ETF` | 티커, 종목명, 종류(EQUITY/ETF), 수량, 평균가($) | 현재가, 평가금액, 손익, 수익률, 비중 |
| `ISA펀드` | 펀드코드(`K55...`), 펀드명, 좌수, 평균가 | 기준가, 평가금액, 손익, 수익률, 비중 |
| `요약` | — | 자산유형별 합계, 비중, 업데이트 시각 |

- **인증**: GCP 서비스 계정 (시트를 서비스 계정 이메일과 공유 필요)
- **비중 계산**: 원화 자산(한국주식+펀드)과 달러 자산(미국주식/ETF) 분리

## 펀드 검색 동작

Naver AC API의 10개 한도와 prefix-only 매칭 한계가 있어 두 가지로 보강:

1. **코드 직접 입력**: 검색어가 `K55...` 형식이면 Naver fund detail API로 바로 조회
2. **클래스 자동 확장**: 검색 결과가 10개일 때 "🔍 같은 펀드의 다른 클래스 찾기" 버튼 → 인접 코드 250개 병렬 스캔으로 C-W·S-P 등 누락된 클래스 발견

## GitHub Actions 시크릿 설정

GCP 배포를 위해 레포 Settings → Secrets에 필요:

- `GCP_PROJECT_ID`
- `GCP_SA_KEY` (서비스 계정 JSON)
- `ANTHROPIC_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `FINNHUB_API_KEY`
- `ALPHA_VANTAGE_API_KEY`
- `DART_API_KEY`
- `NEWS_API_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_KEY` (서비스 계정 JSON을 base64 인코딩한 값)

## GCP 인프라

- **리전**: `asia-northeast3` (서울)
- **Artifact Registry 레포**: `stock-analyzer` (Docker 형식)
  - 이미지 경로: `asia-northeast3-docker.pkg.dev/{PROJECT_ID}/stock-analyzer/stock-analyzer`
  - 최초 배포 전 GCP 콘솔에서 수동 생성 필요
- **서비스 계정 필요 역할**:
  - Artifact Registry 관리자
  - Cloud Run 배포자
  - 서비스 계정 사용자
  - 스토리지 관리자
