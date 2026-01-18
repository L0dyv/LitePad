/**
 * Sync versions from package.json to Tauri/Rust configs.
 *
 * Single source of truth: package.json#version
 */
const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function writeIfChanged(filePath, nextContent) {
  const prevContent = fs.existsSync(filePath) ? readText(filePath) : ''
  if (prevContent === nextContent) return false
  fs.writeFileSync(filePath, nextContent)
  return true
}

function getPackageVersion() {
  const pkgPath = path.join(projectRoot, 'package.json')
  const pkg = JSON.parse(readText(pkgPath))
  const version = pkg?.version
  if (!version || typeof version !== 'string') {
    throw new Error('package.json missing a valid "version" field')
  }
  return version
}

function syncTauriConf(version) {
  const filePath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json')
  const raw = readText(filePath)
  const conf = JSON.parse(raw)
  const current = conf?.version
  if (current === version) return false

  conf.version = version
  const next = JSON.stringify(conf, null, 2) + '\n'
  const wrote = writeIfChanged(filePath, next)
  if (wrote) {
    console.log(`sync: src-tauri/tauri.conf.json ${current ?? '(none)'} -> ${version}`)
  }
  return wrote
}

function syncCargoToml(version) {
  const filePath = path.join(projectRoot, 'src-tauri', 'Cargo.toml')
  const raw = readText(filePath)
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)

  let inPackage = false
  let found = false
  let changed = false
  let currentVersion = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*\[package\]\s*$/.test(line)) {
      inPackage = true
      continue
    }
    if (inPackage && /^\s*\[.*\]\s*$/.test(line)) {
      inPackage = false
    }
    if (!inPackage) continue

    const m = line.match(/^(\s*)version\s*=\s*"([^"]*)"\s*$/)
    if (!m) continue

    found = true
    const indent = m[1]
    currentVersion = m[2]
    if (currentVersion !== version) {
      lines[i] = `${indent}version = "${version}"`
      changed = true
    }
    break
  }

  if (!found) {
    throw new Error('Could not find [package] version in src-tauri/Cargo.toml')
  }
  if (!changed) return false

  const next = lines.join(newline) + (raw.endsWith(newline) ? '' : newline)
  const wrote = writeIfChanged(filePath, next)
  if (wrote) {
    console.log(`sync: src-tauri/Cargo.toml ${currentVersion} -> ${version}`)
  }
  return wrote
}

function syncCargoLock(version) {
  const filePath = path.join(projectRoot, 'src-tauri', 'Cargo.lock')
  if (!fs.existsSync(filePath)) return false

  const raw = readText(filePath)
  const re = /(\[\[package\]\]\r?\nname = "litepad"\r?\nversion = ")([^"]+)(")/
  const m = raw.match(re)
  if (!m) return false

  const current = m[2]
  if (current === version) return false

  const next = raw.replace(re, `$1${version}$3`)
  const wrote = writeIfChanged(filePath, next)
  if (wrote) {
    console.log(`sync: src-tauri/Cargo.lock ${current} -> ${version}`)
  }
  return wrote
}

function main() {
  const version = getPackageVersion()
  const changes = [
    syncTauriConf(version),
    syncCargoToml(version),
    syncCargoLock(version),
  ].filter(Boolean).length

  if (changes === 0) {
    console.log(`sync: version already up-to-date (${version})`)
  }
}

main()

