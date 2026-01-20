const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const http = require('http');
const FormData = require('form-data');

// ========== CONFIGURA QUI ==========
const CONFIG = {
    // 🔥 MODIFICA QUESTI 3 VALORI 🔥
    TOKEN: 'IL_TUO_TOKEN_DISCORD_QUI',
    TARGET_GUILD_ID: 'ID_SERVER_DOVE_COPIARE',
    SOURCE_GUILD_ID: 'ID_SERVER_DA_COPIARE',
    
    // ⚙️ Impostazioni fisse
    PORT: 3000,
    DELAY: 300
};

// ========== SERVER HTTP ==========
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🤖 Grindr Cloner ONLINE');
}).listen(CONFIG.PORT, () => {
    console.log(`✅ Server on port ${CONFIG.PORT}`);
});

// ========== DISCORD CLIENT ==========
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ========== UTILITY ==========
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function hasAccess(channel) {
    try {
        await channel.messages.fetch({ limit: 1 });
        return true;
    } catch {
        return false;
    }
}

function getFileExtension(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : 'jpg';
}

// ========== 1. PULIZIA TUTTO ==========
async function pulisciTutto() {
    console.log('🗑️  ELIMINO TUTTO...');
    const target = client.guilds.cache.get(CONFIG.TARGET_GUILD_ID);
    const canali = Array.from(target.channels.cache.values());
    
    for (const canale of canali) {
        try {
            await canale.delete();
            console.log(`  ❌ ${canale.name}`);
            await sleep(800);
        } catch {}
    }
    console.log('✅ Target pulito!\n');
}

// ========== 2. CLONA TUTTA LA STRUTTURA ==========
async function clonaStruttura() {
    console.log('📁 CLONO TUTTA LA STRUTTURA...');
    
    const source = client.guilds.cache.get(CONFIG.SOURCE_GUILD_ID);
    const target = client.guilds.cache.get(CONFIG.TARGET_GUILD_ID);
    
    const mappaCanali = new Map();
    const mappaCategorie = new Map();
    
    // Clona categorie
    const categorie = source.channels.cache
        .filter(ch => ch.type === 4)
        .sort((a, b) => a.position - b.position);
    
    for (const categoria of categorie.values()) {
        try {
            const nuovaCategoria = await target.channels.create({
                name: categoria.name,
                type: 4,
                position: categoria.position
            });
            mappaCategorie.set(categoria.id, nuovaCategoria.id);
            console.log(`  📁 ${categoria.name}`);
            await sleep(300);
        } catch {}
    }
    
    // Clona canali testuali
    const canaliTestuali = source.channels.cache
        .filter(ch => ch.type === 0 || ch.type === 5)
        .sort((a, b) => a.position - b.position);
    
    let clonati = 0;
    
    for (const canale of canaliTestuali.values()) {
        if (!await hasAccess(canale)) {
            console.log(`  🔒 NO ACCESS: ${canale.name}`);
            continue;
        }
        
        try {
            const parentId = canale.parentId && mappaCategorie.has(canale.parentId)
                ? mappaCategorie.get(canale.parentId)
                : null;
            
            const nuovoCanale = await target.channels.create({
                name: canale.name,
                type: canale.type,
                parent: parentId,
                topic: canale.topic || '',
                nsfw: true,
                position: canale.position
            });
            
            mappaCanali.set(canale.id, {
                targetId: nuovoCanale.id,
                name: canale.name
            });
            
            clonati++;
            console.log(`  ✅ ${canale.name}`);
            await sleep(300);
            
        } catch (err) {
            console.log(`  ❌ ${canale.name}: ${err.message}`);
        }
    }
    
    console.log(`\n✅ Clonati ${clonati} canali\n`);
    return mappaCanali;
}

// ========== 3. CREA WEBHOOK SU OGNI CANALE ==========
async function creaWebhookGrindr() {
    console.log('🎣 CREO WEBHOOK "GRINDR UPLOADER"...');
    
    const target = client.guilds.cache.get(CONFIG.TARGET_GUILD_ID);
    const canali = target.channels.cache.filter(ch => ch.type === 0 || ch.type === 5);
    
    const webhookMap = new Map();
    
    for (const canale of canali.values()) {
        try {
            const webhook = await canale.createWebhook({
                name: 'GRINDR UPLOADER',
                avatar: 'https://cdn.discordapp.com/attachments/1100949263778099320/1183822206778728528/grindr-logo-1.png'
            });
            
            webhookMap.set(canale.id, {
                url: webhook.url,
                id: webhook.id,
                token: webhook.token
            });
            
            console.log(`  🔗 ${canale.name}`);
            await sleep(400);
            
        } catch (err) {
            console.log(`  ⚠️  ${canale.name}: ${err.message}`);
        }
    }
    
    console.log(`✅ ${webhookMap.size} webhook creati\n`);
    return webhookMap;
}

// ========== 4. UPLOAD E RINOMINA A "GRINDR" ==========
async function uploadConWebhook(mappaCanali, webhookMap) {
    console.log('📤 UPLOAD E RINOMINA FILE A "GRINDR"...');
    
    const source = client.guilds.cache.get(CONFIG.SOURCE_GUILD_ID);
    let fileTotali = 0;
    
    console.log(`🎯 Inizio upload da ${mappaCanali.size} canali\n`);
    
    for (const [sourceId, data] of mappaCanali.entries()) {
        const canaleSource = source.channels.cache.get(sourceId);
        const webhookData = webhookMap.get(data.targetId);
        
        if (!canaleSource || !webhookData) continue;
        
        console.log(`📁 Processo: ${canaleSource.name}`);
        
        try {
            // Prendi messaggi
            const messaggi = await canaleSource.messages.fetch({ limit: 100 });
            const messaggiValidi = Array.from(messaggi.values())
                .filter(msg => !msg.author.bot && msg.attachments.size > 0)
                .reverse();
            
            let fileInCanale = 0;
            
            // Processa ogni messaggio
            for (const messaggio of messaggiValidi) {
                // Processa ogni allegato
                for (const allegato of messaggio.attachments.values()) {
                    // Salta file troppo grandi (>25MB)
                    if (allegato.size > 25 * 1024 * 1024) {
                        console.log(`  ⚠️  File troppo grande: ${allegato.name}`);
                        continue;
                    }
                    
                    try {
                        // RINOMINA il file a "GRINDR"
                        const estensione = getFileExtension(allegato.name);
                        const nuovoNome = `GRINDR.${estensione}`;
                        
                        // Download file
                        const response = await axios.get(allegato.url, {
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });
                        
                        // Upload via webhook con nuovo nome
                        const form = new FormData();
                        form.append('file', Buffer.from(response.data), {
                            filename: nuovoNome,
                            contentType: allegato.contentType || 'application/octet-stream'
                        });
                        
                        const webhookUrl = `https://discord.com/api/webhooks/${webhookData.id}/${webhookData.token}`;
                        
                        await axios.post(webhookUrl, form, {
                            headers: form.getHeaders(),
                            timeout: 30000
                        });
                        
                        fileInCanale++;
                        fileTotali++;
                        
                        // Progress indicator
                        if (fileTotali % 5 === 0) process.stdout.write('▓');
                        
                        await sleep(500); // Rate limit
                        
                    } catch (err) {
                        console.log(`  ⚠️  Errore file: ${err.message}`);
                    }
                }
                
                await sleep(800); // Pausa tra messaggi
            }
            
            console.log(`  ✅ ${fileInCanale} file rinominati a "GRINDR"`);
            
        } catch (err) {
            console.log(`  ❌ Errore canale: ${err.message}`);
        }
        
        await sleep(2000); // Pausa tra canali
    }
    
    console.log(`\n🎉 UPLOAD COMPLETATO!`);
    console.log(`📊 File totali rinominati: ${fileTotali}`);
}

// ========== AVVIO AUTOMATICO ==========
async function avviaClonazione() {
    console.clear();
    console.log('🤖 GRINDR FILE RENAMER CLONER 🤖');
    console.log('⚡ Inizio in 3 secondi...\n');
    
    await sleep(3000);
    
    const inizio = Date.now();
    
    try {
        await pulisciTutto();
        const mappaCanali = await clonaStruttura();
        const webhookMap = await creaWebhookGrindr();
        await uploadConWebhook(mappaCanali, webhookMap);
        
        const durata = Math.floor((Date.now() - inizio) / 1000);
        console.log(`\n🏁 COMPLETATO IN ${Math.floor(durata/60)}m ${durata%60}s`);
        console.log('🎯 TUTTI I FILE SONO STATI RINOMINATI "GRINDR"');
        
    } catch (error) {
        console.error('💥 ERRORE:', error.message);
    }
}

// ========== QUANDO IL BOT È PRONTO ==========
client.on('ready', () => {
    console.log(`✅ Loggato come: ${client.user.tag}`);
    
    console.log('\n🎯 Target Server:', CONFIG.TARGET_GUILD_ID);
    console.log('🎯 Source Server:', CONFIG.SOURCE_GUILD_ID);
    console.log('\n🚀 Avvio automatico in 2 secondi...');
    
    setTimeout(avviaClonazione, 2000);
});

// ========== LOGIN ==========
client.login(CONFIG.TOKEN).catch(err => {
    console.error('❌ LOGIN FALLITO:', err.message);
    console.log('\n⚠️  Controlla token e server IDs!');
    process.exit(1);
});
