import type { Room, RoomEvent, Source } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const toDate = (v: string | Date) => (typeof v === 'string' ? new Date(v) : v);

export function hhmm(v: string | Date): string {
  const d = toDate(v);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function daysAgo(v: string | Date): number {
  return Math.round((startOfDay(new Date()) - startOfDay(toDate(v))) / 86_400_000);
}

/** « Jeu. 15 oct · 15:14 » */
export function topbarDate(d: Date): string {
  return `${cap(DAYS[d.getDay()].slice(0, 3))}. ${d.getDate()} ${MONTHS_SHORT[d.getMonth()].replace('.', '')} · ${hhmm(d)}`;
}

/** Date AAAA-MM-JJ (sans fuseau) → Date locale. */
export function parseDay(day: string): Date {
  const [y, m, dd] = day.split('-').map(Number);
  return new Date(y, m - 1, dd);
}

/** « 14 oct. » */
export const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;

/** « Lun », « Mar »… pour l'axe des graphiques. */
export const weekdayShort = (day: string) => DAYS_SHORT[parseDay(day).getDay()];

/** « Aujourd'hui · jeudi 15 octobre », « Hier · mercredi 14 octobre », « Lundi 12 octobre » */
export function dayHeader(v: string | Date): string {
  const d = toDate(v);
  const label = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const ago = daysAgo(d);
  if (ago === 0) return `Aujourd’hui · ${label}`;
  if (ago === 1) return `Hier · ${label}`;
  return cap(label);
}

/** « 15:02 » aujourd'hui, sinon « 14 oct ». */
export function journalWhen(v: string): string {
  return daysAgo(v) === 0 ? hhmm(v) : `${toDate(v).getDate()} ${MONTHS_SHORT[toDate(v).getMonth()].replace('.', '')}`;
}

export const nightsLabel = (n: number) => `${n} nuit${n > 1 ? 's' : ''}`;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const BY: Record<Source, string> = { guest: 'par le client', staff: 'par la gouvernante', system: 'par le système' };

/** « Modifié à 09:12 par le client », « Modifié hier à 22:40 par le client » */
export function modifiedLine(r: Pick<Room, 'updated_at' | 'updated_by'>): string {
  const ago = daysAgo(r.updated_at);
  const when = ago === 0 ? `à ${hhmm(r.updated_at)}` : ago === 1 ? `hier à ${hhmm(r.updated_at)}` : `le ${dayMonth(toDate(r.updated_at))}`;
  return `Modifié ${when} ${BY[r.updated_by]}`;
}

/** « 09:12 · par le client » (vue liste) */
export function changeShort(r: Pick<Room, 'updated_at' | 'updated_by'>): string {
  const ago = daysAgo(r.updated_at);
  return `${ago === 0 ? '' : ago === 1 ? 'hier ' : `${dayMonth(toDate(r.updated_at))} `}${hhmm(r.updated_at)} · ${BY[r.updated_by]}`;
}

const kind = (e: RoomEvent) => e.actor.split(' · ')[0];

/** Libellé d'un événement (Historique, Journal). */
export function eventTitle(e: RoomEvent): string {
  const on = e.to_state === 'on';
  if (e.source === 'guest') return on ? 'Le client renonce au nettoyage' : 'Le client demande son nettoyage';
  if (e.source === 'staff') return on ? 'Forcée sans nettoyage' : 'Nettoyage rétabli';
  switch (kind(e)) {
    case 'arrivée':
      return on ? 'Arrivée — bouton allumé par défaut' : e.eligible ? 'Arrivée — bouton éteint' : 'Arrivée — séjour d’une nuit';
    case 'départ':
      return 'Départ — chambre libérée';
    case 'réception':
      return on ? 'Séjour prolongé — bouton allumé' : e.eligible ? 'Séjour modifié' : 'Séjour raccourci — option fermée';
    case 'règles':
      return on ? 'Règles modifiées — chambre éligible' : 'Règles modifiées — option fermée';
    default:
      return 'Changement automatique';
  }
}

/** Ligne d'« Activité du jour » : « Chambre 1802 forcée sans nettoyage par la gouvernante ». */
export function activityLine(e: RoomEvent): string {
  const n = e.room;
  const on = e.to_state === 'on';
  if (e.source === 'guest') return `Chambre ${n} — le client ${on ? 'renonce au nettoyage' : 'demande son nettoyage'}`;
  if (e.source === 'staff') return on ? `Chambre ${n} forcée sans nettoyage par la gouvernante` : `Chambre ${n} — nettoyage rétabli par la gouvernante`;
  switch (kind(e)) {
    case 'arrivée':
      return on ? `Chambre ${n} — arrivée, bouton allumé par le système` : `Chambre ${n} — arrivée, séjour ${e.eligible ? 'éligible' : 'd’une nuit'}`;
    case 'départ':
      return `Chambre ${n} — départ, chambre libérée`;
    default:
      return `Chambre ${n} — ${eventTitle(e).toLowerCase()}`;
  }
}

/** Auteur affiché : « Client », « Élodie Martens », « Système ». */
export function authorLabel(e: RoomEvent): string {
  if (e.source === 'guest') return 'Client';
  if (e.source === 'staff') return e.user_name ?? 'Gouvernante';
  return 'Système';
}

/** Sous-ligne du Journal : « Gouvernante · Élodie Martens », « Système », « Client ». */
export function journalSub(e: RoomEvent): string {
  if (e.source === 'guest') return 'Client';
  if (e.source === 'staff') return e.user_name ? `Gouvernante · ${e.user_name}` : 'Gouvernante';
  return e.user_name ? `Système · saisi par ${e.user_name}` : 'Système';
}
