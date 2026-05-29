# Release Checklist

Flow release prod TradingBook.

## 1. Bump version

Mettre meme version partout:

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `src/constants/app.ts`

Exemple:

- `0.1.7`
- tag Git = `v0.1.7`

## 2. Verify before release

Frontend:

```powershell
npm.cmd run build
```

Si code Rust/Tauri touché:

```powershell
cargo check
```

Depuis `src-tauri/`.

Si tests ciblés utiles:

```powershell
npm.cmd run test:run -- <paths>
```

## 3. Commit release

Ne pas embarquer fichiers locaux non liés.

```powershell
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src/constants/app.ts
git add <autres fichiers du fix>
git commit -m "fix: release X.Y.Z <short desc>"
```

Exemple:

```powershell
git commit -m "fix: release 0.1.7 ai chat"
```

## 4. Create tag

```powershell
git tag -a vX.Y.Z -m "vX.Y.Z"
```

Exemple:

```powershell
git tag -a v0.1.7 -m "v0.1.7"
```

## 5. Push branch + tag

Important:

- push commit seul = pas de GitHub release
- push tag `v*.*.*` = déclenche workflow release

```powershell
git push origin main
git push origin vX.Y.Z
```

## 6. GitHub release trigger

Workflow:

- `.github/workflows/release-tauri.yml`

Trigger:

- `push` sur tag `v*.*.*`
- ou `workflow_dispatch`

Tag push lance build Tauri, signature updater, upload assets GitHub Release.

## 7. After push

Vérifier sur GitHub:

- Actions `release-tauri` verte
- Release `vX.Y.Z` créée
- assets présents
- `latest.json` présent dans release assets

## 8. Prod updater rule

Toujours nouvelle version pour nouvelle update prod.

Même binaire + même version = app installée ne reçoit rien.

## 9. Quick example

```powershell
npm.cmd run build
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src/constants/app.ts
git add <fix files>
git commit -m "fix: release 0.1.8 <desc>"
git tag -a v0.1.8 -m "v0.1.8"
git push origin main
git push origin v0.1.8
```

## 10. Related doc

More updater setup:

- `docs/auto-update-github-releases.md`
