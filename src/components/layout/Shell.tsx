import type { ComponentChildren } from 'preact';
import { useSpec } from '../../hooks/useSpec';
import { EnvSwitcher } from '../env/EnvSwitcher';
import { useAuthProvider } from '../../hooks/useAuthProvider';

export function Shell({ children }: { children: ComponentChildren }) {
  const { spec, loading } = useSpec();
  const { user, loading: authLoading, encrypted, pending, login, logout, requiresLogin } = useAuthProvider();
  const specCount = Array.isArray((spec?.spec as any)?.specs) ? (spec?.spec as any).specs.length : 1;

  return (
    <div class="flex flex-col h-screen bg-gray-50 text-gray-900 text-sm">
      {/* Header */}
      <header class="bg-indigo-600 text-white px-3 py-2 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-base font-bold">⚡ Swagger Flow</span>
          <button
            onClick={() => location.reload()}
            class="text-indigo-300 hover:text-white text-xs px-1"
            title="새로고침"
          >
            ↻
          </button>
        </div>
        <div class="flex items-center gap-2">
          {/* Auth Status (hidden when provider doesn't require login) */}
          {requiresLogin && (
            authLoading ? (
              <span class="text-[10px] text-indigo-200">...</span>
            ) : pending ? (
              <span class="text-[10px] text-yellow-300 animate-pulse" title="Login in progress...">
                🔄 로그인 중...
              </span>
            ) : user ? (
              <div class="flex items-center gap-1.5">
                {encrypted && (
                  <span class="text-[10px] text-green-300" title="Data encrypted">🔒</span>
                )}
                <span class="text-[10px] text-indigo-200 max-w-[80px] truncate" title={user.email}>
                  {user.name || user.email}
                </span>
                <button
                  onClick={logout}
                  class="text-[10px] text-indigo-300 hover:text-white px-1"
                  title="Logout"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                class="text-[10px] bg-indigo-500 hover:bg-indigo-400 px-2 py-0.5 rounded"
                title="Login with SSO to encrypt data"
              >
                🔓 Login
              </button>
            )
          )}
          <EnvSwitcher />
        </div>
      </header>

      {/* Spec Banner */}
      {loading && (
        <div class="bg-indigo-50 px-3 py-1.5 text-indigo-700 text-xs">
          Detecting API spec...
        </div>
      )}
      {spec && !loading && (
        <div class="bg-indigo-50 px-3 py-1.5 text-xs flex items-center gap-2 border-b border-indigo-100">
          <span class="inline-block w-2 h-2 rounded-full bg-green-500" />
          <span class="font-medium truncate">{spec.title}</span>
          {spec.version && (
            <span class="text-indigo-500">v{spec.version}</span>
          )}
          {specCount > 1 && (
            <span class="text-indigo-500">{specCount} specs</span>
          )}
          <span class="text-indigo-400 ml-auto">
            {spec.endpoints.length} endpoints
          </span>
        </div>
      )}
      {!spec && !loading && (
        <div class="bg-amber-50 px-3 py-1.5 text-amber-700 text-xs border-b border-amber-100">
          No Swagger/OpenAPI page detected. Navigate to a Swagger UI page.
        </div>
      )}

      {/* Content: require login only when provider demands it */}
      {authLoading ? (
        <div class="flex-1 flex items-center justify-center text-gray-400 text-xs">
          Loading...
        </div>
      ) : requiresLogin && !user ? (
        <div class="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
          <span class="text-3xl">🔒</span>
          <p class="text-sm font-medium">로그인이 필요합니다</p>
          {pending ? (
            <span class="text-xs text-yellow-600 animate-pulse">로그인 탭에서 로그인을 완료해주세요...</span>
          ) : (
            <p class="text-xs text-gray-400">우측 상단 Login 버튼을 눌러주세요</p>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
