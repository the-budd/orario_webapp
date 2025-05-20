from app import db
from datetime import datetime

class Sostituzione(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data_sostituzione = db.Column(db.Date, nullable=False)
    slot_ora = db.Column(db.String(20), nullable=False) # Es. "08:00-09:00"
    materia_originale = db.Column(db.String(100), nullable=True)
    classe_originale = db.Column(db.String(20), nullable=True)
    aula_originale = db.Column(db.String(50), nullable=True)
    docente_assente_email = db.Column(db.String(120), nullable=False)
    docente_sostituto_email = db.Column(db.String(120), nullable=False)
    timestamp_conferma = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    giorno_settimana = db.Column(db.String(20), nullable=True) # Es. LUNEDI, MARTEDI
    tipo_suggerimento = db.Column(db.String(100), nullable=True) # Es. DISPOSIZIONE, STESSA_MATERIA_LIBERO
    dettaglio_suggerimento = db.Column(db.Text, nullable=True) # Dettaglio testuale del suggerimento

    def __repr__(self):
        return f'<Sostituzione {self.docente_assente_email} -> {self.docente_sostituto_email} il {self.data_sostituzione} ora {self.slot_ora}>' 