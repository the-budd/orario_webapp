import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'una-chiave-segreta-molto-difficile-da-indovinare'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///app.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Configurazioni Google OAuth
    # Assicurati che queste siano impostate nel tuo file .env!
    GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID')
    GOOGLE_OAUTH_CLIENT_SECRET = os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET')
    
    # Configurazioni per Google Admin SDK (per verifica appartenenza a gruppo)
    GOOGLE_ADMIN_GROUP_KEY = os.environ.get('GOOGLE_ADMIN_GROUP_KEY') # Es. 'admin-group@tuodominio.com' o ID del gruppo
    GOOGLE_SERVICE_ACCOUNT_FILE = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE') # Es. 'path/to/your-service-account-file.json'
    # Email di un utente admin del workspace a cui delegare i permessi per Admin SDK (se necessario per il service account)
    GOOGLE_ADMIN_SDK_DELEGATED_USER = os.environ.get('GOOGLE_ADMIN_SDK_DELEGATED_USER')

    # Credenziali Admin per login base (se mantenuto)
    ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME') or 'admin'
    ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD') or 'password' 