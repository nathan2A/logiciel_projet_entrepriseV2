"""rdv : plusieurs soignants, patient facultatif

Un rendez-vous peut désormais avoir zéro, un ou plusieurs soignants
(table d'association rdv_soignants) et zéro ou un patient.
Les données existantes sont conservées : le soignant de chaque RDV est
recopié dans rdv_soignants avant la suppression de la colonne soignant_id.

Revision ID: 7c1e5a9b2d40
Revises: d26df00483b8
Create Date: 2026-11-05 11:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c1e5a9b2d40'
down_revision: Union[str, Sequence[str], None] = 'd26df00483b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1) Nouvelle table d'association RDV <-> soignants
    op.create_table(
        'rdv_soignants',
        sa.Column('rdv_id', sa.Integer(), nullable=False),
        sa.Column('soignant_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['rdv_id'], ['rdv.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['soignant_id'], ['soignants.id']),
        sa.PrimaryKeyConstraint('rdv_id', 'soignant_id'),
    )
    op.create_index(op.f('ix_rdv_soignants_soignant_id'), 'rdv_soignants', ['soignant_id'], unique=False)

    # 2) Recopie des soignants existants (aucune donnée perdue)
    op.execute("INSERT INTO rdv_soignants (rdv_id, soignant_id) SELECT id, soignant_id FROM rdv")

    # 3) Suppression de l'ancienne colonne (son index et sa clé étrangère partent avec)
    op.drop_index(op.f('ix_rdv_soignant_id'), table_name='rdv')
    op.drop_column('rdv', 'soignant_id')

    # 4) Le patient devient facultatif (RDV entre soignants : staff, transmissions…)
    op.alter_column('rdv', 'patient_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    """Downgrade schema.

    Retour en arrière : chaque RDV garde UN seul soignant (le plus petit identifiant).
    Les RDV sans soignant ou sans patient ne peuvent pas être représentés dans
    l'ancien modèle : ils sont supprimés.
    """
    op.add_column('rdv', sa.Column('soignant_id', sa.Integer(), nullable=True))
    op.execute(
        "UPDATE rdv SET soignant_id = (SELECT MIN(rs.soignant_id) FROM rdv_soignants rs WHERE rs.rdv_id = rdv.id)"
    )
    op.execute("DELETE FROM rdv WHERE soignant_id IS NULL OR patient_id IS NULL")
    op.alter_column('rdv', 'soignant_id', existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key('rdv_soignant_id_fkey', 'rdv', 'soignants', ['soignant_id'], ['id'])
    op.create_index(op.f('ix_rdv_soignant_id'), 'rdv', ['soignant_id'], unique=False)
    op.alter_column('rdv', 'patient_id', existing_type=sa.Integer(), nullable=False)
    op.drop_index(op.f('ix_rdv_soignants_soignant_id'), table_name='rdv_soignants')
    op.drop_table('rdv_soignants')
