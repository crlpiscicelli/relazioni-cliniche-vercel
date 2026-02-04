// ═══════════════════════════════════════════════════════════════
// VERCEL SERVERLESS FUNCTION - Genera Relazioni Cliniche
// Formato corretto per Vercel (non Netlify!)
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
    const { cartella, reportType, header, doctorName, oggi } = req.body;
    
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
    
    // Build prompts
    const systemPrompt = reportType === 'obstetric' 
      ? getObstetricPrompt(header, doctorName, oggi)
      : getGynecologicPrompt(header, doctorName, oggi);
    
    const userPrompt = `Ecco i dati della cartella clinica:

${cartella}

Genera una relazione clinica professionale completa seguendo esattamente lo schema e lo stile indicato nel system prompt.`;

    console.log(`📝 Generazione relazione ${reportType}...`);
    
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
        max_tokens: 4000,
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
// PROMPT TEMPLATES
// ═══════════════════════════════════════════════════════════════

function getObstetricPrompt(header, doctorName, oggi) {
  return `Sei un assistente specializzato nella generazione di relazioni cliniche ostetriche professionali.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}

DATA DELLA VISITA:
${oggi}

ISTRUZIONI:
1. Analizza i dati forniti dalla cartella clinica
2. Genera una relazione narrativa completa in HTML
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
      [CAMPI ANAGRAFICA IN FORMATO PATIENT-FIELD]
    </div>
  </div>
  
  <h2>Anamnesi</h2>
  [PARAGRAFI NARRATIVI]
  
  <h2>Screening serologico e indagini</h2>
  [PARAGRAFI NARRATIVI]
  
  <h2>Monitoraggio ematochimico</h2>
  [TABELLA SE PRESENTE]
  
  <h2>Esami ecografici</h2>
  [NARRATIVA ECOGRAFICA]
  
  <h2>Valutazione clinica</h2>
  [ANALISI DETTAGLIATA CON SOTTOSEZIONI H3 PER OGNI PROBLEMA CLINICO]
  
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

REGOLE IMPORTANTI:
- Calcola le settimane gestazionali dalla U.M.
- Interpreta i dati clinici (es. SGA se percentile basso, problemi se flussi alterati, ecc.)
- Genera narrativa professionale e dettagliata
- Usa <strong> per enfatizzare termini clinici importanti
- Crea tabelle HTML per dati ematochimici con classe "report-table"
- Usa <h3> per sottosezioni della valutazione clinica
- Identifica fattori di rischio e commentali in dettaglio
- Non inventare dati: usa solo ciò che è fornito
- Restituisci SOLO l'HTML della relazione, niente altro`;
}

function getGynecologicPrompt(header, doctorName, oggi) {
  return `Sei un assistente specializzato nella generazione di relazioni cliniche ginecologiche professionali.

INTESTAZIONE DA UTILIZZARE:
Istituzione: ${header.institution}
${header.department ? `Dipartimento: ${header.department}` : ''}

FIRMA FINALE:
${doctorName}

DATA DELLA VISITA:
${oggi}

ISTRUZIONI:
1. Analizza i dati forniti dalla visita ginecologica
2. Genera una relazione narrativa completa in HTML
3. Usa esattamente questo formato HTML:

<div class="report">
  <div class="report-header">
    <div>
      <div class="report-institution">${header.institution}</div>
      ${header.department ? `<div class="report-department">${header.department}</div>` : ''}
    </div>
    <div class="report-date">Visita:<br><strong>${oggi}</strong></div>
  </div>
  
  <div class="report-title">Relazione Visita Ginecologica</div>
  <div class="report-subtitle">Visita Ambulatoriale</div>
  
  <div class="patient-card">
    <div class="patient-name">Paziente di [ETÀ] anni</div>
    <div class="patient-grid">
      [CAMPI RILEVANTI: età, U.M., parità, cicli, vaccinazioni, ecc.]
    </div>
  </div>
  
  <h2>Motivo della visita</h2>
  <p>[MOTIVO]</p>
  
  <h2>Anamnesi</h2>
  <p>[ANAMNESI GINECOLOGICA E NOTE ANAMNESTICHE]</p>
  
  <h2>Esame obiettivo ginecologico</h2>
  <h3>Ispezione e palpazione</h3>
  <p>[DESCRIZIONE DETTAGLIATA]</p>
  
  <h3>Esame speculare</h3>
  <p>[DESCRIZIONE CERVICE, LEUCORREA, ECC.]</p>
  
  <h3>Esame mammario</h3>
  <p>[SE PRESENTE]</p>
  
  <h2>Ecografia ginecologica (office)</h2>
  <p>Eseguita ecografia di supporto finalizzata alla ricerca di dati utili al completamento della visita:</p>
  <p>[DESCRIZIONE ENDOMETRIO, ANNESSI, DOUGLAS, ECC.]</p>
  
  <h2>Conclusioni e prescrizioni</h2>
  <p>[DIAGNOSI / IMPRESSIONE CLINICA]</p>
  <p><strong>Terapia prescritta:</strong> [ELENCO FARMACI / INDICAZIONI]</p>
  
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

REGOLE IMPORTANTI:
- Mantieni tono professionale ma leggibile
- Organizza i reperti in modo logico e sistematico
- Interpreta i dati clinici forniti
- Usa <strong> per enfatizzare termini clinici importanti
- Non inventare dati: usa solo ciò che è fornito
- Se PAP test eseguito, menzionarlo
- Se terapia prescritta, elencarla chiaramente
- Restituisci SOLO l'HTML della relazione, niente altro`;
}
