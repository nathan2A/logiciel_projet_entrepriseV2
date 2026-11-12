/**
 * Formulaire de profil (maquettes 24 « soignant » et 19 « patient »), en
 * création comme en modification. Mise en page des fiches profil : sections
 * « Identité », « Identification » et, pour un patient, « Séjour ».
 *
 * - L'identifiant est proposé automatiquement (« NOM Prénom ») tant qu'on ne
 *   l'a pas modifié à la main (utile pour deux homonymes).
 * - Profession : liste des professions existantes, ou « Autre » pour en
 *   saisir une nouvelle.
 * - En modification, un mot de passe vide laisse le mot de passe inchangé.
 * Les règles de doublon (même nom, prénom, date de naissance) sont vérifiées
 * par le backend.
 */
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { BoutonRetour } from "./BoutonRetour";
import { useChambres, useSoignants } from "@/hooks/useReferentiel";
import type { SaisieProfil } from "@/types";
import { formatNom } from "@/utils/noms";

const AUTRE = "__autre__";

interface Props {
  titre: string;
  mode: "creation" | "modification";
  initiale: SaisieProfil;
  onValider: (s: SaisieProfil) => Promise<boolean>; // true : succès
  onRetour: () => void;
}

function Ligne({ libelle, id, children }: { libelle: string; id: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-[0.6rem]">
      <label htmlFor={id} className="w-[12.5rem] shrink-0">
        {libelle}
        <span aria-hidden> :</span>
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <fieldset className="mt-[1.4rem] first:mt-0">
      <legend className="mb-[0.2rem] underline underline-offset-[0.2rem]">{titre} :</legend>
      <div className="space-y-[0.35rem]">{children}</div>
    </fieldset>
  );
}

export const identifiantPropose = (nom: string, prenom: string) =>
  nom.trim() || prenom.trim() ? formatNom({ nom, prenom }) : "";

export function FormulaireProfil({ titre, mode, initiale, onValider, onRetour }: Props) {
  const soignant = initiale.type === "soignant";
  const chambres = useChambres(!soignant);
  const soignants = useSoignants(soignant);
  const [s, setS] = useState<SaisieProfil>(initiale);
  const [identifiantManuel, setIdentifiantManuel] = useState(
    mode === "modification" && initiale.identifiant.toLowerCase() !== identifiantPropose(initiale.nom, initiale.prenom).toLowerCase(),
  );
  const professions = useMemo(
    () => [...new Set((soignants.data ?? []).map((x) => x.profession))].sort((a, b) => a.localeCompare(b, "fr")),
    [soignants.data],
  );
  const [professionAutre, setProfessionAutre] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const ids = {
    nom: useId(), prenom: useId(), naissance: useId(), email: useId(), tel: useId(), profession: useId(),
    identifiant: useId(), mdp: useId(), chambre: useId(), arrivee: useId(), depart: useId(),
  };

  const changer = (champ: keyof SaisieProfil, valeur: string | number | null) =>
    setS((avant) => {
      const apres = { ...avant, [champ]: valeur };
      if ((champ === "nom" || champ === "prenom") && !identifiantManuel) {
        apres.identifiant = identifiantPropose(apres.nom, apres.prenom);
      }
      return apres;
    });

  // Profession absente de la liste (ou saisie libre) : on montre la case « Autre »
  const professionDansListe = professions.includes(s.profession);
  const afficherAutre = professionAutre || (s.profession !== "" && !professionDansListe && !soignants.isPending);

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    const err: string[] = [];
    if (!s.nom.trim()) err.push("Indiquez le nom.");
    if (!s.prenom.trim()) err.push("Indiquez le prénom.");
    if (!s.dateNaissance) err.push("Indiquez la date de naissance.");
    if (s.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email.trim())) err.push("L'adresse email n'est pas valide.");
    if (s.identifiant.trim().length < 3) err.push("L'identifiant doit faire au moins 3 caractères.");
    if (mode === "creation" && !s.motDePasse) err.push("Choisissez un mot de passe.");
    if (s.motDePasse && s.motDePasse.length < 8) err.push("Le mot de passe doit faire au moins 8 caractères.");
    if (soignant && !s.profession.trim()) err.push("Indiquez la profession.");
    if (!soignant && !s.dateArrivee) err.push("Indiquez la date d'entrée.");
    if (!soignant && s.dateDepartPrevue && s.dateArrivee && s.dateDepartPrevue < s.dateArrivee)
      err.push("La date de sortie prévue doit être après la date d'entrée.");
    setErreurs(err);
    if (err.length) return;
    setEnvoi(true);
    const ok = await onValider(s);
    if (!ok) setEnvoi(false);
  };

  const champ = "w-full max-w-[22rem] rounded-[0.4rem] border border-[#999] bg-white px-[0.5rem] py-[0.1rem] text-[1.2rem]";

  return (
    <div className="px-[2.2rem] pb-[2rem]">
      <div className="mx-auto mt-[1rem] flex max-w-[52rem] items-start justify-between gap-[1rem]">
        <h1 className="text-[2.6rem] font-normal leading-tight">{titre}</h1>
      </div>
      <form onSubmit={valider} noValidate className="mx-auto mt-[1rem] max-w-[52rem] text-[1.3rem] leading-[2.05rem]">
        <div className="flex items-start justify-between gap-[2rem]">
          <div className="min-w-0 flex-1">
            <Section titre="Identité">
              <Ligne libelle="Nom" id={ids.nom}>
                <input id={ids.nom} className={champ} value={s.nom} onChange={(e) => changer("nom", e.target.value)} autoComplete="off" />
              </Ligne>
              <Ligne libelle="Prénom" id={ids.prenom}>
                <input id={ids.prenom} className={champ} value={s.prenom} onChange={(e) => changer("prenom", e.target.value)} autoComplete="off" />
              </Ligne>
              <Ligne libelle="Date de naissance" id={ids.naissance}>
                <input id={ids.naissance} type="date" className={champ} value={s.dateNaissance} onChange={(e) => changer("dateNaissance", e.target.value)} />
              </Ligne>
              <Ligne libelle="Email" id={ids.email}>
                <input id={ids.email} type="email" className={champ} value={s.email} onChange={(e) => changer("email", e.target.value)} autoComplete="off" />
              </Ligne>
              <Ligne libelle="Téléphone" id={ids.tel}>
                <input id={ids.tel} type="tel" className={champ} value={s.telephone} onChange={(e) => changer("telephone", e.target.value)} autoComplete="off" />
              </Ligne>
              {soignant && (
                <Ligne libelle="Profession" id={ids.profession}>
                  <select
                    id={ids.profession}
                    className={champ}
                    value={afficherAutre ? AUTRE : s.profession}
                    onChange={(e) => {
                      if (e.target.value === AUTRE) {
                        setProfessionAutre(true);
                        changer("profession", "");
                      } else {
                        setProfessionAutre(false);
                        changer("profession", e.target.value);
                      }
                    }}
                  >
                    <option value="">Choisir…</option>
                    {professions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    <option value={AUTRE}>Autre (à préciser)…</option>
                  </select>
                  {afficherAutre && (
                    <input
                      aria-label="Nouvelle profession"
                      placeholder="Nouvelle profession"
                      className={`${champ} mt-[0.3rem] block`}
                      value={s.profession}
                      onChange={(e) => changer("profession", e.target.value)}
                      autoFocus={professionAutre}
                    />
                  )}
                </Ligne>
              )}
            </Section>

            <Section titre="Identification">
              <Ligne libelle="Identifiant" id={ids.identifiant}>
                <input
                  id={ids.identifiant}
                  className={champ}
                  value={s.identifiant}
                  onChange={(e) => {
                    setIdentifiantManuel(true);
                    changer("identifiant", e.target.value);
                  }}
                  autoComplete="off"
                />
              </Ligne>
              <Ligne libelle="Mot de passe" id={ids.mdp}>
                <input
                  id={ids.mdp}
                  type="password"
                  className={champ}
                  value={s.motDePasse}
                  onChange={(e) => changer("motDePasse", e.target.value)}
                  autoComplete="new-password"
                  placeholder={mode === "modification" ? "Inchangé si vide" : "8 caractères minimum"}
                />
              </Ligne>
            </Section>

            {!soignant && (
              <Section titre="Séjour">
                <Ligne libelle="Chambre" id={ids.chambre}>
                  <select
                    id={ids.chambre}
                    className={champ}
                    value={s.chambreId ?? ""}
                    onChange={(e) => changer("chambreId", e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Aucune (hôpital de jour)</option>
                    {[...new Set((chambres.data ?? []).map((c) => c.etage))].map((etage) => (
                      <optgroup key={etage} label={`Unité ${etage}`}>
                        {(chambres.data ?? [])
                          .filter((c) => c.etage === etage)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.numero}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </Ligne>
                <Ligne libelle="Date d’entrée" id={ids.arrivee}>
                  <input id={ids.arrivee} type="date" className={champ} value={s.dateArrivee} onChange={(e) => changer("dateArrivee", e.target.value)} />
                </Ligne>
                {mode === "modification" && (
                  <Ligne libelle="Sortie prévue" id={ids.depart}>
                    <input id={ids.depart} type="date" className={champ} value={s.dateDepartPrevue} onChange={(e) => changer("dateDepartPrevue", e.target.value)} />
                  </Ligne>
                )}
              </Section>
            )}
          </div>

          <BoutonRetour onClick={onRetour} />
        </div>

        {erreurs.length > 0 && (
          <ul role="alert" className="mt-[1rem] list-disc pl-[1.4rem] text-[1.05rem] leading-[1.6rem] text-erreur">
            {erreurs.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <button type="submit" disabled={envoi} className="mt-[1.6rem] text-[1.8rem] text-valider underline disabled:opacity-50">
          {envoi ? "Enregistrement…" : mode === "creation" ? "Créer le profil" : "Enregistrer les modifications"}
        </button>
      </form>
    </div>
  );
}
