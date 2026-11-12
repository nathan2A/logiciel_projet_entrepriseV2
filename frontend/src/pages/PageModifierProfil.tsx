/**
 * Modification d'un profil (même formulaire que la création), depuis une fiche :
 * /patients/:patientId/profil/modifier, /soignants/:soignantId/profil/modifier
 * ou /profil/modifier (son propre profil, soignant).
 */
import { useNavigate, useParams } from "react-router-dom";
import { Chargement, ListeVide } from "@/components/ui/Etats";
import { erreurProfil } from "@/components/profils/erreurs";
import { FormulaireProfil } from "@/components/profils/FormulaireProfil";
import { saisieDepuisPatient, saisieDepuisSoignant } from "@/components/profils/saisie";
import { useAuth, useUtilisateur } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useProfils } from "@/hooks/useProfils";
import { usePatients, useSoignants } from "@/hooks/useReferentiel";
import type { SaisieProfil } from "@/types";

export function PageModifierProfil() {
  const navigate = useNavigate();
  const params = useParams();
  const moi = useUtilisateur();
  const { rafraichir } = useAuth();
  const { erreur, succes } = useNotifications();
  const profils = useProfils();
  const estPatient = params.patientId !== undefined;
  const id = estPatient ? Number(params.patientId) : params.soignantId !== undefined ? Number(params.soignantId) : moi.id;
  const patients = usePatients(estPatient);
  const soignants = useSoignants(!estPatient);

  const requete = estPatient ? patients : soignants;
  if (requete.isPending) return <Chargement />;
  let initiale: SaisieProfil | null = null;
  if (estPatient) {
    const p = patients.data?.find((x) => x.id === id);
    if (p) initiale = saisieDepuisPatient(p);
  } else {
    const s = soignants.data?.find((x) => x.id === id);
    if (s) initiale = saisieDepuisSoignant(s);
  }
  if (!initiale) return <ListeVide texte="Ce profil est introuvable." />;

  const soiMeme = id === moi.id;
  const fiche = soiMeme ? "/profil" : estPatient ? `/patients/${id}/profil` : `/soignants/${id}/profil`;

  const enregistrer = async (s: SaisieProfil) => {
    try {
      await profils.modifier(id, s);
      if (soiMeme) await rafraichir();
      succes("Les modifications ont été enregistrées.");
      navigate(fiche, { replace: true });
      return true;
    } catch (e) {
      const { titre, message } = erreurProfil(e);
      erreur(message, undefined, titre);
      return false;
    }
  };

  return (
    <FormulaireProfil
      key={id}
      titre={soiMeme ? "Modifier mon profil" : estPatient ? "Modifier le profil patient" : "Modifier le profil soignant"}
      mode="modification"
      initiale={initiale}
      onValider={enregistrer}
      onRetour={() => navigate(fiche)}
    />
  );
}
