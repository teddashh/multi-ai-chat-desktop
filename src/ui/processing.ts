export function processingAfterSend(): boolean {
  return true;
}

export function processingAfterWorkflowStatus(current: boolean, status: string): boolean {
  return status === '' ? false : current;
}

export function processingAfterSettle(): boolean {
  return false;
}
