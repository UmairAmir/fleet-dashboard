export interface TruckRecord {
  tracker_id: string;
  name: string | null;
  address?: string | null;
  st?: string;
  ststr?: string;
  [key: string]: unknown;
}

export interface FleetSnapshot {
  fetched_at: string;
  trucks: TruckRecord[];
}
