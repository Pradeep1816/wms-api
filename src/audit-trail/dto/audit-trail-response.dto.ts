export interface AuditTrailActorDto {
  id: number;
  username: string | null;
  displayName: string;
}

export interface AuditTrailPaginationDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditTrailEntryListItemDto {
  id: number;
  happenedAt: string;
  happenedAtEpoch: number;
  action: 'create' | 'update' | 'delete' | string;
  modelType: string;
  modelName: string;
  recordLabel: string;
  foreignPk: Record<string, unknown>;
  changeKeys: string[];
  actor: AuditTrailActorDto | null;
  summary: string;
}

export interface AuditTrailEntryDetailDto extends AuditTrailEntryListItemDto {
  data: unknown;
  rawForeignPk: string;
  rawData: string | null;
}

export interface AuditTrailListResponseDto {
  body: AuditTrailEntryListItemDto[];
  pagination: AuditTrailPaginationDto;
}

export interface AuditTrailModelTypeDto {
  value: string;
  label: string;
  count: number;
}

