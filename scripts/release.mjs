// Yeni sürüm yayınlar: sürümü artırır, imzalı kurulum dosyası üretir,
// GitHub'a yükler. Babanın uygulaması açılışta bunu görüp "Güncelle" butonu çıkarır.
//
// Kullanım:  pnpm release           -> 0.2.0 -> 0.2.1
//            pnpm release 0.3.0     -> belirli sürüm
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REPO = 'NumanBAZ/Data-Analysis-Project'
const KEY = join(homedir(), '.tauri', 'rakip-analizi.key')
const CONF = 'src-tauri/tauri.conf.json'
const run = (cmd, env = {}) =>
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })

if (!existsSync(KEY)) throw new Error(`İmza anahtarı bulunamadı: ${KEY}`)
if (execSync('git status --porcelain').toString().trim())
  throw new Error('Önce değişiklikleri commit edin (git status temiz olmalı).')

// 1) Sürümü artır
const conf = JSON.parse(readFileSync(CONF, 'utf8'))
const [a, b, c] = conf.version.split('.').map(Number)
const version = process.argv[2] ?? `${a}.${b}.${c + 1}`
conf.version = version
writeFileSync(CONF, JSON.stringify(conf, null, 2) + '\n')
console.log(`\n== Sürüm ${version} hazırlanıyor ==\n`)

// 2) İmzalı derleme
run('pnpm tauri build', {
  TAURI_SIGNING_PRIVATE_KEY: readFileSync(KEY, 'utf8'),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
})

// 3) Dosyaları hazırla (GitHub dosya adındaki boşlukları bozduğu için boşluksuz ad)
const dir = 'src-tauri/target/release/bundle/nsis'
const src = join(dir, `${conf.productName}_${version}_x64-setup.exe`)
const exe = `RakipAnalizi_${version}_x64-setup.exe`
const out = join(dir, exe)
copyFileSync(src, out)
const latest = {
  version,
  notes: `Sürüm ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(`${src}.sig`, 'utf8'),
      url: `https://github.com/${REPO}/releases/download/v${version}/${exe}`,
    },
  },
}
const latestPath = join(dir, 'latest.json')
writeFileSync(latestPath, JSON.stringify(latest, null, 2))

// 4) Numan'ın GitHub hesabıyla yayınla (bilgisayardaki diğer hesaba dokunmaz)
const cred = execSync('git credential fill', {
  input: 'protocol=https\nhost=github.com\nusername=NumanBAZ\n\n',
}).toString()
const token = cred.match(/^password=(.*)$/m)?.[1]
if (!token) throw new Error('NumanBAZ GitHub girişi bulunamadı.')

run(`git commit -am "Sürüm ${version}" && git tag v${version} && git push origin main --tags`)
run(
  `gh release create v${version} "${out}" "${latestPath}" --repo ${REPO} --title "Sürüm ${version}" --notes "Sürüm ${version}"`,
  { GH_TOKEN: token }
)
console.log(`\n✓ Sürüm ${version} yayınlandı. Babanın uygulaması açılışta güncelleme butonu gösterecek.`)
console.log(`  İlk kurulum dosyası: ${out}`)
