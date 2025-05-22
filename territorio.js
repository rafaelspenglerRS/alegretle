/**
 * @file territorio.js
 * Define a função global `loadGeoJSON` para carregar e exibir camadas de polígonos
 * representando divisões territoriais (Municípios, Regiões Imediatas, Intermediárias).
 */

if (typeof window.selectedTerritoryLayer === 'undefined') {
    console.warn("[territorio.js] Variável global 'window.selectedTerritoryLayer' não definida. Inicializando como null.");
    window.selectedTerritoryLayer = null;
}
if (typeof window.municipalityNames === 'undefined') {
    console.warn("[territorio.js] Variável global 'window.municipalityNames' não definida. Inicializando como [].");
    window.municipalityNames = [];
}

function loadGeoJSON(geojsonSource, nameProperty, targetLayer) {
    if (!geojsonSource || !nameProperty || !targetLayer) {
        console.error("[territorio.js] loadGeoJSON: Parâmetros ausentes.");
        return;
    }
    if (typeof window.map === 'undefined') { // Checa window.map em vez de map local
        console.error("[territorio.js] loadGeoJSON: Variável global 'window.map' não definida.");
        return;
    }
    if (!window.map.hasLayer(targetLayer)) {
        targetLayer.addTo(window.map);
    }

    console.log(`[territorio.js] Carregando território (${nameProperty}) de:`, geojsonSource);

    if (typeof targetLayer.clearLayers === 'function') {
        targetLayer.clearLayers();
        if (window.selectedTerritoryLayer) {
            window.selectedTerritoryLayer = null;
            if (window.map) window.map.closePopup();
        }
    } else {
        console.error("[territorio.js] targetLayer não possui o método clearLayers().");
        return;
    }

    const processData = (data) => {
        const initialStyleFunc = () => {
            if (typeof window.DEFAULT_TERRITORY_STYLE !== 'undefined') {
                return window.DEFAULT_TERRITORY_STYLE;
            }
            return { color: '#555', weight: 1, opacity: 0.2, fillColor: '#FFF3E4', fillOpacity: 0.4 };
        };

        const featuresLayer = L.geoJSON(data, {
            style: initialStyleFunc,
            onEachFeature: function (feature, layer) {
                let nome = feature.properties[nameProperty] || "Desconhecido";

                layer.on({
                    mouseover: (e) => {
                        const currentLayer = e.target;
                        if (window.selectedTerritoryLayer !== currentLayer) {
                            currentLayer.setStyle({ weight: 1.5, color: '#333', fillOpacity: 0.6, fillColor: '#CDDBC7' });
                        }
                        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                            currentLayer.bringToFront();
                        }
                        
                        // CORREÇÃO AQUI para mouseover:
                        // 1. Garanta que o tooltip esteja vinculado.
                        // Se já estiver vinculado, o Leaflet geralmente lida bem com um novo bind, 
                        // ou podemos apenas definir o conteúdo se ele já existir.
                        if (!currentLayer.getTooltip()) { // Verifica se já existe um tooltip vinculado
                            // currentLayer.bindTooltip(nome);
                        } else {
                            // Se já existe, apenas atualiza o conteúdo caso o 'nome' possa mudar (improvável aqui)
                            // currentLayer.setTooltipContent(nome); // Descomente se 'nome' puder mudar dinamicamente para a mesma camada
                        }
                        
                        // 2. Agora que temos certeza que um tooltip está vinculado, podemos abri-lo.
                        // Chamar openTooltip() em um tooltip já aberto é seguro e garante que ele esteja visível.
                        currentLayer.openTooltip(); 
                    },
                    mouseout: (e) => {
                        const currentLayer = e.target;
                        if (window.selectedTerritoryLayer !== currentLayer) {
                            try {
                                if (typeof window.DEFAULT_TERRITORY_STYLE !== 'undefined') {
                                    currentLayer.setStyle(window.DEFAULT_TERRITORY_STYLE);
                                } else { 
                                    currentLayer.setStyle({ color: '#555', weight: 1, opacity: 0.2, fillColor: '#FFF3E4', fillOpacity: 0.4 });
                                }
                            } catch (resetError) {
                                console.warn("[territorio.js] Erro ao resetar estilo (mouseout):", resetError);
                            }
                        }
                        
                        // CORREÇÃO AQUI para mouseout:
                        // Verifica se a camada TEM um tooltip E se ele ESTÁ aberto antes de tentar fechar.
                        if (currentLayer.getTooltip() && currentLayer.isTooltipOpen()) {
                           currentLayer.closeTooltip();
                        }
                    },
                    click: (e) => {
                        const clickedLayer = e.target;
                        if (typeof window.handleTerritorySelection === "function") {
                            window.handleTerritorySelection(clickedLayer, { maxZoom: 11, padding: [25, 25], duration: 0.5 });
                        } else {
                            console.error("[territorio.js] Função window.handleTerritorySelection não encontrada!");
                            // Fallback simples (não ideal, pois duplica lógica e pode não ter os estilos corretos)
                            if (window.selectedTerritoryLayer && window.selectedTerritoryLayer !== clickedLayer) {
                                try { window.selectedTerritoryLayer.setStyle(window.DEFAULT_TERRITORY_STYLE || {color: '#555'}); } catch(err) {}
                            }
                            try { clickedLayer.setStyle(window.SELECTED_TERRITORY_STYLE || {color: 'green', weight:2 }); } catch(err) {}
                            window.selectedTerritoryLayer = clickedLayer;
                            if (window.map) {
                                window.map.fitBounds(clickedLayer.getBounds());
                                let nomePopup = clickedLayer.feature?.properties?.[nameProperty] || "Desconhecido";
                                L.popup().setLatLng(e.latlng).setContent("<b>" + nomePopup + "</b>").openOn(window.map);
                            }
                        }
                    } 
                });
            }
        }); 

        if (nameProperty === "NOME") { 
            window.municipalityNames.length = 0; 
            featuresLayer.eachLayer(layer => {
                if (layer.feature && layer.feature.properties && layer.feature.properties[nameProperty]) {
                    window.municipalityNames.push(layer.feature.properties[nameProperty]);
                }
            });
            window.municipalityNames.sort((a, b) => a.localeCompare(b));
            console.log(`[territorio.js] Nomes de municípios para autocompletar atualizados: ${window.municipalityNames.length}`);
        }

        featuresLayer.eachLayer(layer => {
            targetLayer.addLayer(layer);
        });
        console.log(`[territorio.js] Território (${nameProperty}) carregado. Features: ${targetLayer.getLayers().length}`);

        // ---- INÍCIO DA ADAPTAÇÃO QUE PRECISA SER ADICIONADA ----
    // Notifica que o carregamento e processamento do GeoJSON foram concluídos,
    // passando a camada que contém todas as features (L.geoJSON) e a propriedade do nome.
    if (typeof window.onGeoJSONLoaded === 'function') {
        window.onGeoJSONLoaded(featuresLayer, nameProperty);
    }
    }; 

    if (typeof geojsonSource === 'string') {
        fetch(geojsonSource)
            .then(response => {
                if (!response.ok) throw new Error(`Erro HTTP ${response.status} ao buscar ${geojsonSource}`);
                return response.json();
            })
            .then(data => processData(data))
            .catch(error => console.error(`[territorio.js] Falha ao carregar GeoJSON de URL (${geojsonSource}):`, error));
    } else if (typeof geojsonSource === 'object' && geojsonSource !== null) {
        try {
            processData(geojsonSource);
        } catch (error) {
            console.error(`[territorio.js] Falha ao processar objeto GeoJSON (${nameProperty}):`, error);
        }
    } else {
        console.error("[territorio.js] Fonte GeoJSON inválida.");
    }
}