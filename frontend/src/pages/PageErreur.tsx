import { useRouteError } from "react-router-dom";

/** Affichée si un écran plante : message clair plutôt qu'une page technique. */
export function PageErreur() {
  const erreur = useRouteError();
  console.error(erreur);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-[1rem] px-[2rem] text-center">
      <h1 className="text-[1.8rem]">Une erreur inattendue est survenue.</h1>
      <p className="text-[#555]">Rechargez la page. Si le problème persiste, signalez-le à l'équipe projet.</p>
      <button type="button" onClick={() => window.location.assign("/agenda")} className="rounded-full bg-orange px-[1.6rem] py-[0.6rem]">
        Revenir à l'agenda
      </button>
    </main>
  );
}
