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

// 1. 运行 Tauri 构建（使用 tauri build 确保前端资源被嵌入）
// 注意：必须使用 tauri build 而非 cargo build，否则前端资源不会被嵌入到 exe 中
console.log('\n📦 编译 Tauri 应用...');
try {
    // tauri build 会自动运行 beforeBuildCommand (npm run build:web) 并嵌入 frontendDist
    // 使用 --no-bundle 只编译 exe，不生成安装程序
    execSync('npm run build:tauri -- --no-bundle', { cwd: projectRoot, stdio: 'inherit' });
} catch (e) {
    console.error('构建失败:', e.message);
    process.exit(1);
}

// 2. 创建目标目录（如果旧目录存在先尝试删除）
if (fs.existsSync(destDir)) {
    try {
        fs.rmSync(destDir, { recursive: true });
        console.log(`\n🗑️  已删除旧目录: LitePad-${version}`);
    } catch (e) {
        console.error(`\n⚠️  无法删除旧目录 (可能正在使用中): LitePad-${version}`);
        console.error(`   请关闭正在运行的 LitePad 后重试，或手动删除该目录`);
        console.error(`   错误: ${e.message}`);
        process.exit(1);
    }
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

// 5. 获取文件大小
const stats = fs.statSync(exeDest);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log(`\n✅ 构建完成!`);
console.log(`📁 输出目录: release/LitePad-${version}`);
console.log(`📊 可执行文件大小: ${sizeMB} MB`);
console.log(`💡 提示: 首次运行时会自动创建 data/ 目录`);
