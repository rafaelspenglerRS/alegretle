// jogo.js - Versão Atualizada

// Variáveis Globais para o Jogo
let map; // Instância do mapa Leaflet
let municipiosLayer; // Camada Leaflet para os municípios (de territorio.js)
let targetMunicipality = null; // O município (em MAIÚSCULAS) que o jogador precisa adivinhar
let guessedMunicipalities = []; // Array para guardar as tentativas
let municipalityFeaturesMap = {}; // Mapeia nome do município (MAIÚSCULAS) para sua camada/feature

// Configurações do Jogo
const GEOJSON_MUNICIPIOS_RS = './municipios.geojson'; // Certifique-se que este caminho está correto
const NOME_PROPRIEDADE_MUNICIPIO = 'NOME'; // ATUALIZADO: O utilizador confirmou que é 'NOME'

// Cores para feedback de proximidade (distância em metros)
const PROXIMITY_COLORS = [
    { limit: 0, color: '#00FF00', label: 'Correto!' },
    { limit: 25000, color: '#FFFF00', label: 'Muito Perto!' },
    { limit: 50000, color: '#FFBF00', label: 'Perto' },
    { limit: 100000, color: '#FF7F00', label: 'Meio Longe' },
    { limit: 200000, color: '#FF4000', label: 'Longe' },
    { limit: Infinity, color: '#FF0000', label: 'Muito Longe!' }
];

/**
 * Seleciona um município de forma determinística com base na data atual.
 * @param {string[]} listaDeNomes - Uma lista de nomes de municípios (espera-se que esteja ordenada).
 * @param {Date} dataAtual - O objeto Date para o dia atual.
 * @returns {string|null} O nome do município do dia, ou null se a lista estiver vazia.
 */
function getMunicipioDoDia(listaDeNomes, dataAtual) {
    if (!listaDeNomes || listaDeNomes.length === 0) {
        console.error("[jogo.js] Lista de nomes de municípios está vazia ao tentar obter município do dia.");
        return null;
    }

    const ano = dataAtual.getFullYear();
    const mes = dataAtual.getMonth(); // 0 = Janeiro, 11 = Dezembro
    const dia = dataAtual.getDate(); // 1-31

    const seed = ano * 366 + (mes + 1) * 31 + dia;
    let indice = seed;
    indice = ((indice >> 16) ^ indice) * 0x45d9f3b;
    indice = ((indice >> 16) ^ indice) * 0x45d9f3b;
    indice = (indice >> 16) ^ indice;
    const indiceFinal = Math.abs(indice) % listaDeNomes.length;

    return listaDeNomes[indiceFinal];
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("[jogo.js] DOMContentLoaded disparado.");
    console.log("[jogo.js] Verificando Leaflet (L):", typeof L, L);
    const mapDiv = document.getElementById('map');
    console.log("[jogo.js] Verificando div #map:", mapDiv);

    if (!mapDiv) {
        console.error("[jogo.js] ERRO CRÍTICO: O div #map não foi encontrado no HTML! O mapa não pode ser inicializado.");
        return;
    }

    let isMapAlreadyValidLeafletInstance = false;
    if (window.map && typeof window.map.addLayer === 'function' && typeof window.map.setView === 'function') {
        isMapAlreadyValidLeafletInstance = true;
    }

    if (!isMapAlreadyValidLeafletInstance) {
        if (window.map) {
            console.warn("[jogo.js] window.map estava definido, mas NÃO era uma instância de mapa Leaflet válida. Será recriado.", window.map);
        } else {
            console.log("[jogo.js] window.map não definido. Criando novo mapa.");
        }
        try {
            map = L.map('map').setView([-29.7, -53.0], 6);
            console.log("[jogo.js] L.map('map') chamado. Objeto map inicializado:", map);


            
            if (map && typeof map.addLayer === 'function') {
                // Usando CartoDB Positron NoLabels como exemplo de mapa sem rótulos
              /*   L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 20
                }).addTo(map); */
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);
                console.log("[jogo.js] Tile layer (CartoDB Positron NoLabels) adicionado ao mapa.");
                window.map = map;
            } else {
                console.error("[jogo.js] ERRO: 'map' não é um objeto de mapa Leaflet válido após L.map().");
                return;
            }
        } catch (e) {
            console.error("[jogo.js] ERRO CRÍTICO ao tentar (re)inicializar L.map('map'):", e);
            return;
        }
    } else {
        console.log("[jogo.js] Usando window.map existente (já é uma instância Leaflet válida).");
        map = window.map;
    }

    console.log("[jogo.js] Objeto 'map' antes de adicionar municipiosLayer:", map);
    console.log("[jogo.js] 'map' possui addLayer?", map && typeof map.addLayer === 'function');

    try {
        municipiosLayer = L.featureGroup().addTo(map);
        console.log("[jogo.js] municipiosLayer criado e adicionado ao mapa.");
        window.municipiosLayer = municipiosLayer;
    } catch (e) {
        console.error("[jogo.js] ERRO ao adicionar municipiosLayer ao mapa. 'map' pode ser inválido:", e);
        console.error("[jogo.js] Detalhes do objeto 'map' neste ponto problemático:", map);
        return;
    }

    window.onGeoJSONLoaded = function(featuresLayer, nameProperty) {
        console.log("[jogo.js] Entrando em onGeoJSONLoaded. A 'nameProperty' recebida de territorio.js é: '" + nameProperty + "'");
        // console.log("[jogo.js] A 'featuresLayer' recebida:", featuresLayer); // Log verboso, pode ser descomentado para depuração profunda

        municipalityFeaturesMap = {};
        window.municipalityNames = []; // Limpa para o caso de recarregamentos ou múltiplos chamados
        let featuresProcessedCount = 0;
        let namesFoundCount = 0;

        if (featuresLayer && typeof featuresLayer.eachLayer === 'function') {
            featuresLayer.eachLayer(layer => {
                featuresProcessedCount++;
                if (!layer.feature || !layer.feature.properties) {
                    console.warn("[jogo.js] Processando feature #" + featuresProcessedCount + ": Camada encontrada sem 'feature' ou sem 'feature.properties'. Camada:", layer);
                    return;
                }
                const nome = layer.feature.properties[nameProperty];
                if (nome && typeof nome === 'string' && nome.trim() !== '') {
                    municipalityFeaturesMap[nome.toUpperCase()] = layer;
                    namesFoundCount++;
                } else {
                    console.warn(
                        "[jogo.js] Feature #" + featuresProcessedCount +
                        ": Nome inválido ou ausente. Propriedade usada: '" + nameProperty + "'. " +
                        "Valor obtido: '" + nome + "' (tipo: " + typeof nome + "). " +
                        "Propriedades da feature: ", layer.feature.properties
                    );
                }
            });
        } else {
            console.error("[jogo.js] 'featuresLayer' recebida em onGeoJSONLoaded não é válida ou não tem o método 'eachLayer'. featuresLayer:", featuresLayer);
        }

        console.log("[jogo.js] Total de features processadas dentro de onGeoJSONLoaded:", featuresProcessedCount);
        console.log("[jogo.js] Total de nomes válidos encontrados e adicionados ao municipalityFeaturesMap:", namesFoundCount);
        // console.log("[jogo.js] Conteúdo final de municipalityFeaturesMap:", municipalityFeaturesMap); // Log verboso

        if (namesFoundCount > 0) {
            window.municipalityNames = Object.keys(municipalityFeaturesMap); // As chaves já estão em MAIÚSCULAS
            console.log("[jogo.js] window.municipalityNames populado:", window.municipalityNames.length, "nomes.");
        }

        if (window.municipalityNames && window.municipalityNames.length > 0) {
            startGame();
        } else {
            console.error(
                "[jogo.js] Nenhum nome de município válido foi carregado. " +
                "Verifique os logs de 'Nome inválido ou ausente' acima. " +
                "Confirme que a propriedade '" + NOME_PROPRIEDADE_MUNICIPIO + "' (recebida como '" + nameProperty + "') existe no seu GeoJSON e contém nomes de texto válidos."
            );
            alert("Erro: Nenhum nome de município válido foi carregado. Verifique o console para mais detalhes.");
        }
    };

    loadGeoJSON(GEOJSON_MUNICIPIOS_RS, NOME_PROPRIEDADE_MUNICIPIO, municipiosLayer);

    document.getElementById('guess-button').addEventListener('click', handleGuessInput);
    document.getElementById('guess-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            handleGuessInput();
        }
    });
    document.getElementById('new-game-button').addEventListener('click', startGame);
});

function startGame() {
    console.log("[jogo.js] Iniciando novo jogo...");
    if (!window.municipalityNames || window.municipalityNames.length === 0) {
        console.error("[jogo.js] Lista de municípios (window.municipalityNames) vazia ou não definida.");
        alert("Não foi possível iniciar o jogo. Dados dos municípios não encontrados.");
        return;
    }

    const dataDeHoje = new Date();
    const nomesOrdenados = [...window.municipalityNames].sort((a, b) => a.localeCompare(b)); // Ordena para consistência
    let municipioAlvoNome = getMunicipioDoDia(nomesOrdenados, dataDeHoje);

    if (!municipioAlvoNome) {
        console.error("[jogo.js] Não foi possível determinar o município do dia. Usando um aleatório como fallback.");
        const randomIndexFallback = Math.floor(Math.random() * window.municipalityNames.length);
        // As chaves de municipalityFeaturesMap (que formam window.municipalityNames) já estão em maiúsculas.
        // Se window.municipalityNames vier de outra fonte, garantir que esteja em maiúsculas.
        municipioAlvoNome = window.municipalityNames[randomIndexFallback];
    }

    targetMunicipality = municipioAlvoNome.toUpperCase(); // Garante que está em maiúsculas
    
    const diaFormatado = dataDeHoje.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
    console.log(`[jogo.js] Município Alvo para ${diaFormatado}: ${targetMunicipality}`);

    guessedMunicipalities = [];
    document.getElementById('guesses-list').innerHTML = '';
    const guessInput = document.getElementById('guess-input');
    guessInput.value = '';
    guessInput.disabled = false;
    document.getElementById('guess-button').disabled = false;
    guessInput.focus();

    for (const nomeMunicipioChave in municipalityFeaturesMap) {
        const layer = municipalityFeaturesMap[nomeMunicipioChave];
        try {
            if (window.DEFAULT_TERRITORY_STYLE) {
                layer.setStyle(window.DEFAULT_TERRITORY_STYLE);
            } else {
                layer.setStyle({ color: '#555', weight: 1, opacity: 0.2, fillColor: '#FFF3E4', fillOpacity: 0.4 });
            }
            if (layer.isTooltipOpen()) layer.closeTooltip();
            map.closePopup();
        } catch (e) {
            // console.warn("[jogo.js] Erro ao resetar layer no inicio do jogo:", e);
        }
    }
    if (map && typeof map.setView === 'function') { // Adiciona verificação para map
        map.setView([-29.7, -53.0], 6);
    }
}

function handleGuessInput() {
    const guessInput = document.getElementById('guess-input');
    const guessedNameOriginal = guessInput.value.trim();
    const guessedNameNormalized = guessedNameOriginal.toUpperCase(); // Normaliza para maiúsculas para busca

    if (!guessedNameOriginal) {
        alert("Por favor, digite o nome de um município.");
        return;
    }

    // Verifica se já foi tentado usando o nome normalizado
    if (guessedMunicipalities.some(guess => guess.name.toUpperCase() === guessedNameNormalized)) {
        alert(`Você já tentou "${guessedNameOriginal}".`);
        guessInput.value = '';
        return;
    }
    
    // Procura no mapa de features usando o nome normalizado
    const guessedLayer = municipalityFeaturesMap[guessedNameNormalized];

    if (!guessedLayer) {
        alert(`Município "${guessedNameOriginal}" não encontrado. Verifique o nome e tente novamente.`);
        guessInput.value = '';
        return;
    }
    
    const targetLayer = municipalityFeaturesMap[targetMunicipality]; // targetMunicipality já está em MAIÚSCULAS

    if (!targetLayer) { // Verificação extra, embora targetMunicipality deva sempre existir no mapa.
        console.error("Erro crítico: Camada do município alvo não encontrada no mapa:", targetMunicipality);
        alert("Ocorreu um erro crítico. O município alvo não foi encontrado no mapa.");
        return;
    }

    const distance = guessedLayer.getBounds().getCenter().distanceTo(targetLayer.getBounds().getCenter());
    let proximityFeedback = PROXIMITY_COLORS[PROXIMITY_COLORS.length - 1];
    for (const prox of PROXIMITY_COLORS) {
        if (distance <= prox.limit) {
            proximityFeedback = prox;
            break;
        }
    }
    if (guessedNameNormalized === targetMunicipality) {
        proximityFeedback = PROXIMITY_COLORS[0];
    }

    // Armazena o nome original para exibição, mas usa o normalizado para lógica interna se necessário
    guessedMunicipalities.push({ name: guessedNameOriginal, distance: distance, feedback: proximityFeedback });
    updateMapAndUI(guessedLayer, guessedNameOriginal, distance, proximityFeedback); // Passa o nome original para UI

    guessInput.value = '';
    guessInput.focus();

    if (guessedNameNormalized === targetMunicipality) {
        alert(`Parabéns! Você acertou! O município era ${targetMunicipality}.`);
        document.getElementById('guess-input').disabled = true;
        document.getElementById('guess-button').disabled = true;
        guessedLayer.setStyle({
            fillColor: proximityFeedback.color,
            color: 'gold',
            weight: 3,
            fillOpacity: 0.75,
            opacity: 1
        });
        guessedLayer.bringToFront();
        if (map && typeof map.fitBounds === 'function') { // Adiciona verificação para map
            map.fitBounds(guessedLayer.getBounds(), { padding: [50, 50] });
        }
    }
}

function updateMapAndUI(guessedLayer, displayName, distance, proximityFeedback) {
    guessedLayer.setStyle({
        fillColor: proximityFeedback.color,
        color: 'black',
        weight: 1.5,
        fillOpacity: 0.65,
        opacity: 0.9
    });
    guessedLayer.bringToFront();

    // ---- INÍCIO DA NOVA LINHA PARA ZOOM ----
    if (map && guessedLayer) { // Verifica se map e guessedLayer existem
        map.setView(guessedLayer.getBounds().getCenter(), 7); // Centraliza e define zoom 7
    }
    // ---- FIM DA NOVA LINHA PARA ZOOM ----

    // Tooltips automáticas na tentativa foram removidas anteriormente.

    const listItem = document.createElement('li');
    const distanceKm = (distance / 1000).toFixed(1);
    const capitalizedDisplayName = displayName.charAt(0).toUpperCase() + displayName.slice(1).toLowerCase();
    listItem.innerHTML = `<b>${capitalizedDisplayName}</b>: ${proximityFeedback.label} (${distanceKm} km)`;
    listItem.style.backgroundColor = proximityFeedback.color;
    listItem.style.color = isLightColor(proximityFeedback.color) ? '#333' : '#fff';

    document.getElementById('guesses-list').prepend(listItem);
}

function isLightColor(hexColor) {
    if (!hexColor || hexColor.length < 4) return true; // Default para texto escuro se cor inválida
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128;
}