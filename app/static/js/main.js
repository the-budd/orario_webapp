// Script JavaScript principali per l'applicazione
console.log("Main.js caricato.");

document.addEventListener('DOMContentLoaded', function() {
    // Verifica se siamo nella pagina dell'orario principale controllando l'esistenza di un elemento chiave
    const scheduleTable = document.getElementById('scheduleTable');
    const indexPageControls = document.getElementById('dayFilter'); // O un altro ID univoco di index.html

    // Esegui il codice di main.js solo se scheduleTable e i controlli esistono (siamo in index.html)
    if (scheduleTable && indexPageControls) {
        console.log("Main.js sta operando sulla pagina dell'orario (index.html).");

        const teacherFilter = document.getElementById('teacherFilter');
        const classFilter = document.getElementById('classFilter');
        const roomFilter = document.getElementById('roomFilter');
        const dayFilter = document.getElementById('dayFilter'); 
        const scheduleTableBody = scheduleTable.querySelector('tbody');
        
        const timeSlots = [
            "08:00-09:00", "09:00-10:00", "10:00-11:00", "11:00-12:00",
            "12:00-13:00", "13:00-14:00", "14:00-15:00"
        ];
        const days = ["LUNEDI", "MARTEDI", "MERCOLEDI", "GIOVEDI", "VENERDI"];

        let allScheduleData = []; 

        fetch('/api/orario')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    console.error("Errore dall'API in main.js (index.html):", data.error);
                    if (scheduleTableBody) scheduleTableBody.innerHTML = `<tr><td colspan="${days.length + 1}">Errore: ${data.error}</td></tr>`;
                    return;
                }
                allScheduleData = data;
                if (dayFilter) populateDayFilter(); // Verifica sempre prima di chiamare
                if (teacherFilter) populateTeacherFilter(allScheduleData);
                if (classFilter) populateClassFilter(allScheduleData);
                if (roomFilter) populateRoomFilter(allScheduleData);
                renderSchedule(); 
            })
            .catch(error => {
                console.error('Errore fetch orario in main.js (index.html):', error);
                if (scheduleTableBody) scheduleTableBody.innerHTML = `<tr><td colspan="${days.length + 1}">Impossibile caricare orario.</td></tr>`;
            });

        function populateDayFilter() {
            if (!dayFilter) return; // Controllo aggiunto
            days.forEach(day => {
                const option = document.createElement('option');
                option.value = day;
                option.textContent = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
                dayFilter.appendChild(option);
            });
            const today = new Date().getDay();
            let defaultDayValue = "";
            if (today === 0 || today === 6) defaultDayValue = "LUNEDI";
            else if (today >= 1 && today <= 5) defaultDayValue = days[today - 1];
            dayFilter.value = defaultDayValue;
        }

        function populateTeacherFilter(data) { 
            if (!teacherFilter) return; // Controllo aggiunto
            const teachers = new Map(); 
            data.forEach(item => {
                const docentiEmails = Array.isArray(item.Docente) ? item.Docente : [item.Docente];
                docentiEmails.forEach(email => {
                    if (email && email.trim() && !teachers.has(email.trim())) {
                        teachers.set(email.trim(), formatTeacherNameForDisplay(email.trim()));
                    }
                });
            });
            const sortedTeachers = Array.from(teachers.entries())
                .map(([email, displayName]) => ({ email, displayName }))
                .sort((a, b) => a.displayName.localeCompare(b.displayName));
            teacherFilter.innerHTML = '<option value="">-- Tutti --</option>'; 
            sortedTeachers.forEach(teacher => {
                const option = document.createElement('option');
                option.value = teacher.email;
                option.textContent = teacher.displayName;
                teacherFilter.appendChild(option);
            });
        }

        function populateClassFilter(data) {
            if (!classFilter) return; // Controllo aggiunto
            const classes = new Set();
            data.forEach(item => {
                if (item.Classe) classes.add(item.Classe.trim());
            });
            const sortedClasses = Array.from(classes).sort((a,b) => a.localeCompare(b));
            classFilter.innerHTML = '<option value="">-- Tutte --</option>'; 
            sortedClasses.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls;
                option.textContent = cls;
                classFilter.appendChild(option);
            });
        }

        function populateRoomFilter(data) {
            if (!roomFilter) return; // Controllo aggiunto
            const rooms = new Set();
            data.forEach(item => {
                if (item.Aula) rooms.add(item.Aula.trim());
            });
            const sortedRooms = Array.from(rooms).sort((a,b) => a.localeCompare(b));
            roomFilter.innerHTML = '<option value="">-- Tutte --</option>';
            sortedRooms.forEach(room => {
                const option = document.createElement('option');
                option.value = room;
                option.textContent = room;
                roomFilter.appendChild(option);
            });
        }

        function renderSchedule() {
            if (!scheduleTableBody) return; // Controllo aggiunto all'inizio
            scheduleTableBody.innerHTML = ''; 
            const selectedDayFilter = dayFilter ? dayFilter.value : ""; // Usa valore solo se dayFilter esiste
            const selectedTeacher = teacherFilter ? teacherFilter.value : "";
            const selectedClass = classFilter ? classFilter.value : "";
            const selectedRoom = roomFilter ? roomFilter.value : "";

            const tableHeaders = document.querySelectorAll('#scheduleTable thead th[data-day]');
            if (tableHeaders.length > 0) { // Esegui solo se ci sono gli header da modificare
                tableHeaders.forEach(th => {
                    const dayAttribute = th.getAttribute('data-day');
                    if (selectedDayFilter && dayAttribute !== selectedDayFilter) {
                        th.classList.add('hidden-day-header');
                        th.classList.remove('visible-day-header');
                    } else {
                        th.classList.remove('hidden-day-header');
                        if(selectedDayFilter) th.classList.add('visible-day-header');
                        else th.classList.remove('visible-day-header');
                    }
                });
            }

            timeSlots.forEach(slot => {
                const row = scheduleTableBody.insertRow();
                const timeCell = row.insertCell();
                timeCell.textContent = slot;
                timeCell.classList.add('time-slot-cell');
                days.forEach((day, dayIndex) => {
                    const cell = row.insertCell();
                    cell.classList.add('schedule-cell');
                    cell.setAttribute('data-day-cell', day);
                    if (selectedDayFilter && day !== selectedDayFilter) {
                        cell.classList.add('hidden-day-cell');
                    } else {
                        cell.classList.remove('hidden-day-cell');
                    }
                    if (!selectedDayFilter || day === selectedDayFilter) {
                        const entries = allScheduleData.filter(item => {
                            const itemDay = item.Giorno ? item.Giorno.trim() : '';
                            const itemSlot = item.SlotOre ? item.SlotOre.trim() : '';
                            let teacherMatch = !selectedTeacher || (Array.isArray(item.Docente) ? item.Docente : [item.Docente]).some(d => d && d.trim() === selectedTeacher);
                            let classMatch = !selectedClass || (item.Classe && item.Classe.trim() === selectedClass);
                            let roomMatch = !selectedRoom || (item.Aula && item.Aula.trim() === selectedRoom);
                            return itemDay === day && itemSlot === slot && teacherMatch && classMatch && roomMatch;
                        });
                        if (entries.length > 0) {
                            entries.forEach(entry => {
                                const entryDiv = document.createElement('div');
                                entryDiv.classList.add('schedule-entry');
                                entryDiv.innerHTML = `
                                    <strong>${entry.materia1 || 'Materia N/D'}</strong><br>
                                    Classe: ${entry.Classe || 'N/D'}<br>
                                    Aula: ${entry.Aula || 'N/D'}<br>
                                    <em>${Array.isArray(entry.Docente) ? entry.Docente.map(d => formatTeacherNameForDisplay(d)).join(', ') : formatTeacherNameForDisplay(entry.Docente || 'Docente N/D')}</em>
                                `;
                                if (!selectedTeacher && typeof entry.Docente === 'string' && entry.Docente.includes('.sconosciuto@')) {
                                    entryDiv.classList.add('placeholder-teacher-entry');
                                }
                                cell.appendChild(entryDiv);
                            });
                        } else {
                            cell.innerHTML = '';
                        }
                    }
                });
            });
        }
        
        function updateScheduleView() {
            renderSchedule(); 
        }

        if(teacherFilter) teacherFilter.addEventListener('change', function() {
            if (this.value !== "") { // Se è stato selezionato un docente specifico
                classFilter.value = "";    // Resetta il filtro classe
                roomFilter.value = "";     // Resetta il filtro aula
            }
            updateScheduleView(); // Aggiorna la tabella
        });

        if(classFilter) classFilter.addEventListener('change', function() {
            if (this.value !== "") { // Se è stata selezionata una classe specifica
                teacherFilter.value = "";  // Resetta il filtro docente
                roomFilter.value = "";     // Resetta il filtro aula
            }
            updateScheduleView(); // Aggiorna la tabella
        });

        if(roomFilter) roomFilter.addEventListener('change', function() {
            if (this.value !== "") { // Se è stata selezionata un'aula specifica
                teacherFilter.value = "";  // Resetta il filtro docente
                classFilter.value = "";    // Resetta il filtro classe
            }
            updateScheduleView(); // Aggiorna la tabella
        });

        if(dayFilter) dayFilter.addEventListener('change', updateScheduleView); // Il filtro giorno non resetta gli altri

        // Gestione preferenze utente per tema, font etc. (comune a tutte le pagine)
        const themeRadios = document.querySelectorAll('input[name="theme"]');
        const fontScaleSlider = document.getElementById('fontScaleSlider');
        const savedTheme = localStorage.getItem('theme') || 'auto';
        const savedFontScale = localStorage.getItem('fontScale') || '1';

        document.documentElement.setAttribute('data-theme', savedTheme);
        themeRadios.forEach(radio => {
            if (radio.id === savedTheme) radio.checked = true;
            radio.addEventListener('change', function() {
                setTheme(this.id);
            });
        });

        if (fontScaleSlider) {
            fontScaleSlider.value = savedFontScale;
            applyFontScale(savedFontScale);
            fontScaleSlider.addEventListener('input', function() {
                applyFontScale(this.value);
            });
        }
    } // Fine blocco if (scheduleTable && indexPageControls) -> per index.html

    // Codice specifico per la pagina gestione_sostituzioni.html
    const sostDocenteSelect = document.getElementById('sostDocenteSelect');
    if (sostDocenteSelect) {
        console.log("Main.js sta operando sulla pagina Gestione Sostituzioni.");
        let allScheduleDataSostituzioni = [];

        fetch('/api/orario')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    console.error("Errore dall'API in main.js (sostituzioni):", data.error);
                    // Potresti voler mostrare un messaggio di errore all'utente qui
                    return;
                }
                allScheduleDataSostituzioni = data;
                populateSostDocenteSelect(allScheduleDataSostituzioni);
            })
            .catch(error => {
                console.error('Errore fetch orario in main.js (sostituzioni):', error);
                // Potresti voler mostrare un messaggio di errore all'utente qui
            });

        function populateSostDocenteSelect(data) {
            if (!sostDocenteSelect) return;
            const teachers = new Map();
            data.forEach(item => {
                const docentiEmails = Array.isArray(item.Docente) ? item.Docente : [item.Docente];
                docentiEmails.forEach(email => {
                    if (email && email.trim() && !email.toLowerCase().includes('sconosciuto') && !teachers.has(email.trim())) {
                        teachers.set(email.trim(), formatTeacherNameForDisplay(email.trim()));
                    }
                });
            });

            const sortedTeachers = Array.from(teachers.entries())
                .map(([email, displayName]) => ({ email, displayName }))
                .sort((a, b) => a.displayName.localeCompare(b.displayName));
            
            sostDocenteSelect.innerHTML = '<option value="">-- Seleziona Docente --</option>'; // Pulisce e aggiunge placeholder
            sortedTeachers.forEach(teacher => {
                const option = document.createElement('option');
                option.value = teacher.email; // L'email come value
                option.textContent = teacher.displayName; // Il nome formattato come testo
                sostDocenteSelect.appendChild(option);
            });
        }

        const addAssenteBtn = document.getElementById('addAssenteBtn');
        const listaDocentiAssenti = document.getElementById('listaDocentiAssenti');

        if (addAssenteBtn && sostDocenteSelect && listaDocentiAssenti) {
            addAssenteBtn.addEventListener('click', function() {
                const selectedEmail = sostDocenteSelect.value;
                const selectedName = sostDocenteSelect.options[sostDocenteSelect.selectedIndex].text;

                if (selectedEmail) {
                    console.log(`Aggiungi docente: ${selectedName} (${selectedEmail})`);
                    // Qui aggiungeremo la logica per visualizzare il docente nella lista
                    // e per gestire i dati degli assenti.
                    
                    // Esempio base: lo aggiungiamo alla lista visiva
                    const listItem = document.createElement('li');
                    listItem.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
                    listItem.textContent = `${selectedName} (${selectedEmail})`;
                    listItem.setAttribute('data-email', selectedEmail);

                    const removeBtn = document.createElement('button');
                    removeBtn.classList.add('btn', 'btn-danger', 'btn-sm');
                    removeBtn.textContent = 'Rimuovi';
                    removeBtn.onclick = function() {
                        listItem.remove();
                        // Qui aggiorneremo anche la logica di gestione interna degli assenti
                        if (listaDocentiAssenti.children.length === 1 && listaDocentiAssenti.firstChild.classList.contains('no-selection')) {
                            // Se l'unico elemento rimasto è il placeholder "Nessun docente...", mostralo.
                        } else if (listaDocentiAssenti.children.length === 0) {
                            // Se non ci sono più docenti, ripristina il messaggio placeholder
                            listaDocentiAssenti.innerHTML = '<li class="list-group-item no-selection">Nessun docente assente selezionato.</li>';
                        }
                    };

                    listItem.appendChild(removeBtn);

                    // Rimuovi il placeholder "Nessun docente..." se presente
                    const placeholder = listaDocentiAssenti.querySelector('.no-selection');
                    if (placeholder) {
                        placeholder.remove();
                    }

                    listaDocentiAssenti.appendChild(listItem);
                    sostDocenteSelect.value = ""; // Resetta il select
                } else {
                    alert("Seleziona un docente dall'elenco.");
                }
            });
        }

        const analizzaOrarioBtn = document.getElementById('analizzaOrarioBtn');
        const sostDateInput = document.getElementById('sostDate');

        if (analizzaOrarioBtn && sostDateInput && listaDocentiAssenti) {
            analizzaOrarioBtn.addEventListener('click', function() {
                const dataSelezionata = sostDateInput.value;
                const docentiAssentiItems = listaDocentiAssenti.querySelectorAll('li[data-email]');
                
                const emailsDocentiAssenti = [];
                docentiAssentiItems.forEach(item => {
                    emailsDocentiAssenti.push(item.getAttribute('data-email'));
                });

                if (!dataSelezionata) {
                    alert("Per favore, seleziona una data per la sostituzione.");
                    return;
                }

                if (emailsDocentiAssenti.length === 0) {
                    alert("Per favore, aggiungi almeno un docente assente.");
                    return;
                }

                console.log("Data selezionata:", dataSelezionata);
                console.log("Email docenti assenti:", emailsDocentiAssenti);

                const slotDaCoprireContainer = document.getElementById('slotDaCoprireContainer');
                if (slotDaCoprireContainer) {
                    slotDaCoprireContainer.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Caricamento...</span></div> <p>Analisi orario e verifica sostituzioni esistenti...</p></div>';
                }

                // Promise per l'analisi dell'orario
                const promiseAnalisiOrario = fetch('/api/analizza_orario_sostituzioni', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        data_sostituzione: dataSelezionata,
                        emails_docenti_assenti: emailsDocentiAssenti
                    })
                })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(errData => {
                            throw new Error(errData.error || `Errore HTTP ${response.status} (analisi orario)`);
                        }).catch(() => {
                            throw new Error(`Errore HTTP ${response.status} (analisi orario).`);
                        });
                    }
                    return response.json();
                });

                // Promise per recuperare le sostituzioni già registrate per quella data
                const promiseSostituzioniRegistrate = fetch(`/api/sostituzioni_registrate_per_data?data=${dataSelezionata}`)
                    .then(response => {
                        if (!response.ok) {
                            return response.json().then(errData => {
                                throw new Error(errData.error || `Errore HTTP ${response.status} (sostituzioni registrate)`);
                            }).catch(() => {
                                throw new Error(`Errore HTTP ${response.status} (sostituzioni registrate).`);
                            });
                        }
                        return response.json();
                    });

                // Gestisci entrambe le promise
                Promise.all([promiseAnalisiOrario, promiseSostituzioniRegistrate])
                .then(([risultatiAnalisi, sostituzioniRegistrate]) => {
                    console.log("Dati ricevuti dall'analisi orario:", risultatiAnalisi);
                    console.log("Sostituzioni già registrate per la data:", sostituzioniRegistrate);

                    if (slotDaCoprireContainer) {
                        if (risultatiAnalisi.error) {
                            slotDaCoprireContainer.innerHTML = `<p class="text-center text-danger">Errore analisi: ${risultatiAnalisi.error}</p>`;
                            return;
                        }
                        if (sostituzioniRegistrate.error) { // Anche se l'API restituisce errore, lo logghiamo ma proviamo a mostrare gli slot
                            console.warn("Errore nel recuperare le sostituzioni registrate:", sostituzioniRegistrate.error);
                            // Non blocchiamo la visualizzazione degli slot per questo, ma l'utente non vedrà gli slot già coperti.
                        }

                        if (risultatiAnalisi.slot_trovati && risultatiAnalisi.slot_trovati.length > 0) {
                            let htmlContent = `<h5>Slot da Coprire per il ${risultatiAnalisi.giorno_richiesto} (${risultatiAnalisi.data_richiesta})</h5>`;
                            htmlContent += `<p>Docenti assenti: ${risultatiAnalisi.docenti_richiesti.map(email => formatTeacherNameForDisplay(email)).join(', ')}</p>`;
                            htmlContent += '<ul class="list-group">';
                            
                            risultatiAnalisi.slot_trovati.forEach(slot => {
                                const docentiOriginaliSlot = Array.isArray(slot.Docente) ? slot.Docente : (slot.Docente ? [slot.Docente] : []);
                                const docentiNomi = docentiOriginaliSlot.map(d => formatTeacherNameForDisplay(d)).join(', ') || 'N/D';

                                // Verifica se questo slot è già coperto
                                let slotGiaCoperto = false;
                                let sostitutoInfo = "";
                                if (Array.isArray(sostituzioniRegistrate) && sostituzioniRegistrate.length > 0) {
                                    const sostituzioneTrovata = sostituzioniRegistrate.find(sost => 
                                        sost.data_sostituzione === risultatiAnalisi.data_richiesta &&
                                        sost.slot_ora === slot.SlotOre &&
                                        // Verifica se almeno uno dei docenti originali dello slot è il docente assente della sostituzione registrata
                                        docentiOriginaliSlot.includes(sost.docente_assente_email) && 
                                        sost.classe_originale === slot.Classe &&
                                        sost.materia_originale === slot.materia1
                                        // Potremmo aggiungere anche l'aula se necessario per maggiore precisione
                                    );
                                    if (sostituzioneTrovata) {
                                        slotGiaCoperto = true;
                                        sostitutoInfo = `Già coperto da: <strong>${formatTeacherNameForDisplay(sostituzioneTrovata.docente_sostituto_email)}</strong>`;
                                    }
                                }

                                htmlContent += `
                                    <li class="list-group-item ${slotGiaCoperto ? 'list-group-item-light text-muted' : ''}">
                                        <strong>${slot.SlotOre}</strong> - ${slot.materia1 || 'Materia N/D'}<br>
                                        Classe: ${slot.Classe || 'N/D'}, Aula: ${slot.Aula || 'N/D'}<br>
                                        <em>Docente/i Originale/i: ${docentiNomi}</em><br>
                                        ${slotGiaCoperto ? 
                                            `<p class="mt-2 mb-0"><small>${sostitutoInfo}</small></p>` : 
                                            `<button class="btn btn-sm btn-success mt-2 btn-trova-sostituto" 
                                                    data-slot-ora="${slot.SlotOre}" 
                                                    data-materia-originale="${slot.materia1 || ''}"
                                                    data-classe-originale="${slot.Classe || ''}"
                                                    data-aula-originale="${slot.Aula || ''}"
                                                    data-docente-assente="${docentiOriginaliSlot.join(',')}" 
                                                    data-data-sostituzione="${risultatiAnalisi.data_richiesta}">
                                                Trova Sostituto per Quest'Ora
                                            </button>`
                                        }
                                        <div class="suggerimenti-sostituti-container mt-2"></div> <!-- Contenitore per suggerimenti futuri -->
                                    </li>`;
                            });
                            htmlContent += '</ul>';
                            slotDaCoprireContainer.innerHTML = htmlContent;
                        } else {
                            slotDaCoprireContainer.innerHTML = '<p class="text-center text-info">Nessuno slot da coprire trovato per i docenti e la data selezionati.</p>';
                        }
                    }
                })
                .catch(error => {
                    console.error("Errore Promises Analisi/Sostituzioni Registrate:", error);
                    if (slotDaCoprireContainer) {
                        slotDaCoprireContainer.innerHTML = `<p class="text-center text-danger">Si è verificato un errore: ${error.message}</p>`;
                    }
                });
            });
        }
    }

    // Event listener per i pulsanti "Trova Sostituto per Quest'Ora"
    // Utilizziamo event delegation sul contenitore
    const slotDaCoprireContainerGlobal = document.getElementById('slotDaCoprireContainer');
    if (slotDaCoprireContainerGlobal) {
        slotDaCoprireContainerGlobal.addEventListener('click', function(event) {
            if (event.target && event.target.classList.contains('btn-trova-sostituto')) {
                const button = event.target;
                const slotOra = button.dataset.slotOra;
                const materiaOriginale = button.dataset.materiaOriginale;
                const classeOriginale = button.dataset.classeOriginale;
                const aulaOriginale = button.dataset.aulaOriginale; // Estraggo l'aula originale
                const docenteAssenteEmail = button.dataset.docenteAssente;
                const dataSostituzione = button.dataset.dataSostituzione;

                // Rimuovi eventuali suggerimenti precedenti per questo slot
                const parentLi = button.closest('li.list-group-item');
                const existingSuggestionsDiv = parentLi ? parentLi.querySelector('.suggerimenti-sostituti-container') : null;
                if (existingSuggestionsDiv) {
                    existingSuggestionsDiv.remove();
                }

                // Crea un div per i suggerimenti e lo spinner
                const suggestionsDiv = document.createElement('div');
                suggestionsDiv.classList.add('suggerimenti-sostituti-container', 'mt-2');
                suggestionsDiv.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm text-secondary" role="status"><span class="visually-hidden">Carico suggerimenti...</span></div> <small>Carico suggerimenti...</small></div>';
                if (parentLi) {
                    parentLi.appendChild(suggestionsDiv);
                }
                button.disabled = true; // Disabilita il pulsante mentre si caricano i suggerimenti

                console.log(`Richiesta suggerimenti per: Data=${dataSostituzione}, Slot=${slotOra}, MateriaOrig=${materiaOriginale}, Assente/i=${docenteAssenteEmail}`);

                // Costruisci i query params
                const queryParams = new URLSearchParams({
                    data: dataSostituzione,
                    slot_ora: slotOra,
                    materia_originale: materiaOriginale,
                    classe_originale: classeOriginale,
                    docente_assente_email: docenteAssenteEmail
                });

                fetch(`/api/suggerisci_sostituti?${queryParams.toString()}`)
                    .then(response => {
                        button.disabled = false; // Riabilita il pulsante
                        if (!response.ok) {
                            return response.json().then(errData => {
                                throw new Error(errData.error || `Errore HTTP ${response.status}`);
                            }).catch(() => {
                                throw new Error(`Errore HTTP ${response.status} nel caricare i suggerimenti.`);
                            });
                        }
                        return response.json();
                    })
                    .then(suggerimenti => {
                        console.log("Suggerimenti ricevuti:", suggerimenti);
                        if (suggestionsDiv) {
                            if (suggerimenti && suggerimenti.length > 0) {
                                let suggestionsHtml = '<small class="text-muted d-block mb-1">Docenti suggeriti (DISPOSIZIONE):</small>';
                                suggestionsHtml += '<ul class="list-group list-group-flush suggerimenti-lista">';
                                suggerimenti.forEach(sugg => {
                                    suggestionsHtml += `
                                        <li class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-1">
                                            <span>${sugg.docente_nome_visualizzato || sugg.docente_email}
                                                ${sugg.info_aggiuntive ? `<br><small class="text-muted"><em>(${sugg.info_aggiuntive})</em></small>` : ''}
                                            </span>
                                            <button class="btn btn-sm btn-outline-primary btn-seleziona-sostituto" 
                                                    data-sostituto-email="${sugg.docente_email}"
                                                    data-sostituto-nome="${sugg.docente_nome_visualizzato || sugg.docente_email}"
                                                    data-tipo-suggerimento="${sugg.tipo_suggerimento || 'N/D'}"
                                                    data-docente-assente-email="${docenteAssenteEmail}"
                                                    data-data-sostituzione="${dataSostituzione}"
                                                    data-slot-ora="${slotOra}"
                                                    data-materia-originale="${materiaOriginale}"
                                                    data-classe-originale="${classeOriginale}"
                                                    data-aula-originale="${aulaOriginale}">
                                                Seleziona
                                            </button>
                                        </li>`;
                                });
                                suggestionsHtml += '</ul>';
                                suggestionsDiv.innerHTML = suggestionsHtml;
                            } else {
                                suggestionsDiv.innerHTML = '<p class="text-muted text-center"><small>Nessun docente a disposizione trovato per questo slot.</small></p>';
                            }
                        }
                    })
                    .catch(error => {
                        console.error("Errore fetch suggerimenti:", error);
                        if (suggestionsDiv) {
                            suggestionsDiv.innerHTML = `<p class="text-danger text-center"><small>Errore caricamento suggerimenti: ${error.message}</small></p>`;
                        }
                        button.disabled = false; // Riabilita anche in caso di errore
                    });
            }
            // NUOVA LOGICA PER IL PULSANTE "SELEZIONA SOSTITUTO"
            else if (event.target && event.target.classList.contains('btn-seleziona-sostituto')) {
                const selectButton = event.target;
                
                // Disabilita subito il pulsante per evitare click multipli
                selectButton.disabled = true;
                selectButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Confermo...';

                const payload = {
                    docenteSostitutoEmail: selectButton.dataset.sostitutoEmail,
                    // docenteSostitutoNome: selectButton.dataset.sostitutoNome, // Non serve al backend per salvare, ma utile per log/display
                    tipo_suggerimento_usato: selectButton.dataset.tipoSuggerimento,
                    docenteAssenteEmail: selectButton.dataset.docenteAssenteEmail,
                    dataSostituzione: selectButton.dataset.dataSostituzione,
                    slot_ora: selectButton.dataset.slotOra,
                    materiaOriginale: selectButton.dataset.materiaOriginale,
                    classeOriginale: selectButton.dataset.classeOriginale,
                    aulaOriginale: selectButton.dataset.aulaOriginale
                };

                console.log("Payload per conferma sostituzione:", payload);

                fetch('/api/conferma_sostituzione', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // Aggiungere CSRF token header se necessario
                    },
                    body: JSON.stringify(payload)
                })
                .then(response => {
                    // Riabilita il pulsante se non navighiamo o non lo rimuoviamo
                    // selectButton.disabled = false; 
                    // selectButton.textContent = 'Seleziona';
                    return response.json().then(data => ({ ok: response.ok, status: response.status, data }));
                })
                .then(result => {
                    const suggestionsContainer = selectButton.closest('.suggerimenti-sostituti-container');
                    const slotLiElement = selectButton.closest('li.list-group-item[data-slot-ora]'); // Dovremmo aggiungere data-slot-ora al LI principale dello slot.
                                                                                                   // o meglio, trovare il pulsante "Trova Sostituto" associato.
                    
                    if (result.ok) {
                        console.log("Sostituzione confermata:", result.data);
                        if (suggestionsContainer) {
                            suggestionsContainer.innerHTML = `<p class="text-success text-center fw-bold"><small>Sostituzione confermata con ${payload.docenteSostitutoEmail} (ID: ${result.data.sostituzione_id}).</small></p>`;
                        }
                        // Disabilita il pulsante "Trova Sostituto" per questo slot, se lo troviamo
                        const originalTrovaSostitutoBtn = Array.from(slotDaCoprireContainerGlobal.querySelectorAll('.btn-trova-sostituto')).find(btn => 
                            btn.dataset.slotOra === payload.slot_ora &&
                            btn.dataset.docenteAssente === payload.docenteAssenteEmail && // Confronta l'array/stringa docente assente
                            btn.dataset.dataSostituzione === payload.dataSostituzione
                            // Aggiungere altri controlli se necessario per univocità (classe, materia)
                        );
                        if (originalTrovaSostitutoBtn) {
                            originalTrovaSostitutoBtn.disabled = true;
                            originalTrovaSostitutoBtn.classList.remove('btn-success');
                            originalTrovaSostitutoBtn.classList.add('btn-secondary');
                            originalTrovaSostitutoBtn.textContent = 'Sostituzione Gestita';
                        }
                        // Potremmo anche voler nascondere o cambiare lo stile di tutti i pulsanti "Seleziona" in questo gruppo.
                        if(suggestionsContainer){
                           const allSelectButtons = suggestionsContainer.querySelectorAll('.btn-seleziona-sostituto');
                           allSelectButtons.forEach(btn => {
                               btn.style.display = 'none'; 
                           });
                        }


                    } else {
                        console.error("Errore conferma sostituzione:", result.data);
                        alert(`Errore durante la conferma: ${result.data.error || 'Errore sconosciuto.'}`);
                        // Riabilita il pulsante se c'è stato un errore e l'utente può ritentare
                        selectButton.disabled = false; 
                        selectButton.textContent = 'Seleziona';
                    }
                })
                .catch(error => {
                    console.error("Errore fetch conferma sostituzione:", error);
                    alert(`Errore di comunicazione durante la conferma: ${error.message}`);
                    selectButton.disabled = false;
                    selectButton.textContent = 'Seleziona';
                });
            }
        });
    }

    // Funzione per formattare il nome del docente (definita qui per essere accessibile globalmente)
    function formatTeacherNameForDisplay(email) {
        if (!email || !email.includes('@')) return email;
        let namePart = email.split('@')[0];
        namePart = namePart.replace(/\.sconosciuto$/g, ''); 
        // Corretta regex per sostituire i punti con spazi: da /\./g a /\./g
        return namePart.replace(/\./g, ' ').toLowerCase().split(' ')
                       .filter(word => word.length > 0)
                       .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // Funzioni globali o comuni a più pagine (come setTheme, applyFontScale)
    // dovrebbero essere definite fuori dai blocchi if specifici per pagina,
    // oppure il codice deve essere strutturato in moduli se diventa complesso.

    function setTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
            if(themeRadios) themeRadios.forEach(radio => radio.checked = false);
        } else {
            document.body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
            if(themeRadios) themeRadios.forEach(radio => radio.checked = false);
        }
    }

    function applyFontScale(scale) {
        document.documentElement.style.setProperty('--font-scale-factor', scale);
        localStorage.setItem('fontScale', scale);
    }

    // Chiamata iniziale per applicare la scala salvata, se non già fatto nel blocco index
    // Esegui solo se fontScaleSlider è definito globalmente o se lo cerchiamo qui
    const globalFontScaleSlider = document.getElementById('fontScaleSlider'); // Cerchiamolo qui per sicurezza
    if (!indexPageControls && globalFontScaleSlider) { 
        const initialFontScale = localStorage.getItem('fontScale') || '1';
        globalFontScaleSlider.value = initialFontScale;
        applyFontScale(initialFontScale);
    }
}); 