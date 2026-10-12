import type { Room, RoomEvent, Source, Stay } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function hhmm(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « lun. 12 oct. » */
export function dateLabel(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export const DateLabel = (d: Date) => cap(dateLabel(d));

/** Date ISO AAAA-MM-JJ (sans fuseau) → Date locale. */
export function parseDay(day: string): Date {
  const [y, m, dd] = day.split('-').map(Number);
  return new Date(y, m - 1, dd);
}

/** « Aujourd'hui », « Hier » ou « Sam. 10 oct. » */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return DateLabel(d);
}

/** « 08:42 » aujourd'hui, « Hier 16:02 » sinon. */
export function whenLabel(iso: string): string {
  const day = dayLabel(iso);
  return day === "Aujourd'hui" ? hhmm(iso) : `${day} ${hhmm(iso)}`;
}

export const nightsLabel = (n: number) => `${n} nuit${n > 1 ? 's' : ''}`;

/** Changement système initié par une personne (réception, départ, démo) plutôt qu'automatique. */
const MANUAL_SYSTEM = ['réception', 'départ', 'démo'];
const manualSystem = (actor: string | null) => !!actor && MANUAL_SYSTEM.some((p) => actor.startsWith(p));

/** Qui a fait le dernier changement, côté dashboard. */
export function byLabel(r: Pick<Room, 'updated_by' | 'actor'>): string {
  if (r.updated_by === 'guest') return 'Client';
  if (r.updated_by === 'staff') return 'Gouvernante';
  if (manualSystem(r.actor)) return cap(r.actor!.split(' · ')[0]);
  return 'Auto · arrivée';
}

/** Qui a fait le dernier changement, côté client (2e personne). */
export function guestByLabel(r: Pick<Room, 'updated_by' | 'actor'>): string {
  if (r.updated_by === 'guest') return 'par vous';
  if (r.updated_by === 'staff') return 'par la gouvernante';
  return manualSystem(r.actor) ? 'séjour mis à jour' : 'à votre arrivée';
}

export function eventSub(e: RoomEvent): string {
  const labels: Record<Source, string> = { guest: 'Client', staff: 'Gouvernante · Forcé à distance', system: '' };
  if (e.source !== 'system') return labels[e.source];
  return manualSystem(e.actor) ? cap(e.actor) : `Auto · ${e.actor}`;
}

/** « 14 oct. » */
export const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** « Lundi 12 octobre » */
const LONG_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const LONG_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const longDate = (d: Date) => cap(`${LONG_DAYS[d.getDay()]} ${d.getDate()} ${LONG_MONTHS[d.getMonth()]}`);

/** Vocabulaire des étages : arrivée, recouche, départ. */
export function stayStatus(stay: Stay, today = new Date()): { label: string; detail: string } {
  const day = 86_400_000;
  const t = startOfDay(today);
  const inD = parseDay(stay.check_in).getTime();
  const outD = parseDay(stay.check_out).getTime();
  const out = parseDay(stay.check_out);
  if (t >= outD) return { label: "Départ aujourd'hui", detail: `Séjour ${nightsLabel(stay.nights)}` };
  if (t < inD) return { label: `Arrivée ${dayMonth(parseDay(stay.check_in))}`, detail: `Séjour ${nightsLabel(stay.nights)}` };
  const night = Math.round((t - inD) / day) + 1;
  const departure = outD - t === day ? 'départ demain' : `départ ${dayMonth(out)}`;
  if (night === 1) return { label: 'Arrivée du jour', detail: `${nightsLabel(stay.nights)} · ${departure}` };
  return { label: `Recouche · nuit ${night} sur ${stay.nights}`, detail: cap(departure) };
}

/** « 1 h 40 », « 25 min » */
export function duration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
