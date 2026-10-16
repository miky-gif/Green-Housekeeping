export type ButtonValue = 'on' | 'off';
export type Source = 'guest' | 'staff' | 'system';

export interface Stay {
  id: number;
  nights: number;
  check_in: string; // AAAA-MM-JJ (date de l'hôtel)
  check_out: string;
}

export interface Voucher {
  id: number;
  stay_id: number;
  code: string;
  amount_eur: number;
  issued_at: string;
  status: 'emis' | 'remis' | 'annule';
  delivered_at: string | null;
}

/** État public d'une chambre, diffusé en temps réel. */
export interface Room {
  number: number;
  floor: number;
  is_suite: boolean;
  room_type: string;
  state: ButtonValue;
  eligible: boolean;
  updated_at: string;
  updated_by: Source;
  actor: string | null;
  rev: number;
  stay: Stay | null;
  voucher: { id: number; status: Voucher['status']; issued_at: string } | null;
}

export interface RoomEvent {
  id: number;
  room?: number;
  from_state: ButtonValue;
  to_state: ButtonValue;
  source: Source;
  actor: string;
  user_name: string | null;
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
  timezone: string;
  drink_message: string;
  min_nights: number;
  setup_required?: boolean;
}

export interface User {
  id: number;
  email: string;
  name: string;
  title: string;
  role: 'admin' | 'member';
  temporary_password?: string | null;
}

export interface ProgramSettings {
  min_nights: number;
  default_on_arrival: boolean;
  staff_force: boolean;
  drink_place: string;
  drink_pickup: string;
  drink_message: string;
  notify_bar: boolean;
  ratio_water_l: number | null;
  ratio_energy_kwh: number | null;
  ratio_products_ml: number | null;
  notify_cleaning_request: boolean;
  notify_force_by_other: boolean;
  daily_email: boolean;
  hotel_address: string;
  total_rooms: number;
  certifications: string[];
}

export interface Stats {
  days: number;
  history_days: number;
  series: { date: string; avoided: number; today: boolean }[];
  total_avoided: number;
  avg_per_day: number;
  counts: Record<DisplayState, number>;
  eligible: number;
  on_eligible: number;
  adoption: number | null;
  delta_vs_yesterday: number;
  drinks_to_collect: number;
  floors: { floor: number; rooms: number; eligible: number; on: number }[];
  impact: { water_l: number | null; energy_kwh: number | null; products_ml: number | null } | null;
}
