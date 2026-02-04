# 🚀 Deploy su VERCEL - Guida Rapida

## ✨ Perché Vercel?

- ✅ **Timeout 60 secondi** (vs 10 di Netlify)
- ✅ **Completamente GRATUITO**
- ✅ **Relazioni COMPLETE** senza truncamenti
- ✅ **Deploy semplicissimo** (drag & drop o GitHub)

---

## 📦 Deploy in 3 PASSI (5 minuti)

### **PASSO 1: Crea account Vercel**

1. Vai su https://vercel.com/
2. Clicca **"Sign Up"**
3. Registrati con GitHub (consigliato) o email
4. ✅ Account creato!

---

### **PASSO 2: Deploy**

#### **Metodo A: Drag & Drop** (più facile)

1. Vai su https://vercel.com/new
2. **Trascina** la cartella estratta dallo ZIP
3. Clicca **"Deploy"**
4. Attendi 30 secondi...
5. ✅ Ti verrà assegnato un URL tipo: `https://tuo-progetto.vercel.app`

#### **Metodo B: GitHub** (più professionale)

1. Crea un repository GitHub con i file
2. Su Vercel: Clicca **"Import Project"**
3. Seleziona il repository
4. Clicca **"Deploy"**
5. ✅ Fatto! Deploy automatico ad ogni push

---

### **PASSO 3: Configura API Key**

**IMPORTANTE:** Devi configurare la tua API Key Claude!

1. Sul dashboard Vercel del tuo progetto
2. Vai su **"Settings"** → **"Environment Variables"**
3. Aggiungi una nuova variabile:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** La tua API key `sk-ant-api03-...`
   - **Environment:** Seleziona tutti (Production, Preview, Development)
4. Clicca **"Save"**
5. Torna su **"Deployments"** e clicca **"Redeploy"** sull'ultimo deploy
6. ✅ API Key configurata!

---

## 🧪 TEST

1. Vai sul tuo URL Vercel: `https://tuo-progetto.vercel.app`
2. Clicca **"Esempio Ostetrico"**
3. Clicca **"Genera Relazione"**
4. Attendi 10-15 secondi
5. ✅ **Relazione COMPLETA generata!**

---

## 🎯 Vantaggi vs Netlify

| Caratteristica | Netlify Free | Vercel Free |
|---|---|---|
| **Timeout** | 10 secondi ❌ | 60 secondi ✅ |
| **Relazioni complete** | No (troncate) | Sì ✅ |
| **Costo** | Gratis | Gratis |
| **Deploy** | Drag & drop | Drag & drop |
| **GitHub CI/CD** | Sì | Sì |

---

## 📝 Struttura File

```
relazioni-vercel/
├── api/
│   └── generate.js      ← Serverless function
├── index.html           ← App frontend
├── vercel.json          ← Configurazione Vercel
├── package.json         ← Dipendenze
└── GUIDA_VERCEL.md      ← Questo file
```

---

## 🔧 Troubleshooting

### **"API Key non configurata"**
→ Vai su Settings → Environment Variables
→ Aggiungi `ANTHROPIC_API_KEY`
→ Redeploy il progetto

### **"Cannot find module 'node-fetch'"**
→ Vercel installa automaticamente le dipendenze da package.json
→ Se l'errore persiste, aggiungi `package.json` al deploy

### **Ancora timeout 504**
→ Molto raro su Vercel con 60 secondi
→ Controlla che l'API key Anthropic sia valida
→ Verifica il credito su console.anthropic.com

---

## 💰 Costi

### **Vercel (Hosting):**
- ✅ **GRATUITO** per sempre
- 100 GB bandwidth/mese
- 100 ore serverless/mese
- Deploy illimitati

### **Claude API:**
- **$0.01-0.03** per relazione
- Stima: 100 relazioni/mese = **$1-3/mese**

**Totale:** ~**$1-3/mese** (solo API Claude)

---

## ✅ Checklist

- [ ] Account Vercel creato
- [ ] Deploy effettuato
- [ ] API Key configurata in Environment Variables
- [ ] Redeploy fatto dopo configurazione
- [ ] Test: relazione completa generata senza timeout
- [ ] URL salvato nei preferiti

---

## 🎉 Fatto!

Ora hai un'app **completamente funzionale** che genera **relazioni complete** senza limiti di timeout!

**URL dell'app:** `https://tuo-progetto.vercel.app`

---

**Versione:** 1.0  
**Deploy target:** Vercel  
**Max tokens:** 4000 (relazioni complete)  
**Timeout:** 60 secondi  
**Costo:** Gratis
