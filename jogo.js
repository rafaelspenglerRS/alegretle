// jogo.js - Versão Definitiva com Autocompletar, Navegação Teclado e Melhorias

// Variáveis Globais
let map;
let municipiosLayer;
let targetMunicipality = null; // NORMALIZADO: sem acento, MAIÚSCULAS
let targetMunicipalityDisplayName = ''; // Com acentos, para exibição
let guessedMunicipalities = [];
let municipalityFeaturesMap = {}; // Chaves NORMALIZADAS, valor é a layer

// Variáveis para Autocompletar
let suggestionsContainerElement;
let suggestionsListElement;
let currentAutocompleteSuggestions = [];
let indiceSugestaoAtiva = -1;

// Configurações
const GEOJSON_MUNICIPIOS_RS = './municipios.geojson';
const NOME_PROPRIEDADE_MUNICIPIO = 'NOME';
const PROXIMITY_COLORS = [
    { limit: 0, color: '#00FF00', label: 'Correto!' },
    { limit: 25000, color: '#FFFF00', label: 'Muito Perto!' },
    { limit: 50000, color: '#FFBF00', label: 'Perto' },
    { limit: 100000, color: '#FF7F00', label: 'Meio Longe' },
    { limit: 200000, color: '#FF4000', label: 'Longe' },
    { limit: Infinity, color: '#FF0000', label: 'Muito Longe!' }
];

// Funções Utilitárias
function mulberry32(seed) {
    return function() {
      var t = seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1);
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
    const ano = dataAtual.getFullYear(); const mes = dataAtual.getMonth(); const dia = dataAtual.getDate();
    const seedDiaria = (ano * 10000) + ((mes + 1) * 100) + dia;
    const geradorAleatorioDoDia = mulberry32(seedDiaria); const numeroAleatorio = geradorAleatorioDoDia();
    const indiceFinal = Math.floor(numeroAleatorio * listaDeNomesNormalizados.length);
    return listaDeNomesNormalizados[indiceFinal % listaDeNomesNormalizados.length];
}
function isLightColor(hexColor) {
    if (!hexColor || typeof hexColor !== 'string' || hexColor.length < 4) return true;
    try {
        const r = parseInt(hexColor.slice(1,3),16); const g = parseInt(hexColor.slice(3,5),16); const b = parseInt(hexColor.slice(5,7),16);
        if(isNaN(r)||isNaN(g)||isNaN(b)) return true; const yiq = ((r*299)+(g*587)+(b*114))/1000; return yiq >=128;
    } catch(e){ return true; }
}

/**
 * Gera o texto compartilhável do resultado do jogo (versão fornecida pelo utilizador).
 */
function gerarTextoCompartilhavel() {
    const dataDeHoje = new Date();
    const diaFormatado = dataDeHoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const nomeDoJogo = "Alegretle"; // Nome do seu jogo

    let texto = `Correto! ${targetMunicipalityDisplayName}\n${nomeDoJogo} - ${diaFormatado}\n`; // Adicionado nome do município alvo
    texto += `- Resultado em ${guessedMunicipalities.length} tentativa(s):\n\n`;

    const emojiMap = {
        [PROXIMITY_COLORS[0].color]: '🟩', // Correto!
        [PROXIMITY_COLORS[1].color]: '🟨', // Muito perto! 
        [PROXIMITY_COLORS[2].color]: '🟨', // Perto 
        [PROXIMITY_COLORS[3].color]: '🟧', // Meio Longe
        [PROXIMITY_COLORS[4].color]: '🟥', // Longe
        [PROXIMITY_COLORS[5].color]: '🟫'  // Muito Longe (cor #FF0000 mapeada para Quadrado Marrom)
    };

    guessedMunicipalities.forEach(guess => {
        const corFeedback = guess.feedback.color;
        texto += (emojiMap[corFeedback] || '⬜'); // ⬜ como fallback
    });
    texto += "\n\n";
    // Se você tiver uma URL para o jogo, pode adicionar aqui:
    // texto += "Jogue também: [SUA_URL_AQUI]";

    return texto;
}


// Funções de Autocompletar
function escaparRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function highlightMatch(text, query) {
    if (!query || query.trim() === '') return text;
    try {
        const simpleRegex = new RegExp(`(${escaparRegex(query)})`, 'gi');
        return text.replace(simpleRegex, '<strong>$1</strong>');
    } catch (e) { console.warn("[AC] Erro no highlightMatch:", e); return text; }
}

function atualizarDestaqueSugestao(novoIndice) {
    if (!suggestionsListElement) return;
    const sugestoesLi = suggestionsListElement.querySelectorAll('li');
    const itemAntigoAtivo = suggestionsListElement.querySelector('.suggestion-active');
    if (itemAntigoAtivo) {
        itemAntigoAtivo.classList.remove('suggestion-active');
        itemAntigoAtivo.removeAttribute('aria-selected');
    }
    indiceSugestaoAtiva = novoIndice;
    const guessInputElement = document.getElementById('guess-input'); // Re-obter para garantir
    if (indiceSugestaoAtiva >= 0 && indiceSugestaoAtiva < sugestoesLi.length) {
        const itemNovoAtivo = sugestoesLi[indiceSugestaoAtiva];
        itemNovoAtivo.classList.add('suggestion-active');
        itemNovoAtivo.setAttribute('aria-selected', 'true');
        if (guessInputElement) guessInputElement.setAttribute('aria-activedescendant', itemNovoAtivo.id);
        itemNovoAtivo.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
        if (guessInputElement) guessInputElement.removeAttribute('aria-activedescendant');
    }
}

function displaySuggestions(suggestionOriginalNames, inputText) {
    console.log("[AC_DEBUG] displaySuggestions chamada com:", suggestionOriginalNames.length, "sugestões.");
    if (!suggestionsListElement || !suggestionsContainerElement) {
        console.error("[AC_DEBUG] Elementos de sugestão NULOS ou INDEFINIDOS em displaySuggestions. Abortando.");
        return;
    }
    suggestionsListElement.style.display = 'block';
    suggestionsListElement.innerHTML = ''; // Limpa sugestões anteriores
    indiceSugestaoAtiva = -1;
    const guessInputElement = document.getElementById('guess-input');
    if (guessInputElement) guessInputElement.removeAttribute('aria-activedescendant');

    if (suggestionOriginalNames.length === 0) {
        // Se não há sugestões, chama hideSuggestions que agora vai esconder o UL corretamente
        hideSuggestions(); 
        return;
    }
   

    suggestionOriginalNames.forEach((nomeOriginal, index) => {
        console.log(`[AC_DEBUG] Criando <li> para: ${nomeOriginal}`);
        const li = document.createElement('li');
        
        // Mantendo o código de teste para forçar visibilidade:
       /*  li.textContent = "TESTE: " + nomeOriginal;
        li.style.color = "black !important";
        li.style.backgroundColor = "yellow !important";
        li.style.padding = "10px";
        li.style.border = "1px solid #048041";
        li.style.display = "block"; 
        li.style.marginBottom = "2px"; 
 */
        li.dataset.index = index;
        li.id = `suggestion-item-${index}`;
        li.setAttribute('role', 'option');

        li.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (guessInputElement) {
                guessInputElement.value = nomeOriginal;
                guessInputElement.focus();
            }
            hideSuggestions(); 
        });
        li.innerHTML = highlightMatch(nomeOriginal, inputText);
        suggestionsListElement.appendChild(li);
    });

    // ---- GARANTA QUE ESTA LINHA ESTÁ AQUI E CORRETA ----
    suggestionsListElement.style.display = 'block'; // TORNA O UL VISÍVEL
    console.log("[AC_DEBUG] suggestionsListElement (o UL) display set to 'block'");
    console.log("[AC_DEBUG] Altura RENDERIZADA do suggestionsListElement:", suggestionsListElement.offsetHeight + "px");
    // Opcional: o container pai pode ficar sempre display: block ou como definido no CSS.
    // Se o suggestionsContainerElement precisar ser mostrado também (caso ele seja escondido em outro lugar):
    // if (suggestionsContainerElement) suggestionsContainerElement.style.display = 'block';
}

function hideSuggestions() {
    // Oculta o <ul> que contém os itens da lista
    if (suggestionsListElement) {
     //   suggestionsListElement.style.display = 'none'; 
        console.log("[AC_DEBUG] suggestionsListElement (o UL) display set to 'none'");
        suggestionsListElement.innerHTML = ''; // Limpa os itens
    }
    // O suggestionsContainerElement (o div pai) pode permanecer como está (geralmente display: block por padrão para um div)
    // Se você o escondeu em algum lugar, precisaria de lógica para mostrá-lo quando necessário.

    currentAutocompleteSuggestions = [];
    indiceSugestaoAtiva = -1;
    const guessInput = document.getElementById('guess-input');
    if(guessInput) guessInput.removeAttribute('aria-activedescendant');
}

function handleAutocompleteInput(event) {
    const inputText = event.target.value;
    console.log("[AC_DEBUG] Input: '"+ inputText + "', Tam: " + inputText.length);
    if (inputText.length < 3) { hideSuggestions(); return; }
    const inputTextNormalizado = removerAcentos(inputText).toUpperCase();
    console.log("[AC_DEBUG] Norm: '" + inputTextNormalizado + "'");
    if (!window.municipalityNames || window.municipalityNames.length === 0) { console.warn("[AC_DEBUG] Nomes de municípios indisponíveis."); hideSuggestions(); return; }
    
    const filteredNormalisedNames = window.municipalityNames
        .filter(nomeMunNormalizado => nomeMunNormalizado.includes(inputTextNormalizado))
        .slice(0, 7); 
    console.log("[AC_DEBUG] Filtrados (norm):", filteredNormalisedNames);

    if (filteredNormalisedNames.length > 0) {
        const suggestionsToDisplay = filteredNormalisedNames.map(nomeNormalizado => {
            const layer = municipalityFeaturesMap[nomeNormalizado];
            return (layer && layer.feature && layer.feature.properties) ? layer.feature.properties[NOME_PROPRIEDADE_MUNICIPIO] : null;
        }).filter(nome => nome !== null);
        console.log("[AC_DEBUG] Sugestões para display (orig):", suggestionsToDisplay);
        currentAutocompleteSuggestions = suggestionsToDisplay;
        displaySuggestions(suggestionsToDisplay, inputText);
    } else { console.log("[AC_DEBUG] Nenhuma sugestão. Escondendo."); hideSuggestions(); }
}

function handleAutocompleteKeydown(event) {
    const guessInput = document.getElementById('guess-input');
    const sugestoesVisiveis = suggestionsContainerElement && suggestionsContainerElement.style.display === 'block';
    const numSugestoes = currentAutocompleteSuggestions.length;

    if (event.key === 'Escape') { event.preventDefault(); hideSuggestions(); return; }
    if (sugestoesVisiveis && numSugestoes > 0) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                atualizarDestaqueSugestao((indiceSugestaoAtiva + 1) % numSugestoes);
                break;
            case 'ArrowUp':
                event.preventDefault();
                atualizarDestaqueSugestao((indiceSugestaoAtiva - 1 + numSugestoes) % numSugestoes);
                break;
            case 'Enter':
            case 'Tab':
                event.preventDefault();
                if (indiceSugestaoAtiva >= 0 && indiceSugestaoAtiva < numSugestoes) {
                    guessInput.value = currentAutocompleteSuggestions[indiceSugestaoAtiva];
                } else { guessInput.value = currentAutocompleteSuggestions[0]; } // Pega a primeira se nenhuma ativa
                hideSuggestions();
                if (event.key === 'Enter') { handleGuessInput(); }
                else { guessInput.focus(); } // Tab apenas preenche e foca
                break;
        }
    } else if (event.key === 'Enter') { event.preventDefault(); handleGuessInput(); }
}

// Lógica Principal do Jogo
document.addEventListener('DOMContentLoaded', () => {
    console.log("[jogo.js] DOMContentLoaded disparado.");
    const mapDiv = document.getElementById('map');
    if (!mapDiv) { console.error("[jogo.js] ERRO CRÍTICO: Div #map não encontrado!"); return; }

    let isMapAlreadyValidLeafletInstance = false;
    if (window.map && typeof window.map.addLayer === 'function' && typeof window.map.setView === 'function') {
        isMapAlreadyValidLeafletInstance = true;
    }
    if (!isMapAlreadyValidLeafletInstance) {
        if (window.map) console.warn("[jogo.js] window.map definido, mas inválido. Recriando.");
        else console.log("[jogo.js] Criando novo mapa.");
        try {
            map = L.map('map').setView([-29.7, -53.0], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
            window.map = map; console.log("[jogo.js] Mapa e Tile Layer OpenStreetMap adicionados.");
        } catch (e) { console.error("[jogo.js] ERRO CRÍTICO ao inicializar L.map:", e); return; }
    } else { map = window.map; console.log("[jogo.js] Usando window.map existente."); }

    try {
        municipiosLayer = L.featureGroup().addTo(map); window.municipiosLayer = municipiosLayer;
        console.log("[jogo.js] municipiosLayer criado.");
    } catch (e) { console.error("[jogo.js] ERRO ao adicionar municipiosLayer:", e); return; }
    
    suggestionsContainerElement = document.getElementById('suggestions-container');
    suggestionsListElement = document.getElementById('suggestions-list-autocomplete');
    const guessInputElement = document.getElementById('guess-input');
    console.log("[AC_DEBUG] Elementos Autocompletar Iniciais:", { C: suggestionsContainerElement, L: suggestionsListElement, I: guessInputElement });
    if (!guessInputElement) { console.error("[jogo.js] ERRO CRÍTICO: #guess-input não encontrado!"); return; }
    if (!suggestionsContainerElement || !suggestionsListElement) { console.warn("[AC_DEBUG] Elementos HTML para sugestões não encontrados."); }

    window.onGeoJSONLoaded = function(featuresLayer, nameProperty) {
        console.log("[jogo.js] onGeoJSONLoaded. Prop: '" + nameProperty + "'");
        municipalityFeaturesMap = {}; let nomesParaListaGlobal = [];
        let featuresProcessedCount = 0; let namesFoundCount = 0;
        if (featuresLayer && typeof featuresLayer.eachLayer === 'function') {
            featuresLayer.eachLayer(layer => {
                featuresProcessedCount++;
                if (!layer.feature || !layer.feature.properties) { console.warn(`[jogo.js] Feat #${featuresProcessedCount}: Sem feature/props.`); return; }
                const nomeOriginal = layer.feature.properties[nameProperty];
                if (nomeOriginal && typeof nomeOriginal === 'string' && nomeOriginal.trim() !== '') {
                    const nomeNormalizado = removerAcentos(nomeOriginal).toUpperCase();
                    municipalityFeaturesMap[nomeNormalizado] = layer;
                    nomesParaListaGlobal.push(nomeNormalizado);
                    namesFoundCount++;
                } else { console.warn(`[jogo.js] Feat #${featuresProcessedCount}: Nome inválido. Prop:'${nameProperty}',Val:'${nomeOriginal}'.`); }
            });
        } else { console.error("[jogo.js] 'featuresLayer' inválida."); }
        console.log(`[jogo.js] Processadas:${featuresProcessedCount}, Nomes OK:${namesFoundCount}, Mapa Feat:${Object.keys(municipalityFeaturesMap).length}`);
        if (namesFoundCount > 0) {
            window.municipalityNames = nomesParaListaGlobal;
            console.log("[jogo.js] window.municipalityNames (norm):", window.municipalityNames.length);
        }
        if (window.municipalityNames && window.municipalityNames.length > 0) startGame();
        else { console.error("[jogo.js] Nomes não carregados."); alert("Erro: Dados dos municípios não carregados."); }
    };
    loadGeoJSON(GEOJSON_MUNICIPIOS_RS, NOME_PROPRIEDADE_MUNICIPIO, municipiosLayer);

    const guessButton = document.getElementById('guess-button');
    if (guessButton) guessButton.addEventListener('click', handleGuessInput);
    else console.warn("[jogo.js] Botão #guess-button não encontrado.");

    if (guessInputElement) {
        guessInputElement.addEventListener('input', handleAutocompleteInput);
        guessInputElement.addEventListener('keydown', handleAutocompleteKeydown);
        //guessInputElement.addEventListener('blur', () => { 
            // console.log("[AC_DEBUG] Blur no input - agendando hideSuggestions"); // Log para depurar o blur
            setTimeout(hideSuggestions, 150); 
        //});
    }
    
    document.addEventListener('click', function(event) {
        if (suggestionsContainerElement && guessInputElement &&
            !suggestionsContainerElement.contains(event.target) && event.target !== guessInputElement) {
            // console.log("[AC_DEBUG] Click fora - escondendo sugestões"); // Log para depurar
            hideSuggestions();
        }
    });
    const newGameButton = document.getElementById('new-game-button');
    if (newGameButton) newGameButton.addEventListener('click', startGame);
    else console.warn("[jogo.js] Botão #new-game-button não encontrado (verifique HTML).");

    console.log("[AC_DEBUG] FINAL DOMContentLoaded - Referências aos Elementos de Sugestão:");
    console.log("[AC_DEBUG] suggestionsContainerElement:", suggestionsContainerElement);
    console.log("[AC_DEBUG] suggestionsListElement:", suggestionsListElement);
    const guessInputElementForCheck = document.getElementById('guess-input');
    console.log("[AC_DEBUG] guessInputElement (verificação final):", guessInputElementForCheck);
});


function startGame() {
    console.log("[jogo.js] Iniciando novo jogo...");
    if (!window.municipalityNames || window.municipalityNames.length === 0) { console.error("[jogo.js] Lista de municípios vazia."); alert("Erro: Dados não disponíveis."); return; }
    const dataDeHoje = new Date();
    const nomesOrdenadosNormalizados = [...window.municipalityNames].sort((a,b) => a.localeCompare(b));
    let municipioAlvoNormalizado = getMunicipioDoDia(nomesOrdenadosNormalizados, dataDeHoje);
    if (!municipioAlvoNormalizado) {
        console.error("[jogo.js] Falha ao obter município do dia. Usando fallback.");
        municipioAlvoNormalizado = window.municipalityNames[Math.floor(Math.random() * window.municipalityNames.length)];
    }
    targetMunicipality = municipioAlvoNormalizado;
    const targetLayer = municipalityFeaturesMap[targetMunicipality];
    if (targetLayer && targetLayer.feature && targetLayer.feature.properties) {
        targetMunicipalityDisplayName = targetLayer.feature.properties[NOME_PROPRIEDADE_MUNICIPIO];
    } else { targetMunicipalityDisplayName = targetMunicipality; console.warn("[jogo.js] Nome display do alvo não encontrado."); }
    
    console.log(`[jogo.js] Alvo (${dataDeHoje.toLocaleDateString('pt-BR')}): ${targetMunicipalityDisplayName} (Norm: ${targetMunicipality})`);
    guessedMunicipalities = [];
    const guessesListUl = document.getElementById('guesses-list');
    if(guessesListUl) guessesListUl.innerHTML = '';
    
    const guessIn = document.getElementById('guess-input');
    if(guessIn){ guessIn.value = ''; guessIn.disabled = false; guessIn.focus(); }
    const guessBtn = document.getElementById('guess-button');
    if(guessBtn) guessBtn.disabled = false;
    hideSuggestions();
    for (const key in municipalityFeaturesMap) {
        const layer = municipalityFeaturesMap[key];
        try {
            layer.setStyle(window.DEFAULT_TERRITORY_STYLE || { color: '#555', weight: 1, opacity: 0.2, fillColor: '#FFF3E4', fillOpacity: 0.4 });
            if (layer.isTooltipOpen()) layer.closeTooltip();
        } catch (e) { /* Ignora */ }
    }
    if (map && typeof map.setView === 'function' && typeof map.closePopup === 'function') {
        map.closePopup(); map.setView([-29.7, -53.0], 6);
    }
}

function handleGuessInput() {
    const guessIn = document.getElementById('guess-input');
    if (!guessIn) { console.error("#guess-input não encontrado."); return; }
    const palpiteOriginal = guessIn.value.trim();
    const palpiteNormalizado = removerAcentos(palpiteOriginal).toUpperCase();
    hideSuggestions(); 
    if (!palpiteOriginal) { alert("Digite um município."); return; }
    if (guessedMunicipalities.some(g => removerAcentos(g.name).toUpperCase() === palpiteNormalizado)) {
        alert(`Já tentou "${palpiteOriginal}".`); guessIn.value = ''; return;
    }
    const guessedLayer = municipalityFeaturesMap[palpiteNormalizado];
    if (!guessedLayer) { alert(`"${palpiteOriginal}" não encontrado.`); guessIn.value = ''; return; }
    
    const nomeOficialDoPalpite = guessedLayer.feature.properties[NOME_PROPRIEDADE_MUNICIPIO];
    const targetLayer = municipalityFeaturesMap[targetMunicipality];
    if (!targetLayer) { console.error("Erro: Alvo não encontrado:", targetMunicipality); alert("Erro crítico."); return; }

    const distance = guessedLayer.getBounds().getCenter().distanceTo(targetLayer.getBounds().getCenter());
    let proxFeedback = PROXIMITY_COLORS[PROXIMITY_COLORS.length - 1];
    for (const p of PROXIMITY_COLORS) { if (distance <= p.limit) { proxFeedback = p; break; } }
    if (palpiteNormalizado === targetMunicipality) proxFeedback = PROXIMITY_COLORS[0];

    guessedMunicipalities.push({ name: nomeOficialDoPalpite, distance: distance, feedback: proxFeedback });
    updateMapAndUI(guessedLayer, nomeOficialDoPalpite, distance, proxFeedback);
    guessIn.value = ''; 
    if (!guessIn.disabled) guessIn.focus();

    if (palpiteNormalizado === targetMunicipality) {
        if(guessIn) guessIn.disabled = true;
        const guessBtn = document.getElementById('guess-button');
        if(guessBtn) guessBtn.disabled = true;
        guessedLayer.setStyle({ fillColor: proxFeedback.color, color: 'gold', weight: 3, fillOpacity: 0.75, opacity: 1 });
        guessedLayer.bringToFront();
        if (map && typeof map.fitBounds === 'function') map.fitBounds(guessedLayer.getBounds(), { padding: [50, 50] });
        const shareText = gerarTextoCompartilhavel();
        prompt(`Parabéns! Acertou: ${targetMunicipalityDisplayName}.\n\nCopie seu resultado:`, shareText);
    }
}

function updateMapAndUI(guessedLayer, nomeOficialParaExibir, distance, proximityFeedback) {
    guessedLayer.setStyle({ fillColor: proximityFeedback.color, color: 'black', weight: 1.5, fillOpacity: 0.65, opacity: 0.9 });
    guessedLayer.bringToFront();
    if (map && guessedLayer && typeof map.setView === 'function' && typeof guessedLayer.getBounds === 'function' && guessedLayer.getBounds().isValid()) { // Adicionado isValid()
        try { map.setView(guessedLayer.getBounds().getCenter(), 7); } 
        catch (e) { console.warn("[jogo.js] Erro zoom na tentativa (getBounds pode não ser válido ainda):", e, guessedLayer); }
    }
    const listItem = document.createElement('li');
    listItem.style.backgroundColor = proximityFeedback.color;
    listItem.style.color = isLightColor(proximityFeedback.color) ? '#333333' : '#ffffff';
    const distanceKm = (distance / 1000).toFixed(1);
    const displayNameFmt = nomeOficialParaExibir.toLowerCase().split(/[\s-]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    listItem.innerHTML = `
        <span class="guess-municipality">${displayNameFmt}</span>
        <span class="guess-feedback">${proximityFeedback.label}</span>
        <span class="guess-distance">Distância: ${distanceKm} km</span>`;
    const guessesList = document.getElementById('guesses-list');
    if(guessesList) guessesList.prepend(listItem);
    else console.error("#guesses-list não encontrado para adicionar tentativa.");
}