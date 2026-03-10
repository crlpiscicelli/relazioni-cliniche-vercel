// ═══════════════════════════════════════════════════════════════
// VERCEL SERVERLESS FUNCTION - Genera Relazioni Cliniche
// Con supporto per formato COMPLETO e SINTETICO
// ═══════════════════════════════════════════════════════════════

const fetch = require('node-fetch');

module.exports = async (req, res) => {
  
  // ── CORS Headers ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Parse request body
    const { cartella, reportType, reportFormat, header, doctorName, doctorQualifica, oggi, tipoAccesso, tipoIntervento, problematiche, surgicalFormat } = req.body;
    
    // Get API key from environment variable
    const API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (!API_KEY) {
      return res.status(500).json({ 
        error: 'API Key non configurata. Configura ANTHROPIC_API_KEY nelle variabili d\'ambiente di Vercel.' 
      });
    }
    
    if (!cartella) {
      return res.status(400).json({ error: 'Dati cartella mancanti' });
    }
    
    // Default a formato completo se non specificato
    const format = reportFormat || 'complete';
    
    // Build prompts based on type and format
    let systemPrompt;
    let userPrompt;

    if (reportType === 'surgical') {
      systemPrompt = getSurgicalReportPrompt(header, doctorName, doctorQualifica, oggi, tipoAccesso, tipoIntervento, problematiche, surgicalFormat);
      userPrompt = `Ecco i dati dell'intervento da registrare:\n\n${cartella}\n\nGenera il verbale operatorio completo seguendo esattamente lo schema e lo stile indicato nel system prompt. Ricorda: sei il chirurgo che scrive il registro operatorio.`;
    } else if (reportType === 'obstetric') {
      systemPrompt = format === 'brief'
        ? getBriefObstetricPrompt(header, doctorName, doctorQualifica, oggi)
        : getCompleteObstetricPrompt(header, doctorName, doctorQualifica, oggi);
      userPrompt = `Ecco i dati della cartella clinica:\n\n${cartella}\n\nGenera una relazione clinica professionale ${format === 'brief' ? 'SINTETICA in forma narrativa' : 'completa'} seguendo esattamente lo schema e lo stile indicato nel system prompt.`;
    } else {
      systemPrompt = format === 'brief'
        ? getBriefGynecologicPrompt(header, doctorName, doctorQualifica, oggi)
        : getCompleteGynecologicPrompt(header, doctorName, doctorQualifica, oggi);
      userPrompt = `Ecco i dati della cartella clinica:\n\n${cartella}\n\nGenera una relazione clinica professionale ${format === 'brief' ? 'SINTETICA in forma narrativa' : 'completa'} seguendo esattamente lo schema e lo stile indicato nel system prompt.`;
    }

    console.log(`📝 Generazione relazione ${reportType} - formato ${format}...`);
    
    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: reportType === 'surgical' ? 4000 : (format === 'brief' ? 2000 : 4000),
        messages: [{
          role: 'user',
          content: userPrompt
        }],
        system: systemPrompt
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Errore API Claude:', error);
      return res.status(response.status).json({ 
        error: error.error?.message || 'Errore chiamata API Claude' 
      });
    }
    
    const data = await response.json();
    const html = data.content[0].text;
    
    console.log('✅ Relazione generata con successo');
    
    // Calculate cost estimate
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    const cost = ((inputTokens * 0.003 + outputTokens * 0.015) / 1000).toFixed(4);
    
    return res.status(200).json({ 
      html, 
      usage: {
        inputTokens,
        outputTokens,
        cost
      }
    });
    
  } catch (error) {
    console.error('❌ Errore function:', error);
    return res.status(500).json({ error: error.message || 'Errore interno' });
  }
};

// ═══════════════════════════════════════════════════════════════
// PROMPT TEMPLATES - FORMATO COMPLETO
// ═══════════════════════════════════════════════════════════════

function getCompleteObstetricPrompt(header, doctorName, doctorQualifica, oggi) {
  return `Sei un assistente specializzato nella generazione di relazioni cliniche ostetriche professionali COMPLETE E DETTAGLIATE.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}${doctorQualifica ? "\n" + doctorQualifica : ""}

DATA DELLA VISITA:
${oggi}

ISTRUZIONI:
1. Analizza i dati forniti dalla cartella clinica
2. Genera una relazione narrativa COMPLETA E DETTAGLIATA in HTML
3. Usa esattamente questo formato HTML:

<div class="report">
  <div class="report-header">
    <div>
      <div class="report-institution">${header.institution}</div>
      ${header.department ? `<div class="report-department">${header.department}</div>` : ''}
    </div>
    <div class="report-date">Visita:<br><strong>${oggi}</strong></div>
  </div>
  
  <div class="report-title">Nota Clinica</div>
  <div class="report-subtitle">Monitoraggio in Gravidanza — [SETTIMANE] Settimane Gestazionali</div>
  
  <div class="patient-card">
    <div class="patient-name">Sig.ra [NOME]</div>
    <div class="patient-grid">
      [CAMPI ANAGRAFICA]
    </div>
  </div>
  
  <h2>Anamnesi</h2>
  [PARAGRAFI NARRATIVI DETTAGLIATI]
  
  <h2>Screening serologico e indagini</h2>
  [ELENCO COMPLETO]
  
  <h2>Monitoraggio ematochimico</h2>
  [TABELLA HTML CON TUTTI I DATI]
  
  <h2>Esami ecografici</h2>
  [NARRATIVA COMPLETA CON EVOLUZIONE]
  
  <h2>Valutazione clinica</h2>
  [ANALISI DETTAGLIATA CON H3 PER OGNI PROBLEMA]
  
  <h2>Piano di proseguimento</h2>
  [PIANO DETTAGLIATO]
  
  <div class="signature-block">
    <div>
      <div class="signature-line" style="width: 260px;"></div>
      <div class="signature-label">Firma del Medico Responsabile<br>${doctorName}${doctorQualifica ? "<br><span style=\"font-size:8pt;font-weight:400\">" + doctorQualifica.replace(/\n/g, "<br>") + "</span>" : ""}</div>
    </div>
    <div style="text-align: right;">
      <div class="signature-line" style="width: 160px;"></div>
      <div class="signature-label">Data: ${oggi}</div>
    </div>
  </div>
</div>

REGOLE:
- Calcola le settimane gestazionali dalla U.M.
- Interpreta i dati clinici
- Genera narrativa professionale DETTAGLIATA
- Usa <strong> per termini importanti
- Crea tabelle HTML per dati ematochimici
- Usa <h3> per sottosezioni
- Non inventare dati
- Restituisci SOLO l'HTML`;
}

function getCompleteGynecologicPrompt(header, doctorName, doctorQualifica, oggi) {
  return `Sei un assistente specializzato nella generazione di relazioni cliniche ginecologiche professionali COMPLETE.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}${doctorQualifica ? "\n" + doctorQualifica : ""}

DATA DELLA VISITA:
${oggi}

ISTRUZIONI:
Genera una relazione ginecologica COMPLETA E DETTAGLIATA seguendo la struttura standard con tutte le sezioni.

Usa lo stesso formato HTML della relazione ostetrica ma adattato per visita ginecologica.

Restituisci SOLO l'HTML.`;
}

// ═══════════════════════════════════════════════════════════════
// PROMPT TEMPLATES - FORMATO SINTETICO  
// ═══════════════════════════════════════════════════════════════

function getBriefObstetricPrompt(header, doctorName, doctorQualifica, oggi) {
  return `Sei un assistente specializzato nella generazione di NOTE CLINICHE SINTETICHE per database ospedaliero.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}${doctorQualifica ? "\n" + doctorQualifica : ""}

DATA DELLA VISITA:
${oggi}

FORMATO RICHIESTO: NOTA CLINICA SINTETICA

ISTRUZIONI:
1. Genera una relazione in formato NARRATIVO BREVE (~300-400 parole)
2. Stile: Nota clinica per database ospedaliero
3. NO tabelle, NO sezioni separate con H2
4. Tutto in PARAGRAFI NARRATIVI fluidi

STRUTTURA HTML:

<div class="report">
  <div class="report-header">
    <div>
      <div class="report-institution">${header.institution}</div>
      ${header.department ? `<div class="report-department">${header.department}</div>` : ''}
    </div>
    <div class="report-date">Visita:<br><strong>${oggi}</strong></div>
  </div>
  
  <div class="report-title">Nota Clinica</div>
  <div class="report-subtitle">Visita Ostetrica — [SETTIMANE]^ Settimana</div>
  
  <p><strong>Paziente:</strong> [Nome], [età] anni, [gravida/para] alla [sett]^ settimana gestazionale (U.M. [data], D.P.P. [data]).</p>
  
  <p><strong>Anamnesi rilevante:</strong> [Paragrafo narrativo con: gruppo sanguigno, allergie, familiarità, fumo, IMC, patologie, interventi, farmaci in gravidanza].</p>
  
  <p><strong>Screening e profilassi:</strong> [Paragrafo narrativo con: rosolia, toxo, CMV, screening genetici, tiroide, diabete, terapie].</p>
  
  <p><strong>Decorso gravidico:</strong> [Paragrafo narrativo con ultimi esami ematochimici più rilevanti, senza tabelle].</p>
  
  <p><strong>Valutazione ecografica:</strong> [Paragrafo narrativo con: crescita fetale, percentile, evoluzione, doppler, LA, placenta, presentazione. Focalizza su problemi se presenti].</p>
  
  <p><strong>Conclusioni:</strong> [Diagnosi/problemi principali]. [Piano di controlli e terapia].</p>
  
  <div class="signature-block">
    <div>
      <div class="signature-line" style="width: 260px;"></div>
      <div class="signature-label">${doctorName}${doctorQualifica ? "<br><span style=\"font-size:8pt;font-weight:400\">" + doctorQualifica.replace(/\n/g, "<br>") + "</span>" : ""}</div>
    </div>
  </div>
</div>

REGOLE FONDAMENTALI:
- LUNGHEZZA: 300-400 parole totali
- FORMATO: Solo paragrafi narrativi, NO liste, NO tabelle
- STILE: Nota clinica sintetica e scorrevole
- FOCUS: Problema principale + dati essenziali
- Usa <strong> solo per etichette ("Paziente:", "Anamnesi rilevante:", ecc.)
- Restituisci SOLO l'HTML`;
}

function getBriefGynecologicPrompt(header, doctorName, doctorQualifica, oggi) {
  return `Sei un assistente specializzato nella generazione di NOTE CLINICHE SINTETICHE ginecologiche.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}${doctorQualifica ? "\n" + doctorQualifica : ""}

DATA DELLA VISITA:
${oggi}

FORMATO: NOTA CLINICA SINTETICA (~300 parole)

Genera una nota clinica narrativa BREVE in formato paragrafi, senza tabelle né sezioni H2 separate.

Struttura:
<div class="report">
  [header come ostetrica]
  <div class="report-title">Nota Clinica - Visita Ginecologica</div>
  
  <p><strong>Paziente:</strong> [età] anni. <strong>Motivo:</strong> [motivo visita].</p>
  <p><strong>Anamnesi:</strong> [U.M., cicli, parità, anamnesi rilevante].</p>
  <p><strong>Esame obiettivo:</strong> [Ispezione, esame speculare, esame bimanuale].</p>
  <p><strong>Ecografia office:</strong> [Reperti ecografici se eseguita].</p>
  <p><strong>Conclusioni e prescrizioni:</strong> [Diagnosi, terapia, follow-up].</p>
  
  [firma]
</div>

Restituisci SOLO l'HTML.`;
}

// ═══════════════════════════════════════════════════════════════
// PROMPT TEMPLATE - REGISTRO OPERATORIO
// ═══════════════════════════════════════════════════════════════

function getSurgicalReportPrompt(header, doctorName, doctorQualifica, oggi, tipoAccesso, tipoIntervento, problematiche, surgicalFormat) {
  // tipoAccesso e tipoIntervento possono essere stringhe tipo "isteroscopico + laparoscopico"
  const accessiList = (tipoAccesso || 'isteroscopico').split(' + ').map(s => s.trim()).filter(Boolean);
  const interventoLabel = tipoIntervento || '';
  const prob = problematiche ? `\nProblematiche aggiuntive / note: ${problematiche}` : '';
  const isMultiAccesso = accessiList.length > 1;
  const isBrief = surgicalFormat === 'brief';

  // Tecniche standard per accesso
  const tecnicheStandard = {
    isteroscopico: `
TECNICA ISTEROSCOPIA OPERATIVA:
- Posizionamento: litotomica dorsale, glutei al bordo del letto, abbassamento testata ~15°
- Preparazione: disinfezione genitali esterni e vagina con antisettico; teli sterili fenestrati; svuotamento vescicale
- Esposizione: speculum bivalve; presa labbro anteriore cervice con tenaculum a un dente
- Dilatazione: dilatatori di Hegar progressivi fino al calibro necessario (n. 9-10 per resettore 26 Fr)
- Introduzione strumento: inserimento resettore/isteroscopio operativo sotto controllo visivo diretto
- Distensione: mezzo di distensione (soluzione salina o glicina) con pompa a pressione controllata (60-80 mmHg); monitoraggio del bilancio idrico
- Panoramica: esplorazione sistematica della cavità uterina (parete anteriore, posteriore, laterali dx e sx, fondo, ostia tubariche)
- Fase operativa: [DETTAGLIATA IN BASE AI DATI]
- Emostasi: verifica al sito operatorio; coagulazione eventuali punti sanguinanti
- Fine procedura: rimozione strumento sotto visione; rilascio tenaculum; controllo collo uterino`,

    laparoscopico: `
TECNICA LAPAROSCOPIA GINECOLOGICA:
- Posizionamento: Trendelenburg 15-20°, leggera litotomica; catetere Foley; manipolatore uterino ove indicato
- Preparazione: disinfezione addome e genitali; teli sterili
- Accesso peritoneale: incisione ombelicale ~12 mm; ago di Veress (test aspirazione + goccia); insufflazione CO₂ fino a 12-15 mmHg; trocar ombelicale 10/12 mm; ottica 0° o 30°
- Panoramica: esplorazione cavo addominale e pelvico; identificazione organi e strutture anatomiche
- Trocars accessori: 5 mm in fossa iliaca dx e sx ± sovrapubico, sotto visione diretta
- Fase operativa: [DETTAGLIATA IN BASE AI DATI]
- Lavaggio: abbondante lavaggio cavo pelvico con fisiologica tiepida
- Emostasi: verifica accurata tutti i siti operatori
- Chiusura: desufflazione; rimozione trocars sotto visione; sutura fasciale ombelicale con riassorbibile; sutura cutanea`,

    laparotomico: `
TECNICA LAPAROTOMIA GINECOLOGICA:
- Posizionamento: decubito supino; catetere Foley
- Preparazione: disinfezione addome; teli sterili fenestrati
- Incisione: Pfannenstiel (trasversale sovrapubica ~10-12 cm) / mediana infraombelicale [adattare]
- Apertura strati: sottocutaneo; fascia; separazione retti; peritoneo parietale
- Esplorazione: manuale del cavo addominale e pelvico; divaricatori; esposizione campo
- Fase operativa: [DETTAGLIATA IN BASE AI DATI]
- Emostasi: elettrocoagulazione / punti emostatici in riassorbibile
- Chiusura: peritoneo con continua riassorbibile; fascia con lento riassorbimento; cute con punti staccati / intradermica`,

    vaginale: `
TECNICA CHIRURGIA VAGINALE:
- Posizionamento: litotomica dorsale; catetere Foley; speculum posteriore di Auvard
- Preparazione: disinfezione genitali e vagina; teli sterili
- Esposizione: trazione cervice con tenaculum; esposizione pareti vaginali
- Fase operativa: [DETTAGLIATA IN BASE AI DATI]
- Emostasi: punti in riassorbibile / elettrocoagulazione bipolare
- Chiusura: sutura piani vaginali con riassorbibile`,

    'vulvare/perineale': `
TECNICA CHIRURGIA VULVO-PERINEALE:
- Posizionamento: litotomica dorsale
- Preparazione: disinfezione genitali esterni; teli sterili
- Fase operativa: [DETTAGLIATA IN BASE AI DATI]
- Emostasi: punti emostatici in riassorbibile / bipolare
- Chiusura: sutura per piani con riassorbibile`,

    ostetrico: `
TECNICA OSTETRICA (TC / revisione / cerchiaggio):
- Posizionamento: supino con cuneo sotto anca dx (tilting sx 15°) per TC; litotomica per cerchiaggio/revisione; catetere Foley
- Preparazione: disinfezione addome (TC) o genitali; teli sterili
- Accesso: Pfannenstiel (TC) / vaginale (cerchiaggio, revisione)
- Fase operativa: [DETTAGLIATA IN BASE AI DATI]
- Chiusura: isterorrafia in due strati con riassorbibile (TC); sutura parete; cute`
  };

  // Assembla le tecniche per gli accessi selezionati
  let tecnicheAssemblate = '';
  if (isMultiAccesso) {
    tecnicheAssemblate = `INTERVENTO COMBINATO: ${accessiList.join(' + ').toUpperCase()}\n`;
    tecnicheAssemblate += `Descrivi le due fasi in sequenza logica (es. prima la fase laparoscopica, poi quella isteroscopica, o viceversa a seconda del caso clinico).\n\n`;
    accessiList.forEach(acc => {
      const t = tecnicheStandard[acc];
      if (t) tecnicheAssemblate += t + '\n\n';
    });
  } else {
    tecnicheAssemblate = tecnicheStandard[accessiList[0]] || tecnicheStandard['isteroscopico'];
  }

  const accessoLabel = accessiList.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(' + ');
  const sottotitoloHTML = `Registro Operatorio — Accesso ${accessoLabel}${interventoLabel ? ' · ' + interventoLabel : ''}`;

  // Per intervento combinato, aggiungi sezioni specifiche per fase
  const strutturaHTML = isMultiAccesso
    ? `  <h3>Posizionamento e preparazione del campo operatorio</h3>
  <p>[Descrivi posizionamento unico che consenta entrambi gli accessi, es. Trendelenburg + litotomica]</p>

  <h3>Fase ${accessiList[0].charAt(0).toUpperCase() + accessiList[0].slice(1)} — Accesso e tecnica</h3>
  <p>[Descrivi prima fase dettagliata]</p>

  <h3>Fase ${accessiList[1] ? accessiList[1].charAt(0).toUpperCase() + accessiList[1].slice(1) : 'Seconda'} — Accesso e tecnica</h3>
  <p>[Descrivi seconda fase dettagliata]</p>

  <h3>Reperti intraoperatori</h3>
  <p>[Caratteristiche della lesione/i, varianti anatomiche, patologia aggiuntiva]</p>

  <h3>Emostasi e controllo finale</h3>
  <p>[Verifica emostasi di tutti i siti operatori delle due fasi]</p>

  <h3>Chiusura</h3>
  <p>[Chiusura di tutti gli accessi]</p>`
    : `  <h3>Posizionamento e preparazione del campo operatorio</h3>
  <p>[PARAGRAFO DETTAGLIATO]</p>

  <h3>Accesso chirurgico</h3>
  <p>[PARAGRAFO DETTAGLIATO]</p>

  <h3>Esplorazione e reperti intraoperatori</h3>
  <p>[Caratteristiche della lesione, varianti anatomiche, aderenze, patologia aggiuntiva]</p>

  <h3>Tecnica operatoria</h3>
  <p>[2-4 PARAGRAFI step by step]</p>

  <h3>Emostasi e controllo finale</h3>
  <p>[PARAGRAFO]</p>

  <h3>Chiusura / Fine procedura</h3>
  <p>[PARAGRAFO]</p>`;

  return `Sei un ginecologo chirurgo esperto. Il tuo compito è generare la DESCRIZIONE DELL'INTERVENTO per il registro operatorio.

CONTESTO:
- Via/e di accesso: ${accessoLabel}${isMultiAccesso ? ' (intervento combinato)' : ''}
- Patologia/intervento: ${interventoLabel || '(vedi dati forniti)'}${prob}
- Data intervento: ${oggi}
- Formato richiesto: ${isBrief ? 'SINTETICO (testo continuo, no paragrafi separati)' : 'DETTAGLIATO (con sezioni H3)'}

OBIETTIVO:
Genera SOLO il testo narrativo della descrizione chirurgica, pronto da incollare nel registro operatorio già predisposto (che contiene già nomi, anestesia, dati paziente). Non ripetere queste informazioni nell'output.

BASE TECNICA STANDARD:
${tecnicheAssemblate}

═══════════════════════════════════════════════
REGOLA FONDAMENTALE: DALLA MORFOLOGIA ALLA TECNICA
═══════════════════════════════════════════════
I dettagli morfologici e clinici forniti dall'utente NON sono solo descrittivi: devono GUIDARE ATTIVAMENTE la scelta e la descrizione della tecnica chirurgica. Ragiona come un chirurgo esperto che adatta il proprio approccio a ciò che ha davanti.

Applica queste logiche cliniche:

DIMENSIONI:
- Cisti/mioma piccolo (<4 cm) → tecnica standard, enucleazione diretta
- Cisti/mioma medio (4-8 cm) → tecnica con aspirazione preliminare del contenuto (cisti), o morcellazione progressiva (mioma)
- Lesione grande (>8 cm) → menziona necessità di decompressione/morcellazione, rischio di conversione, mantenimento della capsula integra ove possibile

SUPERFICIE / ASPETTO ESTERNO:
- Superficie regolare, liscia → verosimile cisti benigna, tecnica conservativa di scollamento per via smussa
- Superficie irregolare, papillare → approccio cauteloso, enfatizza la necessità di preservare la capsula integra, invio esame estemporaneo se indicato
- Aspetto endometriosico (chocolate cyst, parete retraente) → scollamento difficoltoso, rischio di apertura, lavaggio del cavo

MOBILITÀ / ADERENZE:
- Mobile, senza aderenze → scollamento diretto, tempi rapidi
- Aderente al legamento largo / tube → lisi preventiva delle aderenze prima di procedere all'enucleazione; menzione attenzione all'uretere
- Aderente all'intestino / Douglas obliterato → ureterolisi, tecnica step-by-step, eventuale assistenza urologica/chirurgica

SEDE:
- Ovaio dx → rapporto con uretere dx, cecum/appendice
- Ovaio sx → rapporto con uretere sx, sigma
- Cisti parovarica → preservazione dell'ovaio, distinzione dalla tuba
- Mioma fundico → accesso al peduncolo, isterorrafia al fondo
- Mioma del segmento inferiore → rapporto con ureter, attenzione alla vascolarizzazione

ISTOSCOPIA — CARATTERISTICHE DELLA LESIONE:
- Polipo peduncolato, peduncolo sottile → resezione alla base con singolo passaggio d'ansa
- Polipo a base larga → resezione in più passaggi; verifica del letto
- Mioma G0 → resezione completa in unica seduta verosimile
- Mioma G1-G2 → resezione in più tempi; menziona monitoraggio bilancio idrico con soglia di sicurezza (es. deficit >1500 ml)
- Setto → incisione midline progressiva sotto visione; verifica simmetria degli osti tubarici a fine procedura

ASPETTO MACROSCOPICO DEL CONTENUTO (se descritto):
- Contenuto sieroso → cistectomia con preservazione parenchima
- Contenuto mucinoso → attenzione alla decompressione controllata, lavaggio abbondante se rottura
- Contenuto ematico/catramoso (endometrioma) → tecnica di Donnez o stripping, abbondante lavaggio
- Contenuto solido/misto → menziona invio urgente per esame estemporaneo

═══════════════════════════════════════════════

${isBrief ? `ISTRUZIONI FORMATO SINTETICO:
1. Genera un UNICO paragrafo di testo continuo (max 8-10 righe) — nessun titolo H3, nessuna lista
2. Copri in sequenza: posizionamento/accesso → reperti → tecnica → emostasi → chiusura → decorso
3. Usa frasi brevi collegate da punti e virgola o punti
4. Tono: registro operatorio italiano ufficiale, verbi al passato
5. Includi campione istologico solo se pertinente
6. Applica comunque la logica morfologia→tecnica sopra descritta
7. Nessun placeholder nell'output — usa la variante standard se mancano dati specifici` 
: `ISTRUZIONI FORMATO DETTAGLIATO:
1. Leggi i dati morfologici forniti (campo "Reperti / caratteristiche della patologia")
2. Applica la logica clinica sopra per scegliere e descrivere la tecnica appropriata
3. Integra questi dettagli nel testo narrativo in modo fluido e naturale — non come elenco, ma come descrizione chirurgica coerente
4. ${isMultiAccesso ? 'Per l\'intervento combinato: descrivi le due fasi in sequenza logica, indicando chiaramente il passaggio da una fase all\'altra' : 'Descrivi ogni step con precisione chirurgica'}
5. Tono: registro operatorio italiano ufficiale, verbi al passato ("si è proceduto", "è stata eseguita", "si è proceduto all'enucleazione")
6. Struttura con sottotitoli H3
7. Ogni sezione deve essere completa — NESSUN placeholder nell'output finale: se un dato non è fornito, usa la variante tecnica standard più appropriata per quel tipo di lesione`}

OUTPUT HTML:

<div class="report">
  <div class="alert alert-info">
    <strong>ℹ️ Testo da copiare nel registro operatorio</strong> — Dati paziente, equipe e anestesia sono già nel registro.
  </div>

${isBrief 
  ? `  <p style="line-height:1.8;">[TESTO CONTINUO — un unico paragrafo narrativo completo]</p>`
  : strutturaHTML + `

  <h3>Decorso intraoperatorio</h3>
  <p>[Decorso regolare / eventuali criticità. Perdita ematica stimata: ___ ml. Diuresi intraoperatoria: ___ ml.]</p>

  <h3>Campioni inviati all'esame istologico</h3>
  <p>[Descrizione campione / "Nessun campione inviato"]</p>`}
</div>

REGOLA ASSOLUTA: Restituisci SOLO l'HTML, nessun testo fuori dai tag.`;
}
