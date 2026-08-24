#!/usr/bin/env bash
# Build do backend no deploy (monorepo). Rode a partir da raiz do repositório.
# Também instala JDK + Maven (se preciso) e compila o worker NF-e para a SEFAZ.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Backend: npm install + build"
npm install
npm run build:permission-modules
npm run build -w @sistema-ponto/backend

NFE_SRC="$ROOT/tools/nfe-distribuicao"
NFE_JAR_OUT="$NFE_SRC/target/nfe-distribuicao.jar"
NFE_JAR_COPY="$ROOT/apps/backend/native/nfe-distribuicao.jar"
TOOLS_DIR="$ROOT/.tools"
JDK_LINK="$TOOLS_DIR/jdk"

ensure_jdk() {
  if [[ -x "$JDK_LINK/bin/java" ]]; then
    export JAVA_HOME="$JDK_LINK"
    export PATH="$JAVA_HOME/bin:$PATH"
    echo "==> JDK já presente em $JAVA_HOME"
    java -version || true
    return 0
  fi

  echo "==> Baixando Eclipse Temurin JDK 17 (Linux x64) para .tools/jdk…"
  mkdir -p "$TOOLS_DIR"
  local archive="$TOOLS_DIR/jdk17.tar.gz"
  curl -fsSL \
    "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk" \
    -o "$archive"
  rm -rf "$TOOLS_DIR/jdk-extract"
  mkdir -p "$TOOLS_DIR/jdk-extract"
  tar -xzf "$archive" -C "$TOOLS_DIR/jdk-extract"
  local extracted
  extracted="$(find "$TOOLS_DIR/jdk-extract" -maxdepth 1 -mindepth 1 -type d | head -n 1)"
  if [[ -z "$extracted" || ! -x "$extracted/bin/java" ]]; then
    echo "Falha ao extrair JDK em $TOOLS_DIR/jdk-extract"
    exit 1
  fi
  rm -rf "$JDK_LINK"
  # Cópia real (não symlink absoluto) para o runtime do Railpack achar o JDK
  mv "$extracted" "$JDK_LINK"
  rm -rf "$TOOLS_DIR/jdk-extract"
  rm -f "$archive"
  export JAVA_HOME="$JDK_LINK"
  export PATH="$JAVA_HOME/bin:$PATH"
  java -version
}

ensure_maven() {
  if command -v mvn >/dev/null 2>&1; then
    echo "==> Usando Maven do sistema: $(command -v mvn)"
    return 0
  fi
  local mvn_ver="3.9.9"
  local mvn_home="$TOOLS_DIR/apache-maven-${mvn_ver}"
  if [[ -x "$mvn_home/bin/mvn" ]]; then
    export PATH="$mvn_home/bin:$PATH"
    return 0
  fi
  echo "==> Baixando Apache Maven ${mvn_ver}…"
  mkdir -p "$TOOLS_DIR"
  local archive="$TOOLS_DIR/maven.tgz"
  curl -fsSL \
    "https://archive.apache.org/dist/maven/maven-3/${mvn_ver}/binaries/apache-maven-${mvn_ver}-bin.tar.gz" \
    -o "$archive"
  tar -xzf "$archive" -C "$TOOLS_DIR"
  rm -f "$archive"
  export PATH="$mvn_home/bin:$PATH"
  mvn -version
}

if [[ -d "$NFE_SRC/src" && -f "$NFE_SRC/pom.xml" ]]; then
  echo "==> Compilando worker NF-e (tools/nfe-distribuicao)"
  ensure_jdk
  ensure_maven
  (cd "$NFE_SRC" && mvn -q -DskipTests package)
  if [[ ! -f "$NFE_JAR_OUT" ]]; then
    echo "JAR não gerado: $NFE_JAR_OUT"
    exit 1
  fi
  mkdir -p "$(dirname "$NFE_JAR_COPY")"
  cp -f "$NFE_JAR_OUT" "$NFE_JAR_COPY"
  mkdir -p "$ROOT/apps/backend/dist"
  cp -f "$NFE_JAR_OUT" "$ROOT/apps/backend/dist/nfe-distribuicao.jar"
  # Railpack costuma manter dist/ no runtime; .tools/ e native/ (gitignored) podem sumir.
  if [[ -d "$JDK_LINK" ]]; then
    rm -rf "$ROOT/apps/backend/dist/jdk"
    cp -a "$JDK_LINK" "$ROOT/apps/backend/dist/jdk"
    echo "==> JDK copiado para apps/backend/dist/jdk"
  fi
  echo "==> Worker NF-e pronto: $ROOT/apps/backend/dist/nfe-distribuicao.jar"
  ls -lh "$ROOT/apps/backend/dist/nfe-distribuicao.jar" || true
else
  echo "==> Aviso: tools/nfe-distribuicao ausente — SEFAZ Java não será embutida neste deploy"
fi

echo "==> Build backend concluído"
