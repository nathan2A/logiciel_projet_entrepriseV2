/**
 * Planning de la semaine (maquettes 05-07) construit avec FullCalendar
 * (vue timeGridWeek) et habillé pour reproduire la maquette :
 * 7 colonnes grises arrondies, jour actuel en vert, en-têtes « LUN.12 »,
 * blocs de RDV arrondis à la couleur de leur type, plages repas visibles.
 *
 * Ce composant ne fait qu'afficher : il remonte les clics (et, pour les
 * soignants, les déplacements) au parent, qui appelle le backend.
 */
import { useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import frLocale from "@fullcalendar/core/locales/fr";
import type { EventContentArg, EventDropArg, EventInput } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { couleurRdv, couleurTexteSur } from "@/theme/couleursRdv";
import type { RendezVous } from "@/types";
import { enteteJour, heureCourte, plageHoraire, versIsoLocal } from "@/utils/dates";
import "./planning.css";

interface Props {
  lundi: Date;
  rdvs: RendezVous[];
  onClicRdv: (rdv: RendezVous) => void;
  /** Glisser-déposer (soignants) : le parent appelle le backend puis valide ou annule. */
  onDeplacer?: (rdv: RendezVous, debut: string, fin: string, annuler: () => void) => void;
  rdvEnCours?: number[]; // RDV en cours d'enregistrement (état de chargement)
  rdvEnConflit?: Record<number, "bloquant" | "avertissement">;
  heureDebut?: string;
  heureFin?: string;
}

/** Plages repas à garder libres : déjeuner 11h-14h, dîner 18h-20h (affichage seul). */
const PLAGES_REPAS: EventInput[] = [
  { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "11:00", endTime: "14:00", display: "background", classNames: ["plage-repas"] },
  { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "18:00", endTime: "20:00", display: "background", classNames: ["plage-repas"] },
];

function ContenuRdv({ event }: EventContentArg) {
  const rdv = event.extendedProps.rdv as RendezVous | undefined;
  if (!rdv) return null; // plages repas (fond) : rien à écrire
  const debut = event.start!;
  const fin = event.end ?? debut;
  // RDV courts (≤ 35 min) : une seule ligne « Titre 8h », pour ne pas déborder sur le suivant
  const court = fin.getTime() - debut.getTime() <= 35 * 60_000;
  if (court) {
    return (
      <div className="contenu-rdv">
        <span className="titre">
          {rdv.type.libelle} {heureCourte(debut)}
        </span>
      </div>
    );
  }
  return (
    <div className="contenu-rdv">
      <span className="titre">{rdv.type.libelle}</span>
      <span>{plageHoraire(debut, fin)}</span>
    </div>
  );
}

export function PlanningSemaine({
  lundi, rdvs, onClicRdv, onDeplacer, rdvEnCours = [], rdvEnConflit = {}, heureDebut = "07:00", heureFin = "21:00",
}: Props) {
  const ref = useRef<FullCalendar>(null);
  const conteneur = useRef<HTMLDivElement>(null);

  // FullCalendar ne suit que la taille de la fenêtre : on le prévient aussi
  // quand son conteneur change de largeur (ouverture du menu latéral).
  useEffect(() => {
    const el = conteneur.current;
    if (!el) return;
    const obs = new ResizeObserver(() => ref.current?.getApi().updateSize());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Changement de semaine piloté par le parent (flèches violettes)
  useEffect(() => {
    ref.current?.getApi().gotoDate(lundi);
  }, [lundi]);

  const evenements = useMemo<EventInput[]>(
    () =>
      rdvs.map((r) => {
        const fond = couleurRdv(r.type.categorie, r.type.couleurBackend);
        const classes = ["rdv"];
        if (rdvEnCours.includes(r.id)) classes.push("rdv-en-cours");
        if (rdvEnConflit[r.id]) classes.push(`rdv-conflit-${rdvEnConflit[r.id]}`);
        return {
          id: String(r.id),
          start: r.debut,
          end: r.fin,
          title: r.type.libelle,
          backgroundColor: fond,
          borderColor: fond,
          textColor: couleurTexteSur(fond),
          classNames: classes,
          editable: Boolean(onDeplacer) && !rdvEnCours.includes(r.id),
          extendedProps: { rdv: r },
        };
      }),
    [rdvs, rdvEnCours, rdvEnConflit, onDeplacer],
  );

  // Hauteur minimale d'un bloc, quelle que soit la durée
  const hauteurMin = useMemo(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return Math.round(rem * 1.45); // une ligne de texte
  }, []);

  const deplacement = (info: EventDropArg | EventResizeDoneArg) => {
    if (!onDeplacer || !info.event.start) return info.revert();
    const fin = info.event.end ?? info.event.start;
    onDeplacer(info.event.extendedProps.rdv as RendezVous, versIsoLocal(info.event.start), versIsoLocal(fin), info.revert);
  };

  return (
    <div ref={conteneur} className="planning-semaine h-full">
      <FullCalendar
        ref={ref}
        plugins={[timeGridPlugin, interactionPlugin]}
        locale={frLocale}
        initialView="timeGridWeek"
        initialDate={lundi}
        firstDay={1}
        headerToolbar={false}
        allDaySlot={false}
        height="100%"
        expandRows
        slotMinTime={`${heureDebut}:00`}
        slotMaxTime={`${heureFin}:00`}
        slotDuration="00:30:00"
        snapDuration="00:15:00"
        slotEventOverlap={false}
        eventMinHeight={hauteurMin}
        eventShortHeight={hauteurMin}
        dayHeaderContent={(a) => enteteJour(a.date)}
        slotLabelContent={() => null}
        events={[...evenements, ...PLAGES_REPAS]}
        eventContent={ContenuRdv}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onClicRdv(info.event.extendedProps.rdv as RendezVous);
        }}
        eventDidMount={(info) => {
          // Accessibilité : chaque RDV est atteignable au clavier et annoncé
          const rdv = info.event.extendedProps.rdv as RendezVous | undefined;
          if (!rdv) return;
          const el = info.el;
          el.setAttribute("tabindex", "0");
          el.setAttribute("role", "button");
          el.setAttribute("aria-label", `${rdv.type.libelle}, ${plageHoraire(info.event.start!, info.event.end ?? info.event.start!)}`);
          el.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClicRdv(rdv);
            }
          };
        }}
        editable={Boolean(onDeplacer)}
        eventDrop={deplacement}
        eventResize={deplacement}
      />
    </div>
  );
}
