$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

git status
git diff --stat

git add "apps/frontend/src/app/ponto/licitacoes/page.tsx" "apps/frontend/src/app/ponto/licitacoes/BancoCatsPanel.tsx"

git commit -m @'
fix(licitacoes): corrige layout bugado nas abas Em Análise e Banco CATs

Evita que filtros e resultados estourem o scroll da página, estabiliza a sidebar
e usa portal para a lista expandida na aba Em Análise.
'@

git push origin main

git log -1 --oneline
git status
