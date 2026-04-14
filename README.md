# Swagger Flow

Swagger UI 기반 API 워크플로우 자동화 Chrome Extension.

## Features

- **Shortcut**: Swagger UI API 요청을 숏컷으로 저장하고 한 번에 실행
- **Flow Execution**: 여러 API를 순차적으로 체이닝하여 워크플로우 자동화
- **History**: 실행 이력 조회 및 재실행
- **Swagger Detection**: 현재 탭의 Swagger UI 자동 감지
- **Encrypted Storage**: AES-256-GCM으로 IndexedDB 데이터 암호화

## Tech Stack

- [WXT](https://wxt.dev/) — Chrome Extension (MV3) 프레임워크
- [Preact](https://preactjs.com/) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Dexie.js](https://dexie.org/) — IndexedDB wrapper
- [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/) — 테스트

## Project Structure

```
entrypoints/
  background.ts          # Service worker, SSO message handlers
  content.ts             # Content script
  interceptor.content.ts # API request interceptor
  sidepanel/             # Side panel UI
src/
  auth/                  # SSO 인증 (Kakao SSO → encryption key)
  components/            # Preact UI 컴포넌트
  db/                    # Dexie.js IndexedDB 스키마
  detection/             # Swagger UI 감지
  engine/                # Flow 실행 엔진
  hooks/                 # Preact hooks
  storage/               # 암호화 스토리지
  utils/                 # 유틸리티
```

## Getting Started

```bash
# 의존성 설치
npm install

# 개발 모드 (hot reload)
npm run dev

# 빌드
npm run build

# 타입 체크
npm run check
```

## Testing

```bash
npm test            # unit tests (vitest)
npm run test:e2e    # e2e tests (playwright)
npm run test:all    # 전체 테스트
```

## Install Extension

1. `npm run build`
2. Chrome → `chrome://extensions` → 개발자 모드 ON
3. "압축해제된 확장 프로그램을 로드합니다" → `output/chrome-mv3` 폴더 선택

## Custom Auth Provider

기본 빌드는 **로그인 없는 noop provider** 로 동작합니다 (모든 데이터는 평문 IndexedDB).
사내 SSO 같은 자체 인증/암호화를 붙이려면 빌드 시 `AUTH_PROVIDER` env 변수로 provider 소스를 지정하세요.

### 사용법

| `AUTH_PROVIDER` 값 | 동작 |
|---|---|
| *(unset)* | 기본 `noop` provider — 로그인 없음, 암호화 없음 |
| `./path/to/file.ts` | 프로젝트 루트 기준 로컬 TypeScript 파일 사용 |
| `git+ssh://...` / `git@...:x.git` / `*.git` | git repo 를 `.auth-cache/repo/` 로 clone (이미 있으면 `pull`) |
| `https://.../auth.ts` | 단일 파일을 `.auth-cache/remote.ts` 로 curl fetch |

```bash
# 기본 — 오픈소스 배포본
npm run build

# 로컬 파일 (gitignore 된 자체 구현)
AUTH_PROVIDER=./my-auth.ts npm run build

# 사내 private git repo
AUTH_PROVIDER=git+ssh://git@github.company.com/org/swagger-flow-auth.git npm run build

# gist/raw URL 한 줄 배포
AUTH_PROVIDER=https://gist.githubusercontent.com/you/abc/raw/auth.ts npm run build
```

캐시 디렉토리 `.auth-cache/` 는 자동 생성되며 `.gitignore` 에 포함되어 있습니다.

### AuthProvider 인터페이스

외부 파일/repo 는 반드시 `provider` 라는 이름으로 `AuthProvider` 객체를 export 해야 합니다.

```ts
// src/auth/provider.ts 참고
export interface AuthUser {
  userId: string;
  email?: string;
  name?: string;
  encryptionKey?: string; // 있으면 AES-256-GCM 암호화 활성화
}

export interface AuthProvider {
  type: string;                // 'kakao-sso' 등 식별자
  requiresLogin: boolean;      // true → Shell 에 로그인 wall 표시
  checkLogin(): Promise<AuthUser | null>;
  login(): Promise<{ user: AuthUser | null; pending?: boolean }>;
  logout(): Promise<void>;
  getCachedUser(): Promise<AuthUser | null>;
}
```

### 구현 예시

```ts
// my-auth.ts
import type { AuthProvider } from './src/auth/provider';

export const provider: AuthProvider = {
  type: 'my-sso',
  requiresLogin: true,

  async checkLogin() {
    const res = await fetch('https://sso.example.com/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      userId: data.id,
      email: data.email,
      name: data.name,
      encryptionKey: data.encryptionKey, // 서버에서 받은 UUID — DB 암호화에 사용
    };
  },

  async login() {
    // 팝업/탭 오픈 후 pending 반환, checkLogin 이 성공할 때까지 자동 polling
    window.open('https://sso.example.com/login', '_blank');
    return { user: null, pending: true };
  },

  async logout() {
    await fetch('https://sso.example.com/logout', { method: 'POST', credentials: 'include' });
  },

  async getCachedUser() {
    // chrome.storage 에 캐시된 user (encryptionKey 제외) 반환
    const { _auth_user } = await chrome.storage.local.get('_auth_user');
    return _auth_user ?? null;
  },
};
```

### Git repo 컨벤션

`AUTH_PROVIDER` 가 git URL 인 경우 entry 파일은 다음 순서로 resolve 됩니다:

1. repo 루트 `package.json` 의 `"main"` 필드
2. `src/index.ts`
3. `index.ts`

어느 것에서도 `export const provider: AuthProvider` 를 찾을 수 있어야 합니다.
