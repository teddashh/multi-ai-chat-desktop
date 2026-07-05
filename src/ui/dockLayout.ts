export interface ColumnWidths {
  left: number;
  right: number;
}

export interface DockConstraints {
  minProviderWidth: number;
  maxProviderWidth: number;
  minCenterWidth: number;
  resizerWidth: number;
}

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { left: 280, right: 280 };

export const DEFAULT_DOCK_CONSTRAINTS: DockConstraints = {
  minProviderWidth: 200,
  maxProviderWidth: 520,
  minCenterWidth: 360,
  resizerWidth: 6,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function dragColumnWidth(startWidth: number, pointerDelta: number, minWidth: number, maxWidth: number): number {
  return clamp(Math.round(startWidth + pointerDelta), minWidth, maxWidth);
}

export function maxProviderWidth(containerWidth: number, oppositeWidth: number, constraints = DEFAULT_DOCK_CONSTRAINTS): number {
  const available = containerWidth - oppositeWidth - constraints.minCenterWidth - constraints.resizerWidth * 2;
  return Math.max(constraints.minProviderWidth, Math.min(constraints.maxProviderWidth, available));
}

export function clampColumnWidths(
  widths: ColumnWidths,
  containerWidth: number,
  constraints = DEFAULT_DOCK_CONSTRAINTS,
): ColumnWidths {
  const right = clamp(
    Math.round(widths.right),
    constraints.minProviderWidth,
    maxProviderWidth(containerWidth, widths.left, constraints),
  );
  const left = clamp(
    Math.round(widths.left),
    constraints.minProviderWidth,
    maxProviderWidth(containerWidth, right, constraints),
  );
  return { left, right };
}

export function gridTemplateColumns(widths: ColumnWidths, constraints = DEFAULT_DOCK_CONSTRAINTS): string {
  return `${Math.round(widths.left)}px ${constraints.resizerWidth}px minmax(${constraints.minCenterWidth}px, 1fr) ${
    constraints.resizerWidth
  }px ${Math.round(widths.right)}px`;
}
