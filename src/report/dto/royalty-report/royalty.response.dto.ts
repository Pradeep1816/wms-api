import { Type } from 'class-transformer';

interface RoyaltyReportMeta {
  startDate: string;
  endDate: string;
  location: string;
  calculationMode?: string;
  collectedTaxBreakdown?: { nonPos: string; pos: string; total: string };
}

export class RoyaltyResponseDto {
  @Type(() => Object)
  body: Record<string, unknown>;

  @Type(() => Object)
  meta: RoyaltyReportMeta;
}

export class RoyaltyAllLocationsItemDto {
  @Type(() => Object)
  body: Record<string, unknown>;

  @Type(() => Object)
  meta: RoyaltyReportMeta;
}

export class RoyaltyAllLocationsResponseDto {
  @Type(() => RoyaltyAllLocationsItemDto)
  body: RoyaltyAllLocationsItemDto[];

  @Type(() => Object)
  meta: { startDate: string; endDate: string; totalLocations: number };
}
