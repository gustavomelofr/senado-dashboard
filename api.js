const API_BASE_URL = 'https://legis.senado.leg.br/dadosabertos';

const SenateAPI = {
    async fetchJSON(endpoint) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Error fetching ${endpoint}:`, error);
            throw error;
        }
    },

    async getAtualSenators() {
        const data = await this.fetchJSON('/senador/lista/atual.json');
        return data.ListaParlamentarEmExercicio.Parlamentares.Parlamentar;
    },

    async getSenatorDetails(id) {
        const data = await this.fetchJSON(`/senador/${id}.json`);
        return data.DetalheParlamentar.Parlamentar;
    },

    async getSenatorComissoes(id) {
        try {
            const data = await this.fetchJSON(`/senador/${id}/comissoes.json`);
            return data?.MembroComissaoParlamentar?.Parlamentar?.MembroComissoes?.Comissao || [];
        } catch (e) {
            console.error(`Failed to fetch comissoes for ${id}`, e);
            return [];
        }
    },

    async getSenatorCargos(id) {
        try {
            const data = await this.fetchJSON(`/senador/${id}/cargos.json`);
            return data?.CargoParlamentar?.Parlamentar?.Cargos?.Cargo || [];
        } catch (e) {
            console.error(`Failed to fetch cargos for ${id}`, e);
            return [];
        }
    },

    async getSenatorVotacoes(id) {
        try {
            const data = await this.fetchJSON(`/senador/${id}/votacoes.json`);
            let votacoes = data?.VotacaoParlamentar?.Parlamentar?.Votacoes?.Votacao || [];
            if (!Array.isArray(votacoes)) votacoes = [votacoes]; // Senate API sometimes returns objects instead of arrays

            // Return only the top 4 most recent votes, mapped to a clean format
            return votacoes.slice(0, 4).map(v => ({
                materia: `${v.Materia?.Sigla || ''} ${v.Materia?.Numero || ''}/${v.Materia?.Ano || ''}`.trim(),
                voto: v.SiglaDescricaoVoto || 'Sem Registro'
            }));
        } catch (e) {
            console.error(`Failed to fetch votacoes for ${id}`, e);
            return [];
        }
    },

    async getSenatorAutorias(id) {
        try {
            const data = await this.fetchJSON(`/senador/${id}/autorias.json`);
            // The API returns MateriasAutoriaParlamentar.Parlamentar.Autorias.Autoria
            let autorias = data?.MateriasAutoriaParlamentar?.Parlamentar?.Autorias?.Autoria || [];

            // If there's only one item, it might be an object instead of an array
            if (autorias && !Array.isArray(autorias)) {
                autorias = [autorias];
            }
            return autorias;
        } catch (error) {
            console.error(`Error fetching autorias for senator ${id}:`, error);
            return [];
        }
    },

    async getSenatorRelatorias(id) {
        try {
            const data = await this.fetchJSON(`/senador/${id}/relatorias.json`);
            // The API returns MateriasRelatoriaParlamentar.Parlamentar.Relatorias.Relatoria
            let relatorias = data?.MateriasRelatoriaParlamentar?.Parlamentar?.Relatorias?.Relatoria || [];

            if (relatorias && !Array.isArray(relatorias)) {
                relatorias = [relatorias];
            }
            return relatorias;
        } catch (error) {
            console.error(`Error fetching relatorias for senator ${id}:`, error);
            return [];
        }
    },

    async getSenatorLiderancas(id) {
        try {
            const data = await this.fetchJSON(`/senador/${id}/liderancas.json`);
            let liderancas = data?.LiderancaParlamentar?.Parlamentar?.Liderancas?.Lideranca || [];
            if (!Array.isArray(liderancas)) liderancas = [liderancas];
            return liderancas;
        } catch (e) {
            console.error(`Failed to fetch liderancas for ${id}`, e);
            return [];
        }
    },

    async getSenatorMandatos(id) {
        // Many senators have multiple mandates, this gets the history
        return await this.fetchJSON(`/senador/${id}/mandatos.json`);
    },

    async getPartidos() {
        const data = await this.fetchJSON('/senador/partidos.json');
        return data.ListaPartidos.Partidos.Partido;
    },

    async getRecentMaterias() {
        const data = await this.fetchJSON('/materia/lista/tramitacao.json');
        const comissoes = data.ListaMateriasTramitacao?.Comissoes?.Comissao || [];
        // Transform committee data into a useful format with total counts
        return comissoes.map(c => {
            const tipos = c.TiposProposicao?.TipoProposicao || [];
            const tiposArr = Array.isArray(tipos) ? tipos : [tipos];
            const totalMaterias = tiposArr.reduce((sum, t) => sum + parseInt(t.Quantidade || 0), 0);
            // Get most recent propositions (sort by year desc, take top types)
            const recentTipos = [...tiposArr]
                .sort((a, b) => parseInt(b.Ano || 0) - parseInt(a.Ano || 0))
                .slice(0, 5);
            return {
                sigla: c.Sigla || '',
                nome: c.Comissao || '',
                codigo: c.Codigo || '',
                totalMaterias,
                tipos: recentTipos
            };
        }).filter(c => c.totalMaterias > 0 && c.sigla)
            .sort((a, b) => b.totalMaterias - a.totalMaterias);
    },

    async getAgendaPlenario(date) {
        // Date format YYYYMMDD
        return await this.fetchJSON(`/plenario/agenda/dia/${date}.json`);
    },

    async getSenatorExpenses(year) {
        try {
            // First try to fetch local file to avoid CORS issues with the Senate API
            let response;
            try {
                response = await fetch(`./ceaps_${year}.json`);
                if (!response.ok) throw new Error("Local file not found");
            } catch (err) {
                console.warn(`Local ceaps_${year}.json not found or inaccessible. Falling back to Senate API...`);
                const url = `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`;
                response = await fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });
            }

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Error fetching expenses for ${year}:`, error);
            throw error;
        }
    },

    async mapSenatorIds(ceapsData) {
        // Creates a dictionary linking legis.senado.leg.br IDs to adm.senado.gov.br IDs
        try {
            console.log("[DEBUG] Starting mapSenatorIds...");
            const senators = await this.getAtualSenators();
            const ceapsListFull = Array.isArray(ceapsData) ? ceapsData : Array.isArray(ceapsData?.despesas) ? ceapsData.despesas : [];

            const normalizeStr = (str) => {
                if (!str) return '';
                return str.replace(/[\r\n]+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
            };

            // Optimization: Create a unique list of normalized names/IDs from the huge CEAPS list first
            const uniqueCeapsMap = new Map();
            for (const item of ceapsListFull) {
                if (!item.nomeSenador || uniqueCeapsMap.has(item.nomeSenador)) continue;
                uniqueCeapsMap.set(item.nomeSenador, {
                    codSenador: String(item.codSenador),
                    normalizedName: normalizeStr(item.nomeSenador)
                });
            }
            const uniqueCeapsList = Array.from(uniqueCeapsMap.values());
            console.log(`[DEBUG] Optimized CEAPS list to ${uniqueCeapsList.length} unique senators.`);

            const idMap = {};
            for (const sen of senators) {
                const idOriginal = sen.IdentificacaoParlamentar.CodigoParlamentar;
                const cleanName = normalizeStr(sen.IdentificacaoParlamentar.NomeParlamentar);
                const cleanFullName = normalizeStr(sen.IdentificacaoParlamentar.NomeCompletoParlamentar);

                // Find matching senator in the OPTIMIZED unique list
                const match = uniqueCeapsList.find(c => {
                    const cName = c.normalizedName;
                    let isMatch = (cName === cleanName) || (cName.includes(cleanName)) || (cleanFullName && cleanFullName.includes(cName));

                    if (!isMatch) {
                        const cParts = cName.split(' ').filter(p => p.length > 2);
                        const nParts = new Set([...cleanName.split(' '), ...cleanFullName.split(' ')].filter(p => p.length > 2));
                        let count = 0;
                        for (let p of cParts) { if (nParts.has(p)) count++; }
                        if (count >= 2) isMatch = true;
                    }
                    return isMatch;
                });

                if (match) {
                    idMap[idOriginal] = match.codSenador;
                }
            }
            console.log(`[DEBUG] idMap created with ${Object.keys(idMap).length} entries.`);
            return idMap;
        } catch (e) {
            console.error("Error creating senator ID map", e);
            return {};
        }
    }
};
