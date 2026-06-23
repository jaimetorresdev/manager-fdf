import type { ComponentType } from 'react';
import {
  Globe2, BookOpen, Shield, Calendar, ArrowRightLeft, Handshake,
  Banknote, GraduationCap, Gavel, Briefcase, Radio, Flag, Search, Trophy,
  MessageSquare, Newspaper, HelpCircle, Users,
  Compass, UserRound, SlidersHorizontal, Wrench,
} from 'lucide-react';
import { PitchIcon, WhistleIcon, StrategyBoardIcon, StadiumIcon, ShirtIcon, BootsIcon } from '../ui/FootballIcons';

export type NavLink = {
  path: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  labelKey: string;
  descKey?: string;
  iconClass?: string;
  exact?: boolean;
  primary?: boolean;
};

export type NavPhase = {
  id: string;
  labelKey: string;
  descKey: string;
  fallback: string;
  descFallback: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  accent?: string;
  homePath: string;
  matchPrefixes?: string[];
  links: NavLink[];
  requiresClub?: boolean;
};

/** Orden por frecuencia de uso: operación diaria → partidos → mercado → gestión → social */
export const NAV_PHASES: NavPhase[] = [
  {
    id: 'equipo',
    labelKey: 'nav.phase.team',
    descKey: 'nav.phaseDesc.team',
    fallback: 'Equipo',
    descFallback: 'Plantilla, táctica y entreno',
    icon: ShirtIcon,
    accent: 'var(--green-primary)',
    homePath: '/',
    requiresClub: true,
    matchPrefixes: ['/player/'],
    links: [
      { path: '/', icon: PitchIcon, labelKey: 'nav.club', descKey: 'nav.linkDesc.club' },
      { path: '/squad', icon: ShirtIcon, labelKey: 'nav.squad', descKey: 'nav.linkDesc.squad' },
      { path: '/tactics', icon: StrategyBoardIcon, labelKey: 'nav.tactics', descKey: 'nav.linkDesc.tactics' },
      { path: '/training', icon: BootsIcon, labelKey: 'nav.training', descKey: 'nav.linkDesc.training' },
    ],
  },
  {
    id: 'competicion',
    labelKey: 'nav.phase.competition',
    descKey: 'nav.phaseDesc.competition',
    fallback: 'Competición',
    descFallback: 'Partidos, liga y calendario',
    icon: Trophy,
    accent: 'var(--gold-accent)',
    homePath: '/competition',
    matchPrefixes: ['/competition/', '/matches/'],
    links: [
      { path: '/competition', icon: Compass, labelKey: 'nav.overview', descKey: 'nav.linkDesc.competitionHub', exact: true },
      { path: '/calendar', icon: Calendar, labelKey: 'topbar.calendar', descKey: 'nav.linkDesc.calendar' },
      { path: '/matches', icon: WhistleIcon, labelKey: 'topbar.myMatches', descKey: 'nav.linkDesc.matches' },
      { path: '/league', icon: Trophy, labelKey: 'topbar.myLeague', descKey: 'nav.linkDesc.league', iconClass: 'text-[var(--gold-accent)]' },
      { path: '/live', icon: Radio, labelKey: 'topbar.live', descKey: 'nav.linkDesc.live', iconClass: 'text-[var(--green-primary)]' },
      { path: '/world', icon: Globe2, labelKey: 'topbar.competitions', descKey: 'nav.linkDesc.world', iconClass: 'text-[var(--blue-info)]', primary: false },
      { path: '/national', icon: Flag, labelKey: 'nav.national', descKey: 'nav.linkDesc.national', iconClass: 'text-[var(--green-primary)]', primary: false },
      { path: '/elections', icon: Gavel, labelKey: 'nav.elections', descKey: 'nav.linkDesc.elections', iconClass: 'text-[var(--gold-accent)]', primary: false },
      { path: '/awards', icon: Trophy, labelKey: 'nav.awards', descKey: 'nav.linkDesc.awards', iconClass: 'text-[var(--gold-accent)]', primary: false },
    ],
  },
  {
    id: 'fichajes',
    labelKey: 'nav.phase.transfers',
    descKey: 'nav.phaseDesc.transfers',
    fallback: 'Fichajes',
    descFallback: 'Mercado, ojeador y negociaciones',
    icon: ArrowRightLeft,
    accent: 'var(--teal-accent)',
    requiresClub: true,
    homePath: '/transfers',
    links: [
      { path: '/transfers', icon: Compass, labelKey: 'nav.overview', descKey: 'nav.linkDesc.transfersHub', exact: true },
      { path: '/market', icon: ArrowRightLeft, labelKey: 'nav.market', descKey: 'nav.linkDesc.market', iconClass: 'text-[var(--green-primary)]' },
      { path: '/scout', icon: Search, labelKey: 'nav.scout', descKey: 'nav.linkDesc.scout' },
      { path: '/shortlist', icon: Search, labelKey: 'topbar.targets', descKey: 'nav.linkDesc.shortlist', iconClass: 'text-[var(--green-primary)]' },
      { path: '/negotiations', icon: Handshake, labelKey: 'topbar.myOffers', descKey: 'nav.linkDesc.negotiations', iconClass: 'text-[var(--gold-accent)]' },
      { path: '/auctions', icon: Gavel, labelKey: 'nav.auctions', descKey: 'nav.linkDesc.auctions', iconClass: 'text-[var(--gold-accent)]', primary: false },
    ],
  },
  {
    id: 'club',
    labelKey: 'nav.phase.club',
    descKey: 'nav.phaseDesc.clubMgmt',
    fallback: 'Club',
    descFallback: 'Economía, estadio y personal',
    icon: StadiumIcon,
    accent: 'var(--blue-info)',
    requiresClub: true,
    homePath: '/club-management',
    matchPrefixes: ['/club/'],
    links: [
      { path: '/club-management', icon: Compass, labelKey: 'nav.overview', descKey: 'nav.linkDesc.clubHub', exact: true },
      { path: '/economy', icon: Banknote, labelKey: 'nav.economy', descKey: 'nav.linkDesc.economy' },
      { path: '/stadium', icon: StadiumIcon, labelKey: 'nav.stadium', descKey: 'nav.linkDesc.stadium' },
      { path: '/staff', icon: Shield, labelKey: 'nav.staff', descKey: 'nav.linkDesc.staff' },
      { path: '/fans', icon: Flag, labelKey: 'nav.fans', descKey: 'nav.linkDesc.fans' },
      { path: '/residences', icon: GraduationCap, labelKey: 'nav.residences', descKey: 'nav.linkDesc.residences', primary: false },
      { path: '/club/kits', icon: ShirtIcon, labelKey: 'nav.kits', descKey: 'nav.linkDesc.kits', primary: false },
      { path: '/vacancies', icon: Briefcase, labelKey: 'nav.vacancies', descKey: 'nav.linkDesc.vacancies', primary: false },
    ],
  },
  {
    id: 'comunidad',
    labelKey: 'nav.phase.community',
    descKey: 'nav.phaseDesc.community',
    fallback: 'Comunidad',
    descFallback: 'Mensajes, noticias y foro',
    icon: Users,
    accent: 'var(--violet-accent)',
    homePath: '/community',
    matchPrefixes: ['/manager/', '/npc-coach/', '/forum/'],
    links: [
      { path: '/community', icon: Compass, labelKey: 'nav.overview', descKey: 'nav.linkDesc.communityHub', exact: true },
      { path: '/messages', icon: MessageSquare, labelKey: 'topbar.messages', descKey: 'nav.linkDesc.messages' },
      { path: '/news', icon: Newspaper, labelKey: 'topbar.news', descKey: 'nav.linkDesc.news' },
      { path: '/forum', icon: BookOpen, labelKey: 'topbar.forum', descKey: 'nav.linkDesc.forum' },
      { path: '/manual', icon: HelpCircle, labelKey: 'topbar.manual', descKey: 'nav.linkDesc.manual', iconClass: 'text-[var(--gold-accent)]', primary: false },
    ],
  },
];

/** Contextos secundarios: aparecen en la barra local, no añaden ruido al menú global. */
export const UTILITY_PHASES: NavPhase[] = [
  {
    id: 'manager',
    labelKey: 'nav.phase.manager',
    descKey: 'nav.phaseDesc.manager',
    fallback: 'Mánager',
    descFallback: 'Carrera, identidad y preferencias',
    icon: UserRound,
    accent: 'var(--violet-accent)',
    homePath: '/me',
    links: [
      { path: '/me', icon: UserRound, labelKey: 'topbar.myProfile', descKey: 'nav.linkDesc.profile', exact: true },
      { path: '/career', icon: Trophy, labelKey: 'topbar.myCareer', descKey: 'nav.linkDesc.career' },
      { path: '/ideology', icon: Compass, labelKey: 'topbar.ideology', descKey: 'nav.linkDesc.ideology' },
      { path: '/shares', icon: Banknote, labelKey: 'topbar.shareholders', descKey: 'nav.linkDesc.shares' },
      { path: '/settings', icon: SlidersHorizontal, labelKey: 'topbar.generalSettings', descKey: 'nav.linkDesc.settings' },
    ],
  },
  {
    id: 'operations',
    labelKey: 'nav.phase.operations',
    descKey: 'nav.phaseDesc.operations',
    fallback: 'Operaciones',
    descFallback: 'Control, diagnóstico y administración',
    icon: Wrench,
    accent: 'var(--gold-accent)',
    homePath: '/diagnostics',
    links: [
      { path: '/diagnostics', icon: Wrench, labelKey: 'nav.diagnostics', exact: true },
      { path: '/styleguide', icon: SlidersHorizontal, labelKey: 'nav.styleguide' },
      { path: '/fifa', icon: Flag, labelKey: 'nav.fifaPanel' },
      { path: '/admin', icon: Shield, labelKey: 'nav.adminPanel' },
      { path: '/master', icon: Gavel, labelKey: 'nav.masterPanel' },
    ],
  },
];

export const CONTEXT_PHASES = [...NAV_PHASES, ...UTILITY_PHASES];

export const MOBILE_QUICK_LINKS = [
  { path: '/', icon: PitchIcon, labelKey: 'nav.club' },
  { path: '/calendar', icon: Calendar, labelKey: 'topbar.calendar' },
  { path: '/squad', icon: ShirtIcon, labelKey: 'nav.squad' },
  { path: '/market', icon: ArrowRightLeft, labelKey: 'nav.market' },
] as const;

export function pathActive(pathname: string, path: string, exact = false) {
  return path === '/' || exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
}

export function tutorialRoute(path: string) {
  return ['/squad', '/tactics', '/training', '/market', '/matches'].includes(path) ? path : undefined;
}
