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
    const { cartella, reportType, reportFormat, header, doctorName, oggi } = req.body;
    
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
    if (reportType === 'obstetric') {
      systemPrompt = format === 'brief' 
        ? getBriefObstetricPrompt(header, doctorName, oggi)
        : getCompleteObstetricPrompt(header, doctorName, oggi);
    } else {
      systemPrompt = format === 'brief'
        ? getBriefGynecologicPrompt(header, doctorName, oggi)
        : getCompleteGynecologicPrompt(header, doctorName, oggi);
    }
    
    const userPrompt = `Ecco i dati della cartella clinica:

${cartella}

Genera una relazione clinica professionale ${format === 'brief' ? 'SINTETICA in forma narrativa' : 'completa'} seguendo esattamente lo schema e lo stile indicato nel system prompt.`;

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
        max_tokens: format === 'brief' ? 2000 : 4000,  // Meno token per formato breve
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

function getCompleteObstetricPrompt(header, doctorName, oggi) {
  return `Sei un assistente specializzato nella generazione di relazioni cliniche ostetriche professionali COMPLETE E DETTAGLIATE.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}

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
      <div class="signature-label">Firma del Medico Responsabile<br>${doctorName}</div>
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

function getCompleteGynecologicPrompt(header, doctorName, oggi) {
  return `Sei un assistente specializzato nella generazione di relazioni cliniche ginecologiche professionali COMPLETE.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}

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

function getBriefObstetricPrompt(header, doctorName, oggi) {
  return `Sei un assistente specializzato nella generazione di NOTE CLINICHE SINTETICHE per database ospedaliero.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}

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
      <div class="signature-label">${doctorName}</div>
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

function getBriefGynecologicPrompt(header, doctorName, oggi) {
  return `Sei un assistente specializzato nella generazione di NOTE CLINICHE SINTETICHE ginecologiche.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}

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
