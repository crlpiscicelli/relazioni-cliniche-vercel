// ═══════════════════════════════════════════════════════════════
// VERCEL SERVERLESS FUNCTION - Genera Relazioni Cliniche v4
// Nuove funzionalità: EG automatica, Regolo ostetrico, Counseling
// ═══════════════════════════════════════════════════════════════

const fetch = require('node-fetch');

module.exports = async (req, res) => {
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const {
      cartella, reportType, reportFormat, header,
      doctorName, doctorQualifica, oggi,
      tipoAccesso, tipoIntervento, problematiche, surgicalFormat,
      counselingTopics, customCounseling, etaGestazionale,
      mode
    } = req.body;
    
    const API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'API Key non configurata.' });
    if (!cartella && reportType !== 'surgical') return res.status(400).json({ error: 'Dati cartella mancanti' });
    
    // ── CLINICAL ADVISORY MODE ──────────────────────────────────
    if (mode === 'clinical_advisory') {
      const systemPrompt = getClinicalAdvisoryPrompt(reportType);
      const userPrompt = `Ecco i dati clinici della paziente:\n\n${cartella}\n\nRestituisci SOLO il JSON richiesto, nessun testo aggiuntivo, nessun blocco markdown.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2500, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })
      });
      const result = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: result.error?.message || 'Errore API' });
      let raw = result.content[0].text.trim().replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```$/,'').trim();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch(e) {
        // Try to salvage truncated JSON: extract sections between first { and last complete }
        const match = raw.match(/\{[\s\S]*/);
        if (match) {
          // Close any unterminated string and object
          let salvage = match[0];
          // Remove trailing incomplete key/value
          salvage = salvage.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
          // Close arrays and objects as needed
          const opens = (salvage.match(/\[/g)||[]).length - (salvage.match(/\]/g)||[]).length;
          const objs  = (salvage.match(/\{/g)||[]).length - (salvage.match(/\}/g)||[]).length;
          salvage += ']'.repeat(Math.max(0,opens)) + '}'.repeat(Math.max(0,objs));
          try { parsed = JSON.parse(salvage); } catch(e2) {
            // Last resort: wrap whatever HTML we got
            const secMatch = raw.match(/"sections"\s*:\s*"([\s\S]+?)(?:"\s*,\s*"questions"|"\s*\})/);
            parsed = { sections: secMatch ? secMatch[1].replace(/\\n/g,'\n').replace(/\\"/g,'"') : raw, questions: [] };
          }
        } else {
          parsed = { sections: raw, questions: [] };
        }
      }
      const { input_tokens: inputTokens, output_tokens: outputTokens } = result.usage;
      const cost = ((inputTokens * 0.000003) + (outputTokens * 0.000015)).toFixed(5);
      return res.status(200).json({ json: parsed, usage: { inputTokens, outputTokens, cost } });
    }

    // ── CLINICAL ADVISORY UPDATE MODE ───────────────────────────
    if (mode === 'clinical_advisory_update') {
      const { qaContext } = req.body;
      const systemPrompt = getClinicalAdvisoryUpdatePrompt(reportType);
      const userPrompt = `DATI CLINICI ORIGINALI:\n${cartella}\n\nRISPOSTE DEL MEDICO ALLE DOMANDE DI APPROFONDIMENTO:\n${qaContext}\n\nRestituisci SOLO il JSON con il campo "sections" aggiornato. Nessun testo aggiuntivo.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2500, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })
      });
      const result = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: result.error?.message || 'Errore API' });
      let raw = result.content[0].text.trim().replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```$/,'').trim();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch(e) {
        const secMatch = raw.match(/"sections"\s*:\s*"([\s\S]+?)(?:"\s*\}|$)/);
        parsed = { sections: secMatch ? secMatch[1].replace(/\\n/g,'\n').replace(/\\"/g,'"') : raw };
      }
      const { input_tokens: inputTokens, output_tokens: outputTokens } = result.usage;
      const cost = ((inputTokens * 0.000003) + (outputTokens * 0.000015)).toFixed(5);
      return res.status(200).json({ json: parsed, usage: { inputTokens, outputTokens, cost } });
    }

    const format = reportFormat || 'complete';
    let systemPrompt, userPrompt;

    if (reportType === 'surgical') {
      systemPrompt = getSurgicalReportPrompt(header, doctorName, doctorQualifica, oggi, tipoAccesso, tipoIntervento, problematiche, surgicalFormat);
      userPrompt = `Ecco i dati dell'intervento da registrare:\n\n${cartella || '(nessun dato aggiuntivo)'}\n\nGenera il verbale operatorio completo seguendo esattamente lo schema e lo stile indicato nel system prompt.`;
    } else if (reportType === 'obstetric') {
      systemPrompt = format === 'brief'
        ? getBriefObstetricPrompt(header, doctorName, doctorQualifica, oggi)
        : getCompleteObstetricPrompt(header, doctorName, doctorQualifica, oggi);
      
      // Aggiungi EG calcolata e counseling al prompt
      let extra = '';
      if (etaGestazionale) extra += `\n\n⚕️ ETÀ GESTAZIONALE CALCOLATA: ${etaGestazionale} (usa questo valore nel sottotitolo e nella relazione — non ricalcolare).`;
      
      // Counseling da pacchetti
      if (counselingTopics && counselingTopics.length > 0) {
        extra += `\n\n📋 ARGOMENTI DI COUNSELING DA INCLUDERE (tono neutro-informativo, integra narrativamente):\n${counselingTopics.map(t => `- ${t}`).join('\n')}\nIntegra questi argomenti in modo fluido nella sezione appropriata — non come elenco separato.`;
      }
      
      // Counseling personalizzato con tono/modalità/taglio
      if (customCounseling && customCounseling.length > 0) {
        const TONE_LABELS = {
          'rassicurante':  'RASSICURANTE (riduci ansia, sottolinea sicurezza e normalità)',
          'informativo':   'INFORMATIVO-NEUTRO (dati oggettivi, stile divulgativo)',
          'direttivo':     'DIRETTIVO (istruzioni precise, cosa fare e cosa evitare)',
          'empatico':      'EMPATICO (riconosci preoccupazioni, approccio emotivo)',
          'urgente':       'URGENTE (sottolinea importanza clinica, invita all\'azione immediata)',
          'linee-guida':   'BASATO SU LINEE GUIDA (cita raccomandazioni ufficiali)',
        };
        const MODALITY_LABELS = {
          'accenno':    'Breve accenno (2-3 righe integrate nel flusso narrativo)',
          'approfondito': 'Paragrafo approfondito',
          'followup':   'Con raccomandazione esplicita di follow-up o esame',
          'domande':    'Con invito esplicito della paziente a fare domande',
        };
        extra += `\n\n✏️ ARGOMENTI PERSONALIZZATI — rispetta scrupolosamente tono e modalità indicati:`;
        customCounseling.forEach((ct, i) => {
          extra += `\n\n[Argomento ${i+1}] "${ct.topic}"`;
          extra += `\n  → Tono: ${TONE_LABELS[ct.tone] || ct.tone}`;
          extra += `\n  → Modalità: ${MODALITY_LABELS[ct.modality] || ct.modality}`;
          if (ct.angle) extra += `\n  → Taglio speciale: ${ct.angle}`;
        });
      }
      
      userPrompt = `Ecco i dati della cartella clinica:\n\n${cartella}${extra}\n\nGenera una relazione clinica professionale ${format === 'brief' ? 'SINTETICA in forma narrativa' : 'completa'} seguendo esattamente lo schema e lo stile indicato nel system prompt.`;
    } else {
      systemPrompt = format === 'brief'
        ? getBriefGynecologicPrompt(header, doctorName, doctorQualifica, oggi)
        : getCompleteGynecologicPrompt(header, doctorName, doctorQualifica, oggi);
      
      // Counseling anche per ginecologica
      let gynExtra = '';
      if (counselingTopics && counselingTopics.length > 0) {
        gynExtra += `\n\n📋 ARGOMENTI DI COUNSELING DA INCLUDERE:\n${counselingTopics.map(t => `- ${t}`).join('\n')}\nIntegra questi argomenti narrativamente nelle sezioni appropriate.`;
      }
      if (customCounseling && customCounseling.length > 0) {
        const TONE_LABELS = { 'rassicurante':'RASSICURANTE','informativo':'INFORMATIVO-NEUTRO','direttivo':'DIRETTIVO','empatico':'EMPATICO','urgente':'URGENTE','linee-guida':'BASATO SU LINEE GUIDA' };
        const MODALITY_LABELS = { 'accenno':'Breve accenno (2-3 righe)','approfondito':'Paragrafo approfondito','followup':'Con raccomandazione di follow-up','domande':'Con invito a fare domande' };
        gynExtra += `\n\n✏️ ARGOMENTI PERSONALIZZATI:`;
        customCounseling.forEach((ct, i) => {
          gynExtra += `\n[${i+1}] "${ct.topic}" → Tono: ${TONE_LABELS[ct.tone]||ct.tone} → Modalità: ${MODALITY_LABELS[ct.modality]||ct.modality}${ct.angle ? ' → Taglio: '+ct.angle : ''}`;
        });
      }
      userPrompt = `Ecco i dati della cartella clinica:\n\n${cartella}${gynExtra}\n\nGenera una relazione clinica professionale ${format === 'brief' ? 'SINTETICA in forma narrativa' : 'completa'} seguendo esattamente lo schema e lo stile indicato nel system prompt.`;
    }

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
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.error?.message || 'Errore API Claude' });
    }
    
    const data = await response.json();
    const html = data.content[0].text;
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    const cost = ((inputTokens * 0.003 + outputTokens * 0.015) / 1000).toFixed(4);
    
    return res.status(200).json({ html, usage: { inputTokens, outputTokens, cost } });
    
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Errore interno' });
  }
};

// ═══════════════════════════════════════════════════════════════
// PROMPT TEMPLATES
// ═══════════════════════════════════════════════════════════════

function getCompleteObstetricPrompt(header, doctorName, doctorQualifica, oggi) {
  return `Sei un assistente specializzato nella generazione di relazioni cliniche ostetriche professionali COMPLETE E DETTAGLIATE.

INTESTAZIONE: ${header.institution}${header.department ? '\nDipartimento: ' + header.department : ''}
FIRMA: ${doctorName}${doctorQualifica ? '\n' + doctorQualifica : ''}
DATA: ${oggi}

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
    <div class="patient-grid">[CAMPI ANAGRAFICA]</div>
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
  [PIANO DETTAGLIATO — include counseling se specificato]
  
  <div class="signature-block">
    <div>
      <div class="signature-line" style="width: 260px;"></div>
      <div class="signature-label">Firma del Medico Responsabile<br>${doctorName}${doctorQualifica ? '<br><span style="font-size:8pt;font-weight:400">' + doctorQualifica.replace(/\n/g, '<br>') + '</span>' : ''}</div>
    </div>
    <div style="text-align: right;">
      <div class="signature-line" style="width: 160px;"></div>
      <div class="signature-label">Data: ${oggi}</div>
    </div>
  </div>
</div>

REGOLE:
- Se fornita l'età gestazionale calcolata, usala nel sottotitolo e nella relazione
- Interpreta i dati clinici e genera narrativa professionale DETTAGLIATA
- Usa <strong> per termini importanti
- Crea tabelle HTML per dati ematochimici
- Usa <h3> per sottosezioni
- Non inventare dati
- Restituisci SOLO l'HTML`;
}

function getCompleteGynecologicPrompt(header, doctorName, doctorQualifica, oggi) {
  return `Sei un assistente specializzato nella generazione di relazioni cliniche ginecologiche professionali COMPLETE per un ginecologo ambulatoriale.

INTESTAZIONE: ${header.institution}${header.department ? '\nDipartimento: ' + header.department : ''}
FIRMA: ${doctorName}${doctorQualifica ? '\n' + doctorQualifica : ''}
DATA: ${oggi}

═══ REGOLE CRITICHE ═══
1. NON usare MAI la frase "orientata nel tempo e nello spazio" — è inappropriata in contesto ambulatoriale ginecologico. Omettila sempre.
2. NON inventare dati non presenti nella cartella. Se un dato manca, ometti la sezione o scrivi "non riferita".
3. Usa linguaggio medico preciso, narrativo, professionale.
4. Restituisci SOLO l'HTML — nessun testo fuori dal blocco <div class="report">.

═══ RILEVAMENTO STILE DI VITA (applica automaticamente se presenti nei dati) ═══
- BMI > 25 oppure sovrappeso/obesità evidente: nella sezione "Piano e prescrizioni" aggiungi raccomandazione al raggiungimento del peso forma, con riferimento al rischio ginecologico/oncologico (endometrio, PCOS, fertilità, outcome chirurgico).
- Fumo di sigaretta: nella sezione "Piano e prescrizioni" aggiungi raccomandazione alla cessazione con menzione del rischio oncologico cervicale e cardiovascolare.
- Sigaretta elettronica / vaping: stessa sezione, sottolinea che non equivale alla cessazione dal fumo e che i rischi a lungo termine non sono eliminati.
- Sedentarietà marcata o riferita: breve cenno all'attività fisica regolare.

═══ STRUTTURA HTML ═══
<div class="report">
  <div class="report-header">
    <div>
      <div class="report-institution">${header.institution}</div>
      ${header.department ? `<div class="report-department">${header.department}</div>` : ''}
    </div>
    <div class="report-date">Visita:<br><strong>${oggi}</strong></div>
  </div>

  <div class="report-title">Relazione Clinica</div>
  <div class="report-subtitle">Visita Ginecologica Ambulatoriale</div>

  <div class="patient-card">
    <div class="patient-name">[Sig.ra NOME se presente, altrimenti ometti il campo nome]</div>
    <div class="patient-grid">
      [campo "Età", campo "Ultima mestruazione" se presente, campo "Parità" se presente]
    </div>
  </div>

  <h2>Anamnesi</h2>
  <p>[Anamnesi fisiologica essenziale: cicli, menarca, menopausa se pertinente. Solo dati presenti.]</p>
  <p>[Anamnesi ostetrica se fornita: parità, modalità del parto, complicanze.]</p>
  <p>[Anamnesi patologica remota: patologie, interventi chirurgici precedenti, farmaci abituali, allergie.]</p>
  <p>[Anamnesi familiare se fornita: familiarità oncologica o rilevante.]</p>

  <h2>Motivo della visita</h2>
  <p>[Motivo dichiarato — controllo periodico, sintomo riferito, follow-up, ecc.]</p>

  <h2>Esame ginecologico</h2>
  <h3>Esame bimanuale</h3>
  <p>[Volume e consistenza uterina, mobilità, annessi, eventuale dolore provocato. Se non forniti dati specifici: descrivi quanto presente.]</p>
  <h3>Esame speculare</h3>
  <p>[Cervice, colpo, mucosa vaginale, secrezioni, lesioni visibili, prelievi eseguiti (PAP test, tampone, HPV test).]</p>

  [SOLO SE SONO STATI ESEGUITI DATI ECOGRAFICI — ometti completamente questa sezione se assente:]
  <h2>Ecografia ginecologica (office)</h2>
  <p>[Utero: dimensioni, morfologia, miometrio, endometrio (spessore in mm, omogeneità). Ovaie: dimensioni, morfologia, eventuale patologia. Douglas. Altro.]</p>

  [SOLO SE ESEGUITA MAMMELLA — ometti se assente:]
  <h2>Esame mammario</h2>
  <p>[Ispezione, palpazione, noduli, secrezione, asimmetrie.]</p>

  <h2>Conclusioni</h2>
  <p>[Sintesi diagnostica. Se visita di controllo senza reperti patologici: formulazione positiva es. "La visita ginecologica non ha evidenziato alterazioni di rilievo rispetto ai controlli precedenti." Eventuali diagnosi codificate.]</p>
  [Se rilevato stile di vita a rischio: raccomandazioni appropriate qui o nella sezione Piano]

  <h2>Piano e prescrizioni</h2>
  <p>[Esami richiesti, procedure programmate, terapia eventuale, follow-up raccomandato, consigli igienico-sanitari rilevanti. Includi esplicitamente le prescrizioni aggiuntive se specificate nel prompt.]</p>

  <div class="signature-block">
    <div>
      <div class="signature-line" style="width: 260px;"></div>
      <div class="signature-label">Firma del Medico Responsabile<br>${doctorName}${doctorQualifica ? '<br><span style="font-size:8pt;font-weight:400">' + doctorQualifica.replace(/\n/g, '<br>') + '</span>' : ''}</div>
    </div>
    <div style="text-align: right;">
      <div class="signature-line" style="width: 160px;"></div>
      <div class="signature-label">Data: ${oggi}</div>
    </div>
  </div>
</div>

Restituisci SOLO l'HTML.`;
}

function getBriefObstetricPrompt(header, doctorName, doctorQualifica, oggi) {
  return `Sei un assistente specializzato nella generazione di NOTE CLINICHE SINTETICHE per database ospedaliero.

INTESTAZIONE: ${header.institution}${header.department ? '\nDipartimento: ' + header.department : ''}
FIRMA: ${doctorName}${doctorQualifica ? '\n' + doctorQualifica : ''}
DATA: ${oggi}

FORMATO: NOTA CLINICA SINTETICA (~300-400 parole)

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
  <p><strong>Anamnesi rilevante:</strong> [gruppo, allergie, familiarità, fumo, IMC, patologie, interventi, farmaci].</p>
  <p><strong>Screening e profilassi:</strong> [rosolia, toxo, CMV, screening genetici, tiroide, diabete, terapie].</p>
  <p><strong>Decorso gravidico:</strong> [ultimi esami ematochimici rilevanti, senza tabelle].</p>
  <p><strong>Valutazione ecografica:</strong> [crescita fetale, percentile, doppler, LA, placenta, presentazione].</p>
  <p><strong>Conclusioni:</strong> [Diagnosi/problemi]. [Piano e counseling se specificato].</p>
  
  <div class="signature-block">
    <div>
      <div class="signature-line" style="width: 260px;"></div>
      <div class="signature-label">${doctorName}${doctorQualifica ? '<br><span style="font-size:8pt;font-weight:400">' + doctorQualifica.replace(/\n/g, '<br>') + '</span>' : ''}</div>
    </div>
  </div>
</div>

REGOLE:
- Se fornita EG calcolata, usala nel sottotitolo
- LUNGHEZZA: 300-400 parole
- Solo paragrafi narrativi, NO liste, NO tabelle
- Se forniti argomenti di counseling, integrali naturalmente nelle Conclusioni
- Restituisci SOLO l'HTML`;
}

function getBriefGynecologicPrompt(header, doctorName, doctorQualifica, oggi) {
  return `Sei un assistente specializzato nella generazione di NOTE CLINICHE SINTETICHE ginecologiche per database ambulatoriale.

INTESTAZIONE: ${header.institution}${header.department ? '\nDipartimento: ' + header.department : ''}
FIRMA: ${doctorName}${doctorQualifica ? '\n' + doctorQualifica : ''}
DATA: ${oggi}

REGOLE CRITICHE:
- NON usare MAI "orientata nel tempo e nello spazio" — è una frase psichiatrica/neurologica, del tutto inappropriata in ambulatorio ginecologico.
- LUNGHEZZA: 250-350 parole. Solo paragrafi narrativi. NO liste. NO tabelle. NO sezioni H2.
- NON inventare dati assenti nella cartella.
- Se BMI > 25 o sovrappeso: raccomandazione al peso forma nelle Conclusioni.
- Se fumo o sigaretta elettronica: raccomandazione alla cessazione nelle Conclusioni.

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
  <div class="report-subtitle">Visita Ginecologica</div>

  <p><strong>Paziente:</strong> [Sig.ra X se nome presente,] [età] anni[, parità se fornita][, UM se fornita].</p>
  <p><strong>Anamnesi:</strong> [Dati anamnestici rilevanti presenti — familiarità, patologie, farmaci, allergie, cicli.]</p>
  <p><strong>Motivo della visita:</strong> [Motivo].</p>
  <p><strong>Esame ginecologico:</strong> [Bimanuale + speculare condensati; ecografia office se eseguita — tutto in un paragrafo fluido.]</p>
  <p><strong>Conclusioni e piano:</strong> [Valutazione diagnostica. Prescrizioni esplicite incluse. Raccomandazioni stile di vita se pertinenti. Follow-up.]</p>

  <div class="signature-block">
    <div>
      <div class="signature-line" style="width: 260px;"></div>
      <div class="signature-label">${doctorName}${doctorQualifica ? '<br><span style="font-size:8pt;font-weight:400">' + doctorQualifica.replace(/\n/g, '<br>') + '</span>' : ''}</div>
    </div>
  </div>
</div>

Restituisci SOLO l'HTML.`;
}

function getSurgicalReportPrompt(header, doctorName, doctorQualifica, oggi, tipoAccesso, tipoIntervento, problematiche, surgicalFormat) {
  const accessiList = (tipoAccesso || 'isteroscopico').split(' + ').map(s => s.trim()).filter(Boolean);
  const interventoLabel = tipoIntervento || '';
  const prob = problematiche ? `\nProblematiche aggiuntive / note: ${problematiche}` : '';
  const isMultiAccesso = accessiList.length > 1;
  const isBrief = surgicalFormat === 'brief';

  const tecnicheStandard = {
    isteroscopico: `
TECNICA ISTEROSCOPIA OPERATIVA:
- Posizionamento: litotomica dorsale, glutei al bordo del letto
- Preparazione: disinfezione genitali esterni e vagina; teli sterili fenestrati; svuotamento vescicale
- Esposizione: speculum bivalve; presa labbro anteriore cervice con tenaculum a un dente
- Dilatazione: dilatatori di Hegar progressivi fino al calibro necessario
- Introduzione strumento: inserimento resettore/isteroscopio operativo sotto controllo visivo
- Distensione: mezzo di distensione con pompa a pressione controllata (60-80 mmHg); monitoraggio bilancio idrico
- Panoramica: esplorazione sistematica cavità uterina
- Fase operativa: [IN BASE AI DATI]
- Emostasi: verifica al sito operatorio
- Fine procedura: rimozione strumento sotto visione`,

    laparoscopico: `
TECNICA LAPAROSCOPIA GINECOLOGICA:
- Posizionamento: Trendelenburg 15-20°, leggera litotomica; catetere Foley; manipolatore uterino ove indicato
- Accesso peritoneale: incisione ombelicale ~12 mm; ago di Veress; insufflazione CO₂ fino a 12-15 mmHg; trocar ombelicale 10/12 mm
- Panoramica: esplorazione cavo addominale e pelvico
- Trocars accessori: 5 mm in fossa iliaca dx e sx ± sovrapubico
- Fase operativa: [IN BASE AI DATI]
- Lavaggio: abbondante lavaggio cavo pelvico
- Emostasi: verifica accurata tutti i siti
- Chiusura: desufflazione; sutura fasciale ombelicale; sutura cutanea`,

    laparotomico: `
TECNICA LAPAROTOMIA GINECOLOGICA:
- Posizionamento: decubito supino; catetere Foley
- Incisione: Pfannenstiel / mediana infraombelicale
- Apertura strati: sottocutaneo; fascia; separazione retti; peritoneo parietale
- Esplorazione: manuale del cavo addominale e pelvico
- Fase operativa: [IN BASE AI DATI]
- Emostasi: elettrocoagulazione / punti emostatici
- Chiusura: peritoneo; fascia; cute`,

    vaginale: `
TECNICA CHIRURGIA VAGINALE:
- Posizionamento: litotomica dorsale; catetere Foley; speculum posteriore di Auvard
- Esposizione: trazione cervice; esposizione pareti vaginali
- Fase operativa: [IN BASE AI DATI]
- Emostasi: punti in riassorbibile / bipolare
- Chiusura: sutura piani vaginali`,

    'vulvare/perineale': `
TECNICA CHIRURGIA VULVO-PERINEALE:
- Posizionamento: litotomica dorsale
- Preparazione: disinfezione genitali esterni; teli sterili
- Fase operativa: [IN BASE AI DATI]
- Emostasi: punti emostatici / bipolare
- Chiusura: sutura per piani`,

    ostetrico: `
TECNICA OSTETRICA:
- Posizionamento: supino con cuneo sotto anca dx (TC) o litotomica (cerchiaggio/revisione); catetere Foley
- Accesso: Pfannenstiel (TC) / vaginale (cerchiaggio, revisione)
- Fase operativa: [IN BASE AI DATI]
- Chiusura: isterorrafia in due strati (TC); sutura parete; cute`
  };

  let tecnicheAssemblate = '';
  if (isMultiAccesso) {
    tecnicheAssemblate = `INTERVENTO COMBINATO: ${accessiList.join(' + ').toUpperCase()}\n\n`;
    accessiList.forEach(acc => { if (tecnicheStandard[acc]) tecnicheAssemblate += tecnicheStandard[acc] + '\n\n'; });
  } else {
    tecnicheAssemblate = tecnicheStandard[accessiList[0]] || tecnicheStandard['isteroscopico'];
  }

  const accessoLabel = accessiList.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(' + ');

  return `Sei un ginecologo chirurgo esperto. Genera la DESCRIZIONE DELL'INTERVENTO per il registro operatorio.

CONTESTO:
- Via/e di accesso: ${accessoLabel}
- Patologia/intervento: ${interventoLabel || '(vedi dati)'}${prob}
- Data: ${oggi}
- Formato: ${isBrief ? 'SINTETICO' : 'DETTAGLIATO'}

BASE TECNICA STANDARD:
${tecnicheAssemblate}

REGOLA CLINICA: I dettagli morfologici guidano attivamente la tecnica chirurgica (dimensioni, superficie, mobilità, aderenze, sede, contenuto).

${isBrief
  ? 'FORMATO SINTETICO: Un unico paragrafo continuo (8-10 righe), nessun H3, verbi al passato, registro operatorio italiano ufficiale.'
  : 'FORMATO DETTAGLIATO: Sezioni H3 (posizionamento, accesso, reperti, tecnica, emostasi, chiusura, decorso, campioni istologici). Nessun placeholder.'}

OUTPUT:
<div class="report">
  <div class="alert alert-info"><strong>ℹ️ Testo da copiare nel registro operatorio</strong> — Dati paziente, equipe e anestesia sono già nel registro.</div>
${isBrief
  ? '  <p style="line-height:1.8;">[TESTO CONTINUO]</p>'
  : `  <h3>Posizionamento e preparazione</h3><p>[...]</p>
  <h3>Accesso chirurgico</h3><p>[...]</p>
  <h3>Reperti intraoperatori</h3><p>[...]</p>
  <h3>Tecnica operatoria</h3><p>[...]</p>
  <h3>Emostasi e controllo</h3><p>[...]</p>
  <h3>Chiusura</h3><p>[...]</p>
  <h3>Decorso intraoperatorio</h3><p>[...]</p>
  <h3>Campioni istologici</h3><p>[...]</p>`}
</div>

Restituisci SOLO l'HTML.`;
}


// ═══════════════════════════════════════════════════════════════
// CLINICAL ADVISORY PROMPTS
// ═══════════════════════════════════════════════════════════════
function getClinicalAdvisoryPrompt(reportType) {
  const ctx = reportType === 'obstetric' ? 'ostetrica (gestante/puerpera)' : 'ginecologica ambulatoriale';
  return `Sei un consulente clinico senior in OB/GYN. Ricevi dati di una paziente ${ctx}.

Restituisci SOLO JSON valido (nessun markdown, nessun testo esterno):
{
  "sections": "<stringa HTML con 6 sezioni advisory>",
  "questions": [{"q":"domanda","options":["A","B","C","D"]}, ...]
}

REGOLE SECTIONS:
- 6 sezioni con questa struttura HTML esatta (usa \\n per le newline nel JSON):
  <div class="advisory-section"><div class="advisory-section-title">EMOJI Titolo</div><div class="advisory-section-body"><ul><li>punto</li></ul></div></div>
- Titoli fissi: "📋 Sintesi", "⚠️ Elementi di attenzione", "🔬 Suggerimenti diagnostici", "💊 Opzioni terapeutiche", "📅 Follow-up", "❓ Info mancanti"
- Ultima sezione: sostituisci <ul> con <p class="advisory-disclaimer">⚕️ Valutazione AI a supporto del medico. Non è diagnosi. La responsabilità clinica è del professionista.</p>
- Max 4 <li> per sezione. Sii conciso. Parla al medico ("si valuti", "si consideri").
- NON ripetere i dati anamnestici. NON dare diagnosi definitive.

REGOLE QUESTIONS:
- 2-3 domande SOLO su dati assenti nei dati forniti, clinicamente rilevanti per questo caso.
- 3-4 opzioni mutuamente esclusive e clinicamente sensate.
- Esempio: {"q":"HPV test precedente?","options":["Mai eseguito","Negativo <3 anni","Negativo >3 anni","Positivo"]}

JSON VALIDO: escapa le virgolette interne con \\", usa \\n per newline nelle stringhe HTML.`;
}
function getClinicalAdvisoryUpdatePrompt(reportType) {
  const ctx = reportType === 'obstetric' ? 'ostetrica' : 'ginecologica';
  return `Sei un consulente clinico senior in Ostetricia e Ginecologia.
Riceverai: dati clinici originali di una paziente ${ctx} + risposte del medico a domande di approfondimento.

COMPITO: restituire un oggetto JSON con un solo campo:
"sections": stringa HTML con la valutazione clinica AGGIORNATA (stesse 6 sezioni), integrata con le nuove informazioni fornite dalle risposte.

REGOLE:
- Integra le risposte nel ragionamento senza ripeterle letteralmente.
- Aggiorna TUTTE le sezioni che risultano influenzate dalle nuove informazioni.
- Mantieni la stessa struttura HTML delle 6 sezioni + advisory-disclaimer finale.
- Restituisci SOLO JSON valido, nessun testo fuori dal JSON, nessun blocco markdown.
- NON generare nuove domande — solo le sezioni aggiornate.

Usa la stessa struttura HTML della valutazione precedente (advisory-section, advisory-section-title, advisory-section-body, advisory-disclaimer).`;
}
