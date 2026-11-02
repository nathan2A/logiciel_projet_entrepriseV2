import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { NotificationsProvider } from "@/hooks/useNotifications";
import { estErreurApi } from "@/services/api";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Pas de nouvel essai sur une erreur « métier » (401, 403, 404…)
      retry: (n, e) => n < 2 && (!estErreurApi(e) || e.status === 0 || e.status >= 500),
      refetchOnWindowFocus: true,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationsProvider>
        <AuthProvider>
          <p className="ecran-trop-etroit bg-orange px-[1rem] py-[0.4rem] text-center text-[0.9rem]">
            Cette version est prévue pour ordinateur (écran d'au moins 1280 px de large).
          </p>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </AuthProvider>
      </NotificationsProvider>
    </QueryClientProvider>
  );
}
