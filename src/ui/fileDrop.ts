import type { FileLike } from './fileInsert';

type DataTransferTypes = DOMStringList | readonly string[];

export interface DataTransferLike<TFile extends FileLike = File> {
  types?: DataTransferTypes;
  files?: ArrayLike<TFile> | null;
  dropEffect?: DataTransfer['dropEffect'];
}

export interface DragEventLike<TFile extends FileLike = File> {
  dataTransfer: DataTransferLike<TFile> | null;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface FileDragGuardEventLike<TFile extends FileLike = File> {
  type: string;
  dataTransfer: DataTransferLike<TFile> | null;
  defaultPrevented: boolean;
  preventDefault(): void;
}

export function isOsFileDrag(dataTransfer: Pick<DataTransferLike, 'types'> | null | undefined): boolean {
  if (!dataTransfer?.types) return false;
  return dataTransferTypeList(dataTransfer.types).includes('Files');
}

export function filesFromDataTransfer<TFile extends FileLike = File>(dataTransfer: Pick<DataTransferLike<TFile>, 'files'>): TFile[] {
  return dataTransfer.files ? Array.from(dataTransfer.files) : [];
}

export function preventFileDragDefaults(event: DragEventLike): void {
  event.preventDefault();
  event.stopPropagation();
}

export function markFileDragCopy(event: DragEventLike, enabled = true): void {
  preventFileDragDefaults(event);
  if (event.dataTransfer) event.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
}

export function makeFileDragGuard(): (event: FileDragGuardEventLike) => void {
  return (event) => {
    if (event.defaultPrevented || !isOsFileDrag(event.dataTransfer)) return;

    event.preventDefault();
    if (event.type === 'dragover' && event.dataTransfer) {
      event.dataTransfer.dropEffect = 'none';
    }
  };
}

function dataTransferTypeList(types: DataTransferTypes): string[] {
  if (!isDomStringList(types)) return Array.from(types);

  const values: string[] = [];
  for (let index = 0; index < types.length; index += 1) {
    const value = types[index] ?? types.item(index);
    if (value) values.push(value);
  }
  return values;
}

function isDomStringList(types: DataTransferTypes): types is DOMStringList {
  return 'item' in types;
}
