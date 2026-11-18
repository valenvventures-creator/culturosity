import { lazy, Suspense } from "react";
import { createBrowserRouter, Link, Navigate, RouterProvider, useParams, useRouteError } from "react-router-dom";
import { PublicLayout } from "./components/Layout";
import { Spinner } from "./components/ui";
import {
  AffinityPage,
  DemoPage,
  HomePage,
  NotFoundPage,
  PerkRoute,
  PerksPage,
  SavedPage,
  ServicesPage,
  SubmitPerkPage,
} from "./pages/public";
import { AccountPage, DevMailboxPage, ForgotPage, InvitePage, ResetPage, SignInPage, SignUpPage, StartWorkspacePage, VerifyPage } from "./pages/auth";

// Heavier admin areas are code-split.
const org = () => import("./pages/org");
const internal = () => import("./pages/internal");
const provider = () => import("./pages/provider");
const L = <T extends string>(loader: () => Promise<Record<T, any>>, name: T) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const OrgPortalPage = L(org, "OrgPortalPage");
const OrgPerkRoute = L(org, "OrgPerkRoute");
const OrgSubmitPage = L(org, "OrgSubmitPage");
const ManageLayout = L(org, "ManageLayout");
const ManageDashboard = L(org, "ManageDashboard");
const ManageOffers = L(org, "ManageOffers");
const ManageOfferEdit = L(org, "ManageOfferEdit");
const ManageReview = L(org, "ManageReview");
const ManageMembers = L(org, "ManageMembers");
const ManageProviders = L(org, "ManageProviders");
const ManagePrograms = L(org, "ManagePrograms");
const ManageBranding = L(org, "ManageBranding");
const ManageImport = L(org, "ManageImport");
const ManageReports = L(org, "ManageReports");
const ManageLicensed = L(org, "ManageLicensed");
const ManageLaunch = L(org, "ManageLaunch");
const ManageServices = L(org, "ManageServices");
const InternalLayout = L(internal, "InternalLayout");
const InternalOverview = L(internal, "InternalOverview");
const ResearchPage = L(internal, "ResearchPage");
const OutreachPage = L(internal, "OutreachPage");
const PipelinePage = L(internal, "PipelinePage");
const DemoGuidePage = L(internal, "DemoGuidePage");
const ServiceQueuePage = L(internal, "ServiceQueuePage");
const WorkspacesPage = L(internal, "WorkspacesPage");
const AccessSettingsPage = L(internal, "AccessSettingsPage");
const ProviderVerifyPage = L(provider, "ProviderVerifyPage");

const S = (el: JSX.Element) => <Suspense fallback={<div className="container page"><Spinner /></div>}>{el}</Suspense>;

function RouteError() {
  const err = useRouteError() as Error | undefined;
  // Stale code-split chunk after a deploy: reload once to pick up the new build.
  if (err && /dynamically imported module|Importing a module script failed/i.test(String(err.message))) {
    if (!sessionStorage.getItem("cul:reloaded")) {
      sessionStorage.setItem("cul:reloaded", "1");
      window.location.reload();
    }
  }
  return (
    <div className="container page" role="alert">
      <h1 style={{ fontSize: "1.8rem" }}>Something went wrong</h1>
      <p className="muted">This screen hit an unexpected problem. Your data has not been changed.</p>
      <div className="row">
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        <Link className="btn btn-ghost" to="/">Go home</Link>
      </div>
    </div>
  );
}

function OrgIndexRedirect() {
  const { orgSlug } = useParams();
  return <Navigate to={`/app/${orgSlug}`} replace />;
}

const router = createBrowserRouter(
  [
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/perks", element: <PerksPage /> },
      { path: "/perks/:perkId", element: <PerkRoute /> },
      { path: "/affinity", element: <AffinityPage /> },
      { path: "/submit-perk", element: <SubmitPerkPage /> },
      { path: "/services", element: <ServicesPage /> },
      { path: "/demo", element: <DemoPage /> },
      { path: "/saved", element: <SavedPage /> },
      { path: "/auth/signin", element: <SignInPage /> },
      { path: "/auth/signup", element: <SignUpPage /> },
      { path: "/auth/verify", element: <VerifyPage /> },
      { path: "/auth/forgot", element: <ForgotPage /> },
      { path: "/auth/reset", element: <ResetPage /> },
      { path: "/auth/invite/:token", element: <InvitePage /> },
      { path: "/account", element: <AccountPage /> },
      { path: "/start", element: <StartWorkspacePage /> },
      { path: "/dev/mailbox", element: <DevMailboxPage /> },
      { path: "/app/:orgSlug", element: S(<OrgPortalPage />) },
      { path: "/app/:orgSlug/perks", element: <OrgIndexRedirect /> },
      { path: "/app/:orgSlug/perks/:perkId", element: S(<OrgPerkRoute />) },
      { path: "/app/:orgSlug/submit-perk", element: S(<OrgSubmitPage />) },
      { path: "/provider", element: <Navigate to="/provider/verify" replace /> },
      { path: "/provider/verify", element: S(<ProviderVerifyPage />) },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    path: "/app/:orgSlug/manage",
    element: S(<ManageLayout />),
    errorElement: <RouteError />,
    children: [
      { index: true, element: S(<ManageDashboard />) },
      { path: "offers", element: S(<ManageOffers />) },
      { path: "offers/:perkId", element: S(<ManageOfferEdit />) },
      { path: "review", element: S(<ManageReview />) },
      { path: "members", element: S(<ManageMembers />) },
      { path: "providers", element: S(<ManageProviders />) },
      { path: "programs", element: S(<ManagePrograms />) },
      { path: "branding", element: S(<ManageBranding />) },
      { path: "import", element: S(<ManageImport />) },
      { path: "reports", element: S(<ManageReports />) },
      { path: "licensed", element: S(<ManageLicensed />) },
      { path: "launch", element: S(<ManageLaunch />) },
      { path: "services", element: S(<ManageServices />) },
    ],
  },
  {
    path: "/culturosity/admin",
    element: S(<InternalLayout />),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="overview" replace /> },
      { path: "overview", element: S(<InternalOverview />) },
      { path: "research", element: S(<ResearchPage />) },
      { path: "outreach", element: S(<OutreachPage />) },
      { path: "pipeline", element: S(<PipelinePage />) },
      { path: "demo-guide", element: S(<DemoGuidePage />) },
      { path: "services", element: S(<ServiceQueuePage />) },
      { path: "workspaces", element: S(<WorkspacesPage />) },
      { path: "settings", element: S(<AccessSettingsPage />) },
    ],
  },
],
);

export default function App() {
  return <RouterProvider router={router} />;
}
