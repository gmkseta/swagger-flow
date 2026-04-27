// Chrome extension message passing helpers

export type MessageType =
  | 'SWAGGER_DETECTED'
  | 'SPEC_PARSED'
  | 'EXECUTE_REQUEST'
  | 'EXECUTE_RESPONSE'
  | 'GET_ACTIVE_SPEC'
  | 'OPEN_SIDEPANEL'
  | 'SWAGGER_REQUEST_CAPTURED'
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_GET_STATUS'
  | 'GET_UPDATE_INFO'
  | 'TRIGGER_UPDATE_CHECK'
  | 'DISMISS_UPDATE';

export interface Message<T = any> {
  type: MessageType;
  payload: T;
}

export interface DetectedPayload {
  url: string;
  specUrl: string | null;
  specUrls?: { url: string; name?: string }[] | null;
  configUrl?: string | null;
  title: string;
  version: string;
  spec: object | null;
}

export interface ExecuteRequestPayload {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ExecuteResponsePayload {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
}

// Send message from content script / sidepanel to background
export function sendMessage<T = any>(msg: Message): Promise<T> {
  return chrome.runtime.sendMessage(msg);
}

// Send message to a specific tab's content script
export function sendToTab<T = any>(tabId: number, msg: Message): Promise<T> {
  return chrome.tabs.sendMessage(tabId, msg);
}

// Listen for messages
export function onMessage(
  handler: (
    msg: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => boolean | void,
) {
  chrome.runtime.onMessage.addListener(handler);
}
