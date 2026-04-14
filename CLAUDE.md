# Swagger Flow - Chrome Extension

## Project Overview
- **Framework**: WXT (Chrome Extension MV3) + Preact + TypeScript
- **Purpose**: Swagger UI 기반 API 워크플로우 자동화 Chrome Extension
- **Auth**: Pluggable AuthProvider 패턴 (build-time `#auth-provider` alias)

## Key Architecture
- `src/auth/provider.ts` — AuthProvider interface
- `src/auth/noop-provider.ts` — Default no-op provider
- `modules/auth-provider.ts` — WXT module (build-time provider resolution)
- `entrypoints/background.ts` — Service worker
- `src/components/layout/Shell.tsx` — 메인 레이아웃 (로그인 wall)
- `src/crypto/` — AES-256-GCM 암호화/복호화

## Auth Provider System
- Provider는 `AUTH_PROVIDER` env var 또는 `wxt.config.ts`의 `authProvider` 옵션으로 설정
- 기본값은 noop provider (로그인 불필요)
- Custom provider 구현은 `CLAUDE.local.md` 참조
