import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Chargement } from "@/components/ui/Etats";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/types";
import { PageAgenda } from "@/pages/PageAgenda";
import { PageAgendaPatient } from "@/pages/PageAgendaPatient";
import { PageFichePatient } from "@/pages/PageFichePatient";
import { PageAnnuaire } from "@/pages/PageAnnuaire";
import { PageProfil } from "@/pages/PageProfil";
import { PageUnite } from "@/pages/PageUnite";
import { PageConnexion } from "@/pages/PageConnexion";
import { PageErreur } from "@/pages/PageErreur";

/** Écrans réservés aux personnes connectées. */
function Protege() {
  const { statut } = useAuth();
  if (statut === "verification") return <Chargement texte="Vérification de la session…" />;
  if (statut === "deconnecte") return <Navigate to="/connexion" replace />;
  return <Outlet />;
}

/** Écrans réservés à certains rôles (ex. Unités : soignants uniquement). */
function RoleRequis({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { utilisateur } = useAuth();
  if (!utilisateur || !roles.includes(utilisateur.role)) return <Navigate to="/agenda" replace />;
  return <>{children}</>;
}

function PageUniteCle() {
  const { numero } = useParams();
  return <PageUnite key={numero} />;
}

export const router = createBrowserRouter(
  [
  { path: "/connexion", element: <PageConnexion />, errorElement: <PageErreur /> },
  {
    element: <Protege />,
    errorElement: <PageErreur />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/agenda", element: <PageAgenda /> },
          { path: "/profil", element: <PageProfil /> },
          {
            path: "/annuaire",
            element: <RoleRequis roles={["soignant"]}><PageAnnuaire /></RoleRequis>,
          },
          {
            path: "/patients/:patientId/agenda",
            element: <RoleRequis roles={["soignant"]}><PageAgendaPatient /></RoleRequis>,
          },
          {
            path: "/patients/:patientId/profil",
            element: <RoleRequis roles={["soignant"]}><PageFichePatient /></RoleRequis>,
          },
          {
            path: "/unites/:numero",
            // key : repart d'un état propre en passant de l'Unité 0 à l'Unité 1
            element: <RoleRequis roles={["soignant"]}><PageUniteCle /></RoleRequis>,
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/agenda" replace /> },
  ],
  { future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true } },
);
