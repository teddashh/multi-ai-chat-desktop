import { DEFAULT_DOCK_CONSTRAINTS, clamp } from './dockLayout';

export const DEFAULT_FOCUS_PANE_WIDTH = 560;

export const DEFAULT_FOCUS_LAYOUT_CONSTRAINTS = {
  minFocusPaneWidth: 420,
  minCenterWidth: DEFAULT_DOCK_CONSTRAINTS.minCenterWidth,
  resizerWidth: DEFAULT_DOCK_CONSTRAINTS.resizerWidth,
};

export function clampFocusPaneWidth(
  width: number,
  containerWidth: number,
  constraints = DEFAULT_FOCUS_LAYOUT_CONSTRAINTS,
): number {
  const maxWidth = Math.max(
    constraints.minFocusPaneWidth,
    containerWidth - constraints.minCenterWidth - constraints.resizerWidth,
  );
  return clamp(Math.round(width), constraints.minFocusPaneWidth, maxWidth);
}

export function focusGridTemplateColumns(
  focusPaneWidth: number,
  constraints = DEFAULT_FOCUS_LAYOUT_CONSTRAINTS,
): string {
  return `${Math.round(focusPaneWidth)}px ${constraints.resizerWidth}px minmax(${constraints.minCenterWidth}px, 1fr)`;
}

export function dragFocusPaneWidth(startWidth: number, pointerDelta: number, minWidth: number, maxWidth: number): number {
  return clamp(Math.round(startWidth + pointerDelta), minWidth, maxWidth);
}

export function nonEmptyRect(rect: DOMRectReadOnly | null | undefined): DOMRectReadOnly | undefined {
  if (!rect || rect.width <= 0 || rect.height <= 0) return undefined;
  return rect;
}

export type CenterStagePresentationState = 'chip' | 'side' | 'center';
export type CenterStageWebviewState = 'none' | 'creating' | 'loaded';

export async function driveCenteredProviderToStage<TProvider extends string>({
  provider,
  presentation,
  webview,
  bounds,
  setBounds,
}: {
  provider: TProvider;
  presentation: CenterStagePresentationState;
  webview: CenterStageWebviewState;
  bounds: DOMRectReadOnly | null | undefined;
  setBounds: (provider: TProvider, bounds: DOMRectReadOnly) => Promise<unknown>;
}): Promise<void> {
  const rect = nonEmptyRect(bounds);
  if (presentation !== 'center' || webview !== 'loaded' || !rect) return;
  await setBounds(provider, rect);
}
