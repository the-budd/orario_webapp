document.addEventListener('DOMContentLoaded', function() {
    console.log("sostituzioni.js caricato");

    const sostDateInput = document.getElementById('sostDate');
    const sostDocenteSelect = document.getElementById('sostDocenteSelect');
    const addAssenteBtn = document.getElementById('addAssenteBtn');
    const listaDocentiAssentiUl = document.getElementById('listaDocentiAssenti');
    const analizzaOrarioBtn = document.getElementById('analizzaOrarioBtn');
    const slotDaCoprireContainer = document.getElementById('slotDaCoprireContainer');

    let allScheduleData = []; // Conterrà i dati dall'API /api/orario
    let allTeachers = new Map(); // Map email -> nome visualizzato
    
    // Nuove variabili globali per la visualizzazione a singolo slot
    let tuttiGliSlotFlat = [];
    let currentSlotVisualizzatoIndex = 0;
    let dataSelezionataPerVisualizzazione = '';

    // Imposta la data di oggi come default per l'input data
    const oggi = new Date();
    sostDateInput.valueAsDate = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());

    // Funzione per formattare il nome del docente (simile a main.js)
    function formatTeacherNameForDisplay(email) {
        if (!email || !email.includes('@')) return email;
        let namePart = email.split('@')[0];
        if (namePart.endsWith('.sconosciuto')) namePart = namePart.replace('.sconosciuto', '');
        else if (namePart.includes('.sconosciuto@')) namePart = namePart.replace('.sconosciuto@', '');
        return namePart.replace(/\./g, ' ').toLowerCase().split(' ')
                       .filter(word => word.length > 0)
                       .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // Popola il select dei docenti da aggiungere
    function populateSostDocenteSelect(scheduleData) {
        scheduleData.forEach(item => {
            const docentiEmails = Array.isArray(item.Docente) ? item.Docente : [item.Docente];
            docentiEmails.forEach(email => {
                if (email && email.trim() && !allTeachers.has(email.trim())) {
                    allTeachers.set(email.trim(), formatTeacherNameForDisplay(email.trim()));
                }
            });
        });

        const sortedTeacherNames = Array.from(allTeachers.entries())
            .map(([email, displayName]) => ({ email, displayName }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));

        sostDocenteSelect.innerHTML = '<option value="">-- Seleziona Docente --</option>';
        sortedTeacherNames.forEach(teacher => {
            const option = document.createElement('option');
            option.value = teacher.email;
            option.textContent = teacher.displayName;
            sostDocenteSelect.appendChild(option);
        });
    }

    // Carica i dati dell'orario per popolare il select dei docenti
    fetch('/api/orario')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error("Errore API orario:", data.error);
                return;
            }
            allScheduleData = data;
            populateSostDocenteSelect(allScheduleData);
        })
        .catch(error => console.error('Errore fetch orario:', error));

    // Gestione aggiunta docente assente
    addAssenteBtn.addEventListener('click', function() {
        const selectedEmail = sostDocenteSelect.value;
        const selectedName = sostDocenteSelect.options[sostDocenteSelect.selectedIndex].text;

        if (!selectedEmail) {
            alert("Seleziona un docente da aggiungere.");
            return;
        }

        if (listaDocentiAssentiUl.querySelector(`li[data-docente-email="${selectedEmail}"]`)) {
            alert("Questo docente è già stato aggiunto alla lista degli assenti.");
            return;
        }

        const placeholder = listaDocentiAssentiUl.querySelector('.no-selection');
        if (placeholder) placeholder.remove();

        const li = document.createElement('li');
        li.classList.add('list-group-item', 'd-flex', 'flex-column');
        li.setAttribute('data-docente-email', selectedEmail);
        const uniqueNameForRadio = selectedEmail.replace(/[^a-zA-Z0-9]/g, "_") + "_" + Date.now();

        li.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <strong class="teacher-name">${selectedName}</strong>
                <button class="remove-assente-btn btn btn-danger btn-sm">Rimuovi</button>
            </div>
            <div class="absence-options">
                <small class="form-text text-muted d-block mb-1">Tipo di assenza:</small>
                <div class="btn-group btn-group-sm w-100" role="group" aria-label="Tipo assenza per ${selectedName}">
                    <input type="radio" class="btn-check" name="absence_${uniqueNameForRadio}_type" id="fullDay_${uniqueNameForRadio}" value="full" checked autocomplete="off">
                    <label class="btn btn-outline-primary w-50" for="fullDay_${uniqueNameForRadio}">Intera Giornata</label>

                    <input type="radio" class="btn-check" name="absence_${uniqueNameForRadio}_type" id="partialDay_${uniqueNameForRadio}" value="partial" autocomplete="off">
                    <label class="btn btn-outline-primary w-50" for="partialDay_${uniqueNameForRadio}">Ore Specifiche</label>
                </div>
            </div>
            <div class="specific-hours mt-2" style="display:none;">
                <small class="form-text text-muted d-block mb-1">Seleziona le ore di assenza specifiche:</small>
                <!-- Qui caricheremo dinamicamente gli slot orari -->
            </div>
        `;
        listaDocentiAssentiUl.appendChild(li);

        const specificHoursDiv = li.querySelector('.specific-hours');

        li.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', async function() { // Aggiunto async
                specificHoursDiv.style.display = this.value === 'partial' ? 'block' : 'none';
                if (this.value === 'partial') {
                    specificHoursDiv.innerHTML = '<small>Caricamento ore del docente...</small>';
                    const currentDate = sostDateInput.value;
                    if (!currentDate) {
                        specificHoursDiv.innerHTML = '<small class="text-danger">Seleziona prima una data!</small>';
                        // Deseleziona il radio 'partial' o avvisa l'utente in modo più forte
                        this.checked = false; // Deseleziona il radio button 'partial'
                        li.querySelector('input[type="radio"][value="full"]').checked = true; // Reimposta a 'full'
                        specificHoursDiv.style.display = 'none';
                        alert("Per selezionare ore specifiche, devi prima impostare una data.");
                        return;
                    }
                    try {
                        const response = await fetch(`/api/docente_orario_giorno?docente_email=${encodeURIComponent(selectedEmail)}&data=${currentDate}`);
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || `Errore API: ${response.status}`);
                        }
                        const lezioni = await response.json();
                        if (lezioni.length === 0) {
                            specificHoursDiv.innerHTML = '<small>Nessuna lezione trovata per questo docente nella data selezionata.</small>';
                        } else {
                            specificHoursDiv.innerHTML = '<small>Seleziona le ore di assenza:</small><br>';
                            lezioni.forEach((lezione, index) => {
                                const checkboxId = `slot_${uniqueNameForRadio}_${index}`;
                                specificHoursDiv.innerHTML += `
                                    <label for="${checkboxId}" class="checkbox-label">
                                        <input type="checkbox" id="${checkboxId}" value="${lezione.SlotOre}" data-materia="${lezione.materia1 || ''}" data-classe="${lezione.Classe || ''}" data-aula="${lezione.Aula || ''}">
                                        ${lezione.SlotOre} (${lezione.materia1 || 'N/D'} - Cl: ${lezione.Classe || 'N/D'} - Au: ${lezione.Aula || 'N/D'})
                                    </label><br>
                                `;
                            });
                        }
                    } catch (error) {
                        console.error("Errore nel caricare le ore del docente:", error);
                        specificHoursDiv.innerHTML = `<small class="text-danger">Errore: ${error.message}</small>`;
                    }
                }
            });
        });

        li.querySelector('.remove-assente-btn').addEventListener('click', function() {
            li.remove();
            if (listaDocentiAssentiUl.children.length === 0) {
                const noSelectionLi = document.createElement('li');
                noSelectionLi.classList.add('no-selection');
                noSelectionLi.textContent = "Nessun docente assente selezionato.";
                listaDocentiAssentiUl.appendChild(noSelectionLi);
            }
        });
    });

    // Gestione pulsante "Analizza Orario"
    analizzaOrarioBtn.addEventListener('click', async function() { 
        dataSelezionataPerVisualizzazione = sostDateInput.value; // Salva la data per dopo
        if (!dataSelezionataPerVisualizzazione) {
            alert("Seleziona una data.");
            return;
        }

        const docentiAssentiPromises = [];
        listaDocentiAssentiUl.querySelectorAll('li[data-docente-email]').forEach(li => {
            const email = li.getAttribute('data-docente-email');
            const tipoAssenza = li.querySelector('input[name^="absence_"]:checked').value;
            
            const promise = (async () => { // Funzione asincrona per ogni docente
                let oreSpecificheAssenza = [];

                if (tipoAssenza === 'partial') {
                    const checkboxes = li.querySelectorAll('.specific-hours input[type="checkbox"]:checked');
                    checkboxes.forEach(cb => {
                        oreSpecificheAssenza.push({
                            slot: cb.value,
                            materia: cb.dataset.materia,
                            classe: cb.dataset.classe,
                            aula: cb.dataset.aula
                        });
                    });
                    // Potresti aggiungere un controllo qui: se oreSpecificheAssenza.length === 0 dopo aver selezionato 'partial',
                    // l'utente potrebbe non aver spuntato nessuna ora. Decidi come gestire questo caso.
                    // Per ora, se nessuna ora è spuntata in modalità 'partial', le ore saranno vuote.
                } else if (tipoAssenza === 'full') {
                    try {
                        const response = await fetch(`/api/docente_orario_giorno?docente_email=${encodeURIComponent(email)}&data=${dataSelezionataPerVisualizzazione}`);
                        if (!response.ok) {
                            const errorData = await response.json();
                            console.error(`Errore API per ${email} (${dataSelezionataPerVisualizzazione}):`, errorData.error || response.status);
                            // Se c'è un errore API, le ore rimarranno vuote per questo docente.
                            // Potresti voler gestire questo caso in modo più esplicito.
                        } else {
                            const lezioni = await response.json();
                            lezioni.forEach(lezione => {
                                oreSpecificheAssenza.push({
                                    slot: lezione.SlotOre,
                                    materia: lezione.materia1 || '',
                                    classe: lezione.Classe || '',
                                    aula: lezione.Aula || ''
                                });
                            });
                        }
                    } catch (error) {
                        console.error(`Errore fetch ore per ${email} (${dataSelezionataPerVisualizzazione}):`, error);
                        // Anche qui, le ore rimarranno vuote in caso di errore di rete/fetch.
                    }
                }

                return { // Ritorna l'oggetto del docente assente
                    email: email,
                    tipo: tipoAssenza,
                    ore: oreSpecificheAssenza
                };
            })();
            docentiAssentiPromises.push(promise);
        });

        // Attendi che tutte le informazioni sui docenti assenti (incluse le ore per 'full') siano raccolte
        const docentiAssenti = await Promise.all(docentiAssentiPromises);

        if (docentiAssenti.length === 0) {
            alert("Aggiungi almeno un docente assente.");
            slotDaCoprireContainer.innerHTML = '<p class="text-info">Nessun docente assente selezionato o nessun dato da analizzare.</p>'; 
            tuttiGliSlotFlat = []; // Resetta
            currentSlotVisualizzatoIndex = 0;
            return;
        }

        console.log("--- DATI PER ANALISI --- Dati:", dataSelezionataPerVisualizzazione);
        console.log("Docenti Assenti:", JSON.stringify(docentiAssenti, null, 2));
        
        // --- INIZIO LOGICA PER APPIATTIRE GLI SLOT E MOSTRARE IL PRIMO ---
        tuttiGliSlotFlat = []; // Resetta prima di ripopolare
        docentiAssenti.forEach(docente => {
            if (docente.ore && docente.ore.length > 0) {
                docente.ore.forEach(ora => {
                    tuttiGliSlotFlat.push({
                        docenteAssenteEmail: docente.email,
                        nomeDocenteAssente: formatTeacherNameForDisplay(docente.email),
                        slotOriginale: ora, // Contiene { slot, materia, classe, aula }
                        isCovered: false // Aggiungo il flag isCovered, inizialmente false
                    });
                });
            }
        });

        if (tuttiGliSlotFlat.length > 0) {
            currentSlotVisualizzatoIndex = 0;
            mostraSlotCorrenteConSuggerimenti();
        } else {
            slotDaCoprireContainer.innerHTML = '<p class="text-info">Nessuno slot orario specifico da coprire per i docenti e i criteri selezionati.</p>';
        }
        // --- FINE LOGICA PER APPIATTIRE GLI SLOT ---
    });

    async function mostraSlotCorrenteConSuggerimenti() {
        if (tuttiGliSlotFlat.length === 0) {
            // Questo caso dovrebbe essere gestito prima di chiamare questa funzione,
            // ma per sicurezza lo lasciamo.
            slotDaCoprireContainer.innerHTML = '<p class="text-info">Nessuno slot da visualizzare.</p>';
            return;
        }

        const slotCorrente = tuttiGliSlotFlat[currentSlotVisualizzatoIndex];
        slotDaCoprireContainer.innerHTML = ''; // Pulisci il container ad ogni rendering

        // --- NAVIGAZIONE ---
        const navDiv = document.createElement('div');
        navDiv.classList.add('d-flex', 'justify-content-between', 'align-items-center', 'mb-3');

        const prevBtn = document.createElement('button');
        prevBtn.innerHTML = '&laquo; Prec'; // «
        prevBtn.classList.add('btn', 'btn-outline-secondary', 'btn-sm');
        prevBtn.disabled = currentSlotVisualizzatoIndex === 0;
        prevBtn.addEventListener('click', () => {
            if (currentSlotVisualizzatoIndex > 0) {
                currentSlotVisualizzatoIndex--;
                mostraSlotCorrenteConSuggerimenti();
            }
        });

        const slotInfoSpan = document.createElement('span');
        slotInfoSpan.classList.add('text-muted', 'mx-2');
        slotInfoSpan.textContent = `Slot da coprire: ${currentSlotVisualizzatoIndex + 1} / ${tuttiGliSlotFlat.length}`;
        
        const nextBtn = document.createElement('button');
        nextBtn.innerHTML = 'Succ &raquo;'; // »
        nextBtn.classList.add('btn', 'btn-outline-secondary', 'btn-sm');
        nextBtn.disabled = currentSlotVisualizzatoIndex >= tuttiGliSlotFlat.length - 1;
        nextBtn.addEventListener('click', () => {
            if (currentSlotVisualizzatoIndex < tuttiGliSlotFlat.length - 1) {
                currentSlotVisualizzatoIndex++;
                mostraSlotCorrenteConSuggerimenti();
            }
        });

        navDiv.appendChild(prevBtn);
        navDiv.appendChild(slotInfoSpan);
        navDiv.appendChild(nextBtn);
        slotDaCoprireContainer.appendChild(navDiv);

        // --- DETTAGLI SLOT DA COPRIRE ---
        const cardSlot = document.createElement('div');
        cardSlot.classList.add('card', 'mb-3');

        const cardHeaderSlot = document.createElement('div');
        cardHeaderSlot.classList.add('card-header');
        // La data selezionata è in dataSelezionataPerVisualizzazione (formato YYYY-MM-DD)
        // Formattiamola per la visualizzazione
        const dateObj = new Date(dataSelezionataPerVisualizzazione + 'T00:00:00'); // Assicura interpretazione come data locale
        const dataFormattataDisplay = dateObj.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        let headerSlotText = `<h5>Dettaglio Slot da Coprire (${dataFormattataDisplay})</h5>`;
        if (slotCorrente.isCovered) {
            headerSlotText = `<h5>Dettaglio Slot da Coprire (${dataFormattataDisplay}) <span class="badge badge-success">COPERTO</span></h5>`;
        }
        cardHeaderSlot.innerHTML = headerSlotText;
        cardSlot.appendChild(cardHeaderSlot);

        const cardBodySlot = document.createElement('div');
        cardBodySlot.classList.add('card-body');
        cardBodySlot.innerHTML = `
            <p class="mb-1"><strong>Docente Assente:</strong> ${slotCorrente.nomeDocenteAssente}</p>
            <p class="mb-1"><strong>Ora:</strong> ${slotCorrente.slotOriginale.slot}</p>
            <p class="mb-1"><strong>Materia:</strong> ${slotCorrente.slotOriginale.materia || 'N/D'}</p>
            <p class="mb-1"><strong>Classe:</strong> ${slotCorrente.slotOriginale.classe || 'N/D'}</p>
            <p class="mb-0"><strong>Aula:</strong> ${slotCorrente.slotOriginale.aula || 'N/D'}</p>
        `;
        cardSlot.appendChild(cardBodySlot);
        slotDaCoprireContainer.appendChild(cardSlot);

        // --- SUGGERIMENTI ---
        const cardSuggerimenti = document.createElement('div');
        cardSuggerimenti.classList.add('card');
        
        const cardHeaderSuggerimenti = document.createElement('div');
        cardHeaderSuggerimenti.classList.add('card-header');
        cardHeaderSuggerimenti.innerHTML = '<h6>Potenziali Sostituti</h6>';
        cardSuggerimenti.appendChild(cardHeaderSuggerimenti);

        const suggerimentiBody = document.createElement('div');
        suggerimentiBody.classList.add('card-body');
        suggerimentiBody.innerHTML = '<p class="text-muted mb-0"><em><i class="fas fa-spinner fa-spin"></i> Caricamento suggerimenti...</em></p>'; // Aggiunta icona spinner (se FontAwesome è disponibile)
        cardSuggerimenti.appendChild(suggerimentiBody);
        slotDaCoprireContainer.appendChild(cardSuggerimenti);

        try {
            const params = new URLSearchParams({
                data: dataSelezionataPerVisualizzazione,
                slot_ora: slotCorrente.slotOriginale.slot,
                materia_originale: slotCorrente.slotOriginale.materia || '',
                docente_assente_email: slotCorrente.docenteAssenteEmail,
                classe_originale: slotCorrente.slotOriginale.classe || '',
                aula_originale: slotCorrente.slotOriginale.aula || ''
            });
            const response = await fetch(`/api/suggerisci_sostituti?${params.toString()}`);
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: `Errore API suggerimenti (${response.status})` }));
                throw new Error(errData.error || `Errore API suggerimenti (${response.status})`);
            }
            const suggerimenti = await response.json();

            if (suggerimenti && suggerimenti.length > 0) {
                suggerimentiBody.innerHTML = ''; // Pulisci "caricamento"
                
                const table = document.createElement('table');
                table.classList.add('table', 'table-sm', 'table-striped', 'table-hover'); // Classi per styling tabella
                
                const thead = document.createElement('thead');
                thead.classList.add('thead-light'); // Header chiaro
                thead.innerHTML = `
                    <tr>
                        <th>Docente Suggerito</th>
                        <th>Criterio</th>
                        <th>Dettaglio</th>
                        <th>Azione</th>
                    </tr>
                `;
                table.appendChild(thead);

                const tbody = document.createElement('tbody');
                tbody.id = 'suggestionsTableBody'; // Assicuro che l'ID sia qui
                suggerimenti.forEach(sugg => {
                    const tr = document.createElement('tr');
                    
                    const assegnaBtnCell = document.createElement('td');
                    const assegnaBtn = document.createElement('button');
                    assegnaBtn.classList.add('btn', 'btn-sm', 'btn-assign-sostituto');
                    
                    // USARE LE CHIAVI CORRETTE DALL'API /api/suggerisci_sostituti
                    // che sono: docente_email, docente_nome_visualizzato, tipo_suggerimento, info_aggiuntive
                    assegnaBtn.dataset.docenteEmail = sugg.docente_email; 
                    assegnaBtn.dataset.docenteNome = sugg.docente_nome_visualizzato;
                    assegnaBtn.dataset.tipoSuggerimento = sugg.tipo_suggerimento; // Per potenziale uso futuro o debug
                    assegnaBtn.dataset.infoAggiuntive = sugg.info_aggiuntive; // Per potenziale uso futuro o debug


                    if (slotCorrente.isCovered && slotCorrente.assignedTo === sugg.docente_email) { // Modifica qui per verificare se è assegnato a QUESTO docente
                        assegnaBtn.textContent = 'Assegnato a te';
                        assegnaBtn.classList.add('btn-info'); // Diverso colore se è questo
                        assegnaBtn.disabled = true;
                    } else if (slotCorrente.isCovered) {
                        assegnaBtn.textContent = 'Slot Coperto';
                        assegnaBtn.classList.add('btn-secondary');
                        assegnaBtn.disabled = true;
                    }
                    else {
                        assegnaBtn.textContent = 'Assegna';
                        assegnaBtn.classList.add('btn-success');
                        // Passiamo l'intero oggetto 'sugg' a handleAssegnaClick
                        assegnaBtn.onclick = (event) => handleAssegnaClick(event, slotCorrente, sugg);
                    }
                    assegnaBtnCell.appendChild(assegnaBtn);

                    tr.innerHTML = `
                        <td>${sugg.docente_nome_visualizzato}</td>
                        <td><span class="badge badge-info">${sugg.tipo_suggerimento}</span></td>
                        <td><small>${sugg.info_aggiuntive || 'N/D'}</small></td>
                    `;
                    tr.appendChild(assegnaBtnCell);
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                suggerimentiBody.appendChild(table);

            } else {
                suggerimentiBody.innerHTML = '<p class="text-info mb-0">Nessun sostituto suggerito trovato per questo slot secondo i criteri attuali.</p>';
            }
        } catch (error) {
            console.error("Errore fetch suggerimenti per slot:", slotCorrente, "Errore:", error);
            suggerimentiBody.innerHTML = `<p class="text-danger mb-0">Errore nel caricare i suggerimenti: ${error.message}</p>`;
        }
    }

    // Modifico la firma per accettare suggerimentoSelezionato
    async function handleAssegnaClick(event, slotCorrente, suggerimentoSelezionato) {
        const button = event.target;
        
        // Utilizzare i dati direttamente dall'oggetto suggerimentoSelezionato,
        // che è l'oggetto 'sugg' passato dall'handler onclick.
        // Le chiavi DEVONO corrispondere a quelle restituite da /api/suggerisci_sostituti
        const sostitutoEmail = suggerimentoSelezionato.docente_email;
        const sostitutoNome = suggerimentoSelezionato.docente_nome_visualizzato; // Utile per UI, non inviato nel payload di default
        const tipoSuggerimentoScelto = suggerimentoSelezionato.tipo_suggerimento;
        const dettaglioSuggerimentoScelto = suggerimentoSelezionato.info_aggiuntive;

        // VALIDAZIONE ROBUSTA ALL'INIZIO
        if (!sostitutoEmail || typeof sostitutoEmail !== 'string' || !sostitutoEmail.includes('@') || sostitutoEmail === 'undefined') {
            alert("Errore critico: L'email del docente sostituto non è valida o non è stata selezionata correttamente. Impossibile procedere.");
            console.error("handleAssegnaClick ERRORE: sostitutoEmail non valido.", 
                          "Email ricevuta:", sostitutoEmail, 
                          "Tipo:", typeof sostitutoEmail,
                          "Oggetto suggerimento completo:", suggerimentoSelezionato);
            // Non disabilitare/riabilitare il bottone qui se l'errore è grave e indica un problema di logica
            return;
        }

        if (!dataSelezionataPerVisualizzazione) {
            alert("Errore: Data non selezionata o non disponibile.");
            console.error("handleAssegnaClick ERRORE: dataSelezionataPerVisualizzazione non disponibile.");
            return;
        }

        // Calcolo giornoSettimana
        const GIORNI_MAP_JS = {
            1: "LUNEDI", 2: "MARTEDI", 3: "MERCOLEDI", 4: "GIOVEDI", 
            5: "VENERDI", 6: "SABATO", 0: "DOMENICA" 
        };
        const dataObj = new Date(dataSelezionataPerVisualizzazione + 'T00:00:00Z'); 
        const giornoSettimanaNum = dataObj.getDay();
        const giornoSettimanaString = GIORNI_MAP_JS[giornoSettimanaNum];

        if (!giornoSettimanaString) {
            alert("Errore: impossibile determinare il giorno della settimana.");
            console.error("Errore calcolo giorno settimana per data:", dataSelezionataPerVisualizzazione, "Numero giorno:", giornoSettimanaNum);
            return;
        }

        const payload = {
            dataSostituzione: dataSelezionataPerVisualizzazione,
            slot_ora: slotCorrente.slotOriginale.slot,         
            materiaOriginale: slotCorrente.slotOriginale.materia, 
            classeOriginale: slotCorrente.slotOriginale.classe,   
            aulaOriginale: slotCorrente.slotOriginale.aula,       
            docenteAssenteEmail: slotCorrente.docenteAssenteEmail, 
            docenteSostitutoEmail: sostitutoEmail, // Variabile chiave, ora validata
            giornoSettimana: giornoSettimanaString,              
            tipo_suggerimento_usato: tipoSuggerimentoScelto, // Corrisponde a 'tipo_suggerimento' nel backend
            dettaglio_suggerimento: dettaglioSuggerimentoScelto // Corrisponde a 'dettaglio_suggerimento' nel backend (se il backend lo salva)
        };

        // Log del payload per debug
        console.log("Payload inviato a /api/conferma_sostituzione:", JSON.stringify(payload, null, 2));

        try {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Assegnando...';

            const response = await fetch('/api/conferma_sostituzione', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Potrebbe essere necessario un token CSRF se Flask-WTF è usato globalmente,
                    // ma per le API JSON di solito non è gestito così.
                },
                body: JSON.stringify(payload),
            });

            const result = await response.json(); // Prova a parsare JSON in ogni caso

            if (response.ok) { // Status 200-299
                alert(result.message || 'Sostituzione confermata con successo!');
                // Aggiorna UI per marcare lo slot come coperto
                slotCorrente.isCovered = true;
                slotCorrente.assignedTo = sostitutoEmail; // Salva a chi è stato assegnato
                
                // Cambia testo e stato di tutti i bottoni "Assegna" per questo slot
                const allAssignButtonsInSlot = slotDaCoprireContainer.querySelectorAll('.btn-assign-sostituto');
                allAssignButtonsInSlot.forEach(btn => {
                    if (btn === button) { // Questo è il bottone cliccato
                        btn.textContent = 'Assegnato a te';
                        btn.classList.remove('btn-success', 'btn-outline-success');
                        btn.classList.add('btn-info'); // Colore diverso per quello assegnato
                    } else { // Altri bottoni per lo stesso slot
                        btn.textContent = 'Slot Coperto';
                        btn.classList.remove('btn-success', 'btn-outline-success');
                        btn.classList.add('btn-secondary');
                    }
                    btn.disabled = true;
                });
                // Aggiorna l'header della card dello slot
                const cardHeaderSlot = slotDaCoprireContainer.querySelector('.card-header');
                if (cardHeaderSlot) {
                     const dateDisplayPart = cardHeaderSlot.innerHTML.match(/\((.*?)\)/); // Estrai la parte della data
                     let headerSlotText = `<h5>Dettaglio Slot da Coprire ${dateDisplayPart ? dateDisplayPart[0] : ''} <span class="badge badge-success">COPERTO</span></h5>`;
                     cardHeaderSlot.innerHTML = headerSlotText;
                }

            } else { // Errore dal server (4xx, 5xx)
                console.error("Errore dalla conferma sostituzione:", result);
                alert(`Errore dal server (${response.status}): ${result.error || 'Dettagli non disponibili.'}`);
                button.disabled = false; // Riabilita il pulsante se c'è stato un errore
                button.textContent = 'Assegna'; 
            }

        } catch (error) { // Errore di rete o fetch fallito prima di una risposta JSON
            console.error('Errore fetch in handleAssegnaClick:', error);
            alert('Errore di comunicazione con il server durante la conferma della sostituzione.');
            button.disabled = false;
            button.innerHTML = 'Assegna';
        }
    }

}); 