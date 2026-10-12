export type ButtonValue = 'on' | 'off';
export type Source = 'guest' | 'staff' | 'system';

export interface Stay {
  id: number;
  nights: number;
  check_in: string; // AAAA-MM-JJ
  check_out: string;
}

export interface Voucher {
  id: number;
  stay_id: number;
  code: string;
  amount_eur: number;
  issued_at: string;
  status: 'emis' | 'remis' | 'annule';
}

export interface Room {
  number: number;
  floor: number;
  is_suite: boolean;
  state: ButtonValue;
  eligible: boolean;
  updated_at: string;
  updated_by: Source;
  actor: string | null;
  rev: number;
  stay: Stay | null;
  voucher: Voucher | null;
}

export interface RoomEvent {
  id: number;
  from_state: ButtonValue;
  to_state: ButtonValue;
  source: Source;
  actor: string;
  eligible: boolean;
  created_at: string;
}

export interface RoomDetail {
  room: Room;
  events: RoomEvent[];
  vouchers: Voucher[];
}

/** État affiché : jamais la seule couleur — chaque valeur a icône + libellé. */
export type DisplayState = 'on' | 'off' | 'inel' | 'free';

export function displayState(r: Room): DisplayState {
  if (r.state === 'on') return 'on';
  if (!r.stay) return 'free';
  return r.eligible ? 'off' : 'inel';
}

export type Conn = 'connecting' | 'live' | 'reconnecting';

export interface AppConfig {
  mode: 'demo' | 'production';
  hotel_name: string;
  minutes_per_cleaning: number;
  voucher_eur: number;
  min_nights: number;
}
