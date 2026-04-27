import { useUpdateInfo } from '../../hooks/useUpdateInfo';

export function UpdateBanner() {
  const { state, checking, refresh, dismiss, shouldShowBanner } = useUpdateInfo();

  if (!shouldShowBanner || !state) return null;

  if (state.status === 'unauthenticated') {
    return (
      <div class="bg-amber-50 px-3 py-1.5 text-amber-700 text-xs border-b border-amber-100 flex items-center gap-2">
        <span>🔐</span>
        <span class="flex-1">
          업데이트 확인을 위해 로그인이 필요합니다.
        </span>
        {state.loginUrl && (
          <button
            onClick={() => chrome.tabs.create({ url: state.loginUrl! })}
            class="text-amber-700 underline hover:text-amber-900"
          >
            로그인
          </button>
        )}
        <button
          onClick={refresh}
          disabled={checking}
          class="text-amber-700 hover:text-amber-900 disabled:opacity-50"
          title="다시 확인"
        >
          {checking ? '...' : '↻'}
        </button>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div class="bg-rose-50 px-3 py-1.5 text-rose-700 text-xs border-b border-rose-100 flex items-center gap-2">
        <span>⚠</span>
        <span class="flex-1 truncate" title={state.errorMessage}>
          업데이트 확인 실패: {state.errorMessage ?? '알 수 없는 오류'}
        </span>
        <button
          onClick={refresh}
          disabled={checking}
          class="text-rose-700 hover:text-rose-900 disabled:opacity-50"
        >
          {checking ? '...' : '재시도'}
        </button>
      </div>
    );
  }

  if (state.status === 'update-available' && state.latest) {
    return (
      <div class="bg-emerald-50 px-3 py-1.5 text-emerald-800 text-xs border-b border-emerald-100 flex items-center gap-2">
        <span>✨</span>
        <span class="flex-1 truncate">
          새 버전 <strong>v{state.latest.version}</strong> 사용 가능
          {state.current && (
            <span class="text-emerald-600"> (현재 v{state.current})</span>
          )}
        </span>
        <button
          onClick={() => chrome.tabs.create({ url: state.latest!.downloadUrl })}
          class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded"
        >
          받기
        </button>
        <button
          onClick={dismiss}
          class="text-emerald-700 hover:text-emerald-900"
          title="이 버전 알림 숨기기"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}
