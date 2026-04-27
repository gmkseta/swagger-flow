# Swagger Flow - Chrome Extension

## Project Overview
- **Framework**: WXT (Chrome Extension MV3) + Preact + TypeScript
- **Purpose**: Swagger UI 기반 API 워크플로우 자동화 Chrome Extension
- **Auth**: Pluggable AuthProvider 패턴 (build-time `#auth-provider` alias)
- **Updates**: Pluggable UpdateProvider 패턴 (build-time `#update-provider` alias)

## Key Architecture
- `src/auth/provider.ts` — AuthProvider interface
- `src/auth/providers/noop.ts` — Default no-op auth provider
- `modules/auth-provider.ts` — WXT module (build-time auth provider resolution)
- `src/update/provider.ts` — UpdateProvider interface
- `src/update/providers/github.ts` — Default update provider (GitHub Releases)
- `modules/update-provider.ts` — WXT module (build-time update provider resolution)
- `src/utils/version-check.ts` — Provider-agnostic compare/orchestration
- `entrypoints/background.ts` — Service worker
- `src/components/layout/Shell.tsx` — 메인 레이아웃 (로그인 wall)
- `src/crypto/` — AES-256-GCM 암호화/복호화

## Auth Provider System
- Provider는 `AUTH_PROVIDER` env var 또는 `wxt.config.ts`의 `authProvider` 옵션으로 설정
- 기본값은 noop provider (로그인 불필요)
- Custom provider 구현은 `CLAUDE.local.md` 참조

## Update Provider System
- Provider는 `UPDATE_PROVIDER` env var 또는 `wxt.config.ts`의 `updateProvider` 옵션으로 설정
- 기본값은 GitHub Releases (`gmkseta/swagger-flow`) — public repo의 latest release zip asset 직접 링크
- Background에서 `chrome.alarms`로 6시간마다 체크, 결과 `chrome.storage.local._update_state`에 저장
- 새 버전 발견 시 Shell 상단에 banner 표시
- Custom provider 구현은 `CLAUDE.local.md` 참조

## Release
- **Public**: `npm run release` → tag push + `gh release create` (asset = WXT zip 결과)
- 자세한 옵션: `bash scripts/release.sh --help`
