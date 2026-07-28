const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase-Zugangsdaten (In Produktion über Umgebungsvariablen setzen)
const SUPABASE_URL = process.env.SUPABASE_URL || 'DEINE_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'DEIN_SUPABASE_ANON_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// TELEGRAM BOT INTEGRATION
// ==========================================

// Hilfsfunktion: Antwort-Nachricht zurück an Telegram senden
async function sendTelegramMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
    } catch (err) {
        console.error("Fehler beim Senden der Telegram-Nachricht:", err.message);
    }
}

// Webhook-Endpunkt für eingehende Telegram-Nachrichten
app.post('/api/telegram-webhook', async (req, res) => {
    const update = req.body;

    // Nur auf Textnachrichten reagieren
    if (update.message && update.message.text) {
        const text = update.message.text;
        const chatId = update.message.chat.id;
        const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;

        // Sicherheitsprüfung: Nur Nachrichten von deiner erlaubten Chat-ID verarbeiten
        if (allowedChatId && String(chatId) !== String(allowedChatId)) {
            console.log(`Unbefugter Zugriff von Chat-ID: ${chatId}`);
            return res.sendStatus(200); // 200 an Telegram senden, um weitere Versuche zu stoppen
        }

        try {
            // Titel aus der ersten Zeile generieren (maximal 40 Zeichen)
            const firstLine = text.split('\n')[0];
            const title = firstLine.length > 40 ? firstLine.substring(0, 40) + '...' : firstLine;

            // Eintrag in Supabase speichern (Kategorie 1 = Inbox/Pläne)
            const { error } = await supabase
                .from('items')
                .insert([{
                    title: title,
                    content: text,
                    category_id: 1
                }]);

            if (error) throw error;

            // Erfolgsbestätigung an Telegram senden
            await sendTelegramMessage(chatId, "📥 Erfolgreich im LifeBot gespeichert!");
        } catch (err) {
            console.error("Fehler im Telegram-Webhook:", err.message);
            await sendTelegramMessage(chatId, "❌ Fehler beim Speichern im LifeBot.");
        }
    }

    // Telegram erwartet als Bestätigung immer ein Status 200 OK
    res.sendStatus(200);
});

// ==========================================
// REST API ENDPUNKTE (Frontend / Dashboard)
// ==========================================

// API-Endpunkt: Neuen Eintrag speichern (Create)
app.post('/api/items', async (req, res) => {
    const { title, content, category_id } = req.body;

    try {
        const { data, error } = await supabase
            .from('items')
            .insert([{
                title: title !== undefined ? String(title) : '',
                content: content !== undefined ? String(content) : '',
                category_id: category_id ? Number(category_id) : null
            }])
            .select();

        if (error) throw error;

        res.status(201).json({ id: data[0].id, success: true });
    } catch (err) {
        console.error("Fehler bei POST /api/items:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// API-Endpunkt: Alle Einträge abrufen (Read mit JOIN)
app.get('/api/items', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('items')
            .select(`
                *,
                categories ( name )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Das Resultat so umformen, wie das Frontend es erwartet
        const formattedData = data.map(item => ({
            ...item,
            category_name: item.categories ? item.categories.name : 'Unbekannt'
        }));

        res.json(formattedData);
    } catch (err) {
        console.error("Fehler bei GET /api/items:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// API-Endpunkt: Eintrag aktualisieren (Update)
app.put('/api/items/:id', async (req, res) => {
    const { id } = req.params;
    const { title, content, category_id } = req.body;

    try {
        // Objekt dynamisch aufbauen – nur übergeben, was auch mitgeschickt wurde
        const updateData = {
            updated_at: new Date().toISOString()
        };

        if (title !== undefined) updateData.title = String(title);
        if (content !== undefined) updateData.content = String(content);
        if (category_id !== undefined) updateData.category_id = Number(category_id);

        const { error } = await supabase
            .from('items')
            .update(updateData)
            .eq('id', Number(id));

        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        console.error("Fehler bei PUT /api/items:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// API-Endpunkt: Eintrag löschen (Delete)
app.delete('/api/items/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('items')
            .delete()
            .eq('id', Number(id));

        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        console.error("Fehler bei DELETE /api/items:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Ping-Endpunkt für Cron-Jobs / Keep-Alive
app.get('/api/ping', (req, res) => {
    res.status(200).send('pong');
});

// Server starten
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
