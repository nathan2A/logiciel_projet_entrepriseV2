/**
 * Écran de connexion (maquette 08). Selon le profil connecté, l'agenda
 * s'ouvre en vue patient ou en vue soignant. Identifiants refusés : pop-up d'erreur.
 */
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { estErreurApi, USE_MOCK } from "@/services/api";
import { COMPTES_DEMO } from "@/mocks/serveurMock";

export function PageConnexion() {
  const { statut, connexion } = useAuth();
  const { erreur } = useNotifications();
  const navigate = useNavigate();
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);

  if (statut === "connecte") return <Navigate to="/agenda" replace />;

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    try {
      await connexion(identifiant, motDePasse);
      navigate("/agenda", { replace: true });
    } catch (err) {
      const refuse = estErreurApi(err) && (err.status === 401 || err.status === 422);
      erreur(refuse ? "Identifiant ou mot de passe incorrect." : estErreurApi(err) ? err.message : undefined);
    } finally {
      setEnvoi(false);
    }
  };

  const champ = "flex min-h-[4.6rem] items-center gap-[1.6rem] border border-black px-[0.4rem] text-[1.35rem] text-[#333]";
  const saisie = "min-w-0 flex-1 bg-transparent py-[0.6rem] outline-none placeholder:italic placeholder:text-[#8a8a8a] focus-visible:outline-none";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-[2rem]">
      <h1 className="rounded-full bg-orange px-[1.9rem] py-[0.7rem] text-[2.35rem] font-normal">Bienvenue sur votre agenda</h1>

      <form onSubmit={valider} className="mt-[3.4rem] w-full max-w-[52rem]" noValidate>
        <div className="space-y-[0.55rem]">
          <label className={`${champ} focus-within:outline focus-within:outline-[3px] focus-within:outline-lien`}>
            <span className="shrink-0">Identifiant :</span>
            <input
              className={saisie}
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              placeholder="NOM Prénom (ex. DUPONT Jean-Claude)"
              autoComplete="username"
              autoFocus
            />
          </label>
          <label className={`${champ} focus-within:outline focus-within:outline-[3px] focus-within:outline-lien`}>
            <span className="shrink-0">Mot de passe :</span>
            <input
              className={saisie}
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
            />
          </label>
        </div>

        <div className="mt-[3.4rem] flex justify-center">
          <button
            type="submit"
            disabled={envoi}
            className="min-w-[12.5rem] rounded-full bg-orange px-[2rem] py-[0.95rem] text-[1.15rem] transition hover:brightness-95 disabled:opacity-60"
          >
            {envoi ? "Connexion…" : "Connexion"}
          </button>
        </div>
      </form>

      {USE_MOCK && (
        <p className="mt-[2.5rem] max-w-[52rem] text-center text-[0.9rem] text-[#666]">
          Mode démonstration (données fictives), mot de passe libre. Essayez{" "}
          <button type="button" className="underline" onClick={() => setIdentifiant(COMPTES_DEMO.patient)}>
            {COMPTES_DEMO.patient}
          </button>{" "}
          (patient) ou{" "}
          <button type="button" className="underline" onClick={() => setIdentifiant(COMPTES_DEMO.soignant)}>
            {COMPTES_DEMO.soignant}
          </button>{" "}
          (soignant).
        </p>
      )}
    </main>
  );
}
