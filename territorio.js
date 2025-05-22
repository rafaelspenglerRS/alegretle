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