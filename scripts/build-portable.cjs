/**
 * Tauri 便携版构建脚本
 * 将编译后的 exe 和必要文件复制到 release/LitePad-版本号 目录
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJson = require('../package.json');
const version = packageJson.version;

const projectRoot = path.join(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release');
const destDir = path.join(releaseDir, `LitePad-${version}`);
const tauriRelease = path.join(projectRoot, 'src-tauri', 'target', 'release');

console.log(`🔨 构建 LitePad v${version} 便携版...`);

// 1. 运行 Tauri 构建（仅编译，不打包安装程序）
console.log('\n📦 编译 Tauri 应用...');
try {
    execSync('npm run build:web', { cwd: projectRoot, stdio: 'inherit' });
    execSync('cargo build --release', { cwd: path.join(projectRoot, 'src-tauri'), stdio: 'inherit' });
} catch (e) {
    console.error('构建失败:', e.message);
    process.exit(1);
}

// 2. 创建目标目录
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
    console.log(`\n🗑️  已删除旧目录: LitePad-${version}`);
}
fs.mkdirSync(destDir, { recursive: true });

// 3. 复制 exe 文件
const exeSrc = path.join(tauriRelease, 'litepad.exe');
const exeDest = path.join(destDir, 'LitePad.exe');
if (fs.existsSync(exeSrc)) {
    fs.copyFileSync(exeSrc, exeDest);
    console.log(`✓ 复制: litepad.exe -> LitePad.exe`);
} else {
    console.error('❌ 未找到编译后的 exe 文件');
    process.exit(1);
}

// 4. 复制 WebView2Loader.dll (如果存在)
const webviewDll = path.join(tauriRelease, 'WebView2Loader.dll');
if (fs.existsSync(webviewDll)) {
    fs.copyFileSync(webviewDll, path.join(destDir, 'WebView2Loader.dll'));
    console.log(`✓ 复制: WebView2Loader.dll`);
}

// 5. 创建 data 目录（用于便携模式数据存储）
const dataDir = path.join(destDir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
console.log(`✓ 创建: data/ 目录`);

// 6. 获取文件大小
const stats = fs.statSync(exeDest);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log(`\n✅ 构建完成!`);
console.log(`📁 输出目录: release/LitePad-${version}`);
console.log(`📊 可执行文件大小: ${sizeMB} MB`);
