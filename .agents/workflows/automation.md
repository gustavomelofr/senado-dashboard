---
description: Automação de tarefas comuns do Senado Dashboard
---

// turbo-all

Este workflow permite que o Antigravity execute tarefas recorrentes sem pedir permissão para cada comando individual.

### 1. Atualizar Repositório (Sincronização)
Sincroniza as alterações locais com o GitHub.
1. `git add .`
2. `git commit -m "Atualização automática via workflow"`
3. `git push origin main`

### 2. Verificar Status do Servidor
Verifica se o servidor local está respondendo.
1. `curl http://localhost:8081`

### 3. Limpeza de Arquivos Temporários
Remove logs e arquivos de cache desnecessários.
1. `rm -rf .cache`
