from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_dance.contrib.google import make_google_blueprint
import os
from config import Config # Importa la classe Config

# 1. Definisci db QUI, prima di altri import che potrebbero dipenderne indirettamente
db = SQLAlchemy()
migrate = Migrate()

# 2. Ora importa i modelli, che dipendono da 'db' definito sopra
#    Assicurati che models.py usi 'from . import db' o 'from app import db'
#    Preferibilmente 'from . import db' se questo __init__.py è il punto di definizione
from . import models # Questo importerà models.py, che definirà le classi modello

# 3. Importa la funzione di caricamento e le routes DOPO che db e i modelli sono noti (almeno db)
from .routes import load_schedule_data, bp as main_bp # Spostato l'import di main_bp qui

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class) # Carica la configurazione dall'oggetto

    # 4. Inizializza le estensioni con l'app
    db.init_app(app)
    migrate.init_app(app, db)

    # Blueprint per Google OAuth con Flask-Dance
    # Le credenziali client_id e client_secret dovrebbero essere caricate dalla configurazione
    google_bp = make_google_blueprint(
        client_id=app.config.get('GOOGLE_OAUTH_CLIENT_ID'),
        client_secret=app.config.get('GOOGLE_OAUTH_CLIENT_SECRET'),
        scope=["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
        redirect_url='/google_logged_in' # o redirect_to se si vuole specificare la view function name
    )
    app.register_blueprint(google_bp, url_prefix="/login") # Il prefisso /login è per google_bp, quindi l'URL di login sarà /login/google

    # 5. Carica i dati dell'orario
    with app.app_context(): # Assicura che il contesto dell'app sia attivo
        load_schedule_data(app)

    # 6. Registra il blueprint principale
    app.register_blueprint(main_bp)

    # Configura il logging
    if not app.debug and not app.testing:
        # ... (configurazioni di logging esistenti, se presenti)
        pass

    # Crea le tabelle del database se non esistono (opzionale, potresti voler usare le migrazioni)
    # with app.app_context():
    #     db.create_all()

    return app

# Rimuovere tutte le configurazioni globali di 'app' e inizializzazioni di 'db'/'migrate' 
# che erano presenti qui sotto, poiché ora sono gestite dalla factory create_app. 