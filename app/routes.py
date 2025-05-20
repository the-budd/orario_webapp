from flask import render_template, jsonify, current_app, request, flash, redirect, url_for, session, Blueprint
import functools # Per login_required
from app.models import Sostituzione
import os
import json
from datetime import datetime
from flask_dance.contrib.google import google # Importa l'oggetto google proxy
import requests # Import per le eccezioni di requests
import traceback # Aggiunto per il logging degli errori

# Import per Google Admin SDK
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Importa la configurazione per accedere a ADMIN_USERNAME e ADMIN_PASSWORD
from config import Config

# bp = Blueprint('main', __name__, template_folder='templates', static_folder='static')
# Se hai templates/static specifici per questo blueprint.
# Altrimenti, Flask li cerca nelle cartelle di default dell'applicazione.
bp = Blueprint('main', __name__)

# Credenziali Admin ora prese dalla configurazione
# ADMIN_USERNAME = Config.ADMIN_USERNAME
# ADMIN_PASSWORD = Config.ADMIN_PASSWORD

# --- CONFIGURAZIONE GLOBALE ---
NOME_FILE_ORARIO = 'orario_generato_DB_INTERATTIVO.json' # VERIFICA QUESTO NOME!

# --- CARICAMENTO DATI ORARIO ---
all_schedule_data = []
ORARIO_JSON_PATH = "" 

def load_schedule_data(app_instance): # Ora prende l'istanza dell'app
    global all_schedule_data, ORARIO_JSON_PATH
    
    ORARIO_JSON_PATH = os.path.join(app_instance.root_path, NOME_FILE_ORARIO)
    
    app_instance.logger.info(f"Tentativo di caricamento del file orario da: {ORARIO_JSON_PATH}")
    try:
        with open(ORARIO_JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if not isinstance(data, list):
            app_instance.logger.error(f"Il contenuto di {ORARIO_JSON_PATH} non è una lista JSON.")
            all_schedule_data = [{'error': f"File orario non valido: il contenuto non è una lista JSON."}]
        elif not data: 
            app_instance.logger.warning(f"Il file {ORARIO_JSON_PATH} contiene una lista JSON vuota.")
            all_schedule_data = [] 
        else:
            all_schedule_data = data
            app_instance.logger.info(f"File orario {ORARIO_JSON_PATH} caricato con successo: {len(all_schedule_data)} record.")

    except FileNotFoundError:
        app_instance.logger.error(f"ERRORE CRITICO: File orario non trovato: {ORARIO_JSON_PATH}")
        all_schedule_data = [{'error': f"File orario ({NOME_FILE_ORARIO}) non trovato: {ORARIO_JSON_PATH}."}]
    except json.JSONDecodeError as e:
        app_instance.logger.error(f"ERRORE CRITICO: Decodifica JSON fallita per {ORARIO_JSON_PATH}. Dettagli: {e}")
        all_schedule_data = [{'error': f"Errore parsing JSON: {ORARIO_JSON_PATH}. Dettagli: {e}"}]
    except Exception as e:
        app_instance.logger.error(f"ERRORE CRITICO: Caricamento fallito per {ORARIO_JSON_PATH}: {e}")
        traceback.print_exc()
        all_schedule_data = [{'error': f"Errore generico caricamento orario.json: {e}"}]

def login_required(view):
    """Decoratore per richiedere il login a una view."""
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if 'user_id' not in session:
            flash('Devi effettuare il login per accedere a questa pagina.', 'warning')
            return redirect(url_for('main.login', next=request.url))
        return view(**kwargs)
    return wrapped_view

def admin_required(view):
    """Decoratore per richiedere privilegi di amministratore."""
    @functools.wraps(view)
    @login_required # Un admin deve essere prima loggato
    def wrapped_view(**kwargs):
        if not session.get('is_admin', False):
            flash('Accesso negato. Questa sezione richiede privilegi di amministratore.', 'danger')
            # Reindirizza alla homepage o a una pagina di errore "non autorizzato"
            # Potrebbe essere anche current_app.logger.warning(...) per tracciare tentativi di accesso non autorizzati
            return redirect(url_for('main.index')) 
        return view(**kwargs)
    return wrapped_view

@bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        # Usa Config per accedere alle credenziali admin
        if username == current_app.config.get('ADMIN_USERNAME') and password == current_app.config.get('ADMIN_PASSWORD'):
            session.clear()
            session['user_id'] = username 
            session['username'] = username
            session['is_admin'] = True # Imposta admin per il login tradizionale
            session['login_type'] = 'traditional'
            flash('Login effettuato con successo come Amministratore!', 'success')
            next_page = request.args.get('next')
            return redirect(next_page or url_for('main.index'))
        else:
            flash('Credenziali non valide. Riprova.', 'danger')
    return render_template('login.html', title='Login')

@bp.route('/logout')
@login_required
def logout():
    session.clear()
    flash('Logout effettuato con successo.', 'info')
    return redirect(url_for('main.login'))

@bp.route('/')
@bp.route('/index')
@login_required
def index():
    return render_template('index.html', title='Orario Settimanale')

@bp.route('/gestione_sostituzioni')
@admin_required
def gestione_sostituzioni():
    return render_template('sostituzioni.html', title='Gestione Sostituzioni')

@bp.route('/occupazione_spazi')
@login_required
def occupazione_spazi():
    return render_template('occupazione_aule.html', title='Mappa Occupazione Spazi')

@bp.route('/visualizza_sostituzioni')
@login_required
def visualizza_sostituzioni():
    try:
        sostituzioni_registrate = Sostituzione.query.order_by(Sostituzione.data_sostituzione.desc(), Sostituzione.timestamp_conferma.desc()).all()
        is_admin_session = session.get('is_admin', False)
        return render_template('visualizza_sostituzioni.html', 
                               title='Sostituzioni Registrate', 
                               sostituzioni=sostituzioni_registrate,
                               is_admin=is_admin_session,
                               _format_teacher_name_for_display=_format_teacher_name_for_display)
    except Exception as e:
        current_app.logger.error(f"Errore durante il recupero delle sostituzioni registrate: {e}")
        return render_template('error.html', error_message="Si è verificato un errore nel caricare le sostituzioni registrate."), 500

@bp.route('/elimina_sostituzione/<int:sostituzione_id>', methods=['POST'])
@admin_required
def elimina_sostituzione(sostituzione_id):
    from app import db # <-- QUESTA RIGA E' PRESENTE?
    from app.models import Sostituzione # <-- E QUESTA?
    try:
        sostituzione_da_eliminare = Sostituzione.query.get(sostituzione_id)
        if not sostituzione_da_eliminare:
            flash('Sostituzione non trovata.', 'danger')
            return redirect(url_for('main.visualizza_sostituzioni'))

        Sostituzione.query.filter_by(id=sostituzione_id).delete()
        db.session.commit()
        flash('Sostituzione eliminata con successo.', 'success')
        current_app.logger.info(f"Sostituzione ID {sostituzione_id} eliminata dall'utente {session.get('username')}.")
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Errore durante l'eliminazione della sostituzione ID {sostituzione_id}: {e}")
        flash(f"Errore durante l'eliminazione della sostituzione: {str(e)}", 'danger')
    return redirect(url_for('main.visualizza_sostituzioni'))

@bp.route('/modifica_sostituzione/<int:sostituzione_id>', methods=['GET', 'POST'])
@admin_required
def modifica_sostituzione(sostituzione_id):
    from app import db # <-- QUESTA RIGA E' PRESENTE?
    from app.models import Sostituzione # <-- E QUESTA?
    sostituzione_da_modificare = Sostituzione.query.get(sostituzione_id)
    if not sostituzione_da_modificare:
        flash('Sostituzione non trovata.', 'danger')
        return redirect(url_for('main.visualizza_sostituzioni'))
    
    all_teachers_tuples = []
    try:
        # Il percorso static_folder è accessibile tramite current_app
        data_file_path = os.path.join(current_app.static_folder, 'data', 'orario_generato_DB_INTERATTIVO.json')
        with open(data_file_path, 'r', encoding='utf-8') as f:
            orario_json = json.load(f)
        
        teacher_emails_from_json = set()
        for item in orario_json:
            docenti_item = item.get('Docente')
            if isinstance(docenti_item, list):
                teacher_emails_from_json.update(docenti_item)
            elif isinstance(docenti_item, str):
                teacher_emails_from_json.add(docenti_item)
        
        docenti_da_sostituzioni_db = Sostituzione.query.with_entities(Sostituzione.docente_assente_email, Sostituzione.docente_sostituto_email).distinct().all()
        for assente_email, sostituto_email in docenti_da_sostituzioni_db:
            if assente_email: teacher_emails_from_json.add(assente_email)
            if sostituto_email: teacher_emails_from_json.add(sostituto_email)
            
        all_teachers_tuples = sorted([
            (email, _format_teacher_name_for_display(email)) 
            for email in teacher_emails_from_json if email and email.strip()
        ], key=lambda x: x[1])
        
    except Exception as e:
        current_app.logger.error(f"Errore nel caricare la lista docenti per il form di modifica: {e}")
        flash("Errore nel caricare la lista completa dei docenti.", "danger")

    if request.method == 'POST':
        try:
            sostituzione_da_modificare.docente_sostituto_email = request.form.get('docente_sostituto_email')
            sostituzione_da_modificare.materia_originale = request.form.get('materia_originale')
            sostituzione_da_modificare.classe_originale = request.form.get('classe_originale')
            sostituzione_da_modificare.aula_originale = request.form.get('aula_originale')
            
            if not sostituzione_da_modificare.docente_sostituto_email:
                flash('Il campo "Docente Sostituto" non può essere vuoto.', 'warning')
                return render_template('modifica_sostituzione.html',
                                       title='Modifica Sostituzione',
                                       sostituzione=sostituzione_da_modificare,
                                       all_teachers=all_teachers_tuples)

            db.session.commit()
            flash('Sostituzione aggiornata con successo!', 'success')
            current_app.logger.info(f"Sostituzione ID {sostituzione_id} aggiornata dall'utente {session.get('username')}.")
            return redirect(url_for('main.visualizza_sostituzioni'))
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Errore durante l'aggiornamento della sostituzione ID {sostituzione_id}: {e}")
            flash(f"Errore durante l'aggiornamento: {str(e)}", 'danger')

    return render_template('modifica_sostituzione.html', 
                           title='Modifica Sostituzione', 
                           sostituzione=sostituzione_da_modificare,
                           all_teachers=all_teachers_tuples)

# API Endpoints - generalmente non richiedono login di sessione se usati da client JS
# ma potrebbero avere altri meccanismi di auth (es. token API) se necessario.
# Per ora, li lascio senza @login_required.

@bp.route('/api/orario')
def api_orario():
    # Se all_schedule_data[0] è un dict e contiene 'error', c'è stato un problema di caricamento
    if isinstance(all_schedule_data, list) and len(all_schedule_data) > 0 and \
       isinstance(all_schedule_data[0], dict) and 'error' in all_schedule_data[0]:
        return jsonify(all_schedule_data[0]), 500 # Restituisci l'errore
    return jsonify(all_schedule_data)

GIORNI_MAP = {
    0: "LUNEDI", 1: "MARTEDI", 2: "MERCOLEDI", 3: "GIOVEDI", 4: "VENERDI", 5: "SABATO", 6: "DOMENICA"
}
# Definisci i giorni lavorativi standard, potresti volerli rendere configurabili
GIORNI_LAVORATIVI_STANDARD = [GIORNI_MAP[i] for i in range(5)] # LUNEDI a VENERDI

@bp.route('/api/docente_orario_giorno')
def api_docente_orario_giorno():
    docente_email = request.args.get('docente_email')
    data_str = request.args.get('data')

    if not docente_email or not data_str:
        return jsonify({"error": "Parametri mancanti: docente_email e data sono richiesti"}), 400

    try:
        data_obj = datetime.strptime(data_str, '%Y-%m-%d')
        giorno_settimana_json = GIORNI_MAP.get(data_obj.weekday())
        if not giorno_settimana_json:
            return jsonify({"error": "Giorno non valido o non mappato (es. weekend non gestito)"}), 400
    except ValueError:
        return jsonify({"error": "Formato data non valido. Usare YYYY-MM-DD."}), 400

    data_file_path = os.path.join(current_app.static_folder, 'data', 'orario_generato_DB_INTERATTIVO.json')
    try:
        with open(data_file_path, 'r', encoding='utf-8') as f:
            orario_completo = json.load(f)
        
        lezioni_docente_giorno = []
        for lezione in orario_completo:
            docenti_lezione = []
            if isinstance(lezione.get('Docente'), list):
                docenti_lezione = lezione.get('Docente', [])
            elif isinstance(lezione.get('Docente'), str):
                docenti_lezione = [lezione.get('Docente')]

            if (docente_email in docenti_lezione and 
                lezione.get('Giorno') == giorno_settimana_json):
                lezioni_docente_giorno.append({
                    "SlotOre": lezione.get('SlotOre'),
                    "materia1": lezione.get('materia1'),
                    "Classe": lezione.get('Classe'),
                    "Aula": lezione.get('Aula')
                })
        
        lezioni_docente_giorno.sort(key=lambda x: x.get('SlotOre', ''))

        return jsonify(lezioni_docente_giorno)

    except FileNotFoundError:
        current_app.logger.error(f"File orario non trovato in {data_file_path} per api_docente_orario_giorno")
        return jsonify({"error": "File orario non trovato"}), 404
    except Exception as e:
        current_app.logger.error(f"Errore imprevisto in api_docente_orario_giorno: {e}")
        return jsonify({"error": "Errore interno del server"}), 500

def _format_teacher_name_for_display(email):
    if not email or '@' not in email:
        return email if email else "" # Gestisce None o stringa vuota
    name_part = email.split('@')[0]
    name_part = name_part.replace('.', ' ')
    return ' '.join([word.capitalize() for word in name_part.split()])

@bp.route('/api/suggerisci_sostituti', methods=['GET'])
def api_suggerisci_sostituti():
    # Assicura che i dati dell'orario siano caricati
    if not all_schedule_data or \
       (isinstance(all_schedule_data, list) and len(all_schedule_data) > 0 and \
        isinstance(all_schedule_data[0], dict) and 'error' in all_schedule_data[0]):
        current_app.logger.info("/api/suggerisci_sostituti: Dati orario non presenti o con errore, tento ricaricamento.")
        load_schedule_data(current_app._get_current_object())

    # Controlla nuovamente dopo il tentativo di caricamento
    if isinstance(all_schedule_data, list) and len(all_schedule_data) > 0 and \
       isinstance(all_schedule_data[0], dict) and 'error' in all_schedule_data[0]:
        current_app.logger.error(f"/api/suggerisci_sostituti: Errore caricamento dati: {all_schedule_data[0]['error']}")
        return jsonify({"error": all_schedule_data[0]['error']}), 500
    if not all_schedule_data:
        current_app.logger.error("/api/suggerisci_sostituti: all_schedule_data è vuoto dopo il caricamento.")
        return jsonify({"error": "Dati orario non disponibili sul server."}), 500

    data_str = request.args.get('data')
    slot_ora_richiesto = request.args.get('slot_ora')
    docente_assente_email_param = request.args.get('docente_assente_email')
    classe_originale_param = request.args.get('classe_originale')
    materia_originale_param = request.args.get('materia_originale') # Non ancora usata attivamente, ma letta

    current_app.logger.info(f"[API Suggerimenti] Richiesta per: Data={data_str}, Slot={slot_ora_richiesto}, Assente/i='{docente_assente_email_param}', Classe Orig='{classe_originale_param}', Materia Orig='{materia_originale_param}'")

    if not all([data_str, slot_ora_richiesto, docente_assente_email_param, classe_originale_param]): 
        return jsonify({"error": "Parametri mancanti: 'data', 'slot_ora', 'docente_assente_email' e 'classe_originale' sono richiesti."}), 400

    try:
        data_obj = datetime.strptime(data_str, '%Y-%m-%d')
        giorno_settimana_json = GIORNI_MAP.get(data_obj.weekday()) # GIORNI_MAP converte Lunedì=0 in "LUNEDI"
        if not giorno_settimana_json:
            return jsonify({"error": f"Giorno della settimana per la data {data_str} non mappato."}), 400
    except ValueError:
        return jsonify({"error": "Formato data non valido. Usare YYYY-MM-DD."}), 400

    docenti_assenti_da_escludere = set()
    if isinstance(docente_assente_email_param, str):
        docenti_assenti_da_escludere.update(email.strip() for email in docente_assente_email_param.split(',') if email.strip())
    
    current_app.logger.debug(f"[API Suggerimenti] Giorno JSON: {giorno_settimana_json}, Slot: {slot_ora_richiesto}, Docenti da escludere: {docenti_assenti_da_escludere}")

    suggerimenti = []
    docenti_gia_suggeriti = set()

    docenti_gia_sostituti_db = set()
    try:
        sostituzioni_esistenti_nello_slot = Sostituzione.query.filter_by(
            data_sostituzione=data_obj.date(), 
            slot_ora=slot_ora_richiesto
        ).all()
        for sost_db in sostituzioni_esistenti_nello_slot:
            if sost_db.docente_sostituto_email:
                 docenti_gia_sostituti_db.add(sost_db.docente_sostituto_email)
        current_app.logger.debug(f"[API Suggerimenti] Docenti già sostituti (DB) per {data_str} {slot_ora_richiesto}: {docenti_gia_sostituti_db}")
    except Exception as e:
        current_app.logger.error(f"[API Suggerimenti] Errore query sostituzioni esistenti per {data_obj.date()} {slot_ora_richiesto}: {e}")

    docenti_con_disposizione_nello_slot = set()
    if isinstance(all_schedule_data, list):
        for entry in all_schedule_data:
            if isinstance(entry, dict) and \
               entry.get('Giorno') == giorno_settimana_json and \
               entry.get('SlotOre') == slot_ora_richiesto and \
               entry.get('materia1', '').strip().upper() == "DISPOSIZIONE":
                \
                docenti_raw = entry.get('Docente')
                if isinstance(docenti_raw, str):
                    docenti_con_disposizione_nello_slot.add(docenti_raw.strip())
                elif isinstance(docenti_raw, list):
                    for d_email in docenti_raw: # Rinominato d in d_email per chiarezza
                        if isinstance(d_email, str) and d_email.strip():
                            docenti_con_disposizione_nello_slot.add(d_email.strip())
    
    current_app.logger.debug(f"[API Suggerimenti] Docenti potenzialmente a DISPOSIZIONE (JSON): {docenti_con_disposizione_nello_slot}")

    docenti_effettivamente_liberi_per_dispo = set()
    if isinstance(all_schedule_data, list):
        for doc_email_dispo_check in docenti_con_disposizione_nello_slot: 
            impegnato_in_altra_lezione = False
            for entry_check in all_schedule_data:
                if isinstance(entry_check, dict) and \
                   entry_check.get('Giorno') == giorno_settimana_json and \
                   entry_check.get('SlotOre') == slot_ora_richiesto and \
                   entry_check.get('materia1', '').strip().upper() != "DISPOSIZIONE":
                    
                    docenti_lezione_check_raw = entry_check.get('Docente')
                    docenti_lezione_check = []
                    if isinstance(docenti_lezione_check_raw, str):
                        docenti_lezione_check.append(docenti_lezione_check_raw.strip())
                    elif isinstance(docenti_lezione_check_raw, list):
                        docenti_lezione_check = [d_check.strip() for d_check in docenti_lezione_check_raw if isinstance(d_check, str) and d_check.strip()]
                    
                    if doc_email_dispo_check in docenti_lezione_check:
                        impegnato_in_altra_lezione = True
                        current_app.logger.debug(f"[API Suggerimenti] Docente {doc_email_dispo_check} ha DISPOSIZIONE ma è anche impegnato in '{entry_check.get('materia1')}' nello stesso slot.")
                        break # Trovata lezione concomitante, non è libero per dispo
            
            if not impegnato_in_altra_lezione:
                docenti_effettivamente_liberi_per_dispo.add(doc_email_dispo_check)

    current_app.logger.debug(f"[API Suggerimenti] Docenti effettivamente liberi (solo DISPOSIZIONE nello slot): {docenti_effettivamente_liberi_per_dispo}")

    for doc_email_sugg in docenti_effettivamente_liberi_per_dispo: 
        if doc_email_sugg not in docenti_assenti_da_escludere and \
           doc_email_sugg not in docenti_gia_sostituti_db and \
           doc_email_sugg not in docenti_gia_suggeriti:
            
            suggerimenti.append({
                "docente_email": doc_email_sugg,
                "docente_nome_visualizzato": _format_teacher_name_for_display(doc_email_sugg),
                "tipo_suggerimento": "DISPOSIZIONE",
                "info_aggiuntive": "Docente a disposizione.",
                "priorita": 1 # Priorità massima per DISPOSIZIONE
            })
            docenti_gia_suggeriti.add(doc_email_sugg)

    # --- NUOVA LOGICA PER DOCENTI NELLA STESSA CLASSE, ALTRO SLOT ---
    current_app.logger.debug(f"[API Suggerimenti] Inizio ricerca docenti con lezione nella stessa classe '{classe_originale_param}' in altri slot.")
    if isinstance(all_schedule_data, list) and classe_originale_param: # Assicurati che classe_originale_param esista
        for entry_stessa_classe in all_schedule_data:
            if not isinstance(entry_stessa_classe, dict): continue

            doc_entry_classe = entry_stessa_classe.get('Docente')
            giorno_entry_classe = entry_stessa_classe.get('Giorno')
            slot_entry_classe = entry_stessa_classe.get('SlotOre')
            classe_entry = entry_stessa_classe.get('Classe')
            materia_entry_classe = entry_stessa_classe.get('materia1', 'N/D')

            if giorno_entry_classe == giorno_settimana_json and \
               classe_entry == classe_originale_param and \
               slot_entry_classe != slot_ora_richiesto:

                docenti_nella_lezione_stessa_classe = []
                if isinstance(doc_entry_classe, str) and doc_entry_classe.strip():
                    docenti_nella_lezione_stessa_classe.append(doc_entry_classe.strip())
                elif isinstance(doc_entry_classe, list):
                    for d_stessa_cl in doc_entry_classe:
                        if isinstance(d_stessa_cl, str) and d_stessa_cl.strip():
                            docenti_nella_lezione_stessa_classe.append(d_stessa_cl.strip())
                
                for docente_proposto_stessa_classe in docenti_nella_lezione_stessa_classe:
                    if docente_proposto_stessa_classe not in docenti_assenti_da_escludere and \
                       docente_proposto_stessa_classe not in docenti_gia_sostituti_db and \
                       docente_proposto_stessa_classe not in docenti_gia_suggeriti:
                        
                        info_slot_esistente = f"Insegna {materia_entry_classe} alla {classe_entry} ({slot_entry_classe})"
                        suggerimenti.append({
                            "docente_email": docente_proposto_stessa_classe,
                            "docente_nome_visualizzato": _format_teacher_name_for_display(docente_proposto_stessa_classe),
                            "tipo_suggerimento": "STESSA_CLASSE_ALTRO_SLOT",
                            "info_aggiuntive": info_slot_esistente,
                            "priorita": 3 
                        })
                        docenti_gia_suggeriti.add(docente_proposto_stessa_classe)
    # --- FINE LOGICA STESSA CLASSE, ALTRO SLOT ---

    suggerimenti.sort(key=lambda x: (x.get('priorita', 99), x['docente_nome_visualizzato']))
    
    current_app.logger.info(f"[API Suggerimenti] Suggerimenti finali ({len(suggerimenti)}): {json.dumps(suggerimenti, ensure_ascii=False) if suggerimenti else 'Nessuno'}")
    
    return jsonify(suggerimenti)

@bp.route('/api/conferma_sostituzione', methods=['POST'])
@admin_required # Solo gli admin possono confermare
def api_conferma_sostituzione():
    try:
        from app import db # Importa db qui
        from app.models import Sostituzione # Importa Sostituzione qui
        data = request.get_json()
        current_app.logger.info(f"Dati ricevuti per conferma sostituzione: {data}")

        docente_assente_email = data.get('docenteAssenteEmail')
        docente_sostituto_email = data.get('docenteSostitutoEmail')
        data_sostituzione_str = data.get('dataSostituzione')
        slot_ora = data.get('slot_ora')
        materia_originale = data.get('materiaOriginale')
        classe_originale = data.get('classeOriginale')
        aula_originale = data.get('aulaOriginale')
        tipo_suggerimento_usato = data.get('tipo_suggerimento_usato')

        # Validazione base dei dati
        error_messages = []
        if not docente_assente_email: error_messages.append("Docente assente mancante.")
        if not docente_sostituto_email: error_messages.append("Docente sostituto mancante.")
        if not data_sostituzione_str: error_messages.append("Data sostituzione mancante.")
        if not slot_ora: error_messages.append("Slot orario mancante.")
        # materia, classe, aula, tipo_suggerimento possono essere opzionali o avere default

        if error_messages:
            current_app.logger.error(f"Dati mancanti per conferma sostituzione: {error_messages}")
            return jsonify({"error": "Dati mancanti: " + ", ".join(error_messages)}), 400
        
        try:
            data_sostituzione_obj = datetime.strptime(data_sostituzione_str, '%Y-%m-%d').date()
        except ValueError:
            current_app.logger.error(f"Formato data non valido per conferma: {data_sostituzione_str}")
            return jsonify({"error": "Formato data non valido. Usare YYYY-MM-DD."}), 400

        # Logica anti-duplicazione (opzionale, ma buona pratica)
        # Potresti voler verificare se una sostituzione identica (stesso assente, stesso sostituto, stessa ora/data) è già stata registrata
        # Questo dipende dalle regole di business.
        # Per ora, procediamo con l'inserimento diretto.

        giorno_settimana_sost = GIORNI_MAP.get(data_sostituzione_obj.weekday())

        nuova_sostituzione = Sostituzione(
            docente_assente_email=docente_assente_email,
            docente_sostituto_email=docente_sostituto_email,
            data_sostituzione=data_sostituzione_obj,
            slot_ora=slot_ora,
            materia_originale=materia_originale,
            classe_originale=classe_originale,
            aula_originale=aula_originale,
            giorno_settimana=giorno_settimana_sost,
            tipo_suggerimento=tipo_suggerimento_usato,
            timestamp_conferma=datetime.utcnow() # Default è già utcnow, ma esplicito è ok
        )

        db.session.add(nuova_sostituzione)
        db.session.commit()

        current_app.logger.info(f"Sostituzione ID {nuova_sostituzione.id} registrata da utente {session.get('username', 'N/A')}")
        return jsonify({
            "success": True, 
            "message": "Sostituzione confermata e registrata con successo!",
            "sostituzione_id": nuova_sostituzione.id
        }), 201

    except Exception as e:
        db.session.rollback() # Esegui rollback in caso di errore prima del commit o durante
        current_app.logger.error(f"Errore API conferma_sostituzione: {e}", exc_info=True)
        return jsonify({"error": f"Errore interno del server durante la conferma della sostituzione: {str(e)}"}), 500

@bp.route('/api/occupazione_aule')
# @login_required # Da valutare se questa API debba essere protetta
def api_occupazione_aule():
    data_file_path = os.path.join(current_app.static_folder, 'data', 'orario_generato_DB_INTERATTIVO.json')
    selected_date_str = request.args.get('data', datetime.now().strftime('%Y-%m-%d'))
    
    try:
        selected_date = datetime.strptime(selected_date_str, '%Y-%m-%d').date()
        giorno_settimana_num = selected_date.weekday() # Lunedì è 0, Domenica è 6
        giorno_settimana_json = GIORNI_MAP.get(giorno_settimana_num)

        if not giorno_settimana_json: # Se è un giorno non mappato (es. Domenica o se GIORNI_MAP non la include)
            return jsonify({"aule_occupate": [], "giorno_visualizzato": selected_date_str, "giorno_settimana": "Non valido", "error": "Giorno non scolastico o non mappato."})

    except ValueError:
        return jsonify({"error": "Formato data non valido. Usare YYYY-MM-DD."}), 400

    try:
        with open(data_file_path, 'r', encoding='utf-8') as f:
            orario_completo = json.load(f)
    except FileNotFoundError:
        return jsonify({"error": "File orario non trovato."}), 404
    except Exception as e:
        current_app.logger.error(f"Errore caricamento file orario per occupazione aule: {e}")
        return jsonify({"error": f"Errore caricamento dati orario: {str(e)}"}), 500

    aule_occupate = []
    slot_ore_definiti = sorted(list(set(entry['SlotOre'] for entry in orario_completo if 'SlotOre' in entry)))

    # NUOVO: Filtra slot_ore_definiti per includere solo quelli tra le 08:00 e le 15:00
    slot_ore_filtrati = []
    for slot_str in slot_ore_definiti: # Rinominato slot in slot_str per evitare confusione con la var slot successiva
        try:
            start_time_str = slot_str.split('-')[0] # "08:00"
            start_hour = int(start_time_str.split(':')[0])
            # Includi slot che iniziano dalle 08:00 (inclusa) fino alle 14:xx (per finire entro le 15:xx)
            if 8 <= start_hour < 15: 
                slot_ore_filtrati.append(slot_str)
        except Exception as e:
            current_app.logger.warning(f"Errore nel parsing dello slot orario '{slot_str}': {e}. Verrà escluso dai filtrati.")
            # Non lo aggiungiamo se non possiamo parsarlo correttamente per il filtro orario

    # Itera sugli slot filtrati
    for slot in slot_ore_filtrati: # Usa la lista filtrata
        occupazioni_slot = []
        for lezione in orario_completo:
            if lezione.get('Giorno') == giorno_settimana_json and lezione.get('SlotOre') == slot:
                aula_lezione = lezione.get('Aula', 'N/D')
                if aula_lezione and aula_lezione.strip() and aula_lezione.upper() not in ["VIRT", "VIRTUALE", "DDI", "DAD", "ESTERNA"]: # Ignora aule non fisiche
                    # Gestione aule multiple separate da ',' o '/'
                    aule_singole = aula_lezione.replace('/', ',').split(',')
                    for aula_pulita in aule_singole:
                        aula_pulita = aula_pulita.strip()
                        if aula_pulita:
                             docenti_lezione = []
                             doc_data = lezione.get('Docente')
                             if isinstance(doc_data, list):
                                 docenti_lezione = [_format_teacher_name_for_display(d) for d in doc_data]
                             elif isinstance(doc_data, str):
                                 docenti_lezione = [_format_teacher_name_for_display(doc_data)]


                             occupazioni_slot.append({
                                "aula": aula_pulita,
                                "materia": lezione.get('materia1', 'N/D'),
                                "classe": lezione.get('Classe', 'N/D'),
                                "docente": ", ".join(docenti_lezione) if docenti_lezione else 'N/D'
                            })
        if occupazioni_slot:
             # Ordina per nome aula all'interno dello slot
            occupazioni_slot.sort(key=lambda x: x['aula'])
            aule_occupate.append({"slotOra": slot, "occupazioni": occupazioni_slot})
            
    # Recupera le sostituzioni per il giorno selezionato per aggiornare le info
    try:
        sostituzioni_del_giorno = Sostituzione.query.filter(Sostituzione.data_sostituzione == selected_date).all() # Modificato
        
        if sostituzioni_del_giorno:
            map_sostituzioni = {} # chiave: (slot_ora, classe_originale, materia_originale) -> docente_sostituto
            for s in sostituzioni_del_giorno:
                # Usiamo una chiave più specifica per identificare l'ora da sovrascrivere
                # Questo assume che una sostituzione rimpiazzi una specifica lezione
                key = (s.slot_ora, s.classe_originale, s.materia_originale, s.aula_originale) 
                map_sostituzioni[key] = {
                    "docente_sostituto": _format_teacher_name_for_display(s.docente_sostituto_email),
                    "docente_assente": _format_teacher_name_for_display(s.docente_assente_email) # Per info
                }

            for slot_info in aule_occupate:
                for occupazione in slot_info['occupazioni']:
                    # Verifica se questa occupazione è stata sostituita
                    key_attuale = (slot_info['slotOra'], occupazione['classe'], occupazione['materia'], occupazione['aula'])
                    sostituzione_trovata = map_sostituzioni.get(key_attuale)

                    if sostituzione_trovata:
                        occupazione['docente_originale'] = occupazione['docente']
                        occupazione['docente'] = sostituzione_trovata['docente_sostituto']
                        occupazione['sostituzione_info'] = f"(Sostituisce {sostituzione_trovata['docente_assente']})"
                        occupazione['is_sostituita'] = True
                        
    except Exception as e:
        current_app.logger.error(f"Errore nel recuperare o applicare le sostituzioni alla mappa aule: {e}")


    return jsonify({
        "aule_occupate": aule_occupate, 
        "giorno_visualizzato": selected_date_str,
        "giorno_settimana": giorno_settimana_json,
        "giorni_validi_settimana": GIORNI_LAVORATIVI_STANDARD, # NUOVO
        "slot_ore": slot_ore_filtrati # RINOMINATO (da slot_disponibili) E USATO LISTA FILTRATA
    })

@bp.route("/google_logged_in")
def google_logged_in():
    current_app.logger.info(f"Entrato in /google_logged_in. google.authorized: {google.authorized}")
    if not google.authorized:
        flash("Accesso con Google fallito o negato (google.authorized è False).", "danger")
        current_app.logger.warning("Accesso Google negato o fallito: google.authorized è False.")
        return redirect(url_for("main.login"))

    try:
        current_app.logger.info("Tentativo di recuperare user_info da Google...")
        user_info_response = None # Inizializza
        try:
            # Aumenta il timeout se necessario, default è None (attende indefinitamente per la connessione, ma c'è un timeout di lettura)
            # Mettiamo un timeout esplicito per connessione e lettura
            user_info_response = google.get("/oauth2/v2/userinfo", timeout=(5, 10)) # timeout (connect, read) in secondi
            current_app.logger.info(f"Risposta da Google per user_info: Status {user_info_response.status_code}")
        except requests.exceptions.Timeout as timeout_e:
            current_app.logger.error(f"Timeout durante la richiesta a Google userinfo: {timeout_e}")
            flash("Timeout durante la comunicazione con Google. Riprova.", "danger")
            return redirect(url_for("main.login"))
        except requests.exceptions.ConnectionError as conn_e:
            current_app.logger.error(f"Errore di connessione durante la richiesta a Google userinfo: {conn_e}")
            flash("Errore di connessione nel comunicare con Google. Controlla la tua rete.", "danger")
            return redirect(url_for("main.login"))
        except Exception as req_e: # Altre eccezioni da requests o dalla chiamata
            current_app.logger.error(f"Eccezione durante google.get userinfo: {req_e}", exc_info=True)
            flash("Errore imprevisto nella richiesta a Google.", "danger")
            return redirect(url_for("main.login"))

        if user_info_response and user_info_response.ok:
            user_info = user_info_response.json()
            current_app.logger.info(f"User info da Google: {user_info}")
            google_email = user_info.get("email")
            google_user_name = user_info.get("name", google_email)

            if not google_email:
                flash("Impossibile recuperare l'indirizzo email da Google.", "danger")
                current_app.logger.error("Email non trovata nelle info utente di Google.")
                return redirect(url_for("main.login"))

            session.clear()
            session['user_id'] = google_email
            session['username'] = google_user_name
            session['login_type'] = 'google'
            
            admin_group_key = current_app.config.get('GOOGLE_ADMIN_GROUP_KEY')
            service_account_file = current_app.config.get('GOOGLE_SERVICE_ACCOUNT_FILE')
            delegated_user = current_app.config.get('GOOGLE_ADMIN_SDK_DELEGATED_USER')
            is_group_member = False

            if admin_group_key and service_account_file and delegated_user and google_email:
                current_app.logger.info(f"Tentativo di verifica appartenenza al gruppo admin '{admin_group_key}' per l'utente '{google_email}" + f" tramite service account '{service_account_file}' e delega a '{delegated_user}'.")
                try:
                    creds = service_account.Credentials.from_service_account_file(
                        service_account_file,
                        scopes=['https://www.googleapis.com/auth/admin.directory.group.member.readonly'],
                        subject=delegated_user
                    )
                    service = build('admin', 'directory_v1', credentials=creds, cache_discovery=False) # Aggiunto cache_discovery=False per problemi in alcuni ambienti
                    
                    # Verifica l'appartenenza al gruppo
                    request = service.members().hasMember(groupKey=admin_group_key, memberKey=google_email)
                    response = request.execute()
                    is_group_member = response.get('isMember', False)
                    current_app.logger.info(f"Risposta da hasMember per {google_email} nel gruppo {admin_group_key}: {response}")

                except HttpError as e:
                    current_app.logger.error(f"HttpError durante la verifica dell'appartenenza al gruppo Google: {e.resp.status} - {e.content}")
                    if e.resp.status == 403:
                        flash("Errore di autorizzazione nel verificare i privilegi di amministratore con Google. Contatta l'amministratore del sistema.", "danger")
                    elif e.resp.status == 404:
                        flash(f"Gruppo admin '{admin_group_key}' o utente '{google_email}' non trovato durante la verifica con Google.", "warning")
                    else:
                        flash("Errore durante la verifica dei privilegi di amministratore con Google.", "danger")
                except FileNotFoundError:
                    current_app.logger.error(f"File del service account non trovato: {service_account_file}")
                    flash("Configurazione del service account per i privilegi admin incompleta o errata (file mancante).", "danger")
                except Exception as e:
                    current_app.logger.error(f"Errore generico durante la verifica dell'appartenenza al gruppo Google: {e}", exc_info=True)
                    flash("Errore imprevisto durante la verifica dei privilegi di amministratore.", "danger")
            else:
                log_missing_configs = []
                if not admin_group_key: log_missing_configs.append("GOOGLE_ADMIN_GROUP_KEY")
                if not service_account_file: log_missing_configs.append("GOOGLE_SERVICE_ACCOUNT_FILE")
                if not delegated_user: log_missing_configs.append("GOOGLE_ADMIN_SDK_DELEGATED_USER")
                if not google_email: log_missing_configs.append("Email utente Google") # Meno probabile ma per completezza
                current_app.logger.warning(f"Configurazione per la verifica del gruppo Google mancante o incompleta: {', '.join(log_missing_configs)}. Impossibile verificare privilegi admin via Google Group.")
                # Non mostrare un flash all'utente se la config è semplicemente mancante, a meno che non sia un setup intenzionale

            session['is_admin'] = is_group_member
            if is_group_member:
                current_app.logger.info(f"Utente {google_email} verificato come membro del gruppo admin: {admin_group_key}")
                flash(f"Accesso effettuato con successo come {google_user_name} (Amministratore Google)!", "success")
            else:
                 current_app.logger.info(f"Utente {google_email} NON è membro del gruppo admin {admin_group_key} o verifica non eseguita/fallita.")
                 flash(f"Accesso effettuato con successo come {google_user_name} (Google)!", "success")

            return redirect(url_for("main.index"))
        else:
            # Questo blocco viene raggiunto se user_info_response non è None MA non è .ok
            # o se user_info_response è rimasto None (non dovrebbe succedere con il try/except sopra)
            error_details = "N/D"
            if user_info_response is not None:
                try:
                    error_details = user_info_response.json().get('error', {}).get('message', f'Errore {user_info_response.status_code}')
                except Exception as json_e:
                    current_app.logger.error(f"Impossibile fare il parsing JSON dalla risposta di errore di Google: {json_e}")
                    error_details = user_info_response.text
            else:
                error_details = "Risposta da Google non ricevuta (user_info_response è None)."
            
            flash(f"Errore durante il recupero delle informazioni utente da Google: {error_details}", "danger")
            status_code_log = user_info_response.status_code if user_info_response is not None else "N/A"
            current_app.logger.error(f"Google userinfo request failed: Status {status_code_log} - Dettagli: {error_details}")
            return redirect(url_for("main.login"))
            
    except Exception as e: # Eccezione generica del blocco try principale
        current_app.logger.error(f"Eccezione generica in /google_logged_in (blocco principale): {e}", exc_info=True)
        flash("Si è verificato un errore non previsto durante l'accesso con Google.", "danger")
        return redirect(url_for("main.login"))

# Eventuali altre route/API pubbliche qui sotto... 

@bp.route('/api/analizza_orario_sostituzioni', methods=['POST'])
def api_analizza_orario_sostituzioni():
    # Controlla prima se c'è un errore globale nel caricamento dati
    if isinstance(all_schedule_data, list) and len(all_schedule_data) > 0 and \
       isinstance(all_schedule_data[0], dict) and 'error' in all_schedule_data[0]:
        return jsonify(all_schedule_data[0]), 500

    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"error": "Richiesta JSON non valida o mancante."}), 400

        data_sostituzione_str = payload.get('data_sostituzione')
        emails_docenti_assenti = payload.get('emails_docenti_assenti')

        # Validazione input base
        if not data_sostituzione_str:
            return jsonify({"error": "Il campo 'data_sostituzione' è mancante."}), 400
        if not emails_docenti_assenti:
            return jsonify({"error": "Il campo 'emails_docenti_assenti' è mancante o vuoto."}), 400
        if not isinstance(emails_docenti_assenti, list) or not all(isinstance(email, str) for email in emails_docenti_assenti):
            return jsonify({"error": "'emails_docenti_assenti' deve essere una lista di stringhe (email)."}), 400

        # Conversione e validazione data
        try:
            data_dt = datetime.strptime(data_sostituzione_str, '%Y-%m-%d')
            # CORREZIONE: Usare weekday() che è 0 per Lunedì, come atteso da GIORNI_MAP
            giorno_sostituzione_numero_python = data_dt.weekday() 
            giorno_sostituzione_nome = GIORNI_MAP.get(giorno_sostituzione_numero_python)
        except ValueError:
            return jsonify({"error": f"Formato data '{data_sostituzione_str}' non valido. Usare YYYY-MM-DD."}), 400

        if not giorno_sostituzione_nome:
            # Potrebbe succedere se la mappa non include il giorno (es. weekend) o per un numero non previsto
            return jsonify({"error": f"Giorno della settimana per la data {data_sostituzione_str} (Python weekday: {giorno_sostituzione_numero_python}) non trovato nella mappatura interna."}), 400
        
        print(f"[BACKEND LOG] Analisi richiesta per: Giorno '{giorno_sostituzione_nome}', Data '{data_sostituzione_str}', Docenti: {emails_docenti_assenti}")

        slot_da_coprire = []
        # Assicurati che all_schedule_data sia una lista di dizionari (le lezioni)
        if not (isinstance(all_schedule_data, list) and all(isinstance(item, dict) for item in all_schedule_data)):
             print(f"[BACKEND WARNING] all_schedule_data non è una lista di dizionari come atteso.")
             # Potresti voler restituire un errore specifico qui o procedere con cautela
        
        for entry in all_schedule_data:
            if not isinstance(entry, dict): continue # Salta elementi non dizionario (se presenti)
            
            giorno_lezione = entry.get('Giorno')
            docenti_lezione_raw = entry.get('Docente') # Può essere stringa, lista, o None

            if giorno_lezione == giorno_sostituzione_nome:
                docenti_lezione_list = []
                if isinstance(docenti_lezione_raw, str):
                    docenti_lezione_list.append(docenti_lezione_raw)
                elif isinstance(docenti_lezione_raw, list):
                    # Filtra per assicurarsi che siano stringhe, ignorando altri tipi se presenti
                    docenti_lezione_list = [d for d in docenti_lezione_raw if isinstance(d, str)]
                
                # Se c'è una corrispondenza tra i docenti della lezione e quelli assenti
                if any(doc_assente in docenti_lezione_list for doc_assente in emails_docenti_assenti):
                    slot_da_coprire.append(entry)
        
        print(f"[BACKEND LOG] Slot trovati da coprire: {len(slot_da_coprire)}")

        return jsonify({
            "messaggio": f"Slot da coprire identificati per {giorno_sostituzione_nome} ({data_sostituzione_str}).",
            "giorno_richiesto": giorno_sostituzione_nome,
            "data_richiesta": data_sostituzione_str,
            "docenti_richiesti": emails_docenti_assenti,
            "slot_trovati": slot_da_coprire
        }), 200

    except Exception as e:
        print(f"ERRORE INTERNO SERVER in /api/analizza_orario_sostituzioni: {type(e).__name__} - {e}")
        traceback.print_exc() # Stampa il traceback completo nei log del server Flask
        return jsonify({"error": "Errore interno del server durante l'analisi dell'orario. Si prega di controllare i log del server."}), 500 

@bp.route('/api/sostituzioni_registrate_per_data', methods=['GET'])
@admin_required # O @login_required a seconda delle policy di accesso
def api_sostituzioni_registrate_per_data():
    data_richiesta_str = request.args.get('data')
    if not data_richiesta_str:
        return jsonify({"error": "Parametro 'data' mancante."}), 400

    try:
        data_richiesta_obj = datetime.strptime(data_richiesta_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({"error": "Formato data non valido. Usare YYYY-MM-DD."}), 400

    try:
        from app.models import Sostituzione # Importa qui per usare Sostituzione.query
        sostituzioni = Sostituzione.query.filter_by(data_sostituzione=data_richiesta_obj).all()
        
        # Converti i risultati in un formato JSON serializzabile
        sostituzioni_json = []
        for s in sostituzioni:
            sostituzioni_json.append({
                "id": s.id,
                "docente_assente_email": s.docente_assente_email,
                "docente_sostituto_email": s.docente_sostituto_email,
                "data_sostituzione": s.data_sostituzione.strftime('%Y-%m-%d'),
                "slot_ora": s.slot_ora,
                "materia_originale": s.materia_originale,
                "classe_originale": s.classe_originale,
                "aula_originale": s.aula_originale,
                "giorno_settimana": s.giorno_settimana,
                "tipo_suggerimento": s.tipo_suggerimento,
                "timestamp_conferma": s.timestamp_conferma.strftime('%Y-%m-%d %H:%M:%S UTC') if s.timestamp_conferma else None
            })
        return jsonify(sostituzioni_json)
    except Exception as e:
        current_app.logger.error(f"Errore API api_sostituzioni_registrate_per_data: {e}", exc_info=True)
        return jsonify({"error": f"Errore interno del server: {str(e)}"}), 500 