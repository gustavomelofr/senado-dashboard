const App = {
    state: {
        currentView: 'dashboard', // dashboard, senadores, profile
        senators: [],
        materias: [],
        ceapsYear: 2024,
        ceapsCache: null,
        idMap: {},
        selectedSenatorId: null,
        currentSenatorExpenses: [],
        currentSenatorAutorias: [],
        currentSenatorRelatorias: [],
        displayedExpensesCount: 20,
        displayedAutoriasCount: 15,
        displayedRelatoriasCount: 10,
        topSpenders: [],
        topEconomy: [],

        expensesChart: null,
        displayedExpensesCount: 20,
        expenseFilter: '',
        isLoading: true,
        isDarkTheme: true
    },

    async init() {
        this.bindEvents();
        window.addEventListener('hashchange', () => this.handleRouting());
        await this.handleRouting();
    },

    bindEvents() {
        const themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => this.toggleTheme());
        }

        const searchInput = document.getElementById('global-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }

        // Back button delegation for profile and loading states
        document.getElementById('view-container').addEventListener('click', (e) => {
            const backBtn = e.target.closest('#btn-back-profile');
            if (backBtn) {
                window.history.back();
            }
        });
    },

    toggleTheme() {
        this.state.isDarkTheme = !this.state.isDarkTheme;
        document.body.classList.toggle('dark-theme', this.state.isDarkTheme);
        document.body.classList.toggle('light-theme', !this.state.isDarkTheme);

        const icon = document.querySelector('.theme-toggle-icon');
        if (icon) {
            icon.textContent = this.state.isDarkTheme ? '🌙' : '☀️';
        }

        // Re-render chart if active to match theme colors
        if (this.state.expensesChart) {
            this.renderExpensesChart();
        }
    },

    async handleRouting() {
        const hash = window.location.hash.substring(1);

        if (hash.startsWith('senador/')) {
            const id = hash.split('/')[1];
            this.state.currentView = 'profile';
            this.state.selectedSenatorId = id;
            await this.loadSenatorDetails(id);
        } else {
            const view = hash || 'dashboard';
            this.state.currentView = view;

            // Update sidebar active state
            document.querySelectorAll('.nav-links li').forEach(li => {
                li.classList.toggle('active', li.getAttribute('data-view') === view);
            });

            if (view === 'dashboard') await this.loadDashboard();
            else if (view === 'senadores') await this.loadSenators();
        }
    },

    showLoader(msg = "Buscando informações oficiais...") {
        document.getElementById('view-container').innerHTML = `
            <div id="loader" class="loader-container">
                <div class="loader"></div>
                <p>${msg}</p>
            </div>
        `;
    },

    async loadDashboard() {
        this.showLoader();
        try {
            if (this.state.senators.length === 0) {
                this.state.senators = await SenateAPI.getAtualSenators();
            }
            const materias = await SenateAPI.getRecentMaterias();
            this.state.materias = materias.slice(0, 10);

            // Fetch and calculate Top Spenders
            if (!this.state.ceapsCache) {
                this.state.ceapsCache = await SenateAPI.getSenatorExpenses(this.state.ceapsYear);
                this.state.idMap = await SenateAPI.mapSenatorIds(this.state.ceapsCache);
            }
            this.calculateTopSpenders();

            this.renderDashboard();
        } catch (error) {
            console.error(error);
            this.renderError('Falha ao carregar o dashboard.');
        }
    },

    calculateTopSpenders() {
        if (!this.state.ceapsCache) return;

        const expenses = Array.isArray(this.state.ceapsCache) ? this.state.ceapsCache : (this.state.ceapsCache.despesas || []);
        const totals = {};

        expenses.forEach(e => {
            const id = e.codSenador;
            if (!id) return;
            const value = parseFloat(e.valorReembolsado || 0);
            totals[id] = (totals[id] || 0) + value;
        });

        const mapToSenator = ([codSenador, total]) => {
            const officialId = Object.keys(this.state.idMap).find(key => this.state.idMap[key] == codSenador);
            const senator = this.state.senators.find(s => s.IdentificacaoParlamentar.CodigoParlamentar == officialId);

            return {
                officialId,
                codSenador,
                total,
                senator
            };
        };

        const allMapped = Object.entries(totals)
            .map(mapToSenator)
            .filter(item => item.senator);

        // Highest Spenders
        this.state.topSpenders = [...allMapped]
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        // Economy Senators (Lowest spenders > 0)
        this.state.topEconomy = [...allMapped]
            .filter(item => item.total > 0)
            .sort((a, b) => a.total - b.total)
            .slice(0, 5);
    },

    async loadSenators() {
        this.showLoader();
        try {
            if (this.state.senators.length === 0) {
                this.state.senators = await SenateAPI.getAtualSenators();
            }
            this.renderSenators(this.state.senators);
        } catch (error) {
            this.renderError('Falha ao carregar lista de senadores.');
        }
    },

    renderDashboard() {
        const container = document.getElementById('view-container');
        container.innerHTML = `
            <h1 style="margin-bottom: 2rem;">Overview do Senado</h1>
            
            <div class="dash-grid">
                <div class="stat-card">
                    <div class="stat-header"><span>👥</span> <span class="tag tag-party">Ativos</span></div>
                    <div class="stat-value">${this.state.senators.length}</div>
                    <div class="stat-label">Senadores em Exercício</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header"><span>📄</span> <span class="tag tag-state">Tramitação</span></div>
                    <div class="stat-value">${this.state.materias.length}+</div>
                    <div class="stat-label">Matérias Recentes</div>
                </div>
            </div>

            <div class="ranking-grid" style="margin: 3rem 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div class="ranking-section">
                <h2 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>🔥</span> Maiores Gastos (2024)
                </h2>
                <div class="ranking-list">
                    ${this.state.topSpenders.map((item, index) => this.getRankingCardHTML(item, index, 'highest')).join('')}
                </div>
            </div>

            <div class="ranking-section">
                <h2 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; color: var(--accent-green);">
                    <span>🌱</span> Mais Econômicos (2024)
                </h2>
                <div class="ranking-list">
                    ${this.state.topEconomy.map((item, index) => this.getRankingCardHTML(item, index, 'lowest')).join('')}
                </div>
            </div>
            
            <div class="ranking-section" style="grid-column: 1 / -1;">
                <h2 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; justify-content: center; color: var(--accent-gold);">
                    <span>📋</span> Matérias em Tramitação por Comissão
                </h2>
                <div class="materias-list">
                    ${this.state.materias.length > 0 ? this.state.materias.map((c, index) => {
            const topTipos = c.tipos.map(t => `
                            <span class="materia-tipo-chip">${t.SiglaTipoProposicao} (${t.Ano}: ${t.Quantidade})</span>
                        `).join('');
            return `
                        <div class="materia-card" style="animation-delay: ${index * 0.05}s">
                            <div class="materia-card-header">
                                <div class="materia-sigla-badge">${c.sigla}</div>
                                <span class="materia-status-tag">${c.totalMaterias} matérias</span>
                            </div>
                            <p class="materia-ementa">${c.nome}</p>
                            <div class="materia-card-footer">
                                ${topTipos}
                            </div>
                        </div>
                    `}).join('') : '<p style="text-align: center; color: var(--text-secondary);">Nenhuma matéria em tramitação encontrada.</p>'}
                </div>
            </div>
        </div>
    `;
        this.attachCardEvents();
    },

    renderSenators(list) {
        const container = document.getElementById('view-container');
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                <h1>Senadores em Exercício</h1>
                <div class="filters">
                    <span class="tag tag-party">Todos (${list.length})</span>
                </div>
            </div>
            <div class="senator-grid">
                ${list.map(s => this.getSenatorCardHTML(s)).join('')}
            </div>
        `;
        this.attachCardEvents();
    },

    getSenatorCardHTML(s) {
        const info = s.IdentificacaoParlamentar;
        return `
            <div class="senator-card" data-id="${info.CodigoParlamentar}">
                <img src="${info.UrlFotoParlamentar}" alt="${info.NomeParlamentar}" class="senator-photo" onerror="this.src='https://via.placeholder.com/100'">
                <div class="senator-name">${info.NomeParlamentar}</div>
                <div class="senator-info">${info.SiglaPartidoParlamentar} | ${info.UfParlamentar}</div>
                <div>
                    <span class="tag tag-party">${info.SiglaPartidoParlamentar}</span>
                    <span class="tag tag-state">${info.UfParlamentar}</span>
                </div>
            </div>
        `;
    },

    attachCardEvents() {
        document.querySelectorAll('.senator-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.getAttribute('data-id');
                window.location.hash = `senador/${id}`;
            });
        });
    },

    getRankingCardHTML(item, index, type) {
        const badgeClass = type === 'lowest' ? 'rank-badge-economy' : 'rank-badge';
        return `
            <div class="ranking-card senator-card" data-id="${item.officialId}">
                <div class="${badgeClass}">${index + 1}</div>
                <img src="${item.senator.IdentificacaoParlamentar.UrlFotoParlamentar}" alt="${item.senator.IdentificacaoParlamentar.NomeParlamentar}" class="ranking-photo">
                <div class="ranking-info">
                    <div class="ranking-name">${item.senator.IdentificacaoParlamentar.NomeParlamentar}</div>
                    <div class="ranking-party">${item.senator.IdentificacaoParlamentar.SiglaPartidoParlamentar} | ${item.senator.IdentificacaoParlamentar.UfParlamentar}</div>
                    <div class="ranking-value ${type === 'lowest' ? 'value-economy' : ''}">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}</div>
                </div>
            </div>
        `;
    },

    async loadSenatorDetails(id) {
        const container = document.getElementById('view-container');
        container.innerHTML = `
            <div class="profile-container">
                <button class="back-btn" id="btn-back-profile"><span>⬅️</span> Voltar para a lista</button>
                <div class="loading-spinner-large"></div>
                <p style="text-align: center; color: var(--text-secondary);">Carregando perfil e despesas detalhadas...</p>
            </div>
        `;


        try {
            const [details, ceapsData, rawComissoes, rawCargos, rawVotacoes, rawAutorias, rawRelatorias, rawLiderancas] = await Promise.all([
                SenateAPI.getSenatorDetails(id),
                (async () => {
                    if (!this.state.ceapsCache) {
                        try {
                            const data = await SenateAPI.getSenatorExpenses(this.state.ceapsYear);
                            let expenses = Array.isArray(data) ? data : (data?.despesas || []);
                            this.state.ceapsCache = expenses;
                            this.state.idMap = await SenateAPI.mapSenatorIds(expenses);
                        } catch (e) {
                            console.error("Failed to fetch CEAPS", e);
                            this.state.ceapsCache = [];
                            this.state.idMap = {};
                        }
                    }
                    return this.state.ceapsCache;
                })(),
                SenateAPI.getSenatorComissoes(id),
                SenateAPI.getSenatorCargos(id),
                SenateAPI.getSenatorVotacoes(id),
                SenateAPI.getSenatorAutorias(id),
                SenateAPI.getSenatorRelatorias(id),
                SenateAPI.getSenatorLiderancas(id)
            ]);

            const info = details.IdentificacaoParlamentar;
            const basics = details.DadosBasicosParlamentar || {};
            const mandato = details.Mandato || {};

            // Filter valid current Comissoes and Cargos
            const today = new Date();
            const isActive = (item) => {
                if (!item.DataFim) return true;
                return new Date(item.DataFim) >= today;
            };

            const activeComissoesArray = Array.isArray(rawComissoes) ? rawComissoes : (rawComissoes ? [rawComissoes] : []);
            const activeCargosArray = Array.isArray(rawCargos) ? rawCargos : (rawCargos ? [rawCargos] : []);

            const currentComissoes = activeComissoesArray.filter(isActive);
            const currentCargos = activeCargosArray.filter(isActive);

            // Map cargos to their comissoes for easier rendering
            const cargosMap = {};
            currentCargos.forEach(c => {
                const codComissao = c.IdentificacaoComissao?.CodigoComissao;
                if (codComissao) {
                    if (!cargosMap[codComissao]) cargosMap[codComissao] = [];
                    cargosMap[codComissao].push(c.DescricaoCargo);
                }
            });

            // Generate HTML for Atuação (Comissões - kept for painel)
            let atuacaoComissoesHTML = '';
            if (currentComissoes.length > 0) {
                atuacaoComissoesHTML = currentComissoes.map(c => {
                    const comissaoInfo = c.IdentificacaoComissao || {};
                    const sigla = comissaoInfo.SiglaComissao || '';
                    const nome = comissaoInfo.NomeComissao || 'Comissão Desconhecida';
                    const participacao = c.DescricaoParticipacao || 'Membro';
                    const codComissao = comissaoInfo.CodigoComissao;
                    const cargosExtra = cargosMap[codComissao] ? cargosMap[codComissao].map(cargo => `<span class="tag tag-cargo">${cargo}</span>`).join('') : '';
                    return `
                        <div class="comissao-item">
                            <div class="comissao-header">
                                <span class="comissao-sigla">${sigla}</span>
                                <span class="comissao-nome">${nome}</span>
                            </div>
                            <div class="comissao-roles">
                                <span class="tag tag-role-${participacao.toLowerCase()}">${participacao}</span>
                                ${cargosExtra}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                atuacaoComissoesHTML = '<p style="color:var(--text-secondary);">Nenhuma comissão ou cargo ativo registrado.</p>';
            }

            // --- NOVO: Lógica para Aba Atuação com Sub-Tabs ---

            // Process Autorias
            const autoriasArray = Array.isArray(rawAutorias) ? rawAutorias : (rawAutorias ? [rawAutorias] : []);

            // Sort by date descending
            autoriasArray.sort((a, b) => {
                const matA = a.Materia || a.IdentificacaoMateria || {};
                const matB = b.Materia || b.IdentificacaoMateria || {};
                const dateA = new Date(a.DataAutoria || matA.Data || 0);
                const dateB = new Date(b.DataAutoria || matB.Data || 0);
                return dateB - dateA;
            });

            this.state.currentSenatorAutorias = autoriasArray;
            this.state.displayedAutoriasCount = 15;

            const getMateriaBadgeClass = (tipo) => {
                const map = { 'PL': 'badge-pl', 'PLS': 'badge-pl', 'PLC': 'badge-pl', 'PEC': 'badge-pec', 'REQ': 'badge-req', 'RQS': 'badge-req', 'MPV': 'badge-mpv', 'PRS': 'badge-prs', 'PDL': 'badge-pdl' };
                return map[tipo?.toUpperCase()] || 'badge-outro';
            };

            // Process Relatorias
            const relatoriasArray = Array.isArray(rawRelatorias) ? rawRelatorias : (rawRelatorias ? [rawRelatorias] : []);

            // Sort by date descending
            relatoriasArray.sort((a, b) => {
                const dateA = new Date(a.DataDesignacao || 0);
                const dateB = new Date(b.DataDesignacao || 0);
                return dateB - dateA;
            });

            this.state.currentSenatorRelatorias = relatoriasArray;
            this.state.displayedRelatoriasCount = 10;

            // Process Lideranças
            const liderancasArray = Array.isArray(rawLiderancas) ? rawLiderancas : (rawLiderancas ? [rawLiderancas] : []);
            const liderancasCardsHTML = liderancasArray.length > 0 ? liderancasArray.map(l => {
                const unidade = l.UnidadeLideranca?.NomeUnidadeLideranca || l.UnidadeLideranca || '';
                const descricao = l.DescricaoTipoLideranca || l.TipoLideranca || 'Liderança';
                const partido = l.SiglaPartido || l.Partido?.SiglaPartido || '';
                const dataInicio = l.DataDesignacao || l.DataInicio || '';
                const dataFim = l.DataFim || '';
                const inicioFormatted = dataInicio ? new Date(dataInicio).toLocaleDateString('pt-BR') : '';
                const fimFormatted = dataFim ? new Date(dataFim).toLocaleDateString('pt-BR') : 'Atual';
                const isActive = !dataFim || new Date(dataFim) >= new Date();
                return `
                    <div class="atividade-card lideranca-card ${isActive ? 'lideranca-ativa' : ''}">
                        <div class="atividade-card-header">
                            <span class="lideranca-cargo-badge">${descricao}</span>
                            ${isActive ? '<span class="tag tag-ativo">Ativo</span>' : '<span class="tag tag-encerrado">Encerrado</span>'}
                        </div>
                        ${unidade ? `<p class="lideranca-unidade">${unidade}</p>` : ''}
                        ${partido ? `<p class="lideranca-partido">Partido: <strong>${partido}</strong></p>` : ''}
                        <span class="atividade-data lideranca-periodo">📅 ${inicioFormatted} → ${fimFormatted}</span>
                    </div>
                `;
            }).join('') : '<p class="atividade-empty">Nenhuma liderança registrada.</p>';

            // Build full Atuação Section with Tabs
            const atuacaoFullHTML = `
                <div class="atuacao-section atuacao-section-full">
                    <h3 style="margin-bottom: 1rem; color: var(--accent-gold);">Atuação Legislativa</h3>
                    <div class="atuacao-stats-row">
                        <div class="atuacao-stat">
                            <span class="atuacao-stat-icon">📝</span>
                            <div class="atuacao-stat-info">
                                <span class="atuacao-stat-value">${autoriasArray.length}</span>
                                <span class="atuacao-stat-label">Autorias</span>
                            </div>
                        </div>
                        <div class="atuacao-stat">
                            <span class="atuacao-stat-icon">📋</span>
                            <div class="atuacao-stat-info">
                                <span class="atuacao-stat-value">${relatoriasArray.length}</span>
                                <span class="atuacao-stat-label">Relatorias</span>
                            </div>
                        </div>
                        <div class="atuacao-stat">
                            <span class="atuacao-stat-icon">👔</span>
                            <div class="atuacao-stat-info">
                                <span class="atuacao-stat-value">${liderancasArray.length}</span>
                                <span class="atuacao-stat-label">Lideranças</span>
                            </div>
                        </div>
                        <div class="atuacao-stat">
                            <span class="atuacao-stat-icon">🏛️</span>
                            <div class="atuacao-stat-info">
                                <span class="atuacao-stat-value">${currentComissoes.length}</span>
                                <span class="atuacao-stat-label">Comissões</span>
                            </div>
                        </div>
                    </div>
                    <div class="atuacao-tabs">
                        <button class="atuacao-tab active" data-tab="autorias">📝 Autorias <span class="tab-count">${autoriasArray.length}</span></button>
                        <button class="atuacao-tab" data-tab="relatorias">📋 Relatorias <span class="tab-count">${relatoriasArray.length}</span></button>
                        <button class="atuacao-tab" data-tab="liderancas">👔 Lideranças <span class="tab-count">${liderancasArray.length}</span></button>
                        <button class="atuacao-tab" data-tab="comissoes">🏛️ Comissões <span class="tab-count">${currentComissoes.length}</span></button>
                    </div>
                    <div class="atuacao-tab-content" id="tab-autorias">
                        <div id="autorias-list-container" class="atividades-grid"></div>
                        <p id="autorias-count-info" class="atividade-more"></p>
                        <div id="load-more-autorias-container" class="load-more-container"></div>
                    </div>
                    <div class="atuacao-tab-content" id="tab-relatorias" style="display:none;">
                        <div id="relatorias-list-container" class="atividades-grid"></div>
                        <p id="relatorias-count-info" class="atividade-more"></p>
                        <div id="load-more-relatorias-container" class="load-more-container"></div>
                    </div>
                    <div class="atuacao-tab-content" id="tab-liderancas" style="display:none;">
                        <div class="atividades-grid">${liderancasCardsHTML}</div>
                    </div>
                    <div class="atuacao-tab-content" id="tab-comissoes" style="display:none;">
                        <div class="comissoes-list">${atuacaoComissoesHTML}</div>
                    </div>
                </div>
            `;

            // --- Votações and Comissões Chips (Painel de Desempenho) ---
            const ultimasVotacoes = rawVotacoes || [];
            const getVotoBadge = (voto) => {
                const map = { 'SIM': 'badge-sim', 'NÃO': 'badge-nao', 'NAO': 'badge-nao', 'ABSTENÇÃO': 'badge-abstencao' };
                return map[voto.toUpperCase()] || 'badge-default';
            };
            let votacoesHTML = ultimasVotacoes.map(v => `
                <div class="votacao-item">
                    <span class="materia-nome">${v.materia}</span>
                    <span class="badge ${getVotoBadge(v.voto)}">${v.voto}</span>
                </div>
            `).join('');

            // Comissões chips for painel
            const chipsComissoesData = currentComissoes.length > 0 ? currentComissoes : [];
            let chipsComissoesHTML = chipsComissoesData.map(c => {
                const comissaoInfo = c.IdentificacaoComissao || {};
                const sigla = comissaoInfo.SiglaComissao || '';
                const participacao = c.DescricaoParticipacao || 'Membro';
                return `
                    <div class="chip-comissao">
                        <span class="chip-sigla">${sigla}</span>
                        <span class="tag tag-role-${participacao.toLowerCase()}">${participacao}</span>
                    </div>
                `;
            }).join('');

            // --- Expenses Logic ---
            const mappedId = this.state.idMap && this.state.idMap[id] ? this.state.idMap[id] : null;
            const normalizeStr = (str) => str ? str.replace(/[\r\n]+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() : '';

            let senatorCeaps = mappedId ? ceapsData.filter(c => String(c.codSenador) === String(mappedId)) : [];

            if (senatorCeaps.length === 0) {
                const cleanName = normalizeStr(info.NomeParlamentar);
                const cleanFullName = normalizeStr(info.NomeCompletoParlamentar);
                senatorCeaps = ceapsData.filter(c => {
                    const cName = normalizeStr(c.nomeSenador);
                    if (!cName) return false;
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
            }

            this.state.currentSenatorExpenses = senatorCeaps;
            this.state.displayedExpensesCount = 20;

            const expensesByType = senatorCeaps.reduce((acc, curr) => {
                const type = curr.tipoDespesa || 'Outros';
                acc[type] = (acc[type] || 0) + (curr.valorReembolsado || 0);
                return acc;
            }, {});

            const totalExpenses = Object.values(expensesByType).reduce((sum, val) => sum + val, 0);
            const expensesSummaryHTML = Object.entries(expensesByType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, value]) => `
                    <div class="expense-item">
                        <div class="expense-type">${type}</div>
                        <div class="expense-value">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}</div>
                    </div>
                `).join('') || '<p style="color:var(--text-secondary); margin-top: 1rem;">Nenhuma despesa registrada em 2024.</p>';

            // --- Final HTML ---
            container.innerHTML = `
                <div class="profile-container">
                    <button class="back-btn" id="btn-back-profile"><span>⬅️</span> Voltar para a lista</button>
                    
                    <div class="profile-header">
                        <img src="${info.UrlFotoParlamentar}" class="profile-photo-large" onerror="this.src='https://via.placeholder.com/220'">
                        <div class="profile-info">
                            <h1>${info.NomeParlamentar}</h1>
                            <p class="subtitle">${info.NomeCompletoParlamentar}</p>
                            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                                <span class="tag tag-party">${info.SiglaPartidoParlamentar}</span>
                                <span class="tag tag-state">${info.UfParlamentar}</span>
                            </div>
                            
                            <div class="profile-stats">
                                <div class="info-box">
                                    <div class="info-label">Naturalidade</div>
                                    <div class="info-value">${basics.Naturalidade || 'Não informada'} ${basics.UfNaturalidade ? `/ ${basics.UfNaturalidade}` : ''}</div>
                                </div>
                                <div class="info-box">
                                    <div class="info-label">Nascimento</div>
                                    <div class="info-value">${basics.DataNascimento ? new Date(basics.DataNascimento).toLocaleDateString('pt-BR') : 'Não informada'}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <div class="profile-tabs-nav">
                    <button class="profile-tab active" data-tab="resumo">Resumo</button>
                    <button class="profile-tab" data-tab="atuacao">Atuação</button>
                    <button class="profile-tab" data-tab="despesas">Despesas</button>
                </div>

                <div id="profile-tabs-content">
                    <div id="tab-resumo" class="profile-tab-content active">
                        <div class="profile-grid">
                            <div class="mandates-section">
                                <h3 style="margin-bottom: 1.5rem; color: var(--accent-gold);">Dados do Mandato</h3>
                                <div class="info-box">
                                    <div class="info-label">Participação / Status</div>
                                    <div class="info-value" style="font-size: 1.2rem; margin-top: 5px;">${mandato.DescricaoParticipacao || 'Não informado'}</div>
                                </div>
                                <div class="info-box" style="margin-top: 20px;">
                                    <div class="info-label">E-mail Oficial</div>
                                    <div class="info-value">${info.EmailParlamentar || 'Não informado'}</div>
                                </div>
                            </div>

                            <div class="commissions-section">
                                <h3 style="margin-bottom: 1.5rem; color: var(--accent-gold);">Comissões Atuais</h3>
                                <div class="chips-container">
                                    ${chipsComissoesHTML}
                                </div>
                            </div>
                        </div>

                        <div class="painel-card" style="margin-top: 2rem;">
                            <h3 style="color: var(--accent-gold); margin-bottom: 1rem;"><i class="fas fa-vote-yea"></i> Últimas Votações</h3>
                            <div class="votacoes-list">
                                ${votacoesHTML}
                            </div>
                        </div>
                    </div>

                    <div id="tab-atuacao" class="profile-tab-content">
                        ${atuacaoFullHTML}
                    </div>

                    <div id="tab-despesas" class="profile-tab-content">
                        <div class="expense-summary-container">
                            <div class="expense-total-card">
                                <h3>Total Reembolsado (2024)</h3>
                                <div class="total-value">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExpenses)}</div>
                            </div>
                            <div class="chart-container-large">
                                <canvas id="expenses-chart"></canvas>
                            </div>
                        </div>

                        <div class="detailed-expenses-wrapper">
                            <div class="expense-controls">
                                <h3>Detalhamento das Despesas</h3>
                                <div class="expense-search">
                                    <input type="text" id="expense-search-input" placeholder="Buscar por fornecedor ou tipo...">
                                </div>
                            </div>
                            
                            <div id="detailed-expenses-table-container" class="table-container">
                                <!-- Table injected here -->
                            </div>
                            
                            <div id="load-more-container" class="load-more-container">
                                <!-- Button injected here -->
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Initial render of detailed table
            this.renderDetailedExpensesTable();
            this.renderAutoriasList();
            this.renderRelatoriasList();

            // Bind tab switching
            document.querySelectorAll('.profile-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabId = btn.getAttribute('data-tab');
                    document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById(`tab-${tabId}`).classList.add('active');

                    if (tabId === 'despesas') {
                        // Chart needs to be rendered after container is visible
                        setTimeout(() => this.renderExpensesChart(), 100);
                    }
                });
            });

            // Bind search input
            document.getElementById('expense-search-input').addEventListener('input', (e) => {
                this.state.expenseFilter = e.target.value.toLowerCase();
                this.state.displayedExpensesCount = 20;
                this.renderDetailedExpensesTable();
            });

            // Bind sub-tabs in Atuação (authorship, etc.)
            document.querySelectorAll('.atuacao-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.atuacao-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.atuacao-tab-content').forEach(c => c.style.display = 'none');
                    tab.classList.add('active');
                    const targetTabId = tab.getAttribute('data-tab');
                    const targetContent = document.getElementById(`tab-${targetTabId}`);
                    if (targetContent) targetContent.style.display = 'block';
                });
            });

        } catch (error) {
            console.error('Error loading details:', error);
            this.renderError(`Falha ao carregar detalhes do senador: ${error.message}`);
        }
    },

    renderExpensesChart() {
        const ctx = document.getElementById('expenses-chart');
        if (!ctx) return;

        const groups = {};
        this.state.currentSenatorExpenses.forEach(e => {
            const type = e.tipoDespesa || 'Outros';
            groups[type] = (groups[type] || 0) + (e.valorReembolsado || 0);
        });

        const sortedGroups = Object.entries(groups).sort((a, b) => b[1] - a[1]);
        const labels = sortedGroups.map(g => g[0]);
        const data = sortedGroups.map(g => g[1]);

        if (this.state.expensesChart) {
            this.state.expensesChart.destroy();
        }

        const isDark = this.state.isDarkTheme;
        const textColor = isDark ? '#a0aec0' : '#4a5568';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

        this.state.expensesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Valor Total',
                    data: data,
                    backgroundColor: 'rgba(236, 201, 75, 0.6)',
                    borderColor: '#ecc94b',
                    borderWidth: 1,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            callback: (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumSignificantDigits: 3 }).format(value)
                        }
                    },
                    y: { grid: { display: false }, ticks: { color: textColor } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.raw)
                        }
                    }
                }
            }
        });
    },

    renderDetailedExpensesTable() {
        const container = document.getElementById('detailed-expenses-table-container');
        const loadMoreContainer = document.getElementById('load-more-container');
        if (!container) return;

        const filtered = this.state.currentSenatorExpenses.filter(e => {
            const provider = (e.nomeFornecedor || e.fornecedor || '').toLowerCase();
            const type = (e.tipoDespesa || '').toLowerCase();
            return provider.includes(this.state.expenseFilter) || type.includes(this.state.expenseFilter);
        });

        const sorted = filtered.sort((a, b) => {
            const dateA = new Date(a.dataEmissao || a.data || 0);
            const dateB = new Date(b.dataEmissao || b.data || 0);
            return dateB - dateA;
        });
        const toDisplay = sorted.slice(0, this.state.displayedExpensesCount);

        if (toDisplay.length === 0) {
            container.innerHTML = `<p style="padding: 40px; text-align: center; color: var(--text-secondary);">Nenhuma despesa encontrada para "${this.state.expenseFilter}".</p>`;
            loadMoreContainer.innerHTML = '';
            return;
        }

        container.innerHTML = `
    <table class="expense-table">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Fornecedor</th>
                        <th>CNPJ/CPF</th>
                        <th style="text-align: right;">Valor</th>
                    </tr>
                </thead>
                <tbody>
                    ${toDisplay.map(e => {
            const dateVal = e.dataEmissao || e.data;
            const providerVal = e.nomeFornecedor || e.fornecedor || 'N/A';
            const cnpjVal = e.cpfCnpj || '-';
            return `
                        <tr>
                            <td class="date">${dateVal ? new Date(dateVal).toLocaleDateString('pt-BR') : '-'}</td>
                            <td><span class="type-tag">${e.tipoDespesa}</span></td>
                            <td class="provider">${providerVal}</td>
                            <td class="cnpj" style="font-family: monospace; font-size: 0.8rem; opacity: 0.7;">${cnpjVal}</td>
                            <td class="value">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(e.valorReembolsado || 0)}</td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
    `;

        if (sorted.length > this.state.displayedExpensesCount) {
            loadMoreContainer.innerHTML = `
    <button class="btn-secondary" id="btn-load-more-expenses">Carregar mais despesas (${this.state.displayedExpensesCount} de ${sorted.length})</button>
        `;
            document.getElementById('btn-load-more-expenses').addEventListener('click', () => {
                this.state.displayedExpensesCount += 20;
                this.renderDetailedExpensesTable();
            });
        } else {
            loadMoreContainer.innerHTML = sorted.length > 0 ? `<p style="color: var(--text-secondary); font-size: 0.8rem;">Mostrando todas as ${sorted.length} despesas encontradas.</p>` : '';
        }
    },

    handleSearch(query) {
        if (!query) {
            if (this.state.currentView === 'senadores') {
                this.renderSenators(this.state.senators);
            }
            return;
        }

        const normalizedQuery = this.normalizeStr(query);

        const filtered = this.state.senators.filter(s =>
            this.normalizeStr(s.IdentificacaoParlamentar.NomeParlamentar).includes(normalizedQuery) ||
            this.normalizeStr(s.IdentificacaoParlamentar.SiglaPartidoParlamentar).includes(normalizedQuery) ||
            this.normalizeStr(s.IdentificacaoParlamentar.UfParlamentar).includes(normalizedQuery)
        );

        if (this.state.currentView !== 'senadores') {
            window.location.hash = 'senadores';
            // Wait for routing/loading to complete before rendering filtered list
            setTimeout(() => {
                if (this.state.senators.length > 0) {
                    this.renderSenators(filtered);
                }
            }, 150);
        } else {
            this.renderSenators(filtered);
        }
    },

    normalizeStr(str) {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    },

    getMateriaBadgeClass(tipo) {
        const map = {
            'PL': 'badge-pl', 'PLS': 'badge-pl', 'PLC': 'badge-pl',
            'PEC': 'badge-pec', 'REQ': 'badge-req', 'RQS': 'badge-req',
            'MPV': 'badge-mpv', 'PRS': 'badge-prs', 'PDL': 'badge-pdl'
        };
        return map[tipo?.toUpperCase()] || 'badge-outro';
    },

    renderAutoriasList() {
        const container = document.getElementById('autorias-list-container');
        const countInfo = document.getElementById('autorias-count-info');
        const loadMoreContainer = document.getElementById('load-more-autorias-container');
        if (!container) return;

        const list = this.state.currentSenatorAutorias;
        const toShow = list.slice(0, this.state.displayedAutoriasCount);

        container.innerHTML = toShow.map(a => {
            const mat = a.Materia || a.IdentificacaoMateria || {};
            const sigla = mat.SiglaSubtipoMateria || mat.Sigla || '';
            const numero = mat.NumeroMateria || mat.Numero || '';
            const ano = mat.AnoMateria || mat.Ano || '';
            const ementa = (a.EmentaMateria || mat.EmentaMateria || mat.Ementa || 'Ementa não disponível').substring(0, 150);
            const data = a.DataAutoria || mat.Data || '';
            const dataFormatted = data ? new Date(data).toLocaleDateString('pt-BR') : '';
            const autorPrincipal = a.IndicadorAutorPrincipal === 'Sim' ? '<span class="tag tag-autor-principal">Autor Principal</span>' : '';

            return `
                <div class="atividade-card autoria-card">
                    <div class="atividade-card-header">
                        <span class="materia-type-badge ${this.getMateriaBadgeClass(sigla)}">${sigla} ${numero}/${ano}</span>
                        ${autorPrincipal}
                    </div>
                    <p class="atividade-ementa">${ementa}${ementa.length >= 150 ? '...' : ''}</p>
                    ${dataFormatted ? `<span class="atividade-data">📅 ${dataFormatted}</span>` : ''}
                </div>
            `;
        }).join('');

        if (countInfo) {
            countInfo.innerText = `Exibindo ${toShow.length} de ${list.length} autorias`;
        }

        if (loadMoreContainer) {
            if (this.state.displayedAutoriasCount < list.length) {
                loadMoreContainer.innerHTML = `<button id="btn-load-more-autorias" class="btn-secondary">Exibir Mais Autorias</button>`;
                document.getElementById('btn-load-more-autorias').addEventListener('click', () => {
                    this.state.displayedAutoriasCount += 15;
                    this.renderAutoriasList();
                });
            } else {
                loadMoreContainer.innerHTML = '';
            }
        }
    },

    renderRelatoriasList() {
        const container = document.getElementById('relatorias-list-container');
        const countInfo = document.getElementById('relatorias-count-info');
        const loadMoreContainer = document.getElementById('load-more-relatorias-container');
        if (!container) return;

        const list = this.state.currentSenatorRelatorias;
        const toShow = list.slice(0, this.state.displayedRelatoriasCount);

        container.innerHTML = toShow.map(r => {
            const mat = r.Materia || r.IdentificacaoMateria || {};
            const sigla = mat.SiglaSubtipoMateria || mat.Sigla || '';
            const numero = mat.NumeroMateria || mat.Numero || '';
            const ano = mat.AnoMateria || mat.Ano || '';
            const ementa = (mat.EmentaMateria || mat.Ementa || 'Ementa não disponível').substring(0, 150);
            const comissao = r.IdentificacaoComissao?.SiglaComissao || r.SiglaComissao || '';
            const dataDesignacao = r.DataDesignacao || '';
            const dataFormatted = dataDesignacao ? new Date(dataDesignacao).toLocaleDateString('pt-BR') : '';
            const tipoRelator = r.DescricaoTipoRelator || '';

            return `
                <div class="atividade-card relatoria-card">
                    <div class="atividade-card-header">
                        <span class="materia-type-badge ${this.getMateriaBadgeClass(sigla)}">${sigla} ${numero}/${ano}</span>
                        ${comissao ? `<span class="tag tag-comissao-rel">${comissao}</span>` : ''}
                    </div>
                    ${tipoRelator ? `<p class="atividade-tipo-relator">${tipoRelator}</p>` : ''}
                    <p class="atividade-ementa">${ementa}${ementa.length >= 150 ? '...' : ''}</p>
                    ${dataFormatted ? `<span class="atividade-data">📅 Designação: ${dataFormatted}</span>` : ''}
                </div>
            `;
        }).join('');

        if (countInfo) {
            countInfo.innerText = `Exibindo ${toShow.length} de ${list.length} relatorias`;
        }

        if (loadMoreContainer) {
            if (this.state.displayedRelatoriasCount < list.length) {
                loadMoreContainer.innerHTML = `<button id="btn-load-more-relatorias" class="btn-secondary">Exibir Mais Relatorias</button>`;
                document.getElementById('btn-load-more-relatorias').addEventListener('click', () => {
                    this.state.displayedRelatoriasCount += 10;
                    this.renderRelatoriasList();
                });
            } else {
                loadMoreContainer.innerHTML = '';
            }
        }
    },

    renderError(msg) {
        document.getElementById('view-container').innerHTML = `
            <div style="padding: 40px; text-align: center; color: #fc8181; background: rgba(252, 129, 129, 0.1); border-radius: 16px;">
                <p>${msg}</p>
                <button onclick="window.history.back()" class="back-btn" style="margin: 20px auto 0;">Voltar</button>
            </div>
        `;
    }
};

window.onload = () => App.init();
