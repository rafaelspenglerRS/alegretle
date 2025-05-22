// jogo.js - Versão Final com Nome Correto na Lista e Placar Compartilhável

// Variáveis Globais
let map;
let municipiosLayer;
let targetMunicipality = null; // NORMALIZADO: sem acento, MAIÚSCULAS
let targetMunicipalityDisplayName = ''; // Com acentos, para exibição
let guessedMunicipalities = []; // Guarda objetos { name: original, distance, feedback }
let municipalityFeaturesMap = {}; // Chaves NORMALIZADAS, valor é a layer

// Configurações
const GEOJSON_MUNICIPIOS_RS = './municipios.geojson';
const NOME_PROPRIEDADE_MUNICIPIO = 'NOME';
const PROXIMITY_COLORS = [
    { limit: 0, color: '#00FF00', label: 'Correto!' },          // Verde
    { limit: 25000, color: '#FFFF00', label: 'Muito Perto!' }, // Amarelo
    { limit: 50000, color: '#FFBF00', label: 'Perto' },        // Laranja Claro/Amarelo Escuro
    { limit: 100000, color: '#FF7F00', label: 'Meio Longe' },  // Laranja
    { limit: 200000, color: '#FF4000', label: 'Longe' },       // Vermelho Claro
    { limit: Infinity, color: '#FF0000', label: 'Muito Longe!' } // Vermelho
];

// Funções Utilitárias
function mulberry32(seed) {
    return function() {
      var t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

function removerAcentos(texto) {
    if (texto === null || typeof texto === 'undefined') return '';
    return texto.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getMunicipioDoDia(listaDeNomesNormalizados, dataAtual) {
    if (!listaDeNomesNormalizados || listaDeNomesNormalizados.length === 0) return null;
    const ano = dataAtual.getFullYear();
    const mes = dataAtual.getMonth();
    const dia = dataAtual.getDate();
    const seedDiaria = (ano * 10000) + ((mes + 1) * 100) + dia;
    const geradorAleatorioDoDia = mulberry32(seedDiaria);
    const numeroAleatorio = geradorAleatorioDoDia();
    const indiceFinal = Math.floor(numeroAleatorio * listaDeNomesNormalizados.length);
    return listaDeNomesNormalizados[indiceFinal % listaDeNomesNormalizados.length];
}

function isLightColor(hexColor) {
    if (!hexColor || typeof hexColor !== 'string' || hexColor.length < 4) return true;
    try {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return true;
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return yiq >= 128;
    } catch (e) { return true; }
}

/**
 * Gera o texto compartilhável do resultado do jogo.
 */
function gerarTextoCompartilhavel() {
    const dataDeHoje = new Date();
    const diaFormatado = dataDeHoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const nomeDoJogo = "Alegretle"; // Nome do seu jogo

    let texto = `${nomeDoJogo} - ${diaFormatado}\n`;
    texto += `Resultado em ${guessedMunicipalities.length} tentativa(s):\n\n`;

    // Mapeamento simplificado de cores para emojis de quadrados
    const emojiMap = {
        [PROXIMITY_COLORS[0].color]: '🟩', // Correto!
        [PROXIMITY_COLORS[1].color]: '🟨', // Muito Perto!
        [PROXIMITY_COLORS[2].color]: '🟨', // Perto (pode ajustar para 🟠 se quiser mais distinção)
        [PROXIMITY_COLORS[3].color]: '🟧', // Meio Longe
        [PROXIMITY_COLORS[4].color]: '🟥', // Longe
        [PROXIMITY_COLORS[5].color]: '🟥'  // Muito Longe (pode ajustar para ⬛ se quiser mais distinção)
    };

    guessedMunicipalities.forEach(guess => {
        const corFeedback = guess.feedback.color;
        texto += (emojiMap[corFeedback] || '⬜'); // ⬜ como fallback para cores não mapeadas
    });
    texto += "\n\n";
    // Se você tiver uma URL para o jogo, pode adicionar aqui:
    // texto += "Jogue em: https://www.youtube.com/watch?v=FMFIaoZwGac";

    return texto;
}


// Lógica Principal do Jogo
document.addEventListener('DOMContentLoaded', () => {
    console.log("[jogo.js] DOMContentLoaded disparado.");
    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error("[jogo.js] ERRO CRÍTICO: O div #map não foi encontrado!");
        return;
    }

    let isMapAlreadyValidLeafletInstance = false;
    if (window.map && typeof window.map.addLayer === 'function' && typeof window.map.setView === 'function') {
        isMapAlreadyValidLeafletInstance = true;
    }

    if (!isMapAlreadyValidLeafletInstance) {
        if (window.map) console.warn("[jogo.js] window.map definido, mas NÃO era instância Leaflet válida. Será recriado.");
        else console.log("[jogo.js] window.map não definido. Criando novo mapa.");
        try {
            map = L.map('map').setView([-29.7, -53.0], 6);
            if (map && typeof map.addLayer === 'function') {
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);
                console.log("[jogo.js] Tile layer (OpenStreetMap padrão) adicionado.");
                window.map = map;
            } else { throw new Error("'map' não é objeto Leaflet válido após L.map()."); }
        } catch (e) { console.error("[jogo.js] ERRO CRÍTICO ao (re)inicializar L.map('map'):", e); return; }
    } else {
        console.log("[jogo.js] Usando window.map existente.");
        map = window.map;
    }

    try {
        municipiosLayer = L.featureGroup().addTo(map);
        window.municipiosLayer = municipiosLayer;
        console.log("[jogo.js] municipiosLayer criado e adicionado ao mapa.");
    } catch (e) { console.error("[jogo.js] ERRO ao adicionar municipiosLayer:", e); return; }

    window.onGeoJSONLoaded = function(featuresLayer, nameProperty) {
        console.log("[jogo.js] onGeoJSONLoaded. nameProperty: '" + nameProperty + "'");
        municipalityFeaturesMap = {};
        let nomesParaListaGlobal = [];
        let featuresProcessedCount = 0;
        let namesFoundCount = 0;

        if (featuresLayer && typeof featuresLayer.eachLayer === 'function') {
            featuresLayer.eachLayer(layer => {
                featuresProcessedCount++;
                if (!layer.feature || !layer.feature.properties) {
                    console.warn(`[jogo.js] Feature #${featuresProcessedCount}: Sem feature/properties.`);
                    return;
                }
                const nomeOriginalComAcento = layer.feature.properties[nameProperty];
                if (nomeOriginalComAcento && typeof nomeOriginalComAcento === 'string' && nomeOriginalComAcento.trim() !== '') {
                    const nomeNormalizado = removerAcentos(nomeOriginalComAcento).toUpperCase();
                    municipalityFeaturesMap[nomeNormalizado] = layer;
                    nomesParaListaGlobal.push(nomeNormalizado);
                    namesFoundCount++;
                } else {
                    console.warn(`[jogo.js] Feature #${featuresProcessedCount}: Nome inválido. Prop: '${nameProperty}', Val: '${nomeOriginalComAcento}'.`);
                }
            });
        } else { console.error("[jogo.js] 'featuresLayer' inválida em onGeoJSONLoaded."); }

        console.log("[jogo.js] Features processadas:", featuresProcessedCount, "Nomes válidos:", namesFoundCount);
        console.log("[jogo.js] municipalityFeaturesMap (chaves normalizadas):", Object.keys(municipalityFeaturesMap).length);

        if (namesFoundCount > 0) {
            window.municipalityNames = nomesParaListaGlobal;
            console.log("[jogo.js] window.municipalityNames (normalizados):", window.municipalityNames.length);
        }

        if (window.municipalityNames && window.municipalityNames.length > 0) {
            startGame();
        } else {
            console.error(`[jogo.js] Nomes não carregados. Verifique GeoJSON e prop '${NOME_PROPRIEDADE_MUNICIPIO}'.`);
            alert("Erro: Dados dos municípios não carregados.");
        }
    };

    loadGeoJSON(GEOJSON_MUNICIPIOS_RS, NOME_PROPRIEDADE_MUNICIPIO, municipiosLayer);
    document.getElementById('guess-button').addEventListener('click', handleGuessInput);
    document.getElementById('guess-input').addEventListener('keypress', e => { if (e.key === 'Enter') handleGuessInput(); });
    document.getElementById('new-game-button').addEventListener('click', startGame);
});

function startGame() {
    console.log("[jogo.js] Iniciando novo jogo...");
    if (!window.municipalityNames || window.municipalityNames.length === 0) {
        console.error("[jogo.js] Lista de municípios vazia.");
        alert("Erro: Dados não disponíveis para iniciar.");
        return;
    }

    const dataDeHoje = new Date();
    const nomesOrdenadosNormalizados = [...window.municipalityNames].sort((a, b) => a.localeCompare(b));
    let municipioAlvoNormalizado = getMunicipioDoDia(nomesOrdenadosNormalizados, dataDeHoje);

    if (!municipioAlvoNormalizado) {
        console.error("[jogo.js] Falha ao obter município do dia. Usando fallback aleatório.");
        const fallbackIndex = Math.floor(Math.random() * window.municipalityNames.length);
        municipioAlvoNormalizado = window.municipalityNames[fallbackIndex];
    }

    targetMunicipality = municipioAlvoNormalizado;
    const targetLayerParaDisplay = municipalityFeaturesMap[targetMunicipality];
    if (targetLayerParaDisplay && targetLayerParaDisplay.feature && targetLayerParaDisplay.feature.properties) {
        targetMunicipalityDisplayName = targetLayerParaDisplay.feature.properties[NOME_PROPRIEDADE_MUNICIPIO];
    } else {
        targetMunicipalityDisplayName = targetMunicipality; // Fallback
        console.warn("[jogo.js] Nome original (display) do alvo não encontrado. Usando normalizado:", targetMunicipality);
    }
    
    const diaFormatado = dataDeHoje.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
    console.log(`[jogo.js] Município Alvo para ${diaFormatado}: ${targetMunicipalityDisplayName} (Normalizado: ${targetMunicipality})`);

    guessedMunicipalities = [];
    document.getElementById('guesses-list').innerHTML = '';
    const guessInput = document.getElementById('guess-input');
    guessInput.value = '';
    guessInput.disabled = false;
    document.getElementById('guess-button').disabled = false;
    guessInput.focus();

    for (const nomeChaveNormalizada in municipalityFeaturesMap) {
        const layer = municipalityFeaturesMap[nomeChaveNormalizada];
        try {
            layer.setStyle(window.DEFAULT_TERRITORY_STYLE || { color: '#555', weight: 1, opacity: 0.2, fillColor: '#FFF3E4', fillOpacity: 0.4 });
            if (layer.isTooltipOpen()) layer.closeTooltip();
        } catch (e) { /* Ignora */ }
    }
    if (map && typeof map.setView === 'function' && typeof map.closePopup === 'function') {
        map.closePopup();
        map.setView([-29.7, -53.0], 6);
    }
}

function handleGuessInput() {
    const guessInput = document.getElementById('guess-input');
    const palpiteOriginal = guessInput.value.trim();
    const palpiteNormalizado = removerAcentos(palpiteOriginal).toUpperCase();

    if (!palpiteOriginal) {
        alert("Por favor, digite o nome de um município.");
        return;
    }

    if (guessedMunicipalities.some(guess => removerAcentos(guess.name).toUpperCase() === palpiteNormalizado)) {
        alert(`Você já tentou "${palpiteOriginal}".`);
        guessInput.value = '';
        return;
    }
    
    const guessedLayer = municipalityFeaturesMap[palpiteNormalizado];

    if (!guessedLayer) {
        alert(`Município "${palpiteOriginal}" não encontrado. Verifique o nome e tente novamente.`);
        guessInput.value = '';
        return;
    }
    
    const nomeOficialDoPalpite = guessedLayer.feature.properties[NOME_PROPRIEDADE_MUNICIPIO]; // Nome com acentos
    const targetLayer = municipalityFeaturesMap[targetMunicipality];

    if (!targetLayer) {
        console.error("Erro crítico: Camada do município alvo não encontrada:", targetMunicipality);
        alert("Erro crítico: Município alvo não encontrado.");
        return;
    }

    const distance = guessedLayer.getBounds().getCenter().distanceTo(targetLayer.getBounds().getCenter());
    let proximityFeedback = PROXIMITY_COLORS[PROXIMITY_COLORS.length - 1];
    for (const prox of PROXIMITY_COLORS) { if (distance <= prox.limit) { proximityFeedback = prox; break; } }
    if (palpiteNormalizado === targetMunicipality) proximityFeedback = PROXIMITY_COLORS[0];

    // Guarda o nome oficial do palpite para o histórico de tentativas
    guessedMunicipalities.push({ name: nomeOficialDoPalpite, distance: distance, feedback: proximityFeedback });
    // Passa o nome oficial para ser exibido na UI
    updateMapAndUI(guessedLayer, nomeOficialDoPalpite, distance, proximityFeedback);

    guessInput.value = '';
    guessInput.focus();

    if (palpiteNormalizado === targetMunicipality) {
        alert(`Parabéns! Você acertou! O município era ${targetMunicipalityDisplayName}.`);
        guessInput.disabled = true;
        document.getElementById('guess-button').disabled = true;
        guessedLayer.setStyle({ fillColor: proximityFeedback.color, color: 'gold', weight: 3, fillOpacity: 0.75, opacity: 1 });
        guessedLayer.bringToFront();
        if (map && typeof map.fitBounds === 'function') map.fitBounds(guessedLayer.getBounds(), { padding: [50, 50] });

        // Gerar e mostrar texto para compartilhar
        const textoParaCompartilhar = gerarTextoCompartilhavel();
        // Usamos um prompt para facilitar a cópia. Uma modal seria mais elegante.
        prompt("Copie seu resultado para compartilhar:", textoParaCompartilhar);
    }
}

function updateMapAndUI(guessedLayer, nomeOficialParaExibir, distance, proximityFeedback) {
    guessedLayer.setStyle({
        fillColor: proximityFeedback.color, color: 'black', weight: 1.5,
        fillOpacity: 0.65, opacity: 0.9
    });
    guessedLayer.bringToFront();

    if (map && guessedLayer && typeof map.setView === 'function' && guessedLayer.getBounds) {
        try {
            map.setView(guessedLayer.getBounds().getCenter(), 7);
        } catch (e) { console.warn("[jogo.js] Erro ao dar zoom na tentativa:", e); }
    }

    const listItem = document.createElement('li');
    const distanceKm = (distance / 1000).toFixed(1);
    // Usa nomeOficialParaExibir, que já deve ter a capitalização correta do GeoJSON
    // Se precisar de forçar capitalização:
    // const displayNameFormatted = nomeOficialParaExibir.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    listItem.innerHTML = `<b>${nomeOficialParaExibir}</b>: ${proximityFeedback.label} (${distanceKm} km)`;
    listItem.style.backgroundColor = proximityFeedback.color;
    listItem.style.color = isLightColor(proximityFeedback.color) ? '#333' : '#fff';

    document.getElementById('guesses-list').prepend(listItem);
}