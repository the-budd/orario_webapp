// JavaScript per la pagina di occupazione aule
document.addEventListener('DOMContentLoaded', function() {
    console.log('occupazione_aule.js caricato');

    const giornoSelect = document.getElementById('giornoSelectOccupazione');
    const slotSelect = document.getElementById('slotSelectOccupazione');
    const pianoSelect = document.getElementById('pianoSelectOccupazione');
    const mappaContainer = document.getElementById('mappa-aule-container');

    // Mappa per convertire il numero del giorno da Date.getDay() al nome stringa
    const giorniSettimanaMap = { 
        0: "DOMENICA", 1: "LUNEDI", 2: "MARTEDI", 3: "MERCOLEDI", 
        4: "GIOVEDI", 5: "VENERDI", 6: "SABATO"
    };
    
    // Variabili globali per memorizzare i dati e lo stato
    let globalInitialData = null; 
    let allOccupancyData = [];    
    let giornoSettimanaCorrenteVisualizzato = ''; 
    let currentMapInstance = null; // Per eventuale istanza mappa
    let datiOrarioCompleti = null; // Conterrà la risposta completa dell'API

    // Definizione struttura piani e aule (come da precedente)
    const strutturaScuola = {
        'Piano -1': ['-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9', '-10', 'Lab -1'],
        'Piano Terra': ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
        'Piano 1': ['101', '102', '104', '106', 'LAB. APPLE'],
        'Piano 2': ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', 'LAB. PIANO 2'],
        'Piano 3': ['302', '303', '304', '305', '306', '307', '308', 'LAB. PIANO 3', 'LAB. MULTIMEDIALE'],
        'Palestre': ['PALESTRA A', 'PALESTRA B'],
        'Altri Spazi': ['ALTERNATIVA-NERVI', 'DISPOSIZIONE', 'RIPA']
    };

    // Funzione per normalizzare i nomi delle aule (come da precedente)
    function normalizzaNomeAula(nomeAula) {
        if (!nomeAula) return '';
        let norm = nomeAula.trim().toUpperCase();
        norm = norm.replace(/^AULA\s*/, '');
        norm = norm.replace(/\.$/, '');
        norm = norm.replace(/\s+/g, ' ');
        if (norm === "LABORATORIO MULTIMEDIALE") return "LAB. MULTIMEDIALE";
        if (norm === "NEG1") return "-1";
        if (norm === "PTAULA1") return "1";
        if (norm === "P1AULA1") return "101";
        if (norm === "P2AULA1") return "201";
        if (norm === "P3AULA1") return "302";
        if (norm === "PAL. A") return "PALESTRA A";
        if (norm === "PAL. B") return "PALESTRA B";
        if (norm === "AULA DISP") return "DISPOSIZIONE";
        if (norm === "AULA RIPA") return "RIPA";
        if (norm === "LAB -1") return "LABORATORIO -1"; 
        if (norm === "LAB. PIANO 2") return "LABORATORIO P.2";
        if (norm === "LAB. PIANO 3") return "LABORATORIO P.3";
        return norm;
    }

    // Funzione per popolare il selettore dei giorni
    function populateGiornoSelect(giorniValidi, giornoDefaultSelezionato) {
        if (!giornoSelect) return;
        giornoSelect.innerHTML = ''; 
        const ordineGiorniMap = { "LUNEDI": 1, "MARTEDI": 2, "MERCOLEDI": 3, "GIOVEDI": 4, "VENERDI": 5, "SABATO": 6, "DOMENICA": 7 };
        const giorniOrdinati = (giorniValidi && Array.isArray(giorniValidi)) ? [...giorniValidi].sort((a, b) => (ordineGiorniMap[a.toUpperCase()] || 99) - (ordineGiorniMap[b.toUpperCase()] || 99)) : [];

        giorniOrdinati.forEach(giorno => {
            const option = document.createElement('option');
            option.value = giorno; 
            option.textContent = giorno.charAt(0).toUpperCase() + giorno.slice(1).toLowerCase(); 
            giornoSelect.appendChild(option);
        });
        // La logica di selezione del default è gestita in caricaDatiIniziali
        console.log("Menu giorni popolato.");
    }

    // Funzione per popolare il selettore degli slot orari
    function populateSlotOraSelect(slotOreDisponibili) {
        if (!slotSelect) return; 
        slotSelect.innerHTML = ''; 
        if (slotOreDisponibili && slotOreDisponibili.length > 0) {
            slotOreDisponibili.forEach(slot => {
                const option = document.createElement('option');
                option.value = slot;
                option.textContent = slot;
                slotSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "Nessuno slot disponibile";
            slotSelect.appendChild(option);
            slotSelect.disabled = true;
        }
        console.log("Menu slot popolato.");
    }

    // Funzione per popolare il selettore dei piani
    function populatePianoSelect() {
        if (!pianoSelect) return;
        pianoSelect.innerHTML = ''; 
        const placeholderOption = document.createElement('option');
        placeholderOption.value = ""; 
        placeholderOption.textContent = "-- Tutti i Piani --";
        pianoSelect.appendChild(placeholderOption);

        if (strutturaScuola && Object.keys(strutturaScuola).length > 0) {
            for (const nomePiano in strutturaScuola) {
                if (Object.prototype.hasOwnProperty.call(strutturaScuola, nomePiano)) {
                    const option = document.createElement('option');
                    option.value = nomePiano;
                    option.textContent = nomePiano;
                    pianoSelect.appendChild(option);
                }
            }
        } else {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "Nessun piano definito";
            pianoSelect.appendChild(option);
            pianoSelect.disabled = true;
        }
        console.log("Menu piani popolato.");
    }

    async function caricaDatiIniziali() {
        try {
            // const oggiQueryParam = new Date().toISOString().split('T')[0]; // Non serve inviare, l'API usa "oggi" come default
            const response = await fetch(`/api/occupazione_aule`); // Prima fetch per oggi
            console.log("Risposta fetch /api/occupazione_aule:", response);
            if (!response.ok) {
                const errData = await response.json().catch(() => null);
                throw new Error(errData ? errData.error : `Errore HTTP ${response.status}`);
            }
            globalInitialData = await response.json();
            console.log("Dati ricevuti da /api/occupazione_aule:", globalInitialData);

            if (globalInitialData.error) {
                throw new Error(globalInitialData.error);
            }
            datiOrarioCompleti = globalInitialData;

            allOccupancyData = globalInitialData.aule_occupate || []; // Memorizza le occupazioni per la data iniziale
            giornoSettimanaCorrenteVisualizzato = globalInitialData.giorno_settimana; // Memorizza il giorno della settimana della data iniziale

            populateGiornoSelect(globalInitialData.giorni_validi_settimana, globalInitialData.giorno_settimana);
            populateSlotOraSelect(globalInitialData.slot_ore);
            populatePianoSelect(); // Assume che i piani siano statici o definiti altrove

            // Imposta i valori di default per i select
            // Giorno: se oggi è un giorno lavorativo valido usa quello, altrimenti il primo della lista (LUNEDI)
            const oggiReale = new Date();
            const nomeGiornoOggiRealeUpper = giorniSettimanaMap[oggiReale.getDay()]?.toUpperCase();
            
            if (globalInitialData.giorni_validi_settimana.includes(nomeGiornoOggiRealeUpper)) {
                giornoSelect.value = nomeGiornoOggiRealeUpper;
                console.log(`Giorno di default impostato su OGGI (${nomeGiornoOggiRealeUpper}) perché valido.`);
            } else if (globalInitialData.giorni_validi_settimana.length > 0) {
                giornoSelect.value = globalInitialData.giorni_validi_settimana[0]; // Fallback al primo giorno valido (es. LUNEDI)
                console.log(`Giorno di default (fallback al primo valido) impostato su: ${giornoSelect.value}`);
            } else {
                console.warn("Nessun giorno valido disponibile per il filtro giorno.");
            }

            // Slot: il primo slot disponibile tra le 08:00 e le 15:00
            if (slotSelect.options.length > 1) { // Assumendo che il primo sia "-- Tutti --" o un placeholder
                slotSelect.selectedIndex = 1; // Seleziona il primo slot reale
                console.log(`Slot di default (fallback, primo slot 08-15) impostato su: ${slotSelect.value}`);
            } else if (globalInitialData.slot_ore && globalInitialData.slot_ore.length > 0) {
                slotSelect.value = globalInitialData.slot_ore[0];
                 console.log(`Slot di default (primo slot disponibile) impostato su: ${slotSelect.value}`);
            }

            if (pianoSelect.options.length > 1) {
                pianoSelect.selectedIndex = 1; // Seleziona il primo piano reale (es. Piano Terra)
            }
            
            // Dopo aver impostato i default, chiama aggiornaVistaMappaOFiltrata per caricare i dati corretti
            // e disegnare la mappa.
            await aggiornaVistaMappaOFiltrata(); 

        } catch (error) {
            console.error("Errore in caricaDatiIniziali:", error);
            const mapContainer = document.getElementById('mappa-aule-container');
            if (mapContainer) mapContainer.innerHTML = `<p class="text-danger">Errore caricamento dati occupazione: ${error.message}</p>`;
            // Disabilita i filtri se il caricamento iniziale fallisce
            giornoSelect.disabled = true;
            slotSelect.disabled = true;
            pianoSelect.disabled = true;
        }
    }

    function disegnaMappaOccupazione() {
        const giornoSelezionato = giornoSelect.value; 
        const slotSelezionato = slotSelect.value;
        const pianoSelezionato = pianoSelect.value;
        console.log("disegnaMappaOccupazione chiamata con Giorno:", giornoSelezionato, "Slot:", slotSelezionato, "Piano:", pianoSelezionato);
        mappaContainer.innerHTML = '';

        if (!giornoSelezionato || !slotSelezionato) {
            mappaContainer.innerHTML = '<p class="text-muted">Seleziona un giorno e uno slot orario per visualizzare l\'occupazione.</p>';
            return;
        }

        if (!datiOrarioCompleti || !datiOrarioCompleti.aule_occupate) {
            mappaContainer.innerHTML = '<p class="text-warning">Dati di occupazione (struttura aule_occupate) non trovati.</p>';
            console.warn("datiOrarioCompleti o datiOrarioCompleti.aule_occupate non disponibili.");
            return;
        }

        const datiSlotSelezionato = datiOrarioCompleti.aule_occupate.find(slotData => slotData.slotOra === slotSelezionato);

        const auleOccupateNormalizzate = {};
        if (datiSlotSelezionato && datiSlotSelezionato.occupazioni && datiSlotSelezionato.occupazioni.length > 0) {
            console.log("Occupazioni per lo slot", slotSelezionato, ":", datiSlotSelezionato.occupazioni);
            datiSlotSelezionato.occupazioni.forEach(occupazione => {
                const nomeAulaNorm = normalizzaNomeAula(occupazione.aula);
                if (nomeAulaNorm) {
                   auleOccupateNormalizzate[nomeAulaNorm] = {
                        materia: occupazione.materia,
                        classe: occupazione.classe,
                        docente: occupazione.docente, // Già formattato dall'API
                        is_sostituita: occupazione.is_sostituita,
                        sostituzione_info: occupazione.sostituzione_info,
                        docente_originale: occupazione.docente_originale
                    };
                }
            });
        } else {
            console.warn("Nessuna occupazione specifica trovata per lo slot selezionato:", slotSelezionato, "nel giorno:", giornoSelezionato, ". Tutte le aule del piano verranno mostrate come libere.");
        }
        console.log("Aule occupate normalizzate per disegnare:", auleOccupateNormalizzate);

        let auleDisegnate = false;
        for (const pianoNome in strutturaScuola) {
            if (pianoSelezionato && pianoSelezionato !== "" && pianoNome !== pianoSelezionato) {
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(strutturaScuola, pianoNome)) {
                const pianoDiv = document.createElement('div');
                pianoDiv.classList.add('piano-container', 'mb-4');
                
                const pianoTitolo = document.createElement('h4');
                pianoTitolo.classList.add('piano-titolo', 'text-primary', 'border-bottom', 'pb-2', 'mb-3');
                pianoTitolo.textContent = pianoNome;
                pianoDiv.appendChild(pianoTitolo);

                const auleGridDiv = document.createElement('div');
                auleGridDiv.classList.add('row', 'row-cols-1', 'row-cols-sm-2', 'row-cols-md-3', 'row-cols-lg-4', 'g-3');

                const auleDelPiano = strutturaScuola[pianoNome];
                if (auleDelPiano && auleDelPiano.length > 0) {
                    auleDelPiano.forEach(nomeAulaDefinita => {
                        const nomeAulaNorm = normalizzaNomeAula(nomeAulaDefinita);
                        const infoLezione = auleOccupateNormalizzate[nomeAulaNorm];
                        auleDisegnate = true; // Almeno un'aula tentata di disegnare

                        const aulaCardCol = document.createElement('div');
                        aulaCardCol.classList.add('col');
                        
                        const cardInner = document.createElement('div');
                        cardInner.classList.add('card', 'h-100', 'aula-card', 'shadow-sm');
                        // Rimosse classi border-danger/success qui, gestite da bg color e contenuto

                        const cardBody = document.createElement('div');
                        cardBody.classList.add('card-body', 'd-flex', 'flex-column');

                        const aulaNomeDisplay = document.createElement('h6');
                        aulaNomeDisplay.classList.add('card-title', 'text-center', 'mb-2');
                        aulaNomeDisplay.textContent = nomeAulaDefinita;
                        cardBody.appendChild(aulaNomeDisplay);

                        if (infoLezione) {
                            const materiaP = document.createElement('p');
                            materiaP.classList.add('card-text', 'small', 'mb-1');
                            materiaP.innerHTML = `<strong>M:</strong> ${infoLezione.materia || '-'}`;
                            cardBody.appendChild(materiaP);

                            const classeP = document.createElement('p');
                            classeP.classList.add('card-text', 'small', 'mb-1');
                            classeP.innerHTML = `<strong>C:</strong> ${infoLezione.classe || '-'}`;
                            cardBody.appendChild(classeP);

                            const docenteP = document.createElement('p');
                            docenteP.classList.add('card-text', 'small', 'mb-0');
                            docenteP.innerHTML = `<strong>D:</strong> ${infoLezione.docente || 'N/D'}`;
                            cardBody.appendChild(docenteP);

                            if (infoLezione.is_sostituita) {
                                const sostituzioneP = document.createElement('p');
                                sostituzioneP.classList.add('card-text', 'small', 'fst-italic', 'text-info', 'mb-0', 'mt-1');
                                sostituzioneP.textContent = infoLezione.sostituzione_info || '(Sostituzione)';
                                cardBody.appendChild(sostituzioneP);
                                cardInner.style.backgroundColor = '#e1f5fe'; // Azzurrino per sostituzione
                                cardInner.classList.add('border-info');
                            } else {
                                cardInner.style.backgroundColor = '#ffebee'; // Rosso chiaro per occupata normale
                                cardInner.classList.add('border-danger');
                            }
                        } else {
                            const liberaP = document.createElement('p');
                            liberaP.classList.add('card-text', 'text-success', 'fw-bold', 'text-center', 'mt-auto');
                            liberaP.textContent = 'Libera';
                            cardBody.appendChild(liberaP);
                            cardInner.style.backgroundColor = '#e8f5e9'; // Verde chiaro per libera
                            cardInner.classList.add('border-success');
                        }
                        cardInner.appendChild(cardBody);
                        aulaCardCol.appendChild(cardInner);
                        auleGridDiv.appendChild(aulaCardCol);
                    });
                } else {
                    const noAuleP = document.createElement('p');
                    noAuleP.classList.add('text-muted');
                    noAuleP.textContent = 'Nessuna aula definita per questo piano nella struttura.';
                    auleGridDiv.appendChild(noAuleP);
                }
                pianoDiv.appendChild(auleGridDiv);
                mappaContainer.appendChild(pianoDiv);
            }
        }
        if (!auleDisegnate && (giornoSelezionato && slotSelezionato)) {
             mappaContainer.innerHTML = '<p class="text-info">Nessuna aula da visualizzare per i filtri selezionati (es. nessun piano corrisponde o struttura piani vuota).</p>';
        }
    }

    // Funzione per aggiornare la mappa quando i filtri cambiano
    async function aggiornaVistaMappaOFiltrata() {
        if (!giornoSelect || !slotSelect || !pianoSelect || !globalInitialData) {
            console.warn("Aggiornamento vista mappa saltato: filtri o dati iniziali non pronti.");
            return;
        }
        const selectedGiorno = giornoSelect.value;
        const selectedSlot = slotSelect.value;
        const selectedPiano = pianoSelect.value;

        if (!selectedGiorno || !selectedSlot) {
            // Non disegnare nulla se giorno o slot non sono selezionati (es. placeholder "--Tutti--")
            // Potresti voler pulire la mappa o mostrare un messaggio
            // document.getElementById('roomMapContainer').innerHTML = '<p>Seleziona un giorno e uno slot orario.</p>';
            // Per ora, se uno dei due non è selezionato (valore vuoto), non facciamo la fetch e il disegno.
            console.log("Aggiornamento vista mappa: Giorno o Slot non selezionato. Disegno non eseguito.");
            if (currentMapInstance) currentMapInstance.setData({ rooms: [] }); // Pulisce la mappa esistente
            return;
        }
        
        // Calcola la data effettiva per l'API basata sul giorno selezionato e la data di riferimento iniziale
        let finalDateString = '';
        try {
            const dateOfReference = new Date(globalInitialData.giorno_visualizzato);
            const dayOfWeekOfReference = dateOfReference.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
            
            // Mappa da nome giorno stringa a numero JS (0-6)
            // giorniSettimanaMap è già definito globalmente: {0: "DOMENICA", 1: "LUNEDI", ..., 6: "SABATO"}
            // Dobbiamo invertire questa mappa o crearne una nuova per il lookup da stringa a numero
            const dayStringToJsDayNum = {};
            for (const key in giorniSettimanaMap) {
                dayStringToJsDayNum[giorniSettimanaMap[key]] = parseInt(key);
            }

            const targetDayNumericJS = dayStringToJsDayNum[selectedGiorno.toUpperCase()]; // Es. LUNEDI -> 1

            if (typeof targetDayNumericJS !== 'undefined') {
                const diffDays = targetDayNumericJS - dayOfWeekOfReference;
                const targetDate = new Date(dateOfReference);
                targetDate.setDate(dateOfReference.getDate() + diffDays);
                finalDateString = targetDate.toISOString().split('T')[0];
            } else {
                console.error(`Impossibile mappare il giorno selezionato '${selectedGiorno}' a un numero.`);
                finalDateString = globalInitialData.giorno_visualizzato; // Fallback alla data iniziale
            }
        } catch (e) {
            console.error("Errore nel calcolo della data per l'API:", e);
            finalDateString = globalInitialData.giorno_visualizzato; // Fallback in caso di errore
        }

        console.log(`Aggiornamento vista per Data API: ${finalDateString}, GiornoFiltro: ${selectedGiorno}, Slot: ${selectedSlot}, Piano: ${selectedPiano}`);
        if (mappaContainer) {
            mappaContainer.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Caricamento mappa...</span></div> <p>Caricamento mappa...</p></div>';
        } else {
            console.error("Elemento mappaContainer non trovato nel DOM durante aggiornaVistaMappaOFiltrata!");
            return; // Esce se il contenitore non esiste, prevenendo ulteriori errori
        }

        try {
            const response = await fetch(`/api/occupazione_aule?data=${finalDateString}`);
            if (!response.ok) {
                const errData = await response.json().catch(() => null);
                throw new Error(errData ? errData.error : `Errore HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            datiOrarioCompleti = data;
            allOccupancyData = data.aule_occupate || [];
            giornoSettimanaCorrenteVisualizzato = data.giorno_settimana; // Aggiorna il giorno visualizzato corrente
            
            // Aggiorna anche i giorni e slot validi se l'API li cambia in base alla data (opzionale, ma potrebbe essere utile)
            // populateGiornoSelect(data.giorni_validi_settimana, data.giorno_settimana);
            // populateSlotOraSelect(data.slot_ore);
            // Per ora non lo facciamo per evitare di cambiare i filtri sotto l'utente in modo inaspettato
            // tranne se il giorno selezionato non è valido per la nuova data (molto improbabile se la logica è corretta)

            console.log("Dati di occupazione aggiornati per disegnare la mappa:", allOccupancyData.length, "record.");
            disegnaMappaOccupazione(selectedGiorno, selectedSlot, selectedPiano);

        } catch (error) {
            console.error("Errore durante l'aggiornamento e il disegno della mappa filtrata:", error);
            if (mappaContainer) {
                mappaContainer.innerHTML = `<p class="text-danger">Errore caricamento mappa: ${error.message}</p>`;
            } else {
                console.error("Elemento mappaContainer non trovato per mostrare messaggio di errore!");
            }
        }
    }

    // Event listeners per i filtri
    if (giornoSelect) giornoSelect.addEventListener('change', aggiornaVistaMappaOFiltrata);
    if (slotSelect) slotSelect.addEventListener('change', aggiornaVistaMappaOFiltrata);
    if (pianoSelect) pianoSelect.addEventListener('change', aggiornaVistaMappaOFiltrata);

    caricaDatiIniziali(); // Carica i dati al caricamento della pagina

    // Bottone per zoomare sulla mappa SVG (se la libreria lo supporta direttamente o con panzoom)
    const zoomInButton = document.getElementById('zoomInBtn');

}); 