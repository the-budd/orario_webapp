import os # Aggiunto per os.environ.get
from app import create_app, db
from app.models import Sostituzione # Assicurati che i modelli siano importati
# from config import Config # Non più necessario importare Config qui

app = create_app()

# Crea le tabelle del database se non esistono già
with app.app_context():
    db.create_all()

# Crea un contesto applicativo per operazioni che lo richiedono,
# come la creazione delle tabelle del database se non si usa Flask-Migrate per l'init.
# Se usi `flask db init`, `flask db migrate`, `flask db upgrade`,
# la riga db.create_all() potrebbe non essere necessaria qui.
@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'Sostituzione': Sostituzione}

if __name__ == '__main__':
    # app.run(debug=True) # debug=True è utile in sviluppo
    # La porta 5000 è spesso usata di default, usiamo 5001 per evitare conflitti se un'altra app usa 5000
    port = int(os.environ.get("PORT", 41500))
    app.run(debug=True, host='0.0.0.0', port=port) 