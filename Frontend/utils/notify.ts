export type NotifyType = 'info' | 'success' | 'error';

export interface NotifyDetail {
  message: string;
  type?: NotifyType;
}

export function notify(message: string, type: NotifyType = 'info'): void {
  window.dispatchEvent(
    new CustomEvent('app-toast', { detail: { message, type } satisfies NotifyDetail })
  );
}
