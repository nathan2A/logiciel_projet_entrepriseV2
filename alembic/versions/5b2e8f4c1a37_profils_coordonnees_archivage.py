"""profils : coordonnées, archivage, type « RDV extérieur »

- utilisateurs : date_naissance, email, telephone (facultatifs) et actif
  (un profil supprimé est archivé : actif = false).
- Données : type de RDV « RDV extérieur » et lieu « Extérieur », que les
  patients peuvent utiliser pour s'ajouter un RDV externe (ajoutés seulement
  s'ils n'existent pas déjà).

Revision ID: 5b2e8f4c1a37
Revises: 7c1e5a9b2d40
Create Date: 2026-11-12 11:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b2e8f4c1a37'
down_revision: Union[str, Sequence[str], None] = '7c1e5a9b2d40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('utilisateurs', sa.Column('date_naissance', sa.Date(), nullable=True))
    op.add_column('utilisateurs', sa.Column('email', sa.String(length=255), nullable=True))
    op.add_column('utilisateurs', sa.Column('telephone', sa.String(length=30), nullable=True))
    op.add_column(
        'utilisateurs',
        sa.Column('actif', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )

    op.execute(
        "INSERT INTO types_rdv (libelle, couleur, duree_par_defaut) "
        "SELECT 'RDV extérieur', '#c1ff72', 120 "
        "WHERE NOT EXISTS (SELECT 1 FROM types_rdv WHERE lower(libelle) IN ('rdv extérieur', 'rdv exterieur'))"
    )
    op.execute(
        "INSERT INTO lieux (libelle) SELECT 'Extérieur' "
        "WHERE NOT EXISTS (SELECT 1 FROM lieux WHERE lower(libelle) IN ('extérieur', 'exterieur'))"
    )


def downgrade() -> None:
    """Downgrade schema.

    Les comptes archivés redeviennent des comptes ordinaires (la colonne
    disparaît). Le type et le lieu ajoutés ne sont retirés que s'ils ne
    servent à aucun RDV.
    """
    op.execute(
        "DELETE FROM types_rdv WHERE libelle = 'RDV extérieur' "
        "AND NOT EXISTS (SELECT 1 FROM rdv WHERE rdv.type_id = types_rdv.id)"
    )
    op.execute(
        "DELETE FROM lieux WHERE libelle = 'Extérieur' "
        "AND NOT EXISTS (SELECT 1 FROM rdv WHERE rdv.lieu_id = lieux.id)"
    )
    op.drop_column('utilisateurs', 'actif')
    op.drop_column('utilisateurs', 'telephone')
    op.drop_column('utilisateurs', 'email')
    op.drop_column('utilisateurs', 'date_naissance')
