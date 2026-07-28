const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase-Zugangsdaten (In Produktion über Umgebungsverfahren setzen)
const SUPABASE_URL = process.env.SUPABASE_URL || 'DEINE_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'DEIN_SUPABASE_ANON_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
        const { error } = await supabase
            .from('items')
            .update({
                title: title !== undefined ? String(title) : '',
                content: content !== undefined ? String(content) : '',
                category_id: category_id ? Number(category_id) : null,
                updated_at: new Date().toISOString()
            })
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
