import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoreLoader } from './components/live';
import { FallbackRedirect } from './components/layout/FallbackRedirect';

const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
const ClubHubPage = lazy(() => import('./pages/ClubHubPage').then(m => ({ default: m.ClubHubPage })));
const WorldPage = lazy(() => import('./pages/WorldPage').then(m => ({ default: m.WorldPage })));
const SquadPage = lazy(() => import('./pages/SquadPage').then(m => ({ default: m.SquadPage })));
const TacticsPage = lazy(() => import('./pages/TacticsPage').then(m => ({ default: m.TacticsPage })));
const TrainingPage = lazy(() => import('./pages/TrainingPage').then(m => ({ default: m.TrainingPage })));
const ScoutPage = lazy(() => import('./pages/ScoutPage').then(m => ({ default: m.ScoutPage })));
const EconomyPage = lazy(() => import('./pages/EconomyPage').then(m => ({ default: m.EconomyPage })));
const StaffPage = lazy(() => import('./pages/StaffPage').then(m => ({ default: m.StaffPage })));
const StadiumPage = lazy(() => import('./pages/StadiumPage').then(m => ({ default: m.StadiumPage })));
const ResidencesPage = lazy(() => import('./pages/ResidencesPage').then(m => ({ default: m.ResidencesPage })));
const FansPage = lazy(() => import('./pages/FansPage').then(m => ({ default: m.FansPage })));
const MarketPage = lazy(() => import('./pages/MarketPage').then(m => ({ default: m.MarketPage })));
const VacanciesPage = lazy(() => import('./pages/VacanciesPage').then(m => ({ default: m.VacanciesPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })));
const LeaguePage = lazy(() => import('./pages/LeaguePage').then(m => ({ default: m.LeaguePage })));
const MatchPage = lazy(() => import('./pages/MatchPage').then(m => ({ default: m.MatchPage })));
const ClubMatchesPage = lazy(() => import('./pages/ClubMatchesPage').then(m => ({ default: m.ClubMatchesPage })));
const MatchdayLivePage = lazy(() => import('./pages/MatchdayLivePage').then(m => ({ default: m.MatchdayLivePage })));
const StyleguidePage = lazy(() => import('./pages/StyleguidePage'));
const KitPage = lazy(() => import('./pages/KitPage').then(m => ({ default: m.KitPage })));
const ClubPage = lazy(() => import('./pages/ClubPage').then(m => ({ default: m.ClubPage })));
const PlayerPage = lazy(() => import('./pages/PlayerPage').then(m => ({ default: m.PlayerPage })));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then(m => ({ default: m.MessagesPage })));
const CompetitionPage = lazy(() => import('./pages/CompetitionPage').then(m => ({ default: m.CompetitionPage })));
const NewsPage = lazy(() => import('./pages/NewsPage').then(m => ({ default: m.NewsPage })));
const AwardsPage = lazy(() => import('./pages/AwardsPage').then(m => ({ default: m.AwardsPage })));
const CareerPage = lazy(() => import('./pages/CareerPage').then(m => ({ default: m.CareerPage })));
const IdeologyPage = lazy(() => import('./pages/IdeologyPage').then(m => ({ default: m.IdeologyPage })));
const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })));
const AuctionPage = lazy(() => import('./pages/AuctionPage').then(m => ({ default: m.AuctionPage })));
const NegotiationsPage = lazy(() => import('./pages/NegotiationsPage').then(m => ({ default: m.NegotiationsPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const ManagerProfilePage = lazy(() => import('./pages/ManagerProfilePage').then(m => ({ default: m.ManagerProfilePage })));
const ManagerPage = lazy(() => import('./pages/ManagerPage').then(m => ({ default: m.ManagerPage })));
const NpcCoachPage = lazy(() => import('./pages/NpcCoachPage').then(m => ({ default: m.NpcCoachPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const NationalTeamsPage = lazy(() => import('./pages/NationalTeamsPage').then(m => ({ default: m.NationalTeamsPage })));
const SharesPage = lazy(() => import('./pages/SharesPage').then(m => ({ default: m.SharesPage })));
const ElectionsPage = lazy(() => import('./pages/ElectionsPage').then(m => ({ default: m.ElectionsPage })));
const ForumPage = lazy(() => import('./pages/ForumPage').then(m => ({ default: m.ForumPage })));
const MasterPanelPage = lazy(() => import('./pages/MasterPanelPage').then(m => ({ default: m.MasterPanelPage })));
const FifaPanelPage = lazy(() => import('./pages/FifaPanelPage').then(m => ({ default: m.FifaPanelPage })));
const ShortlistPage = lazy(() => import('./pages/ShortlistPage').then(m => ({ default: m.ShortlistPage })));
const ExplorePage = lazy(() => import('./pages/ExplorePage').then(m => ({ default: m.ExplorePage })));
const PublicManualPage = lazy(() => import('./pages/PublicManualPage').then(m => ({ default: m.PublicManualPage })));
const AreaHubPage = lazy(() => import('./pages/AreaHubPage').then(m => ({ default: m.AreaHubPage })));


function App() {
  return (
    <ErrorBoundary>
    <Suspense fallback={<LoreLoader />}>
      <Routes>
        {/* Públicas */}
        <Route path="/competitions" element={<Navigate to="/world" replace />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/manual" element={<PublicManualPage />} />

      {/* Onboarding: requiere login pero NO requiere club */}
      <Route element={<ProtectedRoute allowWithoutClub />}>
        <Route element={<AppLayout />}>
          <Route path="/news" element={<NewsPage />} />
          <Route path="/forum" element={<ForumPage />} />
          <Route path="/forum/:categoryId" element={<ForumPage />} />
          <Route path="/forum/:categoryId/topic/:topicId" element={<ForumPage />} />
          <Route path="/community" element={<AreaHubPage kind="community" />} />
        </Route>
        <Route path="/onboarding" element={<OnboardingPage />} />
      </Route>

      {/* Privadas completas: requieren login Y club asignado */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<ClubHubPage />} />
          <Route path="/competition" element={<AreaHubPage kind="competition" />} />
          <Route path="/transfers" element={<AreaHubPage kind="transfers" />} />
          <Route path="/club-management" element={<AreaHubPage kind="club" />} />
          <Route path="/squad" element={<SquadPage />} />
          <Route path="/tactics" element={<TacticsPage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/scout" element={<ScoutPage />} />
          <Route path="/economy" element={<EconomyPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/stadium" element={<StadiumPage />} />
          <Route path="/residences" element={<ResidencesPage />} />
          <Route path="/fans" element={<FansPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/vacancies" element={<VacanciesPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/league" element={<LeaguePage />} />
          <Route path="/matches" element={<ClubMatchesPage />} />
          <Route path="/matches/:id" element={<MatchPage />} />
          <Route path="/matches/:id/live" element={<MatchdayLivePage />} />
          <Route path="/live" element={<MatchdayLivePage />} />
          <Route path="/matchday" element={<Navigate to="/live" replace />} />
          <Route path="/styleguide" element={<StyleguidePage />} />
          <Route path="/club/kits" element={<KitPage />} />
          <Route path="/club/:id" element={<ClubPage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/competition/:id" element={<CompetitionPage />} />
          <Route path="/world" element={<WorldPage />} />
          <Route path="/awards" element={<AwardsPage />} />
          <Route path="/career" element={<CareerPage />} />
          <Route path="/ideology" element={<IdeologyPage />} />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
          <Route path="/auctions" element={<AuctionPage />} />
          <Route path="/negotiations" element={<NegotiationsPage />} />
          <Route path="/shortlist" element={<ShortlistPage />} />
          <Route path="/national" element={<NationalTeamsPage />} />
          <Route path="/shares" element={<SharesPage />} />
          <Route path="/elections" element={<ElectionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* A1: /manager/:id = ficha PÚBLICA de cualquier mánager (lee :id, premium Y8).
              El perfil propio vive en /me (antes /manager/:id mostraba SIEMPRE el propio). */}
          <Route path="/manager/:id" element={<ManagerPage />} />
          <Route path="/npc-coach/:id" element={<NpcCoachPage />} />
          <Route path="/me" element={<ManagerProfilePage />} />
        </Route>
      </Route>

      {/* Panel FIFA: jerárquico — agente_fifa, admin y master (B13, regla de Jaime:
          master tiene acceso a Master+Admin+FIFA, admin a Admin+FIFA, fifa solo FIFA;
          el backend ya usa requireRole('agente_fifa') jerárquico) */}
      <Route element={<ProtectedRoute allowRoles={['agente_fifa', 'admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/fifa" element={<FifaPanelPage />} />
        </Route>
      </Route>

      {/* Panel Admin: admin y master */}
      <Route element={<ProtectedRoute allowRoles={['admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>

      {/* Panel Master: solo master (control total) */}
      <Route element={<ProtectedRoute allowRoles={['master']} />}>
        <Route element={<AppLayout />}>
          <Route path="/master" element={<MasterPanelPage />} />
        </Route>
      </Route>

      {/* Fallback */}
        <Route path="*" element={<FallbackRedirect />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}

export default App;
