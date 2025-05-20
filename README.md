# Orario WebApp

Applicazione web per la visualizzazione dell'orario scolastico e la gestione delle sostituzioni.

## Setup Iniziale

1.  Assicurati di avere Python 3 installato.
2.  Crea un ambiente virtuale (consigliato):
    ```bash
    python -m venv venv
    # Su Windows
    venv\Scripts\activate
    # Su macOS/Linux
    source venv/bin/activate
    ```
3.  Installa le dipendenze:
    ```bash
    pip install -r requirements.txt
    ```
4.  Copia il file `orario_generato_DB_INTERATTIVO.json` (o il tuo file JSON dell'orario) nella cartella `orario_webapp/app/static/data/`. Se la cartella `data` non esiste, creala.
5.  Esegui l'applicazione:
    ```bash
    python run.py
    ```
6.  Apri il browser e vai a `http://127.0.0.1:5000/` 